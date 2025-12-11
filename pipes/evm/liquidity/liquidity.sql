CREATE TABLE IF NOT EXISTS liquidity_events_raw
(
    pool_address        String,
    timestamp           DateTime CODEC (DoubleDelta, ZSTD),
    event_type          LowCardinality(String),
    token_a             String,
    token_b             String,
    amount_a_raw        Int128,
    amount_b_raw        Int128,
	tick_spacing		Int32,
	tick				Int32,
	tick_lower			Int32,
	tick_upper			Int32,
	liquidity			UInt128,
	liquidity_delta		Int256,
	sqrt_price_x96		UInt256,
	fee					UInt32,
    factory_address     LowCardinality(String),
    dex_name            LowCardinality(String),
    protocol            LowCardinality(String),
    block_number        UInt32 CODEC (DoubleDelta, ZSTD),
    transaction_index   UInt16,
    log_index           UInt16,
    transaction_hash    String,
    a_b_swapped         Bool,   -- if true then originally token_a was token_b in a pool and swapped for convenience
    sign                Int8
) ENGINE = CollapsingMergeTree(sign)
      PARTITION BY toYYYYMM(timestamp)
      ORDER BY (pool_address, timestamp, transaction_index, log_index);
/*
Data extraction:

-- protocol: uniswap_v2, aerodrome_basic
WITH cte AS (
	SELECT
		pool_address,
	    timestamp,
	    amount_a_raw AS token_a_balance,
	    amount_b_raw AS token_b_balance,
	    block_number,
	    transaction_index,
	    log_index,
	    event_type,
		(token_a_balance / POW(10, s.token_a_decimals)) AS amount_a,
		(token_b_balance / POW(10, s.token_b_decimals)) AS amount_b,
		IF (s.price_token_a_usdc = 0, -1, amount_a * s.price_token_a_usdc) AS amount_a_usdc,
		IF (s.price_token_b_usdc = 0, -1, amount_b * s.price_token_b_usdc) AS amount_b_usdc,
		IF (amount_a_usdc = -1 OR amount_b_usdc = -1, -1, amount_a_usdc + amount_b_usdc) AS liquidity_usdc
	FROM liquidity_events_raw le
		ASOF LEFT JOIN (
			SELECT *
			FROM base_swaps.swaps_raw_pool_gr s
			WHERE pool_address = '0x7ad1db1b8a8ce3040bc1807d7af6a8bc88584600'
				AND price_token_a_usdc != 0	-- This should not happen, but should be removed after SQDGN-29 is fixed.
		) s ON  s.pool_address = le.pool_address
			AND s.timestamp >= le.timestamp
	WHERE le.pool_address = '0x7ad1db1b8a8ce3040bc1807d7af6a8bc88584600'
		AND le.event_type = 'sync'
)
SELECT timestamp, liquidity_usdc
FROM cte
ORDER BY (timestamp, transaction_index, log_index) DESC
LIMIT 10


-- protocol: uniswap_v3, aerodrome_slipstream
-- there are problems with some pools ex. 0x06c522a75a0413269fae5069ff9b93d65c7c4b57, 0x5eeB2662615782b58251b6f0c3E107571ae1AB07
WITH bal_history AS (
	SELECT
		pool_address,
	    timestamp,
	    sum(amount_a_raw * sign) OVER (
	        PARTITION BY pool_address 
	        ORDER BY timestamp, transaction_index, log_index
	        ROWS BETWEEN UNBOUNDED PRECEDING AND CURRENT ROW
	    ) AS token_a_balance,
	    sum(amount_b_raw * sign) OVER (
	        PARTITION BY pool_address 
	        ORDER BY timestamp, transaction_index, log_index
	        ROWS BETWEEN UNBOUNDED PRECEDING AND CURRENT ROW
	    ) AS token_b_balance,
	    block_number,
	    transaction_index,
	    log_index,
	    event_type
	FROM liquidity_events_raw
	WHERE pool_address = '0xbc51db8aec659027ae0b0e468c0735418161a780'
		AND event_type <> 'burn'
	ORDER BY timestamp, transaction_index, log_index
),
liq_history AS (
	SELECT
		cte.timestamp,
		(cte.token_a_balance / POW(10, s.token_a_decimals)) AS amount_a,
		(cte.token_b_balance / POW(10, s.token_b_decimals)) AS amount_b,
		IF (s.price_token_a_usdc = 0, -1, amount_a * s.price_token_a_usdc) AS amount_a_usdc,
		IF (s.price_token_b_usdc = 0, -1, amount_b * s.price_token_b_usdc) AS amount_b_usdc,
		IF (amount_a_usdc = -1 OR amount_b_usdc = -1, -1, amount_a_usdc + amount_b_usdc) AS liquidity_usdc,
		s.price_token_a_usdc AS price_token_a_usdc,
		s.price_token_b_usdc AS price_token_b_usdc
	FROM bal_history cte
		ASOF LEFT JOIN (
			SELECT *
			FROM base_swaps.swaps_raw_pool_gr s
			WHERE pool_address = '0xbc51db8aec659027ae0b0e468c0735418161a780'
				AND price_token_a_usdc != 0	-- This should not happen, but should be removed after SQDGN-29 is fixed.
		) s ON  s.pool_address = cte.pool_address
			AND s.timestamp >= cte.timestamp
	ORDER BY (cte.timestamp, cte.transaction_index, cte.log_index)
)
SELECT timestamp, liquidity_usdc
FROM liq_history
ORDER BY timestamp DESC
LIMIT 10

-- Protocol: uniswap_v4
WITH modify_liq AS (
	SELECT
		ml.*,
		wp.*,
		(wp.sqrt_price_x96 / POW(2, 96)) AS sqrtPrice,
		toUnixTimestamp(ml.timestamp)*100_000*100_000 AS ts_num,
		ml.tick_lower,
		ml.tick_upper,
		(SQRT(POW(1.0001, ml.tick_lower))) AS sqrtRatioL,
		(SQRT(POW(1.0001, ml.tick_upper))) AS sqrtRatioU,
		ml.liquidity_delta AS liquidityDelta,
		toFloat64(liquidityDelta) AS liquidityDeltaF,		
		CASE WHEN sqrtPrice <= sqrtRatioL THEN (liquidityDeltaF * (sqrtRatioU - sqrtRatioL)) / (sqrtRatioL*sqrtRatioU)
			WHEN sqrtPrice >= sqrtRatioU THEN 0
			ELSE liquidityDeltaF * ((sqrtRatioU - sqrtPrice)/(sqrtPrice*sqrtRatioU))
		END as am0
		, CASE WHEN sqrtPrice <= sqrtRatioL THEN 0
			WHEN sqrtPrice >= sqrtRatioU THEN liquidityDeltaF*(sqrtRatioU - sqrtRatioL)
			ELSE liquidityDeltaF*(sqrtPrice - sqrtRatioL)
		END as am1,
		-- swap amounts in case of modify_liquidity event and when a <-> b were swapped
		IF (ml.event_type = 'modify_liquidity_v4' AND ml.a_b_swapped = true, am1, am0) AS amount0,
		IF (ml.event_type = 'modify_liquidity_v4' AND ml.a_b_swapped = true, am0, am1) AS amount1	
	FROM base_liquidity_new.liquidity_events_raw ml
		ASOF JOIN (
			SELECT *, toUnixTimestamp(pp.timestamp)*100_000*100_000 AS ts_num
			FROM base_liquidity_new.liquidity_events_raw pp
			WHERE pp.pool_address = '0x4a292fa6d46678e8555260f206a577f6866586f43059e0d1e73e4b8cd4b99742'
				AND (pp.event_type = 'swap' OR pp.event_type = 'initialize_v4')
		) wp ON
			wp.pool_address = ml.pool_address
			AND (
				wp.ts_num + wp.transaction_index*100_000 + wp.log_index 
					<= 
				ts_num + ml.transaction_index*100_000 + ml.log_index
			)
	WHERE ml.pool_address = '0x4a292fa6d46678e8555260f206a577f6866586f43059e0d1e73e4b8cd4b99742'
),
with_amounts AS (
	SELECT
		ml.*, 
		COALESCE(NULLIF(toInt128(amount0), 0), amount_a_raw) AS delta_a_raw, 
		COALESCE(NULLIF(toInt128(amount1), 0), amount_b_raw) AS delta_b_raw
	FROM modify_liq ml
),
balance_history AS (
	SELECT
		wa.*,
		SUM(delta_a_raw) OVER ( 
	        ORDER BY timestamp, transaction_index, log_index
	        ROWS BETWEEN UNBOUNDED PRECEDING AND CURRENT ROW
	    ) AS token_a_balance,
		SUM(delta_b_raw) OVER ( 
	        ORDER BY timestamp, transaction_index, log_index
	        ROWS BETWEEN UNBOUNDED PRECEDING AND CURRENT ROW
	    ) AS token_b_balance
	FROM with_amounts wa
),
prefinal AS (
	SELECT 
		bh.timestamp,
		(bh.token_a_balance / POW(10, s.token_a_decimals)) AS amount_a,
		(bh.token_b_balance / POW(10, s.token_b_decimals)) AS amount_b,
		IF (s.price_token_a_usdc = 0, -1, amount_a * s.price_token_a_usdc) AS amount_a_usdc,
		IF (s.price_token_b_usdc = 0, -1, amount_b * s.price_token_b_usdc) AS amount_b_usdc,
		IF (amount_a_usdc = -1 OR amount_b_usdc = -1, -1, amount_a_usdc + amount_b_usdc) AS liquidity_usdc,
		s.price_token_a_usdc AS price_token_a_usdc,
		s.price_token_b_usdc AS price_token_b_usdc,	
		bh.event_type,
		bh.delta_a_raw,
		bh.delta_b_raw,
		bh.token_a_balance,
		bh.token_b_balance,
		bh.*
	FROM balance_history bh
		ASOF LEFT JOIN (
			SELECT *
			FROM base_swaps.swaps_raw_pool_gr s
			WHERE pool_address = '0x4a292fa6d46678e8555260f206a577f6866586f43059e0d1e73e4b8cd4b99742'
				AND price_token_a_usdc != 0	-- This should not happen, but should be removed after SQDGN-29 is fixed.
		) s ON  s.pool_address = bh.pool_address
			AND s.timestamp >= bh.timestamp
)
SELECT timestamp, liquidity_usdc, transaction_index, log_index
FROM prefinal bh
ORDER BY (bh.`timestamp`, bh.transaction_index, bh.log_index) DESC
LIMIT 10
*/
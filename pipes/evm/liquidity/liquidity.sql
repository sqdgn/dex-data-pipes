CREATE TABLE IF NOT EXISTS liquidity_events_raw
(
    pool_address        String,
    timestamp           DateTime CODEC (DoubleDelta, ZSTD),
    event_type          LowCardinality(String),
    token_a             String,
    token_b             String,
    amount_a_raw        Int128,
    amount_b_raw        Int128,
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
      ORDER BY (pool_address, timestamp, transaction_index, log_index)
      TTL timestamp + INTERVAL 90 DAY;


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


-- uniswap_v3, aerodrome_slipstream
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

*/
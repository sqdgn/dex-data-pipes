/*
    How to resync all views in case something changed but raw data (swaps_raw) is correct:

    0. Stop pipe.
    1. Rename source table:  RENAME TABLE swaps_raw TO swaps_raw_src
    2. Delete all views/tables except swaps_raw and sync_status
    3. Run this file again – recreate all tables/views.
    4. Insert raw data into swaps_raw again to trigger all incremental MVs:
        INSERT INTO swaps_raw SELECT * FROM swaps_raw_src
    5. Wait until this expression is 1 (all rows are processed):
        SELECT (SELECT COUNT(*) FROM swaps_raw) / (SELECT COUNT(*) FROM swaps_raw_src)
    6. Start pipe again.
    7. If all's good drop table swaps_raw_src
*/


CREATE TABLE IF NOT EXISTS swaps_raw
(
    timestamp           DateTime CODEC (DoubleDelta, ZSTD),
    token_a             String,
    token_a_symbol      String,
    token_b             String,
    token_b_symbol      String,
    amount_a_raw        Int128,
    amount_b_raw        Int128,
    amount_a            Float64,
    amount_b            Float64,
    price_token_a_usdc  Float64,
    price_token_b_usdc  Float64,
    factory_address     LowCardinality(String),
    dex_name            LowCardinality(String),
    protocol            LowCardinality(String),
    pool_address        String,
    pool_tick_spacing   Int32,
    pool_fee_creation   UInt32,
    pool_stable         Bool,
    pool_liquidity      UInt128,
    pool_sqrt_price_x96 UInt256,
    pool_tick           Int32,
    account             String,
    sender              String,
    recipient           String,
    block_number        UInt32 CODEC (DoubleDelta, ZSTD),
    transaction_index   UInt16,
    log_index           UInt16,
    transaction_hash    String,
    token_a_decimals    UInt8,
    token_b_decimals    UInt8,
    a_b_swapped         Bool,   -- if true then originally token_a was token_b in a pool and swapped for convenience
    -- trader stats
    token_a_balance     Float64,
    token_b_balance     Float64,
    token_a_profit_usdc Float64,
    token_b_profit_usdc Float64,
    token_a_cost_usdc   Float64,
    token_b_cost_usdc   Float64,
    token_a_wins        UInt32,
    token_b_wins        UInt32,
    token_a_loses       UInt32,
    token_b_loses       UInt32,
    -- end trader stats
    sign                Int8
) ENGINE = CollapsingMergeTree(sign)
      PARTITION BY toYYYYMM(timestamp) -- DATA WILL BE SPLIT BY MONTH
      ORDER BY (timestamp, transaction_index, log_index);

-- ############################################################################################################

CREATE TABLE IF NOT EXISTS swaps_raw_pool_gr
(
    timestamp           DateTime CODEC (DoubleDelta, ZSTD),
    token_a             String,
    token_a_symbol      String,
    token_b             String,
    token_b_symbol      String,
    amount_a_raw        Int128,
    amount_b_raw        Int128,
    amount_a            Float64,
    amount_b            Float64,
    price_token_a_usdc  Float64,
    price_token_b_usdc  Float64,
    factory_address     LowCardinality(String),
    dex_name            LowCardinality(String),
    protocol            LowCardinality(String),
    pool_address        String,
    pool_tick_spacing   Int32,
    pool_fee_creation   UInt32,
    pool_stable         Bool,
    pool_liquidity      UInt128,
    pool_sqrt_price_x96 UInt256,
    pool_tick           Int32,
    account             String,
    sender              String,
    recipient           String,
    block_number        UInt32 CODEC (DoubleDelta, ZSTD),
    transaction_index   UInt16,
    log_index           UInt16,
    transaction_hash    String,
    token_a_decimals    UInt8,
    token_b_decimals    UInt8,
    a_b_swapped         Bool,
    -- trader stats
    token_a_balance     Float64,
    token_b_balance     Float64,
    token_a_profit_usdc Float64,
    token_b_profit_usdc Float64,
    token_a_cost_usdc   Float64,
    token_b_cost_usdc   Float64,
    token_a_wins        UInt32,
    token_b_wins        UInt32,
    token_a_loses       UInt32,
    token_b_loses       UInt32,
    -- end trader stats
    sign                Int8
) ENGINE = CollapsingMergeTree(sign)
      PARTITION BY toYYYYMM(timestamp) -- DATA WILL BE SPLIT BY MONTH
      ORDER BY (pool_address, timestamp, transaction_index, log_index);


CREATE MATERIALIZED VIEW IF NOT EXISTS swaps_raw_pool_gr_mv TO swaps_raw_pool_gr
AS
SELECT * FROM swaps_raw;

-- ############################################################################################################
CREATE TABLE IF NOT EXISTS swaps_raw_account_gr
(
    timestamp           DateTime CODEC (DoubleDelta, ZSTD),
    account            String,
    token_a            String,
    token_b            String,
    amount_a           Float64,
    amount_b           Float64,
    price_token_a_usdc Float64,
    price_token_b_usdc Float64,
    transaction_index  UInt16,
    log_index         UInt16,
    sign              Int8
) ENGINE = CollapsingMergeTree(sign)
  PARTITION BY toYYYYMM(timestamp)
  ORDER BY (account, timestamp, transaction_index, log_index);

CREATE MATERIALIZED VIEW IF NOT EXISTS swaps_raw_account_gr_mv TO swaps_raw_account_gr
AS
SELECT
    timestamp,
    account,
    token_a,
    token_b,
    amount_a,
    amount_b,
    price_token_a_usdc,
    price_token_b_usdc,
    transaction_index,
    log_index,
    sign
FROM swaps_raw
WHERE price_token_a_usdc > 0 AND price_token_b_usdc > 0;

-- ############################################################################################################


CREATE TABLE IF NOT EXISTS vols_candles (
    timestamp                DateTime CODEC (DoubleDelta, ZSTD),
    pool_address            String,
    token                   String,
    volume_usdc             AggregateFunction(sum, Float64),
    swap_count              AggregateFunction(sum, Int32),
    buy_count               AggregateFunction(sum, Int32),
    sell_count              AggregateFunction(sum, Int32),
    buy_volume_usdc         AggregateFunction(sum, Float64),
    sell_volume_usdc        AggregateFunction(sum, Float64),
    open_price_token_usdc   AggregateFunction(argMinState, Float64, Tuple(DateTime, UInt16, UInt16)),
    high_price_token_usdc   AggregateFunction(max, Float64),
    low_price_token_usdc    AggregateFunction(min, Float64),
    close_price_token_usdc  AggregateFunction(argMaxState, Float64, Tuple(DateTime, UInt16, UInt16))
)
ENGINE = AggregatingMergeTree() ORDER BY (pool_address, timestamp);

CREATE MATERIALIZED VIEW IF NOT EXISTS vols_candles_mv TO vols_candles
AS
SELECT
    toStartOfMinute(s.timestamp) AS timestamp,
    pool_address,
    token_a AS token,
    sumState(ABS(amount_b * price_token_b_usdc) * sign) AS volume_usdc,
    sumState(toInt32(sign)) AS swap_count,
    sumState(if(amount_a_raw < 0, toInt32(sign), 0)) AS buy_count,
    sumState(if(amount_a_raw > 0, toInt32(sign), 0)) AS sell_count,
    sumState(if(amount_a_raw < 0, ABS(amount_a * price_token_a_usdc) * sign, 0)) AS buy_volume_usdc,
    sumState(if(amount_a_raw > 0, ABS(amount_a * price_token_a_usdc) * sign, 0)) AS sell_volume_usdc,
    argMinState(price_token_a_usdc, tuple(s.timestamp, s.transaction_index, s.log_index)) AS open_price_token_usdc,
    maxState(price_token_a_usdc) AS high_price_token_usdc,
    minState(price_token_a_usdc) AS low_price_token_usdc,
    argMaxState(price_token_a_usdc, tuple(s.timestamp, s.transaction_index, s.log_index)) AS close_price_token_usdc
FROM swaps_raw_pool_gr s
WHERE price_token_a_usdc > 0
GROUP BY pool_address, token, timestamp;


CREATE TABLE IF NOT EXISTS vols_candles_1usd (
    timestamp                DateTime CODEC (DoubleDelta, ZSTD),
    pool_address            String,
    token                   String,
    volume_usdc             AggregateFunction(sum, Float64),
    swap_count              AggregateFunction(sum, Int32),
    buy_count               AggregateFunction(sum, Int32),
    sell_count              AggregateFunction(sum, Int32),
    buy_volume_usdc         AggregateFunction(sum, Float64),
    sell_volume_usdc        AggregateFunction(sum, Float64),
    open_price_token_usdc   AggregateFunction(argMinState, Float64, Tuple(DateTime, UInt16, UInt16)),
    high_price_token_usdc   AggregateFunction(max, Float64),
    low_price_token_usdc    AggregateFunction(min, Float64),
    close_price_token_usdc  AggregateFunction(argMaxState, Float64, Tuple(DateTime, UInt16, UInt16))
)
ENGINE = AggregatingMergeTree() ORDER BY (pool_address, timestamp);

CREATE MATERIALIZED VIEW IF NOT EXISTS vols_candles_1usd_mv TO vols_candles_1usd
AS
SELECT
    toStartOfMinute(s.timestamp) AS timestamp,
    pool_address,
    token_a AS token,
    sumState(ABS(amount_b * price_token_b_usdc) * sign) AS volume_usdc,
    sumState(toInt32(sign)) AS swap_count,
    sumState(if(amount_a_raw < 0, toInt32(sign), 0)) AS buy_count,
    sumState(if(amount_a_raw > 0, toInt32(sign), 0)) AS sell_count,
    sumState(if(amount_a_raw < 0, ABS(amount_a * price_token_a_usdc) * sign, 0)) AS buy_volume_usdc,
    sumState(if(amount_a_raw > 0, ABS(amount_a * price_token_a_usdc) * sign, 0)) AS sell_volume_usdc,
    argMinState(price_token_a_usdc, tuple(s.timestamp, s.transaction_index, s.log_index)) AS open_price_token_usdc,
    maxState(price_token_a_usdc) AS high_price_token_usdc,
    minState(price_token_a_usdc) AS low_price_token_usdc,
    argMaxState(price_token_a_usdc, tuple(s.timestamp, s.transaction_index, s.log_index)) AS close_price_token_usdc
FROM swaps_raw_pool_gr s
WHERE price_token_a_usdc > 0 AND ABS(amount_a * price_token_a_usdc) >= 1
GROUP BY pool_address, token, timestamp;


/*


    To check correctness:

        SELECT
            sum(ABS(amount_b * price_token_b_usdc) * sign) AS vol,
            count() AS count,
            argMin(price_token_a_usdc, tuple(s.timestamp, s.transaction_index, s.log_index)) AS open,
            max(price_token_a_usdc) AS high,
            min(price_token_a_usdc) AS low,
            argMax(price_token_a_usdc, tuple(s.timestamp, s.transaction_index, s.log_index)) AS close
        FROM swaps_raw_pool_gr s
        WHERE pool_address = '0xd0b53d9277642d899df5c87a3966a349a798f224'
        AND toStartOfFiveMinute(timestamp) = '2025-04-07 13:30:00'
        AND ABS(amount_b) <= 10000 AND ABS(amount_b) >= 0.1

    Query data (must be 1-minute multiple):
    
    SELECT
        toStartOfInterval(timestamp, INTERVAL 24 HOUR) AS timestamp,
    --	pool_address,
        sumMerge(volume_usdc) AS swap_volume_usdc,
        sumMerge(buy_volume_usdc) AS buy_volume_usdc,
        sumMerge(sell_volume_usdc) AS sell_volume_usdc,	
        sumMerge(swap_count) AS swap_count,
        sumMerge(buy_count) AS buy_count,
        sumMerge(sell_count) AS sell_count,
        argMinMerge(open_price_token_usdc) AS open,
        maxMerge(high_price_token_usdc) AS high,
        minMerge(low_price_token_usdc) AS low,
        argMaxMerge(close_price_token_usdc) AS close,
        (close-open) / open AS rise
    FROM vols_candles
    WHERE pool_address = lower('0x9d89c0cb73143927761534143747e26c47a1589f') --AND timestamp = '2025-04-07 13:05:00'
    GROUP BY pool_address, timestamp
    ORDER BY pool_address, timestamp


*/

-- ############################################################################################################

-- Materialized view to count swaps per token
-- For example, can be used to filter out tokens with less than X swaps (garbage tokens).
CREATE TABLE IF NOT EXISTS token_swap_counts
(
    token String,
    swap_count UInt64
) ENGINE = SummingMergeTree()
    ORDER BY (token);


CREATE MATERIALIZED VIEW IF NOT EXISTS token_swap_counts_mv1 TO token_swap_counts
AS
SELECT 
    token_a AS token,
    sign AS swap_count
FROM swaps_raw;

CREATE MATERIALIZED VIEW IF NOT EXISTS token_swap_counts_mv2 TO token_swap_counts
AS
SELECT 
    token_b AS token,
    sign AS swap_count
FROM swaps_raw;

/*

    To get buyers/sellers count, use query:

    SELECT
        countDistinctIf(account, amount_a_raw < 0) AS buyers,
        countDistinctIf(account, amount_a_raw > 0) AS sellers
    FROM swaps_raw_pool_gr
    WHERE pool_address = lower('0xa6c7fbd1b4c71673dfdadfaa9d17f14833d3245e') 
        AND `timestamp` >= NOW() - INTERVAL 24 HOUR
*/


-- =================================================================================
-- Traders stats

CREATE VIEW IF NOT EXISTS ${db_name}.trader_token_stats AS
	SELECT
		s1.account                          AS account,
		s1.token_a                          AS token,
		sumIf(sign, amount_a > 0)			AS sells,
		sumIf(sign, amount_a < 0)			AS buys,
		sumIf(amount_a*sign, amount_a > 0)		AS sold_amount_token,
		sumIf(ABS(amount_a)*sign, amount_a < 0)  AS bought_amount_token,
		(sold_amount_token / bought_amount_token)      AS sold_to_bought_ratio,
		max(s1.token_a_wins)               AS tx_wins,
		max(s1.token_a_loses)              AS tx_loses,
		sum(s1.token_a_profit_usdc * sign) AS total_profit_usdc
	FROM swaps_raw s1
	WHERE
		(s1.timestamp BETWEEN {start_date:DateTime} AND {end_date:DateTime})
		AND price_token_a_usdc != 0 AND price_token_b_usdc != 0
	GROUP BY account, token;


CREATE VIEW IF NOT EXISTS ${db_name}.top_traders
AS
  WITH
    token_wins_loses AS (
      SELECT
        tts.account                         AS account,
        sum(tts.tx_wins)                   AS tx_wins,
        sum(tts.tx_loses)                  AS tx_loses,
        countIf(tts.total_profit_usdc > 0) AS token_wins,
        countIf(tts.total_profit_usdc < 0) AS token_loses
      FROM ${db_name}.trader_token_stats(
        start_date={start_date:DateTime},
        end_date={end_date:DateTime}
      ) tts
      GROUP BY tts.account
    )
SELECT account, 
	sum(sign) AS tx_count,
	avg(ABS(amount_a)*price_token_a_usdc*sign) AS avg_trade_usdc,
	sumIf(sign, amount_a < 0) AS token_a_buys,
	sumIf(sign, amount_a > 0) AS token_a_sells,
	count(distinct token_a) AS distinct_token_a,
    sum(token_a_cost_usdc*sign) AS total_cost_usdc,
    sum(token_a_profit_usdc*sign) AS total_profit_usdc,
    sum(token_a_wins*sign) AS tx_wins,
    sum(token_a_loses*sign) AS tx_loses,
    any(twl.token_wins) AS token_wins,
    any(twl.token_loses) AS token_loses,
    (tx_wins / (tx_wins + tx_loses)) AS tx_win_ratio,
    (token_wins / (token_wins + token_loses)) AS token_win_ratio,
    (total_profit_usdc / total_cost_usdc) * 100 AS pnl_percent,
	min(timestamp) AS first_tx,
	max(timestamp) AS last_tx,
	tx_count / dateDiff('hour', first_tx, last_tx) AS tx_per_hour
FROM ${db_name}.swaps_raw s
JOIN
    token_wins_loses AS twl ON twl.account = s.account
WHERE (timestamp BETWEEN {start_date:DateTime} AND {end_date:DateTime})
	AND price_token_a_usdc != 0 AND price_token_b_usdc != 0	-- important, don't consider tokens that have no price defined
GROUP BY account
ORDER BY pnl_percent DESC;

/*

-- how to select: 

SELECT *
FROM top_traders(
		start_date=NOW()-INTERVAL 1 YEAR ,
        end_date=NOW())
WHERE account = '0x8359870917b063fe2ee9aaec5af0ff1ea6caa149'

*/

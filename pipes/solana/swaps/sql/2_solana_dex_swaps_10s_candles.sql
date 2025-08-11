-- Candles - table
CREATE TABLE IF NOT EXISTS solana_dex_swaps_10s_candles (
    timestamp               DateTime CODEC (DoubleDelta, ZSTD),
    dex                     LowCardinality(String),
    token_a                 String,
    token_b                 String,
    pool_address            String,
    -- Token A
    open_token_a_usdc       AggregateFunction(argMinState, Float64, Tuple(DateTime, UInt16, Array (UInt16))),
    high_token_a_usdc       SimpleAggregateFunction(max, Float64),
    low_token_a_usdc        SimpleAggregateFunction(min, Float64),
    close_token_a_usdc      AggregateFunction(argMaxState, Float64, Tuple(DateTime, UInt16, Array (UInt16))),
    -- Token B
    open_token_b_usdc       AggregateFunction(argMinState, Float64, Tuple(DateTime, UInt16, Array (UInt16))),
    high_token_b_usdc       SimpleAggregateFunction(max, Float64),
    low_token_b_usdc        SimpleAggregateFunction(min, Float64),
    close_token_b_usdc      AggregateFunction(argMaxState, Float64, Tuple(DateTime, UInt16, Array (UInt16))),
    -- Other stats
    swap_count              SimpleAggregateFunction(sum, Int64),
    volume_usdc             SimpleAggregateFunction(sum, Float64),
    avg_slippage_pct        AggregateFunction(avgState, Float64),
    max_pool_tvl_usdc       SimpleAggregateFunction(max, Float64)
) ENGINE = AggregatingMergeTree()
  ORDER BY (pool_address, token_a, token_b, dex, timestamp)
  TTL timestamp + INTERVAL 30 DAY;

-- Candles - materialized view
CREATE MATERIALIZED VIEW IF NOT EXISTS solana_dex_swaps_10s_candles_mv
            TO solana_dex_swaps_10s_candles
AS
WITH tuple(original.timestamp, transaction_index, instruction_address)  AS swap_order
SELECT toStartOfInterval(timestamp, INTERVAL 10 SECOND)                 AS timestamp,
       pool_address,
       token_a,
       token_b,
       dex,
--     TOKEN A
       argMinState(token_a_usdc_price, swap_order)                      AS open_token_a_usdc,
       maxSimpleState(token_a_usdc_price)                               AS high_token_a_usdc,
       minSimpleState(token_a_usdc_price)                               AS low_token_a_usdc,
       argMaxState(token_a_usdc_price, swap_order)                      AS close_token_a_usdc,
--     TOKEN B
       argMinState(token_b_usdc_price, swap_order)                      AS open_token_b_usdc,
       maxSimpleState(token_b_usdc_price)                               AS high_token_b_usdc,
       minSimpleState(token_b_usdc_price)                               AS low_token_b_usdc,
       argMaxState(token_b_usdc_price, swap_order)                      AS close_token_b_usdc,
--     Other stats
       sumSimpleState(sign)                                             AS swap_count,
       sumSimpleState(abs(amount_b * token_b_usdc_price) * sign)        AS volume_usdc,
       avgState(slippage_pct)                                           AS avg_slippage_pct,
       maxSimpleState(pool_tvl_usdc)                                    AS max_pool_tvl_usdc
FROM solana_swaps_raw original
-- Temporarily we filter out swaps which...
WHERE
       -- Has a slippage >= 10%
       slippage_pct < 10
       -- Were for a very low amount (< 0.01 USDC)
       and abs(amount_b * token_b_usdc_price) >= 0.01
       -- Had either amount_a or amount_b == 0
       and (amount_a != 0 and amount_b != 0)
GROUP BY pool_address, token_a, token_b, dex, timestamp;

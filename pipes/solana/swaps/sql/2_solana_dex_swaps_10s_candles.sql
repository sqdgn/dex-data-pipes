-- Candles - table
CREATE TABLE IF NOT EXISTS solana_dex_swaps_10s_candles (
    timestamp               DateTime CODEC (DoubleDelta, ZSTD),
    dex                     LowCardinality(String),
    token_a                 String,
    token_b                 String,
    pool_address            String,
    -- Token A
    open_token_a            AggregateFunction(argMinState, Float64, Tuple(DateTime, UInt16, Array (UInt16))),
    high_token_a            SimpleAggregateFunction(max, Float64),
    low_token_a             SimpleAggregateFunction(min, Float64),
    close_token_a           AggregateFunction(argMaxState, Float64, Tuple(DateTime, UInt16, Array (UInt16))),
    -- Token B
    open_token_b            AggregateFunction(argMinState, Float64, Tuple(DateTime, UInt16, Array (UInt16))),
    high_token_b            SimpleAggregateFunction(max, Float64),
    low_token_b             SimpleAggregateFunction(min, Float64),
    close_token_b           AggregateFunction(argMaxState, Float64, Tuple(DateTime, UInt16, Array (UInt16))),
    -- Other stats
    count                   SimpleAggregateFunction(sum, Int64),
    volume_usdc             SimpleAggregateFunction(sum, Float64),
    avg_slippage            AggregateFunction(avgState, Float64),
    max_pool_tvl            SimpleAggregateFunction(max, Float64)
) ENGINE = AggregatingMergeTree()
  ORDER BY (timestamp, pool_address, token_a, token_b, dex)
  TTL timestamp + INTERVAL 1 YEAR;

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
       argMinState(token_a_usdc_price, swap_order)                      AS open_token_a,
       maxSimpleState(token_a_usdc_price)                               AS high_token_a,
       minSimpleState(token_a_usdc_price)                               AS low_token_a,
       argMaxState(token_a_usdc_price, swap_order)                      AS close_token_a,
--     TOKEN B
       argMinState(token_b_usdc_price, swap_order)                      AS open_token_b,
       maxSimpleState(token_b_usdc_price)                               AS high_token_b,
       minSimpleState(token_b_usdc_price)                               AS low_token_b,
       argMaxState(token_b_usdc_price, swap_order)                      AS close_token_b,
--     Other stats
       sumSimpleState(sign)                                             AS count,
       sumSimpleState(abs(amount_a * token_a_usdc_price) * sign)        AS volume_usdc,
       avgState(slippage)                                               AS avg_slippage,
       maxSimpleState(pool_tvl)                                         AS max_pool_tvl
FROM solana_swaps_raw original
-- Temporarily we filter out that swaps completely
WHERE slippage < 10 and abs(amount_a * token_a_usdc_price) >= 0.01 and amount_a != 0 and amount_b != 0
GROUP BY timestamp, token_a, token_b, dex, pool_address;
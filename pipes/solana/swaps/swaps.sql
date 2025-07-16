CREATE TABLE IF NOT EXISTS solana_swaps_raw
(
    timestamp                    DateTime CODEC (DoubleDelta, ZSTD),
    dex                          LowCardinality(String),
    token_a                      String,
    token_b                      String,
    amount_a                     Float64,
    amount_b                     Float64,
    token_a_symbol               String,
    token_b_symbol               String,
    token_a_decimals             UInt8,
    token_b_decimals             UInt8,
    token_a_creation_date        DateTime CODEC (DoubleDelta, ZSTD),
    token_b_creation_date        DateTime CODEC (DoubleDelta, ZSTD),
    token_a_usdc_price           Float64,
    token_b_usdc_price           Float64,
    token_a_balance              Float64,
    token_a_acquisition_cost_usd Float64,
    token_b_balance              Float64,
    token_b_acquisition_cost_usd Float64,
    token_a_profit_usdc          Float64,
    token_b_profit_usdc          Float64,
    token_a_cost_usdc            Float64,
    token_b_cost_usdc            Float64,
    account                      String,
    block_number                 UInt32 CODEC (DoubleDelta, ZSTD),
    transaction_index            UInt16,
    instruction_address          Array (UInt16),
    transaction_hash             String,
    slippage                     Float64,
    pool_address                 String,
    pool_token_a_reserve         Float64,
    pool_token_b_reserve         Float64,
    pool_tvl                     Float64 MATERIALIZED abs(pool_token_a_reserve * token_a_usdc_price) + abs(pool_token_b_reserve * token_b_usdc_price),
    sign                         Int8,

    -- Secondary indexes
    INDEX idx_account_timestamp (timestamp, account) TYPE minmax GRANULARITY 1,
    INDEX idx_account (account) TYPE bloom_filter(0.01) GRANULARITY 1,
    INDEX pool_idx pool_address TYPE bloom_filter GRANULARITY 1,
    INDEX amount_a_idx amount_a TYPE minmax GRANULARITY 4
) ENGINE = CollapsingMergeTree(sign)
      PARTITION BY toYYYYMM(timestamp) -- DATA WILL BE SPLIT BY MONTH
      ORDER BY (block_number, transaction_index, instruction_address);


CREATE MATERIALIZED VIEW IF NOT EXISTS solana_dex_swaps_5m_candles
            ENGINE AggregatingMergeTree()
            ORDER BY (timestamp, pool_address, token_a, token_b, dex)
            POPULATE
AS
WITH slippage < 10 and abs(amount_a * token_a_usdc_price) >= 0.01 and amount_a != 0 and amount_b != 0 AS used_for_candles,
    tuple(original.timestamp, transaction_index, instruction_address) AS swap_order
SELECT toStartOfFiveMinute(timestamp)                                   AS timestamp,
       pool_address,
       token_a,
       token_b,
       dex,
--     TOKEN A
       argMinStateIf(token_a_usdc_price, swap_order, used_for_candles)  AS open_token_a,
       maxStateIf(token_a_usdc_price, used_for_candles)                 AS high_token_a,
       minStateIf(token_a_usdc_price, used_for_candles)                 AS low_token_a,
       argMaxStateIf(token_a_usdc_price, swap_order, used_for_candles)  AS close_token_a,
--     TOKEN B
       argMinStateIf(token_b_usdc_price, swap_order, used_for_candles)  AS open_token_b,
       maxStateIf(token_b_usdc_price, used_for_candles)                 AS high_token_b,
       minStateIf(token_b_usdc_price, used_for_candles)                 AS low_token_b,
       argMaxStateIf(token_b_usdc_price, swap_order, used_for_candles)  AS close_token_b,
       sumState(sign)                                                   AS count,
       sumState(abs(amount_a * token_a_usdc_price) * sign)              AS volume_usdc,
       avgState(slippage)                                               AS avg_slippage,
       maxState(pool_tvl)                                               AS max_pool_tvl,
       maxState(abs(amount_a * token_a_usdc_price) / pool_tvl)          AS pool_tvl_volume_ratio
FROM solana_swaps_raw original
-- Temporarily we filter that swaps completely
WHERE slippage < 10 and abs(amount_a * token_a_usdc_price) >= 0.01 and amount_a != 0 and amount_b != 0
GROUP BY timestamp, token_a, token_b, dex, pool_address;


CREATE MATERIALIZED VIEW IF NOT EXISTS solana_account_trades_daily ENGINE AggregatingMergeTree() ORDER BY (timestamp, account, token)
AS
WITH trades AS (
  SELECT
      timestamp,
      transaction_index,
      instruction_address,
      token_a as token,
      account,
      amount_a AS amount,
      amount_a * token_a_usdc_price AS amount_usdc,
      toFloat64(token_a_balance) AS balance,
      toFloat64(token_a_acquisition_cost_usd) AS acquisition_cost_usd,
      toFloat64(token_a_profit_usdc) AS profit_usdc,
      toFloat64(token_a_cost_usdc) AS cost_usdc
  FROM solana_swaps_raw
  WHERE amount_a != 0
    AND amount_b != 0
    AND sign > 0  -- FIXME !!!
  ORDER BY timestamp, transaction_index, instruction_address
  UNION ALL
  SELECT
      timestamp,
      transaction_index,
      instruction_address,
      token_b as token,
      account,
      amount_b AS amount,
      amount_b * token_b_usdc_price AS amount_usdc,
      toFloat64(token_b_balance) AS balance,
      toFloat64(token_b_acquisition_cost_usd) AS acquisition_cost_usd,
      toFloat64(token_b_profit_usdc) AS profit_usdc,
      toFloat64(token_b_cost_usdc) AS cost_usdc
  FROM solana_swaps_raw
  WHERE amount_a != 0
    AND amount_b != 0
    AND sign > 0 -- FIXME !!!
  ORDER BY timestamp, transaction_index, instruction_address
)
SELECT
    toStartOfDay(timestamp) as timestamp,
    token,
    account,
    countIfState(amount > 0) as buy_count,
    countIfState(amount < 0) as sell_count,
    sumStateIf(abs(amount), amount > 0) as buy_amount,
    sumStateIf(abs(amount), amount < 0) as sell_amount,
    sumStateIf(abs(amount_usdc), amount > 0) as buy_amount_usdc,
    sumStateIf(abs(amount_usdc), amount < 0) as sell_amount_usdc,
    sumState(profit_usdc) as profit_usdc,
    sumState(cost_usdc) as cost_usdc,
    anyLastState(balance) as balance,
    -- TODO: this is a workaround because some acquisition costs were weirdly low
    -- so this aggregate function remove the outliers
    maxState(acquisition_cost_usd) as acquisition_cost_usd
FROM trades
GROUP BY timestamp, account, token;


CREATE MATERIALIZED VIEW IF NOT EXISTS solana_pool_stats_1h
    ENGINE = AggregatingMergeTree()
    PARTITION BY toYYYYMM(timestamp)
    ORDER BY (timestamp, pool_address, token_a, token_b, dex)
    POPULATE
AS SELECT toStartOfHour(timestamp)                             as timestamp,
      token_a,
      token_b,
      dex,
      pool_address,
      sumState(abs(amount_a * token_a_usdc_price) * sign) as volume_usdc,
      maxState(pool_tvl)                                  as pool_tvl
FROM solana_swaps_raw
WHERE amount_a != 0
 AND amount_b != 0
GROUP BY timestamp, token_a, token_b, dex, pool_address;

-- Wallet performance view
-- This view aggregates the performance of wallets over 24h intervals.
CREATE MATERIALIZED VIEW IF NOT EXISTS wallet_performance_daily
            ENGINE = AggregatingMergeTree()
            ORDER BY (timestamp, account)
            POPULATE
AS
SELECT toStartOfDay(timestamp)                                                           as timestamp,
       account,
       anyLastState(ssr.timestamp)                                                       as last_activity,
       sumState(token_a_profit_usdc + token_b_profit_usdc)                               as profit_usdc,
       sumState(abs(amount_a * token_a_usdc_price) + abs(amount_b * token_b_usdc_price)) as volume_usdc,
       countState(amount_a > 0 AND amount_b > 0)                                         as transaction_count
FROM solana_swaps_raw ssr
WHERE amount_a != 0
  AND amount_b != 0
  AND sign > 0
GROUP BY timestamp, account;


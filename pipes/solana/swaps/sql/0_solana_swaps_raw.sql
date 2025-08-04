CREATE TABLE IF NOT EXISTS solana_swaps_raw
(
    timestamp                          DateTime CODEC (DoubleDelta, ZSTD),
    dex                                LowCardinality(String),
    token_a                            String,
    token_b                            String,
    amount_a                           Float64,
    amount_b                           Float64,
    token_a_symbol                     String,
    token_b_symbol                     String,
    token_a_decimals                   UInt8,
    token_b_decimals                   UInt8,
    token_a_creation_date              DateTime CODEC (DoubleDelta, ZSTD),
    token_b_creation_date              DateTime CODEC (DoubleDelta, ZSTD),
    token_a_usdc_price                 Float64,
    token_b_usdc_price                 Float64,
    token_a_pricing_pool               String,
    token_b_pricing_pool               String,
    token_a_best_pricing_pool_selected Bool,
    token_b_best_pricing_pool_selected Bool,
    token_a_balance                    Float64,
    token_b_balance                    Float64,
    token_a_profit_usdc                Float64,
    token_b_profit_usdc                Float64,
    token_a_cost_usdc                  Float64,
    token_b_cost_usdc                  Float64,
    token_a_wins                       UInt32,
    token_b_wins                       UInt32,
    token_a_loses                      UInt32,
    token_b_loses                      UInt32,
    account                            String,
    block_number                       UInt32 CODEC (DoubleDelta, ZSTD),
    transaction_index                  UInt16,
    instruction_address                Array (UInt16),
    transaction_hash                   String,
    slippage_pct                       Float64,
    pool_address                       String,
    pool_token_a_reserve               Float64,
    pool_token_b_reserve               Float64,
    pool_tvl                           Float64 MATERIALIZED abs(pool_token_a_reserve * token_a_usdc_price) + abs(pool_token_b_reserve * token_b_usdc_price),
    sign                               Int8,

    -- Secondary indexes
    INDEX idx_account_timestamp (timestamp, account) TYPE minmax GRANULARITY 1,
    INDEX idx_account (account) TYPE bloom_filter(0.01) GRANULARITY 1,
    INDEX pool_idx pool_address TYPE bloom_filter GRANULARITY 1,
    INDEX amount_a_idx amount_a TYPE minmax GRANULARITY 4
) ENGINE = CollapsingMergeTree(sign)
      PARTITION BY toYYYYMM(timestamp) -- DATA WILL BE SPLIT BY MONTH
      ORDER BY (block_number, transaction_index, instruction_address)
      TTL timestamp + INTERVAL 30 DAY;


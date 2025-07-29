-- A table with account as primary index and limited data to speed up fetching account's positions
CREATE TABLE IF NOT EXISTS account_token_positions (
    timestamp            DateTime CODEC (DoubleDelta, ZSTD),
    account              String,
    token_a              String,
    token_b              String,
    amount_a             Float64,
    amount_b             Float64,
    token_a_usdc_price   Float64,
    token_b_usdc_price   Float64,
    block_number         UInt32 CODEC (DoubleDelta, ZSTD),
    transaction_index    UInt16,
    instruction_address  Array (UInt16),
    sign                 Int8,
) ENGINE = CollapsingMergeTree(sign)
  ORDER BY (account, block_number, transaction_index, instruction_address)
  TTL timestamp + INTERVAL 30 DAY;

-- Materialized view which populates the table
CREATE MATERIALIZED VIEW IF NOT EXISTS account_token_positions_mv
  TO account_token_positions
  AS
    SELECT
      sign,
      timestamp,
      account,
      token_a,
      token_b,
      amount_a,
      amount_b,
      token_a_usdc_price,
      token_b_usdc_price,
      block_number,
      transaction_index,
      instruction_address
    FROM solana_swaps_raw original
WHERE
  (amount_a > 0 OR amount_b > 0) AND
  -- Currently we only use allowed quote tokens to calculate positions
  token_b IN allowed_quote_tokens();
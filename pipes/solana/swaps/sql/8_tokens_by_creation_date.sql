CREATE TABLE IF NOT EXISTS tokens_by_creation_date (
    token_address        String,
    token_symbol         String,
    creation_date        DateTime CODEC (DoubleDelta, ZSTD),
    first_swap_date      DateTime CODEC (DoubleDelta, ZSTD)
) ENGINE = ReplacingMergeTree()
  ORDER BY (creation_date, first_swap_date, token_address)
  TTL `first_swap_date` + INTERVAL 1 YEAR;

CREATE MATERIALIZED VIEW IF NOT EXISTS tokens_by_creation_date_mv
TO tokens_by_creation_date
AS (
  SELECT
    token_a AS token_address,
    any(token_a_symbol) AS token_symbol,
    any(token_a_creation_date) AS creation_date,
    min(timestamp) AS first_swap_date
  FROM
    solana_swaps_raw
  GROUP BY token_a
);
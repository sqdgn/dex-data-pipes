-- Table for storing pool stats aggregated by 1h
CREATE TABLE IF NOT EXISTS quote_pool_stats_1h (
    timestamp               DateTime CODEC (DoubleDelta, ZSTD),
    dex                     LowCardinality(String),
    token_a                 String,
    token_b                 String,
    pool_address            String,
    volume_1h_usdc          SimpleAggregateFunction(sum, Float64),
) ENGINE = AggregatingMergeTree()
  ORDER BY (timestamp, pool_address, token_a, token_b, dex)
  TTL timestamp + INTERVAL 30 DAY;

-- A materialized view populating the table above
CREATE MATERIALIZED VIEW IF NOT EXISTS quote_pool_stats_1h_mv
    TO quote_pool_stats_1h
AS
    SELECT
          toStartOfHour(timestamp)                                  as timestamp,
          token_a,
          token_b,
          dex,
          pool_address,
          sumSimpleState(abs(amount_b * token_b_usdc_price) * sign) as volume_1h_usdc
    FROM solana_swaps_raw
    WHERE
      token_b IN allowed_quote_tokens()
    GROUP BY timestamp, token_a, token_b, dex, pool_address;

-- A helper view to query tokens along with their best quote pools
-- (highest volume pools in a time period between min_timestamp and max_timestamp) 
CREATE VIEW IF NOT EXISTS ${db_name}.tokens_with_best_quote_pools
AS
  WITH
    pool_stats AS (
      SELECT
        token_a,
        token_b,
        dex,
        pool_address,
        sum(volume_1h_usdc) AS total_volume_usdc
      FROM ${db_name}.quote_pool_stats_1h
      WHERE
        (timestamp BETWEEN {min_timestamp:DateTime} AND {max_timestamp:DateTime}) 
      GROUP BY token_a, token_b, dex, pool_address
    )
  SELECT
    ps.token_a                                     AS token_a,
    argMax(ps.token_b, ps.total_volume_usdc)       AS token_b,
    argMax(ps.dex, ps.total_volume_usdc)           AS dex,
    argMax(ps.pool_address, ps.total_volume_usdc)  AS pool_address,
    max(ps.total_volume_usdc)                      AS total_volume_usdc
  FROM pool_stats ps
  GROUP BY token_a;
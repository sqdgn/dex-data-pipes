-- Table for storing tokens along with their best pool
-- based on the last 14d volume (with 1-hour granularity)
CREATE TABLE IF NOT EXISTS tokens_with_14d_best_pools_1h (
    timestamp               DateTime CODEC (DoubleDelta, ZSTD),
    token_a                 String,
    token_b                 AggregateFunction(argMaxState, String, Float64),
    dex                     AggregateFunction(argMaxState, String, Float64),
    best_pool_address       AggregateFunction(argMaxState, String, Float64),
    volume_14d_usdc         SimpleAggregateFunction(max, Float64),
) ENGINE = AggregatingMergeTree()
  ORDER BY (timestamp, token_a)
  TTL timestamp + INTERVAL 30 DAY;

-- Helper view for the query below
CREATE VIEW IF NOT EXISTS quote_pool_stats_1h_v AS SELECT * FROM quote_pool_stats_1h;

-- Materialized view to populate tokens_with_14d_best_pools_1h.
-- Uses quote_pool_stats_1h_v to query all data from quote_pool_stats_1h
-- instead of only inserted chunk.
-- Ref: https://clickhouse.com/docs/materialized-view/incremental-materialized-view#using-source-table-in-filters-and-joins-in-materialized-views
CREATE MATERIALIZED VIEW IF NOT EXISTS tokens_with_14d_best_pools_1h_mv
TO tokens_with_14d_best_pools_1h
AS
  WITH
    ps1h_v AS (
      SELECT
        timestamp,
        token_a,
        token_b,
        dex,
        pool_address,
        max(volume_1h_usdc) AS volume_1h_usdc
      FROM
        quote_pool_stats_1h_v
      -- Limit only to tokens present in this insert chunk.
      WHERE token_a IN (
        SELECT token_a FROM quote_pool_stats_1h
      )
      GROUP BY timestamp, token_a, token_b, dex, pool_address
    ) 
  SELECT
    src.timestamp                                          AS timestamp,
    src.token_a                                            AS token_a,
    argMaxState(inner.token_b, inner.volume_14d_usdc)      AS token_b,
    argMaxState(inner.dex, inner.volume_14d_usdc)          AS dex,
    argMaxState(inner.pool_address, inner.volume_14d_usdc) AS best_pool_address,
    max(inner.volume_14d_usdc)                             AS volume_14d_usdc
  FROM
    quote_pool_stats_1h src
    JOIN (
      SELECT
        ps1h.timestamp,
        ps1h.token_a,
        ps1h.token_b,
        ps1h.dex,
        ps1h.pool_address,
        sum(ps14d.volume_1h_usdc) AS volume_14d_usdc
      FROM ps1h_v ps1h
      JOIN ps1h_v ps14d ON (
        ps14d.pool_address = ps1h.pool_address
        AND ps14d.timestamp BETWEEN (ps1h.timestamp - INTERVAL 14 DAY) AND ps1h.timestamp
      )
      GROUP BY
        ps1h.timestamp, ps1h.token_a, ps1h.token_b, ps1h.dex, ps1h.pool_address
    ) AS inner
      ON (
        inner.token_a = src.token_a
        AND inner.timestamp <= src.timestamp
      )
  GROUP BY src.timestamp, src.token_a;

-- Table for storing aggregation of tokens with their best prices from the last 14d pools
CREATE TABLE IF NOT EXISTS tokens_with_last_prices_from_14d_best_pool (
    token                   String,
    swap_timestamp          SimpleAggregateFunction(max, DateTime),
    best_pool_address       AggregateFunction(argMaxState, String, Tuple(DateTime, UInt16, Array (UInt16))),
    best_pool_timestamp     AggregateFunction(argMaxState, DateTime, Tuple(DateTime, UInt16, Array (UInt16))),
    pool_address            AggregateFunction(argMaxState, String, Tuple(DateTime, UInt16, Array (UInt16))),
    price_usdc              AggregateFunction(argMaxState, Float64, Tuple(DateTime, UInt16, Array (UInt16)))
) ENGINE = AggregatingMergeTree()
  ORDER BY token
  TTL swap_timestamp + INTERVAL 30 DAY;

-- A materialized view populating the table above
CREATE MATERIALIZED VIEW IF NOT EXISTS tokens_with_last_prices_from_14d_best_pool_mv
    TO tokens_with_last_prices_from_14d_best_pool
AS
  WITH
    tuple(s.timestamp, s.transaction_index, s.instruction_address) AS swap_order,
    (SELECT toStartOfHour(max(timestamp - INTERVAL 1 HOUR)) FROM solana_swaps_raw) AS best_pool_max_ts,
    bp_ts_by_token AS (
      SELECT
        token_a,
        maxIf(timestamp, timestamp <= best_pool_max_ts) AS max_ts
      FROM tokens_with_14d_best_pools_1h
      GROUP BY token_a
    )
  SELECT
    s.token_a                                     AS token,
    maxSimpleState(s.timestamp)                   AS swap_timestamp,
    argMaxState(bp.best_pool_address, swap_order) AS best_pool_address,
    argMaxState(bp.timestamp, swap_order)         AS best_pool_timestamp,
    argMaxState(s.pool_address, swap_order)       AS pool_address,
    argMaxState(s.token_a_usdc_price, swap_order) AS price_usdc
  FROM solana_swaps_raw s
  LEFT JOIN bp_ts_by_token bp_ts ON bp_ts.token_a = s.token_a
  LEFT JOIN
    (
      SELECT
        timestamp,
        token_a,
        argMaxMerge(best_pool_address) AS best_pool_address
      FROM tokens_with_14d_best_pools_1h
      GROUP BY timestamp, token_a
    ) AS bp
      ON (
        bp.token_a = s.token_a
        AND bp.timestamp = bp_ts.max_ts
      )
  WHERE
    CASE
      WHEN bp.best_pool_address != '' THEN (
        s.pool_address = bp.best_pool_address
      )
      ELSE (
        s.token_b IN allowed_quote_tokens()
      )
    END
    AND s.token_a_usdc_price > 0
    AND s.sign > 0
  GROUP BY token;
-- Table for storing tokens along with their latest prices in each pool
CREATE TABLE IF NOT EXISTS tokens_with_last_prices (
    token_a                 String,
    token_b                 String,
    pool_address            String,
    swap_timestamp          SimpleAggregateFunction(max, DateTime),
    swap_order_data         SimpleAggregateFunction(max, Tuple(DateTime, UInt16, Array (UInt16))),
    price_usdc              AggregateFunction(argMaxState, Float64, Tuple(DateTime, UInt16, Array (UInt16)))
) ENGINE = AggregatingMergeTree()
  ORDER BY (token_a, token_b, pool_address)
  TTL swap_timestamp + INTERVAL 30 DAY;

-- A materialized view populating the table above
CREATE MATERIALIZED VIEW IF NOT EXISTS tokens_with_last_prices_mv
    TO tokens_with_last_prices
AS
  WITH tuple(s.timestamp, s.transaction_index, s.instruction_address) AS swap_order
  SELECT
    s.token_a                                     AS token_a,
    s.token_b                                     AS token_b,
    s.pool_address                                AS pool_address,
    max(s.timestamp)                              AS swap_timestamp,
    max(swap_order)                               AS swap_order_data,
    argMaxState(s.token_a_usdc_price, swap_order) AS price_usdc
  FROM solana_swaps_raw s
  WHERE
    s.token_a_usdc_price > 0
    AND s.sign > 0
    AND s.token_b IN allowed_quote_tokens()
  GROUP BY token_a, token_b, pool_address;

-- A view to query tokens along with their best pool prices
CREATE VIEW IF NOT EXISTS ${db_name}.tokens_with_last_best_pool_prices
AS
  WITH
    token_last_swap_orders AS (
      SELECT
        token_a,
        max(swap_order_data) AS last_swap_order
      FROM ${db_name}.tokens_with_last_prices
      GROUP BY token_a
    ),
    token_last_swap_pools AS (
      SELECT
        token_a,
        pool_address
      FROM ${db_name}.tokens_with_last_prices twlp
      JOIN token_last_swap_orders tlso ON (
        tlso.token_a = twlp.token_a
        AND tlso.last_swap_order = twlp.swap_order_data
      )
    )
  SELECT
    twlp.token_a                 AS token,
    twlp.pool_address            AS pool_address,
    best_pool.pool_address       AS best_pool_address,
    argMaxMerge(twlp.price_usdc) AS price_usdc
  FROM
    ${db_name}.tokens_with_last_prices twlp
		LEFT JOIN
		  ${db_name}.tokens_with_best_quote_pools(
		    min_timestamp={min_timestamp:DateTime},
		    max_timestamp={max_timestamp:DateTime}
		  ) AS best_pool
		  ON best_pool.token_a = twlp.token_a
    LEFT JOIN
      token_last_swap_pools AS last_pool ON (
        last_pool.token_a = twlp.token_a
      )
  WHERE
    CASE
      WHEN best_pool.pool_address != '' THEN (
        twlp.pool_address = best_pool.pool_address
      )
      ELSE (
        twlp.pool_address = last_pool.pool_address
      )
    END
  GROUP BY token, pool_address, best_pool_address;

-- TODO: Remove later
CREATE VIEW IF NOT EXISTS ${db_name}.tokens_with_last_prices_old AS
  WITH tuple(s.timestamp, s.transaction_index, s.instruction_address) AS swap_order
  SELECT
    s.token_a as token,
    argMax(s.pool_address, swap_order) AS pool_address,
    argMax(best_pool.pool_address, swap_order) AS best_pool_address,
    argMax(s.token_a_usdc_price, swap_order) as price_usdc
  FROM ${db_name}.solana_swaps_raw s
  LEFT JOIN
    ${db_name}.tokens_with_best_quote_pools(
      min_timestamp={min_timestamp:DateTime},
      max_timestamp={max_timestamp:DateTime}
    ) AS best_pool
    ON best_pool.token_a = s.token_a
  WHERE
    CASE
      WHEN best_pool.pool_address IS NOT NULL THEN (
        s.pool_address = best_pool.pool_address
      )
      ELSE (
        s.token_b IN allowed_quote_tokens()
      )
    END
    AND s.token_a_usdc_price > 0
    AND s.sign > 0
  GROUP BY token;
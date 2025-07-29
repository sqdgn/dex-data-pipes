-- A helper view to query tokens along with their most up-to-date prices
-- based on "best quote pools" (highest volume pools) in a given time period
-- (between min_timestamp and max_timestamp)
CREATE VIEW IF NOT EXISTS ${db_name}.tokens_with_last_prices AS
  WITH tuple(s.timestamp, s.transaction_index, s.instruction_address) AS swap_order
  SELECT
    s.token_a as token,
    argMax(s.pool_address, swap_order) AS pool_address,
    argMax(best_pool.pool_address, swap_order) AS best_pool_address,
    argMax(s.token_a_usdc_price, swap_order) as price
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
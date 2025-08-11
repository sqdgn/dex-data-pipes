-- TOP MOVERS

-- A table to track daily volume and price change of the tokens
CREATE TABLE IF NOT EXISTS daily_top_movers (
    day                  DateTime CODEC (DoubleDelta, ZSTD),
    token_address        String,
    token_symbol         String,
    token_created_at     DateTime CODEC (DoubleDelta, ZSTD),
    pool_address         String,
    dex                  LowCardinality(String),
    open_price_usdc      AggregateFunction(argMinState, Float64, Tuple(DateTime, UInt16, Array (UInt16))),
    close_price_usdc     AggregateFunction(argMaxState, Float64, Tuple(DateTime, UInt16, Array (UInt16))),
    volume_usdc          SimpleAggregateFunction(sum, Float64)
) ENGINE = AggregatingMergeTree()
  ORDER BY (day, token_address, pool_address)
  TTL `day` + INTERVAL 1 YEAR;

-- Materialized view to populate the table above
CREATE MATERIALIZED VIEW IF NOT EXISTS daily_top_movers_mv
  TO daily_top_movers
  AS (
    WITH
      tuple(swap.timestamp, swap.transaction_index, swap.instruction_address) AS swap_order
	  SELECT
	      toStartOfDay(timestamp)                                    AS `day`,
	      `token_a`                                                  AS `token_address`,
	      any(`token_a_symbol`)                                      AS `token_symbol`,
	      any(`token_a_creation_date`)                               AS `token_created_at`,
	      `pool_address`                                             AS `pool_address`,
	      any(`dex`)                                                 AS `dex`,
	      argMinState(`token_a_usdc_price`, `swap_order`)            AS `open_price_usdc`,
	      argMaxState(`token_a_usdc_price`, `swap_order`)            AS `close_price_usdc`,
	      sumSimpleState(abs(amount_b * token_b_usdc_price) * sign)  AS `volume_usdc`
	    FROM
	      `solana_swaps_raw` AS `swap`
	    WHERE
	      `token_a_usdc_price` > 0 AND
	      `token_b` IN allowed_quote_tokens() AND
	--      Filter out swaps that affect the price too greatly (>10%)
	      slippage_pct < 10 AND
	--      Filter out negligable amount swaps
	      abs(amount_b * token_b_usdc_price) >= 0.01
	    GROUP BY `day`, `token_a`, `pool_address`
  );
 
-- Helper view to find top performing tokens in a given timeframe.
-- 
-- Example usage:
-- 
-- SELECT * FROM
--   `solana_swaps_new`.`top_movers`(
--     offset_days=1,
--     period_days=7
--   )
-- HAVING
--   volume > 10000
--   AND age_sec > toIntervalSecond(INTERVAL 30 DAY)
-- LIMIT 20;
CREATE OR REPLACE VIEW ${db_name}.top_movers AS
  WITH
  	INTERVAL {offset_days:UInt32} DAY AS offset_interval,
  	INTERVAL {period_days:UInt32} DAY AS period_interval,
    toStartOfDay(now() - offset_interval)                   AS end_date,
    toStartOfDay(now() - offset_interval - period_interval) AS start_date
  SELECT
    `start_date`,
    `end_date`,
    `token_address`,
    `pool_address`,
    any(`dex`)                                                         AS `dex`,
    any(`token_symbol`)                                                AS `token_symbol`,
    now() - any(`token_created_at`)                                    AS `age_sec`,
    sum(volume_usdc)                                                   AS `volume_usdc`,
    argMinMerge(`open_price_usdc`)                                     AS `open_price_usdc`,
    argMaxMerge(`close_price_usdc`)                                    AS `close_price_usdc`,
    (`close_price_usdc` - `open_price_usdc`) / `open_price_usdc` * 100 AS `grow_pct`
  FROM
    ${db_name}.`daily_top_movers` AS `daily_top_movers`
    INNER JOIN ${db_name}.`tokens_with_best_quote_pools`(
      min_timestamp=start_date,
      max_timestamp=end_date
    ) AS `best_pool`
      ON (
        `best_pool`.`token_a` = `daily_top_movers`.`token_address`
        AND `best_pool`.`pool_address` = `daily_top_movers`.`pool_address`
      )
  WHERE
  	`day` BETWEEN `start_date` AND `end_date`
  GROUP BY `token_address`, `pool_address`
  ORDER BY `grow_pct` DESC;
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
    slippage                           Float64,
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

-- Should match QUOTE_TOKENS const in streams/svm_swaps/utils.ts!
CREATE FUNCTION IF NOT EXISTS allowed_quote_tokens AS () -> tuple(
  'EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v',
  'Es9vMFrzaCERmJfrF4H2FYD4KCoNkY11McCe8BenwNYB',
  'USDSwr9ApdHk5bvJKMjzff41FfuX8bSxdKcR81vTwcA',
  'So11111111111111111111111111111111111111112'
);

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

CREATE TABLE IF NOT EXISTS quote_pool_stats_1h (
    timestamp               DateTime CODEC (DoubleDelta, ZSTD),
    dex                     LowCardinality(String),
    token_a                 String,
    token_b                 String,
    pool_address            String,
    volume_1h               SimpleAggregateFunction(sum, Float64),
) ENGINE = AggregatingMergeTree()
  ORDER BY (timestamp, pool_address, token_a, token_b, dex)
  TTL timestamp + INTERVAL 1 YEAR;

CREATE MATERIALIZED VIEW IF NOT EXISTS quote_pool_stats_1h_mv
    TO quote_pool_stats_1h
AS
    SELECT
          toStartOfHour(timestamp)                                  as timestamp,
          token_a,
          token_b,
          dex,
          pool_address,
          sumSimpleState(abs(amount_a * token_a_usdc_price) * sign) as volume_1h
    FROM solana_swaps_raw
    WHERE
      token_b IN allowed_quote_tokens()
    GROUP BY timestamp, token_a, token_b, dex, pool_address;

CREATE VIEW IF NOT EXISTS ${db_name}.tokens_with_best_quote_pools
AS
  WITH
    pool_stats AS (
      SELECT
        token_a,
        token_b,
        dex,
        pool_address,
        sum(volume_1h) AS total_volume
      FROM ${db_name}.quote_pool_stats_1h
      WHERE
        (timestamp BETWEEN {min_timestamp:DateTime} AND {max_timestamp:DateTime}) 
      GROUP BY token_a, token_b, dex, pool_address
    )
  SELECT
    ps.token_a                               AS token_a,
    argMax(ps.token_b, ps.total_volume)      AS token_b,
    argMax(ps.dex, ps.total_volume)          AS dex,
    argMax(ps.pool_address, ps.total_volume) AS pool_address,
    max(ps.total_volume)                     AS total_volume
  FROM pool_stats ps
  GROUP BY token_a;

CREATE VIEW IF NOT EXISTS ${db_name}.trader_token_stats AS
		SELECT
			s1.account                         AS wallet,
			s1.token_a                         AS token,
      countIf(amount_a < 0)              AS sells,
      countIf(amount_a > 0)              AS buys,
      abs(sumIf(amount_a, amount_a < 0)) AS sold_amount,
      sumIf(amount_a, amount_a > 0)      AS bought_amount,
      (sold_amount / bought_amount)      AS sold_to_bought_ratio,
      max(s1.token_a_wins)               AS tx_wins,
      max(s1.token_a_loses)              AS tx_loses,
			sum(s1.token_a_profit_usdc)        AS total_profit_usdc
		FROM ${db_name}.solana_swaps_raw s1
		WHERE
			(s1.timestamp BETWEEN {start_date:DateTime} AND {end_date:DateTime}) AND
			s1.token_b IN {allowed_quote_tokens:Array(String)}
		GROUP BY wallet, token;

CREATE VIEW IF NOT EXISTS ${db_name}.top_traders
AS
  WITH
    token_wins_loses AS (
      SELECT
        tts.wallet                         AS wallet,
        sum(tts.tx_wins)                   AS tx_wins,
        sum(tts.tx_loses)                  AS tx_loses,
        countIf(tts.total_profit_usdc > 0) AS token_wins,
        countIf(tts.total_profit_usdc < 0) AS token_loses
      FROM ${db_name}.trader_token_stats(
        start_date={start_date:DateTime},
        end_date={end_date:DateTime},
        allowed_quote_tokens={allowed_quote_tokens:Array(String)}
      ) tts
      GROUP BY tts.wallet
    )
  -- MAIN QUERY
  SELECT
    account AS wallet,
    countIf(amount_a < 0) AS sells,
    countIf(amount_a > 0) AS buys,
    count(distinct token_a) AS distinct_tokens,
    min(timestamp) AS first_tx,
    max(timestamp) AS last_tx,
    sum(token_a_cost_usdc) AS total_cost_usdc,
    sum(token_a_profit_usdc) AS total_profit_usdc,
    sum(token_a_wins) AS tx_wins,
    sum(token_a_loses) AS tx_loses,
    any(twl.token_wins) AS token_wins,
    any(twl.token_loses) AS token_loses,
    (tx_wins / (tx_wins + tx_loses)) AS tx_win_ratio,
    (token_wins / (token_wins + token_loses)) AS token_win_ratio,
    (total_profit_usdc / total_cost_usdc) * 100 AS pnl_percent
  FROM
    ${db_name}.solana_swaps_raw s
  JOIN
    token_wins_loses AS twl ON twl.wallet = wallet
  WHERE
    (timestamp BETWEEN {start_date:DateTime} AND {end_date:DateTime}) AND
    `token_b` IN {allowed_quote_tokens:Array(String)}
  GROUP BY wallet
  ORDER BY `pnl_percent` DESC;

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
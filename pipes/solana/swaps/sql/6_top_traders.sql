-- Helper view to query account statistics grouped by token
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

-- Helper view to query accounts with best trading performance in a given time period
-- (between start_date and end_date), along with multiple statistics.
-- 
-- Example usage:
-- 
-- SELECT * FROM
--   `solana_swaps_new`.`top_traders`(
--     start_date=start_date,
--     end_date=end_date,
--     allowed_quote_tokens=array(untuple(allowed_quote_tokens()))
--   )
-- HAVING
--   pnl_percent > 0
--   AND token_win_ratio > 0.3
--   AND distinct_tokens > 5
-- ORDER BY pnl_percent DESC
-- LIMIT 200;
CREATE VIEW IF NOT EXISTS ${db_name}.top_traders
AS
  WITH
  	filtered_swaps AS (
  		SELECT *
  		FROM ${db_name}.solana_swaps_raw
  		WHERE
		     timestamp BETWEEN {start_date:DateTime} AND {end_date:DateTime} AND
		    `token_b` IN {allowed_quote_tokens:Array(String)}
  	),
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
    ),
    account_buys_and_sells AS (
      SELECT
        token_a,
        account,
        minIf(timestamp, amount_a > 0) AS first_buy,
        minIf(timestamp, amount_a < 0) AS first_sell,
        maxIf(timestamp, amount_a < 0) AS last_sell
      FROM filtered_swaps
      GROUP BY token_a, account
    ),
    account_avg_holding_times AS (
      SELECT
        account,
        count() AS unique_tokens,
        avg(first_sell - first_buy) AS avg_holding_time_to_first_sell,
        avg(last_sell - first_buy) AS avg_holding_time_to_last_sell
      FROM
        account_buys_and_sells
      WHERE
      --  Each selected token should have at least 1 buy tx
      --  and all sell transactions should've happened AFTER the first buy tx
        first_buy > '2000-01-01' AND
        first_sell >= first_buy
      GROUP BY account
    )
  -- MAIN QUERY
  SELECT
    s.account AS wallet,
    sumIf(sign, amount_a < 0) AS sells,
    sumIf(sign, amount_a > 0) AS buys,
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
    (total_profit_usdc / total_cost_usdc) * 100 AS pnl_percent,
    any(avg_holding_time_to_first_sell) AS avg_holding_time_to_first_sell,
    any(avg_holding_time_to_last_sell) AS avg_holding_time_to_last_sell
  FROM
    filtered_swaps s
    JOIN token_wins_loses AS twl ON twl.wallet = wallet
    JOIN account_avg_holding_times aht ON aht.account = wallet
  GROUP BY wallet
  ORDER BY `pnl_percent` DESC;
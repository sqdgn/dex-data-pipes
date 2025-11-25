-- SQL related to top wallets analytics
-- =================================================================================
-- Traders stats

CREATE VIEW IF NOT EXISTS ${db_name}.trader_token_stats AS
	SELECT
		s1.account                          AS account,
		s1.token_a                          AS token,
		sumIf(sign, amount_a > 0)			AS sells,
		sumIf(sign, amount_a < 0)			AS buys,
		sumIf(amount_a*sign, amount_a > 0)		AS sold_amount_token,
		sumIf(ABS(amount_a)*sign, amount_a < 0)  AS bought_amount_token,
		(sold_amount_token / bought_amount_token)      AS sold_to_bought_ratio,
		max(s1.token_a_wins)               AS tx_wins,
		max(s1.token_a_loses)              AS tx_loses,
		sum(s1.token_a_profit_usdc * sign) AS total_profit_usdc
	FROM swaps_raw s1
	WHERE
		(s1.timestamp BETWEEN {start_date:DateTime} AND {end_date:DateTime})
		AND price_token_a_usdc != 0 AND price_token_b_usdc != 0
	GROUP BY account, token;


CREATE VIEW IF NOT EXISTS ${db_name}.top_traders
AS
  WITH
    token_wins_loses AS (
      SELECT
        tts.account                         AS account,
        sum(tts.tx_wins)                   AS tx_wins,
        sum(tts.tx_loses)                  AS tx_loses,
        countIf(tts.total_profit_usdc > 0) AS token_wins,
        countIf(tts.total_profit_usdc < 0) AS token_loses
      FROM ${db_name}.trader_token_stats(
        start_date={start_date:DateTime},
        end_date={end_date:DateTime}
      ) tts
      GROUP BY tts.account
    )
SELECT account, 
	sum(sign) AS tx_count,
	avg(ABS(amount_a)*price_token_a_usdc*sign) AS avg_trade_usdc,
	sumIf(sign, amount_a < 0) AS token_a_buys,
	sumIf(sign, amount_a > 0) AS token_a_sells,
	count(distinct token_a) AS distinct_token_a,
    sum(token_a_cost_usdc*sign) AS total_cost_usdc,
    sum(token_a_profit_usdc*sign) AS total_profit_usdc,
    sum(token_a_wins*sign) AS tx_wins,
    sum(token_a_loses*sign) AS tx_loses,
    any(twl.token_wins) AS token_wins,
    any(twl.token_loses) AS token_loses,
    (tx_wins / (tx_wins + tx_loses)) AS tx_win_ratio,
    (token_wins / (token_wins + token_loses)) AS token_win_ratio,
    (total_profit_usdc / total_cost_usdc) * 100 AS pnl_percent,
	min(timestamp) AS first_tx,
	max(timestamp) AS last_tx,
	tx_count / dateDiff('hour', first_tx, last_tx) AS tx_per_hour
FROM ${db_name}.swaps_raw s
JOIN
    token_wins_loses AS twl ON twl.account = s.account
WHERE (timestamp BETWEEN {start_date:DateTime} AND {end_date:DateTime})
	AND price_token_a_usdc != 0 AND price_token_b_usdc != 0	-- important, don't consider tokens that have no price defined
GROUP BY account
ORDER BY pnl_percent DESC;

/*

-- how to select: 

SELECT *
FROM top_traders(
		start_date=NOW()-INTERVAL 1 YEAR ,
        end_date=NOW())
WHERE account = '0x8359870917b063fe2ee9aaec5af0ff1ea6caa149'

*/

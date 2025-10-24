create table first_token_swap
(
    token String,
    timestamp    AggregateFunction(argMin, DateTime, DateTime)
)
    engine = AggregatingMergeTree ORDER BY token
        SETTINGS index_granularity = 8192;


CREATE MATERIALIZED VIEW first_token_swap_mv TO first_token_swap
(
    `token` String,
    `timestamp` AggregateFunction(argMin, DateTime, DateTime)
)
AS
SELECT token_a AS token,
       argMinState(timestamp, timestamp) AS timestamp
FROM solana_swaps_raw
GROUP BY token;

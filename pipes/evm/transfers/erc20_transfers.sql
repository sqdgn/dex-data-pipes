CREATE TABLE IF NOT EXISTS erc20_transfers
(
    timestamp         DateTime CODEC (DoubleDelta, ZSTD),
    token             String,
    "from"            String,
    "to"              String,
    amount            Int256,
    block_number      UInt32 CODEC (DoubleDelta, ZSTD),
    transaction_index UInt16,
    log_index         UInt16,
    transaction_hash  String,
    sign              Int8
) ENGINE = CollapsingMergeTree(sign)
      PARTITION BY toYYYYMM(timestamp) -- DATA WILL BE SPLIT BY MONTH
      ORDER BY (timestamp, transaction_index, log_index)
      TTL timestamp + INTERVAL 120 DAY;

-- ############################################################################################################
--
-- ############################################################################################################

CREATE TABLE IF NOT EXISTS erc20_holders
(
    timestamp         DateTime CODEC (DoubleDelta, ZSTD),
    token             String,
    holders			  UInt32
) ENGINE = ReplacingMergeTree()
      PARTITION BY toYYYYMM(timestamp)
      ORDER BY (token, timestamp)
      TTL timestamp + INTERVAL 120 DAY;


CREATE TABLE IF NOT EXISTS erc20_first_transfers
(
    token String,
    timestamp         AggregateFunction(any, DateTime),
    block_number      AggregateFunction(any, UInt32),
    transaction_index AggregateFunction(any, UInt16),
    log_index         AggregateFunction(any, UInt16),
    transaction_hash  AggregateFunction(any, String)
) ENGINE = AggregatingMergeTree()
ORDER BY token;

CREATE MATERIALIZED VIEW IF NOT EXISTS erc20_first_transfers_mv
TO erc20_first_transfers
AS
SELECT
    token,
    anyState(timestamp) as timestamp,
    anyState(block_number) as block_number,
    anyState(transaction_index) as transaction_index,
    anyState(log_index) as log_index,
    anyState(transaction_hash) as transaction_hash
FROM erc20_transfers
GROUP BY token;

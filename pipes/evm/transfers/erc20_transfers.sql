CREATE TABLE IF NOT EXISTS ${network}_erc20_transfers
(
    timestamp         DateTime CODEC (DoubleDelta, ZSTD),
    network           LowCardinality(String),
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

CREATE TABLE IF NOT EXISTS ${network}_erc20_holders
(
    timestamp         DateTime CODEC (DoubleDelta, ZSTD),
    token             String,
    holders			  UInt32,
    sign		      Int8
) ENGINE = CollapsingMergeTree(sign)
      PARTITION BY toYYYYMM(timestamp)
      ORDER BY (token, timestamp)
      TTL timestamp + INTERVAL 90 DAY;


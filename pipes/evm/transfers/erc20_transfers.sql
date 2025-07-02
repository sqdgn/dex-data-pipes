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
      TTL timestamp + INTERVAL 90 DAY;

-- ############################################################################################################
--
-- ############################################################################################################

-- Merge tree with no deduplication logic to speed up inserts.
-- We may end up with duplicate records token+timestamp, but it is not an issue.
CREATE TABLE IF NOT EXISTS erc20_holders
(
    timestamp         DateTime CODEC (DoubleDelta, ZSTD),
    token             String,
    holders			  UInt32
) ENGINE = MergeTree()
      PARTITION BY toYYYYMM(timestamp)
      ORDER BY (token, timestamp)
      TTL timestamp + INTERVAL 90 DAY;


-- Merge tree with no deduplication logic to speed up inserts.
-- We may end up with duplicate records for token, but it is not an issue at all.
CREATE TABLE IF NOT EXISTS erc20_first_transfers
(
    token             String,
    timestamp         DateTime CODEC (DoubleDelta, ZSTD),
    "from"            String,
    "to"              String,
    amount            Int256,
    block_number      UInt32 CODEC (DoubleDelta, ZSTD),
    transaction_index UInt16,
    log_index         UInt16,
    transaction_hash  String
) ENGINE = MergeTree()
ORDER BY token;

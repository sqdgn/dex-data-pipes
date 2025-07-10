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

CREATE TABLE IF NOT EXISTS erc20_transfers_token_gr
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
      PARTITION BY toYYYYMM(timestamp)
      ORDER BY (token, timestamp, transaction_index, log_index)
      TTL timestamp + INTERVAL 90 DAY;

CREATE MATERIALIZED VIEW IF NOT EXISTS erc20_transfers_token_gr_mv TO erc20_transfers_token_gr
AS
SELECT * FROM erc20_transfers;

/*
    -- Query for address' balance history. Replace 0xce78a0f17b9cc018c5f445fb98418ecd77154919 to
    -- address and 0xbf8ad72176bE24F2FFE80a1c6ad0faBe71799FCB to required token.

    WITH cte AS (
        SELECT *
        FROM base_transfers_holders.erc20_transfers_token_gr
        WHERE 1=1
    -- 		uncomment for even faster execution
    --		AND timestamp >= '2025-07-06 07:16:15'	
            AND (`from` = lower('0xce78a0f17b9cc018c5f445fb98418ecd77154919') OR `to` = lower('0xce78a0f17b9cc018c5f445fb98418ecd77154919'))
            AND token = lower('0xbf8ad72176bE24F2FFE80a1c6ad0faBe71799FCB')
            ORDER BY `timestamp` , transaction_index , log_index 
    )
    SELECT
        timestamp,
        sumIf(amount*sign, `to` = lower('0xce78a0f17b9cc018c5f445fb98418ecd77154919')) OVER (ORDER BY timestamp, transaction_index , log_index) -
        sumIf(amount*sign, `from` = lower('0xce78a0f17b9cc018c5f445fb98418ecd77154919')) OVER (ORDER BY timestamp, transaction_index , log_index)
            AS balance--, *
    FROM cte
    ORDER BY `timestamp` DESC, transaction_index DESC, log_index DESC
*/
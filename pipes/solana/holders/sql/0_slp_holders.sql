
CREATE TABLE IF NOT EXISTS slp_holders
(
    timestamp     DateTime CODEC (DoubleDelta, ZSTD),
    token         String,
    holders			  UInt32
) ENGINE = ReplacingMergeTree()
  ORDER BY (token, timestamp) ASC;
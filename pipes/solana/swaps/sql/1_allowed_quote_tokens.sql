-- A function which returns a list of allowed quote token addresses
-- Should match QUOTE_TOKENS const in streams/svm_swaps/utils.ts!
CREATE FUNCTION IF NOT EXISTS allowed_quote_tokens AS () -> tuple(
  'EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v', -- USDC
  'Es9vMFrzaCERmJfrF4H2FYD4KCoNkY11McCe8BenwNYB', -- USDT
  'USDSwr9ApdHk5bvJKMjzff41FfuX8bSxdKcR81vTwcA',  -- USDS
  'So11111111111111111111111111111111111111112'   -- SOL
);
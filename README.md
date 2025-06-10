# SQDGN data pipes

Data pipes based on $SQD that are used by $SQDGN to make informed decisions.

## Currently supported

- Ethereum and Base mainnet
- DEXes: Uniswap, Sushiswap, Aerodrome, RocketSwap, BaseSwap
- Protocols: Uniswap V2/V3/V4, Aerodrome Basic/Slipstream
- Data: Swap prices, trading volumes, swap count, candles

## Configuration

Pipes are configured by env variables – put them into `.env` file or your CI/CD pipeline.

- `NETWORK` – network to process (e.g. ethereum)
- `{NETWORK}_RPC_URL` – JSON RPC URL to query additional data - `{NETWORK}` is substituted by network you'll use
- `CLICKHOUSE_URL`, `CLICKHOUSE_USER`, `CLICKHOUSE_PASSWORD` (optional) – if you want to use other than localhost installation
- `DB_PATH` (optional) – path to SQLite with pools (e.g `./pools-ethereum.db`).
- `PORTAL_URL` (optional) – if you want to specify custom SQD portal URL
- `BLOCK_TO` (optional) – block where to stop processing. Usually used to sync pools first.
- `BLOCK_FROM` (optional) – where start data syncing.

Example: you want to have historical data from block 28620333 on Base to current date.

1. First run pipe with `BLOCK_TO=28620332`, `BLOCK_FROM` omitted. It will sync pools from genesis block up to 28620332.
1. Run pipe `BLOCK_FROM=28620333` and `BLOCK_TO` omitted. This will sync pools and swaps/prices/etc starting from block 28620333.
1. Pipe must be set to auto-restart in your CICD pipeline.

## Run

Configure pipe before run. Now `pipes/evm/swaps/cli.ts` is ready.

```bash
# Install dependencies
yarn install

# Run Clickhouse
docker compose up -d ch

# Run swaps indexing
yarn ts-node pipes/evm/swaps/cli.ts
```

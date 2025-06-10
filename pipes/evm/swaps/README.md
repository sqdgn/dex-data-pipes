```bash
# BASE MAINNET

# Index pools only
BLOCK_FROM=0 BLOCK_TO=24_968_075 NETWORK=base DB_PATH=./metadata/base-pools.sqlite yarn ts-node pipes/evm/swaps/cli.ts

# Index al swaps for last ~2 month
BLOCK_FROM=24_968_076 NETWORK=base DB_PATH=./metadata/base-pools.sqlite yarn ts-node pipes/evm/swaps/cli.ts

```

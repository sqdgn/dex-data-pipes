import { Network } from './networks';
import { ZERO_ADDRESS } from './token_metadata_storage';

export type ReferenceToken = {
  tokenAddress: string;
  poolAddress: string;
};

export type ReferenceTokenWithPrice = ReferenceToken & {
  priceTokenUsdc: number;
  timestamp: number;
};

export const TOKENS = {
  ETH: {
    base: ZERO_ADDRESS,
    ethereum: ZERO_ADDRESS,
  },
  WETH: {
    base: '0x4200000000000000000000000000000000000006',
    ethereum: '0xc02aaa39b223fe8d0a0e5c4f27ead9083c756cc2',
    zora: '0x4200000000000000000000000000000000000006',
    bsc: '0x2170ed0880ac9a755fd29b2688956bd959f933f8',
  },
  USDC: {
    base: '0x833589fcd6edb6e08f4c7c32d4f71b54bda02913',
    ethereum: '0xa0b86991c6218b36c1d19d4a2e9eb0ce3606eb48',
    zora: '0xcccccccc7021b32ebb4e8c08314bd62f7c653ec4',
    bsc: '0x8ac76a51cc950d9822d68b83fe1ad97b32cd580d',
  },
  cbBTC: {
    base: '0xcbb7c0000ab88b473b1f5afd9ef808440eed33bf',
  },
  VIRTUAL: {
    base: '0x0b3e328455c4059eeb9e3f84b5543f74e24e7e1b',
  },
  AERO: {
    base: '0x940181a94a35a4569e4529a3cdfb74e38fd98631',
  },
  ZORA: {
    base: '0x1111111111166b7fe7bd91427724b487980afc69',
  },
  NATIVE: {
    base: '0x20dd04c17afd5c9a8b3f2cdacaa8ee7907385bef',
  },
  USDT: {
    bsc: '0x55d398326f99059ff775485246999027b3197955'
  },
  Imagine: {
    zora: '0x078540eecc8b6d89949c9c7d5e8e91eab64f6696'
  },
  USD1: {
    ethereum: '0x8d0d000ee44948fc98c9b98a4fa4921476f08b0d'
  },
  BNB: {
    bsc: ZERO_ADDRESS
  },
  WBNB: {
    bsc: '0xbb4cdb9cbd36b01bd1cbaebf2de08d9173bc095c'
  }
} as const satisfies { [symbol: string]: { [N in Network]?: `0x${string}` } }

export const MAIN_QUOTE_TOKEN_ADDRESS: Record<Network, string> = {
  base: TOKENS.USDC.base,
  ethereum: TOKENS.USDC.ethereum,
  zora: TOKENS.USDC.zora,
  bsc: TOKENS.USDT.bsc
};

export const POOLS = {
  WETH_USDC: {
    base: '0xd0b53d9277642d899df5c87a3966a349a798f224',
    ethereum: '0x88e6a0c2ddd26feeb64f039a2c41296fcb3f5640',
    zora: '0xbc59f8f3b275aa56a90d13bae7cce5e6e11a3b17',
  },
  WETH_USDT: {
    bsc: '0xf9878a5dd55edc120fde01893ea713a4f032229c'
  },
  ETH_USDC: {
    base: '0x96d4b53a38337a5733179751781178a2613306063c511b78cd02684739288c0a',
    ethereum: '0x21c67e77068de97969ba93d4aab21826d33ca12bb9f565d8496e8fda8a82ca27',
  },
  cbBTC_WETH: {
    base: '0x70acdf2ad0bf2402c957154f944c19ef4e1cbae1',
  },
  VIRTUAL_WETH: {
    base: '0xe31c372a7af875b3b5e0f3713b17ef51556da667',
  },
  AERO_USDC: {
    base: '0x6cdcb1c4a4d1c3c6d054b27ac5b77e89eafb971d',
  },
  ZORA_USDC: {
    base: '0xedc625b74537ee3a10874f53d170e9c17a906b9c',
  },
  NATIVE_WETH: {
    base: '0x4cd15f2bc9533bf6fac4ae33c649f138cb601935',
  },
  USD1_USDC: {
    ethereum: '0x1e1dfff79d95725aaafd6b47af4fbc28d859ce28'
  },
  Imagine_WETH: {
    zora: '0x86c2fd1c99d8b7ff541767a4748b2eb38fd43da8'
  },
  BNB_USDT: {
    bsc: '0xa77d89e40ddd6a57b72ad4a8c55554b2fd6171026c903462a9f9c7be133811a6'
  },
  USDT_WBNB: {
    bsc: '0x47a90A2d92A8367A91EfA1906bFc8c1E05bf10c4'
  },
  USDT_USDC: {
    bsc: '0xf8c7b3c122f31aec155c6beb0c1c78a5e74208358a840cadfbc6129b59391850'
  }
}

// order is important. The first token in the list, then it is more "referency".
// Example: in case of VIRTUAL-WETH, WETH is more fundamental, so it goes earlier.
export const referenceTokens: Record<Network, ReferenceToken[]> = {
  base: [
    {
      tokenAddress: TOKENS.USDC.base,
      poolAddress: POOLS.WETH_USDC.base,
    },
    {
      tokenAddress: TOKENS.ETH.base,
      poolAddress: POOLS.ETH_USDC.base,
    },
    {
      tokenAddress: TOKENS.WETH.base,
      poolAddress: POOLS.WETH_USDC.base,
    },
    {
      tokenAddress: TOKENS.cbBTC.base,
      poolAddress: POOLS.cbBTC_WETH.base,
    },
    {
      tokenAddress: TOKENS.VIRTUAL.base,
      poolAddress: POOLS.VIRTUAL_WETH.base,
    },
    {
      tokenAddress: TOKENS.AERO.base,
      poolAddress: POOLS.AERO_USDC.base,
    },
    {
      tokenAddress: TOKENS.ZORA.base,
      poolAddress: POOLS.ZORA_USDC.base,
    },
    {
      tokenAddress: TOKENS.NATIVE.base,
      poolAddress: POOLS.NATIVE_WETH.base,
    },
  ],
  ethereum: [
    {
      tokenAddress: TOKENS.USDC.ethereum,
      poolAddress: POOLS.WETH_USDC.ethereum,
    },
    {
      tokenAddress: TOKENS.ETH.ethereum,
      poolAddress: POOLS.ETH_USDC.ethereum
    },
    {
      tokenAddress: TOKENS.WETH.ethereum,
      poolAddress: POOLS.WETH_USDC.ethereum,
    },
    {
      tokenAddress: TOKENS.USD1.ethereum,
      poolAddress: POOLS.USD1_USDC.ethereum
    },
  ],
  zora: [
    { tokenAddress: TOKENS.USDC.zora, poolAddress: POOLS.WETH_USDC.zora },
    {
      tokenAddress: TOKENS.WETH.zora,
      poolAddress: POOLS.WETH_USDC.zora,
    },
    {
      tokenAddress: TOKENS.Imagine.zora,
      poolAddress: POOLS.Imagine_WETH.zora,
    },
  ],
  bsc: [
    { tokenAddress: TOKENS.USDT.bsc, poolAddress: POOLS.WETH_USDT.bsc },
    { tokenAddress: TOKENS.WBNB.bsc, poolAddress: POOLS.USDT_WBNB.bsc },
    { tokenAddress: TOKENS.BNB.bsc, poolAddress: POOLS.BNB_USDT.bsc },
    { tokenAddress: TOKENS.WETH.bsc, poolAddress: POOLS.WETH_USDT.bsc },
    { tokenAddress: TOKENS.USDC.bsc, poolAddress: POOLS.USDT_USDC.bsc }
  ]
};

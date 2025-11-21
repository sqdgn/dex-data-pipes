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
export const USDC_TOKEN_ADDRESS: Record<Network, string> = {
  base: '0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913'.toLowerCase(),
  ethereum: '0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48'.toLowerCase(),
  zora: '0xCccCCccc7021b32EBb4e8C08314bD62F7c653EC4'.toLowerCase(),
};

export const USDC_POOL_ADDRESS: Record<Network, string> = {
  base: '0xd0b53d9277642d899df5c87a3966a349a798f224'.toLowerCase(),
  ethereum: '0x88e6A0c2dDD26FEEb64F039a2c41296FcB3f5640'.toLowerCase(),
  zora: '0xbC59f8F3b275AA56A90D13bAE7cCe5e6e11A3b17'.toLowerCase(),
};

// order is important. The first token in the list, then it is more "referency".
// Example: in case of VIRTUAL-WETH, WETH is more fundamental, so it goes earlier.
export const referenceTokens: Record<Network, ReferenceToken[]> = {
  base: [
    {
      tokenAddress: USDC_TOKEN_ADDRESS.base, // USDC
      poolAddress: USDC_POOL_ADDRESS.base,
    },
    {
      tokenAddress: ZERO_ADDRESS, // ETH
      poolAddress:
        '0x96d4b53a38337a5733179751781178a2613306063c511b78cd02684739288c0a'.toLowerCase(), // ETH-USDC Uniswap V4
    },
    {
      tokenAddress: '0x4200000000000000000000000000000000000006', // WETH
      poolAddress: USDC_POOL_ADDRESS.base,
    },
    {
      tokenAddress: '0xcbB7C0000aB88B473b1f5aFd9ef808440eed33Bf'.toLowerCase(), // cbBTC
      poolAddress: '0x70acdf2ad0bf2402c957154f944c19ef4e1cbae1'.toLowerCase(),
    },
    {
      tokenAddress: '0x0b3e328455c4059EEb9e3f84b5543F74E24e7E1b'.toLowerCase(), // VIRTUAL
      poolAddress: '0xE31c372a7Af875b3B5E0F3713B17ef51556da667'.toLowerCase(),
    },
    {
      tokenAddress: '0x940181a94A35A4569E4529A3CDfB74e38FD98631'.toLowerCase(), // AERO
      poolAddress: '0x6cdcb1c4a4d1c3c6d054b27ac5b77e89eafb971d'.toLowerCase(),
    },
    {
      tokenAddress: '0x1111111111166b7FE7bd91427724B487980aFc69'.toLowerCase(), // ZORA
      poolAddress: '0xedc625b74537ee3a10874f53d170e9c17a906b9c'.toLowerCase(),
    },
    {
      tokenAddress: '0x20DD04c17AFD5c9a8b3f2cdacaa8Ee7907385BEF'.toLowerCase(), // NATIVE
      poolAddress: '0x4cd15f2bc9533bf6fac4ae33c649f138cb601935',
    },
  ],
  ethereum: [
    {
      tokenAddress: USDC_TOKEN_ADDRESS.ethereum,
      poolAddress: USDC_POOL_ADDRESS.ethereum,
    },
    {
      tokenAddress: ZERO_ADDRESS, // ETH - native token
      poolAddress: '0x21c67e77068de97969ba93d4aab21826d33ca12bb9f565d8496e8fda8a82ca27', // ETH-USDC Uniswap V4 pool
    },
    {
      tokenAddress: '0xC02aaA39b223FE8D0A0e5C4F27eAD9083C756Cc2'.toLowerCase(), // WETH
      poolAddress: USDC_POOL_ADDRESS.ethereum,
    },
    {
      tokenAddress: '0x8d0D000Ee44948FC98c9B98A4FA4921476f08B0d'.toLowerCase(), // USD1
      poolAddress: '0x1e1dfff79d95725aaafd6b47af4fbc28d859ce28'.toLowerCase(),
    },
  ],
  zora: [
    { tokenAddress: USDC_TOKEN_ADDRESS.zora, poolAddress: USDC_POOL_ADDRESS.zora },
    {
      tokenAddress: '0x4200000000000000000000000000000000000006', // WETH
      poolAddress: USDC_POOL_ADDRESS.zora,
    },
    {
      tokenAddress: '0x078540eECC8b6d89949c9C7d5e8E91eAb64f6696'.toLowerCase(), // Imagine
      poolAddress: '0x86c2Fd1C99D8b7FF541767A4748B2Eb38Fd43dA8'.toLowerCase(),
    },
  ],
};

export const needSwap = (network: Network, token_a: string, token_b: string) => {
  const toEndOfList = (x: number) => (x === -1 ? 1e9 : x);

  const index_a = toEndOfList(
    referenceTokens[network]!.findIndex((rt) => rt.tokenAddress === token_a),
  );
  const index_b = toEndOfList(
    referenceTokens[network]!.findIndex((rt) => rt.tokenAddress === token_b),
  );

  // if token_a is earlier in reference tokens list, then true is returned (need to swap it to become token_b)
  return index_a < index_b;
};

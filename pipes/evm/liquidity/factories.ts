import { DexName, DexProtocol, Network } from 'streams/evm_swaps/networks';

export type FactoryConfig = {
  address: string;
};

export const FactoryConfigs: Partial<
  Record<Network, Partial<Record<DexName, Partial<Record<DexProtocol, FactoryConfig>>>>>
> = {
  base: {
    uniswap: {
      uniswap_v2: {
        address: '0x8909dc15e40173ff4699343b6eb8132c65e18ec6',
      },
      uniswap_v3: {
        address: '0x33128a8fc17869897dce68ed026d694621f6fdfd',
      },
    },
  },
};

export const factoryAddressToDexName = (factoryAddress: string, network?: Network): DexName => {
  const normalizedAddress = factoryAddress.toLowerCase();

  for (const [net, dexes] of Object.entries(FactoryConfigs)) {
    // If network is specified, skip other networks
    if (network && net !== network) continue;
    if (!dexes) continue;

    for (const [dexName, protocols] of Object.entries(dexes)) {
      if (!protocols) continue;

      for (const [protocol, config] of Object.entries(protocols)) {
        if (config?.address?.toLowerCase() === normalizedAddress) {
          return dexName as DexName;
        }
      }
    }
  }

  throw new Error(`Unknown factory address: ${factoryAddress}`);
};

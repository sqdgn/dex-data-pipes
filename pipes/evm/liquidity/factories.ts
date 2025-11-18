import assert from 'assert';
import { DexName, DexProtocol, Network } from 'streams/evm_swaps/networks';

export type FactoryConfig = {
  address: string;
};

export const FactoryConfigs: Partial<
  Record<Network, Partial<Record<DexName, Partial<Record<DexProtocol, FactoryConfig>>>>>
> = {
  base: {
    aerodrome: {
      aerodrome_basic: {
        address: '0x420dd381b31aef6683db6b902084cb0ffece40da',
      },
      aerodrome_slipstream: {
        address: '0x5e7bb104d84c7cb9b682aac2f3d509f5f406809a',
      },
    },
    uniswap: {
      uniswap_v2: {
        address: '0x8909dc15e40173ff4699343b6eb8132c65e18ec6',
      },
      uniswap_v3: {
        address: '0x33128a8fc17869897dce68ed026d694621f6fdfd',
      },
    },
    sushiswap: {
      uniswap_v2: {
        address: '0x71524B4f93c58fcbF659783284E38825f0622859',
      },
      uniswap_v3: {
        address: '0xc35DADB65012eC5796536bD9864eD8773aBc74C4',
      },
    },
    baseswap: {
      uniswap_v2: {
        address: '0xfda619b6d20975be80a10332cd39b9a4b0faa8bb',
      },
    },
    rocketswap: {
      uniswap_v2: {
        address: '0x1B8128c3A1B7D20053D10763ff02466ca7FF99FC',
      },
    },
  },
};

export const getFactoryAddressesByProtocol = (network: Network, protocol: DexProtocol) => {
  const res: string[] = [];
  for (const [net, dexes] of Object.entries(FactoryConfigs)) {
    if (net !== network || !dexes) continue;
    for (const [dexName, protocols] of Object.entries(dexes)) {
      if (!protocols) continue;

      for (const [prot, config] of Object.entries(protocols)) {
        if (prot === protocol) {
          res.push(config.address.toLowerCase());
        }
      }
    }
  }
  assert(getFactoryAddressesByProtocol.length, `no configs for protocol ${protocol}`);
  return res;
};

const factoryToDexNameMap = new Map<string, DexName>();

export const factoryAddressToDexName = (factoryAddress: string, network: Network): DexName => {
  const normalizedAddress = factoryAddress.toLowerCase();

  const key = normalizedAddress + '_' + network;
  const name = factoryToDexNameMap.get(key);
  if (name) {
    return name;
  }

  for (const [net, dexes] of Object.entries(FactoryConfigs)) {
    // If network is specified, skip other networks
    if (net !== network) continue;
    if (!dexes) continue;

    for (const [dexName, protocols] of Object.entries(dexes)) {
      if (!protocols) continue;

      for (const [protocol, config] of Object.entries(protocols)) {
        if (config?.address?.toLowerCase() === normalizedAddress) {
          const res = dexName as DexName;
          factoryToDexNameMap.set(key, res);
          return res;
        }
      }
    }
  }

  throw new Error(`Unknown factory address: ${factoryAddress}`);
};

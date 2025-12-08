import { events as UniswapV3FactoryEvents } from './protocols/uniswap.v3/factory';
import { events as UniswapV3SwapEvents } from './protocols/uniswap.v3/swaps';
import { events as UniswapV2FactoryEvents } from './protocols/uniswap.v2/factory';
import { events as UniswapV2SwapEvents } from './protocols/uniswap.v2/swaps';
import { events as UniswapV4PoolManagerEvents } from './protocols/uniswap.v4/poolManager';
import { events as AerodromeBasicFactoryEvents } from './protocols/aerodrome.basic/factory';
import { events as AerodromeBasicSwapEvents } from './protocols/aerodrome.basic/swaps';
import { events as AerodromeSlipstreamFactoryEvents } from './protocols/aerodrome.slipstream/factory';
import { events as AerodromeSlipstreamSwapEvents } from './protocols/aerodrome.slipstream/swaps';

import { DecodedEvmSwap } from './swap_types';
import { EventRecord } from '@subsquid/evm-abi';
import { handleUniswapV2Swap, handleUniswapV2Pool } from './protocols/uniswap.v2/handle_events';
import { handleUniswapV3Swap, handleUniswapV3Pool } from './protocols/uniswap.v3/handle_events';
import {
  handleAerodromeBasicSwap,
  handleAerodromeBasicPool,
} from './protocols/aerodrome.basic/handle_events';
import {
  handleAerodromeSlipstreamSwap,
  handleAerodromeSlipstreamPool,
} from './protocols/aerodrome.slipstream/handle_events';
import { PoolMetadataSimple } from './pool_metadata_storage';
import { handleUniswapV4Pool, handleUniswapV4Swap } from './protocols/uniswap.v4/handle_events';

export const NetworkValues = ['base', 'ethereum', 'zora'] as const;
export type Network = (typeof NetworkValues)[number];

export const AllDexProtocols = [
  'uniswap_v2',
  'uniswap_v3',
  'uniswap_v4',
  'aerodrome_basic',
  'aerodrome_slipstream',
] as const;

export type DexProtocol = (typeof AllDexProtocols)[number];
export type DexName = 'uniswap' | 'aerodrome' | 'sushiswap' | 'baseswap' | 'rocketswap';

type SwapHandler = (log: any) => DecodedEvmSwap | null;
type SwapEvent = { is: (log: EventRecord) => boolean };
type PoolHandler = (l: any) => PoolMetadataSimple | null;
type ProtocolConfig = {
  pools: any;
  swaps: any;
  swapHandler: SwapHandler;
  poolCreateHandler: PoolHandler;
  swapEvent: SwapEvent;
  factoryAddress: string;
};

const protocol = (
  factoryAddress: string,
  poolCreateEvent: { topic: string },
  poolCreateHandler: PoolHandler,
  swapEvent: SwapEvent & { topic: string },
  swapHandler: SwapHandler,
): ProtocolConfig => ({
  pools: {
    address: [factoryAddress.toLowerCase()],
    topic0: [poolCreateEvent.topic.toLowerCase()],
    transaction: true,
  },
  swaps: {
    topic0: [swapEvent.topic],
    transaction: true,
  },
  swapEvent,
  swapHandler,
  poolCreateHandler,
  factoryAddress: factoryAddress.toLowerCase(),
});

const uniswapV2Protocol = (factoryAddress: string) =>
  protocol(
    factoryAddress,
    UniswapV2FactoryEvents.PairCreated,
    handleUniswapV2Pool,
    UniswapV2SwapEvents.Swap,
    handleUniswapV2Swap,
  );

const uniswapV3Protocol = (factoryAddress: string) =>
  protocol(
    factoryAddress,
    UniswapV3FactoryEvents.PoolCreated,
    handleUniswapV3Pool,
    UniswapV3SwapEvents.Swap,
    handleUniswapV3Swap,
  );

const uniswapV4Protocol = (poolManagerAddress: string) =>
  protocol(
    poolManagerAddress,
    UniswapV4PoolManagerEvents.Initialize,
    handleUniswapV4Pool,
    UniswapV4PoolManagerEvents.Swap,
    handleUniswapV4Swap,
  );

export const NetworksMappings: Record<
  Network,
  Partial<Record<DexName, Partial<Record<DexProtocol, ProtocolConfig>>>>
> = {
  ethereum: {
    uniswap: {
      uniswap_v2: uniswapV2Protocol('0x5C69bEe701ef814a2B6a3EDD4B1652CB9cc5aA6f'), // block 10000835
      uniswap_v3: uniswapV3Protocol('0x1f98431c8ad98523631ae4a59f267346ea31f984'),
      uniswap_v4: uniswapV4Protocol('0x000000000004444c5dc75cB358380D2e3dE08A90'),
    },
    sushiswap: {
      uniswap_v2: uniswapV2Protocol('0xC0AEe478e3658e2610c5F7A4A2E1777cE9e4f2Ac'),
      uniswap_v3: uniswapV3Protocol('0xbACEB8eC6b9355Dfc0269C18bac9d6E2Bdc29C4F'),
    },
  },
  base: {
    uniswap: {
      uniswap_v2: uniswapV2Protocol('0x8909dc15e40173ff4699343b6eb8132c65e18ec6'), // deployed block 6_601_915
      uniswap_v3: uniswapV3Protocol('0x33128a8fc17869897dce68ed026d694621f6fdfd'), // deployed block 1_371_680
      uniswap_v4: uniswapV4Protocol('0x498581ff718922c3f8e6a244956af099b2652b2b'), // block 25350988
    },
    sushiswap: {
      uniswap_v2: uniswapV2Protocol('0x71524B4f93c58fcbF659783284E38825f0622859'),
      uniswap_v3: uniswapV3Protocol('0xc35DADB65012eC5796536bD9864eD8773aBc74C4'),
    },
    baseswap: {
      uniswap_v2: uniswapV2Protocol('0xfda619b6d20975be80a10332cd39b9a4b0faa8bb'),
    },
    rocketswap: {
      uniswap_v2: uniswapV2Protocol('0x1B8128c3A1B7D20053D10763ff02466ca7FF99FC'),
    },
    aerodrome: {
      aerodrome_basic: protocol(
        '0x420dd381b31aef6683db6b902084cb0ffece40da', // deployed block 3_200_559
        AerodromeBasicFactoryEvents.PoolCreated,
        handleAerodromeBasicPool,
        AerodromeBasicSwapEvents.Swap,
        handleAerodromeBasicSwap,
      ),
      aerodrome_slipstream: protocol(
        '0x5e7bb104d84c7cb9b682aac2f3d509f5f406809a', // deployed block 13_843_704
        AerodromeSlipstreamFactoryEvents.PoolCreated,
        handleAerodromeSlipstreamPool,
        AerodromeSlipstreamSwapEvents.Swap,
        handleAerodromeSlipstreamSwap,
      ),
    },
  },
  zora: {
    uniswap: {
      uniswap_v3: uniswapV3Protocol('0x7145F8aeef1f6510E92164038E1B6F8cB2c42Cbb'),
      uniswap_v4: uniswapV4Protocol('0x0575338e4c17006ae181b47900a84404247ca30f'),
    },
  },
};

export const MulticallAddresses: Record<Network, string> = {
  ethereum: '0x5BA1e12693Dc8F9c48aAD8770482f4739bEeD696',
  base: '0xcA11bde05977b3631167028862bE2a173976CA11',
  zora: '0xcA11bde05977b3631167028862bE2a173976CA11',
};

import { InputType, LiqEvent, LiqEventType, RawLiquidityEvent } from './types';
import { token } from 'streams/solana/swaps-stream/handlers';
import assert from 'assert';
import { FactoryEvent } from '@sqd-pipes/pipes/evm';
import { needSwap } from '../../../streams/evm_swaps/reference_tokens';
import { LogFields } from 'node_modules/@sqd-pipes/pipes/dist/portal-client/query/evm';
import { DexName, DexProtocol, Network } from 'streams/evm_swaps/networks';
import { factoryAddressToDexName } from './factories';
import { createDecoders } from './evm_decoder';
import { CompositePipe } from 'node_modules/@subsquid/pipes/dist/core/composite-transformer';
import { convertV2 } from './converters/v2converter';
import { convertV3 } from './converters/v3converter';
import { convertAerodromeBasic } from './converters/aerodromeBasicConverter';
import { convertAerodromeSlipstream } from './converters/aerodromeSlipstreamConverter';

export const createPipeFunc = (network: Network) => {
  return ({ uniswapV2, uniswapV3, aerodromeBasic, aerodromeSlipstream }: InputType) => {
    const v2_res = convertV2(network, { uniswapV2 });
    const v3_res = convertV3(network, { uniswapV3 });
    const basic_res = convertAerodromeBasic(network, { aerodromeBasic });
    const slipstream_res = convertAerodromeSlipstream(network, { aerodromeSlipstream });

    return [...v2_res, ...v3_res, ...basic_res, ...slipstream_res];
  };
};

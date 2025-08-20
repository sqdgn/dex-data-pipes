import { event } from '../../abi.support';
import {
  ClaimVestedEvent as ClaimVestedEvent_,
  CreateVestingEvent as CreateVestingEvent_,
  PoolCreateEvent as PoolCreateEvent_,
  TradeEvent as TradeEvent_,
} from './types';

export type ClaimVestedEvent = ClaimVestedEvent_;

export const ClaimVestedEvent = event(
  {
    d8: '0x15c2725778d3e220',
  },
  ClaimVestedEvent_,
);

export type CreateVestingEvent = CreateVestingEvent_;

export const CreateVestingEvent = event(
  {
    d8: '0x96980bb334d2bf7d',
  },
  CreateVestingEvent_,
);

export type PoolCreateEvent = PoolCreateEvent_;

export const PoolCreateEvent = event(
  {
    d8: '0x97d7e20976a173ae',
  },
  PoolCreateEvent_,
);

export type TradeEvent = TradeEvent_;

export const TradeEvent = event(
  {
    d8: '0xbddb7fd34ee661ee',
  },
  TradeEvent_,
);

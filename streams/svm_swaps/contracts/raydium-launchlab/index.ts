import { ProgramVersion } from '../../types';
export * as v1 from './v1';
export * as v2 from './v2';

export type Version = 'v1' | 'v2';
export const programId = 'LanMV9sAd7wArD4vJFi2qDdfnVhFxYSUg6eADduJ3uj';

export const VERSIONS: ProgramVersion<Version>[] = [
  { name: 'v1', fromBlock: 0, fromTxIdx: 0 },
  { name: 'v2', fromBlock: 360865973, fromTxIdx: 1404 },
];

import * as BPFLoaderUpgradeable from '../../contracts/bpf-loader-upgradeable';
import { SwapStreamInstructionHandler } from '../types';
import { getInstructionD4 } from '../../utils';
import * as meteoraDamm from '../../contracts/meteora-damm';
import * as meteoraDlmm from '../../contracts/meteora-dlmm';
import * as whirlpool from '../../contracts/orca-whirlpool';
import * as raydiumClmm from '../../contracts/raydium-clmm';
import * as raydiumAmm from '../../contracts/raydium-cpmm';
import * as raydiumLaunchlab from '../../contracts/raydium-launchlab';
import * as metaplex from '../../contracts/metaplex';
import * as token from '../../contracts/token-program';
import * as token2022 from '../../contracts/token-2022-program';

const TRACKED_PROGRAMS = [
  meteoraDamm,
  meteoraDlmm,
  whirlpool,
  raydiumClmm,
  raydiumAmm,
  raydiumLaunchlab,
  metaplex,
  token,
  token2022,
  BPFLoaderUpgradeable,
];

export const upgradeHandler: SwapStreamInstructionHandler = {
  check: ({ ins }) =>
    ins.programId === BPFLoaderUpgradeable.programId &&
    getInstructionD4(ins) === BPFLoaderUpgradeable.instructions.upgrade.d4,
  run: ({ block, ins, context: { logger } }) => {
    const decoded = BPFLoaderUpgradeable.instructions.upgrade.decode(ins);
    const program = TRACKED_PROGRAMS.find((p) => p.programId === decoded.accounts.program);
    if (program) {
      const knownUpgrades = 'VERSIONS' in program ? program.VERSIONS : [];
      const knownUpgrade = knownUpgrades.find(
        (u) => u.fromBlock === block.header.number && u.fromTxIdx === ins.transactionIndex,
      );
      if (!knownUpgrade) {
        throw new Error(
          `Program ${program.programId} has been upgraded at ` +
            `block=${block.header.number}, ` +
            `txIdx=${ins.transactionIndex} ` +
            `and may include breaking changes!`,
        );
      } else {
        logger.info(`Program ${program.programId} upgraded to ${knownUpgrade.name}`);
      }
    }
  },
};

import { getInstructionData } from '@subsquid/solana-stream';
import * as metaplex from '../contracts/metaplex';
import { Instruction, SolanaTokenMetadata, SolanaTokenMetadataUpdate } from '../types';
import { getInstructionD1 } from '../utils';
import { Codec, ref, Src, struct, bool } from '@subsquid/borsh';
import { CreateMetadataAccountArgsV3, DataV2 } from '../contracts/metaplex/types';

export const createMetadataInstructions = [
  metaplex.instructions.createMetadataAccount,
  metaplex.instructions.createMetadataAccountV2,
  metaplex.instructions.createMetadataAccountV3,
];

export const updateMetadataInstructions = [
  metaplex.instructions.updateMetadataAccount,
  metaplex.instructions.updateMetadataAccountV2,
];

export const isCreateMetadataInstruction = (ins: Instruction): boolean => {
  const desc = getInstructionD1(ins);
  return (
    ins.programId === metaplex.programId && createMetadataInstructions.some((i) => i.d1 === desc)
  );
};

export const isUpdateMetadataInstruction = (ins: Instruction): boolean => {
  const desc = getInstructionD1(ins);
  return updateMetadataInstructions.some((i) => i.d1 === desc);
};

function decodeCreateMetadataIns(ins: Instruction) {
  switch (getInstructionD1(ins)) {
    case metaplex.instructions.createMetadataAccount.d1: {
      const md = metaplex.instructions.createMetadataAccount.decode(ins);
      return {
        ...md,
        args: md.data.createMetadataAccountArgs,
      };
    }
    case metaplex.instructions.createMetadataAccountV2.d1: {
      const md = metaplex.instructions.createMetadataAccountV2.decode(ins);
      return {
        ...md,
        args: md.data.createMetadataAccountArgsV2,
      };
    }
    case metaplex.instructions.createMetadataAccountV3.d1: {
      const accounts = metaplex.instructions.createMetadataAccountV3.decodeAccounts(ins.accounts);
      // FIXME: Temporary hotfix for 2zro8WArbfdH5nmz1p6x3QAc2ARnpxT4hmHoWJp8iDdAfWELQ5qvfwqkGSU8WYDNqpZt5SCxvxadBqbddwXHhg5e
      // Decoding only the data we're interested in and ignoring the rest
      const src = new Src(getInstructionData(ins));
      src.u8(); // decode d1 and move the pointer
      const CreateMetadataAccountArgsV3Partial: Codec<
        Omit<CreateMetadataAccountArgsV3, 'collectionDetails'>
      > = struct({
        data: ref(() => DataV2),
        isMutable: bool,
        // ignore collectionDetails which are the source of the issue
      });
      const data = CreateMetadataAccountArgsV3Partial.decode(src);
      return {
        accounts,
        args: data,
      };
    }
    default:
      throw new Error('Cannot decode instruction as createMetadataAccount');
  }
}

function decodeUpdateMetadataIns(ins: Instruction) {
  switch (getInstructionD1(ins)) {
    case metaplex.instructions.updateMetadataAccount.d1: {
      const md = metaplex.instructions.updateMetadataAccount.decode(ins);
      return {
        ...md,
        args: md.data.updateMetadataAccountArgs,
      };
    }
    case metaplex.instructions.updateMetadataAccountV2.d1: {
      const md = metaplex.instructions.updateMetadataAccountV2.decode(ins);
      return {
        ...md,
        args: md.data.updateMetadataAccountArgsV2,
      };
    }
    default:
      throw new Error('Cannot decode instruction as updateMetadataAccount');
  }
}

export function handleCreateMetadata(ins: Instruction): SolanaTokenMetadata {
  const md = decodeCreateMetadataIns(ins);
  return {
    metadataAcc: md.accounts.metadata,
    mintAcc: md.accounts.mint,
    name: md.args.data.name,
    symbol: md.args.data.symbol,
    // uri: md.args.data.uri,
    mutable: md.args.isMutable ? 1 : 0,
  };
}

export function handleUpdateMetadata(ins: Instruction): SolanaTokenMetadataUpdate {
  const md = decodeUpdateMetadataIns(ins);
  return {
    metadataAcc: md.accounts.metadata,
    name: md.args.data?.name,
    symbol: md.args.data?.symbol,
    // uri: md.args.data?.uri,
  };
}

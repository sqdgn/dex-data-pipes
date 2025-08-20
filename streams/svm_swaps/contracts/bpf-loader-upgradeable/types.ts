import {Codec, unit, struct, option, address, binary, u64} from '@subsquid/borsh'

export type Uninitialized = undefined

export const Uninitialized: Codec<Uninitialized> = unit

export interface Buffer {
    authorityAddress?: string | undefined
    data: Uint8Array
}

export const Buffer: Codec<Buffer> = struct({
    authorityAddress: option(address),
    data: binary,
})

export interface Program {
    programDataAddress: string
}

export const Program: Codec<Program> = struct({
    programDataAddress: address,
})

export interface ProgramData {
    slot: bigint
    upgradeAuthorityAddress?: string | undefined
    data: Uint8Array
}

export const ProgramData: Codec<ProgramData> = struct({
    slot: u64,
    upgradeAuthorityAddress: option(address),
    data: binary,
})

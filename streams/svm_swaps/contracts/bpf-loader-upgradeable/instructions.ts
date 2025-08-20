import {unit, struct, u32, binary, u64} from '@subsquid/borsh'
import {instruction} from '../abi.support'

export type InitializeBuffer = undefined

export const initializeBuffer = instruction(
    {
        d4: '0x00000000',
    },
    {
        initializeAccount: 0,
        bufferAuthority: 1,
    },
    unit,
)

export interface Write {
    offset: number
    data: Uint8Array
}

export const write = instruction(
    {
        d4: '0x01000000',
    },
    {
        bufferAccountToWrite: 0,
        bufferAuthority: 1,
    },
    struct({
        offset: u32,
        data: binary,
    }),
)

export interface DeployWithMaxDataLen {
    maxDataLen: bigint
}

export const deployWithMaxDataLen = instruction(
    {
        d4: '0x02000000',
    },
    {
        payer: 0,
        programData: 1,
        program: 2,
        bufferAccount: 3,
        rentSysvar: 4,
        clockSysvar: 5,
        systemProgram: 6,
        authority: 7,
    },
    struct({
        maxDataLen: u64,
    }),
)

export type Upgrade = undefined

export const upgrade = instruction(
    {
        d4: '0x03000000',
    },
    {
        programData: 0,
        program: 1,
        bufferAccount: 2,
        spillAccount: 3,
        rentSysvar: 4,
        clockSysvar: 5,
        authority: 6,
    },
    unit,
)

export type SetAuthority = undefined

export const setAuthority = instruction(
    {
        d4: '0x04000000',
    },
    {
        programData: 0,
        currentAuthority: 1,
        newAuthority: 2,
    },
    unit,
)

export type Close = undefined

export const close = instruction(
    {
        d4: '0x05000000',
    },
    {
        closeAccount: 0,
        destinationAccount: 1,
        authority: 2,
        associatedProgram: 3,
    },
    unit,
)

export interface ExtendProgram {
    additionalBytes: number
}

export const extendProgram = instruction(
    {
        d4: '0x06000000',
    },
    {
        programData: 0,
        associatedProgram: 1,
        systemProgram: 2,
        payer: 3,
    },
    struct({
        additionalBytes: u32,
    }),
)

export type SetAuthorityNew = undefined

export const setAuthorityNew = instruction(
    {
        d4: '0x07000000',
    },
    {
        programData: 0,
        currentAuthority: 1,
        newAuthority: 2,
    },
    unit,
)

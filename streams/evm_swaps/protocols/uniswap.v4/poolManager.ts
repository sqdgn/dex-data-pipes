import * as p from '@subsquid/evm-codec'
import { event, fun, viewFun, indexed, ContractBase } from '@subsquid/evm-abi'
import type { EventParams as EParams, FunctionArguments, FunctionReturn } from '@subsquid/evm-abi'

export const events = {
    Approval: event("0xb3fd5071835887567a0671151121894ddccc2842f1d10bedad13e0d17cace9a7", "Approval(address,address,uint256,uint256)", {"owner": indexed(p.address), "spender": indexed(p.address), "id": indexed(p.uint256), "amount": p.uint256}),
    Donate: event("0x29ef05caaff9404b7cb6d1c0e9bbae9eaa7ab2541feba1a9c4248594c08156cb", "Donate(bytes32,address,uint256,uint256)", {"id": indexed(p.bytes32), "sender": indexed(p.address), "amount0": p.uint256, "amount1": p.uint256}),
    Initialize: event("0xdd466e674ea557f56295e2d0218a125ea4b4f0f6f3307b95f85e6110838d6438", "Initialize(bytes32,address,address,uint24,int24,address,uint160,int24)", {"id": indexed(p.bytes32), "currency0": indexed(p.address), "currency1": indexed(p.address), "fee": p.uint24, "tickSpacing": p.int24, "hooks": p.address, "sqrtPriceX96": p.uint160, "tick": p.int24}),
    ModifyLiquidity: event("0xf208f4912782fd25c7f114ca3723a2d5dd6f3bcc3ac8db5af63baa85f711d5ec", "ModifyLiquidity(bytes32,address,int24,int24,int256,bytes32)", {"id": indexed(p.bytes32), "sender": indexed(p.address), "tickLower": p.int24, "tickUpper": p.int24, "liquidityDelta": p.int256, "salt": p.bytes32}),
    OperatorSet: event("0xceb576d9f15e4e200fdb5096d64d5dfd667e16def20c1eefd14256d8e3faa267", "OperatorSet(address,address,bool)", {"owner": indexed(p.address), "operator": indexed(p.address), "approved": p.bool}),
    OwnershipTransferred: event("0x8be0079c531659141344cd1fd0a4f28419497f9722a3daafe3b4186f6b6457e0", "OwnershipTransferred(address,address)", {"user": indexed(p.address), "newOwner": indexed(p.address)}),
    ProtocolFeeControllerUpdated: event("0xb4bd8ef53df690b9943d3318996006dbb82a25f54719d8c8035b516a2a5b8acc", "ProtocolFeeControllerUpdated(address)", {"protocolFeeController": indexed(p.address)}),
    ProtocolFeeUpdated: event("0xe9c42593e71f84403b84352cd168d693e2c9fcd1fdbcc3feb21d92b43e6696f9", "ProtocolFeeUpdated(bytes32,uint24)", {"id": indexed(p.bytes32), "protocolFee": p.uint24}),
    Swap: event("0x40e9cecb9f5f1f1c5b9c97dec2917b7ee92e57ba5563708daca94dd84ad7112f", "Swap(bytes32,address,int128,int128,uint160,uint128,int24,uint24)", {"id": indexed(p.bytes32), "sender": indexed(p.address), "amount0": p.int128, "amount1": p.int128, "sqrtPriceX96": p.uint160, "liquidity": p.uint128, "tick": p.int24, "fee": p.uint24}),
    Transfer: event("0x1b3d7edb2e9c0b0e7c525b20aaaef0f5940d2ed71663c7d39266ecafac728859", "Transfer(address,address,address,uint256,uint256)", {"caller": p.address, "from": indexed(p.address), "to": indexed(p.address), "id": indexed(p.uint256), "amount": p.uint256}),
}

export const functions = {
    allowance: viewFun("0x598af9e7", "allowance(address,address,uint256)", {"owner": p.address, "spender": p.address, "id": p.uint256}, p.uint256),
    approve: fun("0x426a8493", "approve(address,uint256,uint256)", {"spender": p.address, "id": p.uint256, "amount": p.uint256}, p.bool),
    balanceOf: viewFun("0x00fdd58e", "balanceOf(address,uint256)", {"owner": p.address, "id": p.uint256}, p.uint256),
    burn: fun("0xf5298aca", "burn(address,uint256,uint256)", {"from": p.address, "id": p.uint256, "amount": p.uint256}, ),
    clear: fun("0x80f0b44c", "clear(address,uint256)", {"currency": p.address, "amount": p.uint256}, ),
    collectProtocolFees: fun("0x8161b874", "collectProtocolFees(address,address,uint256)", {"recipient": p.address, "currency": p.address, "amount": p.uint256}, p.uint256),
    donate: fun("0x234266d7", "donate((address,address,uint24,int24,address),uint256,uint256,bytes)", {"key": p.struct({"currency0": p.address, "currency1": p.address, "fee": p.uint24, "tickSpacing": p.int24, "hooks": p.address}), "amount0": p.uint256, "amount1": p.uint256, "hookData": p.bytes}, p.int256),
    'extsload(bytes32)': viewFun("0x1e2eaeaf", "extsload(bytes32)", {"slot": p.bytes32}, p.bytes32),
    'extsload(bytes32,uint256)': viewFun("0x35fd631a", "extsload(bytes32,uint256)", {"startSlot": p.bytes32, "nSlots": p.uint256}, p.array(p.bytes32)),
    'extsload(bytes32[])': viewFun("0xdbd035ff", "extsload(bytes32[])", {"slots": p.array(p.bytes32)}, p.array(p.bytes32)),
    'exttload(bytes32[])': viewFun("0x9bf6645f", "exttload(bytes32[])", {"slots": p.array(p.bytes32)}, p.array(p.bytes32)),
    'exttload(bytes32)': viewFun("0xf135baaa", "exttload(bytes32)", {"slot": p.bytes32}, p.bytes32),
    initialize: fun("0x6276cbbe", "initialize((address,address,uint24,int24,address),uint160)", {"key": p.struct({"currency0": p.address, "currency1": p.address, "fee": p.uint24, "tickSpacing": p.int24, "hooks": p.address}), "sqrtPriceX96": p.uint160}, p.int24),
    isOperator: viewFun("0xb6363cf2", "isOperator(address,address)", {"owner": p.address, "operator": p.address}, p.bool),
    mint: fun("0x156e29f6", "mint(address,uint256,uint256)", {"to": p.address, "id": p.uint256, "amount": p.uint256}, ),
    modifyLiquidity: fun("0x5a6bcfda", "modifyLiquidity((address,address,uint24,int24,address),(int24,int24,int256,bytes32),bytes)", {"key": p.struct({"currency0": p.address, "currency1": p.address, "fee": p.uint24, "tickSpacing": p.int24, "hooks": p.address}), "params": p.struct({"tickLower": p.int24, "tickUpper": p.int24, "liquidityDelta": p.int256, "salt": p.bytes32}), "hookData": p.bytes}, {"callerDelta": p.int256, "feesAccrued": p.int256}),
    owner: viewFun("0x8da5cb5b", "owner()", {}, p.address),
    protocolFeeController: viewFun("0xf02de3b2", "protocolFeeController()", {}, p.address),
    protocolFeesAccrued: viewFun("0x97e8cd4e", "protocolFeesAccrued(address)", {"currency": p.address}, p.uint256),
    setOperator: fun("0x558a7297", "setOperator(address,bool)", {"operator": p.address, "approved": p.bool}, p.bool),
    setProtocolFee: fun("0x7e87ce7d", "setProtocolFee((address,address,uint24,int24,address),uint24)", {"key": p.struct({"currency0": p.address, "currency1": p.address, "fee": p.uint24, "tickSpacing": p.int24, "hooks": p.address}), "newProtocolFee": p.uint24}, ),
    setProtocolFeeController: fun("0x2d771389", "setProtocolFeeController(address)", {"controller": p.address}, ),
    settle: fun("0x11da60b4", "settle()", {}, p.uint256),
    settleFor: fun("0x3dd45adb", "settleFor(address)", {"recipient": p.address}, p.uint256),
    supportsInterface: viewFun("0x01ffc9a7", "supportsInterface(bytes4)", {"interfaceId": p.bytes4}, p.bool),
    swap: fun("0xf3cd914c", "swap((address,address,uint24,int24,address),(bool,int256,uint160),bytes)", {"key": p.struct({"currency0": p.address, "currency1": p.address, "fee": p.uint24, "tickSpacing": p.int24, "hooks": p.address}), "params": p.struct({"zeroForOne": p.bool, "amountSpecified": p.int256, "sqrtPriceLimitX96": p.uint160}), "hookData": p.bytes}, p.int256),
    sync: fun("0xa5841194", "sync(address)", {"currency": p.address}, ),
    take: fun("0x0b0d9c09", "take(address,address,uint256)", {"currency": p.address, "to": p.address, "amount": p.uint256}, ),
    transfer: fun("0x095bcdb6", "transfer(address,uint256,uint256)", {"receiver": p.address, "id": p.uint256, "amount": p.uint256}, p.bool),
    transferFrom: fun("0xfe99049a", "transferFrom(address,address,uint256,uint256)", {"sender": p.address, "receiver": p.address, "id": p.uint256, "amount": p.uint256}, p.bool),
    transferOwnership: fun("0xf2fde38b", "transferOwnership(address)", {"newOwner": p.address}, ),
    unlock: fun("0x48c89491", "unlock(bytes)", {"data": p.bytes}, p.bytes),
    updateDynamicLPFee: fun("0x52759651", "updateDynamicLPFee((address,address,uint24,int24,address),uint24)", {"key": p.struct({"currency0": p.address, "currency1": p.address, "fee": p.uint24, "tickSpacing": p.int24, "hooks": p.address}), "newDynamicLPFee": p.uint24}, ),
}

export class Contract extends ContractBase {

    allowance(owner: AllowanceParams["owner"], spender: AllowanceParams["spender"], id: AllowanceParams["id"]) {
        return this.eth_call(functions.allowance, {owner, spender, id})
    }

    balanceOf(owner: BalanceOfParams["owner"], id: BalanceOfParams["id"]) {
        return this.eth_call(functions.balanceOf, {owner, id})
    }

    'extsload(bytes32)'(slot: ExtsloadParams_0["slot"]) {
        return this.eth_call(functions['extsload(bytes32)'], {slot})
    }

    'extsload(bytes32,uint256)'(startSlot: ExtsloadParams_1["startSlot"], nSlots: ExtsloadParams_1["nSlots"]) {
        return this.eth_call(functions['extsload(bytes32,uint256)'], {startSlot, nSlots})
    }

    'extsload(bytes32[])'(slots: ExtsloadParams_2["slots"]) {
        return this.eth_call(functions['extsload(bytes32[])'], {slots})
    }

    'exttload(bytes32[])'(slots: ExttloadParams_0["slots"]) {
        return this.eth_call(functions['exttload(bytes32[])'], {slots})
    }

    'exttload(bytes32)'(slot: ExttloadParams_1["slot"]) {
        return this.eth_call(functions['exttload(bytes32)'], {slot})
    }

    isOperator(owner: IsOperatorParams["owner"], operator: IsOperatorParams["operator"]) {
        return this.eth_call(functions.isOperator, {owner, operator})
    }

    owner() {
        return this.eth_call(functions.owner, {})
    }

    protocolFeeController() {
        return this.eth_call(functions.protocolFeeController, {})
    }

    protocolFeesAccrued(currency: ProtocolFeesAccruedParams["currency"]) {
        return this.eth_call(functions.protocolFeesAccrued, {currency})
    }

    supportsInterface(interfaceId: SupportsInterfaceParams["interfaceId"]) {
        return this.eth_call(functions.supportsInterface, {interfaceId})
    }
}

/// Event types
export type ApprovalEventArgs = EParams<typeof events.Approval>
export type DonateEventArgs = EParams<typeof events.Donate>
export type InitializeEventArgs = EParams<typeof events.Initialize>
export type ModifyLiquidityEventArgs = EParams<typeof events.ModifyLiquidity>
export type OperatorSetEventArgs = EParams<typeof events.OperatorSet>
export type OwnershipTransferredEventArgs = EParams<typeof events.OwnershipTransferred>
export type ProtocolFeeControllerUpdatedEventArgs = EParams<typeof events.ProtocolFeeControllerUpdated>
export type ProtocolFeeUpdatedEventArgs = EParams<typeof events.ProtocolFeeUpdated>
export type SwapEventArgs = EParams<typeof events.Swap>
export type TransferEventArgs = EParams<typeof events.Transfer>

/// Function types
export type AllowanceParams = FunctionArguments<typeof functions.allowance>
export type AllowanceReturn = FunctionReturn<typeof functions.allowance>

export type ApproveParams = FunctionArguments<typeof functions.approve>
export type ApproveReturn = FunctionReturn<typeof functions.approve>

export type BalanceOfParams = FunctionArguments<typeof functions.balanceOf>
export type BalanceOfReturn = FunctionReturn<typeof functions.balanceOf>

export type BurnParams = FunctionArguments<typeof functions.burn>
export type BurnReturn = FunctionReturn<typeof functions.burn>

export type ClearParams = FunctionArguments<typeof functions.clear>
export type ClearReturn = FunctionReturn<typeof functions.clear>

export type CollectProtocolFeesParams = FunctionArguments<typeof functions.collectProtocolFees>
export type CollectProtocolFeesReturn = FunctionReturn<typeof functions.collectProtocolFees>

export type DonateParams = FunctionArguments<typeof functions.donate>
export type DonateReturn = FunctionReturn<typeof functions.donate>

export type ExtsloadParams_0 = FunctionArguments<typeof functions['extsload(bytes32)']>
export type ExtsloadReturn_0 = FunctionReturn<typeof functions['extsload(bytes32)']>

export type ExtsloadParams_1 = FunctionArguments<typeof functions['extsload(bytes32,uint256)']>
export type ExtsloadReturn_1 = FunctionReturn<typeof functions['extsload(bytes32,uint256)']>

export type ExtsloadParams_2 = FunctionArguments<typeof functions['extsload(bytes32[])']>
export type ExtsloadReturn_2 = FunctionReturn<typeof functions['extsload(bytes32[])']>

export type ExttloadParams_0 = FunctionArguments<typeof functions['exttload(bytes32[])']>
export type ExttloadReturn_0 = FunctionReturn<typeof functions['exttload(bytes32[])']>

export type ExttloadParams_1 = FunctionArguments<typeof functions['exttload(bytes32)']>
export type ExttloadReturn_1 = FunctionReturn<typeof functions['exttload(bytes32)']>

export type InitializeParams = FunctionArguments<typeof functions.initialize>
export type InitializeReturn = FunctionReturn<typeof functions.initialize>

export type IsOperatorParams = FunctionArguments<typeof functions.isOperator>
export type IsOperatorReturn = FunctionReturn<typeof functions.isOperator>

export type MintParams = FunctionArguments<typeof functions.mint>
export type MintReturn = FunctionReturn<typeof functions.mint>

export type ModifyLiquidityParams = FunctionArguments<typeof functions.modifyLiquidity>
export type ModifyLiquidityReturn = FunctionReturn<typeof functions.modifyLiquidity>

export type OwnerParams = FunctionArguments<typeof functions.owner>
export type OwnerReturn = FunctionReturn<typeof functions.owner>

export type ProtocolFeeControllerParams = FunctionArguments<typeof functions.protocolFeeController>
export type ProtocolFeeControllerReturn = FunctionReturn<typeof functions.protocolFeeController>

export type ProtocolFeesAccruedParams = FunctionArguments<typeof functions.protocolFeesAccrued>
export type ProtocolFeesAccruedReturn = FunctionReturn<typeof functions.protocolFeesAccrued>

export type SetOperatorParams = FunctionArguments<typeof functions.setOperator>
export type SetOperatorReturn = FunctionReturn<typeof functions.setOperator>

export type SetProtocolFeeParams = FunctionArguments<typeof functions.setProtocolFee>
export type SetProtocolFeeReturn = FunctionReturn<typeof functions.setProtocolFee>

export type SetProtocolFeeControllerParams = FunctionArguments<typeof functions.setProtocolFeeController>
export type SetProtocolFeeControllerReturn = FunctionReturn<typeof functions.setProtocolFeeController>

export type SettleParams = FunctionArguments<typeof functions.settle>
export type SettleReturn = FunctionReturn<typeof functions.settle>

export type SettleForParams = FunctionArguments<typeof functions.settleFor>
export type SettleForReturn = FunctionReturn<typeof functions.settleFor>

export type SupportsInterfaceParams = FunctionArguments<typeof functions.supportsInterface>
export type SupportsInterfaceReturn = FunctionReturn<typeof functions.supportsInterface>

export type SwapParams = FunctionArguments<typeof functions.swap>
export type SwapReturn = FunctionReturn<typeof functions.swap>

export type SyncParams = FunctionArguments<typeof functions.sync>
export type SyncReturn = FunctionReturn<typeof functions.sync>

export type TakeParams = FunctionArguments<typeof functions.take>
export type TakeReturn = FunctionReturn<typeof functions.take>

export type TransferParams = FunctionArguments<typeof functions.transfer>
export type TransferReturn = FunctionReturn<typeof functions.transfer>

export type TransferFromParams = FunctionArguments<typeof functions.transferFrom>
export type TransferFromReturn = FunctionReturn<typeof functions.transferFrom>

export type TransferOwnershipParams = FunctionArguments<typeof functions.transferOwnership>
export type TransferOwnershipReturn = FunctionReturn<typeof functions.transferOwnership>

export type UnlockParams = FunctionArguments<typeof functions.unlock>
export type UnlockReturn = FunctionReturn<typeof functions.unlock>

export type UpdateDynamicLPFeeParams = FunctionArguments<typeof functions.updateDynamicLPFee>
export type UpdateDynamicLPFeeReturn = FunctionReturn<typeof functions.updateDynamicLPFee>


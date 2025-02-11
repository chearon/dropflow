const std = @import("std");

const c = @cImport({
    @cInclude("binaryen-c.h");
});

// https://github.com/WebAssembly/binaryen/blob/9d5628c99e2049cee7d3752914ae837173afcbe1/src/wasm.h
const ExpressionType = enum(c_int) {
    InvalidId = 0,
    BlockId,
    IfId,
    LoopId,
    BreakId,
    SwitchId,
    CallId,
    CallIndirectId,
    LocalGetId,
    LocalSetId,
    GlobalGetId,
    GlobalSetId,
    LoadId,
    StoreId,
    ConstId,
    UnaryId,
    BinaryId,
    SelectId,
    DropId,
    ReturnId,
    MemorySizeId,
    MemoryGrowId,
    NopId,
    UnreachableId,
    AtomicRMWId,
    AtomicCmpxchgId,
    AtomicWaitId,
    AtomicNotifyId,
    AtomicFenceId,
    SIMDExtractId,
    SIMDReplaceId,
    SIMDShuffleId,
    SIMDTernaryId,
    SIMDShiftId,
    SIMDLoadId,
    SIMDLoadStoreLaneId,
    MemoryInitId,
    DataDropId,
    MemoryCopyId,
    MemoryFillId,
    PopId,
    RefNullId,
    RefIsNullId,
    RefFuncId,
    RefEqId,
    TableGetId,
    TableSetId,
    TableSizeId,
    TableGrowId,
    TableFillId,
    TableCopyId,
    TableInitId,
    TryId,
    TryTableId,
    ThrowId,
    RethrowId,
    ThrowRefId,
    TupleMakeId,
    TupleExtractId,
    RefI31Id,
    I31GetId,
    CallRefId,
    RefTestId,
    RefCastId,
    BrOnId,
    StructNewId,
    StructGetId,
    StructSetId,
    StructRMWId,
    StructCmpxchgId,
    ArrayNewId,
    ArrayNewDataId,
    ArrayNewElemId,
    ArrayNewFixedId,
    ArrayGetId,
    ArraySetId,
    ArrayLenId,
    ArrayCopyId,
    ArrayFillId,
    ArrayInitDataId,
    ArrayInitElemId,
    RefAsId,
    StringNewId,
    StringConstId,
    StringMeasureId,
    StringEncodeId,
    StringConcatId,
    StringEqId,
    StringWTF16GetId,
    StringSliceWTFId,
    ContNewId,
    ContBindId,
    SuspendId,
    ResumeId,
    ResumeThrowId,
    // Id for the stack switching `switch`
    StackSwitchId,
    NumExpressionIds,
};

pub fn patchMemoryGrow(module: c.BinaryenModuleRef, ref: c.BinaryenExpressionRef) c.BinaryenExpressionRef {
    const callback = c.BinaryenCall(module, "notify_memory_resize", c.BinaryenTypeNone(), 0, c.BinaryenTypeNone());
    var children: [2]c.BinaryenExpressionRef = .{ ref, callback };
    return c.BinaryenBlock(module, "memory-grow", &children, children.len, c.BinaryenTypeInt32());
}

// Returns the ref if it's a MemoryGrowId, otherwise returns null
pub fn walkAndPatch(module: c.BinaryenModuleRef, ref: c.BinaryenExpressionRef) c.BinaryenExpressionRef {
    if (ref == null) return null;

    switch (@as(ExpressionType, @enumFromInt(c.BinaryenExpressionGetId(ref)))) {
        .MemoryGrowId => {
            if (walkAndPatch(module, c.BinaryenMemoryGrowGetDelta(ref))) |memoryGrowRef| {
                c.BinaryenMemoryGrowSetDelta(ref, patchMemoryGrow(module, memoryGrowRef));
            }
            return ref;
        },
        .BlockId => {
            const n = c.BinaryenBlockGetNumChildren(ref);
            for (0..n) |i| {
                if (walkAndPatch(module, c.BinaryenBlockGetChildAt(ref, @intCast(i)))) |memoryGrowRef| {
                    c.BinaryenBlockSetChildAt(ref, @intCast(i), patchMemoryGrow(module, memoryGrowRef));
                }
            }
        },
        .IfId => {
            if (walkAndPatch(module, c.BinaryenIfGetCondition(ref))) |memoryGrowRef| {
                c.BinaryenIfSetCondition(ref, patchMemoryGrow(module, memoryGrowRef));
            }
            if (walkAndPatch(module, c.BinaryenIfGetIfTrue(ref))) |memoryGrowRef| {
                c.BinaryenIfSetIfTrue(ref, patchMemoryGrow(module, memoryGrowRef));
            }
            if (walkAndPatch(module, c.BinaryenIfGetIfFalse(ref))) |memoryGrowRef| {
                c.BinaryenIfSetIfFalse(ref, patchMemoryGrow(module, memoryGrowRef));
            }
        },
        .LoopId => {
            if (walkAndPatch(module, c.BinaryenLoopGetBody(ref))) |memoryGrowRef| {
                c.BinaryenLoopSetBody(ref, patchMemoryGrow(module, memoryGrowRef));
            }
        },
        .BreakId => {
            if (walkAndPatch(module, c.BinaryenBreakGetCondition(ref))) |memoryGrowRef| {
                c.BinaryenBreakSetCondition(ref, patchMemoryGrow(module, memoryGrowRef));
            }
            if (walkAndPatch(module, c.BinaryenBreakGetValue(ref))) |memoryGrowRef| {
                c.BinaryenBreakSetValue(ref, patchMemoryGrow(module, memoryGrowRef));
            }
        },
        .SwitchId => {
            if (walkAndPatch(module, c.BinaryenSwitchGetCondition(ref))) |memoryGrowRef| {
                c.BinaryenSwitchSetCondition(ref, patchMemoryGrow(module, memoryGrowRef));
            }
            if (walkAndPatch(module, c.BinaryenSwitchGetValue(ref))) |memoryGrowRef| {
                c.BinaryenSwitchSetValue(ref, patchMemoryGrow(module, memoryGrowRef));
            }
        },
        .CallId => {
            const n = c.BinaryenCallGetNumOperands(ref);
            for (0..n) |i| {
                if (walkAndPatch(module, c.BinaryenCallGetOperandAt(ref, @intCast(i)))) |memoryGrowRef| {
                    c.BinaryenCallSetOperandAt(ref, @intCast(i), patchMemoryGrow(module, memoryGrowRef));
                }
            }
        },
        .CallIndirectId => {
            if (walkAndPatch(module, c.BinaryenCallIndirectGetTarget(ref))) |memoryGrowRef| {
                c.BinaryenCallIndirectSetTarget(ref, patchMemoryGrow(module, memoryGrowRef));
            }
            const n = c.BinaryenCallIndirectGetNumOperands(ref);
            for (0..n) |i| {
                if (walkAndPatch(module, c.BinaryenCallIndirectGetOperandAt(ref, @intCast(i)))) |memoryGrowRef| {
                    c.BinaryenCallIndirectSetOperandAt(ref, @intCast(i), patchMemoryGrow(module, memoryGrowRef));
                }
            }
        },
        .LocalSetId => {
            if (walkAndPatch(module, c.BinaryenLocalSetGetValue(ref))) |memoryGrowRef| {
                c.BinaryenLocalSetSetValue(ref, patchMemoryGrow(module, memoryGrowRef));
            }
        },
        .GlobalSetId => {
            if (walkAndPatch(module, c.BinaryenGlobalSetGetValue(ref))) |memoryGrowRef| {
                c.BinaryenGlobalSetSetValue(ref, patchMemoryGrow(module, memoryGrowRef));
            }
        },
        .TableGetId => {
            if (walkAndPatch(module, c.BinaryenTableGetGetIndex(ref))) |memoryGrowRef| {
                c.BinaryenTableGetSetIndex(ref, patchMemoryGrow(module, memoryGrowRef));
            }
        },
        .TableSetId => {
            if (walkAndPatch(module, c.BinaryenTableSetGetIndex(ref))) |memoryGrowRef| {
                c.BinaryenTableSetSetIndex(ref, patchMemoryGrow(module, memoryGrowRef));
            }
            if (walkAndPatch(module, c.BinaryenTableSetGetValue(ref))) |memoryGrowRef| {
                c.BinaryenTableSetSetValue(ref, patchMemoryGrow(module, memoryGrowRef));
            }
        },
        .TableGrowId => {
            if (walkAndPatch(module, c.BinaryenTableGrowGetValue(ref))) |memoryGrowRef| {
                c.BinaryenTableGrowSetValue(ref, patchMemoryGrow(module, memoryGrowRef));
            }
            if (walkAndPatch(module, c.BinaryenTableGrowGetDelta(ref))) |memoryGrowRef| {
                c.BinaryenTableGrowSetDelta(ref, patchMemoryGrow(module, memoryGrowRef));
            }
        },
        .LoadId => {
            if (walkAndPatch(module, c.BinaryenLoadGetPtr(ref))) |memoryGrowRef| {
                c.BinaryenLoadSetPtr(ref, patchMemoryGrow(module, memoryGrowRef));
            }
        },
        .StoreId => {
            if (walkAndPatch(module, c.BinaryenStoreGetPtr(ref))) |memoryGrowRef| {
                c.BinaryenStoreSetPtr(ref, patchMemoryGrow(module, memoryGrowRef));
            }
            if (walkAndPatch(module, c.BinaryenStoreGetValue(ref))) |memoryGrowRef| {
                c.BinaryenStoreSetValue(ref, patchMemoryGrow(module, memoryGrowRef));
            }
        },
        .UnaryId => {
            if (walkAndPatch(module, c.BinaryenUnaryGetValue(ref))) |memoryGrowRef| {
                c.BinaryenUnarySetValue(ref, patchMemoryGrow(module, memoryGrowRef));
            }
        },
        .BinaryId => {
            if (walkAndPatch(module, c.BinaryenBinaryGetLeft(ref))) |memoryGrowRef| {
                c.BinaryenBinarySetLeft(ref, patchMemoryGrow(module, memoryGrowRef));
            }
            if (walkAndPatch(module, c.BinaryenBinaryGetRight(ref))) |memoryGrowRef| {
                c.BinaryenBinarySetRight(ref, patchMemoryGrow(module, memoryGrowRef));
            }
        },
        .SelectId => {
            if (walkAndPatch(module, c.BinaryenSelectGetCondition(ref))) |memoryGrowRef| {
                c.BinaryenSelectSetCondition(ref, patchMemoryGrow(module, memoryGrowRef));
            }
            if (walkAndPatch(module, c.BinaryenSelectGetIfTrue(ref))) |memoryGrowRef| {
                c.BinaryenSelectSetIfTrue(ref, patchMemoryGrow(module, memoryGrowRef));
            }
            if (walkAndPatch(module, c.BinaryenSelectGetIfFalse(ref))) |memoryGrowRef| {
                c.BinaryenSelectSetIfFalse(ref, patchMemoryGrow(module, memoryGrowRef));
            }
        },
        .DropId => {
            if (walkAndPatch(module, c.BinaryenDropGetValue(ref))) |memoryGrowRef| {
                c.BinaryenDropSetValue(ref, patchMemoryGrow(module, memoryGrowRef));
            }
        },
        .ReturnId => {
            if (walkAndPatch(module, c.BinaryenReturnGetValue(ref))) |memoryGrowRef| {
                c.BinaryenReturnSetValue(ref, patchMemoryGrow(module, memoryGrowRef));
            }
        },
        .AtomicRMWId => {
            if (walkAndPatch(module, c.BinaryenAtomicRMWGetPtr(ref))) |memoryGrowRef| {
                c.BinaryenAtomicRMWSetPtr(ref, patchMemoryGrow(module, memoryGrowRef));
            }
            if (walkAndPatch(module, c.BinaryenAtomicRMWGetValue(ref))) |memoryGrowRef| {
                c.BinaryenAtomicRMWSetValue(ref, patchMemoryGrow(module, memoryGrowRef));
            }
        },
        .AtomicCmpxchgId => {
            if (walkAndPatch(module, c.BinaryenAtomicCmpxchgGetPtr(ref))) |memoryGrowRef| {
                c.BinaryenAtomicCmpxchgSetPtr(ref, patchMemoryGrow(module, memoryGrowRef));
            }
            if (walkAndPatch(module, c.BinaryenAtomicCmpxchgGetExpected(ref))) |memoryGrowRef| {
                c.BinaryenAtomicCmpxchgSetExpected(ref, patchMemoryGrow(module, memoryGrowRef));
            }
            if (walkAndPatch(module, c.BinaryenAtomicCmpxchgGetReplacement(ref))) |memoryGrowRef| {
                c.BinaryenAtomicCmpxchgSetReplacement(ref, patchMemoryGrow(module, memoryGrowRef));
            }
        },
        .AtomicWaitId => {
            if (walkAndPatch(module, c.BinaryenAtomicWaitGetPtr(ref))) |memoryGrowRef| {
                c.BinaryenAtomicWaitSetPtr(ref, patchMemoryGrow(module, memoryGrowRef));
            }
            if (walkAndPatch(module, c.BinaryenAtomicWaitGetExpected(ref))) |memoryGrowRef| {
                c.BinaryenAtomicWaitSetExpected(ref, patchMemoryGrow(module, memoryGrowRef));
            }
            if (walkAndPatch(module, c.BinaryenAtomicWaitGetTimeout(ref))) |memoryGrowRef| {
                c.BinaryenAtomicWaitSetTimeout(ref, patchMemoryGrow(module, memoryGrowRef));
            }
        },
        .AtomicNotifyId => {
            if (walkAndPatch(module, c.BinaryenAtomicNotifyGetPtr(ref))) |memoryGrowRef| {
                c.BinaryenAtomicNotifySetPtr(ref, patchMemoryGrow(module, memoryGrowRef));
            }
            if (walkAndPatch(module, c.BinaryenAtomicNotifyGetNotifyCount(ref))) |memoryGrowRef| {
                c.BinaryenAtomicNotifySetNotifyCount(ref, patchMemoryGrow(module, memoryGrowRef));
            }
        },
        .SIMDExtractId => {
            if (walkAndPatch(module, c.BinaryenSIMDExtractGetVec(ref))) |memoryGrowRef| {
                c.BinaryenSIMDExtractSetVec(ref, patchMemoryGrow(module, memoryGrowRef));
            }
        },
        .SIMDReplaceId => {
            if (walkAndPatch(module, c.BinaryenSIMDReplaceGetVec(ref))) |memoryGrowRef| {
                c.BinaryenSIMDReplaceSetVec(ref, patchMemoryGrow(module, memoryGrowRef));
            }
            if (walkAndPatch(module, c.BinaryenSIMDReplaceGetValue(ref))) |memoryGrowRef| {
                c.BinaryenSIMDReplaceSetValue(ref, patchMemoryGrow(module, memoryGrowRef));
            }
        },
        .SIMDShuffleId => {
            if (walkAndPatch(module, c.BinaryenSIMDShuffleGetLeft(ref))) |memoryGrowRef| {
                c.BinaryenSIMDShuffleSetLeft(ref, patchMemoryGrow(module, memoryGrowRef));
            }
            if (walkAndPatch(module, c.BinaryenSIMDShuffleGetRight(ref))) |memoryGrowRef| {
                c.BinaryenSIMDShuffleSetRight(ref, patchMemoryGrow(module, memoryGrowRef));
            }
        },
        .SIMDTernaryId => {
            if (walkAndPatch(module, c.BinaryenSIMDTernaryGetA(ref))) |memoryGrowRef| {
                c.BinaryenSIMDTernarySetA(ref, patchMemoryGrow(module, memoryGrowRef));
            }
            if (walkAndPatch(module, c.BinaryenSIMDTernaryGetB(ref))) |memoryGrowRef| {
                c.BinaryenSIMDTernarySetB(ref, patchMemoryGrow(module, memoryGrowRef));
            }
            if (walkAndPatch(module, c.BinaryenSIMDTernaryGetC(ref))) |memoryGrowRef| {
                c.BinaryenSIMDTernarySetC(ref, patchMemoryGrow(module, memoryGrowRef));
            }
        },
        .SIMDShiftId => {
            if (walkAndPatch(module, c.BinaryenSIMDShiftGetVec(ref))) |memoryGrowRef| {
                c.BinaryenSIMDShiftSetVec(ref, patchMemoryGrow(module, memoryGrowRef));
            }
            if (walkAndPatch(module, c.BinaryenSIMDShiftGetShift(ref))) |memoryGrowRef| {
                c.BinaryenSIMDShiftSetShift(ref, patchMemoryGrow(module, memoryGrowRef));
            }
        },
        .SIMDLoadId => {
            if (walkAndPatch(module, c.BinaryenSIMDLoadGetPtr(ref))) |memoryGrowRef| {
                c.BinaryenSIMDLoadSetPtr(ref, patchMemoryGrow(module, memoryGrowRef));
            }
        },
        .SIMDLoadStoreLaneId => {
            if (walkAndPatch(module, c.BinaryenSIMDLoadStoreLaneGetPtr(ref))) |memoryGrowRef| {
                c.BinaryenSIMDLoadStoreLaneSetPtr(ref, patchMemoryGrow(module, memoryGrowRef));
            }
            if (walkAndPatch(module, c.BinaryenSIMDLoadStoreLaneGetVec(ref))) |memoryGrowRef| {
                c.BinaryenSIMDLoadStoreLaneSetVec(ref, patchMemoryGrow(module, memoryGrowRef));
            }
        },
        .MemoryInitId => {
            if (walkAndPatch(module, c.BinaryenMemoryInitGetDest(ref))) |memoryGrowRef| {
                c.BinaryenMemoryInitSetDest(ref, patchMemoryGrow(module, memoryGrowRef));
            }
            if (walkAndPatch(module, c.BinaryenMemoryInitGetOffset(ref))) |memoryGrowRef| {
                c.BinaryenMemoryInitSetOffset(ref, patchMemoryGrow(module, memoryGrowRef));
            }
            if (walkAndPatch(module, c.BinaryenMemoryInitGetSize(ref))) |memoryGrowRef| {
                c.BinaryenMemoryInitSetSize(ref, patchMemoryGrow(module, memoryGrowRef));
            }
        },
        .MemoryCopyId => {
            if (walkAndPatch(module, c.BinaryenMemoryCopyGetDest(ref))) |memoryGrowRef| {
                c.BinaryenMemoryCopySetDest(ref, patchMemoryGrow(module, memoryGrowRef));
            }
            if (walkAndPatch(module, c.BinaryenMemoryCopyGetSource(ref))) |memoryGrowRef| {
                c.BinaryenMemoryCopySetSource(ref, patchMemoryGrow(module, memoryGrowRef));
            }
            if (walkAndPatch(module, c.BinaryenMemoryCopyGetSize(ref))) |memoryGrowRef| {
                c.BinaryenMemoryCopySetSize(ref, patchMemoryGrow(module, memoryGrowRef));
            }
        },
        .MemoryFillId => {
            if (walkAndPatch(module, c.BinaryenMemoryFillGetDest(ref))) |memoryGrowRef| {
                c.BinaryenMemoryFillSetDest(ref, patchMemoryGrow(module, memoryGrowRef));
            }
            if (walkAndPatch(module, c.BinaryenMemoryFillGetValue(ref))) |memoryGrowRef| {
                c.BinaryenMemoryFillSetValue(ref, patchMemoryGrow(module, memoryGrowRef));
            }
            if (walkAndPatch(module, c.BinaryenMemoryFillGetSize(ref))) |memoryGrowRef| {
                c.BinaryenMemoryFillSetSize(ref, patchMemoryGrow(module, memoryGrowRef));
            }
        },
        .RefIsNullId => {
            if (walkAndPatch(module, c.BinaryenRefIsNullGetValue(ref))) |memoryGrowRef| {
                c.BinaryenRefIsNullSetValue(ref, patchMemoryGrow(module, memoryGrowRef));
            }
        },
        .RefAsId => {
            if (walkAndPatch(module, c.BinaryenRefAsGetValue(ref))) |memoryGrowRef| {
                c.BinaryenRefAsSetValue(ref, patchMemoryGrow(module, memoryGrowRef));
            }
        },
        .RefEqId => {
            if (walkAndPatch(module, c.BinaryenRefEqGetLeft(ref))) |memoryGrowRef| {
                c.BinaryenRefEqSetLeft(ref, patchMemoryGrow(module, memoryGrowRef));
            }
            if (walkAndPatch(module, c.BinaryenRefEqGetRight(ref))) |memoryGrowRef| {
                c.BinaryenRefEqSetRight(ref, patchMemoryGrow(module, memoryGrowRef));
            }
        },
        .TryId => {
            if (walkAndPatch(module, c.BinaryenTryGetBody(ref))) |memoryGrowRef| {
                c.BinaryenTrySetBody(ref, patchMemoryGrow(module, memoryGrowRef));
            }
            const n = c.BinaryenTryGetNumCatchBodies(ref);
            for (0..n) |i| {
                if (walkAndPatch(module, c.BinaryenTryGetCatchBodyAt(ref, @intCast(i)))) |memoryGrowRef| {
                    c.BinaryenTrySetCatchBodyAt(ref, @intCast(i), patchMemoryGrow(module, memoryGrowRef));
                }
            }
        },
        .ThrowId => {
            const n = c.BinaryenThrowGetNumOperands(ref);
            for (0..n) |i| {
                if (walkAndPatch(module, c.BinaryenThrowGetOperandAt(ref, @intCast(i)))) |memoryGrowRef| {
                    c.BinaryenThrowSetOperandAt(ref, @intCast(i), patchMemoryGrow(module, memoryGrowRef));
                }
            }
        },
        .TupleMakeId => {
            const n = c.BinaryenTupleMakeGetNumOperands(ref);
            for (0..n) |i| {
                if (walkAndPatch(module, c.BinaryenTupleMakeGetOperandAt(ref, @intCast(i)))) |memoryGrowRef| {
                    c.BinaryenTupleMakeSetOperandAt(ref, @intCast(i), patchMemoryGrow(module, memoryGrowRef));
                }
            }
        },
        .TupleExtractId => {
            if (walkAndPatch(module, c.BinaryenTupleExtractGetTuple(ref))) |memoryGrowRef| {
                c.BinaryenTupleExtractSetTuple(ref, patchMemoryGrow(module, memoryGrowRef));
            }
        },
        .RefI31Id => {
            if (walkAndPatch(module, c.BinaryenRefI31GetValue(ref))) |memoryGrowRef| {
                c.BinaryenRefI31SetValue(ref, patchMemoryGrow(module, memoryGrowRef));
            }
        },
        .I31GetId => {
            if (walkAndPatch(module, c.BinaryenI31GetGetI31(ref))) |memoryGrowRef| {
                c.BinaryenI31GetSetI31(ref, patchMemoryGrow(module, memoryGrowRef));
            }
        },
        .CallRefId => {
            if (walkAndPatch(module, c.BinaryenCallRefGetTarget(ref))) |memoryGrowRef| {
                c.BinaryenCallRefSetTarget(ref, patchMemoryGrow(module, memoryGrowRef));
            }
            const n = c.BinaryenCallRefGetNumOperands(ref);
            for (0..n) |i| {
                if (walkAndPatch(module, c.BinaryenCallRefGetOperandAt(ref, @intCast(i)))) |memoryGrowRef| {
                    c.BinaryenCallRefSetOperandAt(ref, @intCast(i), patchMemoryGrow(module, memoryGrowRef));
                }
            }
        },
        .RefTestId => {
            if (walkAndPatch(module, c.BinaryenRefTestGetRef(ref))) |memoryGrowRef| {
                c.BinaryenRefTestSetRef(ref, patchMemoryGrow(module, memoryGrowRef));
            }
        },
        .RefCastId => {
            if (walkAndPatch(module, c.BinaryenRefCastGetRef(ref))) |memoryGrowRef| {
                c.BinaryenRefCastSetRef(ref, patchMemoryGrow(module, memoryGrowRef));
            }
        },
        .BrOnId => {
            if (walkAndPatch(module, c.BinaryenBrOnGetRef(ref))) |memoryGrowRef| {
                c.BinaryenBrOnSetRef(ref, patchMemoryGrow(module, memoryGrowRef));
            }
        },
        .StructNewId => {
            const n = c.BinaryenStructNewGetNumOperands(ref);
            for (0..n) |i| {
                if (walkAndPatch(module, c.BinaryenStructNewGetOperandAt(ref, @intCast(i)))) |memoryGrowRef| {
                    c.BinaryenStructNewSetOperandAt(ref, @intCast(i), patchMemoryGrow(module, memoryGrowRef));
                }
            }
        },
        .StructGetId => {
            if (walkAndPatch(module, c.BinaryenStructGetGetRef(ref))) |memoryGrowRef| {
                c.BinaryenStructGetSetRef(ref, patchMemoryGrow(module, memoryGrowRef));
            }
        },
        .StructSetId => {
            if (walkAndPatch(module, c.BinaryenStructSetGetRef(ref))) |memoryGrowRef| {
                c.BinaryenStructSetSetRef(ref, patchMemoryGrow(module, memoryGrowRef));
            }
            if (walkAndPatch(module, c.BinaryenStructSetGetValue(ref))) |memoryGrowRef| {
                c.BinaryenStructSetSetValue(ref, patchMemoryGrow(module, memoryGrowRef));
            }
        },
        .ArrayNewId => {
            if (walkAndPatch(module, c.BinaryenArrayNewGetInit(ref))) |memoryGrowRef| {
                c.BinaryenArrayNewSetInit(ref, patchMemoryGrow(module, memoryGrowRef));
            }
            if (walkAndPatch(module, c.BinaryenArrayNewGetSize(ref))) |memoryGrowRef| {
                c.BinaryenArrayNewSetSize(ref, patchMemoryGrow(module, memoryGrowRef));
            }
        },
        .ArrayNewFixedId => {
            const n = c.BinaryenArrayNewFixedGetNumValues(ref);
            for (0..n) |i| {
                if (walkAndPatch(module, c.BinaryenArrayNewFixedGetValueAt(ref, @intCast(i)))) |memoryGrowRef| {
                    c.BinaryenArrayNewFixedSetValueAt(ref, @intCast(i), patchMemoryGrow(module, memoryGrowRef));
                }
            }
        },
        .ArrayGetId => {
            if (walkAndPatch(module, c.BinaryenArrayGetGetRef(ref))) |memoryGrowRef| {
                c.BinaryenArrayGetSetRef(ref, patchMemoryGrow(module, memoryGrowRef));
            }
            if (walkAndPatch(module, c.BinaryenArrayGetGetIndex(ref))) |memoryGrowRef| {
                c.BinaryenArrayGetSetIndex(ref, patchMemoryGrow(module, memoryGrowRef));
            }
        },
        .ArraySetId => {
            if (walkAndPatch(module, c.BinaryenArraySetGetRef(ref))) |memoryGrowRef| {
                c.BinaryenArraySetSetRef(ref, patchMemoryGrow(module, memoryGrowRef));
            }
            if (walkAndPatch(module, c.BinaryenArraySetGetIndex(ref))) |memoryGrowRef| {
                c.BinaryenArraySetSetIndex(ref, patchMemoryGrow(module, memoryGrowRef));
            }
            if (walkAndPatch(module, c.BinaryenArraySetGetValue(ref))) |memoryGrowRef| {
                c.BinaryenArraySetSetValue(ref, patchMemoryGrow(module, memoryGrowRef));
            }
        },
        .ArrayLenId => {
            if (walkAndPatch(module, c.BinaryenArrayLenGetRef(ref))) |memoryGrowRef| {
                c.BinaryenArrayLenSetRef(ref, patchMemoryGrow(module, memoryGrowRef));
            }
        },
        .ArrayCopyId => {
            if (walkAndPatch(module, c.BinaryenArrayCopyGetDestRef(ref))) |memoryGrowRef| {
                c.BinaryenArrayCopySetDestRef(ref, patchMemoryGrow(module, memoryGrowRef));
            }
            if (walkAndPatch(module, c.BinaryenArrayCopyGetDestIndex(ref))) |memoryGrowRef| {
                c.BinaryenArrayCopySetDestIndex(ref, patchMemoryGrow(module, memoryGrowRef));
            }
            if (walkAndPatch(module, c.BinaryenArrayCopyGetSrcRef(ref))) |memoryGrowRef| {
                c.BinaryenArrayCopySetSrcRef(ref, patchMemoryGrow(module, memoryGrowRef));
            }
            if (walkAndPatch(module, c.BinaryenArrayCopyGetSrcIndex(ref))) |memoryGrowRef| {
                c.BinaryenArrayCopySetSrcIndex(ref, patchMemoryGrow(module, memoryGrowRef));
            }
            if (walkAndPatch(module, c.BinaryenArrayCopyGetLength(ref))) |memoryGrowRef| {
                c.BinaryenArrayCopySetLength(ref, patchMemoryGrow(module, memoryGrowRef));
            }
        },
        .StringNewId => {
            if (walkAndPatch(module, c.BinaryenStringNewGetRef(ref))) |memoryGrowRef| {
                c.BinaryenStringNewSetRef(ref, patchMemoryGrow(module, memoryGrowRef));
            }
            if (walkAndPatch(module, c.BinaryenStringNewGetStart(ref))) |memoryGrowRef| {
                c.BinaryenStringNewSetStart(ref, patchMemoryGrow(module, memoryGrowRef));
            }
            if (walkAndPatch(module, c.BinaryenStringNewGetEnd(ref))) |memoryGrowRef| {
                c.BinaryenStringNewSetEnd(ref, patchMemoryGrow(module, memoryGrowRef));
            }
        },
        .StringMeasureId => {
            if (walkAndPatch(module, c.BinaryenStringMeasureGetRef(ref))) |memoryGrowRef| {
                c.BinaryenStringMeasureSetRef(ref, patchMemoryGrow(module, memoryGrowRef));
            }
        },
        .StringEncodeId => {
            if (walkAndPatch(module, c.BinaryenStringEncodeGetStr(ref))) |memoryGrowRef| {
                c.BinaryenStringEncodeSetStr(ref, patchMemoryGrow(module, memoryGrowRef));
            }
            if (walkAndPatch(module, c.BinaryenStringEncodeGetArray(ref))) |memoryGrowRef| {
                c.BinaryenStringEncodeSetArray(ref, patchMemoryGrow(module, memoryGrowRef));
            }
            if (walkAndPatch(module, c.BinaryenStringEncodeGetStart(ref))) |memoryGrowRef| {
                c.BinaryenStringEncodeSetStart(ref, patchMemoryGrow(module, memoryGrowRef));
            }
        },
        .StringConcatId => {
            if (walkAndPatch(module, c.BinaryenStringConcatGetLeft(ref))) |memoryGrowRef| {
                c.BinaryenStringConcatSetLeft(ref, patchMemoryGrow(module, memoryGrowRef));
            }
            if (walkAndPatch(module, c.BinaryenStringConcatGetRight(ref))) |memoryGrowRef| {
                c.BinaryenStringConcatSetRight(ref, patchMemoryGrow(module, memoryGrowRef));
            }
        },
        .StringEqId => {
            if (walkAndPatch(module, c.BinaryenStringEqGetLeft(ref))) |memoryGrowRef| {
                c.BinaryenStringEqSetLeft(ref, patchMemoryGrow(module, memoryGrowRef));
            }
            if (walkAndPatch(module, c.BinaryenStringEqGetRight(ref))) |memoryGrowRef| {
                c.BinaryenStringEqSetRight(ref, patchMemoryGrow(module, memoryGrowRef));
            }
        },
        .StringWTF16GetId => {
            if (walkAndPatch(module, c.BinaryenStringWTF16GetGetRef(ref))) |memoryGrowRef| {
                c.BinaryenStringWTF16GetSetRef(ref, patchMemoryGrow(module, memoryGrowRef));
            }
            if (walkAndPatch(module, c.BinaryenStringWTF16GetGetPos(ref))) |memoryGrowRef| {
                c.BinaryenStringWTF16GetSetPos(ref, patchMemoryGrow(module, memoryGrowRef));
            }
        },
        .StringSliceWTFId => {
            if (walkAndPatch(module, c.BinaryenStringSliceWTFGetRef(ref))) |memoryGrowRef| {
                c.BinaryenStringSliceWTFSetRef(ref, patchMemoryGrow(module, memoryGrowRef));
            }
            if (walkAndPatch(module, c.BinaryenStringSliceWTFGetStart(ref))) |memoryGrowRef| {
                c.BinaryenStringSliceWTFSetStart(ref, patchMemoryGrow(module, memoryGrowRef));
            }
            if (walkAndPatch(module, c.BinaryenStringSliceWTFGetEnd(ref))) |memoryGrowRef| {
                c.BinaryenStringSliceWTFSetEnd(ref, patchMemoryGrow(module, memoryGrowRef));
            }
        },
        else => {},
    }

    return null;
}

pub fn main() !void {
    const allocator = std.heap.page_allocator;
    var argsIterator = try std.process.ArgIterator.initWithAllocator(allocator);
    _ = argsIterator.skip();
    const infile = argsIterator.next();
    const outfile = argsIterator.next();

    if (infile == null or outfile == null) return;

    // These values were copied from emscripten
    c.BinaryenSetShrinkLevel(2);
    c.BinaryenSetOptimizeLevel(2);
    c.BinaryenSetLowMemoryUnused(true);
    c.BinaryenSetZeroFilledMemory(true);
    c.BinaryenSetGenerateStackIR(false);
    c.BinaryenSetPassArgument("directize-initial-contents-immutable", "");

    var file = try std.fs.openFileAbsolute(infile.?, .{});
    const input = try file.readToEndAlloc(std.heap.page_allocator, std.math.maxInt(usize));
    file.close();

    // Also copied from emscripten
    const module = c.BinaryenModuleReadWithFeatures(input.ptr, input.len, c.BinaryenFeatureMVP() |
        c.BinaryenFeatureBulkMemory() |
        c.BinaryenFeatureMultivalue() |
        c.BinaryenFeatureMutableGlobals() |
        c.BinaryenFeatureNontrappingFPToInt() |
        c.BinaryenFeatureReferenceTypes() |
        c.BinaryenFeatureSignExt() |
        1 << 19 // FeatureSet:BulkMemoryOpt. TODO: why isn't it in the C api? errors without this
    );

    c.BinaryenModuleOptimize(module);

    c.BinaryenAddFunctionImport(module, "notify_memory_resize", "env", "notify_memory_resize", c.BinaryenTypeNone(), c.BinaryenTypeNone());

    const n = c.BinaryenGetNumFunctions(module);
    for (0..n) |i| {
        const func = c.BinaryenGetFunctionByIndex(module, @intCast(i));
        if (func != null) _ = walkAndPatch(module, c.BinaryenFunctionGetBody(func));
    }

    const output = try std.heap.page_allocator.alloc(u8, input.len * 2);
    const out_len = c.BinaryenModuleWrite(module, output.ptr, output.len);

    file = try std.fs.createFileAbsolute(outfile.?, .{});
    _ = try file.write(output[0..out_len]);
    file.close();
}

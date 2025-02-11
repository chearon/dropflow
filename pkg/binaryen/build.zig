const std = @import("std");

pub fn getEmbeddedIntrinsics(
    b: *std.Build,
    upstream: *std.Build.Dependency,
) ![]u8 {
    var text = std.ArrayList(u8).init(b.allocator);
    var buffer: [1024 * 64]u8 = undefined;
    var hex: [6]u8 = undefined;
    const path = upstream.path("src/passes/wasm-intrinsics.wat");
    var file = try std.fs.openFileAbsolute(path.getPath(b), .{});
    defer file.close();
    while (true) {
        const len = try file.readAll(&buffer);
        if (len == 0) break;
        for (buffer[0..len]) |c| {
            try text.appendSlice(try std.fmt.bufPrint(&hex, "0x{x}, ", .{c}));
        }
    }
    _ = text.pop(); // comma
    _ = text.pop(); // space

    return text.toOwnedSlice();
}

pub fn build(b: *std.Build) !void {
    const binaryen = b.addStaticLibrary(.{
        .name = "binaryen",
        .target = b.resolveTargetQuery(.{}), // native
        .optimize = .ReleaseFast,
    });

    const upstream = b.dependency("binaryen", .{});

    const str = try getEmbeddedIntrinsics(b, upstream);
    // TODO: when do I do this?
    // defer b.allocator.free(str);

    binaryen.addIncludePath(upstream.path("."));
    binaryen.addIncludePath(upstream.path("src"));

    binaryen.addSystemIncludePath(upstream.path("third_party/FP16/include"));

    const config = b.addConfigHeader(.{
        .style = .{
            .cmake = upstream.path("config.h.in"),
        },
    }, .{
        .PROJECT_VERSION = "122.0.0",
    });
    binaryen.addConfigHeader(config);

    const wasm_intrinsics = b.addConfigHeader(.{
        .style = .{
            .cmake = upstream.path("src/passes/WasmIntrinsics.cpp.in"),
        },
    }, .{
        .WASM_INTRINSICS_EMBED = str,
    });

    // TODO: re-running the step won't re-read the file...
    // try wasm_intrinsics.step.addWatchInput(upstream.path("src/passes/wasm-intrinsics.wat"));

    binaryen.linkLibCpp();
    binaryen.addCSourceFile(.{
        .file = wasm_intrinsics.getOutput(),
        .language = .cpp,
    });

    binaryen.addCSourceFiles(.{ .flags = &.{
        "-DSKIP_OUTLINING",
        "-Dbinaryen_EXPORTS",
        "-fno-omit-frame-pointer",
        "-fno-rtti",
        "-fPIC",
        "-Wall",
        "-Werror",
        "-Wextra",
        "-Wno-unused-parameter",
        "-Wno-dangling-pointer",
        "-Wno-implicit-int-float-conversion",
        "-Wno-unknown-warning-option",
        "-Wswitch",
        "-Wimplicit-fallthrough",
        "-Wnon-virtual-dtor",
        "-DNDEBUG",
        "-UNDEBUG",
        "-fPIC",
    }, .root = upstream.path(""), .files = &.{
        "src/ir/debuginfo.cpp",
        "src/ir/eh-utils.cpp",
        "src/ir/export-utils.cpp",
        "src/ir/ExpressionAnalyzer.cpp",
        "src/ir/drop.cpp",
        "src/ir/ExpressionManipulator.cpp",
        "src/ir/effects.cpp",
        "src/ir/intrinsics.cpp",
        "src/ir/lubs.cpp",
        "src/ir/memory-utils.cpp",
        "src/ir/module-utils.cpp",
        "src/ir/names.cpp",
        "src/ir/possible-contents.cpp",
        "src/ir/properties.cpp",
        "src/ir/LocalGraph.cpp",
        "src/ir/ReFinalize.cpp",
        "src/ir/LocalStructuralDominance.cpp",
        "src/ir/return-utils.cpp",
        "src/ir/stack-utils.cpp",
        "src/ir/table-utils.cpp",
        "src/ir/type-updating.cpp",
        "src/ir/module-splitting.cpp",
        "src/asmjs/asm_v_wasm.cpp",
        "src/asmjs/asmangle.cpp",
        "src/asmjs/shared-constants.cpp",
        "src/cfg/Relooper.cpp",
        "src/emscripten-optimizer/optimizer-shared.cpp",
        "src/emscripten-optimizer/parser.cpp",
        "src/interpreter/expression-iterator.cpp",
        "src/emscripten-optimizer/simple_ast.cpp",
        "src/interpreter/interpreter.cpp",
        "src/passes/param-utils.cpp",
        "src/passes/pass.cpp",
        "src/passes/test_passes.cpp",
        "src/passes/AbstractTypeRefining.cpp",
        "src/passes/AlignmentLowering.cpp",
        "src/passes/Asyncify.cpp",
        "src/passes/AvoidReinterprets.cpp",
        "src/passes/CoalesceLocals.cpp",
        "src/passes/CodePushing.cpp",
        "src/passes/CodeFolding.cpp",
        "src/passes/ConstantFieldPropagation.cpp",
        "src/passes/ConstHoisting.cpp",
        "src/passes/DataFlowOpts.cpp",
        "src/passes/DeadArgumentElimination.cpp",
        "src/passes/DeadCodeElimination.cpp",
        "src/passes/DeAlign.cpp",
        "src/passes/DebugLocationPropagation.cpp",
        "src/passes/DeNaN.cpp",
        "src/passes/Directize.cpp",
        "src/passes/DuplicateImportElimination.cpp",
        "src/passes/DuplicateFunctionElimination.cpp",
        "src/passes/DWARF.cpp",
        "src/passes/EncloseWorld.cpp",
        "src/passes/ExtractFunction.cpp",
        "src/passes/Flatten.cpp",
        "src/passes/FuncCastEmulation.cpp",
        "src/passes/GenerateDynCalls.cpp",
        "src/passes/GlobalEffects.cpp",
        "src/passes/GlobalRefining.cpp",
        "src/passes/GlobalStructInference.cpp",
        "src/passes/GlobalTypeOptimization.cpp",
        "src/passes/GUFA.cpp",
        "src/passes/Heap2Local.cpp",
        "src/passes/HeapStoreOptimization.cpp",
        "src/passes/I64ToI32Lowering.cpp",
        "src/passes/Inlining.cpp",
        "src/passes/InstrumentLocals.cpp",
        "src/passes/InstrumentMemory.cpp",
        "src/passes/Intrinsics.cpp",
        "src/passes/J2CLItableMerging.cpp",
        "src/passes/J2CLOpts.cpp",
        "src/passes/JSPI.cpp",
        "src/passes/LegalizeJSInterface.cpp",
        "src/passes/LimitSegments.cpp",
        "src/passes/LLVMMemoryCopyFillLowering.cpp",
        "src/passes/LocalCSE.cpp",
        "src/passes/LocalSubtyping.cpp",
        "src/passes/LogExecution.cpp",
        "src/passes/LoopInvariantCodeMotion.cpp",
        "src/passes/Memory64Lowering.cpp",
        "src/passes/MemoryPacking.cpp",
        "src/passes/MergeBlocks.cpp",
        "src/passes/MergeSimilarFunctions.cpp",
        "src/passes/MergeLocals.cpp",
        "src/passes/Metrics.cpp",
        "src/passes/MinifyImportsAndExports.cpp",
        "src/passes/MinimizeRecGroups.cpp",
        "src/passes/Monomorphize.cpp",
        "src/passes/MultiMemoryLowering.cpp",
        "src/passes/NameList.cpp",
        "src/passes/NameTypes.cpp",
        "src/passes/NoInline.cpp",
        "src/passes/LLVMNontrappingFPToIntLowering.cpp",
        "src/passes/OnceReduction.cpp",
        "src/passes/OptimizeAddedConstants.cpp",
        "src/passes/OptimizeCasts.cpp",
        "src/passes/OptimizeInstructions.cpp",
        "src/passes/OptimizeForJS.cpp",
        "src/passes/PickLoadSigns.cpp",
        "src/passes/Poppify.cpp",
        "src/passes/PostEmscripten.cpp",
        "src/passes/Precompute.cpp",
        "src/passes/Print.cpp",
        "src/passes/PrintCallGraph.cpp",
        "src/passes/PrintFeatures.cpp",
        "src/passes/PrintFunctionMap.cpp",
        "src/passes/RoundTrip.cpp",
        "src/passes/SetGlobals.cpp",
        "src/passes/SignaturePruning.cpp",
        "src/passes/SignatureRefining.cpp",
        "src/passes/SignExtLowering.cpp",
        "src/passes/StringLowering.cpp",
        "src/passes/Strip.cpp",
        "src/passes/StripTargetFeatures.cpp",
        "src/passes/TraceCalls.cpp",
        "src/passes/RedundantSetElimination.cpp",
        "src/passes/RemoveImports.cpp",
        "src/passes/RemoveMemoryInit.cpp",
        "src/passes/RemoveNonJSOps.cpp",
        "src/passes/RemoveUnusedBrs.cpp",
        "src/passes/RemoveUnusedNames.cpp",
        "src/passes/RemoveUnusedModuleElements.cpp",
        "src/passes/RemoveUnusedTypes.cpp",
        "src/passes/ReorderFunctions.cpp",
        "src/passes/ReorderGlobals.cpp",
        "src/passes/ReorderLocals.cpp",
        "src/passes/ReReloop.cpp",
        "src/passes/TrapMode.cpp",
        "src/passes/TypeGeneralizing.cpp",
        "src/passes/TypeRefining.cpp",
        "src/passes/TypeMerging.cpp",
        "src/passes/TypeSSA.cpp",
        "src/passes/SafeHeap.cpp",
        "src/passes/SeparateDataSegments.cpp",
        "src/passes/SimplifyGlobals.cpp",
        "src/passes/SimplifyLocals.cpp",
        "src/passes/Souperify.cpp",
        "src/passes/SpillPointers.cpp",
        "src/passes/StackCheck.cpp",
        "src/passes/StripEH.cpp",
        "src/passes/SSAify.cpp",
        "src/passes/TupleOptimization.cpp",
        "src/passes/TranslateEH.cpp",
        "src/passes/TypeFinalizing.cpp",
        "src/passes/Unsubtyping.cpp",
        "src/passes/Untee.cpp",
        "src/passes/Vacuum.cpp",
        "src/parser/context-decls.cpp",
        "src/parser/context-defs.cpp",
        "src/parser/lexer.cpp",
        "src/parser/parse-1-decls.cpp",
        "src/parser/parse-2-typedefs.cpp",
        "src/parser/parse-3-implicit-types.cpp",
        "src/parser/parse-4-module-types.cpp",
        "src/parser/parse-5-defs.cpp",
        "src/parser/wast-parser.cpp",
        "src/parser/wat-parser.cpp",
        "src/support/archive.cpp",
        "src/support/bits.cpp",
        "src/support/colors.cpp",
        "src/support/command-line.cpp",
        "src/support/debug.cpp",
        "src/support/dfa_minimization.cpp",
        "src/support/file.cpp",
        "src/support/istring.cpp",
        "src/support/json.cpp",
        "src/support/name.cpp",
        "src/support/path.cpp",
        "src/support/safe_integer.cpp",
        "src/support/string.cpp",
        "src/support/threads.cpp",
        "src/support/utilities.cpp",
        "src/wasm/literal.cpp",
        "src/wasm/parsing.cpp",
        "src/wasm/source-map.cpp",
        "src/wasm/wasm.cpp",
        "src/wasm/wasm-binary.cpp",
        "src/wasm/wasm-debug.cpp",
        "src/wasm/wasm-emscripten.cpp",
        "src/wasm/wasm-interpreter.cpp",
        "src/wasm/wasm-io.cpp",
        "src/wasm/wasm-ir-builder.cpp",
        "src/wasm/wasm-stack.cpp",
        "src/wasm/wasm-stack-opts.cpp",
        "src/wasm/wasm-type.cpp",
        "src/wasm/wasm-type-shape.cpp",
        "src/wasm/wasm-validator.cpp",
        "src/analysis/cfg.cpp",
        "src/binaryen-c.cpp",
    } });

    binaryen.installHeader(upstream.path("src/binaryen-c.h"), "binaryen-c.h");
    binaryen.installHeader(upstream.path("src/wasm-delegations.def"), "wasm-delegations.def");

    b.installArtifact(binaryen);
}

const std = @import("std");

pub fn build(b: *std.Build) void {
    const harfbuzz = b.dependency("harfbuzz", .{}).artifact("harfbuzz");
    const sheenbidi = b.dependency("sheenbidi", .{}).artifact("sheenbidi");

    const dropflow = b.addExecutable(.{
      .name = "dropflow",
      .target = b.resolveTargetQuery(.{
        .cpu_arch = .wasm32,
        .os_tag = .wasi,
      }),
      .optimize = .ReleaseSmall,
      .single_threaded = true
    });

    dropflow.addCSourceFiles(.{
      .files = &.{
        "src/dropflow.cc",
        "gen/lang-script-database.cc",
        "gen/grapheme-break-trie.cc",
        "gen/line-break-trie.cc",
        "gen/emoji-trie.cc",
        "gen/script-trie.cc",
        "gen/system-fonts-trie.cc",
        "gen/derived-core-properties-trie.cc",
        "gen/emoji-scan.c"
      },
      .flags = &.{
        "-fno-exceptions",
        "-fno-rtti",
        "-fvisibility-inlines-hidden",
        "-flto",
        "-Oz",
      },
    });

    dropflow.linkLibrary(harfbuzz);
    dropflow.linkLibrary(sheenbidi);
    dropflow.linkLibCpp();
    dropflow.linkLibC();

    // these are values that emscripten was using. emscripten produced both a
    // smaller binary and one that required way less memory. copying these
    // brought the runtime memory down. don't remember if it affected binary size
    dropflow.global_base = 1024;
    dropflow.stack_size = 65536;
    dropflow.initial_memory = 4 * 1024 * 1024;
    dropflow.entry = .disabled;
    dropflow.rdynamic = true;
    dropflow.import_symbols = true;
    dropflow.export_table = true;

    dropflow.root_module.export_symbol_names = &.{
      "hb_blob_create",
      "hb_blob_destroy",
      "hb_blob_get_data",
      "hb_blob_get_length",
      "hb_buffer_add_utf16",
      "hb_buffer_add_utf8",
      "hb_buffer_create",
      "hb_buffer_destroy",
      "hb_buffer_get_glyph_infos",
      "hb_buffer_get_glyph_positions",
      "hb_buffer_get_length",
      "hb_buffer_set_length",
      "hb_buffer_guess_segment_properties",
      "hb_buffer_set_cluster_level",
      "hb_buffer_set_direction",
      "hb_buffer_set_flags",
      "hb_buffer_set_language",
      "hb_buffer_set_script",
      "hb_face_create",
      "hb_face_collect_unicodes",
      "hb_face_destroy",
      "hb_face_get_upem",
      "hb_face_reference_table",
      "hb_face_count",
      "hb_font_create",
      "hb_font_destroy",
      "hb_font_get_extents_for_direction",
      "hb_font_glyph_to_string",
      "hb_font_set_scale",
      "hb_font_set_variations",
      "hb_font_get_nominal_glyph",
      "hb_style_get_value",
      "hb_ot_name_get_utf16",
      "hb_glyph_info_get_glyph_flags",
      "hb_language_from_string",
      "hb_ot_var_get_axis_infos",
      "hb_ot_metrics_get_position_with_fallback",
      "hb_ot_layout_has_substitution",
      "hb_ot_layout_has_positioning",
      "hb_ot_layout_table_get_script_tags",
      "hb_ot_layout_feature_get_lookups",
      "hb_ot_layout_language_get_feature_indexes",
      "hb_ot_layout_language_get_feature_tags",
      "hb_ot_layout_script_get_language_tags",
      "hb_ot_layout_lookup_collect_glyphs",
      "hb_ot_layout_language_get_required_feature_index",
      "hb_script_from_string",
      "hb_set_create",
      "hb_set_destroy",
      "hb_set_get_population",
      "hb_set_next_many",
      "hb_set_add",
      "hb_set_add_range",
      "hb_set_union",
      "hb_set_copy",
      "hb_set_subtract",
      "hb_set_clear",
      "hb_set_next",
      "hb_set_has",
      "hb_shape",
      "hbjs_glyph_draw",
      "SBAlgorithmCreate",
      "SBAlgorithmRelease",
      "SBAlgorithmGetParagraphBoundary",
      "SBAlgorithmCreateParagraph",
      "SBParagraphRelease",
      "SBParagraphGetLevelsPtr",
      "malloc",
      "free",
      "free_ptr",
      // TODO: why isn't __attribute__((used)) for variables working with zig build?
      // too tired and too close to getting this working to care at the moment
      "line_break_trie",
      "emoji_trie",
      "script_trie",
      "grapheme_break_trie",
      "derived_core_properties_trie",
      "system_font_trie"
    };

    b.installArtifact(dropflow);

    const binaryen = b.dependency("binaryen", .{});

    const postprocess_wasm = b.addExecutable(.{
        .name = "postprocess_wasm",
        .root_source_file = b.path("tools/postprocess_wasm.zig"),
        .target = b.resolveTargetQuery(.{}),
        .optimize = .ReleaseFast,
    });

    postprocess_wasm.linkLibrary(binaryen.artifact("binaryen"));

    const postprocess_wasm_step = b.addRunArtifact(postprocess_wasm);
    postprocess_wasm_step.addFileArg(dropflow.getEmittedBin());
    const postprocess_wasm_out = postprocess_wasm_step.addOutputFileArg("dropflow.wasm");
    const postprocess_wasm_install = b.addInstallFileWithDir(postprocess_wasm_out, .{ .custom = "../dist" }, "dropflow.wasm");

    b.getInstallStep().dependOn(&postprocess_wasm_install.step);
}

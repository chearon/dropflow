const std = @import("std");

pub fn build(b: *std.Build) !void {
    const harfbuzz = b.addStaticLibrary(.{ .name = "harfbuzz", .target = b.resolveTargetQuery(.{
        .cpu_arch = .wasm32,
        .os_tag = .wasi,
    }), .optimize = .ReleaseSmall, .single_threaded = true });

    const upstream = b.dependency("harfbuzz", .{});

    var flags = std.ArrayList([]const u8).init(b.allocator);
    defer flags.deinit();

    const config_h_path = try b.build_root.join(b.allocator, &.{"config.h"});
    defer b.allocator.free(config_h_path);

    var hb_config_override_list = std.ArrayList(u8).init(b.allocator);
    try hb_config_override_list.appendSlice("-DHB_CONFIG_OVERRIDE_H=\"");
    try hb_config_override_list.appendSlice(config_h_path);
    try hb_config_override_list.appendSlice("\"");
    const hb_config_override = try hb_config_override_list.toOwnedSlice();
    defer b.allocator.free(hb_config_override);

    try flags.appendSlice(&.{
        "-DHB_TINY",
        "-DHB_USE_INTERNAL_QSORT",
        hb_config_override,
        "-DHB_EXPERIMENTAL_API",
        "-fno-exceptions",
        "-fno-rtti",
        "-fvisibility-inlines-hidden",
        "-flto",
    });

    harfbuzz.addCSourceFile(.{ .file = upstream.path("src/harfbuzz.cc"), .flags = flags.items });

    harfbuzz.linkLibC();
    harfbuzz.linkLibCpp();

    harfbuzz.installHeadersDirectory(upstream.path("src"), "", .{ .include_extensions = &.{".h"} });

    b.installArtifact(harfbuzz);
}

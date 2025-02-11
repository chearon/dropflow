const std = @import("std");

pub fn build(b: *std.Build) !void {
    const upstream = b.dependency("sheenbidi", .{});

    const sheenbidi = b.addStaticLibrary(.{ .name = "sheenbidi", .target = b.resolveTargetQuery(.{
        .cpu_arch = .wasm32,
        .os_tag = .wasi,
    }), .optimize = .ReleaseSmall, .single_threaded = true });

    sheenbidi.addCSourceFile(.{
        .file = upstream.path("Source/SheenBidi.c"),
        .flags = &.{"-DSB_CONFIG_UNITY"},
    });

    sheenbidi.addIncludePath(upstream.path("Headers"));
    sheenbidi.linkLibC();

    b.installArtifact(sheenbidi);
}

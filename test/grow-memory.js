import wasm from '../src/wasm.ts';

// The tests register a lot of fonts. Pre-allocating 128MB makes them run faster.
// I often keep an eye on how long the tests take as a way to watch perf.
wasm.instance.exports.memory.grow(4096);

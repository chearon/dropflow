// All code based on foliojs/grapheme-breaker at time of writing
import UnicodeTrie from './text-unicode-trie.js';
import wasm from './wasm.js';

// I don't know why the pointer value is stored directly in the .value here.
// It must be an emscripten weirdness, so watch out in the future
export const trie = new UnicodeTrie(wasm.instance.exports.grapheme_break_trie.value);

export const Other = 0;
export const CR = 1;
export const LF = 2;
export const Control = 3;
export const Extend = 4;
export const Regional_Indicator = 5;
export const SpacingMark = 6;
export const L = 7;
export const V = 8;
export const T = 9;
export const LV = 10;
export const LVT = 11;

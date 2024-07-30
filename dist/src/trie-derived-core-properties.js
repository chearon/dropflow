import wasm from './wasm.js';
import UnicodeTrie from './text-unicode-trie.js';
export const InCB_Consonant = 1;
export const InCB_Extend = 2;
export const InCB_Linker = 3;
// I don't know why the pointer value is stored directly in the .value here.
// It must be an emscripten weirdness, so watch out in the future
export const trie = new UnicodeTrie(wasm.instance.exports.derived_core_properties_trie.value);

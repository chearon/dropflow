import wasm from './wasm.js';
import UnicodeTrie from './text-unicode-trie.js';
export const trie = new UnicodeTrie(wasm.instance.exports.script_trie.value);

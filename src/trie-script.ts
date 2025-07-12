import wasm from './wasm.ts';
import UnicodeTrie from './text-unicode-trie.ts';

export const trie = new UnicodeTrie(wasm.instance.exports.script_trie.value);

import wasm from './wasm.js';
import UnicodeTrie from './text-unicode-trie.js';

export const Emoji = 1;
export const Emoji_Presentation = 2;
export const Emoji_Modifier = 3;
export const Emoji_Modifier_Base = 4;

// I don't know why the pointer value is stored directly in the .value here.
// It must be an emscripten weirdness, so watch out in the future
export const trie = new UnicodeTrie(wasm.instance.exports.emoji_trie.value);

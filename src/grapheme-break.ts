// All code based on foliojs/grapheme-breaker at time of writing
import UnicodeTrie from './unicode-trie.js';
import wasm from './wasm.js';

const heapu32 = new Uint32Array(wasm.instance.exports.memory.buffer);
const len = heapu32[wasm.instance.exports.grapheme_break_trie_len.value >> 2];
// I don't know why the pointer value is stored directly in the .value here.
// It must be an emscripten weirdness, so watch out in the future
const ptr = wasm.instance.exports.grapheme_break_trie.value >> 2;
const trie = new UnicodeTrie(heapu32.subarray(ptr, ptr + len));

// Gets a code point from a UTF-16 string
// handling surrogate pairs appropriately
function codePointAt(str: string, idx: number) {
  let hi, low;
  idx = idx || 0;
  const code = str.charCodeAt(idx);

  // High surrogate
  if (0xD800 <= code && code <= 0xDBFF) {
    hi = code;
    low = str.charCodeAt(idx + 1);
    if (0xDC00 <= low && low <= 0xDFFF) {
      return ((hi - 0xD800) * 0x400) + (low - 0xDC00) + 0x10000;
    }

    return hi;
  }

  // Low surrogate
  if (0xDC00 <= code && code <= 0xDFFF) {
    hi = str.charCodeAt(idx - 1);
    low = code;
    if (0xD800 <= hi && hi <= 0xDBFF) {
      return ((hi - 0xD800) * 0x400) + (low - 0xDC00) + 0x10000;
    }

    return low;
  }

  return code;
};

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

const GB4 = new Set([Control, CR, LF]);

const GB5 = new Set([Control, CR, LF]);

const GB6 = new Set([L, V, LV, LVT]);

const GB7A = new Set([LV, V]);

const GB7B = new Set([V, T]);

const GB8 = new Set([LVT, T]);

// Returns whether a break is allowed between the
// two given grapheme breaking classes
function shouldBreak(previous: number, current: number) {
  // GB3. CR X LF
  if ((previous === CR) && (current === LF)) {
    return false;

    // GB4. (Control|CR|LF) ÷
  } else if (GB4.has(previous)) {
    return true;

    // GB5. ÷ (Control|CR|LF)
  } else if (GB5.has(current)) {
    return true;

    // GB6. L X (L|V|LV|LVT)
  } else if ((previous === L) && GB6.has(current)) {
    return false;

    // GB7. (LV|V) X (V|T)
  } else if (GB7A.has(previous) && GB7B.has(current)) {
    return false;

    // GB8. (LVT|T) X (T)
  } else if (GB8.has(previous) && (current === T)) {
    return false;

    // GB8a. Regional_Indicator X Regional_Indicator
  } else if ((previous === Regional_Indicator) && (current === Regional_Indicator)) {
    return false;

    // GB9. X Extend
  } else if (current === Extend) {
    return false;

    // GB9a. X SpacingMark
  } else if (current === SpacingMark) {
    return false;
  }

  // GB9b. Prepend X (there are currently no characters with this class)
  //else if (previous === Prepend) {
  //  return false;
  //}

  // GB10. Any ÷ Any
  return true;
};

// Returns the next grapheme break in the string after the given index
export function nextGraphemeBreak(string: string, index: number) {
  if (index == null) {
    index = 0;
  }
  if (index < 0) {
    return 0;
  }

  if (index >= (string.length - 1)) {
    return string.length;
  }

  let prev = trie.get(codePointAt(string, index));
  for (let i = index + 1; i < string.length; i++) {
    // check for already processed low surrogates
    let middle, middle1;
    if ((0xd800 <= (middle = string.charCodeAt(i - 1)) && middle <= 0xdbff) &&
      (0xdc00 <= (middle1 = string.charCodeAt(i)) && middle1 <= 0xdfff)) {
      continue;
    }

    const next = trie.get(codePointAt(string, i));
    if (shouldBreak(prev, next)) {
      return i;
    }

    prev = next;
  }

  return string.length;
};

export function previousGraphemeBreak(string: string, index: number) {
  if (index == null) {
    index = string.length;
  }
  if (index > string.length) {
    return string.length;
  }

  if (index <= 1) {
    return 0;
  }

  index--;
  let next = trie.get(codePointAt(string, index));
  for (let i = index - 1; i >= 0; i--) {
    // check for already processed high surrogates
    var middle, middle1;
    if ((0xd800 <= (middle = string.charCodeAt(i)) && middle <= 0xdbff) &&
        (0xdc00 <= (middle1 = string.charCodeAt(i + 1)) && middle1 <= 0xdfff)) {
      continue;
    }

    const prev = trie.get(codePointAt(string, i));
    if (shouldBreak(prev, next)) {
      return i + 1;
    }

    next = prev;
  }

  return 0;
}

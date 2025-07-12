import * as GraphemeBreakTrie from './trie-grapheme-break.ts';
import * as EmojiTrie from './trie-emoji.ts';
import * as DerivedCorePropertiesTrie from './trie-derived-core-properties.ts';

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

const GB4 = new Set([GraphemeBreakTrie.Control, GraphemeBreakTrie.CR, GraphemeBreakTrie.LF]);

const GB5 = new Set([GraphemeBreakTrie.Control, GraphemeBreakTrie.CR, GraphemeBreakTrie.LF]);

const GB6 = new Set([GraphemeBreakTrie.L, GraphemeBreakTrie.V, GraphemeBreakTrie.LV, GraphemeBreakTrie.LVT]);

const GB7A = new Set([GraphemeBreakTrie.LV, GraphemeBreakTrie.V]);

const GB7B = new Set([GraphemeBreakTrie.V, GraphemeBreakTrie.T]);

const GB8 = new Set([GraphemeBreakTrie.LVT, GraphemeBreakTrie.T]);

function isLowSurrogate(string: string, index: number) {
  let middle, middle1;

  return 0xd800 <= (middle = string.charCodeAt(index - 1)) &&
    middle <= 0xdbff &&
    0xdc00 <= (middle1 = string.charCodeAt(index))
    && middle1 <= 0xdfff;
}

function isGb9c(string: string, index: number) {
  // Right to left, 3 is match, 0 is none:
  // 3:Consonant [Extend Linker]* 2:Linker [Extend Linker]* × 1:Consonant
  let state = 0;

  do {
    const current = DerivedCorePropertiesTrie.trie.get(codePointAt(string, index));

    if (state === 0 && current === DerivedCorePropertiesTrie.InCB_Consonant) {
      state = 1;
    } else if (state === 1 && current === DerivedCorePropertiesTrie.InCB_Linker) {
      state = 2;
    } else if (state === 1 && current === DerivedCorePropertiesTrie.InCB_Extend) {
      // stay in state 1
    } else if (state === 2 && current === DerivedCorePropertiesTrie.InCB_Linker) {
      // stay in state 2
    } else if (state === 2 && current === DerivedCorePropertiesTrie.InCB_Extend) {
      // stay in state 2
    } else if (state === 2 && current === DerivedCorePropertiesTrie.InCB_Consonant) {
      state = 3; // match!
    } else {
      state = 0;
    }

    index -= 1;
    if (index > -1 && isLowSurrogate(string, index)) index -= 1;
  } while (state !== 0 && state !== 3 && index > -1);

  return state === 3;
}

function isGb11(string: string, index: number) {
  // Right to left, 3 is match, 0 is none:
  // 3:Extended_Pictographic Extend* 2:ZWJ × 1:Extended_Pictographic
  let state = 0;

  do {
    const emoji = EmojiTrie.trie.get(codePointAt(string, index));
    const grapheme = GraphemeBreakTrie.trie.get(codePointAt(string, index));

    if (state === 0 && emoji & EmojiTrie.Extended_Pictographic) {
      state = 1;
    } else if (state === 1 && grapheme === GraphemeBreakTrie.ZWJ) {
      state = 2;
    } else if (state === 2 && grapheme === GraphemeBreakTrie.Extend) {
      // stay in state 2
    } else if (state === 2 && emoji & EmojiTrie.Extended_Pictographic) {
      state = 3; // match!
    } else {
      state = 0;
    }

    index -= 1;
    if (index > -1 && isLowSurrogate(string, index)) index -= 1;
  } while (state !== 0 && state !== 3 && index > -1);

  return state === 3;
}

function isGb12(string: string, index: number) {
  // Right to left, 3 is match:
  // (sot | 3:[^RI]) (RI RI)* 2:RI × 1:RI
  let state = 0;
  let odd = false;

  do {
    const current = GraphemeBreakTrie.trie.get(codePointAt(string, index));

    if (state === 0 && current === GraphemeBreakTrie.Regional_Indicator) {
      state = 1;
    } else if (state === 1 && current === GraphemeBreakTrie.Regional_Indicator) {
      state = 2;
    } else if (state === 2 && current === GraphemeBreakTrie.Regional_Indicator) {
      odd = !odd;
    } else if (state === 2 && current !== GraphemeBreakTrie.Regional_Indicator) {
      state = odd ? 0 : 3;
    } else {
      state = 0;
    }

    index -= 1;
    if (index > -1 && isLowSurrogate(string, index)) index -= 1;
  } while (state !== 0 && state !== 3 && index > -1);

  return state === 3 || state === 2 && !odd;
}

// Returns whether a break is allowed between the
// two given grapheme breaking classes
function shouldBreak(string: string, index: number) {
  const previous = GraphemeBreakTrie.trie.get(codePointAt(string, index - 1));
  const current = GraphemeBreakTrie.trie.get(codePointAt(string, index));

  // GB3. CR X LF
  if (previous === GraphemeBreakTrie.CR && current === GraphemeBreakTrie.LF) {
    return false;

    // GB4. (Control|CR|LF) ÷
  } else if (GB4.has(previous)) {
    return true;

    // GB5. ÷ (Control|CR|LF)
  } else if (GB5.has(current)) {
    return true;

    // GB6. L × (L|V|LV|LVT)
  } else if (previous === GraphemeBreakTrie.L && GB6.has(current)) {
    return false;

    // GB7. (LV|V) × (V|T)
  } else if (GB7A.has(previous) && GB7B.has(current)) {
    return false;

    // GB8. (LVT|T) × (T)
  } else if (GB8.has(previous) && current=== GraphemeBreakTrie.T) {
    return false;

    // GB9. × Extend | ZWJ
  } else if (
    current === GraphemeBreakTrie.Extend ||
    current === GraphemeBreakTrie.ZWJ
  ) {
    return false;

    // GB9a. × SpacingMark
  } else if (current === GraphemeBreakTrie.SpacingMark) {
    return false;

    // GB9b. Prepend ×
  } else if (previous === GraphemeBreakTrie.Prepend) {
    return false;

    // GB9c. Consonant [Extend Linker]* Linker [Extend Linker]* × Consonant
  } else if (isGb9c(string, index)) {
    return false;

    // GB11. Extended_Pictographic Extend* ZWJ × Extended_Pictographic
  } else if (isGb11(string, index)) {
    return false

    // GB12. (RI RI)* RI × RI
  } else if (isGb12(string, index)) {
    return false;
  }

  // GB10. Any ÷ Any
  return true;
};

export function nextGraphemeBreak(string: string, index: number) {
  if (index < 0) return 0;
  if (index >= string.length - 1) return string.length;

  for (let i = index + 1; i < string.length; i++) {
    if (isLowSurrogate(string, i)) continue;
    if (shouldBreak(string, i)) return i;
  }

  return string.length;
};

export function previousGraphemeBreak(string: string, index: number) {
  if (index > string.length) return string.length;
  if (index <= 1) return 0;

  for (let i = index - 1; i >= 0; i--) {
    if (isLowSurrogate(string, i)) continue;
    if (shouldBreak(string, i)) return i;
  }

  return 0;
}

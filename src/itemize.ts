import UnicodeTrie from './unicode-trie.js';
import wasm from './wasm.js';
import {codeToName} from '../gen/script-names.js';

// I don't know why the pointer value is stored directly in the .value here.
// It must be an emscripten weirdness, so watch out in the future
const emojiTrie = new UnicodeTrie(wasm.instance.exports.emoji_trie.value);

const scriptTrie = new UnicodeTrie(wasm.instance.exports.script_trie.value);

const {
  // SheenBidi
  SBAlgorithmCreate,
  SBAlgorithmRelease,
  SBAlgorithmGetParagraphBoundary,
  SBAlgorithmCreateParagraph,
  SBParagraphRelease,
  SBParagraphGetLevelsPtr,
  // emoji-segmenter
  emoji_scan,
  malloc,
  free,
  memory
} = wasm.instance.exports;

const seqPtr = malloc(12); // sizeof(SBCodepointSequence)
const paraLenPtr = malloc(8 /* sizeof(SBUInteger) * 2 */);
const paraSepPtr = paraLenPtr + 4;

export function* bidiIterator(str: Uint16Array, initialLevel = 0) {
  // first byte is 1 because 1 === SBStringEncodingUTF16
  new Uint32Array(memory.buffer, seqPtr, 3).set([1, str.byteOffset, str.length]);

  const algorithm = SBAlgorithmCreate(seqPtr);
  let offset = 0;
  let lastLevel = 0;
  while (offset < str.length) {
    const twoInts = new Uint32Array(memory.buffer, paraLenPtr, 2);
    twoInts.set([0, 0]);
    SBAlgorithmGetParagraphBoundary(algorithm, offset, str.length - offset, paraLenPtr, paraSepPtr);
    const [paraLen, paraSep] = twoInts;
    const paragraph = SBAlgorithmCreateParagraph(algorithm, offset, paraLen + paraSep, initialLevel);
    const levels = new Uint8Array(memory.buffer, SBParagraphGetLevelsPtr(paragraph), paraLen + paraSep);
    const isFirstParagraph = offset === 0;
    const isLastParagraph = offset + paraLen + paraSep >= /* see Tehreer/SheenBidi#18 */ str.length;
    let j = paraLen + paraSep;

    if (isFirstParagraph) lastLevel = levels[0];
    if (isLastParagraph) j += 1; /* check levels[levels.length] to emit the final character */

    for (let i = 0; i < j; ++i) {
      const level = levels[i];
      if (level !== lastLevel) yield {i: offset + i, level: lastLevel};
      lastLevel = level;
    }

    offset += paraLen + paraSep;

    SBParagraphRelease(paragraph);
  }

  SBAlgorithmRelease(algorithm);
}

// Used for the trie
export const Emoji = 1;
export const Emoji_Presentation = 2;
export const Emoji_Modifier = 3;
export const Emoji_Modifier_Base = 4;

// Some unicode char constants from Pango
const kCombiningEnclosingCircleBackslashCharacter = 0x20E0;
const kCombiningEnclosingKeycapCharacter = 0x20E3;
const kVariationSelector15Character = 0xFE0E;
const kVariationSelector16Character = 0xFE0F;
const kZeroWidthJoinerCharacter = 0x200D;

// Scanner categories
const EMOJI = 0;
const EMOJI_TEXT_PRESENTATION = 1;
const EMOJI_EMOJI_PRESENTATION = 2;
const EMOJI_MODIFIER_BASE = 3;
const EMOJI_MODIFIER = 4;
const REGIONAL_INDICATOR = 6;
const KEYCAP_BASE = 7;
const COMBINING_ENCLOSING_KEYCAP = 8;
const COMBINING_ENCLOSING_CIRCLE_BACKSLASH = 9;
const ZWJ = 10;
const VS15 = 11;
const VS16 = 12;
const TAG_BASE = 13;
const TAG_SEQUENCE = 14;
const TAG_TERM = 15;
const kMaxEmojiScannerCategory = 1;

function* scan(types: number[], offsets: number[]) {
  const buffer = new Uint8Array(memory.buffer);
  const n = types.length;
  const ptr = malloc(n);
  const bptr = malloc(1);

  for (let i = 0; i < n; ++i) buffer[ptr + i] = types[i];

  let p = ptr;
  let isEmoji = false;

  do {
    p = emoji_scan(p, ptr + n, bptr);

    const pIsEmoji = Boolean(buffer[bptr]);

    if (pIsEmoji !== isEmoji) {
      yield {i: offsets[p - ptr - 1], isEmoji};
      isEmoji = pIsEmoji;
    }
  } while (p < ptr + n);

  yield {i: offsets[offsets.length - 1], isEmoji: Boolean(buffer[bptr])};

  free(ptr);
}

export function* emojiIterator(str: Uint16Array) {
  const types = [];
  const offsets = [];

  for (let i = 0; i < str.length; ++i) {
    let code = str[i];
    const next = str[i + 1];

    offsets.push(i);

    // If a surrogate pair
    if ((0xd800 <= code && code <= 0xdbff) && (0xdc00 <= next && next <= 0xdfff)) {
      i += 1;
      code = ((code - 0xd800) * 0x400) + (next - 0xdc00) + 0x10000;
    }

    if (code === kCombiningEnclosingKeycapCharacter) {
      types.push(COMBINING_ENCLOSING_KEYCAP);
    } else if (code === kCombiningEnclosingCircleBackslashCharacter) {
      types.push(COMBINING_ENCLOSING_CIRCLE_BACKSLASH);
    } else if (code === kZeroWidthJoinerCharacter) {
      types.push(ZWJ);
    } else if (code === kVariationSelector15Character) {
      types.push(VS15);
    } else if (code === kVariationSelector16Character) {
      types.push(VS16);
    } else if (code === 0x1F3F4) {
      types.push(TAG_BASE);
    } else if ((code >= 0xE0030 && code <= 0xE0039) ||
        (code >= 0xE0061 && code <= 0xE007A)) {
      types.push(TAG_SEQUENCE);
    } else if (code === 0xE007F) {
      types.push(TAG_TERM);
    } else if (emojiTrie.get(code) === Emoji_Modifier_Base) {
      types.push(EMOJI_MODIFIER_BASE);
    } else if (emojiTrie.get(code) === Emoji_Modifier) {
      types.push(EMOJI_MODIFIER);
    } else if (code >= 0x1F1E6 && code <= 0x1F1FF) {
      types.push(REGIONAL_INDICATOR);
    } else if ((code >= 48 && code <= 57) || code === 35 || code === 42) {
      types.push(KEYCAP_BASE);
    } else if (emojiTrie.get(code) === Emoji_Presentation) {
      types.push(EMOJI_EMOJI_PRESENTATION);
    } else if (emojiTrie.get(code) === Emoji && emojiTrie.get(code) !== Emoji_Presentation) {
      types.push(EMOJI_TEXT_PRESENTATION);
    } else if (emojiTrie.get(code) === Emoji) {
      types.push(EMOJI);
    } else {
      types.push(kMaxEmojiScannerCategory);
    }
  }

  offsets.push(str.length);

  yield* scan(types, offsets);
}

const pairedChars = [
  0x0028, 0x0029, /* ascii paired punctuation */
  0x003c, 0x003e,
  0x005b, 0x005d,
  0x007b, 0x007d,
  0x00ab, 0x00bb, /* guillemets */
  0x0f3a, 0x0f3b, /* tibetan */
  0x0f3c, 0x0f3d,
  0x169b, 0x169c, /* ogham */
  0x2018, 0x2019, /* general punctuation */
  0x201c, 0x201d,
  0x2039, 0x203a,
  0x2045, 0x2046,
  0x207d, 0x207e,
  0x208d, 0x208e,
  0x27e6, 0x27e7, /* math */
  0x27e8, 0x27e9,
  0x27ea, 0x27eb,
  0x27ec, 0x27ed,
  0x27ee, 0x27ef,
  0x2983, 0x2984,
  0x2985, 0x2986,
  0x2987, 0x2988,
  0x2989, 0x298a,
  0x298b, 0x298c,
  0x298d, 0x298e,
  0x298f, 0x2990,
  0x2991, 0x2992,
  0x2993, 0x2994,
  0x2995, 0x2996,
  0x2997, 0x2998,
  0x29fc, 0x29fd,
  0x2e02, 0x2e03,
  0x2e04, 0x2e05,
  0x2e09, 0x2e0a,
  0x2e0c, 0x2e0d,
  0x2e1c, 0x2e1d,
  0x2e20, 0x2e21,
  0x2e22, 0x2e23,
  0x2e24, 0x2e25,
  0x2e26, 0x2e27,
  0x2e28, 0x2e29,
  0x3008, 0x3009, /* chinese paired punctuation */
  0x300a, 0x300b,
  0x300c, 0x300d,
  0x300e, 0x300f,
  0x3010, 0x3011,
  0x3014, 0x3015,
  0x3016, 0x3017,
  0x3018, 0x3019,
  0x301a, 0x301b,
  0xfe59, 0xfe5a,
  0xfe5b, 0xfe5c,
  0xfe5d, 0xfe5e,
  0xff08, 0xff09,
  0xff3b, 0xff3d,
  0xff5b, 0xff5d,
  0xff5f, 0xff60,
  0xff62, 0xff63
];

function getPairIndex(ch: number) {
  let lower = 0;
  let upper = pairedChars.length - 1;

  while (lower <= upper) {
    const mid = Math.floor((lower + upper) / 2);

    if (ch < pairedChars[mid]) {
      upper = mid - 1;
    } else if (ch > pairedChars[mid]) {
      lower = mid + 1;
    } else {
      return mid;
    }
  }

  return -1;
}

export function* scriptIterator(text: string) {
  let textEnd = text.length;
  let scriptEnd = 0;
  let runningScript = 'Common';
  let startParen = -1;
  const parens = [];

  if (!text.length) return;

  while (scriptEnd < textEnd) {
    let jump = 1;
    let code = text.charCodeAt(scriptEnd);
    const next = text.charCodeAt(scriptEnd + 1);

    // If a surrogate pair
    if ((0xd800 <= code && code <= 0xdbff) && (0xdc00 <= next && next <= 0xdfff)) {
      jump += 1;
      code = ((code - 0xd800) * 0xd400) + (next - 0xdc00) + 0x10000;
    }

    let script = codeToName.get(scriptTrie.get(code)) || 'Common';
    const pairIndex = script !== 'Common' ? -1 : getPairIndex(code);

    // Paired character handling:
    // if it's an open character, push it onto the stack
    // if it's a close character, find the matching open on the stack, and use
    // that script code. Any non-matching open characters above it on the stack
    // will be popped.
    if (pairIndex >= 0) {
      if ((pairIndex & 1) === 0) {
        parens.push({index: pairIndex, script: runningScript});
      } else if (parens.length > 0) {
        const pi = pairIndex & ~1;

        while (parens.length && parens[parens.length - 1].index !== pi) {
          parens.pop();
        }

        if (parens.length - 1 < startParen) {
          startParen = parens.length - 1;
        }

        if (parens.length > 0) {
          script = parens[parens.length - 1].script;
        }
      }
    }

    const runningIsReal = runningScript !== 'Common' && runningScript !== 'Inherited';
    const isReal = script !== 'Common' && script !== 'Inherited';
    const isSame = !runningIsReal || !isReal || script === runningScript;

    if (isSame) {
      if (!runningIsReal && isReal) {
        runningScript = script;

        // Now that we have a final script code, fix any open characters we
        // pushed before we knew the real script code.
        while (parens[startParen + 1]) parens[++startParen].script = script;

        if (pairIndex >= 0 && pairIndex & 1 && parens.length > 0) {
          parens.pop();

          if (parens.length - 1 < startParen) {
            startParen = parens.length - 1;
          }
        }
      }

      scriptEnd += jump;
    } else {
      yield {i: scriptEnd, script: runningScript};

      startParen = parens.length - 1;
      runningScript = 'Common';
    }
  }

  yield {i: scriptEnd, script: runningScript};
}

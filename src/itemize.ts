import {createTrie} from './unicode-trie.js';
import wasm from './wasm.js';

// I don't know why the pointer value is stored directly in the .value here.
// It must be an emscripten weirdness, so watch out in the future
const emojiTrie = createTrie(
  wasm.instance.exports.memory.buffer,
  wasm.instance.exports.emoji_trie.value
);

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

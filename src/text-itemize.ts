import wasm from './wasm.js';
import {onWasmMemoryResized} from './wasm-env.js';
import {codeToName} from '../gen/script-names.js';
import {IfcInline, InlineLevel, Inline} from './layout-flow.js';
import {Style} from './style.js';
import * as hb from './text-harfbuzz.js';
import * as EmojiTrie from './trie-emoji.js';
import * as ScriptTrie from './trie-script.js';

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

let heapu32 = new Uint32Array(memory.buffer);
let heapu8 = new Uint8Array(memory.buffer);
let heapu16 = new Uint16Array(memory.buffer);

onWasmMemoryResized(() => {
  heapu32 = new Uint32Array(memory.buffer);
  heapu8 = new Uint8Array(memory.buffer);
  heapu16 = new Uint16Array(memory.buffer);
});

const seqPtr = malloc(12); // sizeof(SBCodepointSequence)
const seqPtr32 = seqPtr >>> 2; // sizeof(SBCodepointSequence)
const paraLenPtr = malloc(4 /* sizeof(SBUInteger) */);
const paraLenPtr32 = paraLenPtr >>> 2;
const paraSepPtr = malloc(4 /* sizeof(SBUInteger) */);
const paraSepPtr32 = paraSepPtr >>> 2;

interface BidiIteratorState {
  /* output */
  offset: number;
  level: number;
  done: boolean;
  /* private */
  stringLength: number;
  paragraphStart: number;
  paragraphEnd: number;
  algorithmPtr: number;
  paragraphPtr: number;
  levelsPtr: number;
  initialLevel: number;
}

// exported for testing
export function createBidiIteratorState(
  stringPtr: number,
  stringLength: number,
  initialLevel = 0
): BidiIteratorState {
  // first byte is 1 because 1 === SBStringEncodingUTF16
  heapu32[seqPtr32] = 1;
  heapu32[seqPtr32 + 1] = stringPtr;
  heapu32[seqPtr32 + 2] = stringLength;

  return {
    offset: 0,
    stringLength,
    paragraphStart: 0,
    paragraphEnd: 0,
    algorithmPtr: SBAlgorithmCreate(seqPtr),
    paragraphPtr: 0,
    levelsPtr: 0,
    initialLevel,
    level: 0,
    done: false
  };
}

// exported for testing
export function bidiIteratorNext(state: BidiIteratorState) {
  if (state.done) return;

  state.level = heapu8[state.levelsPtr + state.offset - state.paragraphStart];

  outer: while (state.offset < state.stringLength) {
    if (state.offset === state.paragraphEnd) {
      if (state.paragraphPtr) SBParagraphRelease(state.paragraphPtr);

      heapu32[paraLenPtr32] = 0;
      heapu32[paraSepPtr32] = 0;

      SBAlgorithmGetParagraphBoundary(
        state.algorithmPtr,
        state.offset,
        state.stringLength - state.offset,
        paraLenPtr,
        paraSepPtr
      );

      const paraLen = heapu32[paraLenPtr32] + heapu32[paraSepPtr32];

      state.paragraphStart = state.paragraphEnd;
      state.paragraphEnd = state.offset + paraLen;
      state.paragraphPtr = SBAlgorithmCreateParagraph(
        state.algorithmPtr,
        state.offset,
        paraLen,
        state.initialLevel
      );

      state.levelsPtr = SBParagraphGetLevelsPtr(state.paragraphPtr);

      if (state.offset === 0) state.level = heapu8[state.levelsPtr];
    }

    while (state.offset < state.paragraphEnd) {
      if (
        heapu8[state.levelsPtr + state.offset - state.paragraphStart] !== state.level
      ) break outer;

      state.offset += 1;
    }
  }

  if (state.offset === state.stringLength) {
    if (state.paragraphPtr) SBParagraphRelease(state.paragraphPtr);
    state.done = true;
    SBAlgorithmRelease(state.algorithmPtr);
  }
}

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

interface EmojiIteratorState {
  /* output */
  offset: number;
  isEmoji: boolean;
  done: boolean;
  /* private */
  index: number;
  typesPtr: number;
  typesLength: number;
  offsets: number[];
}

export function createEmojiIteratorState(
  stringPtr: number,
  stringLength: number
): EmojiIteratorState {
  const stringPtr16 = stringPtr >>> 1;
  const types = [];
  const offsets = [];

  for (let i = 0; i < stringLength; ++i) {
    let code = heapu16[stringPtr16 + i];
    const next = heapu16[stringPtr16 + i + 1];

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
    } else if (code === 0x1f3f4) {
      types.push(TAG_BASE);
    } else if (code >= 0xe0030 && code <= 0xe0039 || code >= 0xe0061 && code <= 0xe007a) {
      types.push(TAG_SEQUENCE);
    } else if (code === 0xE007F) {
      types.push(TAG_TERM);
    } else if (EmojiTrie.trie.get(code) === EmojiTrie.Emoji_Modifier_Base) {
      types.push(EMOJI_MODIFIER_BASE);
    } else if (EmojiTrie.trie.get(code) === EmojiTrie.Emoji_Modifier) {
      types.push(EMOJI_MODIFIER);
    } else if (code >= 0x1f1e6 && code <= 0x1f1ff) {
      types.push(REGIONAL_INDICATOR);
    } else if ((code >= 48 && code <= 57) || code === 35 || code === 42) {
      types.push(KEYCAP_BASE);
    } else if (EmojiTrie.trie.get(code) === EmojiTrie.Emoji_Presentation) {
      types.push(EMOJI_EMOJI_PRESENTATION);
    } else if (
      EmojiTrie.trie.get(code) === EmojiTrie.Emoji &&
      EmojiTrie.trie.get(code) !== EmojiTrie.Emoji_Presentation
    ) {
      types.push(EMOJI_TEXT_PRESENTATION);
    } else if (EmojiTrie.trie.get(code) === EmojiTrie.Emoji) {
      types.push(EMOJI);
    } else {
      types.push(kMaxEmojiScannerCategory);
    }
  }

  const typesPtr = malloc(types.length);

  heapu8.set(types, typesPtr);
  offsets.push(stringLength);

  return {
    index: 0,
    typesPtr,
    typesLength: types.length,
    offsets,
    isEmoji: false,
    offset: 0,
    done: false
  };
}

const isEmojiPtr = malloc(1);

export function emojiIteratorNext(state: EmojiIteratorState) {
  if (state.done) return;

  const end = state.typesPtr + state.typesLength;
  let p = state.typesPtr + state.index;

  state.isEmoji = Boolean(heapu8[isEmojiPtr]);
  state.offset = state.offsets[state.index];

  while (p < end) {
    p = emoji_scan(p, end, isEmojiPtr);
    const isEmoji = Boolean(heapu8[isEmojiPtr]);
    if (state.index === 0) state.isEmoji = isEmoji;
    state.index = p - state.typesPtr;

    if (isEmoji !== state.isEmoji) return;

    state.offset = state.offsets[state.index];
  }

  state.offset = state.offsets.at(-1)!;
  state.done = true;
  free(state.typesPtr);
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

interface ScriptIteratorState {
  /* output */
  offset: number;
  script: string;
  done: boolean;
  /* private */
  stringPtr16: number;
  stringLength: number;
  parens: {index: number; script: string;}[];
  startParen: number;
}

export function createScriptIteratorState(
  stringPtr: number,
  stringLength: number
): ScriptIteratorState {
  return {
    offset: 0,
    stringPtr16: stringPtr >>> 1,
    stringLength,
    script: '',
    parens: [],
    startParen: -1,
    done: false
  };
}

export function scriptIteratorNext(state: ScriptIteratorState) {
  if (state.done) return;

  state.script = 'Common';

  const parens = state.parens;

  while (state.offset < state.stringLength) {
    const next = heapu16[state.stringPtr16 + state.offset + 1];
    let code = heapu16[state.stringPtr16 + state.offset];
    let jump = 1;

    // If a surrogate pair
    if ((0xd800 <= code && code <= 0xdbff) && (0xdc00 <= next && next <= 0xdfff)) {
      jump += 1;
      code = ((code - 0xd800) * 0xd400) + (next - 0xdc00) + 0x10000;
    }

    let script = codeToName.get(ScriptTrie.trie.get(code)) || 'Common';
    const pairIndex = script !== 'Common' ? -1 : getPairIndex(code);

    // Paired character handling:
    // if it's an open character, push it onto the stack
    // if it's a close character, find the matching open on the stack, and use
    // that script code. Any non-matching open characters above it on the stack
    // will be popped.
    if (pairIndex >= 0) {
      if ((pairIndex & 1) === 0) {
        parens.push({index: pairIndex, script: state.script});
      } else if (parens.length > 0) {
        const pi = pairIndex & ~1;

        while (parens.length && parens[parens.length - 1].index !== pi) {
          parens.pop();
        }

        if (parens.length - 1 < state.startParen) {
          state.startParen = parens.length - 1;
        }

        if (parens.length > 0) {
          script = parens[parens.length - 1].script;
        }
      }
    }

    const runningIsReal = state.script !== 'Common' && state.script !== 'Inherited';
    const isReal = script !== 'Common' && script !== 'Inherited';
    const isSame = !runningIsReal || !isReal || script === state.script;

    if (isSame) {
      if (!runningIsReal && isReal) {
        state.script = script;

        // Now that we have a final script code, fix any open characters we
        // pushed before we knew the real script code.
        while (parens[state.startParen + 1]) parens[++state.startParen].script = script;

        if (pairIndex >= 0 && pairIndex & 1 && parens.length > 0) {
          parens.pop();

          if (parens.length - 1 < state.startParen) {
            state.startParen = parens.length - 1;
          }
        }
      }

      state.offset += jump;
    } else {
      state.startParen = parens.length - 1;
      break;
    }
  }

  if (state.offset === state.stringLength) {
    state.done = true;
  }
}

interface NewlineIteratorState {
  /* output */
  offset: number;
  done: boolean;
  /* private */
  str: string;
}

export function createNewlineIteratorState(str: string): NewlineIteratorState {
  return {offset: 0, str, done: false};
}

export function newlineIteratorNext(state: NewlineIteratorState) {
  if (state.done) return;

  const next = state.str.indexOf('\n', state.offset);

  if (next < 0) {
    state.offset = state.str.length;
  } else {
    state.offset = next + 1;
  }

  if (state.offset === state.str.length) state.done = true;
}

const END_CHILDREN = Symbol('end of children');

interface StyleIteratorState {
  /* output */
  offset: number;
  style: Style;
  done: boolean;
  /* private */
  parents: Inline[];
  stack: (InlineLevel | typeof END_CHILDREN)[];
  leader: InlineLevel | typeof END_CHILDREN;
  direction: 'ltr' | 'rtl';
  lastOffset: number;
  ifc: IfcInline;
}

export function createStyleIteratorState(ifc: IfcInline): StyleIteratorState {
  return {
    parents: [ifc],
    stack: ifc.children.slice().reverse(),
    leader: ifc,
    direction: ifc.style.direction,
    style: ifc.style,
    offset: 0,
    lastOffset: 0,
    ifc,
    done: false
  };
}

export function styleIteratorNext(state: StyleIteratorState) {
  if (state.done) return;

  state.lastOffset = state.offset;

  if (state.leader !== END_CHILDREN) {
    state.style = state.leader.style;
    if (state.leader.isRun()) state.offset += state.leader.length;
  }

  while (state.stack.length) {
    const item = state.stack.pop()!;
    const parent = state.parents.at(-1)!;

    if (item === END_CHILDREN) {
      state.parents.pop();

      if (state.direction === 'ltr' ? parent.hasLineRightGap() : parent.hasLineLeftGap()) {
        if (state.offset !== state.lastOffset) {
          state.leader = item;
          break;
        }
      }
      if (
        parent.style.verticalAlign !== 'baseline' ||
        parent.style.position === 'relative'
      ) {
        if (state.offset !== state.lastOffset) {
          state.leader = item;
          break;
        }
      }
    } else if (item.isRun()) {
      if (
        state.style.fontSize !== item.style.fontSize ||
        state.style.fontVariant !== item.style.fontVariant ||
        state.style.fontWeight !== item.style.fontWeight ||
        state.style.fontStyle !== item.style.fontStyle ||
        state.style.fontFamily.join(',') !== item.style.fontFamily.join(',')
      ) {
        if (state.offset !== state.lastOffset) {
          state.leader = item;
          break;
        }

        state.style = item.style;
      }

      state.offset += item.length;
    } else if (item.isInline()) {
      state.parents.push(item);

      state.stack.push(END_CHILDREN);
      for (let i = item.children.length - 1; i >= 0; --i) {
        state.stack.push(item.children[i]);
      }

      if (
        item.style.verticalAlign !== 'baseline' ||
        item.style.position === 'relative'
      ) {
        if (state.offset !== state.lastOffset) {
          state.leader = item;
          break;
        }
      }

      if (state.direction === 'ltr' ? item.hasLineLeftGap() : item.hasLineRightGap()) {
        if (state.offset !== state.lastOffset) {
          state.leader = item;
          break;
        }
      }
    } else if (item.isBreak()) {
      if (state.offset !== state.lastOffset) {
        state.leader = item;
        break;
      }
    } else if (item.isFloat()) {
      // OK
    } else { // inline-block
      if (state.offset !== state.lastOffset) {
        state.leader = item;
        break;
      }
    }
  }

  if (state.offset === state.ifc.text.length) state.done = true;
}

interface ShapingAttrs {
  isEmoji: boolean;
  level: number;
  script: string;
  style: Style;
}

interface ItemizeState {
  /* out */
  attrs: ShapingAttrs;
  offset: number;
  done: boolean;
  /* private */
  newlineState: NewlineIteratorState | undefined;
  inlineState: StyleIteratorState | undefined;
  emojiState: EmojiIteratorState | undefined;
  bidiState: BidiIteratorState | undefined;
  scriptState: ScriptIteratorState | undefined;
  simple: boolean;
  length: number;
  free: (() => void) | undefined;
}

export function createItemizeState(ifc: IfcInline): ItemizeState {
  let newlineState;
  let inlineState;
  let emojiState;
  let bidiState;
  let scriptState;
  let free;

  if (ifc.hasNewlines()) {
    newlineState = createNewlineIteratorState(ifc.text);
  }

  if (ifc.hasInlines() || ifc.hasBreaks() || ifc.hasInlineBlocks()) {
    inlineState = createStyleIteratorState(ifc);
  }

  if (ifc.isComplexText()) {
    const allocation = hb.allocateUint16Array(ifc.text.length);
    const initialLevel = ifc.style.direction === 'ltr' ? 0 : 1;
    const array = allocation.array;
    free = allocation.destroy;
    for (let i = 0; i < ifc.text.length; i++) array[i] = ifc.text.charCodeAt(i);
    emojiState = createEmojiIteratorState(array.byteOffset, array.length);
    bidiState = createBidiIteratorState(array.byteOffset, array.length, initialLevel);
    scriptState = createScriptIteratorState(array.byteOffset, array.length);
  }

  const attrs: ShapingAttrs = {
    isEmoji: emojiState?.isEmoji ?? false,
    level: bidiState?.level ?? 0,
    script: scriptState?.script ?? 'Latin',
    style: inlineState?.style ?? ifc.style
  };

  return {
    attrs,
    offset: 0,
    done: false,
    newlineState,
    inlineState,
    emojiState,
    bidiState,
    scriptState,
    simple: !newlineState && !inlineState && !emojiState && !bidiState && !scriptState,
    length: ifc.text.length,
    free
  };
}

export function itemizeNext(state: ItemizeState) {
  if (state.done) return;

  if (state.simple) {
    state.offset = state.length;
    state.done = true;
    return;
  }

  const {newlineState, inlineState, emojiState, bidiState, scriptState, offset} = state;

  // Advance
  if (newlineState?.offset === offset) newlineIteratorNext(newlineState);
  if (inlineState?.offset === offset) styleIteratorNext(inlineState);
  if (emojiState?.offset === offset) emojiIteratorNext(emojiState);
  if (bidiState?.offset === offset) bidiIteratorNext(bidiState);
  if (scriptState?.offset === offset) scriptIteratorNext(scriptState);

  // Map the current iterators to context
  if (inlineState) state.attrs.style = inlineState.style;
  if (emojiState) state.attrs.isEmoji = emojiState.isEmoji;
  if (bidiState) state.attrs.level = bidiState.level;
  if (scriptState) state.attrs.script = scriptState.script;

  state.offset = Math.min(
    newlineState?.offset ?? Infinity,
    inlineState?.offset ?? Infinity,
    emojiState?.offset ?? Infinity,
    bidiState?.offset ?? Infinity,
    scriptState?.offset ?? Infinity,
    state.length
  );

  if (
    (!newlineState || newlineState.done) &&
    (!inlineState || inlineState.done) &&
    (!emojiState || emojiState.done) &&
    (!bidiState || bidiState.done) &&
    (!scriptState || scriptState.done)
  ) {
    state.done = true;
    state.free?.();
    return;
  }
}

import {basename, loggableText, Logger} from './util.ts';
import {Box, BoxArea, TreeNode, Layout} from './layout-box.ts';
import {Style} from './style.ts';
import {
  BlockContainerOfInlines,
  IfcVacancy,
  Inline,
  layoutFloatBox,
  layoutContribution,
  createInlineIteratorState,
  inlineIteratorStateNext,
} from './layout-flow.ts';
import LineBreak, {HardBreaker} from './text-line-break.ts';
import {nextGraphemeBreak, previousGraphemeBreak} from './text-grapheme-break.ts';
import * as hb from './text-harfbuzz.ts';
import {getLangCascade} from './text-font.ts';
import {nameToTag} from '../gen/script-names.ts';
import {createItemizeState, itemizeNext} from './text-itemize.ts';

import type {LoadedFontFace} from './text-font.ts';
import type {HbFace, HbFont} from './text-harfbuzz.ts';
import type {TreeLogOptions} from './layout-box.ts';
import type {WhiteSpace} from './style.ts';
import type {
  BlockLevel,
  InlineLevel,
  LayoutContext,
  BlockFormattingContext
} from './layout-flow.ts';

const lineFeedCharacter = 0x000a;
const formFeedCharacter = 0x000c;
const carriageReturnCharacter = 0x000d;
const spaceCharacter = 0x0020;
const zeroWidthSpaceCharacter = 0x200b;
const objectReplacementCharacter = 0xfffc;

const decoder = new TextDecoder('utf-16');

const NON_ASCII_MASK = 0b1111_1111_1000_0000;

function isNowrap(whiteSpace: WhiteSpace) {
  return whiteSpace === 'nowrap' || whiteSpace === 'pre';
}

export function isSpaceOrTabOrNewline(c: string) {
  return c === ' ' || c === '\t' || c === '\n';
}

function isSpaceOrTab(c: string) {
  return c === ' ' || c === '\t';
}

function isNewline(c: string) {
  return c === '\n';
}

function isWordSeparator(c: string): boolean {
  // Specs say to treat U+1361, Ethiopic Word Space, as a word separator, but
  // digitized Ethiopic usually has spaces. Browsers don't support it either;
  // doing so would be complicated since the ink has to be centered. Specs also
  // say to handle Agean, Ugaritic, and Phoenician, but these are extinct.
  return c === ' ' || c === '\u00a0';
}

function graphemeBoundaries(text: string, index: number) {
  const graphemeEnd = nextGraphemeBreak(text, index);
  const graphemeStart = previousGraphemeBreak(text, graphemeEnd);
  return {graphemeStart, graphemeEnd};
}

export function nextGrapheme(text: string, index: number) {
  const {graphemeStart, graphemeEnd} = graphemeBoundaries(text, index);
  return graphemeStart < index ? graphemeEnd : index;
}

export function prevGrapheme(text: string, index: number) {
  const {graphemeStart} = graphemeBoundaries(text, index);
  return graphemeStart < index ? graphemeStart : index;
}

export class Run extends TreeNode {
  public textStart: number;
  public textEnd: number;

  static TEXT_BITS = Box.BITS.hasText
    | Box.BITS.hasForegroundInLayer
    | Box.BITS.hasForegroundInDescendent;

  constructor(start: number, end: number, style: Style) {
    super(style);
    this.textStart = start;
    this.textEnd = end;
  }

  get length() {
    return this.textEnd - this.textStart;
  }

  getLogSymbol() {
    return 'Ͳ';
  }

  get wsCollapsible() {
    return this.style.isWsCollapsible();
  }

  wrapsOverflowAnywhere(mode: 'min-content' | 'max-content' | 'normal') {
    if (mode === 'min-content') {
      return this.style.overflowWrap === 'anywhere'
        || this.style.wordBreak === 'break-word';
    } else {
      return this.style.overflowWrap === 'anywhere'
        || this.style.overflowWrap === 'break-word'
        || this.style.wordBreak === 'break-word';
    }
  }

  isRun(): this is Run {
    return true;
  }

  logName(log: Logger, options?: TreeLogOptions) {
    log.text(`${this.textStart},${this.textEnd}`);
    if (options?.paragraphText) {
      log.text(` "${loggableText(options.paragraphText.slice(this.textStart, this.textEnd))}"`);
    }
  }

  propagate(parent: Box, paragraph: string) {
    if (!parent.isInline()) throw new Error('Assertion failed');

    if (!this.style.isWsCollapsible()) {
      parent.bitfield |= Run.TEXT_BITS;
    }

    if (this.style.wordSpacing !== 'normal') {
      parent.bitfield |= Box.BITS.hasWordSpacing;
    }

    for (let i = this.textStart; i < this.textEnd; i++) {
      const code = paragraph.charCodeAt(i);

      if (code & NON_ASCII_MASK) {
        parent.bitfield |= Box.BITS.hasComplexText;
      }

      if (code === 0xad) {
        parent.bitfield |= Box.BITS.hasSoftHyphen;
      } else if (code === 0xa0) {
        parent.bitfield |= Box.BITS.hasNewlines;
      }

      if (!isSpaceOrTabOrNewline(paragraph[i])) {
        parent.bitfield |= Run.TEXT_BITS;
      }
    }

    if (!isNowrap(this.style.whiteSpace)) {
      parent.bitfield |= Box.BITS.hasSoftWrap;
    }
  }
}

export function collapseWhitespace(tree: InlineLevel[], block: BlockContainerOfInlines) {
  const str = new Uint16Array(block.text.length);
  const parents: Inline[] = [];
  let delta = 0;
  let index = 0;
  let inWhitespace = false;
  let treeDelta = 0;
  let w = block.treeStart + 2;

  for (let r = block.treeStart + 2; r <= block.treeFinal; r++) {
    const item = tree[r];

    if (item.isRun()) {
      const whiteSpace = item.style.whiteSpace;
      const originalStart = item.textStart;

      item.textStart -= delta;

      if (whiteSpace === 'normal' || whiteSpace === 'nowrap') {
        for (let i = originalStart; i < item.textEnd; i++) {
          const isWhitespace = isSpaceOrTabOrNewline(block.text[i]);

          if (inWhitespace && isWhitespace) {
            delta += 1;
          } else {
            str[index++] = isWhitespace ? spaceCharacter : block.text.charCodeAt(i);
          }

          inWhitespace = isWhitespace;
        }
      } else if (whiteSpace === 'pre-line') {
        for (let i = originalStart; i < item.textEnd; i++) {
          const isWhitespace = isSpaceOrTabOrNewline(block.text[i]);

          if (isWhitespace) {
            let j = i + 1;
            let hasNewline = isNewline(block.text[i]);

            for (; j < item.textEnd && isSpaceOrTabOrNewline(block.text[j]); j++) {
              hasNewline = hasNewline || isNewline(block.text[j]);
            }

            while (i < j) {
              if (isSpaceOrTab(block.text[i])) {
                if (inWhitespace || hasNewline) {
                  delta += 1;
                } else {
                  str[index++] = spaceCharacter;
                }
                inWhitespace = true;
              } else { // newline
                str[index++] = lineFeedCharacter;
                inWhitespace = false;
              }

              i++;
            }

            i = j - 1;
          } else {
            str[index++] = block.text.charCodeAt(i);
            inWhitespace = false;
          }
        }
      } else { // pre
        inWhitespace = false;
        for (let i = originalStart; i < item.textEnd; i++) {
          str[index++] = block.text.charCodeAt(i);
        }
      }

      item.textEnd -= delta;

      if (item.length) {
        tree[w++] = item;
      } else {
        treeDelta++;
      }
    } else if (item.isFormattingBox()) { // inline-block, float, etc
      item.treeStart -= treeDelta;
      if (item.isInlineLevel()) {
        inWhitespace = false;
      }
      tree[w++] = item;
      while (r + 1 <= item.treeFinal) {
        const item = tree[++r];
        if (item.isBox()) {
          item.treeStart -= treeDelta;
          item.treeFinal -= treeDelta;
        }
        tree[w++] = item;
      }
      item.treeFinal -= treeDelta;
    } else {
      tree[w++] = item;
      if (item.isInline()) {
        item.textStart -= delta;
        item.treeStart -= treeDelta;
        parents.push(item);
      }
    }

    while (parents.length && r === parents.at(-1)!.treeFinal) {
      const parent = parents.pop()!;
      parent.textEnd -= delta;
      parent.treeFinal -= treeDelta;
    }
  }

  const rootInline = tree[block.treeStart + 1];
  if (!rootInline.isInline()) throw new Error('Assertion failed!');
  rootInline.textEnd -= delta;
  rootInline.treeFinal -= treeDelta;
  block.treeFinal -= treeDelta;

  if (treeDelta > 0) {
    tree.length -= treeDelta;
  }

  block.text = decoder.decode(str.subarray(0, index));
}

export interface ShapingAttrs {
  isEmoji: boolean;
  level: number;
  script: string;
  style: Style;
}

const hyphenCache = new Map<string, {glyphs: Int32Array; codepoint: string}>();

export function getFontMetrics(inline: Inline) {
  const strutCascade = getLangCascade(inline.style, 'en');
  const [strutFace] = strutCascade;
  return getMetrics(inline.style, strutFace);
}

const {G_ID, G_CL, G_AX, G_FL, G_SZ} = hb;

const HyphenCodepointsToTry = '\u2010\u002d'; // HYPHEN, HYPHEN MINUS

function createHyphenCacheKey(item: ShapedItem) {
  return item.face.url.href;
}

function loadHyphen(item: ShapedItem) {
  const key = createHyphenCacheKey(item);

  if (!hyphenCache.has(key)) {
    hyphenCache.set(key, {codepoint: '', glyphs: new Int32Array(0)});

    for (const codepoint of HyphenCodepointsToTry) {
      const buf = hb.createBuffer();
      buf.setClusterLevel(1);
      buf.addText(codepoint);
      buf.guessSegmentProperties();
      hb.shape(item.face.hbfont, buf);
      const glyphs = buf.extractGlyphs();
      buf.destroy();
      if (glyphs[G_ID]) {
        hyphenCache.set(key, {codepoint, glyphs});
        break;
      }
    }
  }
}

function getHyphen(item: ShapedItem) {
  return hyphenCache.get(createHyphenCacheKey(item));
}

// Generated from pango-language.c
// TODO: why isn't Han (Hant/Hans/Hani) in here?
const LANG_FOR_SCRIPT:{[script: string]: string} = {
  Arabic: 'ar',
  Armenian: 'hy',
  Bengali: 'bn',
  Cherokee: 'chr',
  Coptic: 'cop',
  Cyrillic: 'ru',
  Devanagari: 'hi',
  Ethiopic: 'am',
  Georgian: 'ka',
  Greek: 'el',
  Gujarati: 'gu',
  Gurmukhi: 'pa',
  Hangul: 'ko',
  Hebrew: 'he',
  Hiragana: 'ja',
  Kannada: 'kn',
  Katakana: 'ja',
  Khmer: 'km',
  Lao: 'lo',
  Latin: 'en',
  Malayalam: 'ml',
  Mongolian: 'mn',
  Myanmar: 'my',
  Oriya: 'or',
  Sinhala: 'si',
  Syriac: 'syr',
  Tamil: 'ta',
  Telugu: 'te',
  Thaana: 'dv',
  Thai: 'th',
  Tibetan: 'bo',
  Canadian_Aboriginal: 'iu',
  Tagalog: 'tl',
  Hanunoo: 'hnn',
  Buhid: 'bku',
  Tagbanwa: 'tbw',
  Ugaritic: 'uga',
  Buginese: 'bug',
  Syloti_Nagri: 'syl',
  Old_Persian: 'peo',
  Nko: 'nqo'
};

export function langForScript(script: string) {
  return LANG_FOR_SCRIPT[script] || 'xx';
}

const metricsCache = new WeakMap<Style, WeakMap<HbFace, InlineMetrics>>();

// exported because used by html painter
export function getMetrics(style: Style, face: LoadedFontFace): InlineMetrics {
  let metrics = metricsCache.get(style)?.get(face.hbface);
  if (metrics) return metrics;
  const fontSize = style.fontSize;
  // now do CSS2 §10.8.1
  const {ascender, xHeight, descender, lineGap} = face.hbfont.getMetrics('ltr'); // TODO vertical text
  const toPx = 1 / face.hbface.upem * fontSize;
  const pxHeight = (ascender - descender) * toPx;
  const lineHeight = style.lineHeight === 'normal' ? pxHeight + lineGap * toPx : style.lineHeight;
  const halfLeading = (lineHeight - pxHeight) / 2;
  const ascenderPx = ascender * toPx;
  const descenderPx = -descender * toPx;

  metrics = {
    ascenderBox: halfLeading + ascenderPx,
    ascender: ascenderPx,
    superscript: 0.34 * fontSize, // magic numbers come from Searchfox.
    xHeight: xHeight * toPx,
    subscript: 0.20 * fontSize,   // all browsers use them instead of metrics
    descender: descenderPx,
    descenderBox: halfLeading + descenderPx
  };

  let map1 = metricsCache.get(style);
  if (!map1) metricsCache.set(style, map1 = new WeakMap());

  map1.set(face.hbface, metrics);

  return metrics;
}

export function nextCluster(glyphs: Int32Array, index: number) {
  const cl = glyphs[index + G_CL];
  while ((index += G_SZ) < glyphs.length && cl == glyphs[index + G_CL])
    ;
  return index;
}

export function prevCluster(glyphs: Int32Array, index: number) {
  const cl = glyphs[index + G_CL];
  while ((index -= G_SZ) >= 0 && cl == glyphs[index + G_CL])
    ;
  return index;
}

interface GlyphIteratorState {
  glyphIndex: number;
  clusterStart: number;
  clusterEnd: number;
  needsReshape: boolean;
  glyphs: Int32Array;
  level: number;
  textEnd: number;
  done: boolean;
}

function createGlyphIteratorState(
  glyphs: Int32Array,
  level: number,
  textStart: number,
  textEnd: number
) {
  const glyphIndex = level & 1 ? glyphs.length - G_SZ : 0;

  return {
    glyphIndex,
    clusterStart: textStart,
    clusterEnd: textStart,
    needsReshape: false,
    glyphs,
    level,
    textEnd,
    done: false
  };
}

function nextGlyph(state: GlyphIteratorState) {
  state.needsReshape = false;

  if (state.level & 1) {
    if (state.glyphIndex < 0) {
      state.done = true;
      return;
    }

    state.clusterStart = state.clusterEnd;

    while (state.glyphIndex >= 0 && state.clusterEnd === state.glyphs[state.glyphIndex + G_CL]) {
      if (state.glyphs[state.glyphIndex + G_ID] === 0) state.needsReshape = true;
      state.glyphIndex -= G_SZ;
    }

    if (state.glyphIndex < 0) {
      state.clusterEnd = state.textEnd;
    } else {
      state.clusterEnd = state.glyphs[state.glyphIndex + G_CL];
    }
  } else {
    if (state.glyphIndex === state.glyphs.length) {
      state.done = true;
      return;
    }

    state.clusterStart = state.clusterEnd;

    while (state.glyphIndex < state.glyphs.length && state.clusterEnd === state.glyphs[state.glyphIndex + G_CL]) {
      if (state.glyphs[state.glyphIndex + G_ID] === 0) state.needsReshape = true;
      state.glyphIndex += G_SZ;
    }

    if (state.glyphIndex === state.glyphs.length) {
      state.clusterEnd = state.textEnd;
    } else {
      state.clusterEnd = state.glyphs[state.glyphIndex + G_CL];
    }
  }
}

function shiftGlyphs(glyphs: Int32Array, offset: number, dir: 'ltr' | 'rtl') {
  if (dir === 'ltr') {
    for (let i = 0; i < glyphs.length; i += G_SZ) {
      if (glyphs[i + G_CL] >= offset) {
        return {leftGlyphs: glyphs.subarray(0, i), rightGlyphs: glyphs.subarray(i)};
      }
    }
  } else {
    for (let i = glyphs.length - G_SZ; i >= 0; i -= G_SZ) {
      if (glyphs[i + G_CL] >= offset) {
        return {leftGlyphs: glyphs.subarray(i + G_SZ), rightGlyphs: glyphs.subarray(0, i + G_SZ)};
      }
    }
  }

  return {leftGlyphs: glyphs, rightGlyphs: new Int32Array(0)};
}

interface MeasureState {
  glyphIndex: number;
  characterIndex: number;
  clusterStart: number;
  clusterEnd: number;
  clusterAdvance: number;
  isInk: boolean;
  done: boolean;
}

export interface InlineMetrics {
  ascenderBox: number;
  ascender: number;
  superscript: number;
  xHeight: number;
  subscript: number;
  descender: number;
  descenderBox: number;
}

export const EmptyInlineMetrics: Readonly<InlineMetrics> = Object.freeze({
  ascenderBox: 0,
  ascender: 0,
  superscript: 0,
  xHeight: 0,
  subscript: 0,
  descender: 0,
  descenderBox: 0
});

class WordIterator {
  item: ShapedItem;
  textEnd: number;
  state: MeasureState;
  /* out */
  start: number;
  end: number;
  x: number;
  w: number;
  done: boolean;

  constructor(item: ShapedItem, textStart: number, textEnd: number) {
    this.item = item;
    this.textEnd = textEnd;
    this.state = item.createMeasureState();
    this.start = textStart;
    this.end = textStart;
    this.x = 0;
    this.w = 0;
    this.done = false;
    item.measure(textStart, 1, this.state);
    this.next();
  }

  next() {
    const s = this.item.block.text;
    while (this.end < this.textEnd && isWordSeparator(s[this.end])) this.end++;
    this.start = this.end;
    while (this.end < this.textEnd && !isWordSeparator(s[this.end])) this.end++;
    if (this.start < this.end) {
      this.x = this.item.measure(this.start, 1, this.state).advance;
      this.w = this.item.measure(this.end, 1, this.state).advance;
    } else {
      this.done = true;
    }
  }
}

export class ShapedItem {
  block: BlockContainerOfInlines;
  face: LoadedFontFace;
  glyphs: Int32Array;
  offset: number;
  length: number;
  attrs: ShapingAttrs;
  x: number;
  y: number;

  constructor(
    block: BlockContainerOfInlines,
    face: LoadedFontFace,
    glyphs: Int32Array,
    offset: number,
    length: number,
    attrs: ShapingAttrs
  ) {
    this.block = block;
    this.face = face;
    this.glyphs = glyphs;
    this.offset = offset;
    this.length = length;
    this.attrs = attrs;
    this.x = 0;
    this.y = 0;
  }

  clone() {
    return new ShapedItem(
      this.block,
      this.face,
      this.glyphs.slice(),
      this.offset,
      this.length,
      this.attrs
    );
  }

  split(offset: number) {
    const dir = this.attrs.level & 1 ? 'rtl' : 'ltr';
    const {leftGlyphs, rightGlyphs} = shiftGlyphs(this.glyphs, this.offset + offset, dir);
    const needsReshape = Boolean(rightGlyphs[G_FL] & 1)
      || rightGlyphs[G_CL] !== this.offset + offset // cluster break
      || isInsideGraphemeBoundary(this.block.text, this.offset + offset);
    const right = new ShapedItem(
      this.block,
      this.face,
      rightGlyphs,
      this.offset + offset,
      this.length - offset,
      this.attrs
    );

    this.glyphs = leftGlyphs;
    this.length = offset;

    return {needsReshape, right};
  }

  reshape(walkBackwards: boolean) {
    if (walkBackwards && !(this.attrs.level & 1) || !walkBackwards && this.attrs.level & 1) {
      let i = this.glyphs.length - G_SZ;
      while ((i = prevCluster(this.glyphs, i)) >= 0) {
        if (!(this.glyphs[i + G_FL] & 2) && !(this.glyphs[i + G_SZ + G_FL] & 2)) {
          const offset = this.attrs.level & 1 ? this.offset : this.glyphs[i + G_SZ + G_CL];
          const length = this.attrs.level & 1 ? this.glyphs[i + G_CL] - offset : this.end() - offset;
          const newGlyphs = shapePart(this.block, offset, length, this.face, this.attrs);
          if (!(newGlyphs[G_FL] & 2)) {
            const glyphs = new Int32Array(i + G_SZ + newGlyphs.length);
            glyphs.set(this.glyphs.subarray(0, i + G_SZ), 0);
            glyphs.set(newGlyphs, i + G_SZ);
            this.glyphs = glyphs;
            return;
          }
        }
      }
    } else {
      let i = 0;
      while ((i = nextCluster(this.glyphs, i)) < this.glyphs.length) {
        if (!(this.glyphs[i - G_SZ + G_FL] & 2) && !(this.glyphs[i + G_FL] & 2)) {
          const offset = this.attrs.level & 1 ? this.glyphs[i + G_CL] : this.offset;
          const length = this.attrs.level & 1 ? this.end() - offset : this.glyphs[i + G_CL] - this.offset;
          const newGlyphs = shapePart(this.block, offset, length, this.face, this.attrs);
          if (!(newGlyphs.at(-G_SZ + G_FL)! & 2)) {
            const glyphs = new Int32Array(this.glyphs.length - i + newGlyphs.length);
            glyphs.set(newGlyphs, 0);
            glyphs.set(this.glyphs.subarray(i), newGlyphs.length);
            this.glyphs = glyphs;
            return;
          }
        }
      }
    }

    this.glyphs = shapePart(this.block, this.offset, this.length, this.face, this.attrs);
  }

  createMeasureState(direction: 1 | -1 = 1) {
    let glyphIndex;

    if (this.attrs.level & 1) {
      glyphIndex = direction === 1 ? this.glyphs.length - G_SZ : 0;
    } else {
      glyphIndex = direction === 1 ? 0 : this.glyphs.length - G_SZ;
    }

    return {
      glyphIndex,
      characterIndex: direction === 1 ? -1 : this.end(),
      clusterStart: this.glyphs[glyphIndex + G_CL],
      clusterEnd: this.glyphs[glyphIndex + G_CL],
      clusterAdvance: 0,
      isInk: false,
      done: false
    }
  }

  nextCluster(direction: 1 | -1, state: MeasureState) {
    const inc = this.attrs.level & 1 ? direction === 1 ? -G_SZ : G_SZ : direction === 1 ? G_SZ : -G_SZ;
    const g = this.glyphs;
    let glyphIndex = state.glyphIndex;

    if (glyphIndex in g) {
      const cl = g[glyphIndex + G_CL];
      let w = 0;

      while (glyphIndex in g && cl == g[glyphIndex + G_CL]) {
        w += g[glyphIndex + G_AX];
        glyphIndex += inc;
      }

      if (direction === 1) {
        state.clusterStart = state.clusterEnd;
        state.clusterEnd = glyphIndex in g ? g[glyphIndex + G_CL] : this.end();
      } else {
        state.clusterEnd = state.clusterStart;
        state.clusterStart = cl;
      }

      state.glyphIndex = glyphIndex;
      state.clusterAdvance = w;
      state.isInk = isink(this.block.text[cl]);
    } else {
      state.done = true;
    }
  }

  measureInsideCluster(state: MeasureState, ci: number) {
    const s = this.block.text.slice(state.clusterStart, state.clusterEnd);
    const restrictedCi = Math.max(state.clusterStart, Math.min(ci, state.clusterEnd));
    const numCharacters = Math.abs(restrictedCi - state.characterIndex);
    let w = 0;
    let numGraphemes = 0;

    for (let i = 0; i < s.length; i = nextGraphemeBreak(s, i)) {
      numGraphemes += 1;
    }

    if (numGraphemes > 1) {
      const clusterSize = state.clusterEnd - state.clusterStart;
      const cursor = Math.floor(numGraphemes * numCharacters / clusterSize);
      w += state.clusterAdvance * cursor / numGraphemes;
    }

    return w;
  }

  measure(ci = this.end(), direction: 1 | -1 = 1, state = this.createMeasureState(direction)) {
    const toPx = 1 / this.face.hbface.upem * this.attrs.style.fontSize;
    let advance = 0;
    let trailingWs = 0;

    if (state.characterIndex > state.clusterStart && state.characterIndex < state.clusterEnd) {
      advance += this.measureInsideCluster(state, ci);
      trailingWs = state.isInk ? 0 : trailingWs + state.clusterAdvance;
      if (ci > state.clusterStart && ci < state.clusterEnd) {
        state.characterIndex = ci;
        return {advance: advance * toPx, trailingWs: trailingWs * toPx};
      } else {
        this.nextCluster(direction, state);
      }
    }

    while (!state.done && (direction === 1 ? ci >= state.clusterEnd : ci <= state.clusterStart)) {
      advance += state.clusterAdvance;
      trailingWs = state.isInk ? 0 : trailingWs + state.clusterAdvance;
      this.nextCluster(direction, state);
    }

    state.characterIndex = direction === 1 ? state.clusterStart : state.clusterEnd;

    if (ci > state.clusterStart && ci < state.clusterEnd) {
      advance += this.measureInsideCluster(state, ci);
      state.characterIndex = ci;
    }

    return {advance: advance * toPx, trailingWs: trailingWs * toPx};
  }

  end() {
    return this.offset + this.length;
  }

  hasCharacterInside(ci: number) {
    return ci > this.offset && ci < this.end();
  }

  createWordIterator(textStart: number, textEnd: number) {
    return new WordIterator(this, textStart, textEnd);
  }

  mayHaveModifiedWordSepGlyphs(layout: Layout) {
    const parent = layout.tree[this.block.treeStart + 1];
    if (!parent.isInline()) throw new Error('Assertion failed');
    return parent.hasWordSpacing() || parent.style.textAlign === 'justify';
  }

  // only use this in debugging or tests
  text() {
    return this.block.text.slice(this.offset, this.offset + this.length);
  }
}

class LineItem {
  startSpace: number;
  startProgress: number;
  textStart: number;
  itemIndex: number;
  treeIndex: number;
  inlineSpace: number;
  textEnd: number;
  endSpace: number;
  endProgress: number;

  constructor(
    treeIndex: number,
    itemIndex: number,
    textStart: number,
    textEnd: number,
    advance: number
  ) {
    this.startSpace = 0;
    this.startProgress = 0;
    this.textStart = textStart;
    this.itemIndex = itemIndex;
    this.treeIndex = treeIndex;
    this.inlineSpace = advance;
    this.textEnd = textEnd;
    this.endSpace = 0;
    this.endProgress = 0;
  }

  isUnknown() {
    return this.treeIndex === 0;
  }

  canConcat(item: LineItem) {
    return this.treeIndex === 0
      || this.itemIndex === item.itemIndex && this.treeIndex === item.treeIndex;
  }
}

class LineFragments {
  textStart: number;
  textEnd: number;
  treeStart: number;
  treeFinal: number;
  itemStart: number;
  itemEnd: number;
  items: LineItem[];

  constructor(treeIndex: number) {
    this.textStart = 0;
    this.textEnd = 0;
    this.treeStart = treeIndex;
    this.treeFinal = treeIndex;
    this.itemStart = 0;
    this.itemEnd = 0;
    this.items = [];
  }

  clear() {
    this.textStart = this.textEnd;
    this.treeStart = this.treeFinal;
    this.itemStart = this.itemEnd;
    this.items = [];
  }

  hasContent(layout: Layout) {
    if (
      this.textStart < this.textEnd ||
      this.treeStart < this.treeFinal
    ) {
      return true;
    } else {
      const box = layout.tree[this.treeStart];
      return box.isFormattingBox() && !box.isOutOfFlow();
    }
  }

  concat(fragments: LineFragments) {
    if (fragments.items.length) {
      const item = fragments.items[0];
      const last = this.items.length ? this.items[this.items.length - 1] : undefined;
      if (last?.canConcat(item)) {
        last.textEnd = item.textEnd;
        last.itemIndex = item.itemIndex;
        last.inlineSpace += item.inlineSpace;
        last.endSpace = item.endSpace;
      } else {
        this.items.push(item);
      }
      for (let i = 1; i < fragments.items.length; i++) this.items.push(fragments.items[i]);
      this.textEnd = fragments.textEnd;
      this.treeFinal = fragments.treeFinal;
      this.itemEnd = fragments.itemEnd;
    }
  }

  addBox(treeStart: number, treeFinal: number, inlineSpace: number) {
    const last = this.items.length ? this.items[this.items.length - 1] : undefined;

    if (last?.isUnknown()) {
      last.treeIndex = treeStart;
      last.inlineSpace = inlineSpace;
    } else {
      const {itemEnd, textEnd} = this;
      const item = new LineItem(treeStart, itemEnd, textEnd, textEnd, inlineSpace);
      this.items.push(item);
    }

    this.treeFinal = treeFinal;
  }

  inlinePre(startSpace: number) {
    let item = this.items.length ? this.items[this.items.length - 1] : undefined;
    if (!item?.isUnknown()) {
      item = new LineItem(0, this.itemEnd, this.textEnd, this.textEnd, 0);
      this.items.push(item);
    }
    item.startSpace += startSpace;
  }

  inlinePost(endSpace: number) {
    const item = this.items.length ? this.items[this.items.length - 1] : undefined;
    if (!item) throw new Error('Assertion failed');
    item.endSpace += endSpace;
  }

  split() {
    for (const item of this.items) item.itemIndex++;
    this.itemStart++;
    this.itemEnd++;
  }

  onItemStart() {
    this.itemEnd++;
  }

  addText(treeIndex: number, textOffset: number, advance: number) {
    const last = this.items.length ? this.items[this.items.length - 1] : undefined;
    const itemIndex = this.itemEnd - 1;

    if (last?.treeIndex === 0) {
      last.treeIndex = treeIndex;
      last.itemIndex = itemIndex;
      last.textEnd = textOffset;
      last.inlineSpace += advance;
    } else if (last?.treeIndex === treeIndex && last.itemIndex === itemIndex) {
      last.textEnd = textOffset;
      last.inlineSpace += advance;
    } else {
      const textEnd = this.textEnd;
      const item = new LineItem(treeIndex, itemIndex, textEnd, textOffset, advance);
      this.items.push(item);
    }

    this.textEnd = textOffset;
    this.treeFinal = treeIndex;
  }
}

class LineWidthTracker {
  private inkSeen: boolean;
  private startWs: number;
  private startWsC: number;
  private ink: number;
  private endWs: number;
  private endWsC: number;
  private hyphen: number;

  constructor() {
    this.inkSeen = false;
    this.startWs = 0;
    this.startWsC = 0;
    this.ink = 0;
    this.endWs = 0;
    this.endWsC = 0;
    this.hyphen = 0;
  }

  addInk(width: number) {
    this.ink += this.endWs + width;
    this.endWs = 0;
    this.endWsC = 0;
    this.hyphen = 0;
    if (width) this.inkSeen = true;
  }

  addWs(width: number, isCollapsible: boolean) {
    if (this.inkSeen) {
      this.endWs += width;
      this.endWsC += isCollapsible ? width : 0;
    } else {
      this.startWs += width;
      this.startWsC += isCollapsible ? width : 0;
    }

    this.hyphen = 0;
  }

  hasContent() {
    return this.inkSeen || this.startWs - this.startWsC > 0;
  }

  addHyphen(width: number) {
    this.hyphen = width;
  }

  concat(width: LineWidthTracker) {
    if (this.inkSeen) {
      if (width.inkSeen) {
        this.ink += this.endWs + width.startWs + width.ink;
        this.endWs = width.endWs;
        this.endWsC = width.endWsC;
      } else {
        this.endWs += width.startWs;
        this.endWsC = width.startWsC + width.endWsC;
      }
    } else {
      this.startWs += width.startWs;
      this.startWsC += width.startWsC;
      this.ink = width.ink;
      this.endWs = width.endWs;
      this.endWsC = width.endWsC;
      this.inkSeen = width.inkSeen;
    }

    this.hyphen = width.hyphen;
  }

  forFloat() {
    return this.startWs - this.startWsC + this.ink + this.hyphen;
  }

  forWord() {
    return this.startWs - this.startWsC + this.ink + this.endWs;
  }

  asWord() {
    return this.startWs + this.ink + this.hyphen;
  }

  trimmed() {
    return this.startWs - this.startWsC + this.ink + this.endWs - this.endWsC + this.hyphen;
  }

  reset() {
    this.inkSeen = false;
    this.startWs = 0;
    this.startWsC = 0;
    this.ink = 0;
    this.endWs = 0;
    this.endWsC = 0;
    this.hyphen = 0;
  }
}

function baselineStep(parent: Inline, inline: Inline) {
  if (inline.style.verticalAlign === 'baseline') {
    return 0;
  }

  if (inline.style.verticalAlign === 'super') {
    return parent.metrics.superscript;
  }

  if (inline.style.verticalAlign === 'sub') {
    return -parent.metrics.subscript;
  }

  if (inline.style.verticalAlign === 'middle') {
    const midParent = parent.metrics.xHeight / 2;
    const midInline = (inline.metrics.ascender - inline.metrics.descender) / 2;
    return midParent - midInline;
  }

  if (inline.style.verticalAlign === 'text-top') {
    return parent.metrics.ascender - inline.metrics.ascenderBox;
  }

  if (inline.style.verticalAlign === 'text-bottom') {
    return inline.metrics.descenderBox - parent.metrics.descender;
  }

  if (typeof inline.style.verticalAlign === 'object') {
    return (inline.metrics.ascenderBox + inline.metrics.descenderBox) * inline.style.verticalAlign.value / 100;
  }

  if (typeof inline.style.verticalAlign === 'number') {
    return inline.style.verticalAlign;
  }

  return 0;
}

function getLastBaseline(layout: Layout, block: BlockLevel) {
  const stack = [{block, offset: 0}];

  while (stack.length) {
    const {block, offset} = stack.pop()!;

    if (block.isReplacedBox()) {
      return undefined;
    } else if (block.isBlockContainerOfInlines()) {
      const rootInline = layout.tree[block.treeStart + 1];
      if (!rootInline.isInline()) throw new Error('Assertion failed');
      for (let i = block.fragments.length - 1; i >= 0; i--) {
        const fragment = block.fragments[i];
        if (fragment.treeIndex === rootInline.treeStart) {
          return offset + fragment.blockOffset;
        }
      }
    } else {
      const parentOffset = offset;
      const children: InlineLevel[] = [];
      let i = block.treeStart + 1;

      while (i <= block.treeFinal) {
        const child = layout.tree[i];
        children.push(child);
        i = child.isBox() ? i + child.treeFinal : i + 1;
      }

      for (const child of children.reverse()) {
        if (child.isBlockContainer()) {
          const containingBlock = child.getContainingBlock();
          const offset = parentOffset
            + child.getBorderArea().blockStart
            + child.style.getBorderBlockStartWidth(containingBlock)
            + child.style.getPaddingBlockStart(containingBlock);

          stack.push({block: child, offset});
        }
      }
    }
  }
}

export function inlineBlockMetrics(layout: Layout, box: BlockLevel) {
  const containingBlock = box.getContainingBlock();
  const margins = box.getMarginsAutoIsZero(containingBlock);
  const baseline = box.style.overflow === 'hidden' ? undefined : getLastBaseline(layout, box);
  let ascender, descender;

  if (baseline !== undefined) {
    const paddingBlockStart = box.style.getPaddingBlockStart(containingBlock);
    const paddingBlockEnd = box.style.getPaddingBlockEnd(containingBlock);
    const borderBlockStart = box.style.getBorderBlockStartWidth(containingBlock);
    const borderBlockEnd = box.style.getBorderBlockEndWidth(containingBlock);
    const blockSize = box.getContentArea().blockSize;
    ascender = margins.blockStart + borderBlockStart + paddingBlockStart + baseline;
    descender = (blockSize - baseline) + paddingBlockEnd + borderBlockEnd + margins.blockEnd;
  } else {
    ascender = margins.blockStart + box.getBorderArea().blockSize + margins.blockEnd;
    descender = 0;
  }

  return {ascender, descender};
}

function inlineBlockBaselineStep(
  layout: Layout,
  parent: Inline,
  box: BlockLevel
) {
  if (box.style.overflow === 'hidden') {
    return 0;
  }

  if (box.style.verticalAlign === 'baseline') {
    return 0;
  }

  if (box.style.verticalAlign === 'super') {
    return parent.metrics.superscript;
  }

  if (box.style.verticalAlign === 'sub') {
    return -parent.metrics.subscript;
  }

  if (box.style.verticalAlign === 'middle') {
    const {ascender, descender} = inlineBlockMetrics(layout, box);
    const midParent = parent.metrics.xHeight / 2;
    const midInline = (ascender - descender) / 2;
    return midParent - midInline;
  }

  if (box.style.verticalAlign === 'text-top') {
    const {ascender} = inlineBlockMetrics(layout, box);
    return parent.metrics.ascender - ascender;
  }

  if (box.style.verticalAlign === 'text-bottom') {
    const {descender} = inlineBlockMetrics(layout, box);
    return descender - parent.metrics.descender;
  }

  if (typeof box.style.verticalAlign === 'object') {
    const lineHeight = box.style.lineHeight;
    if (lineHeight === 'normal') {
      // TODO: is there a better/faster way to do this? currently struts only
      // exist if there is a paragraph, but I think spec is saying do this
      const [strutFace] = getLangCascade(box.style, 'en');
      const metrics = getMetrics(box.style, strutFace);
      return (metrics.ascenderBox + metrics.descenderBox) * box.style.verticalAlign.value / 100;
    } else {
      return lineHeight * box.style.verticalAlign.value / 100;
    }
  }

  if (typeof box.style.verticalAlign === 'number') {
    return box.style.verticalAlign;
  }

  return 0;
}

class AlignmentContext {
  ascender: number;
  descender: number;
  baselineShift: number;

  constructor(arg: InlineMetrics | AlignmentContext) {
    if (arg instanceof AlignmentContext) {
      this.ascender = arg.ascender;
      this.descender = arg.descender;
      this.baselineShift = arg.baselineShift;
    } else {
      this.ascender = arg.ascenderBox;
      this.descender = arg.descenderBox;
      this.baselineShift = 0;
    }
  }

  stampMetrics(metrics: InlineMetrics) {
    const top = this.baselineShift + metrics.ascenderBox;
    const bottom = metrics.descenderBox - this.baselineShift;
    this.ascender = Math.max(this.ascender, top);
    this.descender = Math.max(this.descender, bottom);
  }

  stampBlock(layout: Layout, box: BlockLevel, parent: Inline) {
    const {ascender, descender} = inlineBlockMetrics(layout, box);
    const baselineShift = this.baselineShift + inlineBlockBaselineStep(layout, parent, box);
    const top = baselineShift + ascender;
    const bottom = descender - baselineShift;
    this.ascender = Math.max(this.ascender, top);
    this.descender = Math.max(this.descender, bottom);
  }

  extend(ctx: AlignmentContext) {
    this.ascender = Math.max(this.ascender, ctx.ascender);
    this.descender = Math.max(this.descender, ctx.descender);
  }

  stepIn(parent: Inline, inline: Inline) {
    this.baselineShift += baselineStep(parent, inline);
  }

  stepOut(parent: Inline, inline: Inline) {
    this.baselineShift -= baselineStep(parent, inline);
  }

  reset() {
    this.ascender = 0;
    this.descender = 0;
    this.baselineShift = 0;
  }
}

class LineCandidates extends LineFragments {
  width: LineWidthTracker;
  height: LineHeightTracker;

  constructor(layout: Layout, block: BlockContainerOfInlines) {
    super(block.treeStart + 2);
    this.width = new LineWidthTracker();
    this.height = new LineHeightTracker(layout, block);
  }

  clearContents() {
    this.width.reset();
    this.height.clearContents();
    this.clear();
  }
};

const EMPTY_MAP = Object.freeze(new Map());

class LineHeightTracker {
  layout: Layout;
  block: BlockContainerOfInlines;
  parents: Inline[];
  contextStack: AlignmentContext[];
  contextRoots: Map<Inline, AlignmentContext>;
  /** Inline blocks, images */
  boxes: BlockLevel[];
  markedContextRoots: Inline[];

  constructor(layout: Layout, block: BlockContainerOfInlines) {
    const inline = layout.tree[block.treeStart + 1];
    if (!inline.isInline()) throw new Error('Assertion failed');
    const ctx = new AlignmentContext(inline.metrics);

    this.layout = layout;
    this.block = block;
    this.parents = [inline];
    this.contextStack = [ctx];
    this.contextRoots = EMPTY_MAP;
    this.boxes = [];
    this.markedContextRoots = [];
  }

  stampMetrics(metrics: InlineMetrics) {
    this.contextStack.at(-1)!.stampMetrics(metrics);
  }

  stampBlock(box: BlockLevel, parent: Inline) {
    if (box.style.verticalAlign === 'top' || box.style.verticalAlign === 'bottom') {
      this.boxes.push(box);
    } else {
      this.contextStack.at(-1)!.stampBlock(this.layout, box, parent);
    }
  }

  pushInline(inline: Inline) {
    const parent = this.parents.at(-1)!;
    let ctx = this.contextStack.at(-1)!;

    this.parents.push(inline);

    if (inline.style.verticalAlign === 'top' || inline.style.verticalAlign === 'bottom') {
      if (this.contextRoots === EMPTY_MAP) this.contextRoots = new Map();
      ctx = new AlignmentContext(inline.metrics);
      this.contextStack.push(ctx);
      this.contextRoots.set(inline, ctx);
    } else {
      ctx.stepIn(parent, inline);
      ctx.stampMetrics(inline.metrics);
    }
  }

  popInline() {
    const inline = this.parents.pop()!;

    if (inline.style.verticalAlign === 'top' || inline.style.verticalAlign === 'bottom') {
      this.contextStack.pop()!
      this.markedContextRoots.push(inline);
    } else {
      const parent = this.parents.at(-1)!;
      const ctx = this.contextStack.at(-1)!;
      ctx.stepOut(parent, inline);
    }
  }

  concat(height: LineHeightTracker) {
    const thisCtx = this.contextStack[0];
    const otherCtx = height.contextStack[0];

    thisCtx.extend(otherCtx);

    if (height.contextRoots.size) {
      for (const [inline, ctx] of height.contextRoots) {
        const thisCtx = this.contextRoots.get(inline);
        if (thisCtx) {
          thisCtx.extend(ctx);
        } else {
          if (this.contextRoots === EMPTY_MAP) this.contextRoots = new Map();
          this.contextRoots.set(inline, new AlignmentContext(ctx));
        }
      }
    }

    for (const box of height.boxes) this.boxes.push(box);
  }

  align(): {ascender: number, descender: number} {
    const rootCtx = this.contextStack[0];

    if (this.contextRoots.size === 0 && this.boxes.length === 0) return rootCtx;

    const lineHeight = this.total();
    let bottomsHeight = rootCtx.ascender + rootCtx.descender;

    for (const [inline, ctx] of this.contextRoots) {
      if (inline.style.verticalAlign === 'bottom') {
        bottomsHeight = Math.max(bottomsHeight, ctx.ascender + ctx.descender);
      }
    }

    for (const box of this.boxes) {
      if (box.style.verticalAlign === 'bottom') {
        const blockSize = box.getBorderArea().blockSize;
        const containingBlock = box.getContainingBlock();
        const {blockStart, blockEnd} = box.getMarginsAutoIsZero(containingBlock);
        bottomsHeight = Math.max(bottomsHeight, blockStart + blockSize + blockEnd);
      }
    }

    const ascender = bottomsHeight - rootCtx.descender;
    const descender = lineHeight - ascender;

    for (const [inline, ctx] of this.contextRoots) {
      if (inline.style.verticalAlign === 'top') {
        ctx.baselineShift = ascender - ctx.ascender;
      } else if (inline.style.verticalAlign === 'bottom') {
        ctx.baselineShift = ctx.descender - descender;
      }
    }

    return {ascender, descender};
  }

  total() {
    let height = this.contextStack[0].ascender + this.contextStack[0].descender;
    if (this.contextRoots.size === 0 && this.boxes.length === 0) {
      return height;
    } else {
      for (const ctx of this.contextRoots.values()) {
        height = Math.max(height, ctx.ascender + ctx.descender);
      }
      for (const box of this.boxes) {
        const blockSize = box.getBorderArea().blockSize;
        const {blockStart, blockEnd} = box.getMarginsAutoIsZero(box.getContainingBlock());
        height = Math.max(height, blockStart + blockSize + blockEnd);
      }
      return height;
    }
  }

  totalWith(height: LineHeightTracker) {
    return Math.max(this.total(), height.total());
  }

  reset() {
    const ctx = new AlignmentContext(this.parents[0].metrics);
    this.parents.splice(1, this.parents.length - 1);
    this.contextStack = [ctx];
    this.contextRoots = EMPTY_MAP;
    this.boxes = [];
    this.markedContextRoots = [];
  }

  clearContents() {
    let parent = this.parents[0];
    let inline = this.parents.length > 1 ? this.parents[1] : undefined;
    let i = 1;

    if (
      this.contextStack.length === 1 && // no vertical-align top or bottoms
      this.parents.length <= 2 // one non-top/bottom/baseline parent or none
    ) {
      const [ctx] = this.contextStack;
      ctx.reset();
      ctx.stampMetrics(parent.metrics);

      if (inline) {
        ctx.stepIn(parent, inline);
        ctx.stampMetrics(inline.metrics);
      }
    } else { // slow path - this is the normative algorithm
      for (const ctx of this.contextStack) {
        ctx.reset();

        while (inline) {
          if (inline.style.verticalAlign === 'top' || inline.style.verticalAlign === 'bottom') {
            parent = inline;
            inline = ++i < this.parents.length ? this.parents[i] : undefined;
            break;
          } else {
            ctx.stepIn(parent, inline);
            ctx.stampMetrics(inline.metrics);
            parent = inline;
            inline = ++i < this.parents.length ? this.parents[i] : undefined;
          }
        }
      }
    }

    for (const inline of this.markedContextRoots) this.contextRoots.delete(inline);

    this.markedContextRoots = [];
    this.boxes = [];
  }
}

export class Linebox extends LineFragments {
  ascender: number;
  descender: number;
  blockOffset: number;
  inlineOffset: number;
  width: number;

  constructor(treeIndex: number) {
    super(treeIndex);
    this.ascender = 0;
    this.descender = 0;
    this.blockOffset = 0;
    this.inlineOffset = 0;
    this.width = 0;
  }

  height() {
    return this.ascender + this.descender;
  }

  reset() {
    this.clear();
    this.ascender = 0;
    this.descender = 0;
    this.blockOffset = 0;
    this.inlineOffset = 0;
    this.width = 0;
  }
}

export interface InlineFragment {
  treeIndex: number;
  textOffset: number;
  left: number;
  right: number;
  blockOffset: number;
  naturalStart: boolean;
  naturalEnd: boolean;
}

interface IfcMark {
  position: number;
  isBreak: boolean;
  isGraphemeBreak: boolean;
  isBreakForced: boolean;
  isItemStart: boolean;
  inlinePre: Inline | null;
  treeIndex: number;
  inlinePost: Inline | null;
  box: BlockLevel | null;
  advance: number;
  trailingWs: number;
  itemIndex: number;
  split: (this: IfcMark, mark: IfcMark) => void;
}

function isink(c: string) {
  return c !== undefined && c !== ' ' && c !== '\t';
}

export function createIfcBuffer(text: string) {
  const allocation = hb.allocateUint16Array(text.length);
  const a = allocation.array;

  // Inspired by this diff in Chromium, which reveals the code that normalizes
  // the buffer passed to HarfBuzz before shaping:
  // https://chromium.googlesource.com/chromium/src.git/+/275c35fe82bd295a75c0d555db0e0b26fcdf980b%5E%21/#F18
  // I removed the characters in the Default_Ignorables Unicode category since
  // HarfBuzz is configured to ignore them, and added newlines since currently
  // they get passed to HarfBuzz (they probably shouldn't because effects
  // should not happen across newlines)
  for (let i = 0; i < text.length; ++i) {
    const c = text.charCodeAt(i);
    if (
      c === formFeedCharacter ||
      c === carriageReturnCharacter ||
      c === lineFeedCharacter ||
      c === objectReplacementCharacter
    ) {
      a[i] = zeroWidthSpaceCharacter;
    } else {
      a[i] = c;
    }
  }

  return allocation;
}

const hbBuffer = hb.createBuffer();
hbBuffer.setClusterLevel(1);
hbBuffer.setFlags(hb.HB_BUFFER_FLAG_PRODUCE_UNSAFE_TO_CONCAT);

const wordCache = new Map<HbFont, Map<string, Int32Array>>();
let wordCacheSize = 0;

// exported for testing, which should not measure with a prefilled cache
export function clearWordCache() {
  wordCache.clear();
  wordCacheSize = 0;
}

function wordCacheAdd(font: HbFont, string: string, glyphs: Int32Array) {
  let stringCache = wordCache.get(font);
  if (!stringCache) wordCache.set(font, stringCache = new Map());
  stringCache.set(string, glyphs);
  wordCacheSize += 1;
}

function wordCacheGet(font: HbFont, string: string) {
  return wordCache.get(font)?.get(string);
}

export function sliceIfcRenderText(
  layout: Layout,
  block: BlockContainerOfInlines,
  item: ShapedItem,
  start: number,
  end: number
) {
  const inline = layout.tree[block.treeStart + 1];
  if (!inline.isInline()) throw new Error('Assertion failed');
  if (inline.hasSoftHyphen()) {
    const mark = item.end() - 1;
    const hyphen = getHyphen(item);
    if (
      mark >= start &&
      mark < end &&
      block.text[mark] === '\u00ad' && // softHyphenCharacter
      hyphen
    ) {
      const first = block.text.slice(start, mark);
      const second = block.text.slice(mark + 1, end);
      const glyphIndex = item.attrs.level & 1 ? 0 : item.glyphs.length - G_SZ;
      if (hyphen.glyphs[G_ID] === item.glyphs[glyphIndex + G_ID]) {
        return first + hyphen.codepoint + second;
      }
    }
  }
  return block.text.slice(start, end);
}

function isInsideGraphemeBoundary(text: string, offset: number) {
  return nextGraphemeBreak(text, previousGraphemeBreak(text, offset)) !== offset;
}

function shapePartWithWordCache(
  block: BlockContainerOfInlines,
  offset: number,
  length: number,
  font: HbFont,
  attrs: ShapingAttrs
) {
  const end = offset + length;
  const words: {wordGlyphs: Int32Array, wordStart: number}[] = [];
  let size = 0;
  let wordLen = 0;
  let wordStart = offset;

  hbBuffer.setScript(nameToTag.get(attrs.script)!);
  hbBuffer.setLanguage(langForScript(attrs.script)); // TODO: [lang]
  hbBuffer.setDirection(attrs.level & 1 ? 'rtl' : 'ltr');

  // Important note: this implementation includes the leading space as a part
  // of the word. That means kerning that happens after a space is obeyed, but
  // not before. I think it would be better to not have kerning around spaces
  // at all (ie: shape sequences of spaces and non-spaces separately) and that
  // may be what Firefox is doing, but doing that efficently is harder.
  for (let i = offset; i < end; i++) {
    const leftInSpaceSegment = block.text[i] === ' ';
    const rightInSpaceSegment = block.text[i + 1] === ' ';

    wordLen += 1;

    if (leftInSpaceSegment !== rightInSpaceSegment || i === end - 1) {
      const word = block.text.slice(wordStart, wordStart + wordLen);
      let wordGlyphs = wordCacheGet(font, word);

      if (!wordGlyphs) {
        if (wordCacheSize > 10_000) clearWordCache();
        hbBuffer.setLength(0);
        hbBuffer.addUtf16(
          block.buffer.array.byteOffset + wordStart * 2,
          wordLen,
          0,
          wordLen
        );
        hb.shape(font, hbBuffer);
        wordGlyphs = hbBuffer.extractGlyphs();
        wordCacheAdd(font, word, wordGlyphs);
      }

      words.push({wordStart, wordGlyphs});
      size += wordGlyphs.length;

      wordStart = i + 1;
      wordLen = 0;
    }
  }

  const glyphs = new Int32Array(size);

  let i = attrs.level & 1 ? glyphs.length : 0;
  for (const {wordStart, wordGlyphs} of words) {
    if (attrs.level & 1) i -= wordGlyphs.length;
    glyphs.set(wordGlyphs, i);
    for (let j = 1; j < wordGlyphs.length; j += 7) {
      glyphs[i + j] = wordStart + wordGlyphs[j];
    }
    if (!(attrs.level & 1)) i += wordGlyphs.length;
  }

  return glyphs;
}

function shapePartWithoutWordCache(
  block: BlockContainerOfInlines,
  offset: number,
  length: number,
  font: HbFont,
  attrs: ShapingAttrs
) {
  hbBuffer.setLength(0);
  hbBuffer.addUtf16(block.buffer.array.byteOffset, block.buffer.array.length, offset, length);
  hbBuffer.setScript(nameToTag.get(attrs.script)!);
  hbBuffer.setLanguage(langForScript(attrs.script)); // TODO: [lang]
  hbBuffer.setDirection(attrs.level & 1 ? 'rtl' : 'ltr');
  hb.shape(font, hbBuffer);
  return hbBuffer.extractGlyphs();
}

function postShapeLoadHyphens(block: BlockContainerOfInlines, items: ShapedItem[]) {
  let itemIndex = 0;
  for (let textOffset = 0; textOffset < block.text.length; textOffset++) {
    if (block.text[textOffset] === '\u00ad' /* softHyphenCharacter */) {
      while ( // Forward to the item that owns the textOffset
        itemIndex + 1 < items.length &&
        items[itemIndex + 1].offset <= textOffset
      ) itemIndex++;

      loadHyphen(items[itemIndex]);
    }
  }
}

function postShapeAddWordSpacing(
  layout: Layout,
  block: BlockContainerOfInlines,
  items: ShapedItem[],
  inlineIndex: number,
  itemIndex: number,
  endItem: number
) {
  while (inlineIndex <= block.treeFinal && itemIndex < endItem) {
    const box = layout.tree[inlineIndex];
    if (box.isRun() && box.style.wordSpacing !== 'normal') {
      while ( // Forward to the item that owns the textOffset
        itemIndex + 1 < endItem &&
        items[itemIndex + 1].offset <= box.textStart
      ) itemIndex++;

      while (
        itemIndex < endItem &&
        items[itemIndex].offset < box.textEnd
      ) {
        const item = items[itemIndex];
        const {wordSpacing, fontSize} = box.style;
        let addPx = typeof wordSpacing === 'number' ? wordSpacing
          : wordSpacing.value / 100 * fontSize;

        const addUnits = addPx * item.face.hbface.upem / fontSize;

        // TODO this isn't... super great, iterating the same glyphs array
        // multiple times if multiple inlines cover it, but this is typically
        // extremely fast, plus inline word-spacing is probably rare. Still,
        // if/when looking at generalizing glyph/span walking, try to improve.
        for (let i = 0; i < item.glyphs.length; i = nextCluster(item.glyphs, i)) {
          const cl = item.glyphs[i + G_CL];
          if (isWordSeparator(item.block.text[cl])) {
            if (cl >= box.textStart && cl < box.textEnd) {
              item.glyphs[i + G_AX] += addUnits;
            }
          }
        }

        if (items[itemIndex].end() <= box.textEnd) {
          itemIndex++;
        } else {
          break; // spans into next inline
        }
      }
    } else if (box.isBox()) {
      if (box.isInline() && box.hasWordSpacing()) {
        // descend
      } else {
        inlineIndex = box.treeFinal; // skip
      }
    }
    inlineIndex++;
  }
}

function shapePart(
  block: BlockContainerOfInlines,
  offset: number,
  length: number,
  face: LoadedFontFace,
  attrs: ShapingAttrs
) {
  if (!face.spaceMayParticipateInShaping(attrs.script)) {
    const t = block.text;
    const end = offset + length;
    if (
      (offset === 0 || t[offset] === ' ' || t[offset - 1] === ' ') &&
      (end === t.length || t[end] === ' ' || t[end - 1] === ' ')
    ) {
      return shapePartWithWordCache(block, offset, length, face.hbfont, attrs);
    }
  }

  return shapePartWithoutWordCache(block, offset, length, face.hbfont, attrs);
}

export function createIfcShapedItems(
  layout: Layout,
  block: BlockContainerOfInlines,
  inlineRoot: Inline
) {
  const items: ShapedItem[] = [];
  const log = block.loggingEnabled() ? new Logger() : null;
  const t = log ? (s: string) => log.text(s) : null;
  const g = log ? (glyphs: Int32Array) => log.glyphs(glyphs) : null;
  const itemizeState = createItemizeState(layout, block);

  t?.(`Preprocess ${block.id()}\n`);
  t?.('='.repeat(`Preprocess ${block.id()}`.length) + '\n');
  t?.(`Full text: "${block.text}"\n`);

  log?.pushIndent();

  while (!itemizeState.done) {
    const itemStart = itemizeState.offset;
    itemizeNext(itemizeState);
    const attrs = itemizeState.attrs;
    const cascade = getLangCascade(attrs.style, langForScript(attrs.script)); // TODO [lang] support
    const itemEnd = itemizeState.offset;
    let shapeWork = [{offset: itemStart, length: itemEnd - itemStart}];

    t?.(`Item ${itemStart}..${itemEnd}:\n`);
    t?.(`emoji=${attrs.isEmoji} level=${attrs.level} script=${attrs.script} `);
    t?.(`size=${attrs.style.fontSize} variant=${attrs.style.fontVariant}\n`);
    t?.(`cascade=${cascade.map(m => basename(m.url)).join(', ')}\n`);

    log?.pushIndent();

    for (let i = 0; shapeWork.length && i < cascade.length; ++i) {
      const nextShapeWork: {offset: number, length: number}[] = [];
      const face = cascade[i];
      const isLastMatch = i === cascade.length - 1;

      while (shapeWork.length) {
        const {offset, length} = shapeWork.pop()!;
        const end = offset + length;
        const shapedPart = shapePart(block, offset, length, face, attrs);
        const hbClusterState = createGlyphIteratorState(shapedPart, attrs.level, offset, end);
        let needsReshape = false;
        let segmentTextStart = offset;
        let segmentTextEnd = offset;
        let segmentGlyphStart = hbClusterState.glyphIndex;
        let segmentGlyphEnd = hbClusterState.glyphIndex;

        t?.(`Shaping "${block.text.slice(offset, end)}" with font ${face.url}\n`);
        t?.('Shaper returned: ');
        g?.(shapedPart);
        t?.('\n');
        log?.pushIndent('  ==> ');

        while (!hbClusterState.done) {
          nextGlyph(hbClusterState);

          if (needsReshape !== hbClusterState.needsReshape || hbClusterState.done) {
            // flush the segment

            // if we're starting a well-shaped segment (ending a needs-reshape
            // segment), we have to bump up the boundary to a grapheme boundary
            if (!hbClusterState.done && needsReshape) {
              segmentTextEnd = nextGrapheme(block.text, segmentTextEnd);

              while (!hbClusterState.done && hbClusterState.clusterStart < segmentTextEnd) {
                segmentGlyphEnd = hbClusterState.glyphIndex;
                nextGlyph(hbClusterState);
              }
            }

            // if we're starting a needs-reshape segment (ending a well-shaped
            // segment) we have to rewind the boundary to a grapheme boundary
            if (!hbClusterState.done && !needsReshape) {
              segmentTextEnd = prevGrapheme(block.text, segmentTextEnd);

              if (attrs.level & 1) {
                while (
                  segmentGlyphEnd + G_SZ <= segmentGlyphStart &&
                  shapedPart[segmentGlyphEnd + G_SZ + G_CL] >= segmentTextEnd
                ) segmentGlyphEnd += G_SZ;
              } else {
                while (
                  segmentGlyphEnd - G_SZ >= segmentGlyphStart &&
                  shapedPart[segmentGlyphEnd - G_SZ + G_CL] >= segmentTextEnd
                ) segmentGlyphEnd -= G_SZ;
              }
            }

            const offset = segmentTextStart;
            const length = segmentTextEnd - segmentTextStart;
            const glyphStart = attrs.level & 1 ? segmentGlyphEnd + G_SZ : segmentGlyphStart;
            const glyphEnd = attrs.level & 1 ? segmentGlyphStart + G_SZ : segmentGlyphEnd;

            if (needsReshape) {
              if (isLastMatch) {
                const glyphs = shapedPart.subarray(glyphStart, glyphEnd);
                items.push(new ShapedItem(block, face, glyphs, offset, length, {...attrs}));
                t?.('Cascade finished with tofu: ');
                g?.(glyphs);
                t?.('\n');
              } else {
                t?.(`Must reshape "${block.text.slice(offset, offset + length)}"\n`);
                nextShapeWork.push({offset, length});
              }
            } else if (glyphStart < glyphEnd) {
              const glyphs = glyphStart === 0 && glyphEnd === shapedPart.length
                ? shapedPart
                : shapedPart.subarray(glyphStart, glyphEnd);

              items.push(new ShapedItem(block, face, glyphs, offset, length, {...attrs}));
              t?.('Glyphs OK: ');
              g?.(glyphs);
              t?.('\n');
            }

            // start a new segment
            segmentTextStart = segmentTextEnd;
            segmentGlyphStart = segmentGlyphEnd;
            needsReshape = hbClusterState.needsReshape;
          }

          // extend the segment
          segmentTextEnd = hbClusterState.clusterEnd;
          segmentGlyphEnd = hbClusterState.glyphIndex;
        }

        log?.popIndent();
      }

      shapeWork = nextShapeWork;
    }

    log?.popIndent();
  }

  log?.popIndent();
  log?.flush();

  items.sort((a, b) => a.offset - b.offset);

  if (inlineRoot.hasSoftHyphen()) postShapeLoadHyphens(block, items);
  if (inlineRoot.hasWordSpacing()) {
    postShapeAddWordSpacing(layout, block, items, block.treeStart + 2, 0, items.length);
  }

  return items;
}

function createMarkIterator(
  layout: Layout,
  block: BlockContainerOfInlines,
  mode: 'min-content' | 'max-content' | 'normal'
) {
  const inlineRoot = layout.tree[block.treeStart + 1];
  if (!inlineRoot.isInline()) throw new Error('Assertion failed');
  // Inline iterator
  let inline = createInlineIteratorState(layout, block);
  let lastRunIndex = block.treeStart + 2;
  inlineIteratorStateNext(inline);
  let inlineMark = 0;
  // Break iterator
  const breakIterator = inlineRoot.hasSoftWrap()
    ? new LineBreak(block.text, !inlineRoot.hasSoftWrap())
    : new HardBreaker(block.text);
  let linebreak: {position: number, required: boolean} | null = {position: -1, required: false};
  let breakMark = 0;
  // Item iterator
  let itemIndex = -1;
  let itemMeasureState: MeasureState | undefined;
  let itemMark = 0;
  // Grapheme iterator
  let graphemeBreakMark = 0;
  // Other
  const end = block.text.length;

  const next = (): {done: true} | {done: false, value: IfcMark} => {
    const mark: IfcMark = {
      position: Math.min(inlineMark, itemMark, breakMark, graphemeBreakMark),
      isBreak: false,
      isGraphemeBreak: false,
      isBreakForced: false,
      isItemStart: false,
      inlinePre: null,
      treeIndex: lastRunIndex, // only valid for mark.isBreak or text advances
      inlinePost: null,
      box: null,
      advance: 0,
      trailingWs: 0,
      itemIndex,
      split
    };

    if (!inline.value && !linebreak && itemIndex >= block.items.length) {
      return {done: true};
    }

    if (itemIndex < block.items.length && itemIndex > -1) {
      const item = block.items[itemIndex];
      const {advance, trailingWs} = item.measure(mark.position, 1, itemMeasureState);
      mark.advance = advance;
      mark.trailingWs = trailingWs;
    }

    // Consume the inline break spot if we're not on a break
    if (inline.value?.state === 'breakspot' && inlineMark === mark.position && (breakMark === 0 || breakMark !== mark.position)) {
      inlineIteratorStateNext(inline);
    }

    // Consume floats
    if (inline.value?.state === 'box' && inline.value.item.isFloat() && inlineMark === mark.position) {
      mark.box = inline.value.item;
      inlineIteratorStateNext(inline);
      return {done: false, value: mark};
    }

    if (inline.value?.state === 'breakop' && inlineMark === mark.position) {
      mark.isBreak = true;
      inlineIteratorStateNext(inline);
      return {done: false, value: mark};
    }

    // Consume pre[-text|-break|-block], post["], or pre-post["] before a breakspot
    if (inline.value && inline.value.state !== 'breakspot' && inlineMark === mark.position) {
      if (inline.value.state === 'pre' || inline.value.state === 'post') {
        if (inline.value.state === 'pre') mark.inlinePre = inline.value.item;
        if (inline.value.state === 'post') mark.inlinePost = inline.value.item;
        inlineIteratorStateNext(inline);
      }

      // Consume post if we consumed pre above
      if (mark.inlinePre && inline.value?.state === 'post') {
        mark.inlinePost = inline.value.item;
        inlineIteratorStateNext(inline);
      }

      // Consume text, hard break, or inline-block
      if (inline.value) {
        if (inline.value.state === 'text') {
          lastRunIndex = inline.value.index;
          inlineMark += inline.value.item.length;
          if (!inline.value.item.wrapsOverflowAnywhere(mode)) {
            graphemeBreakMark = inlineMark;
          }
          inlineIteratorStateNext(inline);
        } else if (inline.value.state === 'break') {
          mark.treeIndex = inline.value.index;
          mark.isBreak = true;
          mark.isBreakForced = true;
          inlineIteratorStateNext(inline);
        } else if (inline.value.state === 'box' && inline.value.item.isInlineLevel()) {
          mark.box = inline.value.item;
          inlineIteratorStateNext(inline);
        }
      }
    }

    if (mark.inlinePre || mark.inlinePost || mark.isBreak) return {done: false, value: mark};

    if (itemIndex < block.items.length && itemMark === mark.position && (!inline.value || inlineMark !== mark.position)) {
      itemIndex += 1;

      if (itemIndex < block.items.length) {
        const item = block.items[itemIndex];
        itemMark += item.length;
        itemMeasureState = item.createMeasureState();
        mark.isItemStart = true;
        mark.itemIndex += 1;
      }
    }

    if (linebreak && breakMark === mark.position) {
      const bk = breakIterator.nextBreak();
      if (linebreak.position > -1) {
        mark.isBreakForced = linebreak.required;
        mark.isBreak = true;
      }
      if (bk && inlineRoot.hasText()) {
        breakMark = bk.position;
        if (linebreak) {
          linebreak.position = bk.position;
          linebreak.required = bk.required;
        } else {
          linebreak = {...bk};
        }
      } else {
        linebreak = null;
        breakMark = end;
      }
    }

    if (graphemeBreakMark === mark.position) {
      if (inlineRoot.hasText()) {
        mark.isGraphemeBreak = true;
        graphemeBreakMark = nextGraphemeBreak(block.text, graphemeBreakMark);
      } else {
        graphemeBreakMark = end;
      }
    }

    if (inlineMark === mark.position && inline.value?.state === 'breakspot') {
      inlineIteratorStateNext(inline);
    }

    return {done: false, value: mark};
  };

  function split(this: IfcMark, mark: IfcMark) {
    itemIndex += 1;
    this.itemIndex += 1;
    if (mark !== this) mark.itemIndex += 1;

    const item = block.items[this.itemIndex];

    if (itemIndex === this.itemIndex) {
      itemMeasureState = item.createMeasureState();
      item.measure(mark.position, 1, itemMeasureState);
    }
  }

  return {[Symbol.iterator]: () => ({next})};
}

export function getIfcContribution(
  layout: Layout,
  block: BlockContainerOfInlines,
  mode: 'min-content' | 'max-content'
) {
  const width = new LineWidthTracker();
  const containingBlock = block.getContentArea();
  let contribution = 0;

  for (const mark of createMarkIterator(layout, block, mode)) {
    const inkAdvance = mark.advance - mark.trailingWs;
    const isBreak = mark.isBreak || mark.isGraphemeBreak;

    if (inkAdvance) width.addInk(inkAdvance);
    if (mark.trailingWs) width.addWs(mark.trailingWs, true /* TODO */);
    if (mark.inlinePre) width.addInk(mark.inlinePre.getInlineStartSize(containingBlock));
    if (mark.inlinePost) width.addInk(mark.inlinePost.getInlineEndSize(containingBlock));

    if (mark.box) {
      width.addInk(layoutContribution(layout, mark.box, mode));
      // floats don't have breaks before/after them
      if (mode === 'min-content') {
        contribution = Math.max(contribution, width.trimmed());
        width.reset();
      }
    }

    if (isBreak && (mode === 'min-content' || mark.isBreakForced)) {
      contribution = Math.max(contribution, width.trimmed());
      width.reset();
    }
  }

  if (mode === 'max-content') contribution = Math.max(contribution, width.trimmed());

  return contribution;
}

function splitItem(
  layout: Layout,
  ifc: InlineFormattingContext,
  parent: Inline,
  mark: IfcMark
) {
  const left = ifc.block.items[mark.itemIndex];
  const {needsReshape, right} = left.split(mark.position - left.offset);
  let changed = false;

  ifc.block.items.splice(mark.itemIndex + 1, 0, right);

  if (needsReshape) {
    left.reshape(true);
    right.reshape(false);
    if (left.mayHaveModifiedWordSepGlyphs(layout)) {
      const inlineIndex = ifc.block.getRunIndex(layout, left.offset);
      if (inlineIndex === undefined) throw new Error('Assertion failed');
      postShapeAddWordSpacing(layout, ifc.block, ifc.block.items, inlineIndex, mark.itemIndex, mark.itemIndex + 2);
    }
    changed = true;
  }

  if (ifc.block.text[mark.position - 1] === '\u00ad' /* softHyphenCharacter */) {
    const hyphen = getHyphen(left)?.glyphs;
    if (hyphen?.length) {
      const glyphs = new Int32Array(left.glyphs.length + hyphen.length);
      if (left.attrs.level & 1) {
        glyphs.set(hyphen, 0);
        glyphs.set(left.glyphs, hyphen.length);
        for (let i = G_CL; i < hyphen.length; i += G_SZ) {
          glyphs[i] = mark.position - 1;
        }
      } else {
        glyphs.set(left.glyphs, 0);
        glyphs.set(hyphen, left.glyphs.length);
        for (let i = left.glyphs.length + G_CL; i < glyphs.length; i += G_SZ) {
          glyphs[i] = mark.position - 1;
        }
      }
      left.glyphs = glyphs;
      changed = true;
    }
  }

  // Line item i-size may have changed if we added a hyphen or if reshaping
  // caused differences. The former case is already tracked by LineWidthTracker
  // and we aren't required to handle overflow for the latter, but inlineSpace
  // needs to be correct for RTL positioning and background fragments.
  if (changed) {
    for (const item of ifc.line.items) {
      if (item.textStart < item.textEnd && item.itemIndex === mark.itemIndex) {
        const state = left.createMeasureState();
        left.measure(item.textStart);
        item.inlineSpace = left.measure(item.textEnd, 1, state).advance;
      }
    }
  }

  ifc.candidates.split();
  // Stamp the brand new line with its metrics, since the only other
  // place this happens is mark.itemStart
  ifc.candidates.height.stampMetrics(getMetrics(parent.style, right.face));
}

class InlineFormattingContext {
  layout: Layout;
  block: BlockContainerOfInlines;
  bfc: BlockFormattingContext;
  /** Holds shaped items, width and height trackers for the current word */
  candidates: LineCandidates;
  /** Tracks the width of the line being worked on */
  width: LineWidthTracker;
  /** Tracks the height, ascenders and descenders of the line being worked on */
  height: LineHeightTracker;
  vacancy: IfcVacancy;
  rootInline: Inline;
  containingBlock: BoxArea;
  /** Parents according to the mark's current position */
  parents: Inline[];
  /** The current line being worked on */
  line: Linebox;
  lastBreakMark: IfcMark | null;
  floatsInWord: BlockLevel[];
  blockOffset: number;
  lineHasWord: boolean;
  /** True when we should append the line */
  lineIsDirty: boolean;
  /** Inlines to be fragmented; shared across finishLine calls */
  inlines: Inline[];

  constructor(
    layout: Layout,
    block: BlockContainerOfInlines,
    ctx: LayoutContext
  ) {
    this.layout = layout;
    this.block = block;
    this.bfc = ctx.bfc!;
    this.candidates = new LineCandidates(layout, block);
    this.width = new LineWidthTracker();
    this.height = new LineHeightTracker(layout, block);
    this.vacancy = new IfcVacancy(0, 0, 0, 0, 0, 0);
    const rootInline = layout.tree[block.treeStart + 1];
    if (!rootInline.isInline()) throw new Error('Assertion failed');
    this.rootInline = rootInline;
    this.containingBlock = rootInline.getContainingBlock();
    this.parents = [];
    this.line = new Linebox(block.treeStart + 2);
    this.lastBreakMark = null;
    this.floatsInWord = [];
    this.blockOffset = this.bfc.cbBlockStart;
    this.lineHasWord = false;
    this.lineIsDirty = false;
    this.inlines = [];
  }
}

function addInlineFragmentsAndPositionY(
  ifc: InlineFormattingContext,
  line: Linebox,
  force: boolean,
  inline: Inline,
  blockOffset: number
) {
  const containingBlock = ifc.containingBlock;
  const direction = ifc.block.style.direction;
  let inlineOffset = line.inlineOffset;
  let left, right;

  for (let i = 0; i < line.items.length; i++) {
    let fragment: InlineFragment | null = null;

    if (
      line.items[i].treeIndex < inline.treeStart ||
      line.items[i].treeIndex > inline.treeFinal
    ) {
      const item = line.items[i];
      inlineOffset += item.startSpace + item.inlineSpace + item.endSpace;
      continue;
    }

    do {
      const item = line.items[i];
      let backgroundStart = inlineOffset + item.startProgress;

      if (inline.textStart === item.textStart && inline !== ifc.rootInline) {
        const margin = inline.style.getMarginInlineStart(containingBlock, direction);
        const border = inline.style.getBorderInlineStartWidth(containingBlock, direction);
        const padding = inline.style.getPaddingInlineStart(containingBlock, direction);

        backgroundStart += margin === 'auto' ? 0 : margin;
        if (inline.style.backgroundClip !== 'border-box') backgroundStart += border;
        if (inline.style.backgroundClip === 'content-box') backgroundStart += padding;

        item.startProgress += (margin === 'auto' ? 0 : margin) + border + padding;
      }

      let backgroundEnd = inlineOffset + item.startSpace + item.inlineSpace + item.endSpace - item.endProgress;

      if (inline.textEnd === item.textEnd && inline !== ifc.rootInline) {
        const margin = inline.style.getMarginInlineEnd(containingBlock, direction);
        const border = inline.style.getBorderInlineEndWidth(containingBlock, direction);
        const padding = inline.style.getPaddingInlineEnd(containingBlock, direction);

        backgroundEnd -= margin === 'auto' ? 0 : margin;
        if (inline.style.backgroundClip !== 'border-box') backgroundEnd -= border;
        if (inline.style.backgroundClip === 'content-box') backgroundEnd -= padding;

        item.endProgress += (margin === 'auto' ? 0 : margin) + border + padding;
      }

      if (item.textStart < item.textEnd) {
        // TODO: vertical writing modes
        ifc.block.items[item.itemIndex].y = blockOffset;
      } else {
        const box = ifc.layout.tree[item.treeIndex];
        if (box.isFormattingBox() && !box.isOutOfFlow()) {
          const {blockStart} = box.getMarginsAutoIsZero(containingBlock);

          if (box.style.verticalAlign === 'top') {
            box.setBlockPosition(line.blockOffset + blockStart);
          } else if (box.style.verticalAlign === 'bottom') {
            const {ascender, descender} = inlineBlockMetrics(ifc.layout, box);
            box.setBlockPosition(
              line.blockOffset + line.height() - descender - ascender + blockStart
            );
          } else {
            const baselineShift = inlineBlockBaselineStep(ifc.layout, inline, box);
            const {ascender} = inlineBlockMetrics(ifc.layout, box);
            box.setBlockPosition(blockOffset - baselineShift - ascender + blockStart);
          }
        }
      }

      if (inline.hasForeground() || force) {
        // TODO: vertical writing modes
        if (direction === 'ltr') {
          left = backgroundStart;
          right = backgroundEnd;
        } else {
          left = containingBlock.inlineSize - backgroundEnd;
          right = containingBlock.inlineSize - backgroundStart;
        }

        if (!fragment) {
          fragment = {
            treeIndex: inline.treeStart,
            textOffset: Math.max(line.textStart, item.textStart),
            left,
            right,
            blockOffset,
            naturalStart: false,
            naturalEnd: false,
          };

          ifc.block.fragments.push(fragment);
        }

        fragment.naturalStart ||= inline.textStart === item.textStart;
        fragment.naturalEnd ||= inline.textEnd === item.textEnd;
        fragment.left = Math.min(fragment.left, left);
        fragment.right = Math.max(fragment.right, right);
      }

      inlineOffset += item.startSpace + item.inlineSpace + item.endSpace;
      i++;
    } while (
      i < line.items.length &&
      inline.treeStart <= line.items[i].treeIndex &&
      inline.treeFinal >= line.items[i].treeIndex
    );
  }
}

function baselineRegroup(
  layout: Layout,
  inline: Inline,
  line: Linebox,
) {
  const parents = [inline];
  let ascender = inline.metrics.ascenderBox;
  let descender = -inline.metrics.descenderBox;
  let baseline = 0;

  for (let treeIndex = inline.treeStart + 1; treeIndex <= inline.treeFinal; treeIndex++) {
    const thing = layout.tree[treeIndex];

    if (thing.isInline()) {
      if (thing.style.verticalAlign === 'top' || thing.style.verticalAlign === 'bottom') {
        break;
      } else {
        baseline += baselineStep(parents[parents.length - 1], thing);
      }
      parents.push(thing);
      ascender = Math.max(ascender, baseline + thing.metrics.ascenderBox);
      descender = Math.min(descender, baseline - thing.metrics.descenderBox);
    } else if (thing.isBox()) {
      treeIndex = thing.treeFinal;
    }

    while (parents.length && parents[parents.length - 1].treeFinal === treeIndex) parents.pop();
  }

  if (inline.style.verticalAlign === 'top') {
    return line.blockOffset + line.ascender - (line.ascender - ascender);
  } else {
    return line.blockOffset + line.ascender - (-descender - line.descender);
  }
}

function positionPhysicalLineItems(
  ifc: InlineFormattingContext,
  line: Linebox,
  lastLine: boolean
) {
  // Note: this function is where we mutate ifc.inlines for the next linebox
  const inlines = ifc.inlines;
  const direction = ifc.block.style.direction;
  const containingBlock = ifc.containingBlock;
  const layout = ifc.layout;
  let blockOffset = line.blockOffset + line.ascender;
  let textOffset = line.textStart;

  // No fragments are produced here (unless it's the last line, and the
  // containing block is an inline-block) but items without wrapping inlines
  // have to be positioned.
  const force = lastLine && ifc.block.isInlineLevel();

  if (!force && inlines.length === 0 && line.items.length === 1 && line.treeStart === line.treeFinal && line.textStart < line.textEnd) {
    // Fast path: it is very common to have a plaintext line
    ifc.block.items[line.items[0].itemIndex].y = blockOffset;
  } else {
    addInlineFragmentsAndPositionY(ifc, line, force, ifc.rootInline, blockOffset);
  }

  for (let i = 0; i < inlines.length; i++) {
    const inline = inlines[i];
    if (inline.style.verticalAlign === 'top' || inline.style.verticalAlign === 'bottom') {
      blockOffset = baselineRegroup(layout, inline, line);
    } else {
      const parent = i === 0 ? ifc.rootInline : inlines[i - 1];
      blockOffset -= baselineStep(parent, inline);
    }
    addInlineFragmentsAndPositionY(ifc, line, false, inline, blockOffset);
  }

  for (let i = line.treeStart; i <= line.treeFinal; i++) {
    const thing = layout.tree[i];

    if (thing.isRun()) {
      textOffset = Math.min(thing.textEnd, line.textEnd);
    } else if (thing.isInline() && textOffset === thing.textStart) {
      const parent = inlines.length ? inlines[inlines.length - 1] : ifc.rootInline;
      inlines.push(thing);
      if (thing.style.verticalAlign === 'top' || thing.style.verticalAlign === 'bottom') {
        blockOffset = baselineRegroup(layout, thing, line);
      } else {
        blockOffset -= baselineStep(parent, thing);
      }
      addInlineFragmentsAndPositionY(ifc, line, false, thing, blockOffset);
    } else if (thing.isBox()) {
      i = thing.treeFinal;
    }

    while (
      inlines.length &&
      inlines[inlines.length - 1].treeFinal === i &&
      inlines[inlines.length - 1].textEnd === textOffset
    ) {
      const inline = inlines.pop()!;
      const parent = inlines.length ? inlines[inlines.length - 1] : ifc.rootInline;
      blockOffset += baselineStep(parent, inline);
    }
  }

  let lastItemIndex = -1;
  if (direction === 'ltr') {
    let x = line.inlineOffset;
    for (let i = 0; i < line.items.length; i++) {
      const item = line.items[i];
      x += item.startSpace;
      if (item.textStart < item.textEnd) {
        if (lastItemIndex !== item.itemIndex) {
          ifc.block.items[item.itemIndex].x = x;
          lastItemIndex = item.itemIndex;
        }
      } else {
        const box = layout.tree[item.treeIndex];
        if (box.isFormattingBox() && !box.isOutOfFlow()) {
          const {lineLeft} = box.getMarginsAutoIsZero(containingBlock);
          box.setInlinePosition(x + lineLeft);
        }
      }
      x += item.inlineSpace + item.endSpace;
    }
  } else {
    let x = containingBlock.inlineSize - line.inlineOffset;
    for (let i = line.items.length - 1; i >= 0; i--) {
      const item = line.items[i];
      x -= item.startSpace + item.inlineSpace;
      if (item.textStart < item.textEnd) {
        ifc.block.items[item.itemIndex].x = x;
      } else {
        const box = layout.tree[item.treeIndex];
        if (box.isFormattingBox() && !box.isOutOfFlow()) {
          const {lineLeft} = box.getMarginsAutoIsZero(containingBlock);
          box.setInlinePosition(x - lineLeft);
        }
      }
      x -= item.endSpace;
    }
  }
}

function collapseLeft(
  ifc: InlineFormattingContext,
  items: LineItem[],
) {
  const state = {index: 0, itemIndex: -1, glyphIndex: 0};

  while (state.index < items.length) {
    const item = items[state.index];
    const box = ifc.layout.tree[item.treeIndex];
    let totalRemoved = 0;

    if (box.isFormattingBox() && !box.isOutOfFlow()) {
      return state;
    } else if (
      item.textStart < item.textEnd &&
      state.itemIndex !== item.itemIndex
    ) {
      const glyphs = ifc.block.items[item.itemIndex];
      if (!glyphs.attrs.style.isWsCollapsible()) break;
      const toPx = 1 / glyphs.face.hbface.upem * glyphs.attrs.style.fontSize;
      state.itemIndex = item.itemIndex;
      state.glyphIndex = 0;
      do {
        if (isink(ifc.block.text[glyphs.glyphs[state.glyphIndex + G_CL]])) {
          item.inlineSpace -= totalRemoved * toPx;
          return state;
        } else {
          totalRemoved += glyphs.glyphs[state.glyphIndex + G_AX];
          glyphs.glyphs[state.glyphIndex + G_AX] = 0;
        }
      } while ((state.glyphIndex += G_SZ) < glyphs.glyphs.length);
      item.inlineSpace -= totalRemoved * toPx;
    }

    state.index++;
  }

  return state;
}

function collapseRight(
  ifc: InlineFormattingContext,
  items: LineItem[],
) {
  const state = {index: items.length - 1, itemIndex: -1, glyphIndex: 0};

  while (state.index >= 0) {
    const item = items[state.index];
    const box = ifc.layout.tree[item.treeIndex];
    let totalRemoved = 0;

    if (box.isFormattingBox() && !box.isOutOfFlow()) {
      return state;
    } else if (
      item.textStart < item.textEnd &&
      state.itemIndex !== item.itemIndex
    ) {
      const glyphs = ifc.block.items[item.itemIndex];
      if (!glyphs.attrs.style.isWsCollapsible()) break;
      const toPx = 1 / glyphs.face.hbface.upem * glyphs.attrs.style.fontSize;
      state.itemIndex = item.itemIndex;
      state.glyphIndex = glyphs.glyphs.length - G_SZ;
      do {
        if (isink(ifc.block.text[glyphs.glyphs[state.glyphIndex + G_CL]])) {
          item.inlineSpace -= totalRemoved * toPx;
          return state;
        } else {
          totalRemoved += glyphs.glyphs[state.glyphIndex + G_AX];
          glyphs.glyphs[state.glyphIndex + G_AX] = 0;
        }
      } while ((state.glyphIndex -= G_SZ) >= 0);
      item.inlineSpace -= totalRemoved * toPx;
    }

    state.index--;
  }

  return state;
}

function transformLineboxWhitespace(
  ifc: InlineFormattingContext,
  line: Linebox,
  lastLine: boolean
) {
  const left = collapseLeft(ifc, line.items);
  const right = collapseRight(ifc, line.items);

  if (ifc.block.style.textAlign === 'justify' && !lastLine) {
    let lastItemIndex = -1;
    let n = 0;
    // first pass: count spaces
    for (let i = left.index; i <= right.index; i++) {
      const item = line.items[i];
      if (item.itemIndex === lastItemIndex) continue;
      lastItemIndex = item.itemIndex;
      if (item.textStart < item.textEnd) {
        const glyphs = ifc.block.items[item.itemIndex];
        const glyphsEnd = i === right.index ? right.glyphIndex : glyphs.glyphs.length;
        let glyphIndex = i === left.index ? left.glyphIndex : 0;
        while (glyphIndex < glyphsEnd) {
          if (isWordSeparator(ifc.block.text[glyphs.glyphs[glyphIndex + G_CL]])) n++
          glyphIndex += G_SZ;
        }
      }
    }
    // 2nd pass: expand!
    const extraPx = (ifc.vacancy.inlineSize - line.width) / n;
    if (extraPx > 0) {
      for (let i = left.index; i <= right.index; i++) {
        const item = line.items[i];
        if (item.textStart < item.textEnd) {
          const glyphs = ifc.block.items[item.itemIndex];
          const toPx = 1 / glyphs.face.hbface.upem * glyphs.attrs.style.fontSize;
          const extraUnits = extraPx * glyphs.face.hbface.upem / glyphs.attrs.style.fontSize;
          const glyphsEnd = i === right.index ? right.glyphIndex : glyphs.glyphs.length;
          let glyphIndex = i === left.index ? left.glyphIndex : 0;
          while (glyphIndex < glyphsEnd) {
            if (
              isWordSeparator(ifc.block.text[glyphs.glyphs[glyphIndex + G_CL]]) &&
              glyphs.glyphs[glyphIndex + G_CL] >= item.textStart &&
              glyphs.glyphs[glyphIndex + G_CL] < item.textEnd
            ) {
              glyphs.glyphs[glyphIndex + G_AX] += extraUnits;
              item.inlineSpace += extraUnits * toPx;
            }
            glyphIndex += G_SZ;
          }
        }
      }
    }
  }
}

function orderRange(
  items: LineItem[],
  glyphs: ShapedItem[],
  begin: number,
  end: number
) {
  let minlevel = 0xff;

  for (let i = begin; i < end; i++) {
    const item = items[i];
    if (item.textStart < item.textEnd) {
      // note: at least one item has to have text
      const run = glyphs[item.itemIndex];
      minlevel = Math.min(minlevel, run.attrs.level);
    }
  }

  let li = begin; // left inner
  let ri = end - 1; // right inner

  while (li < ri) {
    const lo = li; // left outer
    const ro = ri; // right outer
    let lLevel, rLevel;

    // Heed my warning! The inner indices are _exclusive_ and the outer indices
    // are _inclusive_: [lo, li) and (ri, ro]. So to represent the second range
    // like the first, it must be shifted by one: [ri + 1, ro + 1).

    if (items[li].textStart < items[li].textEnd) {
      lLevel = glyphs[items[li].itemIndex].attrs.level;
    } else {
      lLevel = minlevel;
    }

    if (items[ri].textStart < items[ri].textEnd) {
      rLevel = glyphs[items[ri].itemIndex].attrs.level;
    } else {
      rLevel = minlevel;
    }

    if (lLevel == minlevel) {
      li++;
    } else {
      while (li <= ri && glyphs[items[li].itemIndex].attrs.level >= lLevel) li++;
      if (lo < li) orderRange(items, glyphs, lo, li);
    }

    if (rLevel == minlevel) {
      ri--;
    } else {
      while (li <= ri && glyphs[items[ri].itemIndex].attrs.level >= rLevel) ri--;
      if (ri < ro) orderRange(items, glyphs, ri + 1, ro + 1);
    }

    if ((minlevel & 1) && li <= ri + 1) {
      const lsize = li - lo;
      const rsize = ro - ri;
      const swap = Math.min(lsize, rsize);
      for (let i = 0; i < swap; i++) {
        const temp = items[lo + i];
        items[lo + i] = items[ri + 1 + i];
        items[ri + 1 + i] = temp;
      }
      // deal with the remainder
      if (lsize > rsize) { // move [lo + rsize, li) to ro + 1
        const temp = items.splice(lo + rsize, li - lo - rsize);
        items.splice(ro + 1 - temp.length, 0, ...temp);
      } else if (rsize > lsize) { // move [ri + 1 + lsize, ro + 1) to li
        const temp = items.splice(ri + 1 + lsize, ro - ri - lsize);
        items.splice(li, 0, ...temp);
      }
    }
  }
}

function reorderPhysicalLineItems(
  ifc: InlineFormattingContext,
  items: LineItem[]
) {
  let levelOr = 0;
  let levelAnd = 1;
  let textFound = false;

  for (const item of items) {
    if (item.textStart < item.textEnd) {
      const run = ifc.block.items[item.itemIndex];
      levelOr |= run.attrs.level;
      levelAnd &= run.attrs.level;
      textFound = true;
    }
  }

  if (textFound) {
    // If none of the levels had the LSB set, all numbers were even
    const allEven = (levelOr & 1) == 0;
    // If all of the levels had the LSB set, all numbers were odd
    const allOdd = (levelAnd & 1) == 1;

    if (!allEven && !allOdd) {
      orderRange(items, ifc.block.items, 0, items.length);
    } else if (allOdd) {
      items.reverse();
    }
  } else if (ifc.block.style.direction === 'rtl') {
    // TODO: this doesn't feel like it could be enough, but I can't think of
    // counterexamples... even LRI/RLI/LRE/RLE would produce text above.
    items.reverse();
  }
}

function finishLine(
  ifc: InlineFormattingContext,
  line: Linebox,
  lastLine: boolean
) {
  const dir = ifc.block.style.direction;
  const w = ifc.width.trimmed();
  const {ascender, descender} = ifc.height.align();
  const textAlign = ifc.block.style.getTextAlign();

  line.width = w;
  line.blockOffset = ifc.vacancy.blockOffset;

  line.ascender = ascender;
  line.descender = descender;
  line.inlineOffset = dir === 'ltr' ? ifc.vacancy.leftOffset : ifc.vacancy.rightOffset;

  if (w < ifc.vacancy.inlineSize) {
    if (textAlign === 'right' && dir === 'ltr' || textAlign === 'left' && dir === 'rtl') {
      line.inlineOffset += ifc.vacancy.inlineSize - w;
    } else if (textAlign === 'center') {
      line.inlineOffset += (ifc.vacancy.inlineSize - w) / 2;
    }
  }

  if (line.items.length > 1) reorderPhysicalLineItems(ifc, line.items);
  transformLineboxWhitespace(ifc, line, lastLine);
  positionPhysicalLineItems(ifc, line, lastLine);

  const blockSize = line.height();

  ifc.width.reset();
  ifc.height.reset();
  ifc.bfc.fctx?.postLine(line, true);
  ifc.blockOffset += blockSize;
  ifc.bfc.getLocalVacancyForLine(ifc.bfc, ifc.blockOffset, blockSize, ifc.vacancy);
  ifc.lineHasWord = false;
  ifc.lineIsDirty = false;

  if (ifc.block.loggingEnabled()) {
    const log = new Logger();
    const W = line.width.toFixed(2);
    const A = line.ascender.toFixed(2);
    const D = line.descender.toFixed(2);
    const B = line.blockOffset.toFixed(2);
    log.text(`Line ${line.itemStart} (W:${W} A:${A} D:${D} B:${B}): `);
    for (const item of line.items) {
      if (item.textStart < item.textEnd) {
        log.text(`“${ifc.block.text.slice(item.textStart, item.textEnd)}” `);
      } else {
        const box = ifc.layout.tree[item.treeIndex];
        if (box.isFormattingBox() && !box.isOutOfFlow()) {
          log.text(`${box.getLogSymbol()} ${item.treeIndex} `);
        }
      }
    }
    log.flush();
  }
}

export function createIfcLineboxes(
  layout: Layout,
  block: BlockContainerOfInlines,
  ctx: LayoutContext
) {
  const ifc = new InlineFormattingContext(layout, block, ctx);
  const containingBlock = ifc.containingBlock;
  const bfc = ctx.bfc!;

  for (const mark of createMarkIterator(layout, block, 'normal')) {
    const parent = ifc.parents.length > 0 ? ifc.parents[ifc.parents.length - 1] : ifc.rootInline;
    const item = mark.itemIndex in block.items ? block.items[mark.itemIndex] : undefined;

    if (mark.position > ifc.candidates.textEnd) {
      ifc.candidates.addText(mark.treeIndex, mark.position, mark.advance);
    }

    if (mark.inlinePre) {
      const inlineSpace = mark.inlinePre.getInlineStartSize(containingBlock);
      if (inlineSpace > 0) ifc.candidates.width.addInk(inlineSpace);
      ifc.candidates.inlinePre(inlineSpace);
      ifc.candidates.height.pushInline(mark.inlinePre);
      if (
        item &&
        item.offset <= mark.inlinePre.textStart &&
        item.end() > mark.inlinePre.textStart
      ) {
        ifc.candidates.height.stampMetrics(getMetrics(mark.inlinePre.style, item.face));
      }
      ifc.parents.push(mark.inlinePre);
    }

    const wsCollapsible = parent.style.isWsCollapsible();
    const nowrap = isNowrap(parent.style.whiteSpace);
    const inkAdvance = mark.advance - mark.trailingWs;
    if (inkAdvance) ifc.candidates.width.addInk(inkAdvance);
    if (mark.trailingWs) ifc.candidates.width.addWs(mark.trailingWs, !!wsCollapsible);

    const wouldHaveContent = ifc.width.hasContent() || ifc.candidates.width.hasContent();

    if (mark.box?.isFloat()) {
      if (
        // No text content yet on the hypothetical line
        !wouldHaveContent ||
        // No text between the last break and the float
        ifc.lastBreakMark && ifc.lastBreakMark.position === mark.position
      ) {
        const lineWidth = ifc.lineIsDirty ? ifc.width.forFloat() : 0;
        const lineIsEmpty = !ifc.lineIsDirty && !ifc.candidates.hasContent(layout);
        const fctx = bfc.ensureFloatContext(ifc.blockOffset);
        layoutFloatBox(layout, mark.box, ctx);
        fctx.placeFloat(lineWidth, lineIsEmpty, mark.box);
      } else {
        // Have to place after the word
        ifc.floatsInWord.push(mark.box);
      }
    }

    if (mark.inlinePost) {
      const inlineSpace = mark.inlinePost.getInlineEndSize(containingBlock);
      if (inlineSpace > 0) ifc.candidates.width.addInk(inlineSpace);
      ifc.candidates.inlinePost(inlineSpace);
    }

    if (mark.inlinePre && mark.inlinePost) {
      ifc.candidates.addBox(mark.inlinePre.treeStart, mark.inlinePre.treeFinal, 0);
    }

    if (mark.box?.isInlineLevel()) {
      layoutFloatBox(layout, mark.box, ctx);
      const {lineLeft, lineRight} = mark.box.getMarginsAutoIsZero(containingBlock);
      const borderArea = mark.box.getBorderArea();
      const inlineSpace = lineLeft + borderArea.inlineSize + lineRight;
      ifc.candidates.width.addInk(inlineSpace);
      ifc.candidates.height.stampBlock(mark.box, parent);
      ifc.candidates.addBox(mark.box.treeStart, mark.box.treeFinal, inlineSpace);
    }

    // Either a Unicode soft wrap, before/after an inline-block, or cluster
    // boundary enabled by overflow-wrap
    const isBreak = mark.isBreak || mark.isGraphemeBreak;

    if (
      // Is an opportunity for wrapping
      isBreak && (
        // There is content on the hypothetical line and CSS allows wrapping
        wouldHaveContent && !nowrap ||
        // A <br> or preserved \n always creates a new line
        mark.isBreakForced ||
        // The end of the paragraph always ensures there's a line
        mark.position === ifc.block.text.length
      )
    ) {
      if (!ifc.lineIsDirty) bfc.fctx?.preTextContent();

      const blockSize = ifc.height.totalWith(ifc.candidates.height);
      bfc.getLocalVacancyForLine(bfc, ifc.blockOffset, blockSize, ifc.vacancy);

      if (ifc.block.text[mark.position - 1] === '\u00ad' && !mark.isBreakForced) {
        const glyphs = getHyphen(item!)?.glyphs;
        const {face: {hbface: {upem}}, attrs: {style: {fontSize}}} = item!;
        if (glyphs?.length) {
          let w = 0;
          for (let i = 0; i < glyphs.length; i += G_SZ) w += glyphs[i + G_AX];
          ifc.candidates.width.addHyphen(w / upem * fontSize);
        }
      }

      // Conditions to finish the current line and start a new one
      // This is for soft wraps. Hard wraps are followed again later.
      if (
        // The line has non-whitespace text or inline-blocks
        ifc.line.hasContent(layout) &&
        // The word being added isn't just whitespace
        ifc.candidates.width.hasContent() &&
        // The line would overflow if we added the word
        !ifc.vacancy.fits(ifc.width.forWord() + ifc.candidates.width.asWord())
      ) {
        if (!ifc.lastBreakMark) throw new Error('Assertion failed');
        const {position, itemIndex} = ifc.lastBreakMark;
        const lastBreakMarkItem = ifc.block.items[itemIndex];

        if (lastBreakMarkItem?.hasCharacterInside(position)) {
          splitItem(layout, ifc, parent, ifc.lastBreakMark);
          ifc.lastBreakMark.split(mark);
        }

        finishLine(ifc, ifc.line, false);
        ifc.line.reset();
      }

      if (!ifc.line.hasContent(layout) /* line was just added */) {
        if (ifc.candidates.width.forFloat() > ifc.vacancy.inlineSize && bfc.fctx) {
          const newVacancy = bfc.fctx.findLinePosition(ifc.blockOffset, blockSize, ifc.candidates.width.forFloat());
          ifc.blockOffset = newVacancy.blockOffset;
          bfc.fctx?.dropShelf(ifc.blockOffset);
        }
      }

      // Add at each normal wrapping opportunity. Inside overflow-wrap
      // segments, we add each character while the line doesn't have a word.
      if (mark.isBreak || !ifc.lineHasWord) {
        if (mark.isBreak) ifc.lineHasWord = true;
        if (mark.isBreakForced) {
          const box = layout.tree[mark.treeIndex];
          if (box.isBreak()) ifc.candidates.addBox(mark.treeIndex, mark.treeIndex, 0);
        }
        ifc.line.concat(ifc.candidates);
        ifc.width.concat(ifc.candidates.width);
        ifc.height.concat(ifc.candidates.height);
        ifc.lineIsDirty = true;

        ifc.candidates.clearContents();
        ifc.lastBreakMark = mark;

        for (const float of ifc.floatsInWord) {
          const fctx = bfc.ensureFloatContext(ifc.blockOffset);
          layoutFloatBox(layout, float, ctx);
          fctx.placeFloat(ifc.width.forFloat(), false, float);
        }
        if (ifc.floatsInWord.length) ifc.floatsInWord = [];

        if (mark.isBreakForced) {
          if (item?.hasCharacterInside(mark.position)) {
            splitItem(layout, ifc, parent, mark);
            ifc.lastBreakMark.split(mark);
          }
          finishLine(ifc, ifc.line, false);
          ifc.line.reset();
          ifc.lineIsDirty = true;
        }
      }
    }

    if (mark.isItemStart) {
      ifc.candidates.onItemStart();
      ifc.candidates.height.stampMetrics(getMetrics(parent.style, item!.face));
    }

    if (mark.inlinePost) {
      ifc.parents.pop();
      ifc.candidates.height.popInline();
    }
  }

  for (const float of ifc.floatsInWord) {
    const fctx = bfc.ensureFloatContext(ifc.blockOffset);
    layoutFloatBox(layout, float, ctx);
    fctx.placeFloat(ifc.lineIsDirty ? ifc.width.forFloat() : 0, !ifc.lineIsDirty, float);
  }

  if (ifc.lineIsDirty) {
    // If the IFC consists of only whitespace and inline-blocks or replaced
    // elements, the whitespace is added here
    ifc.line.concat(ifc.candidates);
    // There could have been floats after the paragraph's final line break
    bfc.getLocalVacancyForLine(bfc, ifc.blockOffset, ifc.line.height(), ifc.vacancy);
    finishLine(ifc, ifc.line, true);
  } else if (ifc.candidates.width.hasContent()) {
    // We never hit a break opportunity because there is no non-whitespace
    // text and no inline-blocks, but there is some content on spans (border,
    // padding, or margin). Add everything.
    ifc.line.concat(ifc.candidates);
    finishLine(ifc, ifc.line, true);
  } else {
    bfc.fctx?.consumeMisfits();
  }

  if (ifc.block.loggingEnabled()) {
    const log = new Logger();
    log.text('\n'); // finishLine() logs, but doesn't know when it's done
    log.text(`Paragraph ${ifc.block.id()}:\n`);
    log.pushIndent();
    for (const item of ifc.block.items) {
      const lead = `@${item.offset} `.padEnd(5);
      log.text(lead);
      log.pushIndent(' '.repeat(lead.length));
      log.text(`F:${basename(item.face.url)}\n`);
      log.text(`T:"${item.text()}"\n`);
      log.text(`G:`);
      log.glyphs(item.glyphs);
      log.text('\n');
      log.popIndent();
    }
    if (bfc.fctx) {
      log.text('Left floats\n');
      log.text(`${bfc.fctx.leftFloats.repr()}\n`);
      log.text('Right floats');
      log.text(`${bfc.fctx.rightFloats.repr()}\n`);
    }
    log.flush();
  }

  return ifc;
}

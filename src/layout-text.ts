import {basename, loggableText, Logger} from './util.ts';
import {Box, TreeNode, Layout} from './layout-box.ts';
import {Style} from './style.ts';
import {
  ReplacedBox,
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
import type {TextAlign, WhiteSpace} from './style.ts';
import type {BlockLevel, InlineLevel, BlockContainer, LayoutContext} from './layout-flow.ts';

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

export function collapseWhitespace(tree: InlineLevel[], ifc: BlockContainerOfInlines) {
  const str = new Uint16Array(ifc.text.length);
  const parents: Inline[] = [];
  let delta = 0;
  let index = 0;
  let inWhitespace = false;
  let treeDelta = 0;
  let w = ifc.treeStart + 2;

  for (let r = ifc.treeStart + 2; r <= ifc.treeFinal; r++) {
    const item = tree[r];

    if (item.isRun()) {
      const whiteSpace = item.style.whiteSpace;
      const originalStart = item.textStart;

      item.textStart -= delta;

      if (whiteSpace === 'normal' || whiteSpace === 'nowrap') {
        for (let i = originalStart; i < item.textEnd; i++) {
          const isWhitespace = isSpaceOrTabOrNewline(ifc.text[i]);

          if (inWhitespace && isWhitespace) {
            delta += 1;
          } else {
            str[index++] = isWhitespace ? spaceCharacter : ifc.text.charCodeAt(i);
          }

          inWhitespace = isWhitespace;
        }
      } else if (whiteSpace === 'pre-line') {
        for (let i = originalStart; i < item.textEnd; i++) {
          const isWhitespace = isSpaceOrTabOrNewline(ifc.text[i]);

          if (isWhitespace) {
            let j = i + 1;
            let hasNewline = isNewline(ifc.text[i]);

            for (; j < item.textEnd && isSpaceOrTabOrNewline(ifc.text[j]); j++) {
              hasNewline = hasNewline || isNewline(ifc.text[j]);
            }

            while (i < j) {
              if (isSpaceOrTab(ifc.text[i])) {
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
            str[index++] = ifc.text.charCodeAt(i);
            inWhitespace = false;
          }
        }
      } else { // pre
        inWhitespace = false;
        for (let i = originalStart; i < item.textEnd; i++) {
          str[index++] = ifc.text.charCodeAt(i);
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

  const rootInline = tree[ifc.treeStart + 1];
  if (!rootInline.isInline()) throw new Error('Assertion failed!');
  rootInline.textEnd -= delta;
  rootInline.treeFinal -= treeDelta;
  ifc.treeFinal -= treeDelta;

  if (treeDelta > 0) {
    tree.length -= treeDelta;
  }

  ifc.text = decoder.decode(str.subarray(0, index));
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

interface IfcRenderItem {
  end(): number;
  inlines: Inline[];
  attrs: ShapingAttrs;
}

export class ShapedShim implements IfcRenderItem {
  offset: number;
  inlines: Inline[];
  attrs: ShapingAttrs;
  /** Defined when the shim is containing an inline-block or image */
  box: BlockContainer | ReplacedBox | undefined;

  constructor(offset: number, inlines: Inline[], attrs: ShapingAttrs, box?: BlockContainer | ReplacedBox) {
    this.offset = offset;
    this.inlines = inlines;
    this.attrs = attrs;
    this.box = box;
  }

  end() {
    return this.offset;
  }
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

export class ShapedItem implements IfcRenderItem {
  ifc: BlockContainerOfInlines;
  face: LoadedFontFace;
  glyphs: Int32Array;
  offset: number;
  length: number;
  attrs: ShapingAttrs;
  inlines: Inline[];
  x: number;
  y: number;

  constructor(
    ifc: BlockContainerOfInlines,
    face: LoadedFontFace,
    glyphs: Int32Array,
    offset: number,
    length: number,
    attrs: ShapingAttrs
  ) {
    this.ifc = ifc;
    this.face = face;
    this.glyphs = glyphs;
    this.offset = offset;
    this.length = length;
    this.attrs = attrs;
    this.inlines = [];
    this.x = 0;
    this.y = 0;
  }

  clone() {
    return new ShapedItem(
      this.ifc,
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
      || isInsideGraphemeBoundary(this.ifc.text, this.offset + offset);
    const inlines = this.inlines;
    const right = new ShapedItem(
      this.ifc,
      this.face,
      rightGlyphs,
      this.offset + offset,
      this.length - offset,
      this.attrs
    );

    this.glyphs = leftGlyphs;
    this.length = offset;
    this.inlines = inlines.filter(inline => {
      return inline.textStart < this.end() && inline.textEnd > this.offset;
    });
    right.inlines = inlines.filter(inline => {
      return inline.textStart < right.end() && inline.textEnd > right.offset;
    });

    for (const i of right.inlines) i.nshaped += 1;

    return {needsReshape, right};
  }

  reshape(walkBackwards: boolean) {
    if (walkBackwards && !(this.attrs.level & 1) || !walkBackwards && this.attrs.level & 1) {
      let i = this.glyphs.length - G_SZ;
      while ((i = prevCluster(this.glyphs, i)) >= 0) {
        if (!(this.glyphs[i + G_FL] & 2) && !(this.glyphs[i + G_SZ + G_FL] & 2)) {
          const offset = this.attrs.level & 1 ? this.offset : this.glyphs[i + G_SZ + G_CL];
          const length = this.attrs.level & 1 ? this.glyphs[i + G_CL] - offset : this.end() - offset;
          const newGlyphs = shapePart(this.ifc, offset, length, this.face, this.attrs);
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
          const newGlyphs = shapePart(this.ifc, offset, length, this.face, this.attrs);
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

    this.glyphs = shapePart(this.ifc, this.offset, this.length, this.face, this.attrs);
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
      state.isInk = isink(this.ifc.text[cl]);
    } else {
      state.done = true;
    }
  }

  measureInsideCluster(state: MeasureState, ci: number) {
    const s = this.ifc.text.slice(state.clusterStart, state.clusterEnd);
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

  collapseWhitespace(at: 'start' | 'end') {
    if (!this.attrs.style.isWsCollapsible()) return true;

    if (at === 'start') {
      let index = 0;
      do {
        if (!isink(this.ifc.text[this.glyphs[index + G_CL]])) {
          this.glyphs[index + G_AX] = 0;
        } else {
          return true;
        }
      } while ((index = nextCluster(this.glyphs, index)) < this.glyphs.length);
    } else {
      let index = this.glyphs.length - G_SZ;
      do {
        if (!isink(this.ifc.text[this.glyphs[index + G_CL]])) {
          this.glyphs[index + G_AX] = 0;
        } else {
          return true;
        }
      } while ((index = prevCluster(this.glyphs, index)) >= 0);
    }
  }

  end() {
    return this.offset + this.length;
  }

  hasCharacterInside(ci: number) {
    return ci > this.offset && ci < this.end();
  }

  // only use this in debugging or tests
  text() {
    return this.ifc.text.slice(this.offset, this.offset + this.length);
  }
}

interface LineItem {
  value: ShapedItem | ShapedShim;
  next: LineItem | null;
  previous: LineItem | null;
}

class LineItemLinkedList {
  head: LineItem | null;
  tail: LineItem | null;

  constructor() {
    this.head = null;
    this.tail = null;
  }

  clear() {
    this.head = null;
    this.tail = null;
  }

  transfer() {
    const ret = new LineItemLinkedList();
    ret.concat(this);
    this.clear();
    return ret;
  }

  concat(items: LineItemLinkedList) {
    if (!items.head) return;

    if (this.tail) {
      this.tail.next = items.head;
      items.head.previous = this.tail;
      this.tail = items.tail;
    } else {
      this.head = items.head;
      this.tail = items.tail;
    }
  }

  rconcat(items: LineItemLinkedList) {
    if (!items.tail) return;

    if (this.head) {
      items.tail.next = this.head;
      this.head.previous = items.tail;
      this.head = items.head;
    } else {
      this.head = items.head;
      this.tail = items.tail;
    }
  }

  push(value: LineItem['value']) {
    if (this.tail) {
      this.tail = this.tail.next = {value, next: null, previous: this.tail};
    } else {
      this.head = this.tail = {value, next: null, previous: null};
    }
  }

  unshift(value: LineItem['value']) {
    const item = {value, next: this.head, previous: null};
    if (this.head) this.head.previous = item;
    this.head = item;
    if (!this.tail) this.tail = item;
  }

  reverse() {
    for (let n = this.head; n; n = n.previous) {
      [n.next, n.previous] = [n.previous, n.next];
    }

    [this.head, this.tail] = [this.tail, this.head];
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
      const linebox = block.lineboxes.at(-1);
      if (linebox) return offset + linebox.blockOffset + linebox.ascender;
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
  const {blockStart: marginBlockStart, blockEnd: marginBlockEnd} = box.getMarginsAutoIsZero();
  const baseline = box.style.overflow === 'hidden' ? undefined : getLastBaseline(layout, box);
  let ascender, descender;

  if (baseline !== undefined) {
    const containingBlock = box.getContainingBlock();
    const paddingBlockStart = box.style.getPaddingBlockStart(containingBlock);
    const paddingBlockEnd = box.style.getPaddingBlockEnd(containingBlock);
    const borderBlockStart = box.style.getBorderBlockStartWidth(containingBlock);
    const borderBlockEnd = box.style.getBorderBlockEndWidth(containingBlock);
    const blockSize = box.getContentArea().blockSize;
    ascender = marginBlockStart + borderBlockStart + paddingBlockStart + baseline;
    descender = (blockSize - baseline) + paddingBlockEnd + borderBlockEnd + marginBlockEnd;
  } else {
    ascender = marginBlockStart + box.getBorderArea().blockSize + marginBlockEnd;
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

class LineCandidates extends LineItemLinkedList {
  width: LineWidthTracker;
  height: LineHeightTracker;

  constructor(layout: Layout, ifc: BlockContainerOfInlines) {
    super();
    this.width = new LineWidthTracker();
    this.height = new LineHeightTracker(layout, ifc);
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
  ifc: BlockContainerOfInlines;
  parents: Inline[];
  contextStack: AlignmentContext[];
  contextRoots: Map<Inline, AlignmentContext>;
  /** Inline blocks, images */
  boxes: BlockLevel[];
  markedContextRoots: Inline[];

  constructor(layout: Layout, ifc: BlockContainerOfInlines) {
    const inline = layout.tree[ifc.treeStart + 1];
    if (!inline.isInline()) throw new Error('Assertion failed');
    const ctx = new AlignmentContext(inline.metrics);

    this.layout = layout;
    this.ifc = ifc;
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
        const {blockStart, blockEnd} = box.getMarginsAutoIsZero();
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
        const {blockStart, blockEnd} = box.getMarginsAutoIsZero();
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

export class Linebox extends LineItemLinkedList {
  startOffset: number;
  ifc: BlockContainerOfInlines;
  ascender: number;
  descender: number;
  endOffset: number;
  blockOffset: number;
  inlineOffset: number;
  width: number;
  contextRoots: Map<Inline, AlignmentContext>;

  constructor(start: number, ifc: BlockContainerOfInlines) {
    super();
    this.startOffset = this.endOffset = start;
    this.ifc = ifc;
    this.ascender = 0;
    this.descender = 0;
    this.blockOffset = 0;
    this.inlineOffset = 0;
    this.width = 0;
    this.contextRoots = EMPTY_MAP;
  }

  addCandidates(candidates: LineCandidates, endOffset: number) {
    this.concat(candidates);
    this.endOffset = endOffset;
  }

  hasContent() {
    if (this.endOffset > this.startOffset) {
      return true;
    } else {
      for (let n = this.head; n; n = n.next) {
        if (n.value instanceof ShapedShim && n.value.box) return true;
      }
    }
    return false;
  }

  hasAnything() {
    return this.head != null;
  }

  height() {
    return this.ascender + this.descender;
  }

  trimStart() {
    for (let n = this.head; n; n = n.next) {
      if (n.value instanceof ShapedShim) {
        if (n.value.box) return;
      } else if (n.value.collapseWhitespace('start')) {
        return;
      }
    }
  }

  trimEnd() {
    for (let n = this.tail; n; n = n.previous) {
      if (n.value instanceof ShapedShim) {
        if (n.value.box) return;
      } else if (n.value.collapseWhitespace('end')) {
        return;
      }
    }
  }

  reorderRange(start: LineItem | null, length: number) {
    const ret = new LineItemLinkedList();
    let minLevel = Infinity;

    for (let i = 0, n = start; n && i < length; ++i, n = n.next) {
      minLevel = Math.min(minLevel, n.value.attrs.level);
    }

    let levelStartIndex = 0;
    let levelStartNode = start;

    for (let i = 0, n = start; n && i < length; ++i, n = n.next) {
      if (n.value.attrs.level === minLevel) {
        if (minLevel & 1) {
          if (i > levelStartIndex) {
            ret.rconcat(this.reorderRange(levelStartNode, i - levelStartIndex));
          }
          ret.unshift(n.value);
        } else {
          if (i > levelStartIndex) {
            ret.concat(this.reorderRange(levelStartNode, i - levelStartIndex));
          }
          ret.push(n.value);
        }

        levelStartIndex = i + 1;
        levelStartNode = n.next;
      }
    }

    if (minLevel & 1) {
      if (levelStartIndex < length) {
        ret.rconcat(this.reorderRange(levelStartNode, length - levelStartIndex));
      }
    } else {
      if (levelStartIndex < length) {
        ret.concat(this.reorderRange(levelStartNode, length - levelStartIndex));
      }
    }

    return ret;
  }

  reorder() {
    let levelOr = 0;
    let levelAnd = 1;
    let length = 0;

    for (let n = this.head; n; n = n.next) {
      levelOr |= n.value.attrs.level;
      levelAnd &= n.value.attrs.level;
      length += 1;
    }

    // If none of the levels had the LSB set, all numbers were even
    const allEven = (levelOr & 1) === 0;

    // If all of the levels had the LSB set, all numbers were odd
    const allOdd = (levelAnd & 1) === 1;

    if (!allEven && !allOdd) {
      this.concat(this.reorderRange(this.transfer().head, length));
    } else if (allOdd) {
      this.reverse();
    }
  }

  postprocess(width: LineWidthTracker, height: LineHeightTracker, vacancy: IfcVacancy, textAlign: TextAlign) {
    const dir = this.ifc.style.direction;
    const w = width.trimmed();
    const {ascender, descender} = height.align();

    this.width = w;
    if (height.contextRoots.size) this.contextRoots = new Map(height.contextRoots);
    this.blockOffset = vacancy.blockOffset;
    this.reorder();
    this.trimStart();
    this.trimEnd();
    this.ascender = ascender;
    this.descender = descender;
    this.inlineOffset = dir === 'ltr' ? vacancy.leftOffset : vacancy.rightOffset;

    if (w < vacancy.inlineSize) {
      if (textAlign === 'right' && dir === 'ltr' || textAlign === 'left' && dir === 'rtl') {
        this.inlineOffset += vacancy.inlineSize - w;
      } else if (textAlign === 'center') {
        this.inlineOffset += (vacancy.inlineSize - w) / 2;
      }
    }
  }
}

export interface InlineFragment {
  inline: Inline;
  textOffset: number;
  start: number;
  end: number;
  blockOffset: number;
  ascender: number;
  descender: number;
  naturalStart: boolean;
  naturalEnd: boolean;
}

class ContiguousBoxBuilder {
  opened: Map<Inline, InlineFragment>;
  closed: Map<Inline, InlineFragment[]>;

  constructor() {
    this.opened = new Map();
    this.closed = new Map();
  }

  open(
    inline: Inline,
    textOffset: number,
    naturalStart: boolean,
    start: number,
    blockOffset: number
  ) {
    const fragment = this.opened.get(inline);

    if (fragment) {
      fragment.end = start;
    } else {
      const end = start;
      const naturalEnd = false;
      const {ascender, descender} = inline.metrics;
      const fragment: InlineFragment = {
        start, end, inline, textOffset, blockOffset, ascender, descender, naturalStart, naturalEnd
      };
      this.opened.set(inline, fragment);
      // Make sure closed is in open order
      if (!this.closed.has(inline)) this.closed.set(inline, []);
    }
  }

  close(inline: Inline, naturalEnd: boolean, end: number) {
    const fragment = this.opened.get(inline);

    if (fragment) {
      const list = this.closed.get(inline);
      fragment.end = end;
      fragment.naturalEnd = naturalEnd;
      this.opened.delete(inline);
      list ? list.push(fragment) : this.closed.set(inline, [fragment]);
    }
  }

  closeAll(except: Inline[], end: number) {
    for (const inline of this.opened.keys()) {
      if (!except.includes(inline)) this.close(inline, false, end);
    }
  }
}

interface IfcMark {
  position: number;
  isBreak: boolean;
  isGraphemeBreak: boolean;
  isBreakForced: boolean;
  isItemStart: boolean;
  inlinePre: Inline | null;
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
  ifc: BlockContainerOfInlines,
  item: ShapedItem,
  start: number,
  end: number
) {
  const inline = layout.tree[ifc.treeStart + 1];
  if (!inline.isInline()) throw new Error('Assertion failed');
  if (inline.hasSoftHyphen()) {
    const mark = item.end() - 1;
    const hyphen = getHyphen(item);
    if (
      mark >= start &&
      mark < end &&
      ifc.text[mark] === '\u00ad' && // softHyphenCharacter
      hyphen
    ) {
      const first = ifc.text.slice(start, mark);
      const second = ifc.text.slice(mark + 1, end);
      const glyphIndex = item.attrs.level & 1 ? 0 : item.glyphs.length - G_SZ;
      if (hyphen.glyphs[G_ID] === item.glyphs[glyphIndex + G_ID]) {
        return first + hyphen.codepoint + second;
      }
    }
  }
  return ifc.text.slice(start, end);
}

function isInsideGraphemeBoundary(text: string, offset: number) {
  return nextGraphemeBreak(text, previousGraphemeBreak(text, offset)) !== offset;
}

function shapePartWithWordCache(
  ifc: BlockContainerOfInlines,
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
    const leftInSpaceSegment = ifc.text[i] === ' ';
    const rightInSpaceSegment = ifc.text[i + 1] === ' ';

    wordLen += 1;

    if (leftInSpaceSegment !== rightInSpaceSegment || i === end - 1) {
      const word = ifc.text.slice(wordStart, wordStart + wordLen);
      let wordGlyphs = wordCacheGet(font, word);

      if (!wordGlyphs) {
        if (wordCacheSize > 10_000) clearWordCache();
        hbBuffer.setLength(0);
        hbBuffer.addUtf16(
          ifc.buffer.array.byteOffset + wordStart * 2,
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
  ifc: BlockContainerOfInlines,
  offset: number,
  length: number,
  font: HbFont,
  attrs: ShapingAttrs
) {
  hbBuffer.setLength(0);
  hbBuffer.addUtf16(ifc.buffer.array.byteOffset, ifc.buffer.array.length, offset, length);
  hbBuffer.setScript(nameToTag.get(attrs.script)!);
  hbBuffer.setLanguage(langForScript(attrs.script)); // TODO: [lang]
  hbBuffer.setDirection(attrs.level & 1 ? 'rtl' : 'ltr');
  hb.shape(font, hbBuffer);
  return hbBuffer.extractGlyphs();
}

function postShapeLoadHyphens(ifc: BlockContainerOfInlines, items: ShapedItem[]) {
  let itemIndex = 0;
  for (let textOffset = 0; textOffset < ifc.text.length; textOffset++) {
    if (ifc.text[textOffset] === '\u00ad' /* softHyphenCharacter */) {
      while ( // Forward to the item that owns the textOffset
        itemIndex + 1 < items.length &&
        items[itemIndex + 1].offset <= textOffset
      ) itemIndex++;

      loadHyphen(items[itemIndex]);
    }
  }
}

function shapePart(
  ifc: BlockContainerOfInlines,
  offset: number,
  length: number,
  face: LoadedFontFace,
  attrs: ShapingAttrs
) {
  if (face.spaceMayParticipateInShaping(attrs.script)) {
    return shapePartWithoutWordCache(ifc, offset, length, face.hbfont, attrs);
  } else {
    return shapePartWithWordCache(ifc, offset, length, face.hbfont, attrs);
  }
}

export function createIfcShapedItems(
  layout: Layout,
  ifc: BlockContainerOfInlines,
  inlineRoot: Inline
) {
  const items: ShapedItem[] = [];
  const log = ifc.loggingEnabled() ? new Logger() : null;
  const t = log ? (s: string) => log.text(s) : null;
  const g = log ? (glyphs: Int32Array) => log.glyphs(glyphs) : null;
  const itemizeState = createItemizeState(layout, ifc);

  t?.(`Preprocess ${ifc.id()}\n`);
  t?.('='.repeat(`Preprocess ${ifc.id()}`.length) + '\n');
  t?.(`Full text: "${ifc.text}"\n`);

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
        const shapedPart = shapePart(ifc, offset, length, face, attrs);
        const hbClusterState = createGlyphIteratorState(shapedPart, attrs.level, offset, end);
        let needsReshape = false;
        let segmentTextStart = offset;
        let segmentTextEnd = offset;
        let segmentGlyphStart = hbClusterState.glyphIndex;
        let segmentGlyphEnd = hbClusterState.glyphIndex;

        t?.(`Shaping "${ifc.text.slice(offset, end)}" with font ${face.url}\n`);
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
              segmentTextEnd = nextGrapheme(ifc.text, segmentTextEnd);

              while (!hbClusterState.done && hbClusterState.clusterStart < segmentTextEnd) {
                segmentGlyphEnd = hbClusterState.glyphIndex;
                nextGlyph(hbClusterState);
              }
            }

            // if we're starting a needs-reshape segment (ending a well-shaped
            // segment) we have to rewind the boundary to a grapheme boundary
            if (!hbClusterState.done && !needsReshape) {
              segmentTextEnd = prevGrapheme(ifc.text, segmentTextEnd);

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
                items.push(new ShapedItem(ifc, face, glyphs, offset, length, {...attrs}));
                t?.('Cascade finished with tofu: ');
                g?.(glyphs);
                t?.('\n');
              } else {
                t?.(`Must reshape "${ifc.text.slice(offset, offset + length)}"\n`);
                nextShapeWork.push({offset, length});
              }
            } else if (glyphStart < glyphEnd) {
              const glyphs = glyphStart === 0 && glyphEnd === shapedPart.length
                ? shapedPart
                : shapedPart.subarray(glyphStart, glyphEnd);

              items.push(new ShapedItem(ifc, face, glyphs, offset, length, {...attrs}));
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

  if (inlineRoot.hasSoftHyphen()) postShapeLoadHyphens(ifc, items);

  return items;
}

function createMarkIterator(
  layout: Layout,
  ifc: BlockContainerOfInlines,
  mode: 'min-content' | 'max-content' | 'normal'
) {
  const inlineRoot = layout.tree[ifc.treeStart + 1];
  if (!inlineRoot.isInline()) throw new Error('Assertion failed');
  // Inline iterator
  let inline = createInlineIteratorState(layout, ifc);
  inlineIteratorStateNext(inline);
  let inlineMark = 0;
  // Break iterator
  const breakIterator = inlineRoot.hasSoftWrap()
    ? new LineBreak(ifc.text, !inlineRoot.hasSoftWrap())
    : new HardBreaker(ifc.text);
  let linebreak: {position: number, required: boolean} | null = {position: -1, required: false};
  let breakMark = 0;
  // Item iterator
  let itemIndex = -1;
  let itemMeasureState: MeasureState | undefined;
  let itemMark = 0;
  // Grapheme iterator
  let graphemeBreakMark = 0;
  // Other
  const end = ifc.text.length;

  const next = (): {done: true} | {done: false, value: IfcMark} => {
    const mark: IfcMark = {
      position: Math.min(inlineMark, itemMark, breakMark, graphemeBreakMark),
      isBreak: false,
      isGraphemeBreak: false,
      isBreakForced: false,
      isItemStart: false,
      inlinePre: null,
      inlinePost: null,
      box: null,
      advance: 0,
      trailingWs: 0,
      itemIndex,
      split
    };

    if (!inline.value && !linebreak && itemIndex >= ifc.items.length) {
      return {done: true};
    }

    if (itemIndex < ifc.items.length && itemIndex > -1) {
      const item = ifc.items[itemIndex];
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
          inlineMark += inline.value.item.length;
          if (!inline.value.item.wrapsOverflowAnywhere(mode)) {
            graphemeBreakMark = inlineMark;
          }
          inlineIteratorStateNext(inline);
        } else if (inline.value.state === 'break') {
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

    if (itemIndex < ifc.items.length && itemMark === mark.position && (!inline.value || inlineMark !== mark.position)) {
      itemIndex += 1;

      if (itemIndex < ifc.items.length) {
        const item = ifc.items[itemIndex];
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
        graphemeBreakMark = nextGraphemeBreak(ifc.text, graphemeBreakMark);
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
    mark.itemIndex += 1;

    const item = ifc.items[this.itemIndex];

    if (itemIndex === this.itemIndex) {
      itemMeasureState = item.createMeasureState();
      item.measure(mark.position, 1, itemMeasureState);
    }
  }

  return {[Symbol.iterator]: () => ({next})};
}

export function getIfcContribution(
  layout: Layout,
  ifc: BlockContainerOfInlines,
  mode: 'min-content' | 'max-content'
) {
  const width = new LineWidthTracker();
  let contribution = 0;

  for (const mark of createMarkIterator(layout, ifc, mode)) {
    const inkAdvance = mark.advance - mark.trailingWs;
    const isBreak = mark.isBreak || mark.isGraphemeBreak;

    if (inkAdvance) width.addInk(inkAdvance);
    if (mark.trailingWs) width.addWs(mark.trailingWs, true /* TODO */);
    if (mark.inlinePre) width.addInk(mark.inlinePre.getInlineSideSize('pre'));
    if (mark.inlinePost) width.addInk(mark.inlinePost.getInlineSideSize('post'));

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

function splitItem(ifc: BlockContainerOfInlines, itemIndex: number, offset: number) {
  const left = ifc.items[itemIndex];
  const {needsReshape, right} = left.split(offset - left.offset);

  if (needsReshape) {
    left.reshape(true);
    right.reshape(false);
  }

  ifc.items.splice(itemIndex + 1, 0, right);
  if (ifc.text[offset - 1] === '\u00ad' /* softHyphenCharacter */) {
    const hyphen = getHyphen(left)?.glyphs;
    if (hyphen?.length) {
      const glyphs = new Int32Array(left.glyphs.length + hyphen.length);
      if (left.attrs.level & 1) {
        glyphs.set(hyphen, 0);
        glyphs.set(left.glyphs, hyphen.length);
        for (let i = G_CL; i < hyphen.length; i += G_SZ) {
          glyphs[i] = offset - 1;
        }
      } else {
        glyphs.set(left.glyphs, 0);
        glyphs.set(hyphen, left.glyphs.length);
        for (let i = left.glyphs.length + G_CL; i < glyphs.length; i += G_SZ) {
          glyphs[i] = offset - 1;
        }
      }
      left.glyphs = glyphs;
    }
  }
}

export function createIfcLineboxes(
  layout: Layout,
  ifc: BlockContainerOfInlines,
  ctx: LayoutContext
) {
  const bfc = ctx.bfc!;
  /** Holds shaped items, width and height trackers for the current word */
  const candidates = new LineCandidates(layout, ifc);
  /** Tracks the width of the line being worked on */
  const width = new LineWidthTracker();
  /** Tracks the height, ascenders and descenders of the line being worked on */
  const height = new LineHeightTracker(layout, ifc);
  const vacancy = new IfcVacancy(0, 0, 0, 0, 0, 0);
  const rootInline = layout.tree[ifc.treeStart + 1];
  if (!rootInline.isInline()) throw new Error('Assertion failed');
  const parents: Inline[] = [];
  let line: Linebox | null = null;
  let lastBreakMark: IfcMark | undefined;
  const lines = [];
  let floatsInWord = [];
  let blockOffset = bfc.cbBlockStart;
  let lineHasWord = false;

  const finishLine = (line: Linebox) => {
    line.postprocess(width, height, vacancy, ifc.style.getTextAlign());
    const blockSize = line.height();
    width.reset();
    height.reset();
    bfc.fctx?.postLine(line, true);
    blockOffset += blockSize;
    bfc.getLocalVacancyForLine(bfc, blockOffset, blockSize, vacancy);
    lineHasWord = false;
  };

  for (const mark of createMarkIterator(layout, ifc, 'normal')) {
    const parent = parents[parents.length - 1] || rootInline;
    const item = ifc.items[mark.itemIndex];

    if (mark.inlinePre) {
      candidates.height.pushInline(mark.inlinePre);
      if (
        item &&
        item.offset <= mark.inlinePre.textStart &&
        item.end() > mark.inlinePre.textStart
      ) {
        candidates.height.stampMetrics(getMetrics(mark.inlinePre.style, item.face));
      }
      parents.push(mark.inlinePre);
    }

    const wsCollapsible = parent.style.isWsCollapsible();
    const nowrap = isNowrap(parent.style.whiteSpace);
    const inkAdvance = mark.advance - mark.trailingWs;

    if (inkAdvance) candidates.width.addInk(inkAdvance);
    if (mark.trailingWs) candidates.width.addWs(mark.trailingWs, !!wsCollapsible);

    const wouldHaveContent = width.hasContent() || candidates.width.hasContent();

    if (mark.box?.isFloat()) {
      if (
        // No text content yet on the hypothetical line
        !wouldHaveContent ||
        // No text between the last break and the float
        lastBreakMark && lastBreakMark.position === mark.position
      ) {
        const lineWidth = line ? width.forFloat() : 0;
        const lineIsEmpty = line ? !candidates.head && !line.head : true;
        const fctx = bfc.ensureFloatContext(blockOffset);
        layoutFloatBox(layout, mark.box, ctx);
        fctx.placeFloat(lineWidth, lineIsEmpty, mark.box);
      } else {
        // Have to place after the word
        floatsInWord.push(mark.box);
      }
    }

    if (mark.inlinePre) candidates.width.addInk(mark.inlinePre.getInlineSideSize('pre'));
    if (mark.inlinePost) candidates.width.addInk(mark.inlinePost.getInlineSideSize('post'));

    if (mark.box?.isInlineLevel()) {
      layoutFloatBox(layout, mark.box, ctx);
      const {lineLeft, lineRight} = mark.box.getMarginsAutoIsZero();
      const borderArea = mark.box.getBorderArea();
      candidates.width.addInk(lineLeft + borderArea.inlineSize + lineRight);
      candidates.height.stampBlock(mark.box, parent);
    }

    if (mark.inlinePre && (mark.inlinePost || mark.isBreakForced) || mark.box?.isInlineLevel()) {
      const [left, right] = [item, ifc.items[mark.itemIndex + 1]];
      let level: number = 0;
      // Treat the empty span as an Other Neutral (ON) according to UAX29. I
      // think that's what browsers are doing.
      if (left && !right /* beyond last item */) level = left.attrs.level;
      if (!left && right /* before first item */) level = right.attrs.level;
      // An ON should take on the embedding level if the left and right levels
      // are diferent, but there is no embedding level for the empty span since
      // it isn't a character. Taking the min should fit most scenarios.
      if (left && right) level = Math.min(left.attrs.level, right.attrs.level);
      // If there are no left or right, there is no text, so level=0 is OK
      const style = mark.inlinePre?.style || (mark.box as Box).style;
      const attrs = {level, isEmoji: false, script: 'Latn', style};
      const shiv = new ShapedShim(mark.position, parents.slice(), attrs, mark.box || undefined);
      candidates.push(shiv);
      for (const p of parents) p.nshaped += 1;
    }

    // Either a Unicode soft wrap, before/after an inline-block, or cluster
    // boundary enabled by overflow-wrap
    const isBreak = mark.isBreak || mark.isGraphemeBreak;

    if (
      // Is an opportunity for soft wrapping
      isBreak && (
        // There is content on the hypothetical line and CSS allows wrapping
        wouldHaveContent && !nowrap ||
        // A <br> or preserved \n always creates a new line
        mark.isBreakForced ||
        // The end of the paragraph always ensures there's a line
        mark.position === ifc.text.length
      )
    ) {
      if (!line) {
        lines.push(line = new Linebox(0, ifc));
        bfc.fctx?.preTextContent();
      }

      const blockSize = height.totalWith(candidates.height);
      bfc.getLocalVacancyForLine(bfc, blockOffset, blockSize, vacancy);

      if (ifc.text[mark.position - 1] === '\u00ad' && !mark.isBreakForced) {
        const glyphs = getHyphen(item)?.glyphs;
        const {face: {hbface: {upem}}, attrs: {style: {fontSize}}} = item;
        if (glyphs?.length) {
          let w = 0;
          for (let i = 0; i < glyphs.length; i += G_SZ) w += glyphs[i + G_AX];
          candidates.width.addHyphen(w / upem * fontSize);
        }
      }

      // Conditions to finish the current line and start a new one
      // This is for soft wraps. Hard wraps are followed again later.
      if (
        // The line has non-whitespace text or inline-blocks
        line.hasContent() &&
        // The word being added isn't just whitespace
        candidates.width.hasContent() &&
        // The line would overflow if we added the word
        !vacancy.fits(width.forWord() + candidates.width.asWord())
      ) {
        const lastLine = line;
        if (!lastBreakMark) throw new Error('Assertion failed');
        lines.push(line = new Linebox(lastBreakMark.position, ifc));
        const lastBreakMarkItem = ifc.items[lastBreakMark.itemIndex];

        if (lastBreakMarkItem?.hasCharacterInside(lastBreakMark.position)) {
          splitItem(ifc, lastBreakMark.itemIndex, lastBreakMark.position);
          lastBreakMark.split(mark);
          candidates.unshift(ifc.items[lastBreakMark.itemIndex]);
          // Stamp the brand new line with its metrics, since the only other
          // place this happens is mark.itemStart
          candidates.height.stampMetrics(getMetrics(parent.style, lastBreakMarkItem.face));
        }

        finishLine(lastLine);
      }

      if (!line.hasContent() /* line was just added */) {
        if (candidates.width.forFloat() > vacancy.inlineSize && bfc.fctx) {
          const newVacancy = bfc.fctx.findLinePosition(blockOffset, blockSize, candidates.width.forFloat());
          blockOffset = newVacancy.blockOffset;
          bfc.fctx?.dropShelf(blockOffset);
        }
      }

      // Add at each normal wrapping opportunity. Inside overflow-wrap
      // segments, we add each character while the line doesn't have a word.
      if (mark.isBreak || !lineHasWord) {
        if (mark.isBreak) lineHasWord = true;
        line.addCandidates(candidates, mark.position);
        width.concat(candidates.width);
        height.concat(candidates.height);

        candidates.clearContents();
        lastBreakMark = mark;

        for (const float of floatsInWord) {
          const fctx = bfc.ensureFloatContext(blockOffset);
          layoutFloatBox(layout, float, ctx);
          fctx.placeFloat(width.forFloat(), false, float);
        }
        if (floatsInWord.length) floatsInWord = [];

        if (mark.isBreakForced) {
          finishLine(line);
          lines.push(line = new Linebox(mark.position, ifc));
        }
      }
    }

    if (mark.isItemStart) {
      item.inlines = parents.slice();
      for (const p of parents) p.nshaped += 1;
      candidates.push(item);
      candidates.height.stampMetrics(getMetrics(parent.style, item.face));
    }

    // Handle a span that starts inside a shaped item
    if (mark.inlinePre && item && mark.position < item.end()) {
      item.inlines.push(mark.inlinePre);
      mark.inlinePre.nshaped += 1;
    }

    if (mark.inlinePost) {
      parents.pop();
      candidates.height.popInline();
    }
  }

  for (const float of floatsInWord) {
    const fctx = bfc.ensureFloatContext(blockOffset);
    layoutFloatBox(layout, float, ctx);
    fctx.placeFloat(line ? width.forFloat() : 0, line ? !line.head : true, float);
  }

  if (line) {
    // If the IFC consists of only whitespace and inline-blocks or replaced
    // elements, the whitespace is added here
    line.addCandidates(candidates, ifc.text.length);
    // There could have been floats after the paragraph's final line break
    bfc.getLocalVacancyForLine(bfc, blockOffset, line.height(), vacancy);
    finishLine(line);
  } else if (candidates.width.hasContent()) {
    // We never hit a break opportunity because there is no non-whitespace
    // text and no inline-blocks, but there is some content on spans (border,
    // padding, or margin). Add everything.
    lines.push(line = new Linebox(0, ifc));
    line.addCandidates(candidates, ifc.text.length);
    finishLine(line);
  } else {
    bfc.fctx?.consumeMisfits();
  }

  if (ifc.loggingEnabled()) {
    const log = new Logger();
    log.text(`Paragraph ${ifc.id()}:\n`);
    log.pushIndent();
    for (const item of ifc.items) {
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
    for (const [i, line] of lines.entries()) {
      const W = line.width.toFixed(2);
      const A = line.ascender.toFixed(2);
      const D = line.descender.toFixed(2);
      const B = line.blockOffset.toFixed(2);
      log.text(`Line ${i} (W:${W} A:${A} D:${D} B:${B}): `);
      for (let n = line.head; n; n = n.next) {
        log.text(n.value instanceof ShapedItem ? `"${n.value.text()}" ` : '"" ');
      }
      log.text('\n');
    }
    if (bfc.fctx) {
      log.text('Left floats\n');
      log.text(`${bfc.fctx.leftFloats.repr()}\n`);
      log.text('Right floats');
      log.text(`${bfc.fctx.rightFloats.repr()}\n`);
    }
    log.pushIndent();
    log.flush();
  }

  return lines;
}

export function positionIfcItems(
  layout: Layout,
  ifc: BlockContainerOfInlines
) {
  const rootInline = layout.tree[ifc.treeStart + 1];
  if (!rootInline.isInline()) throw new Error('Assertion failed');
  const counts: Map<Inline, number> = new Map();
  const direction = ifc.style.direction;
  const containingBlock = ifc.getContainingBlock();
  const contentArea = ifc.getContentArea();
  let x = 0;
  let bgcursor = 0;

  function inlineMarginAdvance(inline: Inline, side: 'start' | 'end') {
    const style = inline.style;
    let margin
      = (direction === 'ltr' ? side === 'start' : side === 'end')
      ? style.getMarginLineLeft(containingBlock)
      : style.getMarginLineRight(containingBlock);

    if (margin === 'auto') margin = 0;

    if (side === 'start') {
      bgcursor += direction === 'ltr' ? margin : -margin;
    }

    x += direction === 'ltr' ? margin : -margin;
  }

  function inlineBorderAdvance(inline: Inline, side: 'start' | 'end') {
    const style = inline.style;
    const borderWidth
      = (direction === 'ltr' ? side === 'start' : side === 'end')
      ? style.borderLeftWidth
      : style.borderRightWidth;

    if (side === 'start' && style.backgroundClip !== 'border-box') {
      bgcursor += direction === 'ltr' ? borderWidth : -borderWidth;
    }

    if (side === 'end' && style.backgroundClip === 'border-box') {
      bgcursor += direction === 'ltr' ? borderWidth : -borderWidth;
    }

    x += direction === 'ltr' ? borderWidth : -borderWidth;
  }

  function inlinePaddingAdvance(inline: Inline, side: 'start' | 'end') {
    const style = inline.style;
    const padding
      = (direction === 'ltr' ? side === 'start' : side === 'end')
      ? style.getPaddingLineLeft(containingBlock)
      : style.getPaddingLineRight(containingBlock);

    if (side === 'start' && style.backgroundClip === 'content-box') {
      bgcursor += direction === 'ltr' ? padding : -padding;
    }

    if (side === 'end' && style.backgroundClip !== 'content-box') {
      bgcursor += direction === 'ltr' ? padding : -padding;
    }

    x += direction === 'ltr' ? padding : -padding;
  }

  function inlineSideAdvance(inline: Inline, side: 'start' | 'end') {
    if (side === 'start') {
      inlineMarginAdvance(inline, side);
      inlineBorderAdvance(inline, side);
      inlinePaddingAdvance(inline, side);
    } else {
      inlinePaddingAdvance(inline, side);
      inlineBorderAdvance(inline, side);
      inlineMarginAdvance(inline, side);
    }
  }

  function inlineBackgroundAdvance(item: ShapedItem, mark: number, side: 'start' | 'end') {
    if (mark > item.offset && mark < item.end()) {
      if (direction === 'ltr' && side === 'start' || direction === 'rtl' && side === 'end') {
        const direction = item.attrs.level & 1 ? -1 : 1;
        bgcursor += item instanceof ShapedItem ? item.measure(mark, direction).advance : 0;
      }

      if (direction === 'rtl' && side === 'start' || direction === 'ltr' && side === 'end') {
        const direction = item.attrs.level & 1 ? 1 : -1;
        bgcursor -= item instanceof ShapedItem ? item.measure(mark, direction).advance : 0;
      }
    }
  }

  for (const linebox of ifc.lineboxes) {
    const boxBuilder = rootInline.hasPaintedInlines() ? new ContiguousBoxBuilder() : undefined;
    const firstItem = direction === 'ltr' ? linebox.head : linebox.tail;
    let y = linebox.blockOffset + linebox.ascender;

    if (direction === 'ltr') {
      x = linebox.inlineOffset;
    } else {
      x = contentArea.inlineSize - linebox.inlineOffset;
    }

    for (let n = firstItem; n; n = direction === 'ltr' ? n.next : n.previous) {
      const item = n.value;
      let baselineShift = 0;

      boxBuilder?.closeAll(item.inlines, x);

      for (let i = 0; i < item.inlines.length; ++i) {
        const inline = item.inlines[i];
        const count = counts.get(inline);
        const isFirstOccurance = count === undefined;
        const isOrthogonal = (item.attrs.level & 1 ? 'rtl' : 'ltr') !== direction;
        const mark = isOrthogonal ? inline.textEnd : inline.textStart;
        const alignmentContext = linebox.contextRoots.get(inline);

        bgcursor = x;

        if (alignmentContext) baselineShift = alignmentContext.baselineShift;

        baselineShift += baselineStep(item.inlines[i - 1] || rootInline, inline);

        if (item instanceof ShapedItem) {
          inlineBackgroundAdvance(item, mark, 'start');
        }

        if (isFirstOccurance) inlineSideAdvance(inline, 'start');
        const offset = Math.max(item.offset, mark);
        boxBuilder?.open(inline, offset, isFirstOccurance, bgcursor, y - baselineShift);

        if (isFirstOccurance) {
          counts.set(inline, 1);
        } else {
          counts.set(inline, count! + 1);
        }
      }

      if (item instanceof ShapedItem) {
        const width = item.measure().advance;
        item.x = direction === 'ltr' ? x : x - width;
        item.y = y - baselineShift;
        x += direction === 'ltr' ? width : -width;
      } else if (item.box) {
        const parent = item.inlines.at(-1) || rootInline;
        const {lineLeft, blockStart, lineRight} = item.box.getMarginsAutoIsZero();
        const borderArea = item.box.getBorderArea();

        if (item.box.style.verticalAlign === 'top') {
          item.box.setBlockPosition(linebox.blockOffset + blockStart);
        } else if (item.box.style.verticalAlign === 'bottom') {
          const {ascender, descender} = inlineBlockMetrics(layout, item.box);
          item.box.setBlockPosition(
            linebox.blockOffset + linebox.height() - descender - ascender + blockStart
          );
        } else {
          const inlineBlockBaselineShift = baselineShift + inlineBlockBaselineStep(layout, parent, item.box);
          const {ascender} = inlineBlockMetrics(layout, item.box);
          item.box.setBlockPosition(y - inlineBlockBaselineShift - ascender + blockStart);
        }

        if (direction === 'ltr') {
          item.box.setInlinePosition(x + lineLeft);
          x += lineLeft + borderArea.width + lineRight;
        } else {
          x -= lineRight + borderArea.width + lineLeft;
          item.box.setInlinePosition(x + lineLeft);
        }
      }

      for (let i = item.inlines.length - 1; i >= 0; --i) {
        const inline = item.inlines[i];
        const count = counts.get(inline)!;
        const isLastOccurance = count === inline.nshaped;
        const isOrthogonal = (item.attrs.level & 1 ? 'rtl' : 'ltr') !== direction;
        const mark = isOrthogonal ? inline.textStart : inline.textEnd;

        bgcursor = x;

        if (item instanceof ShapedItem) {
          inlineBackgroundAdvance(item, mark, 'end');
        }

        if (isLastOccurance) inlineSideAdvance(inline, 'end');

        if (
          boxBuilder && (
            isLastOccurance || isOrthogonal && (mark > item.offset && mark < item.end())
          )
        ) {
          boxBuilder.close(inline, isLastOccurance, bgcursor);
        }
      }
    }

    boxBuilder?.closeAll([], x);

    if (boxBuilder) {
      for (const [inline, list] of boxBuilder.closed) {
        const thisList = ifc.fragments.get(inline);
        if (thisList) {
          for (const fragment of list) thisList.push(fragment);
        } else {
          ifc.fragments.set(inline, list);
        }
      }
    }
  }
}

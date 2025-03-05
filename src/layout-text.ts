import {binarySearchTuple, basename, loggableText, Logger} from './util.js';
import {RenderItem, RenderItemLogOptions} from './layout-box.js';
import {Style, Color, TextAlign, WhiteSpace} from './style.js';
import {
  BlockContainer,
  IfcInline,
  IfcVacancy,
  Inline,
  InlineLevel,
  LayoutContext,
  createInlineIterator,
  createPreorderInlineIterator,
  layoutFloatBox
} from './layout-flow.js';
import LineBreak, {HardBreaker} from './text-line-break.js';
import {nextGraphemeBreak, previousGraphemeBreak} from './text-grapheme-break.js';
import * as hb from './text-harfbuzz.js';
import {getCascade} from './text-font.js';
import {nameToTag} from '../gen/script-names.js';
import {createItemizeState, itemizeNext} from './text-itemize.js';

import type {LoadedFontFace} from './text-font.js';
import type {HbFace, HbFont, AllocatedUint16Array} from './text-harfbuzz.js';

const lineFeedCharacter = 0x000a;
const formFeedCharacter = 0x000c;
const carriageReturnCharacter = 0x000d;
const spaceCharacter = 0x0020;
const zeroWidthSpaceCharacter = 0x200b;
const objectReplacementCharacter = 0xfffc;

const decoder = new TextDecoder('utf-16');

function isWsCollapsible(whiteSpace: WhiteSpace) {
  return whiteSpace === 'normal' || whiteSpace === 'nowrap' || whiteSpace === 'pre-line';
}

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

export class Run extends RenderItem {
  public start: number;
  public end: number;

  constructor(start: number, end: number, style: Style) {
    super(style);
    this.start = start;
    this.end = end;
  }

  get length() {
    return this.end - this.start;
  }

  getLogSymbol() {
    return 'Ͳ';
  }

  get wsCollapsible() {
    return isWsCollapsible(this.style.whiteSpace);
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

  logName(log: Logger, options?: RenderItemLogOptions) {
    log.text(`${this.start},${this.end}`);
    if (options?.paragraphText) {
      log.text(` "${loggableText(options.paragraphText.slice(this.start, this.end))}"`);
    }
  }
}

export function collapseWhitespace(ifc: IfcInline) {
  const stack: (InlineLevel | {post: Inline})[] = ifc.children.slice().reverse();
  const parents: Inline[] = [ifc];
  const str = new Uint16Array(ifc.text.length);
  let delta = 0;
  let stri = 0;
  let inWhitespace = false;

  while (stack.length) {
    const item = stack.pop()!;

    if ('post' in item) {
      const inline = item.post;
      inline.end -= delta;
      parents.pop();
    } else if (item.isInline()) {
      item.start -= delta;
      parents.push(item);
      stack.push({post: item});
      for (let i = item.children.length - 1; i >= 0; --i) stack.push(item.children[i]);
    } else if (item.isRun()) {
      const whiteSpace = item.style.whiteSpace;
      const originalStart = item.start;

      item.start -= delta;

      if (whiteSpace === 'normal' || whiteSpace === 'nowrap') {
        for (let i = originalStart; i < item.end; i++) {
          const isWhitespace = isSpaceOrTabOrNewline(ifc.text[i]);

          if (inWhitespace && isWhitespace) {
            delta += 1;
          } else {
            str[stri++] = isWhitespace ? spaceCharacter : ifc.text.charCodeAt(i);
          }

          inWhitespace = isWhitespace;
        }
      } else if (whiteSpace === 'pre-line') {
        for (let i = originalStart; i < item.end; i++) {
          const isWhitespace = isSpaceOrTabOrNewline(ifc.text[i]);

          if (isWhitespace) {
            let j = i + 1;
            let hasNewline = isNewline(ifc.text[i]);

            for (; j < item.end && isSpaceOrTabOrNewline(ifc.text[j]); j++) {
              hasNewline = hasNewline || isNewline(ifc.text[j]);
            }

            while (i < j) {
              if (isSpaceOrTab(ifc.text[i])) {
                if (inWhitespace || hasNewline) {
                  delta += 1;
                } else {
                  str[stri++] = spaceCharacter;
                }
                inWhitespace = true;
              } else { // newline
                str[stri++] = lineFeedCharacter;
                inWhitespace = false;
              }

              i++;
            }

            i = j - 1;
          } else {
            str[stri++] = ifc.text.charCodeAt(i);
            inWhitespace = false;
          }
        }
      } else { // pre
        inWhitespace = false;
        for (let i = originalStart; i < item.end; i++) {
          str[stri++] = ifc.text.charCodeAt(i);
        }
      }

      item.end -= delta;

      if (item.length === 0) {
        const parent = parents.at(-1)!;
        const i = parent.children.indexOf(item);
        if (i < 0) throw new Error('Assertion failed');
        parent.children.splice(i, 1);
      }
    } else if (item.isBlockContainer() && !item.isFloat()) { // inline-block
      inWhitespace = false;
    }
  }

  ifc.text = decoder.decode(str.subarray(0, stri));
  ifc.end = ifc.text.length;
}

export interface ShapingAttrs {
  isEmoji: boolean;
  level: number;
  script: string;
  style: Style;
}

const hyphenCache = new Map<string, Int32Array>();

export function getFontMetrics(inline: Inline) {
  const strutCascade = getCascade(inline.style, 'en');
  const [strutFace] = strutCascade.matches;
  return getMetrics(inline.style, strutFace);
}

export const G_ID = 0;
export const G_CL = 1;
export const G_AX = 2;
export const G_AY = 3;
export const G_DX = 4;
export const G_DY = 5;
export const G_FL = 6;
export const G_SZ = 7;

const HyphenCodepointsToTry = '\u2010\u002d'; // HYPHEN, HYPHEN MINUS

function createHyphenCacheKey(item: ShapedItem) {
  return item.face.url.href;
}

function loadHyphen(item: ShapedItem) {
  const key = createHyphenCacheKey(item);

  if (!hyphenCache.has(key)) {
    hyphenCache.set(key, new Int32Array(0));

    for (const hyphen of HyphenCodepointsToTry) {
      const buf = hb.createBuffer();
      buf.setClusterLevel(1);
      buf.addText(hyphen);
      buf.guessSegmentProperties();
      hb.shape(item.face.hbfont, buf);
      const glyphs = buf.extractGlyphs();
      buf.destroy();
      if (glyphs[G_ID]) {
        hyphenCache.set(key, glyphs);
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
  /** Defined when the shim is containing an inline-block */
  block: BlockContainer | undefined;

  constructor(offset: number, inlines: Inline[], attrs: ShapingAttrs, block?: BlockContainer) {
    this.offset = offset;
    this.inlines = inlines;
    this.attrs = attrs;
    this.block = block;
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
  paragraph: Paragraph;
  face: LoadedFontFace;
  glyphs: Int32Array;
  offset: number;
  length: number;
  attrs: ShapingAttrs;
  inlines: Inline[];
  x: number;
  y: number;

  constructor(
    paragraph: Paragraph,
    face: LoadedFontFace,
    glyphs: Int32Array,
    offset: number,
    length: number,
    attrs: ShapingAttrs
  ) {
    this.paragraph = paragraph;
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
      this.paragraph,
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
      || this.paragraph.isInsideGraphemeBoundary(this.offset + offset);
    const inlines = this.inlines;
    const right = new ShapedItem(
      this.paragraph,
      this.face,
      rightGlyphs,
      this.offset + offset,
      this.length - offset,
      this.attrs
    );

    this.glyphs = leftGlyphs;
    this.length = offset;
    this.inlines = inlines.filter(inline => {
      return inline.start < this.end() && inline.end > this.offset;
    });
    right.inlines = inlines.filter(inline => {
      return inline.start < right.end() && inline.end > right.offset;
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
          const newGlyphs = this.paragraph.shapePart(offset, length, this.face, this.attrs);
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
          const newGlyphs = this.paragraph.shapePart(offset, length, this.face, this.attrs);
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

    this.glyphs = this.paragraph.shapePart(this.offset, this.length, this.face, this.attrs);
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
      state.isInk = isink(this.paragraph.string[cl]);
    } else {
      state.done = true;
    }
  }

  measureInsideCluster(state: MeasureState, ci: number) {
    const s = this.paragraph.string.slice(state.clusterStart, state.clusterEnd);
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
    if (!isWsCollapsible(this.attrs.style.whiteSpace)) return true;

    if (at === 'start') {
      let index = 0;
      do {
        if (!isink(this.paragraph.string[this.glyphs[index + G_CL]])) {
          this.glyphs[index + G_AX] = 0;
        } else {
          return true;
        }
      } while ((index = nextCluster(this.glyphs, index)) < this.glyphs.length);
    } else {
      let index = this.glyphs.length - G_SZ;
      do {
        if (!isink(this.paragraph.string[this.glyphs[index + G_CL]])) {
          this.glyphs[index + G_AX] = 0;
        } else {
          return true;
        }
      } while ((index = prevCluster(this.glyphs, index)) >= 0);
    }
  }

  // used in shaping
  colorsStart(colors: [Color, number][]) {
    const s = binarySearchTuple(colors, this.offset);
    if (s === colors.length) return s - 1;
    if (colors[s][1] !== this.offset) return s - 1;
    return s;
  }

  // used in shaping
  colorsEnd(colors: [Color, number][]) {
    const s = binarySearchTuple(colors, this.end() - 1);
    if (s === colors.length) return s;
    if (colors[s][1] !== this.end() - 1) return s;
    return s + 1;
  }

  end() {
    return this.offset + this.length;
  }

  hasCharacterInside(ci: number) {
    return ci > this.offset && ci < this.end();
  }

  // only use this in debugging or tests
  text() {
    return this.paragraph.string.slice(this.offset, this.offset + this.length);
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

export function inlineBlockMetrics(block: BlockContainer) {
  const {blockStart: marginBlockStart, blockEnd: marginBlockEnd} = block.getMarginsAutoIsZero();
  const baseline = block.style.overflow === 'hidden' ? undefined : block.getLastBaseline();
  let ascender, descender;

  if (baseline !== undefined) {
    const paddingBlockStart = block.style.getPaddingBlockStart(block);
    const paddingBlockEnd = block.style.getPaddingBlockEnd(block);
    const borderBlockStart = block.style.getBorderBlockStartWidth(block);
    const borderBlockEnd = block.style.getBorderBlockEndWidth(block);
    const blockSize = block.contentArea.blockSize;
    ascender = marginBlockStart + borderBlockStart + paddingBlockStart + baseline;
    descender = (blockSize - baseline) + paddingBlockEnd + borderBlockEnd + marginBlockEnd;
  } else {
    ascender = marginBlockStart + block.borderArea.blockSize + marginBlockEnd;
    descender = 0;
  }

  return {ascender, descender};
}

function inlineBlockBaselineStep(parent: Inline, block: BlockContainer) {
  if (block.style.overflow === 'hidden') {
    return 0;
  }

  if (block.style.verticalAlign === 'baseline') {
    return 0;
  }

  if (block.style.verticalAlign === 'super') {
    return parent.metrics.superscript;
  }

  if (block.style.verticalAlign === 'sub') {
    return -parent.metrics.subscript;
  }

  if (block.style.verticalAlign === 'middle') {
    const {ascender, descender} = inlineBlockMetrics(block);
    const midParent = parent.metrics.xHeight / 2;
    const midInline = (ascender - descender) / 2;
    return midParent - midInline;
  }

  if (block.style.verticalAlign === 'text-top') {
    const {ascender} = inlineBlockMetrics(block);
    return parent.metrics.ascender - ascender;
  }

  if (block.style.verticalAlign === 'text-bottom') {
    const {descender} = inlineBlockMetrics(block);
    return descender - parent.metrics.descender;
  }

  if (typeof block.style.verticalAlign === 'object') {
    const lineHeight = block.style.lineHeight;
    if (lineHeight === 'normal') {
      // TODO: is there a better/faster way to do this? currently struts only
      // exist if there is a paragraph, but I think spec is saying do this
      const strutCascade = getCascade(block.style, 'en');
      const [strutFace] = strutCascade.matches;
      const metrics = getMetrics(block.style, strutFace);
      return (metrics.ascenderBox + metrics.descenderBox) * block.style.verticalAlign.value / 100;
    } else {
      return lineHeight * block.style.verticalAlign.value / 100;
    }
  }

  if (typeof block.style.verticalAlign === 'number') {
    return block.style.verticalAlign;
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

  stampBlock(block: BlockContainer, parent: Inline) {
    const {ascender, descender} = inlineBlockMetrics(block);
    const baselineShift = this.baselineShift + inlineBlockBaselineStep(parent, block);
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

  constructor(ifc: IfcInline) {
    super();
    this.width = new LineWidthTracker();
    this.height = new LineHeightTracker(ifc);
  }

  clearContents() {
    this.width.reset();
    this.height.clearContents();
    this.clear();
  }
};

const EMPTY_MAP = Object.freeze(new Map());

class LineHeightTracker {
  ifc: IfcInline;
  parents: Inline[];
  contextStack: AlignmentContext[];
  contextRoots: Map<Inline, AlignmentContext>;
  /** Inline blocks */
  blocks: BlockContainer[];
  markedContextRoots: Inline[];

  constructor(ifc: IfcInline) {
    const ctx = new AlignmentContext(ifc.metrics);

    this.ifc = ifc;
    this.parents = [];
    this.contextStack = [ctx];
    this.contextRoots = EMPTY_MAP;
    this.blocks = [];
    this.markedContextRoots = [];
  }

  stampMetrics(metrics: InlineMetrics) {
    this.contextStack.at(-1)!.stampMetrics(metrics);
  }

  stampBlock(block: BlockContainer, parent: Inline) {
    if (block.style.verticalAlign === 'top' || block.style.verticalAlign === 'bottom') {
      this.blocks.push(block);
    } else {
      this.contextStack.at(-1)!.stampBlock(block, parent);
    }
  }

  pushInline(inline: Inline) {
    const parent = this.parents.at(-1) || this.ifc;
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
      const parent = this.parents.at(-1) || this.ifc;
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

    for (const block of height.blocks) this.blocks.push(block);
  }

  align(): {ascender: number, descender: number} {
    const rootCtx = this.contextStack[0];

    if (this.contextRoots.size === 0 && this.blocks.length === 0) return rootCtx;

    const lineHeight = this.total();
    let bottomsHeight = rootCtx.ascender + rootCtx.descender;

    for (const [inline, ctx] of this.contextRoots) {
      if (inline.style.verticalAlign === 'bottom') {
        bottomsHeight = Math.max(bottomsHeight, ctx.ascender + ctx.descender);
      }
    }

    for (const block of this.blocks) {
      if (block.style.verticalAlign === 'bottom') {
        const blockSize = block.borderArea.blockSize;
        const {blockStart, blockEnd} = block.getMarginsAutoIsZero();
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
    if (this.contextRoots.size === 0 && this.blocks.length === 0) {
      return height;
    } else {
      for (const ctx of this.contextRoots.values()) {
        height = Math.max(height, ctx.ascender + ctx.descender);
      }
      for (const block of this.blocks) {
        const blockSize = block.borderArea.blockSize;
        const {blockStart, blockEnd} = block.getMarginsAutoIsZero();
        height = Math.max(height, blockStart + blockSize + blockEnd);
      }
      return height;
    }
  }

  totalWith(height: LineHeightTracker) {
    return Math.max(this.total(), height.total());
  }

  reset() {
    const ctx = new AlignmentContext(this.ifc.metrics);
    this.parents = [];
    this.contextStack = [ctx];
    this.contextRoots = EMPTY_MAP;
    this.blocks = [];
    this.markedContextRoots = [];
  }

  clearContents() {
    let parent: Inline = this.ifc;
    let inline = this.parents[0];
    let i = 0;

    if (
      this.contextStack.length === 1 && // no vertical-align top or bottoms
      this.parents.length <= 1 // one non-top/bottom/baseline parent or none
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
            inline = this.parents[++i];
            break;
          } else {
            ctx.stepIn(parent, inline);
            ctx.stampMetrics(inline.metrics);
            parent = inline;
            inline = this.parents[++i];
          }
        }
      }
    }

    for (const inline of this.markedContextRoots) this.contextRoots.delete(inline);

    this.markedContextRoots = [];
    this.blocks = [];
  }
}

export class Linebox extends LineItemLinkedList {
  startOffset: number;
  paragraph: Paragraph;
  ascender: number;
  descender: number;
  endOffset: number;
  blockOffset: number;
  inlineOffset: number;
  width: number;
  contextRoots: Map<Inline, AlignmentContext>;

  constructor(start: number, paragraph: Paragraph) {
    super();
    this.startOffset = this.endOffset = start;
    this.paragraph = paragraph;
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
        if (n.value instanceof ShapedShim && n.value.block) return true;
      }
    }
    return false;
  }

  hasAnything() {
    return this.head != null;
  }

  end() {
    return this.endOffset;
  }

  height() {
    return this.ascender + this.descender;
  }

  trimStart() {
    for (let n = this.head; n; n = n.next) {
      if (n.value instanceof ShapedShim) {
        if (n.value.block) return;
      } else if (n.value.collapseWhitespace('start')) {
        return;
      }
    }
  }

  trimEnd() {
    for (let n = this.tail; n; n = n.previous) {
      if (n.value instanceof ShapedShim) {
        if (n.value.block) return;
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
    const dir = this.paragraph.ifc.style.direction;
    const w = width.trimmed();
    const {ascender, descender} = height.align();

    this.width = w;
    if (height.contextRoots.size) this.contextRoots = new Map(height.contextRoots);
    this.blockOffset = vacancy.blockOffset;
    this.trimStart();
    this.trimEnd();
    this.reorder();
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

export interface BackgroundBox {
  linebox: Linebox;
  start: number;
  end: number;
  blockOffset: number;
  ascender: number;
  descender: number;
  naturalStart: boolean;
  naturalEnd: boolean;
}

class ContiguousBoxBuilder {
  opened: Map<Inline, BackgroundBox>;
  closed: Map<Inline, BackgroundBox[]>;

  constructor() {
    this.opened = new Map();
    this.closed = new Map();
  }

  open(inline: Inline, linebox: Linebox, naturalStart: boolean, start: number, blockOffset: number) {
    const box = this.opened.get(inline);

    start = Math.round(start);

    if (box) {
      box.end = start;
    } else {
      const end = start;
      const naturalEnd = false;
      const {ascender, descender} = inline.metrics;
      const box: BackgroundBox = {
        start, end, linebox, blockOffset, ascender, descender, naturalStart, naturalEnd
      };
      this.opened.set(inline, box);
      // Make sure closed is in open order
      if (!this.closed.has(inline)) this.closed.set(inline, []);
    }
  }

  close(inline: Inline, naturalEnd: boolean, end: number) {
    const box = this.opened.get(inline);

    end = Math.round(end);

    if (box) {
      const list = this.closed.get(inline);
      box.end = end;
      box.naturalEnd = naturalEnd;
      this.opened.delete(inline);
      list ? list.push(box) : this.closed.set(inline, [box]);
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
  block: BlockContainer | null;
  advance: number;
  trailingWs: number;
  itemIndex: number;
  split: (this: IfcMark, mark: IfcMark) => void;
}

function isink(c: string) {
  return c !== undefined && c !== ' ' && c !== '\t';
}

function createIfcBuffer(text: string) {
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

export class Paragraph {
  ifc: IfcInline;
  string: string;
  buffer: AllocatedUint16Array;
  brokenItems: ShapedItem[];
  wholeItems: ShapedItem[];
  treeItems: (ShapedItem | ShapedShim)[];
  lineboxes: Linebox[];
  backgroundBoxes: Map<Inline, BackgroundBox[]>;
  height: number;

  constructor(ifc: IfcInline, buffer: AllocatedUint16Array) {
    this.ifc = ifc;
    this.string = ifc.text;
    this.buffer = buffer;
    this.brokenItems = [];
    this.wholeItems = [];
    this.treeItems = [];
    this.lineboxes = [];
    this.backgroundBoxes = new Map();
    this.height = 0;
  }

  destroy() {
    this.buffer.destroy();
    this.buffer = EmptyBuffer;
  }

  slice(start: number, end: number) {
    return this.string.slice(start, end);
  }

  split(itemIndex: number, offset: number) {
    const left = this.brokenItems[itemIndex];
    const {needsReshape, right} = left.split(offset - left.offset);

    if (needsReshape) {
      left.reshape(true);
      right.reshape(false);
    }

    this.brokenItems.splice(itemIndex + 1, 0, right);
    if (this.string[offset - 1] === '\u00ad' /* softHyphenCharacter */) {
      const hyphen = getHyphen(left);
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
      // TODO 1: this sucks, but it's probably still better than using a Uint16Array
      // and having to convert back to strings for the browser canvas backend
      // TODO 2: the hyphen character could also be HYPHEN MINUS
      this.string = this.string.slice(0, offset - 1) + /* U+2010 */ '‐' + this.string.slice(offset);
    }
  }

  isInsideGraphemeBoundary(offset: number) {
    return nextGraphemeBreak(this.string, previousGraphemeBreak(this.string, offset)) !== offset;
  }

  length() {
    return this.string.length;
  }

  nlIterator() {
    const s = this.string;
    const l = s.length;
    let i = 1;
    let ended = false;

    return {
      next():{done: true} | {done: false, value: {i: number}} {
        if (ended) return {done: true};
        while (i < l && s[i - 1] !== '\n') i++;
        const emit = i;
        if (i++ === l) ended = true;
        return {value: {i: emit}, done: false};
      }
    };
  }

  shapePartWithWordCache(offset: number, length: number, font: HbFont, attrs: ShapingAttrs) {
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
      const leftInSpaceSegment = this.string[i] === ' ';
      const rightInSpaceSegment = this.string[i + 1] === ' ';

      wordLen += 1;

      if (leftInSpaceSegment !== rightInSpaceSegment || i === end - 1) {
        const word = this.string.slice(wordStart, wordStart + wordLen);
        let wordGlyphs = wordCacheGet(font, word);

        if (!wordGlyphs) {
          if (wordCacheSize > 10_000) clearWordCache();
          hbBuffer.setLength(0);
          hbBuffer.addUtf16(
            this.buffer.array.byteOffset + wordStart * 2,
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

  shapePartWithoutWordCache(offset: number, length: number, font: HbFont, attrs: ShapingAttrs) {
    hbBuffer.setLength(0);
    hbBuffer.addUtf16(this.buffer.array.byteOffset, this.buffer.array.length, offset, length);
    hbBuffer.setScript(nameToTag.get(attrs.script)!);
    hbBuffer.setLanguage(langForScript(attrs.script)); // TODO: [lang]
    hbBuffer.setDirection(attrs.level & 1 ? 'rtl' : 'ltr');
    hb.shape(font, hbBuffer);
    return hbBuffer.extractGlyphs();
  }

  shapePart(offset: number, length: number, face: LoadedFontFace, attrs: ShapingAttrs) {
    if (face.spaceMayParticipateInShaping(attrs.script)) {
      return this.shapePartWithoutWordCache(offset, length, face.hbfont, attrs);
    } else {
      return this.shapePartWithWordCache(offset, length, face.hbfont, attrs);
    }
  }

  getColors() {
    const colors: [Color, number][] = [[this.ifc.style.color, 0]];

    if (this.ifc.hasColoredInline()) {
      const inlineIterator = createPreorderInlineIterator(this.ifc);
      let inline = inlineIterator.next();

      while (!inline.done) {
        const [, lastColorOffset] = colors[colors.length - 1];
        if (inline.value.isRun()) {
          const style = inline.value.style;
          const color = colors[colors.length - 1];

          if (lastColorOffset === inline.value.start) {
            color[0] = style.color;
          } else if (
            style.color.r !== color[0].r ||
            style.color.g !== color[0].g ||
            style.color.b !== color[0].b ||
            style.color.a !== color[0].a
          ) {
            colors.push([style.color, inline.value.start]);
          }
        }

        inline = inlineIterator.next();
      }
    }

    return colors;
  }

  shape() {
    const items:ShapedItem[] = [];
    const log = this.ifc.loggingEnabled() ? new Logger() : null;
    const t = log ? (s: string) => log.text(s) : null;
    const g = log ? (glyphs: Int32Array) => log.glyphs(glyphs) : null;
    const itemizeState = createItemizeState(this.ifc);

    t?.(`Preprocess ${this.ifc.id}\n`);
    t?.('='.repeat(`Preprocess ${this.ifc.id}`.length) + '\n');
    t?.(`Full text: "${this.string}"\n`);

    log?.pushIndent();

    while (!itemizeState.done) {
      const itemStart = itemizeState.offset;
      itemizeNext(itemizeState);
      const attrs = itemizeState.attrs;
      const cascade = getCascade(attrs.style, langForScript(attrs.script)); // TODO [lang] support
      const itemEnd = itemizeState.offset;
      let shapeWork = [{offset: itemStart, length: itemEnd - itemStart}];

      t?.(`Item ${itemStart}..${itemEnd}:\n`);
      t?.(`emoji=${attrs.isEmoji} level=${attrs.level} script=${attrs.script} `);
      t?.(`size=${attrs.style.fontSize} variant=${attrs.style.fontVariant}\n`);
      t?.(`cascade=${cascade.matches.map(m => basename(m.url)).join(', ')}\n`);

      log?.pushIndent();

      for (let i = 0; shapeWork.length && i < cascade.matches.length; ++i) {
        const nextShapeWork: {offset: number, length: number}[] = [];
        const face = cascade.matches[i];
        const isLastMatch = i === cascade.matches.length - 1;

        while (shapeWork.length) {
          const {offset, length} = shapeWork.pop()!;
          const end = offset + length;
          const shapedPart = this.shapePart(offset, length, face, attrs);
          const hbClusterState = createGlyphIteratorState(shapedPart, attrs.level, offset, end);
          let needsReshape = false;
          let segmentTextStart = offset;
          let segmentTextEnd = offset;
          let segmentGlyphStart = hbClusterState.glyphIndex;
          let segmentGlyphEnd = hbClusterState.glyphIndex;

          t?.(`Shaping "${this.string.slice(offset, end)}" with font ${face.url}\n`);
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
                segmentTextEnd = nextGrapheme(this.string, segmentTextEnd);

                while (!hbClusterState.done && hbClusterState.clusterStart < segmentTextEnd) {
                  segmentGlyphEnd = hbClusterState.glyphIndex;
                  nextGlyph(hbClusterState);
                }
              }

              // if we're starting a needs-reshape segment (ending a well-shaped
              // segment) we have to rewind the boundary to a grapheme boundary
              if (!hbClusterState.done && !needsReshape) {
                segmentTextEnd = prevGrapheme(this.string, segmentTextEnd);

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
                  items.push(new ShapedItem(this, face, glyphs, offset, length, {...attrs}));
                  t?.('Cascade finished with tofu: ');
                  g?.(glyphs);
                  t?.('\n');
                } else {
                  t?.(`Must reshape "${this.string.slice(offset, offset + length)}"\n`);
                  nextShapeWork.push({offset, length});
                }
              } else if (glyphStart < glyphEnd) {
                const glyphs = glyphStart === 0 && glyphEnd === shapedPart.length
                  ? shapedPart
                  : shapedPart.subarray(glyphStart, glyphEnd);

                items.push(new ShapedItem(this, face, glyphs, offset, length, {...attrs}));
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

    this.wholeItems = items.sort((a, b) => a.offset - b.offset);

    if (this.ifc.hasSoftHyphen()) {
      let j = 0;
      for (let i = 0; i < this.string.length; i++) {
        if (this.string[i] === '\u00ad' /* softHyphenCharacter */) {
          while (j + 1 < items.length && items[j + 1].offset <= i) j++;
          loadHyphen(items[j]);
        }
      }
    }
  }

  createMarkIterator(ctx: LayoutContext) {
    // Inline iterator
    const inlineIterator = createInlineIterator(this.ifc);
    let inline = inlineIterator.next();
    let inlineMark = 0;
    // Break iterator
    const breakIterator = this.ifc.wraps()
      ? new LineBreak(this.string, !this.ifc.wraps())
      : new HardBreaker(this.string);
    let linebreak: {position: number, required: boolean} | null = {position: -1, required: false};
    let breakMark = 0;
    // Item iterator
    let itemIndex = -1;
    let itemMeasureState: MeasureState | undefined;
    let itemMark = 0;
    // Grapheme iterator
    let graphemeBreakMark = 0;
    // Other
    const end = this.length();

    const next = (): {done: true} | {done: false, value: IfcMark} => {
      const mark: IfcMark = {
        position: Math.min(inlineMark, itemMark, breakMark, graphemeBreakMark),
        isBreak: false,
        isGraphemeBreak: false,
        isBreakForced: false,
        isItemStart: false,
        inlinePre: null,
        inlinePost: null,
        block: null,
        advance: 0,
        trailingWs: 0,
        itemIndex,
        split
      };

      if (inline.done && !linebreak && itemIndex >= this.brokenItems.length) {
        return {done: true};
      }

      if (itemIndex < this.brokenItems.length && itemIndex > -1) {
        const item = this.brokenItems[itemIndex];
        const {advance, trailingWs} = item.measure(mark.position, 1, itemMeasureState);
        mark.advance = advance;
        mark.trailingWs = trailingWs;
      }

      // Consume the inline break spot if we're not on a break
      if (!inline.done && inline.value.state === 'breakspot' && inlineMark === mark.position && (breakMark === 0 || breakMark !== mark.position)) {
        inline = inlineIterator.next();
      }

      // Consume floats
      if (!inline.done && inline.value.state === 'block' && inline.value.item.isFloat() && inlineMark === mark.position) {
        mark.block = inline.value.item;
        inline = inlineIterator.next();
        return {done: false, value: mark};
      }

      if (!inline.done && inline.value.state === 'breakop' && inlineMark === mark.position) {
        mark.isBreak = true;
        inline = inlineIterator.next();
        return {done: false, value: mark};
      }

      // Consume pre[-text|-break|-block], post["], or pre-post["] before a breakspot
      if (!inline.done && inline.value.state !== 'breakspot' && inlineMark === mark.position) {
        if (inline.value.state === 'pre' || inline.value.state === 'post') {
          if (inline.value.state === 'pre') mark.inlinePre = inline.value.item;
          if (inline.value.state === 'post') mark.inlinePost = inline.value.item;
          inline = inlineIterator.next();
        }

        // Consume post if we consumed pre above
        if (mark.inlinePre && !inline.done && inline.value.state === 'post') {
          mark.inlinePost = inline.value.item;
          inline = inlineIterator.next();
        }

        // Consume text, hard break, or inline-block
        if (!inline.done) {
          if (inline.value.state === 'text') {
            inlineMark += inline.value.item.length;
            if (!inline.value.item.wrapsOverflowAnywhere(ctx.mode)) {
              graphemeBreakMark = inlineMark;
            }
            inline = inlineIterator.next();
          } else if (inline.value.state === 'break') {
            mark.isBreak = true;
            mark.isBreakForced = true;
            inline = inlineIterator.next();
          } else if (inline.value.state === 'block' && inline.value.item.isInlineBlock()) {
            mark.block = inline.value.item;
            inline = inlineIterator.next();
          }
        }
      }

      if (mark.inlinePre || mark.inlinePost || mark.isBreak) return {done: false, value: mark};

      if (itemIndex < this.brokenItems.length && itemMark === mark.position && (inline.done || inlineMark !== mark.position)) {
        itemIndex += 1;

        if (itemIndex < this.brokenItems.length) {
          const item = this.brokenItems[itemIndex];
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
        if (bk && this.ifc.hasText()) {
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
        if (this.ifc.hasText()) {
          mark.isGraphemeBreak = true;
          graphemeBreakMark = nextGraphemeBreak(this.string, graphemeBreakMark);
        } else {
          graphemeBreakMark = end;
        }
      }

      if (!inline.done && inlineMark === mark.position && inline.value.state === 'breakspot') {
        inline = inlineIterator.next();
      }

      return {done: false, value: mark};
    };

    const paragraph = this;

    function split(this: IfcMark, mark: IfcMark) {
      itemIndex += 1;
      this.itemIndex += 1;
      mark.itemIndex += 1;

      const item = paragraph.brokenItems[this.itemIndex];

      if (itemIndex === this.itemIndex) {
        itemMeasureState = item.createMeasureState();
        item.measure(mark.position, 1, itemMeasureState);
      }
    }

    return {[Symbol.iterator]: () => ({next})};
  }

  createLineboxes(ctx: LayoutContext) {
    const bfc = ctx.bfc;
    /** Holds shaped items, width and height trackers for the current word */
    const candidates = new LineCandidates(this.ifc);
    /** Tracks the width of the line being worked on */
    const width = new LineWidthTracker();
    /** Tracks the height, ascenders and descenders of the line being worked on */
    const height = new LineHeightTracker(this.ifc);
    const vacancy = new IfcVacancy(0, 0, 0, 0, 0, 0);
    const basedir = this.ifc.style.direction;
    const parents: Inline[] = [];
    let line: Linebox | null = null;
    let lastBreakMark: IfcMark | undefined;
    const lines = [];
    let floatsInWord = [];
    let blockOffset = bfc.cbBlockStart;
    let lineHasWord = false;

    // Optimization: here we assume that (1) doTextLayout will never be called
    // on the same ifc with a 'normal' mode twice and (2) that when the mode is
    // 'normal', that is the final doTextLayout call for this instance
    if (ctx.mode === 'min-content') {
      this.brokenItems = this.wholeItems.map(item => item.clone());
    } else {
      this.brokenItems = this.wholeItems;
    }

    this.treeItems = [];

    const finishLine = (line: Linebox) => {
      for (let n = line.head; n; n = n.next) this.treeItems.push(n.value);
      line.postprocess(width, height, vacancy, this.ifc.style.textAlign);
      const blockSize = line.height();
      width.reset();
      height.reset();
      bfc.fctx?.postLine(line, true);
      blockOffset += blockSize;
      bfc.getLocalVacancyForLine(bfc, blockOffset, blockSize, vacancy);
      lineHasWord = false;
    };

    for (const mark of this.createMarkIterator(ctx)) {
      const parent = parents[parents.length - 1] || this.ifc;
      const item = this.brokenItems[mark.itemIndex];

      if (mark.inlinePre) {
        candidates.height.pushInline(mark.inlinePre);
        if (item && item.offset <= mark.inlinePre.start && item.end() > mark.inlinePre.start) {
          candidates.height.stampMetrics(getMetrics(mark.inlinePre.style, item.face));
        }
        parents.push(mark.inlinePre);
      }

      const wsCollapsible = isWsCollapsible(parent.style.whiteSpace);
      const nowrap = isNowrap(parent.style.whiteSpace);
      const inkAdvance = mark.advance - mark.trailingWs;

      if (inkAdvance) candidates.width.addInk(inkAdvance);
      if (mark.trailingWs) candidates.width.addWs(mark.trailingWs, !!wsCollapsible);

      const wouldHaveContent = width.hasContent() || candidates.width.hasContent();

      if (mark.block?.isFloat()) {
        if (
          // No text content yet on the hypothetical line
          !wouldHaveContent ||
          // No text between the last break and the float
          lastBreakMark && lastBreakMark.position === mark.position
        ) {
          const lineWidth = line ? width.forFloat() : 0;
          const lineIsEmpty = line ? !candidates.head && !line.head : true;
          const fctx = bfc.ensureFloatContext(blockOffset);
          layoutFloatBox(mark.block, ctx);
          fctx.placeFloat(lineWidth, lineIsEmpty, mark.block);
        } else {
          // Have to place after the word
          floatsInWord.push(mark.block);
        }
      }

      if (mark.inlinePre || mark.inlinePost) {
        const p = basedir === 'ltr' ? 'getLineLeftMarginBorderPadding' : 'getLineRightMarginBorderPadding';
        const op = basedir === 'ltr' ? 'getLineRightMarginBorderPadding' : 'getLineLeftMarginBorderPadding';
        const w = (mark.inlinePre?.[p](this.ifc) ?? 0) + (mark.inlinePost?.[op](this.ifc) ?? 0);
        candidates.width.addInk(w);
      }

      if (mark.block?.isInlineBlock()) {
        layoutFloatBox(mark.block, ctx);
        const {lineLeft, lineRight} = mark.block.getMarginsAutoIsZero();
        candidates.width.addInk(lineLeft + mark.block.borderArea.inlineSize + lineRight);
        candidates.height.stampBlock(mark.block, parent);
      }

      if (mark.inlinePre && mark.inlinePost || mark.block?.isInlineBlock()) {
        const [left, right] = [item, this.brokenItems[mark.itemIndex + 1]];
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
        const style = mark.inlinePre?.style || (mark.block as BlockContainer).style;
        const attrs = {level, isEmoji: false, script: 'Latn', style};
        const shiv = new ShapedShim(mark.position, parents.slice(), attrs, mark.block || undefined);
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
          mark.position === this.length()
        )
      ) {
        if (!line) {
          lines.push(line = new Linebox(0, this));
          bfc.fctx?.preTextContent();
        }

        const blockSize = height.totalWith(candidates.height);
        bfc.getLocalVacancyForLine(bfc, blockOffset, blockSize, vacancy);

        if (this.string[mark.position - 1] === '\u00ad' && !mark.isBreakForced) {
          const glyphs = getHyphen(item);
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
          lines.push(line = new Linebox(lastBreakMark.position, this));
          const lastBreakMarkItem = this.brokenItems[lastBreakMark.itemIndex];

          if (lastBreakMarkItem?.hasCharacterInside(lastBreakMark.position)) {
            this.split(lastBreakMark.itemIndex, lastBreakMark.position);
            lastBreakMark.split(mark);
            candidates.unshift(this.brokenItems[lastBreakMark.itemIndex]);
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
            layoutFloatBox(float, ctx);
            fctx.placeFloat(width.forFloat(), false, float);
          }
          if (floatsInWord.length) floatsInWord = [];

          if (mark.isBreakForced) {
            finishLine(line);
            lines.push(line = new Linebox(mark.position, this));
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
      layoutFloatBox(float, ctx);
      fctx.placeFloat(line ? width.forFloat() : 0, line ? !line.head : true, float);
    }

    if (line) {
      // There could have been floats after the paragraph's final line break
      bfc.getLocalVacancyForLine(bfc, blockOffset, line.height(), vacancy);
      finishLine(line);
    } else if (candidates.width.hasContent()) {
      // We never hit a break opportunity because there is no non-whitespace
      // text and no inline-blocks, but there is some content on spans (border,
      // padding, or margin). Add everything.
      lines.push(line = new Linebox(0, this));
      line.addCandidates(candidates, this.string.length);
      finishLine(line);
    } else {
      bfc.fctx?.consumeMisfits();
    }

    if (this.ifc.loggingEnabled()) {
      const log = new Logger();
      log.text(`Paragraph ${this.ifc.id} (layout mode ${ctx.mode}):\n`);
      log.pushIndent();
      for (const item of this.brokenItems) {
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
          log.text(n.value instanceof ShapedItem ? `“${n.value.text()}” ` : '“” ');
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

    this.lineboxes = lines;
    this.height = blockOffset - bfc.cbBlockStart;
  }

  positionItems(ctx: LayoutContext) {
    const counts: Map<Inline, number> = new Map();
    const direction = this.ifc.style.direction;
    const ifc = this.ifc;
    let x = 0;
    let bgcursor = 0;

    function inlineMarginAdvance(inline: Inline, side: 'start' | 'end') {
      const style = inline.style;
      let margin
        = (direction === 'ltr' ? side === 'start' : side === 'end')
        ? style.getMarginLineLeft(ifc)
        : style.getMarginLineRight(ifc);

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
        ? style.getPaddingLineLeft(ifc)
        : style.getPaddingLineRight(ifc);

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

    for (const linebox of this.lineboxes) {
      const boxBuilder = this.ifc.hasPaintedInlines() ? new ContiguousBoxBuilder() : undefined;
      const firstItem = direction === 'ltr' ? linebox.head : linebox.tail;
      let y = linebox.blockOffset + linebox.ascender;

      if (direction === 'ltr') {
        x = linebox.inlineOffset;
      } else {
        x = this.ifc.containingBlock.inlineSize - linebox.inlineOffset;
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
          const mark = isOrthogonal ? inline.end : inline.start;
          const alignmentContext = linebox.contextRoots.get(inline);

          bgcursor = x;

          if (alignmentContext) baselineShift = alignmentContext.baselineShift;

          baselineShift += baselineStep(item.inlines[i - 1] || ifc, inline);

          if (item instanceof ShapedItem) {
            inlineBackgroundAdvance(item, mark, 'start');
          }

          if (isFirstOccurance) inlineSideAdvance(inline, 'start');
          boxBuilder?.open(inline, linebox, isFirstOccurance, bgcursor, y - baselineShift);

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
        } else if (item.block) {
          const parent = item.inlines.at(-1) || ifc;
          const {lineLeft, blockStart, lineRight} = item.block.getMarginsAutoIsZero();

          if (item.block.style.verticalAlign === 'top') {
            item.block.setBlockPosition(linebox.blockOffset + blockStart);
          } else if (item.block.style.verticalAlign === 'bottom') {
            const {ascender, descender} = inlineBlockMetrics(item.block);
            item.block.setBlockPosition(
              linebox.blockOffset + linebox.height() - descender - ascender + blockStart
            );
          } else {
            const inlineBlockBaselineShift = baselineShift + inlineBlockBaselineStep(parent, item.block);
            const {ascender} = inlineBlockMetrics(item.block);
            item.block.setBlockPosition(y - inlineBlockBaselineShift - ascender + blockStart);
          }

          if (direction === 'ltr') {
            item.block.setInlinePosition(x + lineLeft);
            x += lineLeft + item.block.borderArea.width + lineRight;
          } else {
            x -= lineRight + item.block.borderArea.width + lineLeft;
            item.block.setInlinePosition(x + lineLeft);
          }
        }

        for (let i = item.inlines.length - 1; i >= 0; --i) {
          const inline = item.inlines[i];
          const count = counts.get(inline)!;
          const isLastOccurance = count === inline.nshaped;
          const isOrthogonal = (item.attrs.level & 1 ? 'rtl' : 'ltr') !== direction;
          const mark = isOrthogonal ? inline.start : inline.end;

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
          const thisList = this.backgroundBoxes.get(inline);
          if (thisList) {
            for (const backgroundBox of list) thisList.push(backgroundBox);
          } else {
            this.backgroundBoxes.set(inline, list);
          }
        }
      }
    }
  }
}

export function createParagraph(ifc: IfcInline) {
  const buffer = createIfcBuffer(ifc.text)
  return new Paragraph(ifc, buffer);
}

const EmptyBuffer = {
  array: new Uint16Array(),
  destroy: () => {}
};

export function createEmptyParagraph(ifc: IfcInline) {
  return new Paragraph(ifc, EmptyBuffer);
}

import {binarySearchTuple, basename, loggableText} from './util.js';
import {RenderItem, ReprOptions} from './box.js';
import {Style, Color, TextAlign, WhiteSpace} from './cascade.js';
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
} from './flow.js';
import LineBreak, {HardBreaker} from './line-break.js';
import {nextGraphemeBreak, previousGraphemeBreak} from './grapheme-break.js';
import * as hb from './harfbuzz.js';
import {getCascade} from './font.js';
import {nameToTag} from '../gen/script-names.js';
import {createItemizeState, itemizeNext} from './itemize.js';

import type {FaceMatch} from './font.js';
import type {HbFace, HbFont, AllocatedUint16Array} from './harfbuzz.js';

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

  sym() {
    return 'Ͳ';
  }

  get wsCollapsible() {
    return isWsCollapsible(this.style.whiteSpace);
  }

  isRun(): this is Run {
    return true;
  }

  desc(options?: ReprOptions) {
    let ret = `${this.start},${this.end}`;
    if (options?.paragraphText) {
      ret += ` "${loggableText(options.paragraphText.slice(this.start, this.end))}"`;
    }
    return ret;
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
    }
  }

  ifc.text = decoder.decode(str.subarray(0, stri));
  ifc.end = ifc.text.length;
}

export type ShapingAttrs = {
  isEmoji: boolean,
  level: number,
  script: string,
  style: Style
};

const hyphenCache = new Map<string, Int32Array>();

export function getFontMetrics(inline: Inline) {
  const strutCascade = getCascade(inline.style, 'en');
  const [strutFontMatch] = strutCascade.matches;
  return getMetrics(inline.style, strutFontMatch);
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
  return item.match.filename + item.match.index;
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
      hb.shape(item.match.font, buf);
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
export function getMetrics(style: Style, match: FaceMatch): InlineMetrics {
  let metrics = metricsCache.get(style)?.get(match.face);
  if (metrics) return metrics;
  const {fontSize, lineHeight: cssLineHeight} = style;
  // now do CSS2 §10.8.1
  const {ascender, xHeight, descender, lineGap} = match.font.getMetrics('ltr'); // TODO vertical text
  const toPx = 1 / match.face.upem * fontSize;
  const pxHeight = (ascender - descender) * toPx;
  const lineHeight = cssLineHeight === 'normal' ? pxHeight + lineGap * toPx : cssLineHeight;
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

  map1.set(match.face, metrics);

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

type GlyphIteratorState = {
  glyphIndex: number;
  clusterStart: number;
  clusterEnd: number;
  needsReshape: boolean;
  glyphs: Int32Array;
  level: number;
  textEnd: number;
  done: boolean;
};

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

const reset = '\x1b[0m';
const bold = '\x1b[1m';

function logGlyphs(glyphs: Int32Array) {
  let s = '';
  for (let i = 0; i < glyphs.length; i += G_SZ) {
    const cl = glyphs[i + G_CL];
    const isp = i - G_SZ >= 0 && glyphs[i - G_SZ + G_CL] === cl;
    const isn = i + G_SZ < glyphs.length && glyphs[i + G_SZ + G_CL] === cl;
    if (isp || isn) s += bold;
    if (isn && !isp) s += '(';
    s += glyphs[i + G_ID];
    if (!isn && isp) s += ')';
    s += ' ';
    if (isp || isn) s += reset;
  }
  return s;
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

class ShapedShim implements IfcRenderItem {
  offset: number;
  inlines: Inline[];
  attrs: ShapingAttrs;

  constructor(offset: number, inlines: Inline[], attrs: ShapingAttrs) {
    this.offset = offset;
    this.inlines = inlines;
    this.attrs = attrs;
  }

  end() {
    return this.offset;
  }
}

type MeasureState = {
  glyphIndex: number;
  characterIndex: number;
  clusterStart: number;
  clusterEnd: number;
  clusterAdvance: number;
  isInk: boolean;
  done: boolean;
};

export type InlineMetrics = {
  ascenderBox: number;
  ascender: number;
  superscript: number;
  xHeight: number;
  subscript: number;
  descender: number;
  descenderBox: number;
};

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
  match: FaceMatch;
  glyphs: Int32Array;
  offset: number;
  length: number;
  attrs: ShapingAttrs;
  inlines: Inline[];

  constructor(
    paragraph: Paragraph,
    match: FaceMatch,
    glyphs: Int32Array,
    offset: number,
    length: number,
    attrs: ShapingAttrs
  ) {
    this.paragraph = paragraph;
    this.match = match;
    this.glyphs = glyphs;
    this.offset = offset;
    this.length = length;
    this.attrs = attrs;
    this.inlines = [];
  }

  clone() {
    return new ShapedItem(
      this.paragraph,
      this.match,
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
      this.match,
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
          const newGlyphs = this.paragraph.shapePart(offset, length, this.match, this.attrs);
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
          const newGlyphs = this.paragraph.shapePart(offset, length, this.match, this.attrs);
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

    this.glyphs = this.paragraph.shapePart(this.offset, this.length, this.match, this.attrs);
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

    if (glyphIndex < g.length) {
      const cl = g[glyphIndex + G_CL];
      let w = 0;

      while (glyphIndex < g.length && cl == g[glyphIndex + G_CL]) {
        w += g[glyphIndex + G_AX];
        glyphIndex += inc;
      }

      if (direction === 1) {
        state.clusterStart = state.clusterEnd;
        state.clusterEnd = glyphIndex < g.length ? g[glyphIndex + G_CL] : this.end();
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
    const toPx = 1 / this.match.face.upem * this.attrs.style.fontSize;
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

  // only use this in debugging or tests
  text() {
    return this.paragraph.string.slice(this.offset, this.offset + this.length);
  }
}

function logParagraph(paragraph: ShapedItem[]) {
  for (const item of paragraph) {
    const lead = `  @${item.offset} `;
    const leadsp = ' '.repeat(lead.length);
    console.log(`${lead}F:${basename(item.match.filename)}`);
    console.log(`${leadsp}T:"${item.text()}"`);
    console.log(`${leadsp}G:${logGlyphs(item.glyphs)}`);
  }
}

type LineItem = {
  value: ShapedItem | ShapedShim;
  next: LineItem | null;
  previous: LineItem | null;
};

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
    this.inkSeen = true;
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

export function baselineStep(parent: Inline, inline: Inline) {
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
  stack: Inline[];
  contextStack: AlignmentContext[];
  contextRoots: Map<Inline, AlignmentContext>;
  markedContextRoots: Inline[];
  ascender: number;
  descender: number;

  constructor(ifc: IfcInline) {
    const ctx = new AlignmentContext(ifc.metrics);

    this.ifc = ifc;
    this.stack = [];
    this.contextStack = [ctx];
    this.contextRoots = EMPTY_MAP;
    this.markedContextRoots = [];
    this.ascender = ctx.ascender;
    this.descender = ctx.descender;
  }

  stampMetrics(metrics: InlineMetrics) {
    const ctx = this.contextStack.at(-1)!;
    ctx.stampMetrics(metrics);
    this.ascender = Math.max(this.ascender, ctx.ascender);
    this.descender = Math.max(this.descender, ctx.descender);
  }

  pushInline(inline: Inline) {
    const parent = this.stack.at(-1) || this.ifc;
    let ctx = this.contextStack.at(-1)!;

    this.stack.push(inline);

    if (inline.style.verticalAlign === 'top' || inline.style.verticalAlign === 'bottom') {
      if (this.contextRoots === EMPTY_MAP) this.contextRoots = new Map();
      ctx = new AlignmentContext(inline.metrics);
      this.contextStack.push(ctx);
      this.contextRoots.set(inline, ctx);
    } else {
      ctx.stepIn(parent, inline);
      ctx.stampMetrics(inline.metrics);
    }

    this.ascender = Math.max(this.ascender, ctx.ascender);
    this.descender = Math.max(this.descender, ctx.descender);
  }

  popInline() {
    const inline = this.stack.pop()!;

    if (inline.style.verticalAlign === 'top' || inline.style.verticalAlign === 'bottom') {
      this.contextStack.pop()!
      this.markedContextRoots.push(inline);
    } else {
      const parent = this.stack.at(-1) || this.ifc;
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

    this.ascender = Math.max(this.ascender, height.ascender);
    this.descender = Math.max(this.descender, height.descender);
  }

  align(): {ascender: number, descender: number} {
    const rootCtx = this.contextStack[0];

    if (this.contextRoots.size === 0) return rootCtx;

    const lineHeight = this.total();
    let bottomsHeight = rootCtx.ascender + rootCtx.descender;

    for (const [inline, ctx] of this.contextRoots) {
      if (inline.style.verticalAlign === 'bottom') {
        bottomsHeight = Math.max(bottomsHeight, ctx.ascender + ctx.descender);
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
    return this.ascender + this.descender;
  }

  totalWith(height: LineHeightTracker) {
    return Math.max(this.total(), height.total());
  }

  reset() {
    const ctx = new AlignmentContext(this.ifc.metrics);
    this.stack = [];
    this.contextStack = [ctx];
    this.contextRoots = EMPTY_MAP;
    this.markedContextRoots = [];
    this.ascender = ctx.ascender;
    this.descender = ctx.descender;
  }

  clearContents() {
    let parent: Inline = this.ifc;
    let inline = this.stack[0];
    let i = 0;

    this.ascender = 0;
    this.descender = 0;

    if (this.contextStack.length === 1 && this.stack.length === 1) {
      const [ctx] = this.contextStack;
      ctx.stampMetrics(inline.metrics);
      this.ascender = Math.max(this.ascender, ctx.ascender);
      this.descender = Math.max(this.descender, ctx.descender);
    } else {
      for (const ctx of this.contextStack) {
        ctx.reset();

        while (inline) {
          if (inline.style.verticalAlign === 'top' || inline.style.verticalAlign === 'bottom') {
            parent = inline;
            inline = this.stack[++i];
            break;
          } else {
            ctx.stepIn(parent, inline);
            ctx.stampMetrics(inline.metrics);
            parent = inline;
            inline = this.stack[++i];
          }
        }

        this.ascender = Math.max(this.ascender, ctx.ascender);
        this.descender = Math.max(this.descender, ctx.descender);
      }
    }

    for (const inline of this.markedContextRoots) this.contextRoots.delete(inline);

    this.markedContextRoots = [];
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

  hasText() {
    return this.endOffset > this.startOffset;
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
      if (n.value instanceof ShapedShim) continue;
      if (n.value.collapseWhitespace('start')) return;
    }
  }

  trimEnd() {
    for (let n = this.tail; n; n = n.previous) {
      if (n.value instanceof ShapedShim) continue;
      if (n.value.collapseWhitespace('end')) return;
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

type IfcMark = {
  position: number,
  isBreak: boolean,
  isBreakForced: boolean,
  isItemStart: boolean,
  isItemEnd: boolean,
  inlinePre: Inline | null,
  inlinePost: Inline | null,
  float: BlockContainer | null,
  advance: number,
  trailingWs: number,
  itemIndex: number,
  split: (this: IfcMark, mark: IfcMark) => void
};

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

const wordCache = new Map<number, Map<string, Int32Array>>();
let wordCacheSize = 0;

// exported for testing, which should not measure with a prefilled cache
export function clearWordCache() {
  wordCache.clear();
  wordCacheSize = 0;
}

function wordCacheAdd(font: HbFont, string: string, glyphs: Int32Array) {
  let stringCache = wordCache.get(font.ptr);
  if (!stringCache) wordCache.set(font.ptr, stringCache = new Map());
  stringCache.set(string, glyphs);
  wordCacheSize += 1;
}

function wordCacheGet(font: HbFont, string: string) {
  return wordCache.get(font.ptr)?.get(string);
}

export class Paragraph {
  ifc: IfcInline;
  string: string;
  buffer: AllocatedUint16Array;
  brokenItems: ShapedItem[];
  wholeItems: ShapedItem[];
  lineboxes: Linebox[];
  height: number;

  constructor(ifc: IfcInline, buffer: AllocatedUint16Array) {
    this.ifc = ifc;
    this.string = ifc.text;
    this.buffer = buffer;
    this.brokenItems = [];
    this.wholeItems = [];
    this.lineboxes = [];
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

  shapePart(offset: number, length: number, match: FaceMatch, attrs: ShapingAttrs) {
    if (match.spaceMayParticipateInShaping(attrs.script)) {
      return this.shapePartWithoutWordCache(offset, length, match.font, attrs);
    } else {
      return this.shapePartWithWordCache(offset, length, match.font, attrs);
    }
  }

  getColors() {
    const inlineIterator = createPreorderInlineIterator(this.ifc);
    const colors: [Color, number][] = [[this.ifc.style.color, 0]];
    let inline = inlineIterator.next();

    while (!inline.done) {
      const [, lastColorOffset] = colors[colors.length - 1];
      if (inline.value.isRun()) {
        const style = inline.value.style;

        if (lastColorOffset === inline.value.start) {
          colors[colors.length - 1][0] = style.color;
        } else {
          colors.push([style.color, inline.value.start]);
        }
      }

      inline = inlineIterator.next();
    }

    return colors;
  }

  shape() {
    const items:ShapedItem[] = [];
    const log = this.ifc.loggingEnabled() ? (s: string) => logstr += s : null;
    const itemizeState = createItemizeState(this.ifc);
    let logstr = '';

    log?.(`Preprocess ${this.ifc.id}\n`);
    log?.('='.repeat(`Preprocess ${this.ifc.id}`.length) + '\n');
    log?.(`Full text: "${this.string}"\n`);

    while (!itemizeState.done) {
      const itemStart = itemizeState.offset;
      itemizeNext(itemizeState);
      const attrs = itemizeState.attrs;
      const cascade = getCascade(attrs.style, langForScript(attrs.script)); // TODO [lang] support
      const itemEnd = itemizeState.offset;
      let shapeWork = [{offset: itemStart, length: itemEnd - itemStart}];

      log?.(`  Item ${itemStart}..${itemEnd}:\n`);
      log?.(`  emoji=${attrs.isEmoji} level=${attrs.level} script=${attrs.script} `);
      log?.(`size=${attrs.style.fontSize} variant=${attrs.style.fontVariant}\n`);
      log?.(`  cascade=${cascade.matches.map(m => basename(m.filename)).join(', ')}\n`);

      for (let i = 0; shapeWork.length && i < cascade.matches.length; ++i) {
        const nextShapeWork: {offset: number, length: number}[] = [];
        const match = cascade.matches[i];
        const isLastMatch = i === cascade.matches.length - 1;

        while (shapeWork.length) {
          const {offset, length} = shapeWork.pop()!;
          const end = offset + length;
          const shapedPart = this.shapePart(offset, length, match, attrs);
          const hbClusterState = createGlyphIteratorState(shapedPart, attrs.level, offset, end);
          let needsReshape = false;
          let segmentTextStart = offset;
          let segmentTextEnd = offset;
          let segmentGlyphStart = hbClusterState.glyphIndex;
          let segmentGlyphEnd = hbClusterState.glyphIndex;

          log?.(`    Shaping "${this.string.slice(offset, end)}" with font ${match.filename}\n`);
          log?.('    Shaper returned: ' + logGlyphs(shapedPart) + '\n');

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
                  items.push(new ShapedItem(this, match, glyphs, offset, length, {...attrs}));
                  log?.('    ==> Cascade finished with tofu: ' + logGlyphs(glyphs) + '\n');
                } else {
                  log?.(`    ==> Must reshape "${this.string.slice(offset, offset + length)}"\n`);
                  nextShapeWork.push({offset, length});
                }
              } else if (glyphStart < glyphEnd) {
                const glyphs = glyphStart === 0 && glyphEnd === shapedPart.length
                  ? shapedPart
                  : shapedPart.subarray(glyphStart, glyphEnd);

                items.push(new ShapedItem(this, match, glyphs, offset, length, {...attrs}));
                log?.('    ==> Glyphs OK: ' + logGlyphs(glyphs) + '\n');
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
        }

        shapeWork = nextShapeWork;
      }
    }

    if (log) {
      console.log(logstr.slice(0, -1));
      console.log();
    }

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

  createMarkIterator() {
    // Inline iterator
    const inlineIterator = createInlineIterator(this.ifc);
    let inline = inlineIterator.next();
    let inlineMark = 0;
    // Break iterator
    const breakIterator = this.ifc.wraps()
      ? new LineBreak(this.string, !this.ifc.wraps())
      : new HardBreaker(this.string);
    let linebreak:{position: number, required: boolean} | null = {position: -1, required: false};
    let breakMark = 0;
    // Item iterator
    let itemIndex = -1;
    let emittedItemEnd = false;
    let itemMeasureState: MeasureState | undefined;
    let itemMark = 0;
    // Other
    const end = this.length();

    const next = ():{done: true} | {done: false, value: IfcMark} => {
      const mark: IfcMark = {
        position: Math.min(inlineMark, itemMark, breakMark),
        isBreak: false,
        isBreakForced: false,
        isItemStart: false,
        isItemEnd: false,
        inlinePre: null,
        inlinePost: null,
        float: null,
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

      if (itemIndex < this.brokenItems.length && itemMark === mark.position && !emittedItemEnd) {
        mark.isItemEnd = itemIndex > -1;
        emittedItemEnd = true;
      }

      // Consume the inline break opportunity if we're not on a break
      if (!inline.done && inline.value.state === 'breakop' && inlineMark === mark.position && (breakMark === 0 || breakMark !== mark.position)) {
        inline = inlineIterator.next();
      }

      // Consume floats
      if (!inline.done && inline.value.state === 'float' && inlineMark === mark.position) {
        mark.float = inline.value.item;
        inline = inlineIterator.next();
        return {done: false, value: mark};
      }

      // Consume pre[-text|-break], post[-text|-break], or pre-post[-text|-break] before a breakop
      if (!inline.done && inline.value.state !== 'breakop' && inlineMark === mark.position) {
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

        // Consume text or hard break
        if (!inline.done && inline.value.state === 'text') {
          inlineMark += inline.value.item.length;
          inline = inlineIterator.next();
        } else if (!inline.done && inline.value.state === 'break') {
          mark.isBreak = true;
          mark.isBreakForced = true;
          inline = inlineIterator.next();
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
          emittedItemEnd = false;
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

      if (!inline.done && inlineMark === mark.position && inline.value.state === 'breakop') {
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

    return {next};
  }

  createLineboxes(ctx: LayoutContext) {
    const bfc = ctx.bfc;
    const candidates = new LineCandidates(this.ifc);
    const width = new LineWidthTracker();
    const height = new LineHeightTracker(this.ifc);
    const vacancy = new IfcVacancy(0, 0, 0, 0, 0, 0);
    const basedir = this.ifc.style.direction;
    const parents:Inline[] = [];
    let line:Linebox | null = null;
    let lastBreakMark:IfcMark | undefined;
    const lines = [];
    let floats = [];
    let unbreakableMark = 0;
    let blockOffset = bfc.cbBlockStart;
    let itemInMark: ShapedItem | undefined; // TODO: merge with item?

    // Optimization: here we assume that (1) doTextLayout will never be called
    // on the same ifc with a 'normal' mode twice and (2) that when the mode is
    // 'normal', that is the final doTextLayout call for this instance
    if (ctx.mode === 'min-content') {
      this.brokenItems = this.wholeItems.map(item => item.clone());
    } else {
      this.brokenItems = this.wholeItems;
    }

    for (const mark of {[Symbol.iterator]: () => this.createMarkIterator()}) {
      const parent = parents[parents.length - 1] || this.ifc;
      const item = this.brokenItems[mark.itemIndex];

      if (mark.isItemEnd) itemInMark = undefined;

      if (mark.inlinePre) {
        candidates.height.pushInline(mark.inlinePre);
        if (itemInMark) candidates.height.stampMetrics(getMetrics(mark.inlinePre.style, itemInMark.match));
        parents.push(mark.inlinePre);
      }

      const wsCollapsible = isWsCollapsible(parent.style.whiteSpace);
      const nowrap = isNowrap(parent.style.whiteSpace);
      const inkAdvance = mark.advance - mark.trailingWs;

      if (inkAdvance) candidates.width.addInk(inkAdvance);
      if (mark.trailingWs) candidates.width.addWs(mark.trailingWs, !!wsCollapsible);

      if (inkAdvance || !wsCollapsible) unbreakableMark = mark.position;

      const lineHasInk = (line ? line.startOffset : 0) < unbreakableMark;

      if (mark.float) {
        if (!lineHasInk || lastBreakMark && lastBreakMark.position === mark.position) {
          const lineWidth = line ? width.forFloat() : 0;
          const lineIsEmpty = line ? !candidates.head && !line.head : true;
          const fctx = bfc.ensureFloatContext(blockOffset);
          layoutFloatBox(mark.float, ctx);
          fctx.placeFloat(lineWidth, lineIsEmpty, mark.float);
        } else {
          floats.push(mark.float);
        }
      }

      if (mark.inlinePre || mark.inlinePost) {
        const p = basedir === 'ltr' ? 'getLineLeftMarginBorderPadding' : 'getLineRightMarginBorderPadding';
        const op = basedir === 'ltr' ? 'getLineRightMarginBorderPadding' : 'getLineLeftMarginBorderPadding';
        const w = mark.inlinePre?.[p](this.ifc) ?? 0 + (mark.inlinePost?.[op](this.ifc) ?? 0);
        candidates.width.addInk(w);
      }

      if (mark.inlinePre && mark.inlinePost) {
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
        const attrs = {level, isEmoji: false, script: 'Latn', style: mark.inlinePre.style};
        const shiv = new ShapedShim(mark.position, parents.slice(), attrs);
        candidates.push(shiv);
        for (const p of parents) p.nshaped += 1;
      }

      if (mark.isBreak && (lineHasInk && !nowrap || mark.isBreakForced || mark.position === this.length())) {
        if (!line) {
          lines.push(line = new Linebox(0, this));
          bfc.fctx?.preTextContent();
        }

        const blockSize = height.totalWith(candidates.height);
        bfc.getLocalVacancyForLine(bfc, blockOffset, blockSize, vacancy);

        if (this.string[mark.position - 1] === '\u00ad' && !mark.isBreakForced) {
          const glyphs = getHyphen(item);
          const {match: {face: {upem}}, attrs: {style: {fontSize}}} = item;
          if (glyphs?.length) {
            let w = 0;
            for (let i = 0; i < glyphs.length; i += G_SZ) w += glyphs[i + G_AX];
            candidates.width.addHyphen(w / upem * fontSize);
          }
        }

        if (line.hasText() && width.forWord() + candidates.width.asWord() > vacancy.inlineSize) {
          const lastLine = line;
          if (!lastBreakMark) throw new Error('Assertion failed');
          lines.push(line = new Linebox(lastBreakMark.position, this));
          const lastBreakMarkItem = this.brokenItems[lastBreakMark.itemIndex];
          if (
            lastBreakMarkItem &&
            lastBreakMark.position > lastBreakMarkItem.offset &&
            lastBreakMark.position < lastBreakMarkItem.end()
          ) {
            this.split(lastBreakMark.itemIndex, lastBreakMark.position);
            lastBreakMark.split(mark);
            candidates.unshift(this.brokenItems[lastBreakMark.itemIndex]);
          }
          lastLine.postprocess(width, height, vacancy, this.ifc.style.textAlign);
          width.reset();
          height.reset();
          bfc.fctx?.postLine(lastLine, true);
          blockOffset += lastLine.height();
        }

        if (!line.hasText() /* line was just added */) {
          bfc.getLocalVacancyForLine(bfc, blockOffset, blockSize, vacancy);
          if (candidates.width.forFloat() > vacancy.inlineSize && bfc.fctx) {
            const newVacancy = bfc.fctx.findLinePosition(blockOffset, blockSize, candidates.width.forFloat());
            blockOffset = newVacancy.blockOffset;
            bfc.fctx?.dropShelf(blockOffset);
          }
        }

        line.addCandidates(candidates, mark.position);
        width.concat(candidates.width);
        height.concat(candidates.height);

        candidates.clearContents();
        lastBreakMark = mark;

        for (const float of floats) {
          const fctx = bfc.ensureFloatContext(blockOffset);
          layoutFloatBox(float, ctx);
          fctx.placeFloat(width.forFloat(), false, float);
        }
        floats = [];

        if (mark.isBreakForced) {
          bfc.getLocalVacancyForLine(bfc, blockOffset, blockSize, vacancy);
          line.postprocess(width, height, vacancy, this.ifc.style.textAlign);
          bfc.fctx?.postLine(line, true);
          blockOffset += line.height();
          width.reset();
          height.reset();
          lines.push(line = new Linebox(mark.position, this));
        }
      }

      if (mark.isItemStart) {
        item.inlines = parents.slice();
        for (const p of parents) p.nshaped += 1;
        candidates.push(item);
        itemInMark = item;
        candidates.height.stampMetrics(getMetrics(parent.style, itemInMark.match));
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

    for (const float of floats) {
      const fctx = bfc.ensureFloatContext(blockOffset);
      layoutFloatBox(float, ctx);
      fctx.placeFloat(line ? width.forFloat() : 0, line ? !line.head : true, float);
    }

    if (line) {
      const blockSize = height.total();
      bfc.getLocalVacancyForLine(bfc, blockOffset, blockSize, vacancy);
      line.postprocess(width, height, vacancy, this.ifc.style.textAlign);
      blockOffset += line.height();
      bfc.fctx?.postLine(line, false);
    } else {
      bfc.fctx?.consumeMisfits();
    }

    if (this.ifc.loggingEnabled()) {
      console.log(`Paragraph ${this.ifc.id}:`);
      logParagraph(this.brokenItems);
      for (const [i, line] of lines.entries()) {
        const W = line.width.toFixed(2);
        const A = line.ascender.toFixed(2);
        const D = line.descender.toFixed(2);
        const B = line.blockOffset.toFixed(2);
        let log = `Line ${i} (W:${W} A:${A} D:${D} B:${B}): `;
        for (let n = line.head; n; n = n.next) {
          log += n.value instanceof ShapedItem ? `“${n.value.text()}” ` : '“” ';
        }
        console.log(log);
      }
      if (bfc.fctx) {
        console.log('Left floats');
        console.log(bfc.fctx.leftFloats.repr());
        console.log('Right floats');
        console.log(bfc.fctx.rightFloats.repr());
      }
    }

    this.lineboxes = lines;
    this.height = blockOffset - bfc.cbBlockStart;
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

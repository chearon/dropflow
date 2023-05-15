import {binarySearchTuple, binarySearchEndProp, loggableText} from './util.js';
import {Box} from './box.js';
import {Style, initialStyle, createComputedStyle, Color, TextAlign, WhiteSpace} from './cascade.js';
import {IfcInline, Inline, BlockContainer, LayoutContext, createInlineIterator, createPreorderInlineIterator, IfcVacancy, layoutFloatBox} from './flow.js';
import {getBuffer} from './io.js';
import {HbFace, HbFont, HbGlyphInfo, AllocatedUint16Array} from 'harfbuzzjs';
import {Cascade} from 'fontconfig';
import LineBreak from './line-break.js';
import {nextGraphemeBreak, previousGraphemeBreak} from './grapheme-break.js';
import type {FontConfigCssMatch} from 'fontconfig';
import {fcfg, itemizer, hb} from './deps.js';

let debug = true;

const zeroWidthNonJoinerCharacter = 0x200C;
const zeroWidthJoinerCharacter = 0x200D;
const lineFeedCharacter = 0x000A;
const formFeedCharacter = 0x000C;
const carriageReturnCharacter = 0x000D;
const softHyphenCharacter = 0x00AD;
const zeroWidthSpaceCharacter = 0x200B;
const leftToRightMarkCharacter = 0x200E;
const rightToLeftMarkCharacter = 0x200F;
const leftToRightEmbedCharacter = 0x202A;
const rightToLeftOverrideCharacter = 0x202E;
const zeroWidthNoBreakSpaceCharacter = 0xFEFF;
const objectReplacementCharacter = 0xFFFC;

function isWsCollapsible(whiteSpace: WhiteSpace) {
  return whiteSpace === 'normal' || whiteSpace === 'nowrap' || whiteSpace === 'pre-line';
}

function isSgUncollapsible(whiteSpace: WhiteSpace) {
  return whiteSpace === 'pre' || whiteSpace === 'pre-wrap' || whiteSpace === 'pre-line';
}

function isNowrap(whiteSpace: WhiteSpace) {
  return whiteSpace === 'nowrap' || whiteSpace === 'pre';
}

// TODO runs aren't really boxes per the spec. You can't position them, etc.
// I wonder if I should create a class like RenderItem (Box extends RenderItem)
export class Run extends Box {
  public start: number = 0;
  public end: number = 0;
  public text: string;

  constructor(text: string, style: Style) {
    super(style, [], 0);

    this.text = text;
    this.style = style || new Style(createComputedStyle(initialStyle, {
      whiteSpace: 'normal'
    }));
  }

  get sym() {
    return 'Ͳ';
  }

  setRange(start: number, end: number) {
    if (this.text.length !== end - start + 1) {
      throw new Error(`end=${end} - start=${start} + 1 should sum to text.length=${this.text.length}`);
    }

    this.start = start;
    this.end = end;
  }

  shift(n: number) {
    this.start -= n;
    this.end -= n;
  }

  isRun(): this is Run {
    return true;
  }

  get desc() {
    return `${this.start},${this.end} "${loggableText(this.text)}"`;
  }

  get wsCollapsible() {
    return isWsCollapsible(this.style.whiteSpace);
  }

  get sgUncollapsible() {
    return isSgUncollapsible(this.style.whiteSpace);
  }

  get sgCollapsible() {
    return !isSgUncollapsible(this.style.whiteSpace);
  }

  mod(start: number, end: number, s: string) {
    const text = this.text;
    const lstart = Math.max(0, start - this.start);
    const lend = end - this.start;

    this.text = text.slice(0, lstart) + s + text.slice(lend + 1);

    const n = text.length - this.text.length;

    this.end -= n;

    return n;
  }

  allCollapsible() {
    return Boolean(this.text.match(/^( |\r\n|\n|\t)*$/));
  }
}

export class Collapser {
  public buf: string;
  public runs: Run[];

  constructor(buf: string, runs: Run[]) {
    if (debug) {
      if (buf.length > 0 || runs.length > 0) {
        const start = runs[0];
        let last!: Run;

        for (const run of runs) {
          if (last && run.start !== last.end + 1) {
            throw new Error('Run objects have gaps or overlap');
          }

          if (run.text !== buf.slice(run.start, run.end + 1)) {
            throw new Error('Run/buffer mismatch');
          }

          last = run;
        }

        if (!start || last.end - start.start + 1 !== buf.length) {
          throw new Error('Buffer size doesn\'t match sum of run sizes'); 
        }
      }
    }

    this.buf = buf;
    this.runs = runs;
  }

  mod(start: number, end: number, s: string) {
    if (end < start) return 0;

    const rstart = binarySearchEndProp(this.runs, start);
    let rend = end <= this.runs[rstart].end ? rstart : binarySearchEndProp(this.runs, end);
    let shrinkahead = 0;

    this.buf = this.buf.slice(0, start) + s + this.buf.slice(end + 1);

    for (let k = rstart; k < this.runs.length; ++k) {
      const run = this.runs[k];

      run.shift(shrinkahead);

      if (k <= rend) shrinkahead += run.mod(start, end - shrinkahead, s);
      if (run.end < run.start) {
        this.runs.splice(k--, 1);
        rend--;
      }

      s = '';
    }

    return shrinkahead;
  }

  *collapsibleRanges(filter: 'sgCollapsible' | 'wsCollapsible' | 'sgUncollapsible') {
    let start = 0;
    let end = 0;
    let wasInCollapse = false;

    while (true) {
      const over = end >= this.runs.length;
      const isInCollapse = !over && this.runs[end][filter];

      if (wasInCollapse && !isInCollapse) yield [this.runs[start], this.runs[end - 1]];

      if (over) break;

      wasInCollapse = isInCollapse;

      if (isInCollapse) {
        end += 1;
      } else {
        start = end = end + 1;
      }
    }
  }

  modRanges(ranges: [number, number, string][]) {
    let shrinkahead = 0;

    for (const [start, end, s] of ranges) {
      if (end < start) continue;
      shrinkahead += this.mod(start - shrinkahead, end - shrinkahead, s);
    }
  }

  // CSS Text Module Level 3 §4.1.1 step 1
  stepOne() {
    const toRemove: [number, number, string][] = [];

    for (const [start, end] of this.collapsibleRanges('wsCollapsible')) {
      const range = this.buf.slice(start.start, end.end + 1);
      const rBefore = /([ \t]*)((\r\n|\n)+)([ \t]*)/g;
      let match;

      while (match = rBefore.exec(range)) {
        const [, leftWs, allNl, , rightWs] = match;
        const rangeStart = start.start + match.index;

        if (leftWs.length) {
          toRemove.push([rangeStart, rangeStart + leftWs.length - 1, '']);
        }

        if (rightWs.length) {
          const rightWsStart = rangeStart + leftWs.length + allNl.length;
          toRemove.push([rightWsStart, rightWsStart + rightWs.length - 1, '']);
        }
      }
    }

    this.modRanges(toRemove);
  }

  // CSS Text Module Level 3 §4.1.1 step 2 (defined in §4.1.2)
  stepTwo() {
    const removeCarriageReturn: [number, number, string][] = [];

    for (const [start, end] of this.collapsibleRanges('sgUncollapsible')) {
      const range = this.buf.slice(start.start, end.end + 1);
      const rBreak = /\r\n/g;
      let match;

      while (match = rBreak.exec(range)) {
        const rangeStart = start.start + match.index;
        removeCarriageReturn.push([rangeStart + 1, rangeStart + 1, '']);
      }
    }

    this.modRanges(removeCarriageReturn);

    const modConsecutiveSegments: [number, number, string][] = [];

    for (const [start, end] of this.collapsibleRanges('sgCollapsible')) {
      const range = this.buf.slice(start.start, end.end + 1);
      const rSegment = /(\n|\r\n)((\n|\r\n)*)/g;
      let match;

      while (match = rSegment.exec(range)) {
        const {1: sg, 2: asg} = match;
        const rangeStart = start.start + match.index;

        const s = ' '; // TODO spec says this is contextual based on some Asian scripts
        modConsecutiveSegments.push([rangeStart, rangeStart + sg.length - 1, s]);

        modConsecutiveSegments.push([rangeStart + sg.length, rangeStart + sg.length + asg.length - 1, '']);
      }
    }

    this.modRanges(modConsecutiveSegments);
  }

  // CSS Text Module Level 3 §4.1.1 step 3
  stepThree() {
    const removeTab: [number, number, string][] = [];

    for (const [start, end] of this.collapsibleRanges('wsCollapsible')) {
      const range = this.buf.slice(start.start, end.end + 1);
      const rTab = /\t/g;
      let match;

      while (match = rTab.exec(range)) {
        removeTab.push([start.start + match.index, start.start + match.index, ' ']);
      }
    }

    this.modRanges(removeTab);
  }

  // CSS Text Module Level 3 §4.1.1 step 4
  stepFour() {
    const collapseWs: [number, number, string][] = [];

    for (const [start, end] of this.collapsibleRanges('wsCollapsible')) {
      const range = this.buf.slice(start.start, end.end + 1);
      const rSpSeq = /  +/g;
      let match;

      while (match = rSpSeq.exec(range)) {
        const rangeStart = start.start + match.index;
        collapseWs.push([rangeStart + 1, rangeStart + 1 + match[0].length - 2, '']);
      }
    }
    
    this.modRanges(collapseWs);
  }

  collapse() {
    this.stepOne();
    this.stepTwo();
    this.stepThree();
    this.stepFour();
  }
}

export type ShapingAttrs = {
  isEmoji: boolean,
  level: number,
  script: string,
  style: Style
};

function basename(p: string) {
  return p.match(/([^.\/]+)\.[A-z]+$/)?.[1] || p;
}

// this comes from Firefox source. char should be a 16-bit integer
function hashMix(hash: number, char: number) {
  return (hash >> 28) ^ (hash << 4) ^ char;
}

function createFontKey(s: Style, script: string) {
  let hash = s.fontWeight;

  for (let i = 0; i < s.fontStyle.length; ++i) {
    hash = hashMix(hash, s.fontStyle.charCodeAt(i));
  }

  for (let i = 0; i < s.fontStretch.length; ++i) {
    hash = hashMix(hash, s.fontStretch.charCodeAt(i));
  }

  for (const f of s.fontFamily) {
    for (let i = 0; i < f.length; ++i) {
      hash = hashMix(hash, f.charCodeAt(i));
    }
  }

  for (let i = 0; i < script.length; ++i) {
    hash = hashMix(hash, script.charCodeAt(i));
  }

  return hash;
}

const fontBufferCache = new Map<string, ArrayBuffer>();
const hbFaceCache = new Map<string, HbFace>();
const cascadeCache = new Map<number, Cascade>();
const hyphenCache = new Map<string, HbGlyphInfo[]>();
const metricsCache = new Map<number, InlineMetrics>();

function getFontBuffer(filename: string) {
  let buffer = fontBufferCache.get(filename);
  if (!buffer) {
    buffer = getBuffer(filename);
    fontBufferCache.set(filename, buffer);
  }
  return buffer;
}

function createFace(filename: string, index: number) {
  const buffer = getFontBuffer(filename);
  const blob = hb.createBlob(buffer);
  const face = hb.createFace(blob, index);
  face.name = basename(filename); // TODO can it be done in hbjs?
  // TODO: right now I'm not ever freeing blobs or faces. this is okay for most
  // usages, but I should implement an LRU or something
  return face;
}

function getFace(filename: string, index: number) {
  let face = hbFaceCache.get(filename + index);
  if (!face) {
    face = createFace(filename, index);
    hbFaceCache.set(filename + index, face);
  }
  return face;
}

const metricsCacheBuffer = new ArrayBuffer(16);

function createMetricsKey(inline: Inline) {
  let fontKey = createFontKey(inline.style, 'Latn');
  let len = 4;

  new Float64Array(metricsCacheBuffer)[0] = inline.style.fontSize;

  if (inline.style.lineHeight !== 'normal') {
    new Float64Array(metricsCacheBuffer)[1] = inline.style.lineHeight;
    len = 8;
  }
  const b = new Uint16Array(metricsCacheBuffer, 0, len);
  for (let i = 0; i < b.length; ++i) {
    fontKey = hashMix(fontKey, b[i]);
  }
  return fontKey;
}

function getFontMetrics(inline: Inline) {
  const metricsKey = createMetricsKey(inline);
  const existing = metricsCache.get(metricsKey);
  if (existing) return existing;
  const strutCascade = getCascade(inline.style, 'Latn');
  const strutFontMatch = strutCascade.matches[0].toCssMatch();
  const strutFace = getFace(strutFontMatch.file, strutFontMatch.index);
  const strutFont = hb.createFont(strutFace);
  const metrics = getMetrics(inline.style, strutFont, strutFace.upem);
  strutFont.destroy();
  metricsCache.set(metricsKey, metrics);
  return metrics;
}

function getCascade(style: Style, script: string) {
  const fontKey = createFontKey(style, script);
  let cascade = cascadeCache.get(fontKey);
  if (!cascade) {
    const family = style.fontFamily;
    const weight = String(style.fontWeight);
    const width = style.fontStretch;
    const slant = style.fontStyle;
    const lang = langForScript(script);
    cascade = fcfg.sort({family, weight, width, slant, lang});
    cascadeCache.set(fontKey, cascade);
  }
  return cascade;
}

const HyphenCodepointsToTry = '\u2010\u002d'; // HYPHEN, HYPHEN MINUS

function createHyphenCacheKey(item: ShapedItem) {
  return item.match.file + item.match.index;
}

function loadHyphen(item: ShapedItem) {
  const key = createHyphenCacheKey(item);

  if (!hyphenCache.has(key)) {
    hyphenCache.set(key, []);

    for (const hyphen of HyphenCodepointsToTry) {
      const buf = hb.createBuffer();
      const font = hb.createFont(item.face);
      buf.setClusterLevel(1);
      buf.addText(hyphen);
      buf.setScript('Latin');
      buf.setDirection('ltr');
      buf.setLanguage('en');
      hb.shape(font, buf);
      const glyphs = buf.json();
      buf.destroy();
      if (glyphs[0]?.g) {
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

function langForScript(script: string) {
  return LANG_FOR_SCRIPT[script] || 'xx';
}

// exported because used by html painter
export function getMetrics(style: Style, font: HbFont, upem: number): InlineMetrics {
  const {fontSize, lineHeight: cssLineHeight} = style;
  // now do CSS2 §10.8.1
  const {ascender, xHeight, descender, lineGap} = font.getMetrics('ltr'); // TODO vertical text
  const toPx = 1 / upem * fontSize;
  const pxHeight = (ascender - descender) * toPx;
  const lineHeight = cssLineHeight === 'normal' ? pxHeight + lineGap * toPx : cssLineHeight;
  const halfLeading = (lineHeight - pxHeight) / 2;
  const ascenderPx = ascender * toPx;
  const descenderPx = -descender * toPx;

  return {
    ascenderBox: halfLeading + ascenderPx,
    ascender: ascenderPx,
    superscript: 0.34 * fontSize, // magic numbers come from Searchfox.
    xHeight: xHeight * toPx,
    subscript: 0.20 * fontSize,   // all browsers use them instead of metrics
    descender: descenderPx,
    descenderBox: halfLeading + descenderPx
  };
}

function createGlyphIterator(shaped: HbGlyphInfo[], dir: 'ltr' | 'rtl') {
  let i = dir === 'ltr' ? 0 : shaped.length - 1;
  let coveredIndexStart = i;
  let coveredIndexEnd = i;

  function next() {
    const done = dir === 'ltr' ? i >= shaped.length : i < 0;

    coveredIndexEnd = i;

    if (done) return {done};

    const cl = shaped[i].cl;
    let needsReshape = false;

    if (dir === 'ltr') {
      const start = i;

      while (i >= 0 && i < shaped.length && shaped[i].cl === cl) {
        needsReshape = needsReshape || shaped[i].g === 0;
        i += 1;
      }

      const end = i;

      return {value: {start, end, needsReshape}};
    } else {
      const end = i + 1;

      while (i >= 0 && i < shaped.length && shaped[i].cl === cl) {
        needsReshape = needsReshape || shaped[i].g === 0;
        i -= 1;
      }

      const start = i + 1;

      return {value: {start, end, needsReshape}};
    }
  }

  function pull() {
    const ret = dir === 'ltr'
      ? [coveredIndexStart, coveredIndexEnd]
      : [coveredIndexEnd + 1, coveredIndexStart + 1];

    coveredIndexStart = coveredIndexEnd;

    return ret;
  }

  return {pull, next};
}

const reset = '\x1b[0m';
const bold = '\x1b[1m';

function logGlyphs(glyphs: HbGlyphInfo[]) {
  let s = '';
  for (let i = 0; i < glyphs.length; ++i) {
    const g = glyphs[i];
    const pg = glyphs[i - 1];
    const ng = glyphs[i + 1];
    const isp = pg && pg.cl === g.cl;
    const isn = ng && ng.cl === g.cl;
    if (isp || isn) s += bold;
    if (isn && !isp) s += '(';
    s += g.g;
    if (!isn && isp) s += ')';
    s += ' ';
    if (isp || isn) s += reset;
  }
  return s;
}

type ShapingPart = {
  offset: number,
  length: number,
  cstart: number,
  cend: number,
  gstart: number,
  gend: number,
  glyphs: HbGlyphInfo[],
  reshape: boolean
};

function shiftGlyphs(glyphs: HbGlyphInfo[], offset: number, dir: 'ltr' | 'rtl') {
  const rmRange = dir === 'ltr' ? [glyphs.length, glyphs.length] : [0, 0];

  for (let i = 0; i < glyphs.length; ++i) {
    if (glyphs[i].cl >= offset) {
      if (dir === 'ltr') {
        if (i < rmRange[0]) rmRange[0] = i;
      } else {
        rmRange[1] = i + 1;
      }
    }
  }

  return glyphs.splice(rmRange[0], rmRange[1] - rmRange[0]);
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
  face: HbFace;
  match: FontConfigCssMatch;
  glyphs: HbGlyphInfo[];
  offset: number;
  length: number;
  attrs: ShapingAttrs;
  needsReshape: boolean;
  inlines: Inline[];

  constructor(
    paragraph: Paragraph,
    face: HbFace,
    match: FontConfigCssMatch,
    glyphs: HbGlyphInfo[],
    offset: number,
    length: number,
    attrs: ShapingAttrs
  ) {
    this.paragraph = paragraph;
    this.face = face;
    this.match = match;
    this.glyphs = glyphs;
    this.offset = offset;
    this.length = length;
    this.attrs = attrs;
    this.needsReshape = false;
    this.inlines = [];
  }

  clone() {
    return new ShapedItem(
      this.paragraph,
      this.face,
      this.match,
      this.glyphs.map(glyph => ({...glyph})),
      this.offset,
      this.length,
      this.attrs
    );
  }

  split(offset: number) {
    const dir = this.attrs.level & 1 ? 'rtl' : 'ltr';
    const glyphs = shiftGlyphs(this.glyphs, this.offset + offset, dir);
    const firstGlyph = dir === 'ltr' ? glyphs[0] : glyphs.at(-1)!;
    const needsReshape = Boolean(firstGlyph.flags & 1)
      || firstGlyph.cl !== this.offset + offset // cluster break
      || this.paragraph.isInsideGraphemeBoundary(this.offset + offset);
    const inlines = this.inlines;
    const right = new ShapedItem(
      this.paragraph,
      this.face,
      this.match,
      glyphs,
      this.offset + offset,
      this.length - offset,
      this.attrs
    );

    this.length = offset;
    this.needsReshape = needsReshape;
    this.inlines = inlines.filter(inline => {
      return inline.start < this.end() && inline.end > this.offset;
    });

    right.needsReshape = needsReshape;
    right.inlines = inlines.filter(inline => {
      return inline.start < right.end() && inline.end > right.offset;
    });

    for (const i of right.inlines) i.nshaped += 1;

    return right;
  }

  reshape() {
    this.glyphs = this.paragraph.shapePart(this.offset, this.length, this.face, this.attrs);
  }

  createMeasureState(direction: 1 | -1 = 1) {
    let glyphIndex;

    if (this.attrs.level & 1) {
      glyphIndex = direction === 1 ? this.glyphs.length - 1 : 0;
    } else {
      glyphIndex = direction === 1 ? 0 : this.glyphs.length - 1;
    }

    return {
      glyphIndex,
      characterIndex: direction === 1 ? -1 : this.end(),
      clusterStart: direction === 1 ? 0 : this.end(),
      clusterEnd: direction === 1 ? 0 : this.end(),
      clusterAdvance: 0,
      done: false
    }
  }

  nextCluster(direction: 1 | -1, state: MeasureState) {
    const inc = this.attrs.level & 1 ? direction === 1 ? -1 : 1 : direction === 1 ? 1 : -1;
    const g = this.glyphs;
    let glyphIndex = state.glyphIndex;

    if (g[glyphIndex]) {
      const cl = g[glyphIndex].cl;
      let w = 0;

      while (g[glyphIndex] && cl == g[glyphIndex].cl) {
        w += g[glyphIndex].ax;
        glyphIndex += inc;
      }

      if (direction === 1) {
        state.clusterStart = state.clusterEnd;
        state.clusterEnd = g[glyphIndex] ? g[glyphIndex].cl : this.end();
      } else {
        state.clusterEnd = state.clusterStart;
        state.clusterStart = cl;
      }

      state.glyphIndex = glyphIndex;
      state.clusterAdvance = w;
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
    let w = 0;

    if (state.characterIndex > state.clusterStart && state.characterIndex < state.clusterEnd) {
      w += this.measureInsideCluster(state, ci);
      if (ci > state.clusterStart && ci < state.clusterEnd) {
        state.characterIndex = ci;
        return w / this.face.upem * this.attrs.style.fontSize;
      } else {
        this.nextCluster(direction, state);
      }
    }

    while (!state.done && (direction === 1 ? ci >= state.clusterEnd : ci <= state.clusterStart)) {
      w += state.clusterAdvance;
      this.nextCluster(direction, state);
    }

    state.characterIndex = direction === 1 ? state.clusterStart : state.clusterEnd;

    if (ci > state.clusterStart && ci < state.clusterEnd) {
      w += this.measureInsideCluster(state, ci);
      state.characterIndex = ci;
    }

    return w / this.face.upem * this.attrs.style.fontSize;
  }

  collapseWhitespace(at: 'start' | 'end') {
    if (!isWsCollapsible(this.attrs.style.whiteSpace)) return true;

    const level = at === 'start' ? this.attrs.level : this.attrs.level + 1;
    const glyphIterator = createGlyphIterator(this.glyphs, level & 1 ? 'rtl' : 'ltr');

    for (let glyph = glyphIterator.next(); !glyph.done; glyph = glyphIterator.next()) {
      const cl = this.glyphs[glyph.value.start].cl;
      if (!isink(this.paragraph.string[cl])) {
        this.glyphs[glyph.value.start].ax = 0;
      } else {
        return true;
      }
    }
  }

  // used in shaping
  colorsStart() {
    const s = binarySearchTuple(this.paragraph.colors, this.offset);
    if (s === this.paragraph.colors.length) return s - 1;
    if (this.paragraph.colors[s][1] !== this.offset) return s - 1;
    return s;
  }

  // used in shaping
  colorsEnd() {
    const s = binarySearchTuple(this.paragraph.colors, this.end() - 1);
    if (s === this.paragraph.colors.length) return s;
    if (this.paragraph.colors[s][1] !== this.end() - 1) return s;
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
    console.log(`${lead}F:${basename(item.face.name)}`);
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

  reset() {
    this.width.reset();
    this.height.reset();
    this.clear();
  }
};

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
    this.contextRoots = new Map([[ifc, ctx]]);
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
    for (const [inline, ctx] of height.contextRoots) {
      const thisCtx = this.contextRoots.get(inline);
      if (thisCtx) {
        thisCtx.extend(ctx);
      } else {
        this.contextRoots.set(inline, new AlignmentContext(ctx));
      }
    }

    this.ascender = Math.max(this.ascender, height.ascender);
    this.descender = Math.max(this.descender, height.descender);
  }

  align() {
    const rootCtx = this.contextRoots.get(this.ifc)!;
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

    return [ascender, descender];
  }

  total() {
    return this.ascender + this.descender;
  }

  totalWith(height: LineHeightTracker) {
    return Math.max(this.total(), height.total());
  }

  reset() {
    let parent: Inline = this.ifc;
    let inline = this.stack[0];
    let i = 0;

    this.ascender = 0;
    this.descender = 0;

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

    for (const inline of this.markedContextRoots) this.contextRoots.delete(inline);
    this.markedContextRoots = [];
  }
}

export class Linebox extends LineItemLinkedList {
  dir: 'ltr' | 'rtl';
  startOffset: number;
  paragraph: Paragraph;
  ascender: number;
  descender: number;
  endOffset: number;
  width: LineWidthTracker;
  height: LineHeightTracker;
  blockOffset: number;
  inlineOffset: number;

  constructor(dir: Linebox['dir'], start: number, paragraph: Paragraph) {
    super();
    this.dir = dir;
    this.startOffset = this.endOffset = start;
    this.paragraph = paragraph;
    this.ascender = 0;
    this.descender = 0;
    this.width = new LineWidthTracker();
    this.height = new LineHeightTracker(paragraph.ifc);
    this.blockOffset = 0;
    this.inlineOffset = 0;
  }

  addCandidates(candidates: LineCandidates, endOffset: number) {
    this.concat(candidates);
    this.width.concat(candidates.width);
    this.height.concat(candidates.height);
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

  postprocess(vacancy: IfcVacancy, textAlign: TextAlign) {
    const width = this.width.trimmed();
    const [ascender, descender] = this.height.align();
    this.blockOffset = vacancy.blockOffset;
    this.trimStart();
    this.trimEnd();
    this.reorder();
    this.ascender = ascender;
    this.descender = descender;
    this.inlineOffset = this.dir === 'ltr' ? vacancy.leftOffset : vacancy.rightOffset;
    if (width < vacancy.inlineSize) {
      if (textAlign === 'right' && this.dir === 'ltr' || textAlign === 'left' && this.dir === 'rtl') {
        this.inlineOffset += vacancy.inlineSize - width;
      } else if (textAlign === 'center') {
        this.inlineOffset += (vacancy.inlineSize - width) / 2;
      }
    }
  }
}

type IfcMark = {
  position: number,
  isBreak: boolean,
  isBreakForced: boolean,
  isInk: boolean,
  isItemStart: boolean,
  isItemEnd: boolean,
  inlinePre: Inline | null,
  inlinePost: Inline | null,
  float: BlockContainer | null,
  advance: number,
  itemIndex: number,
  metrics: InlineMetrics,
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
  // I haven't verified that HarfBuzz actually does anything unreasonable with
  // these yet. I also added \n to this list since, possibly unlike Chrome,
  // I'm including those as part of the whole shaped IFC
  for (let i = 0; i < text.length; ++i) {
    const c = text.charCodeAt(i);
    if (
      c == zeroWidthNonJoinerCharacter
      || c == zeroWidthJoinerCharacter
      || c == formFeedCharacter
      || c == carriageReturnCharacter
      || c == softHyphenCharacter
      || c === lineFeedCharacter
      || (c >= leftToRightMarkCharacter && c <= rightToLeftMarkCharacter)
      || (c >= leftToRightEmbedCharacter && c <= rightToLeftOverrideCharacter)
      || c == zeroWidthNoBreakSpaceCharacter
      || c == objectReplacementCharacter
    ) {
      a[i] = zeroWidthSpaceCharacter;
    } else {
      a[i] = c;
    }
  }

  return allocation;
}

const NON_ASCII_MASK = 0b1111_1111_1000_0000;

class TextAnalysis {
  isSimple: boolean;
  hyphens: number[];

  constructor(string: string) {
    this.isSimple = true;
    this.hyphens = [];

    for (let i = 0; i < string.length; ++i) {
      if (string.charCodeAt(i) & NON_ASCII_MASK) this.isSimple = false;
      if (string[i] === '\u00ad' /* softHyphenCharacter */) this.hyphens.push(i);
    }
  }
}

export class Paragraph {
  ifc: IfcInline;
  string: string;
  buffer: AllocatedUint16Array;
  enableLogging: boolean;
  colors: [Color, number][];
  metrics: [InlineMetrics, number][];
  brokenItems: ShapedItem[];
  wholeItems: ShapedItem[];
  lineboxes: Linebox[];
  height: number;
  analysis: TextAnalysis;

  constructor(ifc: IfcInline, buffer: AllocatedUint16Array, enableLogging: boolean) {
    this.ifc = ifc;
    this.string = ifc.text;
    this.buffer = buffer;
    this.enableLogging = enableLogging;
    this.colors = [];
    this.metrics = [];
    this.brokenItems = [];
    this.wholeItems = [];
    this.lineboxes = [];
    this.height = 0;
    this.analysis = new TextAnalysis(ifc.text);
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
    const right = left.split(offset - left.offset);
    if (left.needsReshape) left.reshape();
    if (right.needsReshape) right.reshape();
    this.brokenItems.splice(itemIndex + 1, 0, right);
    if (this.string[offset - 1] === '\u00ad' /* softHyphenCharacter */) {
      const glyphs = getHyphen(left);
      if (glyphs?.length) {
        const hyphen = glyphs.map(g => ({...g, cl: offset - 1}));
        left.glyphs[left.attrs.level & 1 ? 'unshift' : 'push'](...hyphen);
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
    let i = 0;

    return {
      next():{done: true} | {done: false, value: {i: number}} {
        if (i > l) return {done: true};
        while (i <= l && s[i - 1] !== '\n') i++;
        return {value: {i: i++}, done: false};
      }
    };
  }

  *itemize() {
    if (this.string.length === 0) return;

    const iStyle = this.ifc.itemizeInlines();
    const iNewline = this.nlIterator();
    let style = iStyle.next();
    let newline = iNewline.next();

    if (this.analysis.isSimple) {
      if (style.done || newline.done) {
        throw new Error('Iterator ended too early');
      }

      const ctx: ShapingAttrs = {
        isEmoji: false,
        level: 0,
        script: 'Latn',
        style: style.value.style
      };

      while (!style.done && !newline.done) {
        const smallest = Math.min(style.value.i, newline.value.i);

        ctx.style = style.value.style;

        if (smallest === style.value.i) style = iStyle.next();
        if (smallest === newline.value.i) newline = iNewline.next();

        yield {i: smallest, attrs: ctx};
      }
    } else {
      const iEmoji = itemizer.emoji(this.string);
      const iBidi = itemizer.bidi(this.string, this.ifc.style.direction === 'ltr' ? 0 : 1);
      const iScript = itemizer.script(this.string);

      let emoji = iEmoji.next();
      let bidi = iBidi.next();
      let script = iScript.next();

      if (emoji.done || bidi.done || script.done || style.done || newline.done) {
        throw new Error('Iterator ended too early');
      }

      const ctx: ShapingAttrs = {
        isEmoji: emoji.value.isEmoji,
        level: bidi.value.level,
        script: script.value.script,
        style: style.value.style
      };

      while (!emoji.done && !bidi.done && !script.done && !style.done && !newline.done) {
        // Find smallest text index
        const smallest = Math.min(emoji.value.i, bidi.value.i, script.value.i, style.value.i, newline.value.i);

        // Map the current iterators to context
        ctx.isEmoji = emoji.value.isEmoji;
        ctx.level = bidi.value.level;
        ctx.script = script.value.script;
        ctx.style = style.value.style;

        // Advance
        if (smallest === emoji.value.i) emoji = iEmoji.next();
        if (smallest === bidi.value.i) bidi = iBidi.next();
        if (smallest === script.value.i) script = iScript.next();
        if (smallest === style.value.i) style = iStyle.next();
        if (smallest === newline.value.i) newline = iNewline.next();

        yield {i: smallest, attrs: ctx};
      }
    }
  }

  shapePart(offset: number, length: number, face: HbFace, attrs: ShapingAttrs) {
    const buf = hb.createBuffer();
    const font = hb.createFont(face);
    buf.setClusterLevel(1);
    buf.addUtf16(this.buffer.array.byteOffset, this.buffer.array.length, offset, length);
    buf.setDirection(attrs.level & 1 ? 'rtl' : 'ltr');
    buf.setScript(attrs.script);
    buf.setLanguage(langForScript(attrs.script)); // TODO support [lang]
    hb.shape(font, buf);
    const json = buf.json();
    buf.destroy();
    font.destroy();
    return json;
  }

  createItemMetrics(styles: [Style, number][], faces: [HbFace, number][]) {
    const metrics:[InlineMetrics, number][] = [];
    const facemap:Map<HbFace, HbFont> = new Map();
    let lastFace = null;
    let lastStyle = null;
    let si = 0;
    let fi = 0;

    while (si < styles.length && fi < faces.length) {
      const [style, so] = styles[si];
      const [face, fo] = faces[fi];
      const sn = si + 1 < styles.length ? styles[si + 1][1] : this.length();
      const fn = fi + 1 < faces.length ? faces[fi + 1][1] : this.length();

      let font = facemap.get(face);
      if (!font) facemap.set(face, font = hb.createFont(face));

      if (face !== lastFace || !lastStyle || lastStyle.fontSize !== style.fontSize || lastStyle.lineHeight != style.lineHeight) {
        metrics.push([getMetrics(style, font, face.upem), Math.max(so, fo)]);
        lastFace = face;
        lastStyle = style;
      }

      if (sn <= fn) si += 1;
      if (fn <= sn) fi += 1;
    }

    for (const font of facemap.values()) font.destroy();

    return metrics;
  }

  shape() {
    const inlineIterator = createPreorderInlineIterator(this.ifc);
    const items:ShapedItem[] = [];
    const colors:[Color, number][] = [[this.ifc.style.color, 0]];
    const styles:[Style, number][] = [[this.ifc.style, 0]];
    const faces:[HbFace, number][] = [];
    const log = this.enableLogging ? (s: string) => logstr += s : null;
    let inline = inlineIterator.next();
    let inlineEnd = 0;
    let logstr = '';
    let lastItemIndex = 0;

    log?.(`Preprocess ${this.ifc.id}\n`);
    log?.('='.repeat(`Preprocess ${this.ifc.id}`.length) + '\n');
    log?.(`Full text: "${this.string}"\n`);

    this.ifc.metrics = getFontMetrics(this.ifc);

    for (const {i: itemIndex, attrs} of this.itemize()) {
      const start = lastItemIndex;
      const end = itemIndex;
      const cascade = getCascade(attrs.style, attrs.script);
      const shapeWork = [{offset: start, length: end - start}];

      log?.(`  Item ${lastItemIndex}..${itemIndex}:\n`);
      log?.(`  emoji=${attrs.isEmoji} level=${attrs.level} script=${attrs.script} `);
      log?.(`size=${attrs.style.fontSize} variant=${attrs.style.fontVariant}\n`);
      log?.(`  cascade=${cascade.matches.map(m => basename(m.file)).join(', ')}\n`);

      for (let i = 0; shapeWork.length && i < cascade.matches.length; ++i) {
        const match = cascade.matches[i].toCssMatch();
        const isLastMatch = i === cascade.matches.length - 1;
        const face = getFace(match.file, match.index);
        // Allows to tack successive (re)shaping parts onto one larger item
        const parts:ShapingPart[] = [];

        // note this won't budge for matches i=1, 2, ...
        while (!inline.done && inlineEnd < itemIndex) {
          const style = inline.value.style;

          if (inline.value.isInline()) {
            inline.value.metrics = getFontMetrics(inline.value);
          }

          if (inline.value.isRun()) {
            const [, lastColorOffset] = colors[colors.length - 1];
            if (lastColorOffset === inline.value.start) {
              colors[colors.length - 1][0] = style.color;
            } else {
              colors.push([style.color, inline.value.start]);
            }

            const [, lastStyleOffset] = styles[styles.length - 1];
            if (lastStyleOffset === inline.value.start) {
              styles[styles.length - 1][0] = style;
            } else {
              styles.push([style, inline.value.start]);
            }

            inlineEnd += inline.value.text.length;
          }

          inline = inlineIterator.next();
        }

        while (shapeWork.length) {
          const {offset, length} = shapeWork.pop()!;
          const end = offset + length;
          const shapedPart = this.shapePart(offset, length, face, attrs);
          let didPushPart = false;

          log?.(`    Shaping "${this.string.slice(offset, end)}" with font ${match.file}\n`);
          log?.('    Shaper returned: ' + logGlyphs(shapedPart) + '\n');

          // Grapheme cluster iterator
          let ucClusterStart = offset;
          let ucClusterEnd = offset;
          // HB cluster iterator
          const hbGlyphIterator = createGlyphIterator(shapedPart, attrs.level & 1 ? 'rtl' : 'ltr');
          let hbIt = hbGlyphIterator.next();
          let hbClusterEnd = offset;
          let clusterNeedsReshape = false;

          do {
            const mark = Math.min(ucClusterEnd, hbClusterEnd);

            if (ucClusterEnd < end && mark === ucClusterEnd) {
              ucClusterStart = ucClusterEnd;
              ucClusterEnd = nextGraphemeBreak(this.string, ucClusterEnd);
            }

            if (hbClusterEnd < end && mark === hbClusterEnd) {
              clusterNeedsReshape = hbIt.done ? /* impossible */ false : hbIt.value.needsReshape;
              hbIt = hbGlyphIterator.next();
              hbClusterEnd = hbIt.done ? end : shapedPart[hbIt.value.start].cl;
            }

            const nextMark = Math.min(ucClusterEnd, hbClusterEnd);

            if (nextMark === ucClusterEnd) {
              const [glyphStart, glyphEnd] = hbGlyphIterator.pull();
              if (!didPushPart || clusterNeedsReshape !== parts[parts.length - 1].reshape) {
                parts.push({
                  offset,
                  length,
                  cstart: ucClusterStart,
                  cend: ucClusterEnd,
                  gstart: glyphStart,
                  gend: glyphEnd,
                  reshape: clusterNeedsReshape,
                  glyphs: shapedPart
                });
                didPushPart = true;
              } else {
                parts[parts.length - 1].cend = ucClusterEnd;
                parts[parts.length - 1].gstart = Math.min(parts[parts.length - 1].gstart, glyphStart);
                parts[parts.length - 1].gend = Math.max(glyphEnd, parts[parts.length - 1].gend);
              }
            }
          } while (ucClusterEnd < end || hbClusterEnd < end);
        }

        for (const part of parts) {
          const {gstart, gend, cstart, cend, reshape} = part;
          const offset = cstart;
          const length = cend - cstart;

          if (reshape && !isLastMatch) {
            shapeWork.push({offset, length});
            log?.(`    ==> Must reshape "${this.string.slice(offset, offset + length)}"\n`);
          } else {
            const glyphs = part.glyphs.slice(gstart, gend);

            faces.push([face, offset]);
            items.push(new ShapedItem(this, face, match, glyphs, offset, length, {...attrs}));

            if (isLastMatch && reshape) {
              log?.('    ==> Cascade finished with tofu: ' + logGlyphs(glyphs) + '\n');
            } else {
              log?.('    ==> Glyphs OK: ' + logGlyphs(glyphs) + '\n');
            }
          }
        }
      }

      lastItemIndex = itemIndex;
    }

    if (log) {
      console.log(logstr.slice(0, -1));
      console.log();
    }

    this.colors = colors;
    this.metrics = this.createItemMetrics(styles, faces.sort((a, b) => a[1] - b[1]));
    this.wholeItems = items.sort((a, b) => a.offset - b.offset);

    let j = 0;
    for (const i of this.analysis.hyphens) {
      while (j + 1 < items.length && items[j + 1].offset <= i) ++j;
      if (this.string[i] === '\u00ad' /* softHyphenCharacter */) loadHyphen(items[j]);
    }
  }

  createMarkIterator() {
    // Inline iterator
    const inlineIterator = createInlineIterator(this.ifc);
    let inline = inlineIterator.next();
    let inlineMark = 0;
    // Break iterator
    const breakIterator = new LineBreak(this.string);
    let linebreak:{position: number, required: boolean} | null = {position: -1, required: false};
    let breakMark = 0;
    // Item iterator
    let itemIndex = -1;
    let emittedItemEnd = false;
    let itemMeasureState: MeasureState | undefined;
    let itemMark = 0;
    // Ink iterator
    let isInk = false;
    let inkMark = 0;
    // Metrics iterator
    let metricsIndex = 0;
    // Other
    const end = this.length();

    const next = ():{done: true} | {done: false, value: IfcMark} => {
      const mark:IfcMark = {
        position: Math.min(inlineMark, itemMark, breakMark, inkMark),
        isBreak: false,
        isBreakForced: false,
        isInk: false,
        isItemStart: false,
        isItemEnd: false,
        inlinePre: null,
        inlinePost: null,
        float: null,
        advance: 0,
        itemIndex,
        metrics: this.metrics[metricsIndex]?.[0] || EmptyInlineMetrics,
        split
      };

      if (inline.done && !linebreak && itemIndex >= this.brokenItems.length) {
        return {done: true};
      }

      if (itemIndex < this.brokenItems.length && itemIndex > -1) {
        const item = this.brokenItems[itemIndex];
        const advance = item.measure(mark.position, 1, itemMeasureState);
        mark.advance = advance;
      }

      mark.isInk = isink(this.string[mark.position - 1]);

      if (inkMark === mark.position) {
        isInk = isink(this.string[inkMark]);
        while (inkMark < this.length() && isInk === isink(this.string[inkMark])) inkMark++;
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
          inlineMark += inline.value.item.text.length;
          inline = inlineIterator.next();
        } else if (!inline.done && inline.value.state === 'break') {
          mark.isBreak = true;
          mark.isBreakForced = true;
          inline = inlineIterator.next();
        }
      }

      // Metrics change at inline start or item start, are emitted with inlinePre
      if (metricsIndex + 1 < this.metrics.length && this.metrics[metricsIndex + 1][1] === mark.position) {
        metricsIndex += 1;
        mark.metrics = this.metrics[metricsIndex][0];
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

      if (!linebreak || linebreak.position > -1 && inkMark === mark.position) {
        inkMark = end + 1;
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
    const fctx = bfc.fctx;
    const candidates = new LineCandidates(this.ifc);
    const vacancy = new IfcVacancy(0, 0, 0, 0, 0, 0);
    const basedir = this.ifc.style.direction;
    const parents:Inline[] = [];
    let line:Linebox | null = null;
    let lastBreakMark:IfcMark | undefined;
    const lines = [];
    let floats = [];
    let unbreakableMark = 0;
    let blockOffset = bfc.cbBlockStart;

    // Optimization: here we assume that (1) doTextLayout will never be called
    // on the same ifc with a 'normal' mode twice and (2) that when the mode is
    // 'normal', that is the final doTextLayout call for this instance
    if (ctx.mode === 'min-content') {
      this.brokenItems = this.wholeItems.map(item => item.clone());
    } else {
      this.brokenItems = this.wholeItems;
    }

    for (const mark of {[Symbol.iterator]: () => this.createMarkIterator()}) {
      const item = this.brokenItems[mark.itemIndex];

      if (mark.inlinePre) {
        candidates.height.pushInline(mark.inlinePre);
        candidates.height.stampMetrics(mark.metrics);
        parents.push(mark.inlinePre);
      }

      const wsCollapsible = isWsCollapsible((parents[parents.length - 1] || this.ifc).style.whiteSpace);
      const nowrap = isNowrap((parents[parents.length - 1] || this.ifc).style.whiteSpace);

      if (mark.isInk) {
        candidates.width.addInk(mark.advance);
      } else {
        candidates.width.addWs(mark.advance, !!wsCollapsible);
      }

      if (mark.isInk || !wsCollapsible) unbreakableMark = mark.position;

      const lineHasInk = (line ? line.startOffset : 0) < unbreakableMark;

      if (mark.float) {
        if (!lineHasInk || lastBreakMark && lastBreakMark.position === mark.position) {
          const lineWidth = line ? line.width.forFloat() : 0;
          const lineIsEmpty = line ? !candidates.head && !line.head : true;
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
          lines.push(line = new Linebox(basedir, 0, this));
          fctx.preTextContent();
        }

        const blockSize = line.height.totalWith(candidates.height);
        fctx.getLocalVacancyForLine(bfc, blockOffset, blockSize, vacancy);

        if (this.string[mark.position - 1] === '\u00ad' && !mark.isBreakForced) {
          const glyphs = getHyphen(item);
          const {face: {upem}, attrs: {style: {fontSize}}} = item;
          if (glyphs?.length) candidates.width.addHyphen(glyphs.reduce((s, g) => s + g.ax / upem * fontSize, 0));
        }

        if (line.hasText() && line.width.forWord() + candidates.width.asWord() > vacancy.inlineSize) {
          const lastLine = line;
          if (!lastBreakMark) throw new Error('Assertion failed');
          lines.push(line = new Linebox(basedir, lastBreakMark.position, this));
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
          lastLine.postprocess(vacancy, this.ifc.style.textAlign);
          fctx.postLine(lastLine, true);
          blockOffset += lastLine.height.total();
        }

        if (!line.hasText() /* line was just added */) {
          fctx.getLocalVacancyForLine(bfc, blockOffset, blockSize, vacancy);
          if (candidates.width.forFloat() > vacancy.inlineSize) {
            const newVacancy = fctx.findLinePosition(blockOffset, blockSize, candidates.width.forFloat());
            blockOffset = newVacancy.blockOffset;
            fctx.dropShelf(blockOffset);
          }
        }

        line.addCandidates(candidates, mark.position);

        candidates.reset();
        lastBreakMark = mark;

        for (const float of floats) {
          layoutFloatBox(float, ctx);
          fctx.placeFloat(line.width.forFloat(), false, float);
        }
        floats = [];

        if (mark.isBreakForced) {
          fctx.getLocalVacancyForLine(bfc, blockOffset, blockSize, vacancy);
          line.postprocess(vacancy, this.ifc.style.textAlign);
          fctx.postLine(line, true);
          blockOffset += line.height.total();
          lines.push(line = new Linebox(basedir, mark.position, this));
        }
      }

      if (mark.isItemStart) {
        item.inlines = parents.slice();
        for (const p of parents) p.nshaped += 1;
        candidates.push(item);
        candidates.height.stampMetrics(mark.metrics);
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
      layoutFloatBox(float, ctx);
      fctx.placeFloat(line ? line.width.forFloat() : 0, line ? !line.head : true, float);
    }

    if (line) {
      const blockSize = line.height.total();
      fctx.getLocalVacancyForLine(bfc, blockOffset, blockSize, vacancy);
      line.postprocess(vacancy, this.ifc.style.textAlign);
      blockOffset += line.height.total();
      fctx.postLine(line, false);
    } else {
      fctx.consumeMisfits();
    }

    if (this.enableLogging) {
      console.log(`Paragraph ${this.ifc.id}:`);
      logParagraph(this.brokenItems);
      for (const [i, line] of lines.entries()) {
        const W = line.width.trimmed().toFixed(2);
        const A = line.ascender.toFixed(2);
        const D = line.descender.toFixed(2);
        const B = line.blockOffset.toFixed(2);
        let log = `Line ${i} (W:${W} A:${A} D:${D} B:${B}): `;
        for (let n = line.head; n; n = n.next) {
          log += n.value instanceof ShapedItem ? `“${n.value.text()}” ` : '“”';
        }
        console.log(log);
      }
      console.log('Left floats');
      console.log(fctx.leftFloats.repr());
      console.log('Right floats');
      console.log(fctx.rightFloats.repr());
    }

    this.lineboxes = lines;
    this.height = blockOffset - bfc.cbBlockStart;
  }
}

export function createParagraph(ifc: IfcInline, enableLogging: boolean) {
  const buffer = createIfcBuffer(ifc.text)
  return new Paragraph(ifc, buffer, enableLogging);
}

const EmptyBuffer = {
  array: new Uint16Array(),
  destroy: () => {}
};

export function createEmptyParagraph(ifc: IfcInline) {
  return new Paragraph(ifc, EmptyBuffer, false);
}

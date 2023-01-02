import {binarySearchTuple, binarySearchEndProp, loggableText} from './util.js';
import {Box} from './box.js';
import {Style, initialStyle, createComputedStyle, Color, TextAlign} from './cascade.js';
import {IfcInline, Inline, BlockContainer, PreprocessContext, LayoutContext, createInlineIterator, createPreorderInlineIterator, IfcVacancy, layoutFloatBox} from './flow.js';
import {getBuffer} from './io.js';
import {HbFace, HbFont, HbGlyphInfo} from 'harfbuzzjs';
import {Cascade} from 'fontconfig';
import LineBreak from './unicode/lineBreak.js';
import {nextGraphemeBreak} from './unicode/graphemeBreak.js';
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

// TODO runs aren't really boxes per the spec. You can't position them, etc.
// I wonder if I should create a class like RenderItem (Box extends RenderItem)
export class Run extends Box {
  public start: number = 0;
  public end: number = 0;
  public text: string;

  constructor(text: string, style: Style) {
    super(style, [], 0);

    this.text = text;
    this.style = style || new Style('anontext', createComputedStyle(initialStyle, {
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
    return !!this.style.whiteSpace.match(/^(normal|nowrap|pre-line)$/);
  }

  get sgUncollapsible() {
    return !!this.style.whiteSpace.match(/^(pre|pre-wrap|break-spaces|pre-line)$/);
  }

  get sgCollapsible() {
    return !this.sgUncollapsible;
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

function createFontKey(s: Style, script: string) {
  return `${s.fontStyle} ${s.fontWeight} ${s.fontStretch} ${s.fontFamily} ${script}`;
}

const fontBufferCache = new Map<string, Promise<ArrayBuffer>>();
const hbFaceCache = new Map<string, Promise<HbFace>>();
const cascadeCache = new Map<string, Cascade>();

async function getFontBuffer(filename: string) {
  let bufferp = fontBufferCache.get(filename);
  if (!bufferp) {
    bufferp = getBuffer(filename);
    fontBufferCache.set(filename, bufferp);
  }
  return await bufferp;
}

async function createFace(filename: string, index: number) {
  const buffer = await getFontBuffer(filename);
  const blob = hb.createBlob(buffer);
  const face = hb.createFace(blob, index);
  face.name = basename(filename); // TODO can it be done in hbjs?
  return face;
}

function getFace(filename: string, index: number) {
  let fontp = hbFaceCache.get(filename + index);
  if (!fontp) {
    fontp = createFace(filename, index);
    hbFaceCache.set(filename + index, fontp);
  }
  return fontp;
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

// exported because used by painter
export function getAscenderDescender(style: Style, font: HbFont, upem: number) { // CSS2 §10.8.1
  const {fontSize, lineHeight: cssLineHeight} = style;
  const {ascender, descender, lineGap} = font.getExtents("ltr"); // TODO
  const emHeight = (ascender - descender) / upem;
  const pxHeight = emHeight * fontSize;
  const lineHeight = cssLineHeight === 'normal' ? pxHeight + lineGap / upem * fontSize : cssLineHeight;
  const halfLeading = (lineHeight - pxHeight) / 2;
  const ascenderPx = ascender / upem * fontSize;
  const descenderPx = -descender / upem * fontSize;
  return {ascender: halfLeading + ascenderPx, descender: halfLeading + descenderPx};
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

type GlyphIterator = ReturnType<typeof createGlyphIterator>;

type GlyphIteratorValue = ReturnType<GlyphIterator["next"]>;

type MwRet = [number, GlyphIteratorValue];
function measureWidth(item: ShapedItem, glyphIterator: GlyphIterator, it: GlyphIteratorValue, ci: number):MwRet {
  let width = 0;

  while (!it.done && item.glyphs[it.value.start].cl < ci) {
    for (let i = it.value.start; i < it.value.end; ++i) {
      const glyphWidth = item.glyphs[i].ax / item.face.upem * item.attrs.style.fontSize;
      width += glyphWidth;
    }
    it = glyphIterator.next();
  }

  return [width, it];
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
  cstart: number,
  cend: number,
  gstart: number,
  gend: number,
  text: string,
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

export class ShapedItem implements IfcRenderItem {
  paragraph: Paragraph;
  face: HbFace;
  match: FontConfigCssMatch;
  glyphs: HbGlyphInfo[];
  offset: number;
  text: string;
  attrs: Readonly<ShapingAttrs>;
  needsReshape: boolean;
  inlines: Inline[];

  constructor(
    paragraph: Paragraph,
    face: HbFace,
    match: FontConfigCssMatch,
    glyphs: HbGlyphInfo[],
    offset: number,
    text: string,
    attrs: Readonly<ShapingAttrs>
  ) {
    this.paragraph = paragraph;
    this.face = face;
    this.match = match;
    this.glyphs = glyphs;
    this.offset = offset;
    this.text = text;
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
      this.text,
      this.attrs
    );
  }

  split(offset: number) {
    const dir = this.attrs.level % 2 ? 'rtl' : 'ltr';
    const glyphs = shiftGlyphs(this.glyphs, this.offset + offset, dir);
    const needsReshape = Boolean(glyphs[0].flags & 1);
    const inlines = this.inlines;
    const right = new ShapedItem(
      this.paragraph,
      this.face,
      this.match,
      glyphs,
      this.offset + offset,
      this.text.slice(offset),
      this.attrs
    );

    this.text = this.text.slice(0, offset);

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

  reshape(ctx: LayoutContext) {
    const font = hb.createFont(this.face);
    const buf = this.paragraph.createAndShapeBuffer(this.offset, this.text.length, font, this.attrs);
    this.glyphs = buf.json();
    buf.destroy();
    font.destroy();
  }

  measure(ci = this.end(), direction: 1 | -1 = 1) {
    const g = this.glyphs;
    let w = 0;

    if (this.attrs.level % 2) {
      if (direction === 1) {
        for (let i = g.length - 1; i >= 0 && g[i].cl < ci; i--) w += g[i].ax;
      } else {
        for (let i = 0; i < g.length && g[i].cl >= ci; i++) w += g[i].ax;
      }
    } else {
      if (direction === 1) {
        for (let i = 0; i < g.length && g[i].cl < ci; i++) w += g[i].ax;
      } else {
        for (let i = g.length - 1; i >= 0 && g[i].cl >= ci; i--) w += g[i].ax;
      }
    }

    return w / this.face.upem * this.attrs.style.fontSize;
  }

  measureExtents(ci = this.end()) {
    const ret = {ascender: 0, descender: 0};
    let i = binarySearchTuple(this.paragraph.extents, this.offset);

    if (!this.paragraph.extents[i]) return ret;
    if (this.paragraph.extents[i][1] !== this.offset) i -= 1;

    while (i < this.paragraph.extents.length && this.paragraph.extents[i][1] < ci) {
      const [extents] = this.paragraph.extents[i++];
      ret.ascender = Math.max(ret.ascender, extents.ascender);
      ret.descender = Math.max(ret.descender, extents.descender);
    }

    return ret;
  }

  collapseWhitespace(at: 'start' | 'end') {
    // TODO: this is copied in Inline
    if (!this.attrs.style.whiteSpace.match(/^(normal|nowrap|pre-line)$/)) {
      return true;
    }

    const level = at === 'start' ? this.attrs.level : this.attrs.level + 1;
    const glyphIterator = createGlyphIterator(this.glyphs, level % 2 ? 'rtl' : 'ltr');

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
    return this.offset + this.text.length;
  }
}

function logParagraph(paragraph: ShapedItem[]) {
  for (const item of paragraph) {
    const lead = `  @${item.offset} `;
    const leadsp = ' '.repeat(lead.length);
    console.log(`${lead}F:${basename(item.face.name)}`);
    console.log(`${leadsp}T:"${item.text}"`);
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

class LineCandidates extends LineItemLinkedList {};

class LineWidthTracker {
  private inkSeen: boolean;
  private wsBefore: number;
  private wsBeforeCollapsible: number;
  private ink: number;
  private wsAfter: number;
  private wsAfterCollapsible: number;

  constructor() {
    this.inkSeen = false;
    this.wsBefore = 0;
    this.wsBeforeCollapsible = 0;
    this.ink = 0;
    this.wsAfter = 0;
    this.wsAfterCollapsible = 0;
  }

  addInk(width: number) {
    this.ink += this.wsAfter + width;
    this.wsAfter = 0;
    this.wsAfterCollapsible = 0;
    this.inkSeen = true;
  }

  addWs(width: number, isCollapsible: boolean) {
    if (this.inkSeen) {
      this.wsAfter += width;
      this.wsAfterCollapsible = isCollapsible ? width : 0;
    } else {
      this.wsBefore += width;
      this.wsBeforeCollapsible = isCollapsible ? width : 0;
    }
  }

  concat(width: LineWidthTracker) {
    if (this.inkSeen) {
      if (width.inkSeen) {
        this.ink += this.wsAfter + width.wsBefore + width.ink;
        this.wsAfter = width.wsAfter;
        this.wsAfterCollapsible = width.wsAfterCollapsible;
      } else {
        this.wsAfter += width.wsBefore;
        this.wsAfterCollapsible = width.wsBeforeCollapsible + width.wsAfterCollapsible;
      }
    } else {
      this.wsBefore += width.wsBefore;
      this.wsBeforeCollapsible += width.wsBeforeCollapsible;
      this.ink = width.ink;
      this.wsAfter = width.wsAfter;
      this.wsAfterCollapsible = width.wsAfterCollapsible;
      this.inkSeen = width.inkSeen;
    }
  }

  forFloat() {
    return this.wsBefore - this.wsBeforeCollapsible + this.ink;
  }

  forWord() {
    return this.wsBefore - this.wsBeforeCollapsible + this.ink + this.wsAfter;
  }

  asWord() {
    return this.wsBefore + this.ink;
  }

  trimmed() {
    return this.wsBefore - this.wsBeforeCollapsible + this.ink + this.wsAfter - this.wsAfterCollapsible;
  }

  reset() {
    this.inkSeen = false;
    this.wsBefore = 0;
    this.ink = 0;
    this.wsAfter = 0;
  }
}

type AscenderDescender = {ascender: number, descender: number};

export class Linebox extends LineItemLinkedList {
  ascender: number;
  descender: number;
  startOffset: number;
  endOffset: number;
  width: LineWidthTracker;
  dir: 'ltr' | 'rtl';
  trimStartFinished: boolean;
  blockOffset: number;
  inlineOffset: number;

  constructor(dir: Linebox['dir'], start: number, strut: AscenderDescender) {
    super();
    this.dir = dir;
    this.startOffset = this.endOffset = start;
    this.ascender = strut.ascender;
    this.descender = strut.descender;
    this.width = new LineWidthTracker();
    this.trimStartFinished = false;
    this.blockOffset = 0;
    this.inlineOffset = 0;
  }

  height() {
    return this.ascender + this.descender;
  }

  addLogical(candidates: LineCandidates, width: LineWidthTracker, endOffset: number) {
    this.concat(candidates);
    this.width.concat(width);
    this.endOffset = endOffset;
    if (!this.trimStartFinished) this.trimStart();
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
      if (n.value.collapseWhitespace('start')) {
        this.trimStartFinished = true;
        return;
      }
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
        if (minLevel % 2) {
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

    if (minLevel % 2) {
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

  calculateExtents() {
    // TODO technically trimmed whitespace is still affecting ascender/descender
    // I wonder if this is something browsers handle? extreme edge case though
    for (let n = this.head; n; n = n.next) {
      if (n.value instanceof ShapedItem) {
        this.ascender = Math.max(this.ascender, n.value.measureExtents().ascender);
        this.descender = Math.max(this.descender, n.value.measureExtents().descender);
      }
    }
  }

  postprocess(vacancy: IfcVacancy, textAlign: TextAlign) {
    const width = this.width.trimmed();
    this.blockOffset = vacancy.blockOffset;
    this.trimEnd();
    this.reorder();
    this.calculateExtents();
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
  split: (this: IfcMark, mark: IfcMark) => void
};

function isink(c: string) {
  return c !== undefined && c !== ' ' && c !== '\t';
}

export class Paragraph {
  ifc: IfcInline;
  string: string;
  array: Uint16Array;
  colors: [Color, number][];
  extents: [AscenderDescender, number][];
  brokenItems: ShapedItem[];
  wholeItems: ShapedItem[];
  lineboxes: Linebox[];
  height: number;
  strut: AscenderDescender;

  constructor(ifc: IfcInline, strut: AscenderDescender, array: Uint16Array) {
    this.ifc = ifc;
    this.string = ifc.text;
    this.array = array;
    this.colors = [];
    this.extents = [];
    this.brokenItems = [];
    this.wholeItems = [];
    this.lineboxes = [];
    this.height = 0;
    this.strut = strut;
  }

  slice(start: number, end: number) {
    return this.string.slice(start, end);
  }

  split(itemIndex: number, offset: number) {
    const left = this.brokenItems[itemIndex];
    const right = left.split(offset - left.offset);
    this.brokenItems.splice(itemIndex + 1, 0, right);
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

    const iEmoji = itemizer.emoji(this.string);
    const iBidi = itemizer.bidi(this.string, this.ifc.style.direction === 'ltr' ? 0 : 1);
    const iScript = itemizer.script(this.string);
    const iStyle = this.ifc.itemizeInlines();
    const iNewline = this.nlIterator();

    let emoji = iEmoji.next();
    let bidi = iBidi.next();
    let script = iScript.next();
    let style = iStyle.next();
    let newline = iNewline.next();

    if (emoji.done || bidi.done || script.done || style.done || newline.done) {
      throw new Error('Iterator ended too early');
    }

    let ctx:ShapingAttrs = {
      isEmoji: emoji.value.isEmoji,
      level: bidi.value.level,
      script: script.value.script,
      style: style.value.style
    };

    while (!emoji.done && !bidi.done && !script.done && !style.done && !newline.done) {
      // Find smallest text index
      let smallest:number = emoji.value.i;
      if (!bidi.done && bidi.value.i < smallest) smallest = bidi.value.i;
      if (!script.done && script.value.i < smallest) smallest = script.value.i;
      if (!style.done && style.value.i < smallest) smallest = style.value.i;
      if (!newline.done && newline.value.i < smallest) smallest = newline.value.i;

      // Map the current iterators to context
      if (!emoji.done) ctx.isEmoji = emoji.value.isEmoji;
      if (!bidi.done) ctx.level = bidi.value.level;
      if (!script.done) ctx.script = script.value.script;
      if (!style.done) ctx.style = style.value.style;

      // Advance
      if (!emoji.done && smallest === emoji.value.i) emoji = iEmoji.next();
      if (!bidi.done && smallest === bidi.value.i) bidi = iBidi.next();
      if (!script.done && smallest === script.value.i) script = iScript.next();
      if (!style.done && smallest === style.value.i) style = iStyle.next();
      if (!newline.done && smallest === newline.value.i) newline = iNewline.next();

      yield {i: smallest, attrs: ctx};
    }
  }

  createAndShapeBuffer(offset: number, length: number, font: HbFont, attrs: ShapingAttrs) {
    const buf = hb.createBuffer();
    buf.setClusterLevel(1);
    buf.addUtf16(this.array.byteOffset, this.array.length, offset, length);
    buf.setDirection(attrs.level % 2 ? 'rtl' : 'ltr');
    buf.setScript(attrs.script);
    buf.setLanguage(langForScript(attrs.script)); // TODO support [lang]
    hb.shape(font, buf);
    return buf;
  }

  createExtentsArray(styles: [Style, number][], faces: [HbFace, number][]) {
    const extents:[{ascender: number, descender: number}, number][] = [];
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
        extents.push([getAscenderDescender(style, font, face.upem), Math.max(so, fo)]);
        lastFace = face;
        lastStyle = style;
      }

      if (sn <= fn) si += 1;
      if (fn <= sn) fi += 1;
    }

    for (const font of facemap.values()) font.destroy();

    return extents;
  }

  async shape(ctx: PreprocessContext) {
    const inlineIterator = createPreorderInlineIterator(this.ifc);
    const items:ShapedItem[] = [];
    const colors:[Color, number][] = [[this.ifc.style.color, 0]];
    const styles:[Style, number][] = [[this.ifc.style, 0]];
    const faces:[HbFace, number][] = [];
    let inline = inlineIterator.next();
    let inlineEnd = 0;

    let log = '';
    log += `Preprocess ${this.ifc.id}\n`;
    log += '='.repeat(`Preprocess ${this.ifc.id}`.length) + '\n';
    log += `Full text: "${this.string}"\n`;
    let lastItemIndex = 0;

    for (const {i: itemIndex, attrs} of this.itemize()) {
      const start = lastItemIndex;
      const end = itemIndex;
      const cascade = getCascade(attrs.style, attrs.script);
      const text = this.slice(start, end);
      const shapeWork = [{offset: start, text}];

      log += `  Item ${lastItemIndex}..${itemIndex}:\n`;
      log += `  emoji=${attrs.isEmoji} level=${attrs.level} script=${attrs.script} `;
      log += `size=${attrs.style.fontSize} variant=${attrs.style.fontVariant}\n`;
      log += `  cascade=${cascade.matches.map(m => basename(m.file)).join(', ')}\n`;

      cascade: for (let i = 0; shapeWork.length && i < cascade.matches.length; ++i) {
        const match = cascade.matches[i].toCssMatch();
        const isLastMatch = i === cascade.matches.length - 1;
        const face = await getFace(match.file, match.index);
        // TODO set size and such for hinting?
        const font = hb.createFont(face);
        // Allows to tack successive (re)shaping parts onto one larger item
        const parts:ShapingPart[] = [];

        // note this won't budge for matches i=1, 2, ...
        while (!inline.done && inlineEnd < itemIndex) {
          if (inline.value.isInline()) {
            inline.value.face = face;
          }

          if (inline.value.isRun()) {
            const [, lastColorOffset] = colors[colors.length - 1];
            if (lastColorOffset === inline.value.start) {
              colors[colors.length - 1][0] = inline.value.style.color;
            } else {
              colors.push([inline.value.style.color, inline.value.start]);
            }

            const [, lastStyleOffset] = styles[styles.length - 1];
            if (lastStyleOffset === inline.value.start) {
              styles[styles.length - 1][0] = inline.value.style;
            } else {
              styles.push([inline.value.style, inline.value.start]);
            }

            inlineEnd += inline.value.text.length;
          }

          inline = inlineIterator.next();
        }

        while (shapeWork.length) {
          const {text, offset} = shapeWork.pop()!;
          const buf = this.createAndShapeBuffer(offset, text.length, font, attrs);
          const shapedPart = buf.json();
          let didPushPart = false;

          log += `    Shaping "${text}" with font ${match.file}\n`;
          log += '    Shaper returned: ' + logGlyphs(shapedPart) + '\n';

          // Grapheme cluster iterator
          let ucClusterStart = 0;
          let ucClusterEnd = 0;
          // HB cluster iterator
          const hbGlyphIterator = createGlyphIterator(shapedPart, attrs.level % 2 ? 'rtl' : 'ltr');
          let hbIt = hbGlyphIterator.next();
          let hbClusterEnd = 0;
          let clusterNeedsReshape = false;

          do {
            const mark = Math.min(ucClusterEnd, hbClusterEnd);

            if (ucClusterEnd < text.length && mark === ucClusterEnd) {
              ucClusterStart = ucClusterEnd;
              ucClusterEnd = nextGraphemeBreak(text, ucClusterEnd);
            }

            if (hbClusterEnd < text.length && mark === hbClusterEnd) {
              clusterNeedsReshape = hbIt.done ? /* impossible */ false : hbIt.value.needsReshape;
              hbIt = hbGlyphIterator.next();
              hbClusterEnd = hbIt.done ? text.length : shapedPart[hbIt.value.start].cl - offset;
            }

            const nextMark = Math.min(ucClusterEnd, hbClusterEnd);

            if (nextMark === ucClusterEnd) {
              const [glyphStart, glyphEnd] = hbGlyphIterator.pull();
              if (!didPushPart || clusterNeedsReshape !== parts[parts.length - 1].reshape) {
                parts.push({
                  offset,
                  cstart: ucClusterStart,
                  cend: ucClusterEnd,
                  gstart: glyphStart,
                  gend: glyphEnd,
                  reshape: clusterNeedsReshape,
                  text,
                  glyphs: shapedPart
                });
                didPushPart = true;
              } else {
                parts[parts.length - 1].cend = ucClusterEnd;
                parts[parts.length - 1].gstart = Math.min(parts[parts.length - 1].gstart, glyphStart);
                parts[parts.length - 1].gend = Math.max(glyphEnd, parts[parts.length - 1].gend);
              }
            }
          } while (ucClusterEnd < text.length || hbClusterEnd < text.length);
        }

        for (const part of parts) {
          const {gstart, gend, cstart, cend, reshape} = part;
          const offset = part.offset + cstart;
          const text = part.text.slice(cstart, cend);

          if (reshape && !isLastMatch) {
            shapeWork.push({offset, text});
            log += `    ==> Must reshape "${text}"\n`;
          } else {
            const glyphs = part.glyphs.slice(gstart, gend);

            faces.push([face, offset]);
            items.push(new ShapedItem(this, face, match, glyphs, offset, text, {...attrs}));

            if (isLastMatch && reshape) {
              log += '    ==> Cascade finished with tofu: ' + logGlyphs(glyphs) + '\n';
              break cascade;
            } else {
              log += '    ==> Glyphs OK: ' + logGlyphs(glyphs) + '\n';
            }
          }
        }

        font.destroy();
      }

      lastItemIndex = itemIndex;
    }

    if (ctx.logging.text.has(this.ifc.id)) {
      console.log(log.slice(0, -1));
      console.log();
    }

    this.colors = colors;
    this.extents = this.createExtentsArray(styles, faces.sort((a, b) => a[1] - b[1]));
    this.wholeItems = items.sort((a, b) => a.offset - b.offset);
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
    let glyphIterator = createGlyphIterator([], 'ltr');
    let glyph = glyphIterator.next();
    let itemMark = 0;
    // Ink iterator
    let isInk = false;
    let inkMark = 0;
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
        split
      };

      if (inline.done && !linebreak && itemIndex >= this.brokenItems.length) {
        return {done: true};
      }

      if (itemIndex < this.brokenItems.length && itemIndex > -1) {
        const item = this.brokenItems[itemIndex];
        const [advance, nextGlyph] = measureWidth(item, glyphIterator, glyph, mark.position);
        mark.advance = advance;
        glyph = nextGlyph;
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

        if (mark.inlinePre || mark.inlinePost || mark.isBreak) return {done: false, value: mark};
      }

      if (itemIndex < this.brokenItems.length && itemMark === mark.position && (inline.done || inlineMark !== mark.position)) {
        itemIndex += 1;

        if (itemIndex < this.brokenItems.length) {
          const item = this.brokenItems[itemIndex];
          itemMark += item.text.length;
          glyphIterator = createGlyphIterator(item.glyphs, item.attrs.level % 2 ? 'rtl' : 'ltr');
          glyph = glyphIterator.next();
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
          linebreak = bk;
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
      const rightGlyphIterator = createGlyphIterator(item.glyphs, item.attrs.level % 2 ? 'rtl' : 'ltr');
      const rightGlyph = rightGlyphIterator.next();
      const [, nextGlyph] = measureWidth(item, rightGlyphIterator, rightGlyph, mark.position);

      if (itemIndex === this.itemIndex) {
        glyphIterator = rightGlyphIterator;
        glyph = nextGlyph;
      }
    }

    return {next};
  }

  createLineboxes(ctx: LayoutContext) {
    const bfc = ctx.bfc;
    const fctx = bfc.fctx;
    const candidates = new LineCandidates();
    const candidatesWidth = new LineWidthTracker();
    const basedir = this.ifc.style.direction;
    const parents:Inline[] = [];
    let line:Linebox | null = null;
    let lastBreakMark:IfcMark | undefined;
    const lines = [];
    const floats = [];
    let breakExtents = {ascender: 0, descender: 0};
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

      if (mark.isInk) {
        const extents = item.measureExtents(mark.position); // TODO is this slow?
        breakExtents.ascender = Math.max(extents.ascender, breakExtents.ascender);
        breakExtents.descender = Math.max(extents.descender, breakExtents.descender);
      }

      if (mark.inlinePre) parents.push(mark.inlinePre);

      const wsCollapsible = (parents[parents.length - 1] || this.ifc).style.whiteSpace.match(/^(normal|nowrap|pre-line)$/);
      const nowrap = (parents[parents.length - 1] || this.ifc).style.whiteSpace.match(/^(nowrap|pre)$/);

      if (mark.isInk) {
        candidatesWidth.addInk(mark.advance);
      } else {
        candidatesWidth.addWs(mark.advance, !!wsCollapsible);
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
        const p = basedir === 'ltr' ? 'leftMarginBorderPadding' : 'rightMarginBorderPadding';
        const op = basedir === 'ltr' ? 'rightMarginBorderPadding' : 'leftMarginBorderPadding';
        const w = mark.inlinePre?.[p] ?? 0 + (mark.inlinePost?.[op] ?? 0);
        candidatesWidth.addInk(w);
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
          lines.push(line = new Linebox(basedir, 0, this.strut));
          fctx.preTextContent();
        }

        const blockSize = breakExtents.ascender + breakExtents.descender;
        const vacancy = fctx.getVacancyForLine(blockOffset, blockSize).makeLocal(bfc);

        if (line.hasText() && line.width.forWord() + candidatesWidth.asWord() > vacancy.inlineSize) {
          const lastLine = line;
          if (!lastBreakMark) throw new Error('Assertion failed');
          lines.push(line = new Linebox(basedir, lastBreakMark.position, this.strut));
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
          blockOffset += lastLine.height();
        }

        if (!line.hasText() /* line was just added */) {
          const vacancy = fctx.getVacancyForLine(blockOffset, blockSize).makeLocal(bfc);
          if (candidatesWidth.forFloat() > vacancy.inlineSize) {
            const newVacancy = fctx.findLinePosition(blockOffset, blockSize, candidatesWidth.forFloat());
            blockOffset = newVacancy.blockOffset;
            fctx.dropShelf(blockOffset);
          }
        }

        // TODO: if these candidates grow the line height, we have to check and
        // make sure it won't cause the line to start hitting floats

        line.addLogical(candidates, candidatesWidth, mark.position);

        candidates.clear();
        candidatesWidth.reset();
        breakExtents.ascender = 0;
        breakExtents.descender = 0;
        lastBreakMark = mark;

        for (const float of floats) {
          layoutFloatBox(float, ctx);
          fctx.placeFloat(line.width.forFloat(), false, float);
        }
        floats.length = 0;

        if (mark.isBreakForced) {
          const vacancy = fctx.getVacancyForLine(blockOffset, blockSize).makeLocal(bfc);
          line.postprocess(vacancy, this.ifc.style.textAlign);
          fctx.postLine(line, true);
          blockOffset += line.height();
          lines.push(line = new Linebox(basedir, mark.position, this.strut));
        }
      }

      if (mark.isItemStart) {
        item.inlines = parents.slice();
        for (const p of parents) p.nshaped += 1;
        candidates.push(item);
      }

      // Handle a span that starts inside a shaped item
      if (mark.inlinePre && item && mark.position < item.end()) {
        item.inlines.push(mark.inlinePre);
        mark.inlinePre.nshaped += 1;
      }

      if (mark.inlinePost) parents.pop();
    }

    for (const float of floats) {
      layoutFloatBox(float, ctx);
      fctx.placeFloat(line ? line.width.forFloat() : 0, line ? !line.head : true, float);
    }

    if (line) {
      const blockSize = breakExtents.ascender + breakExtents.descender;
      const vacancy = fctx.getVacancyForLine(blockOffset, blockSize).makeLocal(bfc);
      line.postprocess(vacancy, this.ifc.style.textAlign);
      blockOffset += line.height();
      fctx.postLine(line, false);
    } else {
      fctx.consumeMisfits();
    }

    if (ctx.logging.text.has(this.ifc.id)) {
      console.log(`Paragraph ${this.ifc.id}:`);
      logParagraph(this.brokenItems);
      for (const [i, line] of lines.entries()) {
        let log = `Line ${i} (${line.width.trimmed()} width): `;
        for (let n = line.head; n; n = n.next) {
          log += n.value instanceof ShapedItem ? `“${n.value.text}” ` : '“”';
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

export async function createParagraph(ifc: IfcInline, ctx: PreprocessContext) {
  const strutCascade = getCascade(ifc.style, 'Latn');
  const strutFontMatch = strutCascade.matches[0].toCssMatch();
  const strutFace = await getFace(strutFontMatch.file, strutFontMatch.index);
  const strutFont = hb.createFont(strutFace);
  const strut = getAscenderDescender(ifc.style, strutFont, strutFace.upem);
  // TODO: if this lib ever gets used more seriously, need to expose a way to
  // teardown memory retained here
  const buffer = createIfcBuffer(ifc.text);
  strutFont.destroy();
  return new Paragraph(ifc, strut, buffer.array);
}

import {bsearch, loggableText} from './util';
import {Box} from './box';
import {Style, initialStyle, createComputedStyle, Color} from './cascade';
import {IfcInline, Inline, InlineLevel, PreprocessContext, LayoutContext, createInlineIterator, createPreorderInlineIterator} from './flow';
import {getBuffer} from '../io';
import {Harfbuzz, HbFace, HbFont, HbGlyphInfo} from 'harfbuzzjs';
import {FontConfig, Cascade} from 'fontconfig';
import {Itemizer} from 'itemizer';
import GraphemeBreaker = require('grapheme-breaker');
import LineBreak = require('linebreak');
import type {FontConfigCssMatch} from 'fontconfig';

let debug = true;

export class Run extends Box {
  public start: number = 0;
  public end: number = 0;
  public text: string;

  constructor(text: string, style: Style) {
    super(style, [], false);

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

    const rstart = bsearch(this.runs, start);
    const rend = end <= this.runs[rstart].end ? rstart : bsearch(this.runs, end);
    let shrinkahead = 0;

    this.buf = this.buf.slice(0, start) + s + this.buf.slice(end + 1);

    for (let k = rstart; k < this.runs.length; ++k) {
      const run = this.runs[k];

      run.shift(shrinkahead);

      if (k <= rend) shrinkahead += run.mod(start, end - shrinkahead, s);
      if (run.end < run.start) this.runs.splice(k--, 1);

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

function* styleItemizer(inline: IfcInline) {
  const END_CHILDREN = Symbol('end of children');
  const stack:(InlineLevel | typeof END_CHILDREN)[] = inline.children.slice().reverse();
  const parents:Inline[] = [inline];
  let currentStyle = inline.style;
  let ci = 0;
  // Shaping boundaries can overlap when the happen because of padding. We can
  // pretend 0 has been emitted since runs at 0 which appear to have different
  // style than `currentStyle` are just differing from the IFC's style, which
  // is the initial `currentStyle` so that yields always have a concrete style.
  let lastYielded = 0;

  while (stack.length) {
    const item = stack.pop()!;
    const parent = parents[parents.length - 1];

    if (item === END_CHILDREN) {
      // TODO: when I support `direction: rtl;`, possibly check the left side here
      if (parent.rightMarginBorderPadding > 0 && ci !== lastYielded) {
        yield {i: ci, style: currentStyle};
        lastYielded = ci;
      }
      parents.pop();
    } else if (item.isRun()) {
      if (
        currentStyle.fontSize !== item.style.fontSize ||
        currentStyle.fontVariant !== item.style.fontVariant ||
        currentStyle.fontWeight !== item.style.fontWeight ||
        currentStyle.fontStyle !== item.style.fontStyle ||
        currentStyle.fontFamily.join(',') !== item.style.fontFamily.join(',')
      ) {
        if (ci !== lastYielded) yield {i: ci, style: currentStyle};
        currentStyle = item.style;
        lastYielded = ci;
      }

      ci += item.text.length;
    } else if (item.isInline()) {
      parents.push(item);

      // TODO: when I support `direction: rtl;`, possibly check the right side here
      if (item.leftMarginBorderPadding > 0 && ci !== lastYielded) {
        yield {i: ci, style: currentStyle};
        lastYielded = ci;
      }

      stack.push(END_CHILDREN);

      for (let i = item.children.length - 1; i >= 0; --i) {
        stack.push(item.children[i]);
      }
    }
  }

  yield {i: ci, style: currentStyle};
}

type ShapingAttrs = {
  isEmoji: boolean,
  level: number,
  script: string,
  style: Style
};

function* shapingItemizer(inline: IfcInline, itemizer: Itemizer) {
  const iEmoji = itemizer.emoji(inline.allText);
  const iBidi = itemizer.bidi(inline.allText, inline.style.direction === 'ltr' ? 0 : 1);
  const iScript = itemizer.script(inline.allText);
  const iStyle = styleItemizer(inline);

  let emoji = iEmoji.next();
  let bidi = iBidi.next();
  let script = iScript.next();
  let style = iStyle.next();

  if (emoji.done || bidi.done || script.done || style.done) {
    throw new Error('Iterator ended too early');
  }

  let ctx:ShapingAttrs = {
    isEmoji: emoji.value.isEmoji,
    level: bidi.value.level,
    script: script.value.script,
    style: style.value.style
  };

  while (!emoji.done && !bidi.done && !script.done && !style.done) {
    // Find smallest text index
    let smallest:number = emoji.value.i;
    if (!bidi.done && bidi.value.i < smallest) smallest = bidi.value.i;
    if (!script.done && script.value.i < smallest) smallest = script.value.i;
    if (!style.done && style.value.i < smallest) smallest = style.value.i;

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
    //if (smallest === leadingWs) leadingWs = Infinity;

    yield {i: smallest, attrs: ctx};
  }
}

function basename(p: string) {
  return p.match(/([^.\/]+)\.[A-z]+$/)?.[1] || p;
}

function createFontKey(style: Style, script: string) {
  return `${style.fontWeight} ${style.fontVariant} ${style.fontFamily} ${script}`;
}

const fontBufferCache = new Map<string, Promise<Buffer>>();
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

async function createFace(hb: Harfbuzz, filename: string, index: number) {
  const buffer = await getFontBuffer(filename);
  const blob = hb.createBlob(buffer);
  const face = hb.createFace(blob, index);
  face.name = basename(filename); // TODO can it be done in hbjs?
  return face;
}

export function getFace(hb: Harfbuzz, filename: string, index: number) {
  let fontp = hbFaceCache.get(filename + index);
  if (!fontp) {
    fontp = createFace(hb, filename, index);
    hbFaceCache.set(filename + index, fontp);
  }
  return fontp;
}

export function getCascade(fcfg: FontConfig, style: Style, script: string) {
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
    const cl = glyphs[i].cl - offset;
    if (cl >= 0) {
      if (dir === 'ltr') {
        if (i < rmRange[0]) rmRange[0] = i;
      } else {
        rmRange[1] = i + 1;
      }
      glyphs[i].cl = cl;
    }
  }

  return glyphs.splice(rmRange[0], rmRange[1] - rmRange[0]);
}

function shiftColors(colors: [Color, number][], newOffset: number) {
  const ret:[Color, number][] = [];
  let i = colors.length;

  do {
    const [color, offset] = colors[--i];
    ret.unshift([color, Math.max(0, offset - newOffset)]);
  } while (i > 0 && colors[i][1] > newOffset);

  return ret;
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
  face: HbFace;
  match: FontConfigCssMatch;
  glyphs: HbGlyphInfo[];
  offset: number;
  text: string;
  colors: [Color, number][];
  attrs: ShapingAttrs;
  needsReshape: boolean;
  inlines: Inline[];

  constructor(face: HbFace, match: FontConfigCssMatch, glyphs: HbGlyphInfo[], offset: number, text: string, colors: [Color, number][], attrs: ShapingAttrs) {
    this.face = face;
    this.match = match;
    this.glyphs = glyphs;
    this.offset = offset;
    this.text = text;
    this.colors = colors;
    this.attrs = attrs;
    this.needsReshape = false;
    this.inlines = [];
  }

  split(offset: number) {
    const dir = this.attrs.level % 2 ? 'rtl' : 'ltr';
    const rightText = this.text.slice(offset);
    const rightOffset = this.offset + offset;
    const rightGlyphs = shiftGlyphs(this.glyphs, offset, dir);
    const rightColors = shiftColors(this.colors, rightOffset);
    const right = new ShapedItem(this.face, this.match, rightGlyphs, rightOffset, rightText, rightColors, this.attrs);
    const needsReshape = Boolean(rightGlyphs[0].flags & 1);
    const inlines = this.inlines;

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
    const font = ctx.hb.createFont(this.face);
    this.glyphs = createAndShapeBuffer(ctx.hb, font, this.text, this.attrs).json();
  }

  measure(ci: number = this.text.length) {
    const g = this.glyphs;
    let w = 0;

    if (this.attrs.level % 2) {
      if (ci < 0) {
        ci += this.text.length;
        for (let i = 0; i < g.length && g[i].cl >= ci; i++) w += g[i].ax;
      } else {
        for (let i = g.length - 1; i >= 0 && g[i].cl < ci; i--) w += g[i].ax;
      }
    } else {
      if (ci < 0) {
        ci += this.text.length;
        for (let i = g.length - 1; i >= 0 && g[i].cl >= ci; i--) w += g[i].ax;
      } else {
        for (let i = 0; i < g.length && g[i].cl < ci; i++) w += g[i].ax;
      }
    }

    return w / this.face.upem * this.attrs.style.fontSize;
  }

  collapseWhitespace(at: 'start' | 'end') {
    // TODO: this is copied in Inline
    if (!this.attrs.style.whiteSpace.match(/^(normal|nowrap|pre-line)$/)) {
      return {collapsed: 0, stopped: true};
    }

    const level = at === 'start' ? this.attrs.level : this.attrs.level + 1;
    const glyphIterator = createGlyphIterator(this.glyphs, level % 2 ? 'rtl' : 'ltr');
    let collapsed = 0;

    for (let glyph = glyphIterator.next(); !glyph.done; glyph = glyphIterator.next()) {
      const cl = this.glyphs[glyph.value.start].cl;
      if (!isink(this.text[cl])) {
        const px = this.glyphs[glyph.value.start].ax / this.face.upem * this.attrs.style.fontSize;
        this.glyphs[glyph.value.start].ax = 0;
        collapsed += px;
      } else {
        return {collapsed, stopped: true};
      }
    }

    return {collapsed, stopped: false};
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

export function createAndShapeBuffer(hb: Harfbuzz, font: HbFont, text: string, attrs: ShapingAttrs) {
  const buf = hb.createBuffer();
  buf.setClusterLevel(1);
  buf.addText(text);
  buf.setDirection(attrs.level % 2 ? 'rtl' : 'ltr');
  buf.setScript(attrs.script);
  buf.setLanguage(langForScript(attrs.script)); // TODO support [lang]
  hb.shape(font, buf);
  return buf;
}

export async function shapeIfc(ifc: IfcInline, ctx: PreprocessContext) {
  const inlineIterator = createPreorderInlineIterator(ifc);
  const {hb, itemizer, fcfg} = ctx;
  const paragraph:ShapedItem[] = [];
  const colors:[Color, number][] = [[ifc.style.color, 0]];
  let inline = inlineIterator.next();
  let inlineEnd = 0;

  let log = '';
  log += `Preprocess ${ifc.id}\n`;
  log += '='.repeat(`Preprocess ${ifc.id}`.length) + '\n';
  log += `Full text: "${ifc.allText}"\n`;
  let lastItemIndex = 0;

  for (const {i: itemIndex, attrs} of shapingItemizer(ifc, itemizer)) {
    const start = lastItemIndex;
    const end = itemIndex;
    const cascade = getCascade(fcfg, attrs.style, attrs.script);
    const text = ifc.allText.slice(start, end);
    const shapeWork = [{offset: start, text}];

    log += `  Item ${lastItemIndex}..${itemIndex}:\n`;
    log += `  emoji=${attrs.isEmoji} level=${attrs.level} script=${attrs.script} `;
    log += `size=${attrs.style.fontSize} variant=${attrs.style.fontVariant}\n`;
    log += `  cascade=${cascade.matches.map(m => basename(m.file)).join(', ')}\n`;

    cascade: for (let i = 0; shapeWork.length && i < cascade.matches.length; ++i) {
      const match = cascade.matches[i].toCssMatch();
      const isLastMatch = i === cascade.matches.length - 1;
      const face = await getFace(hb, match.file, match.index);
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
          const [, lastOffset] = colors[colors.length - 1];
          if (lastOffset !== inline.value.start) {
            colors.push([inline.value.style.color, inline.value.start]);
          } else {
            colors[colors.length - 1][0] = inline.value.style.color;
          }

          inlineEnd += inline.value.text.length;
        }

        inline = inlineIterator.next();
      }

      while (shapeWork.length) {
        const {text, offset} = shapeWork.pop()!;
        const buf = createAndShapeBuffer(hb, font, text, attrs);
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
            ucClusterEnd = GraphemeBreaker.nextBreak(text, ucClusterEnd);
          }

          if (hbClusterEnd < text.length && mark === hbClusterEnd) {
            clusterNeedsReshape = hbIt.done ? /* impossible */ false : hbIt.value.needsReshape;
            hbIt = hbGlyphIterator.next();
            hbClusterEnd = hbIt.done ? text.length : shapedPart[hbIt.value.start].cl;
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
          const theseColors = shiftColors(colors, offset);

          for (const g of glyphs) g.cl -= cstart;
          paragraph.push(new ShapedItem(face, match, glyphs, offset, text, theseColors, {...attrs}));
          if (isLastMatch) {
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

  paragraph.sort((a, b) => a.offset - b.offset);
  if (ctx.logging.text.has(ifc.id)) {
    console.log(log.slice(0, -1));
    console.log();
  }

  return paragraph;
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

export class Linebox extends LineItemLinkedList {
  ascender: number;
  descender: number;
  startOffset: number;
  endOffset: number;
  width: number;
  dir: 'ltr' | 'rtl';
  trimStartFinished: boolean;
  inlineStart: number;

  constructor(dir: Linebox['dir'], start: number) {
    super();
    this.dir = dir;
    this.startOffset = this.endOffset = start;
    this.ascender = 0;
    this.descender = 0;
    this.width = 0;
    this.trimStartFinished = false;
    this.inlineStart = 0;
  }

  addLogical(candidates: LineCandidates, width: number, endOffset: number) {
    this.concat(candidates);
    this.width += width;
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
    if (!this.tail) throw new Error('Linebox is empty');
    return this.tail.value.end();
  }

  trimStart() {
    for (let n = this.head; n; n = n.next) {
      if (n.value instanceof ShapedShim) continue;
      const {collapsed, stopped} = n.value.collapseWhitespace('start');
      this.width -= collapsed;
      if (stopped) {
        this.trimStartFinished = true;
        return;
      }
    }
  }

  trimEnd() {
    for (let n = this.tail; n; n = n.previous) {
      if (n.value instanceof ShapedShim) continue;
      const {collapsed, stopped} = n.value.collapseWhitespace('end');
      this.width -= collapsed;
      if (stopped) return;
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

  postprocess(paragraphWidth: number, textAlign: 'left' | 'right' | 'center') {
    this.trimEnd();
    this.reorder();
    if (this.width < paragraphWidth) {
      if (textAlign === 'right' && this.dir === 'ltr' || textAlign === 'left' && this.dir === 'rtl') {
        this.inlineStart = paragraphWidth - this.width;
      } else if (textAlign === 'center') {
        this.inlineStart = (paragraphWidth - this.width) / 2;
      }
    }
  }
}

type IfcMark = {
  position: number,
  isBreak: boolean,
  isInk: boolean,
  isItemStart: boolean,
  isItemEnd: boolean,
  inlinePre: Inline | null,
  inlinePost: Inline | null,
  advance: number,
  itemIndex: number,
  split: (this: IfcMark, mark: IfcMark) => void
};

function isink(c: string) {
  return c !== ' ' && c !== '\t';
}

function createIfcMarkIterator(ifc: IfcInline) {
  // Inline iterator
  const inlineIterator = createInlineIterator(ifc);
  let inline = inlineIterator.next();
  let inlineMark = 0;
  // Break iterator
  const breakIterator = new LineBreak(ifc.allText);
  let breakPosition = -1;
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
  const end = ifc.allText.length;

  function next():{done: true} | {done: false, value: IfcMark} {
    const mark:IfcMark = {
      position: Math.min(inlineMark, itemMark, breakMark, inkMark),
      isBreak: false,
      isInk,
      isItemStart: false,
      isItemEnd: false,
      inlinePre: null,
      inlinePost: null,
      advance: 0,
      itemIndex,
      split
    };

    if (inline.done && breakPosition > end && itemIndex >= ifc.shaped.length) {
      return {done: true};
    }

    if (itemIndex < ifc.shaped.length && itemIndex > -1) {
      const item = ifc.shaped[itemIndex];
      const position = mark.position - item.offset;
      const [advance, nextGlyph] = measureWidth(item, glyphIterator, glyph, position);
      mark.advance = advance;
      glyph = nextGlyph;
    }

    if (inkMark === mark.position) {
      isInk = isink(ifc.allText[inkMark]);
      while (inkMark < ifc.allText.length && isInk === isink(ifc.allText[inkMark])) inkMark++;
    }

    if (itemIndex < ifc.shaped.length && itemMark === mark.position && !emittedItemEnd) {
      mark.isItemEnd = itemIndex > -1;
      emittedItemEnd = true;
    }

    // Consume the inline break opportunity if we're not on a break
    if (!inline.done && inline.value.state === 'breakop' && inlineMark === mark.position && (breakMark === 0 || breakMark !== mark.position)) {
      inline = inlineIterator.next();
    }

    // Consume pre[-text], post[-text], or pre-post[-text] before a break
    if (!inline.done && inline.value.state !== 'breakop' && inlineMark === mark.position) {
      if (inline.value.state === 'pre' || inline.value.state === 'post') {
        if (inline.value.state === 'pre') mark.inlinePre = inline.value.item;
        if (inline.value.state === 'post') mark.inlinePost = inline.value.item;
        inline = inlineIterator.next();
      }

      if (mark.inlinePre && !inline.done && inline.value.state === 'post') {
        mark.inlinePost = inline.value.item;
        inline = inlineIterator.next();
      }

      if (!inline.done && inline.value.state === 'text') {
        inlineMark += inline.value.item.text.length;
        inline = inlineIterator.next();
      }

      if (mark.inlinePre || mark.inlinePost) return {done: false, value: mark};
    }

    if (itemIndex < ifc.shaped.length && itemMark === mark.position && (inline.done || inlineMark !== mark.position)) {
      itemIndex += 1;

      if (itemIndex < ifc.shaped.length) {
        const item = ifc.shaped[itemIndex];
        itemMark += item.text.length;
        glyphIterator = createGlyphIterator(item.glyphs, item.attrs.level % 2 ? 'rtl' : 'ltr');
        glyph = glyphIterator.next();
        mark.isItemStart = true;
        mark.itemIndex += 1;
        emittedItemEnd = false;
      }
    }

    if (breakPosition > -1 && inkMark === mark.position) {
      inkMark = end + 1;
    }

    if (breakPosition <= end && breakMark === mark.position) {
      const bk = breakIterator.nextBreak();
      if (breakPosition > -1) mark.isBreak = true;
      if (bk) {
        breakPosition = breakMark = bk.position;
      } else {
        breakPosition = end + 1;
        breakMark = end;
      }
    }

    if (!inline.done && inlineMark === mark.position && inline.value.state === 'breakop') {
      inline = inlineIterator.next();
    }

    return {done: false, value: mark};
  }

  function split(this: IfcMark, mark: IfcMark) {
    itemIndex += 1;
    this.itemIndex += 1;
    mark.itemIndex += 1;

    const item = ifc.shaped[this.itemIndex];
    const rightGlyphIterator = createGlyphIterator(item.glyphs, item.attrs.level % 2 ? 'rtl' : 'ltr');
    const rightGlyph = rightGlyphIterator.next();
    const position = mark.position - item.offset;
    const [, nextGlyph] = measureWidth(item, rightGlyphIterator, rightGlyph, position);

    if (itemIndex === this.itemIndex) {
      glyphIterator = rightGlyphIterator;
      glyph = nextGlyph;
    }
  }

  return {next};
}

export function createLineboxes(ifc: IfcInline, ctx: LayoutContext) {
  if (!ifc.containingBlock) {
    throw new Error(`Cannot do text layout: ${ifc.id} has no containing block`);
  }

  const paragraphWidth = ifc.containingBlock.width === undefined ? Infinity : ifc.containingBlock.width;
  const candidates = new LineCandidates();
  const basedir = ifc.style.direction;
  const parents:Inline[] = [];
  let line = new Linebox(basedir, 0);
  let lastBreakMark:IfcMark | undefined;
  const lines = [line];
  let breakWidth = 0;
  let width = 0;
  let ws = 0;

  for (const mark of {[Symbol.iterator]: () => createIfcMarkIterator(ifc)}) {
    const item = ifc.shaped[mark.itemIndex];

    if (mark.isInk) {
      breakWidth += ws + mark.advance;
      ws = 0;
    } else {
      ws += mark.advance;
    }

    width += mark.advance;

    if (mark.inlinePre) parents.push(mark.inlinePre);

    if (mark.inlinePre || mark.inlinePost) {
      const p = basedir === 'ltr' ? 'leftMarginBorderPadding' : 'rightMarginBorderPadding';
      const op = basedir === 'ltr' ? 'rightMarginBorderPadding' : 'leftMarginBorderPadding';
      const w = mark.inlinePre?.[p] ?? 0 + (mark.inlinePost?.[op] ?? 0);

      if (!mark.isInk) {
        breakWidth += ws;
        ws = 0;
      }

      breakWidth += w;
      width += w;
    }

    if (mark.inlinePre && mark.inlinePost) {
      const [left, right] = [item, ifc.shaped[mark.itemIndex + 1]];
      let level: number = 0;
      // Treat the empty span as an Other Neutral (ON) according to UAX29. I
      // think that's what browsers are doing.
      if (left && !right /* beyond last item */) level = left.attrs.level;
      if (!left && right /* before first item */) level = right.attrs.level;
      // An ON should take on the embedding level if the left and right levels
      // are diferent, but there is no embedding level for the empty span since
      // it isn't a character. Taking the min should fit most scenarios.
      if (left && right) level = Math.min(left.attrs.level, right.attrs.level);
      if (!left && !right) throw new Error('Assertion failed');
      const attrs = {level, isEmoji: false, script: 'Latn', style: mark.inlinePre.style};
      const shiv = new ShapedShim(mark.position, parents.slice(), attrs);
      candidates.push(shiv);
      for (const p of parents) p.nshaped += 1;
    }

    if (mark.isBreak) {
      if (line.hasText() && line.width + breakWidth > paragraphWidth) {
        const lastLine = line;
        if (!lastBreakMark) throw new Error('Assertion failed');
        lines.push(line = new Linebox(basedir, lastBreakMark.position));
        const lastBreakMarkItem = ifc.shaped[lastBreakMark.itemIndex];
        if (lastBreakMarkItem && lastBreakMark.position > lastBreakMarkItem.offset && lastBreakMark.position < lastBreakMarkItem.end()) {
          ifc.split(lastBreakMark.itemIndex, lastBreakMark.position);
          lastBreakMark.split(mark);
          candidates.unshift(ifc.shaped[lastBreakMark.itemIndex]);
        }
        lastLine.postprocess(paragraphWidth, ifc.style.textAlign);
      }

      line.addLogical(candidates, width, mark.position);

      candidates.clear();
      breakWidth = 0;
      ws = 0;
      width = 0;
      lastBreakMark = mark;
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

  line.postprocess(paragraphWidth, ifc.style.textAlign);

  if (ctx.logging.text.has(ifc.id)) {
    console.log(`Paragraph ${ifc.id}:`);
    logParagraph(ifc.shaped);
    for (const [i, line] of lines.entries()) {
      let log = `Line ${i} (${line.width} width): `;
      for (let n = line.head; n; n = n.next) {
        log += n.value instanceof ShapedItem ? `“${n.value.text}” ` : '“”';
      }
      console.log(log);
    }
    console.log();
  }

  return lines;
}

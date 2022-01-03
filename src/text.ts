import {bsearch, loggableText} from './util';
import {Box} from './box';
import {Style, initialStyle, createComputedStyle} from './cascade';
import {IfcInline, Inline, InlineLevel, PreprocessContext, LayoutContext, createInlineIterator} from './flow';
import {getBuffer} from '../io';
import {Harfbuzz, HbFace, HbFont, HbGlyphInfo} from 'harfbuzzjs';
import {FontConfig, Cascade} from 'fontconfig';
import {Itemizer} from 'itemizer';
import GraphemeBreaker = require('grapheme-breaker');
import LineBreak = require('linebreak');

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
  dir: 'ltr' | 'rtl',
  script: string,
  style: Style
};

function* shapingItemizer(inline: IfcInline, itemizer: Itemizer) {
  const iEmoji = itemizer.emoji(inline.allText);
  const iBidi = itemizer.bidi(inline.allText);
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
    dir: bidi.value.dir,
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
    if (!bidi.done) ctx.dir = bidi.value.dir;
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
  let ii = i;

  function next() {
    const done = dir === 'ltr' ? i >= shaped.length : i < 0;

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
    const iii = ii;
    ii = i;
    if (dir === 'ltr') {
      return [iii, i];
    } else {
      return [i + 1, iii + 1];
    }
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

export class ShapedItem {
  face: HbFace;
  glyphs: HbGlyphInfo[];
  offset: number;
  text: string;
  attrs: ShapingAttrs;
  needsReshape: boolean;

  constructor(face: HbFace, glyphs: HbGlyphInfo[], offset: number, text: string, attrs: ShapingAttrs) {
    this.face = face;
    this.glyphs = glyphs;
    this.offset = offset;
    this.text = text;
    this.attrs = attrs;
    this.needsReshape = false;
  }

  split(offset: number) {
    const rightText = this.text.slice(offset);
    const rightOffset = this.offset + offset;
    const rightGlyphs = shiftGlyphs(this.glyphs, offset, this.attrs.dir);
    const right = new ShapedItem(this.face, rightGlyphs, rightOffset, rightText, this.attrs);
    const needsReshape = Boolean(rightGlyphs[0].flags & 1);

    this.needsReshape = needsReshape;
    right.needsReshape = needsReshape;

    this.text = this.text.slice(0, offset);

    return right;
  }

  reshape(ctx: LayoutContext) {
    const font = ctx.hb.createFont(this.face);
    this.glyphs = createAndShapeBuffer(ctx.hb, font, this.text, this.attrs).json();
  }

  collapseWhitespace(at: 'start' | 'end') {
    // TODO: this is copied in Inline
    if (!this.attrs.style.whiteSpace.match(/^(normal|nowrap|pre-line)$/)) {
      return {collapsed: 0, stopped: true};
    }

    const dir = at === 'start' ? this.attrs.dir : this.attrs.dir === 'ltr' ? 'rtl' : 'ltr';
    const glyphIterator = createGlyphIterator(this.glyphs, dir);
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
  buf.setDirection(attrs.dir);
  buf.setScript(attrs.script);
  buf.setLanguage(langForScript(attrs.script)); // TODO support [lang]
  hb.shape(font, buf);
  return buf;
}

export async function shapeIfc(inline: IfcInline, ctx: PreprocessContext) {
  const {hb, itemizer, fcfg} = ctx;
  const paragraph:ShapedItem[] = [];

  let log = '';
  log += `Preprocess ${inline.id}\n`;
  log += '='.repeat(`Preprocess ${inline.id}`.length) + '\n';
  log += `Full text: "${inline.allText}"\n`;
  let lastItemIndex = 0;

  for (const {i: itemIndex, attrs} of shapingItemizer(inline, itemizer)) {
    const start = lastItemIndex;
    const end = itemIndex;
    const cascade = getCascade(fcfg, attrs.style, attrs.script);
    const text = inline.allText.slice(start, end);
    const shapeWork = [{offset: start, text}];

    log += `  Item ${lastItemIndex}..${itemIndex}:\n`;
    log += `  emoji=${attrs.isEmoji} dir=${attrs.dir} script=${attrs.script} `;
    log += `size=${attrs.style.fontSize} variant=${attrs.style.fontVariant}\n`;
    log += `  cascade=${cascade.matches.map(m => basename(m.file)).join(', ')}\n`;

    cascade: for (let i = 0; shapeWork.length && i < cascade.matches.length; ++i) {
      const match = cascade.matches[i];
      const isLastMatch = i === cascade.matches.length - 1;
      const face = await getFace(hb, match.file, match.index);
      // TODO set size and such for hinting?
      const font = hb.createFont(face);
      // Allows to tack successive (re)shaping parts onto one larger item
      const parts:ShapingPart[] = [];

      while (shapeWork.length) {
        const {text, offset} = shapeWork.pop()!;
        const buf = createAndShapeBuffer(hb, font, text, attrs);
        const shapedPart = buf.json();
        let didPushPart = false;

        log += `    Shaping "${text}" with font ${match.file}\n`;
        log += '    Shaper returned: ' + logGlyphs(shapedPart) + '\n';

        // Grapheme cluster iterator
        let lastClusterIndex = 0;
        let clusterIndex = 0;
        // HB cluster iterator
        const hbGlyphIterator = createGlyphIterator(shapedPart, attrs.dir);
        let hbIt = hbGlyphIterator.next();
        let clusterNeedsReshape = false;

        do {
          const mark = Math.min(
            clusterIndex,
            hbIt.done ? Infinity : shapedPart[hbIt.value.start].cl
          );

          if (clusterIndex < text.length && mark === clusterIndex) {
            lastClusterIndex = clusterIndex;
            clusterIndex = GraphemeBreaker.nextBreak(text, clusterIndex);
            clusterNeedsReshape = false; // TODO this seems wrong if many clusters in hb cluster
          }

          if (!hbIt.done && mark === shapedPart[hbIt.value.start].cl) {
            hbIt = hbGlyphIterator.next();
            if (!hbIt.done && hbIt.value.needsReshape) clusterNeedsReshape = true;
          }

          const nextMark = Math.min(
            clusterIndex,
            hbIt.done ? Infinity : shapedPart[hbIt.value.start].cl
          );

          if (nextMark === clusterIndex) {
            const [glyphStart, glyphEnd] = hbGlyphIterator.pull();
            if (!didPushPart || clusterNeedsReshape !== parts[parts.length - 1].reshape) {
              parts.push({
                offset,
                cstart: lastClusterIndex,
                cend: clusterIndex,
                gstart: glyphStart,
                gend: glyphEnd,
                reshape: clusterNeedsReshape,
                text,
                glyphs: shapedPart
              });
              didPushPart = true;
            } else {
              parts[parts.length - 1].cend = clusterIndex;
              parts[parts.length - 1].gstart = Math.min(parts[parts.length - 1].gstart, glyphStart);
              parts[parts.length - 1].gend = Math.max(glyphEnd, parts[parts.length - 1].gend);
            }
          }
        } while (clusterIndex < text.length || !hbIt.done);
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
          for (const g of glyphs) g.cl -= cstart;
          paragraph.push(new ShapedItem(face, glyphs, offset, text, Object.assign({}, attrs)));
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
  if (ctx.logging.text.has(inline.id)) {
    console.log(log.slice(0, -1));
    console.log();
  }

  return paragraph;
}

type LineItem = {
  value: ShapedItem | number;
  next: LineItem | null;
  previous: LineItem | null;
};

class LineItemLinkedList {
  head: LineItem | null;
  tail: LineItem | null;
  firstShapedItem: ShapedItem | null;
  lastShapedItem: ShapedItem | null;

  constructor() {
    this.head = null;
    this.tail = null;
    this.firstShapedItem = null;
    this.lastShapedItem = null;
  }

  clear() {
    this.head = null;
    this.tail = null;
    this.firstShapedItem = null;
    this.lastShapedItem = null;
  }

  concat(items: LineItemLinkedList) {
    if (!items.head) return;

    if (!this.firstShapedItem) this.firstShapedItem = items.firstShapedItem;
    if (items.lastShapedItem) this.lastShapedItem = items.lastShapedItem;

    if (this.tail) {
      this.tail.next = items.head;
      items.head.previous = this.tail;
      this.tail = items.tail;
    } else {
      this.head = items.head;
      this.tail = items.tail;
    }
  }

  push(value: ShapedItem | number) {
    if (typeof value === 'object') {
      this.lastShapedItem = value;
      if (!this.firstShapedItem) this.firstShapedItem = value;
    }

    if (this.tail) {
      this.tail = this.tail.next = {value, next: null, previous: this.tail};
    } else {
      this.head = this.tail = {value, next: null, previous: null};
    }
  }

  unshift(value: ShapedItem | number) {
    if (typeof value === 'object') {
      this.firstShapedItem = value;
      if (!this.lastShapedItem) this.lastShapedItem = value;
    }

    const item = {value, next: this.head, previous: null};
    if (this.head) this.head.previous = item;
    this.head = item;
    if (!this.tail) this.tail = item;
  }
}

class LineCandidates extends LineItemLinkedList {};

export class Linebox extends LineItemLinkedList {
  ascender: number;
  descender: number;
  width: number;
  inkStart: LineItem | null;
  inkSeen: boolean;

  constructor() {
    super();
    this.ascender = 0;
    this.descender = 0;
    this.width = 0;
    this.inkStart = null;
    this.inkSeen = false;
  }

  add(candidates: LineCandidates, width: number) {
    let n = candidates.head;

    this.concat(candidates);
    this.width += width;

    while (!this.inkSeen && n) {
      this.inkStart = n;
      if (typeof n.value === 'number') {
        this.inkSeen = true;
      } else {
        const {collapsed, stopped} = n.value.collapseWhitespace('start');
        this.inkSeen = stopped;
        this.width -= collapsed;
      }

      n = n.next;
    }
  }

  hasText() {
    return this.firstShapedItem !== null;
  }

  hasAnything() {
    return this.head != null;
  }

  end() {
    if (!this.lastShapedItem) throw new Error('Linebox is empty');
    return this.lastShapedItem.offset + this.lastShapedItem.text.length;
  }

  postprocess(ctx: LayoutContext) {
    if (this.tail && typeof this.tail.value === 'object') {
      const tail = this.tail.value;

      // TODO reshaping could change the width, meaning the line width is now
      // wrong. Does the width change in practice? I'm not sure, but if it did,
      // some ink would overhang the paragraph's boundaries.
      if (tail.needsReshape) tail.reshape(ctx);
      if (this.inkStart && this.inkStart.value === tail) {
        const {collapsed} = tail.collapseWhitespace('start');
        this.width -= collapsed;
      }
    }

    for (let n = this.tail; n && this.inkStart && n !== this.inkStart.previous; n = n.previous) {
      if (typeof n.value === 'number') break;
      const {collapsed, stopped} = n.value.collapseWhitespace('end');
      this.width -= collapsed;
      if (stopped) break;
    }
  }
}

type IfcMark = {
  position: number,
  isBreak: boolean,
  isInk: boolean,
  isItemStart: boolean,
  isItemEnd: boolean,
  spans: number,
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
  let inlineLevel = 0;
  let spans = 0;

  function next():{done: true} | {done: false, value: IfcMark} {
    const mark:IfcMark = {
      position: Math.min(inlineMark, itemMark, breakMark, inkMark),
      isBreak: false,
      isInk: true,
      isItemStart: false,
      isItemEnd: false,
      spans: 0,
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

    mark.isInk = isInk;

    if (inkMark === mark.position) {
      isInk = isink(ifc.allText[inkMark]);
      while (inkMark < ifc.allText.length && isInk === isink(ifc.allText[inkMark])) inkMark++;
    }

    if (itemIndex < ifc.shaped.length && itemMark === mark.position && !emittedItemEnd) {
      mark.isItemEnd = itemIndex > -1;
      emittedItemEnd = true;
    }

    spans = 0;

    while (!inline.done && inlineMark === mark.position) {
      if (inline.value.state === 'text') {
        inlineMark += inline.value.item.text.length;
      }

      if (inline.value.state === 'pre') {
        spans += inline.value.item.leftMarginBorderPadding;
        inlineLevel += 1;
      }

      if (inline.value.state === 'post') {
        spans += inline.value.item.rightMarginBorderPadding;
        if (inlineLevel > 0) inlineLevel -= 1;
        if (inlineLevel === 0 && spans > 0) {
          mark.spans = spans;
          inline = inlineIterator.next();
          return {done: false, value: mark};
        }
      }

      inline = inlineIterator.next();
    }

    mark.spans = spans;

    if (itemIndex < ifc.shaped.length && itemMark === mark.position) {
      itemIndex += 1;

      if (itemIndex < ifc.shaped.length) {
        const item = ifc.shaped[itemIndex];
        itemMark += item.text.length;
        glyphIterator = createGlyphIterator(item.glyphs, item.attrs.dir);
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

    return {done: false, value: mark};
  }

  function split(this: IfcMark, mark: IfcMark) {
    itemIndex += 1;
    this.itemIndex += 1;
    mark.itemIndex += 1;

    const item = ifc.shaped[this.itemIndex];
    const rightGlyphIterator = createGlyphIterator(item.glyphs, item.attrs.dir);
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
  let line = new Linebox();
  let lastBreakMark:IfcMark | undefined;
  const lines = [line];
  let breakWidth = 0;
  let width = 0;
  let ws = 0;

  for (const mark of {[Symbol.iterator]: () => createIfcMarkIterator(ifc)}) {
    const item = ifc.shaped[mark.itemIndex];

    if (mark.isInk) {
      breakWidth += mark.advance;
    } else {
      ws += mark.advance;
    }

    width += mark.advance;

    if (mark.isBreak) {
      if (line.hasText() && line.width + breakWidth > paragraphWidth) {
        const lastLine = line;
        lines.push(line = new Linebox());
        if (!lastBreakMark) throw new Error('Assertion failed');
        if (!lastBreakMark.isItemStart) {
          ifc.split(lastBreakMark.itemIndex, lastBreakMark.position);
          lastBreakMark.split(mark);
          candidates.unshift(ifc.shaped[lastBreakMark.itemIndex]);
        }
        lastLine.postprocess(ctx);
      }

      line.add(candidates, width);

      candidates.clear();
      breakWidth = 0;
      ws = 0;
      width = 0;
      lastBreakMark = mark;
    }

    breakWidth += mark.spans;
    width += mark.spans;
    if (mark.spans > 0 || mark.isInk) breakWidth += ws, ws = 0;
    if (mark.spans > 0) candidates.push(mark.spans);
    if (mark.isItemStart) candidates.push(item);
  }

  line.postprocess(ctx);

  if (ctx.logging.text.has(ifc.id)) {
    console.log(`Paragraph ${ifc.id}:`);
    logParagraph(ifc.shaped);
    for (const [i, line] of lines.entries()) {
      let log = `Line ${i} (${line.width} width): `;
      for (let n = line.head; n; n = n.next) {
        log += typeof n.value === 'number' ? `${n.value} ` : `"${n.value.text}" `;
      }
      console.log(log);
    }
    console.log();
  }

  return lines;
}

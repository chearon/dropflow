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
import {LineBreakBreak} from 'linebreak';

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

function shapedItemForIndex(shaped: ShapedItem[], v: number) {
  // Optimization: often v is 0 or small
  if (v < shaped[0].text.length) return 0;

  let l = 0;
  let r = shaped.length - 1;

  while (true) {
    const mi = Math.floor((l + r) / 2);
    const mv = shaped[mi].offset + shaped[mi].text.length - 1;

    if (v === mv) {
      return mi;
    } else if (v > mv) {
      l = mi + 1;
      if (l > r) return Math.min(shaped.length - 1, l);
    } else {
      r = mi - 1;
      if (l > r) return l;
    }
  }
}

function runForIndex(runs: Run[], v: number) {
  let l = 0;
  let r = runs.length - 1;

  while (true) {
    const mi = Math.floor((l + r) / 2);
    const mv = runs[mi].end;

    if (v === mv) {
      return mi;
    } else if (v > mv) {
      l = mi + 1;
      if (l > r) return r;
    } else {
      r = mi - 1;
      if (l > r) return l;
    }
  }
}

function bumpOffsetPastCollapsedWhitespace(inline: IfcInline, offset: number) {
  const {runs, allText} = inline;
  const runi = runForIndex(runs, offset);
  if (runi < runs.length && runs[runi].wsCollapsible && allText[offset] === ' ') {
    return offset + 1;
  }
  return offset;
}

function getItemAndGlyphIteratorForOffset(shaped: ShapedItem[], offset: number) {
  const itemIndex = shapedItemForIndex(shaped, offset);
  const item = shaped[itemIndex];
  const g = item.glyphs;
  const glyphIterator = createGlyphIterator(g, item.attrs.dir);
  const index = offset - item.offset;
  let it = glyphIterator.next();

  while (!it.done && g[it.value.start].cl < index) it = glyphIterator.next();

  return {itemIndex, glyphIterator, it};
}

export function getLineContents(shaped: ShapedItem[], linebox: Linebox) {
  const startItemIndex = shapedItemForIndex(shaped, linebox.start);
  const endItemIndex = shapedItemForIndex(shaped, linebox.end);
  const startItem = shaped[startItemIndex];
  const endItem = shaped[endItemIndex];
  const startOffset = linebox.start - startItem.offset;
  const endOffset = linebox.end - endItem.offset;
  return {startItem: startItemIndex, startOffset, endItem: endItemIndex, endOffset};
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

  return {pull, next, [Symbol.iterator]: () => next};
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

export class ShapedItem {
  face: HbFace;
  glyphs: HbGlyphInfo[];
  offset: number;
  text: string;
  attrs: ShapingAttrs;
  ax: number;

  constructor(face: HbFace, glyphs: HbGlyphInfo[], offset: number, text: string, attrs: ShapingAttrs) {
    this.face = face;
    this.glyphs = glyphs;
    this.offset = offset;
    this.text = text;
    this.attrs = attrs;
    this.ax = 0;
  }

  split(i: number) {
    const text = this.text.slice(0, i);
    const offset = this.offset;
    const left = new ShapedItem(this.face, [], offset, text, this.attrs);

    left.ax = this.ax;

    this.text = this.text.slice(i);
    this.glyphs = [];
    this.offset += i;
    this.ax = 0;

    return left;
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

function createAndShapeBuffer(hb: Harfbuzz, font: HbFont, text: string, attrs: ShapingAttrs) {
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

function createWidthIterator(paragraph: ShapedItem[], start: number) {
  let {itemIndex, glyphIterator, it} = getItemAndGlyphIteratorForOffset(paragraph, start);
  let width = 0;
  let newItem = false;
  let resetWidth = false;

  return function advance(offset: number) {
    while (itemIndex < paragraph.length) {
      const item = paragraph[itemIndex];
      const isLastItem = itemIndex === paragraph.length - 1;
      let dw;

      if (newItem) {
        glyphIterator = createGlyphIterator(item.glyphs, item.attrs.dir);
        it = glyphIterator.next();
      }
      newItem = false;

      if (resetWidth) width = 0;
      resetWidth = false;

      [dw, it] = measureWidth(item, glyphIterator, it, offset - item.offset);
      width += dw;

      if (it.done) {
        newItem = true;
        itemIndex += 1;
      }

      if (!it.done || isLastItem) {
        const lastIteration = isLastItem && it.done;
        const clusterIndex = lastIteration ? 0 : paragraph[itemIndex].glyphs[it.value!.start].cl;
        resetWidth = true;
        return {itemIndex, clusterIndex, width};
      }
    }
  };
}

export class Linebox {
  width: number;
  ascender: number;
  descender: number;
  start: number;
  end: number;
  ax: number;

  constructor(offset: number = 0) {
    this.width = 0;
    this.ascender = 0;
    this.descender = 0;
    this.start = offset;
    this.end = offset;
    this.ax = 0;
  }

  extendTo(i: number) {
    this.end = i;
  }

  hasText() {
    return this.end > this.start;
  }
}

export function createLineboxes(ifc: IfcInline, ctx: LayoutContext) {
  const breakIterator = new LineBreak(ifc.allText);
  const inlineIterator = createInlineIterator(ifc);
  const inlineParents:Inline[] = [];
  let iit = inlineIterator.next();
  let inlineEnd = 0;
  let itemIndex = 0;
  let itemEnd = 0;
  const lineStart = bumpOffsetPastCollapsedWhitespace(ifc, 0);
  let widthIterator = createWidthIterator(ifc.shaped, lineStart);
  const lastBreak = {offset: lineStart, itemIndex: 0, pending: false, padding: 0};
  let bk:LineBreakBreak | undefined;
  let line = new Linebox(lineStart);
  const lines = [line];
  let ax = 0;
  /**
   * Since we visit everything until the break character, this remembers padding
   * before the break character that actually belongs to the _next_ break.
   */
  let bufferedPaddingWidth = 0;

  if (!ifc.containingBlock) {
    throw new Error(`Cannot do text layout: ${ifc.id} has no containing block`);
  }

  const paragraphWidth = ifc.containingBlock.width === undefined ? Infinity : ifc.containingBlock.width;

  while (bk = breakIterator.nextBreak()) {
    let offset = lastBreak.offset;
    let breakWidth = 0, width = 0, bkItemIndex, bkClusterIndex;
    let inkEnd = bk.position;
    let didStopAtInkEnd = false;

    while (ifc.allText[inkEnd - 1] === ' ' || ifc.allText[inkEnd - 1] === '\t') inkEnd -= 1;

    while (offset < bk.position) {
      const inkEndMark = didStopAtInkEnd ? Infinity : inkEnd;
      let textWidth, paddingWidth;

      offset = Math.min(inlineEnd, itemEnd, inkEndMark, bk.position);

      didStopAtInkEnd = offset === inkEnd;

      ({width: textWidth, itemIndex: bkItemIndex, clusterIndex: bkClusterIndex} = widthIterator(offset)!);

      ax += textWidth;
      if (offset <= inkEnd) breakWidth += textWidth;
      width += textWidth;

      breakWidth += bufferedPaddingWidth;
      width += bufferedPaddingWidth;
      bufferedPaddingWidth = 0;
      paddingWidth = 0;

      while (inlineEnd === offset && !iit.done) {
        if (iit.value.state === 'text') {
          const parent = inlineParents[inlineParents.length - 1];

          inlineEnd += iit.value.item.text.length;

          if (parent && parent.leftMarginBorderPadding > 0) {
            bufferedPaddingWidth = paddingWidth;
          } else {
            if (offset <= inkEnd) breakWidth += paddingWidth;
            width += paddingWidth;
          }

          ax += paddingWidth;
        }

        if (iit.value.state === 'pre') {
          const inline = iit.value.item;
          inlineParents.push(inline);
          paddingWidth += inline.leftMarginBorderPadding
        }

        if (iit.value.state === 'post') {
          const inline = iit.value.item;
          inlineParents.pop();
          paddingWidth += inline.rightMarginBorderPadding;
        }

        iit = inlineIterator.next();
      }

      if (itemEnd === offset && itemIndex < ifc.shaped.length) {
        ifc.shaped[itemIndex].ax = ax;
        itemEnd = ifc.shaped[itemIndex].offset + ifc.shaped[itemIndex].text.length;
        itemIndex += 1;
      }
    }

    if (bkItemIndex === undefined || bkClusterIndex === undefined) {
      throw new Error('assertion failed: expected to iterate some text in between breaks');
    }

    const wrap = line.hasText() && line.width + breakWidth > paragraphWidth;
    const pending = bkClusterIndex > 0;

    if (wrap && lastBreak.pending) {
      const hb = ctx.hb;
      const right = ifc.shaped[lastBreak.itemIndex];
      const left = right.split(lastBreak.offset - right.offset);
      const font = hb.createFont(right.face);

      ifc.shaped.splice(lastBreak.itemIndex, 0, left);
      lastBreak.itemIndex += 1;
      bkItemIndex += 1;
      itemIndex += 1;

      left.glyphs = createAndShapeBuffer(ctx.hb, font, left.text, left.attrs).json();
      right.glyphs = createAndShapeBuffer(ctx.hb, font, right.text, right.attrs).json();

      const lgi = createWidthIterator([left], left.offset);
      const lgii = lgi(left.offset + left.text.length);
      if (lgii === undefined) throw new Error('assertion fail');
      right.ax = left.ax + lgii.width;
      // TODO ax needs updating here
    }

    if (wrap) {
      lines.push(line = new Linebox(line.end));
      widthIterator = createWidthIterator(ifc.shaped, bk.position);
      line.ax = ifc.shaped[lastBreak.itemIndex].ax - lastBreak.padding;
    }

    line.extendTo(bk.position);
    line.width += width;

    lastBreak.offset = bk.position;
    lastBreak.itemIndex = bkItemIndex;
    lastBreak.pending = pending;
    lastBreak.padding = bufferedPaddingWidth;
  }

  if (ctx.logging.text.has(ifc.id)) {
    console.log(`Paragraph ${ifc.id}:`);
    logParagraph(ifc.shaped);
    for (const [i, line] of lines.entries()) {
      const range = getLineContents(ifc.shaped, line);
      const rangeText = `${range.startItem}@${range.startOffset} to ${range.endItem}@${range.endOffset}`;
      let log = `Line ${i} ax=${line.ax} (${rangeText}) (${line.width} width): `;
      log += ifc.allText.slice(line.start, line.end);
      console.log(log);
    }
    console.log();
  }

  return lines;
}

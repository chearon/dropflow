import {bsearch, loggableText} from './util';
import {Box} from './box';
import {Style, initialStyle, createComputedStyle} from './cascade';
import {IfcInline, PreprocessContext, LayoutContext} from './flow';
import {getBuffer} from '../io';
import {Harfbuzz, HbFace, HbGlyphInfo} from 'harfbuzzjs';
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

function glyphIndexForOffset(item: ShapedItem, offset: number) {
  let j = 1;

  while (j < item.glyphs.length) {
    if (item.glyphs[j].cl > offset) {
      return j - 1;
    } else {
      j += 1;
    }
  }

  return j - 1;
}

function bumpOffsetPastCollapsedWhitespace(inline: IfcInline, offset: number) {
  const {runs, allText} = inline;
  const runi = runForIndex(runs, offset);
  if (runi < runs.length && runs[runi].wsCollapsible && allText[offset] === ' ') {
    return offset + 1;
  }
  return offset;
}

function getItemAndGlyphIndexForOffset(shaped: ShapedItem[], offset: number) {
  const itemIndex = shapedItemForIndex(shaped, offset);
  const item = shaped[itemIndex];
  const glyphIndex = glyphIndexForOffset(item, offset - item.offset);
  return {itemIndex, glyphIndex};
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

function* styleItemizer(runs: Run[]) {
  if (runs.length) {
    let currentStyle = runs[0].style;
    let ci = runs[0].text.length;

    for (let i = 1; i < runs.length; ++i) {
      const run = runs[i];
      const style = run.style;

      if (
        currentStyle.fontSize !== style.fontSize ||
        currentStyle.fontVariant !== style.fontVariant ||
        currentStyle.fontWeight !== style.fontWeight ||
        currentStyle.fontFamily.join(',') !== style.fontFamily.join(',')
      ) {
        yield {i: ci, style: currentStyle};
        currentStyle = style;
      }
      ci += run.text.length;
    }

    yield {i: ci, style: currentStyle};
  }
}

type ShapingAttrs = {
  isEmoji: boolean,
  dir: 'ltr' | 'rtl',
  script: string,
  style: Style
};

function* shapingItemizer(itemizer: Itemizer, s: string, runs: Run[]) {
  const iEmoji = itemizer.emoji(s);
  const iBidi = itemizer.bidi(s);
  const iScript = itemizer.script(s);
  const iStyle = styleItemizer(runs);

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

function nextCluster(shaped: HbGlyphInfo[], i: number):[number, boolean] {
  const cl = shaped[i].cl;
  let needsReshape = false;
  while (i < shaped.length && shaped[i].cl === cl) {
    needsReshape = needsReshape || shaped[i].g === 0;
    i++;
  }
  return [i, needsReshape];
}

function measureWidth(item: ShapedItem, gi: number, ci: number) {
  let width = 0;
  let trailingWhitespaceWidth = 0;

  while (gi < item.glyphs.length) {
    if (item.glyphs[gi].cl < ci) {
      const firstClusterChar = item.text[item.glyphs[gi].cl];
      const glyphWidth = item.glyphs[gi++].ax / item.face.upem * item.attrs.style.fontSize;
      trailingWhitespaceWidth = firstClusterChar === ' ' || firstClusterChar === '\t' ? glyphWidth : 0;
      width += glyphWidth;
    } else {
      break;
    }
  }

  return [gi, width, trailingWhitespaceWidth];
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

  constructor(face: HbFace, glyphs: HbGlyphInfo[], offset: number, text: string, attrs: ShapingAttrs) {
    this.face = face;
    this.glyphs = glyphs;
    this.offset = offset;
    this.text = text;
    this.attrs = attrs;
  }

  split(i: number) {
    const text = this.text.slice(0, i);
    const offset = this.offset;
    this.text = this.text.slice(i);
    this.glyphs = [];
    this.offset += i;
    return new ShapedItem(this.face, [], offset, text, this.attrs);
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

export async function shapeIfc(inline: IfcInline, ctx: PreprocessContext) {
  const {hb, itemizer, fcfg} = ctx;
  const paragraph:ShapedItem[] = [];

  let log = '';
  log += `Preprocess ${inline.id}\n`;
  log += '='.repeat(`Preprocess ${inline.id}`.length) + '\n';
  log += `Full text: "${inline.allText}"\n`;
  let lastItemIndex = 0;

  for (const {i: itemIndex, attrs} of shapingItemizer(itemizer, inline.allText, inline.runs)) {
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
        const buf = hb.createBuffer();
        let didPushPart = false;

        buf.setClusterLevel(1);
        buf.addText(text);
        buf.guessSegmentProperties();
        hb.shape(font, buf);

        // HarfBuzz produces reversed clusters from RTL or BTT text
        if (buf.getDirection() === 5 || buf.getDirection() === 7) buf.reverse();

        const shapedPart = buf.json();

        log += `    Shaping "${text}" with font ${match.file}\n`;
        log += '    Shaper returned: ' + logGlyphs(shapedPart) + '\n';

        // Grapheme cluster iterator
        let lastClusterIndex = 0;
        let clusterIndex = 0;
        // HB cluster iterator
        let hbClusterIndex = 0;
        let hbLastClusterIndex = 0;
        let clusterNeedsReshape = false;

        do {
          const mark = Math.min(
            clusterIndex,
            hbClusterIndex < shapedPart.length ? shapedPart[hbClusterIndex].cl : Infinity
          );

          if (clusterIndex < text.length && mark === clusterIndex) {
            lastClusterIndex = clusterIndex;
            hbLastClusterIndex = hbClusterIndex;
            clusterIndex = GraphemeBreaker.nextBreak(text, clusterIndex);
            clusterNeedsReshape = false;
          }

          if (hbClusterIndex < shapedPart.length && mark === shapedPart[hbClusterIndex].cl) {
            let hbClusterNeedsReshape;
            [hbClusterIndex, hbClusterNeedsReshape] = nextCluster(shapedPart, hbClusterIndex);
            if (hbClusterNeedsReshape) clusterNeedsReshape = true;
          }

          const nextMark = Math.min(
            clusterIndex,
            hbClusterIndex < shapedPart.length ? shapedPart[hbClusterIndex].cl : Infinity
          );

          if (clusterIndex === nextMark) {
            if (!didPushPart || clusterNeedsReshape !== parts[parts.length - 1].reshape) {
              parts.push({
                offset,
                cstart: lastClusterIndex,
                cend: clusterIndex,
                gstart: hbLastClusterIndex,
                gend: hbClusterIndex,
                reshape: clusterNeedsReshape,
                text,
                glyphs: shapedPart
              });
              didPushPart = true;
            } else {
              parts[parts.length - 1].cend = clusterIndex;
              parts[parts.length - 1].gend = hbClusterIndex;
            }
          }
        } while (clusterIndex < text.length || hbClusterIndex < shapedPart.length);
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

export class Linebox {
  width: number;
  ascender: number;
  descender: number;
  start: number;
  end: number;

  constructor(offset: number = 0) {
    this.width = 0;
    this.ascender = 0;
    this.descender = 0;
    this.start = offset;
    this.end = offset;
  }

  extendTo(i: number) {
    this.end = i;
  }
}

export function createLineboxes(inline: IfcInline, ctx: LayoutContext) {
  const breaker = new LineBreak(inline.allText);
  const hb = ctx.hb;
  const lineStart = bumpOffsetPastCollapsedWhitespace(inline, 0);
  let {itemIndex, glyphIndex} = getItemAndGlyphIndexForOffset(inline.shaped, lineStart);
  const lastBreak = {offset: lineStart, itemIndex, pending: false};
  let bk:LineBreakBreak | undefined;
  let line = new Linebox(lineStart);
  const lines = [line];

  if (!inline.containingBlock) {
    throw new Error(`Cannot do text layout: ${inline.id} has no containing block`);
  }

  const paragraphWidth = inline.containingBlock.width === undefined ? Infinity : inline.containingBlock.width;

  while (bk = breaker.nextBreak()) {
    let width = 0, tw = 0;

    while (itemIndex < inline.shaped.length) {
      const item = inline.shaped[itemIndex];
      const breakIndex = bk.position - item.offset;
      let dw;
      [glyphIndex, dw, tw] = measureWidth(item, glyphIndex, breakIndex);
      width += dw;

      if (glyphIndex < item.glyphs.length) {
        break; // next break, same item
      } else {
        glyphIndex = 0; // same break, new item
        itemIndex += 1;
      }
    }

    const wrap = line.width > 0 && line.width + width - tw > paragraphWidth;
    const pending = glyphIndex > 0;

    if (wrap && lastBreak.pending) {
      const right = inline.shaped[lastBreak.itemIndex];
      const left = right.split(lastBreak.offset - right.offset);

      inline.shaped.splice(lastBreak.itemIndex, 0, left);

      const leftFont = hb.createFont(left.face);
      const leftBuf = hb.createBuffer();

      leftBuf.setClusterLevel(1);
      leftBuf.addText(left.text);
      leftBuf.guessSegmentProperties();

      const rightFont = hb.createFont(right.face);
      const rightBuf = hb.createBuffer();

      rightBuf.setClusterLevel(1);
      rightBuf.addText(right.text);
      rightBuf.guessSegmentProperties();

      hb.shape(leftFont, leftBuf);
      hb.shape(rightFont, rightBuf);

      // HarfBuzz produces reversed clusters from RTL or BTT text
      if (leftBuf.getDirection() === 5 || leftBuf.getDirection() === 7) leftBuf.reverse();
      if (rightBuf.getDirection() === 5 || rightBuf.getDirection() === 7) rightBuf.reverse();

      left.glyphs = leftBuf.json();
      right.glyphs = rightBuf.json();
    }

    if (wrap) {
      const lineStart = bumpOffsetPastCollapsedWhitespace(inline, line.end);
      ({itemIndex, glyphIndex} = getItemAndGlyphIndexForOffset(inline.shaped, bk.position));
      lines.push(line = new Linebox(lineStart));
    }

    line.extendTo(bk.position);
    line.width += width;

    lastBreak.offset = bk.position;
    lastBreak.itemIndex = itemIndex;
    lastBreak.pending = pending;
  }

  if (ctx.logging.text.has(inline.id)) {
    console.log(`Paragraph ${inline.id}:`);
    logParagraph(inline.shaped);
    for (const [i, line] of lines.entries()) {
      const range = getLineContents(inline.shaped, line);
      const rangeText = `${range.startItem}@${range.startOffset} to ${range.endItem}@${range.endOffset}`;
      let log = `Line ${i} (${rangeText}) (${line.width} width): `;
      log += inline.allText.slice(line.start, line.end);
      console.log(log);
    }
    console.log();
  }

  return lines;
}

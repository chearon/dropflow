import type {Color} from '../cascade.js';
import type {PaintBackend} from './paint.js';
import type {FontConfigCssMatch} from 'fontconfig';
import type {CanvasRenderingContext2D} from 'canvas';
import type {ShapedItem} from '../text.js';
import type {HbGlyphInfo} from 'harfbuzzjs';
import {nextGraphemeBreak, previousGraphemeBreak} from '../unicode/graphemeBreak.js';
import {openSync as openFontSync} from 'fontkit';

function graphemeBoundaries(text: string, index: number) {
  const graphemeEnd = nextGraphemeBreak(text, index);
  const graphemeStart = previousGraphemeBreak(text, graphemeEnd);
  return {graphemeStart, graphemeEnd};
}

function nextGrapheme(text: string, index: number) {
  const {graphemeStart, graphemeEnd} = graphemeBoundaries(text, index);
  return graphemeStart < index ? graphemeEnd : index;
}

function prevGrapheme(text: string, index: number) {
  const {graphemeStart} = graphemeBoundaries(text, index);
  return graphemeStart < index ? graphemeStart : index;
}

function nextCluster(glyphs: HbGlyphInfo[], index: number) {
  const cl = glyphs[index].cl;
  while (++index < glyphs.length && cl == glyphs[index].cl)
    ;
  return index;
}

function prevCluster(glyphs: HbGlyphInfo[], index: number) {
  const cl = glyphs[index].cl;
  while (--index >= 0 && cl == glyphs[index].cl)
    ;
  return index;
}

function findGlyph(item: ShapedItem, offset: number) {
  let index = item.attrs.level & 1 ? item.glyphs.length - 1 : 0;
  while (index >= 0 && index < item.glyphs.length && item.glyphs[index].cl < offset) {
    index += item.attrs.level & 1 ? -1 : 1;
  }
  return index;
}

function glyphsWidth(item: ShapedItem, glyphStart: number, glyphEnd: number) {
  let ax = 0;
  for (let i = glyphStart; i < glyphEnd; ++i) ax += item.glyphs[i].ax;
  return ax / item.face.upem * item.attrs.style.fontSize;
}

// Solve for:
// textStart..textEnd: largest safe-boundaried string inside totalTextStart..totalTextEnd
// startGlyphStart...startGlyphEnd: chain of glyphs inside totalTextStart..textStart
// endGlyphStart...endGlyphEnd: chain of glyphs inside textEnd...totalTextEnd
// TODO not well tested. this took me days to figure out
function fastGlyphBoundaries(item: ShapedItem, totalTextStart: number, totalTextEnd: number) {
  const glyphs = item.glyphs;
  let startGlyphStart = findGlyph(item, totalTextStart);
  let endGlyphEnd = findGlyph(item, totalTextEnd); // TODO findGlyphFromEnd?
  let textStart = nextGrapheme(item.paragraph.string, totalTextStart);
  let startGlyphEnd = findGlyph(item, textStart);
  let textEnd = Math.max(textStart, prevGrapheme(item.paragraph.string, totalTextEnd));
  let endGlyphStart = findGlyph(item, textEnd);

  if (item.attrs.level & 1) {
    while (startGlyphEnd > endGlyphStart && glyphs[startGlyphEnd]?.flags & 1) {
      startGlyphEnd = prevCluster(glyphs, startGlyphEnd);
    }
    textStart = glyphs[startGlyphEnd]?.cl ?? textEnd;

    while (endGlyphStart < startGlyphEnd && glyphs[endGlyphStart]?.flags & 1) {
      endGlyphStart = nextCluster(glyphs, endGlyphStart);
    }
    textEnd = glyphs[endGlyphStart]?.cl ?? textEnd;
  } else {
    while (startGlyphEnd < endGlyphStart && glyphs[startGlyphEnd]?.flags & 1) {
      startGlyphEnd = nextCluster(glyphs, startGlyphEnd);
    }
    textStart = glyphs[startGlyphEnd]?.cl ?? textEnd;

    while (endGlyphStart > startGlyphEnd && glyphs[endGlyphStart]?.flags & 1) {
      endGlyphStart = prevCluster(glyphs, endGlyphStart);
    }
    textEnd = glyphs[endGlyphStart]?.cl ?? textEnd;
  }

  if (item.attrs.level & 1) {
    [startGlyphStart, startGlyphEnd] = [startGlyphEnd + 1, startGlyphStart + 1];
    [endGlyphStart, endGlyphEnd] = [endGlyphEnd + 1, endGlyphStart + 1];
  }

  return {startGlyphStart, startGlyphEnd, textStart, textEnd, endGlyphStart, endGlyphEnd};
}

const fonts = new Map<string, any>();

function getFont(match: FontConfigCssMatch) {
  let font = fonts.get(match.file);
  if (!font) {
    font = openFontSync(match.file);
    fonts.set(match.file, font);
  }
  return font;
}

export default class CanvasPaintBackend implements PaintBackend {
  fillColor: Color;
  strokeColor: Color;
  lineWidth: number;
  direction: 'ltr' | 'rtl';
  font: FontConfigCssMatch;
  fontSize: number;
  ctx: CanvasRenderingContext2D;

  constructor(ctx: CanvasRenderingContext2D) {
    this.fillColor = {r: 0, g: 0, b: 0, a: 0};
    this.strokeColor = {r: 0, g: 0, b: 0, a: 0};
    this.lineWidth = 0;
    this.direction = 'ltr';
    this.font = {file: '', index: 0, family: '', weight: '', width: '', style: ''};
    this.fontSize = 8;
    this.ctx = ctx;
  }

  // TODO: pass in amount of each side that's shared with another border so they can divide
  // TODO: pass in border-radius
  edge(x: number, y: number, length: number, side: 'top' | 'right' | 'bottom' | 'left') {
    const {r, g, b, a} = this.strokeColor;
    this.ctx.beginPath();
    this.ctx.strokeStyle = `rgba(${r}, ${g}, ${b}, ${a})`;
    this.ctx.lineWidth = this.lineWidth;
    this.ctx.moveTo(x, y);
    this.ctx.lineTo(side === 'top' || side === 'bottom' ? x + length : x, side === 'left' || side === 'right' ? y + length : y);
    this.ctx.stroke();
  }

  fastText(x: number, y: number, text: string) {
    const {r, g, b, a} = this.fillColor;
    const m = this.font;
    this.ctx.save();
    // TODO: PR to node-canvas to make this the default. I see no issues with
    // drawing glyphs, and it's way way way faster, and the correct way to do it
    this.ctx.textDrawingMode = 'glyph';
    this.ctx.font = `${m.style} ${m.weight} ${m.width} ${this.fontSize}px ${m.family}`;
    this.ctx.fillStyle = `rgba(${r}, ${g}, ${b}, ${a})`;
    this.ctx.fillText(text, x, y);
    this.ctx.restore();
  }

  correctText(x: number, y: number, item: ShapedItem, glyphStart: number, glyphEnd: number) {
    const {r, g, b, a} = this.fillColor;
    const font = getFont(item.match);
    const scale = 1 / font.unitsPerEm * this.fontSize;

    let sx = 0;
    let sy = 0;

    this.ctx.save();
    this.ctx.translate(x, y);
    this.ctx.scale(1, -1);
    this.ctx.beginPath();
    this.ctx.fillStyle = `rgba(${r}, ${g}, ${b}, ${a})`;
    for (let i = glyphStart; i < glyphEnd; ++i) {
      const glyph = item.glyphs[i];
      this.ctx.save();
      this.ctx.translate((sx + glyph.dx) * scale, (sy + glyph.dy) * scale);
      const fg = font.getGlyph(glyph.g);
      if (fg) {
        this.ctx.scale(scale, scale);
        fg.path.toFunction()(this.ctx);
      }
      this.ctx.restore();
      sx += glyph.ax;
      sy += glyph.ay;
    }
    this.ctx.fill();
    this.ctx.restore();
  }

  text(x: number, y: number, item: ShapedItem, totalTextStart: number, totalTextEnd: number) {
    const {
      startGlyphStart,
      startGlyphEnd,
      textStart,
      textEnd,
      endGlyphStart,
      endGlyphEnd
    } = fastGlyphBoundaries(item, totalTextStart, totalTextEnd);

    if (item.attrs.level & 1) {
      if (endGlyphStart !== endGlyphEnd) {
        this.correctText(x, y, item, endGlyphStart, endGlyphEnd);
        x += glyphsWidth(item, endGlyphStart, endGlyphEnd);
      }

      if (textStart !== textEnd) {
        this.fastText(x, y, item.paragraph.slice(textStart, textEnd));
        x += glyphsWidth(item, startGlyphEnd, endGlyphStart);
      }

      if (startGlyphStart !== startGlyphEnd) {
        this.correctText(x, y, item, startGlyphStart, startGlyphEnd);
      }
    } else {
      if (startGlyphStart !== startGlyphEnd) {
        this.correctText(x, y, item, startGlyphStart, startGlyphEnd);
        x += glyphsWidth(item, startGlyphStart, startGlyphEnd);
      }

      if (textStart !== textEnd) {
        this.fastText(x, y, item.paragraph.slice(textStart, textEnd));
        x += glyphsWidth(item, startGlyphEnd, endGlyphStart);
      }

      if (endGlyphStart !== endGlyphEnd) {
        this.correctText(x, y, item, endGlyphStart, endGlyphEnd);
      }
    }
  }

  rect(x: number, y: number, w: number, h: number) {
    const {r, g, b, a} = this.fillColor;
    this.ctx.beginPath();
    this.ctx.fillStyle = `rgba(${r}, ${g}, ${b}, ${a})`;
    this.ctx.fillRect(x, y, w, h);
  }
}

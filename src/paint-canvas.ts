import {firstCascadeItem} from './text-font.js';
import {
  prevCluster,
  nextCluster,
  nextGrapheme,
  prevGrapheme
} from './layout-text.js';

import type {Color} from './style.js';
import type {PaintBackend} from './paint.js';
import type {CanvasRenderingContext2D as NodeCanvasRenderingContext2D} from 'canvas';
import type {ShapedItem} from './layout-text.js';
import type {FaceMatch} from './text-font.js';

// This is used in the public API to say what kind of canvas context we can
// take. If the browser ever took a wider type than node-canvas, we would be in
// trouble, but for now, the browser context is assignable to this subset of
// node-canvas.
//
// TODO: PR to node-canvas to add this
//
// This would ideally be BrowserContext | NodeContext but there's no way to
// reference browser types without polluting the global namespace. What we need
// is different possible environment support in typescript.
// https://gist.github.com/RyanCavanaugh/702ebd1ca2fc060e58e634b4e30c1c1c
//
// (see also note in backend-browser.ts)
export type CanvasRenderingContext2D = Pick<NodeCanvasRenderingContext2D,
  | 'moveTo'
  | 'lineTo'
  | 'quadraticCurveTo'
  | 'bezierCurveTo'
  | 'fillRect'
  | 'fillText'
  | 'translate'
  | 'scale'
  | 'stroke'
  | 'fill'
  | 'beginPath'
  | 'closePath'
  | 'save'
  | 'restore'
  | 'strokeStyle'
  | 'fillStyle'
  | 'lineWidth'
  | 'font'
  | 'rect'
  | 'clip'
>;

export interface Canvas {
  getContext(ctx: '2d'): CanvasRenderingContext2D;
  width: number;
  height: number;
}

function findGlyph(item: ShapedItem, offset: number) {
  let index = item.attrs.level & 1 ? item.glyphs.glyphLength - 1 : 0;
  while (index >= 0 && index < item.glyphs.glyphLength && item.glyphs.cl(index) < offset) {
    index += item.attrs.level & 1 ? -1 : 1;
  }
  return index;
}

function glyphsWidth(item: ShapedItem, glyphStart: number, glyphEnd: number) {
  let ax = 0;
  for (let i = glyphStart; i < glyphEnd; i++) ax += item.glyphs.ad(i);
  return ax / item.match.face.upem * item.attrs.style.fontSize;
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
    while (startGlyphEnd > endGlyphStart && glyphs.unsafeToBreak(startGlyphEnd)) {
      startGlyphEnd = prevCluster(glyphs, startGlyphEnd);
    }
    textStart = glyphs.cl(startGlyphEnd) ?? textEnd;

    while (endGlyphStart < startGlyphEnd && glyphs.unsafeToBreak(endGlyphStart)) {
      endGlyphStart = nextCluster(glyphs, endGlyphStart);
    }
    textEnd = glyphs.cl(endGlyphStart) ?? textEnd;
  } else {
    while (startGlyphEnd < endGlyphStart && glyphs.unsafeToBreak(startGlyphEnd)) {
      startGlyphEnd = nextCluster(glyphs, startGlyphEnd);
    }
    textStart = glyphs.cl(startGlyphEnd) ?? textEnd;

    while (endGlyphStart > startGlyphEnd && glyphs.unsafeToBreak(endGlyphStart)) {
      endGlyphStart = prevCluster(glyphs, endGlyphStart);
    }
    textEnd = glyphs.cl(endGlyphStart) ?? textEnd;
  }

  if (item.attrs.level & 1) {
    [startGlyphStart, startGlyphEnd] = [startGlyphEnd + 1, startGlyphStart + 1];
    [endGlyphStart, endGlyphEnd] = [endGlyphEnd + 1, endGlyphStart + 1];
  }

  return {startGlyphStart, startGlyphEnd, textStart, textEnd, endGlyphStart, endGlyphEnd};
}

export default class CanvasPaintBackend implements PaintBackend {
  fillColor: Color;
  strokeColor: Color;
  lineWidth: number;
  direction: 'ltr' | 'rtl';
  font: FaceMatch;
  fontSize: number;
  ctx: CanvasRenderingContext2D;

  constructor(ctx: CanvasRenderingContext2D) {
    this.fillColor = {r: 0, g: 0, b: 0, a: 0};
    this.strokeColor = {r: 0, g: 0, b: 0, a: 0};
    this.lineWidth = 0;
    this.direction = 'ltr';
    this.font = firstCascadeItem();
    this.fontSize = 8;
    this.ctx = ctx;
  }

  // TODO: pass in amount of each side that's shared with another border so they can divide
  // TODO: pass in border-radius
  edge(x: number, y: number, length: number, side: 'top' | 'right' | 'bottom' | 'left') {
    const {r, g, b, a} = this.strokeColor;
    const lw2 = this.lineWidth/2;
    const rx = Math.round(x - lw2) + lw2;
    const ry = Math.round(y - lw2) + lw2;
    this.ctx.beginPath();
    this.ctx.strokeStyle = `rgba(${r}, ${g}, ${b}, ${a})`;
    this.ctx.lineWidth = this.lineWidth;
    this.ctx.moveTo(
      side === 'left' || side === 'right' ? rx : Math.round(x),
      side === 'top' || side === 'bottom' ? ry : Math.round(y)
    );
    this.ctx.lineTo(
      side === 'top' || side === 'bottom' ? Math.round(x + length) : rx,
      side === 'left' || side === 'right' ? Math.round(y + length) : ry
    );
    this.ctx.stroke();
  }

  fastText(x: number, y: number, text: string) {
    const {r, g, b, a} = this.fillColor;
    this.ctx.save();
    // TODO: PR to node-canvas to make this the default. I see no issues with
    // drawing glyphs, and it's way way way faster, and the correct way to do it
    if ('textDrawingMode' in this.ctx) {
      this.ctx.textDrawingMode = 'glyph';
    }
    this.ctx.font = this.font.toFontString(this.fontSize);
    this.ctx.fillStyle = `rgba(${r}, ${g}, ${b}, ${a})`;
    this.ctx.fillText(text, x, y);
    this.ctx.restore();
  }

  correctText(x: number, y: number, item: ShapedItem, glyphStart: number, glyphEnd: number) {
    const {r, g, b, a} = this.fillColor;
    const scale = 1 / item.match.face.upem * this.fontSize;

    let sx = 0;
    let sy = 0;

    this.ctx.save();
    this.ctx.translate(x, y);
    this.ctx.scale(scale, -scale);
    this.ctx.beginPath();
    this.ctx.fillStyle = `rgba(${r}, ${g}, ${b}, ${a})`;
    for (let i = glyphStart; i < glyphEnd; i++) {
      const x = sx + item.glyphs.dx(i);
      const y = sy + item.glyphs.dy(i);
      this.ctx.translate(x, y);
      item.match.font.drawGlyph(item.glyphs.id(i), this.ctx);
      this.ctx.translate(-x, -y);
      sx += item.glyphs.ad(i);
      // TODO: vertical text
    }
    this.ctx.fill();
    this.ctx.restore();
  }

  text(x: number, y: number, item: ShapedItem, totalTextStart: number, totalTextEnd: number, isColorBoundary: boolean) {
    if (isColorBoundary) {
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
    } else {
      this.fastText(x, y, item.paragraph.slice(totalTextStart, totalTextEnd));
    }
  }

  rect(x: number, y: number, w: number, h: number) {
    const {r, g, b, a} = this.fillColor;
    const rx = Math.round(x);
    const ry = Math.round(y);
    const right = Math.round(x + w);
    const bottom = Math.round(y + h);
    const rw = right - rx;
    const rh = bottom - ry;
    this.ctx.beginPath();
    this.ctx.fillStyle = `rgba(${r}, ${g}, ${b}, ${a})`;
    this.ctx.fillRect(rx, ry, rw, rh);
  }

  pushClip(x: number, y: number, w: number, h: number) {
    this.ctx.save();
    this.ctx.beginPath();
    this.ctx.rect(x, y, w, h);
    this.ctx.clip();
  }

  popClip() {
    this.ctx.restore();
  }
}

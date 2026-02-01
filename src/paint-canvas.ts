import {
  prevCluster,
  nextCluster,
  nextGrapheme,
  prevGrapheme
} from './layout-text.ts';
import {G_ID, G_CL, G_AX, G_AY, G_DX, G_DY, G_FL, G_SZ} from './text-harfbuzz.ts';

import type {Color} from './style.ts';
import type {PaintBackend} from './paint.ts';
import type {ShapedItem} from './layout-text.ts';
import type {LoadedFontFace} from './text-font.ts';
import type {Image} from './layout-image.ts';
import type {Layout} from './layout-box.ts';

// This is used in the public API to ensure the external context has the right
// API (there are four known to dropflow: node-canvas, @napi-rs/canvas,
// skia-canvas, and the browser canvas)
export interface CanvasRenderingContext2D {
  moveTo(x: number, y: number): void;
  lineTo(x: number, y: number): void;
  quadraticCurveTo(cpx: number, cpy: number, x: number, y: number): void;
  bezierCurveTo(cp1x: number, cp1y: number, cp2x: number, cp2y: number, x: number, y: number): void;
  fillRect(x: number, y: number, w: number, h: number): void;
  fillText(text: string, x: number, y: number, maxWidth?: number): void;
  translate(x: number, y: number): void;
  scale(x: number, y: number): void;
  stroke(): void;
  fill(): void;
  beginPath(): void;
  closePath(): void;
  save(): void;
  restore(): void;
  // strokeStyle and fillStyle could be objects (eg CanvasGradient) whose
  // interfaces could be different depending on if the backend is skia-canvas,
  // canvas, @napi-rs/canvas, or browser canvas, so their type is unknown by
  // the render code. Thankfully we never need to check them, so the purpose
  // here is only to make the various CanvasRenderingContext2D implementations
  // all assignable to this shape
  set strokeStyle(value: string);
  get strokeStyle(): unknown;
  set fillStyle(value: string);
  get fillStyle(): unknown;
  lineWidth: number;
  font: string;
  set direction(value: 'ltr' | 'rtl'); // node-canvas has no concept of inherit
  get direction(): unknown; // no use so far
  set textAlign(value: 'left'); // only use 'left' so far
  get textAlign(): unknown; // no use so far
  rect(x: number, y: number, w: number, h: number): void;
  clip(): void;
  drawImage(image: unknown, x: number, y: number, w?: number, h?: number): void;
}

export interface Canvas {
  getContext(ctx: '2d'): CanvasRenderingContext2D;
  width: number;
  height: number;
}

function findGlyph(item: ShapedItem, offset: number) {
  let index = item.attrs.level & 1 ? item.glyphs.length - G_SZ : 0;
  while (index >= 0 && index < item.glyphs.length && item.glyphs[index + G_CL] < offset) {
    index += item.attrs.level & 1 ? -G_SZ : G_SZ;
  }
  return index;
}

function glyphsWidth(item: ShapedItem, glyphStart: number, glyphEnd: number) {
  let ax = 0;
  for (let i = glyphStart; i < glyphEnd; i += G_SZ) ax += item.glyphs[i + G_AX];
  return ax / item.face.hbface.upem * item.attrs.style.fontSize;
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
  let textStart = nextGrapheme(item.ifc.text, totalTextStart);
  let startGlyphEnd = findGlyph(item, textStart);
  let textEnd = Math.max(textStart, prevGrapheme(item.ifc.text, totalTextEnd));
  let endGlyphStart = findGlyph(item, textEnd);

  if (item.attrs.level & 1) {
    while (startGlyphEnd > endGlyphStart && glyphs[startGlyphEnd + G_FL] & 1) {
      startGlyphEnd = prevCluster(glyphs, startGlyphEnd);
    }
    textStart = glyphs[startGlyphEnd + G_CL] ?? textEnd;

    while (endGlyphStart < startGlyphEnd && glyphs[endGlyphStart + G_FL] & 1) {
      endGlyphStart = nextCluster(glyphs, endGlyphStart);
    }
    textEnd = glyphs[endGlyphStart + G_CL] ?? textEnd;
  } else {
    while (startGlyphEnd < endGlyphStart && glyphs[startGlyphEnd + G_FL] & 1) {
      startGlyphEnd = nextCluster(glyphs, startGlyphEnd);
    }
    textStart = glyphs[startGlyphEnd + G_CL] ?? textEnd;

    while (endGlyphStart > startGlyphEnd && glyphs[endGlyphStart + G_FL] & 1) {
      endGlyphStart = prevCluster(glyphs, endGlyphStart);
    }
    textEnd = glyphs[endGlyphStart + G_CL] ?? textEnd;
  }

  if (item.attrs.level & 1) {
    [startGlyphStart, startGlyphEnd] = [startGlyphEnd + G_SZ, startGlyphStart + G_SZ];
    [endGlyphStart, endGlyphEnd] = [endGlyphEnd + G_SZ, endGlyphStart + G_SZ];
  }

  return {startGlyphStart, startGlyphEnd, textStart, textEnd, endGlyphStart, endGlyphEnd};
}

export default class CanvasPaintBackend implements PaintBackend {
  fillColor: Color;
  strokeColor: Color;
  lineWidth: number;
  direction: 'ltr' | 'rtl';
  font: LoadedFontFace | undefined;
  fontSize: number;
  ctx: CanvasRenderingContext2D;
  layout: Layout;

  constructor(ctx: CanvasRenderingContext2D, layout: Layout) {
    this.fillColor = {r: 0, g: 0, b: 0, a: 0};
    this.strokeColor = {r: 0, g: 0, b: 0, a: 0};
    this.lineWidth = 0;
    this.direction = 'ltr';
    this.font = undefined;
    this.fontSize = 8;
    this.ctx = ctx;
    this.layout = layout;
  }

  // TODO: pass in amount of each side that's shared with another border so they can divide
  // TODO: pass in border-radius
  edge(x: number, y: number, length: number, side: 'top' | 'right' | 'bottom' | 'left') {
    const {r, g, b, a} = this.strokeColor;
    this.ctx.beginPath();
    this.ctx.strokeStyle = `rgba(${r}, ${g}, ${b}, ${a})`;
    this.ctx.lineWidth = this.lineWidth;
    this.ctx.moveTo(x, y);
    this.ctx.lineTo(
      side === 'top' || side === 'bottom' ? x + length : x,
      side === 'left' || side === 'right' ? y + length : y
    );
    this.ctx.stroke();
  }

  fastText(x: number, y: number, item: ShapedItem, textStart: number, textEnd: number) {
    const {r, g, b, a} = this.fillColor;
    this.ctx.save();
    this.ctx.direction = item.attrs.level & 1 ? 'rtl' : 'ltr';
    this.ctx.textAlign = 'left';
    // TODO: PR to node-canvas to make this the default. I see no issues with
    // drawing glyphs, and it's way way way faster, and the correct way to do it
    if ('textDrawingMode' in this.ctx) {
      this.ctx.textDrawingMode = 'glyph';
    }
    this.ctx.font = this.font?.toFontString(this.fontSize) || '';
    this.ctx.fillStyle = `rgba(${r}, ${g}, ${b}, ${a})`;
    if (item.mayHaveModifiedWordSepGlyphs(this.layout)) {
      if (item.attrs.level & 1) {
        const state = item.createMeasureState();
        item.measure(textStart, 1, state);
        x += item.measure(textEnd, 1, state).advance;
      }
      const words = item.createWordIterator(textStart, textEnd);
      for (; !words.done; words.next()) {
        const text = item.ifc.sliceRenderText(this.layout, item, words.start, words.end);
        x += item.attrs.level & 1 ? -words.x : words.x;
        if (item.attrs.level & 1) x -= words.w;
        this.ctx.fillText(text, x, y);
        if (!(item.attrs.level & 1)) x += words.w;
      }
    } else {
      const text = item.ifc.sliceRenderText(this.layout, item, textStart, textEnd);
      this.ctx.fillText(text, x, y);
    }
    this.ctx.restore();
  }

  correctText(x: number, y: number, item: ShapedItem, glyphStart: number, glyphEnd: number) {
    const {r, g, b, a} = this.fillColor;
    const scale = 1 / item.face.hbface.upem * this.fontSize;

    let sx = 0;
    let sy = 0;

    this.ctx.save();
    this.ctx.translate(x, y);
    this.ctx.scale(scale, -scale);
    this.ctx.beginPath();
    this.ctx.fillStyle = `rgba(${r}, ${g}, ${b}, ${a})`;
    for (let i = glyphStart; i < glyphEnd; i += G_SZ) {
      const x = sx + item.glyphs[i + G_DX];
      const y = sy + item.glyphs[i + G_DY];
      this.ctx.translate(x, y);
      item.face.hbfont.drawGlyph(item.glyphs[i + G_ID], this.ctx);
      this.ctx.translate(-x, -y);
      sx += item.glyphs[i + G_AX];
      sy += item.glyphs[i + G_AY];
    }
    this.ctx.fill();
    this.ctx.restore();
  }

  text(
    x: number,
    y: number,
    item: ShapedItem,
    totalTextStart: number,
    totalTextEnd: number,
    isColorBoundary: boolean
  ) {
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
          this.fastText(x, y, item, textStart, textEnd);
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
          this.fastText(x, y, item, textStart, textEnd);
          x += glyphsWidth(item, startGlyphEnd, endGlyphStart);
        }

        if (endGlyphStart !== endGlyphEnd) {
          this.correctText(x, y, item, endGlyphStart, endGlyphEnd);
        }
      }
    } else {
      this.fastText(x, y, item, totalTextStart, totalTextEnd);
    }
  }

  rect(x: number, y: number, w: number, h: number) {
    const {r, g, b, a} = this.fillColor;
    this.ctx.beginPath();
    this.ctx.fillStyle = `rgba(${r}, ${g}, ${b}, ${a})`;
    this.ctx.fillRect(x, y, w, h);
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

  image(x: number, y: number, w: number, h: number, image: Image) {
    if (!image.decoded) {
      throw new Error('Image handle missing. Did you call flow.loadSync instead of flow.load?');
    }
    this.ctx.drawImage(image.decoded, x, y, w, h);
  }
}

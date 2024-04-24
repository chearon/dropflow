import {ShapedItem} from './layout-text.js';
import {firstCascadeItem} from './text-font.js';

import type {Color} from './style.js';
import type {PaintBackend} from './paint.js';
import type {FaceMatch} from './text-font.js';

function encode(s: string) {
  return s.replaceAll('&', '&amp;').replaceAll('<', '&lt;');
}

function camelToKebab(camel: string) {
  return camel.replace(/[A-Z]/g, s => '-' + s.toLowerCase());
}

export default class HtmlPaintBackend implements PaintBackend {
  s: string;
  fillColor: Color;
  strokeColor: Color;
  lineWidth: number;
  direction: 'ltr' | 'rtl';
  font: FaceMatch;
  fontSize: number;
  usedFonts: Map<string, FaceMatch>;

  constructor() {
    this.s = '';
    this.fillColor = {r: 0, g: 0, b: 0, a: 0};
    this.strokeColor = {r: 0, g: 0, b: 0, a: 0};
    this.lineWidth = 0;
    this.direction = 'ltr';
    this.font = firstCascadeItem();
    this.fontSize = 0;
    this.usedFonts = new Map();
  }

  style(style: Record<string, string>) {
    return Object.entries(style).map(([prop, value]) => {
      return `${camelToKebab(prop)}: ${value}`;
    }).join('; ');
  }

  edge(x: number, y: number, length: number, side: 'top' | 'right' | 'bottom' | 'left') {
    const {r, g, b, a} = this.strokeColor;
    const sw = this.lineWidth;
    const width = side === 'top' || side === 'bottom' ? length + 'px' : sw + 'px';
    const height = side === 'left' || side === 'right' ? length + 'px' : sw + 'px';
    const backgroundColor = `rgba(${r}, ${g}, ${b}, ${a})`;

    this.s += `<rect x="${x}" y="${y}" width="${width}" height="${height}" fill="${backgroundColor}" />`;
  }

  text(x: number, y: number, item: ShapedItem, textStart: number, textEnd: number) {
    const text = item.paragraph.string.slice(textStart, textEnd).trim();
    const {r, g, b, a} = this.fillColor;
    const color = `rgba(${r}, ${g}, ${b}, ${a})`;
    const style = this.style({
      font: this.font.toFontString(this.fontSize),
      whiteSpace: 'pre',
      direction: this.direction,
      unicodeBidi: 'bidi-override'
    });

    this.s += `<text x="${x}" y="${y}" style="${encode(style)}" fill="${color}">${encode(text)}</text>`;
    this.usedFonts.set(item.match.filename, item.match);
  }

  rect(x: number, y: number, w: number, h: number) {
    const {r, g, b, a} = this.fillColor;
    const fill = `rgba(${r}, ${g}, ${b}, ${a})`;

    this.s += `<rect x="${x}" y="${y}" width="${w}" height="${h}" fill="${fill}" />`;
  }
}

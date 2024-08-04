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

interface Rect {
  id: string;
  x: number;
  y: number;
  width: number;
  height: number
};

function intersectRects(rects: Rect[]) {
  const rect = {...rects[0]};

  for (let i = 1; i < rects.length; i++) {
    const right = rect.x + rect.width;
    const bottom = rect.y + rect.height;
    rect.x = Math.max(rect.x, rects[i].x);
    rect.y = Math.max(rect.y, rects[i].y);
    rect.width = Math.min(right, rects[i].x + rects[i].width) - rect.x;
    rect.height = Math.min(bottom, rects[i].y + rects[i].height) - rect.y;
  }

  return rect;
}

function createId() {
  let ret = '';
  for (let i = 0; i < 10; i++) {
    ret += String.fromCharCode(0x61 /* 'a' */ + Math.floor(Math.random() * 26));
  }
  return ret;
}

export default class HtmlPaintBackend implements PaintBackend {
  main: string;
  defs: string;
  clips: Rect[];
  fillColor: Color;
  strokeColor: Color;
  lineWidth: number;
  direction: 'ltr' | 'rtl';
  font: FaceMatch;
  fontSize: number;
  usedFonts: Map<string, FaceMatch>;

  constructor() {
    this.main = '';
    this.defs = '';
    this.clips = [];
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
    const rect = this.clips.at(-1);
    const clipPath = rect ? `clip-path="url(#${rect.id}) "` : ' ';

    this.main += `<rect x="${x}" y="${y}" width="${width}" height="${height}" fill="${backgroundColor}" ${clipPath}/>`;
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
    const rect = this.clips.at(-1);
    const clipPath = rect ? `clip-path="url(#${rect.id}) "` : ' ';

    this.main += `<text x="${x}" y="${y}" style="${encode(style)}" fill="${color}" ${clipPath}>${encode(text)}</text>`;
    this.usedFonts.set(item.match.filename, item.match);
  }

  rect(x: number, y: number, w: number, h: number) {
    const {r, g, b, a} = this.fillColor;
    const fill = `rgba(${r}, ${g}, ${b}, ${a})`;
    const rect = this.clips.at(-1);
    const clipPath = rect ? `clip-path="url(#${rect.id}) "` : ' ';

    this.main += `<rect x="${x}" y="${y}" width="${w}" height="${h}" fill="${fill}" ${clipPath}/>`;
  }

  pushClip(x: number, y: number, width: number, height: number) {
    const id = createId();

    this.clips.push({id, x, y, width, height});

    {
      const {x, y, width, height} = intersectRects(this.clips);
      const shape = `<rect x="${x}" y="${y}" width="${width}" height="${height}" />`;
      this.defs += `<clipPath id="${id}">${shape}</clipPath>`;
    }
  }

  popClip() {
    this.clips.pop();
  }

  body() {
    return `
      <defs>
        ${this.defs}
      </defs>
      ${this.main}
    `;
  }
}

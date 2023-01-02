import type {Color} from '../cascade.js';
import type {PaintBackend} from './paint.js';
import type {FontConfigCssMatch} from 'fontconfig';
import {encode} from 'entities';
import {getAscenderDescender, ShapedItem} from '../text.js';
import {hb} from '../deps.js';

type StringMap = Record<string, string>;

function camelToKebab(camel: string) {
  return camel.replace(/[A-Z]/g, s => '-' + s.toLowerCase());
}

export default class HtmlPaintBackend implements PaintBackend {
  s: string;
  fillColor: Color;
  strokeColor: Color;
  lineWidth: number;
  direction: 'ltr' | 'rtl';
  font: FontConfigCssMatch;
  fontSize: number;

  constructor() {
    this.s = '';
    this.fillColor = {r: 0, g: 0, b: 0, a: 0};
    this.strokeColor = {r: 0, g: 0, b: 0, a: 0};
    this.lineWidth = 0;
    this.direction = 'ltr';
    this.font = {file: '', index: 0, family: '', weight: '', width: '', style: ''};
    this.fontSize = 0;
  }

  style(style: StringMap) {
    return Object.entries(style).map(([prop, value]) => {
      return `${camelToKebab(prop)}: ${value}`;
    }).join('; ');
  }

  attrs(attrs: StringMap) {
    return Object.entries(attrs).map(([name, value]) => {
      return `${name}="${value}"`;
    }).join(' ');
  }

  // TODO: pass in amount of each side that's shared with another border so they can divide
  // TODO: pass in border-radius
  edge(x: number, y: number, length: number, side: 'top' | 'right' | 'bottom' | 'left') {
    const {r, g, b, a} = this.strokeColor;
    const sw = this.lineWidth;
    const left = (side === 'left' ? x - sw/2 : side === 'right' ? x - sw/2 : x) + 'px';
    const top = (side === 'top' ? y - sw/2 : side === 'bottom' ? y - sw/2 : y) + 'px';
    const width = side === 'top' || side === 'bottom' ? length + 'px' : sw + 'px';
    const height = side === 'left' || side === 'right' ? length + 'px' : sw + 'px';
    const position = 'absolute';
    const backgroundColor = `rgba(${r}, ${g}, ${b}, ${a})`;
    const style = this.style({position, left, top, width, height, backgroundColor});

    this.s += `<div style="${style}"></div>`;
  }

  text(x: number, y: number, item: ShapedItem, textStart: number, textEnd: number) {
    const hbFont = hb.createFont(item.face);
    const {ascender, descender} = getAscenderDescender(item.attrs.style, hbFont, item.face.upem);
    const text = item.paragraph.string.slice(textStart, textEnd);
    const {r, g, b, a} = this.fillColor;
    const m = this.font;
    const style = this.style({
      position: 'absolute',
      left: '0',
      top: '0',
      transform: `translate(${x}px, ${y - (ascender - (ascender + descender)/2)}px)`,
      font: `${m.style} ${m.weight} ${m.width} ${this.fontSize}px ${m.family}`,
      lineHeight: '0',
      whiteSpace: 'pre',
      direction: this.direction,
      unicodeBidi: 'bidi-override',
      color: `rgba(${r}, ${g}, ${b}, ${a})`
    });
    hbFont.destroy();
    this.s += `<div style="${style}">${encode(text)}</div>`;
  }

  rect(x: number, y: number, w: number, h: number) {
    const {r, g, b, a} = this.fillColor;
    const style = this.style({
      position: 'absolute',
      left: x + 'px',
      top: y + 'px',
      width: w + 'px',
      height: h + 'px',
      backgroundColor: `rgba(${r}, ${g}, ${b}, ${a})`
    });
    this.s += `<div style="${style}"></div>`;
  }
}



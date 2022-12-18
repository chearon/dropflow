import {Color} from '../cascade.js';
import {PaintBackend} from './paint.js';
import {FontConfigCssMatch} from 'fontconfig';
import type {CanvasRenderingContext2D} from 'canvas';

export default class CanvasPaintBackend implements PaintBackend {
  s: string;
  fillColor: Color;
  strokeColor: Color;
  lineWidth: number;
  direction: 'ltr' | 'rtl';
  font: FontConfigCssMatch;
  fontSize: number;
  ctx: CanvasRenderingContext2D;

  constructor(ctx: CanvasRenderingContext2D) {
    this.s = '';
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

  text(x: number, y: number, text: string) {
    const {r, g, b, a} = this.fillColor;
    const m = this.font;
    this.ctx.font = `${m.style} ${m.weight} ${m.width} ${this.fontSize}px ${m.family}`;
    this.ctx.fillStyle = `rgba(${r}, ${g}, ${b}, ${a})`;
    this.ctx.fillText(text, x, y);
  }

  rect(x: number, y: number, w: number, h: number) {
    const {r, g, b, a} = this.fillColor;
    this.ctx.beginPath();
    this.ctx.fillStyle = `rgba(${r}, ${g}, ${b}, ${a})`;
    this.ctx.fillRect(x, y, w, h);
  }
}

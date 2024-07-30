import { ShapedItem } from './layout-text.js';
import type { Color } from './style.js';
import type { PaintBackend } from './paint.js';
import type { FaceMatch } from './text-font.js';
export default class HtmlPaintBackend implements PaintBackend {
    s: string;
    fillColor: Color;
    strokeColor: Color;
    lineWidth: number;
    direction: 'ltr' | 'rtl';
    font: FaceMatch;
    fontSize: number;
    usedFonts: Map<string, FaceMatch>;
    constructor();
    style(style: Record<string, string>): string;
    edge(x: number, y: number, length: number, side: 'top' | 'right' | 'bottom' | 'left'): void;
    text(x: number, y: number, item: ShapedItem, textStart: number, textEnd: number): void;
    rect(x: number, y: number, w: number, h: number): void;
}

import type { ColorLiteral } from './style.ts';
import type { PaintBackend } from './paint.ts';
import type { ShapedItem } from './layout-text.ts';
import type { LoadedFontFace } from './text-font.ts';
import type { Image } from './layout-image.ts';
import type { Layout } from './layout-box.ts';
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
    set strokeStyle(value: string);
    get strokeStyle(): unknown;
    set fillStyle(value: string);
    get fillStyle(): unknown;
    lineWidth: number;
    font: string;
    set direction(value: 'ltr' | 'rtl');
    get direction(): unknown;
    set textAlign(value: 'left');
    get textAlign(): unknown;
    rect(x: number, y: number, w: number, h: number): void;
    clip(): void;
    drawImage(image: unknown, x: number, y: number, w?: number, h?: number): void;
}
export interface Canvas {
    getContext(ctx: '2d'): CanvasRenderingContext2D;
    width: number;
    height: number;
}
export default class CanvasPaintBackend implements PaintBackend {
    fillColor: ColorLiteral;
    strokeColor: ColorLiteral;
    lineWidth: number;
    direction: 'ltr' | 'rtl';
    font: LoadedFontFace | undefined;
    fontSize: number;
    ctx: CanvasRenderingContext2D;
    layout: Layout;
    constructor(ctx: CanvasRenderingContext2D, layout: Layout);
    edge(x: number, y: number, length: number, side: 'top' | 'right' | 'bottom' | 'left'): void;
    fastText(x: number, y: number, item: ShapedItem, textStart: number, textEnd: number): void;
    correctText(x: number, y: number, item: ShapedItem, glyphStart: number, glyphEnd: number): void;
    text(x: number, y: number, item: ShapedItem, totalTextStart: number, totalTextEnd: number, isColorBoundary: boolean): void;
    rect(x: number, y: number, w: number, h: number): void;
    pushClip(x: number, y: number, w: number, h: number): void;
    popClip(): void;
    image(x: number, y: number, w: number, h: number, image: Image): void;
}

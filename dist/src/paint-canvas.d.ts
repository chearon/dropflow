import type { Color } from './style.js';
import type { PaintBackend } from './paint.js';
import type { CanvasRenderingContext2D as NodeCanvasRenderingContext2D } from 'canvas';
import type { ShapedItem } from './layout-text.js';
import type { FaceMatch } from './text-font.js';
export type CanvasRenderingContext2D = Pick<NodeCanvasRenderingContext2D, 'moveTo' | 'lineTo' | 'quadraticCurveTo' | 'bezierCurveTo' | 'fillRect' | 'fillText' | 'translate' | 'scale' | 'stroke' | 'fill' | 'beginPath' | 'closePath' | 'save' | 'restore' | 'strokeStyle' | 'fillStyle' | 'lineWidth' | 'font'>;
export interface Canvas {
    getContext(ctx: '2d'): CanvasRenderingContext2D;
    width: number;
    height: number;
}
export default class CanvasPaintBackend implements PaintBackend {
    fillColor: Color;
    strokeColor: Color;
    lineWidth: number;
    direction: 'ltr' | 'rtl';
    font: FaceMatch;
    fontSize: number;
    ctx: CanvasRenderingContext2D;
    constructor(ctx: CanvasRenderingContext2D);
    edge(x: number, y: number, length: number, side: 'top' | 'right' | 'bottom' | 'left'): void;
    fastText(x: number, y: number, text: string): void;
    correctText(x: number, y: number, item: ShapedItem, glyphStart: number, glyphEnd: number): void;
    text(x: number, y: number, item: ShapedItem, totalTextStart: number, totalTextEnd: number, isColorBoundary: boolean): void;
    rect(x: number, y: number, w: number, h: number): void;
}

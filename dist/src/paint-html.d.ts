import { ShapedItem } from './layout-text.ts';
import type { ColorLiteral } from './style.ts';
import type { PaintBackend } from './paint.ts';
import type { LoadedFontFace } from './text-font.ts';
import type { Image } from './layout-image.ts';
import type { Layout } from './layout-box.ts';
type StringMap = Record<string, string>;
export default class HtmlPaintBackend implements PaintBackend {
    s: string;
    fillColor: ColorLiteral;
    strokeColor: ColorLiteral;
    lineWidth: number;
    direction: 'ltr' | 'rtl';
    font: LoadedFontFace | undefined;
    fontSize: number;
    layout: Layout;
    constructor(layout: Layout);
    style(style: StringMap): string;
    attrs(attrs: StringMap): string;
    edge(x: number, y: number, length: number, side: 'top' | 'right' | 'bottom' | 'left'): void;
    text(x: number, y: number, item: ShapedItem, textStart: number, textEnd: number): void;
    rect(x: number, y: number, w: number, h: number): void;
    image(x: number, y: number, w: number, h: number, image: Image): void;
    pushClip(x: number, y: number, width: number, height: number): void;
    popClip(): void;
}
export {};

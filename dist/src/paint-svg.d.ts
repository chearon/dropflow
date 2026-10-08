import { ShapedItem } from './layout-text.ts';
import type { ColorLiteral } from './style.ts';
import type { PaintBackend } from './paint.ts';
import type { LoadedFontFace } from './text-font.ts';
import type { Image } from './layout-image.ts';
import type { Layout } from './layout-box.ts';
interface Rect {
    id: string;
    x: number;
    y: number;
    width: number;
    height: number;
}
export default class SvgPaintBackend implements PaintBackend {
    main: string;
    defs: string;
    clips: Rect[];
    fillColor: ColorLiteral;
    strokeColor: ColorLiteral;
    lineWidth: number;
    direction: 'ltr' | 'rtl';
    font: LoadedFontFace | undefined;
    fontSize: number;
    usedFonts: Map<string, LoadedFontFace>;
    layout: Layout;
    constructor(layout: Layout);
    style(style: Record<string, string>): string;
    edge(x: number, y: number, length: number, side: 'top' | 'right' | 'bottom' | 'left'): void;
    text(x: number, y: number, item: ShapedItem, textStart: number, textEnd: number): void;
    rect(x: number, y: number, w: number, h: number): void;
    pushClip(x: number, y: number, width: number, height: number): void;
    popClip(): void;
    image(x: number, y: number, w: number, h: number, image: Image): void;
    body(): string;
}
export {};

import { Image } from './layout-image.ts';
import { ShapedItem } from './layout-text.ts';
import { Layout } from './layout-box.ts';
import type { ColorLiteral } from './style.ts';
import type { LoadedFontFace } from './text-font.ts';
export interface PaintBackend {
    fillColor: ColorLiteral;
    strokeColor: ColorLiteral;
    lineWidth: number;
    direction: 'ltr' | 'rtl';
    font: LoadedFontFace | undefined;
    fontSize: number;
    edge(x: number, y: number, length: number, side: 'top' | 'right' | 'bottom' | 'left'): void;
    text(x: number, y: number, item: ShapedItem, textStart: number, textEnd: number, isColorBoundary?: boolean): void;
    rect(x: number, y: number, w: number, h: number): void;
    pushClip(x: number, y: number, w: number, h: number): void;
    popClip(): void;
    image(x: number, y: number, width: number, height: number, image: Image): void;
}
/**
 * Paint the root element
 * https://www.w3.org/TR/CSS22/zindex.html
 */
export default function paint(layout: Layout, b: PaintBackend): void;

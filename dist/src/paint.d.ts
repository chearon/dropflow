import { BlockContainer } from './layout-flow.js';
import { ShapedItem } from './layout-text.js';
import { Color } from './style.js';
import type { FaceMatch } from './text-font.js';
export interface PaintBackend {
    fillColor: Color;
    strokeColor: Color;
    lineWidth: number;
    direction: 'ltr' | 'rtl';
    font: FaceMatch;
    fontSize: number;
    edge(x: number, y: number, length: number, side: 'top' | 'right' | 'bottom' | 'left'): void;
    text(x: number, y: number, item: ShapedItem, textStart: number, textEnd: number, isColorBoundary?: boolean): void;
    rect(x: number, y: number, w: number, h: number): void;
}
/**
 * Paint a stacking context root
 * https://www.w3.org/TR/CSS22/zindex.html
 */
export default function paintBlockRoot(block: BlockContainer, b: PaintBackend, isRoot?: boolean): void;

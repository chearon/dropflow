import { HTMLElement, TextNode } from './dom.js';
import { DeclaredStyle, getRootStyle } from './style.js';
import { registerFont, unregisterFont, RegisterFontOptions } from './text-font.js';
import { BlockContainer } from './layout-flow.js';
import { Canvas, CanvasRenderingContext2D } from './paint-canvas.js';
export type { BlockContainer, DeclaredStyle };
export type { HTMLElement };
export { getRootStyle };
export { cascadeStyles } from './style.js';
export { registerFont, unregisterFont };
export declare function generate(rootElement: HTMLElement): BlockContainer;
export declare function layout(root: BlockContainer, width?: number, height?: number): void;
/**
 * Old paint target for testing, not maintained much anymore
 */
export declare function paintToHtml(root: BlockContainer): string;
export declare function paintToSvg(root: BlockContainer): string;
export declare function paintToSvgElements(root: BlockContainer): string;
export { eachRegisteredFont } from './text-font.js';
export declare function paintToCanvas(root: BlockContainer, ctx: CanvasRenderingContext2D): void;
export declare function renderToCanvasContext(rootElement: HTMLElement, ctx: CanvasRenderingContext2D, width: number, height: number): void;
export declare function renderToCanvas(rootElement: HTMLElement, canvas: Canvas, density?: number): void;
type HsChild = HTMLElement | string;
interface HsData {
    style?: DeclaredStyle;
    attrs?: {
        [k: string]: string;
    };
}
export declare function dom(el: HsChild | HsChild[]): HTMLElement;
export declare function h(tagName: string): HTMLElement;
export declare function h(tagName: string, data: HsData): HTMLElement;
export declare function h(tagName: string, children: HsChild[]): HTMLElement;
export declare function h(tagName: string, text: string): HTMLElement;
export declare function h(tagName: string, data: HsData, children: HsChild[] | string): HTMLElement;
export declare function t(text: string): TextNode;
export declare function staticLayoutContribution(box: BlockContainer): number;
export declare function loadNotoFonts(root: HTMLElement, options?: RegisterFontOptions): Promise<URL[]>;

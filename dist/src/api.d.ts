import '#register-default-environment';
import { HTMLElement, TextNode } from './dom.ts';
import { DeclaredStyle } from './style.ts';
import { fonts, FontFace, createFaceFromTables, createFaceFromTablesSync } from './text-font.ts';
import { Layout } from './layout-box.ts';
import type { BufferSource } from "./util.ts";
import type { Canvas, CanvasRenderingContext2D } from './paint-canvas.ts';
import type { Style } from './style.ts';
import type { Image } from './layout-image.ts';
import type { BlockContainer } from './layout-flow.ts';
export { log } from './layout-box.ts';
export { environment } from './environment.ts';
export type { Layout, BlockContainer, DeclaredStyle, HTMLElement };
export { createDeclaredStyle as style, setOriginStyle } from './style.ts';
export { fonts, FontFace, createFaceFromTables, createFaceFromTablesSync };
export declare function layout(rootElement: HTMLElement): Layout;
export declare function reflow(layout: Layout, width?: number, height?: number): void;
/**
 * Old paint target for testing, not maintained much anymore
 */
export declare function paintToHtml(layout: Layout): string;
export declare function paintToSvg(layout: Layout): string;
export declare function paintToSvgElements(layout: Layout): string;
export { eachRegisteredFont } from './text-font.ts';
export declare function paintToCanvas(layout: Layout, ctx: CanvasRenderingContext2D): void;
export declare function renderToCanvasContext(rootElement: HTMLElement, ctx: CanvasRenderingContext2D, width: number, height: number): Promise<void>;
export declare function renderToCanvas(rootElement: HTMLElement, canvas: Canvas): Promise<void>;
type HsChild = HTMLElement | string;
interface HsData {
    style?: DeclaredStyle | DeclaredStyle[];
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
type LoadableResource = FontFace | Image;
export interface LoadWalkerContext {
    fontCache: {
        style: Style;
        faces: FontFace[];
    }[];
    fontEntry: {
        style: Style;
        faces: FontFace[];
    } | undefined;
    onLoadableResource: (resource: LoadableResource) => void;
}
export declare function load(root: HTMLElement): Promise<LoadableResource[]>;
export declare function loadSync(root: HTMLElement): LoadableResource[];
export declare const objectStore: Map<string, BufferSource>;
export declare function createObjectURL(buffer: BufferSource): string;
export declare function revokeObjectURL(url: string): void;
export { clearWordCache } from './layout-text.ts';

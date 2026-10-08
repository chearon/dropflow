import { Box } from './layout-box.ts';
import { Style, DeclaredStyle } from './style.ts';
export declare class TextNode {
    id: string;
    style: Style;
    text: string;
    parent: HTMLElement | null;
    constructor(id: string, text: string, parent?: HTMLElement | null);
    repr(indent?: number): string;
}
export declare class HTMLElement {
    id: string;
    tagName: string;
    style: Style;
    declaredStyle: DeclaredStyle | DeclaredStyle[];
    parent: HTMLElement | null;
    attrs: Record<string, string>;
    children: (TextNode | HTMLElement)[];
    boxes: Box[];
    constructor(id: string, tagName: string, parent?: HTMLElement | null, attrs?: {
        [k: string]: string;
    }, declaredStyle?: DeclaredStyle | DeclaredStyle[]);
    getDeclaredStyles(): DeclaredStyle[];
    getEl(stack: number[]): HTMLElement | TextNode;
    repr(indent?: number, styleProp?: keyof Style): string;
    query(selector: string): HTMLElement | null;
    queryAll(selector: string): HTMLElement[];
}

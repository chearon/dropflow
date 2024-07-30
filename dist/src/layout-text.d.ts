import { RenderItem, ReprOptions } from './layout-box.js';
import { Style, Color, TextAlign } from './style.js';
import { BlockContainer, IfcInline, IfcVacancy, Inline, LayoutContext } from './layout-flow.js';
import type { FaceMatch } from './text-font.js';
import type { HbFont, AllocatedUint16Array } from './text-harfbuzz.js';
export declare function isSpaceOrTabOrNewline(c: string): boolean;
export declare function nextGrapheme(text: string, index: number): number;
export declare function prevGrapheme(text: string, index: number): number;
export declare class Run extends RenderItem {
    start: number;
    end: number;
    constructor(start: number, end: number, style: Style);
    get length(): number;
    sym(): string;
    get wsCollapsible(): boolean;
    wrapsOverflowAnywhere(mode: 'min-content' | 'max-content' | 'normal'): boolean;
    isRun(): this is Run;
    desc(options?: ReprOptions): string;
}
export declare function collapseWhitespace(ifc: IfcInline): void;
export interface ShapingAttrs {
    isEmoji: boolean;
    level: number;
    script: string;
    style: Style;
}
export declare function getFontMetrics(inline: Inline): InlineMetrics;
export declare const G_ID = 0;
export declare const G_CL = 1;
export declare const G_AX = 2;
export declare const G_AY = 3;
export declare const G_DX = 4;
export declare const G_DY = 5;
export declare const G_FL = 6;
export declare const G_SZ = 7;
export declare function langForScript(script: string): string;
export declare function getMetrics(style: Style, match: FaceMatch): InlineMetrics;
export declare function nextCluster(glyphs: Int32Array, index: number): number;
export declare function prevCluster(glyphs: Int32Array, index: number): number;
interface IfcRenderItem {
    end(): number;
    inlines: Inline[];
    attrs: ShapingAttrs;
}
export declare class ShapedShim implements IfcRenderItem {
    offset: number;
    inlines: Inline[];
    attrs: ShapingAttrs;
    /** Defined when the shim is containing an inline-block */
    block: BlockContainer | undefined;
    constructor(offset: number, inlines: Inline[], attrs: ShapingAttrs, block?: BlockContainer);
    end(): number;
}
interface MeasureState {
    glyphIndex: number;
    characterIndex: number;
    clusterStart: number;
    clusterEnd: number;
    clusterAdvance: number;
    isInk: boolean;
    done: boolean;
}
export interface InlineMetrics {
    ascenderBox: number;
    ascender: number;
    superscript: number;
    xHeight: number;
    subscript: number;
    descender: number;
    descenderBox: number;
}
export declare const EmptyInlineMetrics: Readonly<InlineMetrics>;
export declare class ShapedItem implements IfcRenderItem {
    paragraph: Paragraph;
    match: FaceMatch;
    glyphs: Int32Array;
    offset: number;
    length: number;
    attrs: ShapingAttrs;
    inlines: Inline[];
    x: number;
    y: number;
    constructor(paragraph: Paragraph, match: FaceMatch, glyphs: Int32Array, offset: number, length: number, attrs: ShapingAttrs);
    clone(): ShapedItem;
    split(offset: number): {
        needsReshape: boolean;
        right: ShapedItem;
    };
    reshape(walkBackwards: boolean): void;
    createMeasureState(direction?: 1 | -1): {
        glyphIndex: number;
        characterIndex: number;
        clusterStart: number;
        clusterEnd: number;
        clusterAdvance: number;
        isInk: boolean;
        done: boolean;
    };
    nextCluster(direction: 1 | -1, state: MeasureState): void;
    measureInsideCluster(state: MeasureState, ci: number): number;
    measure(ci?: number, direction?: 1 | -1, state?: {
        glyphIndex: number;
        characterIndex: number;
        clusterStart: number;
        clusterEnd: number;
        clusterAdvance: number;
        isInk: boolean;
        done: boolean;
    }): {
        advance: number;
        trailingWs: number;
    };
    collapseWhitespace(at: 'start' | 'end'): true | undefined;
    colorsStart(colors: [Color, number][]): number;
    colorsEnd(colors: [Color, number][]): number;
    end(): number;
    hasCharacterInside(ci: number): boolean;
    text(): string;
}
interface LineItem {
    value: ShapedItem | ShapedShim;
    next: LineItem | null;
    previous: LineItem | null;
}
declare class LineItemLinkedList {
    head: LineItem | null;
    tail: LineItem | null;
    constructor();
    clear(): void;
    transfer(): LineItemLinkedList;
    concat(items: LineItemLinkedList): void;
    rconcat(items: LineItemLinkedList): void;
    push(value: LineItem['value']): void;
    unshift(value: LineItem['value']): void;
    reverse(): void;
}
declare class LineWidthTracker {
    private inkSeen;
    private startWs;
    private startWsC;
    private ink;
    private endWs;
    private endWsC;
    private hyphen;
    constructor();
    addInk(width: number): void;
    addWs(width: number, isCollapsible: boolean): void;
    hasContent(): boolean;
    addHyphen(width: number): void;
    concat(width: LineWidthTracker): void;
    forFloat(): number;
    forWord(): number;
    asWord(): number;
    trimmed(): number;
    reset(): void;
}
export declare function inlineBlockMetrics(block: BlockContainer): {
    ascender: number;
    descender: number;
};
declare class AlignmentContext {
    ascender: number;
    descender: number;
    baselineShift: number;
    constructor(arg: InlineMetrics | AlignmentContext);
    stampMetrics(metrics: InlineMetrics): void;
    stampBlock(block: BlockContainer, parent: Inline): void;
    extend(ctx: AlignmentContext): void;
    stepIn(parent: Inline, inline: Inline): void;
    stepOut(parent: Inline, inline: Inline): void;
    reset(): void;
}
declare class LineCandidates extends LineItemLinkedList {
    width: LineWidthTracker;
    height: LineHeightTracker;
    constructor(ifc: IfcInline);
    clearContents(): void;
}
declare class LineHeightTracker {
    ifc: IfcInline;
    parents: Inline[];
    contextStack: AlignmentContext[];
    contextRoots: Map<Inline, AlignmentContext>;
    /** Inline blocks */
    blocks: BlockContainer[];
    markedContextRoots: Inline[];
    constructor(ifc: IfcInline);
    stampMetrics(metrics: InlineMetrics): void;
    stampBlock(block: BlockContainer, parent: Inline): void;
    pushInline(inline: Inline): void;
    popInline(): void;
    concat(height: LineHeightTracker): void;
    align(): {
        ascender: number;
        descender: number;
    };
    total(): number;
    totalWith(height: LineHeightTracker): number;
    reset(): void;
    clearContents(): void;
}
export declare class Linebox extends LineItemLinkedList {
    startOffset: number;
    paragraph: Paragraph;
    ascender: number;
    descender: number;
    endOffset: number;
    blockOffset: number;
    inlineOffset: number;
    width: number;
    contextRoots: Map<Inline, AlignmentContext>;
    constructor(start: number, paragraph: Paragraph);
    addCandidates(candidates: LineCandidates, endOffset: number): void;
    hasContent(): boolean;
    hasAnything(): boolean;
    end(): number;
    height(): number;
    trimStart(): void;
    trimEnd(): void;
    reorderRange(start: LineItem | null, length: number): LineItemLinkedList;
    reorder(): void;
    postprocess(width: LineWidthTracker, height: LineHeightTracker, vacancy: IfcVacancy, textAlign: TextAlign): void;
}
export interface BackgroundBox {
    linebox: Linebox;
    start: number;
    end: number;
    blockOffset: number;
    ascender: number;
    descender: number;
    naturalStart: boolean;
    naturalEnd: boolean;
}
interface IfcMark {
    position: number;
    isBreak: boolean;
    isGraphemeBreak: boolean;
    isBreakForced: boolean;
    isItemStart: boolean;
    inlinePre: Inline | null;
    inlinePost: Inline | null;
    block: BlockContainer | null;
    advance: number;
    trailingWs: number;
    itemIndex: number;
    split: (this: IfcMark, mark: IfcMark) => void;
}
export declare function clearWordCache(): void;
export declare class Paragraph {
    ifc: IfcInline;
    string: string;
    buffer: AllocatedUint16Array;
    brokenItems: ShapedItem[];
    wholeItems: ShapedItem[];
    treeItems: (ShapedItem | ShapedShim)[];
    lineboxes: Linebox[];
    backgroundBoxes: Map<Inline, BackgroundBox[]>;
    height: number;
    constructor(ifc: IfcInline, buffer: AllocatedUint16Array);
    destroy(): void;
    slice(start: number, end: number): string;
    split(itemIndex: number, offset: number): void;
    isInsideGraphemeBoundary(offset: number): boolean;
    length(): number;
    nlIterator(): {
        next(): {
            done: true;
        } | {
            done: false;
            value: {
                i: number;
            };
        };
    };
    shapePartWithWordCache(offset: number, length: number, font: HbFont, attrs: ShapingAttrs): Int32Array;
    shapePartWithoutWordCache(offset: number, length: number, font: HbFont, attrs: ShapingAttrs): Int32Array;
    shapePart(offset: number, length: number, match: FaceMatch, attrs: ShapingAttrs): Int32Array;
    getColors(): [Color, number][];
    shape(): void;
    createMarkIterator(ctx: LayoutContext): {
        [Symbol.iterator]: () => {
            next: () => {
                done: true;
            } | {
                done: false;
                value: IfcMark;
            };
        };
    };
    createLineboxes(ctx: LayoutContext): void;
    positionItems(ctx: LayoutContext): void;
}
export declare function createParagraph(ifc: IfcInline): Paragraph;
export declare function createEmptyParagraph(ifc: IfcInline): Paragraph;
export {};

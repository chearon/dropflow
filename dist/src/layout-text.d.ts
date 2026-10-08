import { Logger } from './util.ts';
import { Box, BoxArea, TreeNode, Layout } from './layout-box.ts';
import { Style } from './style.ts';
import { BlockContainerOfInlines, IfcVacancy, Inline } from './layout-flow.ts';
import * as hb from './text-harfbuzz.ts';
import type { LoadedFontFace } from './text-font.ts';
import type { TreeLogOptions } from './layout-box.ts';
import type { BlockLevel, InlineLevel, LayoutContext, BlockFormattingContext } from './layout-flow.ts';
export declare function isSpaceOrTabOrNewline(c: string): c is " " | "\n" | "\t";
export declare function nextGrapheme(text: string, index: number): number;
export declare function prevGrapheme(text: string, index: number): number;
export declare class Run extends TreeNode {
    textStart: number;
    textEnd: number;
    static TEXT_BITS: number;
    constructor(start: number, end: number, style: Style);
    get length(): number;
    getLogSymbol(): string;
    get wsCollapsible(): boolean;
    wrapsOverflowAnywhere(mode: 'min-content' | 'max-content' | 'normal'): boolean;
    isRun(): this is Run;
    logName(log: Logger, options?: TreeLogOptions): void;
    propagate(parent: Box, paragraph: string): void;
}
export declare function collapseWhitespace(tree: InlineLevel[], block: BlockContainerOfInlines): void;
export interface ShapingAttrs {
    isEmoji: boolean;
    level: number;
    script: string;
    style: Style;
}
export declare function langForScript(script: string): string;
export declare function getMetrics(style: Style, face: LoadedFontFace): InlineMetrics;
export declare function nextCluster(glyphs: Int32Array, index: number): number;
export declare function prevCluster(glyphs: Int32Array, index: number): number;
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
    strikeoutOffset: number;
    strikeoutSize: number;
    underlineOffset: number;
    underlineSize: number;
    subscript: number;
    descender: number;
    descenderBox: number;
}
export declare const EmptyInlineMetrics: Readonly<InlineMetrics>;
declare class WordIterator {
    item: ShapedItem;
    textEnd: number;
    state: MeasureState;
    start: number;
    end: number;
    x: number;
    w: number;
    done: boolean;
    constructor(item: ShapedItem, textStart: number, textEnd: number);
    next(): void;
}
export declare class ShapedItem {
    block: BlockContainerOfInlines;
    face: LoadedFontFace;
    glyphs: Int32Array;
    offset: number;
    length: number;
    attrs: ShapingAttrs;
    x: number;
    y: number;
    constructor(block: BlockContainerOfInlines, face: LoadedFontFace, glyphs: Int32Array, offset: number, length: number, attrs: ShapingAttrs);
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
    end(): number;
    hasCharacterInside(ci: number): boolean;
    createWordIterator(textStart: number, textEnd: number): WordIterator;
    mayHaveModifiedWordSepGlyphs(layout: Layout): number | boolean;
    text(): string;
}
declare class LineItem {
    startSpace: number;
    startProgress: number;
    textStart: number;
    itemIndex: number;
    treeIndex: number;
    inlineSpace: number;
    textEnd: number;
    endSpace: number;
    endProgress: number;
    constructor(treeIndex: number, itemIndex: number, textStart: number, textEnd: number, advance: number);
    isUnknown(): boolean;
    canConcat(item: LineItem): boolean;
}
declare class LineFragments {
    textStart: number;
    textEnd: number;
    treeStart: number;
    treeFinal: number;
    itemStart: number;
    itemEnd: number;
    items: LineItem[];
    constructor(treeIndex: number);
    clear(): void;
    hasContent(layout: Layout): boolean;
    concat(fragments: LineFragments): void;
    addBox(treeStart: number, treeFinal: number, inlineSpace: number): void;
    inlinePre(startSpace: number): void;
    inlinePost(endSpace: number): void;
    split(): void;
    onItemStart(): void;
    addText(treeIndex: number, textOffset: number, advance: number): void;
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
export declare function inlineBlockMetrics(layout: Layout, box: BlockLevel): {
    ascender: number;
    descender: number;
};
declare class AlignmentContext {
    ascender: number;
    descender: number;
    baselineShift: number;
    constructor(arg: InlineMetrics | AlignmentContext);
    stampMetrics(metrics: InlineMetrics): void;
    stampBlock(layout: Layout, box: BlockLevel, parent: Inline): void;
    extend(ctx: AlignmentContext): void;
    stepIn(parent: Inline, inline: Inline): void;
    stepOut(parent: Inline, inline: Inline): void;
    reset(): void;
}
declare class LineCandidates extends LineFragments {
    width: LineWidthTracker;
    height: LineHeightTracker;
    constructor(layout: Layout, block: BlockContainerOfInlines);
    clearContents(): void;
}
declare class LineHeightTracker {
    layout: Layout;
    block: BlockContainerOfInlines;
    parents: Inline[];
    contextStack: AlignmentContext[];
    contextRoots: Map<Inline, AlignmentContext>;
    /** Inline blocks, images */
    boxes: BlockLevel[];
    markedContextRoots: Inline[];
    constructor(layout: Layout, block: BlockContainerOfInlines);
    stampMetrics(metrics: InlineMetrics): void;
    stampBlock(box: BlockLevel, parent: Inline): void;
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
export declare class Linebox extends LineFragments {
    ascender: number;
    descender: number;
    blockOffset: number;
    inlineOffset: number;
    width: number;
    constructor(treeIndex: number);
    height(): number;
    reset(): void;
}
export interface InlineFragment {
    treeIndex: number;
    textStart: number;
    textEnd: number;
    left: number;
    right: number;
    blockOffset: number;
}
interface IfcMark {
    position: number;
    isBreak: boolean;
    isGraphemeBreak: boolean;
    isBreakForced: boolean;
    isItemStart: boolean;
    inlinePre: Inline | null;
    treeIndex: number;
    inlinePost: Inline | null;
    box: BlockLevel | null;
    advance: number;
    trailingWs: number;
    itemIndex: number;
    split: (this: IfcMark, mark: IfcMark) => void;
}
export declare function createIfcBuffer(text: string): hb.AllocatedUint16Array;
export declare function clearWordCache(): void;
export declare function sliceIfcRenderText(layout: Layout, block: BlockContainerOfInlines, item: ShapedItem, start: number, end: number): string;
export declare function createIfcShapedItems(layout: Layout, block: BlockContainerOfInlines, inlineRoot: Inline): ShapedItem[];
export declare function getIfcContribution(layout: Layout, block: BlockContainerOfInlines, mode: 'min-content' | 'max-content'): number;
declare class InlineFormattingContext {
    layout: Layout;
    block: BlockContainerOfInlines;
    bfc: BlockFormattingContext;
    /** Holds shaped items, width and height trackers for the current word */
    candidates: LineCandidates;
    /** Tracks the width of the line being worked on */
    width: LineWidthTracker;
    /** Tracks the height, ascenders and descenders of the line being worked on */
    height: LineHeightTracker;
    vacancy: IfcVacancy;
    rootInline: Inline;
    containingBlock: BoxArea;
    /** Parents according to the mark's current position */
    parents: Inline[];
    /** The current line being worked on */
    line: Linebox;
    lastBreakMark: IfcMark | null;
    floatsInWord: BlockLevel[];
    blockOffset: number;
    lineHasWord: boolean;
    /** True when we should append the line */
    lineIsDirty: boolean;
    /** Inlines to be fragmented; shared across finishLine calls */
    inlines: Inline[];
    constructor(layout: Layout, block: BlockContainerOfInlines, ctx: LayoutContext);
}
export declare function createIfcLineboxes(layout: Layout, block: BlockContainerOfInlines, ctx: LayoutContext): InlineFormattingContext;
export {};

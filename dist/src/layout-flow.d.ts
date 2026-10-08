import { Logger } from './util.ts';
import { HTMLElement } from './dom.ts';
import { Style } from './style.ts';
import { Linebox, Run } from './layout-text.ts';
import { Box, FormattingBox, TreeNode, Layout } from './layout-box.ts';
import type { ShapedItem, InlineFragment } from './layout-text.ts';
import type { BoxArea, PrelayoutContext } from './layout-box.ts';
import type { AllocatedUint16Array } from './text-harfbuzz.ts';
export interface LayoutContext {
    /**
     * The block formatting context that formats the subject in a layout function.
     * This is only undefined for the root box or when an element is out of flow.
     */
    bfc?: BlockFormattingContext;
    /**
     * Some parent needs InlineFragments to be generated for the purpose of
     * baseline alignment. Currently set by inline-block, reset by anything out of
     * flow. This indicates that IFCs should generate all fragments that _could
     * be_ aligned to; currently, just the last line. Note that only one of the
     * fragments will be used, but it's difficult to determine which one during
     * child layout, and this doesn't generate too many fragments in practice.
     */
    needBaseline: boolean;
    /**
     * An ancestor has established text decorations. Reset by out of flow elements
     * and inline-blocks.
     */
    isDecorating: boolean;
}
export declare class BlockFormattingContext {
    inlineSize: number;
    fctx?: FloatContext;
    stack: (BlockContainer | {
        post: BlockContainer;
    })[];
    cbBlockStart: number;
    cbLineLeft: number;
    cbLineRight: number;
    private sizeStack;
    private offsetStack;
    private last;
    private level;
    private hypotheticals;
    private margin;
    constructor(inlineSize: number);
    collapseStart(layout: Layout, box: BlockLevel): void;
    boxStart(layout: Layout, box: BlockContainer, ctx: LayoutContext): void;
    boxEnd(layout: Layout, box: BlockContainer): void;
    boxAtomic(layout: Layout, box: BlockLevel): void;
    getLocalVacancyForLine(bfc: BlockFormattingContext, blockOffset: number, blockSize: number, vacancy: IfcVacancy): void;
    ensureFloatContext(blockOffset: number): FloatContext;
    finalize(box: BlockContainer): void;
    positionBlockContainers(): void;
}
declare class FloatSide {
    items: BlockLevel[];
    shelfBlockOffset: number;
    shelfTrackIndex: number;
    blockOffsets: number[];
    inlineSizes: number[];
    inlineOffsets: number[];
    floatCounts: number[];
    constructor(blockOffset: number);
    initialize(blockOffset: number): void;
    repr(): string;
    getSizeOfTracks(start: number, end: number, inlineOffset: number): number;
    getOverflow(): number;
    getFloatCountOfTracks(start: number, end: number): number;
    getEndTrack(start: number, blockOffset: number, blockSize: number): number;
    getTrackRange(blockOffset: number, blockSize?: number): [number, number];
    getOccupiedSpace(blockOffset: number, blockSize: number, inlineOffset: number): number;
    boxStart(blockOffset: number): void;
    dropShelf(blockOffset: number): void;
    getNextTrackOffset(): number;
    getBottom(): number;
    splitTrack(trackIndex: number, blockOffset: number): void;
    splitIfShelfDropped(): void;
    placeFloat(box: BlockLevel, vacancy: IfcVacancy, cbLineLeft: number, cbLineRight: number): void;
}
export declare class IfcVacancy {
    leftOffset: number;
    rightOffset: number;
    inlineSize: number;
    blockOffset: number;
    leftFloatCount: number;
    rightFloatCount: number;
    static EPSILON: number;
    constructor(leftOffset: number, rightOffset: number, blockOffset: number, inlineSize: number, leftFloatCount: number, rightFloatCount: number);
    fits(inlineSize: number): boolean;
    hasFloats(): boolean;
}
export declare class FloatContext {
    bfc: BlockFormattingContext;
    leftFloats: FloatSide;
    rightFloats: FloatSide;
    misfits: BlockLevel[];
    constructor(bfc: BlockFormattingContext, blockOffset: number);
    boxStart(): void;
    getVacancyForLine(blockOffset: number, blockSize: number): IfcVacancy;
    getVacancyForBox(box: BlockLevel, lineWidth: number): IfcVacancy;
    getLeftBottom(): number;
    getRightBottom(): number;
    getBothBottom(): number;
    findLinePosition(blockOffset: number, blockSize: number, inlineSize: number): IfcVacancy;
    placeFloat(lineWidth: number, lineIsEmpty: boolean, box: BlockLevel): void;
    consumeMisfits(): void;
    dropShelf(blockOffset: number): void;
    postLine(line: Linebox, didBreak: boolean): void;
    preTextContent(): void;
}
export type BlockContainer = BlockContainerOfInlines | BlockContainerOfBlocks;
export declare abstract class BlockContainerBase extends FormattingBox {
    static ATTRS: {
        isInline: number;
        isBfcRoot: number;
        isAnonymous: number;
        enableLogging: number;
    };
    getLogSymbol(): "◼︎" | "○︎" | "▬";
    logName(log: Logger): void;
    getContainingBlockToContent(containingBlock: BoxArea): {
        blockStart: number;
        lineLeft: number;
        lineRight: number;
    };
    isBlockContainer(): this is BlockContainerBase;
    isInlineLevel(): boolean;
    isBfcRoot(): boolean;
    loggingEnabled(): boolean;
    canCollapseThrough(layout: Layout): boolean;
    propagate(parent: Box): void;
    hasBackground(): boolean;
    hasForeground(): boolean;
}
export declare class BlockContainerOfInlines extends BlockContainerBase {
    text: string;
    buffer: AllocatedUint16Array;
    items: ShapedItem[];
    fragments: InlineFragment[];
    constructor(style: Style, attrs: number);
    prelayoutPostorder(layout: Layout, ctx: PrelayoutContext): void;
    positionItemsPostlayout(layout: Layout): void;
    postlayoutPreorder(layout: Layout): void;
    postlayoutPostorder(): void;
    isBlockContainerOfInlines(): this is BlockContainerOfInlines;
    getRunIndex(layout: Layout, ci: number): number | undefined;
    loggingEnabled(): boolean;
    sliceRenderText(layout: Layout, item: ShapedItem, start: number, end: number): string;
    shouldLayoutContent(layout: Layout): number;
    doTextLayout(layout: Layout, ctx: LayoutContext): void;
}
export type BlockLevel = BlockContainer | ReplacedBox;
export declare class BlockContainerOfBlocks extends BlockContainerBase {
    __isBlockContainerOfBlocks(): void;
    isBlockContainerOfBlocks(): this is BlockContainerOfBlocks;
}
export declare function layoutBlockLevelBox(layout: Layout, box: BlockLevel, ctx: LayoutContext): void;
export declare function layoutContribution(layout: Layout, box: BlockLevel, mode: 'min-content' | 'max-content'): number;
export declare function layoutFloatBox(layout: Layout, box: BlockLevel, ctx: LayoutContext): void;
export declare class Break extends TreeNode {
    className: string;
    isBreak(): this is Break;
    getLogSymbol(): string;
    logName(log: Logger): void;
    propagate(parent: Box): void;
}
export declare class Inline extends Box {
    textStart: number;
    textEnd: number;
    constructor(style: Style, attrs: number);
    propagate(parent: Box): void;
    hasText(): number;
    hasSoftWrap(): number;
    hasWordSpacing(): number;
    hasFloatOrReplaced(): number;
    hasBreakOrInlineOrReplaced(): number;
    hasComplexText(): number;
    hasSoftHyphen(): number;
    hasNewlines(): number;
    hasPaintedInlines(): number;
    hasInlineBlocks(): number;
    hasSizedInline(): number;
    hasLineLeftGap(containingBlock: BoxArea): boolean | undefined;
    hasLineRightGap(containingBlock: BoxArea): boolean | undefined;
    getInlineStartSize(containingBlock: BoxArea): number;
    getInlineEndSize(containingBlock: BoxArea): number;
    isInline(): this is Inline;
    isInlineLevel(): boolean;
    getLogSymbol(): string;
    logName(log: Logger): void;
    absolutify(): void;
    hasBackground(): boolean;
    hasForeground(): boolean;
}
export declare class ReplacedBox extends FormattingBox {
    src: string;
    constructor(style: Style, src: string);
    isReplacedBox(): this is ReplacedBox;
    logName(log: Logger): void;
    getLogSymbol(): "●" | "◼️";
    hasBackground(): boolean;
    hasForeground(): boolean;
    getImage(): import("./layout-image.ts").Image | undefined;
    getIntrinsicIsize(): number;
    getIntrinsicBsize(): number;
    getRatio(): number;
    propagate(parent: Box): void;
    getDefiniteInnerInlineSize(): number;
    getDefiniteInnerBlockSize(): number;
}
export type InlineLevel = Inline | Run | Break | BlockContainer | ReplacedBox;
type InlineIteratorBuffered = {
    state: 'pre' | 'post';
    item: Inline;
} | {
    state: 'text';
    item: Run;
    index: number;
} | {
    state: 'box';
    item: BlockLevel;
} | {
    state: 'break';
    index: number;
} | {
    state: 'breakop';
};
type InlineIteratorValue = InlineIteratorBuffered | {
    state: 'breakspot';
};
interface InlineIteratorState {
    value: InlineIteratorValue | null;
    block: BlockContainerOfInlines;
    layout: Layout;
    index: number;
    minlevel: number;
    breakspotIndex: number;
    buffered: InlineIteratorBuffered[];
    parents: Inline[];
    isInlineBlock: boolean;
}
export declare function createInlineIteratorState(layout: Layout, block: BlockContainerOfInlines): InlineIteratorState;
export declare function inlineIteratorStateNext(state: InlineIteratorState): void;
export declare function generateBlockContainer(tree: InlineLevel[], el: HTMLElement): BlockContainer;
export {};

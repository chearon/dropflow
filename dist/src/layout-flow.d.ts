import { HTMLElement } from './dom.js';
import { Style } from './style.js';
import { InlineMetrics, Linebox, Paragraph, Run } from './layout-text.js';
import { Box, BoxArea, RenderItem } from './layout-box.js';
export interface LayoutContext {
    lastBlockContainerArea: BoxArea;
    lastPositionedArea: BoxArea;
    mode: 'min-content' | 'max-content' | 'normal';
    bfc: BlockFormattingContext;
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
    boxStart(box: BlockContainer, ctx: LayoutContext): void;
    boxEnd(box: BlockContainer): void;
    getLocalVacancyForLine(bfc: BlockFormattingContext, blockOffset: number, blockSize: number, vacancy: IfcVacancy): void;
    ensureFloatContext(blockOffset: number): FloatContext;
    finalize(box: BlockContainer): void;
    positionBlockContainers(): void;
}
declare class FloatSide {
    items: BlockContainer[];
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
    placeFloat(box: BlockContainer, vacancy: IfcVacancy, cbLineLeft: number, cbLineRight: number): void;
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
    misfits: BlockContainer[];
    constructor(bfc: BlockFormattingContext, blockOffset: number);
    boxStart(): void;
    getVacancyForLine(blockOffset: number, blockSize: number): IfcVacancy;
    getVacancyForBox(box: BlockContainer, lineWidth: number): IfcVacancy;
    getLeftBottom(): number;
    getRightBottom(): number;
    getBothBottom(): number;
    findLinePosition(blockOffset: number, blockSize: number, inlineSize: number): IfcVacancy;
    placeFloat(lineWidth: number, lineIsEmpty: boolean, box: BlockContainer): void;
    consumeMisfits(): void;
    dropShelf(blockOffset: number): void;
    postLine(line: Linebox, didBreak: boolean): void;
    preTextContent(): void;
}
export interface BlockContainerOfInlines extends BlockContainer {
    children: IfcInline[];
}
export interface BlockContainerOfBlockContainers extends BlockContainer {
    children: BlockContainer[];
}
export declare class BlockContainer extends Box {
    children: IfcInline[] | BlockContainer[];
    borderArea: BoxArea;
    paddingArea: BoxArea;
    contentArea: BoxArea;
    constructor(style: Style, children: IfcInline[] | BlockContainer[], attrs: number);
    fillAreas(): void;
    sym(): "○︎" | "▬" | "◼︎";
    desc(): string;
    get writingModeAsParticipant(): import("./style.js").WritingMode;
    get directionAsParticipant(): import("./style.js").Direction;
    setBlockPosition(position: number): void;
    setBlockSize(size: number): void;
    setInlinePosition(lineLeft: number): void;
    setInlineOuterSize(size: number): void;
    getContainingBlockToContent(): {
        blockStart: number;
        lineLeft: number;
        lineRight: number;
    };
    getDefiniteInlineSize(): number | undefined;
    getMarginsAutoIsZero(): {
        blockStart: number;
        lineRight: number;
        blockEnd: number;
        lineLeft: number;
    };
    getLastBaseline(): number | undefined;
    assignContainingBlocks(ctx: LayoutContext): void;
    isBlockContainer(): this is BlockContainer;
    isInlineLevel(): boolean;
    isBfcRoot(): boolean;
    isFloat(): boolean;
    isInlineBlock(): boolean;
    loggingEnabled(): boolean;
    isBlockContainerOfInlines(): this is BlockContainerOfInlines;
    canCollapseThrough(): boolean;
    isBlockContainerOfBlockContainers(): this is BlockContainerOfBlockContainers;
    preprocess(): void;
    postprocess(): void;
    doTextLayout(ctx: LayoutContext): void;
}
export declare function layoutBlockBox(box: BlockContainer, ctx: LayoutContext): void;
export declare function layoutFloatBox(box: BlockContainer, ctx: LayoutContext): void;
export declare class Break extends RenderItem {
    className: string;
    isBreak(): this is Break;
    sym(): string;
    desc(): string;
}
export declare class Inline extends Box {
    children: InlineLevel[];
    nshaped: number;
    metrics: InlineMetrics;
    start: number;
    end: number;
    constructor(start: number, end: number, style: Style, children: InlineLevel[], attrs: number);
    preprocess(): void;
    postprocess(): void;
    hasLineLeftGap(): boolean | undefined;
    hasLineRightGap(): boolean | undefined;
    getLineLeftMarginBorderPadding(ifc: IfcInline): number;
    getLineRightMarginBorderPadding(ifc: IfcInline): number;
    isInline(): this is Inline;
    sym(): string;
    desc(): string;
    assignContainingBlocks(ctx: LayoutContext): void;
    absolutify(): void;
}
export declare class IfcInline extends Inline {
    children: InlineLevel[];
    text: string;
    paragraph: Paragraph;
    private analysis;
    static ANALYSIS_HAS_TEXT: number;
    static ANALYSIS_WRAPS: number;
    static ANALYSIS_WS_COLLAPSES: number;
    static ANALYSIS_HAS_INLINES: number;
    static ANALYSIS_HAS_BREAKS: number;
    static ANALYSIS_IS_COMPLEX_TEXT: number;
    static ANALYSIS_HAS_SOFT_HYPHEN: number;
    static ANALYSIS_HAS_FLOATS: number;
    static ANALYSIS_HAS_NEWLINES: number;
    static ANALYSIS_HAS_PAINTED_INLINES: number;
    static ANALYSIS_HAS_POSITIONED_INLINE: number;
    static ANALYSIS_HAS_INLINE_BLOCKS: number;
    static ANALYSIS_HAS_TEXT_OR_SIZED_INLINE: number;
    static ANALYSIS_HAS_COLORED_INLINE: number;
    constructor(style: Style, text: string, children: InlineLevel[], attrs: number);
    isIfcInline(): this is IfcInline;
    get writingModeAsParticipant(): import("./style.js").WritingMode;
    loggingEnabled(): boolean;
    private prepare;
    preprocess(): void;
    postprocess(): void;
    shouldLayoutContent(): number;
    doTextLayout(ctx: LayoutContext): void;
    hasText(): number;
    wraps(): number;
    collapses(): number;
    hasFloats(): number;
    hasInlines(): number;
    hasBreaks(): number;
    isComplexText(): number;
    hasSoftHyphen(): number;
    hasNewlines(): number;
    hasPaintedInlines(): number;
    hasPositionedInline(): number;
    hasInlineBlocks(): number;
    hasTextOrSizedInline(): number;
    hasColoredInline(): number;
}
export type InlineLevel = Inline | BlockContainer | Run | Break;
type InlineIteratorBuffered = {
    state: 'pre' | 'post';
    item: Inline;
} | {
    state: 'text';
    item: Run;
} | {
    state: 'block';
    item: BlockContainer;
} | {
    state: 'break';
} | {
    state: 'breakop';
};
type InlineIteratorValue = InlineIteratorBuffered | {
    state: 'breakspot';
};
export declare function createInlineIterator(inline: IfcInline): {
    next: () => {
        done: true;
    } | {
        done: false;
        value: InlineIteratorValue;
    };
};
export declare function createPreorderInlineIterator(inline: IfcInline): {
    next: () => {
        done: true;
    } | {
        done: false;
        value: Inline | Run;
    };
};
export declare function generateBlockContainer(el: HTMLElement): BlockContainer;
export {};

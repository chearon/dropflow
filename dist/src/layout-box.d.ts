import { Logger } from './util.ts';
import type { Style } from './style.ts';
import type { Run } from './layout-text.ts';
import type { InlineLevel, Break, Inline, BlockContainer, BlockContainerBase, BlockContainerOfInlines, BlockContainerOfBlocks, ReplacedBox } from './layout-flow.ts';
export interface LogicalArea {
    blockStart: number | undefined;
    lineLeft: number | undefined;
    blockSize: number | undefined;
    inlineSize: number | undefined;
}
export interface TreeLogOptions {
    containingBlocks?: boolean;
    css?: keyof Style;
    paragraphText?: string;
    bits?: boolean;
}
export interface PrelayoutContext {
    lastBlockContainerArea: BoxArea;
    lastPositionedArea: BoxArea;
}
export declare abstract class TreeNode {
    style: Style;
    constructor(style: Style);
    isBlockContainer(): this is BlockContainerBase;
    isBlockContainerOfInlines(): this is BlockContainerOfInlines;
    isBlockContainerOfBlocks(): this is BlockContainerOfBlocks;
    isFormattingBox(): this is FormattingBox;
    isReplacedBox(): this is ReplacedBox;
    isRun(): this is Run;
    isInline(): this is Inline;
    isBreak(): this is Break;
    isBox(): this is Box;
    abstract logName(log: Logger, options?: TreeLogOptions): void;
    abstract getLogSymbol(): string;
    /**
     * Typically the time to assign the containing block
     */
    prelayoutPreorder(ctx: PrelayoutContext): void;
    /**
     * Typically the time to shape text and gather font metrics
     */
    prelayoutPostorder(layout: Layout, ctx: PrelayoutContext): void;
    /**
     * Typically the time to absolutize relative coordinates
     */
    postlayoutPreorder(layout: Layout): void;
    /**
     * Typically the time to snap pixels
     */
    postlayoutPostorder(): void;
}
export declare abstract class Box extends TreeNode {
    /**
     * General boolean bitfield shared by all box subclasses. The bits labeled
     * with "has" say something about their content to allow for optimizations.
     * They propagate through to parents of the same type, though some of them
     * do so conditionally.
     */
    bitfield: number;
    treeStart: number;
    treeFinal: number;
    private area;
    /**
     * Bitfield allocations. Box subclasses with different inheritance are allowed
     * to overlap attribute bits or propagate target bits. It's easier to keep
     * these all in one place than try to define them on the subclasses.
     */
    static BITS: {
        isAnonymous: number;
        enableLogging: number;
        reserved1: number;
        reserved2: number;
        hasBackgroundInLayer: number;
        hasForegroundInLayer: number;
        hasBackgroundInDescendent: number;
        hasForegroundInDescendent: number;
        isInline: number;
        isBfcRoot: number;
        hasText: number;
        hasComplexText: number;
        hasSoftHyphen: number;
        hasNewlines: number;
        hasSoftWrap: number;
        hasWordSpacing: number;
        hasPaintedInlines: number;
        hasSizedInline: number;
        hasBreakInlineOrReplaced: number;
        hasFloatOrReplaced: number;
        hasInlineBlocks: number;
    };
    /**
     * Use this, not BITS, for the ctor! BITS are ~private
     */
    static ATTRS: {
        isAnonymous: number;
        enableLogging: number;
    };
    static PROPAGATES_TO_INLINE_BITS: number;
    constructor(style: Style, attrs: number);
    id(): number;
    getBorderArea(): BoxArea;
    getPaddingArea(): BoxArea;
    getContentArea(): BoxArea;
    getContainingBlock(): BoxArea;
    prelayoutPreorder(ctx: PrelayoutContext): void;
    /**
     * Assign the offsets of the border and padding areas from the content area,
     * as defined by the style. This is the first layout step, and block
     * containers must have been laid out for percentages to work.
     */
    fillAreas(containingBlock: BoxArea): void;
    setBlockPosition(position: number): void;
    setBlockSize(containingBlock: BoxArea, size: number): void;
    setInlinePosition(lineLeft: number): void;
    setInlineOuterSize(containingBlock: BoxArea, size: number): void;
    getWritingModeAsParticipant(containingBlock: BoxArea): import("./style.ts").WritingMode;
    getDirectionAsParticipant(containingBlock: BoxArea): import("./style.ts").Direction;
    propagate(parent: Box): void;
    isBox(): this is Box;
    isAnonymous(): boolean;
    isPositioned(): boolean;
    abstract isInlineLevel(): boolean;
    isStackingContextRoot(): boolean;
    /**
     * A layer is a stacking context root or an element that CSS 2.1 appendix E
     * says to treat like one.
     */
    isLayerRoot(): boolean;
    isDecoratingBox(): boolean;
    /**
     * Does this paint anything in the background layer? Borders, box-shadow, etc.
     */
    abstract hasBackground(): boolean;
    /**
     * Does this paint anything in the foreground layer? Text, images, etc.
     */
    abstract hasForeground(): boolean;
    /**
     * There is a background in some descendent that is part of the same paint
     * layer (not necessarily in the subject). (See also isLayerRoot).
     *
     * A background is a background-color or anything CSS 2.1 appendix E groups
     * with it.
     */
    hasBackgroundInLayerRoot(): boolean;
    /**
     * There is a foreground in some descendent that is part of the same paint
     * layer (not necessarily in the subject). (See also isLayerRoot).
     *
     * A foreground is a text run or anything CSS 2.1 appendix E groups with it
     */
    hasForegroundInLayerRoot(): boolean;
    /**
     * There is a background somewhere beneath this node
     *
     * A background is a background-color or anything CSS 2.1 appendix E groups
     * with it
     */
    hasBackgroundInDescendent(): boolean;
    /**
     * There is a foreground somewhere beneath this node
     *
     * A foreground is a text run or anything CSS 2.1 appendix E groups with it
     */
    hasForegroundInDescendent(): boolean;
    postlayoutPreorder(layout: Layout): void;
    postlayoutPostorder(): void;
    getRelativeVerticalShift(containingBlock: BoxArea): number;
    getRelativeHorizontalShift(containingBlock: BoxArea): number;
    logName(log: Logger, options?: TreeLogOptions): void;
    getLogSymbol(): string;
    stringifyBitfield(): string;
}
/**
 * Base class for BlockContainer, ReplacedBox, and theoretically, GridContainer
 * and FlexContainer. Subclasses are all able to establish their own independent
 * formatting contexts (replaced boxes arguably, not officially, do so) whereas
 * Inlines cannot.
 */
export declare abstract class FormattingBox extends Box {
    static ATTRS: {
        isAnonymous: number;
        enableLogging: number;
    };
    isFormattingBox(): this is FormattingBox;
    getDefiniteInnerInlineSize(containingBlock: BoxArea): number | undefined;
    getDefiniteOuterInlineSize(containingBlock: BoxArea): number | undefined;
    getDefiniteInnerBlockSize(containingBlock: BoxArea): number | undefined;
    getMarginsAutoIsZero(containingBlock: BoxArea): {
        blockStart: number;
        lineRight: number;
        blockEnd: number;
        lineLeft: number;
    };
    canCollapseThrough(layout: Layout): boolean;
    isFloat(): boolean;
    isOutOfFlow(): boolean;
    propagate(parent: Box): void;
    isInlineLevel(): boolean;
}
export declare class BoxArea {
    parent: BoxArea | null;
    box: Box;
    blockStart: number;
    blockSize: number;
    lineLeft: number;
    inlineSize: number;
    constructor(box: Box, x?: number, y?: number, w?: number, h?: number);
    clone(): BoxArea;
    getEstablishedWritingMode(): import("./style.ts").WritingMode;
    getEstablishedDirection(): import("./style.ts").Direction;
    get x(): number;
    set x(x: number);
    get y(): number;
    set y(y: number);
    get width(): number;
    get height(): number;
    setParent(p: BoxArea): void;
    inlineSizeForPotentiallyOrthogonal(box: FormattingBox): number;
    absolutify(): void;
    snapPixels(): void;
    repr(indent?: number): string;
}
export declare function prelayout(layout: Layout, icb: BoxArea): void;
export declare function postlayout(layout: Layout): void;
export declare function log(layout: Layout, logger?: Logger, options?: TreeLogOptions): void;
export declare class Layout {
    tree: InlineLevel[];
    constructor(tree: InlineLevel[]);
    root(): BlockContainer;
}

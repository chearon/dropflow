import { Style } from './style.js';
import { Run } from './layout-text.js';
import { Break, Inline, IfcInline, BlockContainer } from './layout-flow.js';
export interface LogicalArea {
    blockStart: number | undefined;
    lineLeft: number | undefined;
    blockSize: number | undefined;
    inlineSize: number | undefined;
}
export interface ReprOptions {
    containingBlocks?: boolean;
    css?: keyof Style;
    paragraphText?: string;
}
export declare abstract class RenderItem {
    style: Style;
    constructor(style: Style);
    isBlockContainer(): this is BlockContainer;
    isRun(): this is Run;
    isInline(): this is Inline;
    isBreak(): this is Break;
    isIfcInline(): this is IfcInline;
    isBox(): this is Box;
    abstract desc(options?: ReprOptions): string;
    abstract sym(): string;
    repr(indent?: number, options?: ReprOptions): string;
}
export declare class Box extends RenderItem {
    id: string;
    children: RenderItem[];
    attrs: number;
    containingBlock: BoxArea;
    static ATTRS: {
        isAnonymous: number;
        isInline: number;
        isBfcRoot: number;
        enableLogging: number;
    };
    constructor(style: Style, children: RenderItem[], attrs: number);
    isBox(): this is Box;
    isAnonymous(): boolean;
    isPositioned(): boolean;
    isStackingContextRoot(): boolean;
    isPaintRoot(): boolean;
    getRelativeVerticalShift(): number;
    getRelativeHorizontalShift(): number;
    desc(options?: ReprOptions): string;
    sym(): string;
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
    get writingMode(): import("./style.js").WritingMode;
    get direction(): import("./style.js").Direction;
    get x(): number;
    set x(x: number);
    get y(): number;
    set y(y: number);
    get width(): number;
    get height(): number;
    setParent(p: BoxArea): void;
    inlineSizeForPotentiallyOrthogonal(box: BlockContainer): number;
    absolutify(): void;
    repr(indent?: number): string;
}

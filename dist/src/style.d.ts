import { HTMLElement, TextNode } from './dom.ts';
import { BoxArea } from './layout-box.ts';
import type { InlineMetrics } from './layout-text.ts';
export declare const inherited: unique symbol;
type Inherited = typeof inherited;
export declare const initial: unique symbol;
type Initial = typeof initial;
export type WhiteSpace = 'normal' | 'nowrap' | 'pre-wrap' | 'pre-line' | 'pre';
type Length = number | {
    value: number;
    unit: 'em';
};
type Percentage = {
    value: number;
    unit: '%';
};
type Number = {
    value: number;
    unit: null;
};
export type FontWeight = number | 'normal' | 'bold' | 'bolder' | 'lighter';
export type FontStyle = 'normal' | 'italic' | 'oblique';
export type FontVariant = 'normal' | 'small-caps';
export type FontStretch = 'normal' | 'ultra-condensed' | 'extra-condensed' | 'condensed' | 'semi-condensed' | 'semi-expanded' | 'expanded' | 'extra-expanded' | 'ultra-expanded';
type VerticalAlign = 'baseline' | 'middle' | 'sub' | 'super' | 'text-top' | 'text-bottom' | Length | Percentage | 'top' | 'bottom';
type BackgroundClip = 'border-box' | 'padding-box' | 'content-box';
export type Direction = 'ltr' | 'rtl';
type Display = {
    outer: OuterDisplay;
    inner: InnerDisplay;
};
export type WritingMode = 'horizontal-tb' | 'vertical-lr' | 'vertical-rl';
type Position = 'absolute' | 'relative' | 'static';
export type ColorLiteral = {
    r: number;
    g: number;
    b: number;
    a: number;
};
type Color = ColorLiteral | 'currentcolor';
type OuterDisplay = 'inline' | 'block' | 'none';
type InnerDisplay = 'flow' | 'flow-root' | 'none';
type BorderStyle = 'none' | 'hidden' | 'dotted' | 'dashed' | 'solid' | 'double' | 'groove' | 'ridge' | 'inset' | 'outset';
type BoxSizing = 'border-box' | 'content-box' | 'padding-box';
export type TextAlign = 'start' | 'end' | 'left' | 'right' | 'center' | 'justify';
type Float = 'left' | 'right' | 'none';
type Clear = 'left' | 'right' | 'both' | 'none';
export interface DeclaredStyleProperties {
    zoom?: number | Percentage | Inherited | Initial;
    whiteSpace?: WhiteSpace | Inherited | Initial;
    color?: Color | Inherited | Initial;
    fontSize?: Length | Percentage | Inherited | Initial;
    fontWeight?: FontWeight | Inherited | Initial;
    fontVariant?: FontVariant | Inherited | Initial;
    fontStyle?: FontStyle | Inherited | Initial;
    fontStretch?: FontStretch | Inherited | Initial;
    fontFamily?: string[] | Inherited | Initial;
    lineHeight?: 'normal' | Length | Percentage | Number | Inherited | Initial;
    verticalAlign?: VerticalAlign;
    backgroundColor?: Color | Inherited | Initial;
    backgroundClip?: BackgroundClip | Inherited | Initial;
    display?: Display | Inherited | Initial;
    direction?: Direction | Inherited | Initial;
    writingMode?: WritingMode | Inherited | Initial;
    borderTopWidth?: number | Inherited | Initial;
    borderRightWidth?: number | Inherited | Initial;
    borderBottomWidth?: number | Inherited | Initial;
    borderLeftWidth?: number | Inherited | Initial;
    borderTopStyle?: BorderStyle | Inherited | Initial;
    borderRightStyle?: BorderStyle | Inherited | Initial;
    borderBottomStyle?: BorderStyle | Inherited | Initial;
    borderLeftStyle?: BorderStyle | Inherited | Initial;
    borderTopColor?: Color | Inherited | Initial;
    borderRightColor?: Color | Inherited | Initial;
    borderBottomColor?: Color | Inherited | Initial;
    borderLeftColor?: Color | Inherited | Initial;
    paddingTop?: Length | Percentage | Inherited | Initial;
    paddingRight?: Length | Percentage | Inherited | Initial;
    paddingBottom?: Length | Percentage | Inherited | Initial;
    paddingLeft?: Length | Percentage | Inherited | Initial;
    marginTop?: Length | Percentage | 'auto' | Inherited | Initial;
    marginRight?: Length | Percentage | 'auto' | Inherited | Initial;
    marginBottom?: Length | Percentage | 'auto' | Inherited | Initial;
    marginLeft?: Length | Percentage | 'auto' | Inherited | Initial;
    tabSize?: Length | Number | Inherited | Initial;
    position?: Position | Inherited | Initial;
    width?: Length | Percentage | 'auto' | Inherited | Initial;
    height?: Length | Percentage | 'auto' | Inherited | Initial;
    top?: Length | Percentage | 'auto' | Inherited | Initial;
    right?: Length | Percentage | 'auto' | Inherited | Initial;
    bottom?: Length | Percentage | 'auto' | Inherited | Initial;
    left?: Length | Percentage | 'auto' | Inherited | Initial;
    boxSizing?: BoxSizing | Inherited | Initial;
    textAlign?: TextAlign | Inherited | Initial;
    float?: Float | Inherited | Initial;
    clear?: Clear | Inherited | Initial;
    zIndex?: number | 'auto' | Inherited | Initial;
    wordBreak?: 'break-word' | 'normal' | Inherited | Initial;
    overflowWrap?: 'anywhere' | 'break-word' | 'normal' | Inherited | Initial;
    overflow?: 'visible' | 'hidden' | Inherited | Initial;
    wordSpacing?: 'normal' | Length | Percentage;
    textDecorationLine?: 'none' | 'underline' | 'overline' | 'line-through';
    textDecorationStyle?: 'solid';
    textDecorationColor?: Color;
}
/**
 * A DeclaredStyle is either a user-created declared style (createDeclaredStyle)
 * or a cascade of them (createCascadedStyle).
 */
export declare class DeclaredStyle {
    properties: DeclaredStyleProperties;
    private composition;
    id: number;
    nextInCache: DeclaredStyle | null;
    constructor(properties: DeclaredStyleProperties, composition?: readonly number[]);
    /** `styles` must be sorted */
    isComposedOf(styles: DeclaredStyle[]): boolean;
}
export declare function createDeclaredStyle(properties: DeclaredStyleProperties): DeclaredStyle;
export declare const EMPTY_STYLE: DeclaredStyle;
interface ComputedStyle {
    zoom: number;
    whiteSpace: WhiteSpace;
    color: Color;
    fontSize: number;
    fontWeight: number;
    fontVariant: FontVariant;
    fontStyle: FontStyle;
    fontStretch: FontStretch;
    fontFamily: string[];
    lineHeight: 'normal' | number | {
        value: number;
        unit: null;
    };
    verticalAlign: VerticalAlign;
    backgroundColor: Color;
    backgroundClip: BackgroundClip;
    display: Display;
    direction: Direction;
    writingMode: WritingMode;
    borderTopWidth: number;
    borderRightWidth: number;
    borderBottomWidth: number;
    borderLeftWidth: number;
    borderTopStyle: BorderStyle;
    borderRightStyle: BorderStyle;
    borderBottomStyle: BorderStyle;
    borderLeftStyle: BorderStyle;
    borderTopColor: Color;
    borderRightColor: Color;
    borderBottomColor: Color;
    borderLeftColor: Color;
    paddingTop: number | Percentage;
    paddingRight: number | Percentage;
    paddingBottom: number | Percentage;
    paddingLeft: number | Percentage;
    marginTop: number | Percentage | 'auto';
    marginRight: number | Percentage | 'auto';
    marginBottom: number | Percentage | 'auto';
    marginLeft: number | Percentage | 'auto';
    tabSize: number | Number;
    position: Position;
    width: number | Percentage | 'auto';
    height: number | Percentage | 'auto';
    top: number | Percentage | 'auto';
    right: number | Percentage | 'auto';
    bottom: number | Percentage | 'auto';
    left: number | Percentage | 'auto';
    boxSizing: BoxSizing;
    textAlign: TextAlign;
    float: Float;
    clear: Clear;
    zIndex: number | 'auto';
    wordBreak: 'break-word' | 'normal';
    overflowWrap: 'anywhere' | 'break-word' | 'normal';
    overflow: 'visible' | 'hidden';
    wordSpacing: 'normal' | number | Percentage;
    textDecorationLine: 'none' | 'underline' | 'overline' | 'line-through';
    textDecorationStyle: 'solid';
    textDecorationColor: Color;
}
export declare class Style {
    id: number;
    computed: ComputedStyle;
    blockified: boolean;
    metrics: InlineMetrics;
    parentId: number;
    cascadeId: number;
    nextInCache: Style | null;
    zoom: number;
    whiteSpace: WhiteSpace;
    color: ColorLiteral;
    fontSize: number;
    fontWeight: number;
    fontVariant: FontVariant;
    fontStyle: FontStyle;
    fontStretch: FontStretch;
    fontFamily: string[];
    lineHeight: 'normal' | number;
    verticalAlign: VerticalAlign;
    backgroundColor: ColorLiteral;
    backgroundClip: BackgroundClip;
    display: Display;
    direction: Direction;
    writingMode: WritingMode;
    borderTopWidth: number;
    borderRightWidth: number;
    borderBottomWidth: number;
    borderLeftWidth: number;
    borderTopStyle: BorderStyle;
    borderRightStyle: BorderStyle;
    borderBottomStyle: BorderStyle;
    borderLeftStyle: BorderStyle;
    borderTopColor: ColorLiteral;
    borderRightColor: ColorLiteral;
    borderBottomColor: ColorLiteral;
    borderLeftColor: ColorLiteral;
    paddingTop: number | Percentage;
    paddingRight: number | Percentage;
    paddingBottom: number | Percentage;
    paddingLeft: number | Percentage;
    marginTop: number | Percentage | 'auto';
    marginRight: number | Percentage | 'auto';
    marginBottom: number | Percentage | 'auto';
    marginLeft: number | Percentage | 'auto';
    tabSize: number | Number;
    position: Position;
    width: number | Percentage | 'auto';
    height: number | Percentage | 'auto';
    top: number | Percentage | 'auto';
    right: number | Percentage | 'auto';
    bottom: number | Percentage | 'auto';
    left: number | Percentage | 'auto';
    boxSizing: BoxSizing;
    textAlign: TextAlign;
    float: Float;
    clear: Clear;
    zIndex: number | 'auto';
    wordBreak: 'break-word' | 'normal';
    overflowWrap: 'anywhere' | 'break-word' | 'normal';
    overflow: 'visible' | 'hidden';
    wordSpacing: 'normal' | number | Percentage;
    textDecorationLine: 'none' | 'underline' | 'overline' | 'line-through';
    textDecorationStyle: 'solid';
    textDecorationColor: ColorLiteral;
    private usedLineHeight;
    private usedLength;
    private usedBorderLength;
    private usedMaybeLength;
    private usedColor;
    constructor(style: ComputedStyle, parent?: Style, cascadedStyle?: DeclaredStyle);
    blockify(): void;
    getTextAlign(): "left" | "right" | "center" | "justify";
    isOutOfFlow(): boolean;
    isWsCollapsible(): boolean;
    hasPaddingArea(): boolean;
    hasBorderArea(): boolean;
    hasPaint(): boolean;
    getMarginBlockStart(containingBlock: BoxArea): number | "auto";
    getMarginBlockEnd(containingBlock: BoxArea): number | "auto";
    getMarginLineLeft(containingBlock: BoxArea): number | "auto";
    getMarginInlineStart(containingBlock: BoxArea, direction: Direction): number | "auto";
    getMarginLineRight(containingBlock: BoxArea): number | "auto";
    getMarginInlineEnd(containingBlock: BoxArea, direction: Direction): number | "auto";
    getPaddingBlockStart(containingBlock: BoxArea): number;
    getPaddingBlockEnd(containingBlock: BoxArea): number;
    getPaddingLineLeft(containingBlock: BoxArea): number;
    getPaddingInlineStart(containingBlock: BoxArea, direction: Direction): number;
    getPaddingLineRight(containingBlock: BoxArea): number;
    getPaddingInlineEnd(containingBlock: BoxArea, direction: Direction): number;
    getBorderBlockStartWidth(containingBlock: BoxArea): number;
    getBorderBlockEndWidth(containingBlock: BoxArea): number;
    getBorderLineLeftWidth(containingBlock: BoxArea): number;
    getBorderInlineStartWidth(containingBlock: BoxArea, direction: Direction): number;
    getBorderLineRightWidth(containingBlock: BoxArea): number;
    getBorderInlineEndWidth(containingBlock: BoxArea, direction: Direction): number;
    getBlockSize(containingBlock: BoxArea): number | "auto";
    getInlineSize(containingBlock: BoxArea): number | "auto";
    hasLineLeftGap(containingBlock: BoxArea): boolean | undefined;
    hasLineRightGap(containingBlock: BoxArea): boolean | undefined;
    fontsEqual(style: Style, size?: boolean): boolean;
    fillMetrics(): void;
}
export declare function getOriginStyle(): Style;
/**
 * Set the style that the <html> style inherits from
 *
 * Be careful calling this. It makes the inheritance style cache useless for any
 * styles created after calling it. Using it incorrectly can hurt performance.
 *
 * Currently the only legitimately known usage is to set the zoom to a desired
 * CSS-to-device pixel density (devicePixelRatio). As such, it should only be
 * called when devicePixelRatio actually changes.
 */
export declare function setOriginStyle(style: Partial<ComputedStyle>): void;
type UaDeclaredStyles = {
    [tagName: string]: DeclaredStyle;
};
export declare const uaDeclaredStyles: UaDeclaredStyles;
export declare function cascadeStyles(styles: DeclaredStyle[]): DeclaredStyle;
export declare function createStyle(parentStyle: Style, cascadedStyle: DeclaredStyle): Style;
export declare function computeElementStyle(el: HTMLElement | TextNode): void;
export {};

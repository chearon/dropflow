import { BlockContainer, IfcInline } from './layout-flow.js';
import { HTMLElement, TextNode } from './dom.js';
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
type FontWeight = number | 'normal' | 'bolder' | 'lighter';
type FontStyle = 'normal' | 'italic' | 'oblique';
type FontVariant = 'normal' | 'small-caps';
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
export type Color = {
    r: number;
    g: number;
    b: number;
    a: number;
};
type OuterDisplay = 'inline' | 'block' | 'none';
type InnerDisplay = 'flow' | 'flow-root' | 'none';
type BorderStyle = 'none' | 'hidden' | 'dotted' | 'dashed' | 'solid' | 'double' | 'groove' | 'ridge' | 'inset' | 'outset';
type BoxSizing = 'border-box' | 'content-box' | 'padding-box';
export type TextAlign = 'start' | 'end' | 'left' | 'right' | 'center';
type Float = 'left' | 'right' | 'none';
type Clear = 'left' | 'right' | 'both' | 'none';
export interface DeclaredStyle {
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
}
export declare const EMPTY_STYLE: DeclaredStyle;
type CascadedStyle = DeclaredStyle;
type RemoveUnits<T, U> = T extends number ? number : T extends {
    value: number;
    unit: infer V;
} | number ? V extends U ? number : number | {
    value: number;
    unit: Exclude<V, U>;
} : T;
type SpecifiedStyle = Required<{
    [K in keyof DeclaredStyle]: Exclude<DeclaredStyle[K], Inherited | Initial>;
}>;
type ComputedStyle = {
    [K in keyof SpecifiedStyle]: K extends 'fontSize' ? number : K extends 'lineHeight' ? 'normal' | number | {
        value: number;
        unit: null;
    } : K extends 'fontWeight' ? number : RemoveUnits<SpecifiedStyle[K], 'em'>;
};
export declare class Style implements ComputedStyle {
    whiteSpace: ComputedStyle['whiteSpace'];
    color: ComputedStyle['color'];
    fontSize: ComputedStyle['fontSize'];
    fontWeight: ComputedStyle['fontWeight'];
    fontVariant: ComputedStyle['fontVariant'];
    fontStyle: ComputedStyle['fontStyle'];
    fontStretch: ComputedStyle['fontStretch'];
    fontFamily: ComputedStyle['fontFamily'];
    lineHeight: ComputedStyle['lineHeight'];
    verticalAlign: ComputedStyle['verticalAlign'];
    backgroundColor: ComputedStyle['backgroundColor'];
    backgroundClip: ComputedStyle['backgroundClip'];
    display: ComputedStyle['display'];
    direction: ComputedStyle['direction'];
    writingMode: ComputedStyle['writingMode'];
    borderTopWidth: ComputedStyle['borderTopWidth'];
    borderRightWidth: ComputedStyle['borderRightWidth'];
    borderBottomWidth: ComputedStyle['borderBottomWidth'];
    borderLeftWidth: ComputedStyle['borderLeftWidth'];
    borderTopStyle: ComputedStyle['borderTopStyle'];
    borderRightStyle: ComputedStyle['borderRightStyle'];
    borderBottomStyle: ComputedStyle['borderBottomStyle'];
    borderLeftStyle: ComputedStyle['borderLeftStyle'];
    borderTopColor: ComputedStyle['borderTopColor'];
    borderRightColor: ComputedStyle['borderRightColor'];
    borderBottomColor: ComputedStyle['borderBottomColor'];
    borderLeftColor: ComputedStyle['borderLeftColor'];
    paddingTop: ComputedStyle['paddingTop'];
    paddingRight: ComputedStyle['paddingRight'];
    paddingBottom: ComputedStyle['paddingBottom'];
    paddingLeft: ComputedStyle['paddingLeft'];
    marginTop: ComputedStyle['marginTop'];
    marginRight: ComputedStyle['marginRight'];
    marginBottom: ComputedStyle['marginBottom'];
    marginLeft: ComputedStyle['marginLeft'];
    tabSize: ComputedStyle['tabSize'];
    position: ComputedStyle['position'];
    width: ComputedStyle['width'];
    height: ComputedStyle['height'];
    top: ComputedStyle['top'];
    right: ComputedStyle['right'];
    bottom: ComputedStyle['bottom'];
    left: ComputedStyle['left'];
    boxSizing: ComputedStyle['boxSizing'];
    textAlign: ComputedStyle['textAlign'];
    float: ComputedStyle['float'];
    clear: ComputedStyle['clear'];
    zIndex: ComputedStyle['zIndex'];
    wordBreak: ComputedStyle['wordBreak'];
    overflowWrap: ComputedStyle['overflowWrap'];
    constructor(style: ComputedStyle);
    getLineHeight(): number | "normal";
    getTextAlign(): "center" | "left" | "right";
    hasPadding(): boolean;
    hasBorder(): boolean;
    getMarginBlockStart(box: BlockContainer | IfcInline): number | "auto";
    getMarginBlockEnd(box: BlockContainer | IfcInline): number | "auto";
    getMarginLineLeft(box: BlockContainer | IfcInline): number | "auto";
    getMarginLineRight(box: BlockContainer | IfcInline): number | "auto";
    getPaddingBlockStart(box: BlockContainer | IfcInline): number;
    getPaddingBlockEnd(box: BlockContainer | IfcInline): number;
    getPaddingLineLeft(box: BlockContainer | IfcInline): number;
    getPaddingLineRight(box: BlockContainer | IfcInline): number;
    getBorderBlockStartWidth(box: BlockContainer | IfcInline): number;
    getBorderBlockEndWidth(box: BlockContainer | IfcInline): number;
    getBorderLineLeftWidth(box: BlockContainer | IfcInline): number;
    getBorderLineRightWidth(box: BlockContainer | IfcInline): number;
    getBlockSize(box: BlockContainer | IfcInline): number | "auto";
    getInlineSize(box: BlockContainer | IfcInline): number | "auto";
    hasLineLeftGap(): boolean | undefined;
    hasLineRightGap(): boolean | undefined;
}
export declare const initialStyle: Style;
type UaDeclaredStyles = {
    [tagName: string]: DeclaredStyle;
};
export declare const uaDeclaredStyles: UaDeclaredStyles;
export declare function cascadeStyles(s1: DeclaredStyle, s2: DeclaredStyle): CascadedStyle;
/**
 * Very simple property inheritance model. createStyle starts out with cascaded
 * styles (CSS Cascading and Inheritance Level 4 §4.2) which is computed from
 * the [style] HTML attribute and a default internal style. Then it calculates
 * the specified style (§4.3) by doing inheritance and defaulting, and then
 * calculates the computed style (§4.4) by resolving em, some percentages, etc.
 * Used/actual styles (§4.5, §4.6) are calculated during layout, external to
 * this file.
 */
export declare function createStyle(s1: Style, s2: CascadedStyle): Style;
export declare function getRootStyle(style?: DeclaredStyle): Style;
export declare function computeElementStyle(el: HTMLElement | TextNode): void;
export {};

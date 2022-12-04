import {Area} from './box.js';

export const inherited = Symbol('inherited');

type Inherited = typeof inherited;

export const initial = Symbol('initial');

type Initial = typeof initial;

// Cascade model. This file lets you set up a cascade of declared styles and get
// the resulting used style for a given element.
export type LogicalStyle = {
  marginBlockStart: number | 'auto',
  marginBlockEnd: number | 'auto',
  marginLineLeft: number | 'auto',
  marginLineRight: number | 'auto',
  paddingBlockStart: number,
  paddingBlockEnd: number,
  paddingLineLeft: number,
  paddingLineRight: number,
  borderBlockStartWidth: number,
  borderBlockEndWidth: number,
  borderLineLeftWidth: number,
  borderLineRightWidth: number,
  blockSize: number | 'auto',
  inlineSize: number | 'auto'
};

const LogicalMaps = Object.freeze({
  'horizontal-tb': Object.freeze({
    marginBlockStart: 'marginTop',
    marginBlockEnd: 'marginBottom',
    marginLineLeft: 'marginLeft',
    marginLineRight: 'marginRight',
    paddingBlockStart: 'paddingTop',
    paddingBlockEnd: 'paddingBottom',
    paddingLineLeft: 'paddingLeft',
    paddingLineRight: 'paddingRight',
    borderBlockStartWidth: 'borderTopWidth',
    borderBlockEndWidth: 'borderBottomWidth',
    borderLineLeftWidth: 'borderLeftWidth',
    borderLineRightWidth: 'borderRightWidth',
    blockSize: 'height',
    inlineSize: 'width'
  }),
  'vertical-lr': Object.freeze({
    marginBlockStart: 'marginLeft',
    marginBlockEnd: 'marginRight',
    marginLineLeft: 'marginTop',
    marginLineRight: 'marginBottom',
    paddingBlockStart: 'paddingLeft',
    paddingBlockEnd: 'paddingRight',
    paddingLineLeft: 'paddingTop',
    paddingLineRight: 'paddingBottom',
    borderBlockStartWidth: 'borderLeftWidth',
    borderBlockEndWidth: 'borderRightWidth',
    borderLineLeftWidth: 'borderTopWidth',
    borderLineRightWidth: 'borderBottomWidth',
    blockSize: 'width',
    inlineSize: 'height'
  }),
  'vertical-rl': Object.freeze({
    marginBlockStart: 'marginRight',
    marginBlockEnd: 'marginLeft',
    marginLineLeft: 'marginTop',
    marginLineRight: 'marginBottom',
    paddingBlockStart: 'paddingRight',
    paddingBlockEnd: 'paddingLeft',
    paddingLineLeft: 'paddingTop',
    paddingLineRight: 'paddingBottom',
    borderBlockStartWidth: 'borderRightWidth',
    borderBlockEndWidth: 'borderLeftWidth',
    borderLineLeftWidth: 'borderTopWidth',
    borderLineRightWidth: 'borderBottomWidth',
    blockSize: 'width',
    inlineSize: 'height'
  })
});

type WhiteSpace = 'normal' | 'nowrap' | 'pre-wrap' | 'pre-line' | 'pre';

type ValuePctPxEm = number | {value: number, unit: '%' | 'em'};

type ValuePctPxNone = number | {value: number, unit: '%' | null};

type ValuePctPx = number | {value: number, unit: '%'};

type ValuePxNone = number | {value: number, unit: null};

type FontWeight = number | 'normal' | 'bolder' | 'lighter';

type FontStyle = 'normal' | 'italic' | 'oblique';

type FontVariant = 'normal' | 'small-caps';

type FontStretch = 'normal' | 'ultra-condensed' | 'extra-condensed' | 'condensed'
                 | 'semi-condensed' | 'semi-expanded' | 'expanded'
                 | 'extra-expanded' | 'ultra-expanded';

type BackgroundClip = 'border-box' | 'padding-box' | 'content-box';

export type Direction = 'ltr' | 'rtl';

type Display = {outer: OuterDisplay, inner: InnerDisplay};

export type WritingMode = 'horizontal-tb' | 'vertical-lr' | 'vertical-rl';

type Position = 'absolute' | 'relative' | 'static';

export type Color = {r: number, g: number, b: number, a: number};

type OuterDisplay = 'inline' | 'block' | 'none';

type InnerDisplay = 'flow' | 'flow-root' | 'none';

type BorderStyle = 'none' | 'hiden' | 'dotted' | 'dashed' | 'solid'
  | 'double' | 'groove' | 'ridge' | 'inset' | 'outset'

type BoxSizing = 'border-box' | 'content-box' | 'padding-box';

export type TextAlign = 'start' | 'end' | 'left' | 'right' | 'center';

type Float = 'left' | 'right' | 'none';

type Clear = 'left' | 'right' | 'both' | 'none';

export type DeclaredPlainStyle = {
  whiteSpace?: WhiteSpace | Inherited | Initial;
  color?: Color | Inherited | Initial;
  fontSize?: ValuePctPxEm | Inherited | Initial;
  fontWeight?: FontWeight | Inherited | Initial;
  fontVariant?: FontVariant | Inherited | Initial;
  fontStyle?: FontStyle | Inherited | Initial;
  fontStretch?: FontStretch | Inherited | Initial;
  fontFamily?: string[] | Inherited | Initial;
  lineHeight?: 'normal' | ValuePctPxNone | Inherited | Initial;
  backgroundColor?: Color | Inherited | Initial;
  backgroundClip?: BackgroundClip | Inherited | Initial;
  display?: Display | Inherited | Initial;
  direction?: Direction | Inherited | Initial;
  writingMode?: WritingMode | Inherited | Initial;
  borderTopWidth?: number | Inherited | Initial; // TODO take off unit?
  borderRightWidth?: number | Inherited | Initial; // TODO take off unit?
  borderBottomWidth?: number | Inherited | Initial; // TODO take off unit?
  borderLeftWidth?: number | Inherited | Initial; // TODO take off unit?
  borderTopStyle?: BorderStyle | Inherited | Initial;
  borderRightStyle?: BorderStyle | Inherited | Initial;
  borderBottomStyle?: BorderStyle | Inherited | Initial;
  borderLeftStyle?: BorderStyle | Inherited | Initial;
  borderTopColor?: Color | Inherited | Initial;
  borderRightColor?: Color | Inherited | Initial;
  borderBottomColor?: Color | Inherited | Initial;
  borderLeftColor?: Color | Inherited | Initial;
  paddingTop?: ValuePctPx | Inherited | Initial;
  paddingRight?: ValuePctPx | Inherited | Initial;
  paddingBottom?: ValuePctPx | Inherited | Initial;
  paddingLeft?: ValuePctPx | Inherited | Initial;
  marginTop?: ValuePctPx | 'auto' | Inherited | Initial;
  marginRight?: ValuePctPx | 'auto' | Inherited | Initial;
  marginBottom?: ValuePctPx | 'auto' | Inherited | Initial;
  marginLeft?: ValuePctPx | 'auto' | Inherited | Initial;
  tabSize?: ValuePxNone | Inherited | Initial;
  position?: Position | Inherited | Initial;
  width?: ValuePctPx | 'auto' | Inherited | Initial;
  height?: ValuePctPx | 'auto' | Inherited | Initial;
  boxSizing?: BoxSizing | Inherited | Initial;
  textAlign?: TextAlign | Inherited | Initial;
  float?: Float | Inherited | Initial;
  clear?: Clear | Inherited | Initial;
};

export type CascadedPlainStyle = DeclaredPlainStyle;

type RemoveUnits<T, U> =
  T extends number ? number
    : T extends {value: number, unit: infer V} | number ?
      V extends U ? number : number | {value: number, unit: Exclude<V, U>}
    : T;

type SpecifiedPlainStyle = Required<{
  [K in keyof DeclaredPlainStyle]: Exclude<DeclaredPlainStyle[K], Inherited | Initial>
}>;

export type ComputedPlainStyle = {
  [K in keyof SpecifiedPlainStyle]
    : K extends 'fontSize' ? number
    : K extends 'lineHeight' ? 'normal' | number | {value: number, unit: null}
    : K extends 'fontWeight' ? number
    : RemoveUnits<SpecifiedPlainStyle[K], 'em'>
};

type KeysAre<T, U> = {[K in keyof T]: T[K] extends U ? K : never}[keyof T];

type $ValuePctPxOrAuto = KeysAre<ComputedPlainStyle, ValuePctPx | 'auto'>;

const pctWidthSide: Set<keyof BoxModelUsed> = new Set([
  'paddingLeft',
  'paddingRight',
  'paddingTop',
  'paddingBottom',
  'marginLeft',
  'marginRight',
  'marginTop',
  'marginBottom',
  'width'
]);

type BoxModelUsed = Pick<ComputedPlainStyle,
  'paddingTop' |
  'paddingRight' |
  'paddingBottom' |
  'paddingLeft' |
  'borderTopWidth' |
  'borderRightWidth' |
  'borderBottomWidth' |
  'borderLeftWidth' |
  'marginTop' |
  'marginRight' |
  'marginBottom' |
  'marginLeft' |
  'width' |
  'height'
>;

type Used = BoxModelUsed & Pick<ComputedPlainStyle, 'lineHeight' | 'textAlign'>;

export class Style implements ComputedPlainStyle {
  id: string;

  whiteSpace: ComputedPlainStyle['whiteSpace'];
  color: ComputedPlainStyle['color'];
  fontSize: ComputedPlainStyle['fontSize'];
  fontWeight: ComputedPlainStyle['fontWeight'];
  fontVariant: ComputedPlainStyle['fontVariant'];
  fontStyle: ComputedPlainStyle['fontStyle'];
  fontFamily: ComputedPlainStyle['fontFamily'];
  fontStretch: ComputedPlainStyle['fontStretch'];
  backgroundColor: ComputedPlainStyle['backgroundColor'];
  backgroundClip: ComputedPlainStyle['backgroundClip'];
  display: ComputedPlainStyle['display'];
  direction: ComputedPlainStyle['direction'];
  writingMode: ComputedPlainStyle['writingMode'];
  borderTopStyle: ComputedPlainStyle['borderTopStyle'];
  borderRightStyle: ComputedPlainStyle['borderRightStyle'];
  borderBottomStyle: ComputedPlainStyle['borderBottomStyle'];
  borderLeftStyle: ComputedPlainStyle['borderLeftStyle'];
  borderTopColor: ComputedPlainStyle['borderTopColor'];
  borderRightColor: ComputedPlainStyle['borderRightColor'];
  borderBottomColor: ComputedPlainStyle['borderBottomColor'];
  borderLeftColor: ComputedPlainStyle['borderLeftColor'];
  tabSize: ComputedPlainStyle['tabSize'];
  position: ComputedPlainStyle['position'];
  boxSizing: ComputedPlainStyle['boxSizing'];
  float: ComputedPlainStyle['float'];
  clear: ComputedPlainStyle['clear'];

  private s: Used;

  private used: Map<$ValuePctPxOrAuto, number | 'auto'>;

  constructor(id: string, style: ComputedPlainStyle) {
    this.id = id;

    // CSS properties that are already as close to the used values as they can
    // be. For example, `position: absolute; display: 
    this.whiteSpace = style.whiteSpace;
    this.color = style.color;
    this.fontSize = style.fontSize;
    this.fontWeight = style.fontWeight;
    this.fontVariant = style.fontVariant;
    this.fontStyle = style.fontStyle;
    this.fontFamily = style.fontFamily;
    this.fontStretch = style.fontStretch;
    this.backgroundColor = style.backgroundColor;
    this.backgroundClip = style.backgroundClip;
    this.display = style.display;
    this.direction = style.direction;
    this.writingMode = style.writingMode;
    this.borderTopStyle = style.borderTopStyle;
    this.borderRightStyle = style.borderRightStyle;
    this.borderBottomStyle = style.borderBottomStyle;
    this.borderLeftStyle = style.borderLeftStyle;
    this.borderTopColor = style.borderTopColor;
    this.borderRightColor = style.borderRightColor;
    this.borderBottomColor = style.borderBottomColor;
    this.borderLeftColor = style.borderLeftColor;
    this.tabSize = style.tabSize;
    this.position = style.position;
    this.boxSizing = style.boxSizing;
    this.float = style.float;
    this.clear = style.clear;

    // 
    this.s = {
      paddingTop: style.paddingTop,
      paddingRight: style.paddingRight,
      paddingBottom: style.paddingBottom,
      paddingLeft: style.paddingLeft,
      borderTopWidth: style.borderTopWidth,
      borderRightWidth: style.borderRightWidth,
      borderBottomWidth: style.borderBottomWidth,
      borderLeftWidth: style.borderLeftWidth,
      marginTop: style.marginTop,
      marginRight: style.marginRight,
      marginBottom: style.marginBottom,
      marginLeft: style.marginLeft,
      width: style.width,
      height: style.height,
      lineHeight: style.lineHeight,
      textAlign: style.textAlign
    };

    this.used = new Map();
  }

  resolvePercentages(containingBlock: Area) {
    for (const p of pctWidthSide) {
      const sval = this.s[p];
      if (typeof sval === 'object' && sval.unit === '%') {
        if (containingBlock.width === undefined) {
          // this situation should only happen if the containing block's box is
          // being floated or in orthogonal writing modes (horizontal inside
          // vertical)
          this.used.set(p, 'auto');
        } else {
          const value = sval.value / 100 * containingBlock.width;
          this.used.set(p, value);
        }
      }
    }

    const height = this.s.height;

    if (typeof height == 'object' && height.unit === '%') {
      if (containingBlock.height === undefined) {
        this.used.set('height', 'auto'); // §CSS2 10.5
      } else {
        const value = height.value / 100 * containingBlock.height;
        this.used.set('height', value);
      }
    }
  }

  resolveBoxModel() {
    if (this.boxSizing !== 'content-box') {
      if (this.width !== 'auto') {
        let edges = this.paddingLeft + this.paddingRight;
        if (this.boxSizing === 'border-box') {
          edges += this.borderLeftWidth + this.borderRightWidth;
        }
        const value = Math.max(0, this.width - edges);
        this.used.set('width', value);
      }

      if (this.height !== 'auto') {
        let edges = this.paddingTop + this.paddingBottom;
        if (this.boxSizing === 'border-box') {
          edges += this.borderTopWidth + this.borderBottomWidth;
        }
        const value = Math.max(0, this.height - edges);
        this.used.set('height', value);
      }
    }
  }

  private getUsedPctPxAuto(prop: keyof BoxModelUsed):number | 'auto' {
    const used = this.used.get(prop);
    if (used !== undefined) return used;
    const value = this.s[prop];
    if (value === 'auto') return 'auto';
    if (typeof value === 'number') return value;
    throw new Error(`${prop} of box ${this.id} never got resolved to pixels`);
  }

  private getUsedPctPx(prop: keyof BoxModelUsed):number {
    const used = this.used.get(prop);
    if (used === 'auto') throw new Error(`${prop} was set to auto`);
    if (used !== undefined) return used;
    const value = this.s[prop];
    if (typeof value === 'number') return value;
    throw new Error(`${prop} of box ${this.id} never got resolved to pixels`);
  }

  get paddingLeft() {
    return this.getUsedPctPx('paddingLeft');
  }

  get paddingRight() {
    return this.getUsedPctPx('paddingRight');
  }

  get borderLeftWidth() {
    if (this.borderLeftStyle === 'none') return 0;
    return this.getUsedPctPx('borderLeftWidth');
  }

  get borderRightWidth() {
    if (this.borderRightStyle === 'none') return 0;
    return this.getUsedPctPx('borderRightWidth');
  }

  get marginLeft() {
    return this.getUsedPctPxAuto('marginLeft');
  }

  get marginRight() {
    return this.getUsedPctPxAuto('marginRight');
  }

  get width() {
    return this.getUsedPctPxAuto('width');
  }

  get paddingTop() {
    return this.getUsedPctPx('paddingTop');
  }

  get paddingBottom() {
    return this.getUsedPctPx('paddingBottom');
  }

  get borderTopWidth() {
    if (this.borderTopStyle === 'none') return 0;
    return this.getUsedPctPx('borderTopWidth');
  }

  get borderBottomWidth() {
    if (this.borderBottomStyle === 'none') return 0;
    return this.getUsedPctPx('borderBottomWidth');
  }

  get marginTop() {
    return this.getUsedPctPxAuto('marginTop');
  }

  get marginBottom() {
    return this.getUsedPctPxAuto('marginBottom');
  }

  get height() {
    return this.getUsedPctPxAuto('height');
  }

  get lineHeight() {
    if (typeof this.s.lineHeight === "object") return this.s.lineHeight.value * this.fontSize;
    return this.s.lineHeight;
  }

  get textAlign() {
    if (this.s.textAlign === 'start') {
      if (this.direction === 'ltr') {
        return 'left';
      } else {
        return 'right';
      }
    }

    if (this.s.textAlign === 'end') {
      if (this.direction === 'ltr') {
        return 'right';
      } else {
        return 'left';
      }
    }

    return this.s.textAlign;
  }

  getMarginBlockStart(writingMode: WritingMode) {
    return this[LogicalMaps[writingMode].marginBlockStart];
  }

  getMarginBlockEnd(writingMode: WritingMode) {
    return this[LogicalMaps[writingMode].marginBlockEnd];
  }

  getMarginLineLeft(writingMode: WritingMode) {
    return this[LogicalMaps[writingMode].marginLineLeft];
  }

  getMarginLineRight(writingMode: WritingMode) {
    return this[LogicalMaps[writingMode].marginLineRight];
  }

  getPaddingBlockStart(writingMode: WritingMode) {
    return this[LogicalMaps[writingMode].paddingBlockStart];
  }

  getPaddingBlockEnd(writingMode: WritingMode) {
    return this[LogicalMaps[writingMode].paddingBlockEnd];
  }

  getPaddingLineLeft(writingMode: WritingMode) {
    return this[LogicalMaps[writingMode].paddingLineLeft];
  }

  getPaddingLineRight(writingMode: WritingMode) {
    return this[LogicalMaps[writingMode].paddingLineRight];
  }

  getBorderBlockStartWidth(writingMode: WritingMode) {
    return this[LogicalMaps[writingMode].borderBlockStartWidth];
  }

  getBorderBlockEndWidth(writingMode: WritingMode) {
    return this[LogicalMaps[writingMode].borderBlockEndWidth];
  }

  getBorderLineLeftWidth(writingMode: WritingMode) {
    return this[LogicalMaps[writingMode].borderLineLeftWidth];
  }

  getBorderLineRightWidth(writingMode: WritingMode) {
    return this[LogicalMaps[writingMode].borderLineRightWidth];
  }

  getBlockSize(writingMode: WritingMode) {
    return this[LogicalMaps[writingMode].blockSize];
  }

  getInlineSize(writingMode: WritingMode) {
    return this[LogicalMaps[writingMode].inlineSize];
  }
}

// Initial values for every property. Different properties have different
// initial values as specified in the property's specification. This is also
// the style that's used as the root style for inheritance. These are the
// "computed value"s as described in CSS Cascading and Inheritance Level 4 § 4.4
export const initialStyle: ComputedPlainStyle = Object.freeze({
  whiteSpace: 'normal',
  color: {r: 0, g: 0, b: 0, a: 1},
  fontSize: 16,
  fontWeight: 400,
  fontVariant: 'normal',
  fontStyle: 'normal',
  fontFamily: ['Helvetica'],
  fontStretch: 'normal',
  lineHeight: 'normal',
  backgroundColor: {r: 0, g: 0, b: 0, a: 0},
  backgroundClip: 'border-box',
  display: {outer: 'inline' as const, inner: 'flow' as const},
  direction: 'ltr',
  writingMode: 'horizontal-tb',
  borderTopWidth: 0,
  borderRightWidth: 0,
  borderBottomWidth: 0,
  borderLeftWidth: 0,
  borderTopStyle: 'none',
  borderRightStyle: 'none',
  borderBottomStyle: 'none',
  borderLeftStyle: 'none',
  borderTopColor: {r: 0, g: 0, b: 0, a: 0},
  borderRightColor: {r: 0, g: 0, b: 0, a: 0},
  borderBottomColor: {r: 0, g: 0, b: 0, a: 0},
  borderLeftColor: {r: 0, g: 0, b: 0, a: 0},
  paddingTop: 0,
  paddingRight: 0,
  paddingBottom: 0,
  paddingLeft: 0,
  marginTop: 0,
  marginRight: 0,
  marginBottom: 0,
  marginLeft: 0,
  tabSize: {value: 8, unit: null},
  position: 'static',
  width: 'auto',
  height: 'auto',
  boxSizing: 'content-box',
  textAlign: 'start',
  float: 'none',
  clear: 'none'
});

type InheritedStyleDefinitions = {[K in keyof ComputedPlainStyle]: boolean};

// Each CSS property defines whether or not it's inherited
const inheritedStyle:InheritedStyleDefinitions = Object.freeze({
  whiteSpace: true,
  color: true,
  fontSize: true,
  fontWeight: true,
  fontVariant: true,
  fontStyle: true,
  fontFamily: true,
  fontStretch: true,
  lineHeight: true,
  backgroundColor: false,
  backgroundClip: false,
  display: false,
  direction: true,
  writingMode: true,
  borderTopWidth: false,
  borderRightWidth: false,
  borderBottomWidth: false,
  borderLeftWidth: false,
  borderTopStyle: false,
  borderRightStyle: false,
  borderBottomStyle: false,
  borderLeftStyle: false,
  borderTopColor: false,
  borderRightColor: false,
  borderBottomColor: false,
  borderLeftColor: false,
  paddingTop: false,
  paddingRight: false,
  paddingBottom: false,
  paddingLeft: false,
  marginTop: false,
  marginRight: false,
  marginBottom: false,
  marginLeft: false,
  tabSize: true,
  position: false,
  width: false,
  height: false,
  boxSizing: false,
  textAlign: true,
  float: false,
  clear: false
});

type UaDeclaredStyles = {[tagName: string]: DeclaredPlainStyle};

export const uaDeclaredStyles:UaDeclaredStyles = Object.freeze({
  div: {
    display: {outer: 'block', inner: 'flow'}
  },
  span: {
    display: {outer: 'inline', inner: 'flow'}
  }
});

function defaultifyStyle(parentStyle: ComputedPlainStyle, style: CascadedPlainStyle) {
  const ret: any = {};

  for (const _ in initialStyle) {
    const p = _ as keyof typeof initialStyle;
    if (style[p] === inherited || !(p in style) && inheritedStyle[p]) {
      ret[p] = parentStyle[p];
    } else if (style[p] === initial || !(p in style) && !inheritedStyle[p]) {
      ret[p] = initialStyle[p];
    } else {
      ret[p] = style[p];
    }
  }

  return ret as SpecifiedPlainStyle;
}

function computeStyle(parentStyle: ComputedPlainStyle, style: SpecifiedPlainStyle) {
  const ret:{[i: string]: any} = {};

  for (const _ in initialStyle) {
    const p = _ as keyof typeof initialStyle;
    const value = style[p];

    if (typeof value === 'object' && 'unit' in value) {
      if (value.unit === 'em') {
        ret[p] = parentStyle.fontSize * value.value;
      } else {
        ret[p] = value;
      }
    } else {
      ret[p] = value;
    }
  }

  // https://www.w3.org/TR/css-fonts-4/#relative-weights
  if (style.fontWeight === 'bolder' || style.fontWeight === 'lighter') {
    const bolder = style.fontWeight === 'bolder';
    const pWeight = parentStyle.fontWeight;
    if (pWeight < 100) {
      ret.fontWeight = bolder ? 400 : parentStyle.fontWeight;
    } else if (pWeight >= 100 && pWeight < 350) {
      ret.fontWeight = bolder ? 400 : 100;
    } else if (pWeight >= 350 && pWeight < 550) {
      ret.fontWeight = bolder ? 700 : 100;
    } else if (pWeight >= 550 && pWeight < 750) {
      ret.fontWeight = bolder ? 900 : 400;
    } else if (pWeight >= 750 && pWeight < 900) {
      ret.fontWeight = bolder ? 900 : 700;
    } else {
      ret.fontWeight = bolder ? parentStyle.fontWeight : 700;
    }
  }

  if (typeof style.fontSize === 'object' && style.fontSize.unit === '%') {
    ret.fontSize = parentStyle.fontSize * style.fontSize.value / 100;
  }

  if (typeof style.lineHeight === 'object' && style.lineHeight.unit === '%') {
    ret.lineHeight = style.lineHeight.value / 100 * ret.fontSize;
  }

  return ret as ComputedPlainStyle;
}

/**
 * Very simple property inheritance model. createStyle starts out with cascaded
 * styles (CSS Cascading and Inheritance Level 4 §4.2) which is computed from
 * the [style] HTML attribute and a default internal style. Then it calculates
 * the specified style (§4.3) by doing inheritance and defaulting, and then
 * calculates the computed style (§4.4) by resolving em, some percentages, etc.
 * Used/actual styles (§4.5, §4.6) are calculated during layout, external to
 * this file.
 */
export function createComputedStyle(parentStyle: ComputedPlainStyle, cascadedStyle: CascadedPlainStyle) {
  const specifiedStyle = defaultifyStyle(parentStyle, cascadedStyle);
  return computeStyle(parentStyle, specifiedStyle);
}

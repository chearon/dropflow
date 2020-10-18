import {Area} from './box';

export const inherited = Symbol('inherited');

type Inherited = typeof inherited;

export const initial = Symbol('initial');

type Initial = typeof initial;

// Cascade model. This file lets you set up a cascade of declared styles and get
// the resulting used style for a given element.
export type LogicalStyle = {
  marginBlockStart: number | 'auto',
  marginBlockEnd: number | 'auto',
  marginInlineStart: number | 'auto',
  marginInlineEnd: number | 'auto',
  paddingBlockStart: number,
  paddingBlockEnd: number,
  paddingInlineStart: number,
  paddingInlineEnd: number,
  borderBlockStartWidth: number,
  borderBlockEndWidth: number,
  borderInlineStartWidth: number,
  borderInlineEndWidth: number,
  blockSize: number | 'auto',
  inlineSize: number | 'auto'
};

const horizontalTb = (style: Style):LogicalStyle => ({
  get marginBlockStart() { return style.marginTop; },
  get marginBlockEnd() { return style.marginBottom; },
  get marginInlineStart() { return style.marginLeft; },
  get marginInlineEnd() { return style.marginRight; },
  get paddingBlockStart() { return style.paddingTop; },
  get paddingBlockEnd() { return style.paddingBottom; },
  get paddingInlineStart() { return style.paddingLeft; },
  get paddingInlineEnd() { return style.paddingRight; },
  get borderBlockStartWidth() { return style.borderTopWidth; },
  get borderBlockEndWidth() { return style.borderBottomWidth; },
  get borderInlineStartWidth() { return style.borderLeftWidth; },
  get borderInlineEndWidth() { return style.borderRightWidth; },
  get blockSize() { return style.height; },
  get inlineSize() { return style.width; }
});

const verticalLr = (style: Style):LogicalStyle => ({
  get marginBlockStart() { return style.marginLeft; },
  get marginBlockEnd() { return style.marginRight; },
  get marginInlineStart() { return style.marginTop; },
  get marginInlineEnd() { return style.marginBottom; },
  get paddingBlockStart() { return style.paddingLeft; },
  get paddingBlockEnd() { return style.paddingRight; },
  get paddingInlineStart() { return style.paddingTop; },
  get paddingInlineEnd() { return style.paddingBottom; },
  get borderBlockStartWidth() { return style.borderLeftWidth; },
  get borderBlockEndWidth() { return style.borderRightWidth; },
  get borderInlineStartWidth() { return style.borderTopWidth; },
  get borderInlineEndWidth() { return style.borderBottomWidth; },
  get blockSize() { return style.width; },
  get inlineSize() { return style.height; }
});

const verticalRl = (style: Style):LogicalStyle => ({
  get marginBlockStart() { return style.marginRight; },
  get marginBlockEnd() { return style.marginLeft; },
  get marginInlineStart() { return style.marginTop; },
  get marginInlineEnd() { return style.marginBottom; },
  get paddingBlockStart() { return style.paddingRight; },
  get paddingBlockEnd() { return style.paddingLeft; },
  get paddingInlineStart() { return style.paddingTop; },
  get paddingInlineEnd() { return style.paddingBottom; },
  get borderBlockStartWidth() { return style.borderRightWidth; },
  get borderBlockEndWidth() { return style.borderLeftWidth; },
  get borderInlineStartWidth() { return style.borderTopWidth; },
  get borderInlineEndWidth() { return style.borderBottomWidth; },
  get blockSize() { return style.width; },
  get inlineSize() { return style.height; }
});

type WhiteSpace = 'normal' | 'nowrap' | 'pre-wrap' | 'pre-line' | 'pre';

type ValuePctPxEm = number | {value: number, unit: '%' | 'em'};

type ValuePctPxNone = number | {value: number, unit: '%' | null};

type ValuePctPx = number | {value: number, unit: '%'};

type ValuePxNone = number | {value: number, unit: null};

type BackgroundClip = 'border-box' | 'padding-box' | 'content-box';

type Display = {outer: OuterDisplay, inner: InnerDisplay};

type WritingMode = 'horizontal-tb' | 'vertical-lr' | 'vertical-rl';

type Position = 'absolute' | 'relative' | 'static';

type Color = {r: number, g: number, b: number, a: number};

type OuterDisplay = 'inline' | 'block';

type InnerDisplay = 'flow' | 'flow-root';

type BorderStyle = 'none' | 'hiden' | 'dotted' | 'dashed' | 'solid'
  | 'double' | 'groove' | 'ridge' | 'inset' | 'outset'

type BoxSizing = 'border-box' | 'content-box' | 'padding-box';

export type DeclaredPlainStyle = {
  whiteSpace?: WhiteSpace | Inherited | Initial;
  fontSize?: ValuePctPxEm | Inherited | Initial;
  color?: Color | Inherited | Initial;
  fontWeight?: string | Inherited | Initial;
  fontVariant?: string | Inherited | Initial;
  fontStyle?: string | Inherited | Initial;
  fontFamily?: string | Inherited | Initial;
  lineHeight?: ValuePctPxNone | Inherited | Initial;
  backgroundColor?: Color | Inherited | Initial;
  backgroundClip?: BackgroundClip | Inherited | Initial;
  display?: Display | Inherited | Initial;
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
};

export type CascadedPlainStyle = DeclaredPlainStyle;

type RemoveUnits<T, U> = {
  [K in keyof T]: T[K] extends number ? number
    : T[K] extends {value: number, unit: infer V} | number ?
      V extends U ? number : number | {value: number, unit: Exclude<V, U>}
  : T[K]
};

type SpecifiedPlainStyle = Required<{
  [K in keyof DeclaredPlainStyle]: Exclude<DeclaredPlainStyle[K], Inherited | Initial>
}>;

export type ComputedPlainStyle = RemoveUnits<SpecifiedPlainStyle, 'em'>;

type KeysAre<T, U> = {[K in keyof T]: T[K] extends U ? K : never}[keyof T];

type $ValuePctPx = KeysAre<ComputedPlainStyle, ValuePctPx>;

type $ValuePctPxOrAuto = KeysAre<ComputedPlainStyle, ValuePctPx | 'auto'>;

const pctWidthSide: Set<keyof ComputedPlainStyleUsed> = new Set([
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

type ComputedPlainStyleUsed = Pick<ComputedPlainStyle,
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

export class Style implements ComputedPlainStyle {
  id: string;

  whiteSpace: ComputedPlainStyle["whiteSpace"];
  fontSize: ComputedPlainStyle["fontSize"];
  color: ComputedPlainStyle["color"];
  fontWeight: ComputedPlainStyle["fontWeight"];
  fontVariant: ComputedPlainStyle["fontVariant"];
  fontStyle: ComputedPlainStyle["fontStyle"];
  fontFamily: ComputedPlainStyle["fontFamily"];
  lineHeight: ComputedPlainStyle["lineHeight"];
  backgroundColor: ComputedPlainStyle["backgroundColor"];
  backgroundClip: ComputedPlainStyle["backgroundClip"];
  display: ComputedPlainStyle["display"];
  writingMode: ComputedPlainStyle["writingMode"];
  borderTopStyle: ComputedPlainStyle["borderTopStyle"];
  borderRightStyle: ComputedPlainStyle["borderRightStyle"];
  borderBottomStyle: ComputedPlainStyle["borderBottomStyle"];
  borderLeftStyle: ComputedPlainStyle["borderLeftStyle"];
  borderTopColor: ComputedPlainStyle["borderTopColor"];
  borderRightColor: ComputedPlainStyle["borderRightColor"];
  borderBottomColor: ComputedPlainStyle["borderBottomColor"];
  borderLeftColor: ComputedPlainStyle["borderLeftColor"];
  tabSize: ComputedPlainStyle["tabSize"];
  position: ComputedPlainStyle["position"];
  boxSizing: ComputedPlainStyle["boxSizing"];

  private s: ComputedPlainStyleUsed;

  private used: Map<$ValuePctPxOrAuto, number | 'auto'>;

  constructor(id: string, style: ComputedPlainStyle) {
    this.id = id;

    // CSS properties that are already as close to the used values as they can
    // be. For example, `position: absolute; display: 
    this.whiteSpace = style.whiteSpace;
    this.fontSize = style.fontSize;
    this.color = style.color;
    this.fontWeight = style.fontWeight;
    this.fontVariant = style.fontVariant;
    this.fontStyle = style.fontStyle;
    this.fontFamily = style.fontFamily;
    this.lineHeight = style.lineHeight;
    this.backgroundColor = style.backgroundColor;
    this.backgroundClip = style.backgroundClip;
    this.display = style.display;
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
      height: style.height
    };

    this.used = new Map();
  }

  resolvePercentages(containingBlock: Area) {
    for (const p of pctWidthSide) {
      const sval = this.s[p];
      if (typeof sval === 'object' && sval.unit === '%') {
        const value = sval.value / 100 * containingBlock.width;
        this.used.set(p, value);
      }
    }

    const height = this.s.height;

    if (typeof height == 'object' && height.unit === '%') {
      try {
        const value = height.value / 100 * containingBlock.height;
        this.used.set('height', value);
      } catch (e) {} // this happens when parent height is auto
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

  private getUsedPctPxAuto(prop: keyof ComputedPlainStyleUsed):number | 'auto' {
    const used = this.used.get(prop);
    if (used !== undefined) return used;
    const value = this.s[prop];
    if (value === 'auto') return 'auto';
    if (typeof value === 'number') return value;
    throw new Error(`${prop} of box ${this.id} never got resolved to pixels`);
  }

  private getUsedPctPx(prop: keyof ComputedPlainStyleUsed):number {
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

  createLogicalView(writingMode: WritingMode) {
    return writingMode === 'horizontal-tb' ? horizontalTb(this) :
      writingMode === 'vertical-lr' ? verticalLr(this) :
      verticalRl(this);
  }
}

// Initial values for every property. Different properties have different
// initial values as specified in the property's specification. This is also
// the style that's used as the root style for inheritance. These are the
// "computed value"s as described in CSS Cascading and Inheritance Level 4 § 4.4
export const initialStyle: ComputedPlainStyle = Object.freeze({
  whiteSpace: 'normal',
  fontSize: 16,
  color: {r: 0, g: 0, b: 0, a: 1},
  fontWeight: '400',
  fontVariant: 'normal',
  fontStyle: 'normal',
  fontFamily: 'Helvetica',
  lineHeight: 18,
  backgroundColor: {r: 0, g: 0, b: 0, a: 0},
  backgroundClip: 'border-box',
  display: {outer: 'inline', inner: 'flow'},
  writingMode: 'horizontal-tb',
  borderTopWidth: 0,
  borderRightWidth: 0,
  borderBottomWidth: 0,
  borderLeftWidth: 0,
  borderTopStyle: 'solid',
  borderRightStyle: 'solid',
  borderBottomStyle: 'solid',
  borderLeftStyle: 'solid',
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
  tabSize: 8,
  position: 'static',
  width: 'auto',
  height: 'auto',
  boxSizing: 'content-box'
});

// Each CSS property defines whether or not it's inherited
const inheritedStyle = Object.freeze({
  whiteSpace: true,
  fontSize: true,
  color: true,
  fontWeight: true,
  fontVariant: true,
  fontStyle: true,
  fontFamily: true,
  lineHeight: true,
  backgroundColor: false,
  backgroundClip: false,
  display: false,
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
  boxSizing: false
});

export const uaDeclaredStyles = Object.freeze({
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
    if (style[p] === 'inherit' || !style[p] && inheritedStyle[p]) {
      ret[p] = parentStyle[p];
    } else if (style[p] === 'initial' || !style[p] && !inheritedStyle[p]) {
      ret[p] = initialStyle[p];
    } else {
      ret[p] = style[p];
    }
  }

  return ret as DeclaredPlainStyle;
}

function computeStyle(parentStyle: ComputedPlainStyle, style: DeclaredPlainStyle) {
  const ret:{[i: string]: any} = {};

  for (const _ in initialStyle) {
    const p = _ as keyof typeof initialStyle;
    const value = style[p];

    if (typeof value === 'object' && 'unit' in value) {
      if (value.unit === 'em') {
        const pvalue = parentStyle.fontSize;
        if (typeof pvalue === 'number') {
          ret[p] = pvalue * value.value;
        } else {
          throw new Error(`Can't compute ${p}, expected px units on parent`);
        }
      } else if (p === 'lineHeight' && value.unit === null) {
        const pvalue = parentStyle[p];
        if (typeof pvalue !== 'number') {
          throw new Error(`Can't compute ${p}, expected px units on parent`);
        }
        ret[p] = {value: pvalue * value.value, unit: 'px'};
      } else {
        ret[p] = value;
      }
    } else {
      ret[p] = value;
    }
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

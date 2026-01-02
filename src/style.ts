import {HTMLElement, TextNode} from './dom.ts';
import {Box} from './layout-box.ts';

export const inherited = Symbol('inherited');

type Inherited = typeof inherited;

export const initial = Symbol('initial');

type Initial = typeof initial;

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
    borderBlockStartStyle: 'borderTopStyle',
    borderBlockEndStyle: 'borderBottomStyle',
    borderLineLeftStyle: 'borderLeftStyle',
    borderLineRightStyle: 'borderRightStyle',
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
    borderBlockStartStyle: 'borderLeftStyle',
    borderBlockEndStyle: 'borderRightStyle',
    borderLineLeftStyle: 'borderTopStyle',
    borderLineRightStyle: 'borderBottomStyle',
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
    borderBlockStartStyle: 'borderRightStyle',
    borderBlockEndStyle: 'borderLeftStyle',
    borderLineLeftStyle: 'borderTopStyle',
    borderLineRightStyle: 'borderBottomStyle',
    blockSize: 'width',
    inlineSize: 'height'
  })
});

export type WhiteSpace = 'normal' | 'nowrap' | 'pre-wrap' | 'pre-line' | 'pre';

type Length = number | {value: number, unit: 'em'};

type Percentage = {value: number, unit: '%'};

type Number = {value: number, unit: null};

export type FontWeight = number | 'normal' | 'bold' | 'bolder' | 'lighter';

export type FontStyle = 'normal' | 'italic' | 'oblique';

export type FontVariant = 'normal' | 'small-caps';

export type FontStretch = 'normal' | 'ultra-condensed' | 'extra-condensed' | 'condensed'
  | 'semi-condensed' | 'semi-expanded' | 'expanded'
  | 'extra-expanded' | 'ultra-expanded';

type VerticalAlign = 'baseline' | 'middle' | 'sub' | 'super' | 'text-top'
  | 'text-bottom' | Length | Percentage | 'top' | 'bottom';

type BackgroundClip = 'border-box' | 'padding-box' | 'content-box';

export type Direction = 'ltr' | 'rtl';

type Display = {outer: OuterDisplay, inner: InnerDisplay};

export type WritingMode = 'horizontal-tb' | 'vertical-lr' | 'vertical-rl';

type Position = 'absolute' | 'relative' | 'static';

export type Color = {r: number, g: number, b: number, a: number};

type OuterDisplay = 'inline' | 'block' | 'none';

type InnerDisplay = 'flow' | 'flow-root' | 'none';

type BorderStyle = 'none' | 'hidden' | 'dotted' | 'dashed' | 'solid'
  | 'double' | 'groove' | 'ridge' | 'inset' | 'outset'

type BoxSizing = 'border-box' | 'content-box' | 'padding-box';

export type TextAlign = 'start' | 'end' | 'left' | 'right' | 'center';

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
}

const EMPTY_ARRAY: readonly number[] = Object.freeze([]);

let id = 0;

/**
 * A DeclaredStyle is either a user-created declared style (createDeclaredStyle)
 * or a cascade of them (createCascadedStyle).
 */
export class DeclaredStyle {
  properties: DeclaredStyleProperties;
  private composition: readonly number[];
  id: number;
  nextInCache: DeclaredStyle | null;

  constructor(properties: DeclaredStyleProperties, composition = EMPTY_ARRAY) {
    this.properties = properties;
    this.composition = composition;
    this.id = ++id;
    this.nextInCache = null;
  }

  /** `styles` must be sorted */
  isComposedOf(styles: DeclaredStyle[]) {
    return this.composition.length === styles.length
      && this.composition.every((id, i) => id === styles[i].id);
  }
}

export function createDeclaredStyle(properties: DeclaredStyleProperties): DeclaredStyle {
  return new DeclaredStyle(properties);
}

export const EMPTY_STYLE = createDeclaredStyle({});

/** `styles` must be sorted */
function createCascadedStyle(styles: DeclaredStyle[]) {
  if (styles.length > 0) {
    const composition = styles.map(s => s.id);
    let properties;

    if (styles.length === 2) {
      properties = {...styles[0].properties, ...styles[1].properties};
    } else {
      properties = Object.assign({}, ...styles.map(s => s.properties));
    }

    return new DeclaredStyle(properties, composition);
  }

  return EMPTY_STYLE;
}

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
  lineHeight: 'normal' | number | {value: number, unit: null};
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
}

function resolvePercent(box: Box, cssVal: number | {value: number, unit: '%'}) {
  if (typeof cssVal === 'object') {
    if (box.containingBlock.width === undefined) throw new Error('Assertion failed');
    const writingMode = box.getWritingModeAsParticipant();
    const inlineSize = box.containingBlock[LogicalMaps[writingMode].inlineSize];
    if (inlineSize === undefined) throw new Error('Assertion failed');
    return cssVal.value / 100 * inlineSize;
  }
  return cssVal;
}

function percentGtZero(cssVal: number | {value: number, unit: '%'}) {
  return typeof cssVal === 'object' ? cssVal.value > 0 : cssVal > 0;
}

export class Style {
  // General
  id: number;
  computed: ComputedStyle;
  blockified: boolean;
  // Cache related
  parentId: number;
  cascadeId: number;
  nextInCache: Style | null;
  // Properties for layout and painting
  zoom: number;
  whiteSpace: WhiteSpace;
  color: Color;
  fontSize: number;
  fontWeight: number;
  fontVariant: FontVariant;
  fontStyle: FontStyle;
  fontStretch: FontStretch;
  fontFamily: string[];
  lineHeight: 'normal' | number;
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

  // This section reduces to used values as much as possible
  // Be careful accessing off of "this" since these are called in the ctor

  private usedLineHeight(style: ComputedStyle) {
    if (typeof style.lineHeight === 'object') {
      return style.lineHeight.value * this.fontSize;
    } else if (typeof style.lineHeight === 'number') {
      return this.usedLength(style.lineHeight);
    } else {
      return style.lineHeight;
    }
  }

  private usedLength(length: number) {
    return length * this.zoom;
  }

  private usedBorderLength(length: number) {
    length *= this.zoom;
    return length > 0 && length < 1 ? 1 : Math.floor(length);
  }

  private usedMaybeLength<T>(length: T) {
    return typeof length === 'number' ? this.usedLength(length) : length;
  }

  constructor(style: ComputedStyle, parent?: Style, cascadedStyle?: DeclaredStyle) {
    this.id = ++id;
    this.computed = style;
    this.blockified = false;
    this.parentId = parent ? parent.id : 0;
    this.cascadeId = cascadedStyle ? cascadedStyle.id : 0;
    this.nextInCache = null;
    this.zoom = parent ? parent.zoom * style.zoom : style.zoom;
    this.whiteSpace = style.whiteSpace;
    this.color = style.color;
    this.fontSize = this.usedLength(style.fontSize);
    this.fontWeight = style.fontWeight;
    this.fontVariant = style.fontVariant;
    this.fontStyle = style.fontStyle;
    this.fontStretch = style.fontStretch;
    this.fontFamily = style.fontFamily;
    this.lineHeight = this.usedLineHeight(style);
    this.verticalAlign = this.usedMaybeLength(style.verticalAlign);
    this.backgroundColor = style.backgroundColor;
    this.backgroundClip = style.backgroundClip;
    this.display = style.display;
    this.direction = style.direction;
    this.writingMode = style.writingMode;
    this.borderTopWidth = this.usedBorderLength(style.borderTopWidth);
    this.borderRightWidth = this.usedBorderLength(style.borderRightWidth);
    this.borderBottomWidth = this.usedBorderLength(style.borderBottomWidth);
    this.borderLeftWidth = this.usedBorderLength(style.borderLeftWidth);
    this.borderTopStyle = style.borderTopStyle;
    this.borderRightStyle = style.borderRightStyle;
    this.borderBottomStyle = style.borderBottomStyle;
    this.borderLeftStyle = style.borderLeftStyle;
    this.borderTopColor = style.borderTopColor;
    this.borderRightColor = style.borderRightColor;
    this.borderBottomColor = style.borderBottomColor;
    this.borderLeftColor = style.borderLeftColor;
    this.paddingTop = this.usedMaybeLength(style.paddingTop);
    this.paddingRight = this.usedMaybeLength(style.paddingRight);
    this.paddingBottom = this.usedMaybeLength(style.paddingBottom);
    this.paddingLeft = this.usedMaybeLength(style.paddingLeft);
    this.marginTop = this.usedMaybeLength(style.marginTop);
    this.marginRight = this.usedMaybeLength(style.marginRight);
    this.marginBottom = this.usedMaybeLength(style.marginBottom);
    this.marginLeft = this.usedMaybeLength(style.marginLeft);
    this.tabSize = style.tabSize;
    this.position = style.position;
    this.width = this.usedMaybeLength(style.width);
    this.height = this.usedMaybeLength(style.height);
    this.top = this.usedMaybeLength(style.top);
    this.right = this.usedMaybeLength(style.right);
    this.bottom = this.usedMaybeLength(style.bottom);
    this.left = this.usedMaybeLength(style.left);
    this.boxSizing = style.boxSizing;
    this.textAlign = style.textAlign;
    this.float = style.float;
    this.clear = style.clear;
    this.zIndex = style.zIndex;
    this.wordBreak = style.wordBreak;
    this.overflowWrap = style.overflowWrap;
    this.overflow = style.overflow;
  }

  blockify() {
    if (!this.blockified && this.display.outer === 'inline') {
      this.display = {outer: 'block', inner: this.display.inner};
      this.blockified = true;
    }
  }

  getTextAlign() {
    if (this.textAlign === 'start') {
      if (this.direction === 'ltr') {
        return 'left';
      } else {
        return 'right';
      }
    }

    if (this.textAlign === 'end') {
      if (this.direction === 'ltr') {
        return 'right';
      } else {
        return 'left';
      }
    }

    return this.textAlign;
  }

  isOutOfFlow() {
    return this.float !== 'none'; // TODO: or this.position === 'absolute'
  }

  isWsCollapsible() {
    const whiteSpace = this.whiteSpace;
    return whiteSpace === 'normal'
      || whiteSpace === 'nowrap'
      || whiteSpace === 'pre-line';
  }

  hasPaddingArea() {
    return percentGtZero(this.paddingTop)
      || percentGtZero(this.paddingRight)
      || percentGtZero(this.paddingBottom)
      || percentGtZero(this.paddingLeft);
  }

  hasBorderArea() {
    return this.borderTopWidth > 0 && this.borderTopStyle !== 'none'
      || this.borderRightWidth > 0 && this.borderRightStyle !== 'none'
      || this.borderBottomWidth > 0 && this.borderBottomStyle !== 'none'
      || this.borderLeftWidth > 0 && this.borderLeftStyle !== 'none';
  }

  hasPaint() {
    return this.backgroundColor.a > 0
      || this.borderTopWidth > 0
        && this.borderTopColor.a > 0
        && this.borderTopStyle !== 'none'
      || this.borderRightWidth > 0
        && this.borderRightColor.a > 0
        && this.borderRightStyle !== 'none'
      || this.borderBottomWidth > 0
        && this.borderBottomColor.a > 0
        && this.borderBottomStyle !== 'none'
      || this.borderLeftWidth > 0
        && this.borderLeftColor.a > 0
        && this.borderLeftStyle !== 'none';
  }

  getMarginBlockStart(box: Box) {
    const writingMode = box.getWritingModeAsParticipant();
    const cssVal = this[LogicalMaps[writingMode].marginBlockStart];
    if (cssVal === 'auto') return cssVal;
    return resolvePercent(box, cssVal);
  }

  getMarginBlockEnd(box: Box) {
    const writingMode = box.getWritingModeAsParticipant();
    const cssVal = this[LogicalMaps[writingMode].marginBlockEnd];
    if (cssVal === 'auto') return cssVal;
    return resolvePercent(box, cssVal);
  }

  getMarginLineLeft(box: Box) {
    const writingMode = box.getWritingModeAsParticipant();
    const cssVal = this[LogicalMaps[writingMode].marginLineLeft];
    if (cssVal === 'auto') return cssVal;
    return resolvePercent(box, cssVal);
  }

  getMarginLineRight(box: Box) {
    const writingMode = box.getWritingModeAsParticipant();
    const cssVal = this[LogicalMaps[writingMode].marginLineRight];
    if (cssVal === 'auto') return cssVal;
    return resolvePercent(box, cssVal);
  }

  getPaddingBlockStart(box: Box) {
    const writingMode = box.getWritingModeAsParticipant();
    const cssVal = this[LogicalMaps[writingMode].paddingBlockStart];
    return resolvePercent(box, cssVal);
  }

  getPaddingBlockEnd(box: Box) {
    const writingMode = box.getWritingModeAsParticipant();
    const cssVal = this[LogicalMaps[writingMode].paddingBlockEnd];
    return resolvePercent(box, cssVal);
  }

  getPaddingLineLeft(box: Box) {
    const writingMode = box.getWritingModeAsParticipant();
    const cssVal = this[LogicalMaps[writingMode].paddingLineLeft];
    return resolvePercent(box, cssVal);
  }

  getPaddingLineRight(box: Box) {
    const writingMode = box.getWritingModeAsParticipant();
    const cssVal = this[LogicalMaps[writingMode].paddingLineRight];
    return resolvePercent(box, cssVal);
  }

  getBorderBlockStartWidth(box: Box) {
    const writingMode = box.getWritingModeAsParticipant();
    let cssStyleVal = this[LogicalMaps[writingMode].borderBlockStartStyle];
    if (cssStyleVal === 'none') return 0;
    const cssWidthVal = this[LogicalMaps[writingMode].borderBlockStartWidth];
    return resolvePercent(box, cssWidthVal);
  }

  getBorderBlockEndWidth(box: Box) {
    const writingMode = box.getWritingModeAsParticipant();
    const cssStyleVal = this[LogicalMaps[writingMode].borderBlockEndStyle];
    if (cssStyleVal === 'none') return 0;
    const cssWidthVal = this[LogicalMaps[writingMode].borderBlockEndWidth];
    return resolvePercent(box, cssWidthVal);
  }

  getBorderLineLeftWidth(box: Box) {
    const writingMode = box.getWritingModeAsParticipant();
    const cssStyleVal = this[LogicalMaps[writingMode].borderLineLeftStyle];
    if (cssStyleVal === 'none') return 0;
    const cssWidthVal = this[LogicalMaps[writingMode].borderLineLeftWidth]
    return resolvePercent(box, cssWidthVal);
  }

  getBorderLineRightWidth(box: Box) {
    const writingMode = box.getWritingModeAsParticipant();
    const cssStyleVal = this[LogicalMaps[writingMode].borderLineRightStyle];
    if (cssStyleVal === 'none') return 0;
    const cssWidthVal = this[LogicalMaps[writingMode].borderLineRightWidth];
    return resolvePercent(box, cssWidthVal);
  }

  getBlockSize(box: Box) {
    const writingMode = box.getWritingModeAsParticipant();
    let cssVal = this[LogicalMaps[writingMode].blockSize];
    if (typeof cssVal === 'object') {
      const parentBlockSize = box.containingBlock[LogicalMaps[writingMode].blockSize];
      if (parentBlockSize === undefined) return 'auto' as const; // §CSS2 10.5
      cssVal = cssVal.value / 100 * parentBlockSize;
    }
    if (this.boxSizing !== 'content-box' && cssVal !== 'auto') {
      cssVal -= this.getPaddingBlockStart(box) + this.getPaddingBlockEnd(box);
      if (this.boxSizing === 'border-box') {
        cssVal -= this.getBorderBlockStartWidth(box) + this.getBorderBlockEndWidth(box);
      }
      cssVal = Math.max(0, cssVal);
    }
    return cssVal;
  }

  getInlineSize(box: Box) {
    const writingMode = box.getWritingModeAsParticipant();
    let cssVal = this[LogicalMaps[writingMode].inlineSize];
    if (cssVal === 'auto') {
      cssVal = 'auto';
    } else {
      cssVal = resolvePercent(box, cssVal);
    }
    if (this.boxSizing !== 'content-box' && cssVal !== 'auto') {
      cssVal -= this.getPaddingLineLeft(box) + this.getPaddingLineRight(box);
      if (this.boxSizing === 'border-box') {
        cssVal -= this.getBorderLineLeftWidth(box) + this.getBorderLineRightWidth(box);
      }
      cssVal = Math.max(0, cssVal);
    }
    return cssVal;
  }

  hasLineLeftGap(box: Box) {
    const writingMode = box.getWritingModeAsParticipant();
    const marginLineLeft = this[LogicalMaps[writingMode].marginLineLeft];
    if (marginLineLeft === 'auto') return false;
    if (typeof marginLineLeft === 'object' && marginLineLeft.value !== 0) return true;
    if (typeof marginLineLeft !== 'object' && marginLineLeft !== 0) return true;
    const paddingLineLeft = this[LogicalMaps[writingMode].paddingLineLeft];
    if (typeof paddingLineLeft === 'object' && paddingLineLeft.value > 0) return true;
    if (typeof paddingLineLeft !== 'object' && paddingLineLeft > 0) return true;
    if (this[LogicalMaps[writingMode].borderLineLeftStyle] === 'none') return false;
    if (this[LogicalMaps[writingMode].borderLineLeftWidth] > 0) return true;
  }

  hasLineRightGap(box: Box) {
    const writingMode = box.getWritingModeAsParticipant();
    const marginLineRight = this[LogicalMaps[writingMode].marginLineRight];
    if (marginLineRight === 'auto') return false;
    if (typeof marginLineRight === 'object' && marginLineRight.value !== 0) return true;
    if (typeof marginLineRight !== 'object' && marginLineRight !== 0) return true;
    const paddingLineRight = this[LogicalMaps[writingMode].paddingLineRight];
    if (typeof paddingLineRight === 'object' && paddingLineRight.value > 0) return true;
    if (typeof paddingLineRight !== 'object' && paddingLineRight > 0) return true;
    if (this[LogicalMaps[writingMode].borderLineRightStyle] === 'none') return false;
    if (this[LogicalMaps[writingMode].borderLineRightWidth] > 0) return true;
  }

  fontsEqual(style: Style, size = true) {
    if (
      size && this.fontSize !== style.fontSize ||
      this.fontVariant !== style.fontVariant ||
      this.fontWeight !== style.fontWeight ||
      this.fontStyle !== style.fontStyle ||
      this.fontFamily.length !== style.fontFamily.length
    ) return false;

    for (let i = 0, l = style.fontFamily.length; i < l; i++) {
      if (style.fontFamily[i] !== this.fontFamily[i]) return false;
    }

    return true;
  }
}

// Initial values for every property. Different properties have different
// initial values as specified in the property's specification. This is also
// the style that's used as the root style for inheritance. These are the
// "computed value"s as described in CSS Cascading and Inheritance Level 4 § 4.4
const initialPlainStyle: ComputedStyle = Object.freeze({
  zoom: 1,
  whiteSpace: 'normal',
  color: {r: 0, g: 0, b: 0, a: 1},
  fontSize: 16,
  fontWeight: 400,
  fontVariant: 'normal',
  fontStyle: 'normal',
  fontFamily: ['Helvetica'],
  fontStretch: 'normal',
  lineHeight: 'normal',
  verticalAlign: 'baseline',
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
  top: 'auto',
  right: 'auto',
  bottom: 'auto',
  left: 'auto',
  boxSizing: 'content-box',
  textAlign: 'start',
  float: 'none',
  clear: 'none',
  zIndex: 'auto',
  wordBreak: 'normal',
  overflowWrap: 'normal',
  overflow: 'visible'
});

let originStyle = new Style(initialPlainStyle);

export function getOriginStyle() {
  return originStyle;
}

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
export function setOriginStyle(style: Partial<ComputedStyle>) {
  originStyle = new Style({...initialPlainStyle, ...style});
}

type InheritedStyleDefinitions = {[K in keyof DeclaredStyleProperties]: boolean};

// Each CSS property defines whether or not it's inherited
const inheritedStyle: InheritedStyleDefinitions = Object.freeze({
  zoom: false,
  whiteSpace: true,
  color: true,
  fontSize: true,
  fontWeight: true,
  fontVariant: true,
  fontStyle: true,
  fontFamily: true,
  fontStretch: true,
  lineHeight: true,
  verticalAlign: false,
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
  top: false,
  right: false,
  bottom: false,
  left: false,
  boxSizing: false,
  textAlign: true,
  float: false,
  clear: false,
  zIndex: false,
  wordBreak: true,
  overflowWrap: true,
  overflow: false
});

type UaDeclaredStyles = {[tagName: string]: DeclaredStyle};

export const uaDeclaredStyles: UaDeclaredStyles = Object.freeze({
  div: createDeclaredStyle({
    display: {outer: 'block', inner: 'flow'}
  }),
  span: createDeclaredStyle({
    display: {outer: 'inline', inner: 'flow'}
  }),
  p: createDeclaredStyle({
    display: {outer: 'block', inner: 'flow'},
    marginTop: {value: 1, unit: 'em'},
    marginBottom: {value: 1, unit: 'em'}
  }),
  strong: createDeclaredStyle({
    fontWeight: 700
  }),
  b: createDeclaredStyle({
    fontWeight: 700
  }),
  em: createDeclaredStyle({
    fontStyle: 'italic'
  }),
  i: createDeclaredStyle({
    fontStyle: 'italic'
  }),
  sup: createDeclaredStyle({
    fontSize: {value: 1/1.2, unit: 'em'},
    verticalAlign: 'super'
  }),
  sub: createDeclaredStyle({
    fontSize: {value: 1/1.2, unit: 'em'},
    verticalAlign: 'sub'
  }),
  img: createDeclaredStyle({
    display: {outer: 'inline', inner: 'flow'}
  }),
  h1: createDeclaredStyle({
    fontSize: {value: 2, unit: 'em'},
    display: {outer: 'block', inner: 'flow'},
    marginTop: {value: 0.67, unit: 'em'},
    marginBottom: {value: 0.67, unit: 'em'}
  }),
  h2: createDeclaredStyle({
    fontSize: {value: 1.5, unit: 'em'},
    display: {outer: 'block', inner: 'flow'},
    marginTop: {value: 0.83, unit: 'em'},
    marginBottom: {value: 0.83, unit: 'em'},
    fontWeight: 700
  }),
  h3: createDeclaredStyle({
    fontSize: {value: 1.17, unit: 'em'},
    display: {outer: 'block', inner: 'flow'},
    marginTop: {value: 1, unit: 'em'},
    marginBottom: {value: 1, unit: 'em'},
    fontWeight: 700
  }),
  h4: createDeclaredStyle({
    display: {outer: 'block', inner: 'flow'},
    marginTop: {value: 1.33, unit: 'em'},
    marginBottom: {value: 1.33, unit: 'em'},
    fontWeight: 700
  }),
  h5: createDeclaredStyle({
    fontSize: {value: 0.83, unit: 'em'},
    display: {outer: 'block', inner: 'flow'},
    marginTop: {value: 1.67, unit: 'em'},
    marginBottom: {value: 1.67, unit: 'em'},
    fontWeight: 700
  }),
  h6: createDeclaredStyle({
    fontSize: {value: 0.67, unit: 'em'},
    display: {outer: 'block', inner: 'flow'},
    marginTop: {value: 2.33, unit: 'em'},
    marginBottom: {value: 2.33, unit: 'em'},
    fontWeight: 700
  })
});

// https://github.com/nodejs/node/blob/238104c531219db05e3421521c305404ce0c0cce/deps/v8/src/utils/utils.h#L213
// Thomas Wang, Integer Hash Functions.
// http://www.concentric.net/~Ttwang/tech/inthash.htm`
function hash(hash: number) {
  hash = ~hash + (hash << 15);  // hash = (hash << 15) - hash - 1;
  hash = hash ^ (hash >> 12);
  hash = hash + (hash << 2);
  hash = hash ^ (hash >> 4);
  hash = hash * 2057;  // hash = (hash + (hash << 3)) + (hash << 11);
  hash = hash ^ (hash >> 16);
  return hash & 0x3fffffff;
}

const cascadeCache = new Map<number, DeclaredStyle>;

export function cascadeStyles(styles: DeclaredStyle[]): DeclaredStyle {
  if (styles.length === 0) return EMPTY_STYLE;
  if (styles.length === 1) return styles[0];

  let key = 0;
  if (styles.length === 2) {
    if (styles[0].id > styles[1].id) styles.reverse();
  } else {
    styles.sort((a, b) => a.id - b.id);
  }
  for (const style of styles) key ^= hash(style.id);
  let cascaded = cascadeCache.get(key) ?? null;
  let prev = null;

  while (cascaded) {
    if (cascaded.isComposedOf(styles)) return cascaded;
    prev = cascaded;
    cascaded = cascaded.nextInCache;
  }

  cascaded = createCascadedStyle(styles);

  if (prev) {
    prev.nextInCache = cascaded;
  } else {
    if (cascadeCache.size > 1_000) cascadeCache.clear();
    cascadeCache.set(key, cascaded);
  }

  return cascaded;
}

function defaultProperty(
  parentStyle: Style,
  style: DeclaredStyle,
  p: keyof DeclaredStyleProperties
) {
  const properties = style.properties;
  if (properties[p] === inherited || !(p in properties) && inheritedStyle[p]) {
    return parentStyle.computed[p];
  } else if (properties[p] === initial || !(p in properties) && !inheritedStyle[p]) {
    return initialPlainStyle[p];
  } else {
    return properties[p];
  }
}

function resolveEm(
  value: DeclaredStyleProperties[keyof DeclaredStyleProperties],
  fontSize: number
) {
  if (typeof value === 'object' && 'unit' in value && value.unit === 'em') {
    return fontSize * value.value;
  } else {
    return value;
  }
}

function computeStyle(parentStyle: Style, cascadedStyle: DeclaredStyle) {
  const properties = cascadedStyle.properties;
  const parentFontSize = parentStyle.computed.fontSize;
  const working = {} as DeclaredStyleProperties;

  // Compute fontSize first since em values depend on it
  const specifiedFontSize = defaultProperty(parentStyle, cascadedStyle, 'fontSize');
  let fontSize = resolveEm(specifiedFontSize, parentFontSize) as number | Percentage;

  if (typeof fontSize === 'object') {
    fontSize = fontSize.value / 100 * parentFontSize;
  }

  // Default and inherit
  for (const _ in initialPlainStyle) {
    const p = _ as keyof ComputedStyle;
    const specifiedValue = defaultProperty(parentStyle, cascadedStyle, p);
    // as any because TS does not know that resolveEm will only reduce the union
    // of possible values at a per-property level
    (working as any)[p] = resolveEm(specifiedValue, fontSize)!;
  }

  working.fontSize = fontSize;

  // https://www.w3.org/TR/css-fonts-4/#relative-weights
  if (properties.fontWeight === 'bolder' || properties.fontWeight === 'lighter') {
    const bolder = properties.fontWeight === 'bolder';
    const pWeight = parentStyle.computed.fontWeight;
    if (pWeight < 100) {
      working.fontWeight = bolder ? 400 : parentStyle.computed.fontWeight;
    } else if (pWeight >= 100 && pWeight < 350) {
      working.fontWeight = bolder ? 400 : 100;
    } else if (pWeight >= 350 && pWeight < 550) {
      working.fontWeight = bolder ? 700 : 100;
    } else if (pWeight >= 550 && pWeight < 750) {
      working.fontWeight = bolder ? 900 : 400;
    } else if (pWeight >= 750 && pWeight < 900) {
      working.fontWeight = bolder ? 900 : 700;
    } else {
      working.fontWeight = bolder ? parentStyle.computed.fontWeight : 700;
    }
  }

  if (typeof properties.lineHeight === 'object' && properties.lineHeight.unit === '%') {
    working.lineHeight = properties.lineHeight.value / 100 * fontSize;
  }

  // At this point we've reduced all value types to their computed counterparts
  const computed = working as ComputedStyle;

  if (typeof properties.zoom === 'object') {
    computed.zoom = properties.zoom.value / 100;
  }

  if (computed.zoom === 0) computed.zoom = 1;

  const style = new Style(computed, parentStyle, cascadedStyle);

  // Blockify floats (TODO: abspos too) (CSS Display §2.7). This drives what
  // type of box is created (-> not an inline), but otherwise has no effect.
  if (computed.float !== 'none') style.blockify();

  return style;
}

const computedCache = new Map<number, Style>;

export function createStyle(parentStyle: Style, cascadedStyle: DeclaredStyle) {
  const key = hash(parentStyle.id) ^ hash(cascadedStyle.id);
  let style = computedCache.get(key) ?? null;
  let prev = null;
  while (style) {
    if (style.parentId === parentStyle.id && style.cascadeId === cascadedStyle.id) return style;
    prev = style;
    style = style.nextInCache;
  }

  style = computeStyle(parentStyle, cascadedStyle);

  if (prev) {
    prev.nextInCache = style;
  } else {
    if (computedCache.size > 1_000) computedCache.clear();
    computedCache.set(key, style);
  }

  return style;
}

// required styles that always come last in the cascade
const rootDeclaredStyle = createDeclaredStyle({
  display: {
    outer: 'block',
    inner: 'flow-root'
  }
});

rootDeclaredStyle.id = 0x7fffffff; // max SMI

export function computeElementStyle(el: HTMLElement | TextNode) {
  if (el instanceof TextNode) {
    el.style = createStyle(el.parent!.style, EMPTY_STYLE);
  } else {
    const styles = el.getDeclaredStyles();
    const parentStyle = el.parent ? el.parent.style : originStyle;
    const uaDeclaredStyle = uaDeclaredStyles[el.tagName];
    if (uaDeclaredStyle) styles.push(uaDeclaredStyle);
    if (!el.parent) styles.push(rootDeclaredStyle);
    el.style = createStyle(parentStyle, cascadeStyles(styles));
  }
}

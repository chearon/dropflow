import { HTMLElement, TextNode } from "./dom.js";
import { BoxArea } from "./layout-box.js";
import { getLangCascade } from "./text-font.js";
import { EmptyInlineMetrics, getMetrics } from "./layout-text.js";
export const inherited = Symbol('inherited');
export const initial = Symbol('initial');
const LogicalMaps = Object.freeze({
    'horizontal-tb': Object.freeze({
        marginBlockStart: 'marginTop',
        marginBlockEnd: 'marginBottom',
        marginLineLeft: 'marginLeft',
        marginLineRight: 'marginRight',
        marginInlineStart: Object.freeze({ ltr: 'marginLeft', rtl: 'marginRight' }),
        marginInlineEnd: Object.freeze({ ltr: 'marginRight', rtl: 'marginLeft' }),
        paddingBlockStart: 'paddingTop',
        paddingBlockEnd: 'paddingBottom',
        paddingLineLeft: 'paddingLeft',
        paddingLineRight: 'paddingRight',
        paddingInlineStart: Object.freeze({ ltr: 'paddingLeft', rtl: 'paddingRight' }),
        paddingInlineEnd: Object.freeze({ ltr: 'paddingRight', rtl: 'paddingLeft' }),
        borderBlockStartWidth: 'borderTopWidth',
        borderBlockEndWidth: 'borderBottomWidth',
        borderLineLeftWidth: 'borderLeftWidth',
        borderLineRightWidth: 'borderRightWidth',
        borderInlineStartWidth: Object.freeze({ ltr: 'borderLeftWidth', rtl: 'borderRightWidth' }),
        borderInlineEndWidth: Object.freeze({ ltr: 'borderRightWidth', rtl: 'borderLeftWidth' }),
        borderBlockStartStyle: 'borderTopStyle',
        borderBlockEndStyle: 'borderBottomStyle',
        borderLineLeftStyle: 'borderLeftStyle',
        borderLineRightStyle: 'borderRightStyle',
        borderInlineStartStyle: Object.freeze({ ltr: 'borderLeftStyle', rtl: 'borderRightStyle' }),
        borderInlineEndStyle: Object.freeze({ ltr: 'borderRightStyle', rtl: 'borderLeftStyle' }),
        blockSize: 'height',
        inlineSize: 'width'
    }),
    'vertical-lr': Object.freeze({
        marginBlockStart: 'marginLeft',
        marginBlockEnd: 'marginRight',
        marginLineLeft: 'marginTop',
        marginLineRight: 'marginBottom',
        marginInlineStart: Object.freeze({ ltr: 'marginTop', rtl: 'marginBottom' }),
        marginInlineEnd: Object.freeze({ ltr: 'marginBottom', rtl: 'marginTop' }),
        paddingBlockStart: 'paddingLeft',
        paddingBlockEnd: 'paddingRight',
        paddingLineLeft: 'paddingTop',
        paddingLineRight: 'paddingBottom',
        paddingInlineStart: Object.freeze({ ltr: 'paddingTop', rtl: 'paddingBottom' }),
        paddingInlineEnd: Object.freeze({ ltr: 'paddingBottom', rtl: 'paddingTop' }),
        borderBlockStartWidth: 'borderLeftWidth',
        borderBlockEndWidth: 'borderRightWidth',
        borderLineLeftWidth: 'borderTopWidth',
        borderLineRightWidth: 'borderBottomWidth',
        borderInlineStartWidth: Object.freeze({ ltr: 'borderTopWidth', rtl: 'borderBottomWidth' }),
        borderInlineEndWidth: Object.freeze({ ltr: 'borderBottomWidth', rtl: 'borderTopWidth' }),
        borderBlockStartStyle: 'borderLeftStyle',
        borderBlockEndStyle: 'borderRightStyle',
        borderLineLeftStyle: 'borderTopStyle',
        borderLineRightStyle: 'borderBottomStyle',
        borderInlineStartStyle: Object.freeze({ ltr: 'borderTopStyle', rtl: 'borderBottomStyle' }),
        borderInlineEndStyle: Object.freeze({ ltr: 'borderBottomStyle', rtl: 'borderTopStyle' }),
        blockSize: 'width',
        inlineSize: 'height'
    }),
    'vertical-rl': Object.freeze({
        marginBlockStart: 'marginRight',
        marginBlockEnd: 'marginLeft',
        marginLineLeft: 'marginTop',
        marginLineRight: 'marginBottom',
        marginInlineStart: Object.freeze({ ltr: 'marginTop', rtl: 'marginBottom' }),
        marginInlineEnd: Object.freeze({ ltr: 'marginBottom', rtl: 'marginTop' }),
        paddingBlockStart: 'paddingRight',
        paddingBlockEnd: 'paddingLeft',
        paddingLineLeft: 'paddingTop',
        paddingLineRight: 'paddingBottom',
        paddingInlineStart: Object.freeze({ ltr: 'paddingTop', rtl: 'paddingBottom' }),
        paddingInlineEnd: Object.freeze({ ltr: 'paddingBottom', rtl: 'paddingTop' }),
        borderBlockStartWidth: 'borderRightWidth',
        borderBlockEndWidth: 'borderLeftWidth',
        borderLineLeftWidth: 'borderTopWidth',
        borderLineRightWidth: 'borderBottomWidth',
        borderInlineStartWidth: Object.freeze({ ltr: 'borderTopWidth', rtl: 'borderBottomWidth' }),
        borderInlineEndWidth: Object.freeze({ ltr: 'borderBottomWidth', rtl: 'borderTopWidth' }),
        borderBlockStartStyle: 'borderRightStyle',
        borderBlockEndStyle: 'borderLeftStyle',
        borderLineLeftStyle: 'borderTopStyle',
        borderLineRightStyle: 'borderBottomStyle',
        borderInlineStartStyle: Object.freeze({ ltr: 'borderTopStyle', rtl: 'borderBottomStyle' }),
        borderInlineEndStyle: Object.freeze({ ltr: 'borderBottomStyle', rtl: 'borderTopStyle' }),
        blockSize: 'width',
        inlineSize: 'height'
    })
});
const EMPTY_ARRAY = Object.freeze([]);
let id = 0;
/**
 * A DeclaredStyle is either a user-created declared style (createDeclaredStyle)
 * or a cascade of them (createCascadedStyle).
 */
export class DeclaredStyle {
    properties;
    composition;
    id;
    nextInCache;
    constructor(properties, composition = EMPTY_ARRAY) {
        this.properties = properties;
        this.composition = composition;
        this.id = ++id;
        this.nextInCache = null;
    }
    /** `styles` must be sorted */
    isComposedOf(styles) {
        return this.composition.length === styles.length
            && this.composition.every((id, i) => id === styles[i].id);
    }
}
export function createDeclaredStyle(properties) {
    return new DeclaredStyle(properties);
}
export const EMPTY_STYLE = createDeclaredStyle({});
/** `styles` must be sorted */
function createCascadedStyle(styles) {
    if (styles.length > 0) {
        const composition = styles.map(s => s.id);
        let properties;
        if (styles.length === 2) {
            properties = { ...styles[0].properties, ...styles[1].properties };
        }
        else {
            properties = Object.assign({}, ...styles.map(s => s.properties));
        }
        return new DeclaredStyle(properties, composition);
    }
    return EMPTY_STYLE;
}
function resolvePercent(containingBlock, cssVal) {
    if (typeof cssVal === 'object') {
        if (containingBlock.width === undefined)
            throw new Error('Assertion failed');
        const writingMode = containingBlock.box.style.writingMode;
        const inlineSize = containingBlock[LogicalMaps[writingMode].inlineSize];
        if (inlineSize === undefined)
            throw new Error('Assertion failed');
        return cssVal.value / 100 * inlineSize;
    }
    return cssVal;
}
function percentGtZero(cssVal) {
    return typeof cssVal === 'object' ? cssVal.value > 0 : cssVal > 0;
}
export class Style {
    // General
    id;
    computed;
    blockified;
    metrics;
    // Cache related
    parentId;
    cascadeId;
    nextInCache;
    // Properties for layout and painting
    zoom;
    whiteSpace;
    color;
    fontSize;
    fontWeight;
    fontVariant;
    fontStyle;
    fontStretch;
    fontFamily;
    lineHeight;
    verticalAlign;
    backgroundColor;
    backgroundClip;
    display;
    direction;
    writingMode;
    borderTopWidth;
    borderRightWidth;
    borderBottomWidth;
    borderLeftWidth;
    borderTopStyle;
    borderRightStyle;
    borderBottomStyle;
    borderLeftStyle;
    borderTopColor;
    borderRightColor;
    borderBottomColor;
    borderLeftColor;
    paddingTop;
    paddingRight;
    paddingBottom;
    paddingLeft;
    marginTop;
    marginRight;
    marginBottom;
    marginLeft;
    tabSize;
    position;
    width;
    height;
    top;
    right;
    bottom;
    left;
    boxSizing;
    textAlign;
    float;
    clear;
    zIndex;
    wordBreak;
    overflowWrap;
    overflow;
    wordSpacing;
    textDecorationLine;
    textDecorationStyle;
    textDecorationColor;
    // This section reduces to used values as much as possible
    // Be careful accessing off of "this" since these are called in the ctor
    usedLineHeight(style) {
        if (typeof style.lineHeight === 'object') {
            return style.lineHeight.value * this.fontSize;
        }
        else if (typeof style.lineHeight === 'number') {
            return this.usedLength(style.lineHeight);
        }
        else {
            return style.lineHeight;
        }
    }
    usedLength(length) {
        return length * this.zoom;
    }
    usedBorderLength(length) {
        length *= this.zoom;
        return length > 0 && length < 1 ? 1 : Math.floor(length);
    }
    usedMaybeLength(length) {
        return typeof length === 'number' ? this.usedLength(length) : length;
    }
    usedColor(color) {
        return color === 'currentcolor' ? this.color : color;
    }
    constructor(style, parent, cascadedStyle) {
        this.id = ++id;
        this.computed = style;
        this.blockified = false;
        this.metrics = EmptyInlineMetrics;
        this.parentId = parent ? parent.id : 0;
        this.cascadeId = cascadedStyle ? cascadedStyle.id : 0;
        this.nextInCache = null;
        this.zoom = parent ? parent.zoom * style.zoom : style.zoom;
        this.whiteSpace = style.whiteSpace;
        this.color = style.color === 'currentcolor' ? parent.color : style.color;
        this.fontSize = this.usedLength(style.fontSize);
        this.fontWeight = style.fontWeight;
        this.fontVariant = style.fontVariant;
        this.fontStyle = style.fontStyle;
        this.fontStretch = style.fontStretch;
        this.fontFamily = style.fontFamily;
        this.lineHeight = this.usedLineHeight(style);
        this.verticalAlign = this.usedMaybeLength(style.verticalAlign);
        this.backgroundColor = this.usedColor(style.backgroundColor);
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
        this.borderTopColor = this.usedColor(style.borderTopColor);
        this.borderRightColor = this.usedColor(style.borderRightColor);
        this.borderBottomColor = this.usedColor(style.borderBottomColor);
        this.borderLeftColor = this.usedColor(style.borderLeftColor);
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
        this.wordSpacing = this.usedMaybeLength(style.wordSpacing);
        this.textDecorationLine = style.textDecorationLine;
        this.textDecorationStyle = style.textDecorationStyle;
        this.textDecorationColor = this.usedColor(style.textDecorationColor);
    }
    blockify() {
        if (!this.blockified && this.display.outer === 'inline') {
            this.display = { outer: 'block', inner: this.display.inner };
            this.blockified = true;
        }
    }
    getTextAlign() {
        if (this.textAlign === 'start') {
            if (this.direction === 'ltr') {
                return 'left';
            }
            else {
                return 'right';
            }
        }
        if (this.textAlign === 'end') {
            if (this.direction === 'ltr') {
                return 'right';
            }
            else {
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
                && this.borderLeftStyle !== 'none'
            || this.textDecorationLine !== 'none';
    }
    getMarginBlockStart(containingBlock) {
        const writingMode = containingBlock.box.style.writingMode;
        const cssVal = this[LogicalMaps[writingMode].marginBlockStart];
        if (cssVal === 'auto')
            return cssVal;
        return resolvePercent(containingBlock, cssVal);
    }
    getMarginBlockEnd(containingBlock) {
        const writingMode = containingBlock.box.style.writingMode;
        const cssVal = this[LogicalMaps[writingMode].marginBlockEnd];
        if (cssVal === 'auto')
            return cssVal;
        return resolvePercent(containingBlock, cssVal);
    }
    getMarginLineLeft(containingBlock) {
        const writingMode = containingBlock.box.style.writingMode;
        const cssVal = this[LogicalMaps[writingMode].marginLineLeft];
        if (cssVal === 'auto')
            return cssVal;
        return resolvePercent(containingBlock, cssVal);
    }
    getMarginInlineStart(containingBlock, direction) {
        const writingMode = containingBlock.box.style.writingMode;
        const cssVal = this[LogicalMaps[writingMode].marginInlineStart[direction]];
        if (cssVal === 'auto')
            return cssVal;
        return resolvePercent(containingBlock, cssVal);
    }
    getMarginLineRight(containingBlock) {
        const writingMode = containingBlock.box.style.writingMode;
        const cssVal = this[LogicalMaps[writingMode].marginLineRight];
        if (cssVal === 'auto')
            return cssVal;
        return resolvePercent(containingBlock, cssVal);
    }
    getMarginInlineEnd(containingBlock, direction) {
        const writingMode = containingBlock.box.style.writingMode;
        const cssVal = this[LogicalMaps[writingMode].marginInlineEnd[direction]];
        if (cssVal === 'auto')
            return cssVal;
        return resolvePercent(containingBlock, cssVal);
    }
    getPaddingBlockStart(containingBlock) {
        const writingMode = containingBlock.box.style.writingMode;
        const cssVal = this[LogicalMaps[writingMode].paddingBlockStart];
        return resolvePercent(containingBlock, cssVal);
    }
    getPaddingBlockEnd(containingBlock) {
        const writingMode = containingBlock.box.style.writingMode;
        const cssVal = this[LogicalMaps[writingMode].paddingBlockEnd];
        return resolvePercent(containingBlock, cssVal);
    }
    getPaddingLineLeft(containingBlock) {
        const writingMode = containingBlock.box.style.writingMode;
        const cssVal = this[LogicalMaps[writingMode].paddingLineLeft];
        return resolvePercent(containingBlock, cssVal);
    }
    getPaddingInlineStart(containingBlock, direction) {
        const writingMode = containingBlock.box.style.writingMode;
        const cssVal = this[LogicalMaps[writingMode].paddingInlineStart[direction]];
        return resolvePercent(containingBlock, cssVal);
    }
    getPaddingLineRight(containingBlock) {
        const writingMode = containingBlock.box.style.writingMode;
        const cssVal = this[LogicalMaps[writingMode].paddingLineRight];
        return resolvePercent(containingBlock, cssVal);
    }
    getPaddingInlineEnd(containingBlock, direction) {
        const writingMode = containingBlock.box.style.writingMode;
        const cssVal = this[LogicalMaps[writingMode].paddingInlineEnd[direction]];
        return resolvePercent(containingBlock, cssVal);
    }
    getBorderBlockStartWidth(containingBlock) {
        const writingMode = containingBlock.box.style.writingMode;
        let cssStyleVal = this[LogicalMaps[writingMode].borderBlockStartStyle];
        if (cssStyleVal === 'none')
            return 0;
        const cssWidthVal = this[LogicalMaps[writingMode].borderBlockStartWidth];
        return resolvePercent(containingBlock, cssWidthVal);
    }
    getBorderBlockEndWidth(containingBlock) {
        const writingMode = containingBlock.box.style.writingMode;
        const cssStyleVal = this[LogicalMaps[writingMode].borderBlockEndStyle];
        if (cssStyleVal === 'none')
            return 0;
        const cssWidthVal = this[LogicalMaps[writingMode].borderBlockEndWidth];
        return resolvePercent(containingBlock, cssWidthVal);
    }
    getBorderLineLeftWidth(containingBlock) {
        const writingMode = containingBlock.box.style.writingMode;
        const cssStyleVal = this[LogicalMaps[writingMode].borderLineLeftStyle];
        if (cssStyleVal === 'none')
            return 0;
        const cssWidthVal = this[LogicalMaps[writingMode].borderLineLeftWidth];
        return resolvePercent(containingBlock, cssWidthVal);
    }
    getBorderInlineStartWidth(containingBlock, direction) {
        const writingMode = containingBlock.box.style.writingMode;
        const cssStyleVal = this[LogicalMaps[writingMode].borderInlineStartStyle[direction]];
        if (cssStyleVal === 'none')
            return 0;
        const cssWidthVal = this[LogicalMaps[writingMode].borderInlineStartWidth[direction]];
        return resolvePercent(containingBlock, cssWidthVal);
    }
    getBorderLineRightWidth(containingBlock) {
        const writingMode = containingBlock.box.style.writingMode;
        const cssStyleVal = this[LogicalMaps[writingMode].borderLineRightStyle];
        if (cssStyleVal === 'none')
            return 0;
        const cssWidthVal = this[LogicalMaps[writingMode].borderLineRightWidth];
        return resolvePercent(containingBlock, cssWidthVal);
    }
    getBorderInlineEndWidth(containingBlock, direction) {
        const writingMode = containingBlock.box.style.writingMode;
        const cssStyleVal = this[LogicalMaps[writingMode].borderInlineEndStyle[direction]];
        if (cssStyleVal === 'none')
            return 0;
        const cssWidthVal = this[LogicalMaps[writingMode].borderInlineEndWidth[direction]];
        return resolvePercent(containingBlock, cssWidthVal);
    }
    getBlockSize(containingBlock) {
        const writingMode = containingBlock.box.style.writingMode;
        let cssVal = this[LogicalMaps[writingMode].blockSize];
        if (typeof cssVal === 'object') {
            const parentBlockSize = containingBlock[LogicalMaps[writingMode].blockSize];
            if (parentBlockSize === undefined)
                return 'auto'; // §CSS2 10.5
            cssVal = cssVal.value / 100 * parentBlockSize;
        }
        if (this.boxSizing !== 'content-box' && cssVal !== 'auto') {
            cssVal -= this.getPaddingBlockStart(containingBlock) + this.getPaddingBlockEnd(containingBlock);
            if (this.boxSizing === 'border-box') {
                cssVal -= this.getBorderBlockStartWidth(containingBlock) + this.getBorderBlockEndWidth(containingBlock);
            }
            cssVal = Math.max(0, cssVal);
        }
        return cssVal;
    }
    getInlineSize(containingBlock) {
        const writingMode = containingBlock.box.style.writingMode;
        let cssVal = this[LogicalMaps[writingMode].inlineSize];
        if (cssVal === 'auto') {
            cssVal = 'auto';
        }
        else {
            cssVal = resolvePercent(containingBlock, cssVal);
        }
        if (this.boxSizing !== 'content-box' && cssVal !== 'auto') {
            cssVal -= this.getPaddingLineLeft(containingBlock) + this.getPaddingLineRight(containingBlock);
            if (this.boxSizing === 'border-box') {
                cssVal -= this.getBorderLineLeftWidth(containingBlock) + this.getBorderLineRightWidth(containingBlock);
            }
            cssVal = Math.max(0, cssVal);
        }
        return cssVal;
    }
    hasLineLeftGap(containingBlock) {
        const writingMode = containingBlock.box.style.writingMode;
        const marginLineLeft = this[LogicalMaps[writingMode].marginLineLeft];
        if (marginLineLeft === 'auto')
            return false;
        if (typeof marginLineLeft === 'object' && marginLineLeft.value !== 0)
            return true;
        if (typeof marginLineLeft !== 'object' && marginLineLeft !== 0)
            return true;
        const paddingLineLeft = this[LogicalMaps[writingMode].paddingLineLeft];
        if (typeof paddingLineLeft === 'object' && paddingLineLeft.value > 0)
            return true;
        if (typeof paddingLineLeft !== 'object' && paddingLineLeft > 0)
            return true;
        if (this[LogicalMaps[writingMode].borderLineLeftStyle] === 'none')
            return false;
        if (this[LogicalMaps[writingMode].borderLineLeftWidth] > 0)
            return true;
    }
    hasLineRightGap(containingBlock) {
        const writingMode = containingBlock.box.style.writingMode;
        const marginLineRight = this[LogicalMaps[writingMode].marginLineRight];
        if (marginLineRight === 'auto')
            return false;
        if (typeof marginLineRight === 'object' && marginLineRight.value !== 0)
            return true;
        if (typeof marginLineRight !== 'object' && marginLineRight !== 0)
            return true;
        const paddingLineRight = this[LogicalMaps[writingMode].paddingLineRight];
        if (typeof paddingLineRight === 'object' && paddingLineRight.value > 0)
            return true;
        if (typeof paddingLineRight !== 'object' && paddingLineRight > 0)
            return true;
        if (this[LogicalMaps[writingMode].borderLineRightStyle] === 'none')
            return false;
        if (this[LogicalMaps[writingMode].borderLineRightWidth] > 0)
            return true;
    }
    fontsEqual(style, size = true) {
        if (size && this.fontSize !== style.fontSize ||
            this.fontVariant !== style.fontVariant ||
            this.fontWeight !== style.fontWeight ||
            this.fontStyle !== style.fontStyle ||
            this.fontFamily.length !== style.fontFamily.length)
            return false;
        for (let i = 0, l = style.fontFamily.length; i < l; i++) {
            if (style.fontFamily[i] !== this.fontFamily[i])
                return false;
        }
        return true;
    }
    fillMetrics() {
        const [face] = getLangCascade(this, 'en');
        // If there are no fonts, metrics stay empty
        if (face)
            this.metrics = getMetrics(this, face);
    }
}
// Initial values for every property. Different properties have different
// initial values as specified in the property's specification. This is also
// the style that's used as the root style for inheritance. These are the
// "computed value"s as described in CSS Cascading and Inheritance Level 4 § 4.4
const initialPlainStyle = Object.freeze({
    zoom: 1,
    whiteSpace: 'normal',
    color: { r: 0, g: 0, b: 0, a: 1 },
    fontSize: 16,
    fontWeight: 400,
    fontVariant: 'normal',
    fontStyle: 'normal',
    fontFamily: ['Helvetica'],
    fontStretch: 'normal',
    lineHeight: 'normal',
    verticalAlign: 'baseline',
    backgroundColor: { r: 0, g: 0, b: 0, a: 0 },
    backgroundClip: 'border-box',
    display: { outer: 'inline', inner: 'flow' },
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
    borderTopColor: { r: 0, g: 0, b: 0, a: 0 },
    borderRightColor: { r: 0, g: 0, b: 0, a: 0 },
    borderBottomColor: { r: 0, g: 0, b: 0, a: 0 },
    borderLeftColor: { r: 0, g: 0, b: 0, a: 0 },
    paddingTop: 0,
    paddingRight: 0,
    paddingBottom: 0,
    paddingLeft: 0,
    marginTop: 0,
    marginRight: 0,
    marginBottom: 0,
    marginLeft: 0,
    tabSize: { value: 8, unit: null },
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
    overflow: 'visible',
    wordSpacing: 'normal',
    textDecorationLine: 'none',
    textDecorationStyle: 'solid',
    textDecorationColor: 'currentcolor'
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
export function setOriginStyle(style) {
    originStyle = new Style({ ...initialPlainStyle, ...style });
}
// Each CSS property defines whether or not it's inherited
const inheritedStyle = Object.freeze({
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
    overflow: false,
    wordSpacing: true
});
export const uaDeclaredStyles = Object.freeze({
    div: createDeclaredStyle({
        display: { outer: 'block', inner: 'flow' }
    }),
    span: createDeclaredStyle({
        display: { outer: 'inline', inner: 'flow' }
    }),
    p: createDeclaredStyle({
        display: { outer: 'block', inner: 'flow' },
        marginTop: { value: 1, unit: 'em' },
        marginBottom: { value: 1, unit: 'em' }
    }),
    strong: createDeclaredStyle({
        fontWeight: 700
    }),
    b: createDeclaredStyle({
        fontWeight: 700
    }),
    u: createDeclaredStyle({
        textDecorationLine: 'underline',
        textDecorationStyle: 'solid',
        textDecorationColor: 'currentcolor'
    }),
    s: createDeclaredStyle({
        textDecorationLine: 'line-through',
        textDecorationStyle: 'solid',
        textDecorationColor: 'currentcolor'
    }),
    em: createDeclaredStyle({
        fontStyle: 'italic'
    }),
    i: createDeclaredStyle({
        fontStyle: 'italic'
    }),
    sup: createDeclaredStyle({
        fontSize: { value: 1 / 1.2, unit: 'em' },
        verticalAlign: 'super'
    }),
    sub: createDeclaredStyle({
        fontSize: { value: 1 / 1.2, unit: 'em' },
        verticalAlign: 'sub'
    }),
    img: createDeclaredStyle({
        display: { outer: 'inline', inner: 'flow' }
    }),
    h1: createDeclaredStyle({
        fontSize: { value: 2, unit: 'em' },
        display: { outer: 'block', inner: 'flow' },
        marginTop: { value: 0.67, unit: 'em' },
        marginBottom: { value: 0.67, unit: 'em' }
    }),
    h2: createDeclaredStyle({
        fontSize: { value: 1.5, unit: 'em' },
        display: { outer: 'block', inner: 'flow' },
        marginTop: { value: 0.83, unit: 'em' },
        marginBottom: { value: 0.83, unit: 'em' },
        fontWeight: 700
    }),
    h3: createDeclaredStyle({
        fontSize: { value: 1.17, unit: 'em' },
        display: { outer: 'block', inner: 'flow' },
        marginTop: { value: 1, unit: 'em' },
        marginBottom: { value: 1, unit: 'em' },
        fontWeight: 700
    }),
    h4: createDeclaredStyle({
        display: { outer: 'block', inner: 'flow' },
        marginTop: { value: 1.33, unit: 'em' },
        marginBottom: { value: 1.33, unit: 'em' },
        fontWeight: 700
    }),
    h5: createDeclaredStyle({
        fontSize: { value: 0.83, unit: 'em' },
        display: { outer: 'block', inner: 'flow' },
        marginTop: { value: 1.67, unit: 'em' },
        marginBottom: { value: 1.67, unit: 'em' },
        fontWeight: 700
    }),
    h6: createDeclaredStyle({
        fontSize: { value: 0.67, unit: 'em' },
        display: { outer: 'block', inner: 'flow' },
        marginTop: { value: 2.33, unit: 'em' },
        marginBottom: { value: 2.33, unit: 'em' },
        fontWeight: 700
    })
});
// https://github.com/nodejs/node/blob/238104c531219db05e3421521c305404ce0c0cce/deps/v8/src/utils/utils.h#L213
// Thomas Wang, Integer Hash Functions.
// http://www.concentric.net/~Ttwang/tech/inthash.htm`
function hash(hash) {
    hash = ~hash + (hash << 15); // hash = (hash << 15) - hash - 1;
    hash = hash ^ (hash >> 12);
    hash = hash + (hash << 2);
    hash = hash ^ (hash >> 4);
    hash = hash * 2057; // hash = (hash + (hash << 3)) + (hash << 11);
    hash = hash ^ (hash >> 16);
    return hash & 0x3fffffff;
}
const cascadeCache = new Map;
export function cascadeStyles(styles) {
    if (styles.length === 0)
        return EMPTY_STYLE;
    if (styles.length === 1)
        return styles[0];
    let key = 0;
    if (styles.length === 2) {
        if (styles[0].id > styles[1].id)
            styles.reverse();
    }
    else {
        styles.sort((a, b) => a.id - b.id);
    }
    for (const style of styles)
        key ^= hash(style.id);
    let cascaded = cascadeCache.get(key) ?? null;
    let prev = null;
    while (cascaded) {
        if (cascaded.isComposedOf(styles))
            return cascaded;
        prev = cascaded;
        cascaded = cascaded.nextInCache;
    }
    cascaded = createCascadedStyle(styles);
    if (prev) {
        prev.nextInCache = cascaded;
    }
    else {
        if (cascadeCache.size > 1_000)
            cascadeCache.clear();
        cascadeCache.set(key, cascaded);
    }
    return cascaded;
}
function defaultProperty(parentStyle, style, p) {
    const properties = style.properties;
    if (properties[p] === inherited || !(p in properties) && inheritedStyle[p]) {
        return parentStyle.computed[p];
    }
    else if (properties[p] === initial || !(p in properties) && !inheritedStyle[p]) {
        return initialPlainStyle[p];
    }
    else {
        return properties[p];
    }
}
function resolveEm(value, fontSize) {
    if (typeof value === 'object' && 'unit' in value && value.unit === 'em') {
        return fontSize * value.value;
    }
    else {
        return value;
    }
}
function computeStyle(parentStyle, cascadedStyle) {
    const properties = cascadedStyle.properties;
    const parentFontSize = parentStyle.computed.fontSize;
    const working = {};
    // Compute fontSize first since em values depend on it
    const specifiedFontSize = defaultProperty(parentStyle, cascadedStyle, 'fontSize');
    let fontSize = resolveEm(specifiedFontSize, parentFontSize);
    if (typeof fontSize === 'object') {
        fontSize = fontSize.value / 100 * parentFontSize;
    }
    // Default and inherit
    for (const _ in initialPlainStyle) {
        const p = _;
        const specifiedValue = defaultProperty(parentStyle, cascadedStyle, p);
        // as any because TS does not know that resolveEm will only reduce the union
        // of possible values at a per-property level
        working[p] = resolveEm(specifiedValue, fontSize);
    }
    working.fontSize = fontSize;
    // https://www.w3.org/TR/css-fonts-4/#relative-weights
    if (properties.fontWeight === 'bolder' || properties.fontWeight === 'lighter') {
        const bolder = properties.fontWeight === 'bolder';
        const pWeight = parentStyle.computed.fontWeight;
        if (pWeight < 100) {
            working.fontWeight = bolder ? 400 : parentStyle.computed.fontWeight;
        }
        else if (pWeight >= 100 && pWeight < 350) {
            working.fontWeight = bolder ? 400 : 100;
        }
        else if (pWeight >= 350 && pWeight < 550) {
            working.fontWeight = bolder ? 700 : 100;
        }
        else if (pWeight >= 550 && pWeight < 750) {
            working.fontWeight = bolder ? 900 : 400;
        }
        else if (pWeight >= 750 && pWeight < 900) {
            working.fontWeight = bolder ? 900 : 700;
        }
        else {
            working.fontWeight = bolder ? parentStyle.computed.fontWeight : 700;
        }
    }
    if (typeof properties.lineHeight === 'object' && properties.lineHeight.unit === '%') {
        working.lineHeight = properties.lineHeight.value / 100 * fontSize;
    }
    // At this point we've reduced all value types to their computed counterparts
    const computed = working;
    if (typeof properties.zoom === 'object') {
        computed.zoom = properties.zoom.value / 100;
    }
    if (computed.zoom === 0)
        computed.zoom = 1;
    const style = new Style(computed, parentStyle, cascadedStyle);
    // Blockify floats (TODO: abspos too) (CSS Display §2.7). This drives what
    // type of box is created (-> not an inline), but otherwise has no effect.
    if (computed.float !== 'none')
        style.blockify();
    return style;
}
const computedCache = new Map;
export function createStyle(parentStyle, cascadedStyle) {
    const key = hash(parentStyle.id) ^ hash(cascadedStyle.id);
    let style = computedCache.get(key) ?? null;
    let prev = null;
    while (style) {
        if (style.parentId === parentStyle.id && style.cascadeId === cascadedStyle.id)
            return style;
        prev = style;
        style = style.nextInCache;
    }
    style = computeStyle(parentStyle, cascadedStyle);
    if (prev) {
        prev.nextInCache = style;
    }
    else {
        if (computedCache.size > 1_000)
            computedCache.clear();
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
export function computeElementStyle(el) {
    if (el instanceof TextNode) {
        el.style = createStyle(el.parent.style, EMPTY_STYLE);
    }
    else {
        const styles = el.getDeclaredStyles();
        const parentStyle = el.parent ? el.parent.style : originStyle;
        const uaDeclaredStyle = uaDeclaredStyles[el.tagName];
        if (uaDeclaredStyle)
            styles.push(uaDeclaredStyle);
        if (!el.parent)
            styles.push(rootDeclaredStyle);
        el.style = createStyle(parentStyle, cascadeStyles(styles));
    }
}

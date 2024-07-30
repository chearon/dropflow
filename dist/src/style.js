import { TextNode } from './dom.js';
export const inherited = Symbol('inherited');
export const initial = Symbol('initial');
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
export const EMPTY_STYLE = {};
function resolvePercent(box, cssVal) {
    if (typeof cssVal === 'object') {
        if (box.containingBlock.width === undefined)
            throw new Error('Assertion failed');
        const inlineSize = box.containingBlock[LogicalMaps[box.writingModeAsParticipant].inlineSize];
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
    constructor(style) {
        this.whiteSpace = style.whiteSpace;
        this.color = style.color;
        this.fontSize = style.fontSize;
        this.fontWeight = style.fontWeight;
        this.fontVariant = style.fontVariant;
        this.fontStyle = style.fontStyle;
        this.fontStretch = style.fontStretch;
        this.fontFamily = style.fontFamily;
        this.lineHeight = style.lineHeight;
        this.verticalAlign = style.verticalAlign;
        this.backgroundColor = style.backgroundColor;
        this.backgroundClip = style.backgroundClip;
        this.display = style.display;
        this.direction = style.direction;
        this.writingMode = style.writingMode;
        this.borderTopWidth = style.borderTopWidth;
        this.borderRightWidth = style.borderRightWidth;
        this.borderBottomWidth = style.borderBottomWidth;
        this.borderLeftWidth = style.borderLeftWidth;
        this.borderTopStyle = style.borderTopStyle;
        this.borderRightStyle = style.borderRightStyle;
        this.borderBottomStyle = style.borderBottomStyle;
        this.borderLeftStyle = style.borderLeftStyle;
        this.borderTopColor = style.borderTopColor;
        this.borderRightColor = style.borderRightColor;
        this.borderBottomColor = style.borderBottomColor;
        this.borderLeftColor = style.borderLeftColor;
        this.paddingTop = style.paddingTop;
        this.paddingRight = style.paddingRight;
        this.paddingBottom = style.paddingBottom;
        this.paddingLeft = style.paddingLeft;
        this.marginTop = style.marginTop;
        this.marginRight = style.marginRight;
        this.marginBottom = style.marginBottom;
        this.marginLeft = style.marginLeft;
        this.tabSize = style.tabSize;
        this.position = style.position;
        this.width = style.width;
        this.height = style.height;
        this.top = style.top;
        this.right = style.right;
        this.bottom = style.bottom;
        this.left = style.left;
        this.boxSizing = style.boxSizing;
        this.textAlign = style.textAlign;
        this.float = style.float;
        this.clear = style.clear;
        this.zIndex = style.zIndex;
        this.wordBreak = style.wordBreak;
        this.overflowWrap = style.overflowWrap;
    }
    getLineHeight() {
        if (typeof this.lineHeight === 'object')
            return this.lineHeight.value * this.fontSize;
        return this.lineHeight;
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
    hasPadding() {
        return percentGtZero(this.paddingTop)
            || percentGtZero(this.paddingRight)
            || percentGtZero(this.paddingBottom)
            || percentGtZero(this.paddingLeft);
    }
    hasBorder() {
        return this.borderTopWidth > 0
            || this.borderRightWidth > 0
            || this.borderBottomWidth > 0
            || this.borderLeftWidth > 0;
    }
    getMarginBlockStart(box) {
        const cssVal = this[LogicalMaps[box.writingModeAsParticipant].marginBlockStart];
        if (cssVal === 'auto')
            return cssVal;
        return resolvePercent(box, cssVal);
    }
    getMarginBlockEnd(box) {
        const cssVal = this[LogicalMaps[box.writingModeAsParticipant].marginBlockEnd];
        if (cssVal === 'auto')
            return cssVal;
        return resolvePercent(box, cssVal);
    }
    getMarginLineLeft(box) {
        const cssVal = this[LogicalMaps[box.writingModeAsParticipant].marginLineLeft];
        if (cssVal === 'auto')
            return cssVal;
        return resolvePercent(box, cssVal);
    }
    getMarginLineRight(box) {
        const cssVal = this[LogicalMaps[box.writingModeAsParticipant].marginLineRight];
        if (cssVal === 'auto')
            return cssVal;
        return resolvePercent(box, cssVal);
    }
    getPaddingBlockStart(box) {
        const cssVal = this[LogicalMaps[box.writingModeAsParticipant].paddingBlockStart];
        return resolvePercent(box, cssVal);
    }
    getPaddingBlockEnd(box) {
        const cssVal = this[LogicalMaps[box.writingModeAsParticipant].paddingBlockEnd];
        return resolvePercent(box, cssVal);
    }
    getPaddingLineLeft(box) {
        const cssVal = this[LogicalMaps[box.writingModeAsParticipant].paddingLineLeft];
        return resolvePercent(box, cssVal);
    }
    getPaddingLineRight(box) {
        const cssVal = this[LogicalMaps[box.writingModeAsParticipant].paddingLineRight];
        return resolvePercent(box, cssVal);
    }
    getBorderBlockStartWidth(box) {
        let cssStyleVal = this[LogicalMaps[box.writingModeAsParticipant].borderBlockStartStyle];
        if (cssStyleVal === 'none')
            return 0;
        const cssWidthVal = this[LogicalMaps[box.writingModeAsParticipant].borderBlockStartWidth];
        return resolvePercent(box, cssWidthVal);
    }
    getBorderBlockEndWidth(box) {
        const cssStyleVal = this[LogicalMaps[box.writingModeAsParticipant].borderBlockEndStyle];
        if (cssStyleVal === 'none')
            return 0;
        const cssWidthVal = this[LogicalMaps[box.writingModeAsParticipant].borderBlockEndWidth];
        return resolvePercent(box, cssWidthVal);
    }
    getBorderLineLeftWidth(box) {
        const cssStyleVal = this[LogicalMaps[box.writingModeAsParticipant].borderLineLeftStyle];
        if (cssStyleVal === 'none')
            return 0;
        const cssWidthVal = this[LogicalMaps[box.writingModeAsParticipant].borderLineLeftWidth];
        return resolvePercent(box, cssWidthVal);
    }
    getBorderLineRightWidth(box) {
        const cssStyleVal = this[LogicalMaps[box.writingModeAsParticipant].borderLineRightStyle];
        if (cssStyleVal === 'none')
            return 0;
        const cssWidthVal = this[LogicalMaps[box.writingModeAsParticipant].borderLineRightWidth];
        return resolvePercent(box, cssWidthVal);
    }
    getBlockSize(box) {
        let cssVal = this[LogicalMaps[box.writingModeAsParticipant].blockSize];
        if (typeof cssVal === 'object') {
            const parentBlockSize = box.containingBlock[LogicalMaps[box.writingModeAsParticipant].blockSize];
            if (parentBlockSize === undefined)
                return 'auto'; // §CSS2 10.5
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
    getInlineSize(box) {
        let cssVal = this[LogicalMaps[box.writingModeAsParticipant].inlineSize];
        if (cssVal === 'auto') {
            cssVal = 'auto';
        }
        else {
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
    hasLineLeftGap() {
        // TODO: bug: need to check box.writingMode, but it isn't assigned yet :(
        const writingMode = 'horizontal-tb';
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
    hasLineRightGap() {
        // TODO: bug: need to check writingMode, but it isn't assigned yet :(
        const writingMode = 'horizontal-tb';
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
}
// Initial values for every property. Different properties have different
// initial values as specified in the property's specification. This is also
// the style that's used as the root style for inheritance. These are the
// "computed value"s as described in CSS Cascading and Inheritance Level 4 § 4.4
const initialPlainStyle = Object.freeze({
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
    overflowWrap: 'normal'
});
export const initialStyle = new Style(initialPlainStyle);
// Each CSS property defines whether or not it's inherited
const inheritedStyle = Object.freeze({
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
    overflowWrap: true
});
export const uaDeclaredStyles = Object.freeze({
    div: {
        display: { outer: 'block', inner: 'flow' }
    },
    span: {
        display: { outer: 'inline', inner: 'flow' }
    },
    p: {
        display: { outer: 'block', inner: 'flow' },
        marginTop: { value: 1, unit: 'em' },
        marginBottom: { value: 1, unit: 'em' }
    },
    strong: {
        fontWeight: 700
    },
    b: {
        fontWeight: 700
    },
    em: {
        fontStyle: 'italic'
    },
    i: {
        fontStyle: 'italic'
    },
    sup: {
        fontSize: { value: 1 / 1.2, unit: 'em' },
        verticalAlign: 'super'
    },
    sub: {
        fontSize: { value: 1 / 1.2, unit: 'em' },
        verticalAlign: 'sub'
    },
    h1: {
        fontSize: { value: 2, unit: 'em' },
        display: { outer: 'block', inner: 'flow' },
        marginTop: { value: 0.67, unit: 'em' },
        marginBottom: { value: 0.67, unit: 'em' }
    },
    h2: {
        fontSize: { value: 1.5, unit: 'em' },
        display: { outer: 'block', inner: 'flow' },
        marginTop: { value: 0.83, unit: 'em' },
        marginBottom: { value: 0.83, unit: 'em' },
        fontWeight: 700
    },
    h3: {
        fontSize: { value: 1.17, unit: 'em' },
        display: { outer: 'block', inner: 'flow' },
        marginTop: { value: 1, unit: 'em' },
        marginBottom: { value: 1, unit: 'em' },
        fontWeight: 700
    },
    h4: {
        display: { outer: 'block', inner: 'flow' },
        marginTop: { value: 1.33, unit: 'em' },
        marginBottom: { value: 1.33, unit: 'em' },
        fontWeight: 700
    },
    h5: {
        fontSize: { value: 0.83, unit: 'em' },
        display: { outer: 'block', inner: 'flow' },
        marginTop: { value: 1.67, unit: 'em' },
        marginBottom: { value: 1.67, unit: 'em' },
        fontWeight: 700
    },
    h6: {
        fontSize: { value: 0.67, unit: 'em' },
        display: { outer: 'block', inner: 'flow' },
        marginTop: { value: 2.33, unit: 'em' },
        marginBottom: { value: 2.33, unit: 'em' },
        fontWeight: 700
    }
});
const cascadedCache = new WeakMap();
export function cascadeStyles(s1, s2) {
    let m1 = cascadedCache.get(s1);
    let m2 = m1 && m1.get(s2);
    if (m2)
        return m2;
    const ret = { ...s1, ...s2 };
    if (m1) {
        m1.set(s2, ret);
        return ret;
    }
    m1 = new WeakMap();
    m1.set(s2, ret);
    cascadedCache.set(s1, m1);
    return ret;
}
function defaultifyStyle(parentStyle, style) {
    const ret = {};
    for (const _ in initialPlainStyle) {
        const p = _;
        if (style[p] === inherited || !(p in style) && inheritedStyle[p]) {
            ret[p] = parentStyle[p];
        }
        else if (style[p] === initial || !(p in style) && !inheritedStyle[p]) {
            ret[p] = initialPlainStyle[p];
        }
        else {
            ret[p] = style[p];
        }
    }
    return ret;
}
function computeStyle(parentStyle, style) {
    const computed = {};
    // Compute fontSize first since em values depend on it
    if (typeof style.fontSize === 'object') {
        if (style.fontSize.unit === '%') {
            computed.fontSize = parentStyle.fontSize * style.fontSize.value / 100;
        }
        else {
            computed.fontSize = parentStyle.fontSize * style.fontSize.value;
        }
    }
    else {
        computed.fontSize = style.fontSize;
    }
    for (const _ in initialPlainStyle) {
        const p = _;
        const value = style[p];
        if (p === 'fontSize')
            continue;
        if (typeof value === 'object' && 'unit' in value) {
            if (value.unit === 'em') {
                computed[p] = computed.fontSize * value.value;
            }
            else {
                computed[p] = value;
            }
        }
        else {
            computed[p] = value;
        }
    }
    // https://www.w3.org/TR/css-fonts-4/#relative-weights
    if (style.fontWeight === 'bolder' || style.fontWeight === 'lighter') {
        const bolder = style.fontWeight === 'bolder';
        const pWeight = parentStyle.fontWeight;
        if (pWeight < 100) {
            computed.fontWeight = bolder ? 400 : parentStyle.fontWeight;
        }
        else if (pWeight >= 100 && pWeight < 350) {
            computed.fontWeight = bolder ? 400 : 100;
        }
        else if (pWeight >= 350 && pWeight < 550) {
            computed.fontWeight = bolder ? 700 : 100;
        }
        else if (pWeight >= 550 && pWeight < 750) {
            computed.fontWeight = bolder ? 900 : 400;
        }
        else if (pWeight >= 750 && pWeight < 900) {
            computed.fontWeight = bolder ? 900 : 700;
        }
        else {
            computed.fontWeight = bolder ? parentStyle.fontWeight : 700;
        }
    }
    if (typeof style.lineHeight === 'object' && style.lineHeight.unit === '%') {
        computed.lineHeight = style.lineHeight.value / 100 * computed.fontSize;
    }
    return new Style(computed);
}
const styleCache = new WeakMap();
/**
 * Very simple property inheritance model. createStyle starts out with cascaded
 * styles (CSS Cascading and Inheritance Level 4 §4.2) which is computed from
 * the [style] HTML attribute and a default internal style. Then it calculates
 * the specified style (§4.3) by doing inheritance and defaulting, and then
 * calculates the computed style (§4.4) by resolving em, some percentages, etc.
 * Used/actual styles (§4.5, §4.6) are calculated during layout, external to
 * this file.
 */
export function createStyle(s1, s2) {
    let m1 = styleCache.get(s1);
    let m2 = m1 && m1.get(s2);
    if (m2)
        return m2;
    const specifiedStyle = defaultifyStyle(s1, s2);
    const ret = computeStyle(s1, specifiedStyle);
    if (m1) {
        m1.set(s2, ret);
        return ret;
    }
    m1 = new WeakMap();
    m1.set(s2, ret);
    styleCache.set(s1, m1);
    return ret;
}
// required styles that always come last in the cascade
const rootDeclaredStyle = {
    display: {
        outer: 'block',
        inner: 'flow-root'
    }
};
export function getRootStyle(style = EMPTY_STYLE) {
    return createStyle(initialStyle, cascadeStyles(style, rootDeclaredStyle));
}
export function computeElementStyle(el) {
    if (el.parent) {
        if (el instanceof TextNode) {
            el.style = createStyle(el.parent.style, EMPTY_STYLE);
        }
        else {
            const uaDeclaredStyle = uaDeclaredStyles[el.tagName];
            if (uaDeclaredStyle) {
                const cascadedStyle = cascadeStyles(uaDeclaredStyle, el.declaredStyle);
                el.style = createStyle(el.parent.style, cascadedStyle);
            }
            else {
                el.style = createStyle(el.parent.style, el.declaredStyle);
            }
        }
    }
    else {
        const rootElement = el;
        const uaDeclaredStyle = uaDeclaredStyles[rootElement.tagName];
        if (uaDeclaredStyle) {
            const cascadedStyle = cascadeStyles(uaDeclaredStyle, rootElement.declaredStyle);
            rootElement.style = getRootStyle(cascadedStyle);
        }
        else {
            el.style = getRootStyle(rootElement.declaredStyle);
        }
    }
}

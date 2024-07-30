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
    if (!box.containingBlock)
        throw new Error('Assertion failed');
    if (typeof cssVal === 'object') {
        if (box.containingBlock.width === undefined)
            throw new Error('Assertion failed');
        const inlineSize = box.containingBlock[LogicalMaps[box.writingMode].inlineSize];
        if (inlineSize === undefined)
            throw new Error('Assertion failed');
        return cssVal.value / 100 * inlineSize;
    }
    return cssVal;
}
function percentNonzero(cssVal) {
    return typeof cssVal === 'object' ? cssVal.value > 0 : cssVal > 0;
}
export class Style {
    constructor(style) {
        // CSS properties that are already as close to the used values as they can
        // be. For example, `position: absolute; display: block;`
        this.whiteSpace = style.whiteSpace;
        this.color = style.color;
        this.fontSize = style.fontSize;
        this.fontWeight = style.fontWeight;
        this.fontVariant = style.fontVariant;
        this.fontStyle = style.fontStyle;
        this.fontFamily = style.fontFamily;
        this.fontStretch = style.fontStretch;
        this.verticalAlign = style.verticalAlign;
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
        this.paddingTop = style.paddingTop;
        this.paddingRight = style.paddingRight;
        this.paddingBottom = style.paddingBottom;
        this.paddingLeft = style.paddingLeft;
        this.borderTopWidth = style.borderTopWidth;
        this.borderRightWidth = style.borderRightWidth;
        this.borderBottomWidth = style.borderBottomWidth;
        this.borderLeftWidth = style.borderLeftWidth;
        this.marginTop = style.marginTop;
        this.marginRight = style.marginRight;
        this.marginBottom = style.marginBottom;
        this.marginLeft = style.marginLeft;
        this.width = style.width;
        this.height = style.height;
        this.tabSize = style.tabSize;
        this.position = style.position;
        this.boxSizing = style.boxSizing;
        this.float = style.float;
        this.clear = style.clear;
        // CSS properties that can be resolved to used values given a containing
        // block or given another CSS property
        this.s = {
            lineHeight: style.lineHeight,
            textAlign: style.textAlign
        };
    }
    get lineHeight() {
        if (typeof this.s.lineHeight === 'object')
            return this.s.lineHeight.value * this.fontSize;
        return this.s.lineHeight;
    }
    get textAlign() {
        if (this.s.textAlign === 'start') {
            if (this.direction === 'ltr') {
                return 'left';
            }
            else {
                return 'right';
            }
        }
        if (this.s.textAlign === 'end') {
            if (this.direction === 'ltr') {
                return 'right';
            }
            else {
                return 'left';
            }
        }
        return this.s.textAlign;
    }
    hasPadding() {
        return percentNonzero(this.paddingTop)
            || percentNonzero(this.paddingRight)
            || percentNonzero(this.paddingBottom)
            || percentNonzero(this.paddingLeft);
    }
    hasBorder() {
        return this.borderTopWidth > 0
            || this.borderRightWidth > 0
            || this.borderBottomWidth > 0
            || this.borderLeftWidth > 0;
    }
    getMarginBlockStart(box) {
        const cssVal = this[LogicalMaps[box.writingMode].marginBlockStart];
        if (cssVal === 'auto')
            return cssVal;
        return resolvePercent(box, cssVal);
    }
    getMarginBlockEnd(box) {
        const cssVal = this[LogicalMaps[box.writingMode].marginBlockEnd];
        if (cssVal === 'auto')
            return cssVal;
        return resolvePercent(box, cssVal);
    }
    getMarginLineLeft(box) {
        const cssVal = this[LogicalMaps[box.writingMode].marginLineLeft];
        if (cssVal === 'auto')
            return cssVal;
        return resolvePercent(box, cssVal);
    }
    getMarginLineRight(box) {
        const cssVal = this[LogicalMaps[box.writingMode].marginLineRight];
        if (cssVal === 'auto')
            return cssVal;
        return resolvePercent(box, cssVal);
    }
    getPaddingBlockStart(box) {
        return resolvePercent(box, this[LogicalMaps[box.writingMode].paddingBlockStart]);
    }
    getPaddingBlockEnd(box) {
        return resolvePercent(box, this[LogicalMaps[box.writingMode].paddingBlockEnd]);
    }
    getPaddingLineLeft(box) {
        return resolvePercent(box, this[LogicalMaps[box.writingMode].paddingLineLeft]);
    }
    getPaddingLineRight(box) {
        return resolvePercent(box, this[LogicalMaps[box.writingMode].paddingLineRight]);
    }
    getBorderBlockStartWidth(box) {
        if (this[LogicalMaps[box.writingMode].borderBlockStartStyle] === 'none')
            return 0;
        return resolvePercent(box, this[LogicalMaps[box.writingMode].borderBlockStartWidth]);
    }
    getBorderBlockEndWidth(box) {
        if (this[LogicalMaps[box.writingMode].borderBlockEndStyle] === 'none')
            return 0;
        return resolvePercent(box, this[LogicalMaps[box.writingMode].borderBlockEndWidth]);
    }
    getBorderLineLeftWidth(box) {
        if (this[LogicalMaps[box.writingMode].borderLineLeftStyle] === 'none')
            return 0;
        return resolvePercent(box, this[LogicalMaps[box.writingMode].borderLineLeftWidth]);
    }
    getBorderLineRightWidth(box) {
        if (this[LogicalMaps[box.writingMode].borderLineRightStyle] === 'none')
            return 0;
        return resolvePercent(box, this[LogicalMaps[box.writingMode].borderLineRightWidth]);
    }
    getBlockSize(box) {
        let cssVal = this[LogicalMaps[box.writingMode].blockSize];
        if (!box.containingBlock)
            throw new Error('Assertion failed');
        if (typeof cssVal === 'object') {
            const parentBlockSize = box.containingBlock[LogicalMaps[box.writingMode].blockSize];
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
        let cssVal = this[LogicalMaps[box.writingMode].inlineSize];
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
    hasLineLeftGap(box) {
        // TODO: bug: need to check box.writingMode, but it isn't assigned yet :(
        const writingMode = 'horizontal-tb';
        const cssVal = this[LogicalMaps[writingMode].marginLineLeft];
        if (cssVal === 'auto')
            return false;
        if (typeof cssVal === 'object' && cssVal.value > 0)
            return true;
        if (cssVal > 0)
            return true;
        if (this[LogicalMaps[writingMode].paddingLineLeft] > 0)
            return true;
        if (this[LogicalMaps[writingMode].borderLineLeftStyle] === 'none')
            return false;
        if (this[LogicalMaps[writingMode].borderLineLeftWidth] > 0)
            return true;
    }
    hasLineRightGap(box) {
        // TODO: bug: need to check writingMode, but it isn't assigned yet :(
        const writingMode = 'horizontal-tb';
        const cssVal = this[LogicalMaps[writingMode].marginLineRight];
        if (cssVal === 'auto')
            return false;
        if (typeof cssVal === 'object' && cssVal.value > 0)
            return true;
        if (cssVal > 0)
            return true;
        if (this[LogicalMaps[writingMode].paddingLineRight] > 0)
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
export const initialStyle = Object.freeze({
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
    boxSizing: 'content-box',
    textAlign: 'start',
    float: 'none',
    clear: 'none'
});
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
    boxSizing: false,
    textAlign: true,
    float: false,
    clear: false
});
export const uaDeclaredStyles = Object.freeze({
    div: {
        display: { outer: 'block', inner: 'flow' }
    },
    span: {
        display: { outer: 'inline', inner: 'flow' }
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
    for (const _ in initialStyle) {
        const p = _;
        if (style[p] === inherited || !(p in style) && inheritedStyle[p]) {
            ret[p] = parentStyle[p];
        }
        else if (style[p] === initial || !(p in style) && !inheritedStyle[p]) {
            ret[p] = initialStyle[p];
        }
        else {
            ret[p] = style[p];
        }
    }
    return ret;
}
function computeStyle(parentStyle, style) {
    const ret = {};
    for (const _ in initialStyle) {
        const p = _;
        const value = style[p];
        if (typeof value === 'object' && 'unit' in value) {
            if (value.unit === 'em') {
                ret[p] = parentStyle.fontSize * value.value;
            }
            else {
                ret[p] = value;
            }
        }
        else {
            ret[p] = value;
        }
    }
    // https://www.w3.org/TR/css-fonts-4/#relative-weights
    if (style.fontWeight === 'bolder' || style.fontWeight === 'lighter') {
        const bolder = style.fontWeight === 'bolder';
        const pWeight = parentStyle.fontWeight;
        if (pWeight < 100) {
            ret.fontWeight = bolder ? 400 : parentStyle.fontWeight;
        }
        else if (pWeight >= 100 && pWeight < 350) {
            ret.fontWeight = bolder ? 400 : 100;
        }
        else if (pWeight >= 350 && pWeight < 550) {
            ret.fontWeight = bolder ? 700 : 100;
        }
        else if (pWeight >= 550 && pWeight < 750) {
            ret.fontWeight = bolder ? 900 : 400;
        }
        else if (pWeight >= 750 && pWeight < 900) {
            ret.fontWeight = bolder ? 900 : 700;
        }
        else {
            ret.fontWeight = bolder ? parentStyle.fontWeight : 700;
        }
    }
    if (typeof style.fontSize === 'object' && style.fontSize.unit === '%') {
        ret.fontSize = parentStyle.fontSize * style.fontSize.value / 100;
    }
    if (typeof style.lineHeight === 'object' && style.lineHeight.unit === '%') {
        ret.lineHeight = style.lineHeight.value / 100 * ret.fontSize;
    }
    return ret;
}
const computedStyleCache = new WeakMap();
/**
 * Very simple property inheritance model. createStyle starts out with cascaded
 * styles (CSS Cascading and Inheritance Level 4 §4.2) which is computed from
 * the [style] HTML attribute and a default internal style. Then it calculates
 * the specified style (§4.3) by doing inheritance and defaulting, and then
 * calculates the computed style (§4.4) by resolving em, some percentages, etc.
 * Used/actual styles (§4.5, §4.6) are calculated during layout, external to
 * this file.
 */
export function createComputedStyle(s1, s2) {
    let m1 = computedStyleCache.get(s1);
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
    computedStyleCache.set(s1, m1);
    return ret;
}
const styleCache = new WeakMap();
export function createStyle(s) {
    let style = styleCache.get(s);
    if (!style) {
        style = new Style(s);
        styleCache.set(s, style);
    }
    return style;
}

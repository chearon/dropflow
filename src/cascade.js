// Cascade model. This file lets you set up a cascade of declared styles and get
// the resulting used style for a given element.

const percentWidthProps = [
  'paddingLeft',
  'paddingRight',
  'paddingTop',
  'paddingBottom',
  'width'
];

const LOGICAL_TO_PHYSICAL_FLOW_MAP_HORIZONTAL_TB = {
  marginBlockStart: 'marginTop',
  marginBlockEnd: 'marginBottom',
  marginInlineStart: 'marginLeft',
  marginInlineEnd: 'marginRight',
  paddingBlockStart: 'paddingTop',
  paddingBlockEnd: 'paddingBottom',
  paddingInlineStart: 'paddingLeft',
  paddingInlineEnd: 'paddingRight',
  borderBlockStartWidth: 'borderTopWidth',
  borderBlockEndWidth: 'borderBottomWidth',
  borderInlineStartWidth: 'borderLeftWidth',
  borderInlineEndWidth: 'borderRightWidth',
  blockSize: 'height',
  inlineSize: 'width'
};

const LOGICAL_TO_PHYSICAL_FLOW_MAP_VERTICAL_LR = {
  marginBlockStart: 'marginLeft',
  marginBlockEnd: 'marginRight',
  marginInlineStart: 'marginTop',
  marginInlineEnd: 'marginBottom',
  paddingBlockStart: 'paddingLeft',
  paddingBlockEnd: 'paddingRight',
  paddingInlineStart: 'paddingTop',
  paddingInlineEnd: 'paddingBottom',
  borderBlockStartWidth: 'borderLeftWidth',
  borderBlockEndWidth: 'borderRightWidth',
  borderInlineStartWidth: 'borderTopWidth',
  borderInlineEndWidth: 'borderBottomWidth',
  blockSize: 'width',
  inlineSize: 'height'
};

const LOGICAL_TO_PHYSICAL_FLOW_MAP_VERTICAL_RL = {
  marginBlockStart: 'marginRight',
  marginBlockEnd: 'marginLeft',
  marginInlineStart: 'marginTop',
  marginInlineEnd: 'marginBottom',
  paddingBlockStart: 'paddingRight',
  paddingBlockEnd: 'paddingLeft',
  paddingInlineStart: 'paddingTop',
  paddingInlineEnd: 'paddingBottom',
  borderBlockStartWidth: 'borderRightWidth',
  borderBlockEndWidth: 'borderLeftWidth',
  borderInlineStartWidth: 'borderTopWidth',
  borderInlineEndWidth: 'borderBottomWidth',
  blockSize: 'width',
  inlineSize: 'height'
};

function StyleFactory(id, computedStyleObject) {
  function CssComputedStyle () {}

  CssComputedStyle.prototype = computedStyleObject;

  // CssUsedStyle wraps the computed style object with getters that return
  // values suitable for rendering, called the used/actual style(CSS Cascading
  // and Inheritance Level 4 §4.5, §4.6). For example, usedStyle.borderWidth
  // would return `0` for the style `border-width: 3px; border-style: none;`.
  //
  // Since there is no DOM, some used values like `width: 10px;` calculated from
  // `width: auto;` are never stored on the style object. In that example, the
  // used width lives on the content Area object.
  //
  // For properties which never change from computed to used, like
  // usedStyle.whiteSpace, the values get picked up off of the prototype chain
  // where the computed style (§4.4) is defined.
  return new class CssUsedStyle extends CssComputedStyle {
    constructor() {
      super();
      this.id = id;

      // This is where some used values are stored. Only used values that can
      // be determined before layout, such as used border width or
      // post-box-model width and height
      this.used = {};
    }

    resolvePercentages(containingBlock) {
      for (const p of percentWidthProps) {
        if (computedStyleObject[p].unit === '%') {
          this.used[p] = computedStyleObject[p].value / 100 * containingBlock.width;
        }
      }

      if (computedStyleObject.height.unit === '%') {
        if (containingBlock.height !== null) {
          this.used.height = computedStyleObject.height.value / 100 * containingBlock.height;
        } else {
          this.used.height = 'auto'; // this happens when parent height is auto
        }
      }
    }

    resolveBoxModel() {
      if (this.boxSizing === 'border-box') {
        if (this.width !== 'auto') {
          const edges = this.borderLeftWidth
            + this.paddingLeft
            + this.paddingRight
            + this.borderRightWidth;

          this.used.width = Math.max(0, this.width - edges);
        }

        if (this.height !== 'auto') {
          const edges = this.borderTopWidth
            + this.paddingTop
            + this.paddingBottom
            + this.borderBottomWidth;

          this.used.height = Math.max(0, this.height - edges);
        }
      }
    }

    get paddingLeft() {
      if ('paddingLeft' in this.used) return this.used.paddingLeft;

      const {unit, value} = computedStyleObject.paddingLeft;

      if (unit !== 'px') {
        throw new Error(`paddingLeft of box ${this.id} never got resolved to pixels`);
      }

      return value;
    }

    get paddingRight() {
      if ('paddingRight' in this.used) return this.used.paddingRight;

      const {unit, value} = computedStyleObject.paddingRight;

      if (unit !== 'px') {
        throw new Error(`paddingRight of box ${this.id} never got resolved to pixels`);
      }

      return value;
    }

    get borderLeftWidth() {
      const {unit, value} = computedStyleObject.borderLeftWidth;

      if (unit !== 'px') {
        throw new Error(`borderLeftWidth of box ${this.id} never got resolved to pixels`);
      }

      return computedStyleObject.borderLeftStyle !== 'none' ? value : 0;
    }

    get borderRightWidth() {
      const {unit, value} = computedStyleObject.borderRightWidth;

      if (unit !== 'px') {
        throw new Error(`borderRightWidth of box ${this.id} never got resolved to pixels`);
      }

      return computedStyleObject.borderRightStyle !== 'none' ? value : 0;
    }

    get marginLeft() {
      if (computedStyleObject.marginLeft === 'auto') return 'auto';

      const {unit, value} = computedStyleObject.marginLeft;

      if (unit !== 'px') {
        throw new Error(`marginLeft of ${this.id} never got resolved to pixels`);
      }

      return value;
    }

    get marginRight() {
      if (computedStyleObject.marginRight === 'auto') return 'auto';

      const {unit, value} = computedStyleObject.marginRight;

      if (unit !== 'px') {
        throw new Error(`marginRight of ${this.id} never got resolved to pixels`);
      }

      return value;
    }

    get width() {
      if ('width' in this.used) return this.used.width;

      if (computedStyleObject.width === 'auto') return 'auto';

      const {unit, value} = computedStyleObject.width;

      if (unit !== 'px') {
        throw new Error(`width of ${this.id} never got resolved to pixels`);
      }

      return value;
    }

    get paddingTop() {
      if ('paddingTop' in this.used) return this.used.paddingTop;

      const {unit, value} = computedStyleObject.paddingTop;

      if (unit !== 'px') {
        throw new Error(`paddingTop of box ${this.id} never got resolved to pixels`);
      }

      return value;
    }

    get paddingBottom() {
      if ('paddingBottom' in this.used) return this.used.paddingBottom;

      const {unit, value} = computedStyleObject.paddingBottom;

      if (unit !== 'px') {
        throw new Error(`paddingBottom of box ${this.id} never got resolved to pixels`);
      }

      return value;
    }

    get borderTopWidth() {
      const {unit, value} = computedStyleObject.borderTopWidth;

      if (unit !== 'px') {
        throw new Error(`borderTopWidth of box ${this.id} never got resolved to pixels`);
      }

      return computedStyleObject.borderTopStyle !== 'none' ? value : 0;
    }

    get borderBottomWidth() {
      const {unit, value} = computedStyleObject.borderBottomWidth;

      if (unit !== 'px') {
        throw new Error(`borderBottomWidth of box ${this.id} never got resolved to pixels`);
      }

      return computedStyleObject.borderBottomStyle !== 'none' ? value : 0;
    }

    get marginTop() {
      if (computedStyleObject.marginTop === 'auto') return 'auto';

      const {unit, value} = computedStyleObject.marginTop;

      if (unit !== 'px') {
        throw new Error(`marginTop of ${this.id} never got resolved to pixels`);
      }

      return value;
    }

    get marginBottom() {
      if (computedStyleObject.marginBottom === 'auto') return 'auto';

      const {unit, value} = computedStyleObject.marginBottom;

      if (unit !== 'px' ) {
        throw new Error(`marginBottom of ${this.id} never got resolved to pixels`);
      }

      return value;
    }

    get height() {
      if ('height' in this.used) return this.used.height;

      if (computedStyleObject.height === 'auto') return 'auto';

      const {unit, value} = computedStyleObject.height;

      if (unit !== 'px') {
        throw new Error(`height of ${this.id} never got resolved to pixels`);
      }

      return value;
    }

    get writingModeInlineAxis() {
      if (computedStyleObject.writingMode === 'horizontal-tb') {
        return 'horizontal';
      } else {
        return 'vertical';
      }
    }

    createLogicalView(writingMode) {
      const map =
        writingMode === 'horizontal-tb' ? LOGICAL_TO_PHYSICAL_FLOW_MAP_HORIZONTAL_TB :
        writingMode === 'vertical-lr' ? LOGICAL_TO_PHYSICAL_FLOW_MAP_VERTICAL_LR :
        writingMode === 'vertical-rl' ? LOGICAL_TO_PHYSICAL_FLOW_MAP_VERTICAL_RL :
        undefined;

      if (!map) throw new Error(`writing mode ${writingMode} unknown`);

      return {
        get: prop => {
          if (!(prop in map)) throw new Error(`\`${prop}\` has no physical mapping`);
          return this[map[prop]];
        },
        set: (prop, val) => {
          if (!(prop in map)) throw new Error(`\`${prop}\` has no physical mapping`);
          return this[map[prop]] = val;
        }
      };
    }
  }
}

// Initial values for every property. Different properties have different
// initial values as specified in the property's specification. This is also
// the style that's used as the root style for inheritance. These are the
// "computed value"s as described in CSS Cascading and Inheritance Level 4 § 4.4
export const initialStyle = Object.freeze({
  whiteSpace: 'normal',
  fontSize: {value: 16, unit: 'px'},
  color: {r: 0, g: 0, b: 0, a: 1},
  fontWeight: '400',
  fontVariant: 'normal',
  fontStyle: 'normal',
  fontFamily: 'Helvetica',
  lineHeight: {value: 18, unit: 'px'},
  backgroundColor: {r: 0, g: 0, b: 0, a: 0},
  backgroundClip: 'border-box',
  display: {outer: 'inline', inner: 'flow'},
  writingMode: 'horizontal-tb',
  borderTopWidth: {value: 0, unit: 'px'},
  borderRightWidth: {value: 0, unit: 'px'},
  borderBottomWidth: {value: 0, unit: 'px'},
  borderLeftWidth: {value: 0, unit: 'px'},
  borderTopStyle: 'solid',
  borderRightStyle: 'solid',
  borderBottomStyle: 'solid',
  borderLeftStyle: 'solid',
  borderTopColor: {r: 0, g: 0, b: 0, a: 0},
  borderRightColor: {r: 0, g: 0, b: 0, a: 0},
  borderBottomColor: {r: 0, g: 0, b: 0, a: 0},
  borderLeftColor: {r: 0, g: 0, b: 0, a: 0},
  paddingTop: {value: 0, unit: 'px'},
  paddingRight: {value: 0, unit: 'px'},
  paddingBottom: {value: 0, unit: 'px'},
  paddingLeft: {value: 0, unit: 'px'},
  marginTop: {value: 0, unit: 'px'},
  marginRight: {value: 0, unit: 'px'},
  marginBottom: {value: 0, unit: 'px'},
  marginLeft: {value: 0, unit: 'px'},
  tabSize: {value: 8, unit: 'px'},
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

// Very simple property inheritance model. createStyle starts out with cascaded
// styles (CSS Cascading and Inheritance Level 4 §4.2) which is computed from
// the [style] HTML attribute and a default internal style. Then it calculates
// the specified style (§4.3) by doing inheritance and defaulting, and then
// calculates the computed style (§4.4) by resolving em, some percentages, etc.
// Used/actual styles (§4.5, §4.6) are calculated during layout, external to
// this file.
export const createComputedStyle = (() => {
  function defaultifyStyle(style, parentStyle) {
    const ret = {};

    for (const p in initialStyle) {
      if (style[p] === 'inherit' || !style[p] && inheritedStyle[p]) {
        ret[p] = parentStyle[p];
      } else if (style[p] === 'initial' || !style[p] && !inheritedStyle[p]) {
        ret[p] = initialStyle[p];
      } else {
        ret[p] = style[p];
      }
    }

    return ret;
  }

  function computeStyle(style, parentStyle) {
    const ret = {};

    for (const p in initialStyle) {
      if (!style[p]) throw new Error (`Specified style should have ${p}`);

      if (style[p].unit === 'em') {
        if (parentStyle[p].unit !== 'px') {
          throw new Error(`Can't compute ${p}, expected px units on parent`);
        }
        ret[p] = {value: parentStyle[p].value * style[p].value, unit: 'px'};
      } else if (p === 'lineHeight' && style[p].unit === null) {
        if (parentStyle[p].unit !== 'px') {
          throw new Error(`Can't compute ${p}, expected px units on parent`);
        }
        ret[p] = {value: parentStyle[p].value * style[p].value, unit: 'px'};
      } else {
        ret[p] = style[p];
      }
    }

    return ret;
  }

  return function createComputedStyle(id, cascadedStyle, parentStyle) {
    const specifiedStyle = defaultifyStyle(cascadedStyle, parentStyle);
    const computedStyle = computeStyle(specifiedStyle, parentStyle);
    return StyleFactory(id, computedStyle);
  };
})();

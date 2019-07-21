// Cascade model. This file lets you set up a cascade of declared styles and get
// the resulting used style for a given element.

const percentWidthProps = [
  'paddingLeft',
  'paddingRight',
  'paddingTop',
  'paddingBottom',
  'width'
];

function StyleFactory(id, computedStyleObject) {
  function CssComputedStyle () {}

  CssComputedStyle.prototype = computedStyleObject;

  // CssUsedStyle wraps the computed style object with getters that return
  // values suitable for rendering, called the used/actual style(CSS Cascading
  // and Inheritance Level 4 §4.5, §4.6). For example, usedStyle.borderWidth
  // would return `0` for the style `border-width: 3px; border-style: none;`.
  //
  // During rendering, an instance of CssUsedStyle will have setters invoked for
  // some used styles. If the style is `width: auto;`, at some point something
  // like usedStyle.width = 123 will happen. That sets 123 on the internal
  // this.used hash which later gets returned by the usedStyle.width getter
  //
  // For properties which never change from computed to used, like
  // usedStyle.whiteSpace, the values get picked up off of the prototype chain
  // where the computed style (§4.4) is defined.
  return new class CssUsedStyle extends CssComputedStyle {
    constructor() {
      super();
      this.id = id;

      // This is where styles are created during layout, such as in CSS 2.2
      // §10.3.3 when the width is transformed from 'auto' to a real width.
      // The getters will retrieve from here first if an entry exists
      // Currently only width, height, and margins are ever stored here
      this.used = {};
    }

    resolvePercentages(containingBlock) {
      for (const p of percentWidthProps) {
        if (computedStyleObject[p].unit === '%') {
          this.width = computedStyleObject[p].value / 100 * containingBlock.width;
        }
      }

      if (computedStyleObject.height.unit === '%') {
        if (containingBlock.height !== null) {
          this.height = computedStyleObject.height.value / 100 * containingBlock.height;
        } else {
          this.height = 'auto'; // this happens when parent height is auto
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

          this.width = Math.max(0, this.width - edges);
        }

        if (this.height !== 'auto') {
          const edges = this.borderTopWidth
            + this.paddingTop
            + this.paddingBottom
            + this.borderBottomWidth;

          this.height = Math.max(0, this.height - edges);
        }
      }
    }

    get paddingLeft() {
      const {unit, value} = computedStyleObject.paddingLeft;
      if (unit !== 'px') {
        throw new Error(`paddingLeft of box ${this.id} never got resolved to pixels`);
      }
      return value;
    }

    get paddingRight() {
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

    set marginLeft(value) {
      this.used.marginLeft = value;
    }

    get marginLeft() {
      if ('marginLeft' in this.used) return this.used.marginLeft;

      if (computedStyleObject.marginLeft === 'auto') return 'auto';

      const {unit, value} = computedStyleObject.marginLeft;

      if (unit !== 'px') {
        throw new Error(`marginLeft of ${this.id} never got resolved to pixels`);
      }

      return value;
    }

    set marginRight(value) {
      this.used.marginRight = value;
    }

    get marginRight() {
      if ('marginRight' in this.used) return this.used.marginRight;

      if (computedStyleObject.marginRight === 'auto') return 'auto';

      const {unit, value} = computedStyleObject.marginRight;

      if (unit !== 'px') {
        throw new Error(`marginRight of ${this.id} never got resolved to pixels`);
      }

      return value;
    }

    set width(value) {
      this.used.width = value;
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
      const {unit, value} = computedStyleObject.paddingTop;
      if (unit !== 'px') {
        throw new Error(`paddingTop of box ${this.id} never got resolved to pixels`);
      }
      return value;
    }

    get paddingBottom() {
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

    set marginTop(value) {
      this.used.marginTop = value;
    }

    get marginTop() {
      if ('marginTop' in this.used) return this.used.marginTop;

      if (computedStyleObject.marginTop === 'auto') return 'auto';

      const {unit, value} = computedStyleObject.marginTop;

      if (unit !== 'px') {
        throw new Error(`marginTop of ${this.id} never got resolved to pixels`);
      }

      return value;
    }

    set marginBottom(value) {
      this.used.marginBottom = value;
    }

    get marginBottom() {
      if ('marginBottom' in this.used) return this.used.marginBottom;

      if (computedStyleObject.marginBottom === 'auto') return 'auto';

      const {unit, value} = computedStyleObject.marginBottom;

      if (unit !== 'px' ) {
        throw new Error(`marginBottom of ${this.id} never got resolved to pixels`);
      }

      return value;
    }

    set height(value) {
      this.used.height = value;
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

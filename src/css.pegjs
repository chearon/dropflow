// CSS Grammar for Element#style
// =============================
//
// Expands all shorthand properties
//
// Modified from the one distributed with pegjs to parse a list of declarations
// separated by ';'. It can be used to parse the style tag's contents on an 
// element

{
  const {initial, inherited} = require('./cascade');

  function extractList(list, index) {
    return list.map(function(element) { return element[index]; });
  }

  function buildList(head, tail, index) {
    return [head].concat(extractList(tail, index))
      .filter(function(element) { return element !== null; });
  }

  function buildExpression(head, tail) {
    return tail.reduce(function(result, element) {
      return {
        type: 'Expression',
        operator: element[0],
        left: result,
        right: element[1]
      };
    }, head);
  }

  function extend(a, b) {
    for (var prop in b) {
      a[prop] = b[prop];
    }

    return a;
  }

  function combine(a) {
    return a.reduce(function(obj, next) {
      return extend(obj, next);
    }, {});
  }

  function setTopRightBottomLeft(obj, before, after, t, r, b, l) {
    obj[before + 'Top' + (after || '')] = t;
    obj[before + 'Right' + (after || '')] = r;
    obj[before + 'Bottom' + (after || '')] = b;
    obj[before + 'Left' + (after || '')] = l;
    return obj;
  }

  function setTopRightBottomLeftOr(x, obj, before, after, t, r, b, l) {
    if (!x) return setTopRightBottomLeft(obj, before, after, t, r, b, l);

    x = x.toLowerCase();

    if (x === '-top') obj[before + 'Top' + (after || '')] = t;
    if (x === '-right') obj[before + 'Right' + (after || '')] = r;
    if (x === '-bottom') obj[before + 'Bottom' + (after || '')] = b;
    if (x === '-left') obj[before + 'Left' + (after || '')] = l;

    return obj;
  }

  const colorMap = new Map([
    ['maroon', {r: 128, g: 0, b: 0, a: 1}],
    ['red', {r: 255, g: 0, b: 0, a: 1}],
    ['orange', {r: 255, g: 165, b: 0, a: 1}],
    ['yellow', {r: 255, g: 255, b: 0, a: 1}],
    ['olive', {r: 128, g: 128, b: 0, a: 1}],
    ['purple', {r: 128, g: 0, b: 128, a: 1}],
    ['fuchsia', {r: 255, g: 0, b: 255, a: 1}],
    ['white', {r: 255, g: 255, b: 255, a: 1}],
    ['lime', {r: 0, g: 255, b: 0, a: 1}],
    ['green', {r: 0, g: 128, b: 0, a: 1}],
    ['navy', {r: 0, g: 0, b: 128, a: 1}],
    ['blue', {r: 0, g: 0, b: 255, a: 1}],
    ['aqua', {r: 0, g: 255, b: 255, a: 1}],
    ['teal', {r: 0, g: 128, b: 128, a: 1}],
    ['black', {r: 0, g: 0, b: 0, a: 1}],
    ['silver', {r: 192, g: 192, b: 192, a: 1}],
    ['gray', {r: 128, g: 128, b: 128, a: 1}],
    ['transparent', {r: 255, g: 255, b: 255, a: 0}]
  ]);

  let $font = {}, $fontNormals = 0;
}

start
  = S* declarationsHead:declaration?
    declarationsTail:(';' S* declaration?)*
    { return combine(buildList(declarationsHead, declarationsTail, 2)); };

declaration
  = font_size_dec
  / line_height_dec
  / font_style_dec
  / font_weight_dec
  / font_variant_dec
  / font_family_dec
  / font_dec
  / color_dec
  / direction_dec
  / display_dec
  / writing_mode_dec
  / white_space_dec
  / tab_size_dec
  / position_dec
  / margin_top_dec
  / margin_right_dec
  / margin_bottom_dec
  / margin_left_dec
  / margin_dec
  / padding_top_dec
  / padding_right_dec
  / padding_bottom_dec
  / padding_left_dec
  / padding_dec
  / border_top_width_dec
  / border_right_width_dec
  / border_bottom_width_dec
  / border_left_width_dec
  / border_width_dec
  / border_top_style_dec
  / border_right_style_dec
  / border_bottom_style_dec
  / border_left_style_dec
  / border_style_dec
  / border_top_color_dec
  / border_right_color_dec
  / border_bottom_color_dec
  / border_left_color_dec
  / border_color_dec
  / border_dec
  / width_dec
  / height_dec
  / box_sizing_dec
  / background_color_dec
  / background_clip_dec
  / name:property ':' S* value:expr {
      let r = {};
      r['_' + name] = value;
      return r;
    }

property
  = name:IDENT S* { return name; }

expr
  = head:term tail:(operator? term)* { return buildExpression(head, tail); }

operator
  = '/' S* { return '/'; }
  / ',' S* { return ','; }

term
  = quantity:(PERCENTAGE / LENGTH / EXS / ANGLE / TIME / FREQ / NUMBER)
    S*
    {
      return {
        type: 'Quantity',
        value: quantity.value,
        unit: quantity.unit
      };
    }
  / value:STRING S* { return { type: 'String', value: value }; }
  / value:URI S*    { return { type: 'URI',    value: value }; }
  / function
  / color
  / value:IDENT S*  { return value; }

function
  = name:FUNCTION S* params:expr ')' S* {
      return { type: 'Function', name: name, params: params };
    }

rgba_rgb_term
  = component:[0-9]+ '%' {
    return Math.max(0, Math.min(100, parseInt(component, 10))) * 1e-2 * 255
  }
  / component:('1'[0-9][0-9] / '2'[0-4][0-9] / '25'[0-5] / [0-9][0-9] / [0-9]) {
    return parseInt(Array.isArray(component) ? component.join('') : component, 10);
  }

rgba_a_term
  = a:[0-9]+ '%' {
    const component = a.join('');
    return Math.max(0, Math.min(100, parseInt(component, 10))) * 1e-2
  }
  / a:[0-9]* b:'.' c:[0-9]+ {
    const component = (a ? a.join('') : '') + b + c.join('');
    return Math.max(0, Math.min(1, parseFloat(component)));
  }
  / a:[0-9]+ {
    return Math.max(0, Math.min(1, parseInt(a.join(''), 10)))
  }

color
  = comment* 'rgba('
    S* r:rgba_rgb_term S* ','
    S* g:rgba_rgb_term S* ','
    S* b:rgba_rgb_term S* ','
    S* a:rgba_a_term S*
    ')'
  {
    return {r, g, b, a};
  }
  / comment* 'rgb('
    S* r:rgba_rgb_term S* ','
    S* g:rgba_rgb_term S* ','
    S* b:rgba_rgb_term S*
    ')'
  {
    return {r, g, b, a: 1};
  }
  / comment* '#'
    r:([a-f0-9]i[a-f0-9]i)
    g:([a-f0-9]i[a-f0-9]i)
    b:([a-f0-9]i[a-f0-9]i)
    a:([a-f0-9]i[a-f0-9]i)?
  {
    return {
      r: parseInt(r.join(''), 16),
      g: parseInt(g.join(''), 16),
      b: parseInt(b.join(''), 16),
      a: a ? parseInt(a.join(''), 16) / 255 : 1
    }
  }
  / comment* '#' r:[a-f0-9]i g:[a-f0-9]i b:[a-f0-9] a:[a-f0-9]i?
  {
    return {
      r: parseInt(r + r, 16),
      g: parseInt(g + g, 16),
      b: parseInt(b + b, 16),
      a: a ? parseInt(a + a, 16) / 255 : 1
    }
  }
  / ('maroon' / 'red' / 'orange' / 'yellow' / 'olive' / 'purple' / 'fuchsia' / 'white' / 'lime' / 'green' / 'navy' / 'blue' / 'aqua' / 'teal' / 'black' / 'silver' / 'gray')
  {
    return colorMap.get(text())
  }

default
  = 'inherit' { return inherited; }
  / 'initial' { return initial; }

// ----- Specific properties and shorthands - values -----

absolute_size
  = 'xx-small' { return 9 }
  / 'x-small' { return 10 }
  / 'small' { return 13 }
  / 'medium' { return 16 }
  / 'large' { return 18 }
  / 'x-large' { return 24 }
  / 'xx-large' { return 32 }

relative_size
  = 'smaller' { return { value: 1/1.2, unit: 'em' } }
  / 'larger' { return { value: 1.2, unit: 'em' } }

font_size
  = font_size:(relative_size / absolute_size / LENGTH / PERCENTAGE) { return font_size; }

line_height
  = line_height:('normal' / NUMBER / LENGTH / PERCENTAGE) { return line_height; }

font_style
  = 'normal' / 'italic' / 'oblique'

font_weight
  = 'normal' / 'bolder' / 'lighter'
  / 'bold' { return 700; }
  / [0-9]+ { return +text() >= 1 && +text() <= 1000 ? +text() : undefined; }

font_variant
  = 'normal' / 'small-caps'

font_stretch
  = 'normal' / 'ultra-condensed' / 'extra-condensed' / 'condensed'
  / 'semi-condensed' / 'semi-expanded' / 'expanded' / 'extra-expanded'
  / 'ultra-expanded'

font_family
  = family:STRING S* { return family; }
  / head:ident tail:(S* ident)* { return buildList(head, tail, 1).join(' '); }

font_family_list = f1:font_family fn:(',' S* font_family)* {
  return [f1].concat(fn ? extractList(fn, 2) : []);
}

font_style_short = s:font_style {
  if ($font) {
    if (s === 'normal') {
      if (++$fontNormals > 4) $font = undefined;
    } else {
      if ('fontStyle' in $font) {
        $font = undefined;
      } else {
        $font.fontStyle = s;
        ++$fontNormals;
      }
    }
  }
}

font_weight_short = s:font_weight {
  if ($font) {
    if (s === undefined || 'fontWeight' in $font) {
      $font = undefined;
    } else {
      $font.fontWeight = s;
      ++$fontNormals;
    }
  }
}

font_variant_short = s:font_variant {
  if ($font) {
    if ('fontVariant' in $font) {
      $font = undefined;
    } else {
      $font.fontVariant = s;
      ++$fontNormals;
    }
  }
}

font_stretch_short = s:font_stretch {
  if ($font) {
    if ('fontStretch' in $font) {
      $font = undefined;
    } else {
      $font.fontStretch = s;
      ++$fontNormals;
    }
  }
}

font_wssv = ((font_style_short / !font_size font_weight_short / font_variant_short / font_stretch_short) S+)* {
  const ret = $font;
  $font = {};
  $fontNormals = 0;
  return ret;
}

font
  = x:(font_wssv font_size ((!(S* '/') S+) / (S* '/' S* line_height S+)) font_family_list) {
    if (x[0] === undefined) return;

    const ret = Object.assign({
      fontStyle: 'normal',
      fontWeight: 'normal',
      fontVariant: 'normal',
      fontStretch: 'normal'
    }, x[0]);

    ret.fontSize = x[1];
    ret.lineHeight = x[2][1] === '/' ? x[2][3] : 'normal';
    ret.fontFamily = x[3];
    return ret;
  }

direction
  = 'ltr' / 'rtl'

display
  = 'block' { return {outer: 'block', inner: 'flow'}; }
  / 'inline-block' { return {outer: 'inline', inner: 'flow-root'}; }
  / 'inline' { return {outer: 'inline', inner: 'flow'}; }
  / 'flow-root' { return {outer: 'block', inner: 'flow-root'}; }

writing_mode
  = 'horizontal-tb' / 'vertical-lr' / 'vertical-rl'

white_space
  = 'normal' / 'nowrap' / 'pre-wrap' / 'pre-line' / 'pre'

tab_size
  = LENGTH / NUMBER

position
  = 'absolute' / 'relative' / 'static'

length_side
  = LENGTH / PERCENTAGE

margin_side
  = LENGTH / PERCENTAGE / 'auto'

border_style
  = 'none' / 'hidden' / 'dotted' / 'dashed' / 'solid' / 'double'
  / 'groove' / 'ridge' / 'inset' / 'outset'

// ----- Specific properties and shorthands - declarations -----

font_size_dec
  = 'font-size'i S* ':' S* fontSize:(font_size / default) {
    return {fontSize};
  }

line_height_dec
  = 'line-height'i S* ':' S* lineHeight:(line_height / default) {
    return {lineHeight};
  }

font_style_dec
  = 'font-style'i S* ':' S* fontStyle:(font_style / default) {
    return {fontStyle};
  }

font_weight_dec
  = 'font-weight'i S* ':' S* fontWeight:(font_weight / default) {
    return fontWeight && {fontWeight};
  }

font_variant_dec
  = 'font-variant'i S* ':' S* fontVariant:(font_variant / default) {
    return {fontVariant};
  }

font_stretch_dec
  = 'font-stretch'i S* ':' S* fontStretch:(font_stretch / default) {
    return {fontStretch};
  }

font_family_dec
  = 'font-family'i S* ':' S* fontFamily:(default / font_family_list) {
    return {fontFamily};
  }

font_dec
  = 'font'i S* ':' S* font:(font / default) {
    return font && (typeof font === "object" ? font : {font});
  }

color_dec
  = 'color'i S* ':' S* color:(color / default) {
    return {color};
  }

direction_dec
  = 'direction'i S* ':' S* direction:(direction / default) {
    return {direction};
  }

display_dec
  = 'display'i S* ':' S* display:(display / default) {
    return {display};
  }

writing_mode_dec
  = 'writing-mode'i S* ':' S* writingMode:writing_mode {
    return {writingMode};
  }

white_space_dec
  = 'white-space'i S* ':' S* whiteSpace:(white_space / default) {
    return {whiteSpace};
  }

tab_size_dec
  = 'tab-size'i S* ':' S* tabSize:(tab_size / default) {
    return {tabSize};
  }

position_dec
  = 'position'i S* ':' S* position:(position / default) {
    return {position};
  }

margin_top_dec
  = 'margin-top'i S* ':' S* marginTop:(margin_side / default) {
    return {marginTop};
  }

margin_right_dec
  = 'margin-right'i S* ':' S* marginRight:(margin_side / default) {
    return {marginRight};
  }

margin_bottom_dec
  = 'margin-bottom'i S* ':' S* marginBottom:(margin_side / default) {
    return {marginBottom};
  }

margin_left_dec
  = 'margin-left'i S* ':' S* marginLeft:(margin_side / default) {
    return {marginLeft};
  }

margin_dec
  = 'margin'i S* ':' S* t:margin_side S* r:margin_side S* b:margin_side S* l:margin_side {
    return setTopRightBottomLeft({}, 'margin', '', t, r, b, l);
  }
  / 'margin'i S* ':' S* t:margin_side S* h:margin_side S* b:margin_side {
    return setTopRightBottomLeft({}, 'margin', '', t, h, b, h);
  }
  / 'margin'i S* ':' S* v:margin_side S* h:margin_side {
    return setTopRightBottomLeft({}, 'margin', '', v, h, v, h);
  }
  / 'margin'i S* ':' S* s:(margin_side / default) {
    return setTopRightBottomLeft({}, 'margin', '', s, s, s, s);
  }

padding_top_dec
  = 'padding-top'i S* ':' S* paddingTop:(length_side / default) {
    return {paddingTop};
  }

padding_right_dec
  = 'padding-right'i S* ':' S* paddingRight:(length_side / default) {
    return {paddingRight};
  }

padding_bottom_dec
  = 'padding-bottom'i S* ':' S* paddingBottom:(length_side / default) {
    return {paddingBottom};
  }

padding_left_dec
  = 'padding-left'i S* ':' S* paddingLeft:(length_side / default) {
    return {paddingLeft};
  }

padding_dec
  = 'padding'i S* ':' S* t:length_side S* r:length_side S* b:length_side S* l:length_side {
    return setTopRightBottomLeft({}, 'padding', '', t, r, b, l);
  }
  / 'padding'i S* ':' S* t:length_side S* h:length_side S* b:length_side {
    return setTopRightBottomLeft({}, 'padding', '', t, h, b, h);
  }
  / 'padding'i S* ':' S* v:length_side S* h:length_side {
    return setTopRightBottomLeft({}, 'padding', '', v, h, v, h);
  }
  / 'padding'i S* ':' S* s:(length_side / default) {
    return setTopRightBottomLeft({}, 'padding', '', s, s, s, s);
  }

border_top_width_dec
  = 'border-top-width'i S* ':' S* borderTopWidth:(LENGTH / default) {
    return {borderTopWidth};
  }

border_right_width_dec
  = 'border-right-width'i S* ':' S* borderRightWidth:(LENGTH / default) {
    return {borderRightWidth};
  }

border_bottom_width_dec
  = 'border-bottom-width'i S* ':' S* borderBottomWidth:(LENGTH / default) {
    return {borderBottomWidth};
  }

border_left_width_dec
  = 'border-left-width'i S* ':' S* borderLeftWidth:(LENGTH / default) {
    return {borderLeftWidth};
  }

border_width_dec
  = 'border-width'i S* ':' S* t:LENGTH S* r:LENGTH S* b:LENGTH S* l:LENGTH {
    return setTopRightBottomLeft({}, 'border', 'Width', t, r, b, l);
  }
  / 'border-width'i S* ':' S* t:LENGTH S* h:LENGTH S* b:LENGTH {
    return setTopRightBottomLeft({}, 'border', 'Width', t, h, b, h);
  }
  / 'border-width'i S* ':' S* v:LENGTH S* h:LENGTH {
    return setTopRightBottomLeft({}, 'border', 'Width', v, h, v, h);
  }
  / 'border-width'i S* ':' S* s:(LENGTH / default) {
    return setTopRightBottomLeft({}, 'border', 'Width', s, s, s, s);
  }

border_top_style_dec
  = 'border-top-style'i S* ':' S* borderTopStyle:(border_style / default) {
    return {borderTopStyle};
  }

border_right_style_dec
  = 'border-right-style'i S* ':' S* borderRightStyle:(border_style / default) {
    return {borderRightStyle};
  }

border_bottom_style_dec
  = 'border-bottom-style'i S* ':' S* borderBottomStyle:(border_style / default) {
    return {borderBottomStyle};
  }

border_left_style_dec
  = 'border-left-style'i S* ':' S* borderLeftStyle:(border_style / default) {
    return {borderLeftStyle};
  }

border_style_dec
  = 'border-style'i S* ':' S* t:border_style S* r:border_style S* b:border_style S* l:border_style {
    return setTopRightBottomLeft({}, 'border', 'Style', t, r, b, l);
  }
  / 'border-style'i S* ':' S* t:border_style S* h:border_style S* b:border_style {
    return setTopRightBottomLeft({}, 'border', 'Style', t, h, b, h);
  }
  / 'border-style'i S* ':' S* v:border_style S* h:border_style {
    return setTopRightBottomLeft({}, 'border', 'Style', v, h, v, h);
  }
  / 'border-style'i S* ':' S* s:(border_style / default) {
    return setTopRightBottomLeft({}, 'border', 'Style', s, s, s, s);
  }

border_top_color_dec
  = 'border-top-color'i S* ':' S* borderTopColor:(color / default) {
    return {borderTopColor};
  }

border_right_color_dec
  = 'border-right-color'i S* ':' S* borderRightColor:(color / default) {
    return {borderRightColor};
  }

border_bottom_color_dec
  = 'border-bottom-color'i S* ':' S* borderBottomColor:(color / default) {
    return {borderBottomColor};
  }

border_left_color_dec
  = 'border-left-color'i S* ':' S* borderLeftColor:(color / default) {
    return {borderLeftColor};
  }

border_color_dec
  = 'border-color'i S* ':' S* t:color S* r:color S* b:color S* l:color {
    return setTopRightBottomLeft({}, 'border', 'Color', t, r, b, l);
  }
  / 'border-color'i S* ':' S* t:color S* h:color S* b:color {
    return setTopRightBottomLeft({}, 'border', 'Color', t, h, b, h);
  }
  / 'border-color'i S* ':' S* v:color S* h:color {
    return setTopRightBottomLeft({}, 'border', 'Color', v, h, v, h);
  }
  / 'border-color'i S* ':' S* s:(color / default) {
    return setTopRightBottomLeft({}, 'border', 'Color', s, s, s, s);
  }

border_s = '-top' / '-right' / '-bottom' / '-left'

border_dec
  = 'border'i t:border_s? S* ':' S* w:LENGTH S* s:border_style S* c:color? {
    const ret = {};
    setTopRightBottomLeftOr(t, ret, 'border', 'Width', w, w, w, w);
    setTopRightBottomLeftOr(t, ret, 'border', 'Style', s, s, s, s);
    if (c) setTopRightBottomLeftOr(t, ret, 'border', 'Color', c, c, c, c);
    return ret;
  }
  / 'border'i t:border_s? S* ':' S* s:border_style S* w:LENGTH S* c:color? {
    const ret = {};
    setTopRightBottomLeftOr(t, ret, 'border', 'Width', w, w, w, w);
    setTopRightBottomLeftOr(t, ret, 'border', 'Style', s, s, s, s);
    if (c) setTopRightBottomLeftOr(t, ret, 'border', 'Color', c, c, c, c);
    return ret;
  }
  / 'border'i t:border_s? S* ':' S* w:LENGTH S* c:color S* s:border_style? {
    const ret = {};
    setTopRightBottomLeftOr(t, ret, 'border', 'Width', w, w, w, w);
    setTopRightBottomLeftOr(t, ret, 'border', 'Color', c, c, c, c);
    if (s) setTopRightBottomLeftOr(t, ret, 'border', 'Style', s, s, s, s);
    return ret;
  }
  / 'border'i t:border_s? S* ':' S* c:color S* w:LENGTH S* s:border_style? {
    const ret = {};
    setTopRightBottomLeftOr(t, ret, 'border', 'Width', w, w, w, w);
    setTopRightBottomLeftOr(t, ret, 'border', 'Color', c, c, c, c);
    if (s) setTopRightBottomLeftOr(t, ret, 'border', 'Style', s, s, s, s);
    return ret;
  }
  / 'border'i t:border_s? S* ':' S* c:color S* s:border_style S* w:LENGTH? {
    const ret = {};
    setTopRightBottomLeftOr(t, ret, 'border', 'Color', c, c, c, c);
    setTopRightBottomLeftOr(t, ret, 'border', 'Style', s, s, s, s);
    if (w) setTopRightBottomLeftOr(t, ret, 'border', 'Width', w, w, w, w);
    return ret;
  }
  / 'border'i t:border_s? S* ':' S* s:border_style S* c:color S* w:LENGTH? {
    const ret = {};
    setTopRightBottomLeftOr(t, ret, 'border', 'Color', c, c, c, c);
    setTopRightBottomLeftOr(t, ret, 'border', 'Style', s, s, s, s);
    if (w) setTopRightBottomLeftOr(t, ret, 'border', 'Width', w, w, w, w);
    return ret;
  }
  / 'border'i t:border_s? S* ':' S* w:LENGTH S* {
    return setTopRightBottomLeftOr(t, {}, 'border', 'Width', w, w, w, w);
  }
  / 'border'i t:border_s? S* ':' S* c:color S* {
    return setTopRightBottomLeftOr(t, {}, 'border', 'Color', c, c, c, c);
  }
  / 'border'i t:border_s? S* ':' S* s:border_style S* {
    return setTopRightBottomLeftOr(t, {}, 'border', 'Style', s, s, s, s);
  }
  / 'border'i t:border_s? S* ':' S* i:default S* {
    const ret = setTopRightBottomLeftOr(t, {}, 'border', 'Style', i, i, i, i);
    setTopRightBottomLeftOr(t, ret, 'border', 'Width', i, i, i, i);
    setTopRightBottomLeftOr(t, ret, 'border', 'Color', i, i, i, i);
    return ret;
  }

background_color_dec
  = 'background-color'i S* ':' S* backgroundColor:(color / default) {
    return {backgroundColor};
  }

background_clip_dec
  = 'background-clip'i S* ':' S* backgroundClip:('border-box' / 'content-box' / 'padding-box' / default) {
    return {backgroundClip};
  }

width_dec
  = 'width'i S* ':' S* width:(length_side / 'auto' / default) {
    return {width};
  }

height_dec
  = 'height'i S* ':' S* height:(length_side / 'auto' / default) {
    return {height};
  }

box_sizing_dec
  = 'box-sizing'i S* ':' S* boxSizing:('border-box' / 'content-box' / default) {
    return {boxSizing};
  }

// ----- G.2 Lexical scanner -----

// Macros

h
  = [0-9a-f]i

nonascii
  = [\x80-\uFFFF]

unicode
  = '\\' digits:$(h h? h? h? h? h?) ('\r\n' / [ \t\r\n\f])? {
      return String.fromCharCode(parseInt(digits, 16));
    }

escape
  = unicode
  / '\\' ch:[^\r\n\f0-9a-f]i { return ch; }

nmstart
  = [_a-z]i
  / nonascii
  / escape

nmchar
  = [_a-z0-9-]i
  / nonascii
  / escape

string1
  = '"' chars:([^\n\r\f\\"] / '\\' nl:nl { return ''; } / escape)* '"' {
      return chars.join('');
    }

string2
  = "'" chars:([^\n\r\f\\'] / '\\' nl:nl { return ''; } / escape)* "'" {
      return chars.join('');
    }

comment
  = '/*' [^*]* '*'+ ([^/*] [^*]* '*'+)* '/'

ident
  = prefix:$'-'? start:nmstart chars:nmchar* {
      return prefix + start + chars.join('');
    }

name
  = chars:nmchar+ { return chars.join(''); }

num
  = [+-]? ([0-9]* '.' [0-9]+ / [0-9]+) ('e' [+-]? [0-9]+)? {
      return parseFloat(text());
    }

string
  = string1
  / string2

url
  = chars:([!#$%&*-\[\]-~] / nonascii / escape)* { return chars.join(''); }

s
  = [ \t\r\n\f]+

w
  = s?

nl
  = '\n'
  / '\r\n'
  / '\r'
  / '\f'

A  = 'a'i / '\\' '0'? '0'? '0'? '0'? [\x41\x61] ('\r\n' / [ \t\r\n\f])? { return 'a'; }
C  = 'c'i / '\\' '0'? '0'? '0'? '0'? [\x43\x63] ('\r\n' / [ \t\r\n\f])? { return 'c'; }
D  = 'd'i / '\\' '0'? '0'? '0'? '0'? [\x44\x64] ('\r\n' / [ \t\r\n\f])? { return 'd'; }
E  = 'e'i / '\\' '0'? '0'? '0'? '0'? [\x45\x65] ('\r\n' / [ \t\r\n\f])? { return 'e'; }
G  = 'g'i / '\\' '0'? '0'? '0'? '0'? [\x47\x67] ('\r\n' / [ \t\r\n\f])? / '\\g'i { return 'g'; }
H  = 'h'i / '\\' '0'? '0'? '0'? '0'? [\x48\x68] ('\r\n' / [ \t\r\n\f])? / '\\h'i { return 'h'; }
I  = 'i'i / '\\' '0'? '0'? '0'? '0'? [\x49\x69] ('\r\n' / [ \t\r\n\f])? / '\\i'i { return 'i'; }
K  = 'k'i / '\\' '0'? '0'? '0'? '0'? [\x4b\x6b] ('\r\n' / [ \t\r\n\f])? / '\\k'i { return 'k'; }
L  = 'l'i / '\\' '0'? '0'? '0'? '0'? [\x4c\x6c] ('\r\n' / [ \t\r\n\f])? / '\\l'i { return 'l'; }
M  = 'm'i / '\\' '0'? '0'? '0'? '0'? [\x4d\x6d] ('\r\n' / [ \t\r\n\f])? / '\\m'i { return 'm'; }
N  = 'n'i / '\\' '0'? '0'? '0'? '0'? [\x4e\x6e] ('\r\n' / [ \t\r\n\f])? / '\\n'i { return 'n'; }
O  = 'o'i / '\\' '0'? '0'? '0'? '0'? [\x4f\x6f] ('\r\n' / [ \t\r\n\f])? / '\\o'i { return 'o'; }
P  = 'p'i / '\\' '0'? '0'? '0'? '0'? [\x50\x70] ('\r\n' / [ \t\r\n\f])? / '\\p'i { return 'p'; }
R  = 'r'i / '\\' '0'? '0'? '0'? '0'? [\x52\x72] ('\r\n' / [ \t\r\n\f])? / '\\r'i { return 'r'; }
S_ = 's'i / '\\' '0'? '0'? '0'? '0'? [\x53\x73] ('\r\n' / [ \t\r\n\f])? / '\\s'i { return 's'; }
T  = 't'i / '\\' '0'? '0'? '0'? '0'? [\x54\x74] ('\r\n' / [ \t\r\n\f])? / '\\t'i { return 't'; }
U  = 'u'i / '\\' '0'? '0'? '0'? '0'? [\x55\x75] ('\r\n' / [ \t\r\n\f])? / '\\u'i { return 'u'; }
X  = 'x'i / '\\' '0'? '0'? '0'? '0'? [\x58\x78] ('\r\n' / [ \t\r\n\f])? / '\\x'i { return 'x'; }
Z  = 'z'i / '\\' '0'? '0'? '0'? '0'? [\x5a\x7a] ('\r\n' / [ \t\r\n\f])? / '\\z'i { return 'z'; }

// Tokens

S "whitespace"
  = comment* s

STRING "string"
  = comment* string:string { return string; }

IDENT "identifier"
  = comment* ident:ident { return ident; }

HASH "hash"
  = comment* '#' name:name { return '#' + name; }

EXS "length"
  = comment* value:num E X { return { value: value, unit: 'ex' }; }

LENGTH "length"
  = comment* value:num P X { return value; }
  / comment* value:num C M { return { value: value, unit: 'cm' }; }
  / comment* value:num M M { return { value: value, unit: 'mm' }; }
  / comment* value:num I N { return { value: value, unit: 'in' }; }
  / comment* value:num P T { return { value: value, unit: 'pt' }; }
  / comment* value:num P C { return { value: value, unit: 'pc' }; }
  / comment* value:num E M { return { value: value, unit: 'em' }; }
  / comment* '0' { return 0; }

ANGLE "angle"
  = comment* value:num D E G   { return { value: value, unit: 'deg'  }; }
  / comment* value:num R A D   { return { value: value, unit: 'rad'  }; }
  / comment* value:num G R A D { return { value: value, unit: 'grad' }; }

TIME "time"
  = comment* value:num M S_ { return { value: value, unit: 'ms' }; }
  / comment* value:num S_   { return { value: value, unit: 's'  }; }

FREQ "frequency"
  = comment* value:num H Z   { return { value: value, unit: 'hz' }; }
  / comment* value:num K H Z { return { value: value, unit: 'kh' }; }

PERCENTAGE "percentage"
  = comment* value:num '%' { return { value: value, unit: '%' }; }

NUMBER "number"
  = comment* value:num { return { value: value, unit: null }; }

URI "uri"
  = comment* U R L '('i w url:string w ')' { return url; }
  / comment* U R L '('i w url:url w ')'    { return url; }

FUNCTION "function"
  = comment* name:ident '(' { return name; }

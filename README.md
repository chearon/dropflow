# overflow

Overflow is a CSS layout engine created to explore the reaches of the foundational CSS standards (that is, inlines, blocks, floats, positioning and eventually tables, but not flexbox or grid). It has a high quality text layout implementation and is capable of displaying many of the languages of the world. You can use it to generate PDFs or images on the backend with Node and [node-canvas](https://github.com/Automattic/node-canvas) or render rich, wrapped text to a canvas in the browser.

# Features

* Bidirectional and RTL text
* Optional hyperscript (`h()`) API with styles as objects in addition to accepting HTML and CSS
* Any OpenType/TrueType/WOFF buffer can (and must) be registered
* Font fallbacks at the grapheme level
* Colored diacritics
* Desirable line breaking (e.g. carries starting padding to the next line)
* Optimized shaping
* Inherited and cascaded styles are never calculated twice
* Handles as many CSS layout edge cases as I can find
* Fully typed
* Lots of tests
* Fast

# Performance characteristics

Performance is a top goal and is second only to correctness. Run the performance examples in the `examples` directory to see the numbers for yourself.

* 8 paragraphs with several inline spans of different fonts can be turned from HTML to image in 7ms on a 2019 MacBook Pro and 16ms on a 2012 MacBook Pro (`perf-1.ts`)
* The Little Prince (over 500 paragraphs) can be turned from HTML to image in under 150ms on a 2019 MacBook Pro and under 300ms on a 2012 MacBook Pro (`perf-2.ts`) 
* A 10-letter word can be generated and laid out (not painted) in under 25µs on a 2019 MacBook Pro and under 80µs on a 2012 MacBook Pro (`perf-3.ts`)

Shaping is done internally, as web browsers do, with [harfbuzzjs](https://github.com/harfbuzz/harfbuzzjs). Harfbuzzjs can achieve performance metrics similar to `CanvasRenderingContext2D`'s `measureText`, but it is not as fast. A smart implementation of text layout in Javascript that uses `measureText` (such as using a word cache, which is what GSuite apps do) will still be faster than overflow, but not significantly so, and possibly with correctness drawbacks (shaping boundaries can easily be chosen incorrectly without consulting the font).

The fastest performance can be achieved by using the hyperscript API, which creates a DOM directly and skips the typical HTML and CSS parsing steps. Take care to re-use style objects to get the most benefits. Reflows at different widths are faster than recreating the layout tree.

# HTML API

```ts
import {parse, layout, paintToCanvas, registerFont, eachRegisteredFont} from 'overflow';
import {createCanvas, registerFont as canvasRegisterFont} from 'canvas';
import fs from 'node:fs';

const font = new Uint8Array(fs.readFileSync(new URL('Roboto.ttf', import.meta.url)));

registerFont(font, 'Roboto.ttf' /* must be unique */);

eachRegisteredFont(match => canvasRegisterFont(match.filename, match.toCssSpec()));

const rootElement = parse(`
  <div style="background-color: gray;">
    Hello, <span style="font-weight: bold; color: red;">World!</span>
  </div>
`);

const blockContainer = generate(rootElement);
layout(blockContainer, 640 /* width */, 480 /* height */);
paintToCanvas(blockContainer, ctx);

canvas.createPNGStream().pipe(fs.writeFileSync(new URL('hello_world.png', import.meta.url));
```

# Hyperscript API

```ts
import {h, layout, paintToCanvas, registerFont, eachRegisteredFont} from 'overflow';
import {createCanvas, registerFont as canvasRegisterFont} from 'canvas';
import fs from 'node:fs';

const font = new Uint8Array(fs.readFileSync(new URL('Roboto.ttf', import.meta.url)));

registerFont(font, 'Roboto.ttf' /* must be unique */);

eachRegisteredFont(match => canvasRegisterFont(match.filename, match.toCssSpec()));

// always save style references and re-use them if you can
const divStyle = {backgroundColor: {r: 128, g: 128, b: 128, a: 1}};
const spanStyle = {fontWeight: 700, color: {r: 255, g: 0, b: 0, a: 1}};
const rootElement = h('div', {style: divStyle}, [
  'Hello, ',
  h('span', {style: spanStyle}, ['World!'])
]);

const blockContainer = generate(rootElement);
layout(blockContainer, 640 /* width */, 480 /* height */);
paintToCanvas(blockContainer, ctx);

canvas.createPNGStream().pipe(fs.writeFileSync(new URL('hello_world.png', import.meta.url));
```

# Supported CSS rules

Following are rules that work or will work soon. Shorthand properties are not listed. If you see all components of a shorthand (for example, `border-style`, `border-width`, `border-color`) then the shorthand is assumed to be supported (for example `border`).

## Inline formatting

| Property | Values | Status | Notes |
| -- | -- | -- | -- |
| <code>color</code> | `rgba()`, `rgb()`, `#rrggbb`, `#rgb`, `#rgba` | ✅&zwj;&nbsp;Works | |
| <code>direction</code> | `ltr`, `rtl` | ✅&zwj;&nbsp;Works | |
| <code>font-&zwj;family</code> |  | ✅&zwj;&nbsp;Works | |
| <code>font-&zwj;size</code> | `em`, `px`, `smaller` etc, `small` etc, `cm` etc | ✅&zwj;&nbsp;Works | |
| <code>font-&zwj;stretch</code> | `condensed` etc | ✅&zwj;&nbsp;Works | |
| <code>font-&zwj;style</code> | `normal`, `italic`, `oblique` | ✅&zwj;&nbsp;Works | |
| <code>font-&zwj;variant</code> | | 🚧&zwj;&nbsp;Planned | |
| <code>font-&zwj;weight</code> | `normal`, `bolder`, `lighter` `light`, `bold`, `100`-`900` | ✅&zwj;&nbsp;Works | |
| <code>line-&zwj;height</code> | `normal`, `px`, `em`, `%`, `number` | ✅&zwj;&nbsp;Works | |
| <code>tab-&zwj;size</code> | | 🚧&zwj;&nbsp;Planned | |
| <code>text-&zwj;align</code> | `start`, `end`, `left`, `right`, `center` | ✅&zwj;&nbsp;Works |  |
| <code>text-&zwj;decoration</code> | | 🚧&zwj;&nbsp;Planned | |
| <code>unicode-&zwj;bidi</code> | | 🚧&zwj;&nbsp;Planned | |
| <code>vertical-&zwj;align</code> | `baseline`, `middle`, `sub`, `super`, `text-top`, `text-bottom`, `%`, `px` etc, `top`, `bottom` | ✅&zwj;&nbsp;Works | |
| <code>white-&zwj;space</code> | `normal`, `nowrap`, `pre`, `pre-wrap`, `pre-line` | ✅&zwj;&nbsp;Works | |

## Block formatting

| Property | Values | Status | Notes |
| -- | -- | -- | -- |
| <code>clear</code> |  `left`, `right`, `both`, `none` |  ✅&zwj;&nbsp;Works | |
| <code>float</code> | `left`, `right`, `none` | ✅&zwj;&nbsp;Works | |
| <code>writing-&zwj;mode</code> | `horizontal-tb`, `vertical-lr`, `vertical-rl` | 🏗 Partially done | Implemented for BFCs but not IFCs yet |

## Boxes and positioning

| Property | Values | Status | Notes |
| -- | -- | -- | -- |
| <code>background-&zwj;clip</code> | `border-box`, `content-box`, `padding-box` | ✅&zwj;&nbsp;Works | |
| <code>background-&zwj;color</code> | `rgba()`, `rgb()`, `#rrggbb`, `#rgb`, `#rgba` | ✅&zwj;&nbsp;Works | |
| <code>border-&zwj;color</code> | `rgba()`, `rgb()`, `#rrggbb`, `#rgb`, `#rgba` | ✅&zwj;&nbsp;Works | |
| <code>border-&zwj;style</code> | `solid`, `none` | ✅&zwj;&nbsp;Works | |
| <code>border-&zwj;width</code> | `em`, `px`, `cm` etc | ✅&zwj;&nbsp;Works | |
| <code>bottom</code> | | 🚧&zwj;&nbsp;Planned | |
| <code>box-&zwj;sizing</code> | `border-box`, `content-box` | ✅&zwj;&nbsp;Works | |
| <code>display</code> | `block`, `inline`, `flow-root`, `none` | ✅&zwj;&nbsp;Works | |
| <code>display</code> | `inline-block`, `table` | 🚧&zwj;&nbsp;Planned |  | |
| <code>height</code> | `em`, `px`, `%`, `cm` etc, `auto` | ✅&zwj;&nbsp;Works | |
| <code>left</code> | | 🚧&zwj;&nbsp;Planned | |
| <code>margin</code> | `em`, `px`, `%`, `cm` etc, `auto` | ✅&zwj;&nbsp;Works | |
| <code>padding</code> | `em`, `px`, `%`, `cm` etc | ✅&zwj;&nbsp;Works | |
| <code>position</code> | `absolute` | 🚧&zwj;&nbsp;Planned | |
| <code>position</code> | `fixed` | 👎&zwj;&nbsp;No&nbsp;interest<sup>1</sup> | |
| <code>position</code> | `relative` | 🚧&zwj;&nbsp;Planned | |
| <code>right</code> | | 🚧&zwj;&nbsp;Planned | |
| <code>top</code> | | 🚧&zwj;&nbsp;Planned | |
| <code>overflow</code> | | 🚧&zwj;&nbsp;Planned | |
| <code>width</code> | `em`, `px`, `%`, `cm` etc, `auto` | ✅&zwj;&nbsp;Works | |
| <code>z-index</code> | | 🚧&zwj;&nbsp;Planned | |

<sup>1</sup>Any document that uses `position: fixed` could be reorganized and updated to use `position: absolute` and look identical. For that reason, I don't find fixed positioning very interesting.

# Third party components

* [fb55/htmlparser2](https://github.com/fb55/htmlparser2) parses HTML (inlined into source tree)
* [peggyjs/peggy](https://github.com/peggyjs/peggy) builds the CSS parser
* [foliojs/linebreak](https://github.com/foliojs/linebreak) provides Unicode break indices (inlined into source tree)
* [foliojs/grapheme-breaker](https://github.com/foliojs/grapheme-breaker) provides Unicode grapheme boundaries (inlined into source tree)
* [chearon/itemizer](https://github.com/chearon/itemizer) produces shaping boundaries with the help of [Tehreer/SheenBidi](https://github.com/Tehreer/SheenBidi) and [google/emoji-segmenter](https://github.com/google/emoji-segmenter)
* [harfbuzz/harfbuzzjs](https://github.com/harfbuzz/harfbuzzjs) does font shaping

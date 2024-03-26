# dropflow

Dropflow is a CSS layout engine created to explore the reaches of the foundational CSS standards (that is: inlines, blocks, floats, positioning and eventually tables, but not flexbox or grid). It has a high quality text layout implementation and is capable of displaying many of the languages of the world. You can use it to generate PDFs or images on the backend with Node and [node-canvas](https://github.com/Automattic/node-canvas) or render rich, wrapped text to a canvas in the browser.

# Features

* Supports over 30 properties including complex ones like `float`
* Bidirectional and RTL text
* Hyperscript (`h()`) API with styles as objects in addition to accepting HTML and CSS
* Any OpenType/TrueType buffer can (and must) be registered
* Font fallbacks at the grapheme level
* Colored diacritics
* Desirable line breaking (e.g. carries starting padding to the next line)
* Optimized shaping
* Inherited and cascaded styles are never calculated twice
* Handles as many CSS layout edge cases as I can find
* Fully typed
* Lots of tests
* Fast

# Supported CSS rules

Following are rules that work or will work soon. Shorthand properties are not listed. If you see all components of a shorthand (for example, `border-style`, `border-width`, `border-color`) then the shorthand is assumed to be supported (for example `border`).

## Inline formatting

| Property | Values | Status |
| -- | -- | -- |
| <code>color</code> | `rgba()`, `rgb()`, `#rrggbb`, `#rgb`, `#rgba` | ✅&zwj;&nbsp;Works |
| <code>direction</code> | `ltr`, `rtl` | ✅&zwj;&nbsp;Works |
| <code>font-&zwj;family</code> |  | ✅&zwj;&nbsp;Works |
| <code>font-&zwj;size</code> | `em`, `px`, `smaller` etc, `small` etc, `cm` etc | ✅&zwj;&nbsp;Works |
| <code>font-&zwj;stretch</code> | `condensed` etc | ✅&zwj;&nbsp;Works |
| <code>font-&zwj;style</code> | `normal`, `italic`, `oblique` | ✅&zwj;&nbsp;Works |
| <code>font-&zwj;variant</code> | | 🚧&zwj;&nbsp;Planned |
| <code>font-&zwj;weight</code> | `normal`, `bolder`, `lighter` `light`, `bold`, `100`-`900` | ✅&zwj;&nbsp;Works |
| <code>letter-&zwj;spacing</code> | | 🚧&zwj;&nbsp;Planned |
| <code>line-&zwj;height</code> | `normal`, `px`, `em`, `%`, `number` | ✅&zwj;&nbsp;Works |
| <code>tab-&zwj;size</code> | | 🚧&zwj;&nbsp;Planned |
| <code>text-&zwj;align</code> | `start`, `end`, `left`, `right`, `center` | ✅&zwj;&nbsp;Works |
| <code>text-&zwj;decoration</code> | | 🚧&zwj;&nbsp;Planned |
| <code>unicode-&zwj;bidi</code> | | 🚧&zwj;&nbsp;Planned |
| <code>vertical-&zwj;align</code> | `baseline`, `middle`, `sub`, `super`, `text-top`, `text-bottom`, `%`, `px` etc, `top`, `bottom` | ✅&zwj;&nbsp;Works |
| <code>white-&zwj;space</code> | `normal`, `nowrap`, `pre`, `pre-wrap`, `pre-line` | ✅&zwj;&nbsp;Works |

## Block formatting

| Property | Values | Status |
| -- | -- | -- |
| <code>clear</code> |  `left`, `right`, `both`, `none` |  ✅&zwj;&nbsp;Works |
| <code>float</code> | `left`, `right`, `none` | ✅&zwj;&nbsp;Works |
| <code>writing-&zwj;mode</code> | `horizontal-tb`, `vertical-lr`, `vertical-rl` | 🏗 Partially done<sup>1</sup> |

<sup>1</sup>Implemented for BFCs but not IFCs yet

## Boxes and positioning

| Property | Values | Status |
| -- | -- | -- |
| <code>background-&zwj;clip</code> | `border-box`, `content-box`, `padding-box` | ✅&zwj;&nbsp;Works |
| <code>background-&zwj;color</code> | `rgba()`, `rgb()`, `#rrggbb`, `#rgb`, `#rgba` | ✅&zwj;&nbsp;Works |
| <code>border-&zwj;color</code> | `rgba()`, `rgb()`, `#rrggbb`, `#rgb`, `#rgba` | ✅&zwj;&nbsp;Works |
| <code>border-&zwj;style</code> | `solid`, `none` | ✅&zwj;&nbsp;Works |
| <code>border-&zwj;width</code> | `em`, `px`, `cm` etc | ✅&zwj;&nbsp;Works |
| <code>top</code>, <code>right</code>, <code>bottom</code>, <code>left</code> | `em`, `px`, `%`, `cm` etc | ✅&zwj;&nbsp;Works |
| <code>box-&zwj;sizing</code> | `border-box`, `content-box` | ✅&zwj;&nbsp;Works |
| <code>display</code> | `block` | ✅&zwj;&nbsp;Works |
| <code>display</code> | `inline` | ✅&zwj;&nbsp;Works |
| <code>display</code> | `inline-block` | ✅&zwj;&nbsp;Works |
| <code>display</code> | `flow-root` | ✅&zwj;&nbsp;Works |
| <code>display</code> | `none` | ✅&zwj;&nbsp;Works |
| <code>display</code> | `table` | 🚧&zwj;&nbsp;Planned |  |
| <code>height</code> | `em`, `px`, `%`, `cm` etc, `auto` | ✅&zwj;&nbsp;Works |
| <code>margin</code> | `em`, `px`, `%`, `cm` etc, `auto` | ✅&zwj;&nbsp;Works |
| <code>max-height</code>, <code>max-width</code>,<br><code>min-height</code>, <code>min-width</code> | `em`, `px`, `%`, `cm` etc, `auto` | 🚧&zwj;&nbsp;Planned |
| <code>padding</code> | `em`, `px`, `%`, `cm` etc | ✅&zwj;&nbsp;Works |
| <code>position</code> | `absolute` | 🚧&zwj;&nbsp;Planned |
| <code>position</code> | `fixed` | 🚧&zwj;&nbsp;Planned |
| <code>position</code> | `relative` | ✅&zwj;&nbsp;Works |
| <code>transform</code> | | 🚧&zwj;&nbsp;Planned |
| <code>overflow</code> | | 🚧&zwj;&nbsp;Planned |
| <code>width</code> | `em`, `px`, `%`, `cm` etc, `auto` | ✅&zwj;&nbsp;Works |
| <code>z-index</code> | `number`, `auto` | ✅&zwj;&nbsp;Works |

# Usage

Dropflow works off of a DOM with inherited and calculated styles, the same way
that browsers do. You create the DOM with the familiar `h()` function, and
specify styles as plain objects.

```ts
import * as flow from 'dropflow';
import {createCanvas} from 'canvas';
import fs from 'node:fs';

// Register fonts before layout. This is a required step.
// It is only async when you don't pass an ArrayBuffer
await flow.registerFont(new URL('fonts/Roboto-Regular.ttf', import.meta.url));
await flow.registerFont(new URL('fonts/Roboto-Bold.ttf', import.meta.url));

// Always create styles at the top-level of your module if you can
const divStyle = {
  backgroundColor: {r: 28, g: 10, b: 0, a: 1},
  color: {r: 179, g: 200, b: 144, a: 1},
  textAlign: 'center' as const
};

// Since we're creating styles directly, colors have to be defined numerically
const spanStyle = {
  color: {r: 115, g: 169, b: 173, a: 1},
  fontWeight: 700
};

// Create a DOM
const rootElement = flow.dom(
  flow.h('div', {style: divStyle}, [
    'Hello, ',
    flow.h('span', {style: spanStyle}, ['World!'])
  ])
);

// Layout and paint into the entire canvas (see also renderToCanvasContext)
const canvas = createCanvas(250, 50);
flow.renderToCanvas(rootElement, canvas, /* optional density: */ 2);

// Save your image
canvas.createPNGStream().pipe(fs.createWriteStream(new URL('hello.png', import.meta.url)));

```

<div align="center">

![Hello world against a dark background, with "world" bolded and colored differently](assets/images/hello.png)

</div>

## HTML

This API is only recommended if performance is not a concern, or for learning
purposes. Parsing adds extra time (though it is fast thanks to @fb55) and
increases bundle size significantly.

```ts
import * as flow from 'dropflow/with-parse.js';
import {createCanvas} from 'canvas';
import fs from 'node:fs';

await flow.registerFont(new URL('fonts/Roboto-Regular.ttf', import.meta.url));
await flow.registerFont(new URL('fonts/Roboto-Bold.ttf', import.meta.url));

const rootElement = flow.parse(`
  <div style="background-color: #1c0a00; color: #b3c890; text-align: center;">
    Hello, <span style="color: #73a9ad; font-weight: bold;">World!</span>
  </div>
`);

const canvas = createCanvas(250, 50);
flow.renderToCanvas(rootElement, canvas, 2);

canvas.createPNGStream().pipe(fs.createWriteStream(new URL('hello.png', import.meta.url)));
```

# Performance characteristics

Performance is a top goal and is second only to correctness. Run the performance examples in the `examples` directory to see the numbers for yourself.

* 8 paragraphs with several inline spans of different fonts can be turned from HTML to image in **9ms** on a 2019 MacBook Pro and **13ms** on a 2012 MacBook Pro (`perf-1.ts`)
* The Little Prince (over 500 paragraphs) can be turned from HTML to image in under **160ms** on a 2019 MacBook Pro and under **250ms** on a 2012 MacBook Pro (`perf-2.ts`) 
* A 10-letter word can be generated and laid out (not painted) in under **25µs** on a 2019 MacBook Pro and under **50µs** on a 2012 MacBook Pro (`perf-3.ts`)

The fastest performance can be achieved by using the hyperscript API, which creates a DOM directly and skips the typical HTML and CSS parsing steps. Take care to re-use style objects to get the most benefits. Reflows at different widths are faster than recreating the layout tree.

# API

The first two steps are:

1. [Register fonts](#fonts)
2. [Create a DOM via the Hyperscript or Parse API](#hyperscript)

Then, you can either render the DOM into a canvas using its size as the viewport:

1. [Render DOM to canvas](#render-dom-to-canvas)

Or, you can use the lower-level functions to retain the layout, in case you want to re-layout at a different size, choose not to paint (for example if the layout isn't visible) or get intrinsics:

1. [Generate a tree of layout boxes from the DOM](#generate)
2. [Layout the box tree](#layout)
3. [Paint the box tree to a target like canvas](#paint)

## Fonts

### `registerFont`

```ts
async function registerFont(url: URL, options?: {paint: boolean}): Promise<void>;
async function registerFont(buffer: ArrayBuffer, url: URL, options?: {paint: boolean}): Promise<void>;
```

Registers a font to be selected by the `font` properties. Dropflow **does not search system fonts**, so you must do this with at least one font.

When a URL is passed, don't forget to `await` this. If an `ArrayBuffer` is passed, there is no need to `await`. In that function signature, the `URL` is only used to provide a unique name for the font.

The `URL` must always be unique.

In the browser, make sure the font is also loaded into page so that the paint backend can reference it with `ctx.font`. In `node-canvas`, you should either use `registerFont` from `canvas` for this font, or pass `{paint: true}` for `options`, which will try to load `node-canvas` and call its `registerFont`.

> [!NOTE]
> This will soon be replaced with an API that looks more like the `document.fonts` API in the browser.

### `unregisterFont`

```ts
function unregisterFont(url: URL): void;
```

Removes a font from the internal list so that it won't be picked by the `font` properties. This does not remove it from the paint target.


## Hyperscript

The hyperscript API is the fastest way to generate a DOM.

### `h`

```ts
type HsChild = HTMLElement | TextNode | string;

interface HsData {
  style?: DeclaredPlainStyle;
  attrs?: {[k: string]: string};
}

function h(tagName: string): HTMLElement;
function h(tagName: string, data: HsData): HTMLElement;
function h(tagName: string, children: HsChild[]): HTMLElement;
function h(tagName: string, text: string): HTMLElement;
function h(tagName: string, data: HsData, children: HsChild[] | string): HTMLElement;
```

Creates an HTMLElement. Styles go on `data.style` (see `style.ts` for supported values and their types). 

### `dom`

```ts
function dom(el: HTMLElement | HTMLElement[]): HTMLElement
```

Calculates styles and wraps with `<html>` if the root `tagName` is not `"html"`.

The entire `h` tree to render must be passed to this function before rendering.

## Parse

This part of the API brings in a lot more code due to the size of the HTML and CSS parsers. Import it like so:

```ts
import flow from 'dropflow/with-parse.js';
```

Note that only the `style` HTML attribute is supported at this time. `class` does not work yet.


### `parse`

```ts
function parse(str: string): HTMLElement;
```

Parses HTML. If you don't specify a root `<html>` element, content will be wrapped with one.

## Render DOM to canvas

This is only for simple use cases. For more advanced usage continue on to the next section.

```ts
function renderToCanvas(rootElement: HTMLElement, canvas: Canvas): void;
```

Renders the whole layout to the canvas, using its width and height as the viewport size.

## Generate

### `generate`

```ts
function generate(rootElement: HTMLElement): BlockContainer
```

Generates a box tree for the element tree. Box trees roughly correspond to DOM trees, but usually have more boxes (like for anonymous text content between block-level elements (`div`s)) and sometimes fewer (like for `display: none`).

`BlockContainer` has a `repr()` method for logging the tree.

Hold on to the return value so you can lay it out many times in different sizes, paint it or don't paint it if it's off-screen, or get intrinsics to build a higher-level logical layout (for example, spreadsheet column or row size even if the content is off screen).

## Layout

### `layout`

```ts
function layout(root: BlockContainer, width = 640, height = 480);
```

Position boxes and split text into lines so the layout tree is ready to paint. Can be called over and over with a different viewport size.

In more detail, layout involves:

* Margin collapsing for block boxes
* Passing text to HarfBuzz, iterating font fallbacks, wrapping, reshaping depending on break points
* Float placement and `clear`ing
* Positioning shaped text spans and backgrounds according to `direction` and text direction
* Second and third pass layouts for intrinsics of `float`, `inline-block`, and `absolute`s
* Post-layout positioning (`position`)

## Paint

This step paints the layout to a target. Painting can be done as many times as needed (for example, every time you clear and render all of your scene to the canvas).

Canvas is currently the only seriously supported target, but other targets will be added, like pdf.js and SVG. There is also a toy HTML target that was used early on in development, and kept around for fun.

### `paintToCanvas`

```ts
function paintToCanvas(root: BlockContainer, ctx: CanvasRenderingContext2D): void;
```

Paints the layout to a browser canvas, node-canvas, or similar standards-compliant context.

### `paintToHtml`

```ts
function paintToHtml(root: BlockContainer): string;
```

Paint to HTML! Yes, this API can actually be used to go from HTML to HTML. It generates a flat list of a bunch of absolutely positioned elements. Probably don't use this, but it can be useful in development and is amusing.

## Other

### `staticLayoutContribution`

```ts
function staticLayoutContribution(box: BlockContainer): number;
```

Returns the inline size in CSS pixels taken up by the layout, not including empty space after lines or the effect of any `width` properties. `layout` must be called before this.

The intended usage is this: after laying out text into a desired size, use `staticLayoutContribution` to get the size without any remaining empty space at the end of the lines, then `layout` again into that size to get a tightly fitting layout.

# HarfBuzz

Glyph layout is performed by [HarfBuzz](https://github.com/harfbuzz/harfbuzz) compiled to WebAssembly. This allows for a level of correctness that isn't possible by using the `measureText` API to position spans of text. If you color the "V" in the text "AV" differently in Google Sheets, you will notice kerning is lost, and the letters appear further apart than they should be. That's because two `measureText` and `fillText` calls were made on the letters, so contextual glyph advances were lost. Dropflow uses HarfBuzz on more coarse shaping boundaries (not when color is changed) so that the font is more correctly supported. 

HarfBuzz compiled to WebAssembly can achieve performance metrics similar to `CanvasRenderingContext2D`'s `measureText`. It's not as fast as `measureText`, but it's not significantly slower (neither of them are the dominators in a text layout stack) and `measureText` has other correctness drawbacks. For example, a `measureText`-based text layout implementation must use a word cache to be quick, and this is what GSuite apps do. But a word cache is not able to support fonts with effects across spaces, and to support such a font would have to involve a binary search on the paragraph's break indices, which is far slower than passing the whole paragraph to HarfBuzz. Colored diacritics are not possible in any way with `measureText` either.

# Shout-outs

dropflow doesn't have any `package.json` dependencies, but the work of many others made it possible. Javascript dependencies have been checked in and modified to varying degrees to fit this project, maintain focus, and rebel against dependency-of-dependency madness. Here are the projects I'm grateful for:

* [harfbuzz](https://github.com/harfbuzz/harfbuzz) does font shaping and provides essential font APIs (C++)
* [Tehreer/SheenBidi](https://github.com/Tehreer/SheenBidi) calculates bidi boundaries (C++)
* [foliojs/linebreak](https://github.com/foliojs/linebreak) provides Unicode break indices (JS, modified)
* [foliojs/grapheme-breaker](https://github.com/foliojs/grapheme-breaker) provides Unicode grapheme boundaries (JS, modified)
* [peggyjs/peggy](https://github.com/peggyjs/peggy) builds the CSS parser (JS, dev dependency)
* [fb55/htmlparser2](https://github.com/fb55/htmlparser2) parses HTML (JS, modified)
* [google/emoji-segmenter](https://github.com/google/emoji-segmenter) segments emoji (C++)
* [foliojs/unicode-trie](https://github.com/foliojs/unicode-trie) is used for fast unicode data (JS, heavily modified to remove unused parts)

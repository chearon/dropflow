<img height=50 src=assets/logo.png>

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
| <code>word-&zwj;break</code><br><code>overflow-&zwj;wrap</code>,<code>word-&zwj;wrap</code> | `break-word`, `normal`<br>`anywhere`, `normal` | ✅&zwj;&nbsp;Works |

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
| <code>overflow</code> | `hidden`, `visible` | ✅&zwj;&nbsp;Works |
| <code>width</code> | `em`, `px`, `%`, `cm` etc, `auto` | ✅&zwj;&nbsp;Works |
| <code>z-index</code> | `number`, `auto` | ✅&zwj;&nbsp;Works |
| <code>zoom</code> | `number`, `%` | ✅&zwj;&nbsp;Works |

# Usage

Dropflow works off of a DOM with inherited and calculated styles, the same way
that browsers do. You create the DOM with the familiar `h()` function, and
specify styles as plain objects.

```ts
import * as flow from 'dropflow';
import {createCanvas} from 'canvas';
import fs from 'node:fs';

// Register fonts before layout. This is a required step. `load()` is synchronous
// only when the source is an ArrayBuffer or file URL in node, async otherwise
const roboto1 = new flow.FontFace('Roboto', new URL('file:///Roboto-Regular.ttf'), {weight: 400});
const roboto2 = new flow.FontFace('Roboto', new URL('file:///Roboto-Bold.ttf'), {weight: 700});
flow.fonts.add(roboto1).add(roboto2);

// Always create styles at the top-level of your module if you can.
const divStyle = flow.style({
  backgroundColor: {r: 28, g: 10, b: 0, a: 1},
  textAlign: 'center',
  color: {r: 179, g: 200, b: 144, a: 1}
});

// Since we're creating styles directly, colors are numbers
const spanStyle = flow.style({
  color: {r: 115, g: 169, b: 173, a: 1},
  fontWeight: 700
});

// Create a DOM
const rootElement = flow.dom(
  flow.h('div', {style: divStyle}, [
    'Hello, ',
    flow.h('span', {style: spanStyle}, ['World!'])
  ])
);

// Layout and paint into the entire canvas (see also renderToCanvasContext)
const canvas = createCanvas(250, 50);
await flow.renderToCanvas(rootElement, canvas);

// Save your image
fs.writeFileSync(new URL('file:///hello.png'), canvas.toBuffer());
```

<div align="center">

![Hello world against a dark background, with "world" bolded and colored differently](assets/images/hello.png)

</div>

## HTML

This API is only recommended if performance is not a concern, or for learning
purposes. Parsing adds extra time (though it is fast thanks to @fb55) and
increases bundle size significantly.

```ts
import * as flow from 'dropflow';
import parse from 'dropflow/parse.js';
import {createCanvas} from 'canvas';
import fs from 'node:fs';

await flow.registerFont(new URL('fonts/Roboto-Regular.ttf', import.meta.url));
await flow.registerFont(new URL('fonts/Roboto-Bold.ttf', import.meta.url));

const rootElement = parse(`
  <div style="background-color: #1c0a00; color: #b3c890; text-align: center;">
    Hello, <span style="color: #73a9ad; font-weight: bold;">World!</span>
  </div>
`);

const canvas = createCanvas(250, 50);
flow.renderToCanvas(rootElement, canvas);

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

1. [Load dependent resources](#load)
2. [Generate a tree of layout boxes from the DOM](#generate)
3. [Layout the box tree](#layout)
4. [Paint the box tree to a target like canvas](#paint)

## Fonts

The first step in a dropflow program is to register fonts to be selected by the CSS font properties. Dropflow **does not search system fonts**, so you must construct a `FontFace` and add it at least once. The font registration API implements a **[subset of the CSS Font Loading API](#differences-with-the-css-font-loading-api)** and adds one non-standard method, `loadSync`.

`file:///` URLs will `load()` synchronously on the backend via `readFileSync`. To get synchronous behavior without having promises swallow errors, you can use the `loadSync` method.

`ArrayBuffers` are loaded immediately in the constructor, just like in the browser.

```ts
const fonts: FontFaceSet;

class FontFaceSet {
  ready: Promise<FontFaceSet>;
  has(face: FontFace): boolean;
  add(face: FontFace): FontFaceSet;
  delete(face: FontFace): boolean;
  clear(): void;
}

class FontFace {
  constructor(family: string, source: URL | ArrayBuffer, descriptors?: FontFaceDescriptors);
  load(): Promise<FontFace>;
  loaded: Promise<FontFace>;
}

interface FontFaceDescriptors {
  style?: 'normal' | 'italic' | 'oblique';
  weight?: number | 'normal' | 'bold' | 'bolder' | 'lighter';
  stretch?: 'normal' | 'ultra-condensed' | 'extra-condensed' | 'condensed' | 'semi-condensed' | 'semi-expanded' | 'expanded' | 'extra-expanded' | 'ultra-expanded';
  variant?: 'normal' | 'small-caps';
}
```

### `fonts`

```ts
import * as flow from 'dropflow';

const roboto1 = new FontFace(
  'Roboto',
  new URL('https://cdn.jsdelivr.net/fontsource/fonts/roboto@latest/latin-400-normal.ttf')
);

const roboto2 = new FontFace(
  'Roboto',
  new URL('https://cdn.jsdelivr.net/fontsource/fonts/roboto@latest/latin-700-normal.ttf'),
  {weight: 'bold'}
);

flow.fonts.add(roboto1).add(roboto2);

for (const font of flow.fonts) font.load();
await fonts.ready;

// now you can do layout!
```

### `registerNotoFonts`

```ts
import registerNotoFonts from 'dropflow/register-noto-fonts.js';
```

```ts
async function registerNotoFonts(): void;
```

Registers every [Noto](https://fonts.google.com/noto) Sans font family. The fonts are published by [FontSource](http://fontsource.org) and hosted by [jsDelivr](https://www.jsdelivr.com).

Note that this is a big import: there are more than 200 Noto Sans fonts, and the CJK fonts have large `unicodeRange` strings. It is probably better to register individual fonts for production use in a web browser. You could also copy and paste what you need from `register-noto-fonts.ts`.

For Latin, italic fonts are registered. For all scripts, one normal (400) weight and one bold (700) is registered.

Since dropflow cannot use system fonts, this is similar to having fallback fonts for many languages available on your operating system.

> [!NOTE]
> While this will make the vast majority of text renderable, some scripts should be displayed with fonts made specifically for the language being displayed. For example, Chinese, Korean, and Japanese share common Unicode code points, but can render those characters differently. There is also a small cost to inspecting every character in the document. It is always better to use specific fonts when possible.

### `createFaceFromTables`

```ts
function createFaceFromTables(source: URL | ArrayBufferLike): Promise<FontFace>;
```

This can be used if you want a font to be described (family, weight, etc) by its internal metadata. It also reads language information from the font, which will rank it more optimally in the fallback list for a run of text. It will also result in a more appropriate CJK font being chosen for CJK text when the language is known.

A `Promise` is returned if the `URL` is a non-`file://` URL, otherwise, a `FontFace` is returned directly.

This function partly exists to keep behavior that dropflow used to have, since it did not used to support specifying custom font metadata for font selection (it _only_ read metadata from inside the font). The test suite also takes advantage of the fallback list being properly ordered by language for its convenience. In most cases, it is fine to use the `FontFace` constructor instead.

```ts
function createFaceFromTablesSync(source: URL | ArrayBufferLike): FontFace;
```

If the `source` is an ArrayBuffer or a file:// URL in Node/Bun, this can be used to load synchronously and get synchronous exceptions.

### Differences with the CSS Font Loading API

1. Because dropflow doesn't use system fonts, all registered `FontFace`s are valid choices for fallback fonts. In the browser, if there isn't an exact `@font-face` or `FontFace` match for a `font-family`, none of them are used. Dropflow instead treats all registered fonts that can render the text as if they were specified in `font-family`.
2. `file://` URLs are supported server-side and can be called with the non-standard `loadSync()` method.

`FontFace`s registered with a URL must have their `load` or `loadSync` methods called before layout. It's best to have this done automatically by calling [`flow.load` or `flow.loadSync`](#load) on the entire document.

## Hyperscript

The hyperscript API is the fastest way to generate a DOM. The DOM is composed of `HTMLElement`s and `TextNode`s. The relevant properties of them are shown below. More supported properties are described in the [DOM API section](#dom-api).

### `style`

```ts
function style(properties: DeclaredStyleProperties): DeclaredStyle;
```

Use the `style` function to create a style for passing to the attributes of an element later. `DeclaredStyleProperties` is defined in `style.ts`.

### `h`

```ts
type HsChild = HTMLElement | string;

class HTMLElement {
  children: (HTMLElement | TextNode)[];
}

class TextNode {
  text: string;
}

interface HsData {
  style?: DeclaredStyle | DeclaredStyle[];
  attrs?: {[k: string]: string};
}

function h(tagName: string): HTMLElement;
function h(tagName: string, data: HsData): HTMLElement;
function h(tagName: string, children: HsChild[]): HTMLElement;
function h(tagName: string, text: string): HTMLElement;
function h(tagName: string, data: HsData, children: HsChild[] | string): HTMLElement;
```

Creates an HTMLElement. Use styles from the previous section. Currently the only attribute used is `x-dropflow-log`, which, when present on a paragraph, logs details about text shaping.

### `t`

```ts
function t(text: string): TextNode;
```

Creates a TextNode. Normally you don't need to do this, just pass a string as an `HsChild` to `flow.h`. If you need to build a DOM breadth-first, such as in a custom parser, you can use this and mutate the `text` property on the returned value.

### `dom`

```ts
type HsChild = HTMLElement | string;

function dom(el: HsChild | HsChild[]): HTMLElement
```

Calculates styles and wraps with `<html>` if the root `tagName` is not `"html"`.

The entire `h` tree to render must be passed to this function before rendering.

## Parse

This part of the API brings in a lot more code due to the size of the HTML and CSS parsers. Import it like so:

```ts
import parse from 'dropflow/parse.js';
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
function renderToCanvas(rootElement: HTMLElement, canvas: Canvas): Promise<void>;
```

Renders the whole layout to the canvas, using its width and height as the viewport size.

## Load

```ts
function load(rootElement: HTMLElement): Promise<void>;
```

Ensures that all of the fonts required by the document are loaded. This efficiently walks the document and matches styles to `FontFace` `unicodeRange`, `family`, etc. In the future, this will also fetch images.

```ts
function loadSync(rootElement: HTMLElement): void;
```

If your URLs are all file:/// URLs in Node/Bun, `loadSync` can be used to load dependencies

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

This step paints the layout to a target. Painting can be done as many times as needed (for example, every time you render your scene to the canvas).

Canvas and SVG are currently supported. If you need to paint to a new kind of surface, contributions are welcome. It is relatively easy to add a new paint target (see the `PaintBackend` interface in `src/paint.ts`).

There is also a toy HTML target that was used early on in development, and kept around for fun.

### `paintToCanvas`

```ts
function paintToCanvas(root: BlockContainer, ctx: CanvasRenderingContext2D): void;
```

Paints the layout to a browser canvas, node-canvas, or similar standards-compliant context.

### `paintToSvg`

```ts
function paintToSvg(root: BlockContainer): string;
```

Paints the layout to an SVG string, with `@font-face` rules referencing the URL you passed to `registerFont`.

### `paintToSvgElements`

```ts
function paintToSvgElements(root: BlockContainer): string;
```

Similar to `paintToSvg`, but doesn't add `<svg>` or `@font-face` rules. Useful if you're painting inside of an already-existing SVG element.

### `paintToHtml`

```ts
function paintToHtml(root: BlockContainer): string;
```

Paint to HTML! Yes, this API can actually be used to go from HTML to HTML. It generates a flat list of a bunch of absolutely positioned elements. Probably don't use this, but it can be useful in development and is amusing.

## DOM API

The root `HTMLElement` you get from the [Hyperscript](#hyperscript) and [Parse](#parse) APIs has methods you can use to find other HTMLElements in your tree. Like the browser's `querySelector` APIs, you can search by tag name, `id` attribute, or classes from the `class` attribute.

This allows you to get the render boxes associated with the element so you can do more sophisticated things like paint custom content or do hit detection.

### `query`

```ts
class HTMLElement {
  query(selector: string): HTMLElement | null;
}
```

### `queryAll`


```ts
class HTMLElement {
  queryAll(selector: string): HTMLElement[];
}
```

### `boxes`

`HTMLElement`s can have more than one render box, but will normally have just one. The two main types of boxes are `BlockContainer`s (roughly `<div>`) and `Inline`s (roughly `<span>`s).

The only time you'll see more than one `Box` for an element is if the element has mixed inline and block content. In that case, the inline content gets wrapped with anonymous `BlockContainers`.

A `BlockContainer` is generated for absolutely positioned elements, floated elements, inline-blocks, and block-level elements. For those elements, you can use its `contentArea`, `borderArea`, and `paddingArea`.

Most of the time you can assume it's a `BlockContainer`:

```ts
const dom = flow.parse('<div id="d" style="width: 100px; height: 100px;"></div>');
const root = flow.generate(dom);
flow.layout(root, 200, 200);
const [box] = dom.query('#d')!.boxes as flow.BlockContainer[];
box.contentArea.width; // 100
box.contentArea.height; // 100
```

The supported interfaces of the classes follow:

```ts
class HTMLElement {
  boxes: Box[];
}
```

```ts
class Box {
  isInline(): this is Inline;
  isBlockContainer(): this is BlockContainer;
}
```

```ts
class BlockContainer extends Box {
  public borderArea: BoxArea;
  public paddingArea: BoxArea;
  public contentArea: BoxArea;
}
```

```ts
class Inline extends Box;
```

```ts
class BoxArea {
  public x: number;
  public y: number;
  public width: number;
  public height: number;
}
```

## Environments

Dropflow is designed to support a flexible configuration of environments. In the browser, it loads fonts (soon, images too) via `fetch` and registers font buffers to `document.fonts`. In Nodejs, dropflow can load fonts synchronously via `fs.readFileSync`.

When you use the canvas backend with dropflow and `node-canvas` is present, it will call node-canvas's `registerFont`. Node-canvas doesn't support font buffers, so you have to use file:// URLs.

If you want to use `@napi-rs/canvas` or `skia-canvas`, you'll need just a few lines of code to wire `flow.environment.registerFont` to the appropriate font registration APIs.

### Hooks

There are 4 hooks you can override, documented below. They have default implementations based on whether dropflow was built for the browser or node ("browser" export condition or "default") but may not be sufficient for your use case.

```ts
const environment: Environment;

export interface Environment {
  /**
   * Must return a promise of a Uint8Array of dropflow.wasm. Typically this
   * just does a fetch() or fs.readFile.
   *
   * Since dropflow internally depends on WASM using top-level await, if you
   * want to change the location, you need to do it before importing dropflow.
   * To do that, import {environment} from 'dropflow/environment.js';
   *
   * Many package managers only guarantee the order of imports relative to other
   * imports, so you should usually call this in a separate module imported
   * before dropflow. See the README for an example.
   */
  wasmLocator(): Promise<Uint8Array>;
  /**
   * This will get called when a font in flow.fonts transitions to loaded or
   * when an already loaded font is added to flow.fonts. It's intended to be
   * used to add the font to the underlying paint target.
   *
   * Use `face.getBuffer` if the backend supports font buffers. You can use the
   * url property to access the file if it doesn't (node-canvas v2). The font
   * will be selected via `face.uniqueFamily` and nothing else.
   *
   * You can return an unregister function which will be called when the font
   * is no longer needed by dropflow (eg user called `flow.fonts.delete`).
   */
  registerFont(face: LoadedFontFace): (() => void) | void;
  /**
   * Must return a promise of a buffer for the given URL. This used for fonts
   * and will be used for images.
   */
  resolveUrl(url: URL): Promise<ArrayBufferLike>
  /**
   * Same as `resolveUrl`, but synchronous if it's a file:// URL. This should
   * throw if URL is not a file:// URL, which would mean the user called
   * loadSync on a document with asynchronous-only URLs.
   */
  resolveUrlSync(url: URL): ArrayBufferLike;
}
```

### Using `@napi-rs/canvas`

```ts
import {GlobalFonts} from '@napi-rs/canvas';
import * as flow from 'dropflow';

// Configure @napi-rs/canvas
flow.environment.registerFont = face => {
  const key = GlobalFonts.register(face.getBuffer(), face.uniqueFamily);
  if (key) return () => GlobalFonts.remove(key);
};
```

### Using `skia-canvas`

```ts
import {FontLibrary} from 'skia-canvas';
import * as flow from 'dropflow';

// Configure skia-canvas
flow.environment.registerFont = face => {
  FontLibrary.use(face.uniqueFamily, fileURLToPath(face.url));
};
```

### Overriding the WASM location

```ts
// dropflow.config.js
//
// This should usually go in its own file that is imported before dropflow,
// because dropflow's own modules use top-level await to retrieve dropflow.wasm.
// (Bundlers guarantee import order but only relative to other imports)
import {environment} from 'dropflow/environment.js';
// This will be the path to wasm if you're using Bun. Vite (others?) need ?url
import wasmUrl from 'dropflow/dropflow.wasm';
// or you can get it some other way
// const wasmUrl = 'the/path/to/dropflow.wasm';

environment.wasmLocator = function () {
  return fetch(wasmUrl).then(res => {
    if (res.status === 200) {
      return res.arrayBuffer()
    } else {
      throw new Error(res.statusText);
    }
  });
};
```

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
* [peggyjs/peggy](https://github.com/peggyjs/peggy) builds the CSS parser (JS, dev dependency)
* [fb55/htmlparser2](https://github.com/fb55/htmlparser2) parses HTML (JS, modified)
* [google/emoji-segmenter](https://github.com/google/emoji-segmenter) segments emoji (C++)
* [foliojs/grapheme-breaker](https://github.com/foliojs/grapheme-breaker) provides Unicode grapheme boundaries (JS, heavily modified for Unicode 15)
* [foliojs/unicode-trie](https://github.com/foliojs/unicode-trie) is used for fast unicode data (JS, heavily modified to remove unused parts)

# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](http://keepachangelog.com/) and this
project adheres to [Semantic Versioning](http://semver.org/).

(Unreleased)
==================
### Changed
* The layout APIs have changed. See the migration section for more info.
* Retained memory has been reduced greatly in pursuit of an extremely small memory footprint. There are a few properties left and a few more arrays to be merged, but dropflow is now very close to storing little more than needed to represent first principles. Objects that aren't needed to remember a layout are reconstructed on the fly, moving them from old generation to new generation memory which reduces GC churn. More on that here: https://chearon.net/blog/css-boxes-but-with-data-oriented-design/.
* Removed `staticLayoutContribution` API
* Text baseline coordinates are now rounded to match browsers and make underlines prettier

### Added
* Support for `word-spacing`
* Support for `text-align: justify`
* Support for Node's `createObjectURL` APIs. Loading these URLs synchronously is not possible. The dropflow `createObjectURL` API can still be used for that.
* Support for `currentColor`
* Support for `text-decoration`

### Fixed
* Several cases where glyph runs and inline backgrounds were not painted in logical order
* Trim lines after bidi reordering, not before
* Preserve zero-advance glyphs at the start or end of a paint boundary
* Don't skip painting text following a positioned inline within a positioned inline
* Text after a hard break could get painted on the previous line
* Arabic medials weren't preserved when breaking lines
* Tiny font files would not load correctly in Node 26
* Fixed synchronous loading of images and font buffers in non-SharedArrayBuffer environments
* Relatively positioned inline elements could infinite loop

### Migration guide

The new APIs are fully documented in the README, but here's an overview of the changes.

#### The Big Flat Tree Refactor
The ["Big Flat Tree" refactor](https://chearon.net/blog/css-boxes-but-with-data-oriented-design/) has resulted in `BlockContainer` no longer being returned from the layout API.

* `flow.generate` is now `flow.layout`. The signature is `(el: HTMLElement) => Layout`.
* `flow.layout` is now `flow.reflow`. The signature is `(layout: Layout, width: number, height: number) => void`.

```diff
 const el = flow.parse('hello');
-const blockContainer = flow.generate(el);
-flow.layout(blockContainer, 640, 480);
+const layout = flow.layout(el);
+flow.reflow(layout, 640, 480);
```

The word "layout" is a noun in English, so it refers to the new container of layout boxes and fragments. For now, the layout only has one property, `tree`, which is where the old `BlockContainer` is located. The layout class will eventually contain flat lists of fragments and glyph runs as well, reducing memory footprint even further. The act of calculating layout is now called "reflow", which was borrowed from Firefox.

The `Layout` type can be imported from the API. You can use the `root` method to get the block container if you need to:

```ts
class Layout {
  root(): BlockContainer;
}
```

#### The Optimized BoxArea Refactor
[Boxes have been optimized](https://chearon.net/blog/making-a-layout-engine-lighter/) to only allocate a single BoxArea if no border or padding has been specified. If you're accessing areas at all, the API has changed:

```diff
-const bwidth = box.borderArea.width;
-const pwidth = box.paddingArea.width;
-const cwidth = box.contentArea.width;
+const bwidth = box.getBorderArea().width;
+const pwidth = box.getPaddingArea().width;
+const cwidth = box.getContentArea().width;
```

0.6.1
==================

Bugfix release plus a small feature for the site

### Fixed
* Fixed `text-align: start` and `text-align: end`
* Right float adjacent to and after another right float wasn't positioned correctly

### Added
* Resizeable panes for the website so you can see text reflowing

0.6.0
==================

Images are supported! `<img>` acts just like it does in the browser: natural ratios are known, they can be floated, positioned, inline, block, etc. JPEG, BMP, PNG, and GIF are supported, and images paint to every backend.

### Changed
* `flow.load` no longer throws errors. Check the `status` or `loaded` promise on the returned `FontFace`s instead.

### Added
* Support for the `<img>` element (JPEG, PNG, GIF, and BMP)
* `flow.createObjectURL` and `flow.revokeObjectURL` APIs

### Fixed
* `zoom` wasn't applied to length values of line-height
* `flow.layout` twice before paint could result in incorrect inline backgrounds

0.5.1
==================
### Fixed
* More accurate text coordinates when containing blocks are positioned in subpixels

0.5.0
==================
### Changed
* Styles must now be passed through `flow.style` before being given to `h`.
* `cascadeStyles` has been removed. Pass an array of styles to `h` instead.
* Removed `getRootStyle`
* paintToCanvas no longer has a density argument. Use the zoom CSS property instead.
* Changed the font registration API to match `document.fonts` in web browsers. Instead of `registerFont`, import `fonts` and `FontFace`. See the README for more details.
* `parse` is now an individual file without the rest of the API. Change `import * as flow from 'dropflow/with-parse.js'` to `import * as flow from 'dropflow'` and `import parse from 'dropflow/parse.js'`
* Replaced `loadNotoFonts` with `registerNotoFonts`. Call `flow.load` on the document after the latter.

### Added
* Added support for the `zoom` property
* Support for multiple styles on an element
* Support for hardware pixel snapping (#16)
* Added `flow.FontFace`, `flow.fonts`, `flow.createFaceFromTables` (see **Changed** above)
* Added `unicodeRange` to `FontFaceDescriptors`
* Added `flow.load` for loading all fonts needed by a document
* Added support for `@napi-rs/canvas` and `skia-canvas` via environments (see examples)
* Exposed environment hooks so that dropflow's behavior can be customized (see updated README).

### Fixed
* RTL text-align issue in the SVG painter and base direction issue in the canvas painter (#27)

0.4.0
==================
### Added
* Support for `overflow`
* Added CHANGELOG.md

0.3.0
==================
### Added
* `t` function to create text nodes (like `h` but for text)

### Fixed
* Emojis that use a ZWJ sequence are now rendered correctly
* Minor memory leak in font selection
* `em` units only evaluate against the parent for `font-size`
* Strange font selection issue that picked bold or italic
* Memory leak in word cache
* Positioned > float > text could paint twice
* Relatively positioned block containers of text could paint twice

0.2.0
==================
### Changed
* Exported `cascadeStyles()` and `HTMLElement`
* Now uses `fetch()` instead of `fs` in Node, in case remote URLs were registered

### Added
* API to scan documents and load Noto fonts from FontSource to cover the document
* Support for `overflow-wrap` (`word-break`)
* Support for outputting SVG

### Fixed
* Never try to register fonts twice
* Infinite loop with two nested floats
* Intrinsicly sized content could sometimes wrap even though it was sized not to wrap

0.1.2
==================
### Added
* Exposed APIs for querying the DOM and types for painting into areas on top of it
* Allow strings to be passed to `dom()`

0.1.1
==================

First release! CSS 2 inline layout is complete: floats, inline-blocks, bidi, alignment, etc. Paint to canvas and HTML.

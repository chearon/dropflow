# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](http://keepachangelog.com/) and this
project adheres to [Semantic Versioning](http://semver.org/).

(Unreleased)
==================
### Changed
### Added
### Fixed

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

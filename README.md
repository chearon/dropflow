# overflow

Overflow is a CSS layout engine concerned with exploring the reaches of the foundational W3C standards. It has high quality text layout and is capable of displaying many of the beautiful languages of the world. It is just about as fast as it can be, achieving the 16ms mark for documents that don't have a lot of text.

# Usage

None yet. Oops!

# Supported CSS rules

These rules are either working or will be working soon. Shorthand properties are not listed. If you see all components of a shorthand (for example, `border-style`, `border-width`, `border-color`) then that shorthand is assumed to be supported (for example `border`).

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
| <code>vertical-&zwj;align</code> | | 🚧&zwj;&nbsp;Planned | |
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
* [chearon/fontconfigjs](https://github.com/chearon/fontconfigjs) selects font files with the help of [foliojs/fontkit](https://github.com/foliojs/fontkit)
* [foliojs/linebreak](https://github.com/foliojs/linebreak) provides Unicode break indices (inlined into source tree)
* [foliojs/grapheme-breaker](https://github.com/foliojs/grapheme-breaker) provides Unicode grapheme boundaries (inlined into source tree)
* [chearon/itemizer](https://github.com/chearon/itemizer) produces shaping boundaries with the help of [Tehreer/SheenBidi](https://github.com/Tehreer/SheenBidi) and [google/emoji-segmenter](https://github.com/google/emoji-segmenter)
* [harfbuzz/harfbuzzjs](https://github.com/harfbuzz/harfbuzzjs) does font shaping

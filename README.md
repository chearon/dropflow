# overflow

Overflow is CSS layout engine written in TypeScript. It has high quality text layout and is capable of displaying many of the beautiful languages of the world. It tries to be fast, but it's more concerned with exploring the reaches of the CSS standards.

# Usage

None yet. Oops!

# Supported CSS rules

These rules are either working or will be working soon. Shorthand properties are not listed. If you see all components of a shorthand (for example, `border-style`, `border-width`, `border-color`) then that shorthand is assumed to be supported (for example `border`).

## Inline formatting

| Property | Values | Status | Notes |
| -- | -- | -- | -- |
| <code>color</code> | `rgba()`, `rgb()`, `#rrggbb`, `#rgb`, `#rgba` | ✅&zwj;&nbsp;Works | |
| <code>font-&zwj;family</code> |  | ✅&zwj;&nbsp;Works | |
| <code>font-&zwj;size</code> | `em`, `px`, `smaller` etc, `small` etc, `cm` etc | ✅&zwj;&nbsp;Works | |
| <code>font-&zwj;stretch</code> | `condensed` etc | ✅&zwj;&nbsp;Works | |
| <code>font-&zwj;style</code> | `normal`, `italic`, `oblique` | ✅&zwj;&nbsp;Works | |
| <code>font-&zwj;variant</code> | | 🚧&zwj;&nbsp;Planned | |
| <code>font-&zwj;weight</code> | `normal`, `bolder`, `lighter` `light`, `bold`, `100`-`900` | ✅&zwj;&nbsp;Works | |
| <code>line-&zwj;height</code> | `normal`, `px`, `em`, `%`, `number` | ✅&zwj;&nbsp;Works | |
| <code>tab-&zwj;size</code> | | 🚧&zwj;&nbsp;Planned | |
| <code>text-&zwj;decoration</code> | | 🚧&zwj;&nbsp;Planned | |
| <code>unicode-&zwj;bidi</code> | | 🚧&zwj;&nbsp;Planned | |
| <code>vertical-&zwj;align</code> | | 🚧&zwj;&nbsp;Planned | |
| <code>white-&zwj;space</code> | `normal` | ✅&zwj;&nbsp;Works | |
| <code>white-&zwj;space</code> | `pre-wrap`, `pre-line`, `nowrap`, `pre` | 🏗 Partially done | Hard breaks and removing soft breaks not implemented |

## Block formatting

| Property | Values | Status | Notes |
| -- | -- | -- | -- |
| <code>clear</code> | | 🚧&zwj;&nbsp;Planned | |
| <code>direction</code> | `ltr`, `rtl` | ✅&zwj;&nbsp;Works | |
| <code>float</code> | | 🚧&zwj;&nbsp;Planned | |
| <code>text-&zwj;align</code> | `start`, `end`, `left`, `right`, `center` | ✅&zwj;&nbsp;Works |  |
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
| <code>display</code> | `block`, `inline`, `flow-root` | ✅&zwj;&nbsp;Works | |
| <code>display</code> | `none`, `inline-block`, `table` | 🚧&zwj;&nbsp;Planned |  | |
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

<sup>1</sup>Any document that uses `position: fixed` could be reorganized and updated to use `position: absolute` and look identical. For that reason, I don't find fixed positioning very interesting. In web development, it can also get you into difficult traps if an ancestor, which may be a different component, has a `transform` other than `none`. However it is useful on simpler webpages or codebases without strong organization.

# Third party components

* PegJS for parsing CSS rules and selectors
* John Resig's HTML parser for parsing HTML (modified)
* sizzle.js stripped down and repurposed for selector matching
* fontkit for reading fonts
* harfbuzz for shaping
* linebreak for line breaking

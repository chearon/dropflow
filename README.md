# overflow

Overflow is CSS layout engine written in TypeScript. It has high quality text layout and is capable of displaying many of the beautiful languages of the world. It tries to be fast, but it's more concerned with exploring the reaches of the CSS standards.

# Usage

None yet. Oops!

# Supported CSS rules

These rules are either working or will be working soon. Shorthand properties are not listed. If you see all components of a shorthand (for example, `border-style`, `border-width`, `border-color`) then that shorthand is assumed to be supported (for example `border`).

## Inline formatting

| Property | Values | Status | Notes |
| -- | -- | -- | -- |
| <code>color</code> | `rgba()`, `rgb()`, `#rrggbb`, `#rgb`, `#rgba` | ✅ Works | |
| <code>font-&zwj;family</code> |  | ✅ Works | |
| <code>font-&zwj;size</code> | `em`, `px`, `smaller` etc, `small` etc, `cm` etc | ✅ Works | |
| <code>font-&zwj;stretch</code> | `condensed` etc | ✅ Works | |
| <code>font-&zwj;style</code> | `normal`, `italic`, `oblique` | ✅ Works | |
| <code>font-&zwj;variant</code> | | 🚧 Planned | |
| <code>font-&zwj;weight</code> | `normal`, `bolder`, `lighter` `light`, `bold`, `100`-`900` | ✅ Works | |
| <code>line-&zwj;height</code> | `normal`, `px`, `em`, `%`, `number` | ✅ Works | |
| <code>tab-&zwj;size</code> | | 🚧 Planned | |
| <code>vertical-&zwj;align</code> | | 🚧 Planned | |
| <code>white-&zwj;space</code> | `normal` | ✅ Works | |
| <code>white-&zwj;space</code> | `pre-wrap`, `pre-line`, `nowrap`, `pre` | 🏗 Partially done | Hard breaks and removing soft breaks not implemented |

## Block formatting

| Property | Values | Status | Notes |
| -- | -- | -- | -- |
| <code>direction</code> | `ltr`, `rtl` | ✅ Works | |
| <code>text-&zwj;align</code> | `start`, `end`, `left`, `right`, `center` | ✅ Works |  |
| <code>writing-&zwj;mode</code> | `horizontal-tb`, `vertical-lr`, `vertical-rl` | 🏗 Partially done | Implemented for BFCs but not IFCs yet |

## Boxes and positioning

| Property | Values | Status | Notes |
| -- | -- | -- | -- |
| <code>background-&zwj;clip</code> | `border-box`, `content-box`, `padding-box` | ✅ Works | |
| <code>background-&zwj;color</code> | `rgba()`, `rgb()`, `#rrggbb`, `#rgb`, `#rgba` | ✅ Works | |
| <code>border-&zwj;color</code> | `rgba()`, `rgb()`, `#rrggbb`, `#rgb`, `#rgba` | ✅ Works | |
| <code>border-&zwj;style</code> | | 🚧 Planned | |
| <code>border-&zwj;width</code> | `em`, `px`, `cm` etc | ✅ Works | |
| <code>box-&zwj;sizing</code> | `border-box`, `content-box` | ✅ Works | |
| <code>display</code> | `block`, `inline`, `flow-root` | ✅ Works | |
| <code>display</code> | `none` | 🚧 Planned |  | |
| <code>height</code> | `em`, `px`, `%`, `cm` etc, `auto` | ✅ Works | |
| <code>margin</code> | `em`, `px`, `%`, `cm` etc, `auto` | ✅ Works | |
| <code>padding</code> | `em`, `px`, `%`, `cm` etc | ✅ Works | |
| <code>position</code> | | 🚧 Planned | |
| <code>width</code> | `em`, `px`, `%`, `cm` etc, `auto` | ✅ Works | |

# Third party components

* PegJS for parsing CSS rules and selectors
* John Resig's HTML parser for parsing HTML (modified)
* sizzle.js stripped down and repurposed for selector matching
* fontkit for reading fonts
* harfbuzz for shaping
* linebreak for line breaking

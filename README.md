# overflow

Overflow is CSS layout engine written in TypeScript. It has high quality text layout and is capable of displaying many of the beautiful languages of the world. It tries to be fast, but it's more concerned with exploring the reaches of the CSS standards.

# Usage

None yet. Oops!

# Supported CSS rules

These rules are either working or will be working soon. Shorthand properties are not listed. If you see all components of a shorthand (for example, `border-style`, `border-width`, `border-color`) then that shorthand is assumed to be supported (for example `border`).

## Inline formatting

| Property | Values | Status |
| -- | -- | -- |
| `color` | `rgba()`, `rgb()`, `#rrggbb`, `#rgb`, `#rgba` | ✅ Works |
| `font-family` |  | ✅ Works |
| `font-size` | `em`, `px`, `smaller` etc, `small` etc, `cm` etc | ✅ Works |
| `font-stretch` | `condensed` etc | ✅ Works |
| `font-style` | `normal`, `italic`, `oblique` | ✅ Works |
| `font-variant` | | 🚧 Planned |
| `font-weight` | `normal`, `bolder`, `lighter` `light`, `bold`, `100`-`900` | ✅ Works |
| `tab-size` | | 🚧 Planned |
| `vertical-align` | | 🚧 Planned |
| `white-space` | `normal`, `pre-wrap`, `pre-line` | ✅ Works |
| `white-space` | `nowrap`, `pre` | ✅ Works |

## Block formatting

| Property | Values | Status | Notes |
| -- | -- | -- | -- |
| `direction` | `ltr`, `rtl` | ✅ Works | |
| `text-align` | `start`, `end`, `left`, `right`, `center` | ✅ Works |  |
| `writing-mode` | `horizontal-tb`, `vertical-lr`, `vertical-rl` | 🏗 Partially done | Implemented for BFCs but not IFCs yet |

## Boxes and positioning

| Property | Values | Status | Notes |
| -- | -- | -- | -- |
| `background-clip` | `border-box`, `content-box`, `padding-box` | ✅ Works | |
| `background-color` | `rgba()`, `rgb()`, `#rrggbb`, `#rgb`, `#rgba` | ✅ Works | |
| `border-color` | `rgba()`, `rgb()`, `#rrggbb`, `#rgb`, `#rgba` | ✅ Works | |
| `border-style` | | 🚧 Planned | |
| `border-width` | `em`, `px`, `cm` etc | ✅ Works | |
| `box-sizing` | `border-box`, `content-box` | ✅ Works | |
| `display` | `block`, `inline`, `flow-root` | ✅ Works | |
| `display` | `none` | 🚧 Planned |  | |
| `height` | `em`, `px`, `%`, `cm` etc, `auto` | ✅ Works | |
| `margin` | `em`, `px`, `%`, `cm` etc, `auto` | ✅ Works | |
| `padding` | `em`, `px`, `%`, `cm` etc | ✅ Works | |
| `position` | | 🚧 Planned | |
| `width` | `em`, `px`, `%`, `cm` etc, `auto` | ✅ Works | |

# Third party components

* PegJS for parsing CSS rules and selectors
* John Resig's HTML parser for parsing HTML (modified)
* sizzle.js stripped down and repurposed for selector matching
* fontkit for reading fonts
* harfbuzz for shaping
* linebreak for line breaking

# overflow

Overflow is CSS layout engine written in TypeScript. It has a high quality text layout engine capable of displaying many of the beautiful languages of the world. It tries to be fast, but it's more concerned with exploring the reaches of the CSS specifications (particularly the earlier ones).

# Usage

None yet. Oops!

# Supported CSS rules

These rules are either working or will be working soon. Shorthand properties are not listed. If you see all components of a shorthand (for example, `border-style`, `border-width`, `border-color`) then that shorthand is assumed to be supported (for example `border`).

## Inline formatting

| Property | Values | Status |
| -- | -- | -- |
| `font-size` | `em`, `px`, `smaller` etc, `small` etc, `cm` etc | ✅ Works |
| `font-style` | `normal`, `italic`, `oblique` | ✅ Works |
| `font-weight` | `normal`, `bolder`, `lighter` `light`, `bold`, `100`-`900` | ✅ Works |
| `font-variant` | | 🚧 Planned |
| `font-stretch` | `condensed` etc | ✅ Works |
| `font-family` |  | ✅ Works |
| `color` | `rgba()`, `rgb()`, `#rrggbb`, `#rgb`, `#rgba` | ✅ Works |
| `white-space` | `normal`, `pre-wrap`, `pre-line` | ✅ Works |
| `white-space` | `nowrap`, `pre` | ✅ Works |
| `tab-size` | | 🚧 Planned |

## Block formatting

| Property | Values | Status |
| -- | -- | -- |
| `direction` | `ltr`, `rtl` | ✅ Works |
| `writing-mode` | `horizontal-tb`, `vertical-lr`, `vertical-rl` | ✅ Works |

## Boxes and positioning

| Property | Values | Status | Notes |
| -- | -- | -- | -- |
| `display` | `block`, `inline`, `flow-root` | ✅ Works | |
| `display` | `none` | 🚧 Planned |  | |
| `position` | | 🚧 Planned | |
| `margin` | `em`, `px`, `%`, `cm` etc, `auto` | ✅ Works | |
| `padding` | `em`, `px`, `%`, `cm` etc | ✅ Works | |
| `border-width` | `em`, `px`, `cm` etc | ✅ Works | |
| `border-style` | | 🚧 Planned | |
| `border-color` | `rgba()`, `rgb()`, `#rrggbb`, `#rgb`, `#rgba` | 🏗 Partially done | Implemented for blocks but not inlines yet |
| `background-color` | `rgba()`, `rgb()`, `#rrggbb`, `#rgb`, `#rgba` | 🏗 Partially done | Implemented for blocks but not inlines yet |
| `background-clip` | `border-box`, `content-box`, `padding-box` | ✅ Works | |
| `width` | `em`, `px`, `%`, `cm` etc, `auto` | ✅ Works | |
| `height` | `em`, `px`, `%`, `cm` etc, `auto` | ✅ Works | |
| `box-sizing` | `border-box`, `content-box` | ✅ Works | |

# Third party components

* PegJS for parsing CSS rules and selectors
* John Resig's HTML parser for parsing HTML (modified)
* sizzle.js stripped down and repurposed for selector matching
* fontkit for reading fonts
* harfbuzz for shaping
* linebreak for line breaking

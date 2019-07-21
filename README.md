# Supported tags

The following have default rules, other tags will work too but may not be styled
the same as in the browser

  * `div`
  * `span`

# Supported CSS rules

The following rules are supported in layout and painting. Shorthand properties
are supported too, except currently `background` (only `background-color`).

34 properties are supported as well as 6 shorthands

* `color`
* `white-space`
* `font-size` px, em
* `font-color` (#rrggbb)
* `font-weight`
* `font-variant`
* `font-style`
* `font-family`
* `line-height` px, em, number
* `background-color` (hex, rgb[a])
* `display` flow-root, block, inline, inline-block
* `border-*-width` px, em
* `border-*-style` solid
* `border-*-color` (hex, rgb[a])
* `padding-*` px, em
* `margin-*` px, em, %
* `width` px, em, %, auto
* `height` px, em, %, auto
* `tab-size`
* `position`

# CSS style calculations

1. Determine the cascaded value from style and default style
2. "initial" and "inherit" are resolved into specified values
3. "em", line-height number, etc. are resolved into computed values
4. During layout, used values are determined

# Third party components

* PegJS for parsing CSS rules and selectors
* John Resig's HTML parser for parsing HTML (modified)
* sizzle.js stripped down and repurposed for selector matching
* fontkit for text shaping
* linebreak for line breaking
* canvas for painting in node, browser canvas for painting in the browser

# Generating the boxes

Before any rendering is done the rendering **boxes** need to be created in
memory. Each element will have a rendering box, called the "container box" by
the spec.

If it's a block container box (for this example, that means a box generated for
a **div**) then that box will either have a list of inline-level boxes or a list
of block-level boxes. Depending on which list it has, it will be rendered in
different ways.

If it's an inline container box (if it's a box generated for a **span** in this
example), it can only have text and other inline-level boxes inside - if there
are block-level boxes within, the inline container box must be split and wrapped
(explained more later).

# Wrap the boxes as necessary

Sections 9.2.1.1 and 9.2.2.1 describe what to do for text that is directly in a block or inline box.

For block boxes, text is wrapped in a new block box when inline boxes are wrapped
in block boxes (more on that below). Otherwise, consecutive text is simply stored
in the block box.

For inline boxes, text is simply stored on the box.

## Split out block boxes from within inline boxes

> When an inline box contains an in-flow block-level box, the inline box (and
> its inline ancestors within the same line box) are broken around the block-level
> box (and any block-level siblings that are consecutive or separated only by
> collapsible whitespace and/or out-of-flow elements), splitting the inline box
> into two boxes (even if either side is empty), one on each side of the
> block-level box(es). The line boxes before the break and after the break are
> enclosed in anonymous block boxes, and the block-level box becomes a sibling of
> those anonymous boxes.

*&mdash; Section 9.2.1.1*

## Generate boxes beneath a block box

We need to make sure that all boxes created by the block box are inline, **or**
all boxes are block boxes. In other words, the list of boxes contained in a
block box can only be of one type - inline boxes or block boxes.

> A block container box either contains only block-level boxes or establishes
> an inline formatting context and thus contains only inline-level boxes.

*&mdash; Section 9.2.1*

That makes it easy to render because now there are only two modes - an inline
formatting context and a block formatting context - for each block box. More
on that later.

> if a block container box &hellip; has a block-level box inside it (such as
> the P above), then we force it to have only block-level boxes inside it.

*&mdash; Section 9.2.1.1*

When there's a block box found inside a block container box, just wrap every
consecutive inline box in a new block box.

# Laying it all out

# TODO

- [ ] Move exceptions in CssActualStyle to some checker that runs in dbg mode

# Order I should do things

- [x] containing block assignment
- [x] box model, horizontal
- [x] width
- [x] box-sizing (horizontal)
- [x] height: px/%
- [x] margin collapsing (BFC)
- [x] make height: 0 work
- [x] background-clip
- [x] use jresig's html parser
- [x] paint borders, background
- [x] border-top/right/bottom/left
- [x] initial commit!!
- [ ] support some css colors like transparent
- [ ] border-radius
- [ ] linebox creation and height: auto
- [ ] vertical align != baseline
- [ ] paint text
- [ ] position: relative (top, right, bottom, left)
- [ ] z-index (relative)
- [ ] inline-blocks
- [ ] floats
- [ ] position: absolute (top, right, bottom, left)
- [ ] overflow
- [ ] shorthand css props need to set initial. support initial?

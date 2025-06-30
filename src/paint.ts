import {
  BlockContainer,
  ReplacedBox,
  Inline,
  IfcInline,
} from "./layout-flow.ts";
import { Image } from "./layout-image.ts";
import { G_CL, G_AX, G_SZ } from "./text-harfbuzz.ts";
import { ShapedItem, Paragraph } from "./layout-text.ts";
import { Box, FormattingBox } from "./layout-box.ts";
import { binarySearchOf } from "./util.ts";

import type { InlineLevel, BlockLevel } from "./layout-flow.ts";
import type { BackgroundBox } from "./layout-text.ts";
import type { Color } from "./style.ts";
import type { LoadedFontFace } from "./text-font.ts";

// Border rendering constants
const BORDER_DASHED_ARRAY = [4, 4];
const BORDER_DOTTED_ARRAY = [0, 2];

interface BorderInfo {
  width: number;
  style: string;
  color: Color;
}

interface BoxBorderSegment {
  firstSide: "left" | "top" | "right" | "bottom";
  left: boolean;
  top: boolean;
  right: boolean;
  bottom: boolean;
}

export interface PaintBackend {
  fillColor: Color;
  strokeColor: Color;
  lineWidth: number;
  direction: "ltr" | "rtl";
  font: LoadedFontFace | undefined;
  fontSize: number;
  strokeDasharray?: string;
  strokeLinecap?: "butt" | "round" | "square";
  strokeLinejoin?: "miter" | "round" | "bevel";
  edge(
    x: number,
    y: number,
    length: number,
    side: "top" | "right" | "bottom" | "left"
  ): void;
  text(
    x: number,
    y: number,
    item: ShapedItem,
    textStart: number,
    textEnd: number,
    isColorBoundary?: boolean
  ): void;
  rect(x: number, y: number, w: number, h: number): void;
  path(pathData: string): void;
  pushClip(x: number, y: number, w: number, h: number): void;
  popClip(): void;
  image(
    x: number,
    y: number,
    width: number,
    height: number,
    image: Image
  ): void;
}

function getTextOffsetsForUncollapsedGlyphs(item: ShapedItem) {
  const glyphs = item.glyphs;
  let glyphStart = 0;
  let glyphEnd = glyphs.length - G_SZ;

  while (glyphStart < glyphs.length && glyphs[glyphStart + G_AX] === 0)
    glyphStart += G_SZ;
  while (glyphEnd >= 0 && glyphs[glyphEnd + G_AX] === 0) glyphEnd -= G_SZ;

  if (glyphStart in glyphs && glyphEnd in glyphs) {
    let textStart, textEnd;

    if (item.attrs.level & 1) {
      textStart = glyphs[glyphEnd + G_CL];
      if (glyphStart - G_SZ >= 0) {
        textEnd = glyphs[glyphStart - G_SZ + G_CL];
      } else {
        textEnd = item.end();
      }
    } else {
      textStart = glyphs[glyphStart + G_CL];
      if (glyphEnd + G_SZ < glyphs.length) {
        textEnd = glyphs[glyphEnd + G_SZ + G_CL];
      } else {
        textEnd = item.end();
      }
    }

    return { textStart, textEnd };
  } else {
    return { textStart: 0, textEnd: 0 };
  }
}

function drawText(
  item: ShapedItem,
  colors: [Color, number][],
  b: PaintBackend
) {
  const style = item.attrs.style;
  const { textStart, textEnd } = getTextOffsetsForUncollapsedGlyphs(item);
  // Split the colors into spans so that colored diacritics can work.
  // Sadly this seems to only work in Firefox and only when the font doesn't do
  // any normalizination, so I could probably stop trying to support it
  // https://github.com/w3c/csswg-drafts/issues/699
  const end =
    item.attrs.level & 1
      ? item.colorsStart(colors) - 1
      : item.colorsEnd(colors);
  let i =
    item.attrs.level & 1
      ? item.colorsEnd(colors) - 1
      : item.colorsStart(colors);
  let glyphIndex = 0;
  let tx = item.x;

  while (i !== end) {
    const [color, offset] = colors[i];
    const colorStart = offset;
    const colorEnd = i + 1 < colors.length ? colors[i + 1][1] : textEnd;
    const start = Math.max(colorStart, textStart);
    const end = Math.min(colorEnd, textEnd);

    if (start < end) {
      // TODO: should really have isStartColorBoundary, isEndColorBoundary
      const isColorBoundary =
        (start !== textStart && start === colorStart) ||
        (end !== textEnd && end === colorEnd);
      let ax = 0;

      if (item.attrs.level & 1) {
        while (
          glyphIndex < item.glyphs.length &&
          item.glyphs[glyphIndex + G_CL] >= start
        ) {
          ax += item.glyphs[glyphIndex + G_AX];
          glyphIndex += G_SZ;
        }
      } else {
        while (
          glyphIndex < item.glyphs.length &&
          item.glyphs[glyphIndex + G_CL] < end
        ) {
          ax += item.glyphs[glyphIndex + G_AX];
          glyphIndex += G_SZ;
        }
      }

      b.fillColor = color;
      b.fontSize = style.fontSize;
      b.font = item.face;
      b.direction = item.attrs.level & 1 ? "rtl" : "ltr";
      b.text(tx, item.y, item, start, end, isColorBoundary);

      tx += (ax / item.face.hbface.upem) * style.fontSize;
    }

    if (item.attrs.level & 1) {
      i -= 1;
    } else {
      i += 1;
    }
  }
}

/**
 * Paints the background and borders
 */
function paintFormattingBoxBackground(
  box: FormattingBox,
  b: PaintBackend,
  isRoot = false
) {
  const style = box.style;
  const borderArea = box.getBorderArea();

  if (!isRoot) {
    const paddingArea = box.getPaddingArea();
    const contentArea = box.getContentArea();
    const { backgroundColor, backgroundClip } = style;
    const area =
      backgroundClip === "border-box"
        ? borderArea
        : backgroundClip === "padding-box"
        ? paddingArea
        : contentArea;

    if (backgroundColor.a > 0) {
      b.fillColor = backgroundColor;
      b.rect(area.x, area.y, area.width, area.height);
    }
  }

  // Advanced border rendering with path-based system
  const borders = {
    left: {
      width: style.borderLeftWidth,
      style: style.borderLeftStyle,
      color: style.borderLeftColor,
    },
    top: {
      width: style.borderTopWidth,
      style: style.borderTopStyle,
      color: style.borderTopColor,
    },
    right: {
      width: style.borderRightWidth,
      style: style.borderRightStyle,
      color: style.borderRightColor,
    },
    bottom: {
      width: style.borderBottomWidth,
      style: style.borderBottomStyle,
      color: style.borderBottomColor,
    },
  };

  // Get border radius values from the style
  const borderRadii = {
    topLeft: box.style.getBorderTopLeftRadius(box),
    topRight: box.style.getBorderTopRightRadius(box),
    bottomRight: box.style.getBorderBottomRightRadius(box),
    bottomLeft: box.style.getBorderBottomLeftRadius(box),
  };

  const segments = getBorderSegments(borders);

  for (const segment of segments) {
    const border = borders[segment.firstSide];
    if (!isBorderVisible(border)) continue;

    const strokeProps = getStrokePropertiesFromBorder(border);

    // Apply stroke properties to backend
    b.strokeColor = strokeProps.strokeColor;
    b.lineWidth = strokeProps.strokeWidth;
    b.strokeDasharray = strokeProps.strokeDasharray;
    b.strokeLinecap = strokeProps.strokeLinecap;

    if (border.style === "double") {
      // For double borders, we need to draw two separate lines
      // Each line should be 1/3 of the total border width
      // The outer line is at the border edge, the inner line is 2/3 inset

      // Set stroke width to 1/3 of border width for double borders
      const doubleStrokeWidth = border.width > 0 ? border.width / 3 : 0;
      b.lineWidth = doubleStrokeWidth;

      // Draw the outer border (at border edge)
      const outerPath = generateBorderPathForDouble(
        borderArea.x,
        borderArea.y,
        borderArea.width,
        borderArea.height,
        borders,
        borderRadii,
        segment,
        "outer"
      );
      b.path(outerPath);

      // Draw the inner border (inset by 2/3 of border width)
      const innerPath = generateBorderPathForDouble(
        borderArea.x,
        borderArea.y,
        borderArea.width,
        borderArea.height,
        borders,
        borderRadii,
        segment,
        "inner"
      );
      b.path(innerPath);
    } else {
      // For all other border styles, draw a single path
      const path = generateBorderPath(
        borderArea.x,
        borderArea.y,
        borderArea.width,
        borderArea.height,
        borders,
        borderRadii,
        segment,
        1
      );
      b.path(path);
    }

    // Reset stroke properties to defaults
    b.strokeDasharray = undefined;
    b.strokeLinecap = "butt";
  }
}

function paintBackgroundDescendents(
  root: FormattingBox | Inline,
  b: PaintBackend
) {
  const stack: (FormattingBox | Inline | { sentinel: true })[] = [root];
  const parents: Box[] = [];

  while (stack.length) {
    const box = stack.pop()!;

    if ("sentinel" in box) {
      const box = parents.pop()!;

      if (
        box.isFormattingBox() &&
        box.style.overflow === "hidden" &&
        box !== root
      ) {
        b.popClip();
      }
    } else {
      if (!box.isInline() && !box.isInlineLevel() && box !== root) {
        paintFormattingBoxBackground(box, b);
      }

      if (box.isBlockContainer() && box.hasBackgroundInLayerRoot()) {
        stack.push({ sentinel: true });
        parents.push(box);

        if (
          box.isFormattingBox() &&
          box.style.overflow === "hidden" &&
          box !== root
        ) {
          const { x, y, width, height } = box.getPaddingArea();
          b.pushClip(x, y, width, height);
        }

        for (let i = box.children.length - 1; i >= 0; i--) {
          const child = box.children[i];
          if (child.isBox() && !child.isLayerRoot()) stack.push(child);
        }
      }
    }
  }
}

// TODO: since vertical padding is added above, hardware pixel snapping has
// to happen here. But block containers are snapped during layout, so it'd
// be more consistent to do it there. To be more consistent with the specs,
// and hopefully clean up the code, I should start making "continuations"
// (Firefox) of inlines, or create fragments out of them (Chrome)
function snap(ox: number, oy: number, ow: number, oh: number) {
  const x = Math.round(ox);
  const y = Math.round(oy);
  const width = Math.round(ox + ow) - x;
  const height = Math.round(oy + oh) - y;
  return { x, y, width, height };
}

function paintInlineBackground(
  background: BackgroundBox,
  inline: Inline,
  paragraph: Paragraph,
  b: PaintBackend
) {
  const ifc = paragraph.ifc;
  const direction = ifc.style.direction;
  const bgc = inline.style.backgroundColor;
  const clip = inline.style.backgroundClip;
  const {
    borderTopColor,
    borderRightColor,
    borderBottomColor,
    borderLeftColor,
  } = inline.style;
  const { a: ta } = borderTopColor;
  const { a: ra } = borderRightColor;
  const { a: ba } = borderBottomColor;
  const { a: la } = borderLeftColor;
  const {
    start,
    end,
    blockOffset,
    ascender,
    descender,
    naturalStart,
    naturalEnd,
  } = background;
  const paddingTop = inline.style.getPaddingBlockStart(ifc);
  const paddingRight = inline.style.getPaddingLineRight(ifc);
  const paddingBottom = inline.style.getPaddingBlockEnd(ifc);
  const paddingLeft = inline.style.getPaddingLineLeft(ifc);
  const paintLeft =
    (naturalStart && direction === "ltr") ||
    (naturalEnd && direction === "rtl");
  const paintRight =
    (naturalEnd && direction === "ltr") ||
    (naturalStart && direction === "rtl");
  const borderTopWidth = inline.style.getBorderBlockStartWidth(ifc);
  let borderRightWidth = inline.style.getBorderLineRightWidth(ifc);
  const borderBottomWidth = inline.style.getBorderBlockEndWidth(ifc);
  let borderLeftWidth = inline.style.getBorderLineLeftWidth(ifc);

  if (!paintLeft) borderLeftWidth = 0;
  if (!paintRight) borderRightWidth = 0;

  if (start !== end && bgc.a > 0) {
    let extraTop = 0;
    let extraBottom = 0;

    if (clip !== "content-box") {
      extraTop += inline.style.getPaddingBlockStart(ifc);
      extraBottom += inline.style.getPaddingBlockEnd(ifc);
    }

    if (clip === "border-box") {
      extraTop += borderTopWidth;
      extraBottom += borderBottomWidth;
    }

    b.fillColor = bgc;
    const { x, y, width, height } = snap(
      Math.min(start, end),
      blockOffset - ascender - extraTop,
      Math.abs(start - end),
      ascender + descender + extraTop + extraBottom
    );
    b.rect(x, y, width, height);
  }

  if (start !== end && (ta > 0 || ra > 0 || ba > 0 || la > 0)) {
    let extraLeft = 0;
    let extraRight = 0;

    if (paintLeft && clip === "content-box") extraLeft += paddingLeft;
    if (paintLeft && clip !== "border-box") extraLeft += borderLeftWidth;
    if (paintRight && clip === "content-box") extraRight += paddingRight;
    if (paintRight && clip !== "border-box") extraRight += borderRightWidth;

    const work = [
      ["top", borderTopWidth, borderTopColor],
      ["right", borderRightWidth, borderRightColor],
      ["bottom", borderBottomWidth, borderBottomColor],
      ["left", borderLeftWidth, borderLeftColor],
    ] as const;

    // TODO there's a bug here: try
    // <span style="background-color:red; border-left: 2px solid yellow; border-top: 4px solid maroon;">red</span>

    for (const [side, lineWidth, color] of work) {
      if (lineWidth === 0) continue;
      const rect = snap(
        Math.min(start, end) - extraLeft,
        blockOffset - ascender - paddingTop - borderTopWidth,
        Math.abs(start - end) + extraLeft + extraRight,
        borderTopWidth +
          paddingTop +
          ascender +
          descender +
          paddingBottom +
          borderBottomWidth
      );

      const length =
        side === "left" || side === "right" ? rect.height : rect.width;
      let x = side === "right" ? rect.x + rect.width : rect.x;
      let y = side === "bottom" ? rect.y + rect.height : rect.y;
      x +=
        side === "left" ? lineWidth / 2 : side === "right" ? -lineWidth / 2 : 0;
      y +=
        side === "top" ? lineWidth / 2 : side === "bottom" ? -lineWidth / 2 : 0;
      b.lineWidth = lineWidth;
      b.strokeColor = color;
      b.edge(x, y, length, side);
    }
  }
}

function paintReplacedBox(box: ReplacedBox, b: PaintBackend) {
  const image = box.getImage();
  if (image?.status === "loaded") {
    const { x, y, width, height } = box.getContentArea();
    b.image(x, y, width, height, image);
  }
}

function paintInlines(root: BlockLayerRoot, ifc: IfcInline, b: PaintBackend) {
  const colors = ifc.paragraph.getColors();
  const lineboxes = ifc.paragraph.lineboxes;
  const painted = new Set<Inline>();
  let lineboxIndex = -1;
  let lineboxItem = null;

  for (const item of ifc.paragraph.treeItems) {
    let hasPositionedParent = false;

    if (lineboxItem) lineboxItem = lineboxItem.next;
    if (!lineboxItem) {
      // starting a new linebox
      lineboxItem = lineboxes[++lineboxIndex].head;
      painted.clear();
    }

    for (const inline of item.inlines) {
      if (inline.isLayerRoot()) {
        hasPositionedParent = true;
        break;
      } else if (!painted.has(inline)) {
        const backgrounds = ifc.paragraph.backgroundBoxes.get(inline);
        if (backgrounds) {
          for (const background of backgrounds) {
            if (background.linebox === lineboxes[lineboxIndex]) {
              paintInlineBackground(background, inline, ifc.paragraph, b);
            }
          }
        }
        painted.add(inline);
      }
    }

    if (!hasPositionedParent) {
      if (item instanceof ShapedItem) {
        drawText(item, colors, b);
      } else if (item.box) {
        if (item.box.isReplacedBox()) {
          if (!item.box.isLayerRoot()) {
            paintFormattingBoxBackground(item.box, b);
            paintReplacedBox(item.box, b);
          }
        } else {
          const blockLayerRoot = root.inlineBlocks.get(item.box)!;
          paintBlockLayerRoot(blockLayerRoot, b);
        }
      }
    }
  }
}

function paintBlockForeground(root: BlockLayerRoot, b: PaintBackend) {
  const stack: (IfcInline | BlockLevel | { sentinel: true })[] = [root.box];

  while (stack.length) {
    const box = stack.pop()!;

    if ("sentinel" in box) {
      b.popClip();
    } else if (box.isReplacedBox()) {
      // Belongs to this LayerRoot
      if (box === root.box || !box.isLayerRoot()) paintReplacedBox(box, b);
    } else if (box.isInline()) {
      paintInlines(root, box, b);
    } else {
      if (
        // Belongs to this LayerRoot
        (box === root.box || !box.isLayerRoot()) &&
        // Has something we should paint underneath it
        (box.hasForegroundInLayerRoot() || root.isInInlineBlockPath(box))
      ) {
        if (box !== root.box && box.style.overflow === "hidden") {
          const { x, y, width, height } = box.getPaddingArea();
          b.pushClip(x, y, width, height);
          stack.push({ sentinel: true });
        }

        for (let i = box.children.length - 1; i >= 0; i--) {
          stack.push(box.children[i]);
        }
      }
    }
  }
}

function paintInline(
  root: InlineLayerRoot,
  paragraph: Paragraph,
  b: PaintBackend
) {
  const colors = paragraph.getColors();
  const treeItems = paragraph.treeItems;
  const stack = root.box.children.slice().reverse();
  const ranges: [number, number][] = [];
  let itemIndex = binarySearchOf(
    paragraph.treeItems,
    root.box.start,
    (item) => item.offset
  );

  function paintRanges() {
    while (ranges.length) {
      const [start, end] = ranges.shift()!;
      while (treeItems[itemIndex]?.offset < start) itemIndex++;
      while (treeItems[itemIndex]?.end() <= end) {
        const item = treeItems[itemIndex];
        let hasPositionedParent = false;
        for (let i = item.inlines.length - 1; i >= 0; i--) {
          if (item.inlines[i] === root.box) break;
          if (item.inlines[i].isLayerRoot()) {
            hasPositionedParent = true;
            break;
          }
        }
        if (!hasPositionedParent && item instanceof ShapedItem) {
          drawText(item, colors, b);
        }
        itemIndex++;
      }
    }
  }

  while (stack.length) {
    const box = stack.pop()!;

    if (box.isRun()) {
      const range = ranges.at(-1);
      if (range?.[1] === box.start) {
        range[1] = box.end;
      } else {
        ranges.push([box.start, box.end]);
      }
    } else if (box.isBox() && !box.isPositioned()) {
      if (box.isInline()) {
        for (let i = box.children.length - 1; i >= 0; i--) {
          stack.push(box.children[i]);
        }
      } else if (box.isReplacedBox()) {
        paintFormattingBoxBackground(box, b);
        paintReplacedBox(box, b);
      } else {
        const layerRoot = root.inlineBlocks.get(box)!;
        paintRanges();
        paintBlockLayerRoot(layerRoot, b);
      }
    }
  }

  paintRanges();
}

class LayerRoot {
  box: Box;
  parents: Box[];
  negativeRoots: LayerRoot[];
  floats: LayerRoot[];
  positionedRoots: LayerRoot[];
  positiveRoots: LayerRoot[];
  /**
   * Unlike the other child roots, inline-blocks are painted when text is
   * painted - after text that comes before them and before text that comes
   * after. The map allows lookup while walking the inline tree.
   */
  inlineBlocks: Map<BlockContainer, BlockLayerRoot>;

  constructor(box: Box | Inline, parents: Box[]) {
    this.box = box;
    this.parents = parents;
    this.negativeRoots = [];
    this.floats = [];
    this.positionedRoots = [];
    this.positiveRoots = [];
    this.inlineBlocks = new Map();
  }

  get zIndex() {
    const zIndex = this.box.style.zIndex;
    return zIndex === "auto" ? 0 : zIndex;
  }

  finalize(preorderScores: Map<Box, number>) {
    this.negativeRoots.sort((a, b) => a.zIndex - b.zIndex);
    this.floats.sort(
      (a, b) => preorderScores.get(a.box)! - preorderScores.get(b.box)!
    );
    this.positionedRoots.sort(
      (a, b) => preorderScores.get(a.box)! - preorderScores.get(b.box)!
    );
    this.positiveRoots.sort((a, b) => a.zIndex - b.zIndex);
  }

  isEmpty() {
    return (
      !this.box.hasBackground() &&
      !this.box.hasForeground() &&
      !this.box.hasBackgroundInLayerRoot() &&
      !this.box.hasForegroundInLayerRoot() &&
      this.negativeRoots.length === 0 &&
      this.floats.length === 0 &&
      this.positionedRoots.length === 0 &&
      this.positiveRoots.length === 0 &&
      this.inlineBlocks.size === 0
    );
  }

  /**
   * Returns true if the box belongs to this LayerRoot and is a parent of an
   * inline-block LayerRoot (which would be a direct child of this LayerRoot).
   *
   * The paint foreground algorithm normally only descends boxes with the
   * hasForegroundInLayerRoot bit set, for obvious reasons. However, since an
   * inline-block creates its own layer root, it does not contribute foreground.
   * This is used as an additional check next to hasForegroundInLayerRoot when
   * descending.
   */
  isInInlineBlockPath(box: Box) {
    if (this.inlineBlocks.size === 0) return false;
    if (box === this.box) return true;
    for (const root of this.inlineBlocks.values()) {
      if (root.parents.includes(box)) return true;
    }
    return false;
  }

  isBlockLayerRoot(): this is BlockLayerRoot {
    return false;
  }

  isInlineLayerRoot(): this is InlineLayerRoot {
    return false;
  }
}

class BlockLayerRoot extends LayerRoot {
  box: BlockContainer | ReplacedBox;

  constructor(box: BlockContainer | ReplacedBox, parents: Box[]) {
    super(box, parents);
    this.box = box;
  }

  isBlockLayerRoot(): this is BlockLayerRoot {
    return true;
  }
}

class InlineLayerRoot extends LayerRoot {
  box: Inline;
  paragraph: Paragraph;

  constructor(box: Inline, parents: Box[], paragraph: Paragraph) {
    super(box, parents);
    this.box = box;
    this.paragraph = paragraph;
  }

  isInlineLayerRoot(): this is InlineLayerRoot {
    return true;
  }
}

function createLayerRoot(box: BlockContainer) {
  const layerRoot = new BlockLayerRoot(box, []);
  const preorderIndices = new Map<Box, number>();
  const parentRoots: LayerRoot[] = [layerRoot];
  const stack: (InlineLevel | { sentinel: true })[] = box.children
    .slice()
    .reverse();
  const parents: Box[] = [];
  let preorderIndex = 0;

  while (stack.length) {
    const box = stack.pop()!;
    let layerRoot;

    if ("sentinel" in box) {
      const layerRoot = parentRoots.at(-1)!;
      const box = parents.pop()!;

      if (layerRoot.box === box) {
        if (!layerRoot.isEmpty()) {
          let parentRootIndex = parentRoots.length - 2;
          let parentRoot = parentRoots[parentRootIndex];

          if (box.isPositioned()) {
            const zIndex = box.style.zIndex as number;

            while (
              parentRootIndex > 0 &&
              !parentRoots[parentRootIndex].box.isStackingContextRoot()
            ) {
              parentRoot = parentRoots[--parentRootIndex];
            }

            if (zIndex < 0) {
              parentRoot.negativeRoots.push(layerRoot);
            } else if (zIndex > 0) {
              parentRoot.positiveRoots.push(layerRoot);
            } else {
              parentRoot.positionedRoots.push(layerRoot);
            }
          } else if (box.isFormattingBox() && box.isFloat()) {
            parentRoot.floats.push(layerRoot);
          }

          layerRoot.finalize(preorderIndices);
        }

        parentRoots.pop();
      }
    } else if (box.isBox()) {
      let parentRootIndex = parentRoots.length - 1;
      let parentRoot = parentRoots[parentRootIndex];

      preorderIndices.set(box, preorderIndex++);

      if (box.isPositioned()) {
        while (
          parentRootIndex > 0 &&
          !parentRoots[parentRootIndex].box.isStackingContextRoot()
        ) {
          parentRoot = parentRoots[--parentRootIndex];
        }

        const parentIndex = parents.findLastIndex(
          (box) => parentRoot.box === box
        );
        const paintRootParents = parents.slice(parentIndex + 1);
        let nearestParagraph;

        if (box.isInline()) {
          for (let i = parents.length - 1; i >= 0; i--) {
            const parent = parents[i];
            if (parent.isIfcInline()) {
              nearestParagraph = parent.paragraph;
              break;
            }
          }
        }

        if (box.isInline()) {
          layerRoot = new InlineLayerRoot(
            box,
            paintRootParents,
            nearestParagraph!
          );
        } else {
          layerRoot = new BlockLayerRoot(box, paintRootParents);
        }
      } else if (!box.isInline()) {
        if (box.isFloat() || (box.isBlockContainer() && box.isInlineLevel())) {
          const parentIndex = parents.findLastIndex(
            (box) => parentRoot.box === box
          );
          const paintRootParents = parents.slice(parentIndex + 1);
          layerRoot = new BlockLayerRoot(box, paintRootParents);
          if (box.isBlockContainer() && box.isInlineLevel()) {
            parentRoot.inlineBlocks.set(box, layerRoot);
          }
        }
      }

      if (
        box.hasBackgroundInDescendent() ||
        box.hasForegroundInDescendent() ||
        box.hasBackground() ||
        box.hasForeground()
      ) {
        stack.push({ sentinel: true });
        parents.push(box);
        if (layerRoot) parentRoots.push(layerRoot);
        if (box.isBlockContainer() || box.isInline()) {
          for (let i = box.children.length - 1; i >= 0; i--) {
            stack.push(box.children[i]);
          }
        }
      }
    }
  }

  layerRoot.finalize(preorderIndices);

  return layerRoot;
}

function paintInlineLayerRoot(root: InlineLayerRoot, b: PaintBackend) {
  for (const r of root.negativeRoots) paintLayerRoot(r, b);

  if (root.box.hasBackgroundInLayerRoot()) {
    paintBackgroundDescendents(root.box, b);
  }

  for (const r of root.floats) paintLayerRoot(r, b);

  const backgrounds = root.paragraph.backgroundBoxes.get(root.box);
  if (backgrounds) {
    for (const background of backgrounds) {
      paintInlineBackground(background, root.box, root.paragraph, b);
    }
  }

  if (root.box.hasForeground() || root.box.hasForegroundInLayerRoot()) {
    paintInline(root, root.paragraph, b);
  }

  for (const r of root.positionedRoots) paintLayerRoot(r, b);

  for (const r of root.positiveRoots) paintLayerRoot(r, b);
}

function paintBlockLayerRoot(
  root: BlockLayerRoot,
  b: PaintBackend,
  isRoot = false
) {
  if (root.box.hasBackground() && !isRoot)
    paintFormattingBoxBackground(root.box, b);

  if (!isRoot && root.box.style.overflow === "hidden") {
    const { x, y, width, height } = root.box.getPaddingArea();
    b.pushClip(x, y, width, height);
  }

  for (const r of root.negativeRoots) paintLayerRoot(r, b);

  if (root.box.hasBackgroundInLayerRoot()) {
    paintBackgroundDescendents(root.box, b);
  }

  for (const r of root.floats) paintLayerRoot(r, b);

  if (
    root.box.hasForeground() ||
    root.box.hasForegroundInLayerRoot() ||
    root.inlineBlocks.size
  ) {
    paintBlockForeground(root, b);
  }

  for (const r of root.positionedRoots) paintLayerRoot(r, b);

  for (const r of root.positiveRoots) paintLayerRoot(r, b);

  if (!isRoot && root.box.style.overflow === "hidden") b.popClip();
}

function paintLayerRoot(paintRoot: LayerRoot, b: PaintBackend) {
  for (const parent of paintRoot.parents) {
    if (parent.isBlockContainer() && parent.style.overflow === "hidden") {
      const { x, y, width, height } = parent.getPaddingArea();
      b.pushClip(x, y, width, height);
    }
  }

  if (paintRoot.isBlockLayerRoot()) {
    paintBlockLayerRoot(paintRoot, b);
  } else if (paintRoot.isInlineLayerRoot()) {
    paintInlineLayerRoot(paintRoot, b);
  }

  for (const parent of paintRoot.parents) {
    if (parent.isBlockContainer() && parent.style.overflow === "hidden") {
      b.popClip();
    }
  }
}

/**
 * Paint the root element
 * https://www.w3.org/TR/CSS22/zindex.html
 */
export default function paint(block: BlockContainer, b: PaintBackend) {
  const layerRoot = createLayerRoot(block);

  if (!layerRoot.isEmpty()) {
    // Propagate background color and overflow to the viewport
    if (block.style.backgroundColor.a > 0) {
      const area = block.containingBlock;
      b.fillColor = block.style.backgroundColor;
      b.rect(area.x, area.y, area.width, area.height);
    }

    if (block.style.overflow === "hidden") {
      const { x, y, width, height } = block.containingBlock;
      b.pushClip(x, y, width, height);
    }

    paintBlockLayerRoot(layerRoot, b, true);

    if (block.style.overflow === "hidden") b.popClip();
  }
}

// Get stroke properties for a border style
function getStrokePropertiesFromBorder(border: BorderInfo): {
  strokeWidth: number;
  strokeColor: Color;
  strokeDasharray?: string;
  strokeLinecap?: "butt" | "round" | "square";
} {
  const base = {
    strokeWidth: border.width,
    strokeColor: border.color,
  };

  switch (border.style) {
    case "dashed":
      return {
        ...base,
        strokeDasharray: BORDER_DASHED_ARRAY.map((x) => x * border.width).join(
          " "
        ),
        strokeLinecap: "butt",
      };
    case "dotted":
      return {
        ...base,
        strokeDasharray: BORDER_DOTTED_ARRAY.map((x) => x * border.width).join(
          " "
        ),
        strokeLinecap: "round",
      };
    case "solid":
    case "double":
    default:
      return {
        ...base,
        strokeLinecap: "butt",
      };
  }
}

// Check if a border is visible (has width, style, and color alpha > 0)
function isBorderVisible(border: BorderInfo): boolean {
  return (
    border.width > 0 &&
    border.style !== "none" &&
    border.style !== "hidden" &&
    border.color.a > 0
  );
}

// Check if two borders match (same width, style, and color)
function bordersMatch(border1: BorderInfo, border2: BorderInfo): boolean {
  return (
    border1.width === border2.width &&
    border1.style === border2.style &&
    border1.color.r === border2.color.r &&
    border1.color.g === border2.color.g &&
    border1.color.b === border2.color.b &&
    border1.color.a === border2.color.a
  );
}

// Detect contiguous border segments for optimization
function getBorderSegments(borders: {
  left: BorderInfo;
  top: BorderInfo;
  right: BorderInfo;
  bottom: BorderInfo;
}): BoxBorderSegment[] {
  const { left, top, right, bottom } = borders;

  // Check for full uniform border
  if (
    isBorderVisible(left) &&
    isBorderVisible(top) &&
    isBorderVisible(right) &&
    isBorderVisible(bottom) &&
    bordersMatch(left, top) &&
    bordersMatch(top, right) &&
    bordersMatch(right, bottom)
  ) {
    return [
      {
        firstSide: "left",
        left: true,
        top: true,
        right: true,
        bottom: true,
      },
    ];
  }

  // Check for three-side matches
  const segments: BoxBorderSegment[] = [];

  // Left-Top-Right
  if (
    isBorderVisible(left) &&
    isBorderVisible(top) &&
    isBorderVisible(right) &&
    bordersMatch(left, top) &&
    bordersMatch(top, right)
  ) {
    segments.push({
      firstSide: "left",
      left: true,
      top: true,
      right: true,
      bottom: false,
    });
    if (isBorderVisible(bottom)) {
      segments.push({
        firstSide: "bottom",
        left: false,
        top: false,
        right: false,
        bottom: true,
      });
    }
    return segments;
  }

  // Top-Right-Bottom
  if (
    isBorderVisible(top) &&
    isBorderVisible(right) &&
    isBorderVisible(bottom) &&
    bordersMatch(top, right) &&
    bordersMatch(right, bottom)
  ) {
    segments.push({
      firstSide: "top",
      left: false,
      top: true,
      right: true,
      bottom: true,
    });
    if (isBorderVisible(left)) {
      segments.push({
        firstSide: "left",
        left: true,
        top: false,
        right: false,
        bottom: false,
      });
    }
    return segments;
  }

  // Right-Bottom-Left
  if (
    isBorderVisible(right) &&
    isBorderVisible(bottom) &&
    isBorderVisible(left) &&
    bordersMatch(right, bottom) &&
    bordersMatch(bottom, left)
  ) {
    segments.push({
      firstSide: "right",
      left: true,
      top: false,
      right: true,
      bottom: true,
    });
    if (isBorderVisible(top)) {
      segments.push({
        firstSide: "top",
        left: false,
        top: true,
        right: false,
        bottom: false,
      });
    }
    return segments;
  }

  // Bottom-Left-Top
  if (
    isBorderVisible(bottom) &&
    isBorderVisible(left) &&
    isBorderVisible(top) &&
    bordersMatch(bottom, left) &&
    bordersMatch(left, top)
  ) {
    segments.push({
      firstSide: "bottom",
      left: true,
      top: true,
      right: false,
      bottom: true,
    });
    if (isBorderVisible(right)) {
      segments.push({
        firstSide: "right",
        left: false,
        top: false,
        right: true,
        bottom: false,
      });
    }
    return segments;
  }

  // Check for two-side matches
  // Left-Top
  if (
    isBorderVisible(left) &&
    isBorderVisible(top) &&
    bordersMatch(left, top)
  ) {
    segments.push({
      firstSide: "left",
      left: true,
      top: true,
      right: false,
      bottom: false,
    });
  } else {
    if (isBorderVisible(left)) {
      segments.push({
        firstSide: "left",
        left: true,
        top: false,
        right: false,
        bottom: false,
      });
    }
    if (isBorderVisible(top)) {
      segments.push({
        firstSide: "top",
        left: false,
        top: true,
        right: false,
        bottom: false,
      });
    }
  }

  // Right-Bottom
  if (
    isBorderVisible(right) &&
    isBorderVisible(bottom) &&
    bordersMatch(right, bottom)
  ) {
    segments.push({
      firstSide: "right",
      left: false,
      top: false,
      right: true,
      bottom: true,
    });
  } else {
    if (isBorderVisible(right)) {
      segments.push({
        firstSide: "right",
        left: false,
        top: false,
        right: true,
        bottom: false,
      });
    }
    if (isBorderVisible(bottom)) {
      segments.push({
        firstSide: "bottom",
        left: false,
        top: false,
        right: false,
        bottom: true,
      });
    }
  }

  return segments;
}

// Generate SVG path for a border segment with radius support
function generateSegmentPath(
  x: number,
  y: number,
  width: number,
  height: number,
  radii: {
    tlHor: number;
    tlVer: number;
    trHor: number;
    trVer: number;
    brHor: number;
    brVer: number;
    blHor: number;
    blVer: number;
  },
  segment: BoxBorderSegment
): string {
  let path = "";
  let started = false;

  const addLineOrMoveTo = (targetX: number, targetY: number) => {
    if (!started) {
      path += `M ${targetX} ${targetY}`;
      started = true;
    } else {
      path += ` L ${targetX} ${targetY}`;
    }
  };

  const addArcTo = (
    rx: number,
    ry: number,
    targetX: number,
    targetY: number
  ) => {
    if (rx > 0 && ry > 0) {
      path += ` A ${rx} ${ry} 0 0 1 ${targetX} ${targetY}`;
    } else {
      addLineOrMoveTo(targetX, targetY);
    }
  };

  // Handle each side of the segment
  if (segment.left) {
    // Left side: bottom-left corner to top-left corner
    if (segment.bottom) {
      // Start from bottom-left corner (after radius)
      addLineOrMoveTo(x, y + height - radii.blVer);
    } else {
      // Start from bottom of left side
      addLineOrMoveTo(x, y + height);
    }

    // Draw to top-left corner (before radius)
    if (radii.tlHor > 0 || radii.tlVer > 0) {
      addLineOrMoveTo(x, y + radii.tlVer);
      if (segment.top) {
        // Draw top-left arc
        addArcTo(radii.tlHor, radii.tlVer, x + radii.tlHor, y);
      }
    } else {
      addLineOrMoveTo(x, y);
      if (segment.top) {
        addLineOrMoveTo(x + radii.tlHor, y);
      }
    }
  }

  if (segment.top) {
    // Top side: top-left corner to top-right corner
    if (!segment.left) {
      // Start from left end of top side
      addLineOrMoveTo(x, y);
    }

    // Draw to top-right corner (before radius)
    if (radii.trHor > 0 || radii.trVer > 0) {
      addLineOrMoveTo(x + width - radii.trHor, y);
      if (segment.right) {
        // Draw top-right arc
        addArcTo(radii.trHor, radii.trVer, x + width, y + radii.trVer);
      }
    } else {
      addLineOrMoveTo(x + width, y);
      if (segment.right) {
        addLineOrMoveTo(x + width, y + radii.trVer);
      }
    }
  }

  if (segment.right) {
    // Right side: top-right corner to bottom-right corner
    if (!segment.top) {
      // Start from top of right side
      addLineOrMoveTo(x + width, y);
    }

    // Draw to bottom-right corner (before radius)
    if (radii.brHor > 0 || radii.brVer > 0) {
      addLineOrMoveTo(x + width, y + height - radii.brVer);
      if (segment.bottom) {
        // Draw bottom-right arc
        addArcTo(radii.brHor, radii.brVer, x + width - radii.brHor, y + height);
      }
    } else {
      addLineOrMoveTo(x + width, y + height);
      if (segment.bottom) {
        addLineOrMoveTo(x + width - radii.brHor, y + height);
      }
    }
  }

  if (segment.bottom) {
    // Bottom side: bottom-right corner to bottom-left corner
    if (!segment.right) {
      // Start from right end of bottom side
      addLineOrMoveTo(x + width, y + height);
    }

    // Draw to bottom-left corner (before radius)
    if (radii.blHor > 0 || radii.blVer > 0) {
      addLineOrMoveTo(x + radii.blHor, y + height);
      if (segment.left) {
        // Draw bottom-left arc
        addArcTo(radii.blHor, radii.blVer, x, y + height - radii.blVer);
      }
    } else {
      addLineOrMoveTo(x, y + height);
      if (segment.left) {
        addLineOrMoveTo(x, y + height - radii.blVer);
      }
    }
  }

  // Close path only if the segment includes all four sides
  if (segment.left && segment.top && segment.right && segment.bottom) {
    path += " Z";
  }

  return path;
}

// Generate border path with radius support
function generateBorderPath(
  x: number,
  y: number,
  width: number,
  height: number,
  borders: {
    left: BorderInfo;
    top: BorderInfo;
    right: BorderInfo;
    bottom: BorderInfo;
  },
  borderRadii: {
    topLeft: { horizontal: number; vertical: number };
    topRight: { horizontal: number; vertical: number };
    bottomRight: { horizontal: number; vertical: number };
    bottomLeft: { horizontal: number; vertical: number };
  },
  segment: BoxBorderSegment,
  insetFactor: number = 1
): string {
  // Calculate geometry based on inset factor
  const calculateGeometry = (factor: number) => {
    const leftInset = (borders.left.width * factor) / 2;
    const topInset = (borders.top.width * factor) / 2;
    const rightInset = (borders.right.width * factor) / 2;
    const bottomInset = (borders.bottom.width * factor) / 2;

    const adjustedX = x + leftInset;
    const adjustedY = y + topInset;
    const adjustedWidth = width - leftInset - rightInset;
    const adjustedHeight = height - topInset - bottomInset;

    // Scale border radii proportionally with proper overlap handling
    // Only apply corner radii when both adjacent borders are present in the segment
    let tlHor =
      segment.left && segment.top
        ? Math.max(0, borderRadii.topLeft.horizontal - leftInset)
        : 0;
    let tlVer =
      segment.left && segment.top
        ? Math.max(0, borderRadii.topLeft.vertical - topInset)
        : 0;
    let trHor =
      segment.top && segment.right
        ? Math.max(0, borderRadii.topRight.horizontal - rightInset)
        : 0;
    let trVer =
      segment.top && segment.right
        ? Math.max(0, borderRadii.topRight.vertical - topInset)
        : 0;
    let brHor =
      segment.right && segment.bottom
        ? Math.max(0, borderRadii.bottomRight.horizontal - rightInset)
        : 0;
    let brVer =
      segment.right && segment.bottom
        ? Math.max(0, borderRadii.bottomRight.vertical - bottomInset)
        : 0;
    let blHor =
      segment.bottom && segment.left
        ? Math.max(0, borderRadii.bottomLeft.horizontal - leftInset)
        : 0;
    let blVer =
      segment.bottom && segment.left
        ? Math.max(0, borderRadii.bottomLeft.vertical - bottomInset)
        : 0;

    // Adjust radii ratios if they overlap (like in reference implementation)
    const topRatio = adjustedWidth / (tlHor + trHor || 1);
    const rightRatio = adjustedHeight / (trVer + brVer || 1);
    const bottomRatio = adjustedWidth / (blHor + brHor || 1);
    const leftRatio = adjustedHeight / (blVer + tlVer || 1);
    const smallestRatio = Math.min(
      topRatio,
      rightRatio,
      bottomRatio,
      leftRatio
    );

    if (smallestRatio < 1) {
      tlHor *= smallestRatio;
      tlVer *= smallestRatio;
      trHor *= smallestRatio;
      trVer *= smallestRatio;
      brHor *= smallestRatio;
      brVer *= smallestRatio;
      blHor *= smallestRatio;
      blVer *= smallestRatio;
    }

    return {
      x: adjustedX,
      y: adjustedY,
      width: adjustedWidth,
      height: adjustedHeight,
      radii: {
        tlHor,
        tlVer,
        trHor,
        trVer,
        brHor,
        brVer,
        blHor,
        blVer,
      },
    };
  };

  const geometry = calculateGeometry(insetFactor);
  return generateSegmentPath(
    geometry.x,
    geometry.y,
    geometry.width,
    geometry.height,
    geometry.radii,
    segment
  );
}

// Generate path for double borders with proper positioning
function generateBorderPathForDouble(
  x: number,
  y: number,
  width: number,
  height: number,
  borders: {
    left: BorderInfo;
    top: BorderInfo;
    right: BorderInfo;
    bottom: BorderInfo;
  },
  borderRadii: {
    topLeft: { horizontal: number; vertical: number };
    topRight: { horizontal: number; vertical: number };
    bottomRight: { horizontal: number; vertical: number };
    bottomLeft: { horizontal: number; vertical: number };
  },
  segment: BoxBorderSegment,
  position: "outer" | "inner"
): string {
  // For double borders, each line is 1/3 of the total border width
  // Gap between lines is also 1/3 of the total border width
  // Outer offset: strokeWidth/2 (centers stroke on border edge)
  // Inner offset: strokeWidth/2 + gapWidth + strokeWidth/2 = 1.5 * strokeWidth

  const totalWidth = borders[segment.firstSide].width;
  const strokeWidth = totalWidth > 0 ? totalWidth / 3 : 0;
  const gapWidth = strokeWidth;

  let insetFactor: number;
  if (position === "outer") {
    // Outer border: inset by strokeWidth/2 to center on border edge
    insetFactor = strokeWidth / 2 / totalWidth;
  } else {
    // Inner border: inset by strokeWidth/2 + gapWidth + strokeWidth/2
    insetFactor = (strokeWidth / 2 + gapWidth + strokeWidth / 2) / totalWidth;
  }

  // Calculate per-side insets using the inset factor
  const leftInset = borders.left.width * insetFactor;
  const topInset = borders.top.width * insetFactor;
  const rightInset = borders.right.width * insetFactor;
  const bottomInset = borders.bottom.width * insetFactor;

  const adjustedX = x + leftInset;
  const adjustedY = y + topInset;
  const adjustedWidth = width - leftInset - rightInset;
  const adjustedHeight = height - topInset - bottomInset;

  // Scale border radii proportionally with proper overlap handling
  // Only apply corner radii when both adjacent borders are present in the segment
  let tlHor =
    segment.left && segment.top
      ? Math.max(0, borderRadii.topLeft.horizontal - leftInset)
      : 0;
  let tlVer =
    segment.left && segment.top
      ? Math.max(0, borderRadii.topLeft.vertical - topInset)
      : 0;
  let trHor =
    segment.top && segment.right
      ? Math.max(0, borderRadii.topRight.horizontal - rightInset)
      : 0;
  let trVer =
    segment.top && segment.right
      ? Math.max(0, borderRadii.topRight.vertical - topInset)
      : 0;
  let brHor =
    segment.right && segment.bottom
      ? Math.max(0, borderRadii.bottomRight.horizontal - rightInset)
      : 0;
  let brVer =
    segment.right && segment.bottom
      ? Math.max(0, borderRadii.bottomRight.vertical - bottomInset)
      : 0;
  let blHor =
    segment.bottom && segment.left
      ? Math.max(0, borderRadii.bottomLeft.horizontal - leftInset)
      : 0;
  let blVer =
    segment.bottom && segment.left
      ? Math.max(0, borderRadii.bottomLeft.vertical - bottomInset)
      : 0;

  // Adjust radii ratios if they overlap (like in reference implementation)
  const topRatio = adjustedWidth / (tlHor + trHor || 1);
  const rightRatio = adjustedHeight / (trVer + brVer || 1);
  const bottomRatio = adjustedWidth / (blHor + brHor || 1);
  const leftRatio = adjustedHeight / (blVer + tlVer || 1);
  const smallestRatio = Math.min(topRatio, rightRatio, bottomRatio, leftRatio);

  if (smallestRatio < 1) {
    tlHor *= smallestRatio;
    tlVer *= smallestRatio;
    trHor *= smallestRatio;
    trVer *= smallestRatio;
    brHor *= smallestRatio;
    brVer *= smallestRatio;
    blHor *= smallestRatio;
    blVer *= smallestRatio;
  }

  const adjustedRadii = {
    tlHor,
    tlVer,
    trHor,
    trVer,
    brHor,
    brVer,
    blHor,
    blVer,
  };

  return generateSegmentPath(
    adjustedX,
    adjustedY,
    adjustedWidth,
    adjustedHeight,
    adjustedRadii,
    segment
  );
}

import {BlockContainer, Inline, InlineLevel, IfcInline} from './layout-flow.js';
import {ShapedItem, Paragraph, BackgroundBox, G_CL, G_AX, G_SZ} from './layout-text.js';
import {Color} from './style.js';
import {Box} from './layout-box.js';
import {binarySearchOf} from './util.js';

import type {LoadedFontFace} from './text-font.js';

export interface PaintBackend {
  fillColor: Color;
  strokeColor: Color;
  lineWidth: number;
  direction: 'ltr' | 'rtl';
  font: LoadedFontFace | undefined;
  fontSize: number;
  edge(x: number, y: number, length: number, side: 'top' | 'right' | 'bottom' | 'left'): void;
  text(x: number, y: number, item: ShapedItem, textStart: number, textEnd: number, isColorBoundary?: boolean): void;
  rect(x: number, y: number, w: number, h: number): void;
  pushClip(x: number, y: number, w: number, h: number): void;
  popClip(): void;
}

function getTextOffsetsForUncollapsedGlyphs(item: ShapedItem) {
  const glyphs = item.glyphs;
  let glyphStart = 0;
  let glyphEnd = glyphs.length - G_SZ;

  while (glyphStart < glyphs.length && glyphs[glyphStart + G_AX] === 0) glyphStart += G_SZ;
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

    return {textStart, textEnd};
  } else {
    return {textStart: 0, textEnd: 0};
  }
}

function drawText(
  item: ShapedItem,
  colors: [Color, number][],
  b: PaintBackend
) {
  const style = item.attrs.style;
  const {textStart, textEnd} = getTextOffsetsForUncollapsedGlyphs(item);
  // Split the colors into spans so that colored diacritics can work.
  // Sadly this seems to only work in Firefox and only when the font doesn't do
  // any normalizination, so I could probably stop trying to support it
  // https://github.com/w3c/csswg-drafts/issues/699
  const end = item.attrs.level & 1 ? item.colorsStart(colors) - 1 : item.colorsEnd(colors);
  let i = item.attrs.level & 1 ? item.colorsEnd(colors) - 1 : item.colorsStart(colors);
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
      const isColorBoundary = start !== textStart && start === colorStart
        || end !== textEnd && end === colorEnd;
      let ax = 0;

      if (item.attrs.level & 1) {
        while (glyphIndex < item.glyphs.length && item.glyphs[glyphIndex + G_CL] >= start) {
          ax += item.glyphs[glyphIndex + G_AX];
          glyphIndex += G_SZ;
        }
      } else {
        while (glyphIndex < item.glyphs.length && item.glyphs[glyphIndex + G_CL] < end) {
          ax += item.glyphs[glyphIndex + G_AX];
          glyphIndex += G_SZ;
        }
      }

      b.fillColor = color;
      b.fontSize = style.fontSize;
      b.font = item.face;
      b.direction = item.attrs.level & 1 ? 'rtl' : 'ltr';
      b.text(tx, item.y, item, start, end, isColorBoundary);

      tx += ax / item.face.hbface.upem * style.fontSize;
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
function paintBlockBackground(block: BlockContainer, b: PaintBackend, isRoot = false) {
  const style = block.style;
  const borderArea = block.getBorderArea();

  if (!isRoot) {
    const paddingArea = block.getPaddingArea();
    const contentArea = block.getContentArea();
    const {backgroundColor, backgroundClip} = style;
    const area = backgroundClip === 'border-box' ? borderArea :
      backgroundClip === 'padding-box' ? paddingArea :
      contentArea;

    if (backgroundColor.a > 0) {
      b.fillColor = backgroundColor;
      b.rect(area.x, area.y, area.width, area.height);
    }
  }

  const work = [
    ['top', style.borderTopWidth, style.borderTopColor],
    ['right', style.borderRightWidth, style.borderRightColor],
    ['bottom', style.borderBottomWidth, style.borderBottomColor],
    ['left', style.borderLeftWidth, style.borderLeftColor],
  ] as const;

  for (const [side, lineWidth, color] of work) {
    if (lineWidth === 0 || color.a === 0) continue;
    const length = side === 'top' || side === 'bottom' ? borderArea.width : borderArea.height;
    let x = side === 'right' ? borderArea.x + borderArea.width - lineWidth: borderArea.x;
    let y = side === 'bottom' ? borderArea.y + borderArea.height - lineWidth : borderArea.y;
    b.strokeColor = color;
    b.lineWidth = lineWidth;
    x += side === 'left' || side === 'right' ? lineWidth/2 : 0;
    y += side === 'top' || side === 'bottom' ? lineWidth/2 : 0;
    b.edge(x, y, length, side);
  }
}

function paintBackgroundDescendents(root: BlockContainer | Inline, b: PaintBackend) {
  const stack: (BlockContainer | Inline | {sentinel: true})[] = [root];
  const parents: Box[] = [];

  while (stack.length) {
    const box = stack.pop()!;

    if ('sentinel' in box) {
      const box = parents.pop()!;

      if (box.isBlockContainer() && box.style.overflow === 'hidden' && box !== root) {
        b.popClip();
      }
    } else {
      if (box.isBlockContainer() && !box.isInlineLevel() && box !== root) {
        paintBlockBackground(box, b);
      }

      if (box.hasBackgroundInLayerRoot()) {
        stack.push({sentinel: true});
        parents.push(box);

        if (box.isBlockContainer() && box.style.overflow === 'hidden' && box !== root) {
          const {x, y, width, height} = box.getPaddingArea();
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
  return {x, y, width, height};
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
  const {borderTopColor, borderRightColor, borderBottomColor, borderLeftColor} = inline.style;
  const {a: ta} = borderTopColor;
  const {a: ra} = borderRightColor;
  const {a: ba} = borderBottomColor;
  const {a: la} = borderLeftColor;
  const {start, end, blockOffset, ascender, descender, naturalStart, naturalEnd} = background;
  const paddingTop = inline.style.getPaddingBlockStart(ifc);
  const paddingRight = inline.style.getPaddingLineRight(ifc);
  const paddingBottom = inline.style.getPaddingBlockEnd(ifc);
  const paddingLeft = inline.style.getPaddingLineLeft(ifc);
  const paintLeft = naturalStart && direction === 'ltr' || naturalEnd && direction === 'rtl';
  const paintRight = naturalEnd && direction === 'ltr' || naturalStart && direction === 'rtl';
  const borderTopWidth = inline.style.getBorderBlockStartWidth(ifc);
  let borderRightWidth = inline.style.getBorderLineRightWidth(ifc);
  const borderBottomWidth = inline.style.getBorderBlockEndWidth(ifc);
  let borderLeftWidth = inline.style.getBorderLineLeftWidth(ifc);

  if (!paintLeft) borderLeftWidth = 0;
  if (!paintRight) borderRightWidth = 0;

  if (start !== end && bgc.a > 0) {
    let extraTop = 0;
    let extraBottom = 0;

    if (clip !== 'content-box') {
      extraTop += inline.style.getPaddingBlockStart(ifc);
      extraBottom += inline.style.getPaddingBlockEnd(ifc);
    }

    if (clip === 'border-box') {
      extraTop += borderTopWidth;
      extraBottom += borderBottomWidth;
    }

    b.fillColor = bgc;
    const {x, y, width, height} = snap(
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

    if (paintLeft && clip === 'content-box') extraLeft += paddingLeft
    if (paintLeft && clip !== 'border-box') extraLeft += borderLeftWidth;
    if (paintRight && clip === 'content-box') extraRight += paddingRight;
    if (paintRight && clip !== 'border-box') extraRight += borderRightWidth;

    const work = [
      ['top', borderTopWidth, borderTopColor],
      ['right', borderRightWidth, borderRightColor],
      ['bottom', borderBottomWidth, borderBottomColor],
      ['left', borderLeftWidth, borderLeftColor]
    ] as const;

    // TODO there's a bug here: try
    // <span style="background-color:red; border-left: 2px solid yellow; border-top: 4px solid maroon;">red</span>

    for (const [side, lineWidth, color] of work) {
      if (lineWidth === 0) continue;
      const rect = snap(
        Math.min(start, end) - extraLeft,
        blockOffset - ascender - paddingTop - borderTopWidth,
        Math.abs(start - end) + extraLeft + extraRight,
        borderTopWidth + paddingTop + ascender + descender + paddingBottom + borderBottomWidth
      );

      const length = side === 'left' || side === 'right' ? rect.height : rect.width;
      let x = side === 'right' ? rect.x + rect.width : rect.x;
      let y = side === 'bottom' ? rect.y + rect.height : rect.y;
      x += side === 'left' ? lineWidth/2 : side === 'right' ? -lineWidth/2 : 0;
      y += side === 'top' ? lineWidth/2 : side === 'bottom' ? -lineWidth/2 : 0;
      b.lineWidth = lineWidth;
      b.strokeColor = color;
      b.edge(x, y, length, side);
    }
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
    if (!lineboxItem) { // starting a new linebox
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
      } else if (item.block) {
        const blockLayerRoot = root.inlineBlocks.get(item.block)!;
        paintBlockLayerRoot(blockLayerRoot, b);
      }
    }
  }
}

function paintBlockForeground(root: BlockLayerRoot, b: PaintBackend) {
  const stack: (IfcInline | BlockContainer | {sentinel: true})[] = [root.box];

  while (stack.length) {
    const box = stack.pop()!;

    if ('sentinel' in box) {
      b.popClip();
    } else if (box.isBlockContainer()) {
      if (
        // Belongs to this LayerRoot
        (box === root.box || !box.isLayerRoot()) &&
        // Has something we should paint underneath it
        (box.hasForegroundInLayerRoot() || root.isInInlineBlockPath(box))
      ) {
        if (box !== root.box && box.style.overflow === 'hidden') {
          const {x, y, width, height} = box.getPaddingArea();
          b.pushClip(x, y, width, height);
          stack.push({sentinel: true});
        }

        for (let i = box.children.length - 1; i >= 0; i--) {
          stack.push(box.children[i]);
        }
      }
    } else {
      paintInlines(root, box, b);
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
  let itemIndex = binarySearchOf(paragraph.treeItems, root.box.start, item => item.offset);

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
      } else if (box.isBlockContainer()) {
        const layerRoot = root.inlineBlocks.get(box)!;
        paintRanges();
        paintBlockLayerRoot(layerRoot, b);
      }
    }
  }

  paintRanges();
}

class LayerRoot {
  box: BlockContainer | Inline;
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

  constructor(box: BlockContainer | Inline, parents: Box[]) {
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
    return zIndex === 'auto' ? 0 : zIndex;
  }

  finalize(preorderScores: Map<Box, number>) {
    this.negativeRoots.sort((a, b) => a.zIndex - b.zIndex);
    this.floats.sort((a, b) => preorderScores.get(a.box)! - preorderScores.get(b.box)!);
    this.positionedRoots.sort((a, b) => preorderScores.get(a.box)! - preorderScores.get(b.box)!);
    this.positiveRoots.sort((a, b) => a.zIndex - b.zIndex);
  }

  isEmpty() {
    return !this.box.hasBackground()
      && !this.box.hasForeground()
      && !this.box.hasBackgroundInLayerRoot()
      && !this.box.hasForegroundInLayerRoot()
      && this.negativeRoots.length === 0
      && this.floats.length === 0
      && this.positionedRoots.length === 0
      && this.positiveRoots.length === 0
      && this.inlineBlocks.size === 0;
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
  box: BlockContainer;

  constructor(box: BlockContainer, parents: Box[]) {
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
  const stack: (InlineLevel | {sentinel: true})[] = box.children.slice().reverse();
  const parents: Box[] = [];
  let preorderIndex = 0;

  while (stack.length) {
    const box = stack.pop()!;
    let layerRoot;

    if ('sentinel' in box) {
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
          } else if (box.isBlockContainer() && box.isFloat()) {
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

        const parentIndex = parents.findLastIndex(box => parentRoot.box === box);
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
          layerRoot = new InlineLayerRoot(box, paintRootParents, nearestParagraph!);
        } else {
          layerRoot = new BlockLayerRoot(box, paintRootParents);
        }
      } else if (box.isBlockContainer()) {
        const parent = parents.at(-1);
        const isInlineBlock = box.isInlineLevel() && parent?.isInline();
        if (box.isFloat() || isInlineBlock) {
          const parentIndex = parents.findLastIndex(box => parentRoot.box === box);
          const paintRootParents = parents.slice(parentIndex + 1);
          layerRoot = new BlockLayerRoot(box, paintRootParents);
          if (isInlineBlock) parentRoot.inlineBlocks.set(box, layerRoot);
        }
      }

      if (
        box.hasBackgroundInDescendent() ||
        box.hasForegroundInDescendent() ||
        box.hasBackground() ||
        box.hasForeground()
      ) {
        stack.push({sentinel: true});
        parents.push(box);
        if (layerRoot) parentRoots.push(layerRoot);
        for (let i = box.children.length - 1; i >= 0; i--) {
          stack.push(box.children[i]);
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
  if (root.box.hasBackground() && !isRoot) paintBlockBackground(root.box, b);

  if (!isRoot && root.box.style.overflow === 'hidden') {
    const {x, y, width, height} = root.box.getPaddingArea();
    b.pushClip(x, y, width, height);
  }

  for (const r of root.negativeRoots) paintLayerRoot(r, b);

  if (root.box.hasBackgroundInLayerRoot()) {
    paintBackgroundDescendents(root.box, b);
  }

  for (const r of root.floats) paintLayerRoot(r, b);

  if (root.box.hasForegroundInLayerRoot() || root.inlineBlocks.size) {
    paintBlockForeground(root, b);
  }

  for (const r of root.positionedRoots) paintLayerRoot(r, b);

  for (const r of root.positiveRoots) paintLayerRoot(r, b);

  if (!isRoot && root.box.style.overflow === 'hidden') b.popClip();
}

function paintLayerRoot(paintRoot: LayerRoot, b: PaintBackend) {
  for (const parent of paintRoot.parents) {
    if (parent.isBlockContainer() && parent.style.overflow === 'hidden') {
      const {x, y, width, height} = parent.getPaddingArea();
      b.pushClip(x, y, width, height);
    }
  }

  if (paintRoot.isBlockLayerRoot()) {
    paintBlockLayerRoot(paintRoot, b);
  } else if (paintRoot.isInlineLayerRoot()) {
    paintInlineLayerRoot(paintRoot, b);
  }

  for (const parent of paintRoot.parents) {
    if (parent.isBlockContainer() && parent.style.overflow === 'hidden') {
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

    if (block.style.overflow === 'hidden') {
      const {x, y, width, height} = block.containingBlock;
      b.pushClip(x, y, width, height);
    }

    paintBlockLayerRoot(layerRoot, b, true);

    if (block.style.overflow === 'hidden') b.popClip();
  }
}

import {BlockContainer, Inline, InlineLevel, IfcInline} from './layout-flow.js';
import {ShapedItem, Paragraph, BackgroundBox} from './layout-text.js';
import {Color} from './style.js';
import {Box, BoxArea} from './layout-box.js';
import {binarySearchOf} from './util.js';

import type {FaceMatch} from './text-font.js';

export interface PaintBackend {
  fillColor: Color;
  strokeColor: Color;
  lineWidth: number;
  direction: 'ltr' | 'rtl';
  font: FaceMatch;
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
  let glyphEnd = glyphs.glyphLength - 1;

  while (glyphStart < glyphs.glyphLength && glyphs.ad(glyphStart) === 0) glyphStart++;
  while (glyphEnd >= 0 && glyphs.ad(glyphEnd) === 0) glyphEnd--;

  if (glyphStart >= 0 && glyphStart < glyphs.glyphLength && glyphEnd >= 0 && glyphEnd < glyphs.glyphLength) {
    let textStart, textEnd;

    if (item.attrs.level & 1) {
      textStart = glyphs.cl(glyphEnd);
      if (glyphStart - 1 >= 0) {
        textEnd = glyphs.cl(glyphStart - 1);
      } else {
        textEnd = item.end();
      }
    } else {
      textStart = glyphs.cl(glyphStart);
      if (glyphEnd + 1 < glyphs.glyphLength) {
        textEnd = glyphs.cl(glyphEnd + 1);
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
  containingBlock: BoxArea,
  item: ShapedItem,
  colors: [Color, number][],
  b: PaintBackend
) {
  const match = item.match;
  const style = item.attrs.style;
  const {textStart, textEnd} = getTextOffsetsForUncollapsedGlyphs(item);
  // Split the colors into spans so that colored diacritics can work.
  // Sadly this seems to only work in Firefox and only when the font doesn't do
  // any normalizination, so I could probably stop trying to support it
  // https://github.com/w3c/csswg-drafts/issues/699
  const end = item.attrs.level & 1 ? item.colorsStart(colors) - 1 : item.colorsEnd(colors);
  let i = item.attrs.level & 1 ? item.colorsEnd(colors) - 1 : item.colorsStart(colors);
  let glyphIndex = 0;
  let tx = containingBlock.x + item.x;

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
        while (glyphIndex < item.glyphs.glyphLength && item.glyphs.cl(glyphIndex) >= start) {
          ax += item.glyphs.ad(glyphIndex);
          glyphIndex += 1;
        }
      } else {
        while (glyphIndex < item.glyphs.glyphLength && item.glyphs.cl(glyphIndex) < end) {
          ax += item.glyphs.ad(glyphIndex);
          glyphIndex += 1;
        }
      }

      b.fillColor = color;
      b.fontSize = style.fontSize;
      b.font = match;
      b.direction = item.attrs.level & 1 ? 'rtl' : 'ltr';
      b.text(tx, containingBlock.y + item.y, item, start, end, isColorBoundary);

      tx += ax / item.match.face.upem * style.fontSize;
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
  const borderArea = block.borderArea;

  if (!isRoot) {
    const {paddingArea, contentArea} = block;
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
          const {x, y, width, height} = box.paddingArea;
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

function paintInlineBackground(
  background: BackgroundBox,
  inline: Inline,
  paragraph: Paragraph,
  b: PaintBackend
) {
  const ifc = paragraph.ifc;
  const direction = ifc.style.direction;
  const containingBlock = inline.containingBlock;
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
    const x = containingBlock.x + Math.min(start, end);
    const y = containingBlock.y + blockOffset - ascender - extraTop;
    const width = Math.abs(start - end);
    const height = ascender + descender + extraTop + extraBottom;
    b.rect(x, y, width, height);
  }

  if (start !== end && (ta > 0 || ra > 0 || ba > 0 || la > 0)) {
    let extraLeft = 0;
    let extraRight = 0;

    if (paintLeft && clip === 'content-box') extraLeft += paddingLeft
    if (paintLeft && clip !== 'border-box') extraLeft += borderLeftWidth;
    if (paintRight && clip === 'content-box') extraRight += paddingRight;
    if (paintRight && clip !== 'border-box') extraRight += borderRightWidth;

    const left = containingBlock.x + Math.min(start, end) - extraLeft;
    const top = containingBlock.y + blockOffset - ascender - paddingTop - borderTopWidth;
    const width = Math.abs(start - end) + extraLeft + extraRight;
    const height = borderTopWidth + paddingTop + ascender + descender + paddingBottom + borderBottomWidth;

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
      const length = side === 'left' || side === 'right' ? height : width;
      let x = side === 'right' ? left + width : left;
      let y = side === 'bottom' ? top + height : top;
      x += side === 'left' ? lineWidth/2 : side === 'right' ? -lineWidth/2 : 0;
      y += side === 'top' ? lineWidth/2 : side === 'bottom' ? -lineWidth/2 : 0;
      b.lineWidth = lineWidth;
      b.strokeColor = color;
      b.edge(x, y, length, side);
    }
  }
}

function paintInlines(
  ifc: IfcInline,
  inlineBlockRoots: Map<BlockContainer, BlockLayerRoot>,
  b: PaintBackend
) {
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
        drawText(ifc.containingBlock, item, colors, b);
      } else if (item.block) {
        const layerRoot = inlineBlockRoots.get(item.block)!;
        paintBlockLayerRoot(layerRoot, inlineBlockRoots, b);
      }
    }
  }
}

function paintBlockForeground(
  root: BlockContainer,
  inlineBlockRoots: Map<BlockContainer, BlockLayerRoot>,
  b: PaintBackend
) {
  const stack: (IfcInline | BlockContainer | {sentinel: true})[] = [root];

  while (stack.length) {
    const box = stack.pop()!;

    if ('sentinel' in box) {
      b.popClip();
    } else if (box.isBlockContainer()) {
      if ((box === root || !box.isLayerRoot()) && box.hasForegroundInLayerRoot())  {
        if (box !== root && box.style.overflow === 'hidden') {
          const {x, y, width, height} = box.paddingArea;
          b.pushClip(x, y, width, height);
          stack.push({sentinel: true});
        }

        for (let i = box.children.length - 1; i >= 0; i--) {
          stack.push(box.children[i]);
        }
      }
    } else {
      paintInlines(box, inlineBlockRoots, b);
    }
  }
}

function paintInline(
  inline: Inline,
  paragraph: Paragraph,
  inlineBlockRoots: Map<BlockContainer, BlockLayerRoot>,
  b: PaintBackend
) {
  const colors = paragraph.getColors();
  const containingBlock = paragraph.ifc.containingBlock;
  const treeItems = paragraph.treeItems;
  const stack = inline.children.slice().reverse();
  const ranges: [number, number][] = [];
  let itemIndex = binarySearchOf(paragraph.treeItems, inline.start, item => item.offset);

  function paintRanges() {
    while (ranges.length) {
      const [start, end] = ranges.shift()!;
      while (treeItems[itemIndex]?.offset < start) itemIndex++;
      while (treeItems[itemIndex]?.end() <= end) {
        const item = treeItems[itemIndex];
        let hasPositionedParent = false;
        for (let i = item.inlines.length - 1; i >= 0; i--) {
          if (item.inlines[i] === inline) break;
          if (item.inlines[i].isLayerRoot()) {
            hasPositionedParent = true;
            break;
          }
        }
        if (!hasPositionedParent && item instanceof ShapedItem) {
          drawText(containingBlock, item, colors, b);
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
        const layerRoot = inlineBlockRoots.get(box)!;
        paintRanges();
        paintBlockLayerRoot(layerRoot, inlineBlockRoots, b);
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

  constructor(box: BlockContainer | Inline, parents: Box[]) {
    this.box = box;
    this.parents = parents;
    this.negativeRoots = [];
    this.floats = [];
    this.positionedRoots = [];
    this.positiveRoots = [];
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
      && this.positiveRoots.length === 0;
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
  const inlineBlockRoots = new Map<BlockContainer, BlockLayerRoot>();
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
        const isInlineBlock = box.isInlineBlock() && parent?.isInline();
        if (box.isFloat() || isInlineBlock) {
          const parentIndex = parents.findLastIndex(box => parentRoot.box === box);
          const paintRootParents = parents.slice(parentIndex + 1);
          layerRoot = new BlockLayerRoot(box, paintRootParents);
          if (isInlineBlock) inlineBlockRoots.set(box, layerRoot);
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

  return {layerRoot, inlineBlockRoots};
}

function paintInlineLayerRoot(
  root: InlineLayerRoot,
  inlineBlockRoots: Map<BlockContainer, BlockLayerRoot>,
  b: PaintBackend
) {
  for (const r of root.negativeRoots) paintLayerRoot(r, inlineBlockRoots, b);

  if (root.box.hasBackgroundInLayerRoot()) {
    paintBackgroundDescendents(root.box, b);
  }

  for (const r of root.floats) paintLayerRoot(r, inlineBlockRoots, b);

  const backgrounds = root.paragraph.backgroundBoxes.get(root.box);
  if (backgrounds) {
    for (const background of backgrounds) {
      paintInlineBackground(background, root.box, root.paragraph, b);
    }
  }

  if (root.box.hasForeground()) {
    paintInline(root.box, root.paragraph, inlineBlockRoots, b);
  }

  for (const r of root.positionedRoots) paintLayerRoot(r, inlineBlockRoots, b);

  for (const r of root.positiveRoots) paintLayerRoot(r, inlineBlockRoots, b);
}

function paintBlockLayerRoot(
  root: BlockLayerRoot,
  inlineBlockRoots: Map<BlockContainer, BlockLayerRoot>,
  b: PaintBackend,
  isRoot = false
) {
  if (root.box.hasBackground() && !isRoot) paintBlockBackground(root.box, b);

  if (!isRoot && root.box.style.overflow === 'hidden') {
    const {x, y, width, height} = root.box.paddingArea;
    b.pushClip(x, y, width, height);
  }

  for (const r of root.negativeRoots) paintLayerRoot(r, inlineBlockRoots, b);

  if (root.box.hasBackgroundInLayerRoot()) {
    paintBackgroundDescendents(root.box, b);
  }

  for (const r of root.floats) paintLayerRoot(r, inlineBlockRoots, b);

  if (root.box.hasForegroundInLayerRoot()) {
    paintBlockForeground(root.box, inlineBlockRoots, b);
  }

  for (const r of root.positionedRoots) paintLayerRoot(r, inlineBlockRoots, b);

  for (const r of root.positiveRoots) paintLayerRoot(r, inlineBlockRoots, b);

  if (!isRoot && root.box.style.overflow === 'hidden') b.popClip();
}

function paintLayerRoot(
  paintRoot: LayerRoot, inlineBlockRoots: Map<BlockContainer, BlockLayerRoot>,
  b: PaintBackend
) {
  for (const parent of paintRoot.parents) {
    if (parent.isBlockContainer() && parent.style.overflow === 'hidden') {
      const {x, y, width, height} = parent.paddingArea;
      b.pushClip(x, y, width, height);
    }
  }

  if (paintRoot.isBlockLayerRoot()) {
    paintBlockLayerRoot(paintRoot, inlineBlockRoots, b);
  } else if (paintRoot.isInlineLayerRoot()) {
    paintInlineLayerRoot(paintRoot, inlineBlockRoots, b);
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
  const {layerRoot, inlineBlockRoots} = createLayerRoot(block);

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

    paintBlockLayerRoot(layerRoot, inlineBlockRoots, b, true);

    if (block.style.overflow === 'hidden') b.popClip();
  }
}

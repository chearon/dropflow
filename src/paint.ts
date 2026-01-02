import {BlockContainer, ReplacedBox, Inline, IfcInline} from './layout-flow.ts';
import {Image} from './layout-image.ts';
import {G_CL, G_AX, G_SZ} from './text-harfbuzz.ts';
import {ShapedItem, Paragraph, isSpaceOrTabOrNewline} from './layout-text.ts';
import {Box, FormattingBox} from './layout-box.ts';
import {binarySearchOf} from './util.ts';

import type {InlineLevel, BlockLevel} from './layout-flow.ts';
import type {InlineFragment, Run} from './layout-text.ts';
import type {Color} from './style.ts';
import type {LoadedFontFace} from './text-font.ts';

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
  image(x: number, y: number, width: number, height: number, image: Image): void;
}

function getTextOffsetsForUncollapsedGlyphs(item: ShapedItem) {
  const s = item.paragraph.string;
  const glyphs = item.glyphs;
  let glyphStart = 0;
  let glyphEnd = glyphs.length - G_SZ;

  while (
    glyphStart < glyphs.length &&
    glyphs[glyphStart + G_AX] === 0 &&
    isSpaceOrTabOrNewline(s[glyphs[glyphStart + G_CL]])
  ) glyphStart += G_SZ;

  while (
    glyphEnd >= 0 &&
    glyphs[glyphEnd + G_AX] === 0 &&
    isSpaceOrTabOrNewline(s[glyphs[glyphEnd + G_CL]])
  ) glyphEnd -= G_SZ;

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
  run: Run,
  textStart: number,
  textEnd: number,
  b: PaintBackend
) {
  const style = item.attrs.style;
  // Split the colors into spans so that colored diacritics can work.
  // Sadly this seems to only work in Firefox and only when the font doesn't do
  // any normalizination, so I could probably stop trying to support it
  // https://github.com/w3c/csswg-drafts/issues/699
  let tx = item.x;
  const collapsed = getTextOffsetsForUncollapsedGlyphs(item);
  textStart = Math.max(textStart, collapsed.textStart);
  textEnd = Math.min(textEnd, collapsed.textEnd);

  if (textStart < textEnd) {
    const toPx = 1 / item.face.hbface.upem * item.attrs.style.fontSize;
    let axToStart = 0;

    // Move tx to the x offset for textStart
    if (item.attrs.level & 1) {
      for (let i = 0; i < item.glyphs.length; i += G_SZ) {
        if (item.glyphs[i + G_CL] < textEnd) break;
        axToStart += item.glyphs[i + G_AX];
      }
    } else {
      for (let i = 0; i < item.glyphs.length; i += G_SZ) {
        if (item.glyphs[i + G_CL] >= textStart) break;
        axToStart += item.glyphs[i + G_AX];
      }
    }

    tx += axToStart * toPx;

    // TODO: should really have isStartColorBoundary, isEndColorBoundary
    const isColorBoundary = textStart !== item.offset && textStart === run.start
      || textEnd !== item.end() && textEnd === run.end;

    b.fillColor = run.style.color;
    b.fontSize = style.fontSize;
    b.font = item.face;
    b.direction = item.attrs.level & 1 ? 'rtl' : 'ltr';
    b.text(tx, item.y, item, textStart, textEnd, isColorBoundary);
  }
}

/**
 * Paints the background and borders
 */
function paintFormattingBoxBackground(box: FormattingBox, b: PaintBackend, isRoot = false) {
  const style = box.style;
  const borderArea = box.getBorderArea();

  if (!isRoot) {
    const paddingArea = box.getPaddingArea();
    const contentArea = box.getContentArea();
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

function paintBackgroundDescendents(root: FormattingBox, b: PaintBackend) {
  const stack: (FormattingBox | {sentinel: true})[] = [root];
  const parents: Box[] = [];

  while (stack.length) {
    const box = stack.pop()!;

    if ('sentinel' in box) {
      const box = parents.pop()!;

      if (box.isFormattingBox() && box.style.overflow === 'hidden' && box !== root) {
        b.popClip();
      }
    } else {
      if (!box.isInline() && !box.isInlineLevel() && box !== root) {
        paintFormattingBoxBackground(box, b);
      }

      if (
        box.isBlockContainer() &&
        box.isBlockContainerOfBlocks() &&
        box.hasBackgroundInLayerRoot()
      ) {
        stack.push({sentinel: true});
        parents.push(box);

        if (box.isFormattingBox() && box.style.overflow === 'hidden' && box !== root) {
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
  fragment: InlineFragment,
  paragraph: Paragraph,
  b: PaintBackend
) {
  const ifc = paragraph.ifc;
  const direction = ifc.style.direction;
  const inline = fragment.inline;
  const bgc = inline.style.backgroundColor;
  const clip = inline.style.backgroundClip;
  const {borderTopColor, borderRightColor, borderBottomColor, borderLeftColor} = inline.style;
  const {a: ta} = borderTopColor;
  const {a: ra} = borderRightColor;
  const {a: ba} = borderBottomColor;
  const {a: la} = borderLeftColor;
  const {start, end, blockOffset, ascender, descender, naturalStart, naturalEnd} = fragment;
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

function paintReplacedBox(box: ReplacedBox, b: PaintBackend) {
  const image = box.getImage();
  if (image?.status === 'loaded') {
    const {x, y, width, height} = box.getContentArea();
    b.image(x, y, width, height, image);
  }
}

function paintInline(
  inlineRoot: Inline,
  layerRoot: LayerRoot,
  paragraph: Paragraph,
  b: PaintBackend
) {
  const items = paragraph.items;
  const fragments: InlineFragment[] = [];
  let fragmentIndex = 0;
  const stack: InlineLevel[] = [inlineRoot];
  let lastMark = inlineRoot.start;
  let inlineMark = inlineRoot.start;
  let run: Run | undefined = undefined;
  let mark = inlineRoot.start;
  let itemIndex = 0; // common case, adjusted below if necessary
  let itemEnd = items.length; // common case, adjusted below

  if (items.length > 0 && inlineRoot.start !== items[0].offset) {
    itemIndex = binarySearchOf(items, inlineRoot.start, item => item.end());
    if (items[itemIndex].end() === inlineRoot.start) itemIndex += 1;
  }
  if (items.length > 0 && inlineRoot.end !== items[itemEnd - 1].end()) {
    itemEnd = binarySearchOf(items, inlineRoot.end, item => item.end()) + 1;
  }

  while (
    itemIndex < itemEnd ||
    stack.length ||
    fragmentIndex < fragments.length
  ) {
    // paint lastMark..mark
    if (itemIndex < itemEnd) {
      if (lastMark < mark) drawText(items[itemIndex], run!, lastMark, mark, b);
      if (mark === items[itemIndex].end()) itemIndex++;
    }

    // Fragmented backgrounds from an inline already seen
    while (
      fragmentIndex < fragments.length &&
      fragments[fragmentIndex].textOffset === mark
    ) {
      paintInlineBackground(fragments[fragmentIndex++], paragraph, b);
    }

    // Inlines, inline-block, images
    while (stack.length && mark === inlineMark) {
      const box = stack.pop()!;
      if (box.isInline()) {
        if (!box.isLayerRoot() || box === inlineRoot) {
          for (let i = box.children.length - 1; i >= 0; i--) {
            stack.push(box.children[i]);
          }
          const inlineFragments = paragraph.fragments.get(box);
          if (inlineFragments) {
            for (const fragment of inlineFragments) {
              fragments.push(fragment);
            }
            break;
          }
        } else {
          while (
            itemIndex < itemEnd && 
            items[itemIndex].end() <= box.end
          ) itemIndex++;
        }
      } else if (box.isFormattingBox()) {
        if (!box.isLayerRoot()) {
          if (box.isReplacedBox()) {
            paintFormattingBoxBackground(box, b);
            paintReplacedBox(box, b);
          } else {
            paintBlockLayerRoot(layerRoot.inlineBlocks.get(box)!, b);
          }
        }
      } else if (box.isRun()) {
        run = box;
        inlineMark = box.end;
      }
    }

    lastMark = mark;
    mark = Math.min(
      fragmentIndex < fragments.length ? fragments[fragmentIndex].textOffset : Infinity,
      itemIndex < itemEnd ? items[itemIndex].end() : Infinity,
      inlineMark,
      inlineRoot.end
    );
  }
}

function paintBlockForeground(root: BlockLayerRoot, b: PaintBackend) {
  const stack: (IfcInline | BlockLevel | {sentinel: true})[] = [root.box];

  while (stack.length) {
    const box = stack.pop()!;

    if ('sentinel' in box) {
      b.popClip();
    } else if (box.isReplacedBox()) {
      // Belongs to this LayerRoot
      if (box === root.box || !box.isLayerRoot()) paintReplacedBox(box, b);
    } else if (box.isInline()) {
      paintInline(box, root, box.paragraph, b);
    } else {
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
    }
  }
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

function createLayerRoot(rootBox: BlockContainer) {
  const layerRoot = new BlockLayerRoot(rootBox, []);
  const preorderIndices = new Map<Box, number>();
  const parentRoots: LayerRoot[] = [layerRoot];
  const stack: (InlineLevel | {sentinel: true})[] = [rootBox];
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

      if (box === rootBox) {
        // only push children
      } else if (box.isPositioned()) {
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
      } else if (!box.isInline()) {
        if (box.isFloat() || box.isBlockContainer() && box.isInlineLevel()) {
          const parentIndex = parents.findLastIndex(box => parentRoot.box === box);
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
        stack.push({sentinel: true});
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

  for (const r of root.floats) paintLayerRoot(r, b);

  if (root.box.hasForeground() || root.box.hasForegroundInLayerRoot()) {
    paintInline(root.box, root, root.paragraph, b);
  }

  for (const r of root.positionedRoots) paintLayerRoot(r, b);

  for (const r of root.positiveRoots) paintLayerRoot(r, b);
}

function paintBlockLayerRoot(
  root: BlockLayerRoot,
  b: PaintBackend,
  isRoot = false
) {
  if (root.box.hasBackground() && !isRoot) paintFormattingBoxBackground(root.box, b);

  if (!isRoot && root.box.style.overflow === 'hidden') {
    const {x, y, width, height} = root.box.getPaddingArea();
    b.pushClip(x, y, width, height);
  }

  for (const r of root.negativeRoots) paintLayerRoot(r, b);

  if (root.box.hasBackgroundInLayerRoot()) {
    paintBackgroundDescendents(root.box, b);
  }

  for (const r of root.floats) paintLayerRoot(r, b);

  if (root.box.hasForeground() || root.box.hasForegroundInLayerRoot() || root.inlineBlocks.size) {
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
      const area = block.getContainingBlock();
      b.fillColor = block.style.backgroundColor;
      b.rect(area.x, area.y, area.width, area.height);
    }

    if (block.style.overflow === 'hidden') {
      const {x, y, width, height} = block.getContainingBlock();
      b.pushClip(x, y, width, height);
    }

    paintBlockLayerRoot(layerRoot, b, true);

    if (block.style.overflow === 'hidden') b.popClip();
  }
}

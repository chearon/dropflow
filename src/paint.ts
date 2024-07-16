import {BlockContainer, Inline, InlineLevel, IfcInline} from './layout-flow.js';
import {ShapedItem, Paragraph, BackgroundBox, G_CL, G_AX, G_SZ} from './layout-text.js';
import {Color} from './style.js';
import {BoxArea} from './layout-box.js';
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
    if (lineWidth === 0) continue;
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
  const stack = [root];
  while (stack.length) {
    const block = stack.pop()!;
    if (block.isBlockContainer() && !block.isInlineLevel() && block !== root) {
      paintBlockBackground(block, b);
    }
    for (let i = block.children.length - 1; i >= 0; i--) {
      const child = block.children[i];
      if (child.isBox() && !child.isPaintRoot()) stack.push(child);
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

function paintInlines(ifc: IfcInline, b: PaintBackend) {
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
      if (inline.isPositioned()) {
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
        paintBlockRoot(item.block, b);
      }
    }
  }
}

function paintInlinesAndDescendents(block: BlockContainer, b: PaintBackend) {
  const stack: (IfcInline | BlockContainer)[] = block.children.slice().reverse();
  while (stack.length) {
    const box = stack.pop()!;

    if (box.isBlockContainer()) {
      for (let i = box.children.length - 1; i >= 0; i--) {
        const child = box.children[i];
        if (!child.isPaintRoot()) stack.push(child);
      }
    } else {
      paintInlines(box, b);
    }
  }
}

function collectLayeredDescendents(
  box: BlockContainer | Inline,
  paragraph: Paragraph | undefined
) {
  const stack: (InlineLevel | {sentinel: true})[] = box.children.slice().reverse();
  const parents: InlineLevel[] = [];
  const negativeRoots: [BlockContainer | Inline, Paragraph | undefined][] = []
  const floats: [BlockContainer, undefined][] = [];
  const positionedBoxes: [BlockContainer | Inline, Paragraph | undefined][] = [];
  const positiveRoots: [BlockContainer | Inline, Paragraph | undefined][] = []

  while (stack.length) {
    const box = stack.pop()!;

    if ('sentinel' in box) {
      parents.pop();
    } else if (box.isBox()) {
      if (box.isPositioned()) {
        let nearestParagraph = paragraph;

        if (box.isInline()) {
          for (let i = parents.length - 1; i >= 0; i--) {
            const parent = parents[i];
            if (parent.isIfcInline()) {
              nearestParagraph = parent.paragraph;
              break;
            }
          }
        }

        if (box.isStackingContextRoot()) {
          const zIndex = box.style.zIndex as number;
          if (zIndex < 0) {
            negativeRoots.push([box, nearestParagraph]);
          } else if (zIndex > 0) {
            positiveRoots.push([box, nearestParagraph]);
          } else {
            positionedBoxes.push([box, nearestParagraph]);
          }
        } else {
          positionedBoxes.push([box, nearestParagraph]);
        }
      } else if (box.isBlockContainer() && box.isFloat()) {
        floats.push([box, undefined]);
      }

      if (!box.isStackingContextRoot()) {
        stack.push({sentinel: true});
        parents.push(box);
        for (let i = box.children.length - 1; i >= 0; i--) {
          stack.push(box.children[i]);
        }
      }
    }
  }

  negativeRoots.sort(([a], [b]) => (a.style.zIndex as number) - (b.style.zIndex as number));
  positiveRoots.sort(([a], [b]) => (a.style.zIndex as number) - (b.style.zIndex as number));

  return {negativeRoots, floats, positionedBoxes, positiveRoots};
}

function paintLayeredDescendents(
  descendents: [BlockContainer | Inline, Paragraph | undefined][],
  b: PaintBackend
) {
  for (const [box, paragraph] of descendents) {
    if (box.isInline()) {
      paintInlineRoot(box, paragraph!, b);
    } else {
      paintBlockRoot(box, b);
    }
  }
}

function paintInline(inline: Inline, paragraph: Paragraph, b: PaintBackend) {
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
          if (item.inlines[i].isPositioned()) {
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
        paintRanges();
        paintBlockRoot(box, b);
      }
    }
  }

  paintRanges();
}

function paintInlineRoot(inline: Inline, paragraph: Paragraph, b: PaintBackend) {
  const {
    negativeRoots,
    floats,
    positionedBoxes,
    positiveRoots
  } = collectLayeredDescendents(inline, paragraph);

  if (inline.isStackingContextRoot()) {
    paintLayeredDescendents(negativeRoots, b);
  }
  paintBackgroundDescendents(inline, b);
  paintLayeredDescendents(floats, b);
  const backgrounds = paragraph.backgroundBoxes.get(inline);
  if (backgrounds) {
    for (const background of backgrounds) {
      paintInlineBackground(background, inline, paragraph, b);
    }
  }
  paintInline(inline, paragraph, b);
  if (inline.isStackingContextRoot()) {
    paintLayeredDescendents(positionedBoxes, b);
    paintLayeredDescendents(positiveRoots, b);
  }
}

/**
 * Paint a stacking context root
 * https://www.w3.org/TR/CSS22/zindex.html
 */
export default function paintBlockRoot(
  block: BlockContainer,
  b: PaintBackend,
  isRoot = false
) {
  const {
    negativeRoots,
    floats,
    positionedBoxes,
    positiveRoots
  } = collectLayeredDescendents(block, undefined);

  if (isRoot && block.style.backgroundColor.a > 0) {
    const area = block.containingBlock;
    b.fillColor = block.style.backgroundColor;
    b.rect(area.x, area.y, area.width, area.height);
  }

  paintBlockBackground(block, b, isRoot);
  if (isRoot || block.isStackingContextRoot()) {
    paintLayeredDescendents(negativeRoots, b);
  }
  paintBackgroundDescendents(block, b);
  paintLayeredDescendents(floats, b);
  paintInlinesAndDescendents(block, b);
  if (isRoot || block.isStackingContextRoot()) {
    paintLayeredDescendents(positionedBoxes, b);
    paintLayeredDescendents(positiveRoots, b);
  }
}

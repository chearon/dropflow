import {BlockContainer, createInlineIterator} from './flow.js';
import {ShapedItem, G_CL, G_AX, G_SZ} from './text.js';
import {Color} from './cascade.js';

import type {FaceMatch} from './font.js';

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
  blockContainer: BlockContainer,
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
  let tx = blockContainer.contentArea.x + item.x;

  while (i !== end) {
    const [color, offset] = colors[i];
    const colorStart = offset;
    const colorEnd = i + 1 < colors.length ? colors[i + 1][1] : textEnd;
    const start = Math.max(colorStart, textStart);
    const end = Math.min(colorEnd, textEnd);
    // TODO: should really have isStartColorBoundary, isEndColorBoundary
    const isColorBoundary = start !== textStart && start === colorStart || end !== textEnd && end === colorEnd;
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
    b.text(tx, blockContainer.contentArea.y + item.y, item, start, end, isColorBoundary);

    tx += ax / item.match.face.upem * style.fontSize;

    if (item.attrs.level & 1) {
      i -= 1;
    } else {
      i += 1;
    }
  }
}

function paintBlockContainerOfInline(blockContainer: BlockContainer, b: PaintBackend) {
  if (!blockContainer.isBlockContainerOfInlines()) throw new Error('Assertion failed');

  const [ifc] = blockContainer.children;
  const direction = ifc.style.direction;
  const colors = ifc.paragraph.getColors();

  if (ifc.hasFloats()) {
    const iterator = createInlineIterator(ifc);
    for (let item = iterator.next(); !item.done; item = iterator.next()) {
      if (item.value.state === 'float') paintBlockContainer(item.value.item, b);
    }
  }

  for (const [inline, list] of ifc.paragraph.backgroundBoxes) {
    const bgc = inline.style.backgroundColor;
    const clip = inline.style.backgroundClip;
    const {borderTopColor, borderRightColor, borderBottomColor, borderLeftColor} = inline.style;
    const {a: ta} = borderTopColor;
    const {a: ra} = borderRightColor;
    const {a: ba} = borderBottomColor;
    const {a: la} = borderLeftColor;

    for (const {start, end, blockOffset, ascender, descender, naturalStart, naturalEnd} of list) {
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
        const x = blockContainer.contentArea.x + Math.min(start, end);
        const y = blockContainer.contentArea.y + blockOffset - ascender - extraTop;
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

        const left = blockContainer.contentArea.x + Math.min(start, end) - extraLeft;
        const top = blockContainer.contentArea.y + blockOffset - ascender - paddingTop - borderTopWidth;
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
  }

  for (const linebox of ifc.paragraph.lineboxes) {
    for (let n = linebox.head; n; n = n.next) {
      if (n.value instanceof ShapedItem) {
        drawText(blockContainer, n.value, colors, b);
      } else if (n.value.block) {
        paintBlockContainer(n.value.block, b);
      }
    }
  }
}

export default function paintBlockContainer(blockContainer: BlockContainer, b: PaintBackend) {
  const style = blockContainer.style;
  const {backgroundColor, backgroundClip} = style;
  const {paddingArea, borderArea, contentArea} = blockContainer;
  const area = backgroundClip === 'border-box' ? borderArea :
    backgroundClip === 'padding-box' ? paddingArea :
    contentArea;

  b.fillColor = backgroundColor;
  b.rect(area.x, area.y, area.width, area.height);

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

  if (blockContainer.isBlockContainerOfInlines()) {
    paintBlockContainerOfInline(blockContainer, b);
  }

  for (const child of blockContainer.children) {
    if (child.isBlockContainer()) {
      paintBlockContainer(child, b);
    }
  }
}



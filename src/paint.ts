import {BlockContainer, IfcInline, Inline, createInlineIterator} from './flow.js';
import {ShapedItem, baselineStep, G_CL, G_AX, G_SZ} from './text.js';
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

function drawTextAt(item: ShapedItem, colors: [Color, number][], x: number, y: number, b: PaintBackend) {
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
  let tx = x;

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
    b.text(tx, y, item, start, end, isColorBoundary);

    tx += ax / item.match.face.upem * style.fontSize;

    if (item.attrs.level & 1) {
      i -= 1;
    } else {
      i += 1;
    }
  }
}

function inlineMarginAdvance(state: IfcPaintState, inline: Inline, side: 'start' | 'end') {
  const direction = state.ifc.style.direction;
  const style = inline.style;
  let margin
    = (direction === 'ltr' ? side === 'start' : side === 'end')
    ? style.getMarginLineLeft(state.ifc)
    : style.getMarginLineRight(state.ifc);

  if (margin === 'auto') margin = 0;

  if (side === 'start') {
    state.bgcursor += direction === 'ltr' ? margin : -margin;
  }

  state.left += direction === 'ltr' ? margin : -margin;
}

function inlineBorderAdvance(state: IfcPaintState, inline: Inline, side: 'start' | 'end') {
  const direction = state.ifc.style.direction;
  const style = inline.style;
  const borderWidth
    = (direction === 'ltr' ? side === 'start' : side === 'end')
    ? style.borderLeftWidth
    : style.borderRightWidth;

  if (side === 'start' && style.backgroundClip !== 'border-box') {
    state.bgcursor += direction === 'ltr' ? borderWidth : -borderWidth;
  }

  if (side === 'end' && style.backgroundClip === 'border-box') {
    state.bgcursor += direction === 'ltr' ? borderWidth : -borderWidth;
  }

  state.left += direction === 'ltr' ? borderWidth : -borderWidth;
}

function inlinePaddingAdvance(state: IfcPaintState, inline: Inline, side: 'start' | 'end') {
  const direction = state.ifc.style.direction;
  const style = inline.style;
  const padding
    = (direction === 'ltr' ? side === 'start' : side === 'end')
    ? style.getPaddingLineLeft(state.ifc)
    : style.getPaddingLineRight(state.ifc);

  if (side === 'start' && style.backgroundClip === 'content-box') {
    state.bgcursor += direction === 'ltr' ? padding : -padding;
  }

  if (side === 'end' && style.backgroundClip !== 'content-box') {
    state.bgcursor += direction === 'ltr' ? padding : -padding;
  }

  state.left += direction === 'ltr' ? padding : -padding;
}

function inlineSideAdvance(state: IfcPaintState, inline: Inline, side: 'start' | 'end') {
  if (side === 'start') {
    inlineMarginAdvance(state, inline, side);
    inlineBorderAdvance(state, inline, side);
    inlinePaddingAdvance(state, inline, side);
  } else {
    inlinePaddingAdvance(state, inline, side);
    inlineBorderAdvance(state, inline, side);
    inlineMarginAdvance(state, inline, side);
  }
}

function inlineBackgroundAdvance(state: IfcPaintState, item: ShapedItem, mark: number, side: 'start' | 'end') {
  const direction = state.ifc.style.direction;

  if (mark > item.offset && mark < item.end()) {
    if (direction === 'ltr' && side === 'start' || direction === 'rtl' && side === 'end') {
      const direction = item.attrs.level & 1 ? -1 : 1;
      state.bgcursor += item instanceof ShapedItem ? item.measure(mark, direction).advance : 0;
    }

    if (direction === 'rtl' && side === 'start' || direction == 'ltr' && side === 'end') {
      const direction = item.attrs.level & 1 ? 1 : -1;
      state.bgcursor -= item instanceof ShapedItem ? item.measure(mark, direction).advance : 0;
    }
  }
}

function paintText(state: IfcPaintState, item: ShapedItem, b: PaintBackend) {
  const direction = state.ifc.style.direction;
  const w = item.measure().advance;
  const atLeft = direction === 'ltr' ? state.left : state.left - w;
  const atTop = state.top;
  const colors = state.colors;

  state.left = direction === 'ltr' ? state.left + w : state.left - w;
  state.bgcursor = state.left;

  return () => drawTextAt(item, colors, atLeft, atTop, b);
}

type BackgroundBox = {
  start: number,
  end: number,
  baselineShift: number,
  ascender: number,
  descender: number,
  naturalStart: boolean,
  naturalEnd: boolean
};

class ContiguousBoxBuilder {
  opened: Map<Inline, BackgroundBox>;
  closed: Map<Inline, BackgroundBox[]>;

  constructor() {
    this.opened = new Map();
    this.closed = new Map();
  }

  open(inline: Inline, naturalStart: boolean, start: number, baselineShift: number) {
    const box = this.opened.get(inline);
    if (box) {
      box.end = start;
    } else {
      const end = start;
      const naturalEnd = false;
      const {ascender, descender} = inline.metrics;
      const box: BackgroundBox = {start, end, baselineShift, ascender, descender, naturalStart, naturalEnd};
      this.opened.set(inline, box);
      // Make sure closed is in open order
      if (!this.closed.has(inline)) this.closed.set(inline, []);
    }
  }

  close(inline: Inline, naturalEnd: boolean, end: number) {
    const box = this.opened.get(inline);
    if (box) {
      const list = this.closed.get(inline);
      box.end = end;
      box.naturalEnd = naturalEnd;
      this.opened.delete(inline);
      list ? list.push(box) : this.closed.set(inline, [box]);
    }
  }

  closeAll(except: Inline[], end: number) {
    for (const inline of this.opened.keys()) {
      if (!except.includes(inline)) this.close(inline, false, end);
    }
  }
}

type IfcPaintState = {
  ifc: IfcInline,
  colors: [Color, number][];
  left: number,
  top: number,
  bgcursor: number
};

function paintBlockContainerOfInline(blockContainer: BlockContainer, b: PaintBackend) {
  if (!blockContainer.isBlockContainerOfInlines()) throw new Error('Assertion failed');

  const [ifc] = blockContainer.children;
  const direction = ifc.style.direction;
  const counts: Map<Inline, number> = new Map();
  const colors = ifc.paragraph.getColors();
  const state: IfcPaintState = {ifc, colors, left: 0, top: 0, bgcursor: 0};
  const contentBlockOffset = blockContainer.contentArea.y;

  if (ifc.hasFloats()) {
    const iterator = createInlineIterator(ifc);
    for (let item = iterator.next(); !item.done; item = iterator.next()) {
      if (item.value.state === 'float') paintBlockContainer(item.value.item, b);
    }
  }

  for (const linebox of ifc.paragraph.lineboxes) {
    const boxBuilder = new ContiguousBoxBuilder();
    const firstItem = direction === 'ltr' ? linebox.head : linebox.tail;

    if (direction === 'ltr') {
      state.left = blockContainer.contentArea.x + linebox.inlineOffset;
    } else {
      state.left = blockContainer.contentArea.x + blockContainer.contentArea.width - linebox.inlineOffset;
    }

    state.top = contentBlockOffset + linebox.blockOffset + linebox.ascender;

    const textQueue = [];

    for (let n = firstItem; n; n = direction === 'ltr' ? n.next : n.previous) {
      const item = n.value;
      let baselineShift = 0;

      boxBuilder.closeAll(item.inlines, state.left);

      for (let i = 0; i < item.inlines.length; ++i) {
        const inline = item.inlines[i];
        const count = counts.get(inline);
        const isFirstOccurance = count === undefined;
        const isOrthogonal = (item.attrs.level & 1 ? 'rtl' : 'ltr') !== direction;
        const mark = isOrthogonal ? inline.end : inline.start;
        const alignmentContext = linebox.contextRoots.get(inline);

        state.bgcursor = state.left;

        if (alignmentContext) baselineShift = alignmentContext.baselineShift;

        baselineShift += baselineStep(item.inlines[i - 1] || ifc, inline);

        if (item instanceof ShapedItem) {
          inlineBackgroundAdvance(state, item, mark, 'start');
        }

        if (isFirstOccurance) inlineSideAdvance(state, inline, 'start');
        boxBuilder.open(inline, isFirstOccurance, state.bgcursor, baselineShift);

        if (isFirstOccurance) {
          counts.set(inline, 1);
        } else {
          counts.set(inline, count! + 1);
        }
      }

      state.top -= baselineShift;

      if (item instanceof ShapedItem) textQueue.push(paintText(state, item, b));

      for (let i = item.inlines.length - 1; i >= 0; --i) {
        const inline = item.inlines[i];
        const count = counts.get(inline)!;
        const isLastOccurance = count === inline.nshaped;
        const isOrthogonal = (item.attrs.level & 1 ? 'rtl' : 'ltr') !== direction;
        const mark = isOrthogonal ? inline.start : inline.end;

        state.bgcursor = state.left;

        if (item instanceof ShapedItem) {
          inlineBackgroundAdvance(state, item, mark, 'end');
        }

        if (isLastOccurance) inlineSideAdvance(state, inline, 'end');

        if (isLastOccurance || isOrthogonal && (mark > item.offset && mark < item.end())) {
          boxBuilder.close(inline, isLastOccurance, state.bgcursor);
        }
      }

      state.top += baselineShift;
    }

    boxBuilder.closeAll([], state.left);

    for (const [inline, list] of boxBuilder.closed) {
      const bgc = inline.style.backgroundColor;
      const clip = inline.style.backgroundClip;
      const {borderTopColor, borderRightColor, borderBottomColor, borderLeftColor} = inline.style;
      const {a: ta} = borderTopColor;
      const {a: ra} = borderRightColor;
      const {a: ba} = borderBottomColor;
      const {a: la} = borderLeftColor;

      for (const {start, end, baselineShift, ascender, descender, naturalStart, naturalEnd} of list) {
        const paddingTop = inline.style.getPaddingBlockStart(state.ifc);
        const paddingRight = inline.style.getPaddingLineRight(state.ifc);
        const paddingBottom = inline.style.getPaddingBlockEnd(state.ifc);
        const paddingLeft = inline.style.getPaddingLineLeft(state.ifc);
        const paintLeft = naturalStart && direction === 'ltr' || naturalEnd && direction === 'rtl';
        const paintRight = naturalEnd && direction === 'ltr' || naturalStart && direction === 'rtl';
        const borderTopWidth = inline.style.getBorderBlockStartWidth(state.ifc);
        let borderRightWidth = inline.style.getBorderLineRightWidth(state.ifc);
        const borderBottomWidth = inline.style.getBorderBlockEndWidth(state.ifc);
        let borderLeftWidth = inline.style.getBorderLineLeftWidth(state.ifc);

        if (!paintLeft) borderLeftWidth = 0;
        if (!paintRight) borderRightWidth = 0;

        if (start !== end && bgc.a > 0) {
          let extraTop = 0;
          let extraBottom = 0;

          if (clip !== 'content-box') {
            extraTop += inline.style.getPaddingBlockStart(state.ifc);
            extraBottom += inline.style.getPaddingBlockEnd(state.ifc);
          }

          if (clip === 'border-box') {
            extraTop += borderTopWidth;
            extraBottom += borderBottomWidth;
          }

          b.fillColor = bgc;
          const x = Math.min(start, end);
          const y = state.top - baselineShift - ascender - extraTop;
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

          const left = Math.min(start, end) - extraLeft;
          const top = state.top - baselineShift - ascender - paddingTop - borderTopWidth;
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

    for (const cb of textQueue) cb();

    state.top += linebox.descender;
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



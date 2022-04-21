import {Color} from '../../cascade';
import {BlockContainer, IfcInline, Inline} from '../../flow';
import {ShapedItem, getAscenderDescender} from '../../text';
import {Area} from '../../box';
import {Harfbuzz} from 'harfbuzzjs';
import {encode} from 'entities';

type StringMap = {[s: string]: string};

function camelToKebab(camel: string) {
  return camel.replace(/[A-Z]/g, s => '-' + s.toLowerCase());
}

function drawDiv(style: StringMap, attrs: StringMap, text: string = '') {
  const styleString = Object.entries(style).map(([prop, value]) => {
    return `${camelToKebab(prop)}: ${value}`;
  }).join('; ');

  const attrString = Object.entries(attrs).map(([name, value]) => {
    return `${name}="${value}"`; // TODO html entities
  }).join(' ');

  return `<div style="${styleString};" ${attrString}>${text}</div>`;
}

function drawTextAt(item: ShapedItem, x: number, y: number, depth: number, hb: Harfbuzz) {
  const match = item.match;
  const style = item.attrs.style;
  const hbFont = hb.createFont(item.face);
  const {ascender, descender} = getAscenderDescender(style, hbFont, item.face.upem);
  let spans = '';
  let glyphStart = 0;
  let glyphEnd = item.glyphs.length - 1;

  while (glyphStart < item.glyphs.length && item.glyphs[glyphStart].ax === 0) glyphStart += 1;
  while (glyphEnd >= 0 && item.glyphs[glyphEnd].ax === 0) glyphEnd -= 1;

  const glyphs = item.glyphs.slice(glyphStart, glyphEnd + 1);
  const textStart = glyphs.length ? Math.min(glyphs[0].cl, glyphs[glyphs.length - 1].cl) : 0;
  const textEnd = glyphs.length ? Math.max(glyphs[0].cl, glyphs[glyphs.length - 1].cl) + 1 : 1;

  hbFont.destroy();

  // Split the colors into spans so that colored diacritics can work.
  // Sadly this seems to only work in Firefox and only when the font doesn't do
  // any normalizination, so I could probably stop trying to support it
  // https://github.com/w3c/csswg-drafts/issues/699
  for (let i = 0; i < item.colors.length; ++i) {
    const [color, offset] = item.colors[i];
    const colorStart = offset;
    const colorEnd = i + 1 < item.colors.length ? item.colors[i + 1][1] : textEnd;

    if (colorEnd > textStart && colorStart < textEnd) {
      const start = Math.max(colorStart, textStart);
      const end = Math.min(colorEnd, textEnd);
      const text = encode(item.text.slice(start, end));

      spans += `<span style="color: rgba(${color.r}, ${color.g}, ${color.b}, ${color.a})">${text}</span>`;
    }
  }

  return drawDiv({
    position: 'absolute',
    left: '0',
    top: '0',
    transform: `translate(${x}px, ${y - (ascender - (ascender + descender)/2)}px)`,
    font: `${match.slant} ${match.weight} ${match.width} ${style.fontSize}px/0 ${match.family}`,
    zIndex: String(depth),
    whiteSpace: 'pre',
    direction: item.attrs.level % 2 ? 'rtl' : 'ltr',
    unicodeBidi: 'bidi-override'
  }, {}, spans);
}

function drawColoredBoxDiv(area: Area, color: Color, depth: number) {
  const {id, x, y, width, height} = area;
  const {r, g, b, a} = color;

  return drawDiv({
    position: 'absolute',
    left: x + 'px',
    top: y + 'px',
    width: width + 'px',
    height: height + 'px',
    backgroundColor: `rgba(${r}, ${g}, ${b}, ${a})`,
    zIndex: String(depth)
  }, {title: `area id: ${id}`});
}

function inlineMarginAdvance(state: IfcPaintState, inline: Inline, side: 'start' | 'end') {
  const direction = state.ifc.style.direction;
  const style = inline.style;
  let margin
    = (direction === 'ltr' ? side === 'start' : side === 'end')
    ? style.marginLeft
    : style.marginRight;

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
    ? style.paddingLeft
    : style.paddingRight;

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
      const mmark = item.attrs.level % 2 ? mark - item.end() : mark - item.offset;
      state.bgcursor += item instanceof ShapedItem ? item.measure(mmark) : 0;
    }

    if (direction === 'rtl' && side === 'start' || direction == 'ltr' && side === 'end') {
      const mmark = item.attrs.level % 2 ? mark - item.offset : mark - item.end();
      state.bgcursor -= item instanceof ShapedItem ? item.measure(mmark) : 0;
    }
  }
}

function paintText(state: IfcPaintState, item: ShapedItem, hb: Harfbuzz) {
  const direction = state.ifc.style.direction;
  const w = item.measure();
  const atLeft = direction === 'ltr' ? state.left : state.left - w;
  const s = drawTextAt(item, atLeft, state.top, state.depth, hb);

  state.left = direction === 'ltr' ? state.left + w : state.left - w;
  state.bgcursor = state.left;

  return s;
}

type BackgroundBox = {
  start: number,
  end: number,
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

  open(inline: Inline, naturalStart: boolean, start: number, hb: Harfbuzz) {
    const box = this.opened.get(inline);
    if (!inline.face) throw new Error(`Inline ${inline.id} never got an HbFace`);
    if (box) {
      box.end = start;
    } else {
      const font = hb.createFont(inline.face);
      const extents = font.getExtents("ltr"); // TODO
      const ascender = extents.ascender / inline.face.upem * inline.style.fontSize;
      const descender = -extents.descender / inline.face.upem * inline.style.fontSize;
      const end = start;
      const naturalEnd = false;
      const box:BackgroundBox = {start, end, ascender, descender, naturalStart, naturalEnd};
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
  left: number,
  top: number,
  bgcursor: number,
  depth: number
};

function paintBlockContainerOfInline(blockContainer: BlockContainer, depth: number, hb: Harfbuzz) {
  if (blockContainer.contentArea.width === undefined) throw new Error('Assertion failed');

  if (!blockContainer.isBlockContainerOfInlines()) throw new Error('Assertion failed');

  const [ifc] = blockContainer.children;
  const direction = ifc.style.direction;
  const counts:Map<Inline, number> = new Map();
  const state:IfcPaintState = {ifc, left: 0, top: blockContainer.contentArea.y, bgcursor: 0, depth};
  let ret = '';

  for (const linebox of ifc.lineboxes) {
    const boxBuilder = new ContiguousBoxBuilder();
    const firstItem = direction === 'ltr' ? linebox.head : linebox.tail;
    let renderedText = '';

    if (direction === 'ltr') {
      state.left = blockContainer.contentArea.x + linebox.inlineStart;
    } else {
      state.left = blockContainer.contentArea.x + blockContainer.contentArea.width - linebox.inlineStart;
    }

    state.top += linebox.ascender;

    for (let n = firstItem; n; n = direction === 'ltr' ? n.next : n.previous) {
      const item = n.value;

      boxBuilder.closeAll(item.inlines, state.left);

      for (let i = 0; i < item.inlines.length; ++i) {
        const inline = item.inlines[i];
        const count = counts.get(inline);
        const isFirstOccurance = count === undefined;
        const isOrthogonal = (item.attrs.level % 2 ? 'rtl' : 'ltr') !== direction;
        const mark = isOrthogonal ? inline.end : inline.start;

        state.bgcursor = state.left;

        if (item instanceof ShapedItem) {
          inlineBackgroundAdvance(state, item, mark, 'start');
        }

        if (isFirstOccurance) inlineSideAdvance(state, inline, 'start');
        boxBuilder.open(inline, isFirstOccurance, state.bgcursor, hb);

        if (isFirstOccurance) {
          counts.set(inline, 1);
        } else {
          counts.set(inline, count! + 1);
        }
      }

      if (item instanceof ShapedItem) {
        renderedText += paintText(state, item, hb);
      }

      for (let i = item.inlines.length - 1; i >= 0; --i) {
        const inline = item.inlines[i];
        const count = counts.get(inline)!;
        const isLastOccurance = count === inline.nshaped;
        const isOrthogonal = (item.attrs.level % 2 ? 'rtl' : 'ltr') !== direction;
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
    }

    boxBuilder.closeAll([], state.left);

    for (const [inline, list] of boxBuilder.closed) {
      const bgc = inline.style.backgroundColor;
      const clip = inline.style.backgroundClip;
      const {borderTopColor, borderRightColor, borderBottomColor, borderLeftColor} = inline.style;
      const {r: tr, g: tg, b: tb, a: ta} = borderTopColor;
      const {r: rr, g: rg, b: rb, a: ra} = borderRightColor;
      const {r: br, g: bg, b: bb, a: ba} = borderBottomColor;
      const {r: lr, g: lg, b: lb, a: la} = borderLeftColor;

      for (const {start, end, ascender, descender, naturalStart, naturalEnd} of list) {
        const {paddingTop, paddingRight, paddingBottom, paddingLeft} = inline.style;
        const paintLeft = naturalStart && direction === 'ltr' || naturalEnd && direction === 'rtl';
        const paintRight = naturalEnd && direction === 'ltr' || naturalStart && direction === 'rtl';
        let {borderTopWidth, borderRightWidth, borderBottomWidth, borderLeftWidth} = inline.style;
        let borderLeft = '';
        let borderRight = '';

        if (paintLeft) {
          borderLeft = `${borderLeftWidth}px solid rgba(${lr}, ${lg}, ${lb}, ${la})`;
        } else {
          borderLeftWidth = 0;
        }

        if (paintRight) {
          borderRight = `${borderRightWidth}px solid rgba(${rr}, ${rg}, ${rb}, ${ra})`;
        } else {
          borderRightWidth = 0;
        }

        if (start !== end && bgc.a > 0) {
          let extraTop = 0;
          let extraBottom = 0;

          if (clip !== 'content-box') {
            extraTop += inline.style.paddingTop;
            extraBottom += inline.style.paddingBottom;
          }

          if (clip === 'border-box') {
            extraTop += borderTopWidth;
            extraBottom += borderBottomWidth;
          }

          ret += drawDiv({
            position: 'absolute',
            left: Math.min(start, end) + 'px',
            top: state.top - ascender - extraTop + 'px',
            width: Math.abs(start - end) + 'px',
            height: ascender + descender + extraTop + extraBottom + 'px',
            backgroundColor: `rgba(${bgc.r}, ${bgc.g}, ${bgc.b}, ${bgc.a})`,
            zIndex: String(depth),
          }, {title: 'bg for inline ' + inline.id});
        }

        if (start !== end && (ta > 0 || ra > 0 || ba > 0 || la > 0)) {
          const borderTop = `${borderTopWidth}px solid rgba(${tr}, ${tg}, ${tb}, ${ta})`;
          const borderBottom = `${borderBottomWidth}px solid rgba(${br}, ${bg}, ${bb}, ${ba})`;
          let extraLeft = 0;
          let extraRight = 0;

          if (paintLeft && clip === 'content-box') extraLeft += paddingLeft
          if (paintLeft && clip !== 'border-box') extraLeft += borderLeftWidth;
          if (paintRight && clip === 'content-box') extraRight += paddingRight;
          if (paintRight && clip !== 'border-box') extraRight += borderRightWidth;

          ret += drawDiv({
            position: 'absolute',
            left: Math.min(start, end) - extraLeft + 'px',
            top: state.top - ascender - paddingTop - borderTopWidth + 'px',
            width: Math.abs(start - end) + extraLeft + extraRight + 'px',
            height: paddingTop + ascender + descender + paddingBottom + 'px',
            zIndex: String(depth),
            borderTop,
            borderRight,
            borderBottom,
            borderLeft,
          }, {title: 'borders for inline ' + inline.id});
        }
      }
    }

    ret += renderedText;

    state.top += linebox.descender;
  }

  return ret;
}

function paintBlockContainer(blockContainer: BlockContainer, hb: Harfbuzz, depth = 0) {
  const style = blockContainer.style;
  const {backgroundColor, backgroundClip} = style;
  const {paddingArea, borderArea, contentArea} = blockContainer;
  let s = backgroundClip === 'border-box' ? drawColoredBoxDiv(borderArea, backgroundColor, depth) :
    backgroundClip === 'padding-box' ? drawColoredBoxDiv(paddingArea, backgroundColor, depth) :
    backgroundClip === 'content-box' ? drawColoredBoxDiv(contentArea, backgroundColor, depth) :
    '';

  // now paint borders TODO border styles that aren't solid, border-radius
  for (const side of ['Top', 'Right', 'Bottom', 'Left']) {
    // @ts-ignore
    const sideWidth = style[`border${side}Width`];
    if (sideWidth > 0) {
      // @ts-ignore
      const borderColor = style[`border${side}Color`];
      const height = side === 'Top' || side === 'Bottom' ? sideWidth : borderArea.height;
      const width = side === 'Left' || side === 'Right' ? sideWidth : borderArea.width;

      if (paddingArea.width === undefined || paddingArea.height === undefined) {
        throw new Error('cannot paint padding area, indeterminate size');
      }

      const x = side == 'Right' ? paddingArea.x + paddingArea.width : borderArea.x;
      const y = side === 'Bottom' ? paddingArea.y + paddingArea.height : borderArea.y;
      const a = new Area('', style, x, y, width, height);

      s += drawColoredBoxDiv(a, borderColor, depth);
    }
  }

  if (blockContainer.isBlockContainerOfInlines()) {
    s += paintBlockContainerOfInline(blockContainer, depth, hb);
  }

  for (const child of blockContainer.children) {
    if (child.isBlockContainer()) {
      s += paintBlockContainer(child, hb, depth + 1);
    }
  }

  return s;
}

export function paint(blockContainer: BlockContainer, hb: Harfbuzz) {
  return paintBlockContainer(blockContainer, hb);
}

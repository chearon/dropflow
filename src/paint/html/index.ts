import {Color} from '../../cascade';
import {BlockContainer, BlockContainerOfIfc, Inline, getAscenderDescender} from '../../flow';
import {ShapedItem} from '../../text';
import {Area} from '../../box';
import {Harfbuzz} from 'harfbuzzjs';

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

function drawTextAt(item: ShapedItem, x: number, y: number, level: number, hb: Harfbuzz) {
  const style = item.attrs.style;
  const hbFont = hb.createFont(item.face);
  const {ascender, descender} = getAscenderDescender(item.attrs.style, hbFont, item.face.upem);
  let s = 0;
  let e = item.glyphs.length - 1;

  while (s < item.glyphs.length && item.glyphs[s].ax === 0) s += 1;
  while (e >= 0 && item.glyphs[e].ax === 0) e -= 1;

  const glyphs = item.glyphs.slice(s, e + 1);
  const mi = glyphs.length ? Math.min(glyphs[0].cl, glyphs[glyphs.length - 1].cl) : 0;
  const mx = glyphs.length ? Math.max(glyphs[0].cl, glyphs[glyphs.length - 1].cl) : 0;
  const text = item.text.slice(mi, mx + 1).replace(/&/g, '&amp');

  hbFont.destroy();

  return drawDiv({
    position: 'absolute',
    left: '0',
    top: '0',
    transform: `translate(${x}px, ${y - (ascender - (ascender + descender)/2)}px)`,
    font: `${style.fontStyle} ${style.fontWeight} ${style.fontSize}px/0 ${style.fontFamily.join(',')}`,
    zIndex: String(level),
    whiteSpace: 'pre',
    direction: item.attrs.level % 2 ? 'rtl' : 'ltr'
  }, {}, text);
}

function drawColoredBoxDiv(area: Area, color: Color, level: number) {
  const {id, x, y, width, height} = area;
  const {r, g, b, a} = color;

  return drawDiv({
    position: 'absolute',
    left: x + 'px',
    top: y + 'px',
    width: width + 'px',
    height: height + 'px',
    backgroundColor: `rgba(${r}, ${g}, ${b}, ${a})`,
    zIndex: String(level)
  }, {title: `area id: ${id}`});
}

function paintBlockContainerOfInline(blockContainer: BlockContainerOfIfc, level: number, hb: Harfbuzz) {
  const [ifc] = blockContainer.children;
  const direction = ifc.style.direction;
  const counts:Map<Inline, number> = new Map();
  let top = blockContainer.contentArea.y;
  let s = '';

  if (blockContainer.contentArea.width === undefined) throw new Error('Assertion failed');

  for (const linebox of ifc.lineboxes) {
    const firstItem = direction === 'ltr' ? linebox.head : linebox.tail;
    let left = blockContainer.contentArea.x;

    if (direction === 'rtl') left += linebox.width;

    top += linebox.ascender;

    for (let n = firstItem; n; n = direction === 'ltr' ? n.next : n.previous) {
      const item = n.value;

      for (let i = 0; i < item.inlines.length; ++i) {
        const inline = item.inlines[i];
        const count = counts.get(inline);

        if (count === undefined) {
          if (direction === 'ltr') {
            left += inline.leftMarginBorderPadding;
          } else {
            left -= inline.rightMarginBorderPadding;
          }

          counts.set(inline, 1);
        } else {
          counts.set(inline, count + 1);
        }
      }

      if (item instanceof ShapedItem) {
        const w = item.glyphs.reduce((s, g) => s + g.ax, 0) / item.face.upem * item.attrs.style.fontSize;
        const atLeft = direction === 'ltr' ? left : left - w;
        s += drawTextAt(item, atLeft, top, level, hb);
        left = direction === 'ltr' ? left + w : left - w;
      }

      for (let i = item.inlines.length - 1; i >= 0; --i) {
        const inline = item.inlines[i];
        const count = counts.get(inline);

        if (count === inline.nshaped) {
          if (direction === 'ltr') {
            left += inline.rightMarginBorderPadding;
          } else {
            left -= inline.leftMarginBorderPadding;
          }
        }
      }
    }

    top += linebox.descender;
  }

  return s;
}

function paintBlockContainer(blockContainer: BlockContainer, hb: Harfbuzz, level = 0) {
  const style = blockContainer.style;
  const {backgroundColor, backgroundClip} = style;
  const {paddingArea, borderArea, contentArea} = blockContainer;
  let s = backgroundClip === 'border-box' ? drawColoredBoxDiv(borderArea, backgroundColor, level) :
    backgroundClip === 'padding-box' ? drawColoredBoxDiv(paddingArea, backgroundColor, level) :
    backgroundClip === 'content-box' ? drawColoredBoxDiv(contentArea, backgroundColor, level) :
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
      const a = new Area('', x, y, width, height);

      s += drawColoredBoxDiv(a, borderColor, level);
    }
  }

  if (blockContainer.isBlockContainerOfIfc()) {
    s += paintBlockContainerOfInline(blockContainer, level, hb);
  }

  for (const child of blockContainer.children) {
    if (child.isBlockContainer()) {
      s += paintBlockContainer(child, hb, level + 1);
    }
  }

  return s;
}

export function paint(blockContainer: BlockContainer, hb: Harfbuzz) {
  return paintBlockContainer(blockContainer, hb);
}

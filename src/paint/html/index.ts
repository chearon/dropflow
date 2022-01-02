import {Color} from '../../cascade';
import {BlockContainer, BlockContainerOfIfc, getAscenderDescender} from '../../flow';
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
  const top = y - (ascender - (ascender + descender)/2) + 'px';
  const left = x + 'px';
  const font = `${style.fontStyle} ${style.fontWeight} ${style.fontSize}px/0 ${style.fontFamily.join(',')}`;
  const zIndex = String(level);
  const whiteSpace = 'pre';
  const firstGlyph = item.glyphs.find(g => g.ax > 0);
  const text = item.text.slice(firstGlyph && firstGlyph.cl);
  hbFont.destroy();
  return drawDiv({position: 'absolute', left, top, font, zIndex, whiteSpace}, {}, text);
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
  const [rootInline] = blockContainer.children;
  let top = blockContainer.contentArea.y;
  let s = '';
  for (const linebox of rootInline.lineboxes) {
    let left = blockContainer.contentArea.x;
    top += linebox.ascender;
    for (let n = linebox.head; n; n = n.next) {
      if (typeof n.value === 'number') {
        left += n.value;
      } else {
        s += drawTextAt(n.value, left, top, level, hb);
        left += n.value.glyphs.reduce((s, g) => s + g.ax, 0) / n.value.face.upem * n.value.attrs.style.fontSize;
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

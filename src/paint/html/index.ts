import {Style, Color} from '../../cascade';
import {BlockContainer, BlockContainerOfIfc, Inline, getAscenderDescender} from '../../flow';
import {ShapedItem, getLineContents} from '../../text';
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

function drawTextAt(item: ShapedItem, startOffset: number, endOffset: number, x: number, y: number, level: number, hb: Harfbuzz) {
  const hbFont = hb.createFont(item.face);
  const {ascender, descender} = getAscenderDescender(item.style, hbFont, item.face.upem);
  const top = y - (ascender - (ascender + descender)/2) + 'px';
  const left = x + 'px';
  const font = `${item.style.fontWeight} ${item.style.fontSize}px/0 ${item.style.fontFamily.join(',')}`;
  const zIndex = String(level);
  const whiteSpace = 'pre';
  hbFont.destroy();
  return drawDiv({position: 'absolute', left, top, font, zIndex, whiteSpace}, {}, item.text.slice(startOffset, endOffset));
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
  let left = blockContainer.contentArea.x;
  let top = blockContainer.contentArea.y;
  let s = '';
  for (const linebox of rootInline.lineboxes) {
    left = blockContainer.contentArea.x;
    top += linebox.ascender;
    const range = getLineContents(rootInline.shaped, linebox);
    for (let i = range.startItem; i <= range.endItem; i++) {
      const item = rootInline.shaped[i];
      const startOffset = i === range.startItem ? range.startOffset : 0;
      const endOffset = i === range.endItem ? range.endOffset : item.text.length;
      s += drawTextAt(item, startOffset, endOffset, left, top, level, hb);
      for (const glyph of item.glyphs) {
        if (glyph.cl >= startOffset && glyph.cl < endOffset) {
          left += glyph.ax / item.face.upem * item.style.fontSize;
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

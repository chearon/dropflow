import {Style, Color} from '../../cascade';
import {BlockContainer} from '../../flow';
import {Area} from '../../box';

type StringMap = {[s: string]: string};

function camelToKebab(camel: string) {
  return camel.replace(/[A-Z]/g, s => '-' + s.toLowerCase());
}

function drawDiv(style: StringMap, attrs: StringMap) {
  const styleString = Object.entries(style).map(([prop, value]) => {
    return `${camelToKebab(prop)}: ${value}`;
  }).join('; ');

  const attrString = Object.entries(attrs).map(([name, value]) => {
    return `${name}="${value}"`; // TODO html entities
  }).join(' ');

  return `<div style="${styleString};" ${attrString}></div>`;
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

function paintBlockContainer(blockContainer: BlockContainer, level = 0) {
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

  for (const child of blockContainer.children) {
    if (child.isBlockContainer()) {
      s += paintBlockContainer(child, level + 1);
    }
  }

  return s;
}

export function paint(blockContainer: BlockContainer) {
  return paintBlockContainer(blockContainer);
}

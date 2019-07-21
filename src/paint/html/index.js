function camelToKebab(camel) {
  return camel.replace(/[A-Z]/g, s => '-' + s.toLowerCase());
}

function drawDiv(style) {
  const styleString = Object.entries(style).map(([prop, value]) => {
    return `${camelToKebab(prop)}: ${value}`;
  }).join('; ');

  if (styleString.length) {
    return `<div style="${styleString};"></div>`;
  } else {
    return `<div></div>`;
  }
}

function drawColoredBoxDiv({left, top, width, height}, {r, g, b, a}, level) {
  return drawDiv({
    position: 'absolute',
    left: left + 'px',
    top: top + 'px',
    width: width + 'px',
    height: height + 'px',
    backgroundColor: `rgba(${r}, ${g}, ${b}, ${a})`,
    zIndex: level
  });
}

function paintBlockContainer(blockContainer, level = 0) {
  const style = blockContainer.style;
  const {backgroundColor, backgroundClip} = style;
  const {paddingArea, borderArea, contentArea} = blockContainer;
  let s = backgroundClip === 'border-box' ? drawColoredBoxDiv(borderArea, backgroundColor, level) :
    backgroundClip === 'padding-box' ? drawColoredBoxDiv(paddingArea, backgroundColor, level) :
    backgroundClip === 'content-box' ? drawColoredBoxDiv(contentArea, backgroundColor, level) :
    '';

  // now paint borders TODO border styles that aren't solid, border-radius
  for (const side of ['Top', 'Right', 'Bottom', 'Left']) {
    const sideWidth = style[`border${side}Width`];
    console.log(side, blockContainer.id, sideWidth);
    if (sideWidth > 0) {
      const borderColor = style[`border${side}Color`];
      const height = side === 'Top' || side === 'Bottom' ? sideWidth : borderArea.height;
      const width = side === 'Left' || side === 'Right' ? sideWidth : borderArea.width;
      const left = side == 'Right' ? paddingArea.left + paddingArea.width : borderArea.left;
      const top = side === 'Bottom' ? paddingArea.top + paddingArea.height : borderArea.top;

      s += drawColoredBoxDiv({left, top, width, height}, borderColor, level);
    }
  }

  for (const child of blockContainer.children) {
    if (child.isBlockContainer && !child.isInlineLevel) {
      s += paintBlockContainer(child, level + 1);
    }
  }

  return s;
}

export function paint(blockContainer) {
  return paintBlockContainer(blockContainer);
}

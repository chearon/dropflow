import {HTMLElement} from './src/node';
import {parseNodes} from './src/parser';
import {createComputedStyle, initialStyle, DeclaredPlainStyle} from './src/cascade';
import {generateBlockContainer, layoutBlockBox, BlockFormattingContext, BlockContainer} from './src/flow';
import {paint as paintHtml} from './src/paint/html/index';
import {Area} from './src/box';
import FontConfigInit = require('fontconfig');
import ItemizerInit = require('itemizer');
import HarfbuzzInit = require('harfbuzzjs');

function getRootComputedStyle(style?: DeclaredPlainStyle) {
  return createComputedStyle(initialStyle, {
    ...style,
    display: { // required
      outer: 'block',
      inner: 'flow-root'
    }
  });
}

// ***
// all VERY subject to change. for example, users should be able to specify the
// rootComputedStyle. these functions should probably be methods on a public
// class which stores a reference to the style. also there should be a dead
// simple render(html, [viewportWidth, [viewportHeight]]). also the paint to
// html api is just for development
// ***

let fcfg: FontConfigInit.FontConfig | undefined;
let fcfgPromise: Promise<FontConfigInit.FontConfig> | undefined;

export async function getFontConfigConfig() {
  if (fcfg) return fcfg;
  if (fcfgPromise) return await fcfgPromise;
  return fcfgPromise = FontConfigInit.then(FontConfig => new FontConfig());
}

export async function registerFont(path: string) {
  const cfg = await getFontConfigConfig();
  await cfg.addFont(path);
}

// TODO: remove the style argument. read styles on <html> instead
export function parse(html: string, style?: DeclaredPlainStyle) {
  const computedStyle = getRootComputedStyle(style);
  const rootElement = new HTMLElement('', 'root', computedStyle);
  parseNodes(rootElement, html);
  return rootElement;
}

export function generate(rootElement: HTMLElement) {
  return generateBlockContainer(rootElement);
}

export async function layout(root: BlockContainer, width = 640, height = 480) {
  const [cfg, itemizer, hb] = await Promise.all([getFontConfigConfig(), ItemizerInit, HarfbuzzInit]);
  const initialContainingBlock = new Area('', root.style, 0, 0, width, height);
  root.containingBlock = initialContainingBlock;
  root.setBlockPosition(0);
  const logging = {text: new Set([])};
  await root.preprocess({fcfg: cfg, itemizer, hb, logging});
  layoutBlockBox(root, {
    bfc: new BlockFormattingContext(300),
    lastBlockContainerArea: initialContainingBlock,
    lastPositionedArea: initialContainingBlock,
    logging,
    hb
  });
  root.absolutify();
}

export async function paint(root: BlockContainer) {
  return paintHtml(root, await HarfbuzzInit);
}

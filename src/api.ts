import {HTMLElement, TextNode} from './dom.js';
import {cascadeStyles, createComputedStyle, initialStyle, DeclaredPlainStyle, uaDeclaredStyles, EMPTY_STYLE} from './cascade.js';
import {generateBlockContainer, layoutBlockBox, BlockFormattingContext, BlockContainer} from './flow.js';
import HtmlPaintBackend from './paint-html.js';
import CanvasPaintBackend, {Canvas, CanvasRenderingContext2D} from './paint-canvas.js';
import paintBlockContainer from './paint.js';
import {BoxArea} from './box.js';
import {id} from './util.js';

export type {BlockContainer, DeclaredPlainStyle};

// required styles that always come last in the cascade
const rootDeclaredStyle: DeclaredPlainStyle = {
  display: {
    outer: 'block',
    inner: 'flow-root'
  }
};

export function getRootComputedStyle(style: DeclaredPlainStyle = EMPTY_STYLE) {
  return createComputedStyle(initialStyle, cascadeStyles(style, rootDeclaredStyle))
}

// ***
// all VERY subject to change. for example, users should be able to specify the
// rootComputedStyle. these functions should probably be methods on a public
// class which stores a reference to the style. also there should be a dead
// simple render(html, [viewportWidth, [viewportHeight]]). also the paint to
// html api is just for development
// ***

export {registerFont, unregisterFont} from './font.js';

export function generate(rootElement: HTMLElement) {
  if (rootElement.declaredStyle) {
    throw new Error(
      'To use the hyperscript API, pass the element tree to dom() and use ' +
      'the return value as the argument to generate().'
    );
  }

  return generateBlockContainer(rootElement);
}

// Re-use the root containing block
let initialContainingBlock: BoxArea | undefined;

export function layout(root: BlockContainer, width = 640, height = 480) {
  if (!initialContainingBlock) {
    initialContainingBlock = new BoxArea(root, 0, 0, width, height);
  } else {
    initialContainingBlock.box = root;
    initialContainingBlock.inlineSize = width;
    initialContainingBlock.blockSize = height;
  }

  root.containingBlock = initialContainingBlock;
  root.setBlockPosition(0);
  root.preprocess();
  layoutBlockBox(root, {
    bfc: new BlockFormattingContext(300),
    lastBlockContainerArea: initialContainingBlock,
    lastPositionedArea: initialContainingBlock,
    mode: 'normal'
  });
  root.postprocess();
}

export function paintToHtml(root: BlockContainer) {
  const b = new HtmlPaintBackend();
  paintBlockContainer(root, b);
  return b.s;
}

export {eachRegisteredFont} from './font.js';

export function paintToCanvas(root: BlockContainer, ctx: CanvasRenderingContext2D) {
  const b = new CanvasPaintBackend(ctx);
  paintBlockContainer(root, b);
}

export function renderToCanvasContext(
  rootElement: HTMLElement,
  ctx: CanvasRenderingContext2D,
  width: number,
  height: number
) {
  const root = generate(dom(rootElement));
  layout(root, width, height);
  paintToCanvas(root, ctx);
}

export function renderToCanvas(rootElement: HTMLElement, canvas: Canvas, density = 1) {
  const ctx = canvas.getContext('2d');
  ctx.scale(density, density);
  renderToCanvasContext(rootElement, ctx, canvas.width / density, canvas.height / density);
}

type Node = HTMLElement | TextNode;
type Child = Node | string;

type HsAttrs = {
  style?: DeclaredPlainStyle,
  attrs?: {[k: string]: string}
};

export function dom(el: HTMLElement | HTMLElement[] | string, style?: DeclaredPlainStyle) {
  const computedStyle = getRootComputedStyle(style);
  const rootElement = new HTMLElement('', 'root', computedStyle);
  const stack: (Node | {end: true})[] = Array.isArray(el) ? el.slice() : typeof el === 'string' ? [] : [el];
  const parents: HTMLElement[] = [rootElement];

  while (stack.length) {
    const el = stack.pop()!;
    const parent = parents.at(-1);

    if (!parent) throw new Error('Assertion failed: !!parent');

    if ('end' in el) {
      parents.pop();
    } else if (el instanceof TextNode) {
      el.id = id();
      el.style = createComputedStyle(parent.style, EMPTY_STYLE);
    } else if (!el.parent) {
      const uaDeclaredStyle = uaDeclaredStyles[el.tagName] || EMPTY_STYLE;
      const cascadedStyle = cascadeStyles(uaDeclaredStyle, el.declaredStyle || EMPTY_STYLE);

      el.style = createComputedStyle(parent.style, cascadedStyle);
      el.declaredStyle = null;
      el.parent = parent;

      parents.push(el);
      stack.push({end: true});
      for (const child of el.children) stack.push(child);
    }
  }

  if (typeof el === 'string') {
    const style = createComputedStyle(computedStyle, EMPTY_STYLE);
    rootElement.children = [new TextNode(id(), el, style)];
  } else {
    rootElement.children = Array.isArray(el) ? el.slice() : [el];
  }

  return rootElement;
}

export function h(tagName: string, attrs: HsAttrs): HTMLElement;
export function h(tagName: string, children: Child[]): HTMLElement;
export function h(tagName: string, text: string): HTMLElement;
export function h(tagName: string, attrs: HsAttrs, children: Child[] | string): HTMLElement;
export function h(tagName: string, arg2: HsAttrs | Child[] | string, arg3?: Child[] | string): HTMLElement {
  const hid = id();
  let attrs: HsAttrs | undefined;
  let children: Child[] | undefined;

  if (typeof arg2 === 'string') {
    children = [new TextNode(id(), arg2, initialStyle)];
  } else if (Array.isArray(arg2)) {
    children = arg2;
  } else {
    attrs = arg2;
  }

  if (Array.isArray(arg3)) {
    children = arg3;
  } else if (typeof arg3 === 'string') {
    children = [new TextNode(id(), arg3, initialStyle)];
  }

  if (!children) children = [];
  if (!attrs) attrs = {};

  const el = new HTMLElement(hid, tagName, initialStyle, null, attrs.attrs, attrs.style);
  el.children = children.map((child): HTMLElement | TextNode => {
    if (typeof child === 'string') {
      return new TextNode(id(), child, initialStyle);
    } else {
      return child;
    }
  });
  return el;
}

export function staticLayoutContribution(box: BlockContainer) {
  let intrinsicSize = 0;

  const definiteSize = box.getDefiniteInlineSize();
  if (definiteSize !== undefined) return definiteSize;

  if (box.isBlockContainerOfInlines()) {
    const [ifc] = box.children;
    for (const line of ifc.paragraph.lineboxes) {
      intrinsicSize = Math.max(intrinsicSize, line.width);
    }
    // TODO: floats
  } else if (box.isBlockContainerOfBlockContainers()) {
    for (const child of box.children) {
      intrinsicSize = Math.max(intrinsicSize, staticLayoutContribution(child));
    }
  } else {
    throw new Error(`Unknown box type: ${box.id}`);
  }

  const marginLineLeft = box.style.getMarginLineLeft(box);
  const marginLineRight = box.style.getMarginLineRight(box);
  const borderLineLeftWidth = box.style.getBorderLineLeftWidth(box);
  const paddingLineLeft = box.style.getPaddingLineLeft(box);
  const paddingLineRight = box.style.getPaddingLineRight(box);
  const borderLineRightWidth = box.style.getBorderLineRightWidth(box);

  intrinsicSize += (marginLineLeft === 'auto' ? 0 : marginLineLeft)
    + borderLineLeftWidth
    + paddingLineLeft
    + paddingLineRight
    + borderLineRightWidth
    + (marginLineRight === 'auto' ? 0 : marginLineRight);

  return intrinsicSize;
}

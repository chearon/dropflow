import {HTMLElement, TextNode} from './dom.js';
import {parseNodes} from './parser.js';
import {cascadeStyles, createComputedStyle, initialStyle, DeclaredPlainStyle, uaDeclaredStyles, EMPTY_STYLE} from './cascade.js';
import {generateBlockContainer, layoutBlockBox, BlockFormattingContext, BlockContainer} from './flow.js';
import HtmlPaintBackend from './paint-html.js';
import CanvasPaintBackend from './paint-canvas.js';
import paintBlockContainer from './paint.js';
import {BlockContainerArea} from './flow.js';
import {id} from './util.js';
import type {CanvasRenderingContext2D} from 'canvas';

// required styles that always come last in the cascade
const rootDeclaredStyle:DeclaredPlainStyle = {
  display: {
    outer: 'block',
    inner: 'flow-root'
  }
};

function getRootComputedStyle(style: DeclaredPlainStyle = EMPTY_STYLE) {
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

// TODO: remove the style argument. read styles on <html> instead
export function parse(html: string, style?: DeclaredPlainStyle) {
  const computedStyle = getRootComputedStyle(style);
  const rootElement = new HTMLElement('', 'root', computedStyle);
  parseNodes(rootElement, html);
  return rootElement;
}

export function generate(rootElement: HTMLElement) {
  if (rootElement.declaredStyle) {
    throw new Error(
      'To use the hyperscript API, pass the element tree to dom() and use ' +
      'the return value as the argument to generate().'
    );
  }

  return generateBlockContainer(rootElement);
}

export function layout(root: BlockContainer, width = 640, height = 480) {
  const initialContainingBlock = new BlockContainerArea('', root.style, 0, 0, width, height);
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

type Node = HTMLElement | TextNode;
type Child = Node | string;

type HsAttrs = {
  style?: DeclaredPlainStyle,
  attrs?: {[k: string]: string}
};

export function dom(el: HTMLElement | HTMLElement[], style?: DeclaredPlainStyle) {
  const computedStyle = getRootComputedStyle(style);
  const rootElement = new HTMLElement('', 'root', computedStyle);
  const stack: (Node | {end: true})[] = Array.isArray(el) ? el.slice() : [el];
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

  rootElement.children = Array.isArray(el) ? el.slice() : [el];

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

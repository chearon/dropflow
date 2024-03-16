import {HTMLElement, TextNode} from './dom.js';
import {DeclaredPlainStyle, getRootStyle, initialStyle, computeElementStyle} from './style.js';
import {generateBlockContainer, layoutBlockBox, BlockFormattingContext, BlockContainer} from './layout-flow.js';
import HtmlPaintBackend from './paint-html.js';
import CanvasPaintBackend, {Canvas, CanvasRenderingContext2D} from './paint-canvas.js';
import paintBlockRoot from './paint.js';
import {BoxArea} from './layout-box.js';
import {id} from './util.js';

export type {BlockContainer, DeclaredPlainStyle};

export {getRootStyle};

export {registerFont, unregisterFont} from './text-font.js';

export function generate(rootElement: HTMLElement): BlockContainer {
  if (rootElement.style === initialStyle) {
    throw new Error(
      'To use the hyperscript API, pass the element tree to dom() and use ' +
      'the return value as the argument to generate().'
    );
  }

  return generateBlockContainer(rootElement);
}

export function layout(root: BlockContainer, width = 640, height = 480) {
  const initialContainingBlock = new BoxArea(root, 0, 0, width, height);

  root.containingBlock = initialContainingBlock;
  root.preprocess();
  layoutBlockBox(root, {
    bfc: new BlockFormattingContext(300),
    lastBlockContainerArea: initialContainingBlock,
    lastPositionedArea: initialContainingBlock,
    mode: 'normal'
  });
  root.postprocess();
}

/**
 * Old paint target for testing, not maintained much anymore
 */
export function paintToHtml(root: BlockContainer): string {
  const backend = new HtmlPaintBackend();
  paintBlockRoot(root, backend, true);
  return backend.s;
}

export {eachRegisteredFont} from './text-font.js';

export function paintToCanvas(root: BlockContainer, ctx: CanvasRenderingContext2D): void {
  const backend = new CanvasPaintBackend(ctx);
  paintBlockRoot(root, backend, true);
}

export function renderToCanvasContext(
  rootElement: HTMLElement,
  ctx: CanvasRenderingContext2D,
  width: number,
  height: number
) {
  const root = generate(rootElement);
  layout(root, width, height);
  paintToCanvas(root, ctx);
}

export function renderToCanvas(rootElement: HTMLElement, canvas: Canvas, density = 1) {
  const ctx = canvas.getContext('2d');
  ctx.scale(density, density);
  renderToCanvasContext(rootElement, ctx, canvas.width / density, canvas.height / density);
}

type HsChild = HTMLElement | TextNode | string;

interface HsData {
  style?: DeclaredPlainStyle;
  attrs?: {[k: string]: string};
}

export function dom(el: HTMLElement | HTMLElement[]): HTMLElement {
  let rootElement;

  if (el instanceof HTMLElement && el.tagName === 'html') {
    rootElement = el;

    if (rootElement.children.length === 1) {
      const [child] = rootElement.children;
      if (child instanceof TextNode) {
        // fast path: saves something like 0.4µs, so no need to keep...
        child.parent = rootElement;
        computeElementStyle(rootElement);
        computeElementStyle(child);
        return rootElement;
      }
    }
  } else {
    rootElement = new HTMLElement('root', 'html');
    rootElement.children = Array.isArray(el) ? el.slice() : [el];
  }

  // Assign parents
  const stack: (HTMLElement | TextNode | {sentinel: true})[] = [rootElement];
  const parents: HTMLElement[] = [];

  while (stack.length) {
    const el = stack.pop()!;
    const parent = parents.at(-1);

    if ('sentinel' in el) {
      parents.pop();
    } else {
      el.parent = parent || null;
      computeElementStyle(el);
      if (el instanceof HTMLElement) {
        parents.push(el);
        stack.push({sentinel: true});
        for (const child of el.children) stack.push(child);
      }
    }
  }

  return rootElement;
}

function toDomChild(child: HsChild) {
  if (typeof child === 'string') {
    return new TextNode(id(), child);
  } else {
    return child;
  }
}

export function h(tagName: string): HTMLElement;
export function h(tagName: string, data: HsData): HTMLElement;
export function h(tagName: string, children: HsChild[]): HTMLElement;
export function h(tagName: string, text: string): HTMLElement;
export function h(tagName: string, data: HsData, children: HsChild[] | string): HTMLElement;
export function h(tagName: string, arg2?: HsData | HsChild[] | string, arg3?: HsChild[] | string): HTMLElement {
  let data: HsData | undefined;
  let children: (HTMLElement | TextNode)[] | undefined;

  if (typeof arg2 === 'string') {
    children = [new TextNode(id(), arg2)];
  } else if (Array.isArray(arg2)) {
    children = arg2.map(toDomChild);
  } else {
    data = arg2;
  }

  if (Array.isArray(arg3)) {
    children = arg3.map(toDomChild);
  } else if (typeof arg3 === 'string') {
    children = [new TextNode(id(), arg3)];
  }

  if (!children) children = [];
  if (!data) data = {};

  const el = new HTMLElement(id(), tagName, null, data.attrs, data.style);
  el.children = children;
  return el;
}

export function staticLayoutContribution(box: BlockContainer): number {
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

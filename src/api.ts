import '#register-default-environment';
import {HTMLElement, TextNode} from './dom.js';
import {DeclaredStyle, getOriginStyle, computeElementStyle} from './style.js';
import {fonts, FontFace, createFaceFromTables, createFaceFromTablesSync, onLoadWalkerTextNodeForFonts, onLoadWalkerElementForFonts} from './text-font.js';
import {generateBlockContainer, layoutBlockLevelBox, BlockContainer} from './layout-flow.js';
import HtmlPaintBackend from './paint-html.js';
import SvgPaintBackend from './paint-svg.js';
import CanvasPaintBackend, {Canvas, CanvasRenderingContext2D} from './paint-canvas.js';
import paint from './paint.js';
import {BoxArea, prelayout, postlayout} from './layout-box.js';
import {onLoadWalkerElementForImage} from './layout-image.js';
import {id, uuid} from './util.js';

import type {Style} from './style.js';
import type {Image} from './layout-image.js';

export {environment} from './environment.js';

export type {BlockContainer, DeclaredStyle};

export type {HTMLElement};

export {createDeclaredStyle as style, setOriginStyle} from './style.js';

export {fonts, FontFace, createFaceFromTables, createFaceFromTablesSync};

export function generate(rootElement: HTMLElement): BlockContainer {
  if (rootElement.style === getOriginStyle()) {
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
  prelayout(root);
  layoutBlockLevelBox(root, {});
  postlayout(root);
}

/**
 * Old paint target for testing, not maintained much anymore
 */
export function paintToHtml(root: BlockContainer): string {
  const backend = new HtmlPaintBackend();
  paint(root, backend);
  return backend.s;
}

export function paintToSvg(root: BlockContainer): string {
  const backend = new SvgPaintBackend();
  const {width, height} = root.containingBlock;
  let cssFonts = '';

  paint(root, backend);

  for (const [src, face] of backend.usedFonts) {
    cssFonts +=
`@font-face {
  font-family: "${face.uniqueFamily}";
  src: url("${src}") format("opentype");
}\n`;
  }

  return `
<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${width} ${height}">
  <style type="text/css">
    ${cssFonts}
  </style>
  ${backend.body()}
</svg>
  `.trim();
}

export function paintToSvgElements(root: BlockContainer): string {
  const backend = new SvgPaintBackend();
  paint(root, backend);
  return backend.main;
}

export {eachRegisteredFont} from './text-font.js';

export function paintToCanvas(root: BlockContainer, ctx: CanvasRenderingContext2D): void {
  const backend = new CanvasPaintBackend(ctx);
  paint(root, backend);
}

export async function renderToCanvasContext(
  rootElement: HTMLElement,
  ctx: CanvasRenderingContext2D,
  width: number,
  height: number
): Promise<void> {
  await load(rootElement);
  const root = generate(rootElement);
  layout(root, width, height);
  paintToCanvas(root, ctx);
}

export async function renderToCanvas(rootElement: HTMLElement, canvas: Canvas) {
  const ctx = canvas.getContext('2d');
  await renderToCanvasContext(rootElement, ctx, canvas.width, canvas.height);
}

type HsChild = HTMLElement | string;

interface HsData {
  style?: DeclaredStyle | DeclaredStyle[];
  attrs?: {[k: string]: string};
}

function toDomChild(child: HsChild) {
  if (typeof child === 'string') {
    return new TextNode(id(), child);
  } else {
    return child;
  }
}

export function dom(el: HsChild | HsChild[]): HTMLElement {
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
    rootElement.children = Array.isArray(el) ? el.map(toDomChild) : [toDomChild(el)];
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

export function t(text: string): TextNode {
  return new TextNode(id(), text);
}

export function staticLayoutContribution(box: BlockContainer): number {
  let intrinsicSize = 0;

  const definiteSize = box.getDefiniteOuterInlineSize();
  if (definiteSize !== undefined) {
    const marginLineLeft = box.style.getMarginLineLeft(box);
    const marginLineRight = box.style.getMarginLineRight(box);
    return definiteSize + (marginLineLeft === 'auto' ? 0 : marginLineLeft)
      + (marginLineRight === 'auto' ? 0 : marginLineRight)
  }

  if (box.isBlockContainerOfInlines()) {
    const [ifc] = box.children;
    for (const line of ifc.paragraph.lineboxes) {
      intrinsicSize = Math.max(intrinsicSize, line.width);
    }
    // TODO: floats
  } else if (box.isBlockContainerOfBlockContainers()) {
    for (const child of box.children) {
      if (child.isBlockContainer()) {
        intrinsicSize = Math.max(intrinsicSize, staticLayoutContribution(child));
      } else {
        // TODO:
        intrinsicSize = Math.max(intrinsicSize, child.getBorderArea().inlineSize);
      }
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

type LoadableResource = FontFace | Image;

export interface LoadWalkerContext {
  fontCache: {style: Style, faces: FontFace[]}[];
  fontEntry: {style: Style, faces: FontFace[]} | undefined;
  onLoadableResource: (resource: LoadableResource) => void;
}

function loadWalker(root: HTMLElement, ctx: LoadWalkerContext) {
  const stack = root.children.slice().reverse();

  while (stack.length) {
    const el = stack.pop()!;
    if (el instanceof HTMLElement) {
      onLoadWalkerElementForImage(ctx, el);
      onLoadWalkerElementForFonts(ctx, el);
      for (let i = el.children.length - 1; i >= 0; i--) stack.push(el.children[i]);
    } else {
      onLoadWalkerTextNodeForFonts(ctx, el);
    }
  }
}

export async function load(root: HTMLElement): Promise<LoadableResource[]> {
  const promises: Promise<any>[] = [];
  const resources: LoadableResource[] = [];

  loadWalker(root, {
    fontCache: [],
    fontEntry: undefined,
    onLoadableResource(resource) {
      resources.push(resource);
      const promise = resource.load().catch(() => {
        // Swallowed. Error is wrapped in FontFace.ready (images don't throw)
      });
      promises.push(promise);
    }
  });

  await Promise.all(promises);

  return resources;
}

export function loadSync(root: HTMLElement): LoadableResource[] {
  const resources: LoadableResource[] = [];

  loadWalker(root, {
    fontCache: [],
    fontEntry: undefined,
    onLoadableResource(resource) {
      resources.push(resource);
      try {
        resource.loadSync();
      } catch (e) {
        // Swallowed. Error is wrapped in FontFace.ready (images don't throw)
      }
    }
  });

  return resources;
}

export const objectStore = new Map<string, ArrayBufferLike>();

export function createObjectURL(buffer: ArrayBufferLike): string {
  let url = 'blob:dropflow.local/' + uuid();
  objectStore.set(url, buffer);
  return url;
}

export function revokeObjectURL(url: string): void {
  objectStore.delete(url);
}

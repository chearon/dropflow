import '#register-default-environment';
import {HTMLElement, TextNode} from './dom.ts';
import {DeclaredStyle, getOriginStyle, computeElementStyle, colorMap} from './style.ts';
import {fonts, FontFace, createFaceFromTables, createFaceFromTablesSync, onLoadWalkerTextNodeForFonts, onLoadWalkerElementForFonts} from './text-font.ts';
import {generateBlockContainer, layoutBlockLevelBox} from './layout-flow.ts';
import HtmlPaintBackend from './paint-html.ts';
import SvgPaintBackend from './paint-svg.ts';
import CanvasPaintBackend from './paint-canvas.ts';

import paint from './paint.ts';
import {BoxArea, Layout, prelayout, postlayout} from './layout-box.ts';
import {onLoadWalkerElementForImage, images, Image} from './layout-image.ts';
import {id} from './util.ts';

import type {Canvas, CanvasRenderingContext2D} from './paint-canvas.ts';

import type {Style, ColorLiteral} from './style.ts';
import type {BlockContainer, InlineLevel} from './layout-flow.ts';

export {log} from './layout-box.ts';

export {environment} from './environment.ts';

export type {Layout, BlockContainer, DeclaredStyle, HTMLElement};

export {createDeclaredStyle as style, setOriginStyle} from './style.ts';

export {fonts, FontFace, createFaceFromTables, createFaceFromTablesSync};

export {images, Image};

export function layout(rootElement: HTMLElement): Layout {
  const tree: InlineLevel[] = [];

  if (rootElement.style === getOriginStyle()) {
    throw new Error(
      'To use the hyperscript API, pass the element tree to dom() and use ' +
      'the return value as the argument to generate().'
    );
  }

  generateBlockContainer(tree, rootElement);

  return new Layout(tree);
}

export function reflow(layout: Layout, width = 640, height = 480) {
  const initialContainingBlock = new BoxArea(layout.root(), 0, 0, width, height);

  prelayout(layout, initialContainingBlock);
  layoutBlockLevelBox(layout, layout.root(), {needBaseline: false, isDecorating: false});
  postlayout(layout);
}

/**
 * Old paint target for testing, not maintained much anymore
 */
export function paintToHtml(layout: Layout): string {
  const backend = new HtmlPaintBackend(layout);
  paint(layout, backend);
  return backend.s;
}

export function paintToSvg(layout: Layout): string {
  const backend = new SvgPaintBackend(layout);
  const {width, height} = layout.root().getContainingBlock();
  let cssFonts = '';

  paint(layout, backend);

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

export function paintToSvgElements(layout: Layout): string {
  const backend = new SvgPaintBackend(layout);
  paint(layout, backend);
  return backend.main;
}

export {eachRegisteredFont} from './text-font.ts';

export function paintToCanvas(layout: Layout, ctx: CanvasRenderingContext2D): void {
  const backend = new CanvasPaintBackend(ctx, layout);
  paint(layout, backend);
}

export async function renderToCanvasContext(
  rootElement: HTMLElement,
  ctx: CanvasRenderingContext2D,
  width: number,
  height: number
): Promise<void> {
  await load(rootElement);
  const l = layout(rootElement);
  reflow(l, width, height);
  paintToCanvas(l, ctx);
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

const rHexColor = /^\s*#([\da-f]{3,4}|[\da-f]{6}|[\da-f]{8})\s*$/i;
const rFloat = '(?:\\d+(?:\\.\\d+)?|\\.\\d+)';
const rChannel = `\\s*(${rFloat}%?)\\s*`;
const rRgbColor = new RegExp(`^.*rgb\\(${rChannel},${rChannel},${rChannel}\\).*$`, 'i');
const rRgbaColor = new RegExp(`^.*rgba\\(${rChannel},${rChannel},${rChannel},${rChannel}\\).*$`, 'i');
const rKeyword = /^\s*([a-z]+)\s*$/i;

function clamp(min: number, x: number, max: number) {
  return Math.max(min, Math.min(max, x));
}

// NOTE: keep in sync with parse-css.pegjs!
// Reimplemented in JS because, while it is possible to split up pegjs files,
// the output of parse-css-color.pegjs is almost two thousand lines.
export function color(value: string): ColorLiteral {
  const hex = rHexColor.exec(value);
  const toNum = 255 / 100;

  if (hex) {
    const h = hex[1];
    const s = h.length < 5 ? [...h].map(c => c + c).join("") : h;
    const v = s.match(/../g)!.map(c => parseInt(c, 16));
    return {r: v[0], g: v[1], b: v[2], a: v[3] === undefined ? 1 : v[3] / 255};
  }

  const rgb = rRgbColor.exec(value);

  if (rgb) {
    const [, rs, gs, bs] = rgb;
    const r = clamp(0, (rs[rs.length - 1] === '%' ? toNum : 1) * parseFloat(rs), 255);
    const g = clamp(0, (gs[gs.length - 1] === '%' ? toNum : 1) * parseFloat(gs), 255);
    const b = clamp(0, (bs[bs.length - 1] === '%' ? toNum : 1) * parseFloat(bs), 255);
    return {r, g, b, a: 1};
  }

  const rgba = rRgbaColor.exec(value);

  if (rgba) {
    const [, rs, gs, bs, as] = rgba;
    const r = clamp(0, (rs[rs.length - 1] === '%' ? toNum : 1) * parseFloat(rs), 255);
    const g = clamp(0, (gs[gs.length - 1] === '%' ? toNum : 1) * parseFloat(gs), 255);
    const b = clamp(0, (bs[bs.length - 1] === '%' ? toNum : 1) * parseFloat(bs), 255);
    const a = clamp(0, (as[as.length - 1] === '%' ? toNum : 1) * parseFloat(as), 1);
    return {r, g, b, a};
  }

  const keyword = rKeyword.exec(value);

  if (keyword) {
    const match = colorMap.get(keyword[1].toLowerCase());
    if (match) return match;
  }

  return {r: 0, g: 0, b: 0, a: 1};

}

export {clearWordCache} from './layout-text.ts';

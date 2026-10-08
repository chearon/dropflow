import '#register-default-environment';
import { HTMLElement, TextNode } from "./dom.js";
import { DeclaredStyle, getOriginStyle, computeElementStyle } from "./style.js";
import { fonts, FontFace, createFaceFromTables, createFaceFromTablesSync, onLoadWalkerTextNodeForFonts, onLoadWalkerElementForFonts } from "./text-font.js";
import { generateBlockContainer, layoutBlockLevelBox } from "./layout-flow.js";
import HtmlPaintBackend from "./paint-html.js";
import SvgPaintBackend from "./paint-svg.js";
import CanvasPaintBackend from "./paint-canvas.js";
import paint from "./paint.js";
import { BoxArea, Layout, prelayout, postlayout } from "./layout-box.js";
import { onLoadWalkerElementForImage } from "./layout-image.js";
import { id, uuid } from "./util.js";
export { log } from "./layout-box.js";
export { environment } from "./environment.js";
export { createDeclaredStyle as style, setOriginStyle } from "./style.js";
export { fonts, FontFace, createFaceFromTables, createFaceFromTablesSync };
export function layout(rootElement) {
    const tree = [];
    if (rootElement.style === getOriginStyle()) {
        throw new Error('To use the hyperscript API, pass the element tree to dom() and use ' +
            'the return value as the argument to generate().');
    }
    generateBlockContainer(tree, rootElement);
    return new Layout(tree);
}
export function reflow(layout, width = 640, height = 480) {
    const initialContainingBlock = new BoxArea(layout.root(), 0, 0, width, height);
    prelayout(layout, initialContainingBlock);
    layoutBlockLevelBox(layout, layout.root(), { needBaseline: false, isDecorating: false });
    postlayout(layout);
}
/**
 * Old paint target for testing, not maintained much anymore
 */
export function paintToHtml(layout) {
    const backend = new HtmlPaintBackend(layout);
    paint(layout, backend);
    return backend.s;
}
export function paintToSvg(layout) {
    const backend = new SvgPaintBackend(layout);
    const { width, height } = layout.root().getContainingBlock();
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
export function paintToSvgElements(layout) {
    const backend = new SvgPaintBackend(layout);
    paint(layout, backend);
    return backend.main;
}
export { eachRegisteredFont } from "./text-font.js";
export function paintToCanvas(layout, ctx) {
    const backend = new CanvasPaintBackend(ctx, layout);
    paint(layout, backend);
}
export async function renderToCanvasContext(rootElement, ctx, width, height) {
    await load(rootElement);
    const l = layout(rootElement);
    reflow(l, width, height);
    paintToCanvas(l, ctx);
}
export async function renderToCanvas(rootElement, canvas) {
    const ctx = canvas.getContext('2d');
    await renderToCanvasContext(rootElement, ctx, canvas.width, canvas.height);
}
function toDomChild(child) {
    if (typeof child === 'string') {
        return new TextNode(id(), child);
    }
    else {
        return child;
    }
}
export function dom(el) {
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
    }
    else {
        rootElement = new HTMLElement('root', 'html');
        rootElement.children = Array.isArray(el) ? el.map(toDomChild) : [toDomChild(el)];
    }
    // Assign parents
    const stack = [rootElement];
    const parents = [];
    while (stack.length) {
        const el = stack.pop();
        const parent = parents.at(-1);
        if ('sentinel' in el) {
            parents.pop();
        }
        else {
            el.parent = parent || null;
            computeElementStyle(el);
            if (el instanceof HTMLElement) {
                parents.push(el);
                stack.push({ sentinel: true });
                for (const child of el.children)
                    stack.push(child);
            }
        }
    }
    return rootElement;
}
export function h(tagName, arg2, arg3) {
    let data;
    let children;
    if (typeof arg2 === 'string') {
        children = [new TextNode(id(), arg2)];
    }
    else if (Array.isArray(arg2)) {
        children = arg2.map(toDomChild);
    }
    else {
        data = arg2;
    }
    if (Array.isArray(arg3)) {
        children = arg3.map(toDomChild);
    }
    else if (typeof arg3 === 'string') {
        children = [new TextNode(id(), arg3)];
    }
    if (!children)
        children = [];
    if (!data)
        data = {};
    const el = new HTMLElement(id(), tagName, null, data.attrs, data.style);
    el.children = children;
    return el;
}
export function t(text) {
    return new TextNode(id(), text);
}
function loadWalker(root, ctx) {
    const stack = root.children.slice().reverse();
    while (stack.length) {
        const el = stack.pop();
        if (el instanceof HTMLElement) {
            onLoadWalkerElementForImage(ctx, el);
            onLoadWalkerElementForFonts(ctx, el);
            for (let i = el.children.length - 1; i >= 0; i--)
                stack.push(el.children[i]);
        }
        else {
            onLoadWalkerTextNodeForFonts(ctx, el);
        }
    }
}
export async function load(root) {
    const promises = [];
    const resources = [];
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
export function loadSync(root) {
    const resources = [];
    loadWalker(root, {
        fontCache: [],
        fontEntry: undefined,
        onLoadableResource(resource) {
            resources.push(resource);
            try {
                resource.loadSync();
            }
            catch (e) {
                // Swallowed. Error is wrapped in FontFace.ready (images don't throw)
            }
        }
    });
    return resources;
}
export const objectStore = new Map();
export function createObjectURL(buffer) {
    let url = 'blob:dropflowdata:' + uuid();
    objectStore.set(url, buffer);
    return url;
}
export function revokeObjectURL(url) {
    objectStore.delete(url);
}
export { clearWordCache } from "./layout-text.js";

import { HTMLElement, TextNode } from './dom.js';
import { getRootStyle, initialStyle, computeElementStyle } from './style.js';
import { registerFont, unregisterFont, getFontUrls } from './text-font.js';
import { generateBlockContainer, layoutBlockBox, BlockFormattingContext } from './layout-flow.js';
import HtmlPaintBackend from './paint-html.js';
import SvgPaintBackend from './paint-svg.js';
import CanvasPaintBackend from './paint-canvas.js';
import paintBlockRoot from './paint.js';
import { BoxArea } from './layout-box.js';
import { id } from './util.js';
export { getRootStyle };
export { cascadeStyles } from './style.js';
export { registerFont, unregisterFont };
export function generate(rootElement) {
    if (rootElement.style === initialStyle) {
        throw new Error('To use the hyperscript API, pass the element tree to dom() and use ' +
            'the return value as the argument to generate().');
    }
    return generateBlockContainer(rootElement);
}
export function layout(root, width = 640, height = 480) {
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
export function paintToHtml(root) {
    const backend = new HtmlPaintBackend();
    paintBlockRoot(root, backend, true);
    return backend.s;
}
export function paintToSvg(root) {
    const backend = new SvgPaintBackend();
    const { width, height } = root.containingBlock;
    let cssFonts = '';
    paintBlockRoot(root, backend, true);
    for (const [src, match] of backend.usedFonts) {
        const { family, weight, style, stretch } = match.toCssDescriptor();
        cssFonts +=
            `@font-face {
  font-family: "${family}";
  font-weight: ${weight};
  font-style: ${style};
  font-stretch: ${stretch};
  src: url("${src}") format("opentype");
}\n`;
    }
    return `
<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${width} ${height}">
  <style type="text/css">
    ${cssFonts}
  </style>
  ${backend.s}
</svg>
  `.trim();
}
export function paintToSvgElements(root) {
    const backend = new SvgPaintBackend();
    paintBlockRoot(root, backend, true);
    return backend.s;
}
export { eachRegisteredFont } from './text-font.js';
export function paintToCanvas(root, ctx) {
    const backend = new CanvasPaintBackend(ctx);
    paintBlockRoot(root, backend, true);
}
export function renderToCanvasContext(rootElement, ctx, width, height) {
    const root = generate(rootElement);
    layout(root, width, height);
    paintToCanvas(root, ctx);
}
export function renderToCanvas(rootElement, canvas, density = 1) {
    const ctx = canvas.getContext('2d');
    ctx.scale(density, density);
    renderToCanvasContext(rootElement, ctx, canvas.width / density, canvas.height / density);
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
export function staticLayoutContribution(box) {
    let intrinsicSize = 0;
    const definiteSize = box.getDefiniteInlineSize();
    if (definiteSize !== undefined)
        return definiteSize;
    if (box.isBlockContainerOfInlines()) {
        const [ifc] = box.children;
        for (const line of ifc.paragraph.lineboxes) {
            intrinsicSize = Math.max(intrinsicSize, line.width);
        }
        // TODO: floats
    }
    else if (box.isBlockContainerOfBlockContainers()) {
        for (const child of box.children) {
            intrinsicSize = Math.max(intrinsicSize, staticLayoutContribution(child));
        }
    }
    else {
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
export async function loadNotoFonts(root, options) {
    const urls = getFontUrls(root).map(url => new URL(url));
    await Promise.all(urls.map(url => registerFont(url, options)));
    return urls;
}

import { HTMLElement } from './dom.js';
import { parseNodes } from './parser.js';
import { getRootComputedStyle } from './api.js';
// TODO: remove the style argument. read styles on <html> instead
export default function parse(html, style) {
    const computedStyle = getRootComputedStyle(style);
    const rootElement = new HTMLElement('', 'root', computedStyle);
    parseNodes(rootElement, html);
    return rootElement;
}

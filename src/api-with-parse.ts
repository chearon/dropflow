import {HTMLElement} from './dom.js';
import {DeclaredPlainStyle} from './cascade.js';
import {getRootComputedStyle} from './api.js';

import {parseNodes} from './parser.js';

// TODO: remove the style argument. read styles on <html> instead
export function parse(html: string, style?: DeclaredPlainStyle) {
  const computedStyle = getRootComputedStyle(style);
  const rootElement = new HTMLElement('', 'root', computedStyle);
  parseNodes(rootElement, html);
  return rootElement;
}

export * from './api.js';

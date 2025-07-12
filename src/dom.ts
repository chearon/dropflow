import {Box} from './layout-box.ts';
import {loggableText} from './util.ts';
import {Style, DeclaredStyle, getOriginStyle, EMPTY_STYLE} from './style.ts';
import {query, queryAll} from './style-query.ts';

import type {Adapter} from './style-query.ts';

export class TextNode {
  public id: string;
  public style: Style;
  public text: string;
  public parent: HTMLElement | null;

  constructor(id: string, text: string, parent: HTMLElement | null = null) {
    this.id = id;
    this.style = getOriginStyle();
    this.text = text;
    this.parent = parent;
  }

  repr(indent = 0) {
    return '  '.repeat(indent) + `Ͳ "${loggableText(this.text)}"`;
  }
}

export class HTMLElement {
  public id: string;
  public tagName: string;
  public style: Style;
  public declaredStyle: DeclaredStyle | DeclaredStyle[];
  public parent: HTMLElement | null;
  public attrs: Record<string, string>;
  public children: (TextNode | HTMLElement)[];
  public boxes: Box[];

  constructor(
    id: string,
    tagName: string,
    parent: HTMLElement | null = null,
    attrs: {[k: string]: string} = {},
    declaredStyle: DeclaredStyle | DeclaredStyle[] = EMPTY_STYLE
  ) {
    this.id = id;
    this.tagName = tagName;
    this.style = getOriginStyle();
    this.declaredStyle = declaredStyle;
    this.parent = parent;
    this.attrs = attrs;
    this.children = [];
    this.boxes = [];
  }

  getDeclaredStyles() {
    if (Array.isArray(this.declaredStyle)) {
      return this.declaredStyle.slice();
    } else {
      return [this.declaredStyle];
    }
  }

  getEl(stack: number[]) {
    let el: HTMLElement | TextNode = this;

    for (let i = 0; el && i < stack.length; ++i) {
      if (!('children' in el)) break;
      el = el.children[stack[i]];
    }

    return el;
  }

  repr(indent = 0, styleProp?: keyof Style): string {
    const c = this.children.map(c => c.repr(indent + 1, styleProp)).join('\n');
    const style = styleProp ? ` ${styleProp}: ${JSON.stringify(this.style[styleProp])}` : '';
    const desc = `◼ <${this.tagName}> ${this.id}${style}`
    return '  '.repeat(indent) + desc + (c ? '\n' + c : '');
  }

  query(selector: string): HTMLElement | null {
    return query(selector, this, {adapter});
  }

  queryAll(selector: string): HTMLElement[] {
    return queryAll(selector, this, {adapter});
  }
}

function getChildren(elem: HTMLElement) {
  const ret = [];
  for (const child of elem.children) if (child instanceof HTMLElement) ret.push(child);
  return ret;
}

function removeSubsets(nodes: HTMLElement[]) {
	let idx = nodes.length, node, ancestor, replace;

	// Check if each node (or one of its ancestors) is already contained in the
	// array.
	while (--idx > -1) {
		node = ancestor = nodes[idx];

		// Temporarily remove the node under consideration
		(nodes as any)[idx] = null;
		replace = true;

		while (ancestor) {
			if (nodes.indexOf(ancestor) > -1) {
				replace = false;
				nodes.splice(idx, 1);
				break;
			}
			ancestor = ancestor.parent;
		}

		// If the node has been found to be unique, re-insert it.
		if (replace) nodes[idx] = node;
	}

	return nodes;
}

const adapter: Adapter<HTMLElement, HTMLElement> = {
  isTag: (node): node is HTMLElement => true,
  existsOne(test, elems) {
    return elems.some(elem => {
      return test(elem) || adapter.existsOne(test, getChildren(elem));
    });
  },
  getAttributeValue(elem: HTMLElement, name: string) {
    return elem.attrs[name];
  },
  getChildren,
  getName(elem) {
    return elem.tagName;
  },
  getParent(elem) {
    return elem.parent;
  },
  getSiblings(elem) {
    if (!elem.parent) return [];
    return getChildren(elem.parent);
  },
  getText() {
    return '';
  },
  hasAttrib(elem: HTMLElement, name: string) {
    return name in elem.attrs;
  },
  removeSubsets,
  findAll(test, elems) {
    let ret:HTMLElement[] = [];
    for(let i = 0, j = elems.length; i < j; i++) {
      if (test(elems[i])) ret.push(elems[i]);
      const children = getChildren(elems[i]);
      ret = ret.concat(adapter.findAll(test, children));
    }
    return ret;
  },
  findOne(test, elems) {
    let elem = null;

    for (let i = 0, l = elems.length; i < l && !elem; i++) {
      if (test(elems[i])) {
        elem = elems[i];
      } else {
        const children = getChildren(elems[i]);
        if (children.length > 0) elem = adapter.findOne(test, children);
      }
    }

    return elem;
  },
  isHovered() {
    return false;
  },
  isVisited() {
    return false;
  },
  isActive() {
    return false;
  }
};





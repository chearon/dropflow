import {Box} from './box.js';
import {loggableText} from './util.js';
import {ComputedPlainStyle} from './cascade.js';
import selectAll, {Adapter} from './select.js';

export class TextNode {
  public id: string;
  public style: ComputedPlainStyle;
  public text: string;

  constructor(id: string, text: string, style: ComputedPlainStyle) {
    this.id = id;
    this.style = style;
    this.text = text;
  }

  repr(indent = 0) {
    return '  '.repeat(indent) + `Ͳ "${loggableText(this.text)}"`;
  }
}

export class HTMLElement {
  public id: string;
  public tagName: string;
  public style: ComputedPlainStyle;
  public parent: HTMLElement | null;
  public attrs: {[k: string]: string};
  public children: (TextNode | HTMLElement)[];
  public boxes: Box[];

  constructor(
    id: string,
    tagName: string,
    style: ComputedPlainStyle,
    parent: HTMLElement | null = null,
    attrs: {[k: string]: string} = {}
  ) {
    this.id = id;
    this.tagName = tagName;
    this.style = style;
    this.parent = parent;
    this.attrs = attrs;
    this.children = [];
    this.boxes = [];
  }

  getEl(stack: number[]) {
    let el: HTMLElement | TextNode = this;

    for (let i = 0; el && i < stack.length; ++i) {
      if (!('children' in el)) break;
      el = el.children[stack[i]];
    }

    return el;
  }

  repr(indent = 0, styleProp?: keyof ComputedPlainStyle): string {
    const c = this.children.map(c => c.repr(indent + 1, styleProp)).join('\n');
    const style = styleProp ? ` ${styleProp}: ${JSON.stringify(this.style[styleProp])}` : '';
    const desc = `◼ <${this.tagName}> ${this.id}${style}`
    return '  '.repeat(indent) + desc + (c ? '\n' + c : '');
  }

  query(selector: string) {
    return select(this, selector);
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

function select(root: HTMLElement, selector: string) {
  const adapter:Adapter<HTMLElement, HTMLElement> = {
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

  return selectAll(selector, root, {adapter});
}

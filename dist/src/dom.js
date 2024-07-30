import { loggableText } from './util.js';
import { initialStyle, EMPTY_STYLE } from './style.js';
import { query, queryAll } from './style-query.js';
export class TextNode {
    id;
    style;
    text;
    parent;
    constructor(id, text, parent = null) {
        this.id = id;
        this.style = initialStyle;
        this.text = text;
        this.parent = parent;
    }
    repr(indent = 0) {
        return '  '.repeat(indent) + `Ͳ "${loggableText(this.text)}"`;
    }
}
export class HTMLElement {
    id;
    tagName;
    style;
    declaredStyle;
    parent;
    attrs;
    children;
    boxes;
    constructor(id, tagName, parent = null, attrs = {}, declaredStyle = EMPTY_STYLE) {
        this.id = id;
        this.tagName = tagName;
        this.style = initialStyle;
        this.declaredStyle = declaredStyle;
        this.parent = parent;
        this.attrs = attrs;
        this.children = [];
        this.boxes = [];
    }
    getEl(stack) {
        let el = this;
        for (let i = 0; el && i < stack.length; ++i) {
            if (!('children' in el))
                break;
            el = el.children[stack[i]];
        }
        return el;
    }
    repr(indent = 0, styleProp) {
        const c = this.children.map(c => c.repr(indent + 1, styleProp)).join('\n');
        const style = styleProp ? ` ${styleProp}: ${JSON.stringify(this.style[styleProp])}` : '';
        const desc = `◼ <${this.tagName}> ${this.id}${style}`;
        return '  '.repeat(indent) + desc + (c ? '\n' + c : '');
    }
    query(selector) {
        return query(selector, this, { adapter });
    }
    queryAll(selector) {
        return queryAll(selector, this, { adapter });
    }
}
function getChildren(elem) {
    const ret = [];
    for (const child of elem.children)
        if (child instanceof HTMLElement)
            ret.push(child);
    return ret;
}
function removeSubsets(nodes) {
    let idx = nodes.length, node, ancestor, replace;
    // Check if each node (or one of its ancestors) is already contained in the
    // array.
    while (--idx > -1) {
        node = ancestor = nodes[idx];
        // Temporarily remove the node under consideration
        nodes[idx] = null;
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
        if (replace)
            nodes[idx] = node;
    }
    return nodes;
}
const adapter = {
    isTag: (node) => true,
    existsOne(test, elems) {
        return elems.some(elem => {
            return test(elem) || adapter.existsOne(test, getChildren(elem));
        });
    },
    getAttributeValue(elem, name) {
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
        if (!elem.parent)
            return [];
        return getChildren(elem.parent);
    },
    getText() {
        return '';
    },
    hasAttrib(elem, name) {
        return name in elem.attrs;
    },
    removeSubsets,
    findAll(test, elems) {
        let ret = [];
        for (let i = 0, j = elems.length; i < j; i++) {
            if (test(elems[i]))
                ret.push(elems[i]);
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
            }
            else {
                const children = getChildren(elems[i]);
                if (children.length > 0)
                    elem = adapter.findOne(test, children);
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

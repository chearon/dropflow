import {id, loggableText} from './util';

export class TextNode {
  constructor(id, text, style) {
    this.style = style;
    this.text = text;
  }

  repr(indent = 0) {
    return '  '.repeat(indent) + `Ͳ "${loggableText(this.text)}"`;
  }
}

export class HTMLElement {
  constructor(id, tagName, style) {
    this.id = id;
    this.tagName = tagName;
    this.style = style;
    this.children = [];
  }

  getEl(stack) {
    let el = this;

    for (let i = 0; el && i < stack.length; ++i) {
      el = el.children[stack[i]];
    }

    return el;
  }

  repr(indent = 0, styleProp = null) {
    const c = this.children.map(c => c.repr(indent + 1, styleProp)).join('\n');
    const style = styleProp ? ` ${styleProp}: ${JSON.stringify(this.style[styleProp])}` : '';
    const desc = `◼ <${this.tagName}> ${this.id}${style}`
    return '  '.repeat(indent) + desc + (c ? '\n' + c : '');
  }
}

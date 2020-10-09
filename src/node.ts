import {id, loggableText} from './util';
import {ComputedPlainStyle} from './cascade';

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
  public children: (TextNode | HTMLElement)[];

  constructor(id: string, tagName: string, style: ComputedPlainStyle) {
    this.id = id;
    this.tagName = tagName;
    this.style = style;
    this.children = [];
  }

  getEl(stack: number[]) {
    let el: HTMLElement | TextNode = this;

    for (let i = 0; el && i < stack.length; ++i) {
      if (!('children' in el)) break;
      el = el.children[stack[i]];
    }

    return el;
  }

  repr(indent = 0, styleProp: keyof ComputedPlainStyle = null): string {
    const c = this.children.map(c => c.repr(indent + 1, styleProp)).join('\n');
    const style = styleProp ? ` ${styleProp}: ${JSON.stringify(this.style[styleProp])}` : '';
    const desc = `◼ <${this.tagName}> ${this.id}${style}`
    return '  '.repeat(indent) + desc + (c ? '\n' + c : '');
  }
}

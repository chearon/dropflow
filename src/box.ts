import {id} from './util.js';
import {Style} from './cascade.js';
import {Run} from './text.js';
import {Break, Inline, IfcInline, BlockContainer} from './flow.js';

export type LogicalArea = {
  blockStart: number | undefined
  lineLeft: number | undefined
  blockSize: number | undefined
  inlineSize: number | undefined
};

export class Box {
  public id: string;
  public style: Style;
  public children: Box[];
  public attrs: number;

  public static ATTRS = {
    isAnonymous: 1,
    isInline: 1 << 1,
    isBfcRoot: 1 << 2,
    isFloat: 1 << 3,
    enableLogging: 1 << 4
  };

  constructor(style: Style, children: Box[], attrs: number) {
    this.id = id();
    this.style = style;
    this.children = children;
    this.attrs = attrs;
  }

  isBlockContainer(): this is BlockContainer {
    return false;
  }

  isRun(): this is Run {
    return false;
  }

  isInline(): this is Inline {
    return false;
  }

  isBreak(): this is Break {
    return false;
  }

  isIfcInline(): this is IfcInline {
    return false;
  }

  isAnonymous() {
    return Boolean(this.attrs & Box.ATTRS.isAnonymous);
  }

  get isRelativeOrStatic() {
    return this.style.position === 'relative'
      || this.style.position === 'static'
      // XXX anonymous boxes won't have a position since position doesn't
      // inherit. Possible this could cause a problem later, so take note
      || this.isAnonymous() && !this.style.position;
  }

  get isAbsolute() {
    return this.style.position === 'absolute';
  }

  get isPositioned() {
    return this.style.position !== 'static';
  }

  get desc() {
    return 'Box';
  }

  get sym() {
    return '◼︎';
  }

  repr(indent = 0, options?: {containingBlocks?: boolean, css?: keyof Style}): string {
    let c = '';

    if (!this.isRun() && this.children.length) {
      c = '\n' + this.children.map(c => c.repr(indent + 1, options)).join('\n');
    }

    let extra = '';

    if (options && options.containingBlocks && this.isBlockContainer()) {
      extra += ` (cb = ${this.containingBlock ? this.containingBlock.id : '(null)'})`;
    }

    if (options && options.css) {
      const css = this.style[options.css];
      extra += ` (${options.css}: ${css && JSON.stringify(css)})`;
    }

    return '  '.repeat(indent) + this.sym + ' ' + this.desc + extra + c;
  }
}

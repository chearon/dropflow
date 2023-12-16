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

export interface ReprOptions {
  containingBlocks?: boolean;
  css?: keyof Style
  paragraphText?: string;
}

export abstract class RenderItem {
  public style: Style;

  constructor(style: Style) {
    this.style = style;
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

  isBox(): this is Box {
    return false;
  }

  abstract desc(options?: ReprOptions): string;

  abstract sym(): string;

  repr(indent = 0, options?: ReprOptions): string {
    let c = '';

    if (this.isIfcInline()) {
      options = {...options};
      options.paragraphText = this.text;
    }

    if (this.isBox() && this.children.length) {
      c = '\n' + this.children.map(c => c.repr(indent + 1, options)).join('\n');
    }

    let extra = '';

    if (options?.containingBlocks && this.isBlockContainer()) {
      extra += ` (cb = ${this.containingBlock ? this.containingBlock.blockContainer.id : '(null)'})`;
    }

    if (options?.css) {
      const css = this.style[options.css];
      extra += ` (${options.css}: ${css && JSON.stringify(css)})`;
    }

    return '  '.repeat(indent) + this.sym() + ' ' + this.desc(options) + extra + c;
  }
}

export class Box extends RenderItem {
  public id: string;
  public children: RenderItem[];
  public attrs: number;

  static ATTRS: {
    isAnonymous: number,
    isInline: number,
    isBfcRoot: number,
    isFloat: number,
    enableLogging: number
  };

  constructor(style: Style, children: RenderItem[], attrs: number) {
    super(style);
    this.id = id();
    this.children = children;
    this.attrs = attrs;
  }

  isBox(): this is Box {
    return true;
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

  desc(options?: ReprOptions) {
    return 'Box';
  }

  sym() {
    return '◼︎';
  }
}

// For some reason the inline `static ATTRS = {}` along with
// useDefineForClassFields generates JS with a syntax error as of typescript 5.0.4
Box.ATTRS = {
  isAnonymous: 1,
  isInline: 1 << 1,
  isBfcRoot: 1 << 2,
  isFloat: 1 << 3,
  enableLogging: 1 << 4
};

import {id} from './util.js';
import {Style} from './cascade.js';
import {Run} from './text.js';
import {Break, Inline, IfcInline, BlockContainer} from './flow.js';

export interface LogicalArea {
  blockStart: number | undefined;
  lineLeft: number | undefined;
  blockSize: number | undefined;
  inlineSize: number | undefined;
}

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
      extra += ` (cb = ${this.containingBlock ? this.containingBlock.box.id : '(null)'})`;
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
  public containingBlock: BoxArea;

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
    this.containingBlock = EmptyContainingBlock;
  }

  isBox(): this is Box {
    return true;
  }

  isAnonymous() {
    return Boolean(this.attrs & Box.ATTRS.isAnonymous);
  }

  getRelativeVerticalShift() {
    const height = this.containingBlock.height;
    let {top, bottom} = this.style;

    if (top !== 'auto') {
      if (typeof top !== 'number') top = height * top.value / 100;
      return top
    } else if (bottom !== 'auto') {
      if (typeof bottom !== 'number') bottom = height * bottom.value / 100;
      return -bottom;
    } else {
      return 0;
    }
  }

  getRelativeHorizontalShift() {
    const {direction, width} = this.containingBlock;
    let {right, left} = this.style;

    if (left !== 'auto' && (right === 'auto' || direction === 'ltr')) {
      if (typeof left !== 'number') left = width * left.value / 100;
      return left
    } else if (right !== 'auto' && (left === 'auto' || direction === 'rtl')) {
      if (typeof right !== 'number') right = width * right.value / 100;
      return -right;
    } else {
      return 0;
    }
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

export class BoxArea {
  parent: BoxArea | null;
  box: Box;
  blockStart: number;
  blockSize: number;
  lineLeft: number;
  inlineSize: number;

  constructor(box: Box, x?: number, y?: number, w?: number, h?: number) {
    this.parent = null;
    this.box = box;
    this.blockStart = y || 0;
    this.blockSize = h || 0;
    this.lineLeft = x || 0;
    this.inlineSize = w || 0;
  }

  clone() {
    return new BoxArea(
      this.box,
      this.lineLeft,
      this.blockStart,
      this.inlineSize,
      this.blockSize
    );
  }

  get writingMode() {
    return this.box.style.writingMode;
  }

  get direction() {
    return this.box.style.direction;
  }

  get x() {
    return this.lineLeft;
  }

  set x(x: number) {
    this.lineLeft = x;
  }

  get y() {
    return this.blockStart;
  }

  set y(y: number) {
    this.blockStart = y;
  }

  get width() {
    return this.inlineSize;
  }

  get height() {
    return this.blockSize;
  }

  setParent(p: BoxArea) {
    this.parent = p;
  }

  inlineSizeForPotentiallyOrthogonal(box: BlockContainer) {
    if (!this.parent) return this.inlineSize; // root area
    if (!this.box.isBlockContainer()) return this.inlineSize; // cannot be orthogonal
    if (
      (this.box.writingModeAsParticipant === 'horizontal-tb') !==
      (box.writingModeAsParticipant === 'horizontal-tb')
    ) {
      return this.blockSize;
    } else {
      return this.inlineSize;
    }
  }

  absolutify() {
    let x, y, width, height;

    if (!this.parent) {
      throw new Error(`Cannot absolutify area for ${this.box.id}, parent was never set`);
    }

    if (this.parent.writingMode === 'vertical-lr') {
      x = this.blockStart;
      y = this.lineLeft;
      width = this.blockSize;
      height = this.inlineSize;
    } else if (this.parent.writingMode === 'vertical-rl') {
      x = this.parent.width - this.blockStart - this.blockSize;
      y = this.lineLeft;
      width = this.blockSize;
      height = this.inlineSize;
    } else { // 'horizontal-tb'
      x = this.lineLeft;
      y = this.blockStart;
      width = this.inlineSize;
      height = this.blockSize;
    }

    this.lineLeft = this.parent.x + x;
    this.blockStart = this.parent.y + y;
    this.inlineSize = width;
    this.blockSize = height;
  }

  repr(indent = 0) {
    const {width: w, height: h, x, y} = this;
    return '  '.repeat(indent) + `⚃ Area ${this.box.id}: ${w}⨯${h} @${x},${y}`;
  }
}

const EmptyContainingBlock = new BoxArea(null!);

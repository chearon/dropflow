import {id} from './util.js';
import {Style, ComputedPlainStyle, WritingMode, Direction} from './cascade.js';
import {Run} from './text.js';
import {Break, Inline, IfcInline, BlockContainer} from './flow.js';

export type LogicalArea = {
  blockStart: number | undefined
  lineLeft: number | undefined
  blockSize: number | undefined
  inlineSize: number | undefined
};

const LogicalMaps = Object.freeze({
  'horizontal-tb': Object.freeze({
    blockStart: 'top',
    lineLeft: 'left',
    blockSize: 'height',
    inlineSize: 'width'
  }),
  'vertical-lr': Object.freeze({
    blockStart: 'left',
    lineLeft: 'top',
    blockSize: 'width',
    inlineSize: 'height'
  }),
  'vertical-rl': Object.freeze({
    blockStart: 'right',
    lineLeft: 'top',
    blockSize: 'width',
    inlineSize: 'height'
  })
});

export class Area {
  id: string;
  writingMode: WritingMode;
  direction: Direction;
  x: number;
  y: number;
  parent: Area | null;
  top: number;
  right: number;
  left: number;
  lrside: 'left' | 'right';
  width: number;
  height: number;

  constructor(id: string, style: ComputedPlainStyle, x?: number, y?: number, w?: number, h?: number) {
    this.id = id;
    this.writingMode = style.writingMode;
    this.direction = style.direction;
    this.x = x || 0;
    this.y = y || 0;
    this.parent = null;
    this.top = 0;
    this.right = 0;
    this.left = 0;
    this.lrside = 'left';
    this.width = w || 0;
    this.height = h || 0;
  }

  setParent(p: Area) {
    this.parent = p;
  }

  // TODO: I could remove the writingMode arguments and use parent.writingMode
  // which would simplify the calling side. or is that what I did originally?

  setBlockStart(writingMode: WritingMode, v: number) {
    const blockStart = LogicalMaps[writingMode].blockStart;
    this[blockStart] = v;
    if (blockStart === 'left' || blockStart === 'right') this.lrside = blockStart;
  }

  getBlockStart(writingMode: WritingMode) {
    return this[LogicalMaps[writingMode].blockStart];
  }

  setLineLeft(writingMode: WritingMode, v: number) {
    const lineLeft = LogicalMaps[writingMode].lineLeft;
    this[lineLeft] = v;
    if (lineLeft === 'left') this.lrside = lineLeft;
  }

  getLineLeft(writingMode: WritingMode) {
    return this[LogicalMaps[writingMode].lineLeft];
  }

  setBlockSize(writingMode: WritingMode, v: number) {
    this[LogicalMaps[writingMode].blockSize] = v;
  }

  getBlockSize(writingMode: WritingMode) {
    return this[LogicalMaps[writingMode].blockSize];
  }

  setInlineSize(writingMode: WritingMode, v: number) {
    this[LogicalMaps[writingMode].inlineSize] = v;
  }

  getInlineSize(writingMode: WritingMode) {
    return this[LogicalMaps[writingMode].inlineSize];
  }

  absolutify() {
    if (!this.parent) {
      throw new Error(`Cannot absolutify area ${this.id}, parent was never set`);
    }

    const {width: pwidth, x: px, y: py} = this.parent;

    if (this.lrside === 'left') {
      this.x = px + this.left;
    } else {
      this.x = px + pwidth - this.right - this.width;
    }

    this.y = py + this.top;
  }

  repr(indent = 0) {
    const {width: w, height: h, x, y} = this;
    const {top: t, left: l} = this;
    const p1 = `${t ?? '-'},${l ?? '-'}`;
    return '  '.repeat(indent) + `⚃ Area ${this.id}: inset: ${p1} → ${w}⨯${h} @${x},${y}`;
  }
}

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

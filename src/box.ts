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
  x = 0;
  y = 0;
  parent?: Area;
  top?: number;
  right?: number;
  left?: number;
  width?: number;
  height?: number;

  constructor(id: string, style: ComputedPlainStyle, x?: number, y?: number, w?: number, h?: number) {
    this.id = id;
    this.writingMode = style.writingMode;
    this.direction = style.direction;

    if (x != null && y != null && w != null && h != null) {
      [this.x, this.y, this.width, this.height] = [x, y, w, h];
    }
  }

  setParent(p: Area) {
    this.parent = p;
  }

  setBlockStart(writingMode: WritingMode, v: number) {
    this[LogicalMaps[writingMode].blockStart] = v;
  }

  getBlockStart(writingMode: WritingMode) {
    return this[LogicalMaps[writingMode].blockStart];
  }

  setLineLeft(writingMode: WritingMode, v: number) {
    this[LogicalMaps[writingMode].lineLeft] = v;
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

    if (this.parent.width == null || this.parent.height == null) {
      throw new Error(`Cannot absolutify area ${this.id}, parent (${this.parent.id}) was not absolutified`);
    }

    if (this.width == null || this.height == null) {
      throw new Error(`Cannot absolutify area ${this.id}: indeterminate size`);
    }

    if (this.left == null && this.right == null) {
      throw new Error(`Cannot absolutify area ${this.id}: no horizontal position`);
    }

    if (this.top == null) {
      throw new Error(`Cannot absolutify area ${this.id}: no vertical position`);
    }

    const {width: pwidth, x: px, y: py} = this.parent;

    if (this.left != null) this.x = px + this.left;
    if (this.right != null) this.x = px + pwidth - this.right - this.width;

    if (this.top != null) this.y = py + this.top;
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
  public containingBlock: Area | null = null;

  public borderArea: Area;
  public paddingArea: Area;
  public contentArea: Area;

  public static ATTRS = {
    isAnonymous: 1,
    isInline: 1 << 1,
    isBfcRoot: 1 << 2,
    isFloat: 1 << 3,
  };

  constructor(style: Style, children: Box[], attrs: number) {
    this.id = id();
    this.style = style;
    this.children = children;
    this.attrs = attrs;

    this.borderArea = new Area(this.id + 'b', style);
    this.paddingArea = new Area(this.id + 'p', style);
    this.contentArea = new Area(this.id + 'c', style);
    this.paddingArea.setParent(this.borderArea);
    this.contentArea.setParent(this.paddingArea);
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

  absolutify() {
    this.borderArea.absolutify();
    this.paddingArea.absolutify();
    this.contentArea.absolutify();
    for (const c of this.children) {
      c.absolutify();
    }
  }

  setBlockPosition(position: number) {
    if (!this.containingBlock) {
      throw new Error(`Inline layout called too early on ${this.id}: no containing block`);
    }

    const writingMode = this.containingBlock.writingMode;
    const borderBlockStartWidth = this.style.getBorderBlockStartWidth(writingMode);
    const paddingBlockStart = this.style.getPaddingBlockStart(writingMode);

    this.borderArea.setBlockStart(writingMode, position);
    this.paddingArea.setBlockStart(writingMode, borderBlockStartWidth);
    this.contentArea.setBlockStart(writingMode, paddingBlockStart);
  }

  setBlockSize(size: number) {
    if (!this.containingBlock) {
      throw new Error(`Inline layout called too early on ${this.id}: no containing block`);
    }

    const writingMode = this.containingBlock.writingMode;
    const borderBlockStartWidth = this.style.getBorderBlockStartWidth(writingMode);
    const paddingBlockStart = this.style.getPaddingBlockStart(writingMode);
    const paddingBlockEnd = this.style.getPaddingBlockEnd(writingMode);
    const borderBlockEndWidth = this.style.getBorderBlockEndWidth(writingMode);

    this.contentArea.setBlockSize(writingMode, size);

    const paddingSize = size + paddingBlockStart + paddingBlockEnd
    this.paddingArea.setBlockSize(writingMode, paddingSize);

    const borderSize = paddingSize + borderBlockStartWidth + borderBlockEndWidth;
    this.borderArea.setBlockSize(writingMode, borderSize);
  }

  setInlinePosition(lineLeft: number) {
    if (!this.containingBlock) {
      throw new Error(`Inline layout called too early on ${this.id}: no containing block`);
    }

    const writingMode = this.containingBlock.writingMode;
    const borderLineLeftWidth = this.style.getBorderLineLeftWidth(writingMode);
    const paddingLineLeft = this.style.getPaddingLineLeft(writingMode);

    this.borderArea.setLineLeft(writingMode, lineLeft);
    this.paddingArea.setLineLeft(writingMode, borderLineLeftWidth);
    this.contentArea.setLineLeft(writingMode, paddingLineLeft);
  }

  setInlineOuterSize(size: number) {
    if (!this.containingBlock) {
      throw new Error(`Inline layout called too early on ${this.id}: no containing block`);
    }

    const writingMode = this.containingBlock.writingMode;
    const borderLineLeftWidth = this.style.getBorderLineLeftWidth(writingMode);
    const paddingLineLeft = this.style.getPaddingLineLeft(writingMode);
    const paddingLineRight = this.style.getPaddingLineRight(writingMode);
    const borderLineRightWidth = this.style.getBorderLineRightWidth(writingMode);

    this.borderArea.setInlineSize(writingMode, size);

    const paddingSize = size - borderLineLeftWidth - borderLineRightWidth;
    this.paddingArea.setInlineSize(writingMode, paddingSize);

    const contentSize = paddingSize - paddingLineLeft - paddingLineRight;
    this.contentArea.setInlineSize(writingMode, contentSize);
  }

  repr(indent = 0, options?: {containingBlocks?: boolean, css?: keyof Style}): string {
    let c = '';

    if (!this.isRun() && this.children.length) {
      c = '\n' + this.children.map(c => c.repr(indent + 1, options)).join('\n');
    }

    let extra = '';

    if (options && options.containingBlocks && (this.isBlockContainer() || this.isInline())) {
      extra += ` (cb = ${this.containingBlock ? this.containingBlock.id : '(null)'})`;
    }

    if (options && options.css) {
      const css = this.style[options.css];
      extra += ` (${options.css}: ${css && JSON.stringify(css)})`;
    }

    return '  '.repeat(indent) + this.sym + ' ' + this.desc + extra + c;
  }
}

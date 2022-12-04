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

const overspecified = (a: Area, side: string) => new Error(
  `Cannot set ${side} on area ${a.id} because this dimension is already ` +
  'locked-in (must choose two of width, left, right, for example)'
);

export class Area {
  id: string;
  writingMode: WritingMode;
  direction: Direction;
  x = 0;
  y = 0;
  parent?: Area;

  private spec: {
    t?: number;
    r?: number;
    l?: number;
    w?: number;
    h?: number;
  } = {};

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

  set top(v: number | undefined) {
    this.spec.t = v;
  }

  get top() {
    return this.spec.t;
  }

  set right(v: number | undefined) {
    if (this.spec.l != null) throw overspecified(this, 'right');
    this.spec.r = v;
  }

  get right() {
    return this.spec.r;
  }

  set left(v: number | undefined) {
    if (this.spec.r != null) throw overspecified(this, 'left');
    this.spec.l = v;
  }

  get left() {
    return this.spec.l;
  }

  set width(v: number | undefined) {
    this.spec.w = v;
  }

  set height(v: number | undefined) {
    this.spec.h = v;
  }

  get width():number | undefined {
    return this.spec.w;
  }

  get height():number | undefined {
    return this.spec.h;
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

    if (this.spec.l == null && this.spec.r == null) {
      throw new Error(`Cannot absolutify area ${this.id}: no horizontal position`);
    }

    if (this.spec.t == null) {
      throw new Error(`Cannot absolutify area ${this.id}: no vertical position`);
    }

    const {width: pwidth, x: px, y: py} = this.parent;

    if (this.spec.l != null) this.x = px + this.spec.l;
    if (this.spec.r != null) this.x = px + pwidth - this.spec.r - this.width;

    if (this.spec.t != null) this.y = py + this.spec.t;
  }

  repr(indent = 0) {
    const {width: w, height: h, x, y} = this;
    const {t, l} = this.spec;
    const p1 = `${t ?? '-'},${l ?? '-'}`;
    return '  '.repeat(indent) + `⚃ Area ${this.id}: inset: ${p1} → ${w}⨯${h} @${x},${y}`;
  }
}

type DescendIf = (box: Box) => boolean;

type DescendState = Iterable<['pre' | 'post', Box]>;

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
    const style = this.style.createLogicalView(writingMode);

    this.borderArea.setBlockStart(writingMode, position);
    this.paddingArea.setBlockStart(writingMode, style.borderBlockStartWidth);
    this.contentArea.setBlockStart(writingMode, style.paddingBlockStart);
  }

  setBlockSize(size: number) {
    if (!this.containingBlock) {
      throw new Error(`Inline layout called too early on ${this.id}: no containing block`);
    }

    const writingMode = this.containingBlock.writingMode;
    const style = this.style.createLogicalView(writingMode);

    this.contentArea.setBlockSize(writingMode, size);

    const paddingSize = size + style.paddingBlockStart + style.paddingBlockEnd
    this.paddingArea.setBlockSize(writingMode, paddingSize);

    const borderSize = paddingSize + style.borderBlockStartWidth + style.borderBlockEndWidth;
    this.borderArea.setBlockSize(writingMode, borderSize);
  }

  setInlinePosition(lineLeft: number) {
    if (!this.containingBlock) {
      throw new Error(`Inline layout called too early on ${this.id}: no containing block`);
    }

    const writingMode = this.containingBlock.writingMode;
    const style = this.style.createLogicalView(writingMode);

    this.borderArea.setLineLeft(writingMode, lineLeft);
    this.paddingArea.setLineLeft(writingMode, style.borderLineLeftWidth);
    this.contentArea.setLineLeft(writingMode, style.paddingLineLeft);
  }

  setInlineOuterSize(size: number) {
    if (!this.containingBlock) {
      throw new Error(`Inline layout called too early on ${this.id}: no containing block`);
    }

    const writingMode = this.containingBlock.writingMode;
    const style = this.style.createLogicalView(writingMode);

    this.borderArea.setInlineSize(writingMode, size);

    const paddingSize = size - style.borderLineLeftWidth - style.borderLineRightWidth;
    this.paddingArea.setInlineSize(writingMode, paddingSize);

    const contentSize = paddingSize - style.paddingLineLeft - style.paddingLineRight;
    this.contentArea.setInlineSize(writingMode, contentSize);
  }

  *descendents(boxIf?: DescendIf, subtreeIf?: DescendIf): DescendState {
    if (this.children) {
      for (const child of this.children) {
        let skipChild = false;

        if (boxIf && !boxIf(child)) {
          skipChild = true;
          break;
        }

        if (skipChild) continue;

        yield ['pre', child];

        let skipSubtree = false;

        if (subtreeIf && !subtreeIf(child)) {
          skipSubtree = true;
          break;
        }

        if (!skipSubtree) {
          yield* child.descendents(boxIf, subtreeIf);
        }

        yield ['post', child];
      }
    }
  }

  repr(indent = 0, options?: {containingBlocks?: boolean, css?: keyof Style}) {
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

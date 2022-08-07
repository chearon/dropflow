import {id} from './util';
import {Style, ComputedPlainStyle, WritingMode, Direction} from './cascade';
import {Run} from './text';
import {Break, Inline, IfcInline, BlockContainer} from './flow';

export type LogicalArea = {
  blockStart: number | undefined
  blockEnd: number | undefined
  inlineStart: number | undefined
  inlineEnd: number | undefined
  blockSize: number | undefined
  inlineSize: number | undefined
};

const horizontalTb = (area: Area):LogicalArea => ({
  get blockStart() { return area.top; },
	set blockStart(v) { area.top = v; },
  get blockEnd() { return area.bottom; },
  set blockEnd(v) { area.bottom = v; },
  get inlineStart() { return area.left; },
  set inlineStart(v) { area.left = v; },
  get inlineEnd() { return area.right; },
  set inlineEnd(v) { area.right = v; },
  get blockSize() { return area.height; },
  set blockSize(v) { area.height = v; },
  get inlineSize() { return area.width; },
  set inlineSize(v) { area.width = v; }
});

const verticalLr = (area: Area):LogicalArea => ({
  get blockStart() { return area.left; },
  set blockStart(v) { area.left = v; },
  get blockEnd() { return area.right; },
  set blockEnd(v) { area.right = v; },
  get inlineStart() { return area.top; },
  set inlineStart(v) { area.top = v; },
  get inlineEnd() { return area.bottom; },
  set inlineEnd(v) { area.bottom = v; },
  get blockSize() { return area.width; },
  set blockSize(v) { area.width = v; },
  get inlineSize() { return area.height; },
  set inlineSize(v) { area.height = v; }
});

const verticalRl = (area: Area):LogicalArea => ({
  get blockStart() { return area.right; },
  set blockStart(v) { area.right = v; },
  get blockEnd() { return area.left; },
  set blockEnd(v) { area.left = v; },
  get inlineStart() { return area.top; },
  set inlineStart(v) { area.top = v; },
  get inlineEnd() { return area.bottom; },
  set inlineEnd(v) { area.bottom = v; },
  get blockSize() { return area.width; },
  set blockSize(v) { area.width = v; },
  get inlineSize() { return area.height; },
  set inlineSize(v) { area.height = v; }
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
    b?: number;
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
    if (this.spec.b != null && this.spec.h != null) throw overspecified(this, 'top');
    this.spec.t = v;
  }

  get top() {
    if (this.spec.t != null) return this.spec.t;
    if (this.spec.b != null && this.spec.h != null && this.parent && this.parent.height != null) {
      return this.parent.height - this.spec.b - this.spec.h;
    }
  }

  set right(v: number | undefined) {
    if (this.spec.l != null && this.spec.w != null) throw overspecified(this, 'right');
    this.spec.r = v;
  }

  get right() {
    if (this.spec.r != null) return this.spec.r;
    if (this.spec.l != null && this.spec.w != null && this.parent && this.parent.width != null) {
      return this.parent.width - this.spec.l - this.spec.w;
    }
  }

  set bottom(v: number | undefined) {
    if (this.spec.t != null && this.spec.h != null) throw overspecified(this, 'bottom');
    this.spec.b = v;
  }

  get bottom() {
    if (this.spec.b != null) return this.spec.b;
    if (this.spec.t != null && this.spec.h != null && this.parent && this.parent.height != null) {
      return this.parent.height - this.spec.t - this.spec.h;
    }
  }

  set left(v: number | undefined) {
    if (this.spec.r != null && this.spec.w != null) throw overspecified(this, 'left');
    this.spec.l = v;
  }

  get left() {
    if (this.spec.l != null) return this.spec.l;
    if (this.spec.r != null && this.spec.w != null && this.parent && this.parent.width != null) {
      return this.parent.width - this.spec.r - this.spec.w;
    }
  }

  set width(v: number | undefined) {
    if (this.spec.l != null && this.spec.r != null) throw overspecified(this, 'width');
    this.spec.w = v;
  }

  set height(v: number | undefined) {
    if (this.spec.t != null && this.spec.b != null) throw overspecified(this, 'height');
    this.spec.h = v;
  }

  get width():number | undefined {
    if (this.spec.w != null) return this.spec.w;
    if (this.spec.l != null && this.spec.r != null && this.parent && this.parent.width != null) {
      return this.parent.width - this.spec.l - this.spec.r;
    }
  }

  get height():number | undefined {
    if (this.spec.h != null) return this.spec.h;
    if (this.spec.t != null && this.spec.b != null && this.parent && this.parent.height != null) {
      return this.parent.height - this.spec.t - this.spec.b;
    }
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

    if (this.spec.t == null && this.spec.b == null) {
      throw new Error(`Cannot absolutify area ${this.id}: no vertical position`);
    }

    const {width: pwidth, height: pheight, x: px, y: py} = this.parent;

    if (this.spec.l != null) this.x = px + this.spec.l;
    if (this.spec.r != null) this.x = px + pwidth - this.spec.r - this.width;

    if (this.spec.t != null) this.y = py + this.spec.t;
    if (this.spec.b != null) this.y = py + pheight - this.spec.b - this.height;
  }

  createLogicalView(writingMode: WritingMode) {
    return writingMode === 'horizontal-tb' ? horizontalTb(this)
      : writingMode === 'vertical-lr' ? verticalLr(this)
      : verticalRl(this);
  }

  repr(indent = 0) {
    const {width: w, height: h, x, y} = this;
    const {t, r, b, l} = this.spec;
    const p1 = `${t ?? '-'} ${r ?? '-'} ${b ?? '-'} ${l ?? '-'}`;
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

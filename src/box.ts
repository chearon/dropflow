import {id} from './util';
import {Style} from './cascade';
import {Run} from './text';
import {
  Inline,
  IfcInline,
  BlockContainer,
  BlockBox,
  BlockContainerOfIfc,
  BlockContainerOfBlockBoxes,
  BlockLevelBfcBlockContainer,
  InlineLevelBfcBlockContainer,
  LayoutContext
} from './flow';

export type LogicalArea = {
  blockStart: number
  blockEnd: number
  inlineStart: number
  inlineEnd: number
  blockSize: number | undefined
  inlineSize: number | undefined
};

// TODO uh, the getters are never invoked, and if they did they would return
// undefined!? not sure how TS allows setters but no getters on Area
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

export type WritingMode = 'horizontal-tb' | 'vertical-lr' | 'vertical-rl';

const throwOverSpecified = (a: Area, side: string) => new Error(
  `Cannot set ${side} on area ${a.id} because this dimension is already ` +
  'locked-in (must choose two of width, left, right, for example)'
);

export class Area {
  id: string;
  x = 0;
  y = 0;
  w = 0;
  h = 0;
  parent?: Area;

  private spec: {
    t?: number;
    r?: number;
    b?: number;
    l?: number;
    w?: number;
    h?: number;
  } = {};

  private hasAbsolutified = false;

  constructor(id: string, x?: number, y?: number, w?: number, h?: number) {
    this.id = id;

    if (x != null && y != null && w != null && h != null) {
      [this.x, this.y, this.w, this.h] = [x, y, w, h];
      this.hasAbsolutified = true;
    }
  }

  setParent(p: Area) {
    this.parent = p;
  }

  set top(v: number) {
    if (this.spec.b != null && this.spec.h != null) {
      throwOverSpecified(this, 'top');
    }
    this.spec.t = v;
  }

  set right(v: number) {
    if (this.spec.l != null && this.spec.w != null) {
      throwOverSpecified(this, 'right');
    }
    this.spec.r = v;
  }

  set bottom(v: number) {
    if (this.spec.t != null && this.spec.h != null) {
      throwOverSpecified(this, 'bottom');
    }
    this.spec.b = v;
  }

  set left(v: number) {
    if (this.spec.r != null && this.spec.w != null) {
      throwOverSpecified(this, 'left');
    }
    this.spec.l = v;
  }

  set width(v: number | undefined) {
    if (this.spec.l != null && this.spec.r != null) {
      throwOverSpecified(this, 'width');
    }
    this.spec.w = v;
  }

  set height(v: number | undefined) {
    if (this.spec.t != null && this.spec.b != null) {
      throwOverSpecified(this, 'height');
    }
    this.spec.h = v;
  }

  get width():number | undefined {
    if (this.hasAbsolutified) return this.w;
    if (this.spec.w != null) return this.spec.w;
    if (this.spec.l != null && this.spec.r != null && this.parent && this.parent.width != null) {
      return this.parent.width - this.spec.l - this.spec.r;
    }
  }

  get height():number | undefined {
    if (this.hasAbsolutified) return this.h;
    if (this.spec.h != null) return this.spec.h;
    if (this.spec.t != null && this.spec.b != null && this.parent && this.parent.height != null) {
      return this.parent.height - this.spec.t - this.spec.b;
    }
  }

  absolutify() {
    if (!this.parent) {
      throw new Error(`Cannot absolutify area ${this.id}, parent was never set`);
    }

    if (!this.parent.hasAbsolutified) {
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

    const {w: pw, h: ph, x: px, y: py} = this.parent;

    if (this.spec.l != null) this.x = px + this.spec.l;
    if (this.spec.r != null) this.x = px + pw - this.spec.r - this.width;

    if (this.spec.t != null) this.y = py + this.spec.t;
    if (this.spec.b != null) this.y = py + ph - this.spec.b - this.height;

    this.w = this.width;
    this.h = this.height;

    this.hasAbsolutified = true;
  }

  createLogicalView(writingMode: WritingMode) {
    return writingMode === 'horizontal-tb' ? horizontalTb(this)
		: writingMode === 'vertical-lr' ? verticalLr(this)
		: verticalRl(this);
  }

  repr(indent = 0) {
    const {w, h, x, y} = this;
    const {t, r, b, l} = this.spec;
    const p1 = `${t ?? 'x'} ${r ?? 'x'} ${b ?? 'x'} ${l ?? 'x'}`;
    return '  '.repeat(indent) + `⚃ Area ${this.id}: ${p1} → ${w}⨯${h} @${x},${y}`;
  }
}

type DescendIf = (box: Box) => boolean;

type DescendState = Iterable<['pre' | 'post', Box]>;

export class Box {
  public id: string;
  public style: Style;
  public children: Box[];
  public isAnonymous: boolean;
  public containingBlock: Area | null = null;

  public borderArea: Area;
  public paddingArea: Area;
  public contentArea: Area;

  constructor(style: Style, children: Box[], isAnonymous: boolean) {
    this.id = id();
    this.style = style;
    this.children = children;
    this.isAnonymous = isAnonymous;

    this.borderArea = new Area(this.id + 'b');
    this.paddingArea = new Area(this.id + 'p');
    this.contentArea = new Area(this.id + 'c');
    this.paddingArea.setParent(this.borderArea);
    this.contentArea.setParent(this.paddingArea);
  }

  isBlockContainer(): this is BlockContainer {
    return false;
  }

  isBlockContainerOfIfc(): this is BlockContainerOfIfc {
    return false;
  }

  isBlockBox(): this is BlockBox {
    return false;
  }

  isBlockContainerOfBlockBoxes(): this is BlockContainerOfBlockBoxes {
    return false;
  }

  isBlockLevelBfcBlockContainer(): this is BlockLevelBfcBlockContainer {
    return false;
  }

  isInlineLevelBfcBlockContainer(): this is InlineLevelBfcBlockContainer {
    return false;
  }

  isRun(): this is Run {
    return false;
  }

  isInline(): this is Inline {
    return false;
  }

  isIfcInline(): this is IfcInline {
    return false;
  }

  get isRelativeOrStatic() {
    return this.style.position === 'relative'
      || this.style.position === 'static'
      // XXX anonymous boxes won't have a position since position doesn't
      // inherit. Possible this could cause a problem later, so take note
      || this.isAnonymous && !this.style.position;
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

  assignContainingBlocks(ctx: LayoutContext) {
    // CSS2.2 10.1
    if (this.isRelativeOrStatic) {
      this.containingBlock = ctx.lastBlockContainerArea;
    } else if (this.isAbsolute) {
      this.containingBlock = ctx.lastPositionedArea;
    } else {
      throw new Error(`Could not assign a containing block to box ${this.id}`);
    }

    this.borderArea.setParent(this.containingBlock);

    if (this.isBlockContainer()) {
      ctx.lastBlockContainerArea = this.contentArea;
    }

    if (this.isPositioned) {
      ctx.lastPositionedArea = this.paddingArea;
    }
  }

  absolutify() {
    this.borderArea.absolutify();
    this.paddingArea.absolutify();
    this.contentArea.absolutify();
    for (const c of this.children) {
      if (c.isInline()) continue; // TODO set inline offsets in doTextLayout?
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

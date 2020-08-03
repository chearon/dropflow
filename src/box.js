import {id} from './util';

const LOGICAL_TO_PHYSICAL_AREA_MAP_HORIZONTAL_TB = {
  blockStart: 'top',
  blockEnd: 'bottom',
  inlineStart: 'left',
  inlineEnd: 'right',
  blockSize: 'height',
  inlineSize: 'width'
};

const LOGICAL_TO_PHYSICAL_AREA_MAP_VERTICAL_LR = {
  blockStart: 'left',
  blockEnd: 'right',
  inlineStart: 'top',
  inlineEnd: 'bottom',
  blockSize: 'width',
  inlineSize: 'height'
};

const LOGICAL_TO_PHYSICAL_AREA_MAP_VERTICAL_RL = {
  blockStart: 'right',
  blockEnd: 'left',
  inlineStart: 'top',
  inlineEnd: 'bottom',
  blockSize: 'width',
  inlineSize: 'height'
};

export class Area {
  constructor(id, x = null, y = null, w = null, h = null) {
    this.id = id;
    this.parent = null;

    // physical
    this.x = x;
    this.y = y;
    this._width = w;
    this._height = h;

    // relative
    this._left = null;
    this._right = null;
    this._top = null;
    this._bottom = null;
  }

  isHorizontallySpecified() {
    const n = (this._left != null ? 1 : 0) + (this._right != null ? 1 : 0) + (this._width != null ? 1 : 0);
    return n === 2;
  }

  isVerticallySpecified() {
    const n = (this._top != null ? 1 : 0) + (this._bottom != null ? 1 : 0) + (this._height != null ? 1 : 0);
    return n === 2;
  }

  throwIfHorizontallySpecified() {
    if (this.isHorizontallySpecified()) throw new Error(`Tried to over-specify area ${this.id}`);
  }

  throwIfVerticallySpecified() {
    if (this.isVerticallySpecified()) throw new Error(`Tried to over-specify area ${this.id}`);
  }

  get left() {
    return this._left;
  }

  set left(l) {
    if (this._left == null) this.throwIfHorizontallySpecified();
    return this._left = l;
  }

  get right() {
    return this._right;
  }

  set right(r) {
    if (this._right == null) this.throwIfHorizontallySpecified();
    return this._right = r;
  }

  get width() {
    if (this._width == null) {
      if (!this.parent || this.parent.width == null) return null;
      if (this._left == null || this._right == null) return null;
      return this.parent.width - this._left - this._right;
    } else {
      return this._width;
    }
  }

  set width(w) {
    if (this._width == null) this.throwIfHorizontallySpecified();
    return this._width = w;
  }

  get top() {
    return this._top;
  }

  set top(t) {
    if (this._top == null) this.throwIfVerticallySpecified();
    return this._top = t;
  }

  get bottom() {
    return this._bottom;
  }

  set bottom(b) {
    if (this._bottom == null) this.throwIfVerticallySpecified();
    return this._bottom = b;
  }

  get height() {
    if (this._height == null) {
      if (!this.parent || this.parent.height == null) return null;
      if (this._top == null || this._bottom == null) return null;
      return this.parent.height - this._top - this._bottom;
    } else {
      return this._height;
    }
  }

  set height(h) {
    if (this._height == null) this.throwIfVerticallySpecified();
    return this._height = h;
  }

  setParent(parent) {
    if (!parent) throw new Error(`Cannot set null parent on ${this.id}`);
    this.parent = parent;
  }

  isFinal() { // has absolutify been called?
    return this.x != null && this.y != null && this.width != null && this.height != null;
  }

  absolutify() {
    if (!this.parent || !this.parent.isFinal()) {
      throw new Error(`Cannot absolutify area ${this.id}, parent is not ready`);
    }

    if (!this.isHorizontallySpecified()) {
      throw new Error(`Cannot absolutify area ${this.id}, horizontally under-specified`);
    }

    if (!this.isVerticallySpecified()) {
      throw new Error(`Cannot absolutify area ${this.id}, vertically under-specified`);
    }

    this.x = this.parent.x;
    this.x += this.left == null ? this.parent.width - this.right - this.width : this.left;

    this.y = this.parent.y;
    this.y += this.top == null ? this.parent.height - this.bottom - this.height : this.top;
  }

  createLogicalView(writingMode) {
    const map =
      writingMode === 'horizontal-tb' ? LOGICAL_TO_PHYSICAL_AREA_MAP_HORIZONTAL_TB :
      writingMode === 'vertical-lr' ? LOGICAL_TO_PHYSICAL_AREA_MAP_VERTICAL_LR :
      writingMode === 'vertical-rl' ? LOGICAL_TO_PHYSICAL_AREA_MAP_VERTICAL_RL :
      undefined;

    if (!map) throw new Error(`writing mode ${writingMode} unknown`);

    return {
      get: prop => {
        if (!(prop in map)) throw new Error(`\`${prop}\` has no physical mapping`);
        return this[map[prop]];
      },
      set: (prop, val) => {
        if (!(prop in map)) throw new Error(`\`${prop}\` has no physical mapping`);
        return this[map[prop]] = val;
      }
    };
  }
}

export class Box {
  constructor() {
    this.id = id();

    // must be set by child classes in the ctor
    this.style = null;
    this.children = null;
    this.isAnonymous = null;

    this.containingBlock = null;
    this.borderArea = new Area(this.id + 'b');
    this.paddingArea = new Area(this.id + 'p');
    this.contentArea = new Area(this.id + 'c');
    this.paddingArea.setParent(this.borderArea);
    this.contentArea.setParent(this.paddingArea);
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

  assignContainingBlocks(cbstate) {
    // CSS2.2 10.1
    if (this.isRelativeOrStatic) {
      this.containingBlock = cbstate.lastBlockContainerArea;
    } else if (this.isAbsolute) {
      this.containingBlock = cbstate.lastPositionedArea;
    } else {
      throw new Error(`Could not assign a containing block to box ${this.id}`);
    }

    cbstate = Object.assign({}, cbstate);
    this.borderArea.setParent(this.containingBlock);

    if (this.isBlockContainer) {
      cbstate.lastBlockContainerArea = this.contentArea;
    }

    if (this.isPositioned) {
      cbstate.lastPositionedArea = this.paddingArea;
    }

    for (const child of this.children) {
      if (!child.isRun) child.assignContainingBlocks(cbstate);
    }
  }

  absolutify() {
    this.borderArea.absolutify();
    this.paddingArea.absolutify();
    this.contentArea.absolutify();
    for (const c of this.children) c.absolutify();
  }

  *descendents(boxIf = {}, subtreeIf = {}) {
    if (this.children) {
      for (const child of this.children) {
        let skipChild = false;

        for (const [key, val] of Object.entries(boxIf)) {
          if (child[key] !== val) {
            skipChild = true;
            break;
          }
        }

        if (skipChild) continue;

        yield ['pre', child];

        let skipSubtree = false;

        for (const [key, val] of Object.entries(subtreeIf)) {
          if (child[key] !== val) {
            skipSubtree = true;
            break;
          }
        }

        if (!skipSubtree) {
          yield* child.descendents(boxIf, subtreeIf);
        }

        yield ['post', child];
      }
    }
  }

  repr(indent = 0, options) {
    let c = '';

    if (!this.isRun) {
      c = '\n' + this.children.map(c => c.repr(indent + 1, options)).join('\n');
    }

    let extra = '';

    if (options && options.containingBlocks && (this.isBlockContainer || this.isInline)) {
      extra += ` (cb = ${this.containingBlock.id})`;
    }

    return '  '.repeat(indent) + this.sym + ' ' + this.desc + extra + c;
  }
}


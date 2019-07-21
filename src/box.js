import {id} from './util';

export class Area {
  constructor(id, l = null, t = null, w = null, h = null) {
    this.id = id;
    this.left = l;
    this.top = t;
    this.width = w;
    this.height = h;
  }
}

export class Box {
  constructor() {
    this.id = id();

    // must be set by child classes in the ctor
    this.style = null;
    this.children = null;
    this.isAnonymous = null;

    // gets set during layout
    this.containingBlock = null;
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


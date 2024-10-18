import {id} from './util.js';
import {Style} from './style.js';
import {Run} from './layout-text.js';
import {Break, Inline, IfcInline, BlockContainer} from './layout-flow.js';

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
  bits?: boolean;
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

  /**
   * A layer is a stacking context root or an element that CSS 2.1 appendix E
   * says to treat like one.
   */
  isLayerRoot(): boolean {
    return this.isBlockContainer() && this.isFloat() || this.isBox() && this.isPositioned();
  }

  /**
   * Does this paint anything in the background layer? Borders, box-shadow, etc.
   */
  hasBackground() {
    return false;
  }

  /**
   * Does this paint anything in the foreground layer? Text, images, etc.
   */
  hasForeground() {
    return false;
  }

  /**
   * There is a background in some descendent that is part of the same paint
   * layer (not necessarily in the subject). (See also isLayerRoot).
   *
   * A background is a background-color or anything CSS 2.1 appendix E groups
   * with it.
   */
  hasBackgroundInLayerRoot() {
    return false;
  }

  /**
   * There is a foreground in some descendent that is part of the same paint
   * layer (not necessarily in the subject). (See also isLayerRoot).
   *
   * A foreground is a text run or anything CSS 2.1 appendix E groups with it
   */
  hasForegroundInLayerRoot() {
    return false;
  }

  /**
   * There is a background somewhere beneath this node
   *
   * A background is a background-color or anything CSS 2.1 appendix E groups
   * with it
   */
  hasBackgroundInDescendent() {
    return false;
  }

  /**
   * There is a foreground somewhere beneath this node
   *
   * A foreground is a text run or anything CSS 2.1 appendix E groups with it
   */
  hasForegroundInDescendent() {
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

    if (options?.bits && this.isBox()) {
      extra += ` (bf: ${this.stringifyBitfield()})`;
    }

    return '  '.repeat(indent) + this.sym() + ' ' + this.desc(options) + extra + c;
  }

  preprocess() {
    // should be overridden
  }
}

export class Box extends RenderItem {
  public id: string;
  public children: RenderItem[];
  public containingBlock: BoxArea;
  /**
   * General bitfield for booleans. The first 8 are reserved for attributes
   * belonging to Box. The latter 24 can be used by subclasses.
   */
  protected bitfield: number;

  static ATTRS = {
    isAnonymous:               1 << 0,
    enableLogging:             1 << 1,
    reserved1:                 1 << 2, // this padding makes the logs easier to
    reserved2:                 1 << 3, // read (distinguish attrs from has bits)
    hasBackgroundInLayer:      1 << 4,
    hasForegroundInLayer:      1 << 5,
    hasBackgroundInDescendent: 1 << 6,
    hasForegroundInDescendent: 1 << 7
  };

  static BITFIELD_END = 8;

  constructor(style: Style, children: RenderItem[], attrs: number) {
    super(style);
    this.id = id();
    this.children = children;
    this.bitfield = attrs;
    this.containingBlock = EmptyContainingBlock;
  }

  preprocess() {
    for (const child of this.children) {
      child.preprocess();

      if (!child.isLayerRoot()) {
        if (child.hasBackground() || child.hasBackgroundInLayerRoot()) {
          this.bitfield |= Box.ATTRS.hasBackgroundInLayer;
        }

        if (child.hasForeground() || child.hasForegroundInLayerRoot()) {
          this.bitfield |= Box.ATTRS.hasForegroundInLayer;
        }
      }

      if (child.hasBackground() || child.hasBackgroundInDescendent()) {
        this.bitfield |= Box.ATTRS.hasBackgroundInDescendent;
      }

      if (child.hasForeground() || child.hasForegroundInDescendent()) {
        this.bitfield |= Box.ATTRS.hasForegroundInDescendent;
      }
    }
  }

  isBox(): this is Box {
    return true;
  }

  isAnonymous() {
    return Boolean(this.bitfield & Box.ATTRS.isAnonymous);
  }

  isPositioned() {
    return this.style.position !== 'static';
  }

  isStackingContextRoot() {
    return this.isPositioned() && this.style.zIndex !== 'auto';
  }

  hasBackgroundInLayerRoot() {
    return Boolean(this.bitfield & Box.ATTRS.hasBackgroundInLayer);
  }

  hasForegroundInLayerRoot() {
    return Boolean(this.bitfield & Box.ATTRS.hasForegroundInLayer);
  }

  hasBackgroundInDescendent() {
    return Boolean(this.bitfield & Box.ATTRS.hasBackgroundInDescendent);
  }

  hasForegroundInDescendent() {
    return Boolean(this.bitfield & Box.ATTRS.hasForegroundInDescendent);
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

  stringifyBitfield() {
    const thirty2 = this.bitfield.toString(2);
    let s = '';
    for (let i = thirty2.length - 1; i >= 0; i--) {
      s = thirty2[i] + s;
      if (i > 0 && (s.length - 4) % 5 === 0) s = '_' + s;
    }
    s = '0b' + s;
    return s;
  }
}

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

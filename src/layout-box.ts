import {id, Logger} from './util.js';
import {Style} from './style.js';
import {Run} from './layout-text.js';
import {Break, Inline, IfcInline, BlockContainer, InlineLevel} from './layout-flow.js';

export interface LogicalArea {
  blockStart: number | undefined;
  lineLeft: number | undefined;
  blockSize: number | undefined;
  inlineSize: number | undefined;
}

export interface RenderItemLogOptions {
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

  abstract logName(log: Logger, options?: RenderItemLogOptions): void;

  abstract getLogSymbol(): string;

  log(options?: RenderItemLogOptions, log?: Logger) {
    const flush = !log;

    log ||= new Logger();

    if (this.isIfcInline()) {
      options = {...options};
      options.paragraphText = this.text;
    }

    log.text(`${this.getLogSymbol()} `);
    this.logName(log, options);

    if (options?.containingBlocks && this.isBlockContainer()) {
      log.text(` (cb: ${this.containingBlock?.box.id ?? '(null)'})`);
    }

    if (options?.css) {
      const css = this.style[options.css];
      log.text(` (${options.css}: ${css && JSON.stringify(css)})`);
    }

    if (options?.bits && this.isBox()) {
      log.text(` (bf: ${this.stringifyBitfield()})`);
    }

    log.text('\n');

    if (this.isBox() && this.children.length) {
      log.pushIndent();

      for (let i = 0; i < this.children.length; i++) {
        this.children[i].log(options, log);
      }

      log.popIndent();
    }

    if (flush) log.flush();
  }

  prelayout() {
    // should be overridden
  }

  postlayoutPreorder() {
    // should be overridden
  }

  postlayoutPostorder() {
    // should be overridden
  }
}

export class Box extends RenderItem {
  public id: string;
  public children: RenderItem[];
  public containingBlock: BoxArea;
  /**
   * General boolean bitfield shared by all box subclasses. The bits labeled
   * with "has" say something about their content to allow for optimizations.
   * They propagate through to parents of the same type, though some of them
   * do so conditionally.
   */
  public bitfield: number;

  /**
   * Bitfield allocations. Box subclasses with different inheritance are allowed
   * to overlap attribute bits or propagate target bits. It's easier to keep
   * these all in one place than try to define them on the subclasses.
   */
  static BITS = {
    // 0..3: misc attributes for all box types:
    isAnonymous:               1 << 0,
    enableLogging:             1 << 1,
    reserved1:                 1 << 2, // this padding makes the logs easier to
    reserved2:                 1 << 3, // read (distinguish attrs from has bits)
    // 4..7: propagation bits: Box <- Box
    hasBackgroundInLayer:      1 << 4,
    hasForegroundInLayer:      1 << 5,
    hasBackgroundInDescendent: 1 << 6,
    hasForegroundInDescendent: 1 << 7,
    // 8..9: attributes for BlockContainer:
    //
    // Inline or block-level: we can't use the style for this since anonymously
    // created block containers are block-level but their style is inline (the
    // initial value). Potentially we could remove this and say that it's block
    // level if it's anonymous.
    //
    // Other CSS rules that affect how a block container is treated during
    // layout do not have this problem (position: absolute, display: inline-
    // block) because anonymously created boxes cannot invoke those modes.
    isInline:                  1 << 8,
    isBfcRoot:                 1 << 9,
    // 8..13: propagation bits: Inline <- Run
    hasText:                   1 << 8,
    hasComplexText:            1 << 9,
    hasSoftHyphen:             1 << 10,
    hasNewlines:               1 << 11,
    hasSoftWrap:               1 << 12,
    hasCollapsibleWs:          1 << 13,
    // 14..18: propagation bits: Inline <- Inline
    hasInlines:                1 << 14,
    hasPaintedInlines:         1 << 15,
    hasPositionedInline:       1 << 16,
    hasColoredInline:          1 << 17,
    hasSizedInline:            1 << 18,
    // 19: propagation bits: Inline <- Break
    hasBreaks:                 1 << 19,
    // 20..21: propagation bits: Inline <- BlockContainer
    hasFloats:                 1 << 20,
    hasInlineBlocks:           1 << 21,
    // 22..32: if you take them, remove them from PROPAGATES_TO_INLINE_BITS
  };

  /**
   * Use this, not BITS, for the ctor! BITS are ~private
   */
  static ATTRS = {
    isAnonymous: Box.BITS.isAnonymous,
    enableLogging: Box.BITS.enableLogging,
  };

  static PROPAGATES_TO_INLINE_BITS = 0xffffff00;

  static BITFIELD_END = 8;

  constructor(style: Style, children: RenderItem[], attrs: number) {
    super(style);
    this.id = id();
    this.children = children;
    this.bitfield = attrs;
    this.containingBlock = EmptyContainingBlock;
  }

  propagate(parent: Box) {
    if (!this.isLayerRoot()) {
      if (this.hasBackground() || this.hasBackgroundInLayerRoot()) {
        parent.bitfield |= Box.BITS.hasBackgroundInLayer;
      }

      if (this.hasForeground() || this.hasForegroundInLayerRoot()) {
        parent.bitfield |= Box.BITS.hasForegroundInLayer;
      }
    }

    if (this.hasBackground() || this.hasBackgroundInDescendent()) {
      parent.bitfield |= Box.BITS.hasBackgroundInDescendent;
    }

    if (this.hasForeground() || this.hasForegroundInDescendent()) {
      parent.bitfield |= Box.BITS.hasForegroundInDescendent;
    }
  }

  isBox(): this is Box {
    return true;
  }

  isAnonymous() {
    return Boolean(this.bitfield & Box.BITS.isAnonymous);
  }

  isPositioned() {
    return this.style.position !== 'static';
  }

  isStackingContextRoot() {
    return this.isPositioned() && this.style.zIndex !== 'auto';
  }

  hasBackgroundInLayerRoot() {
    return Boolean(this.bitfield & Box.BITS.hasBackgroundInLayer);
  }

  hasForegroundInLayerRoot() {
    return Boolean(this.bitfield & Box.BITS.hasForegroundInLayer);
  }

  hasBackgroundInDescendent() {
    return Boolean(this.bitfield & Box.BITS.hasBackgroundInDescendent);
  }

  hasForegroundInDescendent() {
    return Boolean(this.bitfield & Box.BITS.hasForegroundInDescendent);
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

  logName(log: Logger, options?: RenderItemLogOptions) {
    log.text('Box');
  }

  getLogSymbol() {
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

  snapPixels() {
    let width, height;

    if (!this.parent) {
      throw new Error(`Cannot absolutify area for ${this.box.id}, parent was never set`);
    }

    if (this.parent.writingMode === 'vertical-lr') {
      width = this.blockSize;
      height = this.inlineSize;
    } else if (this.parent.writingMode === 'vertical-rl') {
      width = this.blockSize;
      height = this.inlineSize;
    } else { // 'horizontal-tb'
      width = this.inlineSize;
      height = this.blockSize;
    }

    const x = this.lineLeft;
    const y = this.blockStart;
    this.lineLeft = Math.round(this.lineLeft);
    this.blockStart = Math.round(this.blockStart);
    this.inlineSize = Math.round(x + width) - this.lineLeft;
    this.blockSize = Math.round(y + height) - this.blockStart;
  }

  repr(indent = 0) {
    const {width: w, height: h, x, y} = this;
    return '  '.repeat(indent) + `⚃ Area ${this.box.id}: ${w}⨯${h} @${x},${y}`;
  }
}

const EmptyContainingBlock = new BoxArea(null!);

export function prelayout(root: BlockContainer) {
  const stack: (InlineLevel | {sentinel: true})[] = [root];
  const parents: Box[] = [];
  const ifcs: IfcInline[] = [];

  while (stack.length) {
    const box = stack.pop()!;

    if ('sentinel' in box) {
      const box = parents.pop()!;
      if (box.isIfcInline()) ifcs.pop();
      const parent = parents.at(-1);
      if (parent) box.propagate(parent);
      box.prelayout();
    } else if (box.isBox()) {
      parents.push(box);
      if (box.isIfcInline()) ifcs.push(box);
      stack.push({sentinel: true});
      for (let i = box.children.length - 1; i >= 0; i--) {
        stack.push(box.children[i]);
      }
    } else if (box.isRun()) {
      box.propagate(parents.at(-1)!, ifcs.at(-1)!.paragraph.string);
    } else {
      box.propagate(parents.at(-1)!);
    }
  }
}

export function postlayout(root: BlockContainer) {
  const stack: (BlockContainer | Inline | {sentinel: true})[] = [root];
  const parents: Box[] = [];

  while (stack.length) {
    const box = stack.pop()!;

    if ('sentinel' in box) {
      const parent = parents.pop()!;
      parent.postlayoutPostorder();
    } else {
      box.postlayoutPreorder();
      stack.push({sentinel: true});
      parents.push(box);
      for (let i = box.children.length - 1; i >= 0; i--) {
        const child = box.children[i];
        if (child.isBox()) stack.push(child);
      }
    }
  }
}

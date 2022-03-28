import {HTMLElement, TextNode} from './node';
import {createComputedStyle, Style, LogicalStyle} from './cascade';
import {Run, Collapser, ShapedItem, Linebox, getCascade, getFace, shapeIfc, createLineboxes, getAscenderDescender} from './text';
import {Box, Area, WritingMode} from './box';
import {Harfbuzz, HbFace} from 'harfbuzzjs';
import {FontConfig} from 'fontconfig';
import {Itemizer} from 'itemizer';

function assumePx(v: any): asserts v is number {
  if (typeof v !== 'number') {
    throw new TypeError(
      'The value accessed here has not been reduced to a used value in a ' +
        'context where a used value is expected. Make sure to perform any ' +
        'needed layouts.'
    );
  }
}

function writingModeInlineAxis(el: HTMLElement) {
  if (el.style.writingMode === 'horizontal-tb') {
    return 'horizontal';
  } else {
    return 'vertical';
  }
}

const reset = '\x1b[0m';
const dim = '\x1b[2m';
const underline = '\x1b[4m';

export type LayoutContext = {
  lastBlockContainerArea: Area,
  lastPositionedArea: Area,
  bfc: BlockFormattingContext,
  hb: Harfbuzz,
  logging: {text: Set<string>}
};

export type PreprocessContext = {
  fcfg: FontConfig,
  itemizer: Itemizer,
  hb: Harfbuzz,
  logging: {text: Set<string>}
};

type MarginCollapseCollection = {
  root: BlockContainer,
  margins: number[],
  position: 'start' | 'end',
  through?: true
};

// CSS 2 § 8.3.1
//
// TODO: while the method of calculating positions up until an IFC or up until
// the end of the BFC works well, I implemented it that way because
// MarginCollapseContext was built to run in one pass, with positioning
// happening later. I built it that way because at the time I did not realize
// that flow must happen in document order, in a streaming sort of way, since
// floats are placed throughout the entire BFC and the IFC must calcluate
// collisions with floats (thus the IFC position within the BFC position must
// be known at time of text layout).
//
// All that's to say I might be able to come up with a better flow algorithm
// that doesn't involve backing up and doing calculations every time an IFC is
// hit. It could be possible to rewrite MarginCollapseContext to have determined
// margins every time a margin can't adjoin (eg IFC is hit).
class MarginCollapseContext {
  private current: null | MarginCollapseCollection = null;
  private last:'start' | 'end' | null = null;
  private margins: MarginCollapseCollection[] = [];

  boxStart(box: BlockContainer, style: LogicalStyle) {
    const adjoins = style.paddingBlockStart === 0
      && style.borderBlockStartWidth === 0;

    assumePx(style.marginBlockStart);
    if (!box.isBlockLevel()) throw new Error('Inline encountered');

    if (this.current) {
      this.current.margins.push(style.marginBlockStart);
    } else {
      this.current = {root: box, margins: [style.marginBlockStart], position: 'start'};
      this.margins.push(this.current);
    }

    if (!adjoins) this.current = null;

    this.last = 'start';
  }

  boxEnd(box: BlockContainer, style: LogicalStyle) {
    let adjoins = style.paddingBlockEnd === 0
      && style.borderBlockEndWidth === 0;

    assumePx(style.marginBlockEnd);
    if (!box.isBlockLevel()) throw new Error('Inline encountered');

    if (this.current && adjoins) {
      if (this.last === 'start') {
        // Handle the end of a block box that had no block children
        // TODO 1 min-height (minHeightOk)
        // TODO 2 clearance
        const heightOk = style.blockSize === 'auto' || style.blockSize === 0;
        adjoins = box.children.length === 0 && !box.isBfcRoot() && heightOk;
      } else {
        // Handle the end of a block box that was at the end of its parent
        adjoins = style.blockSize === 'auto';
      }
    }

    if (this.current && adjoins && this.last === 'start') this.current.through = true;

    if (this.current && adjoins) {
      this.current.margins.push(style.marginBlockEnd);
      // When a box's end adjoins to the previous margin, move the "root" (the
      // box which the margin will be placed adjacent to) to the highest-up box
      // in the tree, since its siblings need to be shifted. If the margin is
      // collapsing through, don't do that because CSS 2 §8.3.1 last 2 bullets
      if (this.last === 'end' && !this.current.through) this.current.root = box;
    } else {
      this.current = {root: box, margins: [style.marginBlockEnd], position: 'end'};
      this.margins.push(this.current);
    }

    this.last = 'end';
  }

  toBoxMaps() {
    const start = new Map<string, number>();
    const end = new Map<string, number>();

    for (const {root, position, margins} of this.margins) {
      let positive = 0;
      let negative = 0;

      for (const n of margins) {
        if (n < 0) {
          negative = Math.max(negative, -n);
        } else {
          positive = Math.max(positive, n);
        }
      }

      const collapsedMargin = positive - negative;

      if (position === 'start') {
        start.set(root.id, collapsedMargin);
      } else {
        end.set(root.id, collapsedMargin);
      }
    }

    return {start, end};
  }
}

export class BlockFormattingContext {
  public writingMode: WritingMode;
  public mctx: MarginCollapseContext;
  public stack: (BlockContainer | {post: BlockContainer})[];
  public blockOffset: number;
  private sizeStack: number[];
  private offsetStack: number[];

  constructor(writingMode: WritingMode) {
    this.writingMode = writingMode;
    this.mctx = new MarginCollapseContext();
    this.stack = [];
    this.blockOffset = 0;
    this.sizeStack = [0];
    this.offsetStack = [];
  }

  boxStart(box: BlockContainer) {
    this.mctx.boxStart(box, box.style.createLogicalView(this.writingMode));
    this.stack.push(box);

    // Position everything up until now so floating is possible
    if (box.isBlockContainerOfInlines()) {
      this.positionBlockContainers();
      // Not exactly necessary, but keeps memory down and makes the next
      // toBoxMaps() faster. Since an IFC never adjoins it's safe. See the note
      // above MarginCollapseContext for some insight into future improvements.
      this.mctx = new MarginCollapseContext();
    }
  }

  boxEnd(box: BlockContainer) {
    this.mctx.boxEnd(box, box.style.createLogicalView(this.writingMode));
    this.stack.push({post: box});
  }

  finalize(box: BlockContainer) {
    if (!box.isBfcRoot()) throw new Error('This is for bfc roots only');

    const content = box.contentArea.createLogicalView(this.writingMode);

    this.positionBlockContainers();

    if (content.blockSize === undefined) {
      box.setBlockSize(this.blockOffset, this.writingMode);
    }
  }

  positionBlockContainers() {
    const {start, end} = this.mctx.toBoxMaps();
    const sizeStack = this.sizeStack;
    const offsetStack = this.offsetStack;

    for (const item of this.stack) {
      const box = 'post' in item ? item.post : item;
      const border = box.borderArea.createLogicalView(this.writingMode);
      const style = box.style.createLogicalView(this.writingMode);

      if ('post' in item) {
        const childSize = sizeStack.pop()!;
        const offset = offsetStack.pop()!;

        if (style.blockSize === 'auto' && box.isBlockContainerOfBlockContainers() && !box.isBfcRoot()) {
          box.setBlockSize(childSize, this.writingMode);
        }

        // The block size would only be indeterminate for floats, which are
        // not a part of the descendants() return value, or for orthogonal
        // writing modes, which are also not in descendants() due to their
        // establishing a new BFC. If neither of those are true and the block
        // size is indeterminate that's a bug.
        assumePx(border.blockSize);

        const size = border.blockSize + (end.has(box.id) ? end.get(box.id)! : 0);
        sizeStack[sizeStack.length - 1] += size;
        this.blockOffset = offset + size;
      } else {
        const size = start.has(box.id) ? start.get(box.id)! : 0;
        sizeStack[sizeStack.length - 1] += size;
        this.blockOffset += size;
        box.setBlockPosition(sizeStack[sizeStack.length - 1], this.writingMode);
        sizeStack.push(0);
        offsetStack.push(this.blockOffset);
      }
    }

    this.stack = [];
  }
}

type BlockContainerOfInlines = BlockContainer & {
  children: IfcInline[];
}

type BlockContainerOfBlockContainers = BlockContainer & {
  children: BlockContainer[];
}

export class BlockContainer extends Box {
  public children: IfcInline[] | BlockContainer[];

  constructor(style: Style, children: IfcInline[] | BlockContainer[], attrs: number) {
    super(style, children, attrs);
    this.children = children;
  }

  get desc() {
    return (this.isAnonymous() ? dim : '')
      + (this.isBfcRoot() ? underline : '')
      + (this.isBlockLevel() ? 'Block' : 'Inline')
      + ' ' + this.id
      + reset;
  }

  setBlockSize(size: number, bfcWritingMode: WritingMode) {
    const content = this.contentArea.createLogicalView(bfcWritingMode);
    const padding = this.paddingArea.createLogicalView(bfcWritingMode);
    const border = this.borderArea.createLogicalView(bfcWritingMode);
    const style = this.style.createLogicalView(bfcWritingMode);

    content.blockSize = size;

    padding.blockSize = content.blockSize
      + style.paddingBlockStart
      + style.paddingBlockEnd;

    border.blockSize = padding.blockSize
      + style.borderBlockStartWidth
      + style.borderBlockEndWidth;
  }

  setBlockPosition(position: number, bfcWritingMode: WritingMode) {
    const content = this.contentArea.createLogicalView(bfcWritingMode);
    const padding = this.paddingArea.createLogicalView(bfcWritingMode);
    const border = this.borderArea.createLogicalView(bfcWritingMode);
    const style = this.style.createLogicalView(bfcWritingMode);

    border.blockStart = position;
    padding.blockStart = style.borderBlockStartWidth;
    content.blockStart = style.paddingBlockStart;
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

    ctx.lastBlockContainerArea = this.contentArea;

    if (this.isPositioned) {
      ctx.lastPositionedArea = this.paddingArea;
    }
  }

  isBlockContainer(): this is BlockContainer {
    return true;
  }

  isInlineLevel() {
    return Boolean(this.attrs & Box.ATTRS.isInline);
  }

  isBlockLevel() {
    return !this.isInlineLevel();
  }

  isBfcRoot() {
    return Boolean(this.attrs & Box.ATTRS.isBfcRoot);
  }

  isBlockContainerOfInlines(): this is BlockContainerOfInlines {
    return Boolean(this.children.length && this.children[0].isIfcInline());
  }

  isBlockContainerOfBlockContainers(): this is BlockContainerOfBlockContainers {
    return !this.isBlockContainerOfInlines();
  }

  async preprocess(ctx: PreprocessContext) {
    const promises:Promise<any>[] = [];
    for (const child of this.children) {
      promises.push(child.preprocess(ctx));
    }
    await Promise.all(promises);
  }

  doTextLayout(ctx: LayoutContext) {
    if (!this.isBlockContainerOfInlines()) throw new Error('Children are block containers');
    const [rootInline] = this.children;
    rootInline.doTextLayout(ctx);
    this.setBlockSize(rootInline.height, ctx.bfc.writingMode);
  }
}

function doInlineBoxModelForBlockBox(box: BlockContainer, ctx: LayoutContext) {
  // CSS 2.2 §10.3.3
  // ---------------

  if (!box.containingBlock) {
    throw new Error(`Inline layout called too early on ${box.id}: no containing block`);
  }

  if (!box.isBlockLevel()) {
    throw new Error('doInlineBoxModelForBlockBox called with inline');
  }

  const style = box.style.createLogicalView(ctx.bfc.writingMode);
  const container = box.containingBlock.createLogicalView(ctx.bfc.writingMode);
  let marginInlineStart = style.marginInlineStart;
  let marginInlineEnd = style.marginInlineEnd;

  if (container.inlineSize === undefined) {
    throw new Error('Auto-inline size for orthogonal writing modes not yet supported');
  }

  // Paragraphs 2 and 3
  if (style.inlineSize !== 'auto') {
    const specifiedInlineSize = style.inlineSize
      + style.borderInlineStartWidth
      + style.paddingInlineStart
      + style.paddingInlineEnd
      + style.borderInlineEndWidth
      + (marginInlineStart === 'auto' ? 0 : marginInlineStart)
      + (marginInlineEnd === 'auto' ? 0 : marginInlineEnd);

    // Paragraph 2: zero out auto margins if specified values sum to a length
    // greater than the containing block's width.
    if (specifiedInlineSize > container.inlineSize) {
      if (marginInlineStart === 'auto') marginInlineStart = 0;
      if (marginInlineEnd === 'auto') marginInlineEnd = 0;
    }

    if (marginInlineStart !== 'auto' && marginInlineEnd !== 'auto') {
      // Paragraph 3: check over-constrained values. This expands the right
      // margin in LTR documents to fill space, or, if the above scenario was
      // hit, it makes the right margin negative.
      // TODO support the `direction` CSS property
      marginInlineEnd = container.inlineSize - specifiedInlineSize;
    } else { // one or both of the margins is auto, specifiedWidth < cb width
      if (marginInlineStart === 'auto' && marginInlineEnd !== 'auto') {
        // Paragraph 4: only auto value is margin-left
        marginInlineStart = container.inlineSize - specifiedInlineSize;
      } else if (marginInlineEnd === 'auto' && marginInlineStart !== 'auto') {
        // Paragraph 4: only auto value is margin-right
        marginInlineEnd = container.inlineSize - specifiedInlineSize;
      } else {
        // Paragraph 6: two auto values, center the content
        const margin = (container.inlineSize - specifiedInlineSize) / 2;
        marginInlineStart = marginInlineEnd = margin;
      }
    }
  }

  const content = box.contentArea.createLogicalView(ctx.bfc.writingMode);
  // Paragraph 5: auto width
  if (style.inlineSize === 'auto') {
    if (marginInlineStart === 'auto') marginInlineStart = 0;
    if (marginInlineEnd === 'auto') marginInlineEnd = 0;
  }

  const padding = box.paddingArea.createLogicalView(ctx.bfc.writingMode);
  const border = box.borderArea.createLogicalView(ctx.bfc.writingMode);

  assumePx(marginInlineStart);
  assumePx(marginInlineEnd);

  border.inlineStart = marginInlineStart;
  border.inlineEnd = marginInlineEnd;

  padding.inlineStart = style.borderInlineStartWidth;
  padding.inlineEnd = style.borderInlineEndWidth;

  content.inlineStart = style.paddingInlineStart;
  content.inlineEnd = style.paddingInlineEnd;
}

function doBlockBoxModelForBlockBox(box: BlockContainer, ctx: LayoutContext) {
  // CSS 2.2 §10.6.3
  // ---------------

  const style = box.style.createLogicalView(ctx.bfc.writingMode);

  if (!box.isBlockLevel()) {
    throw new Error('doBlockBoxModelForBlockBox called with inline');
  }

  if (style.blockSize === 'auto') {
    if (box.children.length === 0) {
      box.setBlockSize(0, ctx.bfc.writingMode); // Case 4
    } else {
      // Cases 1-4 should be handled by doBoxPositioning, where margin
      // calculation happens. These bullet points seem to be re-phrasals of
      // margin collapsing in CSS 2.2 § 8.3.1 at the very end. If I'm wrong,
      // more might need to happen here.
    }
  } else {
    box.setBlockSize(style.blockSize, ctx.bfc.writingMode);
  }
}

export function layoutBlockBox(box: BlockContainer, ctx: LayoutContext) {
  if (!box.isBlockLevel()) {
    throw new Error(`BlockContainer ${box.id} is not block-level`);
  }

  const bfc = ctx.bfc;
  const cctx = {...ctx};

  // Containing blocks first, for absolute positioning later
  box.assignContainingBlocks(cctx);

  if (!box.containingBlock) {
    throw new Error(`BlockContainer ${box.id} has no containing block!`);
  }

  // Resolve percentages into actual values
  box.style.resolvePercentages(box.containingBlock);

  // And resolve box-sizing (which has a dependency on the above)
  box.style.resolveBoxModel();

  if (box.isBlockContainerOfInlines()) {
    const [inline] = box.children;
    inline.assignContainingBlocks(cctx);
  }

  doInlineBoxModelForBlockBox(box, ctx);
  doBlockBoxModelForBlockBox(box, ctx);
  bfc.boxStart(box); // Assign block position if it's an IFC
  // Child flow is now possible

  if (box.isBfcRoot()) cctx.bfc = new BlockFormattingContext(box.style.writingMode);

  if (box.isBlockContainerOfInlines()) {
    box.doTextLayout(ctx);
  } else if (box.isBlockContainerOfBlockContainers()) {
    for (const child of box.children) {
      layoutBlockBox(child, cctx);
    }
  } else {
    throw new Error(`Unknown box type: ${box.id}`);
  }

  if (box.isBfcRoot()) cctx.bfc.finalize(box);

  bfc.boxEnd(box);
}

export class Break extends Box {
  public className = 'break';

  isBreak(): this is Break {
    return true;
  }

  get sym() {
    return '⏎';
  }

  get desc() {
    return 'BR';
  }
}

export class Inline extends Box {
  public children: InlineLevel[];
  public nshaped: number;
  public start: number;
  public end: number;
  public face: HbFace | null;

  constructor(style: Style, children: InlineLevel[], attrs: number) {
    super(style, children, attrs);
    this.children = children;
    this.nshaped = 0;

    // TODO: these get set in ifc.prepare() because it needs to happen after
    // whitespace collapsing. Instead I should do whitespace collapsing on
    // shaped items, that way these can be set at parse time and not be affected
    this.start = 0;
    this.end = 0;

    this.face = null;
  }

  get leftMarginBorderPadding() {
    return this.style.marginLeft === 'auto' ? 0 : this.style.marginLeft
      + this.style.borderLeftWidth
      + this.style.paddingLeft;
  }

  get rightMarginBorderPadding() {
    return this.style.marginRight === 'auto' ? 0 : this.style.marginRight
      + this.style.borderRightWidth
      + this.style.paddingRight;
  }

  isInline(): this is Inline {
    return true;
  }

  get sym() {
    return '▭';
  }

  get desc() {
    return (this.isAnonymous() ? dim : '')
      + (this.isIfcInline() ? underline : '')
      + 'Inline'
      + ' ' + this.id
      + reset;
  }
}

export class IfcInline extends Inline {
  public allText: string = '';
  public runs: Run[] = [];
  public shaped: ShapedItem[] = [];
  public strut: ShapedItem | undefined;
  public lineboxes: Linebox[] = [];
  public height: number = 0;
  public children: InlineLevel[];

  constructor(style: Style, children: InlineLevel[]) {
    super(style, children, Box.ATTRS.isAnonymous);
    this.children = children;
    this.prepare();
  }

  isIfcInline(): this is IfcInline {
    return true;
  }

  // TODO this would be unnecessary (both removing collapsed runs but also
  // setting start and end) if I did whitespace collapsing on shaped items
  postprepare() {
    const parents: Inline[] = [];
    const END_PARENT = Symbol('end parent');
    const stack: (InlineLevel | typeof END_PARENT)[] = [this];
    let cursor = 0;

    while (stack.length) {
      const item = stack.shift()!;

      if (item === END_PARENT) {
        parents.pop()!.end = cursor;
      } else if (item.isBreak() || item.isBlockContainer()) {
        // skip
      } else if (item.isRun()) {
        cursor = item.end + 1;
      } else {
        parents.push(item);

        item.start = cursor;

        for (let i = 0; i < item.children.length; ++i) {
          const child = item.children[i];
          if (child.isRun() && child.end < child.start) {
            item.children.splice(i, 1);
            i -= 1;
          }
        }

        stack.unshift(END_PARENT);

        for (let i = item.children.length - 1; i >= 0; --i) {
          stack.unshift(item.children[i]);
        }
      }
    }
  }

  split(itemIndex: number, offset: number) {
    const left = this.shaped[itemIndex];
    const right = left.split(offset - left.offset);
    this.shaped.splice(itemIndex + 1, 0, right);
  }

  // Collect text runs, collapse whitespace, create shaping boundaries, and
  // assign fonts
  private prepare() {
    const stack = this.children.slice();
    let i = 0;

    // CSS Text Module Level 3, Appendix A, steps 1-4

    // Step 1
    while (stack.length) {
      const box = stack.shift()!;

      if (box.isRun()) {
        box.setRange(i, i + box.text.length - 1);
        i += box.text.length;
        this.allText += box.text;
        this.runs.push(box);
      } else if (box.isInline()) {
        stack.unshift(...box.children);
      } else if (box.isBreak()) {
        // ok
      } else {
        // TODO: this is e.g. a block container. store it somewhere for future
        // layout here
        throw new Error(`Only inlines and runs in IFCs for now (box ${this.id})`);
      }
    }

    const collapser = new Collapser(this.allText, this.runs);
    collapser.collapse();
    this.allText = collapser.buf;
    this.postprepare();

    // TODO step 2
    // TODO step 3
    // TODO step 4
  }

  async preprocess(ctx: PreprocessContext) {
    const strutCascade = getCascade(ctx.fcfg, this.style, 'Latn');
    const strutFontMatch = strutCascade.matches[0].toCssMatch();
    const strutFace = await getFace(ctx.hb, strutFontMatch.file, strutFontMatch.index);
    const strutFont = ctx.hb.createFont(strutFace);
    const extents = getAscenderDescender(this.style, strutFont, strutFace.upem);
    this.strut = new ShapedItem(strutFace, extents, strutFontMatch, [], 0, '', [], {
      style: this.style,
      isEmoji: false,
      level: 0,
      script: 'Latn'
    });
    this.shaped = await shapeIfc(this, ctx);
    strutFont.destroy();
  }

  assignContainingBlocks(ctx: LayoutContext) {
    this.containingBlock = ctx.lastBlockContainerArea;
  }

  doTextLayout(ctx: LayoutContext) {
    createLineboxes(this, ctx);
  }

  containsAllCollapsibleWs() {
    const stack: Box[] = this.children.slice();
    let good = true;

    while (stack.length && good) {
      const child = stack.shift()!;
      if (child.isRun()) {
        if (!child.wsCollapsible) {
          good = false;
        } else {
          good = child.allCollapsible();
        }
      } else if (child.isInline()) {
        stack.unshift(...child.children);
      } else {
        // box should only be an InlineLevelBfcBLockContainer at this point
        good = false;
      }
    }

    return good;
  }
}

export type InlineLevel = Inline | BlockContainer | Run | Break;

type InlineNotRun = Inline | BlockContainer;

type InlineIteratorBuffered = {state: 'pre' | 'post', item: Inline}
  | {state: 'text', item: Run}
  | {state: 'break'}

type InlineIteratorValue = InlineIteratorBuffered | {state: 'breakop'};

// TODO emit inline-block
export function createInlineIterator(inline: IfcInline) {
  const stack:(InlineLevel | {post: Inline})[] = inline.children.slice().reverse();
  const buffered:InlineIteratorBuffered[] = [];
  let minlevel = 0;
  let level = 0;
  let bk = 0;
  let flushedBreak = false;

  function next():{done: true} | {done: false, value: InlineIteratorValue} {

    if (!buffered.length) {
      flushedBreak = false;

      while (stack.length) {
        const item = stack.pop()!;
        if ('post' in item) {
          level -= 1;
          buffered.push({state: 'post', item: item.post});
          if (level <= minlevel) {
            bk = buffered.length;
            minlevel = level;
          }
        } else if (item.isInline()) {
          level += 1;
          buffered.push({state: 'pre', item});
          stack.push({post: item});
          for (let i = item.children.length - 1; i >= 0; --i) stack.push(item.children[i]);
        } else if (item.isRun() || item.isBreak()) {
          minlevel = level;
          if (item.isRun()) {
            buffered.push({state: 'text', item});
          } else {
            buffered.push({state: 'break'});
          }
          break;
        } else {
          throw new Error('Inline block not supported yet');
        }
      }
    }

    if (buffered.length) {
      if (bk > 0) {
        bk -= 1;
      } else if (!flushedBreak && /* pre|posts follow the op */ buffered.length > 1) {
        flushedBreak = true;
        return {value: {state: 'breakop'}, done: false};
      }

      return {value: buffered.shift()!, done: false};
    }

    return {done: true};
  }

  return {next};
}

// TODO emit inline-block
export function createPreorderInlineIterator(inline: IfcInline) {
  const stack:InlineLevel[] = inline.children.slice().reverse();

  function next():{done: true} | {done: false, value: Inline | Run} {
    while (stack.length) {
      const item = stack.pop()!;

      if (item.isInline()) {
        for (let i = item.children.length - 1; i >= 0; --i) {
          stack.push(item.children[i]);
        }
        return {done: false, value: item};
      } else if (item.isRun()) {
        return {done: false, value: item};
      }
    }

    return {done: true};
  }

  return {next};
}

// Helper for generateInlineBox
function mapTree(el: HTMLElement, stack: number[], level: number): [boolean, InlineNotRun?] {
  let children = [], bail = false;

  if (el.style.display.outer !== 'inline' && el.style.display.outer !== 'none') {
    throw Error('Inlines only');
  }

  if (!stack[level]) stack[level] = 0;

  let box:InlineNotRun | undefined;

  if (el.style.display.inner === 'flow') {
    while (!bail && stack[level] < el.children.length) {
      let child: InlineLevel | undefined, childEl = el.children[stack[level]];

      if (childEl instanceof HTMLElement) {
        if (childEl.tagName === 'br') {
          child = new Break(new Style('', childEl.style), [], 0);
        } else if (childEl.style.display.outer === 'block') {
          bail = true;
        } else if (childEl.style.display.inner === 'flow-root') {
          child = generateBlockContainer(childEl);
        } else if (childEl.children) {
          [bail, child] = mapTree(childEl, stack, level + 1);
        }
      } else if (childEl instanceof TextNode) {
        const id = childEl.id + '.1';
        child = new Run(childEl.text, new Style(id, childEl.style));
      }

      if (child != null) children.push(child);
      if (!bail) stack[level]++;
    }

    if (!bail) stack.pop();
    const id = el.id + '.1';
    box = new Inline(new Style(id, el.style), children, 0);
  } else if (el.style.display.inner == 'flow-root') {
    box = generateBlockContainer(el);
  }

  return [bail, box];
}

// Generates an inline box for the element. Also generates blocks if the element
// has any descendents which generate them. These are not included in the inline.
function generateInlineBox(el: HTMLElement) {
  const path: number[] = [], boxes:(InlineLevel | BlockContainer)[] = [];
  let inline: InlineNotRun | undefined, more = true;

  if (el.style.display.outer !== 'inline') throw Error('Inlines only');

  while (more) {
    let childEl;

    [more, inline] = mapTree(el, path, 0);
    if (inline) boxes.push(inline);

    while ((childEl = el.getEl(path)) instanceof HTMLElement && childEl.style.display.outer === 'block') {
      boxes.push(generateBlockContainer(childEl, el));
      ++path[path.length - 1];
    }
  }

  return boxes;
}

function isInlineLevel(box: Box): box is InlineLevel {
  return box.isInline() || box.isRun() || box.isBreak() || box.isBlockContainer() && box.isInlineLevel();
}

// Wraps consecutive inlines and runs in block-level block containers. The
// returned list is guaranteed to be a list of only blocks. This obeys CSS21
// section 9.2.1.1
function wrapInBlockContainers(boxes: Box[], parentEl: HTMLElement) {
  const blocks:BlockContainer[] = [];
  let subId = 0;

  for (let i = 0; i < boxes.length; ++i) {
    const inlines:InlineLevel[] = [];

    for (let box; i < boxes.length && isInlineLevel(box = boxes[i]); i++) inlines.push(box);

    if (inlines.length > 0) {
      const anonStyleId = parentEl.id + '.' + ++subId;
      const anonComputedStyle = createComputedStyle(parentEl.style, {});
      const anonStyle = new Style(anonStyleId, anonComputedStyle);
      const rootInline = new IfcInline(anonStyle, inlines);
      if (!rootInline.containsAllCollapsibleWs()) {
        blocks.push(new BlockContainer(anonStyle, [rootInline], Box.ATTRS.isAnonymous));
      }
    }

    if (i < boxes.length) {
      const block = boxes[i];
      if (!block.isBlockContainer()) throw new Error('Unknown box type encountered');
      blocks.push(block);
    }
  }

  return blocks;
}

// Generates a block container for the element
export function generateBlockContainer(el: HTMLElement, parentEl?: HTMLElement): BlockContainer {
  let boxes: Box[] = [], hasInline = false, hasBlock = false, attrs = 0;
  
  if (
    el.style.display.inner === 'flow-root' ||
    parentEl && writingModeInlineAxis(el) !== writingModeInlineAxis(parentEl)
  ) {
    attrs |= Box.ATTRS.isBfcRoot;
  } else if (el.style.display.inner !== 'flow') {
    throw Error('Only flow layout supported');
  }

  for (const child of el.children) {
    if (child instanceof HTMLElement) {
      if (child.tagName === 'br') {
        boxes.push(new Break(new Style('', child.style), [], 0));
        hasInline = true;
      } else if (child.style.display.outer === 'block') {
        boxes.push(generateBlockContainer(child, el));
        hasBlock = true;
      } else if (child.style.display.outer === 'inline') {
        hasInline = true;
        const blocks = generateInlineBox(child);
        hasBlock = hasBlock || blocks.length > 1;
        boxes = boxes.concat(blocks);
      }
    } else { // TextNode
      const id = child.id + '.1';
      const computed = createComputedStyle(el.style, {});
      hasInline = true;
      boxes.push(new Run(child.text, new Style(id, computed)));
    }
  }

  if (el.style.display.outer === 'inline') attrs |= Box.ATTRS.isInline;

  const style = new Style(el.id, el.style);

  if (hasInline && !hasBlock) {
    const anonStyleId = el.id + '.1';
    const anonComputedStyle = createComputedStyle(el.style, {});
    const anonStyle = new Style(anonStyleId, anonComputedStyle);
    const inline = new IfcInline(anonStyle, boxes as InlineLevel[]);
    return new BlockContainer(style, [inline], attrs);
  }

  if (hasInline && hasBlock) boxes = wrapInBlockContainers(boxes, el);

  return new BlockContainer(style, boxes as BlockContainer[], attrs);
}

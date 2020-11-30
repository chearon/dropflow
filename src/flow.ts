import {HTMLElement, TextNode} from './node';
import {createComputedStyle, Style, LogicalStyle} from './cascade';
import {Run, Collapser} from './text';
import {Box, Area, LogicalArea, WritingMode} from './box';

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


let id = 0;

const reset = '\x1b[0m';
const bold = '\x1b[1m';
const dim = '\x1b[2m';
const underline = '\x1b[4m';

export type LayoutContext = {
  lastBlockContainerArea: Area,
  lastPositionedArea: Area,
  bfcWritingMode: WritingMode,
  bfcStack: (BlockContainer | 'post')[]
};

type MarginCollapseCollection = {
  root: Box,
  margins: number[],
  position: 'start' | 'end',
  through?: true
};

// CSS 2 § 8.3.1
class MarginCollapseContext {
  private current: null | MarginCollapseCollection = null;
  private last:'start' | 'end' | null = null;
  private margins: MarginCollapseCollection[] = [];

  boxStart(box: BlockContainer, style: LogicalStyle) {
    const adjoins = style.paddingBlockStart === 0
      && style.borderBlockStartWidth === 0;

    assumePx(style.marginBlockStart);

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

    if (this.current && adjoins) {
      if (this.last === 'start') {
        // Handle the end of a block box that had no block children
        // TODO 1 min-height (minHeightOk)
        // TODO 2 clearance
        const heightOk = style.blockSize === 'auto' || style.blockSize === 0;
        adjoins = box.children.length === 0 && (!box.isBlockContainerOfBlocks() || !box.isBfcRoot) && heightOk;
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

export abstract class BlockContainer extends Box {
  public level: 'block' | 'inline';

  constructor(
    style: Style,
    children: Box[],
    isAnonymous: boolean,
    level: 'block' | 'inline'
  ) {
    super(style, children, isAnonymous);

    this.level = level;
  }

  get isInlineLevel() {
    return this.level === 'inline';
  }

  isBlockContainer(): this is BlockContainer {
    return true;
  }

  get sym() {
    return '▣';
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

  doInlineBoxModel(bfcWritingMode: WritingMode) {
    // CSS 2.2 §10.3.3
    // ---------------

    if (!this.containingBlock) {
      throw new Error(`Inline layout called too early on ${this.id}: no containing block`);
    }

    const style = this.style.createLogicalView(bfcWritingMode);
    const container = this.containingBlock.createLogicalView(bfcWritingMode);
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

    const content = this.contentArea.createLogicalView(bfcWritingMode);
    // Paragraph 5: auto width
    if (style.inlineSize === 'auto') {
      if (marginInlineStart === 'auto') marginInlineStart = 0;
      if (marginInlineEnd === 'auto') marginInlineEnd = 0;
    }

    const padding = this.paddingArea.createLogicalView(bfcWritingMode);
    const border = this.borderArea.createLogicalView(bfcWritingMode);

    assumePx(marginInlineStart);
    assumePx(marginInlineEnd);

    border.inlineStart = marginInlineStart;
    border.inlineEnd = marginInlineEnd;

    padding.inlineStart = style.borderInlineStartWidth;
    padding.inlineEnd = style.borderInlineEndWidth;

    content.inlineStart = style.paddingInlineStart;
    content.inlineEnd = style.paddingInlineEnd;
  }

  doBlockBoxModel(bfcWritingMode: WritingMode) {
    // CSS 2.2 §10.6.3
    // ---------------

    const style = this.style.createLogicalView(bfcWritingMode);

    // TODO I don't think calling this.isBlockContainerOfBlocks() (done here and
    // later on) is great because it causes a dependency on the child. Might be
    // better to move layout performances into another class. Would help separate
    // focus as well

    if (style.blockSize === 'auto') {
      if (this.children.length === 0) {
        this.setBlockSize(0, bfcWritingMode); // Case 4
      } else if (this.isBlockContainerOfBlocks()) {
        // Cases 2-4 should be handled by doBoxPositioning, where margin
        // calculation happens. These bullet points seem to be re-phrasals of
        // margin collapsing in CSS 2.2 § 8.3.1 at the very end. If I'm wrong,
        // more might need to happen here.
      } else {
        // Case 1 TODO
        throw new Error(`IFC height for ${this.id} not yet implemented`);
      }
    } else {
      this.setBlockSize(style.blockSize, bfcWritingMode);
    }
  }

  layout(ctx: LayoutContext) {
    if (this.isInlineLevel) {
      throw new Error(`Layout on inline BlockContainer ${this.id} not supported`);
    }

    if (this.level === 'block') ctx.bfcStack.push(this);

    const cctx = Object.assign({}, ctx);

    this.assignContainingBlocks(cctx);

    if (!this.containingBlock) {
      throw new Error(`BlockContainer ${this.id} has no containing block!`);
    }

    // First resolve percentages into actual values
    this.style.resolvePercentages(this.containingBlock);

    // And resolve box-sizing (which has a dependency on the above)
    this.style.resolveBoxModel();

    // TODO: this goes for any block-level box, not just block containers.
    // It should probably go on the box class, but the BFC methods could
    // still go on this class while the IFC methods would go on the inline
    // class

    this.doInlineBoxModel(ctx.bfcWritingMode);
    this.doBlockBoxModel(ctx.bfcWritingMode);

    const style = this.style.createLogicalView(ctx.bfcWritingMode);

    // Child flow is now possible
    if (this.isBlockContainerOfBlocks()) {
      if (this.isBfcRoot) {
        cctx.bfcWritingMode = this.style.writingMode;
        cctx.bfcStack = [];
      }

      for (const child of this.children) {
        if (child.isBlockContainer()) child.layout(cctx);
      }

      if (this.isBfcRoot) this.doBoxPositioning(cctx);
      if (this.level === 'block') ctx.bfcStack.push('post', this);
    }
  }
}

export class BlockContainerOfBlocks extends BlockContainer {
  public isBfcRoot: boolean;

  constructor(
    style: Style,
    children: Box[],
    isAnonymous: boolean,
    level: 'block' | 'inline',
    isBfcRoot: boolean
  ) {
    super(style, children, isAnonymous, level);

    this.isBfcRoot = isBfcRoot;
  }

  get desc() {
    return (this.isAnonymous ? dim : '')
      + (this.isBfcRoot ? underline : '')
      + (this.isInlineLevel ? 'Inline' : 'Block')
      + ' ' + this.id
      + reset;
  }

  isBlockContainerOfBlocks(): this is BlockContainerOfBlocks {
    return true;
  }

  doBoxPositioning(ctx: LayoutContext) {
    const mctx = new MarginCollapseContext();
    let order = 'pre';

    // TODO 1 is there a BFC root that contains inlines? don't think so
    // TODO 2 level shouldn't matter, like a grid item or a float
    if (!this.isBfcRoot || this.level !== 'block') {
      throw new Error('Cannot do BFC-context block positioning');
    }

    // Collapse margins first
    for (const block of ctx.bfcStack) {
      if (block === 'post') {
        order = 'post';
        continue;
      }

      const style = block.style.createLogicalView(ctx.bfcWritingMode);

      if (order === 'pre') {
        mctx.boxStart(block, style);
      } else { // post
        mctx.boxEnd(block, style);
      }

      order = 'pre';
    }

    const {start, end} = mctx.toBoxMaps();
    const stack = [];
    let blockOffset = 0;

    for (const block of ctx.bfcStack) {
      if (block === 'post') {
        order = 'post';
        continue;
      }

      const content = block.contentArea.createLogicalView(ctx.bfcWritingMode);
      const border = block.borderArea.createLogicalView(ctx.bfcWritingMode);
      const style = block.style.createLogicalView(ctx.bfcWritingMode);

      if (order === 'pre') {
        blockOffset += start.has(block.id) ? start.get(block.id)! : 0;
        stack.push(blockOffset);
        block.setBlockPosition(blockOffset, ctx.bfcWritingMode);
        blockOffset = 0;
      } else { // post
        if (block.isBlockContainerOfBlocks() && style.blockSize === 'auto' && !block.isBfcRoot) {
          block.setBlockSize(blockOffset, ctx.bfcWritingMode);
        }

        // The block size would only be indeterminate for floats, which are
        // not a part of the descendants() return value, or for orthogonal
        // writing modes, which are also not in descendants() due to their
        // establishing a new BFC. If neither of those are true and the block
        // size is indeterminate that's a bug.
        assumePx(border.blockSize);

        blockOffset = stack.pop()! + border.blockSize;
        blockOffset += end.has(block.id) ? end.get(block.id)! : 0;
      }

      order = 'pre';
    }

    const content = this.contentArea.createLogicalView(ctx.bfcWritingMode);

    if (content.blockSize === undefined) {
      this.setBlockSize(blockOffset, ctx.bfcWritingMode);
    }
  }
}

export class BlockContainerOfInline extends BlockContainer {
  constructor(
    style: Style,
    rootInline: Inline,
    isAnonymous: boolean,
    level: 'inline' | 'block'
  ) {
    super(style, [rootInline], isAnonymous, level);
  }

  isBlockContainerOfInline(): this is BlockContainerOfInline {
    return true;
  }

  get desc() {
    return (this.isAnonymous ? dim : '')
      + (this.isInlineLevel ? 'Inline' : 'Block')
      + ' ' + this.id
      + reset;
  }
}

export class Inline extends Box {
  public isIfcRoot: boolean;
  /** applies only to IFC roots */
  public allText: string = '';
  /** applies only to IFC roots */
  public runs: Run[] = [];

  constructor(style: Style, children: Box[], isAnonymous: boolean = false, isIfcRoot: boolean = false) {
    super(style, children, isAnonymous);
    this.isIfcRoot = isIfcRoot;
  }

  isInline(): this is Inline {
    return true;
  }

  get sym() {
    return '▭';
  }

  get isInlineLevel() {
    return true;
  }

  get desc() {
    return (this.isAnonymous ? dim : '')
      + (this.isIfcRoot ? underline : '')
      + 'Inline'
      + ' ' + this.id
      + reset;
  }

  removeCollapsedRuns() {
    const stack: Inline[] = [this];

    if (!this.isIfcRoot) {
      throw new Error('removeCollapsedRuns() is for root inline context boxes');
    }

    while (stack.length) {
      const inline = stack.shift()!;
      for (let i = 0; i < inline.children.length; ++i) {
        const child = inline.children[i];
        if (child.isRun()) {
          if (child.j < child.i) {
            inline.children.splice(i, 1);
            i -= 1;
            const j = this.runs.indexOf(child);
            if (j < 0) throw new Error('Run expected in this.runs');
            this.runs.splice(j, 1);
          }
        } else if (child.isInline() && !child.isIfcRoot) {
          stack.unshift(child);
        }
      }
    }
  }

  // Collect text runs, collapse whitespace, create shaping boundaries, and
  // assign fonts
  prepareIfc() {
    const stack = this.children.slice();
    let i = 0;

    if (!this.isIfcRoot) {
      throw new Error('prepareIfc() called on a non-IFC inline');
    }

    // CSS Text Module Level 3, Appendix A, steps 1-4

    // Step 1
    while (stack.length) {
      const child = stack.shift()!;
      if (child.isInline() && child.isIfcRoot) continue;
      // TODO I don't think just checking isIfcRoot is correct, but works for
      // now. Specs imply the inner display type is the thing to check to see
      // if it belongs to this IFC (for example grids, tables, etc).
      if (child.isRun()) {
        child.setRange(i, i + child.text.length - 1);
        i += child.text.length;
        this.allText += child.text;
        this.runs.push(child);
      } else {
        stack.unshift(...child.children);
      }
    }

    const collapser = new Collapser(this.allText, this.runs);
    collapser.collapse();
    this.allText = collapser.buf;
    this.removeCollapsedRuns();

    // TODO step 2
    // TODO step 3
    // TODO step 4
  }

  containsAllCollapsibleWs() {
    const stack: Box[] = this.children.slice();
    let good = true;

    while (stack.length && good) {
      const child = stack.shift()!;
      if (!child.isInline() || !child.isIfcRoot) {
        if (child.isRun()) {
          if (!child.wsCollapsible) {
            good = false;
          } else {
            good = child.allCollapsible();
          }
        } else {
          stack.unshift(...child.children);
        }
      }
    }

    return good;
  }
}

// Helper for generateInlineBox
function mapTree(el: HTMLElement, stack: number[], level: number): [boolean, Box?] {
  let children = [], bail = false;

  if (el.style.display.outer !== 'inline') throw Error('Inlines only');

  if (!stack[level]) stack[level] = 0;

  let box;

  if (el.style.display.inner === 'flow') {
    while (!bail && stack[level] < el.children.length) {
      let child, childEl = el.children[stack[level]];

      if (childEl instanceof HTMLElement) {
        if (childEl.style.display.outer === 'block') {
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
    if (children.length) {
      const id = el.id + '.1';
      box = new Inline(new Style(id, el.style), children);
    }
  } else if (el.style.display.inner == 'flow-root') {
    box = generateBlockContainer(el);
  }

  return [bail, box];
}

// Generates an inline box for the element. Also generates blocks if the element
// has any descendents which generate them. These are not included in the inline.
function generateInlineBox(el: HTMLElement) {
  let inline, more = true, path: number[] = [], boxes = [];

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

// Wraps consecutive inlines and runs in block-level block containers. The
// returned list is guaranteed to be a list of only blocks. This obeys CSS21
// section 9.2.1.1
function wrapInBlockContainers(boxes: Box[], parentEl: HTMLElement) {
  const blocks = [];
  let subId = 0;

  for (let i = 0; i < boxes.length; ++i) {
    const inlines = [];

    while (i < boxes.length && boxes[i].isInlineLevel) inlines.push(boxes[i++]);

    if (inlines.length > 0) {
      const anonStyleId = parentEl.id + '.' + ++subId;
      const anonComputedStyle = createComputedStyle(parentEl.style, {});
      const anonStyle = new Style(anonStyleId, anonComputedStyle);
      const rootInline = new Inline(anonStyle, inlines, true, true);
      if (!rootInline.containsAllCollapsibleWs()) {
        rootInline.prepareIfc();
        blocks.push(new BlockContainerOfInline(anonStyle, rootInline, true, 'block'));
      }
    }

    if (i < boxes.length) blocks.push(boxes[i]);
  }

  return blocks;
}

// Generates a block container for the element
export function generateBlockContainer(el: HTMLElement, parentEl?: HTMLElement): BlockContainer {
  let boxes: Box[] = [], hasInline = false, hasBlock = false, isBfcRoot = false;
  
  if (
    el.style.display.inner === 'flow-root' ||
    parentEl && writingModeInlineAxis(el) !== writingModeInlineAxis(parentEl)
  ) {
    isBfcRoot = true;
  } else if (el.style.display.inner !== 'flow') {
    throw Error('Only flow layout supported');
  }

  for (const child of el.children) {
    if (child instanceof HTMLElement) {
      if (child.style.display.outer === 'block') {
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

  const level = el.style.display.outer;

  if (hasInline && !hasBlock) {
    const anonStyleId = el.id + '.1';
    const anonComputedStyle = createComputedStyle(el.style, {});
    const anonStyle = new Style(anonStyleId, anonComputedStyle);
    const inline = new Inline(anonStyle, boxes, true, true);
    inline.prepareIfc();
    return new BlockContainerOfInline(anonStyle, inline, false, level);
  }

  if (hasInline && hasBlock) boxes = wrapInBlockContainers(boxes, el);

  const style = new Style(el.id, el.style);

  return new BlockContainerOfBlocks(style, boxes, false, level, isBfcRoot);
}

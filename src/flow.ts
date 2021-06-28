import {HTMLElement, TextNode} from './node';
import {createComputedStyle, Style, LogicalStyle} from './cascade';
import {Run, Collapser, ShapedItem, Linebox, getCascade, getFace, shapeIfc, createLineboxes} from './text';
import {Box, Area, WritingMode} from './box';
import {Harfbuzz, HbFont} from 'harfbuzzjs';
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

let id = 0;

const reset = '\x1b[0m';
const bold = '\x1b[1m';
const dim = '\x1b[2m';
const underline = '\x1b[4m';

export type LayoutContext = {
  lastBlockContainerArea: Area,
  lastPositionedArea: Area,
  bfcWritingMode: WritingMode,
  bfcStack: (BlockBox | 'post')[],
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
        adjoins = box.children.length === 0 && !box.isBlockLevelBfcBlockContainer() && heightOk;
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
  get desc() {
    const isBfcRoot = this.isBlockLevelBfcBlockContainer() || this.isInlineLevelBfcBlockContainer();
    // TODO is this not super ideal? to down-cast in a base class?
    return (this.isAnonymous ? dim : '')
      + (isBfcRoot ? underline : '')
      + (this.isInlineLevelBfcBlockContainer() ? 'Inline' : 'Block')
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

  isBlockContainer(): this is BlockContainer {
    return true;
  }

  abstract doInlineBoxModel(ctx: LayoutContext): void;
  abstract doBlockBoxModel(ctx: LayoutContext): void;
}

export abstract class BlockBox extends BlockContainer {
  isBlockBox(): this is BlockBox {
    return true;
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

  doInlineBoxModel(ctx: LayoutContext) {
    // CSS 2.2 §10.3.3
    // ---------------

    if (!this.containingBlock) {
      throw new Error(`Inline layout called too early on ${this.id}: no containing block`);
    }

    const style = this.style.createLogicalView(ctx.bfcWritingMode);
    const container = this.containingBlock.createLogicalView(ctx.bfcWritingMode);
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

    const content = this.contentArea.createLogicalView(ctx.bfcWritingMode);
    // Paragraph 5: auto width
    if (style.inlineSize === 'auto') {
      if (marginInlineStart === 'auto') marginInlineStart = 0;
      if (marginInlineEnd === 'auto') marginInlineEnd = 0;
    }

    const padding = this.paddingArea.createLogicalView(ctx.bfcWritingMode);
    const border = this.borderArea.createLogicalView(ctx.bfcWritingMode);

    assumePx(marginInlineStart);
    assumePx(marginInlineEnd);

    border.inlineStart = marginInlineStart;
    border.inlineEnd = marginInlineEnd;

    padding.inlineStart = style.borderInlineStartWidth;
    padding.inlineEnd = style.borderInlineEndWidth;

    content.inlineStart = style.paddingInlineStart;
    content.inlineEnd = style.paddingInlineEnd;
  }

  doBlockBoxModel(ctx: LayoutContext) {
    // CSS 2.2 §10.6.3
    // ---------------

    const style = this.style.createLogicalView(ctx.bfcWritingMode);

    if (style.blockSize === 'auto') {
      if (this.children.length === 0) {
        this.setBlockSize(0, ctx.bfcWritingMode); // Case 4
      } else {
        // Cases 1-4 should be handled by doBoxPositioning, where margin
        // calculation happens. These bullet points seem to be re-phrasals of
        // margin collapsing in CSS 2.2 § 8.3.1 at the very end. If I'm wrong,
        // more might need to happen here.
      }
    } else {
      this.setBlockSize(style.blockSize, ctx.bfcWritingMode);
    }
  }

  abstract preprocess(ctx: PreprocessContext): Promise<void>;
}

export class BlockContainerOfIfc extends BlockBox {
  public children: IfcInline[];

  constructor(style: Style, children: IfcInline[], isAnonymous: boolean) {
    super(style, children, isAnonymous);
    this.children = children;
  }

  isBlockContainerOfIfc(): this is BlockContainerOfIfc {
    return true;
  }

  doTextLayout(ctx: LayoutContext) {
    const [rootInline] = this.children;
    rootInline.doTextLayout(ctx);
    this.setBlockSize(rootInline.height, ctx.bfcWritingMode);
  }

  async preprocess(ctx: PreprocessContext) {
    const [rootInline] = this.children;
    return rootInline.preprocessIfc(ctx);
  }
}

export class BlockContainerOfBlockBoxes extends BlockBox {
  public children: BlockBox[];

  constructor(style: Style, children: BlockBox[], isAnonymous: boolean) {
    super(style, children, isAnonymous);
    this.children = children;
  }

  isBlockContainerOfBlockBoxes(): this is BlockContainerOfBlockBoxes {
    return true;
  }

  async preprocess(ctx: PreprocessContext) {
    const promises:Promise<any>[] = [];
    for (const child of this.children) promises.push(child.preprocess(ctx));
    await Promise.all(promises);
  }
}

export class BlockLevelBfcBlockContainer extends BlockBox {
  public children: BlockBox[];

  constructor(style: Style, children: BlockBox[], isAnonymous: boolean) {
    super(style, children, isAnonymous);
    this.children = children;
  }

  isBlockLevelBfcBlockContainer(): this is BlockLevelBfcBlockContainer {
    return true;
  }

  async preprocess(ctx: PreprocessContext) {
    const promises:Promise<any>[] = [];
    for (const child of this.children) promises.push(child.preprocess(ctx));
    await Promise.all(promises);
  }
}

export class InlineLevelBfcBlockContainer extends BlockContainer {
  public children: BlockBox[];

  constructor(style: Style, children: BlockBox[], isAnonymous: boolean) {
    super(style, children, isAnonymous);
    this.children = children;
  }

  isInlineLevelBfcBlockContainer(): this is InlineLevelBfcBlockContainer {
    return true;
  }

  doInlineBoxModel(ctx: LayoutContext) {
    throw new Error('Not yet implemented');
  }

  doBlockBoxModel(ctx: LayoutContext) {
    throw new Error('Not yet implemented');
  }
}

type BfcBlockContainer = BlockLevelBfcBlockContainer | InlineLevelBfcBlockContainer;

function doBoxPositioning(box: BfcBlockContainer, ctx: LayoutContext) {
  const mctx = new MarginCollapseContext();
  let order = 'pre';

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
      if (style.blockSize === 'auto' && block.isBlockContainerOfBlockBoxes()) {
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

  const content = box.contentArea.createLogicalView(ctx.bfcWritingMode);

  if (content.blockSize === undefined) {
    box.setBlockSize(blockOffset, ctx.bfcWritingMode);
  }
}

export function layoutBlockBox(box: BlockBox, ctx: LayoutContext) {
  ctx.bfcStack.push(box);

  const cctx = Object.assign({}, ctx);

  box.assignContainingBlocks(cctx);

  if (!box.containingBlock) {
    throw new Error(`BlockContainer ${box.id} has no containing block!`);
  }

  // First resolve percentages into actual values
  box.style.resolvePercentages(box.containingBlock);

  // And resolve box-sizing (which has a dependency on the above)
  box.style.resolveBoxModel();

  if (box.isBlockContainerOfIfc()) {
    const [inline] = box.children;
    inline.assignContainingBlocks(cctx);
  }

  // TODO: box goes for any block-level box, not just block containers.
  // It should probably go on the box class, but the BFC methods could
  // still go on this class while the IFC methods would go on the inline
  // class

  box.doInlineBoxModel(ctx);
  box.doBlockBoxModel(ctx);

  // Child flow is now possible
  if (box.isBlockLevelBfcBlockContainer()) {
    cctx.bfcWritingMode = box.style.writingMode;
    cctx.bfcStack = [];
  }

  if (box.isBlockContainerOfIfc()) {
    box.doTextLayout(ctx);
  } else if (box.isBlockLevelBfcBlockContainer() || box.isBlockContainerOfBlockBoxes()) {
    for (const child of box.children) {
      layoutBlockBox(child, cctx);
    }
  } else {
    throw new Error(`Unknown box type: ${box.id}`);
  }

  if (box.isBlockLevelBfcBlockContainer()) {
    doBoxPositioning(box, cctx);
  }

  ctx.bfcStack.push('post', box);
}

// exported because used by painter
export function getAscenderDescender(style: Style, font: HbFont, upem: number) { // CSS2 §10.8.1
  const {fontSize, lineHeight: cssLineHeight} = style;
  const {ascender, descender, lineGap} = font.getExtents("ltr"); // TODO
  const emHeight = (ascender - descender) / upem;
  const pxHeight = emHeight * fontSize;
  const lineHeight = cssLineHeight === 'normal' ? pxHeight + lineGap / upem * fontSize : cssLineHeight;
  const halfLeading = (lineHeight - pxHeight) / 2;
  const ascenderPx = ascender / upem * fontSize;
  const descenderPx = -descender / upem * fontSize;
  return {ascender: halfLeading + ascenderPx, descender: halfLeading + descenderPx};
}

export class Inline extends Box {
  // Hack to get TS to not think an Inline is a Box
  // Remove when other properties are added
  private className = "inline";

  isInline(): this is Inline {
    return true;
  }

  get sym() {
    return '▭';
  }

  get desc() {
    return (this.isAnonymous ? dim : '')
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

  constructor(style: Style, children: Box[]) {
    super(style, children, true);
    this.prepare();
  }

  isIfcInline(): this is IfcInline {
    return true;
  }

  removeCollapsedRuns() {
    const stack: Inline[] = [this];

    while (stack.length) {
      const inline = stack.shift()!;

      for (let i = 0; i < inline.children.length; ++i) {
        const child = inline.children[i];
        if (child.isRun()) {
          if (child.end < child.start) {
            inline.children.splice(i, 1);
            i -= 1;
            const j = this.runs.indexOf(child);
            if (j < 0) throw new Error('Run expected in this.runs');
            this.runs.splice(j, 1);
          }
        } else if (child.isInline() && !child.isIfcInline()) {
          stack.unshift(child);
        }
      }
    }
  }

  // Collect text runs, collapse whitespace, create shaping boundaries, and
  // assign fonts
  private prepare() {
    const stack:Box[] = this.children.slice();
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
      } else {
        // TODO: this is e.g. a block container. store it somewhere for future
        // layout here
        throw new Error(`Only inlines and runs in IFCs for now (box ${this.id})`);
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

  async preprocessIfc(ctx: PreprocessContext) {
    const strutCascade = getCascade(ctx.fcfg, this.style, 'Latn');
    const strutFontMatch = strutCascade.matches[0];
    const strutFace = await getFace(ctx.hb, strutFontMatch.file, strutFontMatch.index);
    this.strut = new ShapedItem(strutFace, [], 0, '', this.style);
    this.shaped = await shapeIfc(this, ctx);
  }

  doTextLayout(ctx: LayoutContext) {
    const hb = ctx.hb;
    let bottom = 0;
    let runi = 0;
    let linei = 0;
    let itemi = 0;
    let isNewLine = true;

    this.lineboxes = createLineboxes(this, ctx);

    if (!this.strut) throw new Error('Preprocess first');

    const strutFont = hb.createFont(this.strut.face);

    // Since runs are the smallest ranges that can change style, iterate them to
    // look at lineHeight. Shaping items also affect lineHeight, so those have
    // to be iterated too. Every combination of the three must be checked.
    while (linei < this.lineboxes.length && runi < this.runs.length && itemi < this.shaped.length) {
      const linebox = this.lineboxes[linei];
      const run = this.runs[runi];
      const item = this.shaped[itemi];
      const itemEnd = item.offset + item.text.length; // TODO make it use {start, end}

      if (isNewLine) {
        const extents = getAscenderDescender(this.strut.style, strutFont, this.strut.face.upem);
        linebox.ascender = extents.ascender;
        linebox.descender = extents.descender;
      }

      const font = hb.createFont(item.face);
      const extents = getAscenderDescender(run.style, font, item.face.upem);
      linebox.ascender = Math.max(linebox.ascender, extents.ascender);
      linebox.descender = Math.max(linebox.descender, extents.descender);
      font.destroy();

      const marker = Math.min(run.end, linebox.end, itemEnd);

      if (marker === run.end) runi += 1;
      if (marker === linebox.end) linei += 1;
      if (marker === itemEnd) itemi += 1;
      isNewLine = marker === linebox.end;
      if (isNewLine) bottom += linebox.ascender + linebox.descender;
    }

    if (linei < this.lineboxes.length) {
      bottom += this.lineboxes[linei].ascender + this.lineboxes[linei].descender;
    }

    strutFont.destroy();

    this.height = bottom;
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

type InlineLevel = Inline | InlineLevelBfcBlockContainer | Run;

type InlineNotRun = Inline | InlineLevelBfcBlockContainer;

// Helper for generateInlineBox
function mapTree(el: HTMLElement, stack: number[], level: number): [boolean, InlineNotRun?] {
  let children = [], bail = false;

  if (el.style.display.outer !== 'inline') throw Error('Inlines only');

  if (!stack[level]) stack[level] = 0;

  let box:InlineNotRun | undefined;

  if (el.style.display.inner === 'flow') {
    while (!bail && stack[level] < el.children.length) {
      let child: InlineLevel | undefined, childEl = el.children[stack[level]];

      if (childEl instanceof HTMLElement) {
        if (childEl.style.display.outer === 'block') {
          bail = true;
        } else if (childEl.style.display.inner === 'flow-root') {
          child = generateBlockContainer(childEl) as InlineLevelBfcBlockContainer;
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
      box = new Inline(new Style(id, el.style), children, false);
    }
  } else if (el.style.display.inner == 'flow-root') {
    box = generateBlockContainer(el) as InlineLevelBfcBlockContainer;
  }

  return [bail, box];
}

// Generates an inline box for the element. Also generates blocks if the element
// has any descendents which generate them. These are not included in the inline.
function generateInlineBox(el: HTMLElement) {
  const path: number[] = [], boxes:(InlineLevel | BlockBox)[] = [];
  let inline: InlineNotRun | undefined, more = true;

  if (el.style.display.outer !== 'inline') throw Error('Inlines only');

  while (more) {
    let childEl;

    [more, inline] = mapTree(el, path, 0);
    if (inline) boxes.push(inline);

    while ((childEl = el.getEl(path)) instanceof HTMLElement && childEl.style.display.outer === 'block') {
      boxes.push(generateBlockContainer(childEl, el) as BlockBox);
      ++path[path.length - 1];
    }
  }

  return boxes;
}

function isInlineLevel(box: Box): box is InlineLevel {
  return box.isInline() || box.isInlineLevelBfcBlockContainer() || box.isRun();
}

// Wraps consecutive inlines and runs in block-level block containers. The
// returned list is guaranteed to be a list of only blocks. This obeys CSS21
// section 9.2.1.1
function wrapInBlockContainers(boxes: Box[], parentEl: HTMLElement) {
  const blocks:BlockBox[] = [];
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
        blocks.push(new BlockContainerOfIfc(anonStyle, [rootInline], true));
      }
    }

    if (i < boxes.length) blocks.push(boxes[i] as BlockBox);
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

  const style = new Style(el.id, el.style);

  if (hasInline && !hasBlock) {
    const anonStyleId = el.id + '.1';
    const anonComputedStyle = createComputedStyle(el.style, {});
    const anonStyle = new Style(anonStyleId, anonComputedStyle);
    const inline = new IfcInline(anonStyle, boxes);
    const block = new BlockContainerOfIfc(style, [inline], false);

    if (level === 'block') {
      // TODO: I'm not checking isBfcRoot here because is there any difference
      // between a BFC root with only inlines and a block container of inlines
      // (IFC root/paragraph)? If there is, it's easy to fix, but I don't think
      // there is a difference
      return block;
    } else {
      return new InlineLevelBfcBlockContainer(style, [block], false);
    }
  }

  if (hasInline && hasBlock) boxes = wrapInBlockContainers(boxes, el);

  if (isBfcRoot) {
    return new BlockLevelBfcBlockContainer(style, boxes as BlockBox[], false);
  } else {
    return new BlockContainerOfBlockBoxes(style, boxes as BlockBox[], false);
  }
}

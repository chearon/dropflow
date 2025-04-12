import {binarySearch, Logger} from './util.js';
import {HTMLElement, TextNode} from './dom.js';
import {createStyle, Style, EMPTY_STYLE} from './style.js';
import {
  EmptyInlineMetrics,
  InlineMetrics,
  Linebox,
  Paragraph,
  Run,
  collapseWhitespace,
  createEmptyParagraph,
  createParagraph,
  getFontMetrics
} from './layout-text.js';
import {Box, BoxArea, RenderItem} from './layout-box.js';

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

export interface LayoutContext {
  lastBlockContainerArea: BoxArea,
  lastPositionedArea: BoxArea,
  mode: 'min-content' | 'max-content' | 'normal',
  bfc: BlockFormattingContext
}

class MarginCollapseCollection {
  private positive: number;
  private negative: number;

  constructor(initialMargin: number = 0) {
    this.positive = 0;
    this.negative = 0;
    this.add(initialMargin);
  }

  add(margin: number) {
    if (margin < 0) {
      this.negative = Math.max(this.negative, -margin);
    } else {
      this.positive = Math.max(this.positive, margin);
    }
    return this;
  }

  get() {
    return this.positive - this.negative;
  }

  clone() {
    const c = new MarginCollapseCollection();
    c.positive = this.positive;
    c.negative = this.negative;
    return c;
  }
}

const EMPTY_MAP = new Map();

export class BlockFormattingContext {
  public inlineSize: number;
  public fctx?: FloatContext;
  public stack: (BlockContainer | {post: BlockContainer})[];
  public cbBlockStart: number;
  public cbLineLeft: number;
  public cbLineRight: number;
  private sizeStack: number[];
  private offsetStack: number[];
  private last: 'start' | 'end' | null;
  private level: number;
  private hypotheticals: Map<Box, number>;
  private margin: {
    level: number,
    collection: MarginCollapseCollection,
    clearanceAtLevel?: number
  };

  constructor(inlineSize: number) {
    this.inlineSize = inlineSize;
    this.stack = [];
    this.cbBlockStart = 0;
    this.cbLineLeft = 0;
    this.cbLineRight = 0;
    this.sizeStack = [0];
    this.offsetStack = [0];
    this.last = null;
    this.level = 0;
    this.margin = {level: 0, collection: new MarginCollapseCollection()};
    this.hypotheticals = EMPTY_MAP;
  }

  boxStart(box: BlockContainer, ctx: LayoutContext) {
    const {lineLeft, lineRight, blockStart} = box.getContainingBlockToContent();
    const paddingBlockStart = box.style.getPaddingBlockStart(box);
    const borderBlockStartWidth = box.style.getBorderBlockStartWidth(box);
    const marginBlockStart = box.style.getMarginBlockStart(box);
    let floatBottom = 0;
    let clearance = 0;

    assumePx(marginBlockStart);

    if (this.fctx && (box.style.clear === 'left' || box.style.clear === 'both')) {
      floatBottom = Math.max(floatBottom, this.fctx.getLeftBottom());
    }

    if (this.fctx && (box.style.clear === 'right' || box.style.clear === 'both')) {
      floatBottom = Math.max(floatBottom, this.fctx.getRightBottom());
    }

    if (box.style.clear !== 'none') {
      const hypo = this.margin.collection.clone().add(marginBlockStart).get();
      clearance = Math.max(clearance, floatBottom - (this.cbBlockStart + hypo));
    }

    const adjoinsPrevious = clearance === 0;
    const adjoinsNext = paddingBlockStart === 0 && borderBlockStartWidth === 0;

    if (adjoinsPrevious) {
      this.margin.collection.add(marginBlockStart);
    } else {
      this.positionBlockContainers();
      const c = floatBottom - this.cbBlockStart;
      this.margin = {level: this.level, collection: new MarginCollapseCollection(c)};
      if (box.canCollapseThrough()) this.margin.clearanceAtLevel = this.level;
    }

    this.last = 'start';
    this.level += 1;
    this.cbLineLeft += lineLeft;
    this.cbLineRight += lineRight;

    this.stack.push(box);

    if (box.isBlockContainerOfInlines()) {
      this.cbBlockStart += blockStart + this.margin.collection.get();
    }

    this.fctx?.boxStart();

    if (box.isBlockContainerOfInlines()) {
      box.doTextLayout(ctx);
      this.cbBlockStart -= blockStart + this.margin.collection.get();
    }

    if (!adjoinsNext) {
      this.positionBlockContainers();
      this.margin = {level: this.level, collection: new MarginCollapseCollection()};
    }
  }

  boxEnd(box: BlockContainer) {
    const {lineLeft, lineRight} = box.getContainingBlockToContent();
    const paddingBlockEnd = box.style.getPaddingBlockEnd(box);
    const borderBlockEndWidth = box.style.getBorderBlockEndWidth(box);
    const marginBlockEnd = box.style.getMarginBlockEnd(box);
    let adjoins = paddingBlockEnd === 0
      && borderBlockEndWidth === 0
      && (this.margin.clearanceAtLevel == null || this.level > this.margin.clearanceAtLevel);

    assumePx(marginBlockEnd);

    if (adjoins) {
      if (this.last === 'start') {
        adjoins = box.canCollapseThrough();
      } else {
        const blockSize = box.style.getBlockSize(box);
        // Handle the end of a block box that was at the end of its parent
        adjoins = blockSize === 'auto';
      }
    }

    this.stack.push({post: box});

    this.level -= 1;
    this.cbLineLeft -= lineLeft;
    this.cbLineRight -= lineRight;

    if (!adjoins) {
      this.positionBlockContainers();
      this.margin = {level: this.level, collection: new MarginCollapseCollection()};
    }

    // Collapsing through - need to find the hypothetical position
    if (this.last === 'start') {
      if (this.hypotheticals === EMPTY_MAP) this.hypotheticals = new Map();
      this.hypotheticals.set(box, this.margin.collection.get());
    }

    this.margin.collection.add(marginBlockEnd);
    // When a box's end adjoins to the previous margin, move the "root" (the
    // box which the margin will be placed adjacent to) to the highest-up box
    // in the tree, since its siblings need to be shifted.
    if (this.level < this.margin.level) this.margin.level = this.level;

    this.last = 'end';
  }

  getLocalVacancyForLine(
    bfc: BlockFormattingContext,
    blockOffset: number,
    blockSize: number,
    vacancy: IfcVacancy
  ) {
    let leftInlineSpace = 0;
    let rightInlineSpace = 0;

    if (this.fctx) {
      leftInlineSpace = this.fctx.leftFloats.getOccupiedSpace(blockOffset, blockSize, -this.cbLineLeft);
      rightInlineSpace = this.fctx.rightFloats.getOccupiedSpace(blockOffset, blockSize, -this.cbLineRight);
    }

    vacancy.leftOffset = this.cbLineLeft + leftInlineSpace;
    vacancy.rightOffset = this.cbLineRight + rightInlineSpace;
    vacancy.inlineSize = this.inlineSize - vacancy.leftOffset - vacancy.rightOffset;
    vacancy.blockOffset = blockOffset - bfc.cbBlockStart;
    vacancy.leftOffset -= bfc.cbLineLeft;
    vacancy.rightOffset -= bfc.cbLineRight;
  }

  ensureFloatContext(blockOffset: number) {
    return this.fctx || (this.fctx = new FloatContext(this, blockOffset));
  }

  finalize(box: BlockContainer) {
    if (!box.isBfcRoot()) throw new Error('This is for bfc roots only');

    const blockSize = box.style.getBlockSize(box);

    this.positionBlockContainers();

    if (blockSize === 'auto') {
      let lineboxHeight = 0;
      if (box.isBlockContainerOfInlines()) {
        lineboxHeight = box.contentArea.blockSize;
      }
      box.setBlockSize(Math.max(lineboxHeight, this.cbBlockStart, this.fctx?.getBothBottom() ?? 0));
    }
  }

  positionBlockContainers() {
    const sizeStack = this.sizeStack;
    const offsetStack = this.offsetStack;
    const margin = this.margin.collection.get();
    let passedMarginLevel = this.margin.level === offsetStack.length - 1;
    let levelNeedsPostOffset = offsetStack.length - 1;

    sizeStack[this.margin.level] += margin;
    this.cbBlockStart += margin;

    for (const item of this.stack) {
      const box = 'post' in item ? item.post : item;

      if ('post' in item) {
        const childSize = sizeStack.pop()!;
        const offset = offsetStack.pop()!;
        const level = sizeStack.length - 1;
        const sBlockSize = box.style.getBlockSize(box);

        if (sBlockSize === 'auto' && box.isBlockContainerOfBlockContainers() && !box.isBfcRoot()) {
          box.setBlockSize(childSize);
        }

        const blockSize = box.borderArea.blockSize;

        sizeStack[level] += blockSize;
        this.cbBlockStart = offset + blockSize;

        // Each time we go beneath a level that was created by the previous
        // positionBlockContainers(), we have to put the margin on the "after"
        // side of the block container. ("before" sides are covered at the top)
        // ][[]]
        if (level < levelNeedsPostOffset) {
          --levelNeedsPostOffset;
          this.cbBlockStart += margin;
        }
      } else {
        const hypothetical = this.hypotheticals.get(box);
        const level = sizeStack.length - 1;
        let blockOffset = sizeStack[level];

        if (!passedMarginLevel) {
          passedMarginLevel = this.margin.level === level;
        }

        if (!passedMarginLevel) {
          blockOffset += margin;
        }

        if (hypothetical !== undefined) {
          blockOffset -= margin - hypothetical;
        }

        box.setBlockPosition(blockOffset);

        sizeStack.push(0);
        offsetStack.push(this.cbBlockStart);
      }
    }

    this.stack = [];
  }
}

class FloatSide {
  items: BlockContainer[];
  // Moving shelf area (stretches to infinity in the block direction)
  shelfBlockOffset: number;
  shelfTrackIndex: number;
  // Tracks
  blockOffsets: number[];
  inlineSizes: number[];
  inlineOffsets: number[];
  floatCounts: number[];

  constructor(blockOffset: number) {
    this.items = [];
    this.shelfBlockOffset = blockOffset;
    this.shelfTrackIndex = 0;
    this.blockOffsets = [blockOffset];
    this.inlineSizes = [0];
    this.inlineOffsets = [0];
    this.floatCounts = [0];
  }

  initialize(blockOffset: number) {
    this.shelfBlockOffset = blockOffset;
    this.blockOffsets = [blockOffset];
  }

  repr() {
    let row1 = '', row2 = '';
    for (let i = 0; i < this.blockOffsets.length; ++i) {
      const blockOffset = this.blockOffsets[i];
      const inlineOffset = this.inlineOffsets[i];
      const size = this.inlineSizes[i];
      const count = this.floatCounts[i];
      const cell1 = `${blockOffset}`;
      const cell2 = `| O:${inlineOffset} S:${size} N:${count} `;
      const colSize = Math.max(cell1.length, cell2.length);

      row1 += cell1 + ' '.repeat(colSize - cell1.length);
      row2 += ' '.repeat(colSize - cell2.length) + cell2;
    }
    row1 += 'Inf';
    row2 += '|';
    return row1 + '\n' + row2;
  }

  getSizeOfTracks(start: number, end: number, inlineOffset: number) {
    let max = 0;
    for (let i = start; i < end; ++i) {
      if (this.floatCounts[i] > 0) {
        max = Math.max(max, inlineOffset + this.inlineSizes[i] + this.inlineOffsets[i]);
      }
    }
    return max;
  }

  getOverflow() {
    return this.getSizeOfTracks(0, this.inlineSizes.length, 0);
  }

  getFloatCountOfTracks(start: number, end: number) {
    let max = 0;
    for (let i = start; i < end; ++i) max = Math.max(max, this.floatCounts[i]);
    return max;
  }

  getEndTrack(start: number, blockOffset: number, blockSize: number) {
    const blockPosition = blockOffset + blockSize;
    let end = start + 1;
    while (end < this.blockOffsets.length && this.blockOffsets[end] < blockPosition) end++;
    return end;
  }

  getTrackRange(blockOffset: number, blockSize: number = 0):[number, number] {
    let start = binarySearch(this.blockOffsets, blockOffset);
    if (this.blockOffsets[start] !== blockOffset) start -= 1;
    return [start, this.getEndTrack(start, blockOffset, blockSize)];
  }

  getOccupiedSpace(blockOffset: number, blockSize: number, inlineOffset: number) {
    if (this.items.length === 0) return 0;
    const [start, end] = this.getTrackRange(blockOffset, blockSize);
    return this.getSizeOfTracks(start, end, inlineOffset);
  }

  boxStart(blockOffset: number) {
    // This seems to violate rule 5 for blocks if the boxStart block has a
    // negative margin, but it's what browsers do 🤷‍♂️
    this.shelfBlockOffset = blockOffset;
    [this.shelfTrackIndex] = this.getTrackRange(this.shelfBlockOffset);
  }

  dropShelf(blockOffset: number) {
    if (blockOffset > this.shelfBlockOffset) {
      this.shelfBlockOffset = blockOffset;
      [this.shelfTrackIndex] = this.getTrackRange(this.shelfBlockOffset);
    }
  }

  getNextTrackOffset() {
    if (this.shelfTrackIndex + 1 < this.blockOffsets.length) {
      return this.blockOffsets[this.shelfTrackIndex + 1];
    } else {
      return this.blockOffsets[this.shelfTrackIndex];
    }
  }

  getBottom() {
    return this.blockOffsets[this.blockOffsets.length - 1];
  }

  splitTrack(trackIndex: number, blockOffset: number) {
    const size = this.inlineSizes[trackIndex];
    const offset = this.inlineOffsets[trackIndex];
    const count = this.floatCounts[trackIndex];
    this.blockOffsets.splice(trackIndex + 1, 0, blockOffset);
    this.inlineSizes.splice(trackIndex, 0, size);
    this.inlineOffsets.splice(trackIndex, 0, offset);
    this.floatCounts.splice(trackIndex, 0, count);
  }

  splitIfShelfDropped() {
    if (this.blockOffsets[this.shelfTrackIndex] !== this.shelfBlockOffset) {
      this.splitTrack(this.shelfTrackIndex, this.shelfBlockOffset);
      this.shelfTrackIndex += 1;
    }
  }

  placeFloat(box: BlockContainer, vacancy: IfcVacancy, cbLineLeft: number, cbLineRight: number) {
    if (box.style.float === 'none') {
      throw new Error('Tried to place float:none');
    }

    if (vacancy.blockOffset !== this.shelfBlockOffset) {
      throw new Error('Assertion failed');
    }

    this.splitIfShelfDropped();

    const startTrack = this.shelfTrackIndex;
    const margins = box.getMarginsAutoIsZero();
    const blockSize = box.borderArea.height + margins.blockStart + margins.blockEnd;
    const blockEndOffset = this.shelfBlockOffset + blockSize;
    let endTrack;

    if (blockSize > 0) {
      endTrack = this.getEndTrack(startTrack, this.shelfBlockOffset, blockSize);

      if (this.blockOffsets[endTrack] !== blockEndOffset) {
        this.splitTrack(endTrack - 1, blockEndOffset);
      }
    } else {
      endTrack = startTrack;
    }

    const cbOffset = box.style.float === 'left' ? vacancy.leftOffset : vacancy.rightOffset;
    const cbLineSide = box.style.float === 'left' ? cbLineLeft : cbLineRight;
    const marginOffset = box.style.float === 'left' ? margins.lineLeft : margins.lineRight;
    const marginEnd = box.style.float === 'left' ? margins.lineRight : margins.lineLeft;

    if (box.style.float === 'left') {
      box.setInlinePosition(cbOffset - cbLineSide + marginOffset);
    } else {
      const inlineSize = box.containingBlock.inlineSize;
      const size = box.borderArea.inlineSize;
      box.setInlinePosition(cbOffset - cbLineSide + inlineSize - marginOffset - size);
    }

    for (let track = startTrack; track < endTrack; track += 1) {
      if (this.floatCounts[track] === 0) {
        this.inlineOffsets[track] = cbOffset;
        this.inlineSizes[track] = marginOffset + box.borderArea.width + marginEnd;
      } else {
        this.inlineSizes[track] = cbOffset - this.inlineOffsets[track] + marginOffset + box.borderArea.width + marginEnd;
      }
      this.floatCounts[track] += 1;
    }

    this.items.push(box);
  }
}

export class IfcVacancy {
  leftOffset: number;
  rightOffset: number;
  inlineSize: number;
  blockOffset: number;
  leftFloatCount: number;
  rightFloatCount: number;

  static EPSILON = 1 / 64;

  constructor(
    leftOffset: number,
    rightOffset: number,
    blockOffset: number,
    inlineSize: number,
    leftFloatCount: number,
    rightFloatCount: number
  ) {
    this.leftOffset = leftOffset;
    this.rightOffset = rightOffset;
    this.blockOffset = blockOffset;
    this.inlineSize = inlineSize;
    this.leftFloatCount = leftFloatCount;
    this.rightFloatCount = rightFloatCount;
  }

  fits(inlineSize: number) {
    return inlineSize - this.inlineSize < IfcVacancy.EPSILON;
  }

  hasFloats() {
    return this.leftFloatCount > 0 || this.rightFloatCount > 0;
  }
};

export class FloatContext {
  bfc: BlockFormattingContext;
  leftFloats: FloatSide;
  rightFloats: FloatSide;
  misfits: BlockContainer[];

  constructor(bfc: BlockFormattingContext, blockOffset: number) {
    this.bfc = bfc;
    this.leftFloats = new FloatSide(blockOffset);
    this.rightFloats = new FloatSide(blockOffset);
    this.misfits = [];
  }

  boxStart() {
    this.leftFloats.boxStart(this.bfc.cbBlockStart);
    this.rightFloats.boxStart(this.bfc.cbBlockStart);
  }

  getVacancyForLine(blockOffset: number, blockSize: number) {
    const leftInlineSpace = this.leftFloats.getOccupiedSpace(blockOffset, blockSize, -this.bfc.cbLineLeft);
    const rightInlineSpace = this.rightFloats.getOccupiedSpace(blockOffset, blockSize, -this.bfc.cbLineRight);
    const leftOffset = this.bfc.cbLineLeft + leftInlineSpace;
    const rightOffset = this.bfc.cbLineRight + rightInlineSpace;
    const inlineSize = this.bfc.inlineSize - leftOffset - rightOffset;
    return new IfcVacancy(leftOffset, rightOffset, blockOffset, inlineSize, 0, 0);
  }

  getVacancyForBox(box: BlockContainer, lineWidth: number) {
    const float = box.style.float;
    const floats = float === 'left' ? this.leftFloats : this.rightFloats;
    const oppositeFloats = float === 'left' ? this.rightFloats : this.leftFloats;
    const inlineOffset = float === 'left' ? -this.bfc.cbLineLeft : -this.bfc.cbLineRight;
    const oppositeInlineOffset = float === 'left' ? -this.bfc.cbLineRight : -this.bfc.cbLineLeft;
    const blockOffset = floats.shelfBlockOffset;
    const blockSize = box.borderArea.height;
    const startTrack = floats.shelfTrackIndex;
    const endTrack = floats.getEndTrack(startTrack, blockOffset, blockSize);
    const inlineSpace = floats.getSizeOfTracks(startTrack, endTrack, inlineOffset);
    const [oppositeStartTrack, oppositeEndTrack] = oppositeFloats.getTrackRange(blockOffset, blockSize);
    const oppositeInlineSpace = oppositeFloats.getSizeOfTracks(oppositeStartTrack, oppositeEndTrack, oppositeInlineOffset);
    const leftOffset = this.bfc.cbLineLeft + (float === 'left' ? inlineSpace : oppositeInlineSpace);
    const rightOffset = this.bfc.cbLineRight + (float === 'right' ? inlineSpace : oppositeInlineSpace);
    const inlineSize = this.bfc.inlineSize - leftOffset - rightOffset - lineWidth;
    const floatCount = floats.getFloatCountOfTracks(startTrack, endTrack);
    const oppositeFloatCount = oppositeFloats.getFloatCountOfTracks(oppositeStartTrack, oppositeEndTrack);
    const leftFloatCount = float === 'left' ? floatCount : oppositeFloatCount;
    const rightFloatCount = float === 'left' ? oppositeFloatCount : floatCount;

    return new IfcVacancy(leftOffset, rightOffset, blockOffset, inlineSize, leftFloatCount, rightFloatCount);
  }

  getLeftBottom() {
    return this.leftFloats.getBottom();
  }

  getRightBottom() {
    return this.rightFloats.getBottom();
  }

  getBothBottom() {
    return Math.max(this.leftFloats.getBottom(), this.rightFloats.getBottom());
  }

  findLinePosition(blockOffset: number, blockSize: number, inlineSize: number) {
    let [leftShelfIndex] = this.leftFloats.getTrackRange(blockOffset, blockSize);
    let [rightShelfIndex] = this.rightFloats.getTrackRange(blockOffset, blockSize);

    while (
      leftShelfIndex < this.leftFloats.inlineSizes.length ||
      rightShelfIndex < this.rightFloats.inlineSizes.length
    ) {
      let leftOffset, rightOffset;

      if (leftShelfIndex < this.leftFloats.inlineSizes.length) {
        leftOffset = this.leftFloats.blockOffsets[leftShelfIndex];
      } else {
        leftOffset = Infinity;
      }

      if (rightShelfIndex < this.rightFloats.inlineSizes.length) {
        rightOffset = this.rightFloats.blockOffsets[rightShelfIndex];
      } else {
        rightOffset = Infinity;
      }

      blockOffset = Math.max(blockOffset, Math.min(leftOffset, rightOffset));
      const vacancy = this.getVacancyForLine(blockOffset, blockSize);

      if (inlineSize <= vacancy.inlineSize) return vacancy;

      if (leftOffset <= rightOffset) leftShelfIndex += 1;
      if (rightOffset <= leftOffset) rightShelfIndex += 1;
    }

    return this.getVacancyForLine(blockOffset, blockSize);
  }

  placeFloat(lineWidth: number, lineIsEmpty: boolean, box: BlockContainer) {
    if (box.style.float === 'none') {
      throw new Error('Attempted to place float: none');
    }

    if (this.misfits.length) {
      this.misfits.push(box);
    } else {
      const side = box.style.float === 'left' ? this.leftFloats : this.rightFloats;
      const oppositeSide = box.style.float === 'left' ? this.rightFloats : this.leftFloats;

      if (box.style.clear === 'left' || box.style.clear === 'both') {
        side.dropShelf(this.leftFloats.getBottom());
      }
      if (box.style.clear === 'right' || box.style.clear === 'both') {
        side.dropShelf(this.rightFloats.getBottom());
      }

      const vacancy = this.getVacancyForBox(box, lineWidth);
      const margins = box.getMarginsAutoIsZero();
      const inlineSize = box.borderArea.width + margins.lineLeft + margins.lineRight;

      if (vacancy.fits(inlineSize) || lineIsEmpty && !vacancy.hasFloats()) {
        box.setBlockPosition(side.shelfBlockOffset + margins.blockStart - this.bfc.cbBlockStart);
        side.placeFloat(box, vacancy, this.bfc.cbLineLeft, this.bfc.cbLineRight);
      } else {
        const vacancy = this.getVacancyForBox(box, 0);
        if (!vacancy.fits(inlineSize)) {
          const count = box.style.float === 'left' ? vacancy.leftFloatCount : vacancy.rightFloatCount;
          const oppositeCount = box.style.float === 'left' ? vacancy.rightFloatCount : vacancy.leftFloatCount;
          if (count > 0) {
            side.dropShelf(side.getNextTrackOffset());
          } else if (oppositeCount > 0) {
            const [, trackIndex] = oppositeSide.getTrackRange(side.shelfBlockOffset);
            if (trackIndex === oppositeSide.blockOffsets.length) throw new Error('assertion failed');
            side.dropShelf(oppositeSide.blockOffsets[trackIndex]);
          } // else both counts are 0 so it will fit next time the line is empty
        }

        this.misfits.push(box);
      }
    }
  }

  consumeMisfits() {
    while (this.misfits.length) {
      const misfits = this.misfits;
      this.misfits = [];
      for (const box of misfits) this.placeFloat(0, true, box);
    }
  }

  dropShelf(blockOffset: number) {
    this.leftFloats.dropShelf(blockOffset);
    this.rightFloats.dropShelf(blockOffset);
  }

  postLine(line: Linebox, didBreak: boolean) {
    if (didBreak || this.misfits.length) {
      this.dropShelf(this.bfc.cbBlockStart + line.blockOffset + line.height());
    }

    this.consumeMisfits();
  }

  // Float processing happens after every line, but some floats may be before
  // all lines
  preTextContent() {
    this.consumeMisfits();
  }
}

export interface BlockContainerOfInlines extends BlockContainer {
  children: IfcInline[];
}

export interface BlockContainerOfBlockContainers extends BlockContainer {
  children: BlockContainer[];
}

export class BlockContainer extends Box {
  public children: IfcInline[] | BlockContainer[];
  public borderArea: BoxArea;
  public paddingArea: BoxArea;
  public contentArea: BoxArea;

  static ATTRS = {
    ...Box.ATTRS,
    isInline: Box.BITS.isInline,
    isBfcRoot: Box.BITS.isBfcRoot
  };

  constructor(style: Style, children: IfcInline[] | BlockContainer[], attrs: number) {
    super(style, children, attrs);
    this.children = children;

    const area = new BoxArea(this);
    this.borderArea = area;
    this.paddingArea = area;
    this.contentArea = area;

    if (this.style.hasBorder()) {
      this.contentArea = this.paddingArea = this.borderArea.clone();
    }

    if (this.style.hasPadding()) {
      this.contentArea = this.paddingArea.clone();
    }
  }

  fillAreas() {
    if (this.style.hasBorder()) {
      const borderBlockStartWidth = this.style.getBorderBlockStartWidth(this);
      const borderLineLeftWidth = this.style.getBorderLineLeftWidth(this);
      this.paddingArea.blockStart = borderBlockStartWidth;
      this.paddingArea.lineLeft = borderLineLeftWidth;
      this.paddingArea.setParent(this.borderArea);
    }

    if (this.style.hasPadding()) {
      const paddingBlockStart = this.style.getPaddingBlockStart(this);
      const paddingLineLeft = this.style.getPaddingLineLeft(this);
      this.contentArea.blockStart = paddingBlockStart;
      this.contentArea.lineLeft = paddingLineLeft;
      this.contentArea.setParent(this.paddingArea);
    }
  }

  getLogSymbol() {
    if (this.isFloat()) {
      return '○︎';
    } else if (this.isInlineLevel()) {
      return '▬';
    } else {
      return '◼︎';
    }
  }

  logName(log: Logger) {
    if (this.isAnonymous()) log.dim();
    if (this.isBfcRoot()) log.underline();
    log.text(`Block ${this.id}`);
    log.reset();
  }

  get writingModeAsParticipant() {
    return this.containingBlock.writingMode;
  }

  get directionAsParticipant() {
    return this.containingBlock.direction;
  }

  setBlockPosition(position: number) {
    this.borderArea.blockStart = position;
  }

  setBlockSize(size: number) {
    this.contentArea.blockSize = size;

    if (this.style.hasPadding()) {
      const paddingBlockStart = this.style.getPaddingBlockStart(this);
      const paddingBlockEnd = this.style.getPaddingBlockEnd(this);
      const paddingSize = size + paddingBlockStart + paddingBlockEnd
      this.paddingArea.blockSize = paddingSize;
    }

    if (this.style.hasBorder()) {
      const borderBlockStartWidth = this.style.getBorderBlockStartWidth(this);
      const borderBlockEndWidth = this.style.getBorderBlockEndWidth(this);
      const borderSize = this.paddingArea.blockSize + borderBlockStartWidth + borderBlockEndWidth;
      this.borderArea.blockSize = borderSize;
    }
  }

  setInlinePosition(lineLeft: number) {
    this.borderArea.lineLeft = lineLeft;
  }

  setInlineOuterSize(size: number) {
    this.borderArea.inlineSize = size;

    if (this.style.hasBorder()) {
      const borderLineLeftWidth = this.style.getBorderLineLeftWidth(this);
      const borderLineRightWidth = this.style.getBorderLineRightWidth(this);
      const paddingSize = size - borderLineLeftWidth - borderLineRightWidth;
      this.paddingArea.inlineSize = paddingSize;
    }

    if (this.style.hasPadding()) {
      const paddingLineLeft = this.style.getPaddingLineLeft(this);
      const paddingLineRight = this.style.getPaddingLineRight(this);
      const contentSize = this.paddingArea.inlineSize - paddingLineLeft - paddingLineRight;
      this.contentArea.inlineSize = contentSize;
    }
  }

  getContainingBlockToContent() {
    const inlineSize = this.containingBlock.inlineSizeForPotentiallyOrthogonal(this);
    const borderBlockStartWidth = this.style.getBorderBlockStartWidth(this);
    const paddingBlockStart = this.style.getPaddingBlockStart(this);
    const bLineLeft = this.borderArea.lineLeft;
    const blockStart = borderBlockStartWidth + paddingBlockStart;
    const cInlineSize = this.contentArea.inlineSize;
    const borderLineLeftWidth = this.style.getBorderLineLeftWidth(this);
    const paddingLineLeft = this.style.getPaddingLineLeft(this);
    const lineLeft = bLineLeft + borderLineLeftWidth + paddingLineLeft;
    const lineRight = inlineSize - lineLeft - cInlineSize;

    return {blockStart, lineLeft, lineRight};
  }

  getDefiniteInlineSize() {
    const inlineSize = this.style.getInlineSize(this);

    if (inlineSize !== 'auto') {
      const marginLineLeft = this.style.getMarginLineLeft(this);
      const borderLineLeftWidth = this.style.getBorderLineLeftWidth(this);
      const paddingLineLeft = this.style.getPaddingLineLeft(this);

      const paddingLineRight = this.style.getPaddingLineRight(this);
      const borderLineRightWidth = this.style.getBorderLineRightWidth(this);
      const marginLineRight = this.style.getMarginLineRight(this);

      return (marginLineLeft === 'auto' ? 0 : marginLineLeft)
        + borderLineLeftWidth
        + paddingLineLeft
        + inlineSize
        + paddingLineRight
        + borderLineRightWidth
        + (marginLineRight === 'auto' ? 0 : marginLineRight);
    }
  }

  getMarginsAutoIsZero() {
    let marginLineLeft = this.style.getMarginLineLeft(this);
    let marginLineRight = this.style.getMarginLineRight(this);
    let marginBlockStart = this.style.getMarginBlockStart(this);
    let marginBlockEnd = this.style.getMarginBlockEnd(this);

    if (marginBlockStart === 'auto') marginBlockStart = 0;
    if (marginLineRight === 'auto') marginLineRight = 0;
    if (marginBlockEnd === 'auto') marginBlockEnd = 0;
    if (marginLineLeft === 'auto') marginLineLeft = 0;

    return {
      blockStart: marginBlockStart,
      lineRight: marginLineRight,
      blockEnd: marginBlockEnd,
      lineLeft: marginLineLeft
    };
  }

  getLastBaseline(): number | undefined {
    const stack: {block: BlockContainer, offset: number}[] = [{block: this, offset: 0}];

    while (stack.length) {
      const {block, offset} = stack.pop()!;

      if (block.isBlockContainerOfInlines()) {
        const [ifc] = block.children;
        const linebox = ifc.paragraph.lineboxes.at(-1);
        if (linebox) return offset + linebox.blockOffset + linebox.ascender;
      }

      if (block.isBlockContainerOfBlockContainers()) {
        const parentOffset = offset;

        for (const child of block.children) {
          const offset = parentOffset
            + child.borderArea.blockStart
            + child.style.getBorderBlockStartWidth(child);
            + child.style.getPaddingBlockStart(child);

          stack.push({block: child, offset});
        }
      }
    }
  }

  assignContainingBlocks(ctx: LayoutContext) {
    // CSS2.2 10.1
    if (this.style.position === 'absolute') {
      this.containingBlock = ctx.lastPositionedArea;
    } else {
      this.containingBlock = ctx.lastBlockContainerArea;
    }

    this.fillAreas();
    this.borderArea.setParent(this.containingBlock);

    ctx.lastBlockContainerArea = this.contentArea;

    if (this.style.position !== 'static') {
      ctx.lastPositionedArea = this.paddingArea;
    }
  }

  isBlockContainer(): this is BlockContainer {
    return true;
  }

  isInlineLevel() {
    return Boolean(this.bitfield & Box.BITS.isInline);
  }

  isBfcRoot() {
    return Boolean(this.bitfield & Box.BITS.isBfcRoot);
  }

  isFloat() {
    return this.style.float !== 'none';
  }

  isInlineBlock() {
    return this.isInlineLevel() && this.style.float === 'none';
  }

  loggingEnabled() {
    return Boolean(this.bitfield & Box.BITS.enableLogging);
  }

  isBlockContainerOfInlines(): this is BlockContainerOfInlines {
    return Boolean(this.children.length && this.children[0].isIfcInline());
  }

  canCollapseThrough(): boolean {
    const blockSize = this.style.getBlockSize(this);

    if (blockSize !== 'auto' && blockSize !== 0) return false;

    if (this.isBlockContainerOfInlines()) {
      const [ifc] = this.children;
      return !ifc.hasText();
    } else {
      return this.children.length === 0;
    }
  }

  isBlockContainerOfBlockContainers(): this is BlockContainerOfBlockContainers {
    return !this.isBlockContainerOfInlines();
  }

  propagate(parent: Box) {
    super.propagate(parent);

    if (this.isFloat()) {
      parent.bitfield |= Box.BITS.hasFloats;
    }

    if (this.isInlineBlock()) {
      // TODO: and not absolutely positioned
      parent.bitfield |= Box.BITS.hasInlineBlocks;
    }
  }

  postlayoutPreorder() {
    if (this.style.position === 'relative') {
      this.borderArea.x += this.getRelativeHorizontalShift();
      this.borderArea.y += this.getRelativeVerticalShift();
    }

    this.borderArea.absolutify();
    if (this.paddingArea !== this.borderArea) this.paddingArea.absolutify();
    if (this.contentArea !== this.paddingArea) this.contentArea.absolutify();
  }

  postlayoutPostorder() {
    this.borderArea.snapPixels();
    if (this.paddingArea !== this.borderArea) this.paddingArea.snapPixels();
    if (this.contentArea !== this.paddingArea) this.contentArea.snapPixels();
  }

  doTextLayout(ctx: LayoutContext) {
    if (!this.isBlockContainerOfInlines()) throw new Error('Children are block containers');
    const [ifc] = this.children;
    const blockSize = this.style.getBlockSize(this);
    ifc.doTextLayout(ctx);
    if (blockSize === 'auto') this.setBlockSize(ifc.paragraph.height);
  }

  hasBackground() {
    return this.style.backgroundColor.a > 0
      || this.style.borderTopWidth > 0 && this.style.borderTopColor.a > 0
      || this.style.borderRightWidth > 0 && this.style.borderRightColor.a > 0
      || this.style.borderBottomWidth > 0 && this.style.borderBottomColor.a > 0
      || this.style.borderLeftWidth > 0 && this.style.borderLeftColor.a > 0;
  }
}

function preBlockContainer(box: BlockContainer, ctx: LayoutContext) {
  // Containing blocks first, for absolute positioning later
  box.assignContainingBlocks(ctx);

  if (box.isBlockContainerOfInlines()) {
    const [inline] = box.children;
    inline.assignContainingBlocks(ctx);
  }
}

// §10.3.3
function doInlineBoxModelForBlockBox(box: BlockContainer) {
  const cInlineSize = box.containingBlock.inlineSizeForPotentiallyOrthogonal(box);
  const inlineSize = box.style.getInlineSize(box);
  let marginLineLeft = box.style.getMarginLineLeft(box);
  let marginLineRight = box.style.getMarginLineRight(box);

  // Paragraphs 2 and 3
  if (inlineSize !== 'auto') {
    const borderLineLeftWidth = box.style.getBorderLineLeftWidth(box);
    const paddingLineLeft = box.style.getPaddingLineLeft(box);
    const paddingLineRight = box.style.getPaddingLineRight(box);
    const borderLineRightWidth = box.style.getBorderLineRightWidth(box);
    const specifiedInlineSize = inlineSize
      + borderLineLeftWidth
      + paddingLineLeft
      + paddingLineRight
      + borderLineRightWidth
      + (marginLineLeft === 'auto' ? 0 : marginLineLeft)
      + (marginLineRight === 'auto' ? 0 : marginLineRight);

    // Paragraph 2: zero out auto margins if specified values sum to a length
    // greater than the containing block's width.
    if (specifiedInlineSize > cInlineSize) {
      if (marginLineLeft === 'auto') marginLineLeft = 0;
      if (marginLineRight === 'auto') marginLineRight = 0;
    }

    if (marginLineLeft !== 'auto' && marginLineRight !== 'auto') {
      // Paragraph 3: check over-constrained values. This expands the right
      // margin in LTR documents to fill space, or, if the above scenario was
      // hit, it makes the right margin negative.
      if (box.directionAsParticipant === 'ltr') {
        marginLineRight = cInlineSize - (specifiedInlineSize - marginLineRight);
      } else {
        marginLineLeft = cInlineSize - (specifiedInlineSize - marginLineRight);
      }
    } else { // one or both of the margins is auto, specifiedWidth < cb width
      if (marginLineLeft === 'auto' && marginLineRight !== 'auto') {
        // Paragraph 4: only auto value is margin-left
        marginLineLeft = cInlineSize - specifiedInlineSize;
      } else if (marginLineRight === 'auto' && marginLineLeft !== 'auto') {
        // Paragraph 4: only auto value is margin-right
        marginLineRight = cInlineSize - specifiedInlineSize;
      } else {
        // Paragraph 6: two auto values, center the content
        const margin = (cInlineSize - specifiedInlineSize) / 2;
        marginLineLeft = marginLineRight = margin;
      }
    }
  }

  // Paragraph 5: auto width
  if (inlineSize === 'auto') {
    if (marginLineLeft === 'auto') marginLineLeft = 0;
    if (marginLineRight === 'auto') marginLineRight = 0;
  }

  assumePx(marginLineLeft);
  assumePx(marginLineRight);

  box.setInlinePosition(marginLineLeft);
  box.setInlineOuterSize(cInlineSize - marginLineLeft - marginLineRight);
}

// §10.6.3
function doBlockBoxModelForBlockBox(box: BlockContainer) {
  const blockSize = box.style.getBlockSize(box);

  if (blockSize === 'auto') {
    if (box.children.length === 0) {
      box.setBlockSize(0); // Case 4
    } else {
      // Cases 1-4 should be handled by doBoxPositioning, where margin
      // calculation happens. These bullet points seem to be re-phrasals of
      // margin collapsing in CSS 2.2 § 8.3.1 at the very end. If I'm wrong,
      // more might need to happen here.
    }
  } else {
    box.setBlockSize(blockSize);
  }
}

export function layoutBlockBox(box: BlockContainer, ctx: LayoutContext) {
  const bfc = ctx.bfc;
  const cctx = {...ctx};

  preBlockContainer(box, cctx);

  doInlineBoxModelForBlockBox(box);
  doBlockBoxModelForBlockBox(box);

  if (box.isBfcRoot()) {
    const inlineSize = box.contentArea.inlineSize;
    cctx.bfc = new BlockFormattingContext(inlineSize);
  }

  bfc.boxStart(box, cctx); // Assign block position if it's an IFC
  // Child flow is now possible

  if (box.isBlockContainerOfInlines()) {
    // text layout happens in bfc.boxStart
  } else if (box.isBlockContainerOfBlockContainers()) {
    for (const child of box.children) {
      layoutBlockBox(child, cctx);
    }
  } else {
    throw new Error(`Unknown box type: ${box.id}`);
  }

  if (box.isBfcRoot()) {
    cctx.bfc.finalize(box);
    if (cctx.bfc.fctx) {
      if (box.loggingEnabled()) {
        console.log('Left floats');
        console.log(cctx.bfc.fctx.leftFloats.repr());
        console.log('Right floats');
        console.log(cctx.bfc.fctx.rightFloats.repr());
        console.log();
      }
    }
  }

  bfc.boxEnd(box);
}

function doInlineBoxModelForFloatBox(box: BlockContainer, inlineSize: number) {
  const marginLineLeft = box.style.getMarginLineLeft(box);
  const marginLineRight = box.style.getMarginLineRight(box);
  box.setInlineOuterSize(
    inlineSize -
    (marginLineLeft === 'auto' ? 0 : marginLineLeft) -
    (marginLineRight === 'auto' ? 0 : marginLineRight)
  );
}

function layoutContribution(box: BlockContainer, ctx: LayoutContext, mode: 'min-content' | 'max-content') {
  const cctx = {...ctx};
  let intrinsicSize = 0;

  cctx.mode = mode;
  preBlockContainer(box, cctx);

  const definiteSize = box.getDefiniteInlineSize();
  if (definiteSize !== undefined) return definiteSize;

  if (box.isBfcRoot()) cctx.bfc = new BlockFormattingContext(mode === 'min-content' ? 0 : Infinity);

  ctx.bfc.boxStart(box, cctx);

  if (box.isBlockContainerOfInlines()) {
    const [ifc] = box.children;
    for (const line of ifc.paragraph.lineboxes) {
      intrinsicSize = Math.max(intrinsicSize, line.width);
    }
  } else if (box.isBlockContainerOfBlockContainers()) {
    for (const child of box.children) {
      intrinsicSize = Math.max(intrinsicSize, layoutContribution(child, cctx, mode));
    }
  } else {
    throw new Error(`Unknown box type: ${box.id}`);
  }

  if (box.isBfcRoot()) {
    cctx.bfc.finalize(box);
    if (cctx.bfc.fctx) {
      if (mode === 'max-content') {
        intrinsicSize += cctx.bfc.fctx.leftFloats.getOverflow();
        intrinsicSize += cctx.bfc.fctx.rightFloats.getOverflow();
      } else {
        intrinsicSize = Math.max(intrinsicSize, cctx.bfc.fctx.leftFloats.getOverflow());
        intrinsicSize = Math.max(intrinsicSize, cctx.bfc.fctx.rightFloats.getOverflow());
      }
    }
  }

  ctx.bfc.boxEnd(box);

  const marginLineLeft = box.style.getMarginLineLeft(box);
  const marginLineRight = box.style.getMarginLineRight(box);
  const borderLineLeftWidth = box.style.getBorderLineLeftWidth(box);
  const paddingLineLeft = box.style.getPaddingLineLeft(box);
  const paddingLineRight = box.style.getPaddingLineRight(box);
  const borderLineRightWidth = box.style.getBorderLineRightWidth(box);

  intrinsicSize += (marginLineLeft === 'auto' ? 0 : marginLineLeft)
    + borderLineLeftWidth
    + paddingLineLeft
    + paddingLineRight
    + borderLineRightWidth
    + (marginLineRight === 'auto' ? 0 : marginLineRight);

  return intrinsicSize;
}

export function layoutFloatBox(box: BlockContainer, ctx: LayoutContext) {
  if (!box.isBfcRoot()) {
    throw new Error(`Box ${box.id} is float but not BFC root, that should be impossible`);
  }

  const cctx = {...ctx};

  preBlockContainer(box, cctx);

  let inlineSize = box.getDefiniteInlineSize();

  if (inlineSize === undefined) {
    const cctx = {...ctx};
    cctx.bfc = new BlockFormattingContext(0); // Not used, but children call it
    if (ctx.mode === 'min-content') {
      inlineSize = layoutContribution(box, cctx, 'min-content');
    } else if (ctx.mode === 'max-content') {
      inlineSize = layoutContribution(box, cctx, 'max-content');
    } else {
      const minContent = layoutContribution(box, cctx, 'min-content');
      const maxContent = layoutContribution(box, cctx, 'max-content');
      const availableSpace = box.containingBlock.inlineSize;
      inlineSize = Math.max(minContent, Math.min(maxContent, availableSpace));
    }
  }

  doInlineBoxModelForFloatBox(box, inlineSize);
  doBlockBoxModelForBlockBox(box);

  const cInlineSize = box.contentArea.inlineSize;
  cctx.bfc = new BlockFormattingContext(cInlineSize);

  if (box.isBlockContainerOfInlines()) {
    box.doTextLayout(cctx);
  } else if (box.isBlockContainerOfBlockContainers()) {
    for (const child of box.children) {
      layoutBlockBox(child, cctx);
    }
  } else {
    throw new Error(`Unknown box type: ${box.id}`);
  }

  cctx.bfc.finalize(box);
}

export class Break extends RenderItem {
  public className = 'break';

  isBreak(): this is Break {
    return true;
  }

  getLogSymbol() {
    return '⏎';
  }

  logName(log: Logger) {
    log.text('BR');
  }

  propagate(parent: Box) {
    parent.bitfield |= Box.BITS.hasBreaks;
  }
}

export class Inline extends Box {
  public children: InlineLevel[];
  public nshaped: number;
  public metrics: InlineMetrics;
  public start: number;
  public end: number;

  constructor(start: number, end: number, style: Style, children: InlineLevel[], attrs: number) {
    super(style, children, attrs);
    this.start = start;
    this.end = end;
    this.children = children;
    this.nshaped = 0;
    this.metrics = EmptyInlineMetrics;
  }

  prelayout() {
    this.metrics = getFontMetrics(this);
  }

  propagate(parent: Box) {
    super.propagate(parent);

    if (parent.isInline()) {
      parent.bitfield |= Box.BITS.hasInlines;
      if (this.style.backgroundColor.a !== 0 || this.style.hasBorder()) {
        parent.bitfield |= Box.BITS.hasPaintedInlines;
      }
      if (this.style.position === 'relative') {
        parent.bitfield |= Box.BITS.hasPositionedInline;
      }
      if (
        !parent.hasSizedInline() &&
        (this.hasLineLeftGap() || this.hasLineRightGap())
      ) {
        parent.bitfield |= Box.BITS.hasSizedInline;
      }
      if (
        !parent.hasColoredInline() && (
          this.style.color.r !== parent.style.color.r ||
          this.style.color.g !== parent.style.color.g ||
          this.style.color.b !== parent.style.color.b ||
          this.style.color.a !== parent.style.color.a
        )
      ) {
        parent.bitfield |= Box.BITS.hasColoredInline;
      }

      // Bits that propagate to Inline propagate again if the parent is Inline
      parent.bitfield |= (this.bitfield & Box.PROPAGATES_TO_INLINE_BITS);
    }
  }

  hasText() {
    return this.bitfield & Box.BITS.hasText;
  }

  hasSoftWrap() {
    return this.bitfield & Box.BITS.hasSoftWrap;
  }

  hasCollapsibleWs() {
    return this.bitfield & Box.BITS.hasCollapsibleWs;
  }

  hasFloats() {
    return this.bitfield & Box.BITS.hasFloats;
  }

  hasInlines() {
    return this.bitfield & Box.BITS.hasInlines;
  }

  hasBreaks() {
    return this.bitfield & Box.BITS.hasBreaks;
  }

  hasComplexText() {
    return this.bitfield & Box.BITS.hasComplexText;
  }

  hasSoftHyphen() {
    return this.bitfield & Box.BITS.hasSoftHyphen;
  }

  hasNewlines() {
    return this.bitfield & Box.BITS.hasNewlines;
  }

  hasPaintedInlines() {
    return this.bitfield & Box.BITS.hasPaintedInlines;
  }

  hasPositionedInline() {
    return this.bitfield & Box.BITS.hasPositionedInline;
  }

  hasInlineBlocks() {
    return this.bitfield & Box.BITS.hasInlineBlocks;
  }

  hasSizedInline() {
    return this.bitfield & Box.BITS.hasSizedInline;
  }

  hasColoredInline() {
    return this.bitfield & Box.BITS.hasColoredInline;
  }

  hasLineLeftGap() {
    return this.style.hasLineLeftGap();
  }

  hasLineRightGap() {
    return this.style.hasLineRightGap();
  }

  getLineLeftMarginBorderPadding(ifc: IfcInline) {
    const marginLineLeft = this.style.getMarginLineLeft(ifc);
    return (marginLineLeft === 'auto' ? 0 : marginLineLeft)
      + this.style.getBorderLineLeftWidth(ifc)
      + this.style.getPaddingLineLeft(ifc);
  }

  getLineRightMarginBorderPadding(ifc: IfcInline) {
    const marginLineRight = this.style.getMarginLineRight(ifc);
    return (marginLineRight === 'auto' ? 0 : marginLineRight)
      + this.style.getBorderLineRightWidth(ifc)
      + this.style.getPaddingLineRight(ifc);
  }

  isInline(): this is Inline {
    return true;
  }

  getLogSymbol() {
    return '▭';
  }

  logName(log: Logger) {
    if (this.isAnonymous()) log.dim();
    if (this.isIfcInline()) log.underline();
    log.text(`Inline ${this.id}`);
    log.reset();
  }

  assignContainingBlocks(ctx: LayoutContext) {
    this.containingBlock = ctx.lastBlockContainerArea;
    for (const child of this.children) {
      if (child.isInline()) child.assignContainingBlocks(ctx);
    }
  }

  absolutify() {
    // noop: inlines are painted in a different way than block containers
  }

  hasForeground() {
    return Boolean(this.hasLineLeftGap() || this.hasLineRightGap());
  }
}

export class IfcInline extends Inline {
  public children: InlineLevel[];
  public text: string;
  public paragraph: Paragraph;

  constructor(style: Style, text: string, children: InlineLevel[], attrs: number) {
    super(0, text.length, style, children, Box.ATTRS.isAnonymous | attrs);

    this.children = children;
    this.text = text;
    this.paragraph = createEmptyParagraph(this);
  }

  isIfcInline(): this is IfcInline {
    return true;
  }

  get writingModeAsParticipant() {
    return this.containingBlock.writingMode;
  }

  loggingEnabled() {
    return Boolean(this.bitfield & Box.BITS.enableLogging);
  }

  prelayout() {
    super.prelayout();

    if (this.shouldLayoutContent()) {
      if (this.hasCollapsibleWs()) collapseWhitespace(this);
      this.paragraph.destroy();
      this.paragraph = createParagraph(this);
      this.paragraph.shape();
    }
  }

  positionItemsPostlayout() {
    const inlineShifts: Map<Inline, {dx: number; dy: number}> = new Map();
    const stack: (InlineLevel | {sentinel: Inline})[] = [this];
    let dx = 0;
    let dy = 0;
    let itemIndex = 0;

    while (stack.length) {
      const box = stack.pop()!;

      if ('sentinel' in box) {
        while (
          itemIndex < this.paragraph.brokenItems.length &&
          this.paragraph.brokenItems[itemIndex].offset < box.sentinel.end
        ) {
          const item = this.paragraph.brokenItems[itemIndex];
          item.x += this.containingBlock.x;
          item.y += this.containingBlock.y;
          if (item.end() > box.sentinel.start) {
            item.x += dx;
            item.y += dy;
          }
          itemIndex++;
        }

        if (box.sentinel.style.position === 'relative') {
          dx -= box.sentinel.getRelativeHorizontalShift();
          dy -= box.sentinel.getRelativeVerticalShift();
        }
      } else if (box.isInline()) {
        stack.push({sentinel: box});
        for (let i = box.children.length - 1; i >= 0; i--) {
          stack.push(box.children[i]);
        }

        if (box.style.position === 'relative') {
          dx += box.getRelativeHorizontalShift();
          dy += box.getRelativeVerticalShift();
        }

        inlineShifts.set(box, {dx, dy});
      } else if (box.isBlockContainer()) {
        // floats or inline-blocks
        box.borderArea.x += dx;
        box.borderArea.y += dy;
      }
    }

    for (const [inline, backgrounds] of this.paragraph.backgroundBoxes) {
      const {dx, dy} = inlineShifts.get(inline)!;

      for (const background of backgrounds) {
        background.blockOffset += this.containingBlock.y + dy;
        background.start += this.containingBlock.x + dx;
        background.end += this.containingBlock.x + dx;
      }
    }
  }

  postlayoutPreorder() {
    this.paragraph.destroy();
    if (this.shouldLayoutContent()) {
      this.positionItemsPostlayout();
    }
    super.postlayoutPreorder();
  }

  shouldLayoutContent() {
    return this.hasText()
      || this.hasSizedInline()
      || this.hasFloats()
      || this.hasInlineBlocks();
  }

  doTextLayout(ctx: LayoutContext) {
    if (this.shouldLayoutContent()) {
      this.paragraph.createLineboxes(ctx);
      this.paragraph.positionItems(ctx);
    }
  }
}

export type InlineLevel = Inline | BlockContainer | Run | Break;

type InlineIteratorBuffered = {state: 'pre' | 'post', item: Inline}
  | {state: 'text', item: Run}
  | {state: 'block', item: BlockContainer}
  | {state: 'break'}
  | {state: 'breakop'};

type InlineIteratorValue = InlineIteratorBuffered | {state: 'breakspot'};

// break: an actual forced break; <br>.
//
// breakspot: the location in between spans at which to break if needed. for
// example, `abc </span><span>def ` would emit breakspot between the closing
// ("post") and opening ("pre") span
//
// breakop: a break opportunity introduced by an inline-block (these are unique
// compared to text break opportunities because they do not exist on character
// positions). one of thse comes before and one after an inline-block
export function createInlineIterator(inline: IfcInline) {
  const stack: (InlineLevel | {post: Inline})[] = inline.children.slice().reverse();
  const buffered: InlineIteratorBuffered[] = [];
  let minlevel = 0;
  let level = 0;
  let bk = 0;
  let shouldFlushBreakop = false;

  function next(): {done: true} | {done: false; value: InlineIteratorValue} {
    if (!buffered.length) {
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
        } else {
          shouldFlushBreakop = minlevel !== level;
          minlevel = level;
          if (item.isRun()) {
            buffered.push({state: 'text', item});
          } else if (item.isBreak()) {
            buffered.push({state: 'break'});
          } else {
            if (item.isFloat()) {
              shouldFlushBreakop = true;
              buffered.push({state: 'block', item});
            } else {
              buffered.push(
                {state: 'breakop'},
                {state: 'block', item},
                {state: 'breakop'}
              );
            }
          }
          break;
        }
      }
    }

    if (buffered.length) {
      if (bk > 0) {
        bk -= 1;
      } else if (shouldFlushBreakop) {
        shouldFlushBreakop = false;
        return {value: {state: 'breakspot'}, done: false};
      }

      return {value: buffered.shift()!, done: false};
    }

    return {done: true};
  }

  return {next};
}

export function createPreorderInlineIterator(inline: IfcInline) {
  const stack: InlineLevel[] = inline.children.slice().reverse();

  function next(): {done: true} | {done: false, value: Inline | Run} {
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

interface ParagraphText {
  value: string;
}

// Helper for generateInlineBox
function mapTree(
  el: HTMLElement,
  text: ParagraphText,
  path: number[],
  level: number
): [boolean, Inline] {
  const start = text.value.length;
  let children = [], bail = false, attrs = 0;

  if (!path[level]) path[level] = 0;

  while (!bail && path[level] < el.children.length) {
    let child: InlineLevel | undefined, childEl = el.children[path[level]];

    if (childEl instanceof HTMLElement) {
      if (childEl.tagName === 'br') {
        child = new Break(childEl.style);
      } else if (childEl.style.float !== 'none') {
        child = generateBlockContainer(childEl);
      } else if (childEl.style.display.outer === 'block') {
        bail = true;
      } else if (childEl.style.display.inner === 'flow-root') {
        child = generateBlockContainer(childEl);
      } else {
        [bail, child] = mapTree(childEl, text, path, level + 1);
      }
    } else if (childEl instanceof TextNode) {
      const start = text.value.length;
      const end = start + childEl.text.length;
      child = new Run(start, end, childEl.style);
      text.value += childEl.text;
    }

    if (child != null) children.push(child);
    if (!bail) path[level]++;
  }

  if (!bail) path.pop();
  if ('x-dropflow-log' in el.attrs) attrs |= Box.ATTRS.enableLogging;
  const end = text.value.length;
  const box = new Inline(start, end, el.style, children, attrs);
  el.boxes.push(box);

  return [bail, box];
}

// Generates at least one inline box for the element. This must be called
// repeatedly until the first tuple value returns false to split out all block-
// level elements and the (fully nested) inlines in between and around them.
function generateInlineBox(
  el: HTMLElement,
  text: ParagraphText,
  path: number[]
): [boolean, Inline | BlockContainer] {
  const target = el.getEl(path);

  if (target instanceof HTMLElement && target.style.display.outer === 'block') {
    ++path[path.length - 1];
    return [true, generateBlockContainer(target)];
  }

  return mapTree(el, text, path, 0);
}

// Wraps consecutive inlines and runs in block-level block containers.
// CSS2.1 section 9.2.1.1
function wrapInBlockContainer(parentEl: HTMLElement, inlines: InlineLevel[], text: ParagraphText) {
  const anonStyle = createStyle(parentEl.style, EMPTY_STYLE);
  let attrs = Box.ATTRS.isAnonymous;
  if ('x-dropflow-log' in parentEl.attrs) attrs |= Box.ATTRS.enableLogging;
  const ifc = new IfcInline(anonStyle, text.value, inlines, attrs);
  return new BlockContainer(anonStyle, [ifc], attrs);
}

// Generates a block container for the element
export function generateBlockContainer(el: HTMLElement): BlockContainer {
  const text: ParagraphText = {value: ''};
  const enableLogging = 'x-dropflow-log' in el.attrs;
  const blocks: BlockContainer[] = [];
  let inlines: InlineLevel[] = [];
  let attrs = 0;
  
  // TODO: it's time to start moving some of this type of logic to HTMLElement.
  // For example add the methods establishesBfc, generatesBlockContainerOfBlocks,
  // generatesBreak, etc
  if (
    el.style.float !== 'none' ||
    el.style.overflow === 'hidden' ||
    el.style.display.inner === 'flow-root' ||
    el.parent && writingModeInlineAxis(el) !== writingModeInlineAxis(el.parent)
  ) {
    attrs |= BlockContainer.ATTRS.isBfcRoot;
  }

  if (enableLogging) attrs |= Box.ATTRS.enableLogging;

  for (const child of el.children) {
    if (child instanceof HTMLElement) {
      if (child.style.display.outer === 'none') continue;

      if (child.tagName === 'br') {
        inlines.push(new Break(child.style));
      } else if (child.style.float !== 'none') {
        inlines.push(generateBlockContainer(child));
      } else if (child.style.display.outer === 'block') {
        if (inlines.length) {
          blocks.push(wrapInBlockContainer(el, inlines, text));
          inlines = [];
          text.value = '';
        }

        blocks.push(generateBlockContainer(child));
      } else { // inline
        if (child.style.display.inner === 'flow-root') { // inline-block
          inlines.push(generateBlockContainer(child));
        } else {
          const path: number[] = [];
          let more, box;

          do {
            ([more, box] = generateInlineBox(child, text, path));

            if (box.isInline()) {
              inlines.push(box);
            } else {
              if (inlines.length) {
                blocks.push(wrapInBlockContainer(el, inlines, text));
                inlines = [];
                text.value = '';
              }

              blocks.push(box);
            }
          } while (more);
        }
      }
    } else { // TextNode
      const computed = createStyle(el.style, EMPTY_STYLE);
      const start = text.value.length;
      const end = start + child.text.length;
      inlines.push(new Run(start, end, computed));
      text.value += child.text;
    }
  }

  if (el.style.display.outer === 'inline') {
    attrs |= BlockContainer.ATTRS.isInline;
  }

  let children: BlockContainer[] | IfcInline[];

  if (inlines.length) {
    if (blocks.length) {
      blocks.push(wrapInBlockContainer(el, inlines, text));
      children = blocks;
    } else {
      const anonComputedStyle = createStyle(el.style, EMPTY_STYLE);
      const ifcAttrs = Box.ATTRS.isAnonymous | (enableLogging ? Box.ATTRS.enableLogging : 0);
      children = [new IfcInline(anonComputedStyle, text.value, inlines, ifcAttrs)];
    }
  } else {
    children = blocks;
  }

  const box = new BlockContainer(el.style, children, attrs);
  el.boxes.push(box);
  return box;
}

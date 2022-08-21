import {binarySearch} from './util';
import {HTMLElement, TextNode} from './node';
import {createComputedStyle, Style} from './cascade';
import {Run, Collapser, ShapedItem, Linebox, getCascade, getFace, shapeIfc, createLineboxes, getAscenderDescender} from './text';
import {Box, Area} from './box';
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

export class BlockFormattingContext {
  public inlineSize: number;
  public fctx: FloatContext;
  public stack: (BlockContainer | {post: BlockContainer})[];
  public cbBlockStart: number;
  public cbLineLeft: number;
  public cbLineRight: number;
  private sizeStack: number[];
  private offsetStack: number[];
  private last:'start' | 'end' | null;
  private level: number;
  private hypotheticals: Map<Box, number>;
  private margin: {
    level: number,
    collection: MarginCollapseCollection,
    clearanceAtLevel?: number
  };

  constructor(inlineSize: number) {
    this.inlineSize = inlineSize;
    this.fctx = new FloatContext(this);
    this.stack = [];
    this.cbBlockStart = 0;
    this.cbLineLeft = 0;
    this.cbLineRight = 0;
    this.sizeStack = [0];
    this.offsetStack = [0];
    this.last = null;
    this.level = 0;
    this.margin = {level: 0, collection: new MarginCollapseCollection()};
    this.hypotheticals = new Map();
  }

  boxStart(box: BlockContainer, ctx: LayoutContext) {
    const {lineLeft, lineRight, blockStart} = box.getContainingBlockToContent();
    const style = box.style.createLogicalView(box.writingMode);
    let floatBottom = 0;
    let clearance = 0;

    assumePx(style.marginBlockStart);

    if (box.style.clear === 'left' || box.style.clear === 'both') {
      floatBottom = Math.max(floatBottom, this.fctx.getLeftBottom());
    }

    if (box.style.clear === 'right' || box.style.clear === 'both') {
      floatBottom = Math.max(floatBottom, this.fctx.getRightBottom());
    }

    if (box.style.clear !== 'none') {
      const hypo = this.margin.collection.clone().add(style.marginBlockStart).get();
      clearance = Math.max(clearance, floatBottom - (this.cbBlockStart + hypo));
    }

    const adjoinsPrevious = clearance === 0;
    const adjoinsNext = style.paddingBlockStart === 0
      && style.borderBlockStartWidth === 0;

    if (!box.isBlockLevel()) throw new Error('Inline encountered');

    if (adjoinsPrevious) {
      this.margin.collection.add(style.marginBlockStart);
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

    this.fctx.boxStart();

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
    const style = box.style.createLogicalView(box.writingMode);
    let adjoins = style.paddingBlockEnd === 0
      && style.borderBlockEndWidth === 0
      && (this.margin.clearanceAtLevel == null || this.level > this.margin.clearanceAtLevel);

    assumePx(style.marginBlockEnd);
    if (!box.isBlockLevel()) throw new Error('Inline encountered');

    if (adjoins) {
      if (this.last === 'start') {
        adjoins = box.canCollapseThrough();
      } else {
        // Handle the end of a block box that was at the end of its parent
        adjoins = style.blockSize === 'auto';
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
      this.hypotheticals.set(box, this.margin.collection.get());
    }

    this.margin.collection.add(style.marginBlockEnd);
    // When a box's end adjoins to the previous margin, move the "root" (the
    // box which the margin will be placed adjacent to) to the highest-up box
    // in the tree, since its siblings need to be shifted.
    if (this.level < this.margin.level) this.margin.level = this.level;

    this.last = 'end';
  }

  finalize(box: BlockContainer) {
    if (!box.isBfcRoot()) throw new Error('This is for bfc roots only');

    const style = box.style.createLogicalView(box.writingMode);
    const content = box.contentArea.createLogicalView(box.writingMode);

    this.positionBlockContainers();

    if (content.blockSize === undefined) {
      const size = Math.max(this.cbBlockStart, this.fctx.getBothBottom());
      box.setBlockSize(size);
    } else if (style.blockSize === 'auto' && box.isBlockContainerOfInlines()) {
      // The box is both BFC root and IFC root. IFCs set the height, so the
      // above condition failed. Need to adjust height for floats.
      const size = Math.max(content.blockSize, this.fctx.getBothBottom());
      box.setBlockSize(size);
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
      const border = box.borderArea.createLogicalView(box.writingMode);
      const style = box.style.createLogicalView(box.writingMode);

      if ('post' in item) {
        const childSize = sizeStack.pop()!;
        const offset = offsetStack.pop()!;
        const level = sizeStack.length - 1;

        if (style.blockSize === 'auto' && box.isBlockContainerOfBlockContainers() && !box.isBfcRoot()) {
          box.setBlockSize(childSize);
        }

        // The block size would only be indeterminate for floats, which are
        // not a part of the descendants() return value, or for orthogonal
        // writing modes, which are also not in descendants() due to their
        // establishing a new BFC. If neither of those are true and the block
        // size is indeterminate that's a bug.
        assumePx(border.blockSize);

        sizeStack[level] += border.blockSize;
        this.cbBlockStart = offset + border.blockSize;

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

  constructor() {
    this.items = [];
    this.shelfBlockOffset = 0;
    this.shelfTrackIndex = 0;
    this.blockOffsets = [0];
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
        max = Math.max(max, inlineOffset + this.inlineSizes[i] - this.inlineOffsets[i]);
      }
    }
    return max;
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
    if (box.borderArea.width === undefined || box.borderArea.height === undefined) {
      throw new Error('Tried to place float that hasn\'t been laid out');
    }

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
    const endTrack = this.getEndTrack(startTrack, this.shelfBlockOffset, blockSize);

    if (this.blockOffsets[endTrack] !== blockEndOffset) {
      this.splitTrack(endTrack - 1, blockEndOffset);
    }

    const cbOffset = box.style.float === 'left' ? vacancy.leftOffset : vacancy.rightOffset;
    const cbLineSide = box.style.float === 'left' ? cbLineLeft : cbLineRight;
    const marginOffset = box.style.float === 'left' ? margins.lineLeft : margins.lineRight;
    const marginEnd = box.style.float === 'left' ? margins.lineRight : margins.lineLeft;
    const borderArea = box.borderArea.createLogicalView(box.writingMode)

    if (box.style.float === 'left') {
      borderArea.lineLeft = cbOffset - cbLineSide + marginOffset;
    } else {
      borderArea.lineRight = cbOffset - cbLineSide + marginOffset;
    }

    for (let track = startTrack; track < endTrack; track += 1) {
      if (this.floatCounts[track] === 0) {
        this.inlineOffsets[track] = -cbOffset;
        this.inlineSizes[track] = marginOffset + box.borderArea.width + marginEnd;
      } else {
        this.inlineSizes[track] = this.inlineOffsets[track] + cbOffset + marginOffset + box.borderArea.width + marginEnd;
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

  makeLocal(bfc: BlockFormattingContext) {
    this.leftOffset -= bfc.cbLineLeft;
    this.rightOffset -= bfc.cbLineRight;
    this.blockOffset -= bfc.cbBlockStart;
    return this;
  }
};

export class FloatContext {
  bfc: BlockFormattingContext;
  leftFloats: FloatSide;
  rightFloats: FloatSide;
  gotFirstBox: boolean;
  misfits: BlockContainer[];

  constructor(bfc: BlockFormattingContext) {
    this.bfc = bfc;
    this.leftFloats = new FloatSide();
    this.rightFloats = new FloatSide();
    this.gotFirstBox = false;
    this.misfits = [];
  }

  boxStart() {
    if (!this.gotFirstBox) {
      this.leftFloats.initialize(this.bfc.cbBlockStart);
      this.rightFloats.initialize(this.bfc.cbBlockStart);
      this.gotFirstBox = true;
    } else {
      this.leftFloats.boxStart(this.bfc.cbBlockStart);
      this.rightFloats.boxStart(this.bfc.cbBlockStart);
    }
  }

  getVacancyForLine(blockOffset: number, blockSize: number) {
    const leftInlineSpace = this.leftFloats.getOccupiedSpace(blockOffset, blockSize, -this.bfc.cbLineLeft);
    const rightInlineSpace = this.rightFloats.getOccupiedSpace(blockOffset, blockSize, -this.bfc.cbLineRight);
    const leftOffset = this.bfc.cbLineLeft + leftInlineSpace;
    const rightOffset = this.bfc.cbLineRight + rightInlineSpace;
    const inlineSize = this.bfc.inlineSize - leftOffset - rightOffset;
    return new IfcVacancy(leftOffset, rightOffset, blockOffset, inlineSize, 0, 0);
  }

  getVacancyForBox(box: BlockContainer) {
    if (box.borderArea.height === undefined || box.borderArea.width === undefined) {
      throw new Error('Attempted to place a float that hasn\'t been laid out');
    }

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
    const inlineSize = this.bfc.inlineSize - leftOffset - rightOffset;
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

    if (box.borderArea.height === undefined || box.borderArea.width === undefined) {
      throw new Error('Attempted to place a float that hasn\'t been laid out');
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

      const vacancy = this.getVacancyForBox(box);
      const margins = box.getMarginsAutoIsZero();
      const inlineMargin = margins.lineLeft + margins.lineRight;

      if (
        box.borderArea.width + inlineMargin < vacancy.inlineSize - lineWidth ||
        lineIsEmpty && vacancy.leftFloatCount === 0 && vacancy.rightFloatCount === 0
      ) {
        box.setBlockPosition(side.shelfBlockOffset + margins.blockStart - this.bfc.cbBlockStart);
        side.placeFloat(box, vacancy, this.bfc.cbLineLeft, this.bfc.cbLineRight);
      } else {
        const count = box.style.float === 'left' ? vacancy.leftFloatCount : vacancy.rightFloatCount;
        const oppositeCount = box.style.float === 'left' ? vacancy.rightFloatCount : vacancy.leftFloatCount;
        if (count > 0) {
          side.dropShelf(side.getNextTrackOffset());
        } else if (oppositeCount > 0) {
          const [, trackIndex] = oppositeSide.getTrackRange(side.shelfBlockOffset);
          if (trackIndex === oppositeSide.blockOffsets.length) throw new Error('assertion failed');
          side.dropShelf(oppositeSide.blockOffsets[trackIndex]);
        } // else both counts are 0 so it will fit next time the line is empty

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

  get sym() {
    return this.isFloat() ? '𝗈' : '◼︎';
  }

  get desc() {
    return (this.isAnonymous() ? dim : '')
      + (this.isBfcRoot() ? underline : '')
      + (this.isBlockLevel() ? 'Block' : 'Inline')
      + ' ' + this.id
      + reset;
  }

  get writingMode() {
    if (!this.containingBlock) {
      throw new Error(`Cannot access writing mode of ${this.id}: containing block never set`);
    }

    return this.containingBlock.writingMode;
  }

  get direction() {
    if (!this.containingBlock) {
      throw new Error(`Cannot access writing mode of ${this.id}: containing block never set`);
    }

    return this.containingBlock.direction;
  }

  setBlockSize(size: number) {
    const content = this.contentArea.createLogicalView(this.writingMode);
    const padding = this.paddingArea.createLogicalView(this.writingMode);
    const border = this.borderArea.createLogicalView(this.writingMode);
    const style = this.style.createLogicalView(this.writingMode);

    content.blockSize = size;

    padding.blockSize = content.blockSize
      + style.paddingBlockStart
      + style.paddingBlockEnd;

    border.blockSize = padding.blockSize
      + style.borderBlockStartWidth
      + style.borderBlockEndWidth;
  }

  getContainingBlockToContent() {
    const style = this.style.createLogicalView(this.writingMode);
    const border = this.borderArea.createLogicalView(this.writingMode);
    const blockStart = style.borderBlockStartWidth + style.paddingBlockStart;

    if (border.lineLeft == null || border.lineRight == null) {
      throw new Error(`Couldn't get borderToContent: box ${this.id} wasn't inline-laid-out`);
    }

    const lineLeft = border.lineLeft + style.borderLineLeftWidth + style.paddingLineLeft;
    const lineRight = border.lineRight + style.borderLineRightWidth + style.paddingLineRight;

    return {blockStart, lineLeft, lineRight};
  }

  getMarginsAutoIsZero() {
    const style = this.style.createLogicalView(this.writingMode);
    let {marginBlockStart, marginBlockEnd, marginLineLeft, marginLineRight} = style;

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

  setBlockPosition(position: number) {
    const content = this.contentArea.createLogicalView(this.writingMode);
    const padding = this.paddingArea.createLogicalView(this.writingMode);
    const border = this.borderArea.createLogicalView(this.writingMode);
    const style = this.style.createLogicalView(this.writingMode);

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

  isFloat() {
    return Boolean(this.attrs & Box.ATTRS.isFloat);
  }

  isBlockContainerOfInlines(): this is BlockContainerOfInlines {
    return Boolean(this.children.length && this.children[0].isIfcInline());
  }

  canCollapseThrough() {
    const style = this.style.createLogicalView(this.writingMode);

    if (style.blockSize !== 'auto' && style.blockSize !== 0) return false;

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

  async preprocess(ctx: PreprocessContext) {
    const promises:Promise<any>[] = [];
    for (const child of this.children) {
      promises.push(child.preprocess(ctx));
    }
    await Promise.all(promises);
  }

  doTextLayout(ctx: LayoutContext) {
    if (!this.isBlockContainerOfInlines()) throw new Error('Children are block containers');
    const [ifc] = this.children;
    const style = this.style.createLogicalView(this.writingMode);
    ifc.doTextLayout(ctx);
    if (style.blockSize === 'auto') this.setBlockSize(ifc.height);
  }
}

function preBlockContainer(box: BlockContainer, ctx: LayoutContext) {
  // Containing blocks first, for absolute positioning later
  box.assignContainingBlocks(ctx);

  if (!box.containingBlock) {
    throw new Error(`BlockContainer ${box.id} has no containing block!`);
  }

  // Resolve percentages into actual values
  box.style.resolvePercentages(box.containingBlock);

  // And resolve box-sizing (which has a dependency on the above)
  box.style.resolveBoxModel();

  if (box.isBlockContainerOfInlines()) {
    const [inline] = box.children;
    inline.assignContainingBlocks(ctx);
  }
}

// §10.3.3
function doInlineBoxModelForBlockBox(box: BlockContainer) {
  if (!box.containingBlock) {
    throw new Error(`Inline layout called too early on ${box.id}: no containing block`);
  }

  if (!box.isBlockLevel()) {
    throw new Error('doInlineBoxModelForBlockBox called with inline or float');
  }

  const container = box.containingBlock.createLogicalView(box.writingMode);
  const style = box.style.createLogicalView(box.writingMode);
  let marginInlineStart = style.marginLineLeft;
  let marginInlineEnd = style.marginLineRight;

  if (container.inlineSize === undefined) {
    throw new Error('Auto-inline size for orthogonal writing modes not yet supported');
  }

  // Paragraphs 2 and 3
  if (style.inlineSize !== 'auto') {
    const specifiedInlineSize = style.inlineSize
      + style.borderLineLeftWidth
      + style.paddingLineLeft
      + style.paddingLineRight
      + style.borderLineRightWidth
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
      if (box.direction === 'ltr') {
        marginInlineEnd = container.inlineSize - (specifiedInlineSize - marginInlineEnd);
      } else {
        marginInlineStart = container.inlineSize - (specifiedInlineSize - marginInlineEnd);
      }
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

  const content = box.contentArea.createLogicalView(box.writingMode);
  // Paragraph 5: auto width
  if (style.inlineSize === 'auto') {
    if (marginInlineStart === 'auto') marginInlineStart = 0;
    if (marginInlineEnd === 'auto') marginInlineEnd = 0;
  }

  const padding = box.paddingArea.createLogicalView(box.writingMode);
  const border = box.borderArea.createLogicalView(box.writingMode);

  assumePx(marginInlineStart);
  assumePx(marginInlineEnd);

  border.lineLeft = marginInlineStart;
  border.lineRight = marginInlineEnd;

  padding.lineLeft = style.borderLineLeftWidth;
  padding.lineRight = style.borderLineRightWidth;

  content.lineLeft = style.paddingLineLeft;
  content.lineRight = style.paddingLineRight;
}

// §10.6.3
function doBlockBoxModelForBlockBox(box: BlockContainer) {
  const style = box.style.createLogicalView(box.writingMode);

  if (!box.isBlockLevel()) {
    throw new Error('doBlockBoxModelForBlockBox called with inline');
  }

  if (style.blockSize === 'auto') {
    if (box.children.length === 0) {
      box.setBlockSize(0); // Case 4
    } else {
      // Cases 1-4 should be handled by doBoxPositioning, where margin
      // calculation happens. These bullet points seem to be re-phrasals of
      // margin collapsing in CSS 2.2 § 8.3.1 at the very end. If I'm wrong,
      // more might need to happen here.
    }
  } else {
    box.setBlockSize(style.blockSize);
  }
}

export function layoutBlockBox(box: BlockContainer, ctx: LayoutContext) {
  if (!box.isBlockLevel()) {
    throw new Error(`BlockContainer ${box.id} is not block-level`);
  }

  const bfc = ctx.bfc;
  const cctx = {...ctx};

  preBlockContainer(box, cctx);

  doInlineBoxModelForBlockBox(box);
  doBlockBoxModelForBlockBox(box);

  if (box.isBfcRoot()) {
    const inlineSize = box.contentArea.width;
    if (inlineSize === undefined) throw new Error('Cannot create BFC: layout parent');
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
    if (ctx.logging.text.has(box.id)) {
      console.log('Left floats');
      console.log(cctx.bfc.fctx.leftFloats.repr());
      console.log('Right floats');
      console.log(cctx.bfc.fctx.rightFloats.repr());
      console.log();
    }
  }

  bfc.boxEnd(box);
}

function doInlineBoxModelForFloatBox(box: BlockContainer) {
  const style = box.style.createLogicalView(box.writingMode);
  const border = box.borderArea.createLogicalView(box.writingMode);
  const padding = box.paddingArea.createLogicalView(box.writingMode);
  const content = box.contentArea.createLogicalView(box.writingMode);

  if (style.inlineSize === 'auto') {
    throw new Error('Shrink to fit not implemented yet');
  }

  border.inlineSize =
    style.borderLineLeftWidth + style.borderLineRightWidth +
    style.paddingLineLeft + style.paddingLineRight +
    style.inlineSize;

  padding.lineLeft = style.borderLineLeftWidth;
  padding.lineRight = style.borderLineRightWidth;

  content.lineLeft = style.paddingLineLeft;
  content.lineRight = style.paddingLineRight;
}

export function layoutFloatBox(box: BlockContainer, ctx: LayoutContext) {
  if (!box.isFloat()) {
    throw new Error(`Tried to layout non-float box ${box.id} with layoutFloatBox`);
  }

  if (!box.isBfcRoot()) {
    throw new Error(`Box ${box.id} is float but not BFC root, that should be impossible`);
  }

  const cctx = {...ctx};

  preBlockContainer(box, cctx);

  doInlineBoxModelForFloatBox(box);
  doBlockBoxModelForBlockBox(box);
  // Child flow is now possible

  const inlineSize = box.contentArea.width;

  if (inlineSize === undefined) throw new Error('Cannot create BFC: layout parent');

  cctx.bfc = new BlockFormattingContext(inlineSize)

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

// TODO breaks aren't really boxes. If a <br> was positioned or floated, it'd
// generate BlockContainer. I wonder if I should create a RenderItem class
// (Box extends RenderItem)
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

  absolutify() {
    // noop: inlines are painted in a different way than block containers
  }
}

export class IfcInline extends Inline {
  public allText: string = '';
  public runs: Run[] = [];
  public brokenItems: ShapedItem[] = [];
  public strut: ShapedItem | undefined;
  public lineboxes: Linebox[] = [];
  public height: number = 0;
  public children: InlineLevel[];
  public floats: BlockContainer[];
  private _hasText = false;

  constructor(style: Style, children: InlineLevel[]) {
    super(style, children, Box.ATTRS.isAnonymous);
    this.children = children;
    this.floats = [];
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
    const left = this.brokenItems[itemIndex];
    const right = left.split(offset - left.offset);
    this.brokenItems.splice(itemIndex + 1, 0, right);
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
        if (!box.wsCollapsible || !box.allCollapsible()) {
          this._hasText = true;
        }
      } else if (box.isInline()) {
        stack.unshift(...box.children);
      } else if (box.isBreak()) {
        // ok
      } else if (box.isFloat()) {
        this.floats.push(box);
      } else {
        // TODO: this is e.g. a block container. store it somewhere for future
        // layout here
        // TODO: and remember to reflect the results in canCollapseThrough
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
    const extents:[{ascender: number, descender: number}, number][] =
      [[getAscenderDescender(this.style, strutFont, strutFace.upem), 0]];

    this.strut = new ShapedItem(strutFace, strutFontMatch, [], 0, ' ', [], extents, {
     style: this.style,
      isEmoji: false,
      level: 0,
      script: 'Latn'
    });

    if (this.hasText() || this.hasFloats()) {
      this.brokenItems = await shapeIfc(this, ctx);
    }

    for (const float of this.floats) float.preprocess(ctx);

    strutFont.destroy();
  }

  assignContainingBlocks(ctx: LayoutContext) {
    this.containingBlock = ctx.lastBlockContainerArea;
  }

  doTextLayout(ctx: LayoutContext) {
    if (this.hasText() || this.hasFloats()) {
      createLineboxes(this, ctx);
    }
  }

  hasText() {
    return this._hasText;
  }

  hasFloats() {
    return this.floats.length > 0;
  }

  absolutify() {
    for (const box of this.floats) box.absolutify();
  }
}

export type InlineLevel = Inline | BlockContainer | Run | Break;

type InlineNotRun = Inline | BlockContainer;

type InlineIteratorBuffered = {state: 'pre' | 'post', item: Inline}
  | {state: 'text', item: Run}
  | {state: 'float', item: BlockContainer}
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
        } else if (item.isFloat()) {
          buffered.push({state: 'float', item});
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
        } else if (childEl.style.float !== 'none') {
          child = generateBlockContainer(childEl);
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
    el.boxes.push(box);
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
  return box.isInline() || box.isRun() || box.isBreak()
    || box.isBlockContainer() && (box.isInlineLevel() || box.isFloat());
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
      const ifc = new IfcInline(anonStyle, inlines);
      blocks.push(new BlockContainer(anonStyle, [ifc], Box.ATTRS.isAnonymous));
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
  
  // TODO: it's time to start moving some of this type of logic to HTMLElement.
  // For example add the methods establishesBfc, generatesBlockContainerOfBlocks,
  // generatesBreak, etc
  if (
    el.style.float !== 'none' ||
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
      } else if (child.style.float !== 'none') {
        boxes.push(generateBlockContainer(child, el));
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
  if (el.style.float !== 'none') attrs |= Box.ATTRS.isFloat;

  const style = new Style(el.id, el.style);

  if (hasInline && !hasBlock) {
    const anonStyleId = el.id + '.1';
    const anonComputedStyle = createComputedStyle(el.style, {});
    const anonStyle = new Style(anonStyleId, anonComputedStyle);
    const inline = new IfcInline(anonStyle, boxes as InlineLevel[]);
    const box = new BlockContainer(style, [inline], attrs);
    el.boxes.push(box);
    return box;
  }

  if (hasInline && hasBlock) boxes = wrapInBlockContainers(boxes, el);

  const box = new BlockContainer(style, boxes as BlockContainer[], attrs);
  el.boxes.push(box);
  return box;
}

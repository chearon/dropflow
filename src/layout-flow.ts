import {binarySearch, Logger} from './util.ts';
import {HTMLElement, TextNode} from './dom.ts';
import {createStyle, Style, EMPTY_STYLE} from './style.ts';
import {
  EmptyInlineMetrics,
  Linebox,
  Run,
  getFontMetrics,
  createIfcBuffer,
  getIfcContribution,
  createIfcShapedItems,
  createIfcLineboxes,
  positionIfcItems,
  sliceIfcRenderText
} from './layout-text.ts';
import {getImage} from './layout-image.ts';
import {Box, FormattingBox, RenderItem} from './layout-box.ts';

import type {InlineMetrics, ShapedItem, InlineFragment} from './layout-text.ts';
import type {PrelayoutContext} from './layout-box.ts';
import type {AllocatedUint16Array} from './text-harfbuzz.ts';

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
  /**
   * The block formatting context that formats the subject in a layout function.
   * This is only undefined for the root box or when an element is out of flow.
   */
  bfc?: BlockFormattingContext
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

  collapseStart(tree: InlineLevel[], box: BlockLevel) {
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

    if (adjoinsPrevious) {
      this.margin.collection.add(marginBlockStart);
    } else {
      this.positionBlockContainers();
      const c = floatBottom - this.cbBlockStart;
      this.margin = {level: this.level, collection: new MarginCollapseCollection(c)};
      if (box.canCollapseThrough(tree)) this.margin.clearanceAtLevel = this.level;
    }
  }

  boxStart(tree: InlineLevel[], box: BlockContainer, ctx: LayoutContext) {
    const {lineLeft, lineRight, blockStart} = box.getContainingBlockToContent();
    const paddingBlockStart = box.style.getPaddingBlockStart(box);
    const borderBlockStartWidth = box.style.getBorderBlockStartWidth(box);
    const adjoinsNext = paddingBlockStart === 0 && borderBlockStartWidth === 0;

    this.collapseStart(tree, box);

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
      box.doTextLayout(tree, ctx);
      this.cbBlockStart -= blockStart + this.margin.collection.get();
    }

    if (!adjoinsNext) {
      this.positionBlockContainers();
      this.margin = {level: this.level, collection: new MarginCollapseCollection()};
    }
  }

  boxEnd(tree: InlineLevel[], box: BlockContainer) {
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
        adjoins = box.canCollapseThrough(tree);
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

  boxAtomic(tree: InlineLevel[], box: BlockLevel) {
    const marginBlockEnd = box.style.getMarginBlockEnd(box);
    assumePx(marginBlockEnd);
    this.collapseStart(tree, box);
    this.fctx?.boxStart();
    this.positionBlockContainers();
    box.setBlockPosition(this.cbBlockStart);
    this.margin.collection = new MarginCollapseCollection();
    this.margin.collection.add(marginBlockEnd);
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
        lineboxHeight = box.getContentArea().blockSize;
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

        if (sBlockSize === 'auto' && box.isBlockContainerOfBlocks() && !box.isBfcRoot()) {
          box.setBlockSize(childSize);
        }

        const blockSize = box.getBorderArea().blockSize;

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
  items: BlockLevel[];
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

  placeFloat(box: BlockLevel, vacancy: IfcVacancy, cbLineLeft: number, cbLineRight: number) {
    if (box.style.float === 'none') {
      throw new Error('Tried to place float:none');
    }

    if (vacancy.blockOffset !== this.shelfBlockOffset) {
      throw new Error('Assertion failed');
    }

    this.splitIfShelfDropped();

    const borderArea = box.getBorderArea();
    const startTrack = this.shelfTrackIndex;
    const margins = box.getMarginsAutoIsZero();
    const blockSize = borderArea.height + margins.blockStart + margins.blockEnd;
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

    const vcOffset = box.style.float === 'left' ? vacancy.leftOffset : vacancy.rightOffset;
    const cbOffset = box.style.float === 'left' ? cbLineLeft : cbLineRight;
    const marginOffset = box.style.float === 'left' ? margins.lineLeft : margins.lineRight;
    const marginEnd = box.style.float === 'left' ? margins.lineRight : margins.lineLeft;

    if (box.style.float === 'left') {
      box.setInlinePosition(vcOffset - cbOffset + marginOffset);
    } else {
      const inlineSize = box.getContainingBlock().inlineSize;
      const size = borderArea.inlineSize;
      box.setInlinePosition(inlineSize - size - vcOffset + cbOffset - marginOffset);
    }

    for (let track = startTrack; track < endTrack; track += 1) {
      if (this.floatCounts[track] === 0) {
        this.inlineOffsets[track] = vcOffset;
        this.inlineSizes[track] = marginOffset + borderArea.width + marginEnd;
      } else {
        this.inlineSizes[track] = vcOffset - this.inlineOffsets[track] + marginOffset + borderArea.width + marginEnd;
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
  misfits: BlockLevel[];

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

  getVacancyForBox(box: BlockLevel, lineWidth: number) {
    const float = box.style.float;
    const floats = float === 'left' ? this.leftFloats : this.rightFloats;
    const oppositeFloats = float === 'left' ? this.rightFloats : this.leftFloats;
    const inlineOffset = float === 'left' ? -this.bfc.cbLineLeft : -this.bfc.cbLineRight;
    const oppositeInlineOffset = float === 'left' ? -this.bfc.cbLineRight : -this.bfc.cbLineLeft;
    const blockOffset = floats.shelfBlockOffset;
    const blockSize = box.getBorderArea().height;
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

  placeFloat(lineWidth: number, lineIsEmpty: boolean, box: BlockLevel) {
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
      const inlineSize = box.getBorderArea().width + margins.lineLeft + margins.lineRight;

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

export type BlockContainer = BlockContainerOfInlines | BlockContainerOfBlocks;

export abstract class BlockContainerBase extends FormattingBox {
  static ATTRS = {
    ...FormattingBox.ATTRS,
    isInline: Box.BITS.isInline,
    isBfcRoot: Box.BITS.isBfcRoot
  };

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
    if (this.isBfcRoot() || this.isBlockContainerOfInlines()) log.underline();
    log.text(`Block ${this.id}`);
    log.reset();
  }

  getContainingBlockToContent() {
    const inlineSize = this.getContainingBlock().inlineSizeForPotentiallyOrthogonal(this);
    const borderBlockStartWidth = this.style.getBorderBlockStartWidth(this);
    const paddingBlockStart = this.style.getPaddingBlockStart(this);
    const borderArea = this.getBorderArea();
    const contentArea = this.getContentArea();
    const bLineLeft = borderArea.lineLeft;
    const blockStart = borderBlockStartWidth + paddingBlockStart;
    const cInlineSize = contentArea.inlineSize;
    const borderLineLeftWidth = this.style.getBorderLineLeftWidth(this);
    const paddingLineLeft = this.style.getPaddingLineLeft(this);
    const lineLeft = bLineLeft + borderLineLeftWidth + paddingLineLeft;
    const lineRight = inlineSize - lineLeft - cInlineSize;

    return {blockStart, lineLeft, lineRight};
  }

  isBlockContainer(): this is BlockContainerBase {
    return true;
  }

  isInlineLevel() {
    return Boolean(this.bitfield & Box.BITS.isInline);
  }

  isBfcRoot() {
    return Boolean(this.bitfield & Box.BITS.isBfcRoot);
  }

  loggingEnabled() {
    return Boolean(this.bitfield & Box.BITS.enableLogging);
  }

  canCollapseThrough(tree: InlineLevel[]): boolean {
    const blockSize = this.style.getBlockSize(this);

    if (blockSize !== 'auto' && blockSize !== 0) return false;

    if (this.isBlockContainerOfInlines()) {
      const child = tree[this.treeStart + 1];
      if (!child.isInline()) throw new Error('Assertion failed');
      return !child.hasText();
    } else if (this.isBlockContainerOfBlocks()) {
      return this.treeFinal > this.treeStart;
    } else {
      // TODO: this is a terrible situation, but where else does the method go?
      throw new Error('Unreachable');
    }
  }

  propagate(parent: Box) {
    super.propagate(parent);

    if (this.isInlineLevel()) {
      // TODO: and not absolutely positioned
      parent.bitfield |= Box.BITS.hasInlineBlocks;
    }
  }

  hasBackground() {
    return this.style.hasPaint();
  }

  hasForeground() {
    return false;
  }
}

export class BlockContainerOfInlines extends BlockContainerBase {
  text: string;
  buffer: AllocatedUint16Array;
  items: ShapedItem[];
  lineboxes: Linebox[];
  fragments: Map<Inline, InlineFragment[]>;

  constructor(style: Style, attrs: number) {
    super(style, attrs);
    this.text = '';
    this.buffer = EmptyBuffer;
    this.items = [];
    this.lineboxes = [];
    this.fragments = new Map();
  }

  prelayoutPostorder(tree: InlineLevel[], ctx: PrelayoutContext) {
    if (this.shouldLayoutContent(tree)) {
      const inline = tree[this.treeStart + 1];
      if (!inline.isInline()) throw new Error('Assertion failed');
      this.buffer.destroy();
      this.buffer = createIfcBuffer(this.text);
      this.items = createIfcShapedItems(tree, this, inline);
      this.fragments.clear();
    }
  }

  positionItemsPostlayout(tree: InlineLevel[]) {
    const inlineShifts: Map<Inline, {dx: number; dy: number}> = new Map();
    const parents: Inline[] = [];
    const contentArea = this.getContentArea();
    let dx = 0;
    let dy = 0;
    let itemIndex = 0;

    for (let i = this.treeStart; i <= this.treeFinal; i++) {
      const box = tree[i];

      if (box.isInline()) {
        if (box.style.position === 'relative') {
          dx += box.getRelativeHorizontalShift();
          dy += box.getRelativeVerticalShift();
        }

        inlineShifts.set(box, {dx, dy});
        parents.push(box);
      } else if (box.isFormattingBox()) {
        const borderArea = box.getBorderArea();
        // floats or inline-blocks
        borderArea.x += dx;
        borderArea.y += dy;
      }

      while (parents.length && i === parents.at(-1)!.treeFinal) {
        const parent = parents.pop()!;
        while (
          itemIndex < this.items.length &&
          this.items[itemIndex].offset < parent.end
        ) {
          const item = this.items[itemIndex];
          item.x += contentArea.x;
          item.y += contentArea.y;
          if (item.end() > parent.start) {
            item.x += dx;
            item.y += dy;
          }
          itemIndex++;
        }

        if (parent.style.position === 'relative') {
          dx -= parent.getRelativeHorizontalShift();
          dy -= parent.getRelativeVerticalShift();
        }
      }
    }

    for (const [inline, fragments] of this.fragments) {
      const {dx, dy} = inlineShifts.get(inline)!;

      for (const fragment of fragments) {
        fragment.blockOffset += contentArea.y + dy;
        fragment.start += contentArea.x + dx;
        fragment.end += contentArea.x + dx;
      }
    }
  }

  postlayoutPreorder(tree: InlineLevel[]) {
    super.postlayoutPreorder(tree);
    this.buffer.destroy();
    this.buffer = EmptyBuffer;
    if (this.shouldLayoutContent(tree)) {
      this.positionItemsPostlayout(tree);
    }
  }

  isBlockContainerOfInlines(): this is BlockContainerOfInlines {
    return true;
  }

  getRunIndex(tree: InlineLevel[], ci: number) {
    let l = this.treeStart, r = this.treeFinal;

    while (true) {
      const i = Math.floor((l + r) / 2);

      if (tree[i].isRun()) {
        if (ci < tree[i].start) {
          r = i - 1;
        } else if (ci >= tree[i].end) {
          l = i + 1;
        } else {
          return i;
        }
      } else if (tree[i].isInline()) {
        if (ci < tree[i].start) {
          r = i - 1;
        } else {
          l = i + 1;
        }
      } else { // inline-block, float, or image. pick a side.
        let ml = i;
        let mr = i;

        while (mr < r && !tree[mr].isRun() && !tree[mr].isInline()) mr++;
        while (ml > l && !tree[ml].isRun() && !tree[ml].isInline()) ml--;

        const item = tree[mr];
        if ((item.isRun() || item.isInline()) && ci < item.start) {
          r = ml;
        } else {
          l = mr;
        }
      }
    }
  }

  loggingEnabled() {
    return Boolean(this.bitfield & Box.BITS.enableLogging);
  }

  sliceRenderText(tree: InlineLevel[], item: ShapedItem, start: number, end: number) {
    return sliceIfcRenderText(tree, this, item, start, end);
  }

  getLineboxHeight() {
    if (this.lineboxes.length) {
      const line = this.lineboxes.at(-1)!;
      return line.blockOffset + line.height();
    } else {
      return 0;
    }
  }

  shouldLayoutContent(tree: InlineLevel[]) {
    const inline = tree[this.treeStart + 1];
    if (!inline.isInline()) throw new Error('Assertion failed');
    return inline.hasText()
      || inline.hasSizedInline()
      || inline.hasFloatOrReplaced()
      || inline.hasInlineBlocks();
  }

  doTextLayout(tree: InlineLevel[], ctx: LayoutContext) {
    const blockSize = this.style.getBlockSize(this);
    if (this.shouldLayoutContent(tree)) {
      this.lineboxes = createIfcLineboxes(tree, this, ctx);
      positionIfcItems(tree, this);
    }
    if (blockSize === 'auto') this.setBlockSize(this.getLineboxHeight());
  }
}

export type BlockLevel = BlockContainer | ReplacedBox;

export class BlockContainerOfBlocks extends BlockContainerBase {
  __isBlockContainerOfBlocks() {
    // needed for TS because otherwise it's equivalent to the base 🤦‍♂️
  }

  isBlockContainerOfBlocks(): this is BlockContainerOfBlocks {
    return true;
  }
}

// §10.3.3
function doInlineBoxModelForBlockBox(box: BlockLevel) {
  const cInlineSize = box.getContainingBlock().inlineSizeForPotentiallyOrthogonal(box);
  const inlineSize = box.getDefiniteInnerInlineSize();
  let marginLineLeft = box.style.getMarginLineLeft(box);
  let marginLineRight = box.style.getMarginLineRight(box);

  // Paragraphs 2 and 3
  if (inlineSize !== undefined) {
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
      if (box.getDirectionAsParticipant() === 'ltr') {
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
  if (inlineSize === undefined) {
    if (marginLineLeft === 'auto') marginLineLeft = 0;
    if (marginLineRight === 'auto') marginLineRight = 0;
  }

  assumePx(marginLineLeft);
  assumePx(marginLineRight);

  box.setInlinePosition(marginLineLeft);
  box.setInlineOuterSize(cInlineSize - marginLineLeft - marginLineRight);
}

// §10.6.3
function doBlockBoxModelForBlockBox(tree: InlineLevel[], box: BlockContainer) {
  const blockSize = box.style.getBlockSize(box);

  if (blockSize === 'auto') {
    if (box.canCollapseThrough(tree)) {
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

function layoutBlockBoxInner(
  tree: InlineLevel[],
  box: BlockContainer,
  ctx: LayoutContext
) {
  const containingBfc = ctx.bfc;
  const cctx = {...ctx};
  let establishedBfc;

  if (box.isBfcRoot()) {
    const inlineSize = box.getContentArea().inlineSize;
    cctx.bfc = new BlockFormattingContext(inlineSize);
    establishedBfc = cctx.bfc;
  }

  containingBfc?.boxStart(tree, box, cctx); // Assign block position if it's an IFC
  // Child flow is now possible

  if (box.isBlockContainerOfInlines()) {
    if (containingBfc) {
      // text layout happens in bfc.boxStart
    } else {
      box.doTextLayout(tree, cctx);
    }
  } else if (box.isBlockContainerOfBlocks()) {
    for (let i = box.treeStart + 1; i <= box.treeFinal; i++) {
      const child = tree[i];
      if (!child.isBlockContainer()) throw new Error('Assertion failed');
      layoutBlockLevelBox(tree, child, cctx);
      i = child.treeFinal;
    }
  }

  if (establishedBfc) {
    establishedBfc.finalize(box);
    if (establishedBfc.fctx) {
      if (box.loggingEnabled()) {
        console.log('Left floats');
        console.log(establishedBfc.fctx.leftFloats.repr());
        console.log('Right floats');
        console.log(establishedBfc.fctx.rightFloats.repr());
        console.log();
      }
    }
  }

  containingBfc?.boxEnd(tree, box);
}

function layoutBlockBox(
  tree: InlineLevel[],
  box: BlockContainer,
  ctx: LayoutContext
) {
  box.fillAreas();
  doInlineBoxModelForBlockBox(box);
  doBlockBoxModelForBlockBox(tree, box);
  layoutBlockBoxInner(tree, box, ctx);
}

function layoutReplacedBox(
  tree: InlineLevel[],
  box: ReplacedBox,
  ctx: LayoutContext
) {
  box.fillAreas();
  doInlineBoxModelForBlockBox(box);
  box.setBlockSize(box.getDefiniteInnerBlockSize());
  ctx.bfc!.boxAtomic(tree, box);
}

export function layoutBlockLevelBox(
  tree: InlineLevel[],
  box: BlockContainer,
  ctx: LayoutContext
) {
  if (box.isBlockContainer()) {
    layoutBlockBox(tree, box, ctx);
  } else {
    layoutReplacedBox(tree, box, ctx);
  }
}

function doInlineBoxModelForFloatBox(box: BlockLevel, inlineSize: number) {
  box.setInlineOuterSize(inlineSize);
}

function doBlockBoxModelForFloatBox(box: BlockLevel) {
  const size = box.getDefiniteInnerBlockSize();
  if (size !== undefined) box.setBlockSize(size);
}

export function layoutContribution(
  tree: InlineLevel[],
  box: BlockLevel,
  mode: 'min-content' | 'max-content'
) {
  const marginLineLeft = box.style.getMarginLineLeft(box);
  const marginLineRight = box.style.getMarginLineLeft(box);
  const borderLineLeftWidth = box.style.getBorderLineLeftWidth(box);
  const paddingLineLeft = box.style.getPaddingLineLeft(box);
  const paddingLineRight = box.style.getPaddingLineRight(box);
  const borderLineRightWidth = box.style.getBorderLineRightWidth(box);
  let isize = box.style.getInlineSize(box);
  let contribution = (marginLineLeft === 'auto' ? 0 : marginLineLeft)
    + borderLineLeftWidth
    + paddingLineLeft
    + paddingLineRight
    + borderLineRightWidth
    + (marginLineRight === 'auto' ? 0 : marginLineRight);

  if (isize === 'auto') {
    if (box.isReplacedBox()) {
      isize = box.getIntrinsicIsize();
    } else {
      isize = 0;
      if (box.isBlockContainerOfBlocks()) {
        for (let i = box.treeStart; i <= box.treeFinal; i++) {
          const child = tree[i];
          if (!child.isFormattingBox()) throw new Error('Assertion failed');
          isize = Math.max(isize, layoutContribution(tree, child, mode));
        }
      } else {
        if (box.shouldLayoutContent(tree)) {
          isize = getIfcContribution(tree, box, mode);
        }
      }
    }
  }

  contribution += isize;

  return contribution;
}

export function layoutFloatBox(
  tree: InlineLevel[],
  box: BlockLevel,
  ctx: LayoutContext
) {
  const cctx: LayoutContext = {...ctx, bfc: undefined};
  box.fillAreas();

  let inlineSize = box.getDefiniteOuterInlineSize();

  if (inlineSize === undefined) {
    const minContent = layoutContribution(tree, box, 'min-content');
    const maxContent = layoutContribution(tree, box, 'max-content');
    const availableSpace = box.getContainingBlock().inlineSize;
    const marginLineLeft = box.style.getMarginLineLeft(box);
    const marginLineRight = box.style.getMarginLineRight(box);
    inlineSize = Math.max(minContent, Math.min(maxContent, availableSpace));
    if (marginLineLeft !== 'auto') inlineSize -= marginLineLeft;
    if (marginLineRight !== 'auto') inlineSize -= marginLineRight;
  }

  doInlineBoxModelForFloatBox(box, inlineSize);
  doBlockBoxModelForFloatBox(box);
  if (box.isBlockContainer()) {
    layoutBlockBoxInner(tree, box, cctx);
  } else {
    // replaced boxes have no layout. they were sized by doInline/Block above
  }
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
    parent.bitfield |= Box.BITS.hasBreakInlineOrReplaced;
  }
}

export class Inline extends Box {
  public treeStart: number;
  public treeFinal: number;
  public nshaped: number;
  public metrics: InlineMetrics;
  public start: number;
  public end: number;

  constructor(style: Style, attrs: number) {
    super(style, attrs);
    this.start = 0;
    this.end = 0;
    this.treeStart = 0;
    this.treeFinal = 0;
    this.nshaped = 0;
    this.metrics = EmptyInlineMetrics;
  }

  prelayoutPreorder(ctx: PrelayoutContext) {
    super.prelayoutPreorder(ctx);
    this.nshaped = 0;
    this.metrics = getFontMetrics(this);
  }

  propagate(parent: Box) {
    super.propagate(parent);

    if (parent.isInline()) {
      parent.bitfield |= Box.BITS.hasBreakInlineOrReplaced;
      if (this.style.backgroundColor.a !== 0 || this.style.hasBorderArea()) {
        parent.bitfield |= Box.BITS.hasPaintedInlines;
      }
      if (
        !parent.hasSizedInline() &&
        (this.hasLineLeftGap() || this.hasLineRightGap())
      ) {
        parent.bitfield |= Box.BITS.hasSizedInline;
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

  hasFloatOrReplaced() {
    return this.bitfield & Box.BITS.hasFloatOrReplaced;
  }

  hasBreakOrInlineOrReplaced() {
    return this.bitfield & Box.BITS.hasBreakInlineOrReplaced;
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

  hasInlineBlocks() {
    return this.bitfield & Box.BITS.hasInlineBlocks;
  }

  hasSizedInline() {
    return this.bitfield & Box.BITS.hasSizedInline;
  }

  hasLineLeftGap() {
    return this.style.hasLineLeftGap(this);
  }

  hasLineRightGap() {
    return this.style.hasLineRightGap(this);
  }

  getInlineSideSize(side: 'pre' | 'post') {
    const direction = this.getDirectionAsParticipant();
    if (
      direction === 'ltr' && side === 'pre' ||
      direction === 'rtl' && side === 'post'
    ) {
      const marginLineLeft = this.style.getMarginLineLeft(this);
      return (marginLineLeft === 'auto' ? 0 : marginLineLeft)
        + this.style.getBorderLineLeftWidth(this)
        + this.style.getPaddingLineLeft(this);
    } else {
      const marginLineRight = this.style.getMarginLineRight(this);
      return (marginLineRight === 'auto' ? 0 : marginLineRight)
        + this.style.getBorderLineRightWidth(this)
        + this.style.getPaddingLineRight(this);
    }
  }

  isInline(): this is Inline {
    return true;
  }

  isInlineLevel() {
    return true;
  }

  getLogSymbol() {
    return '▭';
  }

  logName(log: Logger) {
    if (this.isAnonymous()) log.dim();
    log.text(`Inline ${this.id}`);
    log.reset();
  }

  absolutify() {
    // noop: inlines are painted in a different way than block containers
  }

  hasBackground() {
    return false;
  }

  hasForeground() {
    return this.style.hasPaint();
  }
}

const EmptyBuffer = {
  array: new Uint16Array(),
  destroy: () => {}
};

// So far this is always backed by an image (<img>) which, like browsers, always
// has a natural width and height and always has a ratio. In the browsers it's
// something like 20x20 and 1:1, but in dropflow, it's 0x0 and 1:1, since we
// prefer not to paint anything.
//
// If there is ever another kind of replaced element, the hard-coding should be
// replaced with an member that adheres to an interface.
export class ReplacedBox extends FormattingBox {
  src: string;

  constructor(style: Style, src: string) {
    super(style, 0);
    this.src = src;
  }

  isReplacedBox(): this is ReplacedBox {
    return true;
  }

  logName(log: Logger) {
    log.text("Replaced " + this.id);
  }

  getLogSymbol() {
    return "◼️";
  }

  hasBackground() {
    return this.style.hasPaint();
  }

  hasForeground() {
    return true;
  }

  getImage() {
    return this.src === '' ? undefined : getImage(this.src);
  }

  getIntrinsicIsize() {
    return (this.getImage()?.width ?? 0) * this.style.zoom;
  }

  getIntrinsicBsize() {
    return (this.getImage()?.height ?? 0) * this.style.zoom;
  }

  getRatio() {
    const image = this.getImage();
    return image ? (image.width / image.height || 1) : 1;
  }

  propagate(parent: Box) {
    super.propagate(parent);
    parent.bitfield |= Box.BITS.hasBreakInlineOrReplaced;
    parent.bitfield |= Box.BITS.hasFloatOrReplaced;
  }

  getDefiniteInnerInlineSize() {
    let isize = this.style.getInlineSize(this);

    if (isize === 'auto') {
      let bsize;
      if ((bsize = this.style.getBlockSize(this)) !== 'auto') { // isize from bsize
        return bsize * this.getRatio();
      } else {
        return this.getIntrinsicIsize();
      }
    } else {
      return isize;
    }
  }

  getDefiniteInnerBlockSize() {
    const bsize = this.style.getBlockSize(this);
    let isize;

    if (bsize !== 'auto') {
      return bsize;
    } else if ((isize = this.style.getInlineSize(this)) !== 'auto') { // bsize from isize
      return isize / this.getRatio();
    } else {
      return this.getIntrinsicBsize();
    }
  }
}


export type InlineLevel = Inline | Run | Break | BlockContainer | ReplacedBox;

type InlineIteratorBuffered = {state: 'pre' | 'post', item: Inline}
  | {state: 'text', item: Run}
  | {state: 'box', item: BlockLevel}
  | {state: 'break'}
  | {state: 'breakop'};

type InlineIteratorValue = InlineIteratorBuffered | {state: 'breakspot'};

interface InlineIteratorState {
  value: InlineIteratorValue | null;
  ifc: BlockContainerOfInlines;
  tree: InlineLevel[];
  index: number;
  minlevel: number;
  inlineEnd: number;
  buffered: InlineIteratorBuffered[];
  emitBreakspot: boolean;
  parents: Inline[];
}

export function createInlineIteratorState(
  tree: InlineLevel[],
  ifc: BlockContainerOfInlines
): InlineIteratorState {
  return {
    /* out */
    value: null,
    /* private */
    ifc,
    tree,
    index: ifc.treeStart + 1,
    buffered: [],
    minlevel: 0,
    parents: [],
    inlineEnd: 0,
    emitBreakspot: false,
  };
}

export function inlineIteratorStateNext(state: InlineIteratorState) {
  if (!state.buffered.length) {
    while (state.index <= state.ifc.treeFinal || state.parents.length) {
      while (
        state.parents.length &&
        state.index - 1 === state.parents.at(-1)!.treeFinal
      ) {
        const parent = state.parents.pop()!;
        state.buffered.push({state: 'post', item: parent});
        if (state.parents.length <= state.minlevel) {
          state.inlineEnd = state.buffered.length;
          state.minlevel = state.parents.length;
        }
      }

      if (state.index <= state.ifc.treeFinal) {
        const item = state.tree[state.index++];

        if (item.isInline()) {
          state.parents.push(item);
          state.buffered.push({state: 'pre', item});
        } else {
          state.emitBreakspot = state.minlevel !== state.parents.length;
          state.minlevel = state.parents.length;
          if (item.isRun()) {
            state.buffered.push({state: 'text', item});
          } else if (item.isBreak()) {
            state.buffered.push({state: 'break'});
          } else {
            if (item.isFloat()) {
              state.emitBreakspot = true;
              state.buffered.push({state: 'box', item});
            } else {
              state.buffered.push(
                {state: 'breakop'},
                {state: 'box', item},
                {state: 'breakop'}
              );
            }
          }
          break;
        }
      }
    }
  }

  if (state.buffered.length) {
    if (state.inlineEnd === 0 && state.emitBreakspot) {
      state.emitBreakspot = false;
      state.value = {state: 'breakspot'};
    } else {
      if (state.inlineEnd > 0) state.inlineEnd -= 1;
      state.value = state.buffered.shift()!;
    }
  } else {
    state.value = null;
  }
}

// Strategy for mixed block and inline content:
//
// 1. Push null onto the tree for the wrapper; we don't know which kind of
//    BlockContainer it is yet (OfInlines or OfBlocks).
// 2. When the wrapper is null, block-level children make it OfBlocks and
//    inline-level children make it OfInlines.
// 3. When the wrapper is OfInline, any block-level children shift the wrapper
//    and its descendents ahead one, and the wrapper becomes wrapper 2. A new
//    OfBlocks is put in its old position.
// 4. When the wrapper is OfBlocks, any inline children immediately generate
//    a block-level wrapper, known as wrapper 3, before the child.
//
// This way, the most wrapper transitions are null -> OfInlines -> OfBlocks, and
// the most expensive step, (3), can only happen once per block container, and
// while the tree is still small

interface GenerateBcContext {
  treeStart: number;
  // info for constructing the lazily-constructed BlockContainer
  attrs: number;
  style: Style;
  // location of the BlockContainerOfInlines being worked on
  ifcIndex: number;
}

function preBcBlockChild(
  tree: InlineLevel[],
  ctx: GenerateBcContext
) {
  if (tree[ctx.treeStart] === null) {
    const block = new BlockContainerOfBlocks(ctx.style, ctx.attrs);
    block.treeStart = ctx.treeStart;
    tree[ctx.treeStart] = block;
  } else {
    const wrapper2 = tree[ctx.treeStart];
    if (wrapper2.isBlockContainerOfInlines()) {
      // finish wrapper 2
      wrapper2.bitfield = Box.ATTRS.isAnonymous;
      wrapper2.style = createStyle(ctx.style, EMPTY_STYLE);
      for (let i = tree.length; i > ctx.treeStart; i--) {
        const item = tree[i] = tree[i - 1];
        if (item.isBox()) {
          item.treeStart++;
          item.treeFinal++;
        }
      }
      wrapper2.treeFinal = tree.length - 1;

      // finish inline root
      const inlineRoot = tree[ctx.treeStart + 2];
      if (!inlineRoot.isInline()) throw new Error('Assertion failed');
      inlineRoot.treeFinal = tree.length - 1;
      inlineRoot.end = wrapper2.text.length;

      // add the new wrapper
      const wrapper = new BlockContainerOfBlocks(ctx.style, ctx.attrs);
      wrapper.treeStart = ctx.treeStart;
      tree[ctx.treeStart] = wrapper;
      ctx.ifcIndex = -1;
    }

    if (ctx.ifcIndex > -1) {
      // finish ifc
      const ifc = tree[ctx.ifcIndex];
      if (!ifc.isBlockContainerOfInlines()) throw new Error('Assertion failed');
      ifc.treeFinal = tree.length - 1;

      // finish inline root
      const inlineRoot = tree[ctx.ifcIndex + 1];
      if (!inlineRoot.isInline()) throw new Error('Assertion failed');
      inlineRoot.treeFinal = tree.length - 1;
      inlineRoot.end = ifc.text.length;

      ctx.ifcIndex = -1;
    }
  }
}

function preBcInlineChild(tree: InlineLevel[], ctx: GenerateBcContext) {
  if (tree[ctx.treeStart] === null) {
    const block = new BlockContainerOfInlines(ctx.style, ctx.attrs);
    tree[ctx.treeStart] = block;
    block.treeStart = ctx.treeStart;
    ctx.ifcIndex = ctx.treeStart;

    const anonStyle = createStyle(ctx.style, EMPTY_STYLE);
    const inlineRoot = new Inline(anonStyle, Box.ATTRS.isAnonymous);
    inlineRoot.treeStart = ctx.treeStart + 1;
    tree.push(inlineRoot);
  } else if (ctx.ifcIndex < 0) {
    const wrapper = tree[ctx.treeStart];
    if (wrapper.isBlockContainerOfBlocks()) {
      const anonStyle = createStyle(ctx.style, EMPTY_STYLE);
      const wrapper3 = new BlockContainerOfInlines(anonStyle, ctx.attrs);
      tree.push(wrapper3);
      wrapper3.bitfield = Box.ATTRS.isAnonymous;
      wrapper3.treeStart = tree.length - 1;
      ctx.ifcIndex = tree.length - 1;

      const inlineRoot = new Inline(anonStyle, Box.ATTRS.isAnonymous);
      tree.push(inlineRoot);
      inlineRoot.treeStart = tree.length - 1;
    }
  }

  const ifc = tree[ctx.ifcIndex];
  if (!ifc.isBlockContainerOfInlines()) throw new Error('Assertion failed');
  return ifc;
}

// Helper for generateInlineBox
function mapTree(
  tree: InlineLevel[],
  el: HTMLElement,
  ctx: GenerateBcContext,
  path: number[],
  level: number
): boolean {
  const box = new Inline(el.style, 0);
  const ifc = preBcInlineChild(tree, ctx);

  if (!ifc.isBlockContainerOfInlines()) throw new Error('Assertion failed');
  tree.push(box);
  box.treeStart = tree.length - 1;
  box.start = ifc.text.length;

  if (level >= path.length) path[level] = 0;
  let bail = false;

  while (!bail && path[level] < el.children.length) {
    const childEl = el.children[path[level]];

    if (childEl instanceof HTMLElement) {
      if (childEl.tagName === 'br') {
        preBcInlineChild(tree, ctx);
        tree.push(new Break(childEl.style));
      } else if (childEl.style.display.outer === 'block') {
        if (childEl.style.isOutOfFlow()) {
          preBcInlineChild(tree, ctx);
          generateBlockBox(tree, childEl);
        } else {
          bail = true;
        }
      } else { // inline
        if (
          childEl.style.display.inner === 'flow-root' ||
          childEl.tagName === 'img'
        ) {
          preBcInlineChild(tree, ctx);
          generateBlockBox(tree, childEl);
        } else {
          bail = mapTree(tree, childEl, ctx, path, level + 1);
        }
      }
    } else if (childEl instanceof TextNode) {
      const ifc = preBcInlineChild(tree, ctx);
      const start = ifc.text.length;
      const end = start + childEl.text.length;
      ifc.text += childEl.text;
      tree.push(new Run(start, end, childEl.style));
    }

    if (!bail) path[level]++;
  }

  if (!bail) path.pop();
  box.end = ifc.text.length;
  box.treeFinal = tree.length - 1;
  el.boxes.push(box);

  return bail;
}

// Generates at least one inline box for the element. This must be called
// repeatedly until the first tuple value returns false to split out all block-
// level elements and the (fully nested) inlines in between and around them.
function generateInlineBox(
  tree: InlineLevel[],
  el: HTMLElement,
  ctx: GenerateBcContext,
  path: number[]
): boolean {
  const target = el.getEl(path);

  if (target instanceof HTMLElement && target.style.display.outer === 'block') {
    ++path[path.length - 1];
    preBcBlockChild(tree, ctx);
    generateBlockBox(tree, target);
    return true;
  }

  return mapTree(tree, el, ctx, path, 0);
}

function generateBlockBox(tree: InlineLevel[], el: HTMLElement){
  if (el.tagName === 'img') {
    const block = new ReplacedBox(el.style, el.attrs.src ?? "");
    tree.push(block);
    return block;
  } else {
    return generateBlockContainer(tree, el);
  }
}

// Generates a block container for the element
export function generateBlockContainer(tree: InlineLevel[], el: HTMLElement) {
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
    attrs |= BlockContainerBase.ATTRS.isBfcRoot;
  }

  if (el.style.display.outer === 'inline') {
    attrs |= BlockContainerBase.ATTRS.isInline;
  }

  if ('x-dropflow-log' in el.attrs) attrs |= Box.ATTRS.enableLogging;

  // @ts-expect-error see "strategy" paragraph above -> 1
  tree.push(null);

  const ctx: GenerateBcContext = {
    treeStart: tree.length - 1,
    attrs,
    style: el.style,
    ifcIndex: -1
  };

  for (const child of el.children) {
    if (child instanceof HTMLElement) {
      if (child.style.display.outer === 'none') continue;

      if (child.tagName === 'br') {
        preBcInlineChild(tree, ctx);
        tree.push(new Break(child.style));
      } else if (child.style.display.outer === 'block') {
        if (child.style.isOutOfFlow()) {
          preBcInlineChild(tree, ctx);
        } else {
          preBcBlockChild(tree, ctx);
        }

        generateBlockBox(tree, child);
      } else { // inline
        if (
          child.style.display.inner === 'flow-root' || // inline-block
          child.tagName === 'img'
        ) {
          preBcInlineChild(tree, ctx);
          generateBlockBox(tree, child);
        } else {
          const path: number[] = [];
          // TODO(commit) move while loop to inside this func
          while (generateInlineBox(tree, child, ctx, path))
            ;
        }
      }
    } else { // TextNode
      const computed = createStyle(el.style, EMPTY_STYLE);
      const ifc = preBcInlineChild(tree, ctx);
      const start = ifc.text.length;
      const end = start + child.text.length;
      tree.push(new Run(start, end, computed));
      ifc.text += child.text;
    }
  }

  // no children encountered, so make it an OfBlocks
  if (tree[ctx.treeStart] === null) preBcBlockChild(tree, ctx);

  const box = tree[ctx.treeStart];
  if (!box.isBlockContainer()) throw new Error('Assertion failed');
  box.treeFinal = tree.length - 1;
  if (ctx.ifcIndex > -1) {
    const ifc = tree[ctx.ifcIndex];
    if (!ifc.isBlockContainerOfInlines()) throw new Error('Assertion failed');
    ifc.treeFinal = tree.length - 1;

    const inlineRoot = tree[ctx.ifcIndex + 1];
    if (!inlineRoot.isInline()) throw new Error('Assertion failed');
    inlineRoot.treeFinal = tree.length - 1;
    inlineRoot.end = ifc.text.length;
  }
  el.boxes.push(box);
  return box;
}

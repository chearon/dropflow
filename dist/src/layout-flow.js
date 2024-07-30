import { binarySearch } from './util.js';
import { HTMLElement, TextNode } from './dom.js';
import { createStyle, EMPTY_STYLE } from './style.js';
import { EmptyInlineMetrics, Run, collapseWhitespace, createEmptyParagraph, createParagraph, getFontMetrics, isSpaceOrTabOrNewline } from './layout-text.js';
import { Box, BoxArea, RenderItem } from './layout-box.js';
function assumePx(v) {
    if (typeof v !== 'number') {
        throw new TypeError('The value accessed here has not been reduced to a used value in a ' +
            'context where a used value is expected. Make sure to perform any ' +
            'needed layouts.');
    }
}
function writingModeInlineAxis(el) {
    if (el.style.writingMode === 'horizontal-tb') {
        return 'horizontal';
    }
    else {
        return 'vertical';
    }
}
function isNowrap(whiteSpace) {
    return whiteSpace === 'nowrap' || whiteSpace === 'pre';
}
function isWsPreserved(whiteSpace) {
    return whiteSpace === 'pre' || whiteSpace === 'pre-wrap';
}
const reset = '\x1b[0m';
const dim = '\x1b[2m';
const underline = '\x1b[4m';
class MarginCollapseCollection {
    positive;
    negative;
    constructor(initialMargin = 0) {
        this.positive = 0;
        this.negative = 0;
        this.add(initialMargin);
    }
    add(margin) {
        if (margin < 0) {
            this.negative = Math.max(this.negative, -margin);
        }
        else {
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
    inlineSize;
    fctx;
    stack;
    cbBlockStart;
    cbLineLeft;
    cbLineRight;
    sizeStack;
    offsetStack;
    last;
    level;
    hypotheticals;
    margin;
    constructor(inlineSize) {
        this.inlineSize = inlineSize;
        this.stack = [];
        this.cbBlockStart = 0;
        this.cbLineLeft = 0;
        this.cbLineRight = 0;
        this.sizeStack = [0];
        this.offsetStack = [0];
        this.last = null;
        this.level = 0;
        this.margin = { level: 0, collection: new MarginCollapseCollection() };
        this.hypotheticals = EMPTY_MAP;
    }
    boxStart(box, ctx) {
        const { lineLeft, lineRight, blockStart } = box.getContainingBlockToContent();
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
        }
        else {
            this.positionBlockContainers();
            const c = floatBottom - this.cbBlockStart;
            this.margin = { level: this.level, collection: new MarginCollapseCollection(c) };
            if (box.canCollapseThrough())
                this.margin.clearanceAtLevel = this.level;
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
            this.margin = { level: this.level, collection: new MarginCollapseCollection() };
        }
    }
    boxEnd(box) {
        const { lineLeft, lineRight } = box.getContainingBlockToContent();
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
            }
            else {
                const blockSize = box.style.getBlockSize(box);
                // Handle the end of a block box that was at the end of its parent
                adjoins = blockSize === 'auto';
            }
        }
        this.stack.push({ post: box });
        this.level -= 1;
        this.cbLineLeft -= lineLeft;
        this.cbLineRight -= lineRight;
        if (!adjoins) {
            this.positionBlockContainers();
            this.margin = { level: this.level, collection: new MarginCollapseCollection() };
        }
        // Collapsing through - need to find the hypothetical position
        if (this.last === 'start') {
            if (this.hypotheticals === EMPTY_MAP)
                this.hypotheticals = new Map();
            this.hypotheticals.set(box, this.margin.collection.get());
        }
        this.margin.collection.add(marginBlockEnd);
        // When a box's end adjoins to the previous margin, move the "root" (the
        // box which the margin will be placed adjacent to) to the highest-up box
        // in the tree, since its siblings need to be shifted.
        if (this.level < this.margin.level)
            this.margin.level = this.level;
        this.last = 'end';
    }
    getLocalVacancyForLine(bfc, blockOffset, blockSize, vacancy) {
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
    ensureFloatContext(blockOffset) {
        return this.fctx || (this.fctx = new FloatContext(this, blockOffset));
    }
    finalize(box) {
        if (!box.isBfcRoot())
            throw new Error('This is for bfc roots only');
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
                const childSize = sizeStack.pop();
                const offset = offsetStack.pop();
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
            }
            else {
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
    items;
    // Moving shelf area (stretches to infinity in the block direction)
    shelfBlockOffset;
    shelfTrackIndex;
    // Tracks
    blockOffsets;
    inlineSizes;
    inlineOffsets;
    floatCounts;
    constructor(blockOffset) {
        this.items = [];
        this.shelfBlockOffset = blockOffset;
        this.shelfTrackIndex = 0;
        this.blockOffsets = [blockOffset];
        this.inlineSizes = [0];
        this.inlineOffsets = [0];
        this.floatCounts = [0];
    }
    initialize(blockOffset) {
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
    getSizeOfTracks(start, end, inlineOffset) {
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
    getFloatCountOfTracks(start, end) {
        let max = 0;
        for (let i = start; i < end; ++i)
            max = Math.max(max, this.floatCounts[i]);
        return max;
    }
    getEndTrack(start, blockOffset, blockSize) {
        const blockPosition = blockOffset + blockSize;
        let end = start + 1;
        while (end < this.blockOffsets.length && this.blockOffsets[end] < blockPosition)
            end++;
        return end;
    }
    getTrackRange(blockOffset, blockSize = 0) {
        let start = binarySearch(this.blockOffsets, blockOffset);
        if (this.blockOffsets[start] !== blockOffset)
            start -= 1;
        return [start, this.getEndTrack(start, blockOffset, blockSize)];
    }
    getOccupiedSpace(blockOffset, blockSize, inlineOffset) {
        if (this.items.length === 0)
            return 0;
        const [start, end] = this.getTrackRange(blockOffset, blockSize);
        return this.getSizeOfTracks(start, end, inlineOffset);
    }
    boxStart(blockOffset) {
        // This seems to violate rule 5 for blocks if the boxStart block has a
        // negative margin, but it's what browsers do 🤷‍♂️
        this.shelfBlockOffset = blockOffset;
        [this.shelfTrackIndex] = this.getTrackRange(this.shelfBlockOffset);
    }
    dropShelf(blockOffset) {
        if (blockOffset > this.shelfBlockOffset) {
            this.shelfBlockOffset = blockOffset;
            [this.shelfTrackIndex] = this.getTrackRange(this.shelfBlockOffset);
        }
    }
    getNextTrackOffset() {
        if (this.shelfTrackIndex + 1 < this.blockOffsets.length) {
            return this.blockOffsets[this.shelfTrackIndex + 1];
        }
        else {
            return this.blockOffsets[this.shelfTrackIndex];
        }
    }
    getBottom() {
        return this.blockOffsets[this.blockOffsets.length - 1];
    }
    splitTrack(trackIndex, blockOffset) {
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
    placeFloat(box, vacancy, cbLineLeft, cbLineRight) {
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
        }
        else {
            endTrack = startTrack;
        }
        const cbOffset = box.style.float === 'left' ? vacancy.leftOffset : vacancy.rightOffset;
        const cbLineSide = box.style.float === 'left' ? cbLineLeft : cbLineRight;
        const marginOffset = box.style.float === 'left' ? margins.lineLeft : margins.lineRight;
        const marginEnd = box.style.float === 'left' ? margins.lineRight : margins.lineLeft;
        if (box.style.float === 'left') {
            box.setInlinePosition(cbOffset - cbLineSide + marginOffset);
        }
        else {
            const inlineSize = box.containingBlock.inlineSize;
            const size = box.borderArea.inlineSize;
            box.setInlinePosition(cbOffset - cbLineSide + inlineSize - marginOffset - size);
        }
        for (let track = startTrack; track < endTrack; track += 1) {
            if (this.floatCounts[track] === 0) {
                this.inlineOffsets[track] = cbOffset;
                this.inlineSizes[track] = marginOffset + box.borderArea.width + marginEnd;
            }
            else {
                this.inlineSizes[track] = cbOffset - this.inlineOffsets[track] + marginOffset + box.borderArea.width + marginEnd;
            }
            this.floatCounts[track] += 1;
        }
        this.items.push(box);
    }
}
export class IfcVacancy {
    leftOffset;
    rightOffset;
    inlineSize;
    blockOffset;
    leftFloatCount;
    rightFloatCount;
    static EPSILON = 1 / 64;
    constructor(leftOffset, rightOffset, blockOffset, inlineSize, leftFloatCount, rightFloatCount) {
        this.leftOffset = leftOffset;
        this.rightOffset = rightOffset;
        this.blockOffset = blockOffset;
        this.inlineSize = inlineSize;
        this.leftFloatCount = leftFloatCount;
        this.rightFloatCount = rightFloatCount;
    }
    fits(inlineSize) {
        return inlineSize - this.inlineSize < IfcVacancy.EPSILON;
    }
    hasFloats() {
        return this.leftFloatCount > 0 || this.rightFloatCount > 0;
    }
}
;
export class FloatContext {
    bfc;
    leftFloats;
    rightFloats;
    misfits;
    constructor(bfc, blockOffset) {
        this.bfc = bfc;
        this.leftFloats = new FloatSide(blockOffset);
        this.rightFloats = new FloatSide(blockOffset);
        this.misfits = [];
    }
    boxStart() {
        this.leftFloats.boxStart(this.bfc.cbBlockStart);
        this.rightFloats.boxStart(this.bfc.cbBlockStart);
    }
    getVacancyForLine(blockOffset, blockSize) {
        const leftInlineSpace = this.leftFloats.getOccupiedSpace(blockOffset, blockSize, -this.bfc.cbLineLeft);
        const rightInlineSpace = this.rightFloats.getOccupiedSpace(blockOffset, blockSize, -this.bfc.cbLineRight);
        const leftOffset = this.bfc.cbLineLeft + leftInlineSpace;
        const rightOffset = this.bfc.cbLineRight + rightInlineSpace;
        const inlineSize = this.bfc.inlineSize - leftOffset - rightOffset;
        return new IfcVacancy(leftOffset, rightOffset, blockOffset, inlineSize, 0, 0);
    }
    getVacancyForBox(box, lineWidth) {
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
    findLinePosition(blockOffset, blockSize, inlineSize) {
        let [leftShelfIndex] = this.leftFloats.getTrackRange(blockOffset, blockSize);
        let [rightShelfIndex] = this.rightFloats.getTrackRange(blockOffset, blockSize);
        while (leftShelfIndex < this.leftFloats.inlineSizes.length ||
            rightShelfIndex < this.rightFloats.inlineSizes.length) {
            let leftOffset, rightOffset;
            if (leftShelfIndex < this.leftFloats.inlineSizes.length) {
                leftOffset = this.leftFloats.blockOffsets[leftShelfIndex];
            }
            else {
                leftOffset = Infinity;
            }
            if (rightShelfIndex < this.rightFloats.inlineSizes.length) {
                rightOffset = this.rightFloats.blockOffsets[rightShelfIndex];
            }
            else {
                rightOffset = Infinity;
            }
            blockOffset = Math.max(blockOffset, Math.min(leftOffset, rightOffset));
            const vacancy = this.getVacancyForLine(blockOffset, blockSize);
            if (inlineSize <= vacancy.inlineSize)
                return vacancy;
            if (leftOffset <= rightOffset)
                leftShelfIndex += 1;
            if (rightOffset <= leftOffset)
                rightShelfIndex += 1;
        }
        return this.getVacancyForLine(blockOffset, blockSize);
    }
    placeFloat(lineWidth, lineIsEmpty, box) {
        if (box.style.float === 'none') {
            throw new Error('Attempted to place float: none');
        }
        if (this.misfits.length) {
            this.misfits.push(box);
        }
        else {
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
            }
            else {
                const vacancy = this.getVacancyForBox(box, 0);
                if (!vacancy.fits(inlineSize)) {
                    const count = box.style.float === 'left' ? vacancy.leftFloatCount : vacancy.rightFloatCount;
                    const oppositeCount = box.style.float === 'left' ? vacancy.rightFloatCount : vacancy.leftFloatCount;
                    if (count > 0) {
                        side.dropShelf(side.getNextTrackOffset());
                    }
                    else if (oppositeCount > 0) {
                        const [, trackIndex] = oppositeSide.getTrackRange(side.shelfBlockOffset);
                        if (trackIndex === oppositeSide.blockOffsets.length)
                            throw new Error('assertion failed');
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
            for (const box of misfits)
                this.placeFloat(0, true, box);
        }
    }
    dropShelf(blockOffset) {
        this.leftFloats.dropShelf(blockOffset);
        this.rightFloats.dropShelf(blockOffset);
    }
    postLine(line, didBreak) {
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
export class BlockContainer extends Box {
    children;
    borderArea;
    paddingArea;
    contentArea;
    constructor(style, children, attrs) {
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
    sym() {
        if (this.isFloat()) {
            return '○︎';
        }
        else if (this.isInlineLevel()) {
            return '▬';
        }
        else {
            return '◼︎';
        }
    }
    desc() {
        return (this.isAnonymous() ? dim : '')
            + (this.isBfcRoot() ? underline : '')
            + 'Block ' + this.id
            + reset;
    }
    get writingModeAsParticipant() {
        return this.containingBlock.writingMode;
    }
    get directionAsParticipant() {
        return this.containingBlock.direction;
    }
    setBlockPosition(position) {
        this.borderArea.blockStart = position;
    }
    setBlockSize(size) {
        this.contentArea.blockSize = size;
        if (this.style.hasPadding()) {
            const paddingBlockStart = this.style.getPaddingBlockStart(this);
            const paddingBlockEnd = this.style.getPaddingBlockEnd(this);
            const paddingSize = size + paddingBlockStart + paddingBlockEnd;
            this.paddingArea.blockSize = paddingSize;
        }
        if (this.style.hasBorder()) {
            const borderBlockStartWidth = this.style.getBorderBlockStartWidth(this);
            const borderBlockEndWidth = this.style.getBorderBlockEndWidth(this);
            const borderSize = this.paddingArea.blockSize + borderBlockStartWidth + borderBlockEndWidth;
            this.borderArea.blockSize = borderSize;
        }
    }
    setInlinePosition(lineLeft) {
        this.borderArea.lineLeft = lineLeft;
    }
    setInlineOuterSize(size) {
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
        return { blockStart, lineLeft, lineRight };
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
        if (marginBlockStart === 'auto')
            marginBlockStart = 0;
        if (marginLineRight === 'auto')
            marginLineRight = 0;
        if (marginBlockEnd === 'auto')
            marginBlockEnd = 0;
        if (marginLineLeft === 'auto')
            marginLineLeft = 0;
        return {
            blockStart: marginBlockStart,
            lineRight: marginLineRight,
            blockEnd: marginBlockEnd,
            lineLeft: marginLineLeft
        };
    }
    getLastBaseline() {
        const stack = [{ block: this, offset: 0 }];
        while (stack.length) {
            const { block, offset } = stack.pop();
            if (block.isBlockContainerOfInlines()) {
                const [ifc] = block.children;
                const linebox = ifc.paragraph.lineboxes.at(-1);
                if (linebox)
                    return offset + linebox.blockOffset + linebox.ascender;
            }
            if (block.isBlockContainerOfBlockContainers()) {
                const parentOffset = offset;
                for (const child of block.children) {
                    const offset = parentOffset
                        + child.borderArea.blockStart
                        + child.style.getBorderBlockStartWidth(child);
                    +child.style.getPaddingBlockStart(child);
                    stack.push({ block: child, offset });
                }
            }
        }
    }
    assignContainingBlocks(ctx) {
        // CSS2.2 10.1
        if (this.style.position === 'absolute') {
            this.containingBlock = ctx.lastPositionedArea;
        }
        else {
            this.containingBlock = ctx.lastBlockContainerArea;
        }
        this.fillAreas();
        this.borderArea.setParent(this.containingBlock);
        ctx.lastBlockContainerArea = this.contentArea;
        if (this.style.position !== 'static') {
            ctx.lastPositionedArea = this.paddingArea;
        }
    }
    isBlockContainer() {
        return true;
    }
    isInlineLevel() {
        return Boolean(this.attrs & Box.ATTRS.isInline);
    }
    isBfcRoot() {
        return Boolean(this.attrs & Box.ATTRS.isBfcRoot);
    }
    isFloat() {
        return this.style.float !== 'none';
    }
    // Note that this doesn't check isInlineLevel because that's really only used
    // for logging. What really determines if a block is inline or block-level is
    // whether it's inside a block of blocks or a block of inlines.
    isInlineBlock() {
        return this.style.float === 'none';
    }
    loggingEnabled() {
        return Boolean(this.attrs & Box.ATTRS.enableLogging);
    }
    isBlockContainerOfInlines() {
        return Boolean(this.children.length && this.children[0].isIfcInline());
    }
    canCollapseThrough() {
        const blockSize = this.style.getBlockSize(this);
        if (blockSize !== 'auto' && blockSize !== 0)
            return false;
        if (this.isBlockContainerOfInlines()) {
            const [ifc] = this.children;
            return !ifc.hasText();
        }
        else {
            return this.children.length === 0;
        }
    }
    isBlockContainerOfBlockContainers() {
        return !this.isBlockContainerOfInlines();
    }
    preprocess() {
        for (const child of this.children) {
            child.preprocess();
        }
    }
    postprocess() {
        this.borderArea.absolutify();
        if (this.style.position === 'relative') {
            this.borderArea.x += this.getRelativeHorizontalShift();
            this.borderArea.y += this.getRelativeVerticalShift();
        }
        if (this.paddingArea !== this.borderArea)
            this.paddingArea.absolutify();
        if (this.contentArea !== this.paddingArea)
            this.contentArea.absolutify();
        for (const c of this.children)
            c.postprocess();
    }
    doTextLayout(ctx) {
        if (!this.isBlockContainerOfInlines())
            throw new Error('Children are block containers');
        const [ifc] = this.children;
        const blockSize = this.style.getBlockSize(this);
        ifc.doTextLayout(ctx);
        if (blockSize === 'auto')
            this.setBlockSize(ifc.paragraph.height);
    }
}
function preBlockContainer(box, ctx) {
    // Containing blocks first, for absolute positioning later
    box.assignContainingBlocks(ctx);
    if (box.isBlockContainerOfInlines()) {
        const [inline] = box.children;
        inline.assignContainingBlocks(ctx);
    }
}
// §10.3.3
function doInlineBoxModelForBlockBox(box) {
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
            if (marginLineLeft === 'auto')
                marginLineLeft = 0;
            if (marginLineRight === 'auto')
                marginLineRight = 0;
        }
        if (marginLineLeft !== 'auto' && marginLineRight !== 'auto') {
            // Paragraph 3: check over-constrained values. This expands the right
            // margin in LTR documents to fill space, or, if the above scenario was
            // hit, it makes the right margin negative.
            if (box.directionAsParticipant === 'ltr') {
                marginLineRight = cInlineSize - (specifiedInlineSize - marginLineRight);
            }
            else {
                marginLineLeft = cInlineSize - (specifiedInlineSize - marginLineRight);
            }
        }
        else { // one or both of the margins is auto, specifiedWidth < cb width
            if (marginLineLeft === 'auto' && marginLineRight !== 'auto') {
                // Paragraph 4: only auto value is margin-left
                marginLineLeft = cInlineSize - specifiedInlineSize;
            }
            else if (marginLineRight === 'auto' && marginLineLeft !== 'auto') {
                // Paragraph 4: only auto value is margin-right
                marginLineRight = cInlineSize - specifiedInlineSize;
            }
            else {
                // Paragraph 6: two auto values, center the content
                const margin = (cInlineSize - specifiedInlineSize) / 2;
                marginLineLeft = marginLineRight = margin;
            }
        }
    }
    // Paragraph 5: auto width
    if (inlineSize === 'auto') {
        if (marginLineLeft === 'auto')
            marginLineLeft = 0;
        if (marginLineRight === 'auto')
            marginLineRight = 0;
    }
    assumePx(marginLineLeft);
    assumePx(marginLineRight);
    box.setInlinePosition(marginLineLeft);
    box.setInlineOuterSize(cInlineSize - marginLineLeft - marginLineRight);
}
// §10.6.3
function doBlockBoxModelForBlockBox(box) {
    const blockSize = box.style.getBlockSize(box);
    if (blockSize === 'auto') {
        if (box.children.length === 0) {
            box.setBlockSize(0); // Case 4
        }
        else {
            // Cases 1-4 should be handled by doBoxPositioning, where margin
            // calculation happens. These bullet points seem to be re-phrasals of
            // margin collapsing in CSS 2.2 § 8.3.1 at the very end. If I'm wrong,
            // more might need to happen here.
        }
    }
    else {
        box.setBlockSize(blockSize);
    }
}
export function layoutBlockBox(box, ctx) {
    const bfc = ctx.bfc;
    const cctx = { ...ctx };
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
    }
    else if (box.isBlockContainerOfBlockContainers()) {
        for (const child of box.children) {
            layoutBlockBox(child, cctx);
        }
    }
    else {
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
function doInlineBoxModelForFloatBox(box, inlineSize) {
    const marginLineLeft = box.style.getMarginLineLeft(box);
    const marginLineRight = box.style.getMarginLineRight(box);
    box.setInlineOuterSize(inlineSize -
        (marginLineLeft === 'auto' ? 0 : marginLineLeft) -
        (marginLineRight === 'auto' ? 0 : marginLineRight));
}
function layoutContribution(box, ctx, mode) {
    const cctx = { ...ctx };
    let intrinsicSize = 0;
    cctx.mode = mode;
    preBlockContainer(box, cctx);
    const definiteSize = box.getDefiniteInlineSize();
    if (definiteSize !== undefined)
        return definiteSize;
    if (box.isBfcRoot())
        cctx.bfc = new BlockFormattingContext(mode === 'min-content' ? 0 : Infinity);
    ctx.bfc.boxStart(box, cctx);
    if (box.isBlockContainerOfInlines()) {
        const [ifc] = box.children;
        for (const line of ifc.paragraph.lineboxes) {
            intrinsicSize = Math.max(intrinsicSize, line.width);
        }
    }
    else if (box.isBlockContainerOfBlockContainers()) {
        for (const child of box.children) {
            intrinsicSize = Math.max(intrinsicSize, layoutContribution(child, cctx, mode));
        }
    }
    else {
        throw new Error(`Unknown box type: ${box.id}`);
    }
    if (box.isBfcRoot()) {
        cctx.bfc.finalize(box);
        if (cctx.bfc.fctx) {
            if (mode === 'max-content') {
                intrinsicSize += cctx.bfc.fctx.leftFloats.getOverflow();
                intrinsicSize += cctx.bfc.fctx.rightFloats.getOverflow();
            }
            else {
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
export function layoutFloatBox(box, ctx) {
    if (!box.isBfcRoot()) {
        throw new Error(`Box ${box.id} is float but not BFC root, that should be impossible`);
    }
    const cctx = { ...ctx };
    preBlockContainer(box, cctx);
    let inlineSize = box.getDefiniteInlineSize();
    if (inlineSize === undefined) {
        const cctx = { ...ctx };
        cctx.bfc = new BlockFormattingContext(0); // Not used, but children call it
        if (ctx.mode === 'min-content') {
            inlineSize = layoutContribution(box, cctx, 'min-content');
        }
        else if (ctx.mode === 'max-content') {
            inlineSize = layoutContribution(box, cctx, 'max-content');
        }
        else {
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
    }
    else if (box.isBlockContainerOfBlockContainers()) {
        for (const child of box.children) {
            layoutBlockBox(child, cctx);
        }
    }
    else {
        throw new Error(`Unknown box type: ${box.id}`);
    }
    cctx.bfc.finalize(box);
}
export class Break extends RenderItem {
    className = 'break';
    isBreak() {
        return true;
    }
    sym() {
        return '⏎';
    }
    desc() {
        return 'BR';
    }
}
export class Inline extends Box {
    children;
    nshaped;
    metrics;
    start;
    end;
    constructor(start, end, style, children, attrs) {
        super(style, children, attrs);
        this.start = start;
        this.end = end;
        this.children = children;
        this.nshaped = 0;
        this.metrics = EmptyInlineMetrics;
    }
    preprocess() {
        this.metrics = getFontMetrics(this);
        for (const child of this.children) {
            if (child.isInline() || child.isBlockContainer())
                child.preprocess();
        }
    }
    postprocess() {
        for (const child of this.children) {
            if (child.isInline() || child.isBlockContainer())
                child.postprocess();
        }
    }
    hasLineLeftGap() {
        return this.style.hasLineLeftGap();
    }
    hasLineRightGap() {
        return this.style.hasLineRightGap();
    }
    getLineLeftMarginBorderPadding(ifc) {
        const marginLineLeft = this.style.getMarginLineLeft(ifc);
        return (marginLineLeft === 'auto' ? 0 : marginLineLeft)
            + this.style.getBorderLineLeftWidth(ifc)
            + this.style.getPaddingLineLeft(ifc);
    }
    getLineRightMarginBorderPadding(ifc) {
        const marginLineRight = this.style.getMarginLineRight(ifc);
        return (marginLineRight === 'auto' ? 0 : marginLineRight)
            + this.style.getBorderLineRightWidth(ifc)
            + this.style.getPaddingLineRight(ifc);
    }
    isInline() {
        return true;
    }
    sym() {
        return '▭';
    }
    desc() {
        return (this.isAnonymous() ? dim : '')
            + (this.isIfcInline() ? underline : '')
            + 'Inline'
            + ' ' + this.id
            + reset;
    }
    assignContainingBlocks(ctx) {
        this.containingBlock = ctx.lastBlockContainerArea;
        for (const child of this.children) {
            if (child.isInline())
                child.assignContainingBlocks(ctx);
        }
    }
    absolutify() {
        // noop: inlines are painted in a different way than block containers
    }
}
const NON_ASCII_MASK = 0b1111_1111_1000_0000;
export class IfcInline extends Inline {
    children;
    text;
    paragraph;
    analysis;
    static ANALYSIS_HAS_TEXT = 1 << 0;
    static ANALYSIS_WRAPS = 1 << 1;
    static ANALYSIS_WS_COLLAPSES = 1 << 2;
    static ANALYSIS_HAS_INLINES = 1 << 3;
    static ANALYSIS_HAS_BREAKS = 1 << 4;
    static ANALYSIS_IS_COMPLEX_TEXT = 1 << 5;
    static ANALYSIS_HAS_SOFT_HYPHEN = 1 << 6;
    static ANALYSIS_HAS_FLOATS = 1 << 7;
    static ANALYSIS_HAS_NEWLINES = 1 << 8;
    static ANALYSIS_HAS_PAINTED_INLINES = 1 << 9;
    static ANALYSIS_HAS_POSITIONED_INLINE = 1 << 10;
    static ANALYSIS_HAS_INLINE_BLOCKS = 1 << 11;
    static ANALYSIS_HAS_TEXT_OR_SIZED_INLINE = 1 << 12;
    static ANALYSIS_HAS_COLORED_INLINE = 1 << 13;
    constructor(style, text, children, attrs) {
        super(0, text.length, style, children, Box.ATTRS.isAnonymous | attrs);
        this.children = children;
        this.text = text;
        this.analysis = 0;
        this.prepare();
        this.paragraph = createEmptyParagraph(this);
    }
    isIfcInline() {
        return true;
    }
    get writingModeAsParticipant() {
        return this.containingBlock.writingMode;
    }
    loggingEnabled() {
        return Boolean(this.attrs & Box.ATTRS.enableLogging);
    }
    prepare() {
        const stack = this.children.slice();
        const color = this.style.color;
        if (!isNowrap(this.style.whiteSpace)) {
            this.analysis |= IfcInline.ANALYSIS_WRAPS;
        }
        if (!isWsPreserved(this.style.whiteSpace)) {
            this.analysis |= IfcInline.ANALYSIS_WS_COLLAPSES;
        }
        let hasText = false;
        while (stack.length) {
            const box = stack.shift();
            if (box.isRun()) {
                hasText = hasText || !box.wsCollapsible;
                for (let i = box.start; !hasText && i < box.end; i++) {
                    hasText = !isSpaceOrTabOrNewline(this.text[i]);
                }
            }
            else if (box.isInline()) {
                this.analysis |= IfcInline.ANALYSIS_HAS_INLINES;
                if (!isNowrap(box.style.whiteSpace)) {
                    this.analysis |= IfcInline.ANALYSIS_WRAPS;
                }
                if (!isWsPreserved(box.style.whiteSpace)) {
                    this.analysis |= IfcInline.ANALYSIS_WS_COLLAPSES;
                }
                if (box.style.backgroundColor.a !== 0 || box.style.hasBorder()) {
                    this.analysis |= IfcInline.ANALYSIS_HAS_PAINTED_INLINES;
                }
                if (box.style.position === 'relative') {
                    this.analysis |= IfcInline.ANALYSIS_HAS_POSITIONED_INLINE;
                }
                if (!this.hasTextOrSizedInline() &&
                    (hasText || box.hasLineLeftGap() || box.hasLineRightGap())) {
                    this.analysis |= IfcInline.ANALYSIS_HAS_TEXT_OR_SIZED_INLINE;
                }
                if (!this.hasColoredInline() && (box.style.color.r !== color.r ||
                    box.style.color.g !== color.g ||
                    box.style.color.b !== color.b ||
                    box.style.color.a !== color.a)) {
                    this.analysis |= IfcInline.ANALYSIS_HAS_COLORED_INLINE;
                }
                stack.unshift(...box.children);
            }
            else if (box.isBreak()) {
                this.analysis |= IfcInline.ANALYSIS_HAS_BREAKS;
                // ok
            }
            else if (box.isFloat()) {
                this.analysis |= IfcInline.ANALYSIS_HAS_FLOATS;
            }
            else if (box.isBlockContainer()) {
                this.analysis |= IfcInline.ANALYSIS_HAS_INLINE_BLOCKS;
                // TODO: may be absolutely positioned?
            }
        }
        if (hasText) {
            this.analysis |= IfcInline.ANALYSIS_HAS_TEXT;
            this.analysis |= IfcInline.ANALYSIS_HAS_TEXT_OR_SIZED_INLINE;
        }
        for (let i = 0; i < this.text.length; i++) {
            const code = this.text.charCodeAt(i);
            if (code & NON_ASCII_MASK) {
                this.analysis |= IfcInline.ANALYSIS_IS_COMPLEX_TEXT;
            }
            if (code === 0xad) {
                this.analysis |= IfcInline.ANALYSIS_HAS_SOFT_HYPHEN;
            }
            else if (code === 0xa0) {
                this.analysis |= IfcInline.ANALYSIS_HAS_NEWLINES;
            }
        }
        if (this.shouldLayoutContent() && this.collapses())
            collapseWhitespace(this);
    }
    preprocess() {
        super.preprocess();
        if (this.shouldLayoutContent()) {
            this.paragraph.destroy();
            this.paragraph = createParagraph(this);
            this.paragraph.shape();
        }
    }
    postprocess() {
        super.postprocess();
        this.paragraph.destroy();
        if (this.hasPositionedInline()) {
            const inlineShifts = new Map();
            const stack = this.children.slice().reverse();
            let dx = 0;
            let dy = 0;
            let itemIndex = 0;
            while (stack.length) {
                const box = stack.pop();
                if ('sentinel' in box) {
                    while (itemIndex < this.paragraph.brokenItems.length &&
                        this.paragraph.brokenItems[itemIndex].end() <= box.sentinel.start)
                        itemIndex++;
                    while (itemIndex < this.paragraph.brokenItems.length &&
                        this.paragraph.brokenItems[itemIndex].offset < box.sentinel.end) {
                        const item = this.paragraph.brokenItems[itemIndex];
                        item.x += dx;
                        item.y += dy;
                        itemIndex++;
                    }
                    if (box.sentinel.style.position === 'relative') {
                        dx -= box.sentinel.getRelativeHorizontalShift();
                        dy -= box.sentinel.getRelativeVerticalShift();
                    }
                }
                else if (box.isInline()) {
                    stack.push({ sentinel: box });
                    for (let i = box.children.length - 1; i >= 0; i--) {
                        stack.push(box.children[i]);
                    }
                    if (box.style.position === 'relative') {
                        dx += box.getRelativeHorizontalShift();
                        dy += box.getRelativeVerticalShift();
                    }
                    inlineShifts.set(box, { dx, dy });
                }
                else if (box.isBlockContainer()) {
                    // floats or inline-blocks
                    box.borderArea.x += dx;
                    box.borderArea.y += dy;
                }
            }
            for (const [inline, backgrounds] of this.paragraph.backgroundBoxes) {
                const { dx, dy } = inlineShifts.get(inline);
                for (const background of backgrounds) {
                    background.blockOffset += dy;
                    background.start += dx;
                    background.end += dx;
                }
            }
        }
    }
    shouldLayoutContent() {
        return this.hasTextOrSizedInline()
            || this.hasFloats()
            || this.hasInlineBlocks();
    }
    doTextLayout(ctx) {
        if (this.shouldLayoutContent()) {
            this.paragraph.createLineboxes(ctx);
            this.paragraph.positionItems(ctx);
        }
    }
    hasText() {
        return this.analysis & IfcInline.ANALYSIS_HAS_TEXT;
    }
    wraps() {
        return this.analysis & IfcInline.ANALYSIS_WRAPS;
    }
    collapses() {
        return this.analysis & IfcInline.ANALYSIS_WS_COLLAPSES;
    }
    hasFloats() {
        return this.analysis & IfcInline.ANALYSIS_HAS_FLOATS;
    }
    hasInlines() {
        return this.analysis & IfcInline.ANALYSIS_HAS_INLINES;
    }
    hasBreaks() {
        return this.analysis & IfcInline.ANALYSIS_HAS_BREAKS;
    }
    isComplexText() {
        return this.analysis & IfcInline.ANALYSIS_IS_COMPLEX_TEXT;
    }
    hasSoftHyphen() {
        return this.analysis & IfcInline.ANALYSIS_HAS_SOFT_HYPHEN;
    }
    hasNewlines() {
        return this.analysis & IfcInline.ANALYSIS_HAS_NEWLINES;
    }
    hasPaintedInlines() {
        return this.analysis & IfcInline.ANALYSIS_HAS_PAINTED_INLINES;
    }
    hasPositionedInline() {
        return this.analysis & IfcInline.ANALYSIS_HAS_POSITIONED_INLINE;
    }
    hasInlineBlocks() {
        return this.analysis & IfcInline.ANALYSIS_HAS_INLINE_BLOCKS;
    }
    // Note this could have been a separate "hasSizedInline" flag since there is
    // already a "hasText", but it's more efficient to calculate the combined flag
    // and we never care about sized inlines alone when there is text
    hasTextOrSizedInline() {
        return this.analysis & IfcInline.ANALYSIS_HAS_TEXT_OR_SIZED_INLINE;
    }
    hasColoredInline() {
        return this.analysis & IfcInline.ANALYSIS_HAS_COLORED_INLINE;
    }
}
// break: an actual forced break; <br>.
//
// breakspot: the location in between spans at which to break if needed. for
// example, `abc </span><span>def ` would emit breakspot between the closing
// ("post") and opening ("pre") span
//
// breakop: a break opportunity introduced by an inline-block (these are unique
// compared to text break opportunities because they do not exist on character
// positions). one of thse comes before and one after an inline-block
export function createInlineIterator(inline) {
    const stack = inline.children.slice().reverse();
    const buffered = [];
    let minlevel = 0;
    let level = 0;
    let bk = 0;
    let shouldFlushBreakop = false;
    function next() {
        if (!buffered.length) {
            while (stack.length) {
                const item = stack.pop();
                if ('post' in item) {
                    level -= 1;
                    buffered.push({ state: 'post', item: item.post });
                    if (level <= minlevel) {
                        bk = buffered.length;
                        minlevel = level;
                    }
                }
                else if (item.isInline()) {
                    level += 1;
                    buffered.push({ state: 'pre', item });
                    stack.push({ post: item });
                    for (let i = item.children.length - 1; i >= 0; --i)
                        stack.push(item.children[i]);
                }
                else {
                    shouldFlushBreakop = minlevel !== level;
                    minlevel = level;
                    if (item.isRun()) {
                        buffered.push({ state: 'text', item });
                    }
                    else if (item.isBreak()) {
                        buffered.push({ state: 'break' });
                    }
                    else {
                        if (item.isFloat()) {
                            shouldFlushBreakop = true;
                            buffered.push({ state: 'block', item });
                        }
                        else {
                            buffered.push({ state: 'breakop' }, { state: 'block', item }, { state: 'breakop' });
                        }
                    }
                    break;
                }
            }
        }
        if (buffered.length) {
            if (bk > 0) {
                bk -= 1;
            }
            else if (shouldFlushBreakop) {
                shouldFlushBreakop = false;
                return { value: { state: 'breakspot' }, done: false };
            }
            return { value: buffered.shift(), done: false };
        }
        return { done: true };
    }
    return { next };
}
export function createPreorderInlineIterator(inline) {
    const stack = inline.children.slice().reverse();
    function next() {
        while (stack.length) {
            const item = stack.pop();
            if (item.isInline()) {
                for (let i = item.children.length - 1; i >= 0; --i) {
                    stack.push(item.children[i]);
                }
                return { done: false, value: item };
            }
            else if (item.isRun()) {
                return { done: false, value: item };
            }
        }
        return { done: true };
    }
    return { next };
}
// Helper for generateInlineBox
function mapTree(el, text, path, level) {
    const start = text.value.length;
    let children = [], bail = false, attrs = 0;
    if (!path[level])
        path[level] = 0;
    while (!bail && path[level] < el.children.length) {
        let child, childEl = el.children[path[level]];
        if (childEl instanceof HTMLElement) {
            if (childEl.tagName === 'br') {
                child = new Break(childEl.style);
            }
            else if (childEl.style.float !== 'none') {
                child = generateBlockContainer(childEl);
            }
            else if (childEl.style.display.outer === 'block') {
                bail = true;
            }
            else if (childEl.style.display.inner === 'flow-root') {
                child = generateBlockContainer(childEl);
            }
            else {
                [bail, child] = mapTree(childEl, text, path, level + 1);
            }
        }
        else if (childEl instanceof TextNode) {
            const start = text.value.length;
            const end = start + childEl.text.length;
            child = new Run(start, end, childEl.style);
            text.value += childEl.text;
        }
        if (child != null)
            children.push(child);
        if (!bail)
            path[level]++;
    }
    if (!bail)
        path.pop();
    if ('x-dropflow-log' in el.attrs)
        attrs |= Box.ATTRS.enableLogging;
    const end = text.value.length;
    const box = new Inline(start, end, el.style, children, attrs);
    el.boxes.push(box);
    return [bail, box];
}
// Generates at least one inline box for the element. This must be called
// repeatedly until the first tuple value returns false to split out all block-
// level elements and the (fully nested) inlines in between and around them.
function generateInlineBox(el, text, path) {
    const target = el.getEl(path);
    if (target instanceof HTMLElement && target.style.display.outer === 'block') {
        ++path[path.length - 1];
        return [true, generateBlockContainer(target)];
    }
    return mapTree(el, text, path, 0);
}
// Wraps consecutive inlines and runs in block-level block containers.
// CSS2.1 section 9.2.1.1
function wrapInBlockContainer(parentEl, inlines, text) {
    const anonStyle = createStyle(parentEl.style, EMPTY_STYLE);
    let attrs = Box.ATTRS.isAnonymous;
    if ('x-dropflow-log' in parentEl.attrs)
        attrs |= Box.ATTRS.enableLogging;
    const ifc = new IfcInline(anonStyle, text.value, inlines, attrs);
    return new BlockContainer(anonStyle, [ifc], attrs);
}
// Generates a block container for the element
export function generateBlockContainer(el) {
    const text = { value: '' };
    const enableLogging = 'x-dropflow-log' in el.attrs;
    const blocks = [];
    let inlines = [];
    let attrs = 0;
    // TODO: it's time to start moving some of this type of logic to HTMLElement.
    // For example add the methods establishesBfc, generatesBlockContainerOfBlocks,
    // generatesBreak, etc
    if (el.style.float !== 'none' ||
        el.style.display.inner === 'flow-root' ||
        el.parent && writingModeInlineAxis(el) !== writingModeInlineAxis(el.parent)) {
        attrs |= Box.ATTRS.isBfcRoot;
    }
    if (enableLogging)
        attrs |= Box.ATTRS.enableLogging;
    for (const child of el.children) {
        if (child instanceof HTMLElement) {
            if (child.style.display.outer === 'none')
                continue;
            if (child.tagName === 'br') {
                inlines.push(new Break(child.style));
            }
            else if (child.style.float !== 'none') {
                inlines.push(generateBlockContainer(child));
            }
            else if (child.style.display.outer === 'block') {
                if (inlines.length) {
                    blocks.push(wrapInBlockContainer(el, inlines, text));
                    inlines = [];
                    text.value = '';
                }
                blocks.push(generateBlockContainer(child));
            }
            else { // inline
                if (child.style.display.inner === 'flow-root') { // inline-block
                    inlines.push(generateBlockContainer(child));
                }
                else {
                    const path = [];
                    let more, box;
                    do {
                        ([more, box] = generateInlineBox(child, text, path));
                        if (box.isInline()) {
                            inlines.push(box);
                        }
                        else {
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
        }
        else { // TextNode
            const computed = createStyle(el.style, EMPTY_STYLE);
            const start = text.value.length;
            const end = start + child.text.length;
            inlines.push(new Run(start, end, computed));
            text.value += child.text;
        }
    }
    if (el.style.display.outer === 'inline') {
        attrs |= Box.ATTRS.isInline;
    }
    let children;
    if (inlines.length) {
        if (blocks.length) {
            blocks.push(wrapInBlockContainer(el, inlines, text));
            children = blocks;
        }
        else {
            const anonComputedStyle = createStyle(el.style, EMPTY_STYLE);
            const ifcAttrs = Box.ATTRS.isAnonymous | (enableLogging ? Box.ATTRS.enableLogging : 0);
            children = [new IfcInline(anonComputedStyle, text.value, inlines, ifcAttrs)];
        }
    }
    else {
        children = blocks;
    }
    const box = new BlockContainer(el.style, children, attrs);
    el.boxes.push(box);
    return box;
}

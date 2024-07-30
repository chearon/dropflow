import { binarySearch } from './util.js';
import { HTMLElement, TextNode } from './dom.js';
import { createStyle, createComputedStyle, EMPTY_STYLE } from './cascade.js';
import { Run, Collapser, createParagraph, createEmptyParagraph, EmptyInlineMetrics, getFontMetrics } from './text.js';
import { Box } from './box.js';
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
        if ((box.style.clear === 'left' || box.style.clear === 'both') && this.fctx) {
            floatBottom = Math.max(floatBottom, this.fctx.getLeftBottom());
        }
        if ((box.style.clear === 'right' || box.style.clear === 'both') && this.fctx) {
            floatBottom = Math.max(floatBottom, this.fctx.getRightBottom());
        }
        if (box.style.clear !== 'none') {
            const hypo = this.margin.collection.clone().add(marginBlockStart).get();
            clearance = Math.max(clearance, floatBottom - (this.cbBlockStart + hypo));
        }
        const adjoinsPrevious = clearance === 0;
        const adjoinsNext = paddingBlockStart === 0 && borderBlockStartWidth === 0;
        if (!box.isBlockLevel())
            throw new Error('Inline encountered');
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
        if (this.fctx)
            this.fctx.boxStart();
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
        if (!box.isBlockLevel())
            throw new Error('Inline encountered');
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
    getLocalVacancyForLine(blockOffset, blockSize, vacancy) {
        let leftInlineSpace = 0;
        let rightInlineSpace = 0;
        if (this.fctx) {
            leftInlineSpace = this.fctx.leftFloats.getOccupiedSpace(blockOffset, blockSize, -this.cbLineLeft);
            rightInlineSpace = this.fctx.rightFloats.getOccupiedSpace(blockOffset, blockSize, -this.cbLineRight);
        }
        vacancy.leftOffset = this.cbLineLeft + leftInlineSpace;
        vacancy.rightOffset = this.cbLineRight + rightInlineSpace;
        vacancy.inlineSize = this.inlineSize - vacancy.leftOffset - vacancy.rightOffset;
        vacancy.blockOffset = blockOffset - this.cbBlockStart;
        vacancy.leftOffset -= this.cbLineLeft;
        vacancy.rightOffset -= this.cbLineRight;
    }
    floatContext() {
        if (!this.fctx)
            this.fctx = new FloatContext(this);
        return this.fctx;
    }
    finalize(box) {
        if (!box.isBfcRoot())
            throw new Error('This is for bfc roots only');
        const blockSize = box.style.getBlockSize(box);
        this.positionBlockContainers();
        if (blockSize === 'auto') {
            let lineboxHeight = 0;
            if (box.isBlockContainerOfInlines()) {
                const blockSize = box.contentArea.blockSizeForWritingMode(box.writingMode);
                lineboxHeight = blockSize;
            }
            const floatBottom = this.fctx?.getBothBottom() ?? -Infinity;
            box.setBlockSize(Math.max(lineboxHeight, this.cbBlockStart, floatBottom));
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
                const blockSize = box.borderArea.blockSizeForWritingMode(box.writingMode);
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
    constructor(blockOffset) {
        this.items = [];
        this.shelfBlockOffset = blockOffset;
        this.shelfTrackIndex = 0;
        this.blockOffsets = [blockOffset];
        this.inlineSizes = [0];
        this.inlineOffsets = [0];
        this.floatCounts = [0];
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
                max = Math.max(max, inlineOffset + this.inlineSizes[i] - this.inlineOffsets[i]);
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
            if (!box.containingBlock)
                throw new Error(`${box.id} has no containing block`);
            const inlineSize = box.containingBlock.inlineSizeForWritingMode(box.containingBlock.writingMode);
            const size = box.borderArea.inlineSizeForWritingMode(box.containingBlock.writingMode);
            box.setInlinePosition(cbOffset - cbLineSide + inlineSize - marginOffset - size);
        }
        for (let track = startTrack; track < endTrack; track += 1) {
            if (this.floatCounts[track] === 0) {
                this.inlineOffsets[track] = -cbOffset;
                this.inlineSizes[track] = marginOffset + box.borderArea.width + marginEnd;
            }
            else {
                this.inlineSizes[track] = this.inlineOffsets[track] + cbOffset + marginOffset + box.borderArea.width + marginEnd;
            }
            this.floatCounts[track] += 1;
        }
        this.items.push(box);
    }
}
export class IfcVacancy {
    constructor(leftOffset, rightOffset, blockOffset, inlineSize, leftFloatCount, rightFloatCount) {
        this.leftOffset = leftOffset;
        this.rightOffset = rightOffset;
        this.blockOffset = blockOffset;
        this.inlineSize = inlineSize;
        this.leftFloatCount = leftFloatCount;
        this.rightFloatCount = rightFloatCount;
    }
}
;
export class FloatContext {
    constructor(bfc) {
        this.bfc = bfc;
        this.leftFloats = new FloatSide(bfc.cbBlockStart);
        this.rightFloats = new FloatSide(bfc.cbBlockStart);
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
    getVacancyForBox(box) {
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
            const vacancy = this.getVacancyForBox(box);
            const margins = box.getMarginsAutoIsZero();
            const inlineMargin = margins.lineLeft + margins.lineRight;
            if (box.borderArea.width + inlineMargin <= vacancy.inlineSize - lineWidth ||
                lineIsEmpty && vacancy.leftFloatCount === 0 && vacancy.rightFloatCount === 0) {
                box.setBlockPosition(side.shelfBlockOffset + margins.blockStart - this.bfc.cbBlockStart);
                side.placeFloat(box, vacancy, this.bfc.cbLineLeft, this.bfc.cbLineRight);
            }
            else {
                if (box.borderArea.width + inlineMargin > vacancy.inlineSize) {
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
export class BlockContainerArea {
    constructor(blockContainer, x, y, w, h) {
        this.parent = null;
        this.blockContainer = blockContainer;
        this.blockStart = y || 0;
        this.blockSize = h || 0;
        this.lineLeft = x || 0;
        this.inlineSize = w || 0;
    }
    clone() {
        return new BlockContainerArea(this.blockContainer, this.lineLeft, this.blockStart, this.inlineSize, this.blockSize);
    }
    get writingMode() {
        return this.blockContainer.style.writingMode;
    }
    get direction() {
        return this.blockContainer.style.direction;
    }
    get x() {
        return this.lineLeft;
    }
    get y() {
        return this.blockStart;
    }
    get width() {
        return this.inlineSize;
    }
    get height() {
        return this.blockSize;
    }
    setParent(p) {
        this.parent = p;
    }
    blockSizeForWritingMode(writingMode) {
        if (!this.blockContainer)
            return this.blockSize; // root area
        if ((this.blockContainer.writingMode === 'horizontal-tb') !== (writingMode === 'horizontal-tb')) {
            return this.inlineSize;
        }
        else {
            return this.blockSize;
        }
    }
    inlineSizeForWritingMode(writingMode) {
        if (!this.blockContainer)
            return this.inlineSize; // root area
        if ((this.blockContainer.writingMode === 'horizontal-tb') !== (writingMode === 'horizontal-tb')) {
            return this.blockSize;
        }
        else {
            return this.inlineSize;
        }
    }
    absolutify() {
        let x, y, width, height;
        if (!this.parent) {
            throw new Error(`Cannot absolutify area for ${this.blockContainer.id}, parent was never set`);
        }
        if (this.parent.writingMode === 'vertical-lr') {
            x = this.blockStart;
            y = this.lineLeft;
            width = this.blockSize;
            height = this.inlineSize;
        }
        else if (this.parent.writingMode === 'vertical-rl') {
            x = this.parent.width - this.blockStart - this.blockSize;
            y = this.lineLeft;
            width = this.blockSize;
            height = this.inlineSize;
        }
        else if (this.parent.writingMode === 'horizontal-tb') {
            x = this.lineLeft;
            y = this.blockStart;
            width = this.inlineSize;
            height = this.blockSize;
        }
        else {
            return;
        }
        this.lineLeft = this.parent.x + x;
        this.blockStart = this.parent.y + y;
        this.inlineSize = width;
        this.blockSize = height;
    }
    repr(indent = 0) {
        const { width: w, height: h, x, y } = this;
        return '  '.repeat(indent) + `⚃ Area ${this.blockContainer.id}: ${w}⨯${h} @${x},${y}`;
    }
}
export class BlockContainer extends Box {
    constructor(style, children, attrs) {
        super(style, children, attrs);
        this.containingBlock = null;
        this.children = children;
        const area = new BlockContainerArea(this);
        this.borderArea = area;
        this.paddingArea = area;
        this.contentArea = area;
    }
    fillAreas() {
        if (this.style.hasBorder()) {
            const borderBlockStartWidth = this.style.getBorderBlockStartWidth(this);
            const borderLineLeftWidth = this.style.getBorderLineLeftWidth(this);
            this.contentArea = this.paddingArea = this.borderArea.clone();
            this.paddingArea.blockStart = borderBlockStartWidth;
            this.paddingArea.lineLeft = borderLineLeftWidth;
            this.paddingArea.setParent(this.borderArea);
        }
        if (this.style.hasPadding()) {
            const paddingBlockStart = this.style.getPaddingBlockStart(this);
            const paddingLineLeft = this.style.getPaddingLineLeft(this);
            this.contentArea = this.paddingArea.clone();
            this.contentArea.blockStart = paddingBlockStart;
            this.contentArea.lineLeft = paddingLineLeft;
            this.contentArea.setParent(this.paddingArea);
        }
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
    setBlockPosition(position) {
        if (!this.containingBlock) {
            throw new Error(`Inline layout called too early on ${this.id}: no containing block`);
        }
        this.borderArea.blockStart = position;
    }
    setBlockSize(size) {
        if (!this.containingBlock) {
            throw new Error(`Inline layout called too early on ${this.id}: no containing block`);
        }
        this.contentArea.blockSize = size;
        if (this.contentArea !== this.paddingArea) {
            const paddingBlockStart = this.style.getPaddingBlockStart(this);
            const paddingBlockEnd = this.style.getPaddingBlockEnd(this);
            const paddingSize = size + paddingBlockStart + paddingBlockEnd;
            this.paddingArea.blockSize = paddingSize;
        }
        if (this.paddingArea !== this.borderArea) {
            const borderBlockStartWidth = this.style.getBorderBlockStartWidth(this);
            const borderBlockEndWidth = this.style.getBorderBlockEndWidth(this);
            const borderSize = this.paddingArea.blockSize + borderBlockStartWidth + borderBlockEndWidth;
            this.borderArea.blockSize = borderSize;
        }
    }
    setInlinePosition(lineLeft) {
        if (!this.containingBlock) {
            throw new Error(`Inline layout called too early on ${this.id}: no containing block`);
        }
        this.borderArea.lineLeft = lineLeft;
    }
    setInlineOuterSize(size) {
        if (!this.containingBlock) {
            throw new Error(`Inline layout called too early on ${this.id}: no containing block`);
        }
        this.borderArea.inlineSize = size;
        if (this.paddingArea !== this.borderArea) {
            const borderLineLeftWidth = this.style.getBorderLineLeftWidth(this);
            const borderLineRightWidth = this.style.getBorderLineRightWidth(this);
            const paddingSize = size - borderLineLeftWidth - borderLineRightWidth;
            this.paddingArea.inlineSize = paddingSize;
        }
        if (this.contentArea !== this.paddingArea) {
            const paddingLineLeft = this.style.getPaddingLineLeft(this);
            const paddingLineRight = this.style.getPaddingLineRight(this);
            const contentSize = this.paddingArea.inlineSize - paddingLineLeft - paddingLineRight;
            this.contentArea.inlineSize = contentSize;
        }
    }
    getContainingBlockToContent() {
        if (!this.containingBlock) {
            throw new Error(`Box ${this.id} has no containing block`);
        }
        const inlineSize = this.containingBlock.inlineSizeForWritingMode(this.writingMode);
        const borderBlockStartWidth = this.style.getBorderBlockStartWidth(this);
        const paddingBlockStart = this.style.getPaddingBlockStart(this);
        const bLineLeft = this.borderArea.lineLeft;
        const blockStart = borderBlockStartWidth + paddingBlockStart;
        const cInlineSize = this.contentArea.inlineSizeForWritingMode(this.writingMode);
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
    assignContainingBlocks(ctx) {
        // CSS2.2 10.1
        if (this.isRelativeOrStatic) {
            this.containingBlock = ctx.lastBlockContainerArea;
        }
        else if (this.isAbsolute) {
            this.containingBlock = ctx.lastPositionedArea;
        }
        else {
            throw new Error(`Could not assign a containing block to box ${this.id}`);
        }
        this.fillAreas();
        this.borderArea.setParent(this.containingBlock);
        ctx.lastBlockContainerArea = this.contentArea;
        if (this.isPositioned) {
            ctx.lastPositionedArea = this.paddingArea;
        }
    }
    isBlockContainer() {
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
            child.isIfcInline() ? child.preprocess() : child.preprocess();
        }
    }
    postprocess() {
        this.borderArea.absolutify();
        if (this.paddingArea !== this.borderArea)
            this.paddingArea.absolutify();
        if (this.contentArea !== this.paddingArea)
            this.contentArea.absolutify();
        for (const c of this.children) {
            c.postprocess();
        }
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
    if (!box.containingBlock) {
        throw new Error(`Inline layout called too early on ${box.id}: no containing block`);
    }
    if (!box.isBlockLevel()) {
        throw new Error('doInlineBoxModelForBlockBox called with inline or float');
    }
    const cInlineSize = box.containingBlock.inlineSizeForWritingMode(box.writingMode);
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
            if (box.direction === 'ltr') {
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
    if (!box.isBlockLevel()) {
        throw new Error('doBlockBoxModelForBlockBox called with inline');
    }
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
    if (!box.isBlockLevel()) {
        throw new Error(`BlockContainer ${box.id} is not block-level`);
    }
    const bfc = ctx.bfc;
    const cctx = { ...ctx };
    preBlockContainer(box, cctx);
    doInlineBoxModelForBlockBox(box);
    doBlockBoxModelForBlockBox(box);
    if (box.isBfcRoot()) {
        const inlineSize = box.contentArea.inlineSizeForWritingMode(box.writingMode);
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
        if (box.loggingEnabled() && cctx.bfc.fctx) {
            console.log('Left floats');
            console.log(cctx.bfc.fctx.leftFloats.repr());
            console.log('Right floats');
            console.log(cctx.bfc.fctx.rightFloats.repr());
            console.log();
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
export function layoutContribution(box, ctx, mode) {
    const cctx = { ...ctx };
    let intrinsicSize = 0;
    cctx.mode = mode;
    preBlockContainer(box, cctx);
    const definiteSize = box.getDefiniteInlineSize();
    if (definiteSize !== undefined)
        return definiteSize;
    if (box.isBfcRoot())
        cctx.bfc = new BlockFormattingContext(mode === 'min-content' ? 0 : Infinity);
    if (box.isBlockContainerOfInlines()) {
        const [ifc] = box.children;
        box.doTextLayout(cctx);
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
export function staticLayoutContribution(box) {
    let intrinsicSize = 0;
    const definiteSize = box.getDefiniteInlineSize();
    if (definiteSize !== undefined)
        return definiteSize;
    if (box.isBlockContainerOfInlines()) {
        const [ifc] = box.children;
        for (const line of ifc.paragraph.lineboxes) {
            intrinsicSize = Math.max(intrinsicSize, line.width);
        }
        // TODO: floats
    }
    else if (box.isBlockContainerOfBlockContainers()) {
        for (const child of box.children) {
            intrinsicSize = Math.max(intrinsicSize, staticLayoutContribution(child));
        }
    }
    else {
        throw new Error(`Unknown box type: ${box.id}`);
    }
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
    if (!box.isFloat()) {
        throw new Error(`Tried to layout non-float box ${box.id} with layoutFloatBox`);
    }
    if (!box.isBfcRoot()) {
        throw new Error(`Box ${box.id} is float but not BFC root, that should be impossible`);
    }
    const cctx = { ...ctx };
    preBlockContainer(box, cctx);
    if (!box.containingBlock) {
        throw new Error(`Inline layout called too early on ${box.id}: no containing block`);
    }
    let inlineSize = box.getDefiniteInlineSize();
    if (inlineSize === undefined) {
        if (ctx.mode === 'min-content') {
            inlineSize = layoutContribution(box, ctx, 'min-content');
        }
        else if (ctx.mode === 'max-content') {
            inlineSize = layoutContribution(box, ctx, 'max-content');
        }
        else {
            const minContent = layoutContribution(box, ctx, 'min-content');
            const maxContent = layoutContribution(box, ctx, 'max-content');
            const availableSpace = box.containingBlock.inlineSizeForWritingMode(box.writingMode);
            inlineSize = Math.max(minContent, Math.min(maxContent, availableSpace));
        }
    }
    doInlineBoxModelForFloatBox(box, inlineSize);
    doBlockBoxModelForBlockBox(box);
    const cInlineSize = box.contentArea.inlineSizeForWritingMode(box.writingMode);
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
// TODO breaks aren't really boxes. If a <br> was positioned or floated, it'd
// generate BlockContainer. I wonder if I should create a RenderItem class
// (Box extends RenderItem)
export class Break extends Box {
    constructor() {
        super(...arguments);
        this.className = 'break';
    }
    isBreak() {
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
    constructor(style, children, attrs) {
        super(style, children, attrs);
        this.children = children;
        this.nshaped = 0;
        this.metrics = EmptyInlineMetrics;
        // TODO: these get set in ifc.prepare() because it needs to happen after
        // whitespace collapsing. Instead I should do whitespace collapsing on
        // shaped items, that way these can be set at parse time and not be affected
        this.start = 0;
        this.end = 0;
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
    hasLineLeftGap(ifc) {
        return this.style.hasLineLeftGap(ifc);
    }
    hasLineRightGap(ifc) {
        return this.style.hasLineRightGap(ifc);
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
const NON_ASCII_MASK = 0b1111_1111_1000_0000;
export class IfcInline extends Inline {
    constructor(style, children, attrs) {
        super(style, children, Box.ATTRS.isAnonymous | attrs);
        this.children = children;
        this.text = '';
        this.analysis = 0;
        this.prepare();
        this.paragraph = createEmptyParagraph(this);
        this.containingBlock = null;
    }
    static { this.ANALYSIS_HAS_TEXT = 0b00000001; }
    static { this.ANALYSIS_WRAPS = 0b00000010; }
    static { this.ANALYSIS_WS_COLLAPSES = 0b00000100; }
    static { this.ANALYSIS_HAS_INLINES = 0b00001000; }
    static { this.ANALYSIS_HAS_BREAKS = 0b00010000; }
    static { this.ANALYSIS_IS_COMPLEX_TEXT = 0b00100000; }
    static { this.ANALYSIS_HAS_SOFT_HYPHEN = 0b01000000; }
    static { this.ANALYSIS_HAS_FLOATS = 0b10000000; }
    isIfcInline() {
        return true;
    }
    get writingMode() {
        if (!this.containingBlock) {
            throw new Error(`Cannot access writing mode of ${this.id}: containing block never set`);
        }
        return this.containingBlock.writingMode;
    }
    loggingEnabled() {
        return Boolean(this.attrs & Box.ATTRS.enableLogging);
    }
    // TODO this would be unnecessary (both removing collapsed runs but also
    // setting start and end) if I did whitespace collapsing on shaped items
    postprepare() {
        const parents = [];
        const END_PARENT = Symbol('end parent');
        const stack = [this];
        let cursor = 0;
        while (stack.length) {
            const item = stack.pop();
            if (item === END_PARENT) {
                parents.pop().end = cursor;
            }
            else if (item.isBreak() || item.isBlockContainer()) {
                // skip
            }
            else if (item.isRun()) {
                cursor = item.end + 1;
            }
            else {
                parents.push(item);
                item.start = cursor;
                for (let i = 0; i < item.children.length; ++i) {
                    const child = item.children[i];
                    if (child.isRun() && child.end < child.start) {
                        item.children.splice(i, 1);
                        i -= 1;
                    }
                }
                stack.push(END_PARENT);
                for (let i = item.children.length - 1; i >= 0; --i) {
                    stack.push(item.children[i]);
                }
            }
        }
    }
    prepare() {
        const stack = this.children.slice();
        const runs = [];
        let i = 0;
        if (!isNowrap(this.style.whiteSpace)) {
            this.analysis |= IfcInline.ANALYSIS_WRAPS;
        }
        if (!isWsPreserved(this.style.whiteSpace)) {
            this.analysis |= IfcInline.ANALYSIS_WS_COLLAPSES;
        }
        // CSS Text Module Level 3, Appendix A, steps 1-4
        // Step 1
        while (stack.length) {
            const box = stack.shift();
            if (box.isRun()) {
                box.setRange(i, i + box.text.length - 1);
                i += box.text.length;
                this.text += box.text;
                runs.push(box);
                if (!box.wsCollapsible || !box.allCollapsible()) {
                    this.analysis |= IfcInline.ANALYSIS_HAS_TEXT;
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
                stack.unshift(...box.children);
            }
            else if (box.isBreak()) {
                this.analysis |= IfcInline.ANALYSIS_HAS_BREAKS;
                // ok
            }
            else if (box.isFloat()) {
                this.analysis |= IfcInline.ANALYSIS_HAS_FLOATS;
            }
            else {
                // TODO: this is e.g. a block container. store it somewhere for future
                // layout here
                // TODO: and remember to reflect the results in canCollapseThrough
                throw new Error(`Only inlines and runs in IFCs for now (box ${this.id})`);
            }
        }
        if (this.collapses()) {
            const collapser = new Collapser(this.text, runs);
            collapser.collapse();
            this.text = collapser.buf;
        }
        for (let i = 0; i < this.text.length; i++) {
            if (this.text.charCodeAt(i) & NON_ASCII_MASK) {
                this.analysis |= IfcInline.ANALYSIS_IS_COMPLEX_TEXT;
            }
            if (this.text.charCodeAt(i) === 0xad) {
                this.analysis |= IfcInline.ANALYSIS_HAS_SOFT_HYPHEN;
            }
        }
        if (this.hasBreaks() || this.hasInlines() || this.children.length > 1) {
            this.postprepare();
        }
        // TODO step 2
        // TODO step 3
        // TODO step 4
    }
    *itemizeInlines() {
        const END_CHILDREN = Symbol('end of children');
        const stack = this.children.slice().reverse();
        const parents = [this];
        const direction = this.style.direction;
        let currentStyle = this.style;
        let ci = 0;
        // Shaping boundaries can overlap when they happen because of padding. We can
        // pretend 0 has been emitted since runs at 0 which appear to have different
        // style than `currentStyle` are just differing from the IFC's style, which
        // is the initial `currentStyle` so that yields always have a concrete style.
        let lastYielded = 0;
        while (stack.length) {
            const item = stack.pop();
            const parent = parents[parents.length - 1];
            if (item === END_CHILDREN) {
                if (direction === 'ltr' ? parent.hasLineRightGap(this) : parent.hasLineLeftGap(this)) {
                    if (ci !== lastYielded) {
                        yield { i: ci, style: currentStyle };
                        lastYielded = ci;
                    }
                }
                if (parent.style.verticalAlign !== 'baseline') {
                    if (ci !== lastYielded)
                        yield { i: ci, style: currentStyle };
                    lastYielded = ci;
                }
                parents.pop();
            }
            else if (item.isRun()) {
                if (currentStyle.fontSize !== item.style.fontSize ||
                    currentStyle.fontVariant !== item.style.fontVariant ||
                    currentStyle.fontWeight !== item.style.fontWeight ||
                    currentStyle.fontStyle !== item.style.fontStyle ||
                    currentStyle.fontFamily.join(',') !== item.style.fontFamily.join(',')) {
                    if (ci !== lastYielded)
                        yield { i: ci, style: currentStyle };
                    currentStyle = item.style;
                    lastYielded = ci;
                }
                ci += item.text.length;
            }
            else if (item.isInline()) {
                parents.push(item);
                if (item.style.verticalAlign !== 'baseline') {
                    if (ci !== lastYielded)
                        yield { i: ci, style: currentStyle };
                    lastYielded = ci;
                }
                if (direction === 'ltr' ? item.hasLineLeftGap(this) : item.hasLineRightGap(this)) {
                    if (ci !== lastYielded) {
                        yield { i: ci, style: currentStyle };
                        lastYielded = ci;
                    }
                }
                stack.push(END_CHILDREN);
                for (let i = item.children.length - 1; i >= 0; --i) {
                    stack.push(item.children[i]);
                }
            }
            else if (item.isBreak()) {
                if (ci !== lastYielded) {
                    yield { i: ci, style: currentStyle };
                    lastYielded = ci;
                }
            }
            else if (item.isFloat()) {
                // OK
            }
            else {
                throw new Error('Inline block not supported yet');
            }
        }
        if (ci !== lastYielded) {
            yield { i: ci, style: currentStyle };
        }
    }
    preprocess() {
        super.preprocess();
        if (this.hasText() || this.hasFloats()) {
            this.paragraph.destroy();
            this.paragraph = createParagraph(this);
            this.paragraph.shape();
        }
    }
    postprocess() {
        super.postprocess();
        this.paragraph.destroy();
    }
    doTextLayout(ctx) {
        if (this.hasText() || this.hasFloats()) {
            this.paragraph.createLineboxes(ctx);
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
    assignContainingBlocks(ctx) {
        this.containingBlock = ctx.lastBlockContainerArea;
    }
}
// TODO emit inline-block
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
                else if (item.isRun() || item.isBreak() || item.isFloat()) {
                    shouldFlushBreakop = minlevel !== level;
                    minlevel = level;
                    if (item.isRun()) {
                        buffered.push({ state: 'text', item });
                    }
                    else if (item.isBreak()) {
                        buffered.push({ state: 'break' });
                    }
                    else {
                        shouldFlushBreakop = true;
                        buffered.push({ state: 'float', item });
                    }
                    break;
                }
                else {
                    throw new Error('Inline block not supported yet');
                }
            }
        }
        if (buffered.length) {
            if (bk > 0) {
                bk -= 1;
            }
            else if (shouldFlushBreakop) {
                shouldFlushBreakop = false;
                return { value: { state: 'breakop' }, done: false };
            }
            return { value: buffered.shift(), done: false };
        }
        return { done: true };
    }
    return { next };
}
// TODO emit inline-block
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
function mapTree(el, stack, level) {
    let children = [], bail = false, attrs = 0;
    if (el.style.display.outer !== 'inline' && el.style.display.outer !== 'none') {
        throw Error('Inlines only');
    }
    if (!stack[level])
        stack[level] = 0;
    let box;
    if (el.style.display.inner === 'flow') {
        while (!bail && stack[level] < el.children.length) {
            let child, childEl = el.children[stack[level]];
            if (childEl instanceof HTMLElement) {
                if (childEl.tagName === 'br') {
                    child = new Break(createStyle(childEl.style), [], 0);
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
                else if (childEl.children) {
                    [bail, child] = mapTree(childEl, stack, level + 1);
                }
            }
            else if (childEl instanceof TextNode) {
                child = new Run(childEl.text, createStyle(childEl.style));
            }
            if (child != null)
                children.push(child);
            if (!bail)
                stack[level]++;
        }
        if (!bail)
            stack.pop();
        if ('x-overflow-log' in el.attrs)
            attrs |= Box.ATTRS.enableLogging;
        box = new Inline(createStyle(el.style), children, attrs);
        el.boxes.push(box);
    }
    else if (el.style.display.inner == 'flow-root') {
        box = generateBlockContainer(el);
    }
    return [bail, box];
}
// Generates an inline box for the element. Also generates blocks if the element
// has any descendents which generate them. These are not included in the inline.
function generateInlineBox(el) {
    const path = [], boxes = [];
    let inline, more = true;
    if (el.style.display.outer !== 'inline')
        throw Error('Inlines only');
    while (more) {
        let childEl;
        [more, inline] = mapTree(el, path, 0);
        if (inline)
            boxes.push(inline);
        while ((childEl = el.getEl(path)) instanceof HTMLElement && childEl.style.display.outer === 'block') {
            boxes.push(generateBlockContainer(childEl, el));
            ++path[path.length - 1];
        }
    }
    return boxes;
}
function isInlineLevel(box) {
    return box.isInline() || box.isRun() || box.isBreak()
        || box.isBlockContainer() && (box.isInlineLevel() || box.isFloat());
}
// Wraps consecutive inlines and runs in block-level block containers. The
// returned list is guaranteed to be a list of only blocks. This obeys CSS21
// section 9.2.1.1
function wrapInBlockContainers(boxes, parentEl) {
    const blocks = [];
    for (let i = 0; i < boxes.length; ++i) {
        const inlines = [];
        for (let box; i < boxes.length && isInlineLevel(box = boxes[i]); i++)
            inlines.push(box);
        if (inlines.length > 0) {
            const anonComputedStyle = createComputedStyle(parentEl.style, EMPTY_STYLE);
            const anonStyle = createStyle(anonComputedStyle);
            let attrs = Box.ATTRS.isAnonymous;
            if ('x-overflow-log' in parentEl.attrs)
                attrs |= Box.ATTRS.enableLogging;
            const ifc = new IfcInline(anonStyle, inlines, attrs);
            blocks.push(new BlockContainer(anonStyle, [ifc], attrs));
        }
        if (i < boxes.length) {
            const block = boxes[i];
            if (!block.isBlockContainer())
                throw new Error('Unknown box type encountered');
            blocks.push(block);
        }
    }
    return blocks;
}
// Generates a block container for the element
export function generateBlockContainer(el, parentEl) {
    const enableLogging = 'x-overflow-log' in el.attrs;
    let boxes = [], hasInline = false, hasBlock = false, attrs = 0;
    // TODO: it's time to start moving some of this type of logic to HTMLElement.
    // For example add the methods establishesBfc, generatesBlockContainerOfBlocks,
    // generatesBreak, etc
    if (el.style.float !== 'none' ||
        el.style.display.inner === 'flow-root' ||
        parentEl && writingModeInlineAxis(el) !== writingModeInlineAxis(parentEl)) {
        attrs |= Box.ATTRS.isBfcRoot;
    }
    else if (el.style.display.inner !== 'flow') {
        throw Error('Only flow layout supported');
    }
    if (enableLogging)
        attrs |= Box.ATTRS.enableLogging;
    for (const child of el.children) {
        if (child instanceof HTMLElement) {
            if (child.tagName === 'br') {
                boxes.push(new Break(createStyle(child.style), [], 0));
                hasInline = true;
            }
            else if (child.style.float !== 'none') {
                boxes.push(generateBlockContainer(child, el));
                hasInline = true;
            }
            else if (child.style.display.outer === 'block') {
                boxes.push(generateBlockContainer(child, el));
                hasBlock = true;
            }
            else if (child.style.display.outer === 'inline') {
                hasInline = true;
                const blocks = generateInlineBox(child);
                hasBlock = hasBlock || blocks.length > 1;
                boxes = boxes.concat(blocks);
            }
        }
        else { // TextNode
            const computed = createComputedStyle(el.style, EMPTY_STYLE);
            hasInline = true;
            boxes.push(new Run(child.text, createStyle(computed)));
        }
    }
    if (el.style.float !== 'none') {
        attrs |= Box.ATTRS.isFloat;
    }
    else if (el.style.display.outer === 'inline') {
        attrs |= Box.ATTRS.isInline;
    }
    const style = createStyle(el.style);
    if (hasInline && !hasBlock) {
        const anonComputedStyle = createComputedStyle(el.style, EMPTY_STYLE);
        const anonStyle = createStyle(anonComputedStyle);
        const ifcAttrs = Box.ATTRS.isAnonymous | (enableLogging ? Box.ATTRS.enableLogging : 0);
        const inline = new IfcInline(anonStyle, boxes, ifcAttrs);
        const box = new BlockContainer(style, [inline], attrs);
        el.boxes.push(box);
        return box;
    }
    if (hasInline && hasBlock)
        boxes = wrapInBlockContainers(boxes, el);
    const box = new BlockContainer(style, boxes, attrs);
    el.boxes.push(box);
    return box;
}

import { ReplacedBox, Inline, BlockContainerOfInlines } from "./layout-flow.js";
import { Image } from "./layout-image.js";
import { G_CL, G_AX, G_SZ } from "./text-harfbuzz.js";
import { ShapedItem, isSpaceOrTabOrNewline } from "./layout-text.js";
import { Box, Layout } from "./layout-box.js";
import { binarySearchOf } from "./util.js";
function getTextOffsetsForUncollapsedGlyphs(item) {
    const s = item.block.text;
    const glyphs = item.glyphs;
    let glyphStart = 0;
    let glyphEnd = glyphs.length - G_SZ;
    while (glyphStart < glyphs.length &&
        glyphs[glyphStart + G_AX] === 0 &&
        isSpaceOrTabOrNewline(s[glyphs[glyphStart + G_CL]]))
        glyphStart += G_SZ;
    while (glyphEnd >= 0 &&
        glyphs[glyphEnd + G_AX] === 0 &&
        isSpaceOrTabOrNewline(s[glyphs[glyphEnd + G_CL]]))
        glyphEnd -= G_SZ;
    if (glyphStart in glyphs && glyphEnd in glyphs) {
        let textStart, textEnd;
        if (item.attrs.level & 1) {
            textStart = glyphs[glyphEnd + G_CL];
            if (glyphStart - G_SZ >= 0) {
                textEnd = glyphs[glyphStart - G_SZ + G_CL];
            }
            else {
                textEnd = item.end();
            }
        }
        else {
            textStart = glyphs[glyphStart + G_CL];
            if (glyphEnd + G_SZ < glyphs.length) {
                textEnd = glyphs[glyphEnd + G_SZ + G_CL];
            }
            else {
                textEnd = item.end();
            }
        }
        return { textStart, textEnd };
    }
    else {
        return { textStart: 0, textEnd: 0 };
    }
}
function drawText(item, run, textStart, textEnd, b) {
    const style = item.attrs.style;
    // Split the colors into spans so that colored diacritics can work.
    // Sadly this seems to only work in Firefox and only when the font doesn't do
    // any normalization, so I could probably stop trying to support it
    // https://github.com/w3c/csswg-drafts/issues/699
    const collapsed = getTextOffsetsForUncollapsedGlyphs(item);
    textStart = Math.max(textStart, collapsed.textStart);
    textEnd = Math.min(textEnd, collapsed.textEnd);
    let tx = item.x;
    if (textStart < textEnd) {
        const toPx = 1 / item.face.hbface.upem * item.attrs.style.fontSize;
        let axToStart = 0;
        // Move tx to the x offset for textStart
        if (item.attrs.level & 1) {
            for (let i = 0; i < item.glyphs.length; i += G_SZ) {
                if (item.glyphs[i + G_CL] < textEnd)
                    break;
                axToStart += item.glyphs[i + G_AX];
            }
        }
        else {
            for (let i = 0; i < item.glyphs.length; i += G_SZ) {
                if (item.glyphs[i + G_CL] >= textStart)
                    break;
                axToStart += item.glyphs[i + G_AX];
            }
        }
        tx += axToStart * toPx;
        // TODO: should really have isStartColorBoundary, isEndColorBoundary
        const isColorBoundary = textStart !== item.offset && textStart === run.textStart
            || textEnd !== item.end() && textEnd === run.textEnd;
        b.fillColor = run.style.color;
        b.fontSize = style.fontSize;
        b.font = item.face;
        b.direction = item.attrs.level & 1 ? 'rtl' : 'ltr';
        b.text(tx, item.y, item, textStart, textEnd, isColorBoundary);
    }
}
/**
 * Paints the background and borders
 */
function paintBlockBackground(box, b, isRoot = false) {
    const style = box.style;
    const borderArea = box.getBorderArea();
    if (!isRoot) {
        const paddingArea = box.getPaddingArea();
        const contentArea = box.getContentArea();
        const { backgroundColor, backgroundClip } = style;
        const area = backgroundClip === 'border-box' ? borderArea :
            backgroundClip === 'padding-box' ? paddingArea :
                contentArea;
        if (backgroundColor.a > 0) {
            b.fillColor = backgroundColor;
            b.rect(area.x, area.y, area.width, area.height);
        }
    }
    const work = [
        ['top', style.borderTopWidth, style.borderTopColor],
        ['right', style.borderRightWidth, style.borderRightColor],
        ['bottom', style.borderBottomWidth, style.borderBottomColor],
        ['left', style.borderLeftWidth, style.borderLeftColor],
    ];
    for (const [side, lineWidth, color] of work) {
        if (lineWidth === 0 || color.a === 0)
            continue;
        const length = side === 'top' || side === 'bottom' ? borderArea.width : borderArea.height;
        let x = side === 'right' ? borderArea.x + borderArea.width - lineWidth : borderArea.x;
        let y = side === 'bottom' ? borderArea.y + borderArea.height - lineWidth : borderArea.y;
        b.strokeColor = color;
        b.lineWidth = lineWidth;
        x += side === 'left' || side === 'right' ? lineWidth / 2 : 0;
        y += side === 'top' || side === 'bottom' ? lineWidth / 2 : 0;
        b.edge(x, y, length, side);
    }
}
function paintBackgroundDescendents(layout, root, b) {
    const parents = [];
    for (let i = root.treeStart; i <= root.treeFinal; i++) {
        const item = layout.tree[i];
        if (item.isFormattingBox() && !item.isLayerRoot()) {
            paintBlockBackground(item, b);
        }
        if (item.isBlockContainerOfBlocks() &&
            item.hasBackgroundInLayerRoot() &&
            (!item.isLayerRoot() || item === root)) {
            parents.push(item);
            if (item.isFormattingBox() && item.style.overflow === 'hidden' && item !== root) {
                const { x, y, width, height } = item.getPaddingArea();
                b.pushClip(x, y, width, height);
            }
        }
        else if (item.isBox()) {
            i = item.treeFinal;
        }
        while (parents.length && parents[parents.length - 1].treeFinal === i) {
            const box = parents.pop();
            if (box.isFormattingBox() && box.style.overflow === 'hidden' && box !== root) {
                b.popClip();
            }
        }
    }
}
// TODO: since vertical padding is added above, hardware pixel snapping has
// to happen here. But block containers are snapped during layout, so it'd
// be more consistent to do it there. To be more consistent with the specs,
// and hopefully clean up the code, I should start making "continuations"
// (Firefox) of inlines, or create fragments out of them (Chrome)
function snap(ox, oy, ow, oh) {
    const x = Math.round(ox);
    const y = Math.round(oy);
    const width = Math.round(ox + ow) - x;
    const height = Math.round(oy + oh) - y;
    return { x, y, width, height };
}
function paintInlineBackground(layout, fragment, block, b) {
    const direction = block.style.direction;
    const inline = layout.tree[fragment.treeIndex];
    if (!inline.isInline())
        throw new Error('Assertion failed');
    const bgc = inline.style.backgroundColor;
    const clip = inline.style.backgroundClip;
    const { borderTopColor, borderRightColor, borderBottomColor, borderLeftColor } = inline.style;
    const { a: ta } = borderTopColor;
    const { a: ra } = borderRightColor;
    const { a: ba } = borderBottomColor;
    const { a: la } = borderLeftColor;
    if (bgc.a === 0 && ta === 0 && ra === 0 && ba === 0 && la === 0)
        return;
    const { left: start, right: end, blockOffset } = fragment;
    const naturalStart = fragment.textStart === inline.textStart;
    const naturalEnd = fragment.textEnd === inline.textEnd;
    const { ascender, descender } = inline.style.metrics;
    const containingBlock = inline.getContainingBlock();
    const paddingTop = inline.style.getPaddingBlockStart(containingBlock);
    const paddingRight = inline.style.getPaddingLineRight(containingBlock);
    const paddingBottom = inline.style.getPaddingBlockEnd(containingBlock);
    const paddingLeft = inline.style.getPaddingLineLeft(containingBlock);
    const paintLeft = naturalStart && direction === 'ltr' || naturalEnd && direction === 'rtl';
    const paintRight = naturalEnd && direction === 'ltr' || naturalStart && direction === 'rtl';
    const borderTopWidth = inline.style.getBorderBlockStartWidth(containingBlock);
    let borderRightWidth = inline.style.getBorderLineRightWidth(containingBlock);
    const borderBottomWidth = inline.style.getBorderBlockEndWidth(containingBlock);
    let borderLeftWidth = inline.style.getBorderLineLeftWidth(containingBlock);
    if (!paintLeft)
        borderLeftWidth = 0;
    if (!paintRight)
        borderRightWidth = 0;
    if (start !== end && bgc.a > 0) {
        let extraTop = 0;
        let extraBottom = 0;
        if (clip !== 'content-box') {
            extraTop += inline.style.getPaddingBlockStart(containingBlock);
            extraBottom += inline.style.getPaddingBlockEnd(containingBlock);
        }
        if (clip === 'border-box') {
            extraTop += borderTopWidth;
            extraBottom += borderBottomWidth;
        }
        b.fillColor = bgc;
        const { x, y, width, height } = snap(Math.min(start, end), blockOffset - ascender - extraTop, Math.abs(start - end), ascender + descender + extraTop + extraBottom);
        b.rect(x, y, width, height);
    }
    if (start !== end && (ta > 0 || ra > 0 || ba > 0 || la > 0)) {
        let extraLeft = 0;
        let extraRight = 0;
        if (paintLeft && clip === 'content-box')
            extraLeft += paddingLeft;
        if (paintLeft && clip !== 'border-box')
            extraLeft += borderLeftWidth;
        if (paintRight && clip === 'content-box')
            extraRight += paddingRight;
        if (paintRight && clip !== 'border-box')
            extraRight += borderRightWidth;
        const work = [
            ['top', borderTopWidth, borderTopColor],
            ['right', borderRightWidth, borderRightColor],
            ['bottom', borderBottomWidth, borderBottomColor],
            ['left', borderLeftWidth, borderLeftColor]
        ];
        // TODO there's a bug here: try
        // <span style="background-color:red; border-left: 2px solid yellow; border-top: 4px solid maroon;">red</span>
        for (const [side, lineWidth, color] of work) {
            if (lineWidth === 0)
                continue;
            const rect = snap(Math.min(start, end) - extraLeft, blockOffset - ascender - paddingTop - borderTopWidth, Math.abs(start - end) + extraLeft + extraRight, borderTopWidth + paddingTop + ascender + descender + paddingBottom + borderBottomWidth);
            const length = side === 'left' || side === 'right' ? rect.height : rect.width;
            let x = side === 'right' ? rect.x + rect.width : rect.x;
            let y = side === 'bottom' ? rect.y + rect.height : rect.y;
            x += side === 'left' ? lineWidth / 2 : side === 'right' ? -lineWidth / 2 : 0;
            y += side === 'top' ? lineWidth / 2 : side === 'bottom' ? -lineWidth / 2 : 0;
            b.lineWidth = lineWidth;
            b.strokeColor = color;
            b.edge(x, y, length, side);
        }
    }
}
function paintInlineDecoration(layout, decoration, fragStack, item, textStart, textEnd, b) {
    const decoratingBox = layout.tree[decoration.decoratingTreeIndex];
    const paintingBox = layout.tree[decoration.paintingTreeIndex];
    const size = Math.round(paintingBox.style.metrics.underlineSize);
    const state = item.createMeasureState();
    const startOffset = item.measure(textStart, 1, state).advance;
    const width = item.measure(textEnd, 1, state).advance;
    if (width === 0)
        return;
    const endOffset = item.measure(item.end(), 1, state).advance;
    const x = item.x + (item.attrs.level & 1 ? endOffset : startOffset);
    const fragment = fragStack.findLast(f => f.treeIndex === decoration.paintingTreeIndex);
    if (!fragment)
        throw new Error('Missing fragment!');
    let blockOffset = fragment.blockOffset;
    if (decoratingBox.style.textDecorationLine === 'underline') {
        blockOffset -= Math.floor(paintingBox.style.metrics.underlineOffset);
    }
    else if (decoratingBox.style.textDecorationLine === 'overline') {
        blockOffset -= Math.floor(paintingBox.style.metrics.ascender);
    }
    else {
        blockOffset -= Math.floor(paintingBox.style.metrics.strikeoutOffset);
    }
    b.lineWidth = size;
    b.strokeColor = decoratingBox.style.textDecorationColor;
    const rect = snap(x, blockOffset, width, 0);
    // TODO vertical text
    b.edge(rect.x, rect.y - size / 2, rect.width, 'bottom');
}
function paintReplacedBox(box, b) {
    const image = box.getImage();
    if (image?.status === 'loaded') {
        const { x, y, width, height } = box.getContentArea();
        b.image(x, y, width, height, image);
    }
}
function paintInline(layout, inlineIndex, layerRoot, block, b) {
    const items = block.items;
    const fragments = block.fragments;
    const fragStack = [];
    const inlineRoot = layout.tree[inlineIndex];
    if (!inlineRoot.isInline())
        throw new Error('Assertion failed');
    const decorations = [];
    const inlineEnd = inlineRoot.treeFinal + 1;
    let lastMark = inlineRoot.textStart;
    let inlineMark = inlineRoot.textStart;
    let run = undefined;
    let mark = inlineRoot.textStart;
    let itemIndex = 0; // common case, adjusted below if necessary
    let itemEnd = items.length; // common case, adjusted below
    let fragmentIndex = 0; // common case
    let fragmentEnd = fragments.length; // common case
    // Narrow itemIndex..itemEnd if we're painting a subset of the block
    if (items.length > 0) {
        if (inlineRoot.textStart !== items[0].offset) {
            itemIndex = binarySearchOf(items, inlineRoot.textStart, item => item.end());
            if (items[itemIndex].end() === inlineRoot.textStart)
                itemIndex += 1;
        }
        if (inlineRoot.textEnd !== items[itemEnd - 1].end()) {
            itemEnd = binarySearchOf(items, inlineRoot.textEnd, item => item.end()) + 1;
        }
    }
    // Narrow fragmentIndex..fragmentEnd if we're painting a subset of the block
    // Can't use bsearch since inlines are repeated
    while (fragmentIndex < fragments.length &&
        fragments[fragmentIndex].treeIndex < inlineRoot.treeStart)
        fragmentIndex++;
    while (fragmentEnd > fragmentIndex && (fragments[fragmentEnd - 1].treeIndex < inlineRoot.treeStart ||
        fragments[fragmentEnd - 1].treeIndex > inlineRoot.treeFinal))
        fragmentEnd--;
    for (const decoratingTreeIndex of layerRoot.decoratingBoxes) {
        const paintingTreeIndex = inlineIndex;
        decorations.push({ decoratingTreeIndex, paintingTreeIndex });
    }
    while (itemIndex < itemEnd ||
        inlineIndex < inlineEnd ||
        fragmentIndex < fragmentEnd) {
        // Inlines, inline-block, images: consume one
        if (inlineIndex < inlineEnd && mark === inlineMark) {
            const box = layout.tree[inlineIndex];
            if (box.isInline()) {
                if (!box.isLayerRoot() || box === inlineRoot) {
                    if (box.isDecoratingBox()) {
                        const decoratingTreeIndex = inlineIndex;
                        const paintingTreeIndex = inlineIndex;
                        decorations.push({ decoratingTreeIndex, paintingTreeIndex });
                    }
                }
                else {
                    inlineIndex = box.treeFinal;
                    while (itemIndex < itemEnd &&
                        items[itemIndex].end() <= box.textEnd)
                        itemIndex++;
                    while (fragmentIndex < fragmentEnd &&
                        fragments[fragmentIndex].treeIndex <= box.treeFinal &&
                        fragments[fragmentIndex].textEnd <= box.textEnd)
                        fragmentIndex++;
                }
            }
            else if (box.isFormattingBox()) {
                if (!box.isLayerRoot()) {
                    if (box.isReplacedBox()) {
                        paintBlockBackground(box, b);
                        paintReplacedBox(box, b);
                    }
                    else {
                        paintBlockLayerRoot(layout, layerRoot.inlineBlocks.get(box), b);
                    }
                }
                inlineIndex = box.treeFinal;
            }
            else {
                if (box.isRun()) {
                    run = box;
                    inlineMark = box.textEnd;
                }
            }
        }
        // Fragmented backgrounds from an inline already seen
        while (fragmentIndex < fragmentEnd &&
            fragments[fragmentIndex].textStart === mark &&
            fragments[fragmentIndex].treeIndex <= inlineIndex) {
            const fragment = fragments[fragmentIndex];
            paintInlineBackground(layout, fragment, block, b);
            fragStack.push(fragment);
            fragmentIndex++;
        }
        lastMark = mark;
        mark = Math.min(fragmentIndex < fragmentEnd ? fragments[fragmentIndex].textStart : Infinity, itemIndex < itemEnd ? items[itemIndex].end() : Infinity, inlineMark, inlineRoot.textEnd);
        // paint lastMark..mark (everything else at lastMark has been painted)
        if (itemIndex < itemEnd) {
            const item = items[itemIndex];
            if (lastMark < mark) {
                for (const decoration of decorations) {
                    const box = layout.tree[decoration.decoratingTreeIndex];
                    if (box.style.textDecorationLine !== 'line-through') {
                        paintInlineDecoration(layout, decoration, fragStack, item, lastMark, mark, b);
                    }
                }
                drawText(item, run, lastMark, mark, b);
                for (const decoration of decorations) {
                    const box = layout.tree[decoration.decoratingTreeIndex];
                    if (box.style.textDecorationLine === 'line-through') {
                        paintInlineDecoration(layout, decoration, fragStack, item, lastMark, mark, b);
                    }
                }
            }
            if (mark === items[itemIndex].end())
                itemIndex++;
        }
        // Pop fragments that won't go past mark
        while (fragStack.length &&
            fragStack[fragStack.length - 1].textEnd <= mark)
            fragStack.pop();
        // Pop decorations that end with this inlineIndex
        if (lastMark === inlineMark) {
            while (decorations.length) {
                const { decoratingTreeIndex } = decorations[decorations.length - 1];
                const box = layout.tree[decoratingTreeIndex];
                if (!box.isBox())
                    throw new Error('Assertion failed');
                if (box.treeFinal === inlineIndex) {
                    decorations.pop();
                }
                else {
                    break;
                }
            }
        }
        // Advance the inlineIndex
        if (inlineIndex < inlineEnd && lastMark === inlineMark)
            inlineIndex++;
    }
}
function paintBlockForeground(layout, root, b) {
    const decoratingBoxes = root.decoratingBoxes;
    const parents = [];
    for (let i = root.box.treeStart; i <= root.box.treeFinal; i++) {
        const box = layout.tree[i];
        if (box.isReplacedBox()) {
            // Belongs to this LayerRoot
            if (box === root.box || !box.isLayerRoot())
                paintReplacedBox(box, b);
        }
        else if (box.isFormattingBox()) {
            if (
            // Belongs to this LayerRoot
            (box === root.box || !box.isLayerRoot()) &&
                // Has something we should paint underneath it
                (box.hasForegroundInLayerRoot() || root.isInInlineBlockPath(box))) {
                if (box !== root.box && box.style.overflow === 'hidden') {
                    const { x, y, width, height } = box.getPaddingArea();
                    b.pushClip(x, y, width, height);
                }
                if (box.isBlockContainer()) {
                    parents.push(box);
                    if (box.isDecoratingBox())
                        decoratingBoxes.push(i);
                    if (box.isBlockContainerOfInlines()) {
                        paintInline(layout, box.treeStart + 1, root, box, b);
                        i = box.treeFinal;
                    }
                }
            }
            else {
                i = box.treeFinal;
            }
        }
        if (decoratingBoxes.length) {
            const box = layout.tree[decoratingBoxes[decoratingBoxes.length - 1]];
            if (!box.isBox())
                throw new Error('Assertion failed');
            if (box.treeFinal === i)
                decoratingBoxes.pop();
        }
        while (parents.length && parents[parents.length - 1].treeFinal === i) {
            const box = parents.pop();
            if (box !== root.box && box.style.overflow === 'hidden') {
                b.popClip();
            }
        }
    }
}
class LayerRoot {
    box;
    parents;
    negativeRoots;
    floats;
    positionedRoots;
    positiveRoots;
    /**
     * Unlike the other child roots, inline-blocks are painted when text is
     * painted - after text that comes before them and before text that comes
     * after. The map allows lookup while walking the inline tree.
     */
    inlineBlocks;
    /**
     * Note: gets mutated during traversal, but always put back to where it was
     */
    decoratingBoxes;
    constructor(box, parents) {
        this.box = box;
        this.parents = parents;
        this.negativeRoots = [];
        this.floats = [];
        this.positionedRoots = [];
        this.positiveRoots = [];
        this.inlineBlocks = new Map();
        this.decoratingBoxes = [];
    }
    get zIndex() {
        const zIndex = this.box.style.zIndex;
        return zIndex === 'auto' ? 0 : zIndex;
    }
    finalize() {
        this.negativeRoots.sort((a, b) => a.zIndex - b.zIndex);
        this.floats.sort((a, b) => a.box.treeStart - b.box.treeStart);
        this.positionedRoots.sort((a, b) => a.box.treeStart - b.box.treeStart);
        this.positiveRoots.sort((a, b) => a.zIndex - b.zIndex);
    }
    isEmpty() {
        return !this.box.hasBackground()
            && !this.box.hasForeground()
            && !this.box.hasBackgroundInLayerRoot()
            && !this.box.hasForegroundInLayerRoot()
            && this.negativeRoots.length === 0
            && this.floats.length === 0
            && this.positionedRoots.length === 0
            && this.positiveRoots.length === 0
            && this.inlineBlocks.size === 0;
    }
    /**
     * Returns true if the box belongs to this LayerRoot and is a parent of an
     * inline-block LayerRoot (which would be a direct child of this LayerRoot).
     *
     * The paint foreground algorithm normally only descends boxes with the
     * hasForegroundInLayerRoot bit set, for obvious reasons. However, since an
     * inline-block creates its own layer root, it does not contribute foreground.
     * This is used as an additional check next to hasForegroundInLayerRoot when
     * descending.
     */
    isInInlineBlockPath(box) {
        if (this.inlineBlocks.size === 0)
            return false;
        if (box === this.box)
            return true;
        for (const root of this.inlineBlocks.values()) {
            if (root.parents.includes(box))
                return true;
        }
        return false;
    }
    isBlockLayerRoot() {
        return false;
    }
    isInlineLayerRoot() {
        return false;
    }
}
class BlockLayerRoot extends LayerRoot {
    box;
    constructor(box, parents) {
        super(box, parents);
        this.box = box;
    }
    isBlockLayerRoot() {
        return true;
    }
}
class InlineLayerRoot extends LayerRoot {
    box;
    block;
    index;
    constructor(box, index, parents, block) {
        super(box, parents);
        this.box = box;
        this.index = index;
        this.block = block;
    }
    isInlineLayerRoot() {
        return true;
    }
}
function createLayerRoot(layout, rootBox) {
    const layerRoot = new BlockLayerRoot(rootBox, []);
    const parentRoots = [layerRoot];
    const parents = [];
    for (let i = rootBox.treeStart; i <= rootBox.treeFinal; i++) {
        const item = layout.tree[i];
        let layerRoot;
        if (item.isBox()) {
            const box = item;
            let parentRootIndex = parentRoots.length - 1;
            let parentRoot = parentRoots[parentRootIndex];
            if (box === rootBox) {
                // only visit children
            }
            else if (box.isPositioned()) {
                while (parentRootIndex > 0 &&
                    !parentRoots[parentRootIndex].box.isStackingContextRoot()) {
                    parentRoot = parentRoots[--parentRootIndex];
                }
                const parentIndex = parents.findLastIndex(box => parentRoot.box === box);
                const paintRootParents = parents.slice(parentIndex + 1);
                let nearestIfc;
                if (box.isInline()) {
                    for (let i = parents.length - 1; i >= 0; i--) {
                        const parent = parents[i];
                        if (parent.isBlockContainerOfInlines()) {
                            nearestIfc = parent;
                            break;
                        }
                    }
                }
                if (box.isInline()) {
                    layerRoot = new InlineLayerRoot(box, i, paintRootParents, nearestIfc);
                }
                else {
                    layerRoot = new BlockLayerRoot(box, paintRootParents);
                }
            }
            else if (!box.isInline()) {
                if (box.isFloat() || box.isBlockContainer() && box.isInlineLevel()) {
                    const parentIndex = parents.findLastIndex(box => parentRoot.box === box);
                    const paintRootParents = parents.slice(parentIndex + 1);
                    layerRoot = new BlockLayerRoot(box, paintRootParents);
                    if (box.isBlockContainer() && box.isInlineLevel()) {
                        parentRoot.inlineBlocks.set(box, layerRoot);
                    }
                }
            }
            if (layerRoot && parents.length && parents[parents.length - 1].isBlockContainer()) {
                for (let i = parents.length - 1; i >= 0; i--) {
                    const parent = parents[i];
                    const nextParent = i - 1 >= 0 ? parents[i - 1] : null;
                    if (parent.isBlockContainer()) {
                        if (parent.isOutOfFlow() || parent.isInlineLevel())
                            break;
                        if (parent.isDecoratingBox()) {
                            layerRoot.decoratingBoxes.push(parent.treeStart);
                        }
                    }
                    else if (parent.isInline() && nextParent?.isBlockContainer()) {
                        // continue
                    }
                    else {
                        break;
                    }
                }
                layerRoot.decoratingBoxes.reverse();
            }
            if (box.hasBackgroundInDescendent() ||
                box.hasForegroundInDescendent() ||
                box.hasBackground() ||
                box.hasForeground()) {
                parents.push(box);
                if (layerRoot)
                    parentRoots.push(layerRoot);
            }
            else {
                i = box.treeFinal;
            }
        }
        while (parents.length && parents[parents.length - 1].treeFinal === i) {
            const layerRoot = parentRoots.at(-1);
            const box = parents.pop();
            if (layerRoot.box === box) {
                if (!layerRoot.isEmpty()) {
                    let parentRootIndex = parentRoots.length - 2;
                    let parentRoot = parentRoots[parentRootIndex];
                    if (box.isPositioned()) {
                        const zIndex = box.style.zIndex;
                        while (parentRootIndex > 0 &&
                            !parentRoots[parentRootIndex].box.isStackingContextRoot()) {
                            parentRoot = parentRoots[--parentRootIndex];
                        }
                        if (zIndex < 0) {
                            parentRoot.negativeRoots.push(layerRoot);
                        }
                        else if (zIndex > 0) {
                            parentRoot.positiveRoots.push(layerRoot);
                        }
                        else {
                            parentRoot.positionedRoots.push(layerRoot);
                        }
                    }
                    else if (box.isFormattingBox() && box.isFloat()) {
                        parentRoot.floats.push(layerRoot);
                    }
                    layerRoot.finalize();
                }
                parentRoots.pop();
            }
        }
    }
    layerRoot.finalize();
    return layerRoot;
}
function paintInlineLayerRoot(layout, root, b) {
    for (const r of root.negativeRoots)
        paintLayerRoot(layout, r, b);
    for (const r of root.floats)
        paintLayerRoot(layout, r, b);
    if (root.box.hasForeground() || root.box.hasForegroundInLayerRoot()) {
        paintInline(layout, root.index, root, root.block, b);
    }
    for (const r of root.positionedRoots)
        paintLayerRoot(layout, r, b);
    for (const r of root.positiveRoots)
        paintLayerRoot(layout, r, b);
}
function paintBlockLayerRoot(layout, root, b, isRoot = false) {
    if (root.box.hasBackground() && !isRoot)
        paintBlockBackground(root.box, b);
    if (!isRoot && root.box.style.overflow === 'hidden') {
        const { x, y, width, height } = root.box.getPaddingArea();
        b.pushClip(x, y, width, height);
    }
    for (const r of root.negativeRoots)
        paintLayerRoot(layout, r, b);
    if (root.box.hasBackgroundInLayerRoot()) {
        paintBackgroundDescendents(layout, root.box, b);
    }
    for (const r of root.floats)
        paintLayerRoot(layout, r, b);
    if (root.box.hasForeground() || root.box.hasForegroundInLayerRoot() || root.inlineBlocks.size) {
        paintBlockForeground(layout, root, b);
    }
    for (const r of root.positionedRoots)
        paintLayerRoot(layout, r, b);
    for (const r of root.positiveRoots)
        paintLayerRoot(layout, r, b);
    if (!isRoot && root.box.style.overflow === 'hidden')
        b.popClip();
}
function paintLayerRoot(layout, paintRoot, b) {
    for (const parent of paintRoot.parents) {
        if (parent.isBlockContainer() && parent.style.overflow === 'hidden') {
            const { x, y, width, height } = parent.getPaddingArea();
            b.pushClip(x, y, width, height);
        }
    }
    if (paintRoot.isBlockLayerRoot()) {
        paintBlockLayerRoot(layout, paintRoot, b);
    }
    else if (paintRoot.isInlineLayerRoot()) {
        paintInlineLayerRoot(layout, paintRoot, b);
    }
    for (const parent of paintRoot.parents) {
        if (parent.isBlockContainer() && parent.style.overflow === 'hidden') {
            b.popClip();
        }
    }
}
/**
 * Paint the root element
 * https://www.w3.org/TR/CSS22/zindex.html
 */
export default function paint(layout, b) {
    const block = layout.root();
    const layerRoot = createLayerRoot(layout, block);
    if (!layerRoot.isEmpty()) {
        // Propagate background color and overflow to the viewport
        if (block.style.backgroundColor.a > 0) {
            const area = block.getContainingBlock();
            b.fillColor = block.style.backgroundColor;
            b.rect(area.x, area.y, area.width, area.height);
        }
        if (block.style.overflow === 'hidden') {
            const { x, y, width, height } = block.getContainingBlock();
            b.pushClip(x, y, width, height);
        }
        paintBlockLayerRoot(layout, layerRoot, b, true);
        if (block.style.overflow === 'hidden')
            b.popClip();
    }
}

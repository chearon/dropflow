import { id } from './util.js';
export class RenderItem {
    style;
    constructor(style) {
        this.style = style;
    }
    isBlockContainer() {
        return false;
    }
    isRun() {
        return false;
    }
    isInline() {
        return false;
    }
    isBreak() {
        return false;
    }
    isIfcInline() {
        return false;
    }
    isBox() {
        return false;
    }
    repr(indent = 0, options) {
        let c = '';
        if (this.isIfcInline()) {
            options = { ...options };
            options.paragraphText = this.text;
        }
        if (this.isBox() && this.children.length) {
            c = '\n' + this.children.map(c => c.repr(indent + 1, options)).join('\n');
        }
        let extra = '';
        if (options?.containingBlocks && this.isBlockContainer()) {
            extra += ` (cb = ${this.containingBlock ? this.containingBlock.box.id : '(null)'})`;
        }
        if (options?.css) {
            const css = this.style[options.css];
            extra += ` (${options.css}: ${css && JSON.stringify(css)})`;
        }
        return '  '.repeat(indent) + this.sym() + ' ' + this.desc(options) + extra + c;
    }
}
export class Box extends RenderItem {
    id;
    children;
    attrs;
    containingBlock;
    static ATTRS = {
        isAnonymous: 1 << 0,
        // Inline or block-level: we can't use the style for this since anonymously
        // created block containers are block-level but their style is inline (the
        // initial value). Potentially we could remove this and say that it's block
        // level if it's anonymous.
        //
        // Other CSS rules that affect how a block container is treated during
        // layout do not have this problem (position: absolute, display: inline-
        // block) because anonymously created boxes cannot invoke those modes.
        isInline: 1 << 1,
        isBfcRoot: 1 << 2,
        enableLogging: 1 << 3,
    };
    constructor(style, children, attrs) {
        super(style);
        this.id = id();
        this.children = children;
        this.attrs = attrs;
        this.containingBlock = EmptyContainingBlock;
    }
    isBox() {
        return true;
    }
    isAnonymous() {
        return Boolean(this.attrs & Box.ATTRS.isAnonymous);
    }
    isPositioned() {
        return this.style.position !== 'static';
    }
    isStackingContextRoot() {
        return this.isPositioned() && this.style.zIndex !== 'auto';
    }
    isPaintRoot() {
        return this.isBlockContainer() && this.isFloat() || this.isPositioned();
    }
    getRelativeVerticalShift() {
        const height = this.containingBlock.height;
        let { top, bottom } = this.style;
        if (top !== 'auto') {
            if (typeof top !== 'number')
                top = height * top.value / 100;
            return top;
        }
        else if (bottom !== 'auto') {
            if (typeof bottom !== 'number')
                bottom = height * bottom.value / 100;
            return -bottom;
        }
        else {
            return 0;
        }
    }
    getRelativeHorizontalShift() {
        const { direction, width } = this.containingBlock;
        let { right, left } = this.style;
        if (left !== 'auto' && (right === 'auto' || direction === 'ltr')) {
            if (typeof left !== 'number')
                left = width * left.value / 100;
            return left;
        }
        else if (right !== 'auto' && (left === 'auto' || direction === 'rtl')) {
            if (typeof right !== 'number')
                right = width * right.value / 100;
            return -right;
        }
        else {
            return 0;
        }
    }
    desc(options) {
        return 'Box';
    }
    sym() {
        return '◼︎';
    }
}
export class BoxArea {
    parent;
    box;
    blockStart;
    blockSize;
    lineLeft;
    inlineSize;
    constructor(box, x, y, w, h) {
        this.parent = null;
        this.box = box;
        this.blockStart = y || 0;
        this.blockSize = h || 0;
        this.lineLeft = x || 0;
        this.inlineSize = w || 0;
    }
    clone() {
        return new BoxArea(this.box, this.lineLeft, this.blockStart, this.inlineSize, this.blockSize);
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
    set x(x) {
        this.lineLeft = x;
    }
    get y() {
        return this.blockStart;
    }
    set y(y) {
        this.blockStart = y;
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
    inlineSizeForPotentiallyOrthogonal(box) {
        if (!this.parent)
            return this.inlineSize; // root area
        if (!this.box.isBlockContainer())
            return this.inlineSize; // cannot be orthogonal
        if ((this.box.writingModeAsParticipant === 'horizontal-tb') !==
            (box.writingModeAsParticipant === 'horizontal-tb')) {
            return this.blockSize;
        }
        else {
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
        }
        else if (this.parent.writingMode === 'vertical-rl') {
            x = this.parent.width - this.blockStart - this.blockSize;
            y = this.lineLeft;
            width = this.blockSize;
            height = this.inlineSize;
        }
        else { // 'horizontal-tb'
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
    repr(indent = 0) {
        const { width: w, height: h, x, y } = this;
        return '  '.repeat(indent) + `⚃ Area ${this.box.id}: ${w}⨯${h} @${x},${y}`;
    }
}
const EmptyContainingBlock = new BoxArea(null);

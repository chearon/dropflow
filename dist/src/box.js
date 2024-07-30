import { id } from './util.js';
export class Box {
    constructor(style, children, attrs) {
        this.id = id();
        this.style = style;
        this.children = children;
        this.attrs = attrs;
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
    isAnonymous() {
        return Boolean(this.attrs & Box.ATTRS.isAnonymous);
    }
    get isRelativeOrStatic() {
        return this.style.position === 'relative'
            || this.style.position === 'static'
            // XXX anonymous boxes won't have a position since position doesn't
            // inherit. Possible this could cause a problem later, so take note
            || this.isAnonymous() && !this.style.position;
    }
    get isAbsolute() {
        return this.style.position === 'absolute';
    }
    get isPositioned() {
        return this.style.position !== 'static';
    }
    get desc() {
        return 'Box';
    }
    get sym() {
        return '◼︎';
    }
    repr(indent = 0, options) {
        let c = '';
        if (!this.isRun() && this.children.length) {
            c = '\n' + this.children.map(c => c.repr(indent + 1, options)).join('\n');
        }
        let extra = '';
        if (options && options.containingBlocks && this.isBlockContainer()) {
            extra += ` (cb = ${this.containingBlock ? this.containingBlock.blockContainer.id : '(null)'})`;
        }
        if (options && options.css) {
            const css = this.style[options.css];
            extra += ` (${options.css}: ${css && JSON.stringify(css)})`;
        }
        return '  '.repeat(indent) + this.sym + ' ' + this.desc + extra + c;
    }
}
// For some reason the inline `static ATTRS = {}` along with
// useDefineForClassFields generates JS with a syntax error as of typescript 5.0.4
Box.ATTRS = {
    isAnonymous: 1,
    isInline: 1 << 1,
    isBfcRoot: 1 << 2,
    isFloat: 1 << 3,
    enableLogging: 1 << 4
};

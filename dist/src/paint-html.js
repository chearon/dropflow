import { getMetrics } from './layout-text.js';
import { firstCascadeItem } from './text-font.js';
function encode(s) {
    return s.replaceAll('&', '&amp;').replaceAll('<', '&lt;');
}
function camelToKebab(camel) {
    return camel.replace(/[A-Z]/g, s => '-' + s.toLowerCase());
}
export default class HtmlPaintBackend {
    s;
    fillColor;
    strokeColor;
    lineWidth;
    direction;
    font;
    fontSize;
    constructor() {
        this.s = '';
        this.fillColor = { r: 0, g: 0, b: 0, a: 0 };
        this.strokeColor = { r: 0, g: 0, b: 0, a: 0 };
        this.lineWidth = 0;
        this.direction = 'ltr';
        this.font = firstCascadeItem();
        this.fontSize = 0;
    }
    style(style) {
        return Object.entries(style).map(([prop, value]) => {
            return `${camelToKebab(prop)}: ${value}`;
        }).join('; ');
    }
    attrs(attrs) {
        return Object.entries(attrs).map(([name, value]) => {
            return `${name}="${value}"`;
        }).join(' ');
    }
    // TODO: pass in amount of each side that's shared with another border so they can divide
    // TODO: pass in border-radius
    edge(x, y, length, side) {
        const { r, g, b, a } = this.strokeColor;
        const sw = this.lineWidth;
        const left = (side === 'left' ? x - sw / 2 : side === 'right' ? x - sw / 2 : x) + 'px';
        const top = (side === 'top' ? y - sw / 2 : side === 'bottom' ? y - sw / 2 : y) + 'px';
        const width = side === 'top' || side === 'bottom' ? length + 'px' : sw + 'px';
        const height = side === 'left' || side === 'right' ? length + 'px' : sw + 'px';
        const position = 'absolute';
        const backgroundColor = `rgba(${r}, ${g}, ${b}, ${a})`;
        const style = this.style({ position, left, top, width, height, backgroundColor });
        this.s += `<div style="${style}"></div>`;
    }
    text(x, y, item, textStart, textEnd) {
        const { ascenderBox, descenderBox } = getMetrics(item.attrs.style, item.match);
        const text = item.paragraph.string.slice(textStart, textEnd);
        const { r, g, b, a } = this.fillColor;
        const style = this.style({
            position: 'absolute',
            left: '0',
            top: '0',
            transform: `translate(${x}px, ${y - (ascenderBox - (ascenderBox + descenderBox) / 2)}px)`,
            font: this.font.toFontString(this.fontSize),
            lineHeight: '0',
            whiteSpace: 'pre',
            direction: this.direction,
            unicodeBidi: 'bidi-override',
            color: `rgba(${r}, ${g}, ${b}, ${a})`
        });
        this.s += `<div style="${style}">${encode(text)}</div>`;
    }
    rect(x, y, w, h) {
        const { r, g, b, a } = this.fillColor;
        const style = this.style({
            position: 'absolute',
            left: x + 'px',
            top: y + 'px',
            width: w + 'px',
            height: h + 'px',
            backgroundColor: `rgba(${r}, ${g}, ${b}, ${a})`
        });
        this.s += `<div style="${style}"></div>`;
    }
}

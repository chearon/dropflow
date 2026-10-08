import { prevCluster, nextCluster, nextGrapheme, prevGrapheme } from "./layout-text.js";
import { G_ID, G_CL, G_AX, G_AY, G_DX, G_DY, G_FL, G_SZ } from "./text-harfbuzz.js";
function findGlyph(item, offset) {
    let index = item.attrs.level & 1 ? item.glyphs.length - G_SZ : 0;
    while (index >= 0 && index < item.glyphs.length && item.glyphs[index + G_CL] < offset) {
        index += item.attrs.level & 1 ? -G_SZ : G_SZ;
    }
    return index;
}
function glyphsWidth(item, glyphStart, glyphEnd) {
    let ax = 0;
    for (let i = glyphStart; i < glyphEnd; i += G_SZ)
        ax += item.glyphs[i + G_AX];
    return ax / item.face.hbface.upem * item.attrs.style.fontSize;
}
// Solve for:
// textStart..textEnd: largest safe-boundaried string inside totalTextStart..totalTextEnd
// startGlyphStart...startGlyphEnd: chain of glyphs inside totalTextStart..textStart
// endGlyphStart...endGlyphEnd: chain of glyphs inside textEnd...totalTextEnd
// TODO not well tested. this took me days to figure out
function fastGlyphBoundaries(item, totalTextStart, totalTextEnd) {
    const glyphs = item.glyphs;
    let startGlyphStart = findGlyph(item, totalTextStart);
    let endGlyphEnd = findGlyph(item, totalTextEnd); // TODO findGlyphFromEnd?
    let textStart = nextGrapheme(item.block.text, totalTextStart);
    let startGlyphEnd = findGlyph(item, textStart);
    let textEnd = Math.max(textStart, prevGrapheme(item.block.text, totalTextEnd));
    let endGlyphStart = findGlyph(item, textEnd);
    if (item.attrs.level & 1) {
        while (startGlyphEnd > endGlyphStart && glyphs[startGlyphEnd + G_FL] & 1) {
            startGlyphEnd = prevCluster(glyphs, startGlyphEnd);
        }
        textStart = glyphs[startGlyphEnd + G_CL] ?? textEnd;
        while (endGlyphStart < startGlyphEnd && glyphs[endGlyphStart + G_FL] & 1) {
            endGlyphStart = nextCluster(glyphs, endGlyphStart);
        }
        textEnd = glyphs[endGlyphStart + G_CL] ?? textEnd;
    }
    else {
        while (startGlyphEnd < endGlyphStart && glyphs[startGlyphEnd + G_FL] & 1) {
            startGlyphEnd = nextCluster(glyphs, startGlyphEnd);
        }
        textStart = glyphs[startGlyphEnd + G_CL] ?? textEnd;
        while (endGlyphStart > startGlyphEnd && glyphs[endGlyphStart + G_FL] & 1) {
            endGlyphStart = prevCluster(glyphs, endGlyphStart);
        }
        textEnd = glyphs[endGlyphStart + G_CL] ?? textEnd;
    }
    if (item.attrs.level & 1) {
        [startGlyphStart, startGlyphEnd] = [startGlyphEnd + G_SZ, startGlyphStart + G_SZ];
        [endGlyphStart, endGlyphEnd] = [endGlyphEnd + G_SZ, endGlyphStart + G_SZ];
    }
    return { startGlyphStart, startGlyphEnd, textStart, textEnd, endGlyphStart, endGlyphEnd };
}
export default class CanvasPaintBackend {
    fillColor;
    strokeColor;
    lineWidth;
    direction;
    font;
    fontSize;
    ctx;
    layout;
    constructor(ctx, layout) {
        this.fillColor = { r: 0, g: 0, b: 0, a: 0 };
        this.strokeColor = { r: 0, g: 0, b: 0, a: 0 };
        this.lineWidth = 0;
        this.direction = 'ltr';
        this.font = undefined;
        this.fontSize = 8;
        this.ctx = ctx;
        this.layout = layout;
    }
    // TODO: pass in amount of each side that's shared with another border so they can divide
    // TODO: pass in border-radius
    edge(x, y, length, side) {
        const { r, g, b, a } = this.strokeColor;
        this.ctx.beginPath();
        this.ctx.strokeStyle = `rgba(${r}, ${g}, ${b}, ${a})`;
        this.ctx.lineWidth = this.lineWidth;
        this.ctx.moveTo(x, y);
        this.ctx.lineTo(side === 'top' || side === 'bottom' ? x + length : x, side === 'left' || side === 'right' ? y + length : y);
        this.ctx.stroke();
    }
    fastText(x, y, item, textStart, textEnd) {
        const { r, g, b, a } = this.fillColor;
        this.ctx.save();
        this.ctx.direction = item.attrs.level & 1 ? 'rtl' : 'ltr';
        this.ctx.textAlign = 'left';
        // TODO: PR to node-canvas to make this the default. I see no issues with
        // drawing glyphs, and it's way way way faster, and the correct way to do it
        if ('textDrawingMode' in this.ctx) {
            this.ctx.textDrawingMode = 'glyph';
        }
        this.ctx.font = this.font?.toFontString(this.fontSize) || '';
        this.ctx.fillStyle = `rgba(${r}, ${g}, ${b}, ${a})`;
        if (item.mayHaveModifiedWordSepGlyphs(this.layout)) {
            if (item.attrs.level & 1) {
                const state = item.createMeasureState();
                item.measure(textStart, 1, state);
                x += item.measure(textEnd, 1, state).advance;
            }
            const words = item.createWordIterator(textStart, textEnd);
            for (; !words.done; words.next()) {
                const text = item.block.sliceRenderText(this.layout, item, words.start, words.end);
                x += item.attrs.level & 1 ? -words.x : words.x;
                if (item.attrs.level & 1)
                    x -= words.w;
                this.ctx.fillText(text, x, y);
                if (!(item.attrs.level & 1))
                    x += words.w;
            }
        }
        else {
            const text = item.block.sliceRenderText(this.layout, item, textStart, textEnd);
            this.ctx.fillText(text, x, y);
        }
        this.ctx.restore();
    }
    correctText(x, y, item, glyphStart, glyphEnd) {
        const { r, g, b, a } = this.fillColor;
        const scale = 1 / item.face.hbface.upem * this.fontSize;
        let sx = 0;
        let sy = 0;
        this.ctx.save();
        this.ctx.translate(x, y);
        this.ctx.scale(scale, -scale);
        this.ctx.beginPath();
        this.ctx.fillStyle = `rgba(${r}, ${g}, ${b}, ${a})`;
        for (let i = glyphStart; i < glyphEnd; i += G_SZ) {
            const x = sx + item.glyphs[i + G_DX];
            const y = sy + item.glyphs[i + G_DY];
            this.ctx.translate(x, y);
            item.face.hbfont.drawGlyph(item.glyphs[i + G_ID], this.ctx);
            this.ctx.translate(-x, -y);
            sx += item.glyphs[i + G_AX];
            sy += item.glyphs[i + G_AY];
        }
        this.ctx.fill();
        this.ctx.restore();
    }
    text(x, y, item, totalTextStart, totalTextEnd, isColorBoundary) {
        if (isColorBoundary) {
            const { startGlyphStart, startGlyphEnd, textStart, textEnd, endGlyphStart, endGlyphEnd } = fastGlyphBoundaries(item, totalTextStart, totalTextEnd);
            if (item.attrs.level & 1) {
                if (endGlyphStart !== endGlyphEnd) {
                    this.correctText(x, y, item, endGlyphStart, endGlyphEnd);
                    x += glyphsWidth(item, endGlyphStart, endGlyphEnd);
                }
                if (textStart !== textEnd) {
                    this.fastText(x, y, item, textStart, textEnd);
                    x += glyphsWidth(item, startGlyphEnd, endGlyphStart);
                }
                if (startGlyphStart !== startGlyphEnd) {
                    this.correctText(x, y, item, startGlyphStart, startGlyphEnd);
                }
            }
            else {
                if (startGlyphStart !== startGlyphEnd) {
                    this.correctText(x, y, item, startGlyphStart, startGlyphEnd);
                    x += glyphsWidth(item, startGlyphStart, startGlyphEnd);
                }
                if (textStart !== textEnd) {
                    this.fastText(x, y, item, textStart, textEnd);
                    x += glyphsWidth(item, startGlyphEnd, endGlyphStart);
                }
                if (endGlyphStart !== endGlyphEnd) {
                    this.correctText(x, y, item, endGlyphStart, endGlyphEnd);
                }
            }
        }
        else {
            this.fastText(x, y, item, totalTextStart, totalTextEnd);
        }
    }
    rect(x, y, w, h) {
        const { r, g, b, a } = this.fillColor;
        this.ctx.beginPath();
        this.ctx.fillStyle = `rgba(${r}, ${g}, ${b}, ${a})`;
        this.ctx.fillRect(x, y, w, h);
    }
    pushClip(x, y, w, h) {
        this.ctx.save();
        this.ctx.beginPath();
        this.ctx.rect(x, y, w, h);
        this.ctx.clip();
    }
    popClip() {
        this.ctx.restore();
    }
    image(x, y, w, h, image) {
        if (!image.decoded) {
            throw new Error('Image handle missing. Did you call flow.loadSync instead of flow.load?');
        }
        this.ctx.drawImage(image.decoded, x, y, w, h);
    }
}

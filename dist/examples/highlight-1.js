import * as flow from 'dropflow';
import parse from 'dropflow/parse.js';
import fs from 'fs';
import { createCanvas } from 'canvas';
import { highlightCode, tags as t } from '@lezer/highlight';
import { parser as jsParser } from '@lezer/javascript';
import { bench, run, do_not_optimize } from 'mitata';
const p = (path) => new URL(`../assets/${path}`, import.meta.url);
flow.fonts.add(flow.createFaceFromTablesSync(p('Cousine/Cousine-Regular.ttf')));
const source = fs.readFileSync(new URL('../src/parse-css.js', import.meta.url), 'utf-8');
// Build a map from lezer Tag id to an inline CSS style string (github-dark palette)
const colorMap = new Map();
function register(tag, color) {
    const style = `color:${color}`;
    for (const tag_ of (Array.isArray(tag) ? tag : [tag])) {
        colorMap.set(tag_.id, style);
    }
}
register([t.keyword, t.operatorKeyword], '#f97583');
register([t.name, t.deleted, t.character, t.macroName], '#ffab70');
register([t.propertyName], '#79b8ff');
register([t.function(t.variableName), t.function(t.name), t.labelName], '#79b8ff');
register([t.definition(t.name), t.separator], '#ffab70');
register([t.className], '#b392f0');
register([t.string, t.special(t.string)], '#9ecbff');
register([t.number, t.annotation, t.modifier, t.self, t.namespace], '#79b8ff');
register([t.meta, t.comment], '#6a737d');
register([t.regexp], '#9ecbff');
register([t.operator], '#f97583');
const highlighter = {
    style(tagList) {
        for (const tag of tagList) {
            for (const sub of tag.set) {
                const s = colorMap.get(sub.id);
                if (s)
                    return s;
            }
        }
        return null;
    }
};
function esc(s) {
    return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}
// highlightCode calls putText for each run of same-styled text and putBreak on each \n
const tree = jsParser.parse(source);
const lineHtmls = [[]];
highlightCode(source, tree, highlighter, (text, style) => {
    const escaped = esc(text);
    lineHtmls[lineHtmls.length - 1].push(style ? `<span style="${style}">${escaped}</span>` : escaped);
}, () => { lineHtmls.push([]); });
const divs = lineHtmls
    .map(parts => `<div>${parts.join('') || '\u200b'}</div>`)
    .join('');
const WIDTH = 1600;
const HEIGHT = 32767;
const rootElement = parse(`<div style="font: 32px/1.4 Cousine; background-color: #24292e; color: #d1d5da; ` +
    `padding: 8px; white-space: pre-wrap;">${divs}</div>`);
flow.loadSync(rootElement);
const canvas = createCanvas(WIDTH, HEIGHT);
const ctx = canvas.getContext('2d');
const layout = flow.layout(rootElement);
flow.reflow(layout, WIDTH, HEIGHT);
ctx.fillStyle = '#24292e';
ctx.fillRect(0, 0, WIDTH, HEIGHT);
flow.paintToCanvas(layout, ctx);
fs.writeFileSync(new URL('highlight-1.png', import.meta.url), canvas.toBuffer());
bench('altogether', () => {
    const layout = flow.layout(rootElement);
    flow.clearWordCache();
    flow.reflow(layout, WIDTH, HEIGHT);
    ctx.clearRect(0, 0, WIDTH, HEIGHT);
    flow.paintToCanvas(layout, ctx);
}).gc('inner');
bench('flow.reflow', () => {
    do_not_optimize(flow.layout(rootElement));
}).gc('inner');
bench('flow.reflow', () => {
    flow.clearWordCache();
    flow.reflow(layout, WIDTH, HEIGHT);
}).gc('inner');
bench('flow.paint', () => {
    ctx.clearRect(0, 0, WIDTH, HEIGHT);
    flow.paintToCanvas(layout, ctx);
}).gc('inner');
await run();

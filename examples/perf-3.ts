import * as flow from 'dropflow';
import fs from 'fs';
import {createCanvas} from 'canvas';
import {bench, run, do_not_optimize} from 'mitata';

const p = (p: string) => new URL(`../assets/${p}`, import.meta.url);
flow.fonts.add(flow.createFaceFromTablesSync(p('Roboto/Roboto-Regular.ttf')));

function word() {
  let ret = '';
  for (let i = 0; i < 10; i++) {
    ret += String.fromCharCode(97 + Math.floor(Math.random() * 26));
  }
  return ret;
}

const words: string[] = [];

for (let i = 0; i < 10000; i++) words.push(word());

const style = flow.style({whiteSpace: 'pre'});

const canvas = createCanvas(100, 20);
const ctx = canvas.getContext('2d');
const html = flow.dom(
  flow.h('html', {style}, words[Math.floor(Math.random() * words.length)])
);
flow.loadSync(html);
const layout = flow.layout(html);
flow.reflow(layout, 100, 20);
flow.paintToCanvas(layout, ctx);
fs.writeFileSync(new URL('perf-3.png', import.meta.url), canvas.toBuffer());

bench('altogether', () => {
  const html = flow.dom(
    flow.h('html', {style}, words[Math.floor(Math.random() * words.length)])
  );
  const layout = flow.layout(html);
  flow.clearWordCache();
  flow.reflow(layout, 100, 20);
}).gc('inner');

bench('dom', () => {
  const html = flow.dom(
    flow.h('html', {style}, words[Math.floor(Math.random() * words.length)])
  );
  do_not_optimize(html);
}).gc('inner');

bench('flow.layout', () => {
  const layout = flow.layout(html);
  do_not_optimize(layout);
}).gc('inner');

bench('flow.reflow', () => {
  flow.clearWordCache();
  flow.reflow(layout, 100, 20);
}).gc('inner');

await run();

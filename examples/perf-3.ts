import * as flow from 'dropflow/with-parse.js';
import {registerFontAsset} from '../assets/register.js';
import fs from 'fs';
import {createCanvas} from 'canvas';
import {bench, run} from 'mitata';
import {clearWordCache} from '../src/layout-text.js';

console.time('Add fonts');
registerFontAsset('Roboto/Roboto-Regular.ttf');
console.timeEnd('Add fonts');
console.log();

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
const blockContainer = flow.generate(html);
flow.layout(blockContainer, 100, 20);
flow.paintToCanvas(blockContainer, ctx);
canvas.createPNGStream().pipe(fs.createWriteStream(new URL('perf-3.png', import.meta.url)));

bench('generate and layout one random word', () => {
  const html = flow.dom(
    flow.h('html', {style}, words[Math.floor(Math.random() * words.length)])
  );
  const blockContainer = flow.generate(html);
  clearWordCache();
  flow.layout(blockContainer, 100, 20);
});

await run();

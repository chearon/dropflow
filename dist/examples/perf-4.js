import * as oflo from '../src/api-with-parse.js';
import { registerFontAsset } from '../assets/register.js';
import fs from 'fs';
import { createCanvas } from 'canvas';
import { bench, run } from 'mitata';
import { clearWordCache } from '../src/layout-text.js';
registerFontAsset('Arimo/Arimo-Bold.ttf');
registerFontAsset('Arimo/Arimo-Regular.ttf');
registerFontAsset('Arimo/Arimo-Italic.ttf');
registerFontAsset('Cousine/Cousine-Regular.ttf');
const rootElement = oflo.parse(`
  <div style="font: 16px/1.4 Arimo; background-color: white;">
    <span style="background-color: #eee;">
      I <span style="font-family: Cousine; color: #11a;">like</span> to write
      <span style="font-size: 3em;">layout code</span>
    </span>
    <span style="background-color: #eec;">
      because it is
      <span style="color: #999; font-style: italic;">equal parts</span>
      <span style="font-weight: bold;">challenging</span>,
      <span style="font-weight: bold; background-color: veronicayellow;">fun</span>, and
      <span style="font-weight: bold;">arcane</span>.
    </span>
    <span style="font-weight: bold;">abc</span>
    123
    <span style="font-weight: bold;">abc</span>
    123
    <span style="font-weight: bold;">abc</span>
    123
    <span style="font-weight: bold;">abc</span>
    123
    <span style="font-weight: bold;">abc</span>
    123
    <span style="font-weight: bold;">abc</span>
    123
    <span style="font-weight: bold;">abc</span>
    123
    <span style="font-weight: bold;">abc</span>
    123
    <span style="font-weight: bold;">abc</span>
    123
    <span style="font-weight: bold;">abc</span>
    123
    <span style="font-weight: bold;">abc</span>
    123
    <span style="font-weight: bold;">abc</span>
    123
    <span style="font-weight: bold;">abc</span>
    123
    <span style="font-weight: bold;">abc</span>
    123
    <span style="font-weight: bold;">abc</span>
    123
    <span style="font-weight: bold;">abc</span>
    123
    <span style="font-weight: bold;">abc</span>
    123
    <span style="font-weight: bold;">abc</span>
    123
    <span style="font-weight: bold;">abc</span>
    123
    <span style="font-weight: bold;">abc</span>
    123
    <span style="font-weight: bold;">abc</span>
    123
    <span style="font-weight: bold;">abc</span>
    123
    <span style="font-weight: bold;">abc</span>
    123
    <span style="font-weight: bold;">abc</span>
    123
    <span style="font-weight: bold;">abc</span>
    123
  </div>
`);
const blockContainer = oflo.generate(rootElement);
oflo.layout(blockContainer, 300, 200);
const canvas = createCanvas(600, 400);
const ctx = canvas.getContext('2d');
ctx.scale(2, 2);
oflo.paintToCanvas(blockContainer, ctx);
canvas.createPNGStream().pipe(fs.createWriteStream(new URL('perf-4.png', import.meta.url)));
bench('10 paragraphs generate, layout, and paint', () => {
    const blockContainer = oflo.generate(rootElement);
    clearWordCache();
    ctx.clearRect(0, 0, 600, 400);
    oflo.layout(blockContainer, 300, 200);
    oflo.paintToCanvas(blockContainer, ctx);
});
await run();

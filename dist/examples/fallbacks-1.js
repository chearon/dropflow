import * as flow from '../src/api-with-parse.js';
import fs from 'fs';
import { createCanvas } from 'canvas';
import { registerFontAsset } from '../assets/register.js';
registerFontAsset('Cairo/Cairo-Regular.ttf');
registerFontAsset('Ramabhadra/Ramabhadra-Regular.ttf');
registerFontAsset('Arimo/Arimo-Regular.ttf');
registerFontAsset('Arimo/Arimo-Italic.ttf');
const rootElement = flow.parse(`
  <div x-dropflow-log style="font-family: Arimo; background-color: white; text-align: center;">
    <span style="font-style: italic; font-size: 0.5em;">English:</span> Welcome<br>
    <span style="font-style: italic; font-size: 0.5em;">Arabic:</span> أهلاً و سهلاً<br>
    <span style="font-style: italic; font-size: 0.5em;">Hebrew:</span> ברוך הבא
  </div>
`);
const blockContainer = flow.generate(rootElement);
console.log(blockContainer.repr());
flow.layout(blockContainer, 200, 50);
const canvas = createCanvas(400, 150);
const ctx = canvas.getContext('2d');
ctx.scale(2, 2);
flow.paintToCanvas(blockContainer, ctx);
canvas.createPNGStream().pipe(fs.createWriteStream(new URL('fallbacks-1.png', import.meta.url)));

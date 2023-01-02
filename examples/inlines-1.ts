import * as oflo from '../node.js';
import fs from 'fs';
import {createCanvas, registerFont} from 'canvas';

await Promise.all([
  oflo.registerFont('assets/Arimo/Arimo-Bold.ttf'),
  oflo.registerFont('assets/Arimo/Arimo-Regular.ttf'),
  oflo.registerFont('assets/Arimo/Arimo-Italic.ttf'),
  oflo.registerFont('assets/Cousine/Cousine-Regular.ttf')
]);

const rootElement = oflo.parse(`
  <div style="font-family: Arimo; font-size: 16px; line-height: 1.4; background-color: white;">
    <span style="background-color: #eee;">
      I <span style="font-family: Cousine; color: #11a;">like</span> to write
      <span style="font-size: 3em;">layout code</span>
    </span>
    <span style="background-color: #eec;">
      because it is
      <span style="color: #999; font-style: italic;">equal parts</span>
      <span style="font-weight: bold;">challenging</span>,
      <span style="font-weight: bold;">fun</span>, and
      <span style="font-weight: bold;">arcane</span>.
    </span>
  </div>
`);

const blockContainer = oflo.generate(rootElement);
console.log(blockContainer.repr());

await oflo.layout(blockContainer, 300, 200);

oflo.eachRegisteredFont(match => registerFont(match.file, match));
const canvas = createCanvas(600, 400);
const ctx = canvas.getContext('2d');
ctx.scale(2, 2);
oflo.paintToCanvas(blockContainer, ctx);
canvas.createPNGStream().pipe(fs.createWriteStream(new URL('inlines-1.png', import.meta.url)));

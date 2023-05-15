import * as oflo from '../src/api.js';
import fs from 'fs';
import {createCanvas, registerFont} from 'canvas';
import {registerFontAsset} from '../assets/register.js';

registerFontAsset('Arimo/Arimo-Bold.ttf');
registerFontAsset('Arimo/Arimo-Regular.ttf');
registerFontAsset('Arimo/Arimo-Italic.ttf');
registerFontAsset('Cousine/Cousine-Regular.ttf');

const rootElement = oflo.parse(`
  <div style="font: 16px/1.4 Arimo; background-color: white;" x-overflow-log>
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
  </div>
`);

const blockContainer = oflo.generate(rootElement);
console.log(blockContainer.repr());

oflo.layout(blockContainer, 300, 200);

oflo.eachRegisteredFont(match => registerFont(match.file, match));
const canvas = createCanvas(600, 400);
const ctx = canvas.getContext('2d');
ctx.scale(2, 2);
oflo.paintToCanvas(blockContainer, ctx);
canvas.createPNGStream().pipe(fs.createWriteStream(new URL('inlines-1.png', import.meta.url)));

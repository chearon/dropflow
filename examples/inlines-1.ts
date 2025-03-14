import * as flow from 'dropflow/with-parse.js';
import fs from 'fs';
import {createCanvas} from 'canvas';
import {registerFontAsset} from '../assets/register.js';

registerFontAsset('Arimo/Arimo-Bold.ttf');
registerFontAsset('Arimo/Arimo-Regular.ttf');
registerFontAsset('Arimo/Arimo-Italic.ttf');
registerFontAsset('Cousine/Cousine-Regular.ttf');

const rootElement = flow.parse(`
  <div style="font: 16px/1.4 Arimo; background-color: white; zoom: 2;" x-dropflow-log>
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

const blockContainer = flow.generate(rootElement);
blockContainer.log({css: 'zoom'});

const canvas = createCanvas(600, 400);
flow.layout(blockContainer, canvas.width, canvas.height);

const ctx = canvas.getContext('2d');
flow.paintToCanvas(blockContainer, ctx);
canvas.createPNGStream().pipe(fs.createWriteStream(new URL('inlines-1.png', import.meta.url)));

import * as flow from 'dropflow/with-parse.js';
import fs from 'fs';
import {registerFontAsset} from '../assets/register.js';
import {createCanvas} from 'canvas';

registerFontAsset('Cairo/Cairo-Regular.ttf');
registerFontAsset('Arimo/Arimo-Regular.ttf');

const rootElement = flow.parse(`
  <html style="zoom: 2; height: 100%;">
    <div style="background-color: #ccc; direction: ltr; font-size: 14px; height: 100%;" x-dropflow-log>
      abc<span style="background-color: red;">Hello</span>def
      <span style="background-color: green;">آلو</span>

      <span style="background-color: red;">What's your name?</span>:
      <span style="background-color: green;">ما اسمك</span>؟
    </div>
  </html>
`);

const blockContainer = flow.generate(rootElement);

blockContainer.log();

const canvas = createCanvas(200, 250);
flow.layout(blockContainer, canvas.width, canvas.height);
const ctx = canvas.getContext('2d');
flow.paintToCanvas(blockContainer, ctx);
canvas.createPNGStream().pipe(fs.createWriteStream(new URL('bidi-1.png', import.meta.url)));

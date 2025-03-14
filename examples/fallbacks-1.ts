import * as flow from 'dropflow';
import parse from 'dropflow/parse.js';
import fs from 'fs';
import {createCanvas} from 'canvas';
import {registerFontAsset} from '../assets/register.js';

registerFontAsset('Cairo/Cairo-Regular.ttf');
registerFontAsset('Ramabhadra/Ramabhadra-Regular.ttf');
registerFontAsset('Arimo/Arimo-Regular.ttf');
registerFontAsset('Arimo/Arimo-Italic.ttf');

const rootElement = parse(`
  <div x-dropflow-log style="zoom: 2; font-family: Arimo; background-color: white; text-align: center;">
    <span style="font-style: italic; font-size: 0.5em;">English:</span> Welcome<br>
    <span style="font-style: italic; font-size: 0.5em;">Arabic:</span> أهلاً و سهلاً<br>
    <span style="font-style: italic; font-size: 0.5em;">Hebrew:</span> ברוך הבא
  </div>
`);

const blockContainer = flow.generate(rootElement);

blockContainer.log();

const canvas = createCanvas(400, 150);
flow.layout(blockContainer, canvas.width, canvas.height);

const ctx = canvas.getContext('2d');
flow.paintToCanvas(blockContainer, ctx);
canvas.createPNGStream().pipe(fs.createWriteStream(new URL('fallbacks-1.png', import.meta.url)));

import * as flow from 'dropflow';
import parse from 'dropflow/parse.js';
import fs from 'fs';
import {createCanvas} from 'canvas';

const p = (p: string) => new URL(`../assets/${p}`, import.meta.url);
flow.fonts.add(flow.createFaceFromTablesSync(p('Cairo/Cairo-Regular.ttf')));
flow.fonts.add(flow.createFaceFromTablesSync(p('Ramabhadra/Ramabhadra-Regular.ttf')));
flow.fonts.add(flow.createFaceFromTablesSync(p('Arimo/Arimo-Regular.ttf')));
flow.fonts.add(flow.createFaceFromTablesSync(p('Arimo/Arimo-Italic.ttf')));

const rootElement = parse(`
  <div x-dropflow-log style="zoom: 2; font-family: Arimo; background-color: white; text-align: center;">
    <span style="font-style: italic; font-size: 0.5em;">English:</span> Welcome<br>
    <span style="font-style: italic; font-size: 0.5em;">Arabic:</span> أهلاً و سهلاً<br>
    <span style="font-style: italic; font-size: 0.5em;">Hebrew:</span> ברוך הבא
  </div>
`);

const layout = flow.layout(rootElement);

flow.loadSync(rootElement);
flow.log(layout);

const canvas = createCanvas(400, 150);
flow.reflow(layout, canvas.width, canvas.height);

const ctx = canvas.getContext('2d');
flow.paintToCanvas(layout, ctx);
fs.writeFileSync(new URL('fallbacks-1.png', import.meta.url), canvas.toBuffer());

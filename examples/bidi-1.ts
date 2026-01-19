import * as flow from 'dropflow';
import parse from 'dropflow/parse.js';
import fs from 'fs';
import {createCanvas} from 'canvas';

const p = (p: string) => new URL(`../assets/${p}`, import.meta.url);
flow.fonts.add(flow.createFaceFromTablesSync(p('Cairo/Cairo-Regular.ttf')));
flow.fonts.add(flow.createFaceFromTablesSync(p('Arimo/Arimo-Regular.ttf')));

const rootElement = parse(`
  <html style="zoom: 2; height: 100%;">
    <div style="background-color: #ccc; direction: ltr; font-size: 14px; height: 100%;" x-dropflow-log>
      abc<span style="background-color: red;">Hello</span>def
      <span style="background-color: green;">آلو</span>

      <span style="background-color: red;">What's your name?</span>:
      <span style="background-color: green;">ما اسمك</span>؟
    </div>
  </html>
`);

const layout = flow.layout(rootElement);

flow.log(layout);
flow.loadSync(rootElement);

const canvas = createCanvas(200, 250);
flow.reflow(layout, canvas.width, canvas.height);
const ctx = canvas.getContext('2d');
flow.paintToCanvas(layout, ctx);
fs.writeFileSync(new URL('bidi-1.png', import.meta.url), canvas.toBuffer());

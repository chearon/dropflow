import * as flow from 'dropflow';
import parse from 'dropflow/parse.js';
import fs from 'fs';
import {createCanvas} from 'canvas';

const p = (p: string) => new URL(`../assets/${p}`, import.meta.url);
flow.fonts.add(flow.createFaceFromTablesSync(p('Cairo/Cairo-Regular.ttf')));
flow.fonts.add(flow.createFaceFromTablesSync(p('Raleway/Raleway-Regular.ttf')));

const rootElement = parse(`
  <div style="zoom: 2;" x-dropflow-log>
    <span style="background-color: veronicayellow;">Why</span> is Sommer so
    beautiful? <span style="background-color: veronicayellow; padding: 5px;">They say it's
    because they spilled <span style="background-color: purple; color: white;">
    pretty girl juice</span> when they made her</span>. What do you think?
    <span style="color: #afe; background-color: #666; margin: 10px;">Let us know in the comments!</span>
  </div>
`);

flow.loadSync(rootElement);

const layout = flow.layout(rootElement);

flow.log(layout);

const canvas = createCanvas(300, 400);
flow.reflow(layout, canvas.width, canvas.height);
const ctx = canvas.getContext('2d');
flow.paintToCanvas(layout, ctx);

fs.writeFileSync(new URL('rtl-1.png', import.meta.url), canvas.toBuffer());

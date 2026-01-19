import * as flow from 'dropflow';
import parse from 'dropflow/parse.js';
import fs from 'fs';
import {createCanvas} from 'canvas';

const p = (p: string) => new URL(`../assets/${p}`, import.meta.url);
flow.fonts.add(flow.createFaceFromTablesSync(p('Arimo/Arimo-Bold.ttf')));
flow.fonts.add(flow.createFaceFromTablesSync(p('Arimo/Arimo-Regular.ttf')));
flow.fonts.add(flow.createFaceFromTablesSync(p('Arimo/Arimo-Italic.ttf')));
flow.fonts.add(flow.createFaceFromTablesSync(p('Cousine/Cousine-Regular.ttf')));

const rootElement = parse(`
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

flow.loadSync(rootElement);

const layout = flow.layout(rootElement);
flow.log(layout, undefined, {css: 'zoom'});

const canvas = createCanvas(600, 400);
flow.reflow(layout, canvas.width, canvas.height);

const ctx = canvas.getContext('2d');
flow.paintToCanvas(layout, ctx);
fs.writeFileSync(new URL('inlines-1.png', import.meta.url), canvas.toBuffer());

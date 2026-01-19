import * as flow from 'dropflow';
import parse from 'dropflow/parse.js';
import fs from 'fs';
import {createCanvas} from 'canvas';

const p = (p: string) => new URL(`../assets/${p}`, import.meta.url);
flow.fonts.add(flow.createFaceFromTablesSync(p('Cairo/Cairo-Regular.ttf')));
flow.fonts.add(flow.createFaceFromTablesSync(p('Raleway/Raleway-Regular.ttf')));

const rootElement = parse(`
  <div style="background-color: #ccc; zoom: 2;" x-dropflow-log>
    <div style="line-height: 2.5; direction: rtl;" x-dropflow-log>
      <span style="background-color: red; color: white; border: 2px solid green;">
        أجمل التهاني بمناسبة الميلاد
      </span>
    </div>
    <span style="background-color: red; color: white; border: 2px solid green;">
      (ajmil at-tihānī bimunāsabah al-mīlād)
    </span>
    <div x-dropflow-log>
      عربي
      ع<span style="color: blue;">ر</span>ب<span style="color: red;">ي</span>
    </div>
  </div>
`);

flow.loadSync(rootElement);

const layout = flow.layout(rootElement);

flow.log(layout);

const canvas = createCanvas(200, 600);
flow.reflow(layout, canvas.width, canvas.height);
const ctx = canvas.getContext('2d');
flow.paintToCanvas(layout, ctx);

fs.writeFileSync(new URL('rtl-1.png', import.meta.url), canvas.toBuffer());

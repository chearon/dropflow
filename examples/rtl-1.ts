import * as flow from 'dropflow';
import parse from 'dropflow/parse.js';
import {registerFontAsset} from '../assets/register.js';
import fs from 'fs';
import {createCanvas} from 'canvas';

registerFontAsset('Cairo/Cairo-Regular.ttf'),
registerFontAsset('Raleway/Raleway-Regular.ttf')

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

const blockContainer = flow.generate(rootElement);

blockContainer.log();

const canvas = createCanvas(200, 600);
flow.layout(blockContainer, canvas.width, canvas.height);
const ctx = canvas.getContext('2d');
flow.paintToCanvas(blockContainer, ctx);
canvas.createPNGStream().pipe(fs.createWriteStream(new URL('rtl-1.png', import.meta.url)));

import * as oflo from '../node.js';
import {registerFontAsset} from '../assets/register.js';
import fs from 'fs';
import {createCanvas, registerFont} from 'canvas';

registerFontAsset('Cairo/Cairo-Medium.ttf'),
registerFontAsset('Raleway/static/Raleway-Regular.ttf')

const rootElement = oflo.parse(`
  <div style="background-color: #ccc;">
    <div style="line-height: 2.5; direction: rtl;">
      <span style="background-color: red; color: white; border: 2px solid green;">
        أجمل التهاني بمناسبة الميلاد
      </span>
    </div>
    <span style="background-color: red; color: white; border: 2px solid green;">
      (ajmil at-tihānī bimunāsabah al-mīlād)
    </span>
    <div>
      عربي
      ع<span style="color: blue;">ر</span>ب<span style="color: red;">ي</span>
    </div>
  </div>
`);

const blockContainer = oflo.generate(rootElement);

console.log(blockContainer.repr());

await oflo.layout(blockContainer, 100, 300);

oflo.eachRegisteredFont(match => registerFont(match.file, match));
const canvas = createCanvas(200, 600);
const ctx = canvas.getContext('2d');
ctx.scale(2, 2);
oflo.paintToCanvas(blockContainer, ctx);
canvas.createPNGStream().pipe(fs.createWriteStream(new URL('rtl-1.png', import.meta.url)));

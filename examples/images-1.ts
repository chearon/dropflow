import * as flow from 'dropflow/with-parse.js';
import fs from 'fs';
import {createCanvas, loadImage} from 'canvas';
import {registerFontAsset} from '../assets/register.js';

const image1 = await loadImage('https://picsum.photos/100/100');
const image2 = await loadImage('https://picsum.photos/50/50');

registerFontAsset('Arimo/Arimo-Regular.ttf');

const rootStyle = flow.style({
  paddingTop: 10,
  paddingRight: 10,
  paddingBottom: 10,
  paddingLeft: 10,
  backgroundColor: {r: 200, g: 200, b: 200, a: 1},
  lineHeight: {value: 2, unit: null}
});

const image1Style = flow.style({
  float: 'left',
  width: image1.width,
  height: image1.height,
  marginTop: 6,
  marginRight: 6,
  marginBottom: 6,
  marginLeft: 6
});

const image2Style = flow.style({
  // note: an upcoming API change is that this will become display: 'inline-block'
  display: {outer: 'inline', inner: 'flow-root'},
  width: image2.width,
  height: image2.height
});

const rootElement = flow.dom(
  flow.h('html', {style: rootStyle, attrs: {'x-dropflow-log': 'true'}}, [
    flow.h('div', {
      style: image1Style,
      attrs: {id: 'image1'}
    }),
    `Images aren't supported yet, but there is a way to get them working for the
    impatient, as long as you don't need any other layout layered on top of them.
    To the left is a float allocated to take up the same size as the image. After
    the layout is painted, you can query for that element's block container and
    paint the image into its contentArea. And here's an example of an inline
    image: `,
    flow.h('div', {
      style: image2Style,
      attrs: {id: 'image2'}
    })
  ])
);


// Normal layout, logging
const blockContainer = flow.generate(rootElement);
blockContainer.log();
flow.layout(blockContainer, 600, 400);
const canvas = createCanvas(600, 400);
const ctx = canvas.getContext('2d');
flow.paintToCanvas(blockContainer, ctx);

// Paint image 1
const [image1El] = rootElement.query('#image1')!.boxes as flow.BlockContainer[];
ctx.drawImage(
  image1,
  Math.round(image1El.contentArea.x),
  Math.round(image1El.contentArea.y)
);

// Paint image 2
const [image2El] = rootElement.query('#image2')!.boxes as flow.BlockContainer[];
ctx.drawImage(
  image2,
  Math.round(image2El.contentArea.x),
  Math.round(image2El.contentArea.y)
);

canvas.createPNGStream().pipe(fs.createWriteStream(new URL('images-1.png', import.meta.url)));

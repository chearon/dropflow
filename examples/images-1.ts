import * as flow from 'dropflow';
import fs from 'fs';
import {createCanvas} from 'canvas';

const p = (p: string) => new URL(`../assets/${p}`, import.meta.url);
flow.fonts.add(flow.createFaceFromTablesSync(p('Arimo/Arimo-Regular.ttf')));

const rootStyle = flow.style({
  paddingTop: 10,
  paddingRight: 10,
  paddingBottom: 10,
  paddingLeft: 10,
  backgroundColor: {r: 200, g: 200, b: 200, a: 1},
  lineHeight: {value: 2, unit: null},
  zoom: 2
});

const image1Style = flow.style({
  float: 'left',
  marginTop: 6,
  marginRight: 6,
  marginBottom: 6,
  marginLeft: 6,
  width: 200
});

const image2Style = flow.style({
  width: 50,
  verticalAlign: 'middle'
});

const image3Style = flow.style({
  display: {inner: 'flow-root', outer: 'block'},
  marginLeft: 'auto',
  marginRight: 'auto',
  width: {value: 50, unit: '%'}
});

const rootElement = flow.dom(
  flow.h('html', {style: rootStyle, attrs: {'x-dropflow-log': 'true'}}, [
    flow.h('img', {
      style: image1Style,
      attrs: {src: 'https://chearon.github.io/dropflow/assets/images/frogmage.gif'}
    }),
    flow.h('p', `
      Dropflow now supports images! These are loaded by calling flow.load()
      on the document that contains them.
    `),
    flow.h('p', `
      In CSS2, images fall under the category of "replaced elements". Layout
      sees images, canvas, flash, etc. in the same way: opaque boxes with an
      intrinsic size and a default size of 300x150.
    `),
    flow.h('p', {attrs: {'x-dropflow-log': 'true'}}, [
      `On the left is a floating image. You know it's floating because this
      text always starts to the right of it or underneath it. Here's a picture
      of Ada Lovelace, the well-tempered Great Pyrenees mix as an inline image: `,
      flow.h('img', {
        style: image2Style,
        attrs: {src: 'https://chearon.github.io/dropflow/assets/images/ada.png'}
      }),
      ' after'
    ]),
    flow.h('p', `
      And below you'll see another meme, this time as a block-level element:
    `),
    flow.h('img', {
      style: image3Style,
      attrs: {src: 'https://chearon.github.io/dropflow/assets/images/tiramisu.jpeg'}
    })
  ])
);


// Normal layout, logging
await flow.load(rootElement);
const layout = flow.layout(rootElement);
flow.reflow(layout, 1200, 1800);
flow.log(layout, undefined, {containingBlocks: true});
const canvas = createCanvas(1200, 1800);
const ctx = canvas.getContext('2d');
flow.paintToCanvas(layout, ctx);

fs.writeFileSync(new URL('images-1.png', import.meta.url), canvas.toBuffer());

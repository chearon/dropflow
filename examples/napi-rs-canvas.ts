// Note if you're running this in the dropflow repo, you'll have to npm install
// @napi-rs/canvas and un-exclude this file from tsconfig.json. @napi-rs/canvas
// leaks ambient types: https://github.com/Brooooooklyn/canvas/issues/659
import * as flow from 'dropflow';
import fs from 'fs';
import {createCanvas, GlobalFonts, loadImage} from '@napi-rs/canvas';

// Configure @napi-rs/canvas (1/2)
flow.environment.registerFont = face => {
  const key = GlobalFonts.register(face.getBuffer(), face.uniqueFamily);
  if (key) return () => GlobalFonts.remove(key);
};

// Configure @napi-rs/canvas (2/2)
flow.environment.createDecodedImage = async image => {
  return await loadImage(Buffer.from(image.buffer!));
};

// Register fonts
const p = (p: string) => new URL(`../assets/${p}`, import.meta.url);
flow.fonts.add(flow.createFaceFromTablesSync(p('Cousine/Cousine-Regular.ttf')));
flow.fonts.add(flow.createFaceFromTablesSync(p('Arimo/Arimo-Regular.ttf')));

// Create styles
const zoom = 3;

const rootStyle = flow.style({
  paddingTop: 10,
  paddingRight: 10,
  paddingBottom: 10,
  paddingLeft: 10,
  backgroundColor: {r: 0x33, g: 0x55, b: 0x66, a: 1},
  lineHeight: {value: 2, unit: null},
  zoom,
  color: {r: 0xee, g: 0xee, b: 0xee, a: 1}
});

const spanStyle = flow.style({
  fontFamily: ['Cousine'],
  color: {r: 0x33, g: 0x33, b: 0x33, a: 1},
  backgroundColor: {r: 0xaa, g: 0xaa, b: 0xaa, a: 1},
  borderBottomWidth: 2,
  borderBottomStyle: 'solid'
});

// Create the document!
const rootElement = flow.dom(
  flow.h('html', {style: rootStyle, attrs: {'x-dropflow-log': 'true'}}, [
    flow.h('img', {
      style: flow.style({width: 50, float: 'left'}),
      attrs: {src: 'https://chearon.github.io/dropflow/assets/images/frogmage.gif'}
    }),
    flow.h('div', ['Hello ', flow.h('span', {style: spanStyle}, '@napi-rs/canvas'), '!'])
  ])
);

// Normal layout, logging
await flow.load(rootElement);
const blockContainer = flow.generate(rootElement);
blockContainer.log();
flow.layout(blockContainer, 200 * zoom, 100 * zoom);

// Finally, paint to the surface
const canvas = createCanvas(200 * zoom, 100 * zoom);
const ctx = canvas.getContext('2d');
flow.paintToCanvas(blockContainer, ctx);

fs.writeFileSync(new URL('napi-rs-canvas.png', import.meta.url), await canvas.encode('png'));

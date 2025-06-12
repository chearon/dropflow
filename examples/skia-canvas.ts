// Note if you're running this in the dropflow repo, you'll have to npm install
// skia-canvas and un-exclude this file from tsconfig.json. skia-canvas refers
// to ambient types: https://github.com/samizdatco/skia-canvas/pull/220
import * as flow from '../src/api.js';
import fs from 'fs';
import {fileURLToPath} from 'url';
import {Canvas, FontLibrary, loadImage} from 'skia-canvas';

// Configure skia-canvas (1/2)
flow.environment.registerFont = face => {
  FontLibrary.use(face.uniqueFamily, fileURLToPath(face.url));
};

// Configure skia-canvas (2/2)
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
      style: flow.style({width: 50}),
      attrs: {src: 'https://chearon.github.io/dropflow/assets/images/frogmage.gif'}
    }),
    flow.h('div', ['Hello ', flow.h('span', {style: spanStyle}, 'skia-canvas'), '!'])
  ])
);

// Normal layout, logging
await flow.load(rootElement);
const blockContainer = flow.generate(rootElement);
blockContainer.log();
flow.layout(blockContainer, 200 * zoom, 100 * zoom);

// Finally, paint to the surface
const canvas = new Canvas(200 * zoom, 100 * zoom);
const ctx = canvas.getContext('2d');
flow.paintToCanvas(blockContainer, ctx);

fs.writeFileSync(new URL('skia-canvas.png', import.meta.url), canvas.toBufferSync('png'));

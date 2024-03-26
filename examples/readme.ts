import * as flow from '../src/api.js';
import {createCanvas} from 'canvas';
import fs from 'node:fs';

// Register fonts before layout. This is a required step.
// It is only async when you don't pass an ArrayBuffer
await flow.registerFont(new URL('../assets/Roboto/Roboto-Regular.ttf', import.meta.url));
await flow.registerFont(new URL('../assets/Roboto/Roboto-Bold.ttf', import.meta.url));

// Always create styles at the top-level of your module if you can
const divStyle = {
  backgroundColor: {r: 28, g: 10, b: 0, a: 1},
  textAlign: 'center' as const,
  color: {r: 179, g: 200, b: 144, a: 1}
};

// Since we're creating styles directly, colors have to be defined numerically
const spanStyle = {
  color: {r: 115, g: 169, b: 173, a: 1},
  fontWeight: 700
};

// Create a DOM
const rootElement = flow.dom(
  flow.h('div', {style: divStyle}, [
    'Hello, ',
    flow.h('span', {style: spanStyle}, ['World!'])
  ])
);

// Layout and paint into the entire canvas (see also renderToCanvasContext)
const canvas = createCanvas(250, 50);
flow.renderToCanvas(rootElement, canvas, /* optional density: */ 2);

// Save your image
canvas.createPNGStream().pipe(fs.createWriteStream(new URL('hello.png', import.meta.url)));


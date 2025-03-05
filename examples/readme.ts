import * as flow from '../src/api.js';
import {createCanvas} from 'canvas';
import fs from 'node:fs';

// Register fonts before layout. This is a required step.
// This is synchronous only when the source is an ArrayBuffer or file URL in node
const file = (relative: string) => new URL(relative, import.meta.url);
flow.fonts.add(new flow.FontFace('Roboto', file('fonts/Roboto-Regular.ttf'), {weight: 400}));
flow.fonts.add(new flow.FontFace('Roboto', file('fonts/Roboto-Bold.ttf'), {weight: 700}));

// Always create styles at the top-level of your module if you can.
const divStyle = flow.style({
  backgroundColor: {r: 28, g: 10, b: 0, a: 1},
  textAlign: 'center',
  color: {r: 179, g: 200, b: 144, a: 1}
});

// Since we're creating styles directly, colors are numbers
const spanStyle = flow.style({
  color: {r: 115, g: 169, b: 173, a: 1},
  fontWeight: 700
});

// Create a DOM
const rootElement = flow.dom(
  flow.h('div', {style: divStyle}, [
    'Hello, ',
    flow.h('span', {style: spanStyle}, ['World!'])
  ])
);

// Layout and paint into the entire canvas (see also renderToCanvasContext)
const canvas = createCanvas(250, 50);
flow.renderToCanvas(rootElement, canvas);

// Save your image
canvas.createPNGStream().pipe(fs.createWriteStream(new URL('hello.png', import.meta.url)));


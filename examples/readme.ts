import * as flow from 'dropflow/with-parse.js';
import {createCanvas} from 'canvas';
import fs from 'node:fs';

// Register fonts before layout. This is a required step.
// This is synchronous only when the source is an ArrayBuffer or file URL in node
const file = (relative: string) => new URL(`../assets/${relative}`, import.meta.url);
const roboto1 = new flow.FontFace('Roboto', file('Roboto/Roboto-Regular.ttf'), {weight: 400});
const roboto2 = new flow.FontFace('Roboto', file('Roboto/Roboto-Bold.ttf'), {weight: 700});
flow.fonts.add(roboto1).add(roboto2);
roboto1.load();
roboto2.load();

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
fs.writeFileSync(file('hello.png'), canvas.toBuffer());

import * as flow from 'dropflow';
import parse from 'dropflow/parse.js';
import {registerFontAsset} from '../assets/register.js';
import fs from 'fs';
import {createCanvas} from 'canvas';
import {bench, run} from 'mitata';
import {clearWordCache} from '../src/layout-text.js';

console.time('Add fonts');
registerFontAsset('Arimo/Arimo-Bold.ttf');
registerFontAsset('Arimo/Arimo-Regular.ttf');
registerFontAsset('Arimo/Arimo-Italic.ttf');
registerFontAsset('Cousine/Cousine-Regular.ttf');
console.timeEnd('Add fonts');
console.log();

const rootElement = parse(`
  <div style="zoom: 2; padding: 1em; background-color: #fff; font-family: Arimo;">
    <p style="font: bold 24px Arimo; display: block;">CSS Floats
    <p style="font: italic 16px Arimo; display: block;">An excerpt from the Visual Formatting Model, CSS2 §9.5

    <div style="font-size: 14px;">
      <p style="margin: 1em 0; display: block;">
        A <span style="font-weight: bold;">float</span> is a box that is shifted to the left or right on the current line. The most interesting characteristic of a <span style="font-weight: bold;">float</span> (or <span style="font-style: italic;">"floated"</span> or <span style="font-style: italic;">"floating"</span> box) is that content may flow along its side (or be prohibited from doing so by the <span style="font-family: Cousine;">clear</span> property). Content flows down the right side of a left-floated box and down the left side of a right-floated box. The following is an introduction to float positioning and content flow; the exact rules governing float behavior are given in the description of the <span style="font-family: Cousine;">float</span> property.

      <p style="margin: 1em 0; display: block;">
        A floated box is shifted to the left or right until its outer edge touches the containing block edge or the outer edge of another float. If there is a line box, the outer top of the floated box is aligned with the top of the current line box.

      <p style="margin: 1em 0; display: block;">
        If there is not enough horizontal room for the float, it is shifted downward until either it fits or there are no more floats present.

      <p style="margin: 1em 0; display: block;">
        Since a float is not in the flow, non-positioned block boxes created before and after the float box flow vertically as if the float did not exist. However, the current and subsequent line boxes created next to the float are shortened as necessary to make room for the margin box of the float.

      <p style="margin: 1em 0; display: block;">
        A line box is next to a float when there exists a vertical position that satisfies all of these four conditions: <span style="font-weight: bold;">(a)</span> at or below the top of the line box, <span style="font-weight: bold;">(b)</span> at or above the bottom of the line box, <span style="font-weight: bold;">(c)</span> below the top margin edge of the float, and <span style="font-weight: bold;">(d)</span> above the bottom margin edge of the float.

      <p style="margin: 1em 0; display: block;">
        Note: this means that floats with zero outer height or negative outer height do not shorten line boxes.

      <p style="margin: 1em 0; display: block;">
        If a shortened line box is too small to contain any content, then the line box is shifted downward (and its width recomputed) until either some content fits or there are no more floats present. Any content in the current line before a floated box is reflowed in the same line on the other side of the float. In other words, if inline-level boxes are placed on the line before a left float is encountered that fits in the remaining line box space, the left float is placed on that line, aligned with the top of the line box, and then the inline-level boxes already on the line are moved accordingly to the right of the float (the right being the other side of the left float) and vice versa for rtl and right floats.

      <p style="margin: 1em 0; display: block;">
        The border box of a table, a block-level replaced element, or an element in the normal flow that establishes a new block formatting context (such as an element with <span style="font-family: Cousine;">overflow</span> other than <span style="font-family: Cousine;">visible</span>) must not overlap the margin box of any floats in the same block formatting context as the element itself. If necessary, implementations should clear the said element by placing it below any preceding floats, but may place it adjacent to such floats if there is sufficient space. They may even make the border box of said element narrower than defined by section <span style="font-weight: bold;">10.3.3</span>. CSS2 does not define when a UA may put said element next to the float or by how much said element may become narrower.
    </div>
  </div>
`);

const canvas = createCanvas(1600, 1600);
const ctx = canvas.getContext('2d');

const blockContainer = flow.generate(rootElement);
flow.layout(blockContainer, canvas.width, canvas.height);
ctx.clearRect(0, 0, canvas.width, canvas.height);
flow.paintToCanvas(blockContainer, ctx);
canvas.createPNGStream().pipe(fs.createWriteStream(new URL('perf-1.png', import.meta.url)));

bench('10 paragraphs generate, layout, and paint', () => {
  const blockContainer = flow.generate(rootElement);
  clearWordCache();
  flow.layout(blockContainer, canvas.width, canvas.height);
  ctx.clearRect(0, 0, canvas.width, canvas.height);
  flow.paintToCanvas(blockContainer, ctx);
});

await run();

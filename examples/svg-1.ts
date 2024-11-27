import * as flow from '../src/api-with-parse.js';
import fs from 'fs';

const doc = flow.parse(`
  <html style="background-color: #eee; text-align: center;">
    <div style="line-height: 1; color: white;">
      <div style="display: inline-block;" x-dropflow-log>
        <span style="float: left; padding: 3px; background-color: rgb(212, 35, 41);">n</span>
        <span style="float: left; padding: 3px; background-color: black;">p</span>
        <span style="float: left; padding: 3px; background-color: rgb(41, 124, 187);">r</span>
      </div>
    </div>

    <p>
      <strong>more from</strong>
      <span style="display: inline-block; padding: 5px 10px; background-color: #7598c9; color: white;">news</span>
      <span style="display: inline-block; padding: 5px 10px; background-color: #7598c9; color: white;">culture</span>
      <span style="display: inline-block; padding: 5px 10px; background-color: #7598c9; color: white;">music</span>
    </p>
  </div>
`);

await flow.loadNotoFonts(doc, {paint: false});
const block = flow.generate(doc);
block.log();
flow.layout(block, 600, 100);
const svg = flow.paintToSvg(block);

fs.writeFileSync(new URL('svg-1.svg', import.meta.url), svg);

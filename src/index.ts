///<reference lib="dom" />

import {HTMLElement} from './node';
import {parseNodes} from './parser';
import {createComputedStyle, initialStyle} from './cascade';
import {generateBlockContainer, layoutBlockBox} from './flow';
import {Area} from './box';
import {paint} from './paint/html/index';

const rootComputedStyle = createComputedStyle(initialStyle, {
  fontSize: 16,
  fontFamily: ['Arimo'],
  fontWeight: 300,
  whiteSpace: 'normal',
  tabSize: {value: 8, unit: null},
  lineHeight: {value: 1.6, unit: null},
  position: 'static',
  height: {value: 100, unit: '%'}, // TODO: delete this when height: auto implemented
  writingMode: 'vertical-lr',
  display: {
    outer: 'block',
    inner: 'flow-root'
  }
});

const rootElement = new HTMLElement('', 'root', rootComputedStyle);

// -------------- Step 0 --------------
console.log("Element Tree");
parseNodes(rootElement, `
  <div style="margin: 10px; width: 10px; background-color: purple;"></div>
  <div style="margin: 10px; width: 10px; background-color: purple;"></div>
  <div style="margin: 10px; width: 10px; background-color: purple;">
    <div style="margin: 50px;">
      <div style="margin: 10px; height: 10px; background-color: red;"></div>
      <div style="margin: 10px; height: 10px; background-color: red;"></div>
    </div>
  </div>
`);
console.log(rootElement.repr(0, 'backgroundColor'));
console.log();

// -------------- Step 1 --------------
console.log("Box Tree");
const blockContainer = generateBlockContainer(rootElement);
console.log(blockContainer.repr());
console.log();

if (!blockContainer.isBlockBox()) throw new Error('wat');

// -------------- Step 2 --------------
console.log("Layout");
const initialContainingBlock = new Area('', 0, 0, 300, 500);
blockContainer.setBlockPosition(0, blockContainer.style.writingMode);
layoutBlockBox(blockContainer, {
  bfcWritingMode: blockContainer.style.writingMode,
  bfcStack: [],
  lastBlockContainerArea: initialContainingBlock,
  lastPositionedArea: initialContainingBlock
});
console.log(blockContainer.repr(0, {containingBlocks: true}));
console.log();

// -------------- Step 4 --------------
console.log("Absolutify");
blockContainer.absolutify();
console.log(blockContainer.borderArea.repr());
const blocks = new Set([blockContainer.borderArea]);
for (const [order, child] of blockContainer.descendents(b => b.isBlockBox())) {
  if (order === 'pre') blocks.add(child.borderArea);
}
for (const area of blocks) console.log(area.repr());
console.log();

console.log(paint(blockContainer));

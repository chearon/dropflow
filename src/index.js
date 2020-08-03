import {HTMLElement} from './node';
import {parseNodes} from './parser';
import {createComputedStyle, initialStyle} from './cascade';
import {generateBlockContainer} from './flow';
import {Area} from './box';
import {paint} from './paint/html/index';

const rootDeclaredStyle = {
  fontSize: {value: 16, unit: 'px'},
  fontFamily: 'Helvetica',
  fontWeight: '300',
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
};

const rootComputedStyle = createComputedStyle(-1, rootDeclaredStyle, initialStyle);

const rootElement = new HTMLElement(-1, 'root', rootComputedStyle);

// -------------- Step 0 --------------
console.log("Step 0, element tree");
parseNodes(rootElement, `
  <div style="margin: 10px; height: 100px; background-color: #f00; border-left: 10px solid #000;">
    <div style="border-top: 10px solid #0f0; border-bottom: 5px solid #ff0; height: 10px; padding: 10px; background-color: #00f">
    </div>
  </div>
`);
console.log(rootElement.repr(0, 'backgroundColor'));
console.log();

// -------------- Step 1 --------------
console.log("Step 1, box tree");
const blockContainer = generateBlockContainer(rootElement);
console.log(blockContainer.repr());
console.log();

// -------------- Step 2 --------------
console.log("Step 2, containing block assigment");
const initialContainingBlock = new Area(-1, 0, 0, 300, 500);
blockContainer.assignContainingBlocks({
  lastBlockContainerArea: initialContainingBlock,
  lastPositionedArea: initialContainingBlock
});
console.log(blockContainer.repr(0, {containingBlocks: true}));

// -------------- Step 3 --------------
console.log("Step 3, box sizing");
blockContainer.doBoxSizing(blockContainer.style.writingMode);

// -------------- Step 4 --------------
console.log("Step 4, box positioning");
blockContainer.setBlockPosition(0, blockContainer.style.writingMode);
blockContainer.doBoxPositioning(blockContainer.style.writingMode);
blockContainer.absolutify();

const blocks = new Set([blockContainer.borderArea]);

for (const [order, child] of blockContainer.descendents({isBlockContainer: true})) {
  if (order === 'pre') blocks.add(child.borderArea);
}
console.log([...blocks]);
console.log();
console.log();

console.log(paint(blockContainer));

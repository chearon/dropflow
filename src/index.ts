///<reference lib="dom" />

import {HTMLElement} from './node';
import {parseNodes} from './parser';
import {createComputedStyle, initialStyle} from './cascade';
import {generateBlockContainer, layoutBlockBox} from './flow';
import {Area} from './box';
import {paint} from './paint/html/index';
import FontConfigInit = require('fontconfig');
import ItemizerInit = require('itemizer');
import HarfbuzzInit = require('harfbuzzjs');

const rootComputedStyle = createComputedStyle(initialStyle, {
  fontSize: 16,
  fontFamily: ['Arimo'],
  fontWeight: 300,
  whiteSpace: 'normal',
  tabSize: {value: 8, unit: null},
  position: 'static',
  height: {value: 100, unit: '%'}, // TODO: delete this when height: auto implemented
  display: {
    outer: 'block',
    inner: 'flow-root'
  }
});

const rootElement = new HTMLElement('', 'root', rootComputedStyle);

Promise.all([
  FontConfigInit,
  ItemizerInit,
  HarfbuzzInit
]).then(async ([FontConfig, itemizer, hb]) => {
  const cfg = new FontConfig();

  console.time('Add fonts');
  await Promise.all([
    cfg.addFont('assets/Arimo/Arimo-Bold.ttf'),
    cfg.addFont('assets/Arimo/Arimo-BoldItalic.ttf'),
    cfg.addFont('assets/Arimo/Arimo-Italic.ttf'),
    cfg.addFont('assets/Arimo/Arimo-Regular.ttf'),
    cfg.addFont('assets/Cousine/Cousine-Bold.ttf'),
    cfg.addFont('assets/Cousine/Cousine-BoldItalic.ttf'),
    cfg.addFont('assets/Cousine/Cousine-Italic.ttf'),
    cfg.addFont('assets/Cousine/Cousine-Regular.ttf'),
    cfg.addFont('assets/Tinos/Tinos-Bold.ttf'),
    cfg.addFont('assets/Tinos/Tinos-BoldItalic.ttf'),
    cfg.addFont('assets/Tinos/Tinos-Italic.ttf'),
    cfg.addFont('assets/Tinos/Tinos-Regular.ttf'),
    cfg.addFont('assets/Noto/NotoColorEmoji.ttf'),
    cfg.addFont('assets/Noto/NotoSansSC-Regular.otf'),
    cfg.addFont('assets/Noto/NotoSansJP-Regular.otf'),
    cfg.addFont('assets/Noto/NotoSansTC-Regular.otf'),
    cfg.addFont('assets/Noto/NotoSansKR-Regular.otf'),
    cfg.addFont('assets/Noto/NotoSansHebrew-Regular.ttf'),
    cfg.addFont('assets/Noto/NotoSansCherokee-Regular.ttf'),
    cfg.addFont('assets/Ramabhadra/Ramabhadra-Regular.ttf'),
    cfg.addFont('assets/Roboto/Roboto-Regular.ttf'),
    cfg.addFont('assets/Cairo/Cairo-Regular.ttf')
  ]);
  console.timeEnd('Add fonts');
  console.log();

  // -------------- Step 0 --------------
  console.log('Element Tree');
  // \u0308n
  parseNodes(rootElement, `
    <div style="font-family: Arimo; font-size: 16px; line-height: 1.4;">
      <span style="background-color: #eee;">
        I <span style="font-family: Cousine;">like</span> to write
        <span style="font-size: 3em;">layout code</span>
      </span>
      <span style="background-color: #ddd;">
        because it is
        equal parts <span style="font-weight: bold;">challenging</span>,
        <span style="font-weight: bold;">fun</span>, and
        <span style="font-weight: bold;">arcane</span>.
      </span>
    </div>
  `);
  console.log(rootElement.repr(0, 'backgroundColor'));
  console.log();

  // -------------- Step 1 --------------
  //console.log('Box Tree');
  const blockContainer = generateBlockContainer(rootElement);
  if (!blockContainer.isBlockBox()) throw new Error('wat');
  console.log('Box Tree');
  console.log(blockContainer.repr());
  console.log();

  // -------------- Step 2 --------------
  console.log('Layout');
  const initialContainingBlock = new Area('', 0, 0, 300, 500);
  blockContainer.setBlockPosition(0, blockContainer.style.writingMode);
  const logging = {text: new Set([])};
  await blockContainer.preprocess({fcfg: cfg, itemizer, hb, logging});
  layoutBlockBox(blockContainer, {
    bfcWritingMode: blockContainer.style.writingMode,
    bfcStack: [],
    lastBlockContainerArea: initialContainingBlock,
    lastPositionedArea: initialContainingBlock,
    logging,
    hb
  });

  console.log(blockContainer.repr(0, {containingBlocks: true}));
  console.log();

  // -------------- Step 4 --------------
  console.log('Absolutify');
  blockContainer.absolutify();
  const blocks = new Set([blockContainer.borderArea]);
  for (const [order, child] of blockContainer.descendents(b => b.isBlockBox())) {
    if (order === 'pre') blocks.add(child.borderArea);
  }
  for (const area of blocks) console.log(area.repr());
  console.log();

  // -------------- Step 5 --------------
  console.log('Paint');
  console.log(paint(blockContainer, hb));
});

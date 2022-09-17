import * as oflo from './node.js';

(async () => {
  console.time('Add fonts');
  await Promise.all([
    oflo.registerFont('assets/Arimo/Arimo-Bold.ttf'),
    oflo.registerFont('assets/Arimo/Arimo-BoldItalic.ttf'),
    oflo.registerFont('assets/Arimo/Arimo-Italic.ttf'),
    oflo.registerFont('assets/Arimo/Arimo-Regular.ttf'),
    oflo.registerFont('assets/Cousine/Cousine-Bold.ttf'),
    oflo.registerFont('assets/Cousine/Cousine-BoldItalic.ttf'),
    oflo.registerFont('assets/Cousine/Cousine-Italic.ttf'),
    oflo.registerFont('assets/Cousine/Cousine-Regular.ttf'),
    oflo.registerFont('assets/Tinos/Tinos-Bold.ttf'),
    oflo.registerFont('assets/Tinos/Tinos-BoldItalic.ttf'),
    oflo.registerFont('assets/Tinos/Tinos-Italic.ttf'),
    oflo.registerFont('assets/Tinos/Tinos-Regular.ttf'),
    oflo.registerFont('assets/Noto/NotoColorEmoji.ttf'),
    oflo.registerFont('assets/Noto/NotoSansSC-Regular.otf'),
    oflo.registerFont('assets/Noto/NotoSansJP-Regular.otf'),
    oflo.registerFont('assets/Noto/NotoSansTC-Regular.otf'),
    oflo.registerFont('assets/Noto/NotoSansKR-Regular.otf'),
    oflo.registerFont('assets/Noto/NotoSansHebrew-Regular.ttf'),
    oflo.registerFont('assets/Noto/NotoSansCherokee-Regular.ttf'),
    oflo.registerFont('assets/Ramabhadra/Ramabhadra-Regular.ttf'),
    oflo.registerFont('assets/Roboto/Roboto-Regular.ttf'),
    oflo.registerFont('assets/Cairo/Cairo-Regular.ttf')
  ]);
  console.timeEnd('Add fonts');
  console.log();

  // -------------- Step 0 --------------
  console.time('Element Tree');
  const rootElement = oflo.parse(`
    <div style="font-family: Arimo; font-size: 16px; line-height: 1.4;">
      <span style="background-color: #eee;">
        I <span style="font-family: Cousine;">like</span> to write
        <span style="font-size: 3em;">layout code</span>
      </span>
      <span style="background-color: #ddd;">
        because it is
        <span style="color: #999;">equal parts</span>
        <span style="font-weight: bold;">challenging</span>,
        <span style="font-weight: bold;">fun</span>, and
        <span style="font-weight: bold;">arcane</span>.
      </span>
    </div>
  `);
  console.timeEnd('Element Tree');
  console.log(rootElement.repr(0, 'backgroundColor'));
  console.log();

  // -------------- Step 1 --------------
  console.time('Box Tree');
  const blockContainer = oflo.generate(rootElement);
  console.timeEnd('Box Tree');
  console.log(blockContainer.repr());
  console.log();

  // -------------- Step 2 --------------
  console.time('Layout');
  await oflo.layout(blockContainer, 300, 500);
  console.timeEnd('Layout');
  console.log(blockContainer.repr(0, {containingBlocks: true}));
  console.log();

  // -------------- Step 4 --------------
  const blocks = new Set([blockContainer.borderArea]);
  for (const [order, child] of blockContainer.descendents(b => b.isBlockContainer() && b.isBlockLevel())) {
    if (order === 'pre') blocks.add(child.borderArea);
    if (child.isBlockContainer() && child.isBlockContainerOfInlines()) {
      const [ifc] = child.children;
      for (const float of ifc.floats) {
        blocks.add(float.borderArea);
      }
    }
  }
  for (const area of blocks) console.log(area.repr());
  console.log();

  // -------------- Step 5 --------------
  console.log('Paint');
  console.log(await oflo.paint(blockContainer));
})();

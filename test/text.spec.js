import {expect} from 'chai';
import * as flow from 'dropflow';
import parse from 'dropflow/parse.js';
import {registerFontAsset, unregisterFontAsset} from '../assets/register.ts';
import {G_ID, G_AX, G_SZ} from '../src/text-harfbuzz.ts';
import paint from '../src/paint.ts';
import PaintSpy from './paint-spy.js';
import {Logger} from '../src/util.ts';

const log = new Logger();

function setupLayoutTests() {
  this.reflow = function (html) {
    this.rootElement = parse(html);
    this.layout = flow.layout(this.rootElement);
    flow.reflow(this.layout);
    this.get = function (...args) {
      if (typeof args[0] === 'string') {
        return this.rootElement.query(args[0])?.boxes[0];
      } else {
        let ret = this.layout.root();
        outer: while (args.length) {
          const target = args.shift();
          for (let j = 0, i = ret.treeStart + 1; i <= ret.treeFinal; i++, j++) {
            if (j === target) {
              ret = this.layout.tree[i];
              continue outer;
            } else if (this.layout.tree[i].isBox()) {
              i = this.layout.tree[i].treeFinal;
            }
          }
        }
        return ret;
      }
    };
  };

  this.paint = function () {
    const b = new PaintSpy(this.layout);
    paint(this.layout, b);
    return b;
  };
}

function logIfFailed() {
  if (this.currentTest.state == 'failed') {
    let indent = 0, t = this.currentTest;
    while (t = t.parent) indent += 1;
    log.pushIndent('  '.repeat(indent));
    log.text('Box tree:\n');
    flow.log(this.currentTest.ctx.layout, log);
    log.popIndent();
    log.flush();
  }
}

/**
 * @param {import('../src/layout-box.ts').Box} box
 * @param {'start' | 'end'} side
 */
function getInlineSideSize(box, side) {
  const containingBlock = box.getContainingBlock();
  return box.getInlineSideSize(containingBlock, side);
}

describe('Whitespace collapsing', function () {
  before(setupLayoutTests);

  before(function () {
    registerFontAsset('Arimo/Arimo-Regular.ttf');
  });

  after(function () {
    unregisterFontAsset('Arimo/Arimo-Regular.ttf');
  });

  afterEach(logIfFailed);

  it('collapses whitespace', function () {
    this.reflow(`
      <div id="t">
        \there\n
        <span style="white-space: nowrap;">\t\t  I  go killin  </span>
        \t\n\t  again
      </div>
    `);

    /** @type import('../src/layout-flow.ts').BlockContainerOfInlines */
    const block = this.get('#t')
    expect(block.text).to.equal(' here I go killin again ');
  });

  it('preserves newlines', function () {
    this.reflow(`
      <div id="t">
        <span style="white-space: pre-line;">  \there\n</span>
        <span style="white-space: nowrap;">\t\t  I  go killin  </span>
        \t\n\t  again
      </div>
    `);

    /** @type import('../src/layout-flow.ts').BlockContainerOfInlines */
    const block = this.get('#t')
    expect(block.text).to.equal(' here\n I go killin again ');
  });

  it('preserves everything', function () {
    this.reflow(`
      <div id="t" style="white-space: pre;">  \there\n\t\t  I  go killin    \n\t\n\t  again  </div>
    `);

    /** @type import('../src/layout-flow.ts').BlockContainerOfInlines */
    const block = this.get('#t')
    expect(block.text).to.equal('  \there\n\t\t  I  go killin    \n\t\n\t  again  ');
  });

  it('preserves parts', function () {
    this.reflow(`
      <div id="t">
        \there
        \t\t  I  go killin
        <span style="white-space: pre;">  \n\t\n\t  again  </span>
      </div>
    `);

    /** @type import('../src/layout-flow.ts').BlockContainerOfInlines */
    const block = this.get('#t')
    expect(block.text).to.equal(' here I go killin   \n\t\n\t  again   ');
  });

  it('preserves nested parts', function () {
    this.reflow(
      '<div id="t">' +
        'applejack: an ' +
        '<span style="white-space: pre;">' +
          '<span style="white-space: normal;">' +
            '<span style="white-space: pre;">  o  l  d  e  </span>' +
          '</span>' +
        '</span>' +
        ' American tradition' +
      '</div>'
    );

    /** @type import('../src/layout-flow.ts').BlockContainerOfInlines */
    const block = this.get('#t')
    expect(block.text).to.equal(
      'applejack: an   o  l  d  e   American tradition'
    );
  });

  it('carries over whitespace state when changing white-space modes', function () {
    this.reflow(
      '<div id="t">' +
        '<span style="white-space: pre;"> one\n</span>' +
        ' two ' +
        '<span style="white-space: pre-line;"> three \n</span>' +
        '<span style="white-space: nowrap;"> four </span>' +
        '<span style="white-space: pre-line;"> \n five \n </span>' +
        ' six ' +
        '<span style="white-space: pre;"> \n seven</span>' +
      '</div>'
    );

    /** @type import('../src/layout-flow.ts').BlockContainerOfInlines */
    const block = this.get('#t')
    expect(block.text).to.equal(
      ' one\n two three\n four \nfive\nsix  \n seven'
    );
  });

  it('preserves whitespace correctly when blocks are in newlines', function () {
    this.reflow(`
      this is an ifc
      <span style="white-space: pre;">
        <span>but it has inside of it</span>
        <div>a bfc!   oh no!</div>
      </span>
      but it works!
    `);

    /** @type import('../src/layout-flow.ts').BlockContainerOfInlines */
    const ifc1 = this.layout.tree[1];
    /** @type import('../src/layout-flow.ts').BlockContainerOfInlines */
    const ifc2 = this.layout.tree[9];
    /** @type import('../src/layout-flow.ts').BlockContainerOfInlines */
    const ifc3 = this.layout.tree[12];
    expect(ifc1.text).to.equal(
      'this is an ifc \n        but it has inside of it\n        '
    );

    expect(ifc2.text).to.equal(
      'a bfc!   oh no!'
    );

    expect(ifc3.text).to.equal(
      '\n       but it works! '
    );
  });

  it('doesnt break runs that are consecutive', function () {
    // sorry for the garbled words, it is difficult to repro the bug this
    // is for and took forever to find it so I ran out of time to narrow it
    //
    // (this has been changed once already since the above comment was writen.
    // next time this needs to be touched, probably can just delete it)
    this.reflow(
      'layout code<span>\n</span>\n<span>\nbecause </span>' +
      'it really very <span>is very</span>I love this!<span>\n</span>'
    );
    /** @type import('../src/layout-flow.ts').BlockContainerOfInlines */
    const block = this.get()
    expect(block.text).to.equal('layout code because it really very is veryI love this! ');
  });

  it('preserves whitespace around inline-block', function () {
    this.reflow('abc  <span style="display: inline-block;"></span> 123');
    const block = this.get()
    expect(block.text).to.equal('abc  123');
  });

  it('preserves whitespace around images', function () {
    this.reflow('abc  <img>  123');
    const block = this.get()
    expect(block.text).to.equal('abc  123');
  });
});

describe('Shaping', function () {
  before(setupLayoutTests);

  before(function () {
    registerFontAsset('LigatureSymbolsWithSpaces/LigatureSymbolsWithSpaces.ttf');
    registerFontAsset('Roboto/Roboto-Regular.ttf');
    // The test "it uses the font's internal leading when a shaped item is
    // split onto a new line" relies on Cairo being registered _after_ Arimo.
    // See the test for more info.
    registerFontAsset('Cairo/Cairo-Regular.ttf');
    registerFontAsset('Ramabhadra/Ramabhadra-Regular.ttf');
    registerFontAsset('Arimo/Arimo-Regular.ttf');
  });

  after(function () {
    unregisterFontAsset('LigatureSymbolsWithSpaces/LigatureSymbolsWithSpaces.ttf');
    unregisterFontAsset('Roboto/Roboto-Regular.ttf');
    unregisterFontAsset('Cairo/Cairo-Regular.ttf');
    unregisterFontAsset('Ramabhadra/Ramabhadra-Regular.ttf');
    unregisterFontAsset('Arimo/Arimo-Regular.ttf');
  });

  afterEach(logIfFailed);

  it('doesn\'t infinite loop when the last match can\'t shape two parts', function () {
    this.reflow('𓀀 𓀁');
    /** @type import('../src/layout-flow.ts').BlockContainerOfInlines */
    const inline = this.get();
    expect(inline.items).to.have.lengthOf(3);
    expect(inline.items[0].glyphs[G_ID]).to.equal(0)
    expect(inline.items[1].glyphs[G_ID]).not.to.equal(0);
    expect(inline.items[2].glyphs[G_ID]).to.equal(0);
  });

  describe('Word cache', function () {
    it('doesn\'t use a word cache when the font has ligatures that use spaces', function () {
      this.reflow(`
        <div id="t" style="font: 12px LigatureSymbolsWithSpaces;">
          daily calendar calendar align left
        </div>
      `);

      /** @type import('../src/layout-flow.ts').BlockContainerOfInlines */
      const inline = this.get('#t');

      // 3 137 3 328 3 114 3
      expect(inline.items[0].glyphs[0 * G_SZ + G_ID]).to.equal(3);
      expect(inline.items[0].glyphs[1 * G_SZ + G_ID]).to.equal(137);
      expect(inline.items[0].glyphs[2 * G_SZ + G_ID]).to.equal(3);
      expect(inline.items[0].glyphs[3 * G_SZ + G_ID]).to.equal(328);
      expect(inline.items[0].glyphs[4 * G_SZ + G_ID]).to.equal(3);
      expect(inline.items[0].glyphs[5 * G_SZ + G_ID]).to.equal(114);
      expect(inline.items[0].glyphs[6 * G_SZ + G_ID]).to.equal(3);
    });

    it('uses a non-kerned space in "T " without kerning explicitly set', function () {
      this.reflow('<div id="t" style="font: 12px Roboto;">T M</div>');

      /** @type import('../src/layout-flow.ts').BlockContainerOfInlines */
      const inline = this.get('#t');
      expect(inline.items[0].glyphs[0 * G_SZ + G_AX]).to.equal(1222);
      expect(inline.items[0].glyphs[1 * G_SZ + G_AX]).to.equal(507);
    });

    it('uses a non-kerned T in " T" without kerning explicitly set', function () {
      this.reflow('<div id="t" style="font: 12px Roboto;">M T</div>');

      /** @type import('../src/layout-flow.ts').BlockContainerOfInlines */
      const i5 = this.get('#t');
      expect(i5.items[0].glyphs[1 * G_SZ + G_AX]).to.equal(507);
      expect(i5.items[0].glyphs[2 * G_SZ + G_AX]).to.equal(1222);
    });
  });

  describe('Boundaries', function () {
    it('splits shaping boundaries on fonts', function () {
      this.reflow(`
        <span style="font: 12px Arimo;">Arimo</span>
        <span style="font: 12px Roboto;">Roboto</span>
      `);
      /** @type import('../src/layout-flow.ts').BlockContainerOfInlines */
      const inline = this.get();
      expect(inline.items).to.have.lengthOf(4);
    });

    it('splits shaping boundaries on font-size', function () {
      this.reflow(`
        <span style="font-size: 12px;">a</span>
        <span style="font-size: 13px;">b</span>
      `);
      /** @type import('../src/layout-flow.ts').BlockContainerOfInlines */
      const inline = this.get();
      expect(inline.items).to.have.lengthOf(4);
    });

    it('splits shaping boundaries on font-style', function () {
      this.reflow(`a<span style="font-style: italic;">b</span>`);
      /** @type import('../src/layout-flow.ts').BlockContainerOfInlines */
      const inline = this.get();
      expect(inline.items).to.have.lengthOf(2);
    });

    it('does not split shaping boundaries on line-height', function () {
      this.reflow(`
        <span style="line-height: 3;">Left</span>
        <span style="line-height: 4;">Right</span>
      `);
      /** @type import('../src/layout-flow.ts').BlockContainerOfInlines */
      const inline = this.get();
      expect(inline.items).to.have.lengthOf(1);
    });

    it('splits shaping boundaries based on script', function () {
      this.reflow('Lorem Ipusm העמוד');
      /** @type import('../src/layout-flow.ts').BlockContainerOfInlines */
      const inline = this.get();
      expect(inline.items).to.have.lengthOf(2);
      expect(inline.items[0].face).to.equal(inline.items[1].face);
    });

    it('splits shaping boundaries based on emoji', function () {
      this.reflow('Hey 😃 emoji are kinda hard 🦷');
      /** @type import('../src/layout-flow.ts').BlockContainerOfInlines */
      const inline = this.get();
      expect(inline.items).to.have.lengthOf(4);
    });

    it('splits shaping boundaries on inline padding', function () {
      this.reflow(`It's me, <span style="padding: 1em;">padding boi</span>`);
      /** @type import('../src/layout-flow.ts').BlockContainerOfInlines */
      const inline = this.get();
      expect(inline.items).to.have.lengthOf(2);
      expect(inline.items[1].offset).to.equal(9);
    });

    it('doesn\'t create empty shaped items if shaping boundaries overlap', function () {
      this.reflow(`L<span style="padding: 1em; font: 8px Arimo;">R</span>`);
      /** @type import('../src/layout-flow.ts').BlockContainerOfInlines */
      const inline = this.get();
      expect(inline.items).to.have.lengthOf(2);
      expect(inline.items[1].offset).to.equal(1);
    });

    it('has correct glyph order for Hebrew text', function () {
      // "Hello" according to https://omniglot.com/language/phrases/hebrew.php
      this.reflow('<div style="width: 60px; font: 16px Arimo;">הלו</div>');
      /** @type import('../src/layout-flow.ts').BlockContainerOfInlines */
      const inline = this.get('div');
      expect(inline.items).to.have.lengthOf(1);
      expect(inline.items[0].glyphs).to.have.lengthOf(3 * G_SZ);
      expect(inline.items[0].glyphs[0 * G_SZ + G_ID]).to.equal(2440);
      expect(inline.items[0].glyphs[1 * G_SZ + G_ID]).to.equal(2447);
      expect(inline.items[0].glyphs[2 * G_SZ + G_ID]).to.equal(2439);
    });

    it('doesn\'t create empty shaped items if style and script overlap', function () {
      // "Hello" according to https://omniglot.com/language/phrases/hebrew.php
      this.reflow('Hello <span style="font: 16px Arimo;">הלו</span>');
      /** @type import('../src/layout-flow.ts').BlockContainerOfInlines */
      const inline = this.get();
      expect(inline.items).to.have.lengthOf(2);
    });

    it('assigns levels, inlcuding to LRE..PDF', function () {
      this.reflow('Saying HNY: \u202Bحلول السنة intruding english! الجديدة\u202C');
      /** @type import('../src/layout-flow.ts').BlockContainerOfInlines */
      const inline = this.get();
      expect(inline.items).to.have.lengthOf(5);
      expect(inline.items[0].attrs.level).to.equal(0); // Saying HNY:_
      expect(inline.items[1].attrs.level).to.equal(1); // حلول السنة
      expect(inline.items[2].attrs.level).to.equal(2); // intruding english
      expect(inline.items[3].attrs.level).to.equal(1); // !
      expect(inline.items[4].attrs.level).to.equal(1); // الجديدة
    });

    it('chooses the correct text boundaries when painting emoji', function () {
      this.reflow('paint 😑 this!');
      /** @type import('../src/layout-flow.ts').BlockContainerOfInlines */
      const inline = this.get();
      const b = this.paint();
      b.drewText('paint ');
      b.drewText('😑');
      b.drewText(' this!');
    });
  });

  describe('Fallbacks', function () {
    it('falls back on diacritic é', function () {
      this.reflow('<span style="font: 12px/1 Ramabhadra;">xe\u0301</span>');
      /** @type import('../src/layout-flow.ts').BlockContainerOfInlines */
      const inline = this.get();
      expect(inline.items).to.have.lengthOf(2);
      expect(inline.items[0].glyphs.length).to.satisfy(l => l > 0);
      expect(inline.items[1].glyphs.length).to.satisfy(l => l > 0);
      for (let i = 0; i < inline.items[1].glyphs.length; i += G_SZ) {
        expect(inline.items[1].glyphs[i + G_ID]).not.to.equal(0);
      }
      expect(inline.items[0].face).not.to.equal(inline.items[1].face);
    });

    it('sums to the same string with many reshapes', function () {
      this.reflow('Lorem大併外بينᏣᎳᎩ');
      /** @type import('../src/layout-flow.ts').BlockContainerOfInlines */
      const inline = this.get();
      let s = '';
      for (const item of inline.items) s += item.text();
      expect(s).to.equal('Lorem大併外بينᏣᎳᎩ');
    });

    it('falls back to tofu', function () {
      this.reflow('\uffff');
      /** @type import('../src/layout-flow.ts').BlockContainerOfInlines */
      const inline = this.get();
      expect(inline.items).to.have.lengthOf(1);
      expect(inline.items[0].glyphs).to.have.lengthOf(1 * G_SZ);
      expect(inline.items[0].glyphs[0 * G_SZ + G_ID]).to.equal(0);
    });

    it('reshapes the correct segments', function () {
      this.reflow(`
        <span style="font-family: Arimo, Cairo;">هل تتحدث لغة أخرى بجانب العربية؟</span>
      `);
      /** @type import('../src/layout-flow.ts').BlockContainerOfInlines */
      const inline = this.get();
      expect(inline.items[0].length).to.equal(2);
    });

    it('affect line height when line height is normal', function () {
      this.reflow(`
        <span style="font-family: Arimo, Cairo;">hey هل تتحدث لغة أخرى بجانب العربية؟</span>
      `);
      const [call] = this.paint().getCalls();
      expect(call.t).to.equal('text');
      expect(call.y).to.equal(20.848);
      expect(this.get().getBorderArea().height).to.equal(30);
    });
  });
});

describe('Lines', function () {
  before(setupLayoutTests);

  before(function () {
    registerFontAsset('Ahem/Ahem.ttf');
    registerFontAsset('LigatureSymbolsWithSpaces/LigatureSymbolsWithSpaces.ttf');
    registerFontAsset('Raleway/Raleway-Regular.ttf');
    registerFontAsset('Noto/NotoSansHebrew-Regular.ttf');
    registerFontAsset('Roboto/Roboto-Regular.ttf');
    registerFontAsset('Cairo/Cairo-Regular.ttf');
    registerFontAsset('Ramabhadra/Ramabhadra-Regular.ttf');
    registerFontAsset('Arimo/Arimo-Regular.ttf');
  });

  after(function () {
    unregisterFontAsset('Arimo/Arimo-Regular.ttf');
    unregisterFontAsset('Ramabhadra/Ramabhadra-Regular.ttf');
    unregisterFontAsset('Cairo/Cairo-Regular.ttf');
    unregisterFontAsset('Roboto/Roboto-Regular.ttf');
    unregisterFontAsset('Noto/NotoSansHebrew-Regular.ttf');
    unregisterFontAsset('Raleway/Raleway-Regular.ttf');
    unregisterFontAsset('LigatureSymbolsWithSpaces/LigatureSymbolsWithSpaces.ttf');
    unregisterFontAsset('Ahem/Ahem.ttf');
  });

  afterEach(logIfFailed);

  it('always puts one word per line at minimum', function () {
    this.reflow('<div style="width: 0;">eat lots of peaches</div>');
    expect(this.paint().getCalls()).to.deep.equal([
      {t: 'text', x: 0, y: 14.74609375, text: 'eat', fillColor: '#000'},
      {t: 'text', x: 0, y: 33.14453125, text: 'lots', fillColor: '#000'},
      {t: 'text', x: 0, y: 51.54296875, text: 'of', fillColor: '#000'},
      {t: 'text',x: 0, y: 69.94140625, text: 'peaches', fillColor: '#000'}
    ]);
  });

  it('breaks between shaping boundaries', function () {
    this.reflow(`
      <div style="width: 100px; font: 16px Roboto;">
        Lorem ipsum <span style="font-size: 17px;">lorem ipsum</span>
      </div>
    `);
    /** @type import('../src/layout-flow.ts').BlockContainerOfInlines */
    const block = this.get('div');
    expect(block.items).to.have.lengthOf(3);
    expect(this.paint().getCalls()).to.deep.equal([
      {t: 'text', x: 0, y: 14.84375, text: 'Lorem ipsum', fillColor: '#000'},
      {t: 'text', x: 0, y: 34.521484375, text: 'lorem ipsum', fillColor: '#000'}
    ]);
  });

  it('breaks inside shaping boundaries', function () {
    this.reflow(`
      <div style="width: 100px; font: 16px Roboto;">
        Lorem ipsum lorem ipsum
      </div>
    `);
    /** @type import('../src/layout-flow.ts').BlockContainerOfInlines */
    const block = this.get('div');
    expect(block.items).to.have.lengthOf(2);
    expect(this.paint().getCalls()).to.deep.equal([
      {t: 'text', x: 0, y: 14.84375, text: 'Lorem ipsum', fillColor: '#000'},
      {t: 'text', x: 0, y: 33.59375, text: 'lorem ipsum', fillColor: '#000'}
    ]);
  });

  it('leaves shaping boundaries whole if they can be', function () {
    this.reflow(`
      <div style="width: 16px; font: 16px Roboto;">
        <span style="line-height: 1;">lorem</span><span style="line-height: 2;">ipsum</span>
        <span style="color: green;">lorem</span><span style="color: purple;">ipsum</span>
      </div>
   `);
    /** @type import('../src/layout-flow.ts').BlockContainerOfInlines */
    const block = this.get('div');
    expect(block.items).to.have.lengthOf(2);
  });

  it('splits accurately on hebrew text', function () {
    // "I love you" according to https://omniglot.com/language/phrases/hebrew.php
    // Three words, Arimo@16px in 60px the first two should fit on the first line
    this.reflow('<div style="width: 60px; font: 16px Arimo;">אני אוהב אותך</div>');
    /** @type import('../src/layout-flow.ts').BlockContainerOfInlines */
    const block = this.get('div');
    expect(block.items).to.have.lengthOf(2);
    expect(this.paint().getCalls()).to.deep.equal([
      {t: 'text', x: 0, y: 14.74609375, text: 'אני אוהב', fillColor: '#000'},
      {t: 'text', x: 0, y: 33.14453125, text: 'אותך', fillColor: '#000'}
    ]);
  });

  it('measures break width correctly', function () {
    // there was once a bug in measureWidth that didn't measure the last
    // glyph. "aa a" is < 35px but "aa aa" is > 35px
    this.reflow(`
      <div style="width: 35px; font: 16px Roboto;">aa aa</div>
    `);
    expect(this.paint().getCalls()).to.deep.equal([
      {t: 'text', x: 0, y: 14.84375, text: 'aa', fillColor: '#000'},
      {t: 'text', x: 0, y: 33.59375, text: 'aa', fillColor: '#000'}
    ]);
  });

  it('correctly breaks items when a 1-word line follows 2+ 1-word lines', function () {
    this.reflow(`
      <div style="width: 0px; font: 400 16px Roboto;">
        lorem ipsum lorem
      </div>
    `);

    expect(this.paint().getCalls()).to.deep.equal([
      {t: 'text', x: 0, y: 14.84375, text: 'lorem', fillColor: '#000'},
      {t: 'text', x: 0, y: 33.59375, text: 'ipsum', fillColor: '#000'},
      {t: 'text', x: 0, y: 52.34375, text: 'lorem', fillColor: '#000'}
    ]);
  });

  it('distributes border, margin, and padding to line items', function () {
    // this isn't really wrapping, it's text processing. should I come up
    // with a new word or should the code change to separate concepts?
    this.reflow(`
      <div style="font: 16px Arimo;">
        <span style="padding: 5px;">A</span>
        <span style="border: 10px solid blue;">A</span>
        <span style="margin: 1px;">A</span>
      </div>
    `);

    /** @type import('../src/layout-flow.ts').BlockContainerOfInlines */
    const block = this.get('div');
    expect(block.items).to.have.lengthOf(7);

    expect(this.paint().getCalls()).to.deep.equal([
      {t: 'text', x: 5, y: 14.74609375, text: 'A', fillColor: '#000'},
      {t: 'text', x: 20.671875, y: 14.74609375, text: ' ', fillColor: '#000'},
      {t: 'edge', x: 25, y: -5, length: 31, side: 'top', strokeColor: '#00f', lineWidth: 10},
      {t: 'edge', x: 51, y: -10, length: 38, side: 'right', strokeColor: '#00f', lineWidth: 10},
      {t: 'edge', x: 25, y: 23, length: 31, side: 'bottom', strokeColor: '#00f', lineWidth: 10},
      {t: 'edge', x: 30, y: -10, length: 38, side: 'left', strokeColor: '#00f', lineWidth: 10},
      {t: 'text', x: 35.1171875, y: 14.74609375, text: 'A', fillColor: '#000'},
      {t: 'text', x: 55.7890625, y: 14.74609375, text: ' ', fillColor: '#000'},
      {t: 'text', x: 61.234375, y: 14.74609375, text: 'A', fillColor: '#000'}
    ]);
  });

  it('puts contiguous padding at the top line except the last padding-lefts', function () {
    this.reflow(`
      <div style="width: 50px; font: 16px Arimo;">
        It's a
        <span style="padding: 10px; background-color: #333"></span><!--
        --><span style="padding-left: 11px; background-color: #666"></span>
        <span style="padding-left: 10px; background-color: #999">wrap!</span>
      </div>
    `);

    expect(this.paint().getCalls()).to.deep.equal([
      {t: 'text', x: 0, y: 14.74609375, text: "It's", fillColor: '#000'},
      {t: 'text', x: 0, y: 33.14453125, text: 'a', fillColor: '#000'},
      {t: 'rect', x: 9, y: 9, width: 20, height: 38, fillColor: '#333'},
      {t: 'rect', x: 29, y: 19, width: 11, height: 18, fillColor: '#666'},
      {t: 'rect', x: 0, y: 37, width: 49, height: 18, fillColor: '#999'},
      {t: 'text', x: 10, y: 51.54296875, text: 'wrap!', fillColor: '#000'}
    ]);
  });

  it('starts spans in the middle of text without breaking shaping boundaries', function () {
    this.reflow('<span>One <span style="color: #abc;">Two</span> Spans</span>');
    expect(this.paint().getCalls()).to.deep.equal([
      {t: 'text', x: 0, y: 14.74609375, text: 'One ', fillColor: '#000'},
      {t: 'text', x: 34.6875, y: 14.74609375, text: 'Two', fillColor: '#abc'},
      {t: 'text', x: 64.03125, y: 14.74609375, text: ' Spans', fillColor: '#000'}
    ]);
    /** @type import('../src/layout-flow.ts').BlockContainerOfInlines */
    const block = this.get();
    expect(block.items.length).to.equal(1);
  });

  it('fragments backgrounds into the right lines', function () {
    this.reflow(`
      <div style="width: 100px; font: Arimo;">
        <span style="background-color: #fff;"><!--
        --><span style="background-color: #ccc;">One span </span>
        <span style="background-color: #ddd;">Two spans</span></span>
      </div>
    `);

    /** @type import('../src/layout-flow.ts').BlockContainerOfInlines */
    const block = this.get('div');
    expect(block.items).to.have.lengthOf(2);

    expect(this.paint().getCalls()).to.deep.equal([
      {t: 'rect', x: 0, y: 0, width: 69, height: 18, fillColor: '#fff'},
      {t: 'rect', x: 0, y: 0, width: 69, height: 18, fillColor: '#ccc'},
      {t: 'text', x: 0, y: 14.74609375, text: 'One span', fillColor: '#000'},
      {t: 'rect', x: 0, y: 19, width: 76, height: 18, fillColor: '#fff'},
      {t: 'rect', x: 0, y: 19, width: 76, height: 18, fillColor: '#ddd'},
      {t: 'text', x: 0, y: 33.14453125, text: 'Two spans', fillColor: '#000'}
    ]);
  });

  it('considers padding-right on a break as belonging to the left word', function () {
    this.reflow(`
      <div style="width: 70px; font: 16px Arimo;">
        Word <span style="padding-right: 70px;">fits </span>padding
      </div>
    `);

    expect(this.paint().getCalls()).to.deep.equal([
      {t: 'text', x: 0, y: 14.74609375, text: 'Word', fillColor: '#000'},
      {t: 'text', x: 0, y: 33.14453125, text: 'fits', fillColor: '#000'},
      {t: 'text', x: 0, y: 51.54296875, text: 'padding', fillColor: '#000'}
    ]);
  });

  it('ignores empty spans when assigning padding to words', function () {
    this.reflow(`
      <div style="width: 70px; font: 16px Arimo;">
        Word <span style="padding-left: 70px;"><span></span>hey</span>
      </div>
    `);

    expect(this.paint().getCalls()).to.deep.equal([
      {t: 'text', x: 0, y: 14.74609375, text: 'Word', fillColor: '#000'},
      {t: 'text', x: 70, y: 33.14453125, text: 'hey', fillColor: '#000'}
    ]);
  });

  it('adds padding that wasn\'t measured for fit to the line', function () {
    this.reflow(`
      <div style="width: 70px; font: 16px Arimo;">
        Word <span style="padding-right: 30px;">x </span>x
      </div>
    `);

    expect(this.paint().getCalls()).to.deep.equal([
      {t: 'text', x: 0, y: 14.74609375, text: 'Word', fillColor: '#000'},
      {t: 'text', x: 0, y: 33.14453125, text: 'x ', fillColor: '#000'},
      {t: 'text', x: 42.4453125, y: 33.14453125, text: 'x', fillColor: '#000'}
    ]);
  });

  it('adds span start padding to previous line when before a break', function () {
    this.reflow(`
      <div style="font: 16px Arimo; width: 5em;">
        Hey<span style="padding-left: 5em;"> wrap</span>
      </div>
    `);

    expect(this.paint().getCalls()).to.deep.equal([
      {t: 'text', x: 0, y: 14.74609375, text: 'Hey', fillColor: '#000'},
      {t: 'text', x: 0, y: 33.14453125, text: 'wrap', fillColor: '#000'}
    ]);
  });


  it('advances text appropriately with multiple sized spans on the line break', function () {
    this.reflow(`
      <div style="width: 300px; font: 16px Arimo;">
        Give_me_the_next_span
        <span style="padding-left: 300px;"></span><span style="padding-left: 150px;">not me</span>
      </div>
    `);

    expect(this.paint().getCalls()).to.deep.equal([
      {t: 'text', x: 0, y: 14.74609375, text: 'Give_me_the_next_span', fillColor: '#000'},
      {t: 'text', x: 150, y: 33.14453125, text: 'not me', fillColor: '#000'}
    ]);
  });

  it('calculates line height with the correct shaped item/inline pairings', function () {
    this.reflow(`
      <div style="width: 0;"><span style="font: 16px/2 Noto Sans Hebrew;">אוטו </span><span style="font: 16px/3 Cairo;">Car</span></div>
    `);

    /** @type import('../src/layout-flow.ts').BlockContainerOfInlines */
    const block = this.get('div');
    expect(block.getContentArea().height).to.equal(80);
    expect(this.paint().getCalls()).to.deep.equal([
      // Noto Sans ascender = 1069/1000 descender = 293/1000
      {t: 'text', x: 0, y: 22.208, text: 'אוטו', fillColor: '#000'},
      // Cairo ascender = 1303/1000 descender = 571/1000
      {t: 'text', x: 0, y: 61.855999999999995, text: 'Car', fillColor: '#000'}
    ]);
  });

  it('supports line-height: px', function () {
    this.reflow(`
      <div style="font: 16px/100px Arimo;">The lines are so big!</div>
    `);

    /** @type import('../src/layout-flow.ts').BlockContainerOfInlines */
    const block = this.get('div');
    expect(block.getContentArea().height).to.equal(100);
  });

  it('uses the correct line height when multiple spans cross a shaped item', function () {
    this.reflow(`
      <div style="width: 16px; font: 16px Roboto;">
        <span style="line-height: 1;">lorem</span><span style="line-height: 2;">ipsum</span>
      </div>
   `);
    /** @type import('../src/layout-flow.ts').BlockContainerOfInlines */
    const block = this.get('div');
    expect(block.getContentArea().height).to.equal(32);
  });

  it('uses the correct line height when a shaped item is broken', function () {
    this.reflow(`
      <div style="width: 0; font: 16px Roboto;">
        <span style="line-height: 32px;">lorem</span> <span style="line-height: 64px;">ipsum</span>
      </div>
   `);
    /** @type import('../src/layout-flow.ts').BlockContainer */
    const block = this.get('div');
    expect(block.getContentArea().height).to.equal(32 + 64);
  });

  it('uses the correct inline side to create shaping boundaries', function () {
    this.reflow(`
      <div style="width: 300px; direction: rtl; font: 16px Cairo;">
        <span style="padding-left: 1em;">أنا </span>بخير شكرا و أنت؟
      </div>
    `);

    /** @type import('../src/layout-flow.ts').BlockContainerOfInlines */
    const block = this.get('div');
    expect(block.items).to.have.lengthOf(2);
    expect(block.items[0].end()).to.equal(5);
  });

  it('adds new lines at <br>', function () {
    // Translation from Arabic:
    // How are you?
    // I'm fine thank you, and you?
    this.reflow(`
      <div style="width: 150px; direction: rtl; font: 16px Cairo;">
        كيف حالك؟
        <br>أنا بخير شكرا و أنت؟
      </div>
    `);

    /** @type import('../src/layout-flow.ts').BlockContainerOfInlines */
    const block = this.get('div');
    expect(block.items).to.have.lengthOf(2);
    expect(block.items[0].end()).to.equal(11);
  });

  it('paints an inline with a hard break immediately after', function () {
    this.reflow(`
      <span style="background-color: green; padding: 0 10px;"><br>f</span>
    `);

    expect(this.paint().getCalls()).to.deep.equal([
      {t: 'rect', x: 0, y: 0, width: 10, height: 18, fillColor: '#008000'},
      {t: 'rect', x: 0, y: 19, width: 14, height: 18, fillColor: '#008000'},
      {t: 'text', x: 0, y: 33.14453125, text: 'f', fillColor: '#000'}
    ]);
  });

  it('sets the height of an ifc box correctly', function () {
    this.reflow(`
      <div style="width: 500px; font: 16px Ramabhadra">
        <span style="font: 16px Roboto;">I could be<br>reading a book</span>
        <span style="font: 12px Arimo;">But I like writing layout engines instead</span>
      </div>
    `);

    expect(this.get('div').getContentArea().height).to.equal(61);
  });

  it('doesn\'t set the height if it\'s explicitly set', function () {
    this.reflow(`
      <div style="height: 50px; width: 100px; font: 16px Arimo;">
        I could be reading a book but I like writing layout engines instead
      </div>
    `);

    expect(this.get('div').getContentArea().height).to.equal(50);
  });

  it('carries over colors and line heights correctly', function () {
    this.reflow(`
      <div style="width: 0; line-height: 32px; font: 10px Ahem;">
        break
        it
        <span style="color: red; line-height: 64px;">down</span>
      </div>
    `);

    expect(this.paint().getCalls()).to.deep.equal([
      {t: 'text', x: 0, y: 8, text: 'break', fillColor: '#000'},
      {t: 'text', x: 0, y: 18, text: 'it', fillColor: '#000'},
      {t: 'text', x: 0, y: 55, text: 'down', fillColor: '#f00'}
    ]);
  });

  it('takes strut into account', function () {
    this.reflow(`
      <div style="font: 16px/1 Arimo;"><span style="font: 4px Arimo;">tiny!</span></div>
    `);

    /** @type import('../src/layout-flow.ts').BlockContainerOfInlines */
    const block = this.get('div');
    expect(block.getContentArea().height).to.equal(16);
  });

  it('takes inline struts into account', function () {
    this.reflow(`
      <!-- Cairo does not have Phi. Cairo has larger suggested leading than Arimo. -->
      <div style="font: 16px/0 Arimo;">
        <span style="font: 16px Cairo, Arimo;">ɸ</span>
      </div>
    `);

    /** @type import('../src/layout-flow.ts').BlockContainerOfInlines */
    const block = this.get('div');
    expect(block.getContentArea().height).to.equal(30);
  });

  it('takes inline struts into account even if they have no content', function () {
    this.reflow(`
      <div style="font: 16px/0 Arimo;">
        whoop_de_do<span style="font: 16px Cairo;"></span>
      </div>
    `);

    /** @type import('../src/layout-flow.ts').BlockContainerOfInlines */
    const block = this.get('div');
    expect(block.getContentArea().height).to.equal(30);
  });

  it('sets box to linebox height when it\'s a bfc and ifc', function () {
    this.reflow(`
      <div id="t" style="display: flow-root; line-height: 20px;">woeisme</div>
    `);

    /** @type import('../src/layout-flow.ts').BlockContainer */
    const t = this.get('#t');
    expect(t.getContentArea().height).to.equal(20);
  });

  it('uses the right block position for a wrapped word with a hard break at the end', function () {
    this.reflow(`
      <div style="font: 16px/20px Arimo; width: 80px;">
        A simple test<br>
      </div>
    `);

    expect(this.paint().getCalls()).to.deep.equal([
      {t: 'text', x: 0, y: 15.546875, text: 'A simple', fillColor: '#000'},
      {t: 'text', x: 0, y: 35.546875, text: 'test', fillColor: '#000'}
    ]);
  });

  it('doesn\'t wrap in spans with soft wraps turned off', function () {
    this.reflow(`
      <div style="font: 16px Arimo; width: 100px;">
        I like
        <span style="white-space: nowrap;">tests that aren't hard to think about</span>
        because easy
      </div>
    `);

    expect(this.paint().getCalls()).to.deep.equal([
      {t: 'text', x: 0, y: 14.74609375, text: 'I like', fillColor: '#000'},
      {t: 'text', x: 0, y: 33.14453125, text: "tests that aren't hard to think about", fillColor: '#000'},
      {t: 'text', x: 0, y: 51.54296875, text: 'because easy', fillColor: '#000'}
    ]);
  });

  it('does wrap on a <br> inside a nowrap span', function () {
    this.reflow(`
      <div style="font: 16px Arimo; width: 100px;">
        I like
        <span style="white-space: nowrap;">tests that aren't<br>hard to think about</span>
        because easy
      </div>
    `);

    expect(this.paint().getCalls()).to.deep.equal([
      {t: 'text', x: 0, y: 14.74609375, text: 'I like', fillColor: '#000'},
      {t: 'text', x: 0, y: 33.14453125, text: "tests that aren't", fillColor: '#000'},
      {t: 'text', x: 0, y: 51.54296875, text: 'hard to think about', fillColor: '#000'},
      {t: 'text', x: 0, y: 69.94140625, text: 'because easy', fillColor: '#000'}
    ]);
  });

  it('wraps on soft wraps inside a nowrap span', function () {
    this.reflow(`
      <div style="font: 16px Arimo; width: 100px;">
        I like
        <span style="white-space: nowrap;">tests that <span style="white-space: normal;">aren't hard</span> to think about</span>
        because easy
      </div>
    `);

    expect(this.paint().getCalls()).to.deep.equal([
      {t: 'text', x: 0, y: 14.74609375, text: 'I like', fillColor: '#000'},
      {t: 'text', x: 0, y: 33.14453125, text: 'tests that ', fillColor: '#000'},
      {t: 'text', x: 69.3671875, y: 33.14453125, text: "aren't", fillColor: '#000'},
      {t: 'text', x: 0, y: 51.54296875, text: 'hard', fillColor: '#000'},
      {t: 'text', x: 32.0234375, y: 51.54296875, text: ' to think about', fillColor: '#000'},
      {t: 'text', x: 0, y: 69.94140625, text: 'because easy', fillColor: '#000'}
    ]);
  });

  it('lays out entirely nowrap text', function () {
    this.reflow(`
      <div id="t" style="font: 16px Arimo; width: 100px; white-space: nowrap;">
        I like tests that aren't hard to think about because easy
      </div>
    `);

    expect(this.paint().getCalls()).to.deep.equal([
      {
        t: 'text',
        x: 0,
        y: 14.74609375,
        text: "I like tests that aren't hard to think about because easy",
        fillColor: '#000'
      }
    ]);
  });

  it('follows all hard breaks', function () {
    this.reflow(`
      <div id="t" style="white-space: pre;">
      second line
      third line
      fourth line
      </div>
    `);

    expect(this.paint().getCalls()).to.deep.equal([
      {t: 'text', x: 0, y: 33.14453125, text: '      second line', fillColor: '#000'},
      {t: 'text', x: 0, y: 51.54296875, text: '      third line', fillColor: '#000'},
      {t: 'text', x: 0, y: 69.94140625, text: '      fourth line', fillColor: '#000'},
      {t: 'text', x: 0, y: 88.33984375, text: '      ', fillColor: '#000'}
    ]);

    /** @type import('../src/layout-flow.ts').BlockContainerOfInlines */
    const block = this.get('#t');
    expect(block.items.length).to.equal(5);
  });

  it('breaks ligatures with internal break opportunities', function () {
    this.reflow(`
      <div id="t" style="font: 16px/1.4 Raleway; width: 95px;">
        Affable waf&ZeroWidthSpace;fle
      </div>
    `);

    expect(this.paint().getCalls()).to.deep.equal([
      {t: 'text', x: 0, y: 16.848, text: 'Affable waf\u200b', fillColor: '#000'},
      {t: 'text', x: 0, y: 39.248, text: 'fle', fillColor: '#000'}
    ]);

    /** @type import('../src/layout-flow.ts').BlockContainerOfInlines */
    const block = this.get('div');
    expect(block.items.length).to.equal(2);
    expect(block.items[1].offset).to.equal(13);
    expect(block.items[1].glyphs[0 * G_SZ + G_ID]).to.equal(474);
  });

  it('breaks after ligature when it fits', function () {
    // Note: with word cache, glyphs sum to 100.176. Without, it's 99.728
    this.reflow(`
      <div id="t" style="font: 16px/1.4 Raleway; width: 101px;">
        Affable waf&ZeroWidthSpace;fle
      </div>
    `);

    expect(this.paint().getCalls()).to.deep.equal([
      {t: 'text', x: 0, y: 16.848, text: 'Affable waf\u200bfle', fillColor: '#000'}
    ]);
  });

  it('breaks before ligature when it doesn\'t fit', function () {
    this.reflow(`
      <div id="t" style="font: 16px/1.4 Raleway; width: 52px;">
        Affable waf&ZeroWidthSpace;fle
      </div>
    `);

    expect(this.paint().getCalls()).to.deep.equal([
      {t: 'text', x: 0, y: 16.848, text: 'Affable', fillColor: '#000'},
      {t: 'text', x: 0, y: 39.248, text: 'waf\u200bfle', fillColor: '#000'}
    ]);
  });

  it('remembers in-ligature measure state when carried to next line', function () {
    this.reflow(`
      <div style="font: 24px LigatureSymbolsWithSpaces; width: 100px;">
        Ligature symbols
        daily calendar calendar align left align center align right
      </div>
    `);

    expect(this.paint().getCalls()).to.deep.equal([
      {t: 'text', x: 0, y: 20.2734375, text: 'Ligature', fillColor: '#000'},
      {t: 'text', x: 0, y: 46.4296875, text: 'symbols', fillColor: '#000'},
      {t: 'text', x: 0, y: 72.5859375, text: 'daily calendar calendar align left align center', fillColor: '#000'},
      {t: 'text', x: 0, y: 98.7421875, text: 'align right', fillColor: '#000'}
    ]);
  });

  it('adds a soft hyphen if one fits after a &shy', function () {
    this.reflow(`
      <div id="t" style="font: 16px Arimo; width: 119px;">
        Characters com&shy;bine to create words
      </div>
    `);

    /** @type import('../src/layout-flow.ts').BlockContainerOfInlines */
    const block = this.get('div');
    expect(block.items).to.have.lengthOf(3);
    expect(block.items[0].glyphs.at(-G_SZ + G_ID)).to.equal(2623);

    expect(this.paint().getCalls()).to.deep.equal([
      {t: 'text', x: 0, y: 14.74609375, text: 'Characters com‐', fillColor: '#000'},
      {t: 'text', x: 0, y: 33.14453125, text: 'bine to create', fillColor: '#000'},
      {t: 'text', x: 0, y: 51.54296875, text: 'words', fillColor: '#000'}
    ]);
  });

  it('doesn\'t add a hyphen if it wouldn\'t fit', function () {
    this.reflow(`
      <div id="t" style="font: 16px Arimo; width: 118px;">
        Characters com&shy;bine to create words
      </div>
    `);

    expect(this.paint().getCalls()).to.deep.equal([
      {t: 'text', x: 0, y: 14.74609375, text: 'Characters', fillColor: '#000'},
      {t: 'text', x: 0, y: 33.14453125, text: 'com\u00adbine to', fillColor: '#000'},
      {t: 'text', x: 0, y: 51.54296875, text: 'create words', fillColor: '#000'}
    ]);

    /** @type import('../src/layout-flow.ts').BlockContainerOfInlines */
    const block = this.get('div');
    expect(block.items[0].glyphs.at(-G_SZ + G_ID)).to.equal(3);
    expect(block.items[1].offset).to.equal(12);
  });

  it('adds a soft hyphen to Arabic and keeps medial form', function () {
    this.reflow(`
      <div id="t" style="direction: rtl; font: 24px Cairo; width: 51px;">
        دامي&shy;دى
      </div>
    `);

    expect(this.paint().getCalls()).to.deep.equal([
      {t: 'text', x: 0.02400000000000091, y: 31.272000000000002, text: 'دامي-', fillColor: '#000'},
      {t: 'text', x: 16.656, y: 76.248, text: 'دى', fillColor: '#000'}
    ]);

    /** @type import('../src/layout-flow.ts').BlockContainerOfInlines */
    const block = this.get('div');
    expect(block.items[0].glyphs[0 * G_SZ + G_ID]).to.equal(672); // hyphen
    expect(block.items[0].glyphs[1 * G_SZ + G_ID]).to.equal(697); // shy
    expect(block.items[0].glyphs[2 * G_SZ + G_ID]).to.equal(441); // yeh, medial
    expect(block.items[1].offset).to.equal(6);
  });

  it('carries over leading to the next line', function () {
    this.reflow(`
      <div id="t" style="font: 16px/1 Arimo; width: 0;">
        <span style="line-height: 2;">Scarves of red</span>
      </div>
    `);

    expect(this.paint().getCalls()).to.deep.equal([
      {t: 'text', x: 0, y: 21.546875, text: 'Scarves', fillColor: '#000'},
      {t: 'text', x: 0, y: 53.546875, text: 'of', fillColor: '#000'},
      {t: 'text', x: 0, y: 85.546875, text: 'red', fillColor: '#000'}
    ]);
  });

  it('positions RTL items at the end of the CB', function () {
    this.reflow(`
      <div id="t" style="width: 100px; direction: rtl;">
        whereami
      </div>
    `);

    expect(this.paint().getCalls()).to.deep.equal([
      {t: 'text', x: 30.640625, y: 14.74609375, text: 'whereami', fillColor: '#000'}
    ]);
  });

  it('measures the last glyph in an RTL item correctly', function () {
    this.reflow(`
      <div id="t" style="width: 100px; direction: rtl;">
        أسف<br>
      </div>
    `);

    expect(this.paint().getCalls()).to.deep.equal([
      {t: 'text', x: 65.584, y: 20.848, text: 'أسف', fillColor: '#000'}
    ]);
  });

  it('breaks shaping boundaries on negative margins', function () {
    this.reflow(`
      <div>
        left <span style="margin-left: -10px;">right</span>
      </div>
    `);

    expect(this.paint().getCalls()).to.deep.equal([
      {t: 'text', x: 0, y: 14.74609375, text: 'left ', fillColor: '#000'},
      {t: 'text', x: 15.7890625, y: 14.74609375, text: 'right', fillColor: '#000'}
    ]);
  });

  it('takes margin-right into account on the line', function () {
    // a dumb mistake caused this one
    this.reflow(`
      <div style="width: 100px;">
        big <span style="margin-right: 100px;"></span> crane
      </div>
    `);

    expect(this.paint().getCalls()).to.deep.equal([
      {t: 'text', x: 0, y: 14.74609375, text: 'big', fillColor: '#000'},
      {t: 'text', x: 0, y: 33.14453125, text: 'crane', fillColor: '#000'}
    ]);
  });

  it('follows text-align: end', function () {
    this.reflow(`
      <div id="t1" style="text-align: end; direction: rtl; font: 10px Ahem; width: 100px;">
        burrito
      </div>
      <div id="t2" style="text-align: end; font: 10px Ahem; width: 100px;">
        burrito
      </div>
    `);

    /** @type import('../src/layout-flow.ts').BlockContainerOfInlines */
    const block1 = this.get('#t1');
    expect(block1.items[0].x).to.equal(0);
    /** @type import('../src/layout-flow.ts').BlockContainerOfInlines */
    const block2 = this.get('#t2');
    expect(block2.items[0].x).to.equal(30);
  });

  describe('Justify', function () {
    it('adds space between words to fill the line', function () {
      this.reflow(`
        <div id="t" style="text-align: justify; font: 10px Ahem; width: 150px;">
          The Scioto River flows
        </div>
      `);

      /** @type import('../src/layout-flow.ts').BlockContainerOfInlines */
      const block = this.get('#t');
      expect(block.items.length).to.equal(2);
      expect(block.items[0].offset).to.equal(0);
      expect(block.items[1].offset).to.equal(12);

      expect(block.items[0].glyphs[0 * G_SZ + G_AX]).to.equal(0);
      expect(block.items[0].glyphs[4 * G_SZ + G_AX]).to.equal(6000);
      expect(block.items[1].glyphs[5 * G_SZ + G_AX]).to.equal(1000);
      expect(block.items[1].glyphs[11 * G_SZ + G_AX]).to.equal(0);
    });

    it('positions a replaced element as the only occupant of a line correctly', function () {
      this.reflow(`
        <div style="text-align: justify; font: 10px Ahem; width: 200px;">
          <img id="t" style="width: 180px; height: 10px;">
          and Ada
        </div>
      `);

      /** @type import('../src/layout-flow.ts').ReplacedBox */
      const box = this.get('#t');
      expect(box.getContentArea().x).to.equal(0);
    });

    it('positions an inline-block at the end of a line correctly', function () {
      this.reflow(`
        <div style="text-align: justify; font: 10px Ahem; width: 100px;">
          wades <div id="t" style="display: inline-block;">in</div> it
        </div>
      `);

      /** @type import('../src/layout-flow.ts').ReplacedBox */
      const box = this.get('#t');
      expect(box.getContentArea().x).to.equal(80);
    });

    it('aligns overflowing words aligned according to direction', function () {
      this.reflow(`
        <div id="t" style="direction: rtl; text-align: justify; font: 10px Ahem; width: 150px;">
          Itissuperhotoutside right now
        </div>
      `);

      /** @type import('../src/layout-flow.ts').BlockContainerOfInlines */
      const block = this.get('#t');
      expect(block.items[0].x).to.equal(-40);
    });
  });

  describe('Whitespace', function () {
    it('skips whitespace at the beginning of the line if it\'s collapsible', function () {
      this.reflow(`
        <div style="font: 16px Arimo; width: 50px;">        hi hi</div>
      `);
      expect(this.paint().getCalls()).to.deep.equal([
        {t: 'text', x: 0, y: 14.74609375, text: 'hi hi', fillColor: '#000'}
      ]);
    });

    it('keeps whitespace at the beginning of the line when it\'s not collapsible', function () {
      this.reflow(`
        <div style="font: 16px Arimo; white-space: pre-wrap; width: 50px;">        hi hi</div>
      `);
      expect(this.paint().getCalls()).to.deep.equal([
        {t: 'text', x: 0, y: 14.74609375, text: '        hi ', fillColor: '#000'},
        {t: 'text', x: 0, y: 33.14453125, text: 'hi', fillColor: '#000'}
      ]);
    });

    it('measures whitespace before a break if the break has padding on it', function () {
      // "Word_fits<5>" does fit on a line, but "Word_fits_<5>" does not
      //
      // Interestingly, Firefox fails this one - it puts the padding-right on the
      // first line right up next to the end of the word "fits", even though that
      // appears incorrect since we put a space before the padding in the source below.
      this.reflow(`
        <div style="width: 70px; font: 16px Arimo;">
          Word <span style="padding-right: 5px;">fits </span>padding
        </div>
      `);

      expect(this.paint().getCalls()).to.deep.equal([
        {t: 'text', x: 0, y: 14.74609375, text: 'Word', fillColor: '#000'},
        {t: 'text', x: 0, y: 33.14453125, text: 'fits', fillColor: '#000'},
        {t: 'text', x: 0, y: 51.54296875, text: 'padding', fillColor: '#000'}
      ]);
    });

    it('collapses whitespace at the start of the line', function () {
      this.reflow(`
        <div style="width: 100px; font: 16px Arimo;">
          Oh give me a home where the buffalo roam
        </div>
      `);

      /** @type import('../src/layout-flow.ts').BlockContainerOfInlines */
      const block = this.get('div');
      expect(block.items[0].glyphs[0 * G_SZ + G_AX]).to.equal(0);
    });

    it('collapses whitespace after bidi reordering', function () {
      this.reflow(`
        <div style="width: 100px; font: 16px Cairo, Arimo; direction: rtl;">
          هبني home حيث يسرح الجاموس
        </div>
      `);

      /** @type import('../src/layout-flow.ts').BlockContainerOfInlines */
      const block = this.get('div');
      const arabic = block.items[0]; // هبني
      expect(arabic.glyphs.at(-G_SZ + G_AX)).to.equal(0);
    });

    it('starts a new linebox after \\n when newlines are preserved', function () {
      this.reflow(`
        <div style="width: 300px; font: 16px/20px Arimo; white-space: pre-line;">
          Funny it is
          The things that I spout
          When I have to make words
          To test the code out
        </div>
      `);

      expect(this.paint().getCalls()).to.deep.equal([
        {t: 'text', x: 0, y: 35.546875, text: 'Funny it is', fillColor: '#000'},
        {t: 'text', x: 0, y: 55.546875, text: 'The things that I spout', fillColor: '#000'},
        {t: 'text', x: 0, y: 75.546875, text: 'When I have to make words', fillColor: '#000'},
        {t: 'text', x: 0, y: 95.546875, text: 'To test the code out', fillColor: '#000'}
      ]);

      /** @type import('../src/layout-flow.ts').BlockContainerOfInlines */
      const block = this.get('div');
      expect(block.getContentArea().height).to.equal(120);
    });

    it('can make empty lineboxes when newlines are preserved', function () {
      this.reflow(`
        <div style="width: 300px; font: 16px/20px Arimo; white-space: pre-line;">
          I have to make words


          To test the code out
        </div>
      `);

      expect(this.paint().getCalls()).to.deep.equal([
        {t: 'text', x: 0, y: 35.546875, text: 'I have to make words', fillColor: '#000'},
        {t: 'text', x: 0, y: 95.546875, text: 'To test the code out', fillColor: '#000'}
      ]);

      /** @type import('../src/layout-flow.ts').BlockContainerOfInlines */
      const block = this.get('div');
      expect(block.getContentArea().height).to.equal(120);
    });

    it('makes two lineboxes for <br>\\n or \\n<br> when newlines are preserved', function () {
      this.reflow('<div style="white-space: pre-line;">a\n<br>b<br>\nc');

      expect(this.paint().getCalls()).to.deep.equal([
        {t: 'text', x: 0, y: 14.74609375, text: 'a', fillColor: '#000'},
        {t: 'text', x: 0, y: 51.54296875, text: 'b', fillColor: '#000'},
        {t: 'text', x: 0, y: 88.33984375, text: 'c', fillColor: '#000'}
      ]);
    });

    it('measures uncollapsible whitespace for fit', function () {
      this.reflow(
        '<div style="width: 100px; font: 16px Arimo; white-space: pre-wrap;">' +
          '            im not gonna fit' +
        '</div>'
      );

      expect(this.paint().getCalls()).to.deep.equal([
        {t: 'text', x: 0, y: 14.74609375, text: '            im not ', fillColor: '#000'},
        {t: 'text', x: 0, y: 33.14453125, text: 'gonna fit', fillColor: '#000'}
      ]);
    });

    it('doesn\'t measure uncollapsible whitespace at the end of the line for fit', function () {
      this.reflow(
        '<div style="width: 100px; font: 16px Arimo; white-space: pre-wrap;">' +
          'im gonna fit            ' +
        '</div>'
      );

      expect(this.paint().getCalls()).to.deep.equal([
        {t: 'text', x: 0, y: 14.74609375, text: 'im gonna fit            ', fillColor: '#000'}
      ]);
    });

    it('correctly collapses end-of-line whitespace in glyphs', function () {
      this.reflow(`
        <div style="width: 300px; font: 16px Arimo, Cairo;">
           hello السلام عليكم (as-salām 'alaykum)
        </div>
      `);
      const block = this.get('div');
      expect(block.items.at(-1).glyphs.at(-G_SZ + G_ID)).to.equal(3);
      expect(block.items.at(-1).glyphs.at(-G_SZ + G_AX)).to.equal(0);
      expect(block.items.at(0).glyphs.at(G_AX)).to.equal(0);
    });

    it('does create lineboxes if there were sized inlines but no text', function () {
      this.reflow(`
        <div style="font: 16px/20px Arimo;">
          <span style="margin-right: 1px;"></span>
        </div>
      `);
      expect(this.get('div').getBorderArea().height).to.equal(20);
    });

    it('uses the font\'s internal leading when a shaped item is split onto a new line', function () {
      // This one is hard to set up. We need to cause a single ShapedItem using
      // one font to be broken. If we specified a different font on the div, it
      // would shape the spaces with that first (need to fix that) and cause us
      // to be breaking in between rather than inside. We can't wrap the inner
      // text with a span because that has a strut. Searching for a font that
      // doesn't exist allows the itemized portion to find a font via language,
      // (Cairo) and the div will use the first registered font (not Cairo).
      this.reflow('<div style="font: 16px XXX; width: 0;">متشرف بمعرفتك</div>');
      expect(this.paint().getCalls()).to.deep.equal([
        {t: 'text', x: 0, y: 20.848, text: 'متشرف', fillColor: '#000'},
        {t: 'text', x: 0, y: 50.832, text: 'بمعرفتك', fillColor: '#000'}
      ]);
      const block = this.get('div');
      expect(block.getContentArea().height).to.equal(60);
    });
  });

  describe('Overflow-wrap', function () {
    it('breaks inlines that have the rule, not ones that don\'t', function () {
      this.reflow(`
        <div id="t" style="width: 50px; font: 10px Ahem;">
          guided by
          <span style="overflow-wrap: anywhere;">voices</span>
        </div>
      `);

      expect(this.paint().getCalls()).to.deep.equal([
        {t: 'text', x: 0, y: 8, text: 'guided', fillColor: '#000'},
        {t: 'text', x: 0, y: 18, text: 'by', fillColor: '#000'},
        {t: 'text', x: 0, y: 28, text: 'voice', fillColor: '#000'},
        {t: 'text', x: 0, y: 38, text: 's', fillColor: '#000'}
      ]);
    });

    it('word-break: break-word functions as anywhere', function () {
      this.reflow(`
        <div id="t" style="font: 10px Ahem; word-break: break-word; width: 90px;">
          Is it springtime today yet?
        </div>
      `);

      expect(this.paint().getCalls()).to.deep.equal([
        {t: 'text', x: 0, y: 8, text: 'Is it', fillColor: '#000'},
        {t: 'text', x: 0, y: 18, text: 'springtim', fillColor: '#000'},
        {t: 'text', x: 0, y: 28, text: 'e today', fillColor: '#000'},
        {t: 'text', x: 0, y: 38, text: 'yet?', fillColor: '#000'}
      ]);
    });

    it('places floats after broken words', function () {
      // https://bugs.webkit.org/show_bug.cgi?id=272534
      // ab | cd◾️ | ef
      this.reflow(`
        <div id="t1" style="font: 10px/1 Ahem; width: 25px; overflow-wrap: anywhere;">
          abcd<div id="t2" style="float: left; width: 5px; height: 5px;"></div>ef
        </div>
      `);

      expect(this.paint().getCalls()).to.deep.equal([
        {t: 'text', x: 0, y: 8, text: 'ab', fillColor: '#000'},
        {t: 'text', x: 5, y: 18, text: 'cd', fillColor: '#000'},
        {t: 'text', x: 0, y: 28, text: 'ef', fillColor: '#000'}
      ]);

      expect(this.get('#t2').getContentArea().x).to.equal(0);
      expect(this.get('#t2').getContentArea().y).to.equal(10);
    });

    it('measures and places inlines inside break-word correctly', function () {
      // big | [ro | om] | bar
      this.reflow(`
        <div id="t" style="font: 10px Ahem; width: 30px; overflow-wrap: anywhere;">
          big <span style="padding: 0 10px;">room</span> bar
        </div>
      `);

      /** @type import('../src/layout-flow.ts').BlockContainerOfInlines */
      const block = this.get('#t');

      expect(this.paint().getCalls()).to.deep.equal([
        {t: 'text', x: 0, y: 8, text: 'big', fillColor: '#000'},
        {t: 'text', x: 10, y: 18, text: 'ro', fillColor: '#000'},
        {t: 'text', x: 0, y: 28, text: 'om', fillColor: '#000'},
        {t: 'text', x: 0, y: 38, text: 'bar', fillColor: '#000'}
      ]);
    });

    it('anywhere affects min-content', function () {
      this.reflow(`
        <div style="width: 0;">
          <div id="t" style="font: 10px Ahem; overflow-wrap: anywhere; float: left;">abcde</div>
        </div>
      `);

      expect(this.get('#t').getContentArea().width).to.equal(10);
    });

    it('break-word doesn\'t affect min-content', function () {
      this.reflow(`
        <div style="width: 0;">
          <div id="t" style="font: 10px Ahem; overflow-wrap: break-word; float: left;">abcde</div>
        </div>
      `);

      expect(this.get('#t').getContentArea().width).to.equal(50);
    });

    it('anywhere doesn\'t infinite loop on an ifc with only floats', function () {
      this.reflow(`
        <div style="overflow-wrap: anywhere;">
          <div style="float: left;"></div>
        </div>
      `);
    });
  });
});

describe('Word Spacing', function () {
  before(setupLayoutTests);

  before(function () {
    registerFontAsset('Ahem/Ahem.ttf');
    registerFontAsset('Cairo/Cairo-Regular.ttf');
  });

  after(function () {
    unregisterFontAsset('Ahem/Ahem.ttf');
    unregisterFontAsset('Cairo/Cairo-Regular.ttf');
  });

  afterEach(logIfFailed);

  it('changes line width with px and em units', function () {
    this.reflow(`
      <div style="width: 200px;">
        <div id="t1" style="font: 10px Ahem; word-spacing: 2em;">beer stew</div>
        <div id="t2" style="font: 10px Ahem; word-spacing: 100px;">beer&nbsp;stew</div>
      </div>
    `);

    /** @type import('../src/layout-flow.ts').BlockContainerOfInlines */
    const block1 = this.get('#t1');
    expect(block1.items).to.have.lengthOf(1);
    expect(block1.items[0].measure().advance).to.equal(110);

    /** @type import('../src/layout-flow.ts').BlockContainerOfInlines */
    const block2 = this.get('#t2');
    expect(block2.items).to.have.lengthOf(1);
    expect(block2.items[0].measure().advance).to.equal(190);
  });

  it('changes glyph advances when applied to parts of a shaped segment', function () {
    this.reflow(`
      <div id="t" style="font: 10px Ahem; width: 1000px;">
        parsnip soup <span style="word-spacing: 100px;">is good for </span>the soul
      </div>
    `);

    /** @type import('../src/layout-flow.ts').BlockContainerOfInlines */
    const t = this.get('#t');
    expect(t.items[0].glyphs[0 * G_SZ + G_AX]).to.equal(0);
    expect(t.items[0].glyphs[13 * G_SZ + G_AX]).to.equal(1000);
    expect(t.items[0].glyphs[16 * G_SZ + G_AX]).to.equal(11000);
    expect(t.items[0].glyphs[21 * G_SZ + G_AX]).to.equal(11000);
    expect(t.items[0].glyphs[25 * G_SZ + G_AX]).to.equal(11000);
    expect(t.items[0].glyphs[29 * G_SZ + G_AX]).to.equal(1000);
  });

  it('affects Arabic text', function () {
    this.reflow(`
      <div id="t" style="width: 300px; font: 10px Cairo; word-spacing: 5px;">
        Carrot Soup | شوربة الجزر
      </div>
    `);

    expect(this.paint().getCalls()).to.deep.equal([
      {t: 'text', x: 0, y: 13.030000000000001, text: 'Carrot Soup | ', fillColor: '#000'},
      {t: 'text', x: 71.3, y: 13.030000000000001, text: 'شوربة الجزر', fillColor: '#000'}
    ]);

    /** @type import('../src/layout-flow.ts').BlockContainerOfInlines */
    const [i1, i2] = this.get('#t').items;
    expect(i1.measure().advance + i2.measure().advance).to.be.approximately(100.73 + 20, 0.01);
  });

  it('affects arabic text after wrapping', function () {
    this.reflow(`
      <div id="t" style="font: 10px Cairo; word-spacing: 20px; width: 100px;">
        شوربة ساخنة لذيذة
      </div>
    `);

    expect(this.paint().getCalls()).to.deep.equal([
      {t: 'text', x: 0, y: 13.030000000000001, text: 'شوربة ساخنة', fillColor: '#000'},
      {t: 'text', x: 0, y: 31.770000000000003, text: 'لذيذة', fillColor: '#000'}
    ]);

    /** @type import('../src/layout-flow.ts').BlockContainerOfInlines */
    const t = this.get('#t');
    expect(t.items).to.have.lengthOf(4);
    expect(t.items[1].measure().advance).to.be.approximately(72.82, 0.01);
    expect(t.items[1].glyphs[6 * G_SZ + G_AX]).to.equal(2220);
    expect(t.items[2].measure().advance).to.be.approximately(21.96, 0.01);
  });

  it('changes line width relative to children with % unit', function () {
    this.reflow(`
      <div id="t" style="width: 1000px; font: 10px Ahem; word-spacing: 50%;">
        Eat your
        <span style="font-size: 20px;">beer pottage</span>
      </div>
    `);

    expect(this.paint().getCalls()).to.deep.equal([
      {t: 'text', x: 0, y: 16, text: 'Eat your ', fillColor: '#000'},
      {t: 'text', x: 100, y: 16, text: 'beer pottage', fillColor: '#000'}
    ]);

    /** @type import('../src/layout-flow.ts').BlockContainerOfInlines */
    const [i1, i2] = this.get('#t').items;
    expect(i1.measure().advance + i2.measure().advance).to.equal(90 + 5 + 5 + 240 + 10);
  });

  it('affects line breaking with negative values', function () {
    this.reflow(`
      <div id="t" style="font: 10px Ahem; width: 50px; word-spacing: -40px;">
        beer soup
      </div>
    `);

    expect(this.paint().getCalls()).to.deep.equal([
      {t: 'text', x: 0, y: 8, text: 'beer soup', fillColor: '#000'}
    ]);

    /** @type import('../src/layout-flow.ts').BlockContainerOfInlines */
    const block = this.get('#t');
    expect(block.items[0].measure().advance).to.equal(50);
  });

  it('re-adds spaces when it needs to reshape', function () {
    this.reflow(`
      <div style="word-spacing: 10px; width: 260px;">
        كلمة
        <span style="display: inline-block; word-spacing: 100px;">كلمة كلمة</span>
        كل&shy;مة
      </div>
    `);

    /** @type import('../src/layout-flow.ts').BlockContainerOfInlines */
    const [,, item] = this.get('div').items;
    expect(item.measure().advance).to.equal(35.408);
  });
});

describe('Vertical Align', function () {
  before(setupLayoutTests);

  before(function () {
    registerFontAsset('Cairo/Cairo-Regular.ttf');
    registerFontAsset('Arimo/Arimo-Regular.ttf');
  });

  after(function () {
    unregisterFontAsset('Arimo/Arimo-Regular.ttf');
    unregisterFontAsset('Cairo/Cairo-Regular.ttf');
  });

  afterEach(logIfFailed);

  it('aligns text to middle', function () {
    this.reflow(`
      <div style="font: 16px/20px Arimo;">
        baseline <span style="vertical-align: middle; font: 8px/8px Arimo;">middle</span>
      </div>
    `);

    const b = this.paint();
    expect(b.drewText('baseline ').y).to.be.approximately(15.547, 0.001);
    expect(b.drewText('middle').y).to.be.approximately(14.094, 0.001);
    /** @type import('../src/layout-flow.ts').BlockContainerOfInlines */
    const block = this.get('div');
    expect(block.getContentArea().height).to.equal(20);
  });

  it('aligns inline-block to middle', function () {
    this.reflow(`
      <div id="t1" style="font: 16px/20px Arimo;">
        baseline
        <div id="t2" style="display: inline-block; height: 10px; vertical-align: middle;"></div>
        <div id="t3" style="display: inline-block; vertical-align: middle;">middle</div>
      </div>
    `);

    expect(this.paint().getCalls()).to.deep.equal([
      {t: 'text', x: 0, y: 15.546875, text: 'baseline ', fillColor: '#000'},
      {t: 'text', x: 64.046875, y: 15.546875, text: ' ', fillColor: '#000'},
      {t: 'text', x: 68.4921875, y: 16.8671875, text: 'middle', fillColor: '#000'}
    ]);

    /** @type import('../src/layout-flow.ts').BlockContainerOfInlines */
    const block = this.get('#t1');
    expect(block.getContentArea().height).to.equal(21);
    expect(this.get('#t2').getContentArea().y).to.equal(6);
    expect(this.get('#t3').getContentArea().y).to.equal(1);
  });

  it('aligns text to subscript', function () {
    this.reflow(`
      <div style="font: 16px/20px Arimo;">
        baseline <span style="vertical-align: sub;">sub</span>
      </div>
    `);

    const b = this.paint();
    expect(b.drewText('baseline ').y).to.be.approximately(15.547, 0.001);
    expect(b.drewText('sub').y).to.be.approximately(18.747, 0.001);
    /** @type import('../src/layout-flow.ts').BlockContainerOfInlines */
    const block = this.get('div');
    expect(block.getContentArea().height).to.equal(23);
  });

  it('aligns inline-block to subscript', function () {
    this.reflow(`
      <div id="t1" style="font: 16px/20px Arimo;">
        baseline
        <div id="t2" style="display: inline-block; height: 10px; vertical-align: sub;"></div>
        <div id="t3" style="display: inline-block; vertical-align: sub;">sub</div>
      </div>
    `);

    expect(this.paint().getCalls()).to.deep.equal([
      {t: 'text', x: 0, y: 15.546875, text: 'baseline ', fillColor: '#000'},
      {t: 'text', x: 64.046875, y: 15.546875, text: ' ', fillColor: '#000'},
      {t: 'text', x: 68.4921875, y: 18.746875, text: 'sub', fillColor: '#000'}
    ]);

    /** @type import('../src/layout-flow.ts').BlockContainerOfInlines */
    const block = this.get('#t1');
    expect(block.getContentArea().height).to.equal(23);
    expect(this.get('#t2').getContentArea().y).to.equal(9);
    expect(this.get('#t3').getContentArea().y).to.equal(3);
  });

  it('aligns text to superscript', function () {
    this.reflow(`
      <div style="font: 16px/20px Arimo;">
        baseline <span style="vertical-align: super;">super</span>
      </div>
    `);

    const b = this.paint();
    expect(b.drewText('baseline ').y).to.be.approximately(20.987, 0.001);
    expect(b.drewText('super').y).to.be.approximately(15.547, 0.001);
    /** @type import('../src/layout-flow.ts').BlockContainerOfInlines */
    const block = this.get('div');
    expect(block.getContentArea().height).to.equal(25);
  });

  it('aligns inline-block to superscript', function () {
    this.reflow(`
      <div id="t1" style="font: 16px/20px Arimo;">
        baseline
        <div id="t2" style="display: inline-block; height: 10px; vertical-align: super;"></div>
        <div id="t3" style="display: inline-block; vertical-align: super;">super</div>
      </div>
    `);

    /** @type import('../src/layout-flow.ts').BlockContainerOfInlines */
    const block = this.get('#t1');
    expect(block.getContentArea().height).to.equal(25);
    expect(this.paint().drewText('baseline ').y).to.be.approximately(20.987, 0.001);
    expect(this.get('#t2').getContentArea().y).to.equal(6);
    expect(this.get('#t3').getContentArea().y).to.equal(0);
  });

  it('aligns text to text-top', function () {
    this.reflow(`
      <div style="font: 16px/20px Arimo;">
        baseline <span style="vertical-align: text-top;">text-top</span>
      </div>
    `);

    const b = this.paint();
    expect(b.drewText('baseline ').y).to.be.approximately(15.547, 0.001);
    expect(b.drewText('text-top').y).to.be.approximately(16.609, 0.001);
    /** @type import('../src/layout-flow.ts').BlockContainerOfInlines */
    const block = this.get('div');
    expect(block.getContentArea().height).to.equal(21);
  });

  it('aligns inline-block to text-top', function () {
    this.reflow(`
      <div id="t1" style="font: 16px/20px Arimo;">
        baseline
        <div id="t2" style="display: inline-block; height: 10px; vertical-align: text-top;"></div>
        <div id="t3" style="display: inline-block; vertical-align: text-top;">text-top</div>
      </div>
    `);

    /** @type import('../src/layout-flow.ts').BlockContainerOfInlines */
    const block = this.get('#t1');
    expect(block.getContentArea().height).to.equal(21);
    expect(this.paint().drewText('baseline ').y).to.be.approximately(15.547, 0.001);
    expect(this.get('#t2').getContentArea().y).to.equal(1);
    expect(this.get('#t3').getContentArea().y).to.equal(1);
  });

  it('aligns text to text-bottom', function () {
    this.reflow(`
      <div style="font: 16px/20px Arimo;">
        baseline <span style="vertical-align: text-bottom;">text-bottom</span>
      </div>
    `);

    const b = this.paint();
    expect(b.drewText('baseline ').y).to.be.approximately(16.609, 0.001);
    expect(b.drewText('text-bottom').y).to.be.approximately(15.547, 0.001);
    /** @type import('../src/layout-flow.ts').BlockContainerOfInlines */
    const block = this.get('div');
    expect(block.getContentArea().height).to.equal(21);
  });

  it('aligns inline-block to text-bottom', function () {
    this.reflow(`
      <div id="t1" style="font: 16px/20px Arimo;">
        baseline
        <div id="t2" style="display: inline-block; height: 10px; vertical-align: text-bottom;"></div>
        <div id="t3" style="display: inline-block; vertical-align: text-bottom;">text-bottom</div>
      </div>
    `);

    /** @type import('../src/layout-flow.ts').BlockContainerOfInlines */
    const block = this.get('#t1');
    expect(block.getContentArea().height).to.equal(21);
    expect(this.paint().drewText('baseline ').y).to.be.approximately(16.609, 0.001);
    expect(this.get('#t2').getContentArea().y).to.equal(10);
    expect(this.get('#t3').getContentArea().y).to.equal(0);
  });

  it('aligns text with pixels', function () {
    this.reflow(`
      <div style="font: 16px/20px Arimo;">
        baseline <span style="vertical-align: 30px;">30px</span>
      </div>
    `);

    const b = this.paint();
    expect(b.drewText('baseline ').y).to.be.approximately(45.547, 0.001);
    expect(b.drewText('30px').y).to.be.approximately(15.547, 0.001);
    /** @type import('../src/layout-flow.ts').BlockContainerOfInlines */
    const block = this.get('div');
    expect(block.getContentArea().height).to.equal(50);
  });

  it('aligns inline-block with pixels', function () {
    this.reflow(`
      <div id="t1" style="font: 16px/20px Arimo;">
        baseline
        <div id="t2" style="display: inline-block; height: 10px; vertical-align: 30px;"></div>
        <div id="t3" style="display: inline-block; vertical-align: 30px;">30px</div>
      </div>
    `);

    /** @type import('../src/layout-flow.ts').BlockContainerOfInlines */
    const block = this.get('#t1');
    expect(block.getContentArea().height).to.equal(50);
    expect(this.paint().drewText('baseline ').y).to.be.approximately(45.547, 0.001);
    expect(this.get('#t2').getContentArea().y).to.equal(6);
    expect(this.get('#t3').getContentArea().y).to.equal(0);
  });

  it('aligns text with percentage', function () {
    this.reflow(`
      <div style="font: 16px/20px Arimo;">
        baseline <span style="vertical-align: 50%; line-height: 10px;">percentage</span>
      </div>
    `);

    const b = this.paint();
    expect(b.drewText('baseline ').y).to.be.approximately(15.547, 0.001);
    expect(b.drewText('percentage').y).to.be.approximately(10.547, 0.001);
    /** @type import('../src/layout-flow.ts').BlockContainerOfInlines */
    const block = this.get('div');
    expect(block.getContentArea().height).to.equal(20);
  });

  it('aligns inline-block with percentage', function () {
    this.reflow(`
      <div id="t1" style="font: 16px/20px Arimo;">
        baseline
        <div id="t2" style="display: inline-block; height: 10px; vertical-align: 50%; line-height: 10px;"></div>
        <div id="t3" style="display: inline-block; vertical-align: 50%; line-height: 10px;">50%</div>
      </div>
    `);

    /** @type import('../src/layout-flow.ts').BlockContainerOfInlines */
    const block = this.get('#t1');
    expect(block.getContentArea().height).to.equal(20);
    expect(this.paint().drewText('baseline ').y).to.be.approximately(15.546, 0.001);
    expect(this.get('#t2').getContentArea().y).to.equal(1);
    expect(this.get('#t3').getContentArea().y).to.equal(0);
  });

  it('aligns top', function () {
    this.reflow(`
      <div style="font: 16px/20px Arimo;">
        baseline <span style="vertical-align: top; line-height: 40px;">
          <span style="vertical-align: super;">top</span>
        </span>
      </div>
    `);

    const b = this.paint();
    expect(b.drewText('baseline ').y).to.be.approximately(15.547, 0.001);
    expect(b.drewText('top').y).to.be.approximately(25.547, 0.001);
    /** @type import('../src/layout-flow.ts').BlockContainerOfInlines */
    const block = this.get('div');
    expect(block.getContentArea().height).to.equal(45);
  });

  it('aligns top inline-block', function () {
    this.reflow(`
      <div id="t1" style="font: 16px/20px Arimo;">
        baseline
        <div id="t2" style="display: inline-block; height: 30px; vertical-align: top;"></div>
      </div>
    `);

    /** @type import('../src/layout-flow.ts').BlockContainerOfInlines */
    const block = this.get('#t1');
    expect(block.getContentArea().height).to.equal(30);
    expect(this.paint().drewText('baseline ').y).to.be.approximately(15.547, 0.001);
    expect(this.get('#t2').getContentArea().y).to.equal(0);
  });

  it('aligns bottom', function () {
    this.reflow(`
      <div style="font: 16px/20px Arimo;">
        baseline <span style="vertical-align: bottom; line-height: 40px;">
          <span style="vertical-align: sub;">bottom</span>
        </span>
      </div>
    `);

    const b = this.paint();
    expect(b.drewText('baseline ').y).to.be.approximately(38.747, 0.001);
    expect(b.drewText('bottom').y).to.be.approximately(28.747, 0.001);
    /** @type import('../src/layout-flow.ts').BlockContainerOfInlines */
    const block = this.get('div');
    expect(block.getContentArea().height).to.equal(43);
  });

  it('aligns bottom inline-block', function () {
    this.reflow(`
      <div id="t1" style="font: 16px/20px Arimo;">
        baseline
        <div id="t2" style="display: inline-block; height: 30px; vertical-align: bottom;"></div>
      </div>
    `);

    /** @type import('../src/layout-flow.ts').BlockContainerOfInlines */
    const block = this.get('#t1');
    expect(block.getContentArea().height).to.equal(30);
    expect(this.paint().drewText('baseline ').y).to.be.approximately(25.547, 0.001);
    expect(this.get('#t2').getContentArea().y).to.equal(0);
  });

  it('aligns strut with the bottom when there are tops and bottoms', function () {
    this.reflow(`
      <div style="font: 16px/20px Arimo;">
        baseline
        <span style="vertical-align: top; line-height: 80px;">t</span>
        <span style="vertical-align: bottom; line-height: 40px;">b</span>
      </div>
    `);

    const b = this.paint();
    expect(b.drewText('baseline ').y).to.be.approximately(35.547, 0.001);
    expect(b.drewText('t').y).to.be.approximately(45.547, 0.001);
    expect(b.drewText('b').y).to.be.approximately(65.547, 0.001);
    /** @type import('../src/layout-flow.ts').BlockContainerOfInlines */
    const block = this.get('div');
    expect(block.getContentArea().height).to.equal(80);
  });

  it('changes line height for shifted empty spans', function () {
    this.reflow(`
      <div style="font: 16px/20px Arimo;">
        text
        <span style="vertical-align: super;"></span>
      </div>
    `);

    /** @type import('../src/layout-flow.ts').BlockContainerOfInlines */
    const block = this.get('div');
    expect(block.getContentArea().height).to.equal(25);
  });

  it('changes line height for shifted fallback glyphs', function () {
    this.reflow(`
      <div style="font: 16px/20px Arimo, Cairo;">
        text
        <span style="vertical-align: super;">هل</span>
      </div>
    `);

    /** @type import('../src/layout-flow.ts').BlockContainerOfInlines */
    const block = this.get('div');
    expect(block.getContentArea().height).to.equal(26);
  });

  it('affects line height on the second line', function () {
    this.reflow(`
      <div style="font: 16px/20px Arimo, Cairo; width: 400px;">
        Do you speak a language other than Arabic?
        <span style="vertical-align: super;">هل تتحدث لغة أخرى بجانب العربية؟</span>
        Cool!
      </div>
    `);

    const b = this.paint();
    expect(b.drewText('Do you speak a language other than Arabic? ').y)
      .to.be.approximately(21.296, 0.001);
    expect(b.drewText('لغة').y).to.be.approximately(41.605, 0.001);
    expect(b.drewText('Cool!').y).to.be.approximately(47.045, 0.001);
  });

  it('does not carry fallback height to the second line', function () {
    this.reflow(`
      <div style="font: 16px Arimo, Cairo; width: 80px;">
        <span style="vertical-align: super;">نعم</span>, قليل
        yes, <span style="vertical-align: super;">a little</span>
      </div>
    `);

    const b = this.paint();
    expect(b.drewText('قليل').y).to.be.approximately(26.288, 0.001);
    expect(b.drewText('yes, ').y).to.be.approximately(55.610, 0.001);

    /** @type import('../src/layout-flow.ts').BlockContainerOfInlines */
    const block = this.get('div');
    expect(block.getContentArea().height).to.equal(59);
  });

  it('correctly resets separate alignment contexts for the second line', function () {
    this.reflow(`
      <div style="font: 16px/20px Arimo;">
        1b
        <span style="vertical-align: 10px;">
          2b
          <span style="vertical-align: 10px;">
            3b
            <span style="vertical-align: bottom;">4b<br>4a</span>
            3a
          </span>
          2a
        </span>
        1a
      </div>
    `);

    const b = this.paint();
    expect(b.drewText('2b ').y).to.be.approximately(25.547, 0.001);
    expect(b.drewText('4b').y).to.be.approximately(35.547, 0.001);
    expect(b.drewText('2a ').y).to.be.approximately(65.547, 0.001);
    expect(b.drewText('4a').y).to.be.approximately(75.547, 0.001);
    /** @type import('../src/layout-flow.ts').BlockContainerOfInlines */
    const block = this.get('div');
    expect(block.getContentArea().height).to.equal(80);
  });

  it('correctly splits out nested top and bottoms', function () {
    this.reflow(`
      <div style="font: 16px/20px Arimo;">
        <span style="vertical-align: top; line-height: 15px;">
          t1
          <span style="vertical-align: top; line-height: 10px;">
            t2
            <span style="vertical-align: bottom; line-height: 10px;">b</span>
          </span>
        </span>
      </div>
    `);

    const b = this.paint();
    expect(b.drewText('t1 ').y).to.be.approximately(13.047, 0.001);
    expect(b.drewText('t2 ').y).to.be.approximately(10.547, 0.001);
    expect(b.drewText('b').y).to.be.approximately(20.547, 0.001);
    /** @type import('../src/layout-flow.ts').BlockContainerOfInlines */
    const block = this.get('div');
    expect(block.getContentArea().height).to.equal(20);
  });

  it('keeps ascenders and descenders of tops and bottoms separate', function () {
    this.reflow(`
      <div style="font: 16px/20px Arimo;">
        <span style="vertical-align: top; line-height: 20px;">top</span>
        <span style="font-family: Cairo; vertical-align: bottom; line-height: 20px;">bottom</span>
      </div>
    `);

    const block = this.get('div');
    expect(block.getContentArea().height).to.equal(20);
  });
});

describe('Inline Blocks', function () {
  before(setupLayoutTests);

  before(function () {
    registerFontAsset('Cairo/Cairo-Regular.ttf');
    registerFontAsset('Arimo/Arimo-Regular.ttf');
  });

  after(function () {
    unregisterFontAsset('Arimo/Arimo-Regular.ttf');
    unregisterFontAsset('Cairo/Cairo-Regular.ttf');
  });

  afterEach(logIfFailed);

  it('accounts for margin, border, and padding', function () {
    this.reflow(`
      <div style="font: 16px/20px Arimo;">
        it's cold out
        <div id="t" style="
          display: inline-block;
          margin: 1px;
          border: 1px solid;
          padding: 1px;
          vertical-align: 20px;
        "></div>
      </div>
    `);

    /** @type import('../src/layout-flow.ts').BlockContainer */
    const t = this.get('#t');
    /** @type import('../src/layout-flow.ts').BlockContainerOfInlines */
    const block = this.get('div');
    expect(block.getContentArea().height).to.equal(30);
    expect(this.paint().drewText('it\'s cold out ').y).to.equal(26);
    expect(t.getBorderArea().x).to.equal(85);
    expect(t.getBorderArea().y).to.equal(1);
  });

  it('sizes to intrinsics correctly', function () {
    this.reflow(`
      <div style="font: 16px/20px Arimo;">
        when it's cold out
        <div id="t" style="display: inline-block;">
          put<br>some<br>skates<br>on
        </div>
      </div>
    `);

    /** @type import('../src/layout-flow.ts').BlockContainer */
    const t = this.get('#t');
    /** @type import('../src/layout-flow.ts').BlockContainerOfInlines */
    const block = this.get('div');
    expect(block.getContentArea().height).to.equal(80);
    const b = this.paint();
    expect(b.drewText('when it\'s cold out ').y).to.be.approximately(75.547, 0.001);
    expect(t.getBorderArea().x).to.equal(127);
    expect(t.getBorderArea().y).to.equal(0);
  });

  it('fills the entire cb width at most', function () {
    this.reflow(`
      <div style="font: 16px/20px Arimo; width: 100px;">
        line before
        <div id="t" style="display: inline-block;">
          You better watch out, you better not cry
        </div>
        line after
      </div>
    `);

    expect(this.paint().getCalls()).to.deep.equal([
      {t: 'text', x: 0, y: 15.546875, text: 'line before', fillColor: '#000'},
      {t: 'text', x: 0, y: 35.546875, text: 'You better', fillColor: '#000'},
      {t: 'text', x: 0, y: 55.546875, text: 'watch out,', fillColor: '#000'},
      {t: 'text', x: 0, y: 75.546875, text: 'you better not', fillColor: '#000'},
      {t: 'text', x: 0, y: 95.546875, text: 'cry', fillColor: '#000'},
      {t: 'text', x: 0, y: 115.546875, text: 'line after', fillColor: '#000'}
    ]);

    /** @type import('../src/layout-flow.ts').BlockContainer */
    const t = this.get('#t');
    expect(t.getContentArea().width).to.equal(100);
    expect(t.getContentArea().y).to.equal(20);
  });

  it('fills the entire cb taking margin into account', function () {
    this.reflow(`
      <div style="font: 16px/20px Arimo; width: 200px;">
        <div id="t" style="display: inline-block; margin: 5px; padding: 5px;">
          hemingway's paws are literally on my hands as I type
        </div>
      </div>
    `);

    /** @type import('../src/layout-flow.ts').BlockContainer */
    const t = this.get('#t');
    expect(t.getContentArea().x).to.equal(10);
    expect(t.getContentArea().inlineSize).to.equal(180);
  });

  it('doesn\'t collapse through a solitary inline-block', function () {
    this.reflow(`
      <div id="t" style="font: 16px/20px Arimo;">
        <div id="t" style="display: inline-block;">
          This is the way
        </div>
      </div>
    `);

    expect(this.paint().getCalls()).to.deep.equal([
      {t: 'text', x: 0, y: 15.546875, text: 'This is the way', fillColor: '#000'}
    ]);
    /** @type import('../src/layout-flow.ts').BlockContainer */
    const t = this.get('#t');
    expect(t.getContentArea().height).to.equal(20);
  });

  it('positions correctly among bidirectional text', function () {
    this.reflow(`
      <div style="font: 16px/20px Cairo; direction: rtl; width: 200px;">
        excuse me: المعذرة<div id="t" style="display: inline-block; border-bottom: 2px solid red;">!</div>
      </div>
    `);

    const t = this.get('#t');
    expect(t.getContentArea().x).to.equal(66);
  });

  it('breaks before and after', function () {
    this.reflow(`
      <div id="t1" style="font: 16px/20px Arimo; width: 10px;">
        <div id="t2" style="display: inline-block; width: 10px; height: 10px;"></div>
        <div id="t3" style="display: inline-block; width: 10px; height: 10px;"></div>
        <div id="t4" style="display: inline-block; width: 10px; height: 10px;"></div>
      </div>
    `);

    /** @type import('../src/layout-flow.ts').BlockContainerOfInlines */
    const block = this.get('#t1');
    expect(block.getContentArea().height).to.equal(60);
    /** @type import('../src/layout-flow.ts').BlockContainer */
    const t2 = this.get('#t2');
    expect(t2.getContentArea().x).to.equal(0);
    expect(t2.getContentArea().y).to.equal(6);
    /** @type import('../src/layout-flow.ts').BlockContainer */
    const t3 = this.get('#t3');
    expect(t3.getContentArea().x).to.equal(0);
    expect(t3.getContentArea().y).to.equal(26);
    /** @type import('../src/layout-flow.ts').BlockContainer */
    const t4 = this.get('#t4');
    expect(t4.getContentArea().x).to.equal(0);
    expect(t4.getContentArea().y).to.equal(46);
  });

  it('doesn\'t end with an empty line of space', function () {
    this.reflow(`
      <div id="t1" style="font: 16px/20px Arimo; width: 10px;">
        abc
        <div id="t2" style="display: inline-block; width: 10px; height: 10px;"></div>
      </div>
    `);

    /** @type import('../src/layout-flow.ts').BlockContainerOfInlines */
    const block = this.get('#t1');
    expect(block.getContentArea().height).to.equal(40);
  });

  it('prioritizes float over inline-block', function () {
    this.reflow(`
      <div style="font: 16px/20px Cairo; width: 100px;">
        hi <div id="t" style="display: inline-block; float: right; width: 10px;">!</div>
      </div>
    `);

    /** @type import('../src/layout-flow.ts').BlockContainer */
    const t = this.get('#t');
    expect(t.getContentArea().x).to.be.equal(90);
  });

  it('paints backgrounds behind inline-block correctly', function () {
    this.reflow(`
      <div id="t" style="font: 16px/20px Cairo; width: 100px;">
        1<span style="background-color: veronicayellow;"><span style="display: inline-block;">different ifc!</span></span>2
      </div>
    `);

    /** @type import('../src/layout-flow.ts').BlockContainerOfInlines */
    const block = this.get('#t');
    expect(block.fragments[0].left).to.equal(8.96);
    expect(block.fragments[0].right).to.equal(90.44800000000001);
  });

  it('occupies the right amount of space for floats', function () {
    this.reflow(`
      <div id="t" style="width: 200px; display: flow-root; font-size: 0;">
        <div style="display: inline-block; width: 100px; height: 100px;"></div>
        <div style="float: right; width: 100px; height: 100px;"></div>
      </div>
    `);

    /** @type import('../src/layout-flow.ts').BlockContainer */
    const t = this.get('#t');
    expect(t.getContentArea().height).to.equal(100);
  });

  it('occupies the right amount of space for text-align', function () {
    this.reflow(`
      <div id="t" style="width: 200px; font: 16px Arimo; text-align: center;">
        I can't
        <div style="display: inline-block;">wait</div>
        for summer
      </div>
    `);

    /** @type import('../src/layout-flow.ts').BlockContainerOfInlines */
    const block = this.get('#t');
    expect(block.items[0].x).to.be.approximately(19.785, 0.001);
  });

  it('takes horizontal margin into account on the line', function () {
    this.reflow(`
      <div style="width: 100px; font: 16px/20px Arimo;">
        one <div id="t" style="display: inline-block; margin-left: 100px;"><div>
      </div>
    `);

    expect(this.paint().getCalls()).to.deep.equal([
      {t: 'text', x: 0, y: 15.546875, text: 'one', fillColor: '#000'}
    ]);

    /** @type import('../src/layout-flow.ts').BlockContainerOfInlines */
    const t = this.get('#t');
    expect(t.getContentArea().y).to.equal(36);
    expect(t.getContentArea().x).to.equal(100);
  });

  it('uses the bottom margin edge if overflow is hidden', function () {
    this.reflow(`
      <div style="font: 16px/20px Arimo; width: 300px;">
        give a dog a <div id="t" style="display: inline-block; overflow: hidden;">bone</div>
      </div>
    `);

    expect(this.paint().getCalls()).to.deep.equal([
      {t: 'text', x: 0, y: 20, text: 'give a dog a ', fillColor: '#000'},
      {t: 'pushClip', x: 92, y: 0, width: 35, height: 20},
      {t: 'text', x: 91.625, y: 15.546875, text: 'bone', fillColor: '#000'},
      {t: 'popClip'}
    ]);

    /** @type import('../src/layout-flow.ts').BlockContainer */
    const t = this.get('#t');
    expect(t.getBorderArea().y).to.equal(0);
  });

  it('includes empty spans against the inline-block on the line', function () {
    this.reflow(`
      <div style="width: 0;">
        line1
        <span>
          <span style="padding: 10px;"></span>
          <div id="t" style="display: inline-block; width: 10px; height: 10px;"></div>
        </span>
      </div>
    `);

    /** @type import('../src/layout-flow.ts').BlockContainer */
    const t = this.get('#t');
    expect(t.getBorderArea().x).to.equal(20);
  });
});

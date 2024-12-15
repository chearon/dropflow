//@ts-check
import {expect} from 'chai';
import * as oflo from '../src/api-with-parse.js';
import {registerFontAsset, unregisterFontAsset} from '../assets/register.js';
import paintBlockContainer from '../src/paint.js';
import PaintSpy from './paint-spy.js';
import {Logger} from '../src/util.js';

const log = new Logger();

function setupLayoutTests() {
  this.layout = function (html) {
    this.rootElement = oflo.parse(html);
    this.blockContainer = oflo.generate(this.rootElement);
    oflo.layout(this.blockContainer);
    this.get = function (...args) {
      if (typeof args[0] === 'string') {
        return this.rootElement.query(args[0])?.boxes[0];
      } else {
        /** @type import('../src/layout-box').Box */
        let ret = this.blockContainer;
        while (args.length) ret = ret.children[args.shift()];
        return ret;
      }
    };
  };

  this.paint = function () {
    const b = new PaintSpy();
    paintBlockContainer(this.blockContainer, b);
    return b;
  };
}

function logIfFailed() {
  if (this.currentTest.state == 'failed') {
    let indent = 0, t = this.currentTest;
    while (t = t.parent) indent += 1;
    log.pushIndent('  '.repeat(indent));
    log.text('Box tree:\n');
    this.currentTest.ctx.blockContainer.log({}, log);
    log.popIndent();
    log.flush();
  }
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
    this.layout(`
      <div id="t">
        \there\n
        <span style="white-space: nowrap;">\t\t  I  go killin  </span>
        \t\n\t  again
      </div>
    `);

    /** @type import('../src/layout-flow').IfcInline[] */
    const [ifc] = this.get('#t').children
    expect(ifc.text).to.equal(' here I go killin again ');
  });

  it('preserves newlines', function () {
    this.layout(`
      <div id="t">
        <span style="white-space: pre-line;">  \there\n</span>
        <span style="white-space: nowrap;">\t\t  I  go killin  </span>
        \t\n\t  again
      </div>
    `);

    /** @type import('../src/layout-flow').IfcInline[] */
    const [ifc] = this.get('#t').children
    expect(ifc.text).to.equal(' here\n I go killin again ');
  });

  it('preserves everything', function () {
    this.layout(`
      <div id="t" style="white-space: pre;">  \there\n\t\t  I  go killin    \n\t\n\t  again  </div>
    `);

    /** @type import('../src/layout-flow').IfcInline[] */
    const [ifc] = this.get('#t').children
    expect(ifc.text).to.equal('  \there\n\t\t  I  go killin    \n\t\n\t  again  ');
  });

  it('preserves parts', function () {
    this.layout(`
      <div id="t">
        \there
        \t\t  I  go killin  
        <span style="white-space: pre;">  \n\t\n\t  again  </span>
      </div>
    `);

    /** @type import('../src/layout-flow').IfcInline[] */
    const [ifc] = this.get('#t').children
    expect(ifc.text).to.equal(' here I go killin   \n\t\n\t  again   ');
  });

  it('preserves nested parts', function () {
    this.layout(
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

    /** @type import('../src/layout-flow').IfcInline[] */
    const [ifc] = this.get('#t').children
    expect(ifc.text).to.equal(
      'applejack: an   o  l  d  e   American tradition'
    );
  });

  it('carries over whitespace state when changing white-space modes', function () {
    this.layout(
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

    /** @type import('../src/layout-flow').IfcInline[] */
    const [ifc] = this.get('#t').children
    expect(ifc.text).to.equal(
      ' one\n two three\n four \nfive\nsix  \n seven'
    );
  });

  it('preserves whitespace correctly when blocks are in newlines', function () {
    this.layout(`
      this is an ifc
      <span style="white-space: pre;">
        <span>but it has inside of it</span>
        <div>a bfc!   oh no!</div>
      </span>
      but it works!
    `);

    const [bfc1, bfc2, bfc3] = this.get().children
    /** @type import('../src/layout-flow').IfcInline[] */
    const [ifc1] = bfc1.children;
    expect(ifc1.text).to.equal(
      'this is an ifc \n        but it has inside of it\n        '
    );

    /** @type import('../src/layout-flow').IfcInline[] */
    const [ifc2] = bfc2.children;
    expect(ifc2.text).to.equal(
      'a bfc!   oh no!'
    );

    /** @type import('../src/layout-flow').IfcInline[] */
    const [ifc3] = bfc3.children;
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
    /** @type import('../src/layout-flow').IfcInline[] */
    this.layout(
      'layout code<span>\n</span>\n<span>\nbecause </span>' +
      'it really very <span>is very</span>I love this!<span>\n</span>'
    );
    const [ifc] = this.get().children
    expect(ifc.text).to.equal('layout code because it really very is veryI love this! ');
  });

  it('preserves whitespace around inline-block', function () {
    this.layout('abc  <span style="display: inline-block;"></span> 123');
    const [ifc] = this.get().children
    expect(ifc.text).to.equal('abc  123');
  });
});

describe('Shaping', function () {
  before(setupLayoutTests);

  before(function () {
    registerFontAsset('Arimo/Arimo-Regular.ttf');
    registerFontAsset('Ramabhadra/Ramabhadra-Regular.ttf');
    // The test "it uses the font's internal leading when a shaped item is
    // split onto a new line" relies on Cairo being registered _after_ Arimo.
    // See the test for more info.
    registerFontAsset('Cairo/Cairo-Regular.ttf');
    registerFontAsset('Roboto/Roboto-Regular.ttf');
    registerFontAsset('LigatureSymbolsWithSpaces/LigatureSymbolsWithSpaces.ttf');
  });

  after(function () {
    unregisterFontAsset('Arimo/Arimo-Regular.ttf');
    unregisterFontAsset('Ramabhadra/Ramabhadra-Regular.ttf');
    unregisterFontAsset('Cairo/Cairo-Regular.ttf');
    unregisterFontAsset('Roboto/Roboto-Regular.ttf');
    unregisterFontAsset('LigatureSymbolsWithSpaces/LigatureSymbolsWithSpaces.ttf');
  });

  afterEach(logIfFailed);

  it('doesn\'t infinite loop when the last match can\'t shape two parts', function () {
    this.layout('𓀀 𓀁');
    /** @type import('../src/layout-flow').IfcInline[] */
    const [inline] = this.get().children;
    expect(inline.paragraph.brokenItems).to.have.lengthOf(3);
    expect(inline.paragraph.brokenItems[0].glyphs.id(0)).to.equal(0)
    expect(inline.paragraph.brokenItems[1].glyphs.id(0)).not.to.equal(0);
    expect(inline.paragraph.brokenItems[2].glyphs.id(0)).to.equal(0);
  });

  describe('Word cache', function () {
    it('doesn\'t use a word cache when the font has ligatures that use spaces', function () {
      this.layout(`
        <div id="t" style="font: 12px LigatureSymbolsWithSpaces;">
          daily calendar calendar align left
        </div>
      `);

      /** @type import('../src/layout-flow').IfcInline[] */
      const [inline] = this.get('#t').children;

      // 3 137 3 328 3 114 3
      expect(inline.paragraph.brokenItems[0].glyphs.id(0)).to.equal(3);
      expect(inline.paragraph.brokenItems[0].glyphs.id(1)).to.equal(137);
      expect(inline.paragraph.brokenItems[0].glyphs.id(2)).to.equal(3);
      expect(inline.paragraph.brokenItems[0].glyphs.id(3)).to.equal(328);
      expect(inline.paragraph.brokenItems[0].glyphs.id(4)).to.equal(3);
      expect(inline.paragraph.brokenItems[0].glyphs.id(5)).to.equal(114);
      expect(inline.paragraph.brokenItems[0].glyphs.id(6)).to.equal(3);
    });

    it('uses a non-kerned space in "T " without kerning explicitly set', function () {
      this.layout('<div id="t" style="font: 12px Roboto;">T M</div>');

      /** @type import('../src/layout-flow').IfcInline[] */
      const [inline] = this.get('#t').children;
      expect(inline.paragraph.brokenItems[0].glyphs.ad(0)).to.equal(1222);
      expect(inline.paragraph.brokenItems[0].glyphs.ad(1)).to.equal(507);
    });

    it('uses a non-kerned T in " T" without kerning explicitly set', function () {
      this.layout('<div id="t" style="font: 12px Roboto;">M T</div>');

      /** @type import('../src/layout-flow').IfcInline[] */
      const [i5] = this.get('#t').children;
      expect(i5.paragraph.brokenItems[0].glyphs.ad(1)).to.equal(507);
      expect(i5.paragraph.brokenItems[0].glyphs.ad(2)).to.equal(1222);
    });
  });

  describe('Boundaries', function () {
    it('splits shaping boundaries on fonts', function () {
      this.layout(`
        <span style="font: 12px Arimo;">Arimo</span>
        <span style="font: 12px Roboto;">Roboto</span>
      `);
      /** @type import('../src/layout-flow').IfcInline[] */
      const [inline] = this.get().children;
      expect(inline.paragraph.brokenItems).to.have.lengthOf(4);
    });

    it('splits shaping boundaries on font-size', function () {
      this.layout(`
        <span style="font-size: 12px;">a</span>
        <span style="font-size: 13px;">b</span>
      `);
      /** @type import('../src/layout-flow').IfcInline[] */
      const [inline] = this.get().children;
      expect(inline.paragraph.brokenItems).to.have.lengthOf(4);
    });

    it('splits shaping boundaries on font-style', function () {
      this.layout(`a<span style="font-style: italic;">b</span>`);
      /** @type import('../src/layout-flow').IfcInline[] */
      const [inline] = this.get().children;
      expect(inline.paragraph.brokenItems).to.have.lengthOf(2);
    });

    it('does not split shaping boundaries on line-height', function () {
      this.layout(`
        <span style="line-height: 3;">Left</span>
        <span style="line-height: 4;">Right</span>
      `);
      /** @type import('../src/layout-flow').IfcInline[] */
      const [inline] = this.get().children;
      expect(inline.paragraph.brokenItems).to.have.lengthOf(1);
    });

    it('splits shaping boundaries based on script', function () {
      this.layout('Lorem Ipusm העמוד');
      /** @type import('../src/layout-flow').IfcInline[] */
      const [inline] = this.get().children;
      expect(inline.paragraph.brokenItems).to.have.lengthOf(2);
      expect(inline.paragraph.brokenItems[0].face).to.equal(inline.paragraph.brokenItems[1].face);
    });

    it('splits shaping boundaries based on emoji', function () {
      this.layout('Hey 😃 emoji are kinda hard 🦷');
      /** @type import('../src/layout-flow').IfcInline[] */
      const [inline] = this.get().children;
      expect(inline.paragraph.brokenItems).to.have.lengthOf(4);
    });

    it('splits shaping boundaries on inline padding', function () {
      this.layout(`It's me, <span style="padding: 1em;">padding boi</span>`);
      /** @type import('../src/layout-flow').IfcInline[] */
      const [inline] = this.get().children;
      expect(inline.paragraph.brokenItems).to.have.lengthOf(2);
      expect(inline.paragraph.brokenItems[1].offset).to.equal(9);
    });

    it('doesn\'t create empty shaped items if shaping boundaries overlap', function () {
      this.layout(`L<span style="padding: 1em; font: 8px Arimo;">R</span>`);
      /** @type import('../src/layout-flow').IfcInline[] */
      const [inline] = this.get().children;
      expect(inline.paragraph.brokenItems).to.have.lengthOf(2);
      expect(inline.paragraph.brokenItems[1].offset).to.equal(1);
    });

    it('has correct glyph order for Hebrew text', function () {
      // "Hello" according to https://omniglot.com/language/phrases/hebrew.php
      this.layout('<div style="width: 60px; font: 16px Arimo;">הלו</div>');
      /** @type import('../src/layout-flow').IfcInline[] */
      const [inline] = this.get('div').children;
      expect(inline.paragraph.brokenItems).to.have.lengthOf(1);
      expect(inline.paragraph.brokenItems[0].glyphs.glyphLength).to.equal(3);
      expect(inline.paragraph.brokenItems[0].glyphs.id(0)).to.equal(2440);
      expect(inline.paragraph.brokenItems[0].glyphs.id(1)).to.equal(2447);
      expect(inline.paragraph.brokenItems[0].glyphs.id(2)).to.equal(2439);
    });

    it('doesn\'t create empty shaped items if style and script overlap', function () {
      // "Hello" according to https://omniglot.com/language/phrases/hebrew.php
      this.layout('Hello <span style="font: 16px Arimo;">הלו</span>');
      /** @type import('../src/layout-flow').IfcInline[] */
      const [inline] = this.get().children;
      expect(inline.paragraph.brokenItems).to.have.lengthOf(2);
    });

    it('assigns levels, inlcuding to LRE..PDF', function () {
      this.layout('Saying HNY: \u202Bحلول السنة intruding english! الجديدة\u202C');
      /** @type import('../src/layout-flow').IfcInline[] */
      const [inline] = this.get().children;
      expect(inline.paragraph.brokenItems).to.have.lengthOf(5);
      expect(inline.paragraph.brokenItems[0].attrs.level).to.equal(0); // Saying HNY:_
      expect(inline.paragraph.brokenItems[1].attrs.level).to.equal(1); // حلول السنة
      expect(inline.paragraph.brokenItems[2].attrs.level).to.equal(2); // intruding english
      expect(inline.paragraph.brokenItems[3].attrs.level).to.equal(1); // !
      expect(inline.paragraph.brokenItems[4].attrs.level).to.equal(1); // الجديدة
    });

    it('chooses the correct text boundaries when painting emoji', function () {
      this.layout('paint 😑 this!');
      /** @type import('../src/layout-flow').IfcInline[] */
      const [inline] = this.get().children;
      const b = this.paint();
      b.drewText('paint ');
      b.drewText('😑');
      b.drewText(' this!');
    });
  });

  describe('Fallbacks', function () {
    it('falls back on diacritic é', function () {
      this.layout('<span style="font: 12px/1 Ramabhadra;">xe\u0301</span>');
      /** @type import('../src/layout-flow').IfcInline[] */
      const [inline] = this.get().children;
      expect(inline.paragraph.brokenItems).to.have.lengthOf(2);
      expect(inline.paragraph.brokenItems[0].glyphs.glyphLength).to.satisfy(l => l > 0);
      expect(inline.paragraph.brokenItems[1].glyphs.glyphLength).to.satisfy(l => l > 0);
      for (let i = 0; i < inline.paragraph.brokenItems[1].glyphs.glyphLength; i++) {
        expect(inline.paragraph.brokenItems[1].glyphs.id(i)).not.to.equal(0);
      }
      expect(inline.paragraph.brokenItems[0].match).not.to.equal(inline.paragraph.brokenItems[1].match);
    });

    it('sums to the same string with many reshapes', function () {
      this.layout('Lorem大併外بينᏣᎳᎩ');
      /** @type import('../src/layout-flow').IfcInline[] */
      const [inline] = this.get().children;
      let s = '';
      for (const item of inline.paragraph.brokenItems) s += item.text();
      expect(s).to.equal('Lorem大併外بينᏣᎳᎩ');
    });

    it('falls back to tofu', function () {
      this.layout('\uffff');
      /** @type import('../src/layout-flow').IfcInline[] */
      const [inline] = this.get().children;
      expect(inline.paragraph.brokenItems).to.have.lengthOf(1);
      expect(inline.paragraph.brokenItems[0].glyphs.glyphLength).equal(1);
      expect(inline.paragraph.brokenItems[0].glyphs.id(0)).to.equal(0);
    });

    it('reshapes the correct segments', function () {
      this.layout(`
        <span style="font-family: Arimo, Cairo;">هل تتحدث لغة أخرى بجانب العربية؟</span>
      `);
      /** @type import('../src/layout-flow').IfcInline[] */
      const [inline] = this.get().children;
      expect(inline.paragraph.brokenItems[0].length).to.equal(2);
    });

    it('affect line height when line height is normal', function () {
      this.layout(`
        <span style="font-family: Arimo, Cairo;">hey هل تتحدث لغة أخرى بجانب العربية؟</span>
      `);
      /** @type import('../src/layout-flow').IfcInline[] */
      const [inline] = this.get().children;
      expect(inline.paragraph.lineboxes).to.have.lengthOf(1)
      expect(inline.paragraph.lineboxes[0].ascender).to.be.approximately(20.848, 0.001);
      expect(inline.paragraph.lineboxes[0].descender).to.be.approximately(9.136, 0.001);
    });
  });
});

describe('Lines', function () {
  before(setupLayoutTests);

  before(function () {
    registerFontAsset('Arimo/Arimo-Regular.ttf');
    registerFontAsset('Ramabhadra/Ramabhadra-Regular.ttf');
    registerFontAsset('Cairo/Cairo-Regular.ttf');
    registerFontAsset('Roboto/Roboto-Regular.ttf');
    registerFontAsset('Noto/NotoSansHebrew-Regular.ttf');
    registerFontAsset('Raleway/Raleway-Regular.ttf');
    registerFontAsset('LigatureSymbolsWithSpaces/LigatureSymbolsWithSpaces.ttf');
    registerFontAsset('Ahem/Ahem.ttf');
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
    this.layout('<div style="width: 0;">eat lots of peaches</div>');
    const [inline] = this.get('div').children;
    expect(inline.paragraph.lineboxes).to.have.lengthOf(4);
    expect(inline.paragraph.lineboxes[0].end()).to.equal(4);
    expect(inline.paragraph.lineboxes[1].end()).to.equal(9);
    expect(inline.paragraph.lineboxes[2].end()).to.equal(12);
    expect(inline.paragraph.lineboxes[3].end()).to.equal(19);
  });

  it('breaks between shaping boundaries', function () {
    this.layout(`
      <div style="width: 100px; font: 16px Roboto;">
        Lorem ipsum <span style="font-size: 17px;">lorem ipsum</span>
      </div>
    `);
    /** @type import('../src/layout-flow').IfcInline[] */
    const [inline] = this.get('div').children;
    expect(inline.paragraph.lineboxes).to.have.lengthOf(2);
    expect(inline.paragraph.lineboxes[0].end()).to.equal(13);
    expect(inline.paragraph.brokenItems).to.have.lengthOf(3);
  });

  it('breaks inside shaping boundaries', function () {
    this.layout(`
      <div style="width: 100px; font: 16px Roboto;">
        Lorem ipsum lorem ipsum
      </div>
    `);
    /** @type import('../src/layout-flow').IfcInline[] */
    const [inline] = this.get('div').children;
    expect(inline.paragraph.lineboxes).to.have.lengthOf(2);
    expect(inline.paragraph.lineboxes[0].end()).to.equal(13);
    expect(inline.paragraph.brokenItems).to.have.lengthOf(2);
  });

  it('leaves shaping boundaries whole if they can be', function () {
    this.layout(`
      <div style="width: 16px; font: 16px Roboto;">
        <span style="line-height: 1;">lorem</span><span style="line-height: 2;">ipsum</span>
        <span style="color: green;">lorem</span><span style="color: purple;">ipsum</span>
      </div>
   `);
    /** @type import('../src/layout-flow').IfcInline[] */
    const [inline] = this.get('div').children;
    expect(inline.paragraph.brokenItems).to.have.lengthOf(2);
  });

  it('splits accurately on hebrew text', function () {
    // "I love you" according to https://omniglot.com/language/phrases/hebrew.php
    // Three words, Arimo@16px in 60px the first two should fit on the first line
    this.layout('<div style="width: 60px; font: 16px Arimo;">אני אוהב אותך</div>');
    /** @type import('../src/layout-flow').IfcInline[] */
    const [inline] = this.get('div').children;
    expect(inline.paragraph.brokenItems).to.have.lengthOf(2);
    expect(inline.paragraph.lineboxes).to.have.lengthOf(2);
    expect(inline.paragraph.lineboxes[0].end()).to.equal(9);
    expect(inline.paragraph.lineboxes[1].end()).to.equal(13);
  });

  it('measures break width correctly', function () {
    // there was once a bug in measureWidth that didn't measure the last
    // glyph. "aa a" is < 35px but "aa aa" is > 35px
    this.layout(`
      <div style="width: 35px; font: 16px Roboto;">aa aa</div>
    `);
    /** @type import('../src/layout-flow').IfcInline[] */
    const [inline] = this.get('div').children;
    expect(inline.paragraph.lineboxes).to.have.lengthOf(2);
  });

  it('correctly breaks items when a 1-word line follows 2+ 1-word lines', function () {
    this.layout(`
      <div style="width: 0px; font: 400 16px Roboto;">
        lorem ipsum lorem
      </div>
    `);

    /** @type import('../src/layout-flow').IfcInline[] */
    const [inline] = this.get('div').children;

    expect(inline.paragraph.lineboxes).to.have.lengthOf(3);
    expect(inline.paragraph.brokenItems).to.have.lengthOf(3);
    expect(inline.paragraph.brokenItems[0].offset).to.equal(0);
    expect(inline.paragraph.brokenItems[1].offset).to.equal(7);
    expect(inline.paragraph.brokenItems[2].offset).to.equal(13);
  });

  it('distributes border, margin, and padding to line items', function () {
    // this isn't really wrapping, it's text processing. should I come up
    // with a new word or should the code change to separate concepts?
    this.layout(`
      <div style="font: 16px Arimo;">
        <span style="padding: 5px;">A</span>
        <span style="border: 10px solid blue;">A</span>
        <span style="margin: 1px;">A</span>
      </div>
    `);

    /** @type import('../src/layout-flow').IfcInline[] */
    const [ifc] = this.get('div').children;
    expect(ifc.paragraph.brokenItems).to.have.lengthOf(7);

    const a1 = ifc.paragraph.lineboxes[0].head.next; // A
    expect(a1.value.inlines).to.have.lengthOf(1);
    expect(a1.value.inlines[0].getLineLeftMarginBorderPadding(ifc)).to.equal(5);
    expect(a1.value.inlines[0].getLineRightMarginBorderPadding(ifc)).to.equal(5);
    expect(a1.value.inlines[0].nshaped).to.equal(1);

    const a2 = a1.next.next; // A
    expect(a2.value.inlines).to.have.lengthOf(1);
    expect(a2.value.inlines[0].getLineLeftMarginBorderPadding(ifc)).to.equal(10);
    expect(a2.value.inlines[0].getLineRightMarginBorderPadding(ifc)).to.equal(10);
    expect(a2.value.inlines[0].nshaped).to.equal(1);

    const a3 = a2.next.next; // A
    expect(a3.value.inlines).to.have.lengthOf(1);
    expect(a3.value.inlines[0].getLineLeftMarginBorderPadding(ifc)).to.equal(1);
    expect(a3.value.inlines[0].getLineRightMarginBorderPadding(ifc)).to.equal(1);
    expect(a3.value.inlines[0].nshaped).to.equal(1);
  });

  it('puts contiguous padding at the top line except the last padding-lefts', function () {
    this.layout(`
      <div style="width: 50px; font: 16px Arimo;">
        It's a <span style="padding: 10px;"></span><span style="padding-left: 11px;"></span>
        <span style="padding-left: 10px;">wrap!</span>
      </div>
    `);

    /** @type import('../src/layout-flow').IfcInline[] */
    const [ifc] = this.get('div').children;
    expect(ifc.paragraph.lineboxes).to.have.lengthOf(3);

    let n = ifc.paragraph.lineboxes[1].head.next; // 10px shiv
    expect(n.value.inlines).to.have.lengthOf(1);
    expect(n.value.inlines[0].nshaped).to.equal(1);
    expect(n.value.inlines[0].getLineLeftMarginBorderPadding(ifc)).to.equal(10);
    expect(n.value.inlines[0].getLineRightMarginBorderPadding(ifc)).to.equal(10);

    n = n.next; // 11px shiv
    expect(n.value.inlines).to.have.lengthOf(1);
    expect(n.value.inlines[0].nshaped).to.equal(1);
    expect(n.value.inlines[0].getLineLeftMarginBorderPadding(ifc)).to.equal(11);
    expect(n.value.inlines[0].getLineRightMarginBorderPadding(ifc)).to.equal(0);

    n = ifc.paragraph.lineboxes[2].head; // 10px "wrap"
    expect(n.value.inlines).to.have.lengthOf(1);
    expect(n.value.inlines[0].nshaped).to.equal(1);
    expect(n.value.inlines[0].getLineLeftMarginBorderPadding(ifc)).to.equal(10);
    expect(n.value.inlines[0].getLineRightMarginBorderPadding(ifc)).to.equal(0);
  });

  it('assigns the right number of shaped items with non-shaping-boundary spans', function () {
    this.layout(`
      <span>One span<span>Two spans</span></span>
    `);

    /** @type import('../src/layout-flow').IfcInline[] */
    const [ifc] = this.get().children;
    expect(ifc.children[0].nshaped).to.equal(1);
  });

  it('updates item inlines/count when wrapping', function () {
    this.layout(`
      <div style="width: 100px; font: Arimo;">
        <span><span>One span </span><span>Two spans</span></span>
      </div>
    `);

    /** @type import('../src/layout-flow').IfcInline[] */
    const [ifc] = this.get('div').children;
    expect(ifc.paragraph.brokenItems).to.have.lengthOf(2);
    expect(ifc.paragraph.brokenItems[0].inlines).to.have.lengthOf(2);
    expect(ifc.paragraph.brokenItems[0].inlines[0].end).to.equal(19);
    expect(ifc.paragraph.brokenItems[0].inlines[1].end).to.equal(10);
    expect(ifc.paragraph.brokenItems[1].inlines).to.have.lengthOf(2);
    expect(ifc.paragraph.brokenItems[1].inlines[0].end).to.equal(19);
    expect(ifc.paragraph.brokenItems[1].inlines[1].end).to.equal(19);
  });

  it('considers padding-right on a break as belonging to the left word', function () {
    this.layout(`
      <div style="width: 70px; font: 16px Arimo;">
        Word <span style="padding-right: 70px;">fits </span>padding
      </div>
    `);

    /** @type import('../src/layout-flow').IfcInline[] */
    const [inline] = this.get('div').children;
    expect(inline.paragraph.lineboxes).to.have.lengthOf(3);
    expect(inline.paragraph.lineboxes[0].end()).to.equal(6);
    expect(inline.paragraph.lineboxes[1].end()).to.equal(11);
  });

  it('ignores empty spans when assigning padding to words', function () {
    this.layout(`
      <div style="width: 70px; font: 16px Arimo;">
        Word <span style="padding-left: 70px;"><span></span>hey</span>
      </div>
    `);

    /** @type import('../src/layout-flow').IfcInline[] */
    const [ifc] = this.get('div').children;

    let n = ifc.paragraph.lineboxes[0].head; // Word
    expect(n.next).to.equal(null);
    n = ifc.paragraph.lineboxes[1].head; // Shiv ""
    expect(n.value.inlines).to.have.lengthOf(2);
    expect(n.value.inlines[0].getLineLeftMarginBorderPadding(ifc)).to.equal(70);
    expect(n.value.inlines[1].getLineLeftMarginBorderPadding(ifc)).to.equal(0);
    n = n.next // "hey"
    expect(n.value.inlines).to.have.lengthOf(1);
  });

  it('adds padding that wasn\'t measured for fit to the line', function () {
    this.layout(`
      <div style="width: 70px; font: 16px Arimo;">
        Word <span style="padding-right: 30px;">x </span>x
      </div>
    `);

    /** @type import('../src/layout-flow').IfcInline[] */
    const [inline] = this.get('div').children;
    expect(inline.paragraph.lineboxes).to.have.lengthOf(2);
  });

  it('adds buffered padding to line width', function () {
    this.layout(`
      <div style="font: 16px Arimo; width: 5em;">
        Hey<span style="padding-left: 5em;"> wrap</span>
      </div>
    `);

    /** @type import('../src/layout-flow').IfcInline[] */
    const [inline] = this.get('div').children;
    expect(inline.paragraph.lineboxes).to.have.lengthOf(2);
  });


  it('adds buffered padding to line width', function () {
    this.layout(`
      <div style="width: 300px; font: 16px Arimo;">
        Give_me_the_next_span
        <span style="padding-left: 300px;"></span><span style="padding-left: 150px;">not me</span>
      </div>
    `);

    /** @type import('../src/layout-flow').IfcInline[] */
    const [ifc] = this.get('div').children;
    expect(ifc.paragraph.lineboxes).to.have.lengthOf(2);

    let n = ifc.paragraph.lineboxes[0].head; // ' Give_me_the_next_span '
    expect(n.value.text()).to.equal(' Give_me_the_next_span ');
    n = n.next; // Shiv ''
    expect(n.value.inlines[0].getLineLeftMarginBorderPadding(ifc)).to.equal(300);
    expect(n.value.inlines[0].getLineRightMarginBorderPadding(ifc)).to.equal(0);
    expect(n.next).to.be.null;

    n = ifc.paragraph.lineboxes[1].head; // 'not me'
    expect(n.value.text()).to.equal('not me ');
    expect(n.value.inlines[0].getLineLeftMarginBorderPadding(ifc)).to.equal(150);
  });

  it('calculates line height with the correct shaped item/inline pairings', function () {
    this.layout(`
      <div style="width: 0;"><span style="font: 16px/2 Noto Sans Hebrew;">אוטו </span><span style="font: 16px/3 Cairo;">Car</span></div>
    `);

    /** @type import('../src/layout-flow').IfcInline[] */
    const [inline] = this.get('div').children;
    // Noto Sans ascender = 1069/1000 descender = 293/1000
    expect(inline.paragraph.lineboxes[0].ascender).to.be.approximately(22.2, 0.1);
    expect(inline.paragraph.lineboxes[0].descender).to.be.approximately(9.8, 0.1);
    // Cairo ascender = 1303/1000 descender = 571/1000
    expect(inline.paragraph.lineboxes[1].ascender).to.be.approximately(29.9, 0.1);
    expect(inline.paragraph.lineboxes[1].descender).to.be.approximately(18.1, 0.1);
  });

  it('supports line-height: px', function () {
    this.layout(`
      <div style="font: 16px/100px Arimo;">The lines are so big!</div>
    `);

    /** @type import('../src/layout-flow').IfcInline[] */
    const [ifc] = this.get('div').children;
    expect(ifc.paragraph.lineboxes[0].ascender + ifc.paragraph.lineboxes[0].descender).to.equal(100);
  });

  it('uses the correct line height when multiple spans cross a shaped item', function () {
    this.layout(`
      <div style="width: 16px; font: 16px Roboto;">
        <span style="line-height: 1;">lorem</span><span style="line-height: 2;">ipsum</span>
      </div>
   `);
    /** @type import('../src/layout-flow').IfcInline[] */
    const [inline] = this.get('div').children;
    expect(inline.paragraph.lineboxes[0].ascender + inline.paragraph.lineboxes[0].descender).to.equal(32);
  });

  it('uses the correct line height when a shaped item is broken', function () {
    this.layout(`
      <div style="width: 0; font: 16px Roboto;">
        <span style="line-height: 32px;">lorem</span> <span style="line-height: 64px;">ipsum</span>
      </div>
   `);
    /** @type import('../src/layout-flow').BlockContainer */
    const ifc = this.get('div');
    expect(ifc.contentArea.height).to.equal(32 + 64);
  });

  it('uses the correct inline side to create shaping boundaries', function () {
    this.layout(`
      <div style="width: 300px; direction: rtl; font: 16px Cairo;">
        <span style="padding-left: 1em;">أنا </span>بخير شكرا و أنت؟
      </div>
    `);

    /** @type import('../src/layout-flow').IfcInline[] */
    const [ifc] = this.get('div').children;
    expect(ifc.paragraph.brokenItems).to.have.lengthOf(2);
    expect(ifc.paragraph.brokenItems[0].end()).to.equal(5);
  });

  it('adds new lines at <br>', function () {
    // Translation from Arabic:
    // How are you?
    // I'm fine thank you, and you?
    this.layout(`
      <div style="width: 150px; direction: rtl; font: 16px Cairo;">
        كيف حالك؟
        <br>أنا بخير شكرا و أنت؟
      </div>
    `);

    /** @type import('../src/layout-flow').IfcInline[] */
    const [ifc] = this.get('div').children;
    expect(ifc.paragraph.brokenItems).to.have.lengthOf(2);
    expect(ifc.paragraph.brokenItems[0].end()).to.equal(11);
  });

  it('sets the height of an ifc box correctly', function () {
    this.layout(`
      <div style="width: 500px; font: 16px Ramabhadra">
        <span style="font: 16px Roboto;">I could be<br>reading a book</span>
        <span style="font: 12px Arimo;">But I like writing layout engines instead</span>
      </div>
    `);

    expect(this.get('div').contentArea.height).to.be.approximately(60.7, 0.1);
  });

  it('doesn\'t set the height if it\'s explicitly set', function () {
    this.layout(`
      <div style="height: 50px; width: 100px; font: 16px Arimo;">
        I could be reading a book but I like writing layout engines instead
      </div>
    `);

    expect(this.get('div').contentArea.height).to.equal(50);
  });

  it('carries over colors and line heights correctly', function () {
    this.layout(`
      <div style="width: 0; line-height: 32px;">
        break
        it
        <span style="color: red; line-height: 64px;">down</span>
      </div>
    `);

    /** @type import('../src/layout-flow').IfcInline[] */
    const [ifc] = this.get(0).children;
    const colors = ifc.paragraph.getColors();

    expect(colors).to.deep.equal([
      [{r: 0, g: 0, b: 0, a: 1}, 0],
      [{r: 255, g: 0, b: 0, a: 1}, 10],
      [{r: 0, g: 0, b: 0, a: 1}, 14]
    ]);

    expect(ifc.paragraph.lineboxes[0].head.value.colorsStart(colors)).to.deep.equal(0);
    expect(ifc.paragraph.lineboxes[1].head.value.colorsStart(colors)).to.deep.equal(0);
    expect(ifc.paragraph.lineboxes[2].head.value.colorsStart(colors)).to.deep.equal(1);
  });

  it('takes strut into account', function () {
    this.layout(`
      <div style="font: 16px/1 Arimo;"><span style="font: 4px Arimo;">tiny!</span></div>
    `);

    /** @type import('../src/layout-flow').IfcInline[] */
    const [ifc] = this.get('div').children;
    expect(ifc.paragraph.height).to.equal(16);
  });

  it('takes inline struts into account', function () {
    this.layout(`
      <!-- Cairo does not have Phi. Cairo has larger suggested leading than Arimo. -->
      <div style="font: 16px/0 Arimo;">
        <span style="font: 16px Cairo, Arimo;">ɸ</span>
      </div>
    `);

    /** @type import('../src/layout-flow').IfcInline[] */
    const [ifc] = this.get('div').children;
    expect(ifc.paragraph.height).to.be.approximately(29.984, 0.001);
  });

  it('takes inline struts into account even if they have no content', function () {
    this.layout(`
      <div style="font: 16px/0 Arimo;">
        whoop_de_do<span style="font: 16px Cairo;"></span>
      </div>
    `);

    /** @type import('../src/layout-flow').IfcInline[] */
    const [ifc] = this.get('div').children;
    expect(ifc.paragraph.height).to.be.approximately(29.984, 0.001);
  });

  it('sets box to linebox height when it\'s a bfc and ifc', function () {
    this.layout(`
      <div id="t" style="display: flow-root; line-height: 20px;">woeisme</div>
    `);

    /** @type import('../src/layout-flow').BlockContainer */
    const t = this.get('#t');
    expect(t.contentArea.height).to.equal(20);
  });

  it('uses the right block position for a wrapped word with a hard break at the end', function () {
    this.layout(`
      <div id="t" style="font: 16px/20px Arimo; width: 80px;">
        A simple test<br>
      </div>
    `);

    /** @type import('../src/layout-flow').IfcInline[] */
    const [ifc] = this.get('#t').children;
    expect(ifc.paragraph.lineboxes.length).to.equal(3);
    expect(ifc.paragraph.lineboxes[1].blockOffset).to.equal(20);
  });

  it('doesn\'t wrap in spans with soft wraps turned off', function () {
    this.layout(`
      <div id="t" style="font: 16px Arimo; width: 100px;">
        I like
        <span style="white-space: nowrap;">tests that aren't hard to think about</span>
        because easy
      </div>
    `);

    /** @type import('../src/layout-flow').IfcInline[] */
    const [ifc] = this.get('#t').children;
    expect(ifc.paragraph.lineboxes.length).to.equal(3);
    expect(ifc.paragraph.lineboxes[2].startOffset).to.equal(46);
  });

  it('does wrap on a <br> inside a nowrap span', function () {
    this.layout(`
      <div id="t" style="font: 16px Arimo; width: 100px;">
        I like
        <span style="white-space: nowrap;">tests that aren't<br>hard to think about</span>
        because easy
      </div>
    `);

    /** @type import('../src/layout-flow').IfcInline[] */
    const [ifc] = this.get('#t').children;
    expect(ifc.paragraph.lineboxes.length).to.equal(4);
    expect(ifc.paragraph.lineboxes[2].startOffset).to.equal(25);
  });

  it('wraps on soft wraps inside a nowrap span', function () {
    this.layout(`
      <div id="t" style="font: 16px Arimo; width: 100px;">
        I like
        <span style="white-space: nowrap;">tests that <span style="white-space: normal;">aren't hard</span> to think about</span>
        because easy
      </div>
    `);

    /** @type import('../src/layout-flow').IfcInline[] */
    const [ifc] = this.get('#t').children;
    expect(ifc.paragraph.lineboxes.length).to.equal(4);
    expect(ifc.paragraph.lineboxes[2].startOffset).to.equal(26);
  });

  it('lays out entirely nowrap text', function () {
    this.layout(`
      <div id="t" style="font: 16px Arimo; width: 100px; white-space: nowrap;">
        I like tests that aren't hard to think about because easy
      </div>
    `);

    /** @type import('../src/layout-flow').IfcInline[] */
    const [ifc] = this.get('#t').children;
    expect(ifc.paragraph.lineboxes.length).to.equal(1);
    expect(ifc.paragraph.lineboxes[0].endOffset).to.equal(59);
  });

  it('follows all hard breaks', function () {
    this.layout(`
      <div id="t" style="white-space: pre;">
      second line
      third line
      fourth line
      </div>
    `);

    /** @type import('../src/layout-flow').IfcInline[] */
    const [ifc] = this.get('#t').children;
    expect(ifc.paragraph.lineboxes.length).to.equal(5);
  });

  it('breaks ligatures with internal break opportunities', function () {
    this.layout(`
      <div id="t" style="font: 16px/1.4 Raleway; width: 95px;">
        Affable waf&ZeroWidthSpace;fle
      </div>
    `);
    /** @type import('../src/layout-flow').IfcInline[] */
    const [inline] = this.get('div').children;
    expect(inline.paragraph.lineboxes.length).to.equal(2);
    expect(inline.paragraph.lineboxes[1].head.value.offset).to.equal(13);
    expect(inline.paragraph.lineboxes[1].head.value.glyphs.id(0)).to.equal(474);
  });

  it('breaks after ligature when it fits', function () {
    // Note: with word cache, glyphs sum to 100.176. Without, it's 99.728
    this.layout(`
      <div id="t" style="font: 16px/1.4 Raleway; width: 101px;">
        Affable waf&ZeroWidthSpace;fle
      </div>
    `);
    /** @type import('../src/layout-flow').IfcInline[] */
    const [inline] = this.get('div').children;
    expect(inline.paragraph.lineboxes.length).to.equal(1);
  });

  it('breaks before ligature when it doesn\'t fit', function () {
    this.layout(`
      <div id="t" style="font: 16px/1.4 Raleway; width: 52px;">
        Affable waf&ZeroWidthSpace;fle
      </div>
    `);
    /** @type import('../src/layout-flow').IfcInline[] */
    const [inline] = this.get('div').children;
    expect(inline.paragraph.lineboxes.length).to.equal(2);
    expect(inline.paragraph.lineboxes[1].head.value.offset).to.equal(9);
  });

  it('remembers in-ligature measure state when carried to next line', function () {
    this.layout(`
      <div style="font: 24px LigatureSymbolsWithSpaces; width: 100px;">
        Ligature symbols
        daily calendar calendar align left align center align right
      </div>
    `);
    /** @type import('../src/layout-flow').IfcInline[] */
    const [inline] = this.get('div').children;
    expect(inline.paragraph.lineboxes.length).to.equal(4);
    expect(inline.paragraph.lineboxes[3].head.value.offset).to.equal(66);
  });

  it('adds a soft hyphen if one fits after a &shy', function () {
    this.layout(`
      <div id="t" style="font: 16px Arimo; width: 119px;">
        Characters com&shy;bine to create words
      </div>
    `);
    /** @type import('../src/layout-flow').IfcInline[] */
    const [inline] = this.get('div').children;
    const glyphs = inline.paragraph.lineboxes[0].head.value.glyphs;
    expect(glyphs.id(glyphs.glyphLength - 1)).to.equal(2623);
    expect(inline.paragraph.lineboxes[1].head.value.offset).to.equal(16);
  });

  it('doesn\'t add a hyphen if it wouldn\'t fit', function () {
    this.layout(`
      <div id="t" style="font: 16px Arimo; width: 118px;">
        Characters com&shy;bine to create words
      </div>
    `);
    /** @type import('../src/layout-flow').IfcInline[] */
    const [inline] = this.get('div').children;
    const glyphs = inline.paragraph.lineboxes[0].head.value.glyphs;
    expect(glyphs.id(glyphs.glyphLength - 1)).to.equal(3);
    expect(inline.paragraph.lineboxes[1].head.value.offset).to.equal(12);
  });

  it('adds a soft hyphen to RTL text if one fits after a &shy', function () {
    this.layout(`
      <div id="t" style="direction: rtl; font: 24px Cairo; width: 51px;">
        دامي&shy;دى
      </div>
    `);
    /** @type import('../src/layout-flow').IfcInline[] */
    const [inline] = this.get('div').children;
    expect(inline.paragraph.lineboxes[0].head.value.glyphs.id(0)).to.equal(672);
    expect(inline.paragraph.lineboxes[1].head.value.offset).to.equal(6);
  });

  it('carries over leading to the next line', function () {
    this.layout(`
      <div id="t" style="font: 16px/1 Arimo; width: 0;">
        <span style="line-height: 2;">Scarves of red</span>
      </div>
    `);
    /** @type import('../src/layout-flow').IfcInline[] */
    const [inline] = this.get('div').children;
    expect(inline.paragraph.lineboxes[2].blockOffset).to.equal(64);
  });

  it('positions RTL items at the end of the CB', function () {
    this.layout(`
      <div id="t" style="width: 100px; direction: rtl;">
        whereami
      </div>
    `);

    /** @type import('../src/layout-flow').IfcInline[] */
    const [ifc] = this.get('div').children;
    expect(ifc.paragraph.brokenItems[0].x).to.be.approximately(30.641, 0.001);
  });

  it('measures the last glyph in an RTL item correctly', function () {
    this.layout(`
      <div id="t" style="width: 100px; direction: rtl;">
        أسف<br>
      </div>
    `);

    /** @type import('../src/layout-flow').IfcInline[] */
    const [ifc] = this.get('div').children;
    expect(ifc.paragraph.brokenItems[0].x).to.be.approximately(65.584, 0.001);
  });

  it('breaks shaping boundaries on negative margins', function () {
    this.layout(`
      <div>
        left <span style="margin-left: -10px;">right</span>
      </div>
    `);

    /** @type import('../src/layout-flow').IfcInline[] */
    const [ifc] = this.get('div').children;
    // “ ” “אחד ” “שתיים” “ ” “three” “ ”
    // TODO: why are the 1st and 3rd spaces shaped individually?
    expect(ifc.paragraph.brokenItems.length).to.equal(2);
    expect(ifc.paragraph.brokenItems[0].x).to.equal(0);
    expect(ifc.paragraph.brokenItems[1].x).to.be.approximately(15.789, 0.001);
  });

  it('takes margin-right into account on the line', function () {
    // a dumb mistake caused this one
    this.layout(`
      <div style="width: 100px;">
        big <span style="margin-right: 100px;"></span> crane
      </div>
    `);

    /** @type import('../src/layout-flow').IfcInline[] */
    const [ifc] = this.get('div').children;
    // “ ” “אחד ” “שתיים” “ ” “three” “ ”
    expect(ifc.paragraph.lineboxes.length).to.equal(2);
  });

  describe('Whitespace', function () {
    it('skips whitespace at the beginning of the line if it\'s collapsible', function () {
      this.layout(`
        <div style="font: 16px Arimo; width: 50px;">        hi hi</div>
      `);
      const [inline] = this.get('div').children;
      expect(inline.paragraph.lineboxes.length).to.equal(1);
    });

    it('keeps whitespace at the beginning of the line when it\'s not collapsible', function () {
      this.layout(`
        <div style="font: 16px Arimo; white-space: pre-wrap; width: 50px;">        hi hi</div>
      `);
      const [inline] = this.get('div').children;
      expect(inline.paragraph.lineboxes.length).to.equal(2);
    });

    it('measures whitespace before a break if the break has padding on it', function () {
      // "Word_fits<5>" does fit on a line, but "Word_fits_<5>" does not
      //
      // Interestingly, Firefox fails this one - it puts the padding-right on the
      // first line right up next to the end of the word "fits", even though that
      // appears incorrect since we put a space before the padding in the source below.
      this.layout(`
        <div style="width: 70px; font: 16px Arimo;">
          Word <span style="padding-right: 5px;">fits </span>padding
        </div>
      `);

      /** @type import('../src/layout-flow').IfcInline[] */
      const [inline] = this.get('div').children;
      expect(inline.paragraph.lineboxes).to.have.lengthOf(3);
    });

    it('collapses whitespace at the start of the line', function () {
      this.layout(`
        <div style="width: 100px; font: 16px Arimo;">
          Oh give me a home where the buffalo roam
        </div>
      `);

      /** @type import('../src/layout-flow').IfcInline[] */
      const [inline] = this.get('div').children;
      expect(inline.paragraph.lineboxes[0].head.value.glyphs.ad(0)).to.equal(0);
    });

    it('starts a new linebox after \\n when newlines are preserved', function () {
      this.layout(`
        <div style="width: 300px; font: 16px/20px Arimo; white-space: pre-line;">
          Funny it is
          The things that I spout
          When I have to make words
          To test the code out
        </div>
      `);

      /** @type import('../src/layout-flow').IfcInline[] */
      const [ifc] = this.get('div').children;
      expect(ifc.paragraph.lineboxes).to.have.lengthOf(6);
      expect(ifc.paragraph.lineboxes[0].startOffset).to.equal(0);
      expect(ifc.paragraph.lineboxes[1].startOffset).to.equal(1);
      expect(ifc.paragraph.lineboxes[5].startOffset).to.equal(84);
      expect(ifc.paragraph.height).to.equal(120);
    });

    it('can make empty lineboxes when newlines are preserved', function () {
      this.layout(`
        <div style="width: 300px; font: 16px Arimo; white-space: pre-line;">
          I have to make words


          To test the code out
        </div>
      `);

      /** @type import('../src/layout-flow').IfcInline[] */
      const [ifc] = this.get('div').children;
      expect(ifc.paragraph.lineboxes).to.have.lengthOf(6);
      expect(ifc.paragraph.lineboxes[0].startOffset).to.equal(0);
      expect(ifc.paragraph.lineboxes[1].startOffset).to.equal(1);
      expect(ifc.paragraph.lineboxes[2].startOffset).to.equal(22);
      expect(ifc.paragraph.lineboxes[3].startOffset).to.equal(23);
      expect(ifc.paragraph.lineboxes[4].startOffset).to.equal(24);
    });

    it('makes two lineboxes for <br>\\n or \\n<br> when newlines are preserved', function () {
      this.layout('<div style="white-space: pre-line;">a\n<br>b<br>\nc');
      /** @type import('../src/layout-flow').IfcInline[] */
      const [ifc] = this.get('div').children;
      expect(ifc.paragraph.lineboxes).to.have.lengthOf(5);
      expect(ifc.paragraph.lineboxes[0].startOffset).to.equal(0);
      expect(ifc.paragraph.lineboxes[0].endOffset).to.equal(2);
      expect(ifc.paragraph.lineboxes[1].startOffset).to.equal(2);
      expect(ifc.paragraph.lineboxes[1].endOffset).to.equal(2);
      expect(ifc.paragraph.lineboxes[2].startOffset).to.equal(2);
      expect(ifc.paragraph.lineboxes[2].endOffset).to.equal(3);
      expect(ifc.paragraph.lineboxes[3].startOffset).to.equal(3);
      expect(ifc.paragraph.lineboxes[3].endOffset).to.equal(4);
      expect(ifc.paragraph.lineboxes[4].startOffset).to.equal(4);
      expect(ifc.paragraph.lineboxes[4].endOffset).to.equal(5);
    });

    it('measures uncollapsible whitespace for fit', function () {
      this.layout(
        '<div style="width: 100px; font: 16px Arimo; white-space: pre-wrap;">' +
          '            im not gonna fit' +
        '</div>'
      );
      const [ifc] = this.get('div').children;
      expect(ifc.paragraph.lineboxes).to.have.lengthOf(2);
      expect(ifc.paragraph.lineboxes[0].startOffset).to.equal(0);
      expect(ifc.paragraph.lineboxes[0].endOffset).to.equal(19);
      expect(ifc.paragraph.lineboxes[1].startOffset).to.equal(19);
      expect(ifc.paragraph.lineboxes[1].endOffset).to.equal(28);
    });

    it('doesn\'t measure uncollapsible whitespace at the end of the line for fit', function () {
      this.layout(
        '<div style="width: 100px; font: 16px Arimo; white-space: pre-wrap;">' +
          'im gonna fit            ' +
        '</div>'
      );
      const [ifc] = this.get('div').children;
      expect(ifc.paragraph.lineboxes).to.have.lengthOf(1);
      expect(ifc.paragraph.lineboxes[0].startOffset).to.equal(0);
      expect(ifc.paragraph.lineboxes[0].endOffset).to.equal(24);
    });

    it('correctly collapses end-of-line whitespace in glyphs', function () {
      this.layout(`
        <div style="width: 300px; font: 16px Arimo, Cairo;">
           hello السلام عليكم (as-salām 'alaykum)
        </div>
      `);
      const [ifc] = this.get('div').children;
      const glyphs = ifc.paragraph.brokenItems.at(-1).glyphs;
      expect(glyphs.id(glyphs.glyphLength - 1)).to.equal(3);
      expect(glyphs.ad(glyphs.glyphLength - 1)).to.equal(0);
      expect(ifc.paragraph.brokenItems.at(0).glyphs.ad(0)).to.equal(0);
    });

    it('does create lineboxes if there were sized inlines but no text', function () {
      this.layout(`
        <div style="font: 16px/20px Arimo;">
          <span style="margin-right: 1px;"></span>
        </div>
      `);
      expect(this.get('div').borderArea.height).to.equal(20);
    });

    it('uses the font\'s internal leading when a shaped item is split onto a new line', function () {
      // This one is hard to set up. We need to cause a single ShapedItem using
      // one font to be broken. If we specified a different font on the div, it
      // would shape the spaces with that first (need to fix that) and cause us
      // to be breaking in between rather than inside. We can't wrap the inner
      // text with a span because that has a strut. Searching for a font that
      // doesn't exist allows the itemized portion to find a font via language,
      // (Cairo) and the div will use the first registered font (not Cairo).
      this.layout('<div style="font: 16px XXX; width: 0;">متشرف بمعرفتك</div>');
      const [ifc] = this.get('div').children;
      expect(ifc.paragraph.lineboxes.length).to.equal(2);
      expect(ifc.paragraph.lineboxes[1].height()).to.be.approximately(29.984, 0.001);
    });
  });

  describe('Overflow-wrap', function () {
    it('breaks inlines that have the rule, not ones that don\'t', function () {
      this.layout(`
        <div id="t" style="width: 50px; font: 10px Ahem;">
          guided by
          <span style="overflow-wrap: anywhere;">voices</span>
        </div>
      `);

      /** @type import('../src/layout-flow').IfcInline[] */
      const [ifc] = this.get('#t').children;

      expect(ifc.paragraph.lineboxes.length).to.equal(4);
      expect(ifc.paragraph.lineboxes[0].startOffset).to.equal(0);
      expect(ifc.paragraph.lineboxes[1].startOffset).to.equal(8);
      expect(ifc.paragraph.lineboxes[2].startOffset).to.equal(11);
      expect(ifc.paragraph.lineboxes[3].startOffset).to.equal(16);
    });

    it('word-break: break-word functions as anywhere', function () {
      this.layout(`
        <div id="t" style="font: 10px Ahem; word-break: break-word; width: 90px;">
          Is it springtime today yet?
        </div>
      `);

      /** @type import('../src/layout-flow').IfcInline[] */
      const [ifc] = this.get('#t').children;

      expect(ifc.paragraph.lineboxes.length).to.equal(4);
      expect(ifc.paragraph.lineboxes[0].startOffset).to.equal(0);
      expect(ifc.paragraph.lineboxes[1].startOffset).to.equal(7);
      expect(ifc.paragraph.lineboxes[2].startOffset).to.equal(16);
      expect(ifc.paragraph.lineboxes[3].startOffset).to.equal(24);
    });

    it('places floats after broken words', function () {
      // https://bugs.webkit.org/show_bug.cgi?id=272534
      // ab | cd◾️ | ef
      this.layout(`
        <div id="t1" style="font: 10px/1 Ahem; width: 25px; overflow-wrap: anywhere;">
          abcd<div id="t2" style="float: left; width: 5px; height: 5px;"></div>ef
        </div>
      `);

      /** @type import('../src/layout-flow').IfcInline[] */
      const [ifc] = this.get('#t1').children;

      expect(ifc.paragraph.lineboxes.length).to.equal(3);
      expect(ifc.paragraph.lineboxes[0].startOffset).to.equal(0);
      expect(ifc.paragraph.lineboxes[1].startOffset).to.equal(3);
      expect(ifc.paragraph.lineboxes[2].startOffset).to.equal(5);

      expect(this.get('#t2').contentArea.x).to.equal(0);
      expect(this.get('#t2').contentArea.y).to.equal(10);
    });

    it('measures and places inlines inside break-word correctly', function () {
      // big | [ro | om] | bar
      this.layout(`
        <div id="t" style="font: 10px Ahem; width: 30px; overflow-wrap: anywhere;">
          big <span style="padding: 0 10px;">room</span> bar
        </div>
      `);

      /** @type import('../src/layout-flow').IfcInline[] */
      const [ifc] = this.get('#t').children;

      expect(ifc.paragraph.lineboxes.length).to.equal(4);
      expect(ifc.paragraph.lineboxes[0].startOffset).to.equal(0);
      expect(ifc.paragraph.lineboxes[1].startOffset).to.equal(5);
      expect(ifc.paragraph.lineboxes[2].startOffset).to.equal(7);
      expect(ifc.paragraph.lineboxes[3].startOffset).to.equal(10);
    });

    it('anywhere affects min-content', function () {
      this.layout(`
        <div style="width: 0;">
          <div id="t" style="font: 10px Ahem; overflow-wrap: anywhere; float: left;">abcde</div>
        </div>
      `);

      expect(this.get('#t').contentArea.width).to.equal(10);
    });

    it('break-word doesn\'t affect min-content', function () {
      this.layout(`
        <div style="width: 0;">
          <div id="t" style="font: 10px Ahem; overflow-wrap: break-word; float: left;">abcde</div>
        </div>
      `);

      expect(this.get('#t').contentArea.width).to.equal(50);
    });

    it('anywhere doesn\'t infinite loop on an ifc with only floats', function () {
      this.layout(`
        <div style="overflow-wrap: anywhere;">
          <div style="float: left;"></div>
        </div>
      `);
    });
  });
});

describe('Vertical Align', function () {
  before(setupLayoutTests);

  before(function () {
    registerFontAsset('Arimo/Arimo-Regular.ttf');
    registerFontAsset('Cairo/Cairo-Regular.ttf');
  });

  after(function () {
    unregisterFontAsset('Arimo/Arimo-Regular.ttf');
    unregisterFontAsset('Cairo/Cairo-Regular.ttf');
  });

  afterEach(logIfFailed);

  it('aligns text to middle', function () {
    this.layout(`
      <div style="font: 16px/20px Arimo;">
        baseline <span style="vertical-align: middle; font: 8px/8px Arimo;">middle</span>
      </div>
    `);

    const b = this.paint();
    expect(b.drewText('baseline ').y).to.be.approximately(15.547, 0.001);
    expect(b.drewText('middle').y).to.be.approximately(14.094, 0.001);
    /** @type import('../src/layout-flow').IfcInline[] */
    const [ifc] = this.get('div').children;
    expect(ifc.paragraph.lineboxes[0].height()).to.equal(20);
  });

  it('aligns inline-block to middle', function () {
    this.layout(`
      <div id="t1" style="font: 16px/20px Arimo;">
        baseline
        <div id="t2" style="display: inline-block; height: 10px; vertical-align: middle;"></div>
        <div id="t3" style="display: inline-block; vertical-align: middle;">middle</div>
      </div>
    `);

    /** @type import('../src/layout-flow').IfcInline[] */
    const [ifc] = this.get('#t1').children;
    expect(ifc.paragraph.lineboxes[0].height()).to.be.approximately(21.320, 0.001);
    expect(ifc.paragraph.lineboxes[0].ascender).to.be.approximately(15.547, 0.001);
    expect(this.get('#t2').contentArea.y).to.be.approximately(6.320, 0.001);
    expect(this.get('#t3').contentArea.y).to.be.approximately(1.320, 0.001);
  });

  it('aligns text to subscript', function () {
    this.layout(`
      <div style="font: 16px/20px Arimo;">
        baseline <span style="vertical-align: sub;">sub</span>
      </div>
    `);

    const b = this.paint();
    expect(b.drewText('baseline ').y).to.be.approximately(15.547, 0.001);
    expect(b.drewText('sub').y).to.be.approximately(18.747, 0.001);
    /** @type import('../src/layout-flow').IfcInline[] */
    const [ifc] = this.get('div').children;
    expect(ifc.paragraph.lineboxes[0].height()).to.equal(23.2);
  });

  it('aligns inline-block to subscript', function () {
    this.layout(`
      <div id="t1" style="font: 16px/20px Arimo;">
        baseline
        <div id="t2" style="display: inline-block; height: 10px; vertical-align: sub;"></div>
        <div id="t3" style="display: inline-block; vertical-align: sub;">sub</div>
      </div>
    `);

    /** @type import('../src/layout-flow').IfcInline[] */
    const [ifc] = this.get('#t1').children;
    expect(ifc.paragraph.lineboxes[0].height()).to.be.approximately(23.200, 0.001);
    expect(ifc.paragraph.lineboxes[0].ascender).to.be.approximately(15.547, 0.001);
    expect(this.get('#t2').contentArea.y).to.be.approximately(8.747, 0.001);
    expect(this.get('#t3').contentArea.y).to.be.approximately(3.199, 0.001);
  });

  it('aligns text to superscript', function () {
    this.layout(`
      <div style="font: 16px/20px Arimo;">
        baseline <span style="vertical-align: super;">super</span>
      </div>
    `);

    const b = this.paint();
    expect(b.drewText('baseline ').y).to.be.approximately(20.987, 0.001);
    expect(b.drewText('super').y).to.be.approximately(15.547, 0.001);
    /** @type import('../src/layout-flow').IfcInline[] */
    const [ifc] = this.get('div').children;
    expect(ifc.paragraph.lineboxes[0].height()).to.be.approximately(25.44, 0.001);
  });

  it('aligns inline-block to superscript', function () {
    this.layout(`
      <div id="t1" style="font: 16px/20px Arimo;">
        baseline
        <div id="t2" style="display: inline-block; height: 10px; vertical-align: super;"></div>
        <div id="t3" style="display: inline-block; vertical-align: super;">super</div>
      </div>
    `);

    /** @type import('../src/layout-flow').IfcInline[] */
    const [ifc] = this.get('#t1').children;
    expect(ifc.paragraph.lineboxes[0].height()).to.be.approximately(25.440, 0.001);
    expect(ifc.paragraph.lineboxes[0].ascender).to.be.approximately(20.987, 0.001);
    expect(this.get('#t2').contentArea.y).to.be.approximately(5.546, 0.001);
    expect(this.get('#t3').contentArea.y).to.be.approximately(0, 0.001);
  });

  it('aligns text to text-top', function () {
    this.layout(`
      <div style="font: 16px/20px Arimo;">
        baseline <span style="vertical-align: text-top;">text-top</span>
      </div>
    `);

    const b = this.paint();
    expect(b.drewText('baseline ').y).to.be.approximately(15.547, 0.001);
    expect(b.drewText('text-top').y).to.be.approximately(16.609, 0.001);
    /** @type import('../src/layout-flow').IfcInline[] */
    const [ifc] = this.get('div').children;
    expect(ifc.paragraph.lineboxes[0].height()).to.be.approximately(21.063, 0.001);
  });

  it('aligns inline-block to text-top', function () {
    this.layout(`
      <div id="t1" style="font: 16px/20px Arimo;">
        baseline
        <div id="t2" style="display: inline-block; height: 10px; vertical-align: text-top;"></div>
        <div id="t3" style="display: inline-block; vertical-align: text-top;">text-top</div>
      </div>
    `);

    /** @type import('../src/layout-flow').IfcInline[] */
    const [ifc] = this.get('#t1').children;
    expect(ifc.paragraph.lineboxes[0].height()).to.be.approximately(21.063, 0.001);
    expect(ifc.paragraph.lineboxes[0].ascender).to.be.approximately(15.547, 0.001);
    expect(this.get('#t2').contentArea.y).to.be.approximately(1.063, 0.001);
    expect(this.get('#t3').contentArea.y).to.be.approximately(1.063, 0.001);
  });

  it('aligns text to text-bottom', function () {
    this.layout(`
      <div style="font: 16px/20px Arimo;">
        baseline <span style="vertical-align: text-bottom;">text-bottom</span>
      </div>
    `);

    const b = this.paint();
    expect(b.drewText('baseline ').y).to.be.approximately(16.609, 0.001);
    expect(b.drewText('text-bottom').y).to.be.approximately(15.547, 0.001);
    /** @type import('../src/layout-flow').IfcInline[] */
    const [ifc] = this.get('div').children;
    expect(ifc.paragraph.lineboxes[0].height()).to.be.approximately(21.063, 0.001);
  });

  it('aligns inline-block to text-bottom', function () {
    this.layout(`
      <div id="t1" style="font: 16px/20px Arimo;">
        baseline
        <div id="t2" style="display: inline-block; height: 10px; vertical-align: text-bottom;"></div>
        <div id="t3" style="display: inline-block; vertical-align: text-bottom;">text-bottom</div>
      </div>
    `);

    /** @type import('../src/layout-flow').IfcInline[] */
    const [ifc] = this.get('#t1').children;
    expect(ifc.paragraph.lineboxes[0].height()).to.be.approximately(21.063, 0.001);
    expect(ifc.paragraph.lineboxes[0].ascender).to.be.approximately(16.609, 0.001);
    expect(this.get('#t2').contentArea.y).to.equal(10);
    expect(this.get('#t3').contentArea.y).to.equal(0);
  });

  it('aligns text with pixels', function () {
    this.layout(`
      <div style="font: 16px/20px Arimo;">
        baseline <span style="vertical-align: 30px;">30px</span>
      </div>
    `);

    const b = this.paint();
    expect(b.drewText('baseline ').y).to.be.approximately(45.547, 0.001);
    expect(b.drewText('30px').y).to.be.approximately(15.547, 0.001);
    /** @type import('../src/layout-flow').IfcInline[] */
    const [ifc] = this.get('div').children;
    expect(ifc.paragraph.lineboxes[0].height()).to.be.approximately(50, 0.001);
  });

  it('aligns inline-block with pixels', function () {
    this.layout(`
      <div id="t1" style="font: 16px/20px Arimo;">
        baseline
        <div id="t2" style="display: inline-block; height: 10px; vertical-align: 30px;"></div>
        <div id="t3" style="display: inline-block; vertical-align: 30px;">30px</div>
      </div>
    `);

    /** @type import('../src/layout-flow').IfcInline[] */
    const [ifc] = this.get('#t1').children;
    expect(ifc.paragraph.lineboxes[0].height()).to.equal(50);
    expect(ifc.paragraph.lineboxes[0].ascender).to.be.approximately(45.547, 0.001);
    expect(this.get('#t2').contentArea.y).to.be.approximately(5.547, 0.001);
    expect(this.get('#t3').contentArea.y).to.be.equal(0);
  });

  it('aligns text with percentage', function () {
    this.layout(`
      <div style="font: 16px/20px Arimo;">
        baseline <span style="vertical-align: 50%; line-height: 10px;">percentage</span>
      </div>
    `);

    const b = this.paint();
    expect(b.drewText('baseline ').y).to.be.approximately(15.547, 0.001);
    expect(b.drewText('percentage').y).to.be.approximately(10.547, 0.001);
    /** @type import('../src/layout-flow').IfcInline[] */
    const [ifc] = this.get('div').children;
    expect(ifc.paragraph.lineboxes[0].height()).to.equal(20);
  });

  it('aligns inline-block with percentage', function () {
    this.layout(`
      <div id="t1" style="font: 16px/20px Arimo;">
        baseline
        <div id="t2" style="display: inline-block;height: 10px; vertical-align: 50%; line-height: 10px;"></div>
        <div id="t3" style="display: inline-block; vertical-align: 50%; line-height: 10px;">50%</div>
      </div>
    `);

    /** @type import('../src/layout-flow').IfcInline[] */
    const [ifc] = this.get('#t1').children;
    expect(ifc.paragraph.lineboxes[0].height()).to.equal(20);
    expect(ifc.paragraph.lineboxes[0].ascender).to.be.approximately(15.546, 0.001);
    expect(this.get('#t2').contentArea.y).to.be.approximately(0.546, 0.001);
    expect(this.get('#t3').contentArea.y).to.be.equal(0);
  });

  it('aligns top', function () {
    this.layout(`
      <div style="font: 16px/20px Arimo;">
        baseline <span style="vertical-align: top; line-height: 40px;">
          <span style="vertical-align: super;">top</span>
        </span>
      </div>
    `);

    const b = this.paint();
    expect(b.drewText('baseline ').y).to.be.approximately(15.547, 0.001);
    expect(b.drewText('top').y).to.be.approximately(25.547, 0.001);
    /** @type import('../src/layout-flow').IfcInline[] */
    const [ifc] = this.get('div').children;
    expect(ifc.paragraph.lineboxes[0].height()).to.equal(45.44);
  });

  it('aligns top inline-block', function () {
    this.layout(`
      <div id="t1" style="font: 16px/20px Arimo;">
        baseline
        <div id="t2" style="display: inline-block; height: 30px; vertical-align: top;"></div>
      </div>
    `);

    /** @type import('../src/layout-flow').IfcInline[] */
    const [ifc] = this.get('#t1').children;
    expect(ifc.paragraph.lineboxes[0].height()).to.equal(30);
    expect(ifc.paragraph.lineboxes[0].ascender).to.be.approximately(15.547, 0.001);
    expect(this.get('#t2').contentArea.y).to.equal(0);
  });

  it('aligns bottom', function () {
    this.layout(`
      <div style="font: 16px/20px Arimo;">
        baseline <span style="vertical-align: bottom; line-height: 40px;">
          <span style="vertical-align: sub;">bottom</span>
        </span>
      </div>
    `);

    const b = this.paint();
    expect(b.drewText('baseline ').y).to.be.approximately(38.747, 0.001);
    expect(b.drewText('bottom').y).to.be.approximately(28.747, 0.001);
    /** @type import('../src/layout-flow').IfcInline[] */
    const [ifc] = this.get('div').children;
    expect(ifc.paragraph.lineboxes[0].height()).to.equal(43.2);
  });

  it('aligns bottom inline-block', function () {
    this.layout(`
      <div id="t1" style="font: 16px/20px Arimo;">
        baseline
        <div id="t2" style="display: inline-block; height: 30px; vertical-align: bottom;"></div>
      </div>
    `);

    /** @type import('../src/layout-flow').IfcInline[] */
    const [ifc] = this.get('#t1').children;
    expect(ifc.paragraph.lineboxes[0].height()).to.equal(30);
    expect(ifc.paragraph.lineboxes[0].ascender).to.be.approximately(25.547, 0.001);
    expect(this.get('#t2').contentArea.y).to.equal(0);
  });

  it('aligns strut with the bottom when there are tops and bottoms', function () {
    this.layout(`
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
    /** @type import('../src/layout-flow').IfcInline[] */
    const [ifc] = this.get('div').children;
    expect(ifc.paragraph.lineboxes[0].height()).to.equal(80);
  });

  it('changes line height for shifted empty spans', function () {
    this.layout(`
      <div style="font: 16px/20px Arimo;">
        text
        <span style="vertical-align: super;"></span>
      </div>
    `);

    /** @type import('../src/layout-flow').IfcInline[] */
    const [ifc] = this.get('div').children;
    expect(ifc.paragraph.lineboxes[0].height()).to.equal(25.44);
  });

  it('changes line height for shifted fallback glyphs', function () {
    this.layout(`
      <div style="font: 16px/20px Arimo, Cairo;">
        text
        <span style="vertical-align: super;">هل</span>
      </div>
    `);

    /** @type import('../src/layout-flow').IfcInline[] */
    const [ifc] = this.get('div').children;
    expect(ifc.paragraph.lineboxes[0].height()).to.be.approximately(25.749, 0.001);
  });

  it('affects line height on the second line', function () {
    this.layout(`
      <div style="font: 16px/20px Arimo, Cairo; width: 400px;">
        Do you speak a language other than Arabic?
        <span style="vertical-align: super;">هل تتحدث لغة أخرى بجانب العربية؟</span>
        Cool!
      </div>
    `);

    /** @type import('../src/layout-flow').IfcInline[] */
    const [ifc] = this.get('div').children;
    expect(ifc.paragraph.lineboxes[0].height()).to.be.approximately(25.749, 0.001);
    expect(ifc.paragraph.lineboxes[1].height()).to.be.approximately(25.749, 0.001);
  });

  it('does not carry fallback height to the second line', function () {
    this.layout(`
      <div style="font: 16px Arimo, Cairo; width: 80px;">
        <span style="vertical-align: super;">نعم</span>, قليل
        yes, <span style="vertical-align: super;">a little</span>
      </div>
    `);

    /** @type import('../src/layout-flow').IfcInline[] */
    const [ifc] = this.get('div').children;
    expect(ifc.paragraph.lineboxes[0].ascender).to.be.approximately(26.288, 0.001);
    expect(ifc.paragraph.lineboxes[0].descender).to.be.approximately(9.136, 0.001);
    expect(ifc.paragraph.lineboxes[1].ascender).to.be.approximately(20.186, 0.001);
    expect(ifc.paragraph.lineboxes[1].descender).to.be.approximately(3.652, 0.001);
  });

  it('correctly resets separate alignment contexts for the second line', function () {
    this.layout(`
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
    /** @type import('../src/layout-flow').IfcInline[] */
    const [ifc] = this.get('div').children;
    expect(ifc.paragraph.lineboxes[0].height()).to.be.approximately(40, 0.001);
    expect(ifc.paragraph.lineboxes[1].height()).to.be.approximately(40, 0.001);
  });

  it('correctly splits out nested top and bottoms', function () {
    this.layout(`
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
    /** @type import('../src/layout-flow').IfcInline[] */
    const [ifc] = this.get('div').children;
    expect(ifc.paragraph.lineboxes[0].height()).to.equal(20);
  });

  it('keeps ascenders and descenders of tops and bottoms separate', function () {
    this.layout(`
      <div style="font: 16px/20px Arimo;">
        <span style="vertical-align: top; line-height: 20px;">top</span>
        <span style="font-family: Cairo; vertical-align: bottom; line-height: 20px;">bottom</span>
      </div>
    `);

    const [ifc] = this.get('div').children;
    expect(ifc.paragraph.lineboxes[0].height()).to.equal(20);
  });
});

describe('Inline Blocks', function () {
  before(setupLayoutTests);

  before(function () {
    registerFontAsset('Arimo/Arimo-Regular.ttf');
    registerFontAsset('Cairo/Cairo-Regular.ttf');
  });

  after(function () {
    unregisterFontAsset('Arimo/Arimo-Regular.ttf');
    unregisterFontAsset('Cairo/Cairo-Regular.ttf');
  });

  afterEach(logIfFailed);

  it('accounts for margin, border, and padding', function () {
    this.layout(`
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

    /** @type import('../src/layout-flow').BlockContainer */
    const t = this.get('#t');
    /** @type import('../src/layout-flow').IfcInline[] */
    const [ifc] = this.get('div').children;
    expect(ifc.paragraph.lineboxes[0].height()).to.be.approximately(30.453, 0.001);
    expect(ifc.paragraph.lineboxes[0].ascender).to.equal(26);
    expect(t.borderArea.x).to.be.approximately(84.984, 0.001);
    expect(t.borderArea.y).to.equal(1);
  });

  it('sizes to intrinsics correctly', function () {
    this.layout(`
      <div style="font: 16px/20px Arimo;">
        when it's cold out
        <div id="t" style="display: inline-block;">
          put<br>some<br>skates<br>on
        </div>
      </div>
    `);

    /** @type import('../src/layout-flow').BlockContainer */
    const t = this.get('#t');
    /** @type import('../src/layout-flow').IfcInline[] */
    const [ifc] = this.get('div').children;
    expect(ifc.paragraph.lineboxes[0].height()).to.equal(80);
    expect(ifc.paragraph.lineboxes[0].ascender).to.be.approximately(75.547, 0.001);
    expect(t.borderArea.x).to.be.approximately(126.680, 0.001);
    expect(t.borderArea.y).to.equal(0);
  });

  it('fills the entire cb width at most', function () {
    this.layout(`
      <div style="font: 16px/20px Arimo; width: 100px;">
        line before
        <div id="t" style="display: inline-block;">
          You better watch out, you better not cry
        </div>
        line after
      </div>
    `);

    /** @type import('../src/layout-flow').BlockContainer */
    const t = this.get('#t');
    expect(t.contentArea.width).to.equal(100);
    expect(t.contentArea.y).to.equal(20);
    /** @type import('../src/layout-flow').IfcInline[] */
    const [ifc] = this.get('div').children;
    expect(ifc.paragraph.lineboxes.length).to.equal(3);
    expect(ifc.paragraph.lineboxes[0].startOffset).to.equal(0);
    expect(ifc.paragraph.lineboxes[0].endOffset).to.equal(13);
    expect(ifc.paragraph.lineboxes[1].startOffset).to.equal(13);
    expect(ifc.paragraph.lineboxes[1].endOffset).to.equal(14);
    expect(ifc.paragraph.lineboxes[2].blockOffset).to.equal(100);
    expect(ifc.paragraph.lineboxes[2].startOffset).to.equal(14);
    expect(ifc.paragraph.lineboxes[2].endOffset).to.equal(25);
  });

  it('fills the entire cb taking margin into account', function () {
    this.layout(`
      <div style="font: 16px/20px Arimo; width: 200px;">
        <div id="t" style="display: inline-block; margin: 5px; padding: 5px;">
          hemingway's paws are literally on my hands as I type
        </div>
      </div>
    `);

    /** @type import('../src/layout-flow').BlockContainer */
    const t = this.get('#t');
    expect(t.contentArea.x).to.equal(10);
    expect(t.contentArea.inlineSize).to.equal(180);
  });

  it('doesn\'t collapse through a solitary inline-block', function () {
    this.layout(`
      <div id="t" style="font: 16px/20px Arimo;">
        <div id="t" style="display: inline-block;">
          This is the way
        </div>
      </div>
    `);

    /** @type import('../src/layout-flow').IfcInline[] */
    const [ifc] = this.get('#t').children;
    expect(ifc.paragraph.lineboxes.length).to.equal(1);
    /** @type import('../src/layout-flow').BlockContainer */
    const t = this.get('#t');
    expect(t.contentArea.height).to.equal(20);
  });

  it('positions correctly among bidirectional text', function () {
    this.layout(`
      <div style="font: 16px/20px Cairo; direction: rtl; width: 200px;">
        excuse me: المعذرة<div id="t" style="display: inline-block; border-bottom: 2px solid red;">!</div>
      </div>
    `);

    const t = this.get('#t');
    expect(t.contentArea.x).to.be.approximately(66.208, 0.001);
  });

  it('breaks before and after', function () {
    this.layout(`
      <div id="t1" style="font: 16px/20px Arimo; width: 10px;">
        <div id="t2" style="display: inline-block; width: 10px; height: 10px;"></div>
        <div id="t3" style="display: inline-block; width: 10px; height: 10px;"></div>
        <div id="t4" style="display: inline-block; width: 10px; height: 10px;"></div>
      </div>
    `);

    /** @type import('../src/layout-flow').IfcInline[] */
    const [ifc] = this.get('#t1').children;
    expect(ifc.paragraph.lineboxes.length).to.equal(3);
    /** @type import('../src/layout-flow').BlockContainer */
    const t2 = this.get('#t2');
    expect(t2.contentArea.x).to.equal(0);
    expect(t2.contentArea.y).to.be.approximately(5.547, 0.001);
    /** @type import('../src/layout-flow').BlockContainer */
    const t3 = this.get('#t3');
    expect(t3.contentArea.x).to.equal(0);
    expect(t3.contentArea.y).to.be.approximately(25.547, 0.001);
    /** @type import('../src/layout-flow').BlockContainer */
    const t4 = this.get('#t4');
    expect(t4.contentArea.x).to.equal(0);
    expect(t4.contentArea.y).to.be.approximately(45.547, 0.001);
  });

  it('doesn\'t end with an empty line of space', function () {
    this.layout(`
      <div id="t1" style="font: 16px/20px Arimo; width: 10px;">
        abc
        <div id="t2" style="display: inline-block; width: 10px; height: 10px;"></div>
      </div>
    `);

    /** @type import('../src/layout-flow').IfcInline[] */
    const [ifc] = this.get('#t1').children;
    expect(ifc.paragraph.lineboxes.length).to.equal(2);
  });

  it('prioritizes float over inline-block', function () {
    this.layout(`
      <div style="font: 16px/20px Cairo; width: 100px;">
        hi <div id="t" style="display: inline-block; float: right; width: 10px;">!</div>
      </div>
    `);

    /** @type import('../src/layout-flow').BlockContainer */
    const t = this.get('#t');
    expect(t.contentArea.x).to.be.equal(90);
  });

  it('paints backgrounds behind inline-block correctly', function () {
    this.layout(`
      <div id="t1" style="font: 16px/20px Cairo; width: 100px;">
        1<span id="t2" style="background-color: veronicayellow;"><span style="display: inline-block;">different ifc!</span></span>2
      </div>
    `);

    /** @type import('../src/layout-flow').IfcInline[] */
    const [ifc] = this.get('#t1').children;
    /** @type import('../src/layout-flow').Inline */
    const span = this.get('#t2');
    const box = ifc.paragraph.backgroundBoxes.get(span);
    expect(box[0].start).to.be.approximately(8.960, 0.001);
    expect(box[0].end).to.be.approximately(90.448, 0.001);
  });

  it('occupies the right amount of space for floats', function () {
    this.layout(`
      <div id="t" style="width: 200px; display: flow-root; font-size: 0;">
        <div style="display: inline-block; width: 100px; height: 100px;"></div>
        <div style="float: right; width: 100px; height: 100px;"></div>
      </div>
    `);

    /** @type import('../src/layout-flow').BlockContainer */
    const t = this.get('#t');
    expect(t.contentArea.height).to.equal(100);
  });

  it('occupies the right amount of space for text-align', function () {
    this.layout(`
      <div id="t" style="width: 200px; font: 16px Arimo; text-align: center;">
        I can't
        <div style="display: inline-block;">wait</div>
        for summer
      </div>
    `);

    /** @type import('../src/layout-flow').IfcInline[] */
    const [ifc] = this.get('#t').children;
    expect(ifc.paragraph.brokenItems[0].x).to.be.approximately(19.785, 0.001);
  });

  it('takes horizontal margin into account on the line', function () {
    this.layout(`
      <div id="t1" style="width: 100px; font: 16px/20px Arimo;">
        one <div id="t2" style="display: inline-block; margin-left: 100px;"><div>
      </div>
    `);

    /** @type import('../src/layout-flow').IfcInline[] */
    const [ifc] = this.get('#t1').children;
    expect(ifc.paragraph.lineboxes.length).to.equal(2);
    const t2 = this.get('#t2');
    expect(t2.contentArea.y).to.be.approximately(35.547, 0.001);
    expect(t2.contentArea.y).to.be.approximately(35.547, 0.001);
    expect(t2.contentArea.x).to.equal(100);
  });

  it('uses the bottom margin edge if overflow is hidden', function () {
    this.layout(`
      <div id="t1" style="font: 16px/20px Arimo; width: 300px;">
        give a dog a <div id="t2" style="display: inline-block; overflow: hidden;">bone</div>
      </div>
    `);

    /** @type import('../src/layout-flow').IfcInline[] */
    const [ifc] = this.get('#t1').children;
    expect(ifc.paragraph.lineboxes[0].ascender).to.equal(20);
    /** @type import('../src/layout-flow').BlockContainer */
    const t2 = this.get('#t2');
    expect(t2.borderArea.y).to.equal(0);
  });
});

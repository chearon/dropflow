//@ts-check
import {expect} from 'chai';
import * as oflo from '../src/api.js';
import {registerFontAsset, unregisterFontAsset} from '../assets/register.js';
import {
  Run,
  Collapser,
  G_ID,
  G_AX,
  G_SZ,
} from '../src/text.js';
import {initialStyle, createComputedStyle} from '../src/cascade.js';
import paintBlockContainer from '../src/paint.js';
import PaintSpy from './paint-spy.js';

describe('Text Module', function () {
  const s = createComputedStyle(initialStyle, {});

  describe('Run', function () {
    it('throws on a setRange that doesn\'t make sense', function () {
      expect(() => new Run('', s).setRange(0, '')).to.throw();
      expect(() => new Run('', s).setRange('', '')).to.throw();
      expect(() => new Run('', s).setRange(5, 5)).to.throw();
      expect(() => new Run('hello', s).setRange(-1, 4)).to.throw();
      expect(() => new Run('test', s).setRange(0, 1)).to.throw();
      expect(() => new Run('xxxxxx', s).setRange(1, 10)).to.throw();
    });

    it('shifts', function () {
      const t1 = new Run('Hello', s);
      t1.setRange(0, 4);
      t1.shift(-2);
      expect(t1.start).to.equal(2);
      expect(t1.end).to.equal(6);

      const t2 = new Run('Hello', s);
      t2.setRange(0, 4);
      t2.shift(2);
      expect(t2.start).to.equal(-2);
      expect(t2.end).to.equal(2);
    });

    it('mod() removes a character', function () {
      const t1 = new Run('Hello', s);
      t1.setRange(0, 4);
      t1.mod(2, 2, '');
      expect(t1.text).to.equal('Helo');
      expect(t1.start).to.equal(0);
      expect(t1.end).to.equal(3);
    });

    it('mod() removes characters', function () {
      const t1 = new Run('Hello', s);
      t1.setRange(0, 4);
      t1.mod(1, 3, '');
      expect(t1.text).to.equal('Ho');
      expect(t1.start).to.equal(0);
      expect(t1.end).to.equal(1);
    });

    it('mod() replaces characters', function () {
      const t1 = new Run('Hello', s);
      t1.setRange(0, 4);
      t1.mod(2, 2, 'aron');
      expect(t1.text).to.equal('Hearonlo');
      expect(t1.start).to.equal(0);
      expect(t1.end).to.equal(7);
    });

    it('mod() handles start < text.i < end', function () {
      const t1 = new Run('texty', s);
      t1.setRange(5, 9);
      t1.mod(2, 6, 's');
      expect(t1.text).to.equal('sxty');
      expect(t1.start).to.equal(5);
      expect(t1.end).to.equal(8);
    });

    it('mod() handles start < text.end < j', function () {
      const t1 = new Run('texty', s);
      t1.setRange(5, 9);
      t1.mod(8, 10, 'y');
      expect(t1.text).to.equal('texy');
      expect(t1.start).to.equal(5);
      expect(t1.end).to.equal(8);
    });
  });

  describe('Collapser', function () {
    it('throws an error if buf doesn\'t match the texts', function () {
      const [r1, r2] = [new Run('a', s), new Run('b', s)];
      r1.setRange(0, 0);
      r2.setRange(1, 1);

      const [r3, r4] = [new Run('text', s), new Run('musmatch', s)];
      r3.setRange(0, 3);
      r4.setRange(4, 11);

      expect(() => new Collapser('xxyy', [])).to.throw();
      expect(() => new Collapser('', [r1, r2])).to.throw();
      expect(() => new Collapser('text mismatch', [r3, r4])).to.throw();
    });

    describe('mod()', function () {
      it('replaces text', function () {
        const t = new Run('Lorem ipsum', s);
        t.setRange(0, 10);
        const c = new Collapser('Lorem ipsum', [t]);
        c.mod(6, 10, 'lorem');
        expect(c.buf).to.equal('Lorem lorem');
        expect(t.start).to.equal(0);
        expect(t.end).to.equal(10);
        expect(t.text).to.equal('Lorem lorem');
      });

      it('replaces text when the boundaries are in the middle of 2 texts', function () {
        const t1 = new Run('This is my', s);
        const t2 = new Run(' theme song', s);
        t1.setRange(0, 9);
        t2.setRange(10, 20);
        const c = new Collapser('This is my theme song', [t1, t2]);
        c.mod(8, 15, 'not my');
        expect(c.buf).to.equal('This is not my song')
        expect(t1.start).to.equal(0);
        expect(t1.end).to.equal(13);
        expect(t1.text).to.equal('This is not my');
        expect(t2.start).to.equal(14);
        expect(t2.end).to.equal(18);
        expect(t2.text).to.equal(' song');
      });

      it('replaces with empty text', function () {
        const t = new Run('Lorem ipsum', s);
        t.setRange(0, 10);
        const c = new Collapser('Lorem ipsum', [t]);
        c.mod(3, 4, '');
        expect(c.buf).to.equal('Lor ipsum');
        expect(t.text).to.equal('Lor ipsum');
        expect(t.start).to.equal(0);
        expect(t.end).to.equal(8);
      });

      it('replaces with empty text when the boundaries are in the middle of 2 texts', function () {
        const t1 = new Run('This is my', s);
        const t2 = new Run(' theme song', s);
        t1.setRange(0, 9);
        t2.setRange(10, 20);
        const c = new Collapser('This is my theme song', [t1, t2]);
        c.mod(8, 16, '');
        expect(c.buf).to.equal('This is song')
        expect(t1.start).to.equal(0);
        expect(t1.end).to.equal(7);
        expect(t1.text).to.equal('This is ');
        expect(t2.start).to.equal(8);
        expect(t2.end).to.equal(11);
        expect(t2.text).to.equal('song');
      });
    });

    describe('collapse', function () {
      it('collapses whitespace', function () {
        const t1 = new Run('  \there\n', {whiteSpace: 'normal'});
        const t2 = new Run('\t\t  I  go killin  ', {whiteSpace: 'nowrap'});
        const t3 = new Run('  \n\t\n\t  again  ', {whiteSpace: 'normal'});

        t1.setRange(0, 7);
        t2.setRange(8, 25);
        t3.setRange(26, 40);

        const c = new Collapser('  \there\n\t\t  I  go killin    \n\t\n\t  again  ', [t1, t2, t3]);
        c.collapse();
        expect(c.buf).to.equal(' here I go killin again ');
      });

      it('preserves newlines', function () {
        const t1 = new Run('  \there\n', {whiteSpace: 'pre-line'});
        const t2 = new Run('\t\t  I  go killin  ', {whiteSpace: 'nowrap'});
        const t3 = new Run('  \n\t\n\t  again  ', {whiteSpace: 'normal'});

        t1.setRange(0, 7);
        t2.setRange(8, 25);
        t3.setRange(26, 40);

        const c = new Collapser('  \there\n\t\t  I  go killin    \n\t\n\t  again  ', [t1, t2, t3]);
        c.collapse();
        expect(c.buf).to.equal(' here\nI go killin again ');
      });

      it('preserves everything', function () {
        const t1 = new Run('  \there\n', {whiteSpace: 'pre'});
        const t2 = new Run('\t\t  I  go killin  ', {whiteSpace: 'pre'});
        const t3 = new Run('  \n\t\n\t  again  ', {whiteSpace: 'pre'});

        t1.setRange(0, 7);
        t2.setRange(8, 25);
        t3.setRange(26, 40);

        const c = new Collapser('  \there\n\t\t  I  go killin    \n\t\n\t  again  ', [t1, t2, t3]);
        c.collapse();
        expect(c.buf).to.equal('  \there\n\t\t  I  go killin    \n\t\n\t  again  ');
      });

      it('preserves parts', function () {
        const t1 = new Run('  \there\n', {whiteSpace: 'normal'});
        const t2 = new Run('\t\t  I  go killin  ', {whiteSpace: 'normal'});
        const t3 = new Run('  \n\t\n\t  again  ', {whiteSpace: 'pre'});

        t1.setRange(0, 7);
        t2.setRange(8, 25);
        t3.setRange(26, 40);

        const c = new Collapser('  \there\n\t\t  I  go killin    \n\t\n\t  again  ', [t1, t2, t3]);
        c.collapse();
        expect(c.buf).to.equal(' here I go killin   \n\t\n\t  again  ');
      });

      it('doesnt break runs that are consecutive', function () {
        const a = [];
        let r;

        // sorry for the garbled words, it is difficult to repro the bug this
        // is for and took forever to find it so I ran out of time to narrow it
        r = new Run('layout code', {whiteSpace: 'normal'}), r.setRange(0, 10), a.push(r);
        r = new Run('\n', {whiteSpace: 'normal'}), r.setRange(11,11), a.push(r);
        r = new Run('\n', {whiteSpace: 'normal'}), r.setRange(12,12), a.push(r);
        r = new Run('\nbecause ', {whiteSpace: 'normal'}), r.setRange(13,21), a.push(r);
        r = new Run('it really very ', {whiteSpace: 'normal'}), r.setRange(22,36), a.push(r);
        r = new Run('is very', {whiteSpace: 'normal'}), r.setRange(37,43), a.push(r);
        r = new Run('I love this!', {whiteSpace: 'normal'}), r.setRange(44,55), a.push(r);
        r = new Run('\n', {whiteSpace: 'normal'}), r.setRange(56,56), a.push(r);

        let buf = '';
        for (const r of a) buf += r.text;
        const c = new Collapser(buf, a);
        c.collapse();
        expect(c.buf).to.equal('layout code because it really very is veryI love this! ');
      });
    });
  });
});

function setupLayoutTests() {
  registerFontAsset('Arimo/Arimo-Regular.ttf');
  registerFontAsset('Noto/NotoSansSC-Regular.otf');
  registerFontAsset('Noto/NotoSansJP-Regular.otf');
  registerFontAsset('Noto/NotoSansTC-Regular.otf');
  registerFontAsset('Noto/NotoSansKR-Regular.otf');
  registerFontAsset('Noto/NotoSansHebrew-Regular.ttf');
  registerFontAsset('Noto/NotoSansCherokee-Regular.ttf');
  registerFontAsset('Ramabhadra/Ramabhadra-Regular.ttf');
  registerFontAsset('Cairo/Cairo-Regular.ttf');
  registerFontAsset('Roboto/Roboto-Regular.ttf');
  registerFontAsset('Raleway/Raleway-Regular.ttf');

  this.layout = function (html) {
    this.rootElement = oflo.parse(html);
    this.blockContainer = oflo.generate(this.rootElement);
    oflo.layout(this.blockContainer);
    this.get = function (...args) {
      if (typeof args[0] === 'string') {
        const elements = this.rootElement.query(args[0]);
        if (elements.length) return elements[0].boxes[0];
      } else {
        /** @type import('../src/box').Box */
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

function teardownLayoutTests() {
  unregisterFontAsset('Arimo/Arimo-Regular.ttf');
  unregisterFontAsset('Noto/NotoSansSC-Regular.otf');
  unregisterFontAsset('Noto/NotoSansJP-Regular.otf');
  unregisterFontAsset('Noto/NotoSansTC-Regular.otf');
  unregisterFontAsset('Noto/NotoSansKR-Regular.otf');
  unregisterFontAsset('Noto/NotoSansHebrew-Regular.ttf');
  unregisterFontAsset('Noto/NotoSansCherokee-Regular.ttf');
  unregisterFontAsset('Ramabhadra/Ramabhadra-Regular.ttf');
  unregisterFontAsset('Cairo/Cairo-Regular.ttf');
  unregisterFontAsset('Roboto/Roboto-Regular.ttf');
  unregisterFontAsset('Raleway/Raleway-Regular.ttf');
}

function logIfFailed() {
  if (this.currentTest.state == 'failed') {
    let indent = 0, t = this.currentTest;
    while (t = t.parent) indent += 1;
    console.log('  '.repeat(indent) + "Box tree:");
    console.log(this.currentTest.ctx.blockContainer.repr(indent));
  }
}

describe('Shaping', function () {
  before(setupLayoutTests);
  after(teardownLayoutTests);
  afterEach(logIfFailed);

  it('doesn\'t infinite loop when the last match can\'t shape two parts', function () {
    this.layout('𓀀 𓀁');
    /** @type import('../src/flow').IfcInline[] */
    const [inline] = this.get().children;
    expect(inline.paragraph.brokenItems).to.have.lengthOf(3);
    expect(inline.paragraph.brokenItems[0].glyphs[G_ID]).to.equal(0)
    expect(inline.paragraph.brokenItems[1].glyphs[G_ID]).not.to.equal(0);
    expect(inline.paragraph.brokenItems[2].glyphs[G_ID]).to.equal(0);
  });

  describe('Boundaries', function () {
    it('splits shaping boundaries on fonts', function () {
      this.layout(`
        <span style="font: 12px Arimo;">Arimo</span>
        <span style="font: 12px Roboto;">Roboto</span>
      `);
      /** @type import('../src/flow').IfcInline[] */
      const [inline] = this.get().children;
      expect(inline.paragraph.brokenItems).to.have.lengthOf(5);
    });

    it('splits shaping boundaries on font-size', function () {
      this.layout(`
        <span style="font-size: 12px;">a</span>
        <span style="font-size: 13px;">b</span>
      `);
      /** @type import('../src/flow').IfcInline[] */
      const [inline] = this.get().children;
      expect(inline.paragraph.brokenItems).to.have.lengthOf(5);
    });

    it('splits shaping boundaries on font-style', function () {
      this.layout(`a<span style="font-style: italic;">b</span>`);
      /** @type import('../src/flow').IfcInline[] */
      const [inline] = this.get().children;
      expect(inline.paragraph.brokenItems).to.have.lengthOf(2);
    });

    it('does not split shaping boundaries on line-height', function () {
      this.layout(`
        <span style="line-height: 3;">Left</span>
        <span style="line-height: 4;">Right</span>
      `);
      /** @type import('../src/flow').IfcInline[] */
      const [inline] = this.get().children;
      expect(inline.paragraph.brokenItems).to.have.lengthOf(1);
    });

    it('splits shaping boundaries based on script', function () {
      this.layout('Lorem Ipusm העמוד');
      /** @type import('../src/flow').IfcInline[] */
      const [inline] = this.get().children;
      expect(inline.paragraph.brokenItems).to.have.lengthOf(2);
      expect(inline.paragraph.brokenItems[0].face).to.equal(inline.paragraph.brokenItems[1].face);
    });

    it('splits shaping boundaries based on emoji', function () {
      this.layout('Hey 😃 emoji are kinda hard 🦷');
      /** @type import('../src/flow').IfcInline[] */
      const [inline] = this.get().children;
      expect(inline.paragraph.brokenItems).to.have.lengthOf(4);
    });

    it('splits shaping boundaries on inline padding', function () {
      this.layout(`It's me, <span style="padding: 1em;">padding boi</span>`);
      /** @type import('../src/flow').IfcInline[] */
      const [inline] = this.get().children;
      expect(inline.paragraph.brokenItems).to.have.lengthOf(2);
      expect(inline.paragraph.brokenItems[1].offset).to.equal(9);
    });

    it('doesn\'t create empty shaped items if shaping boundaries overlap', function () {
      this.layout(`L<span style="padding: 1em; font: 8px Arimo;">R</span>`);
      /** @type import('../src/flow').IfcInline[] */
      const [inline] = this.get().children;
      expect(inline.paragraph.brokenItems).to.have.lengthOf(2);
      expect(inline.paragraph.brokenItems[1].offset).to.equal(1);
    });

    it('has correct glyph order for Hebrew text', function () {
      // "Hello" according to https://omniglot.com/language/phrases/hebrew.php
      this.layout('<div style="width: 60px; font: 16px Arimo;">הלו</div>');
      /** @type import('../src/flow').IfcInline[] */
      const [inline] = this.get('div').children;
      expect(inline.paragraph.brokenItems).to.have.lengthOf(1);
      expect(inline.paragraph.brokenItems[0].glyphs).to.have.lengthOf(3 * G_SZ);
      expect(inline.paragraph.brokenItems[0].glyphs[0 * G_SZ + G_ID]).to.equal(2440);
      expect(inline.paragraph.brokenItems[0].glyphs[1 * G_SZ + G_ID]).to.equal(2447);
      expect(inline.paragraph.brokenItems[0].glyphs[2 * G_SZ + G_ID]).to.equal(2439);
    });

    it('doesn\'t create empty shaped items if style and script overlap', function () {
      // "Hello" according to https://omniglot.com/language/phrases/hebrew.php
      this.layout('Hello <span style="font: 16px Arimo;">הלו</span>');
      /** @type import('../src/flow').IfcInline[] */
      const [inline] = this.get().children;
      expect(inline.paragraph.brokenItems).to.have.lengthOf(2);
    });

    it('assigns levels, inlcuding to LRE..PDF', function () {
      this.layout('Saying HNY: \u202Bحلول السنة intruding english! الجديدة\u202C');
      /** @type import('../src/flow').IfcInline[] */
      const [inline] = this.get().children;
      expect(inline.paragraph.brokenItems).to.have.lengthOf(5);
      expect(inline.paragraph.brokenItems[0].attrs.level).to.equal(0); // Saying HNY:_
      expect(inline.paragraph.brokenItems[1].attrs.level).to.equal(1); // حلول السنة
      expect(inline.paragraph.brokenItems[2].attrs.level).to.equal(2); // intruding english
      expect(inline.paragraph.brokenItems[3].attrs.level).to.equal(1); // !
      expect(inline.paragraph.brokenItems[4].attrs.level).to.equal(1); // الجديدة
    });
  });

  describe('Fallbacks', function () {
    it('falls back on diacritic é', function () {
      this.layout('<span style="font: 12px/1 Ramabhadra;">xe\u0301</span>');
      /** @type import('../src/flow').IfcInline[] */
      const [inline] = this.get().children;
      expect(inline.paragraph.brokenItems).to.have.lengthOf(2);
      expect(inline.paragraph.brokenItems[0].glyphs.length).to.satisfy(l => l > 0);
      expect(inline.paragraph.brokenItems[1].glyphs.length).to.satisfy(l => l > 0);
      for (let i = 0; i < inline.paragraph.brokenItems[1].glyphs.length; i += G_SZ) {
        expect(inline.paragraph.brokenItems[1].glyphs[i + G_ID]).not.to.equal(0);
      }
      expect(inline.paragraph.brokenItems[0].match).not.to.equal(inline.paragraph.brokenItems[1].match);
    });

    it('sums to the same string with many reshapes', function () {
      this.layout('Lorem大併外بينᏣᎳᎩ');
      /** @type import('../src/flow').IfcInline[] */
      const [inline] = this.get().children;
      let s = '';
      for (const item of inline.paragraph.brokenItems) s += item.text();
      expect(s).to.equal('Lorem大併外بينᏣᎳᎩ');
    });

    it('falls back to tofu', function () {
      this.layout('\uffff');
      /** @type import('../src/flow').IfcInline[] */
      const [inline] = this.get().children;
      expect(inline.paragraph.brokenItems).to.have.lengthOf(1);
      expect(inline.paragraph.brokenItems[0].glyphs).to.have.lengthOf(1 * G_SZ);
      expect(inline.paragraph.brokenItems[0].glyphs[0 * G_SZ + G_ID]).to.equal(0);
    });

    it('reshapes the correct segments', function () {
      this.layout(`
        <span style="font-family: Arimo, Cairo;">هل تتحدث لغة أخرى بجانب العربية؟</span>
      `);
      /** @type import('../src/flow').IfcInline[] */
      const [inline] = this.get().children;
      expect(inline.paragraph.brokenItems[1].length).to.equal(2);
    });

    it('affect line height when line height is normal', function () {
      this.layout(`
        <span style="font-family: Arimo, Cairo;">hey هل تتحدث لغة أخرى بجانب العربية؟</span>
      `);
      /** @type import('../src/flow').IfcInline[] */
      const [inline] = this.get().children;
      expect(inline.paragraph.lineboxes).to.have.lengthOf(1)
      expect(inline.paragraph.lineboxes[0].ascender).to.be.approximately(20.848, 0.001);
      expect(inline.paragraph.lineboxes[0].descender).to.be.approximately(9.136, 0.001);
    });
  });
});

describe('Lines', function () {
  before(setupLayoutTests);
  after(teardownLayoutTests);
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
    /** @type import('../src/flow').IfcInline[] */
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
    /** @type import('../src/flow').IfcInline[] */
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
    /** @type import('../src/flow').IfcInline[] */
    const [inline] = this.get('div').children;
    expect(inline.paragraph.brokenItems).to.have.lengthOf(2);
  });

  it('splits accurately on hebrew text', function () {
    // "I love you" according to https://omniglot.com/language/phrases/hebrew.php
    // Three words, Arimo@16px in 60px the first two should fit on the first line
    this.layout('<div style="width: 60px; font: 16px Arimo;">אני אוהב אותך</div>');
    /** @type import('../src/flow').IfcInline[] */
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
    /** @type import('../src/flow').IfcInline[] */
    const [inline] = this.get('div').children;
    expect(inline.paragraph.lineboxes).to.have.lengthOf(2);
  });

  it('correctly breaks items when a 1-word line follows 2+ 1-word lines', function () {
    this.layout(`
      <div style="width: 0px; font: 400 16px Roboto;">
        lorem ipsum lorem
      </div>
    `);

    /** @type import('../src/flow').IfcInline[] */
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

    /** @type import('../src/flow').IfcInline[] */
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

    /** @type import('../src/flow').IfcInline[] */
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

    /** @type import('../src/flow').IfcInline[] */
    const [ifc] = this.get().children;
    expect(ifc.children[1].nshaped).to.equal(1);
  });

  it('updates item inlines/count when wrapping', function () {
    this.layout(`
      <div style="width: 100px; font: Arimo;">
        <span><span>One span </span><span>Two spans</span></span>
      </div>
    `);

    /** @type import('../src/flow').IfcInline[] */
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

    /** @type import('../src/flow').IfcInline[] */
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

    /** @type import('../src/flow').IfcInline[] */
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

    /** @type import('../src/flow').IfcInline[] */
    const [inline] = this.get('div').children;
    expect(inline.paragraph.lineboxes).to.have.lengthOf(2);
  });

  it('adds buffered padding to line width', function () {
    this.layout(`
      <div style="font: 16px Arimo; width: 5em;">
        Hey<span style="padding-left: 5em;"> wrap</span>
      </div>
    `);

    /** @type import('../src/flow').IfcInline[] */
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

    /** @type import('../src/flow').IfcInline[] */
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

    /** @type import('../src/flow').IfcInline[] */
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

    /** @type import('../src/flow').IfcInline[] */
    const [ifc] = this.get('div').children;
    expect(ifc.paragraph.lineboxes[0].ascender + ifc.paragraph.lineboxes[0].descender).to.equal(100);
  });

  it('uses the correct line height when multiple spans cross a shaped item', function () {
    this.layout(`
      <div style="width: 16px; font: 16px Roboto;">
        <span style="line-height: 1;">lorem</span><span style="line-height: 2;">ipsum</span>
      </div>
   `);
    /** @type import('../src/flow').IfcInline[] */
    const [inline] = this.get('div').children;
    expect(inline.paragraph.lineboxes[0].ascender + inline.paragraph.lineboxes[0].descender).to.equal(32);
  });

  it('uses the correct line height when a shaped item is broken', function () {
    this.layout(`
      <div style="width: 0; font: 16px Roboto;">
        <span style="line-height: 32px;">lorem</span> <span style="line-height: 64px;">ipsum</span>
      </div>
   `);
    /** @type import('../src/flow').BlockContainer */
    const ifc = this.get('div');
    expect(ifc.contentArea.height).to.equal(32 + 64);
  });

  it('uses the correct inline side to create shaping boundaries', function () {
    this.layout(`
      <div style="width: 300px; direction: rtl; font: 16px Cairo;">
        <span style="padding-left: 1em;">أنا </span>بخير شكرا و أنت؟
      </div>
    `);

    /** @type import('../src/flow').IfcInline[] */
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

    /** @type import('../src/flow').IfcInline[] */
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

    /** @type import('../src/flow').IfcInline[] */
    const [ifc] = this.get(1).children;
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

    /** @type import('../src/flow').IfcInline[] */
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

    /** @type import('../src/flow').IfcInline[] */
    const [ifc] = this.get('div').children;
    expect(ifc.paragraph.height).to.be.approximately(29.984, 0.001);
  });

  it('takes inline struts into account even if they have no content', function () {
    this.layout(`
      <div style="font: 16px/0 Arimo;">
        whoop_de_do<span style="font: 16px Cairo;"></span>
      </div>
    `);

    /** @type import('../src/flow').IfcInline[] */
    const [ifc] = this.get('div').children;
    expect(ifc.paragraph.height).to.be.approximately(29.984, 0.001);
  });

  it('sets box to linebox height when it\'s a bfc and ifc', function () {
    this.layout(`
      <div id="t" style="display: flow-root; line-height: 20px;">woeisme</div>
    `);

    /** @type import('../src/flow').BlockContainer */
    const t = this.get('#t');
    expect(t.contentArea.height).to.equal(20);
  });

  it('uses the right block position for a wrapped word with a hard break at the end', function () {
    this.layout(`
      <div id="t" style="font: 16px/20px Arimo; width: 80px;">
        A simple test<br>
      </div>
    `);

    /** @type import('../src/flow').IfcInline[] */
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

    /** @type import('../src/flow').IfcInline[] */
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

    /** @type import('../src/flow').IfcInline[] */
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

    /** @type import('../src/flow').IfcInline[] */
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

    /** @type import('../src/flow').IfcInline[] */
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

    /** @type import('../src/flow').IfcInline[] */
    const [ifc] = this.get('#t').children;
    expect(ifc.paragraph.lineboxes.length).to.equal(5);
  });

  it('breaks ligatures with internal break opportunities', function () {
    this.layout(`
      <div id="t" style="font: 16px/1.4 Raleway; width: 95px;">
        Affable waf&ZeroWidthSpace;fle
      </div>
    `);
    /** @type import('../src/flow').IfcInline[] */
    const [inline] = this.get('div').children;
    expect(inline.paragraph.lineboxes.length).to.equal(2);
    expect(inline.paragraph.lineboxes[1].head.value.offset).to.equal(13);
    expect(inline.paragraph.lineboxes[1].head.value.glyphs[0 * G_SZ + G_ID]).to.equal(474);
  });

  it('breaks after ligature when it fits', function () {
    this.layout(`
      <div id="t" style="font: 16px/1.4 Raleway; width: 100px;">
        Affable waf&ZeroWidthSpace;fle
      </div>
    `);
    /** @type import('../src/flow').IfcInline[] */
    const [inline] = this.get('div').children;
    expect(inline.paragraph.lineboxes.length).to.equal(1);
  });

  it('breaks before ligature when it doesn\'t fit', function () {
    this.layout(`
      <div id="t" style="font: 16px/1.4 Raleway; width: 52px;">
        Affable waf&ZeroWidthSpace;fle
      </div>
    `);
    /** @type import('../src/flow').IfcInline[] */
    const [inline] = this.get('div').children;
    expect(inline.paragraph.lineboxes.length).to.equal(2);
    expect(inline.paragraph.lineboxes[1].head.value.offset).to.equal(9);
  });

  it('adds a soft hyphen if one fits after a &shy', function () {
    this.layout(`
      <div id="t" style="font: 16px Arimo; width: 119px;">
        Characters com&shy;bine to create words
      </div>
    `);
    /** @type import('../src/flow').IfcInline[] */
    const [inline] = this.get('div').children;
    expect(inline.paragraph.lineboxes[0].head.value.glyphs.at(-G_SZ + G_ID)).to.equal(2623);
    expect(inline.paragraph.lineboxes[1].head.value.offset).to.equal(16);
  });

  it('doesn\'t add a hyphen if it wouldn\'t fit', function () {
    this.layout(`
      <div id="t" style="font: 16px Arimo; width: 118px;">
        Characters com&shy;bine to create words
      </div>
    `);
    /** @type import('../src/flow').IfcInline[] */
    const [inline] = this.get('div').children;
    expect(inline.paragraph.lineboxes[0].head.value.glyphs.at(-G_SZ + G_ID)).to.equal(3);
    expect(inline.paragraph.lineboxes[1].head.value.offset).to.equal(12);
  });

  it('adds a soft hyphen to RTL text if one fits after a &shy', function () {
    this.layout(`
      <div id="t" style="direction: rtl; font: 24px Cairo; width: 51px;">
        دامي&shy;دى
      </div>
    `);
    /** @type import('../src/flow').IfcInline[] */
    const [inline] = this.get('div').children;
    expect(inline.paragraph.lineboxes[0].head.value.glyphs[0 * G_SZ + G_ID]).to.equal(672);
    expect(inline.paragraph.lineboxes[1].head.value.offset).to.equal(6);
  });

  it('carries over leading to the next line', function () {
    this.layout(`
      <div id="t" style="font: 16px/1 Arimo; width: 0;">
        <span style="line-height: 2;">Scarves of red</span>
      </div>
    `);
    /** @type import('../src/flow').IfcInline[] */
    const [inline] = this.get('div').children;
    expect(inline.paragraph.lineboxes[2].blockOffset).to.equal(64);
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

      /** @type import('../src/flow').IfcInline[] */
      const [inline] = this.get('div').children;
      expect(inline.paragraph.lineboxes).to.have.lengthOf(3);
    });

    it('collapses whitespace at the start of the line', function () {
      this.layout(`
        <div style="width: 100px; font: 16px Arimo;">
          Oh give me a home where the buffalo roam
        </div>
      `);

      /** @type import('../src/flow').IfcInline[] */
      const [inline] = this.get('div').children;
      expect(inline.paragraph.lineboxes[0].head.value.glyphs[0 * G_SZ + G_AX]).to.equal(0);
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

      /** @type import('../src/flow').IfcInline[] */
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

      /** @type import('../src/flow').IfcInline[] */
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
      /** @type import('../src/flow').IfcInline[] */
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
  });

  describe('Vertical Align', function () {
    it('aligns middle', function () {
      this.layout(`
        <div style="font: 16px/20px Arimo;">
          baseline <span style="vertical-align: middle; font: 8px/8px Arimo;">middle</span>
        </div>
      `);

      const b = this.paint();
      expect(b.called('baseline ').y).to.be.approximately(15.547, 0.001);
      expect(b.called('middle').y).to.be.approximately(14.094, 0.001);
      /** @type import('../src/flow').IfcInline[] */
      const [ifc] = this.get('div').children;
      expect(ifc.paragraph.lineboxes[0].height()).to.equal(20);
    });

    it('aligns sub', function () {
      this.layout(`
        <div style="font: 16px/20px Arimo;">
          baseline <span style="vertical-align: sub;">sub</span>
        </div>
      `);

      const b = this.paint();
      expect(b.called('baseline ').y).to.be.approximately(15.547, 0.001);
      expect(b.called('sub').y).to.be.approximately(18.747, 0.001);
      /** @type import('../src/flow').IfcInline[] */
      const [ifc] = this.get('div').children;
      expect(ifc.paragraph.lineboxes[0].height()).to.equal(23.2);
    });

    it('aligns super', function () {
      this.layout(`
        <div style="font: 16px/20px Arimo;">
          baseline <span style="vertical-align: super;">super</span>
        </div>
      `);

      const b = this.paint();
      expect(b.called('baseline ').y).to.be.approximately(20.987, 0.001);
      expect(b.called('super').y).to.be.approximately(15.547, 0.001);
      /** @type import('../src/flow').IfcInline[] */
      const [ifc] = this.get('div').children;
      expect(ifc.paragraph.lineboxes[0].height()).to.be.approximately(25.44, 0.001);
    });

    it('aligns text-top', function () {
      this.layout(`
        <div style="font: 16px/20px Arimo;">
          baseline <span style="vertical-align: text-top;">text-top</span>
        </div>
      `);

      const b = this.paint();
      expect(b.called('baseline ').y).to.be.approximately(15.547, 0.001);
      expect(b.called('text-top').y).to.be.approximately(16.609, 0.001);
      /** @type import('../src/flow').IfcInline[] */
      const [ifc] = this.get('div').children;
      expect(ifc.paragraph.lineboxes[0].height()).to.be.approximately(21.063, 0.001);
    });

    it('aligns text-bottom', function () {
      this.layout(`
        <div style="font: 16px/20px Arimo;">
          baseline <span style="vertical-align: text-bottom;">text-bottom</span>
        </div>
      `);

      const b = this.paint();
      expect(b.called('baseline ').y).to.be.approximately(16.609, 0.001);
      expect(b.called('text-bottom').y).to.be.approximately(15.547, 0.001);
      /** @type import('../src/flow').IfcInline[] */
      const [ifc] = this.get('div').children;
      expect(ifc.paragraph.lineboxes[0].height()).to.be.approximately(21.063, 0.001);
    });

    it('aligns px', function () {
      this.layout(`
        <div style="font: 16px/20px Arimo;">
          baseline <span style="vertical-align: 30px;">30px</span>
        </div>
      `);

      const b = this.paint();
      expect(b.called('baseline ').y).to.be.approximately(45.547, 0.001);
      expect(b.called('30px').y).to.be.approximately(15.547, 0.001);
      /** @type import('../src/flow').IfcInline[] */
      const [ifc] = this.get('div').children;
      expect(ifc.paragraph.lineboxes[0].height()).to.be.approximately(50, 0.001);
    });

    it('aligns percentage', function () {
      this.layout(`
        <div style="font: 16px/20px Arimo;">
          baseline <span style="vertical-align: 50%; line-height: 10px;">percentage</span>
        </div>
      `);

      const b = this.paint();
      expect(b.called('baseline ').y).to.be.approximately(15.547, 0.001);
      expect(b.called('percentage').y).to.be.approximately(10.547, 0.001);
      /** @type import('../src/flow').IfcInline[] */
      const [ifc] = this.get('div').children;
      expect(ifc.paragraph.lineboxes[0].height()).to.equal(20);
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
      expect(b.called('baseline').y).to.be.approximately(15.547, 0.001);
      expect(b.called('top').y).to.be.approximately(25.547, 0.001);
      /** @type import('../src/flow').IfcInline[] */
      const [ifc] = this.get('div').children;
      expect(ifc.paragraph.lineboxes[0].height()).to.equal(45.44);
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
      expect(b.called('baseline').y).to.be.approximately(38.747, 0.001);
      expect(b.called('bottom').y).to.be.approximately(28.747, 0.001);
      /** @type import('../src/flow').IfcInline[] */
      const [ifc] = this.get('div').children;
      expect(ifc.paragraph.lineboxes[0].height()).to.equal(43.2);
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
      expect(b.called('baseline ').y).to.be.approximately(35.547, 0.001);
      expect(b.called('t').y).to.be.approximately(45.547, 0.001);
      expect(b.called('b').y).to.be.approximately(65.547, 0.001);
      /** @type import('../src/flow').IfcInline[] */
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

      /** @type import('../src/flow').IfcInline[] */
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

      /** @type import('../src/flow').IfcInline[] */
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

      /** @type import('../src/flow').IfcInline[] */
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

      /** @type import('../src/flow').IfcInline[] */
      const [ifc] = this.get('div').children;
      expect(ifc.paragraph.lineboxes[0].ascender).to.be.approximately(26.288, 0.001);
      expect(ifc.paragraph.lineboxes[0].descender).to.be.approximately(9.136, 0.001);
      expect(ifc.paragraph.lineboxes[1].ascender).to.be.approximately(20.186, 0.001);
      expect(ifc.paragraph.lineboxes[1].descender).to.be.approximately(3.652, 0.001);
    });

    it('correctly resets separate alignment contexts for the second line', function () {
      this.layout(`
        <div style="font: 16px/20px Arimo; background: yellow;">
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
      expect(b.called('2b ').y).to.be.approximately(25.547, 0.001);
      expect(b.called('4b').y).to.be.approximately(35.547, 0.001);
      expect(b.called('2a ').y).to.be.approximately(65.547, 0.001);
      expect(b.called('4a').y).to.be.approximately(75.547, 0.001);
      /** @type import('../src/flow').IfcInline[] */
      const [ifc] = this.get('div').children;
      expect(ifc.paragraph.lineboxes[0].height()).to.be.approximately(40, 0.001);
      expect(ifc.paragraph.lineboxes[1].height()).to.be.approximately(40, 0.001);
    });

    it('correctly splits out nested top and bottoms', function () {
        this.layout(`
          <div style="font: 16px/20px Arimo; background: yellow;">
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
        expect(b.called('t1 ').y).to.be.approximately(13.047, 0.001);
        expect(b.called('t2 ').y).to.be.approximately(10.547, 0.001);
        expect(b.called('b').y).to.be.approximately(20.547, 0.001);
        /** @type import('../src/flow').IfcInline[] */
        const [ifc] = this.get('div').children;
        expect(ifc.paragraph.lineboxes[0].height()).to.equal(20);
    });
  });
});

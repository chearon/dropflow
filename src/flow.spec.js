//@ts-check

const {HTMLElement} = require('./node');
const {parseNodes} = require('./parser');
const {createComputedStyle, initialStyle} = require('./cascade');
const {generateBlockContainer, layoutBlockBox, BlockFormattingContext} = require('./flow');
const {Area} = require('./box');
const {expect} = require('chai');

const HarfbuzzInit = require('harfbuzzjs');
const FontConfigInit = require('fontconfig');
const ItemizerInit = require('itemizer');

const rootDeclaredStyle = createComputedStyle(initialStyle, {
  fontSize: 16,
  fontFamily: ['Helvetica'],
  fontWeight: 300,
  whiteSpace: 'normal',
  tabSize: {value: 8, unit: null},
  lineHeight: {value: 1.6, unit: null},
  position: 'static',
  height: {value: 100, unit: '%'},
  writingMode: 'horizontal-tb',
  display: {
    outer: 'block',
    inner: 'flow-root'
  }
});

describe('Flow', function () {
  before(async function () {
    const [hb, itemizer, FontConfig] = await Promise.all([HarfbuzzInit, ItemizerInit, FontConfigInit]);
    const cfg = new FontConfig();

    await cfg.addFont('assets/Arimo/Arimo-Regular.ttf');

    /**
     * @param {string} [html]
     */
    this.layout = async function (html) {
      this.initialContainingBlock = new Area('', rootDeclaredStyle, 0, 0, 300, 500);
      this.rootComputed = createComputedStyle(initialStyle, rootDeclaredStyle);
      this.rootElement = new HTMLElement('root', 'root', this.rootComputed);
      parseNodes(this.rootElement, html);
      this.blockContainer = generateBlockContainer(this.rootElement);
      await this.blockContainer.preprocess({fcfg: cfg, itemizer, hb, logging: {text: new Set(['17'])}});
      layoutBlockBox(this.blockContainer, {
        bfc: new BlockFormattingContext("horizontal-tb"),
        lastBlockContainerArea: this.initialContainingBlock,
        lastPositionedArea: this.initialContainingBlock,
        hb,
        logging: {text: new Set(['17'])}
      });
      this.blockContainer.containingBlock = this.initialContainingBlock;
      this.blockContainer.setBlockPosition(0, rootDeclaredStyle.writingMode);
      this.blockContainer.absolutify();
      this.get = function (...args) {
        if (typeof args[0] === 'string') {
          const elements = this.rootElement.query(args[0]);
          if (elements.length) return elements[0].boxes[0];
        } else {
          /** @type import('./box').Box */
          let ret = this.blockContainer;
          while (args.length) ret = ret.children[args.shift()];
          return ret;
        }
      };
    };
  });

  afterEach(function () {
    if (this.currentTest.state == 'failed') {
      let indent = 0, t = this.currentTest;
      while (t = t.parent) indent += 1;
      console.log('  '.repeat(indent) + "Box tree:");
      console.log(this.currentTest.ctx.blockContainer.repr(indent));
    }
  });

  describe('Box generation', function () {
    it('wraps inlines in block boxes', async function () {
      await this.layout('<div><span>abc</span><div></div>def</div>');

      // <span>abc</span>
      expect(this.get(0, 0).isBlockContainer()).to.be.true;
      expect(this.get(0, 0).isAnonymous()).to.be.true;
      expect(this.get(0, 0, 0).isIfcInline()).to.be.true;
      expect(this.get(0, 0, 0, 0).isInline()).to.be.true;
      // <div></div>
      expect(this.get(0, 1).isBlockContainer()).to.be.true;
      expect(this.get(0, 1).isAnonymous()).to.be.false;
      // def
      expect(this.get(0, 2).isBlockContainer()).to.be.true;
      expect(this.get(0, 2).isAnonymous()).to.be.true;
      expect(this.get(0, 2, 0).isIfcInline()).to.be.true;
      expect(this.get(0, 2, 0, 0).isRun()).to.be.true;
    });

    it('breaks out block level elements', async function () {
      await this.layout(`
        <div>
          <span>1break <div>1out</div></span>
          2break <div><span> 2out<div> 2deep</div></span></div>
        </div>
      `);

      // <anon div> <span>1break </span></anon div>
      expect(this.get(1, 0).isBlockContainer()).to.be.true;
      expect(this.get(1, 0).isBlockContainerOfInlines()).to.be.true;
      expect(this.get(1, 0).isAnonymous()).to.be.true;
      expect(this.get(1, 0).isBlockLevel()).to.be.true;
      // <span>1break </span>
      expect(this.get(1, 0, 0, 1).isInline()).to.be.true;
      expect(this.get(1, 0, 0, 1).isAnonymous()).to.be.false;
      // <div>1out</div>
      expect(this.get(1, 1).isBlockContainer()).to.be.true;
      expect(this.get(1, 1).isBlockContainerOfInlines()).to.be.true;
      expect(this.get(1, 1).isAnonymous()).to.be.false;
      expect(this.get(1, 1).isBlockLevel()).to.be.true;
      // 2break
      expect(this.get(1, 2).isBlockContainer()).to.be.true;
      expect(this.get(1, 2).isBlockContainerOfInlines()).to.be.true;
      expect(this.get(1, 2).isAnonymous()).to.be.true;
      expect(this.get(1, 2).isBlockLevel()).to.be.true;
      // <div><span> 2out<div> 2deep</div></span></div>
      expect(this.get(1, 3).isBlockContainer()).be.true
      expect(this.get(1, 3).isBlockContainerOfBlockContainers()).be.true
      expect(this.get(1, 3).children).to.have.lengthOf(3);
      // <anon div><span> 2out</span></anon div>
      expect(this.get(1, 3, 0).isBlockContainer()).be.true
      expect(this.get(1, 3, 0).isAnonymous()).be.true
      // end
      expect(this.get(1).children).to.have.lengthOf(5);
    });

    it('generates BFCs', async function () {
      await this.layout('<div style="display: flow-root;"></div>');
      expect(this.get(0).isBfcRoot()).to.be.true;
    });

    it('doesn\'t create block boxes with display: none', async function () {
      await this.layout(`
        <div style="display: flow-root;">
          <div style="margin: 10px 0;"></div>
          <div style="margin: 20px 0; display: none;"></div>
          <div style="margin: 10px 0;"></div>
        </div>
      `);

      expect(this.get(1).contentArea.height).to.equal(10);
      expect(this.get(1).children).to.have.lengthOf(5);
    });

    it('doesn\'t create inline boxes with display: none', async function () {
      await this.layout(`
        <div>
          <span style="line-height: 100px;">shown</span>
          <span style="line-height: 200px; display: none;">hidden</span>
        </div>
      `);

      expect(this.get(1).contentArea.height).to.equal(100);
      expect(this.get(1).children).to.have.lengthOf(1);
    });
  });

  describe('Collapsing', function () {
    it('collapses through, sets heights, offsets correctly', async function () {
      await this.layout(`
        <div id="r" style="display: flow-root;">
          <div id="c1" style="margin: 10px 0;"></div>
          <div id="c2" style="margin: 10px 0;"></div>
        </div>
      `);

      expect(this.blockContainer.contentArea.height).to.equal(500);
      expect(this.get('#r').contentArea.height).to.equal(10);
      expect(this.get('#c1').contentArea.height).to.equal(0);
      expect(this.get('#c2').contentArea.height).to.equal(0);

      expect(this.blockContainer.contentArea.y).to.equal(0);
      expect(this.get('#r').contentArea.y).to.equal(0);
      expect(this.get('#c1').contentArea.y).to.equal(10);
      expect(this.get('#c2').contentArea.y).to.equal(10);
    });

    it('uses smallest margin', async function () {
      await this.layout(`
        <div id="r" style="display: flow-root;">
          <div id="c1" style="margin: 20px 0;"></div>
          <div id="c2" style="margin: 10px 0;"></div>
        </div>
      `);

      expect(this.blockContainer.contentArea.height).to.equal(500);
      expect(this.get('#r').contentArea.height).to.equal(20);
      expect(this.get('#c1').contentArea.height).to.equal(0);
      expect(this.get('#c2').contentArea.height).to.equal(0);

      expect(this.blockContainer.contentArea.y).to.equal(0);
      expect(this.get('#r').contentArea.y).to.equal(0);
      expect(this.get('#c1').contentArea.y).to.equal(20);
      expect(this.get('#c2').contentArea.y).to.equal(20);
    });

    it('doesn\'t collapse through borders', async function () {
      await this.layout(`
        <div id="r" style="display: flow-root;">
          <div id="c1" style="margin: 20px 0; border-bottom: 1px solid;"></div>
          <div id="c2" style="margin: 10px 0;"></div>
        </div>
      `);

      expect(this.get('#r').contentArea.height).to.equal(41);
      expect(this.get('#c1').contentArea.y).to.equal(20);
      expect(this.get('#c2').contentArea.y).to.equal(41);
    });

    it('doesn\'t collapse through padding', async function () {
      await this.layout(`
        <div id="r" style="display: flow-root;">
          <div id="c1" style="margin: 20px 0; padding-bottom: 1px;"></div>
          <div id="c2" style="margin: 10px 0;"></div>
        </div>
      `);

      expect(this.get('#r').contentArea.height).to.equal(41);
      expect(this.get('#c1').contentArea.y).to.equal(20);
      expect(this.get('#c2').contentArea.y).to.equal(41);
    });

    it('collapses through parents', async function () {
      await this.layout(`
        <div id="r" style="display: flow-root;">
          <div id="c1" style="margin: 20px 0;">
            <div id="c2" style="margin: 20px 0;"></div>
          </div>
        </div>
      `);

      expect(this.get('#r').contentArea.height).to.equal(20);
      expect(this.get('#c1').contentArea.y).to.equal(20);
      expect(this.get('#c2').contentArea.y).to.equal(20);
    });

    it('doesn\'t collapse through if a height is set', async function () {
      await this.layout(`
        <div id="r" style="display: flow-root;">
          <div id="c1" style="margin: 20px 0;">
            <div id="c2" style="margin: 20px 0; height: 1px;"></div>
          </div>
        </div>
      `);

      expect(this.get('#r').contentArea.height).to.equal(41);
      expect(this.get('#c1').contentArea.y).to.equal(20);
      expect(this.get('#c2').contentArea.y).to.equal(20);
    });

    it('collapses through if height is zero', async function () {
      await this.layout(`
        <div id="r" style="display: flow-root;">
          <div id="c1" style="margin: 20px 0;">
            <div id="c2" style="margin: 20px 0; height: 0;"></div>
          </div>
        </div>
      `);

      expect(this.get('#r').contentArea.height).to.equal(20);
      expect(this.get('#c1').contentArea.y).to.equal(20);
      expect(this.get('#c2').contentArea.y).to.equal(20);
    });

    it('collapse throughs affect the right bc height', async function () {
      await this.layout(`
        <div id="t1" style="display: flow-root; line-height: 20px;">
          <div id="t2" style="margin: 0 0 20px 0; background-color: red;">
            pre
            <div></div>
          </div>
        </div>
      `);

      expect(this.get('#t1').contentArea.height).to.equal(40);
      expect(this.get('#t2').contentArea.height).to.equal(20);
    });

    it('uses right hypothetical margin for divs before the last margin', async function () {
      await this.layout(`
        <div style="display: flow-root; line-height: 20px;">
          <div id="t1" style="margin: 10px 0;">
            <div>
              text
              <div id="t2"></div>
            </div>
          </div>
        </div>
      `);

      expect(this.get('#t1').contentArea.y).to.equal(10);
      expect(this.get('#t2').contentArea.y).to.equal(30);
    });

    it('uses right hypothetical margin for divs deeper than the start margin', async function () {
      await this.layout(`
        <div style="display: flow-root;">
          <div style="margin: 10px 0;">
            <div id="t1"></div>
            <div id="t2" style="margin: 20px 0;"></div>
          </div>
        </div>
      `);

      expect(this.get('#t1').contentArea.y).to.equal(10);
      expect(this.get('#t2').contentArea.y).to.equal(20);
    });

    it('uses right hypothetical margin for a div on a different peak than start margin', async function () {
      await this.layout(`
        <div style="display: flow-root; line-height: 20px;">
          <div style="margin: 10px 0;">
            text
            <div></div>
          </div>
          <div>
            <div id="t" style="margin: 20px 0;"></div>
          </div>
        </div>
      `);

      expect(this.get('#t').contentArea.y).to.equal(50);
    });
  });

  describe('Automatic width and offsets', function () {
    describe('Border, padding, and empty div behavior', function () {
      before(async function () {
        await this.layout(`
          <div id="p" style="padding: 10px 5px; margin: 10px 5px;">
            <div id="b1" style="border: 10px solid;"></div>
            <div id="e"></div>
            <div id="b2" style="border: 10px solid;">
              <div id="m" style="margin: 10px;"></div>
            </div>
          </div>
        `);
      });

      it('lays out box model for #p correctly', function () {
        expect(this.get('#p').borderArea.width).to.equal(290);
        expect(this.get('#p').paddingArea.width).to.equal(290);
        expect(this.get('#p').contentArea.width).to.equal(280);
        expect(this.get('#p').borderArea.height).to.equal(70);
        expect(this.get('#p').paddingArea.height).to.equal(70);
        expect(this.get('#p').contentArea.height).to.equal(50);
        expect(this.get('#p').borderArea.y).to.equal(10);
        expect(this.get('#p').paddingArea.y).to.equal(10);
        expect(this.get('#p').contentArea.y).to.equal(20);
        expect(this.get('#p').borderArea.x).to.equal(5);
        expect(this.get('#p').paddingArea.x).to.equal(5);
        expect(this.get('#p').contentArea.x).to.equal(10);
      });

      it('lays out box model for #b1 correctly', function () {
        expect(this.get('#b1').borderArea.width).to.equal(280);
        expect(this.get('#b1').paddingArea.width).to.equal(260);
        expect(this.get('#b1').contentArea.width).to.equal(260);
        expect(this.get('#b1').borderArea.height).to.equal(20);
        expect(this.get('#b1').paddingArea.height).to.equal(0);
        expect(this.get('#b1').contentArea.height).to.equal(0);
        expect(this.get('#b1').borderArea.y).to.equal(20);
        expect(this.get('#b1').paddingArea.y).to.equal(30);
        expect(this.get('#b1').contentArea.y).to.equal(30);
        expect(this.get('#b1').borderArea.x).to.equal(10);
        expect(this.get('#b1').paddingArea.x).to.equal(20);
        expect(this.get('#b1').contentArea.x).to.equal(20);
      });

      it('lays out box model for #e correctly', function () {
        expect(this.get('#e').borderArea.width).to.equal(280);
        expect(this.get('#e').paddingArea.width).to.equal(280);
        expect(this.get('#e').contentArea.width).to.equal(280);
        expect(this.get('#e').borderArea.height).to.equal(0);
        expect(this.get('#e').paddingArea.height).to.equal(0);
        expect(this.get('#e').contentArea.height).to.equal(0);
        expect(this.get('#e').borderArea.y).to.equal(40);
        expect(this.get('#e').paddingArea.y).to.equal(40);
        expect(this.get('#e').contentArea.y).to.equal(40);
        expect(this.get('#e').borderArea.x).to.equal(10);
        expect(this.get('#e').paddingArea.x).to.equal(10);
        expect(this.get('#e').contentArea.x).to.equal(10);
      });

      it('lays out box model for #b2 correctly', function () {
        expect(this.get('#b2').borderArea.width).to.equal(280);
        expect(this.get('#b2').paddingArea.width).to.equal(260);
        expect(this.get('#b2').contentArea.width).to.equal(260);
        expect(this.get('#b2').borderArea.height).to.equal(30);
        expect(this.get('#b2').paddingArea.height).to.equal(10);
        expect(this.get('#b2').contentArea.height).to.equal(10);
        expect(this.get('#b2').borderArea.y).to.equal(40);
        expect(this.get('#b2').paddingArea.y).to.equal(50);
        expect(this.get('#b2').contentArea.y).to.equal(50);
        expect(this.get('#b2').borderArea.x).to.equal(10);
        expect(this.get('#b2').paddingArea.x).to.equal(20);
        expect(this.get('#b2').contentArea.x).to.equal(20);
      });

      it('lays out box model for #m correctly', function () {
        expect(this.get('#m').borderArea.width).to.equal(240);
        expect(this.get('#m').paddingArea.width).to.equal(240);
        expect(this.get('#m').contentArea.width).to.equal(240);
        expect(this.get('#m').borderArea.height).to.equal(0);
        expect(this.get('#m').paddingArea.height).to.equal(0);
        expect(this.get('#m').contentArea.height).to.equal(0);
        expect(this.get('#m').borderArea.y).to.equal(60);
        expect(this.get('#m').paddingArea.y).to.equal(60);
        expect(this.get('#m').contentArea.y).to.equal(60);
        expect(this.get('#m').borderArea.x).to.equal(30);
        expect(this.get('#m').paddingArea.x).to.equal(30);
        expect(this.get('#m').contentArea.x).to.equal(30);
      });
    });

    it('centers auto margins', async function () {
      await this.layout('<div style="width: 50px; margin: 0 auto;"></div>');
      expect(this.get('div').contentArea.x).to.equal(125);
    });

    it('expands left auto margin when the right margin is non-auto', async function () {
      await this.layout('<div style="width: 50px; margin: 0 50px 0 auto;"></div>');
      expect(this.get('div').contentArea.x).to.equal(200);
    });

    it('expands right auto margin when the left margin is non-auto', async function () {
      await this.layout('<div style="width: 50px; margin: 0 auto 0 50px;"></div>');
      expect(this.get('div').contentArea.x).to.equal(50);
    });

    it('sizes ifc containers and their parents correctly', async function () {
      await this.layout(`
        <div>
          <div style="line-height: 100px;">hey dont forget to size your parent</div>
        </div>
      `);
      expect(this.get('div').contentArea.height).to.equal(100);
    });

    it('handles over-constrained values correctly', async function () {
      await this.layout(`
        <div style="width: 300px;">
          <div id="t" style="width: 200px; margin: 100px;"></div>
        </div>
      `);
      expect(this.get('#t').contentArea.width).to.equal(200);
      expect(this.get('#t').contentArea.x).to.equal(100);
    });

    it('right-aligns over-constrained boxes', async function () {
      await this.layout(`
        <div style="direction: rtl; width: 300px;">
          <div id="t" style="margin: 100px; width: 300px; direction: ltr;"></div>
        </div>
      `);

      expect(this.get('#t').contentArea.x).to.equal(-100);
    });
  });

  describe('Vertical writing modes', function () {
    it('lays out from right to left', async function () {
      await this.layout(`
        <div style="margin-top: 20px; height: 10px; writing-mode: vertical-rl;">
          <div id="t" style="width: 10px;"></div>
          <div></div>
        </div>
      `);

      expect(this.get('#t').contentArea.x).to.equal(290);
      expect(this.get('#t').contentArea.y).to.equal(20);
    });

    it('lays out from left to right', async function () {
      await this.layout(`
        <div style="margin-top: 20px; height: 10px; writing-mode: vertical-lr;">
          <div style="width: 10px;"></div>
          <div id="t"></div>
        </div>
      `);

      expect(this.get('#t').contentArea.x).to.equal(10);
      expect(this.get('#t').contentArea.y).to.equal(20);
    });

    it('collapses orthogonal margins on the outside', async function () {
      await this.layout(`
        <div id="t" style="margin: 10px;"></div>
        <div style="height: 10px; writing-mode: vertical-lr; margin: 10px;"></div>
      `);

      expect(this.get('#t').contentArea.x).to.equal(10);
      expect(this.get('#t').contentArea.y).to.equal(10);
    });

    it('does not collapse orthogonal margins on the inside', async function () {
      await this.layout(`
        <div style="height: 100px; writing-mode: vertical-lr; margin: 10px;">
          <div id="t" style="margin: 10px;"></div>
        </div>
      `);

      expect(this.get('#t').contentArea.x).to.equal(20);
      expect(this.get('#t').contentArea.y).to.equal(20);
    });

    it('collapses left/right margins', async function () {
      await this.layout(`
        <div style="height: 100px; writing-mode: vertical-lr;">
          <div id="c1" style="margin: 20px;"></div>
          <div id="c2" style="margin: 20px;"></div>
          <div id="c3" style="border: 1px solid;"></div>
          <div id="c4" style="margin: 20px;"></div>
        </div>
      `);

      expect(this.get('#c1').contentArea.x).to.equal(20);
      expect(this.get('#c2').contentArea.x).to.equal(20);
      expect(this.get('#c3').contentArea.x).to.equal(21);
      expect(this.get('#c4').contentArea.x).to.equal(42);
    });

    it('vertically centers with auto margins', async function () {
      await this.layout(`
        <div style="height: 100px; writing-mode: vertical-lr;">
          <div id="t" style="margin: auto 0; height: 10px;"></div>
        </div>
      `);

      expect(this.get('#t').contentArea.y).to.equal(45);
    });
  });

  describe('Units', function () {
    it('resolves percentage on padding', async function () {
      await this.layout(`
        <div style="width: 100px;">
          <div id="c1" style="padding-right: 11%;"></div>
          <div id="c2" style="padding-top: 11%;"></div>
          <div id="c3" style="padding: 10%;"></div>
        </div>
      `);

      expect(this.get('#c1').contentArea.width).to.equal(89);
      expect(this.get('#c2').borderArea.height).to.equal(11);
      expect(this.get('#c2').contentArea.y).to.equal(11);

      expect(this.get('#c3').contentArea.width).to.equal(80);
      expect(this.get('#c3').borderArea.height).to.equal(20);
    });

    it('resolves percentages on margin', async function () {
      await this.layout(`
        <div style="width: 100px;">
          <div id="c1" style="margin-left: 20%;"></div>
          <div id="c2" style="margin-top: 25%; border-bottom-width: 25px; border-bottom-style: solid;"></div>
          <div id="c3" style="margin: 50%;"></div>
        </div>
      `);

      expect(this.get('#c1').borderArea.x).to.equal(20);
      expect(this.get('#c2').borderArea.y).to.equal(25);
      expect(this.get('#c3').borderArea.x).to.equal(50);
      expect(this.get('#c3').borderArea.y).to.equal(100);
    });

    it('resolves em units on width and height', async function () {
      await this.layout(`<div style="width: 1em; height: 1em;"></div>`);
      expect(this.get('div').contentArea.height).to.equal(16);
      expect(this.get('div').contentArea.width).to.equal(16);
    });

    it('resolves em units on borders', async function () {
      await this.layout(`
        <div style="width: 100px; font-size: 16px;">
          <div id="t" style="border: 1em solid;"></div>
        </div>
      `);
      expect(this.get('#t').borderArea.height).to.equal(16 * 2);
      expect(this.get('#t').contentArea.x).to.equal(16);
      expect(this.get('#t').contentArea.width).to.equal(100 - 16 * 2);
    });

    it('resolves em units on margins', async function () {
      await this.layout(`
        <div style="width: 100px; font-size: 16px;">
          <div id="t" style="margin: 1em;"></div>
        </div>
      `);
      expect(this.get('#t').contentArea.width).to.equal(100 - 16 * 2);
      expect(this.get('#t').contentArea.x).to.equal(16);
      expect(this.get('#t').contentArea.y).to.equal(16);
    });
  });
});

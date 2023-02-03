//@ts-check

import {expect} from 'chai';
import * as oflo from '../node.js';
import {registerFontAsset} from '../assets/register.js';

describe('Flow', function () {
  before(async function () {
    registerFontAsset('Arimo/Arimo-Regular.ttf');

    /**
     * @param {string} [html]
     */
    this.layout = async function (html) {
      this.rootElement = oflo.parse(html, {
        height: {unit: '%', value: 100}
      });
      this.blockContainer = oflo.generate(this.rootElement);
      await oflo.layout(this.blockContainer, 300, 500);
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

    it('considers floating inlines block-level', async function () {
      await this.layout(`
        <span id="t" style="float: left; margin-right: 1em;">👻</span>
        Spooky floating ghost!
      `);

      expect(this.get('#t').isInlineLevel()).to.be.false;
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
          <div id="t2" style="margin: 0 0 20px 0;">
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

    it('won\'t collapse margins with clearance with the parent', async function () {
      await this.layout(`
        <div style="display: flow-root;">
          <div id="t1">
            <div style="width: 20px; height: 20px; float: left;"></div>
            <div style="clear: left; margin: 10px 0;"></div>
          </div>
          <div id="t2" style="border-top: 1px solid;"></div>
        </div>
      `)

      const t1 = this.get('#t1');
      expect(t1.contentArea.height).to.equal(20);
      const t2 = this.get('#t2');
      expect(t2.borderArea.y).to.equal(20);
    });

    it('collapses margins with clearance with following siblings', async function () {
      await this.layout(`
        <div style="display: flow-root; line-height: 20px;">
          Some text! <div style="width: 100px; height: 100px; float: left;"></div>
          <div style="margin: 20px 0; clear: left;"></div>
          <div id="t" style="margin: 10px 0;"></div>
        </div>
      `);

      const t = this.get('#t');
      expect(t.contentArea.y).to.equal(100);
    });

    it('collapses margins with clearance with the parent if clearance has no effect', async function () {
      await this.layout(`
        <div style="display: flow-root;">
          <div style="margin: 20px 0;">
            <div style="clear: left; margin: 20px 0;"></div>
          </div>
        </div>
      `);
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

  describe('Floats', function () {
    it('can be the exclusive content', async function () {
      await this.layout(`
        <div style="width: 100px;"><div style="width: 25px; height: 25px; float: right;"></div></div>
      `);

      /** @type import('./flow').IfcInline[] */
      const [ifc] = this.get('div').children;
      const [box] = ifc.children;
      expect(box.borderArea.x).to.equal(75);
    });

    it('positions negative-margin text around floats', async function () {
      await this.layout(`
        <div id="t1" style="line-height: 20px; width: 100px;">
          <div id="t2" style="border-top: 1px solid;">
            <div style="width: 51px; height: 25px; float: left;"></div>
            <div style="width: 50px; height: 25px; float: right;"></div>
          </div>
          <div id="t3" style="margin-top: -15px;">The text</div>
        </div>
      `);

      /** @type import('./flow').BlockContainer */
      const t1 = this.get('#t1');
      expect(t1.borderArea.height).to.equal(26);
      /** @type import('./flow').BlockContainer */
      const t2 = this.get('#t2');
      expect(t2.contentArea.height).to.equal(0);
      /** @type import('./flow').IfcInline[] */
      const [ifc] = this.get('#t3').children;
      expect(ifc.paragraph.lineboxes[0].blockOffset).to.equal(0);
      expect(ifc.paragraph.lineboxes[0].inlineOffset).to.equal(51);
      expect(ifc.paragraph.lineboxes[1].blockOffset).to.equal(20);
      expect(ifc.paragraph.lineboxes[1].inlineOffset).to.equal(51);
    });

    it('sets bfc height for hanging floats', async function () {
      await this.layout(`
        <div style="font: 16px/20px Arimo; display: flow-root; width: 300px;">
          So many rules, so little time.
          <div style="width: 300px; height: 50px; float: left;"></div>
        </div>
      `);

      /** @type import('./flow').BlockContainer */
      const bfc = this.get('div');
      expect(bfc.contentArea.height).to.equal(70);
    });

    it('sets non-bfc containing block height to zero if it has only floats', async function () {
      await this.layout(`
        <div style="font: 16px/20px Arimo; display: flow-root; width: 300px;">
          So many rules, so little time.
          <div>
            <div style="width: 300px; height: 50px; float: left;"></div>
          </div>
        </div>
      `);

      /** @type import('./flow').BlockContainer */
      const bfc = this.get('div');
      expect(bfc.contentArea.height).to.equal(70);
      const [, cb] = bfc.children;
      expect(cb.contentArea.height).to.equal(0);
    });

    it('places floats beneath negative margin under text above them', async function () {
      await this.layout(`
        <div style="font: 16px/20px Arimo; display: flow-root; width: 500px;">
          This here float below me better go beneath me!
          <div style="margin-top: -20px;">
            <div id="f" style="float: left; width: 10px; height: 10px;"></div>
          </div>
        </div>
      `);

      /** @type import('./flow').BlockContainer */
      const f = this.get('#f');
      expect(f.contentArea.y).to.equal(0);
    });

    it('uses the margin around floats', async function () {
      await this.layout(`
        <div id="t1" style="font: 16px/20px Arimo; display: flow-root; width: 500px;">
          <div id="t2" style="float: left; width: 10px; height: 10px; margin: 10px;"></div>
          I'm floating!
        </div>
      `);

      /** @type import('./flow').IfcInline[] */
      const [ifc] = this.get('#t1').children;
      expect(ifc.paragraph.lineboxes[0].inlineOffset).to.equal(30);
      /** @type import('./flow').BlockContainer */
      const t2 = this.get('#t2');
      expect(t2.contentArea.x).to.equal(10);
      expect(t2.contentArea.y).to.equal(10);
    });

    it('clears a float with another float', async function () {
      await this.layout(`
        <div style="font: 16px/20px Arimo; display: flow-root; width: 500px;">
          <div id="t1" style="float: left; clear: left; width: 10px; height: 10px;"></div>
          <div id="t2" style="float: left; clear: left; width: 10px; height: 10px;"></div>
        </div>
      `);

      /** @type import('./flow').BlockContainer */
      const t1 = this.get('#t1');
      /** @type import('./flow').BlockContainer */
      const t2 = this.get('#t2');
      expect(t1.borderArea.x).to.equal(0);
      expect(t1.borderArea.y).to.equal(0);
      expect(t2.borderArea.x).to.equal(0);
      expect(t2.borderArea.y).to.equal(10);
    });

    it('floats floats with text', async function () {
      await this.layout(`
        <div style="font: 16px/20px Arimo; display: flow-root; width: 100px;">
          <div id="t" style="float: left; width: 50px;">wow such text</div>
          wow more text that wraps
        </div>
      `);

      /** @type import('./flow').IfcInline[] */
      const [ifc] = this.get('#t').children;
      expect(ifc.paragraph.lineboxes.length).to.equal(3);
    });

    it('moves the first words of the paragraph below floats that crowd them', async function () {
      await this.layout(`
        <div id="t" style="font: 16px/20px Arimo; display: flow-root; width: 300px;">
          <div style="float: left; width: 300px; height: 300px;"></div>
          beneath, not against!
        </div>
      `);

      /** @type import('./flow').IfcInline[] */
      const [ifc] = this.get('#t').children;
      expect(ifc.paragraph.lineboxes[0].blockOffset).to.equal(300);
    });

    it('uses correct shelf position with 2 starting floats', async function () {
      await this.layout(`
        <div style="font: 16px/20px Arimo; display: flow-root; width: 300px;">
          <div style="float: left; width: 300px; height: 300px;"></div>
          float don't go
          <div id="t" style="float: left; width: 30px; height: 30px;"></div>
          beneath me
        </div>
      `);

      expect(this.get('#t').contentArea.y).to.equal(300);
    });

    it('places floats on soft breaks correctly', async function () {
      await this.layout(`
        <div id="t1" style="font: 16px/20px Arimo; display: flow-root; width: 300px;">
          mefirst!
          <div id="t2" style="float: left; width: 300px; height: 300px;"></div>
        </div>
      `);

      /** @type import('./flow').IfcInline[] */
      const [ifc] = this.get('#t1').children;
      expect(ifc.paragraph.lineboxes.length).to.equal(1);
      expect(ifc.paragraph.lineboxes[0].blockOffset).to.equal(0);
      expect(this.get('#t2').contentArea.y).to.equal(20);
    });

    it('places floats at word end correctly', async function () {
      await this.layout(`
        <div id="t1" style="font: 16px/20px Arimo; display: flow-root; width: 300px;">
          mefirst!<div id="t2" style="float: left; width: 300px; height: 300px;"></div>
        </div>
      `);

      /** @type import('./flow').IfcInline[] */
      const [ifc] = this.get('#t1').children;
      expect(ifc.paragraph.lineboxes.length).to.equal(1);
      expect(ifc.paragraph.lineboxes[0].blockOffset).to.equal(0);
      expect(this.get('#t2').contentArea.y).to.equal(20);
    });

    it('places floats after start-of-line collapsible whitespace correctly', async function () {
      await this.layout(`
        <div id="t1" style="font: 16px/20px Arimo; display: flow-root; width: 300px;">
          <br> <div id="t2" style="float: left; width: 300px; height: 300px;"></div>
        </div>
      `);

      /** @type import('./flow').IfcInline[] */
      const [ifc] = this.get('#t1').children;
      expect(ifc.paragraph.lineboxes.length).to.equal(2);
      expect(ifc.paragraph.lineboxes[1].blockOffset).to.equal(20);
      expect(this.get('#t2').contentArea.y).to.equal(20);
    });

    it('places mid-word floats correctly', async function () {
      await this.layout(`
        <div id="t1" style="font: 16px/20px Arimo; display: flow-root; width: 300px;">
          rightin<div id="t2" style="float: left; width: 300px; height: 300px;"></div>themiddle
        </div>
      `);

      /** @type import('./flow').IfcInline[] */
      const [ifc] = this.get('#t1').children;
      expect(ifc.paragraph.lineboxes.length).to.equal(1);
      expect(ifc.paragraph.lineboxes[0].blockOffset).to.equal(0);
      expect(this.get('#t2').contentArea.y).to.equal(20);
    });

    it('places mid-nowrap floats correctly', async function () {
      await this.layout(`
        <div id="t1" style="font: 16px/20px Arimo; display: flow-root; width: 300px;">
          right <span style="white-space: nowrap;">in the <div id="t2" style="float: left; width: 300px; height: 300px;"></div> middle
        </div>
      `);

      /** @type import('./flow').IfcInline[] */
      const [ifc] = this.get('#t1').children;
      expect(ifc.paragraph.lineboxes.length).to.equal(1);
      expect(ifc.paragraph.lineboxes[0].inlineOffset).to.equal(0);
      expect(ifc.paragraph.lineboxes[0].blockOffset).to.equal(0);
      expect(this.get('#t2').contentArea.x).to.equal(0);
      expect(this.get('#t2').contentArea.y).to.equal(20);
    });

    it('perfectly fits floats that sum to container width', async function () {
      await this.layout(`
        <div style="font: 16px/20px Arimo; width: 100px;">
          <div style="width: 50px; height: 20px; float: left;"></div>
          <div id="t" style="width: 50px; height: 20px; float: left;"></div>
        </div>
      `);

      expect(this.get('#t').contentArea.y).to.equal(0);
    });

    it('drops shelf beneath the line if the float would have fit without the line', async function () {
      await this.layout(`
        <div style="font: 16px/20px Arimo; display: flow-root; width: 300px;">
          <div style="width: 250px; height: 60px; float: left;"></div>
          word
          <div id="t" style="width: 50px; height: 20px; float: left;"></div>
        </div>
      `);

      /** @type import('./flow').IfcInline[] */
      expect(this.get('#t').contentArea.y).to.equal(20);
    });

    it('floats space + open span + float + ink the right way', async function () {
      await this.layout(`
        <div style="font: 16px/20px Arimo; display: flow-root; width: 300px;">
          <span>
            <div id="t" style="width: 300px; height: 300px; float: left;"></div>
          </span>
          Test
        </div>
      `);

      /** @type import('./flow').IfcInline[] */
      expect(this.get('#t').contentArea.y).to.equal(0);
    });

    it('a float that follows uncollapsible ws at start-of-line should go after', async function () {
      await this.layout(`
        <div style="font: 16px/20px Arimo; display: flow-root; width: 300px; white-space: pre;"> <div id="t" style="width: 300px; height: 300px; float: left;"></div>xyz</div>
      `);

      /** @type import('./flow').IfcInline[] */
      expect(this.get('#t').contentArea.y).to.equal(20);
    });

    it('lays out text for nested floats', async function () {
      await this.layout(`
        <div style="float: left; width: 100px;">
          <div id="t" style="float: left; width: 50px;">Yo</div>
        </div>
      `);

      /** @type import('./flow').IfcInline[] */
      const [ifc] = this.get('#t').children;
    });

    it('doesn\'t measure trailing spaces when trying to fit a float', async function () {
      await this.layout(`
        <div id="t" style="display: flow-root; font: 16px Cousine; width: 144.203125px;">
          xx
          <div style="width: 125px; height: 25px; float: left;"></div>
        </div>
      `);

      /** @type import('./flow').BlockContainer */
      const block = this.get('#t');
      const [ifc] = block.children;
      expect(block.contentArea.height).to.equal(25);
      expect(ifc.paragraph.lineboxes.length).to.equal(1);
    });

    it('doesn\'t shorten lineboxes if float is zero height', async function () {
      await this.layout(`
        <div id="t" style="display: flow-root; width: 300px;">
          <div style="width: 100px; float: left;"></div>
          Where am I?
        </div>
      `);

      /** @type import('./flow').IfcInline[] */
      const [ifc] = this.get('#t').children;
      expect(ifc.paragraph.lineboxes.length).to.equal(1);
      expect(ifc.paragraph.lineboxes[0].inlineOffset).to.equal(0);
    });

    it('doesn\'t infinite loop when multiple zero height floats don\'t fit', async function () {
      await this.layout(`
        <div id="t" style="display: flow-root; width: 300px;">
          Don't break me bro
          <div style="width: 1000px; float: left;"></div>
          <div style="width: 1000px; float: left;"></div>
        </div>
      `);
    });

    it('places zero height floats after normal floats', async function () {
      await this.layout(`
        <div id="t" style="display: flow-root; width: 300px;">
          <div style="width: 10px; float: left;"></div>
          <div style="width: 10px; border-top: 1px solid; float: left;"></div>
          <div style="width: 10px; float: left;"></div>
          <div style="width: 10px; margin-top: 1px; float: left;"></div>
          <div style="width: 10px; float: left;"></div>
          <div style="width: 10px; padding-top: 1px; float: left;"></div>
          <div style="width: 10px; float: left;"></div>
        </div>
      `);

      /** @type import('./flow').IfcInline[] */
      const [ifc] = this.get('#t').children;
      expect(ifc.children[1].borderArea.x).to.equal(0);
      expect(ifc.children[2].borderArea.x).to.equal(0);
      expect(ifc.children[3].borderArea.x).to.equal(10);
      expect(ifc.children[4].borderArea.x).to.equal(10);
      expect(ifc.children[5].borderArea.x).to.equal(20);
      expect(ifc.children[6].borderArea.x).to.equal(20);
      expect(ifc.children[7].borderArea.x).to.equal(30);
    });

    it('sets box to float height when it\'s a bfc and ifc', async function () {
      await this.layout(`
        <div id="t" style="display: flow-root;">
          <div style="width: 20px; height: 20px; float: left;"></div>
        </div>
      `);

      /** @type import('./flow').BlockContainer */
      const t = this.get('#t');
      expect(t.contentArea.height).to.equal(20);
    });

    it('sets box to max(float, lineboxes) when it\'s a bfc and ifc', async function () {
      await this.layout(`
        <div id="t" style="display: flow-root; line-height: 20px; width: 0;">
          <div style="width: 20px; height: 20px; float: left;"></div>
          chillin
        </div>
      `);

      /** @type import('./flow').BlockContainer */
      const t = this.get('#t');
      expect(t.contentArea.height).to.equal(40);
    });

    it('places left floats with margin-left correctly', async function () {
      await this.layout(`
        <div style="width: 300px;">
          <div id="t" style="width: 100px; height: 100px; margin-left: 100px; float: right;"></div>
        </div>
      `);

      /** @type import('./flow').BlockContainer */
      const t = this.get('#t');
      expect(t.contentArea.x).to.equal(200);
    });

    // §9.5.1
    // some of the rules don't really make sense to test alone - they all work
    // together to create a single concept - but most of them do, and it's a way
    // to be organized.

    it('obeys rule 1', async function () {
      await this.layout(`
        <div style="width: 100px;">
          <div style="width: 25px; height: 25px; float: left;"></div>
          <div style="width: 25px; height: 25px; float: right;"></div>
          hey!
        </div>
      `);

      /** @type import('./flow').IfcInline[] */
      const [ifc] = this.get('div').children;
      const [, left, right] = ifc.children;
      expect(left.borderArea.x).to.equal(0);
      expect(right.borderArea.x).to.equal(75);
      expect(ifc.paragraph.lineboxes[0].inlineOffset).to.equal(25);
    });

    it('obeys rule 2', async function () {
      await this.layout(`
        <div style="width: 100px;">
          <div style="width: 25px; height: 25px; float: left;"></div>
          <div style="width: 25px; height: 25px; float: left;"></div>
        </div>
      `);

      /** @type import('./flow').IfcInline[] */
      const [ifc] = this.get('div').children;
      const [, left1, left2] = ifc.children;
      expect(left1.borderArea.x).to.equal(0);
      expect(left2.borderArea.x).to.equal(25);
    });

    it('obeys rule 3', async function () {
      await this.layout(`
        <div style="width: 100px;">
          xx
          <div style="width: 51px; height: 50px; float: left;"></div>
          <div style="width: 50px; height: 50px; float: right;"></div>
        </div>
      `);

      /** @type import('./flow').IfcInline[] */
      const [ifc] = this.get('div').children;
      const [, left1, left2] = ifc.children;
      expect(left1.borderArea.x).to.equal(0);
      expect(left1.borderArea.y).to.equal(0);
      expect(left2.borderArea.x).to.equal(50);
      expect(left2.borderArea.y).to.equal(50);
    });

    it('obeys rule 4', async function () {
      await this.layout(`
        <div style="width: 100px; line-height: 20px;">
          has space
          <div id="t"><div style="width: 10px; height: 10px; float: left;"></div></div>
        </div>
      `);

      /** @type import('./flow').IfcInline[] */
      const [ifc] = this.get('#t').children;
      const [float] = ifc.children;
      expect(float.borderArea.y).to.equal(20);
    });

    it('obeys rule 5', async function () {
      await this.layout(`
        <div style="width: 100px; font-size: 0;">
          <div id="f1" style="float: left; width: 10px; height: 10px;"></div>
          <div id="f2" style="float: left; width: 91px; height: 91px;"></div>
          <div id="f3" style="float: left; width: 5px; height: 5px;"></div>
        </div>
      `);

      /** @type import('./flow').IfcInline */
      const float1 = this.get('#f1');
      /** @type import('./flow').IfcInline */
      const float2 = this.get('#f2');
      /** @type import('./flow').IfcInline */
      const float3 = this.get('#f3');

      expect(float1.borderArea.x).to.equal(0);
      expect(float1.borderArea.y).to.equal(0);
      expect(float2.borderArea.x).to.equal(0);
      expect(float2.borderArea.y).to.equal(10);
      expect(float3.borderArea.x).to.equal(91);
      expect(float3.borderArea.y).to.equal(10);
    });

    it('obeys rule 6', async function () {
      await this.layout(`
        <div style="width: 200px; font: 16px/20px Arimo;">
          <div style="width: 20px; height: 20px; float: left;"></div>
          As the text flows down, potential float positions flow down too.
          <div style="width: 20px; height: 20px; float: right;"></div>
        </div>
      `);

      /** @type import('./flow').IfcInline[] */
      const [ifc] = this.get('div').children;
      const [, float1,, float2] = ifc.children;
      expect(float1.borderArea.x).to.equal(0);
      expect(float1.borderArea.y).to.equal(0);
      expect(float2.borderArea.x).to.equal(180);
      expect(float2.borderArea.y).to.equal(40);
    });

    it('obeys rule 7', async function () {
      await this.layout(`
        <div style="width: 200px; font: 16px/20px Arimo;">
          Floats have a bad reputation
          <div style="float: left; width: 300px; height: 5px;"></div>
          because they used to be used for higher-level layout!
        </div>
      `);

      /** @type import('./flow').IfcInline[] */
      const [ifc] = this.get('div').children;
      const [, float] = ifc.children;
      const [lb1, lb2, lb3, lb4] = ifc.paragraph.lineboxes;
      expect(lb1.blockOffset).to.equal(0);
      expect(lb2.blockOffset).to.equal(20);
      expect(float.borderArea.y).to.equal(40);
      expect(lb3.blockOffset).to.equal(45);
      expect(lb4.blockOffset).to.equal(65);
    });

    it('obeys rule 8', async function () {
      await this.layout(`
        <div style="width: 200px; font: 16px/20px Arimo;">
          Hello there <div style="float: left; width: 5px; height: 5px;"></div>
        </div>
      `);

      /** @type import('./flow').IfcInline[] */
      const [ifc] = this.get('div').children;
      const [, float] = ifc.children;
      expect(float.borderArea.y).to.equal(0);
    });

    it('obeys rule 9', async function () {
      await this.layout(`
        <div style="width: 200px; font: 16px/20px Arimo;">
          Hello there
          <div style="float: left; width: 5px; height: 5px;"></div>
          <div style="float: left; width: 5px; height: 5px;"></div>
        </div>
      `);

      /** @type import('./flow').IfcInline[] */
      const [ifc] = this.get('div').children;
      const [, float1, float2] = ifc.children;
      expect(float1.borderArea.x).to.equal(0);
      expect(float1.borderArea.y).to.equal(0);
      expect(float2.borderArea.x).to.equal(5);
      expect(float2.borderArea.y).to.equal(0);
    });

    // §9.5.2
    it('obeys rule 10', async function () {
      await this.layout(`
        <div style="width: 200px; font: 16px/20px Arimo;">
          <div style="width: 40px; height: 40px; float: left;"></div>
          Lorem
          <div style="width: 20px; height: 20px; float: left; clear: left;"></div>
          ipsum text is one way to generate filler text,
          <div style="width: 20px; height: 20px; float: right;"></div>
          but
          <div style="width: 20px; height: 20px; float: left; clear: right;"></div>
          another way is stream of consciousness.
        </div>
      `);

      /** @type import('./flow').IfcInline[] */
      const [ifc] = this.get('div').children;
      const [,,, float2,, float3,, float4] = ifc.children;
      expect(float2.borderArea.x).to.equal(0);
      expect(float2.borderArea.y).to.equal(40);
      expect(float3.borderArea.x).to.equal(180);
      expect(float3.borderArea.y).to.equal(40);
      expect(float4.borderArea.x).to.equal(0);
      expect(float4.borderArea.y).to.equal(60);
    });

    describe('Intrinsics', function () {
      it('lays out text under max-content constraint', async function () {
        await this.layout(`
          <div style="width: 300px; font: 16px Arimo;">
            <div id="t" style="float: left;">hey kid ima computer</div>
          </div>
        `);
        /** @type import('./flow').BlockContainer */
        const block = this.get('#t');
        expect(block.contentArea.width).to.equal(152.0625);
      });

      it('lays out text under min-content constraint', async function () {
        await this.layout(`
          <div style="width: 0; font: 16px Arimo;">
            <div id="t" style="float: left;">hey kid ima computer</div>
          </div>
        `);
        /** @type import('./flow').BlockContainer */
        const block = this.get('#t');
        expect(block.contentArea.width).to.equal(66.6953125);
      });

      it('lays out text no bigger than containing block', async function () {
        await this.layout(`
          <div style="width: 100px; font: 16px Arimo;">
            <div id="t" style="float: left;">hey kid ima computer</div>
          </div>
        `);
        /** @type import('./flow').BlockContainer */
        const block = this.get('#t');
        expect(block.contentArea.width).to.equal(100);
      });

      it('lays out nested floats under max-content constraint', async function () {
        await this.layout(`
          <div style="width: 300px; font: 16px Arimo;">
            <div id="t1" style="float: left;">
              <div id="t2" style="float: left;">hey kid ima computer</div>
            </div>
          </div>
        `);
        /** @type import('./flow').BlockContainer */
        const t1 = this.get('#t1');
        /** @type import('./flow').BlockContainer */
        const t2 = this.get('#t2');
        expect(t1.contentArea.width).to.equal(152.0625);
        expect(t2.contentArea.width).to.equal(152.0625);
      });

      it('lays out nested floats under min-content constraint', async function () {
        await this.layout(`
          <div style="width: 0; font: 16px Arimo;">
            <div id="t1" style="float: left;">
              <div id="t2" style="float: left;">hey kid ima computer</div>
            </div>
          </div>
        `);
        /** @type import('./flow').BlockContainer */
        const t1 = this.get('#t1');
        /** @type import('./flow').BlockContainer */
        const t2 = this.get('#t2');
        expect(t1.contentArea.width).to.equal(66.6953125);
        expect(t2.contentArea.width).to.equal(66.6953125);
      });

      it('lays out nested floats no bigger than containing block', async function () {
        await this.layout(`
          <div style="width: 100px; font: 16px Arimo;">
            <div id="t1" style="float: left;">
              <div id="t2" style="float: left;">hey kid ima computer</div>
            </div>
          </div>
        `);
        /** @type import('./flow').BlockContainer */
        const t1 = this.get('#t1');
        /** @type import('./flow').BlockContainer */
        const t2 = this.get('#t2');
        expect(t1.contentArea.width).to.equal(100);
        expect(t2.contentArea.width).to.equal(100);
      });

      it('chooses the largest word from the float if larger than floats', async function () {
        await this.layout(`
          <div style="width: 0; font: 16px Arimo;">
            <div id="t" style="float: left;">
              <div style="float: left;">hey</div>
              stop all the downloadin!
            </div>
          </div>
        `);

        /** @type import('./flow').BlockContainer */
        const t = this.get('#t');
        expect(t.contentArea.width).to.equal(85.3984375);
      });

      it('chooses the largest nested float if larger than largest word', async function () {
        await this.layout(`
          <div style="width: 0; font: 16px Arimo;">
            <div id="t" style="float: left;">
              hey stop all
              <div style="float: left;">the</div>
              <div style="float: left;">downloadin!</div>
            </div>
          </div>
        `);

        /** @type import('./flow').BlockContainer */
        const t = this.get('#t');
        expect(t.contentArea.width).to.equal(85.3984375);
      });

      it('sets nested float heights correctly under min-content', async function () {
        await this.layout(`
          <div style="width: 0; font: 16px/20px Arimo;">
            <div style="float: left;">
              <div id="t" style="float: left;">stop downloadin!</div>
            </div>
          </div>
        `);

        /** @type import('./flow').BlockContainer */
        const t = this.get('#t');
        expect(t.contentArea.height).to.equal(40);
      });

      it('sets nested float heights correctly under max-content', async function () {
        await this.layout(`
          <div style="width: 300px; font: 16px/20px Arimo;">
            <div style="float: left;">
              <div id="t" style="float: left;">stop downloadin!</div>
            </div>
          </div>
        `);

        /** @type import('./flow').BlockContainer */
        const t = this.get('#t');
        expect(t.contentArea.height).to.equal(20);
      });

      it('chooses specified width of nested floats', async function () {
        await this.layout(`
          <div style="width: 300px; font: 16px/20px Arimo;">
            <div id="t" style="float: left;">
              some text
              <div>
                <div style="float: left; width: 500px;">stop downloadin!</div>
              </div>
            </div>
          </div>
        `);

        /** @type import('./flow').BlockContainer */
        const t = this.get('#t');
        expect(t.contentArea.width).to.equal(500);
      });

      it('chooses specified width of nested block box', async function () {
        await this.layout(`
          <div style="width: 300px; font: 16px/20px Arimo;">
            <div id="t" style="float: left;">
              some text
              <div>
                <div style="width: 500px;">stop downloadin!</div>
              </div>
            </div>
          </div>
        `);

        /** @type import('./flow').BlockContainer */
        const t = this.get('#t');
        expect(t.contentArea.width).to.equal(500);
      });

      it('considers margin, border, padding part of the intrinsic size', async function () {
        await this.layout(`
          <div style="width: 200px; font: 16px Arimo;">
            <div id="t" style="float: left; margin: 10px; padding: 20px; border: 20px solid blue;">
              stop all the downloadin!
            </div>
          </div>
        `);

        /** @type import('./flow').BlockContainer */
        const t = this.get('#t');
        expect(t.contentArea.width).to.equal(100);
      });

      it('considers nested nested margin, border, padding part of intrinsic size', async function () {
        await this.layout(`
          <div style="width: 300px; font: 16px Arimo;">
            <div id="t" style="float: left;">
              <div style="margin: 10px; padding: 20px; border: 20px solid blue;">
                downloadin!
              </div>
            </div>
          </div>
        `);

        /** @type import('./flow').BlockContainer */
        const t = this.get('#t');
        expect(t.contentArea.width).to.equal(185.3984375);
      });
    });
  });
});
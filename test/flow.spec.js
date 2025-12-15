import {expect} from 'chai';
import * as flow from 'dropflow';
import parse from 'dropflow/parse.js';
import {registerFontAsset, unregisterFontAsset} from '../assets/register.ts';
import {Logger} from '../src/util.ts';

const log = new Logger();
const adaUrl = new URL(import.meta.resolve('#assets/images/ada.png'));

describe('Flow', function () {
  before(function () {
    registerFontAsset('Arimo/Arimo-Regular.ttf');

    /**
     * @param {string} [html]
     */
    this.layout = function (html) {
      this.rootElement = parse(html);
      flow.loadSync(this.rootElement);
      this.blockContainer = flow.generate(this.rootElement);
      flow.layout(this.blockContainer, 300, 500);
      this.get = function (...args) {
        if (typeof args[0] === 'string') {
          return this.rootElement.query(args[0])?.boxes[0];
        } else {
          /** @type import('../src/layout-box.ts').Box */
          let ret = this.blockContainer;
          while (args.length) {
            if (ret.isBlockContainerOfInlines()) {
              const i = args.shift();
              if (i !== 0) throw new Error('Asked for > 0 child of BlockContainerOfInlines');
              ret = ret.root;
            } else {
              ret = ret.children[args.shift()];
            }
          }
          return ret;
        }
      };
    };
  });

  after(function () {
    unregisterFontAsset('Arimo/Arimo-Regular.ttf');
  });

  afterEach(function () {
    if (this.currentTest.state == 'failed') {
      let indent = 0, t = this.currentTest;
      while (t = t.parent) indent += 1;
      log.pushIndent('  '.repeat(indent));
      log.text('Box tree:\n');
      this.currentTest.ctx.blockContainer.log({}, log);
      log.popIndent();
      log.flush();
    }
  });

  describe('Box generation', function () {
    it('wraps inlines in block boxes', function () {
      this.layout('<div><span>abc</span><div></div>def</div>');

      // <span>abc</span>
      expect(this.get(0, 0).isBlockContainer()).to.be.true;
      expect(this.get(0, 0).isAnonymous()).to.be.true;
      expect(this.get(0, 0).isBlockContainerOfInlines()).to.be.true;
      expect(this.get(0, 0, 0, 0).isInline()).to.be.true;
      // <div></div>
      expect(this.get(0, 1).isBlockContainer()).to.be.true;
      expect(this.get(0, 1).isAnonymous()).to.be.false;
      // def
      expect(this.get(0, 2).isBlockContainer()).to.be.true;
      expect(this.get(0, 2).isAnonymous()).to.be.true;
      expect(this.get(0, 2).isBlockContainerOfInlines()).to.be.true;
      expect(this.get(0, 2, 0, 0).isRun()).to.be.true;
    });

    it('wraps inline-block in block boxes', function () {
      this.layout(`
        <div><span style="display: inline-block;">yo</span><div>sup</div></div>
      `);

      // anon div
      expect(this.get(0, 0).isBlockContainer()).to.be.true;
      expect(this.get(0, 0).isAnonymous()).to.be.true;
      // inline-block
      expect(this.get(0, 0, 0, 0).isBlockContainer()).to.be.true;
      expect(this.get(0, 0, 0, 0).isBfcRoot()).to.be.true;
      expect(this.get(0, 0, 0, 0).isInline()).to.be.false;
      expect(this.get(0, 0, 0, 0).isInlineLevel()).to.be.true;
    });

    it('breaks out block level elements', function () {
      this.layout(`
        <div>
          <span>1break <div>1out</div></span>
          2break <div><span> 2out<div> 2deep</div></span></div>
        </div>
      `);

      // <anon div> <span>1break </span></anon div>
      expect(this.get(0, 0).isBlockContainer()).to.be.true;
      expect(this.get(0, 0).isBlockContainerOfInlines()).to.be.true;
      expect(this.get(0, 0).isAnonymous()).to.be.true;
      expect(this.get(0, 0).isInlineLevel()).to.be.false;
      // <span>1break </span>
      expect(this.get(0, 0, 0, 1).isInline()).to.be.true;
      expect(this.get(0, 0, 0, 1).isAnonymous()).to.be.false;
      // <div>1out</div>
      expect(this.get(0, 1).isBlockContainer()).to.be.true;
      expect(this.get(0, 1).isBlockContainerOfInlines()).to.be.true;
      expect(this.get(0, 1).isAnonymous()).to.be.false;
      expect(this.get(0, 1).isInlineLevel()).to.be.false;
      // 2break
      expect(this.get(0, 2).isBlockContainer()).to.be.true;
      expect(this.get(0, 2).isBlockContainerOfInlines()).to.be.true;
      expect(this.get(0, 2).isAnonymous()).to.be.true;
      expect(this.get(0, 2).isInlineLevel()).to.be.false;
      // <div><span> 2out<div> 2deep</div></span></div>
      expect(this.get(0, 3).isBlockContainer()).be.true
      expect(this.get(0, 3).isBlockContainerOfBlocks()).be.true
      expect(this.get(0, 3).children).to.have.lengthOf(3);
      // <anon div><span> 2out</span></anon div>
      expect(this.get(0, 3, 0).isBlockContainer()).be.true
      expect(this.get(0, 3, 0).isAnonymous()).be.true
      // end
      expect(this.get(0).children).to.have.lengthOf(5);
    });

    it('breaks out block-level <img> and wraps inline-level <img>', function () {
      this.layout(`
        <div>I have too many plants  <span><img style="display: block;"></span></div>
        <img>
        <img style="display: block;">
      `);

      // <div><anon div>
      expect(this.get(0, 0).isInlineLevel()).to.be.false;
      // ifc for "I have too many plants"
      expect(this.get(0, 0, 0).isInlineLevel()).to.be.true;
      // <span>
      expect(this.get(0, 0, 0, 1).isInlineLevel()).to.be.true;
      // first <img>
      expect(this.get(0, 1).isInlineLevel()).to.be.false;
      expect(this.get(0, 1).isReplacedBox()).to.be.true;
      // <anon div>
      expect(this.get(1).isInlineLevel()).to.be.false;
      // second <img>
      expect(this.get(1, 0).isInlineLevel()).to.be.true;
      expect(this.get(0, 1).isReplacedBox()).to.be.true;
      // third <img>
      expect(this.get(2).isInlineLevel()).to.be.false;
      expect(this.get(2).isReplacedBox()).to.be.true;
    })

    it('generates BFCs', function () {
      this.layout('<div style="display: flow-root;"></div>');
      expect(this.get(0).isBfcRoot()).to.be.true;
    });

    it('doesn\'t create block boxes with display: none', function () {
      this.layout(`
        <div style="display: flow-root;">
          <div style="margin: 10px 0;"></div>
          <div style="margin: 20px 0; display: none;"></div>
          <div style="margin: 10px 0;"></div>
        </div>
      `);

      expect(this.get(0).getContentArea().height).to.equal(10);
      expect(this.get(0).children).to.have.lengthOf(5);
    });

    it('doesn\'t create inline boxes with display: none', function () {
      this.layout(`
        <div>
          <span style="line-height: 100px;">shown</span>
          <span style="line-height: 200px; display: none;">hidden</span>
        </div>
      `);

      /** @type import('../src/layout-flow.ts').BlockContainerOfInlines */
      const ifc = this.get(0);
      expect(this.get(0).getContentArea().height).to.equal(100);
      expect(ifc.text).to.equal(' shown ');
    });

    it('generates nothing for <br> with display: none', function () {
      this.layout('abc <br style="display: none"> def');
      /** @type import('../src/layout-flow.ts').BlockContainerOfInlines */
      const ifc = this.get();
      expect(ifc.root.children.every(b => b.isRun())).to.be.true;
    });

    it('generates nothing for display: none; and float', function () {
      this.layout('<div style="float: right; display: none;"></div>');
      expect(this.get().children.length).to.equal(0);
    });
  });

  describe('Collapsing', function () {
    it('collapses through, sets heights, offsets correctly', function () {
      this.layout(`
        <div id="r" style="display: flow-root;">
          <div id="c1" style="margin: 10px 0;"></div>
          <div id="c2" style="margin: 10px 0;"></div>
        </div>
      `);

      expect(this.get('#r').getContentArea().height).to.equal(10);
      expect(this.get('#c1').getContentArea().height).to.equal(0);
      expect(this.get('#c2').getContentArea().height).to.equal(0);

      expect(this.blockContainer.getContentArea().y).to.equal(0);
      expect(this.get('#r').getContentArea().y).to.equal(0);
      expect(this.get('#c1').getContentArea().y).to.equal(10);
      expect(this.get('#c2').getContentArea().y).to.equal(10);
    });

    it('uses smallest margin', function () {
      this.layout(`
        <div id="r" style="display: flow-root;">
          <div id="c1" style="margin: 20px 0;"></div>
          <div id="c2" style="margin: 10px 0;"></div>
        </div>
      `);

      expect(this.get('#r').getContentArea().height).to.equal(20);
      expect(this.get('#c1').getContentArea().height).to.equal(0);
      expect(this.get('#c2').getContentArea().height).to.equal(0);

      expect(this.blockContainer.getContentArea().y).to.equal(0);
      expect(this.get('#r').getContentArea().y).to.equal(0);
      expect(this.get('#c1').getContentArea().y).to.equal(20);
      expect(this.get('#c2').getContentArea().y).to.equal(20);
    });

    it('doesn\'t collapse through borders', function () {
      this.layout(`
        <div id="r" style="display: flow-root;">
          <div id="c1" style="margin: 20px 0; border-bottom: 1px solid;"></div>
          <div id="c2" style="margin: 10px 0;"></div>
        </div>
      `);

      expect(this.get('#r').getContentArea().height).to.equal(41);
      expect(this.get('#c1').getContentArea().y).to.equal(20);
      expect(this.get('#c2').getContentArea().y).to.equal(41);
    });

    it('doesn\'t collapse through padding', function () {
      this.layout(`
        <div id="r" style="display: flow-root;">
          <div id="c1" style="margin: 20px 0; padding-bottom: 1px;"></div>
          <div id="c2" style="margin: 10px 0;"></div>
        </div>
      `);

      expect(this.get('#r').getContentArea().height).to.equal(41);
      expect(this.get('#c1').getContentArea().y).to.equal(20);
      expect(this.get('#c2').getContentArea().y).to.equal(41);
    });

    it('collapses through parents', function () {
      this.layout(`
        <div id="r" style="display: flow-root;">
          <div id="c1" style="margin: 20px 0;">
            <div id="c2" style="margin: 20px 0;"></div>
          </div>
        </div>
      `);

      expect(this.get('#r').getContentArea().height).to.equal(20);
      expect(this.get('#c1').getContentArea().y).to.equal(20);
      expect(this.get('#c2').getContentArea().y).to.equal(20);
    });

    it('doesn\'t collapse through if a height is set', function () {
      this.layout(`
        <div id="r" style="display: flow-root;">
          <div id="c1" style="margin: 20px 0;">
            <div id="c2" style="margin: 20px 0; height: 1px;"></div>
          </div>
        </div>
      `);

      expect(this.get('#r').getContentArea().height).to.equal(41);
      expect(this.get('#c1').getContentArea().y).to.equal(20);
      expect(this.get('#c2').getContentArea().y).to.equal(20);
    });

    it('collapses through if height is zero', function () {
      this.layout(`
        <div id="r" style="display: flow-root;">
          <div id="c1" style="margin: 20px 0;">
            <div id="c2" style="margin: 20px 0; height: 0;"></div>
          </div>
        </div>
      `);

      expect(this.get('#r').getContentArea().height).to.equal(20);
      expect(this.get('#c1').getContentArea().y).to.equal(20);
      expect(this.get('#c2').getContentArea().y).to.equal(20);
    });

    it('collapse throughs affect the right bc height', function () {
      this.layout(`
        <div id="t1" style="display: flow-root; line-height: 20px;">
          <div id="t2" style="margin: 0 0 20px 0;">
            pre
            <div></div>
          </div>
        </div>
      `);

      expect(this.get('#t1').getContentArea().height).to.equal(40);
      expect(this.get('#t2').getContentArea().height).to.equal(20);
    });

    it('uses right hypothetical margin for divs before the last margin', function () {
      this.layout(`
        <div style="display: flow-root; line-height: 20px;">
          <div id="t1" style="margin: 10px 0;">
            <div>
              text
              <div id="t2"></div>
            </div>
          </div>
        </div>
      `);

      expect(this.get('#t1').getContentArea().y).to.equal(10);
      expect(this.get('#t2').getContentArea().y).to.equal(30);
    });

    it('uses right hypothetical margin for divs deeper than the start margin', function () {
      this.layout(`
        <div style="display: flow-root;">
          <div style="margin: 10px 0;">
            <div id="t1"></div>
            <div id="t2" style="margin: 20px 0;"></div>
          </div>
        </div>
      `);

      expect(this.get('#t1').getContentArea().y).to.equal(10);
      expect(this.get('#t2').getContentArea().y).to.equal(20);
    });

    it('uses right hypothetical margin for a div on a different peak than start margin', function () {
      this.layout(`
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

      expect(this.get('#t').getContentArea().y).to.equal(50);
    });

    it('won\'t collapse margins with clearance with the parent', function () {
      this.layout(`
        <div style="display: flow-root;">
          <div id="t1">
            <div style="width: 20px; height: 20px; float: left;"></div>
            <div style="clear: left; margin: 10px 0;"></div>
          </div>
          <div id="t2" style="border-top: 1px solid;"></div>
        </div>
      `)

      const t1 = this.get('#t1');
      expect(t1.getContentArea().height).to.equal(20);
      const t2 = this.get('#t2');
      expect(t2.getBorderArea().y).to.equal(20);
    });

    it('collapses margins with clearance with following siblings', function () {
      this.layout(`
        <div style="display: flow-root; line-height: 20px;">
          Some text! <div style="width: 100px; height: 100px; float: left;"></div>
          <div style="margin: 20px 0; clear: left;"></div>
          <div id="t" style="margin: 10px 0;"></div>
        </div>
      `);

      const t = this.get('#t');
      expect(t.getContentArea().y).to.equal(100);
    });

    it('collapses margins with clearance with the parent if clearance has no effect', function () {
      this.layout(`
        <div style="display: flow-root;">
          <div style="margin: 20px 0;">
            <div style="clear: left; margin: 20px 0;"></div>
          </div>
        </div>
      `);
    });

    it('doesn\'t collapse margins through an element with overflow: hidden', function () {
      this.layout(`
        <div id="t" style="display: flow-root;">
          <div style="margin: 10px 0; overflow: hidden;">
            <div style="margin: 20px 0;"></div>
          </div>
        </div>
      `);

      const t = this.get('#t');
      expect(t.getContentArea().height).to.equal(40);
    });
  });

  describe('Automatic width, height, and offsets', function () {
    describe('Border, padding, and empty div behavior', function () {
      before(function () {
        this.layout(`
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
        expect(this.get('#p').getBorderArea().width).to.equal(290);
        expect(this.get('#p').getPaddingArea().width).to.equal(290);
        expect(this.get('#p').getContentArea().width).to.equal(280);
        expect(this.get('#p').getBorderArea().height).to.equal(70);
        expect(this.get('#p').getPaddingArea().height).to.equal(70);
        expect(this.get('#p').getContentArea().height).to.equal(50);
        expect(this.get('#p').getBorderArea().y).to.equal(10);
        expect(this.get('#p').getPaddingArea().y).to.equal(10);
        expect(this.get('#p').getContentArea().y).to.equal(20);
        expect(this.get('#p').getBorderArea().x).to.equal(5);
        expect(this.get('#p').getPaddingArea().x).to.equal(5);
        expect(this.get('#p').getContentArea().x).to.equal(10);
      });

      it('lays out box model for #b1 correctly', function () {
        expect(this.get('#b1').getBorderArea().width).to.equal(280);
        expect(this.get('#b1').getPaddingArea().width).to.equal(260);
        expect(this.get('#b1').getContentArea().width).to.equal(260);
        expect(this.get('#b1').getBorderArea().height).to.equal(20);
        expect(this.get('#b1').getPaddingArea().height).to.equal(0);
        expect(this.get('#b1').getContentArea().height).to.equal(0);
        expect(this.get('#b1').getBorderArea().y).to.equal(20);
        expect(this.get('#b1').getPaddingArea().y).to.equal(30);
        expect(this.get('#b1').getContentArea().y).to.equal(30);
        expect(this.get('#b1').getBorderArea().x).to.equal(10);
        expect(this.get('#b1').getPaddingArea().x).to.equal(20);
        expect(this.get('#b1').getContentArea().x).to.equal(20);
      });

      it('lays out box model for #e correctly', function () {
        expect(this.get('#e').getBorderArea().width).to.equal(280);
        expect(this.get('#e').getPaddingArea().width).to.equal(280);
        expect(this.get('#e').getContentArea().width).to.equal(280);
        expect(this.get('#e').getBorderArea().height).to.equal(0);
        expect(this.get('#e').getPaddingArea().height).to.equal(0);
        expect(this.get('#e').getContentArea().height).to.equal(0);
        expect(this.get('#e').getBorderArea().y).to.equal(40);
        expect(this.get('#e').getPaddingArea().y).to.equal(40);
        expect(this.get('#e').getContentArea().y).to.equal(40);
        expect(this.get('#e').getBorderArea().x).to.equal(10);
        expect(this.get('#e').getPaddingArea().x).to.equal(10);
        expect(this.get('#e').getContentArea().x).to.equal(10);
      });

      it('lays out box model for #b2 correctly', function () {
        expect(this.get('#b2').getBorderArea().width).to.equal(280);
        expect(this.get('#b2').getPaddingArea().width).to.equal(260);
        expect(this.get('#b2').getContentArea().width).to.equal(260);
        expect(this.get('#b2').getBorderArea().height).to.equal(30);
        expect(this.get('#b2').getPaddingArea().height).to.equal(10);
        expect(this.get('#b2').getContentArea().height).to.equal(10);
        expect(this.get('#b2').getBorderArea().y).to.equal(40);
        expect(this.get('#b2').getPaddingArea().y).to.equal(50);
        expect(this.get('#b2').getContentArea().y).to.equal(50);
        expect(this.get('#b2').getBorderArea().x).to.equal(10);
        expect(this.get('#b2').getPaddingArea().x).to.equal(20);
        expect(this.get('#b2').getContentArea().x).to.equal(20);
      });

      it('lays out box model for #m correctly', function () {
        expect(this.get('#m').getBorderArea().width).to.equal(240);
        expect(this.get('#m').getPaddingArea().width).to.equal(240);
        expect(this.get('#m').getContentArea().width).to.equal(240);
        expect(this.get('#m').getBorderArea().height).to.equal(0);
        expect(this.get('#m').getPaddingArea().height).to.equal(0);
        expect(this.get('#m').getContentArea().height).to.equal(0);
        expect(this.get('#m').getBorderArea().y).to.equal(60);
        expect(this.get('#m').getPaddingArea().y).to.equal(60);
        expect(this.get('#m').getContentArea().y).to.equal(60);
        expect(this.get('#m').getBorderArea().x).to.equal(30);
        expect(this.get('#m').getPaddingArea().x).to.equal(30);
        expect(this.get('#m').getContentArea().x).to.equal(30);
      });
    });

    it('centers auto margins', function () {
      this.layout('<div style="width: 50px; margin: 0 auto;"></div>');
      expect(this.get('div').getContentArea().x).to.equal(125);
    });

    it('expands left auto margin when the right margin is non-auto', function () {
      this.layout('<div style="width: 50px; margin: 0 50px 0 auto;"></div>');
      expect(this.get('div').getContentArea().x).to.equal(200);
    });

    it('expands right auto margin when the left margin is non-auto', function () {
      this.layout('<div style="width: 50px; margin: 0 auto 0 50px;"></div>');
      expect(this.get('div').getContentArea().x).to.equal(50);
    });

    it('sizes ifc containers and their parents correctly', function () {
      this.layout(`
        <div>
          <div style="line-height: 100px;">hey dont forget to size your parent</div>
        </div>
      `);
      expect(this.get('div').getContentArea().height).to.equal(100);
    });

    it('handles over-constrained values correctly', function () {
      this.layout(`
        <div style="width: 300px;">
          <div id="t" style="width: 200px; margin: 100px;"></div>
        </div>
      `);
      expect(this.get('#t').getContentArea().width).to.equal(200);
      expect(this.get('#t').getContentArea().x).to.equal(100);
    });

    it('right-aligns over-constrained boxes', function () {
      this.layout(`
        <div style="direction: rtl; width: 300px;">
          <div id="t" style="margin: 100px; width: 300px; direction: ltr;"></div>
        </div>
      `);

      expect(this.get('#t').getContentArea().x).to.equal(-100);
    });

    it('treats height: 100% as height: auto in a bfc', function () {
      this.layout(`
        <div style="height: 100px;">
          <div id="t" style="height: 100%;"></div>
        </div>
      `);

      expect(this.get('#t').getContentArea().height).to.equal(100);
    });
  });

  describe('Vertical writing modes', function () {
    it('lays out from right to left', function () {
      this.layout(`
        <div style="margin-top: 20px; height: 10px; writing-mode: vertical-rl;">
          <div id="t" style="width: 10px;"></div>
          <div></div>
        </div>
      `);

      expect(this.get('#t').getContentArea().x).to.equal(290);
      expect(this.get('#t').getContentArea().y).to.equal(20);
    });

    it('lays out from left to right', function () {
      this.layout(`
        <div style="margin-top: 20px; height: 10px; writing-mode: vertical-lr;">
          <div style="width: 10px;"></div>
          <div id="t"></div>
        </div>
      `);

      expect(this.get('#t').getContentArea().x).to.equal(10);
      expect(this.get('#t').getContentArea().y).to.equal(20);
    });

    it('collapses orthogonal margins on the outside', function () {
      this.layout(`
        <div id="t" style="margin: 10px;"></div>
        <div style="height: 10px; writing-mode: vertical-lr; margin: 10px;"></div>
      `);

      expect(this.get('#t').getContentArea().x).to.equal(10);
      expect(this.get('#t').getContentArea().y).to.equal(10);
    });

    it('does not collapse orthogonal margins on the inside', function () {
      this.layout(`
        <div style="height: 100px; writing-mode: vertical-lr; margin: 10px;">
          <div id="t" style="margin: 10px;"></div>
        </div>
      `);

      expect(this.get('#t').getContentArea().x).to.equal(20);
      expect(this.get('#t').getContentArea().y).to.equal(20);
    });

    it('collapses left/right margins', function () {
      this.layout(`
        <div style="height: 100px; writing-mode: vertical-lr;">
          <div id="c1" style="margin: 20px;"></div>
          <div id="c2" style="margin: 20px;"></div>
          <div id="c3" style="border: 1px solid;"></div>
          <div id="c4" style="margin: 20px;"></div>
        </div>
      `);

      expect(this.get('#c1').getContentArea().x).to.equal(20);
      expect(this.get('#c2').getContentArea().x).to.equal(20);
      expect(this.get('#c3').getContentArea().x).to.equal(21);
      expect(this.get('#c4').getContentArea().x).to.equal(42);
    });

    it('vertically centers with auto margins', function () {
      this.layout(`
        <div style="height: 100px; writing-mode: vertical-lr;">
          <div id="t" style="margin: auto 0; height: 10px;"></div>
        </div>
      `);

      expect(this.get('#t').getContentArea().y).to.equal(45);
    });
  });

  describe('Units', function () {
    it('resolves percentage on padding', function () {
      this.layout(`
        <div style="width: 100px;">
          <div id="c1" style="padding-right: 11%;"></div>
          <div id="c2" style="padding-top: 11%;"></div>
          <div id="c3" style="padding: 10%;"></div>
        </div>
      `);

      expect(this.get('#c1').getContentArea().width).to.equal(89);
      expect(this.get('#c2').getBorderArea().height).to.equal(11);
      expect(this.get('#c2').getContentArea().y).to.equal(11);

      expect(this.get('#c3').getContentArea().width).to.equal(80);
      expect(this.get('#c3').getBorderArea().height).to.equal(20);
    });

    it('resolves percentages on margin', function () {
      this.layout(`
        <div style="width: 100px;">
          <div id="c1" style="margin-left: 20%;"></div>
          <div id="c2" style="margin-top: 25%; border-bottom-width: 25px; border-bottom-style: solid;"></div>
          <div id="c3" style="margin: 50%;"></div>
        </div>
      `);

      expect(this.get('#c1').getBorderArea().x).to.equal(20);
      expect(this.get('#c2').getBorderArea().y).to.equal(25);
      expect(this.get('#c3').getBorderArea().x).to.equal(50);
      expect(this.get('#c3').getBorderArea().y).to.equal(100);
    });

    it('resolves em units on width and height', function () {
      this.layout(`<div style="width: 1em; height: 1em;"></div>`);
      expect(this.get('div').getContentArea().height).to.equal(16);
      expect(this.get('div').getContentArea().width).to.equal(16);
    });

    it('resolves em units on borders', function () {
      this.layout(`
        <div style="width: 100px; font-size: 16px;">
          <div id="t" style="border: 1em solid;"></div>
        </div>
      `);
      expect(this.get('#t').getBorderArea().height).to.equal(16 * 2);
      expect(this.get('#t').getContentArea().x).to.equal(16);
      expect(this.get('#t').getContentArea().width).to.equal(100 - 16 * 2);
    });

    it('resolves em units on margins', function () {
      this.layout(`
        <div style="width: 100px; font-size: 16px;">
          <div id="t" style="margin: 1em;"></div>
        </div>
      `);
      expect(this.get('#t').getContentArea().width).to.equal(100 - 16 * 2);
      expect(this.get('#t').getContentArea().x).to.equal(16);
      expect(this.get('#t').getContentArea().y).to.equal(16);
    });
  });

  describe('Floats', function () {
    it('can be the exclusive content', function () {
      this.layout(`
        <div style="width: 100px;"><div style="width: 25px; height: 25px; float: right;"></div></div>
      `);

      /** @type import('../src/layout-flow.ts').BlockContainerOfInlines */
      const ifc = this.get('div');
      const [box] = ifc.root.children;
      expect(box.getBorderArea().x).to.equal(75);
    });

    it('positions negative-margin text around floats', function () {
      this.layout(`
        <div id="t1" style="line-height: 20px; width: 100px;">
          <div id="t2" style="border-top: 1px solid;">
            <div style="width: 51px; height: 25px; float: left;"></div>
            <div style="width: 50px; height: 25px; float: right;"></div>
          </div>
          <div id="t3" style="margin-top: -15px;">The text</div>
        </div>
      `);

      /** @type import('../src/layout-flow.ts').BlockContainer */
      const t1 = this.get('#t1');
      expect(t1.getBorderArea().height).to.equal(26);
      /** @type import('../src/layout-flow.ts').BlockContainer */
      const t2 = this.get('#t2');
      expect(t2.getContentArea().height).to.equal(0);
      /** @type import('../src/layout-flow.ts').BlockContainerOfInlines */
      const ifc = this.get('#t3');
      expect(ifc.lineboxes[0].blockOffset).to.equal(0);
      expect(ifc.lineboxes[0].inlineOffset).to.equal(51);
      expect(ifc.lineboxes[1].blockOffset).to.equal(20);
      expect(ifc.lineboxes[1].inlineOffset).to.equal(51);
    });

    it('sets bfc height for hanging floats', function () {
      this.layout(`
        <div style="font: 16px/20px Arimo; display: flow-root; width: 300px;">
          So many rules, so little time.
          <div style="width: 300px; height: 50px; float: left;"></div>
        </div>
      `);

      /** @type import('../src/layout-flow.ts').BlockContainer */
      const bfc = this.get('div');
      expect(bfc.getContentArea().height).to.equal(70);
    });

    it('sets non-bfc containing block height to zero if it has only floats', function () {
      this.layout(`
        <div style="font: 16px/20px Arimo; display: flow-root; width: 300px;">
          So many rules, so little time.
          <div>
            <div style="width: 300px; height: 50px; float: left;"></div>
          </div>
        </div>
      `);

      /** @type import('../src/layout-flow.ts').BlockContainer */
      const bfc = this.get('div');
      expect(bfc.getContentArea().height).to.equal(70);
      const [, cb] = bfc.children;
      expect(cb.getContentArea().height).to.equal(0);
    });

    it('places floats beneath negative margin under text above them', function () {
      this.layout(`
        <div style="font: 16px/20px Arimo; display: flow-root; width: 500px;">
          This here float below me better go beneath me!
          <div style="margin-top: -20px;">
            <div id="f" style="float: left; width: 10px; height: 10px;"></div>
          </div>
        </div>
      `);

      /** @type import('../src/layout-flow.ts').BlockContainer */
      const f = this.get('#f');
      expect(f.getContentArea().y).to.equal(0);
    });

    it('uses the margin around floats', function () {
      this.layout(`
        <div id="t1" style="font: 16px/20px Arimo; display: flow-root; width: 500px;">
          <div id="t2" style="float: left; width: 10px; height: 10px; margin: 10px;"></div>
          I'm floating!
        </div>
      `);

      /** @type import('../src/layout-flow.ts').BlockContainerOfInlines */
      const ifc = this.get('#t1');
      expect(ifc.lineboxes[0].inlineOffset).to.equal(30);
      /** @type import('../src/layout-flow.ts').BlockContainer */
      const t2 = this.get('#t2');
      expect(t2.getContentArea().x).to.equal(10);
      expect(t2.getContentArea().y).to.equal(10);
    });

    it('clears a float with another float', function () {
      this.layout(`
        <div style="font: 16px/20px Arimo; display: flow-root; width: 500px;">
          <div id="t1" style="float: left; clear: left; width: 10px; height: 10px;"></div>
          <div id="t2" style="float: left; clear: left; width: 10px; height: 10px;"></div>
        </div>
      `);

      /** @type import('../src/layout-flow.ts').BlockContainer */
      const t1 = this.get('#t1');
      /** @type import('../src/layout-flow.ts').BlockContainer */
      const t2 = this.get('#t2');
      expect(t1.getBorderArea().x).to.equal(0);
      expect(t1.getBorderArea().y).to.equal(0);
      expect(t2.getBorderArea().x).to.equal(0);
      expect(t2.getBorderArea().y).to.equal(10);
    });

    it('floats floats with text', function () {
      this.layout(`
        <div style="font: 16px/20px Arimo; display: flow-root; width: 100px;">
          <div id="t" style="float: left; width: 50px;">wow such text</div>
          wow more text that wraps
        </div>
      `);

      /** @type import('../src/layout-flow.ts').BlockContainerOfInlines */
      const ifc = this.get('#t');
      expect(ifc.lineboxes.length).to.equal(3);
    });

    it('moves the first words of the paragraph below floats that crowd them', function () {
      this.layout(`
        <div id="t" style="font: 16px/20px Arimo; display: flow-root; width: 300px;">
          <div style="float: left; width: 300px; height: 300px;"></div>
          beneath, not against!
        </div>
      `);

      /** @type import('../src/layout-flow.ts').BlockContainerOfInlines */
      const ifc = this.get('#t');
      expect(ifc.lineboxes[0].blockOffset).to.equal(300);
    });

    it('uses correct shelf position with 2 starting floats', function () {
      this.layout(`
        <div style="font: 16px/20px Arimo; display: flow-root; width: 300px;">
          <div style="float: left; width: 300px; height: 300px;"></div>
          float don't go
          <div id="t" style="float: left; width: 30px; height: 30px;"></div>
          beneath me
        </div>
      `);

      expect(this.get('#t').getContentArea().y).to.equal(300);
    });

    it('places floats on soft breaks correctly', function () {
      this.layout(`
        <div id="t1" style="font: 16px/20px Arimo; display: flow-root; width: 300px;">
          mefirst!
          <div id="t2" style="float: left; width: 300px; height: 300px;"></div>
        </div>
      `);

      /** @type import('../src/layout-flow.ts').BlockContainerOfInlines */
      const ifc = this.get('#t1');
      expect(ifc.lineboxes.length).to.equal(1);
      expect(ifc.lineboxes[0].blockOffset).to.equal(0);
      expect(this.get('#t2').getContentArea().y).to.equal(20);
    });

    it('places floats at word end correctly', function () {
      this.layout(`
        <div id="t1" style="font: 16px/20px Arimo; display: flow-root; width: 300px;">
          mefirst!<div id="t2" style="float: left; width: 300px; height: 300px;"></div>
        </div>
      `);

      /** @type import('../src/layout-flow.ts').BlockContainerOfInlines */
      const ifc = this.get('#t1');
      expect(ifc.lineboxes.length).to.equal(1);
      expect(ifc.lineboxes[0].blockOffset).to.equal(0);
      expect(this.get('#t2').getContentArea().y).to.equal(20);
    });

    it('places floats after start-of-line collapsible whitespace correctly', function () {
      this.layout(`
        <div id="t1" style="font: 16px/20px Arimo; display: flow-root; width: 300px;">
          <br> <div id="t2" style="float: left; width: 300px; height: 300px;"></div>
        </div>
      `);

      /** @type import('../src/layout-flow.ts').BlockContainerOfInlines */
      const ifc = this.get('#t1');
      expect(ifc.lineboxes.length).to.equal(2);
      expect(ifc.lineboxes[1].blockOffset).to.equal(20);
      expect(this.get('#t2').getContentArea().y).to.equal(20);
    });

    it('places mid-word floats correctly', function () {
      this.layout(`
        <div id="t1" style="font: 16px/20px Arimo; display: flow-root; width: 300px;">
          rightin<div id="t2" style="float: left; width: 300px; height: 300px;"></div>themiddle
        </div>
      `);

      /** @type import('../src/layout-flow.ts').BlockContainerOfInlines */
      const ifc = this.get('#t1');
      expect(ifc.lineboxes.length).to.equal(1);
      expect(ifc.lineboxes[0].blockOffset).to.equal(0);
      expect(this.get('#t2').getContentArea().y).to.equal(20);
    });

    it('places mid-nowrap floats correctly', function () {
      this.layout(`
        <div id="t1" style="font: 16px/20px Arimo; display: flow-root; width: 300px;">
          right <span style="white-space: nowrap;">in the <div id="t2" style="float: left; width: 300px; height: 300px;"></div> middle
        </div>
      `);

      /** @type import('../src/layout-flow.ts').BlockContainerOfInlines */
      const ifc = this.get('#t1');
      expect(ifc.lineboxes.length).to.equal(1);
      expect(ifc.lineboxes[0].inlineOffset).to.equal(0);
      expect(ifc.lineboxes[0].blockOffset).to.equal(0);
      expect(this.get('#t2').getContentArea().x).to.equal(0);
      expect(this.get('#t2').getContentArea().y).to.equal(20);
    });

    it('perfectly fits floats that sum to container width', function () {
      this.layout(`
        <div style="font: 16px/20px Arimo; width: 100px;">
          <div style="width: 50px; height: 20px; float: left;"></div>
          <div id="t" style="width: 50px; height: 20px; float: left;"></div>
        </div>
      `);

      expect(this.get('#t').getContentArea().y).to.equal(0);
    });

    it('drops shelf beneath the line if the float would have fit without the line', function () {
      this.layout(`
        <div style="font: 16px/20px Arimo; display: flow-root; width: 300px;">
          <div style="width: 250px; height: 60px; float: left;"></div>
          word
          <div id="t" style="width: 50px; height: 20px; float: left;"></div>
        </div>
      `);

      /** @type import('../src/layout-flow.ts').BlockContainerOfInlines */
      expect(this.get('#t').getContentArea().y).to.equal(20);
    });

    it('floats space + open span + float + ink the right way', function () {
      this.layout(`
        <div style="font: 16px/20px Arimo; display: flow-root; width: 300px;">
          <span>
            <div id="t" style="width: 300px; height: 300px; float: left;"></div>
          </span>
          Test
        </div>
      `);

      /** @type import('../src/layout-flow.ts').BlockContainerOfInlines */
      expect(this.get('#t').getContentArea().y).to.equal(0);
    });

    it('a float that follows uncollapsible ws at start-of-line should go after', function () {
      this.layout(`
        <div style="font: 16px/20px Arimo; display: flow-root; width: 300px; white-space: pre;"> <div id="t" style="width: 300px; height: 300px; float: left;"></div>xyz</div>
      `);

      /** @type import('../src/layout-flow.ts').BlockContainerOfInlines */
      expect(this.get('#t').getContentArea().y).to.equal(20);
    });

    it('lays out text for nested floats', function () {
      this.layout(`
        <div style="float: left; width: 100px;">
          <div id="t" style="float: left; width: 50px;">Yo</div>
        </div>
      `);

      /** @type import('../src/layout-flow.ts').BlockContainerOfInlines */
      const ifc = this.get('#t');
    });

    it('doesn\'t measure trailing spaces when trying to fit a float', function () {
      this.layout(`
        <div id="t" style="display: flow-root; font: 16px Cousine; width: 144.203125px;">
          xx
          <div style="width: 125px; height: 25px; float: left;"></div>
        </div>
      `);

      /** @type import('../src/layout-flow.ts').BlockContainerOfInlines */
      const block = this.get('#t');
      expect(block.getContentArea().height).to.equal(25);
      expect(block.lineboxes.length).to.equal(1);
    });

    it('doesn\'t shorten lineboxes if float is zero height', function () {
      this.layout(`
        <div id="t" style="display: flow-root; width: 300px;">
          <div style="width: 100px; float: left;"></div>
          Where am I?
        </div>
      `);

      /** @type import('../src/layout-flow.ts').BlockContainerOfInlines */
      const ifc = this.get('#t');
      expect(ifc.lineboxes.length).to.equal(1);
      expect(ifc.lineboxes[0].inlineOffset).to.equal(0);
    });

    it('doesn\'t infinite loop when multiple zero height floats don\'t fit', function () {
      this.layout(`
        <div id="t" style="display: flow-root; width: 300px;">
          Don't break me bro
          <div style="width: 1000px; float: left;"></div>
          <div style="width: 1000px; float: left;"></div>
        </div>
      `);
    });

    it('places zero height floats after normal floats', function () {
      this.layout(`
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

      /** @type import('../src/layout-flow.ts').BlockContainerOfInlines */
      const ifc = this.get('#t');
      expect(ifc.root.children[1].getBorderArea().x).to.equal(0);
      expect(ifc.root.children[2].getBorderArea().x).to.equal(0);
      expect(ifc.root.children[3].getBorderArea().x).to.equal(10);
      expect(ifc.root.children[4].getBorderArea().x).to.equal(10);
      expect(ifc.root.children[5].getBorderArea().x).to.equal(20);
      expect(ifc.root.children[6].getBorderArea().x).to.equal(20);
      expect(ifc.root.children[7].getBorderArea().x).to.equal(30);
    });

    it('sets box to float height when it\'s a bfc and ifc', function () {
      this.layout(`
        <div id="t" style="display: flow-root;">
          <div style="width: 20px; height: 20px; float: left;"></div>
        </div>
      `);

      /** @type import('../src/layout-flow.ts').BlockContainer */
      const t = this.get('#t');
      expect(t.getContentArea().height).to.equal(20);
    });

    it('sets box to max(float, lineboxes) when it\'s a bfc and ifc', function () {
      this.layout(`
        <div id="t" style="display: flow-root; line-height: 20px; width: 0;">
          <div style="width: 20px; height: 20px; float: left;"></div>
          chillin
        </div>
      `);

      /** @type import('../src/layout-flow.ts').BlockContainer */
      const t = this.get('#t');
      expect(t.getContentArea().height).to.equal(40);
    });

    it('places left floats with margin-left correctly', function () {
      this.layout(`
        <div style="width: 300px;">
          <div id="t" style="width: 100px; height: 100px; margin-left: 100px; float: right;"></div>
        </div>
      `);

      /** @type import('../src/layout-flow.ts').BlockContainer */
      const t = this.get('#t');
      expect(t.getContentArea().x).to.equal(200);
    });

    it('ignores leading spacing on words for the very first line when there\'s a float', function () {
      this.layout(`
        <div id="t" style="font: 24px Arimo; width: 64px;">
          <div style="width: 10px; height: 10px; float: right;"></div>dope
        </div>
      `);

      /** @type import('../src/layout-flow.ts').BlockContainerOfInlines */
      const ifc = this.get('#t');
      expect(ifc.lineboxes[0].blockOffset).to.equal(0);
    });

    it('checks for collision with float when a new word increases line height', function () {
      this.layout(`
        <div id="t" style="font: 12px Arimo; width: 100px;">
          <div style="width: 1px; height: 20px; float: right;"></div>
          <div style="width: 50px; height: 20px; float: right; clear: right;"></div>
          <span style="line-height: 20px;">howdy</span>
          <span style="line-height: 40px;">partner</span>
        </div>
      `);

      /** @type import('../src/layout-flow.ts').BlockContainerOfInlines */
      const ifc = this.get('#t');
      expect(ifc.lineboxes).to.have.lengthOf(2);
      expect(ifc.lineboxes[1].blockOffset).to.equal(20);
    });

    it('checks for collision with float when a new word is smaller than the line height', function () {
      this.layout(`
        <div id="t" style="font: 12px Arimo; width: 100px;">
          <div style="width: 1px; height: 20px; float: right;"></div>
          <div style="width: 50px; height: 20px; float: right; clear: right;"></div>
          <span style="line-height: 40px; font-family: Cousine;">howdy</span>
          <span style="line-height: 20px;">partner</span>
        </div>
      `);

      /** @type import('../src/layout-flow.ts').BlockContainerOfInlines */
      const ifc = this.get('#t');
      expect(ifc.lineboxes).to.have.lengthOf(2);
      expect(ifc.lineboxes[1].blockOffset).to.equal(40);
    });

    it('places text correctly when the float is at the end of the line', function () {
      this.layout(`
        <div id="t" style="font: 12px Arimo;">
          1<div style="float: left;">2</div>
        </div>
      `);

      /** @type import('../src/layout-flow.ts').BlockContainerOfInlines */
      const ifc = this.get('#t');
      expect(ifc.lineboxes[0].head.value.x).to.be.approximately(6.674, 0.001);
    });

    it('multiple layout passes don\'t cause issues with box areas', function () {
      // Layout for the outer div requires layout for its contents. Descending
      // to the contents sets the containing block, but sizing the outer div
      // afterwords split the containing block into padding and content. But the
      // inner div's containing block is still linked to the padding area.
      //
      // Once contianing blocks start getting assigned in generate(), this becomes
      // impossible
      this.layout(`
        <div style="float: left; padding: 10px;">
          <div id="t" style="float: right; width: 10px; height: 10px;"></div>
        </div>
      `);

      expect(this.get('#t').getContentArea().x).to.equal(10);
    });

    it('doesn\'t infinite loop in a specific case', function () {
      // The float lazily-creates the FloatContext which can only search the
      // block direction at or after the block offset it's created at. The
      // intrinsics pass had wrong BFC offsets that got passed to the
      // FloatContext causing infinite looping in findLinePosition in this case.
      // (this happened in the min-content phase)
      this.layout(`
        <div style="float: left;">
          First, there was this guy.
          <div style="float: right;">
            His name was
          </div>
          <div>Baxter Fennel</div>
        </div>
      `);
    });

    // §9.5.1
    // some of the rules don't really make sense to test alone - they all work
    // together to create a single concept - but most of them do, and it's a way
    // to be organized.

    it('obeys rule 1', function () {
      this.layout(`
        <div style="width: 100px;">
          <div style="width: 25px; height: 25px; float: left;"></div>
          <div style="width: 25px; height: 25px; float: right;"></div>
          hey!
        </div>
      `);

      /** @type import('../src/layout-flow.ts').BlockContainerOfInlines */
      const ifc = this.get('div');
      const [, left, right] = ifc.root.children;
      expect(left.getBorderArea().x).to.equal(0);
      expect(right.getBorderArea().x).to.equal(75);
      expect(ifc.lineboxes[0].inlineOffset).to.equal(25);
    });

    it('obeys rule 2', function () {
      this.layout(`
        <div style="width: 100px;">
          <div style="width: 25px; height: 25px; float: left;"></div>
          <div style="width: 25px; height: 25px; float: left;"></div>
        </div>
      `);

      /** @type import('../src/layout-flow.ts').BlockContainerOfInlines */
      const ifc = this.get('div');
      const [, left1, left2] = ifc.root.children;
      expect(left1.getBorderArea().x).to.equal(0);
      expect(left2.getBorderArea().x).to.equal(25);
    });

    it('obeys rule 3', function () {
      this.layout(`
        <div style="width: 100px;">
          xx
          <div style="width: 51px; height: 50px; float: left;"></div>
          <div style="width: 50px; height: 50px; float: right;"></div>
        </div>
      `);

      /** @type import('../src/layout-flow.ts').BlockContainerOfInlines */
      const ifc = this.get('div');
      const [, left1, left2] = ifc.root.children;
      expect(left1.getBorderArea().x).to.equal(0);
      expect(left1.getBorderArea().y).to.equal(0);
      expect(left2.getBorderArea().x).to.equal(50);
      expect(left2.getBorderArea().y).to.equal(50);
    });

    it('obeys rule 4', function () {
      this.layout(`
        <div style="width: 100px; line-height: 20px;">
          has space
          <div id="t"><div style="width: 10px; height: 10px; float: left;"></div></div>
        </div>
      `);

      /** @type import('../src/layout-flow.ts').BlockContainerOfInlines */
      const ifc = this.get('#t');
      const [float] = ifc.root.children;
      expect(float.getBorderArea().y).to.equal(20);
    });

    it('obeys rule 5', function () {
      this.layout(`
        <div style="width: 100px; font-size: 0;">
          <div id="f1" style="float: left; width: 10px; height: 10px;"></div>
          <div id="f2" style="float: left; width: 91px; height: 91px;"></div>
          <div id="f3" style="float: left; width: 5px; height: 5px;"></div>
        </div>
      `);

      /** @type import('../src/layout-flow.ts').BlockContainerOfInlines */
      const float1 = this.get('#f1');
      /** @type import('../src/layout-flow.ts').BlockContainerOfInlines */
      const float2 = this.get('#f2');
      /** @type import('../src/layout-flow.ts').BlockContainerOfInlines */
      const float3 = this.get('#f3');

      expect(float1.getBorderArea().x).to.equal(0);
      expect(float1.getBorderArea().y).to.equal(0);
      expect(float2.getBorderArea().x).to.equal(0);
      expect(float2.getBorderArea().y).to.equal(10);
      expect(float3.getBorderArea().x).to.equal(91);
      expect(float3.getBorderArea().y).to.equal(10);
    });

    it('obeys rule 6', function () {
      this.layout(`
        <div style="width: 200px; font: 16px/20px Arimo;">
          <div style="width: 20px; height: 20px; float: left;"></div>
          As the text flows down, potential float positions flow down too.
          <div style="width: 20px; height: 20px; float: right;"></div>
        </div>
      `);

      /** @type import('../src/layout-flow.ts').BlockContainerOfInlines */
      const ifc = this.get('div');
      const [, float1,, float2] = ifc.root.children;
      expect(float1.getBorderArea().x).to.equal(0);
      expect(float1.getBorderArea().y).to.equal(0);
      expect(float2.getBorderArea().x).to.equal(180);
      expect(float2.getBorderArea().y).to.equal(40);
    });

    it('obeys rule 7', function () {
      this.layout(`
        <div style="width: 200px; font: 16px/20px Arimo;">
          Floats have a bad reputation
          <div style="float: left; width: 300px; height: 5px;"></div>
          because they used to be used for higher-level layout!
        </div>
      `);

      /** @type import('../src/layout-flow.ts').BlockContainerOfInlines */
      const ifc = this.get('div');
      const [, float] = ifc.root.children;
      const [lb1, lb2, lb3, lb4] = ifc.lineboxes;
      expect(lb1.blockOffset).to.equal(0);
      expect(lb2.blockOffset).to.equal(20);
      expect(float.getBorderArea().y).to.equal(40);
      expect(lb3.blockOffset).to.equal(45);
      expect(lb4.blockOffset).to.equal(65);
    });

    it('obeys rule 8', function () {
      this.layout(`
        <div style="width: 200px; font: 16px/20px Arimo;">
          Hello there <div style="float: left; width: 5px; height: 5px;"></div>
        </div>
      `);

      /** @type import('../src/layout-flow.ts').BlockContainerOfInlines */
      const ifc = this.get('div');
      const [, float] = ifc.root.children;
      expect(float.getBorderArea().y).to.equal(0);
    });

    it('obeys rule 9', function () {
      this.layout(`
        <div style="width: 200px; font: 16px/20px Arimo;">
          Hello there
          <div style="float: left; width: 5px; height: 5px;"></div>
          <div style="float: left; width: 5px; height: 5px;"></div>
        </div>
      `);

      /** @type import('../src/layout-flow.ts').BlockContainerOfInlines */
      const ifc = this.get('div');
      const [, float1, float2] = ifc.root.children;
      expect(float1.getBorderArea().x).to.equal(0);
      expect(float1.getBorderArea().y).to.equal(0);
      expect(float2.getBorderArea().x).to.equal(5);
      expect(float2.getBorderArea().y).to.equal(0);
    });

    // §9.5.2
    it('obeys rule 10', function () {
      this.layout(`
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

      /** @type import('../src/layout-flow.ts').BlockContainerOfInlines */
      const ifc = this.get('div');
      const [,,, float2,, float3,, float4] = ifc.root.children;
      expect(float2.getBorderArea().x).to.equal(0);
      expect(float2.getBorderArea().y).to.equal(40);
      expect(float3.getBorderArea().x).to.equal(180);
      expect(float3.getBorderArea().y).to.equal(40);
      expect(float4.getBorderArea().x).to.equal(0);
      expect(float4.getBorderArea().y).to.equal(60);
    });

    it('tightly fits around content when there could be float error', function () {
      this.layout(`
        <div style="float: left;">
          <div style="float: left; width: 0.6px; height: 1px;"></div>
          <div style="float: left; width: 4.3px; height: 1px;"></div>
          <div id="t" style="float: left; width: 0.1px; height: 1px;"></div>
        </div>
      `);

      expect(this.get('#t').getBorderArea().y).to.equal(0);
    });

    it('floats two rights correctly', function () {
      this.layout(`
        <div style="width: 100px;">
          <div id="t1" style="float: right; width: 10px; background-color: #321">t1</div>
          <div id="t2" style="float: right; width: 10px; background-color: #123">t2</div>
        </div>
      `);

      expect(this.get('#t1').getBorderArea().x).to.equal(90);
      expect(this.get('#t2').getBorderArea().x).to.equal(80);
    });

    describe('Intrinsics', function () {
      it('lays out text under max-content constraint', function () {
        this.layout(`
          <div style="width: 300px; font: 16px Arimo;">
            <div id="t" style="float: left;">hey kid ima computer</div>
          </div>
        `);
        /** @type import('../src/layout-flow.ts').BlockContainer */
        const block = this.get('#t');
        expect(block.getContentArea().width).to.equal(152);
      });

      it('lays out text under min-content constraint', function () {
        this.layout(`
          <div style="width: 0; font: 16px Arimo;">
            <div id="t" style="float: left;">hey kid ima computer</div>
          </div>
        `);
        /** @type import('../src/layout-flow.ts').BlockContainer */
        const block = this.get('#t');
        expect(block.getContentArea().width).to.equal(67);
      });

      it('lays out text no bigger than containing block', function () {
        this.layout(`
          <div style="width: 100px; font: 16px Arimo;">
            <div id="t" style="float: left;">hey kid ima computer</div>
          </div>
        `);
        /** @type import('../src/layout-flow.ts').BlockContainer */
        const block = this.get('#t');
        expect(block.getContentArea().width).to.equal(100);
      });

      it('lays out nested floats under max-content constraint', function () {
        this.layout(`
          <div style="width: 300px; font: 16px Arimo;">
            <div id="t1" style="float: left;">
              <div id="t2" style="float: left;">hey kid ima computer</div>
            </div>
          </div>
        `);
        /** @type import('../src/layout-flow.ts').BlockContainer */
        const t1 = this.get('#t1');
        /** @type import('../src/layout-flow.ts').BlockContainer */
        const t2 = this.get('#t2');
        expect(t1.getContentArea().width).to.equal(152);
        expect(t2.getContentArea().width).to.equal(152);
      });

      it('lays out nested floats under min-content constraint', function () {
        this.layout(`
          <div style="width: 0; font: 16px Arimo;">
            <div id="t1" style="float: left;">
              <div id="t2" style="float: left;">hey kid ima computer</div>
            </div>
          </div>
        `);
        /** @type import('../src/layout-flow.ts').BlockContainer */
        const t1 = this.get('#t1');
        /** @type import('../src/layout-flow.ts').BlockContainer */
        const t2 = this.get('#t2');
        expect(t1.getContentArea().width).to.equal(67);
        expect(t2.getContentArea().width).to.equal(67);
      });

      it('lays out nested floats no bigger than containing block', function () {
        this.layout(`
          <div style="width: 100px; font: 16px Arimo;">
            <div id="t1" style="float: left;">
              <div id="t2" style="float: left;">hey kid ima computer</div>
            </div>
          </div>
        `);
        /** @type import('../src/layout-flow.ts').BlockContainer */
        const t1 = this.get('#t1');
        /** @type import('../src/layout-flow.ts').BlockContainer */
        const t2 = this.get('#t2');
        expect(t1.getContentArea().width).to.equal(100);
        expect(t2.getContentArea().width).to.equal(100);
      });

      it('chooses the largest word from the float if larger than floats', function () {
        this.layout(`
          <div style="width: 0; font: 16px Arimo;">
            <div id="t" style="float: left;">
              <div style="float: left;">hey</div>
              stop all the downloadin!
            </div>
          </div>
        `);

        /** @type import('../src/layout-flow.ts').BlockContainer */
        const t = this.get('#t');
        expect(t.getContentArea().width).to.equal(85);
      });

      it('chooses the largest nested float if larger than largest word', function () {
        this.layout(`
          <div style="width: 0; font: 16px Arimo;">
            <div id="t" style="float: left;">
              hey stop all
              <div style="float: left;">the</div>
              <div style="float: left;">downloadin!</div>
            </div>
          </div>
        `);

        /** @type import('../src/layout-flow.ts').BlockContainer */
        const t = this.get('#t');
        expect(t.getContentArea().width).to.equal(85);
      });

      it('sets nested float heights correctly under min-content', function () {
        this.layout(`
          <div style="width: 0; font: 16px/20px Arimo;">
            <div style="float: left;">
              <div id="t" style="float: left;">stop downloadin!</div>
            </div>
          </div>
        `);

        /** @type import('../src/layout-flow.ts').BlockContainer */
        const t = this.get('#t');
        expect(t.getContentArea().height).to.equal(40);
      });

      it('sets nested float heights correctly under max-content', function () {
        this.layout(`
          <div style="width: 300px; font: 16px/20px Arimo;">
            <div style="float: left;">
              <div id="t" style="float: left;">stop downloadin!</div>
            </div>
          </div>
        `);

        /** @type import('../src/layout-flow.ts').BlockContainer */
        const t = this.get('#t');
        expect(t.getContentArea().height).to.equal(20);
      });

      it('chooses specified width of nested floats', function () {
        this.layout(`
          <div style="width: 300px; font: 16px/20px Arimo;">
            <div id="t" style="float: left;">
              some text
              <div>
                <div style="float: left; width: 500px;">stop downloadin!</div>
              </div>
            </div>
          </div>
        `);

        /** @type import('../src/layout-flow.ts').BlockContainer */
        const t = this.get('#t');
        expect(t.getContentArea().width).to.equal(500);
      });

      it('chooses specified width of nested block box', function () {
        this.layout(`
          <div style="width: 300px; font: 16px/20px Arimo;">
            <div id="t" style="float: left;">
              some text
              <div>
                <div style="width: 500px;">stop downloadin!</div>
              </div>
            </div>
          </div>
        `);

        /** @type import('../src/layout-flow.ts').BlockContainer */
        const t = this.get('#t');
        expect(t.getContentArea().width).to.equal(500);
      });

      it('considers margin, border, padding part of the intrinsic size', function () {
        this.layout(`
          <div style="width: 200px; font: 16px Arimo;">
            <div id="t" style="float: left; margin: 10px; padding: 20px; border: 20px solid blue;">
              stop all the downloadin!
            </div>
          </div>
        `);

        /** @type import('../src/layout-flow.ts').BlockContainer */
        const t = this.get('#t');
        expect(t.getContentArea().width).to.equal(100);
      });

      it('considers nested nested margin, border, padding part of intrinsic size', function () {
        this.layout(`
          <div style="width: 300px; font: 16px Arimo;">
            <div id="t" style="float: left;">
              <div style="margin: 10px; padding: 20px; border: 20px solid blue;">
                downloadin!
              </div>
            </div>
          </div>
        `);

        /** @type import('../src/layout-flow.ts').BlockContainer */
        const t = this.get('#t');
        expect(t.getContentArea().width).to.equal(185);
      });

      it('considers nested _inline_ margin, border, padding for min-content', function () {
        this.layout(`
          <div id="t" style="float: left;">
            <span style="padding: 2px; margin: 5px; border: 7px solid green;">!</span>
          </div>
        `);

        /** @type import('../src/layout-flow.ts').BlockContainer */
        const t = this.get('#t');
        expect(t.getContentArea().width).to.equal(32);
      });

      it('considers hard-broken lines separately for max-content', function () {
        this.layout(`
          <div style="width: 300px; font: 16px Arimo;">
            <div id="t" style="float: left;">
              topiary garden<br>park
            </div>
          </div>
        `);

        /** @type import('../src/layout-flow.ts').BlockContainer */
        const t = this.get('#t');
        expect(t.getContentArea().width).to.equal(102);
      });

      it('considers inline-blocks separately for min-content', function () {
        this.layout(`
          <div style="width: 0; font: 16px Arimo;">
            <div id="t" style="float: left;">
              <div style="display: inline-block;">topiary garden</div>
              <div style="display: inline-block;">park</div>
            </div>
          </div>
        `);

        /** @type import('../src/layout-flow.ts').BlockContainer */
        const t = this.get('#t');
        expect(t.getContentArea().width).to.equal(50);
      });
    });
  });

  describe('Relative Positioning', function () {
    it('positions block containers, all 7 combinations', function () {
      this.layout(`
        <div style="width: 100px;">
          <div id="t1" style="position: relative; left: 10px;"></div>
          <div id="t2" style="position: relative; right: 10px;"></div>
          <div id="t3" style="position: relative; left: 10px; right: 10px;"></div>
          <div style="direction: rtl;">
            <div id="t4" style="width: 50px; position: relative; left: 10px; right: 10px;"></div>
          </div>
          <div id="t5" style="position: relative; top: 10px;"></div>
          <div id="t6" style="position: relative; bottom: 10px;"></div>
          <div id="t7" style="position: relative; top: 10px; bottom: 10px;"></div>
        </div>
      `);

      expect(this.get('#t1').getContentArea().x).to.equal(10);
      expect(this.get('#t2').getContentArea().x).to.equal(-10);
      expect(this.get('#t3').getContentArea().x).to.equal(10);
      expect(this.get('#t4').getContentArea().x).to.equal(40);
      expect(this.get('#t5').getContentArea().y).to.equal(10);
      expect(this.get('#t6').getContentArea().y).to.equal(-10);
      expect(this.get('#t7').getContentArea().y).to.equal(10);
    });

    it('positions against (final) containing block size', function () {
      this.layout(`
        <div style="width: 200px;">
          <div style="height: 100px;"></div>
          <div id="t1" style="position: relative; left: 50%;"></div>
          <div id="t2" style="position: relative; bottom: 66%;"></div>
        </div>
      `);

      expect(this.get('#t1').getContentArea().x).to.equal(100);
      expect(this.get('#t2').getContentArea().y).to.equal(34);
    });

    it('positions inline text and backgrounds', function () {
      this.layout(`
        <div style="width: 400px;">
          Hemingway
          <span id="t1" style="position: relative; right: 1px; background-color: gray;">sleeps</span>
          <span id="t2" style="position: relative; left: 1px; background-color: gray;">peacefully</span>
          next to
          <span id="t3" style="position: relative; bottom: 1px; background-color: gray;">the</span>
          <span id="t4" style="position: relative; top: 1px; background-color: gray;">keyboard</span>
        </div>
      `);

      /** @type import('../src/layout-flow.ts').BlockContainerOfInlines */
      const ifc = this.get('div');

      expect(ifc.fragments.get(this.get('#t1'))[0].start).to.equal(87.03125);
      expect(ifc.fragments.get(this.get('#t1'))[0].end).to.equal(133.28125);
      expect(ifc.items[1].x).to.equal(87.03125);

      expect(ifc.fragments.get(this.get('#t2'))[0].start).to.equal(139.7265625);
      expect(ifc.fragments.get(this.get('#t2'))[0].end).to.equal(211.7734375);
      expect(ifc.items[3].x).to.equal(139.7265625);

      expect(ifc.fragments.get(this.get('#t3'))[0].blockOffset).to.equal(13.74609375);
      expect(ifc.items[5].y).to.equal(13.74609375);

      expect(ifc.fragments.get(this.get('#t4'))[0].blockOffset).to.equal(15.74609375);
      expect(ifc.items[7].y).to.equal(15.74609375);
    });

    it('positions inline text and backgrounds inside other positioned spans', function () {
      this.layout(`
        <div style="width: 400px;">
          Hemingway
          <span style="position: relative; left: 1px;">
            <span id="t1" style="position: relative; right: 1px; background-color: gray;">sleeps</span>
            <span id="t2" style="position: relative; left: 1px; background-color: gray;">peacefully</span>
          </span>
          next to
          <span style="position: relative; top: 1px;">
            <span id="t3" style="position: relative; bottom: 1px; background-color: gray;">the</span>
            <span id="t4" style="position: relative; top: 1px; background-color: gray;">keyboard</span>
          </span>
        </div>
      `);

      /** @type import('../src/layout-flow.ts').BlockContainerOfInlines */
      const ifc = this.get('div');

      expect(ifc.fragments.get(this.get('#t1'))[0].start).to.equal(88.03125);
      expect(ifc.fragments.get(this.get('#t1'))[0].end).to.equal(134.28125);
      expect(ifc.items[1].x).to.equal(88.03125);

      expect(ifc.fragments.get(this.get('#t2'))[0].start).to.equal(140.7265625);
      expect(ifc.fragments.get(this.get('#t2'))[0].end).to.equal(212.7734375);
      expect(ifc.items[3].x).to.equal(140.7265625);

      expect(ifc.fragments.get(this.get('#t3'))[0].blockOffset).to.equal(14.74609375);
      expect(ifc.items[5].y).to.equal(14.74609375);

      expect(ifc.fragments.get(this.get('#t4'))[0].blockOffset).to.equal(16.74609375);
      expect(ifc.items[8].y).to.equal(16.74609375);
    });

    it('positions floats', function () {
      this.layout(`
        <div style="width: 400px; line-height: 25px;">
          <div id="t" style="float: left; position: relative; left: 2.5%; top: 10%;">
            Hemingway
          </div>
          He likes to eat food<br>
          Cat food<br>
          Human food<br>
          All food
        </div>
      `);

      /** @type import('../src/layout-flow.ts').BlockContainer */
      const float = this.get('#t');
      expect(float.getBorderArea().x).to.equal(10);
      expect(float.getBorderArea().y).to.equal(10);
    });

    it('positions floats inside of positioned spans', function () {
      this.layout(`
        <div style="width: 400px; line-height: 25px;">
          <span style="position: relative; right: 10px; bottom: 10px;">
            <div id="t" style="float: left; position: relative; left: 2.5%; top: 10%;">
              Hemingway
            </div>
          </span>
          He likes to eat food<br>
          Cat food<br>
          Human food<br>
          All food
        </div>
      `);

      /** @type import('../src/layout-flow.ts').BlockContainer */
      const float = this.get('#t');
      expect(float.getBorderArea().x).to.equal(0);
      expect(float.getBorderArea().y).to.equal(0);
    });

    it('positions inline-blocks', function () {
      this.layout(`
        <div style="width: 400px; line-height: 25px;">
          He likes to eat food
          <div id="t" style="display: inline-block; position: relative; left: 2.5%; top: 10px;">
            Cat food<br>
            Human food<br>
            All food
          </div>
        </div>
      `);

      /** @type import('../src/layout-flow.ts').BlockContainer */
      const block = this.get('#t');
      expect(block.getBorderArea().x).to.equal(151);
      expect(block.getBorderArea().y).to.equal(10);
    });

    it('positions inline-blocks inside of positioned spans', function () {
      this.layout(`
        <div style="width: 400px; line-height: 25px;">
          He likes to eat food
          <span style="position: relative; right: 10px; bottom: 10px;">
            <div id="t" style="display: inline-block; position: relative; left: 2.5%; top: 10px;">
              Cat food<br>
              Human food<br>
              All food
            </div>
          </span>
        </div>
      `);

      /** @type import('../src/layout-flow.ts').BlockContainer */
      const block = this.get('#t');
      expect(block.getBorderArea().x).to.equal(141);
      expect(block.getBorderArea().y).to.equal(0);
    });
  });

  describe('Zoom', function () {
    it('multiplies lengths on the box model', function () {
      this.layout(`
        <div id="t" style="float: left; zoom: 2;">
          <div style="border: 2px solid; padding: 3px; margin: 4px; width: 5px; height: 5px;"></div>
        </div>
      `);

      /** @type import('../src/layout-flow.ts').BlockContainer */
      const block = this.get('#t');
      expect(block.getContentArea().width).to.equal(46);
      expect(block.getContentArea().height).to.equal(46);
    });

    it('multiplies font-size and line-height', function () {
      this.layout(`
        <div style="font-size: 10px; zoom: 2;">
          <div id="t1" style="line-height: 1;">sleepy</div>
          <div id="t2" style="line-height: 20px;">ada</div>
        </div>
      `);

      /** @type import('../src/layout-flow.ts').BlockContainer */
      const t1 = this.get('#t1');
      expect(t1.getContentArea().height).to.equal(20);
      /** @type import('../src/layout-flow.ts').BlockContainer */
      const t2 = this.get('#t2');
      expect(t2.getContentArea().height).to.equal(40);
    });

    it('multiplies left and top', function () {
      this.layout(`
        <div style="position: relative; left: 10px; top: 10px; zoom: 250%;"></div>
      `);

      /** @type import('../src/layout-flow.ts').BlockContainer */
      const t = this.get('div');
      expect(t.getContentArea().x).to.equal(25);
      expect(t.getContentArea().y).to.equal(25);
    });

    it('multiplies bottom and right', function () {
      this.layout(`
        <div style="position: relative; right: 10px; bottom: 10px; zoom: 250%;"></div>
      `);

      /** @type import('../src/layout-flow.ts').BlockContainer */
      const t = this.get('div');
      expect(t.getContentArea().x).to.equal(-25);
      expect(t.getContentArea().y).to.equal(-25);
    });

    it('multiplies vertical-align', function () {
      this.layout('<div style="font-size: 0;">1<span style="zoom: 2; vertical-align: 100px;">2');
      expect(this.get('div').getContentArea().height).to.equal(200);
    })

    it('treats 0 as 100%', function () {
      this.layout('<div style="zoom: 0; margin-left: 1px;"></div>');

      /** @type import('../src/layout-flow.ts').BlockContainer */
      const t = this.get('div');
      expect(t.getBorderArea().x).to.equal(1);
    });

    it('zooms natural image size', function () {
      this.layout(`<img src="${adaUrl}" style="zoom: 200%;">`);
      expect(this.get('img').getContentArea().width).to.equal(738);
      expect(this.get('img').getContentArea().height).to.equal(752);
    });
  });

  describe('Images', function () {
    it('sizes to natural dimensions', function () {
      this.layout(`<img src="${adaUrl}">`);
      expect(this.get('img').getContentArea().width).to.equal(369);
      expect(this.get('img').getContentArea().height).to.equal(376);
      this.layout(`<img src="${adaUrl}" style="margin: 10px;">`);
      expect(this.get('img').getContentArea().width).to.equal(369);
      expect(this.get('img').getContentArea().height).to.equal(376);
    });

    it('sizes height based on width', function () {
      this.layout(`<img src="${adaUrl}" style="width: 100px;">`);
      expect(this.get('img').getContentArea().width).to.equal(100);
      expect(this.get('img').getContentArea().height).to.equal(102);
    });

    it('sizes width based on height', function () {
      this.layout(`<img src="${adaUrl}" style="height: 100px;">`);
      expect(this.get('img').getContentArea().width).to.equal(98);
      expect(this.get('img').getContentArea().height).to.equal(100);
    });

    it('correctly positions text after sized images without content', function () {
      this.layout(`
        <div style="width: 200px; font-size: 10px;">
          no
          <img src="nooo" style="height: 25px;">
          <img src="nooo" style="width: 25px;">
          <img style="width: 25px;">
          <img style="height: 25px;">
          oo
        </div>
      `);
      /** @type import('../src/layout-flow.ts').BlockContainerOfInlines */
      const ifc = this.get('div');
      expect(ifc.items[4].x).to.equal(122.236328125);
      expect(ifc.items[4].y).to.equal(25);
    });

    it('correctly positions text after unsized images without content', function () {
      this.layout('<div style="font-size: 10px;">no<img>oo');
      /** @type import('../src/layout-flow.ts').BlockContainerOfInlines */
      const ifc = this.get('div');
      expect(ifc.items[1].x).to.equal(11.123046875);
    });

    it('floats images', function () {
      this.layout(`
        <img src="${adaUrl}" style="float: left; width: 100px; margin: 10px;">
        <span style="line-height: 122px;">dog!</span>
        <br>underdog!
      `);
      /** @type import('../src/layout-flow.ts').BlockContainerOfInlines */
      const ifc = this.get();
      expect(ifc.items[0].x).to.equal(120);
      expect(ifc.items[0].y).to.equal(66.546875);
      expect(ifc.items[1].x).to.equal(0);
    });

    it('displays images inline', function () {
      this.layout(`<img src="${adaUrl}" style="width: 100px; height: 100px; margin: 10px;">dog`);
      /** @type import('../src/layout-flow.ts').BlockContainerOfInlines */
      const ifc = this.get();
      expect(ifc.items[0].x).to.equal(120);
      expect(ifc.items[0].y).to.equal(120);
    });

    it('displays images inline-block', function () {
      this.layout(`
        <img
          src="${adaUrl}"
          style="width: 100px; height: 100px; margin: 10px; display: inline-block;"
        >dog
      `);
      /** @type import('../src/layout-flow.ts').BlockContainerOfInlines */
      const ifc = this.get();
      expect(ifc.items[0].x).to.equal(120);
      expect(ifc.items[0].y).to.equal(120);
    });

    it('applies border, margin, and padding', function () {
      this.layout(`
        <img
          src="${adaUrl}"
          style="width: 100px; height: 100px; padding: 5px; border: 2px solid #123;"
        >
      `);
      /** @type import('../src/layout-flow.ts').ReplacedBox */
      const img = this.get('img');
      expect(img.getPaddingArea().width).to.equal(110);
      expect(img.getPaddingArea().height).to.equal(110);
      expect(img.getBorderArea().width).to.equal(114);
      expect(img.getBorderArea().height).to.equal(114);
    });

    it('displays images as block', function () {
      this.layout(`<div style="width: 1000px;"><img src="${adaUrl}" style="display: block;">`);
      expect(this.get('img').getContentArea().x).to.equal(0);
      expect(this.get('img').getContentArea().y).to.equal(0);
      expect(this.get('img').getContentArea().width).to.equal(369);
      expect(this.get('img').getContentArea().height).to.equal(376);
      this.layout(`<div style="width: 1000px; direction: rtl;"><img src="${adaUrl}" style="display: block;">`);
      expect(this.get('img').getContentArea().x).to.equal(1000 - 369);
      expect(this.get('img').getContentArea().y).to.equal(0);
      expect(this.get('img').getContentArea().width).to.equal(369);
      expect(this.get('img').getContentArea().height).to.equal(376);
    });
  });
});

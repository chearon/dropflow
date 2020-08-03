import {HTMLElement} from './node';
import {parseNodes} from './parser';
import {createComputedStyle, initialStyle} from './cascade';
import {generateBlockContainer} from './flow';
import {Area} from './box';
import {paint} from './paint/html/index';
import {expect} from 'chai';

const rootDeclaredStyle = {
  fontSize: {value: 16, unit: 'px'},
  fontFamily: 'Helvetica',
  fontWeight: '300',
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
};

describe('Flow', function () {
  before(function () {
    this.layout = function (html) {
      this.rootComputedStyle = createComputedStyle(-1, rootDeclaredStyle, initialStyle);
      this.rootElement = new HTMLElement(-1, 'root', this.rootComputedStyle);
      parseNodes(this.rootElement, html);
      this.blockContainer = generateBlockContainer(this.rootElement);
      this.initialContainingBlock = new Area(-1, 0, 0, 300, 500);
      this.blockContainer.assignContainingBlocks({
        lastBlockContainerArea: this.initialContainingBlock,
        lastPositionedArea: this.initialContainingBlock
      });
      this.blockContainer.doBoxSizing(rootDeclaredStyle.writingMode);
      this.blockContainer.setBlockPosition(0, rootDeclaredStyle.writingMode);
      this.blockContainer.doBoxPositioning(rootDeclaredStyle.writingMode);
      this.blockContainer.absolutify();
      this.get = function (...args) {
        let ret = this.blockContainer;
        while (args.length) ret = ret.children[args.shift()];
        return ret;
      };
    };
  });

  describe('Collapsing', function () {
    it('collapses through, sets heights, offsets correctly', function () {
      this.layout(`
        <div style="display: flow-root;">
          <div style="margin: 10px 0;"></div>
          <div style="margin: 10px 0;"></div>
        </div>
      `);

      expect(this.blockContainer.contentArea.height).to.equal(500);
      expect(this.get(0).contentArea.height).to.equal(10);
      expect(this.get(0, 0).contentArea.height).to.equal(0);
      expect(this.get(0, 1).contentArea.height).to.equal(0);

      expect(this.blockContainer.contentArea.y).to.equal(0);
      expect(this.get(0).contentArea.y).to.equal(0);
      expect(this.get(0, 0).contentArea.y).to.equal(10);
      expect(this.get(0, 1).contentArea.y).to.equal(10);
    });

    it('uses smallest margin', function () {
      this.layout(`
        <div style="display: flow-root;">
          <div style="margin: 20px 0;"></div>
          <div style="margin: 10px 0;"></div>
        </div>
      `);

      expect(this.blockContainer.contentArea.height).to.equal(500);
      expect(this.get(0).contentArea.height).to.equal(20);
      expect(this.get(0, 0).contentArea.height).to.equal(0);
      expect(this.get(0, 1).contentArea.height).to.equal(0);

      expect(this.blockContainer.contentArea.y).to.equal(0);
      expect(this.get(0).contentArea.y).to.equal(0);
      expect(this.get(0, 0).contentArea.y).to.equal(20);
      expect(this.get(0, 1).contentArea.y).to.equal(20);
    });

    it('doesn\'t collapse through borders', function () {
      this.layout(`
        <div style="display: flow-root;">
          <div style="margin: 20px 0; border-bottom: 1px solid;"></div>
          <div style="margin: 10px 0;"></div>
        </div>
      `);

      expect(this.get(0).contentArea.height).to.equal(41);
      expect(this.get(0, 0).contentArea.y).to.equal(20);
      expect(this.get(0, 1).contentArea.y).to.equal(41);
    });

    it('doesn\'t collapse through padding', function () {
      this.layout(`
        <div style="display: flow-root;">
          <div style="margin: 20px 0; padding-bottom: 1px;"></div>
          <div style="margin: 10px 0;"></div>
        </div>
      `);

      expect(this.get(0).contentArea.height).to.equal(41);
      expect(this.get(0, 0).contentArea.y).to.equal(20);
      expect(this.get(0, 1).contentArea.y).to.equal(41);
    });

    it('collapses through parents', function () {
      this.layout(`
        <div style="display: flow-root;">
          <div style="margin: 20px 0;">
            <div style="margin: 20px 0;"></div>
          </div>
        </div>
      `);

      expect(this.get(0).contentArea.height).to.equal(20);
      expect(this.get(0, 0).contentArea.y).to.equal(20);
      expect(this.get(0, 0, 0).contentArea.y).to.equal(20);
    });

    it('doesn\'t collapse through if a height is set', function () {
      this.layout(`
        <div style="display: flow-root;">
          <div style="margin: 20px 0;">
            <div style="margin: 20px 0; height: 1px;"></div>
          </div>
        </div>
      `);

      expect(this.get(0).contentArea.height).to.equal(41);
      expect(this.get(0, 0).contentArea.y).to.equal(20);
      expect(this.get(0, 0, 0).contentArea.y).to.equal(20);
    });

    it('collapses through if height is zero', function () {
      this.layout(`
        <div style="display: flow-root;">
          <div style="margin: 20px 0;">
            <div style="margin: 20px 0; height: 0;"></div>
          </div>
        </div>
      `);

      expect(this.get(0).contentArea.height).to.equal(20);
      expect(this.get(0, 0).contentArea.y).to.equal(20);
      expect(this.get(0, 0, 0).contentArea.y).to.equal(20);
    });
  });

  describe('Automatic width and offsets', function () {
    before(function () {
      this.layout(`
        <div style="padding: 10px 5px; margin: 10px 5px;">
          <div style="border: 10px solid;"></div>
          <div></div>
          <div style="border: 10px solid;">
            <div style="margin: 10px;"></div>
          </div>
        </div>
      `);
    });

    it('lays out box model for body > div correctly', function () {
      expect(this.get(0).borderArea.width).to.equal(290);
      expect(this.get(0).paddingArea.width).to.equal(290);
      expect(this.get(0).contentArea.width).to.equal(280);
      expect(this.get(0).borderArea.height).to.equal(70);
      expect(this.get(0).paddingArea.height).to.equal(70);
      expect(this.get(0).contentArea.height).to.equal(50);
      expect(this.get(0).borderArea.y).to.equal(10);
      expect(this.get(0).paddingArea.y).to.equal(10);
      expect(this.get(0).contentArea.y).to.equal(20);
      expect(this.get(0).borderArea.x).to.equal(5);
      expect(this.get(0).paddingArea.x).to.equal(5);
      expect(this.get(0).contentArea.x).to.equal(10);
    });

    it('lays out box model for body > div > div:nth-child(1) correctly', function () {
      expect(this.get(0, 0).borderArea.width).to.equal(280);
      expect(this.get(0, 0).paddingArea.width).to.equal(260);
      expect(this.get(0, 0).contentArea.width).to.equal(260);
      expect(this.get(0, 0).borderArea.height).to.equal(20);
      expect(this.get(0, 0).paddingArea.height).to.equal(0);
      expect(this.get(0, 0).contentArea.height).to.equal(0);
      expect(this.get(0, 0).borderArea.y).to.equal(20);
      expect(this.get(0, 0).paddingArea.y).to.equal(30);
      expect(this.get(0, 0).contentArea.y).to.equal(30);
      expect(this.get(0, 0).borderArea.x).to.equal(10);
      expect(this.get(0, 0).paddingArea.x).to.equal(20);
      expect(this.get(0, 0).contentArea.x).to.equal(20);
    });

    it('lays out box model for body > div > div:nth-child(2) correctly', function () {
      expect(this.get(0, 1).borderArea.width).to.equal(280);
      expect(this.get(0, 1).paddingArea.width).to.equal(280);
      expect(this.get(0, 1).contentArea.width).to.equal(280);
      expect(this.get(0, 1).borderArea.height).to.equal(0);
      expect(this.get(0, 1).paddingArea.height).to.equal(0);
      expect(this.get(0, 1).contentArea.height).to.equal(0);
      expect(this.get(0, 1).borderArea.y).to.equal(40);
      expect(this.get(0, 1).paddingArea.y).to.equal(40);
      expect(this.get(0, 1).contentArea.y).to.equal(40);
      expect(this.get(0, 1).borderArea.x).to.equal(10);
      expect(this.get(0, 1).paddingArea.x).to.equal(10);
      expect(this.get(0, 1).contentArea.x).to.equal(10);
    });

    it('lays out box model for body > div > div:nth-child(3) correctly', function () {
      expect(this.get(0, 2).borderArea.width).to.equal(280);
      expect(this.get(0, 2).paddingArea.width).to.equal(260);
      expect(this.get(0, 2).contentArea.width).to.equal(260);
      expect(this.get(0, 2).borderArea.height).to.equal(30);
      expect(this.get(0, 2).paddingArea.height).to.equal(10);
      expect(this.get(0, 2).contentArea.height).to.equal(10);
      expect(this.get(0, 2).borderArea.y).to.equal(40);
      expect(this.get(0, 2).paddingArea.y).to.equal(50);
      expect(this.get(0, 2).contentArea.y).to.equal(50);
      expect(this.get(0, 2).borderArea.x).to.equal(10);
      expect(this.get(0, 2).paddingArea.x).to.equal(20);
      expect(this.get(0, 2).contentArea.x).to.equal(20);
    });

    it('lays out box model for body > div > div > div', function () {
      expect(this.get(0, 2, 0).borderArea.width).to.equal(240);
      expect(this.get(0, 2, 0).paddingArea.width).to.equal(240);
      expect(this.get(0, 2, 0).contentArea.width).to.equal(240);
      expect(this.get(0, 2, 0).borderArea.height).to.equal(0);
      expect(this.get(0, 2, 0).paddingArea.height).to.equal(0);
      expect(this.get(0, 2, 0).contentArea.height).to.equal(0);
      expect(this.get(0, 2, 0).borderArea.y).to.equal(60);
      expect(this.get(0, 2, 0).paddingArea.y).to.equal(60);
      expect(this.get(0, 2, 0).contentArea.y).to.equal(60);
      expect(this.get(0, 2, 0).borderArea.x).to.equal(30);
      expect(this.get(0, 2, 0).paddingArea.x).to.equal(30);
      expect(this.get(0, 2, 0).contentArea.x).to.equal(30);
    });
  });

  describe('Vertical writing modes', function () {
    it('lays out from right to left', function () {
      this.layout(`
        <div style="margin-top: 20px; height: 10px; writing-mode: vertical-rl;">
          <div style="width: 10px;"></div>
          <div></div>
        </div>
      `);

      expect(this.get(0, 1).contentArea.x).to.equal(290);
      expect(this.get(0, 1).contentArea.y).to.equal(20);
    });

    it('lays out from left to right', function () {
      this.layout(`
        <div style="margin-top: 20px; height: 10px; writing-mode: vertical-lr;">
          <div style="width: 10px;"></div>
          <div></div>
        </div>
      `);

      expect(this.get(0, 1).contentArea.x).to.equal(10);
      expect(this.get(0, 1).contentArea.y).to.equal(20);
    });

    it('collapses orthogonal margins on the outside', function () {
      this.layout(`
        <div style="margin: 10px;"></div>
        <div style="height: 10px; writing-mode: vertical-lr; margin: 10px;"></div>
      `);

      expect(this.get(1).contentArea.x).to.equal(10);
      expect(this.get(1).contentArea.y).to.equal(10);
    });

    it('does not collapse orthogonal margins on the inside', function () {
      this.layout(`
        <div style="height: 100px; writing-mode: vertical-lr; margin: 10px;">
          <div style="margin: 10px;"></div>
        </div>
      `);

      expect(this.get(0, 0).contentArea.x).to.equal(20);
      expect(this.get(0, 0).contentArea.y).to.equal(20);
    });

    it('collapses left/right margins', function () {
      this.layout(`
        <div style="height: 100px; writing-mode: vertical-lr;">
          <div style="margin: 20px;"></div>
          <div style="margin: 20px;"></div>
          <div style="border: 1px solid;"></div>
          <div style="margin: 20px;"></div>
        </div>
      `);

      expect(this.get(0, 0).contentArea.x).to.equal(20);
      expect(this.get(0, 1).contentArea.x).to.equal(20);
      expect(this.get(0, 2).contentArea.x).to.equal(21);
      expect(this.get(0, 3).contentArea.x).to.equal(42);
    });

    it('vertically centers with auto margins', function () {
      this.layout(`
        <div style="height: 100px; writing-mode: vertical-lr;">
          <div style="margin: auto 0; height: 10px;"></div>
        </div>
      `);

      expect(this.get(0, 0).contentArea.y).to.equal(45);
    });
  });
});

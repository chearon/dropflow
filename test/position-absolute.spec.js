import '#register-default-environment';
import {expect} from 'chai';
import * as flow from 'dropflow';
import parse from 'dropflow/parse.js';
import {registerFontAsset, unregisterFontAsset} from '../assets/register.ts';
import PaintSpy from './paint-spy.js';
import paint from '../src/paint.ts';

const adaUrl = new URL(import.meta.resolve('#assets/images/ada.png'));

describe('Absolute positioning', function () {
  before(function () {
    registerFontAsset('Arimo/Arimo-Regular.ttf');
    this.reflow = function (html, width = 300, height = 500) {
      this.rootElement = parse(html);
      flow.loadSync(this.rootElement);
      this.layout = flow.layout(this.rootElement);
      flow.reflow(this.layout, width, height);
      this.get = selector => this.rootElement.query(selector)?.boxes[0];
      this.border = selector => {
        const box = this.get(selector);
        if (!box) throw new Error(`no box for ${selector}`);
        const area = box.getBorderArea();
        return {x: area.x, y: area.y, width: area.width, height: area.height};
      };
    };
  });

  after(function () {
    unregisterFontAsset('Arimo/Arimo-Regular.ttf');
  });

  it('places the border box against the containing block padding box', function () {
    this.reflow(`
      <div style="font: 16px/20px Arimo; width: 200px; height: 150px; position: relative;
                  padding: 10px; border: 3px solid #000;">
        <div id="t" style="position: absolute; top: 5px; left: 7px; width: 40px; height: 30px;"></div>
      </div>
    `);
    // The containing block is the parent's padding box, which starts inside the
    // 3px border
    expect(this.border('#t')).to.deep.equal({x: 10, y: 8, width: 40, height: 30});
  });

  it('uses the nearest positioned ancestor, not the parent', function () {
    this.reflow(`
      <div style="font: 16px/20px Arimo; width: 200px; height: 150px; position: relative;">
        <div style="height: 20px;"></div>
        <div style="padding: 7px; margin-left: 9px;">
          <div id="t" style="position: absolute; top: 3px; left: 4px; width: 10px; height: 10px;"></div>
        </div>
      </div>
    `);
    // The insets are measured from the positioned ancestor, so neither the
    // margin nor the padding of the boxes in between moves the box
    expect(this.border('#t')).to.deep.equal({x: 4, y: 3, width: 10, height: 10});
  });

  it('falls back to the initial containing block', function () {
    this.reflow(`
      <div style="font: 16px/20px Arimo; width: 200px;">
        <div style="height: 30px;"></div>
        <div id="t" style="position: absolute; top: 0; right: 0; width: 10px; height: 10px;"></div>
      </div>
    `, 300, 500);
    // No positioned ancestor: the 300x500 initial containing block is used, so
    // the box is at its line-right edge, not the 200px wide parent's
    expect(this.border('#t')).to.deep.equal({x: 290, y: 0, width: 10, height: 10});
  });

  it('takes the box out of flow', function () {
    this.reflow(`
      <div style="font: 16px/20px Arimo; width: 200px;">
        <div id="p" style="position: relative;">
          <div id="t" style="position: absolute; top: 0; left: 0; width: 10px; height: 100px;"></div>
        </div>
        <div id="after" style="height: 7px;"></div>
      </div>
    `);
    // The parent has no in-flow content, so it has no block size, and the
    // sibling after it is not pushed down by the positioned box
    expect(this.border('#p').height).to.equal(0);
    expect(this.border('#after').y).to.equal(0);
  });

  it('does not add the box to the line it appears in', function () {
    this.reflow(`
      <div id="p" style="font: 16px/20px Arimo; width: 60px; position: relative;">aaa<div
        id="t" style="position: absolute; width: 40px; height: 40px;"></div></div>
    `);
    // One line of text: the positioned box neither widens the line nor makes the
    // paragraph as tall as itself
    expect(this.border('#p').height).to.equal(20);
  });

  it('sizes the box from a pair of insets', function () {
    this.reflow(`
      <div style="font: 16px/20px Arimo; width: 300px; height: 200px; position: relative;">
        <div id="t" style="position: absolute; top: 10px; bottom: 20px; left: 10px; right: 30px;"></div>
      </div>
    `);
    expect(this.border('#t')).to.deep.equal({x: 10, y: 10, width: 260, height: 170});
  });

  it('subtracts border and padding from a size taken from insets', function () {
    this.reflow(`
      <div style="font: 16px/20px Arimo; width: 300px; height: 200px; position: relative;">
        <div id="t" style="position: absolute; top: 0; bottom: 0; left: 0; right: 100px;
                           padding: 5px 8px; border: 2px solid #000;"></div>
      </div>
    `);
    // The insets are measured to the margin edge, so the border box fills them
    // and the padding and border are inside it
    const t = this.get('#t');
    expect(this.border('#t')).to.deep.equal({x: 0, y: 0, width: 200, height: 200});
    expect(t.getContentArea().width).to.equal(200 - 2 * 8 - 2 * 2);
    expect(t.getContentArea().height).to.equal(200 - 2 * 5 - 2 * 2);
  });

  it('shrink-to-fits an auto inline size', function () {
    this.reflow(`
      <div style="font: 16px/20px Arimo; width: 300px; height: 200px; position: relative;">
        <div id="wide" style="position: absolute; top: 0; left: 0;">aaa bbb ccc</div>
        <div id="narrow" style="position: absolute; top: 0; left: 265px;">aaa bbb ccc</div>
      </div>
    `);
    // The first box may use the whole 300px and keeps its text on one line; the
    // second only has 35px left, so each word gets its own line
    expect(this.border('#wide').height).to.equal(20);
    expect(this.border('#narrow').height).to.equal(60);
    expect(this.border('#narrow').width).to.be.at.most(35);
  });

  it('centers with auto margins on both axes', function () {
    this.reflow(`
      <div style="font: 16px/20px Arimo; width: 300px; height: 200px; position: relative;">
        <div id="t" style="position: absolute; top: 0; bottom: 0; left: 0; right: 0;
                           width: 100px; height: 50px; margin: auto;"></div>
      </div>
    `);
    expect(this.border('#t')).to.deep.equal({x: 100, y: 75, width: 100, height: 50});
  });

  it('solves for a single auto margin', function () {
    this.reflow(`
      <div style="font: 16px/20px Arimo; width: 200px; height: 100px; position: relative;
                  padding: 0 20px;">
        <div style="height: 9px;"></div>
        <div id="t" style="position: absolute; left: 0; right: 0; width: 50px; height: 10px;
                           margin-left: auto; margin-right: 20px; top: 0;"></div>
      </div>
    `);
    // The containing block is the 240px padding box, so margin-left takes
    // 240 - 50 - 20, measured from the padding box edge
    expect(this.border('#t').x).to.equal(170);
    expect(this.border('#t').y).to.equal(0);
  });

  it('ignores the line-right inset when over-constrained in ltr', function () {
    this.reflow(`
      <div style="font: 16px/20px Arimo; width: 200px; height: 100px; position: relative;">
        <div id="t" style="position: absolute; top: 0; left: 10px; right: 10px;
                           width: 50px; height: 10px;"></div>
      </div>
    `);
    expect(this.border('#t').x).to.equal(10);
  });

  it('ignores the line-left inset when over-constrained in rtl', function () {
    this.reflow(`
      <div style="font: 16px/20px Arimo; width: 200px; height: 100px; position: relative;
                  direction: rtl;">
        <div id="t" style="position: absolute; top: 0; left: 10px; right: 10px;
                           width: 50px; height: 10px;"></div>
      </div>
    `);
    expect(this.border('#t').x).to.equal(140);
  });

  it('ignores the block-end inset when over-constrained', function () {
    this.reflow(`
      <div style="font: 16px/20px Arimo; width: 200px; height: 100px; position: relative;">
        <div id="t" style="position: absolute; left: 0; top: 10px; bottom: 10px;
                           width: 10px; height: 20px;"></div>
      </div>
    `);
    expect(this.border('#t').y).to.equal(10);
  });

  it('resolves inset percentages against the containing block padding box', function () {
    this.reflow(`
      <div style="font: 16px/20px Arimo; width: 200px; height: 100px; position: relative;
                  padding: 10px;">
        <div id="t" style="position: absolute; top: 50%; left: 25%; width: 10px; height: 10px;"></div>
      </div>
    `);
    // The padding box is 220x120, so 25% is 55 and 50% is 60, both measured from
    // the padding box origin
    expect(this.border('#t')).to.deep.equal({x: 55, y: 60, width: 10, height: 10});
  });

  it('resolves size percentages against the containing block padding box', function () {
    this.reflow(`
      <div style="font: 16px/20px Arimo; width: 200px; height: 100px; position: relative;
                  padding: 10px;">
        <div style="height: 13px;"></div>
        <div id="t" style="position: absolute; top: 0; left: 0; width: 50%; height: 25%;"></div>
      </div>
    `);
    // The padding box is 220x120, so the box is 110x30 at its origin, above the
    // in-flow box that comes before it
    expect(this.border('#t')).to.deep.equal({x: 0, y: 0, width: 110, height: 30});
  });

  it('leaves the box at its static position after in-flow siblings', function () {
    this.reflow(`
      <div style="font: 16px/20px Arimo; width: 200px; position: relative;">
        <div style="height: 30px;"></div>
        <div style="height: 12px;"></div>
        <div id="t" style="position: absolute; width: 10px; height: 10px;"></div>
      </div>
    `);
    expect(this.border('#t')).to.deep.equal({x: 0, y: 42, width: 10, height: 10});
    // and the parent stops at the in-flow content
    expect(this.border('div').height).to.equal(42);
  });

  it('offsets the static position by the margins', function () {
    this.reflow(`
      <div style="font: 16px/20px Arimo; width: 200px; position: relative;">
        <div style="height: 15px;"></div>
        <div id="t" style="position: absolute; margin: 4px 6px; width: 20px; height: 20px;"></div>
      </div>
    `);
    expect(this.border('#t')).to.deep.equal({x: 6, y: 19, width: 20, height: 20});
    expect(this.border('div').height).to.equal(15);
  });

  it('uses the static position of the line the box appears on', function () {
    this.reflow(`
      <div style="font: 16px/20px Arimo; width: 30px; position: relative;">aaa bbb ccc<div
        id="t" style="position: absolute; width: 5px; height: 5px;"></div></div>
    `);
    // Each word gets its own 20px line in 30px and the box comes after all of
    // them, so it starts on the third line
    expect(this.border('#t').y).to.equal(40);
  });

  it('uses the position on the line, not the start of it', function () {
    this.reflow(`
      <div style="font: 16px/20px Arimo; width: 300px; position: relative;">hello <span
        id="t" style="position: absolute;">__</span><span id="ref"
        style="display: inline-block; width: 0; height: 0;"></span>is there anybody out there?</div>
    `);
    // The zero-width inline-block is in flow at the same point on the line
    expect(this.border('#t').x).to.equal(this.border('#ref').x);
    expect(this.border('#t').x).to.be.greaterThan(30);
  });

  it('follows text-align on the line it appears on', function () {
    this.reflow(`
      <div style="font: 16px/20px Arimo; width: 300px; position: relative; text-align: center;">aaa<span
        id="t" style="position: absolute;">_</span><span id="ref"
        style="display: inline-block; width: 0; height: 0;"></span></div>
    `);
    expect(this.border('#t').x).to.equal(this.border('#ref').x);
    expect(this.border('#t').x).to.be.greaterThan(150);
  });

  it('moves to the line the box ends up on after a soft wrap', function () {
    this.reflow(`
      <div style="font: 16px/20px Arimo; width: 60px; position: relative;">aaa bbb <span
        id="t" style="position: absolute; width: 5px; height: 5px;"></span>ccc</div>
    `);
    // "ccc" does not fit on the first line, and the box goes with it
    expect(this.border('#t').y).to.equal(20);
  });

  it('takes the static position from the line-right edge in rtl', function () {
    this.reflow(`
      <div style="font: 16px/20px Arimo; width: 200px; position: relative; direction: rtl;">
        <div style="height: 20px;"></div>
        <div id="t" style="position: absolute; width: 30px; height: 10px;"></div>
      </div>
    `);
    expect(this.border('#t')).to.deep.equal({x: 170, y: 20, width: 30, height: 10});
    expect(this.border('div').height).to.equal(20);
  });

  it('maps insets through a vertical-lr containing block', function () {
    this.reflow(`
      <div style="font: 16px/20px Arimo; writing-mode: vertical-lr; width: 200px; height: 150px;
                  position: relative;">
        <div id="t" style="position: absolute; left: 12px; top: 9px; width: 20px; height: 30px;"></div>
      </div>
    `);
    // The block axis runs left to right, so `left` is the block-start inset and
    // `top` is the line-left one
    expect(this.border('#t').x).to.equal(12);
    expect(this.border('#t').y).to.equal(9);
  });

  it('maps insets through a vertical-rl containing block', function () {
    this.reflow(`
      <div style="font: 16px/20px Arimo; writing-mode: vertical-rl; width: 200px; height: 150px;
                  position: relative;">
        <div id="t" style="position: absolute; right: 12px; top: 9px; width: 20px; height: 30px;"></div>
      </div>
    `);
    // The block axis runs right to left, so `right` is the block-start inset
    expect(this.border('#t').x).to.equal(200 - 12 - 20);
    expect(this.border('#t').y).to.equal(9);
  });

  it('maps the static position through a vertical-rl containing block', function () {
    this.reflow(`
      <div style="font: 16px/20px Arimo; writing-mode: vertical-rl; width: 200px; height: 150px;
                  position: relative;">
        <div style="width: 25px;"></div>
        <div id="t" style="position: absolute; top: 6px; width: 20px; height: 30px;"></div>
      </div>
    `);
    // `top` is the line-left inset here, and the block axis still comes from the
    // position the box would have had
    expect(this.border('#t').x).to.equal(200 - 25 - 20);
    expect(this.border('#t').y).to.equal(6);
  });

  it('maps a fully auto static position through a vertical-rl containing block', function () {
    this.reflow(`
      <div style="font: 16px/20px Arimo; writing-mode: vertical-rl; width: 200px; height: 150px;
                  position: relative;">
        <div style="width: 30px;">a</div>
        <div id="t" style="position: absolute; width: 10px; height: 10px;"></div>
      </div>
    `);
    // Both insets are auto on both axes, so the containing block's own
    // writing mode is what maps the offset, not the one it participates in
    expect(this.border('#t').x).to.equal(200 - 30 - 10);
    expect(this.border('#t').y).to.equal(0);
  });

  it('uses the intrinsic size of a positioned replaced box', function () {
    this.reflow(`
      <div style="font: 16px/20px Arimo; width: 300px; height: 200px; position: relative;">
        <img id="t" style="position: absolute; top: 5px; left: 5px;" src="${adaUrl}">
      </div>
    `);
    const t = this.border('#t');
    expect(t.x).to.equal(5);
    expect(t.y).to.equal(5);
    expect(t.width).to.be.greaterThan(0);
    expect(t.height).to.be.greaterThan(0);
  });

  it('sizes a positioned replaced box from its style', function () {
    this.reflow(`
      <div style="font: 16px/20px Arimo; width: 300px; height: 200px; position: relative;">
        <div style="height: 11px;"></div>
        <img id="t" style="position: absolute; top: 7px; left: 3px; width: 40px; height: 20px;" src="${adaUrl}">
      </div>
    `);
    expect(this.border('#t')).to.deep.equal({x: 3, y: 7, width: 40, height: 20});
  });

  it('establishes a formatting context that contains its floats', function () {
    this.reflow(`
      <div style="font: 16px/20px Arimo; width: 300px; height: 200px; position: relative;">
        <div id="t" style="position: absolute; top: 0; left: 0; width: 100px;">
          <div style="float: left; width: 30px; height: 40px;"></div>
        </div>
      </div>
    `);
    expect(this.border('#t').height).to.equal(40);
  });

  it('blockifies an inline that is positioned', function () {
    this.reflow(`
      <div id="p" style="font: 16px/20px Arimo; width: 200px; position: relative;">
        <span id="t" style="position: absolute; top: 0; left: 0; width: 40px; height: 40px;">aaa</span>
      </div>
    `);
    // The span generates a block box, so it is not on a line and the paragraph
    // has no line boxes at all
    expect(this.border('#t')).to.deep.equal({x: 0, y: 0, width: 40, height: 40});
    expect(this.border('#p').height).to.equal(0);
  });

  it('paints a positioned box above in-flow content', function () {
    this.reflow(`
      <div style="font: 16px/20px Arimo; width: 100px; height: 60px; position: relative;">
        <div id="t" style="position: absolute; top: 0; left: 0; width: 30px; height: 30px;
                           background-color: #00f;"></div>
        <div style="height: 20px; background-color: #f00;"></div>
      </div>
    `);
    const spy = new PaintSpy();
    paint(this.layout, spy);
    const rects = spy.getCalls().filter(call => call.t === 'rect');
    const red = rects.findIndex(call => call.fillColor === '#f00');
    const blue = rects.findIndex(call => call.fillColor === '#00f');
    // The in-flow box is not pushed down by the positioned one
    expect(rects[red].y).to.equal(0);
    // Document order puts the positioned box first, but it paints last because
    // it is in a later layer
    expect(red).to.be.greaterThan(-1);
    expect(blue).to.be.greaterThan(red);
  });
});

//@ts-check
import {expect} from 'chai';
import * as flow from '../src/api-with-parse.js';
import {registerFontAsset, unregisterFontAsset} from '../assets/register.js';
import paintBlockContainer from '../src/paint.js';
import PaintSpy from './paint-spy.js';

function setupLayoutTests() {
  this.layout = function (html) {
    const rootElement = flow.parse(html);
    this.blockContainer = flow.generate(rootElement);
    flow.layout(this.blockContainer);
  };

  this.paint = function () {
    const b = new PaintSpy();
    paintBlockContainer(this.blockContainer, b, true);
    return b;
  };
}

describe('Painting', function () {
  before(setupLayoutTests);

  before(function () {
    registerFontAsset('Ahem/Ahem.ttf');
  });

  after(function () {
    unregisterFontAsset('Ahem/Ahem.ttf');
  });

  afterEach(function () {
    if (this.currentTest.state == 'failed') {
      let indent = 0, t = this.currentTest;
      while (t = t.parent) indent += 1;
      console.log('  '.repeat(indent) + 'Box tree:');
      console.log(this.currentTest.ctx.blockContainer.repr(indent));
    }
  });

  it('paints changing colors separately', function () {
    this.layout(`
      <div style="font-size: 10px;">
        <span style="color: #f00;">r</span><!-- whitespace control
        --><span style="color: #0f0;">g</span><!--
        --><span style="color: #00f;">b</span>
      </div>
    `);

    expect(this.paint().getCalls()).to.deep.equal([
      {t: 'text', x: 0, y: 8, text: 'r', fillColor: '#f00'},
      {t: 'text', x: 10, y: 8, text: 'g', fillColor: '#0f0'},
      {t: 'text', x: 20, y: 8, text: 'b', fillColor: '#00f'}
    ]);
  });

  it('paints block backgrounds and borders', function () {
    this.layout(`
      <div style="width: 10px; height: 10px; border: 1px solid #f00; background-color: #0f0;">
      </div>
    `);

    expect(this.paint().getCalls()).to.deep.equal([
      {t: 'rect', x: 0, y: 0, width: 12, height: 12, fillColor: '#0f0'},
      {t: 'edge', x: 0, y: 0.5, length: 12, side: 'top', strokeColor: '#f00', lineWidth: 1},
      {t: 'edge', x: 11.5, y: 0, length: 12, side: 'right', strokeColor: '#f00', lineWidth: 1},
      {t: 'edge', x: 0, y: 11.5, length: 12, side: 'bottom', strokeColor: '#f00', lineWidth: 1},
      {t: 'edge', x: 0.5, y: 0, length: 12, side: 'left', strokeColor: '#f00', lineWidth: 1}
    ]);
  });

  it('paints inline backgrounds and borders', function () {
    this.layout(`
      <div style="font-size: 10px;">
        upper
        <span style="background-color: #0f0; border-right: 1px solid #f00">cup</span>
      </div>
    `);

    expect(this.paint().getCalls()).to.deep.equal([
      {t: 'rect', x: 60, y: 0, width: 31, height: 10, fillColor: '#0f0'},
      {t: 'edge', x: 90.5, y: 0, length: 10, side: 'right', strokeColor: '#f00', lineWidth: 1},
      {t: 'text', x: 0, y: 8, text: 'upper cup', fillColor: '#000'},
    ]);
  });

  it('paints backgrounds and borders before text', function () {
    this.layout(`
      <div style="font-size: 10px; width: 100px;">
        <div style="background-color: #f00; border-top: 1px solid #00f;">one</div>
        <div style="background-color: #0f0;">two</div>
      </div>
    `);

    expect(this.paint().getCalls()).to.deep.equal([
      {t: 'rect', x: 0, y: 0, width: 100, height: 11, fillColor: '#f00'},
      {t: 'edge', x: 0, y: 0.5, length: 100, side: 'top', strokeColor: '#00f', lineWidth: 1},
      {t: 'rect', x: 0, y: 11, width: 100, height: 10, fillColor: '#0f0'},
      {t: 'text', x: 0, y: 9, text: 'one', fillColor: '#000'},
      {t: 'text', x: 0, y: 19, text: 'two', fillColor: '#000'}
    ]);
  });

  it('paints floats as a group after in-flow content', function () {
    this.layout(`
      <div style="font-size: 10px; width: 100px; background-color: #f00;">
        day
        <div style="float: left; background-color: #0f0;">
          rainy
        </div>
      </div>
    `);

    expect(this.paint().getCalls()).to.deep.equal([
      {t: 'rect', x: 0, y: 0, width: 100, height: 10, fillColor: '#f00'},
      {t: 'rect', x: 0, y: 0, width: 50, height: 10, fillColor: '#0f0'},
      {t: 'text', x: 0, y: 8, text: 'rainy', fillColor: '#000'},
      {t: 'text', x: 50, y: 8, text: 'day', fillColor: '#000'},
    ]);
  });

  it('paints positioned block containers as a group after in-flow content', function () {
    this.layout(`
      <div style="font-size: 10px; width: 100px;">
        <div style="position: relative; background-color: #f00">relative1</div>
        <div style="font-size: 10px; background-color: #0f0;">flow</div>
        <div>
          <div style="position: relative; background-color: #00f">relative2</div>
        </div>
      </div>
    `);

    expect(this.paint().getCalls()).to.deep.equal([
      {t: 'rect', x: 0, y: 10, width: 100, height: 10, fillColor: '#0f0'},
      {t: 'text', x: 0, y: 18, text: 'flow', fillColor: '#000'},
      {t: 'rect', x: 0, y: 0, width: 100, height: 10, fillColor: '#f00'},
      {t: 'text', x: 0, y: 8, text: 'relative1', fillColor: '#000'},
      {t: 'rect', x: 0, y: 20, width: 100, height: 10, fillColor: '#00f'},
      {t: 'text', x: 0, y: 28, text: 'relative2', fillColor: '#000'},
    ]);
  });

  it('paints positioned inlines after in-flow content', function () {
    this.layout(`
      <div style="font-size: 10px; width: 200px;">
        <span style="background-color: #f00;">flow</span>
        <span style="position: relative; background-color: #0f0;">drop</span>!
      </div>
    `);

    expect(this.paint().getCalls()).to.deep.equal([
      {t: 'rect', x: 0, y: 0, width: 40, height: 10, fillColor: '#f00'},
      {t: 'text', x: 0, y: 8, text: 'flow ', fillColor: '#000'},
      {t: 'text', x: 90, y: 8, text: '!', fillColor: '#000'},
      {t: 'rect', x: 50, y: 0, width: 40, height: 10, fillColor: '#0f0'},
      {t: 'text', x: 50, y: 8, text: 'drop', fillColor: '#000'},
    ]);
  });

  it('paints positioned floats higher than text', function () {
    this.layout(`
      <div style="font-size: 10px; width: 200px;">
        <div style="float: left; position: relative;">the</div>
        bottle shop
      </div>
    `);

    expect(this.paint().getCalls()).to.deep.equal([
      {t: 'text', x: 30, y: 8, text: 'bottle shop', fillColor: '#000'},
      {t: 'text', x: 0, y: 8, text: 'the', fillColor: '#000'}
    ]);
  });

  it('paints positioned children in their own independent layer', function () {
    this.layout(`
      <div style="position: relative; background-color: #001; width: 10px; height: 10px;">
        <div style="background-color: #002; width: 10px; height: 10px;"></div>
        <div style="position: relative; background-color: #003; width: 10px; height: 10px;"></div>
      </div>
      <div style="background-color: #004; width: 10px; height: 10px;"></div>
    `);

    // right: 4, 1, 2, 3 // wrong: 1, 2, 3, 4
    expect(this.paint().getCalls()).to.deep.equal([
      {t: 'rect', x: 0, y: 10, width: 10, height: 10, fillColor: '#004'},
      {t: 'rect', x: 0, y: 0, width: 10, height: 10, fillColor: '#001'},
      {t: 'rect', x: 0, y: 0, width: 10, height: 10, fillColor: '#002'},
      {t: 'rect', x: 0, y: 10, width: 10, height: 10, fillColor: '#003'}
    ]);
  });
});

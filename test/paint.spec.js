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
});

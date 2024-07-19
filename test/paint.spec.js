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

  it('paints z-index: -1, -2 after background, before normal flow', function () {
    this.layout(`
      <div style="background-color: #f00; font-size: 10px;">
        the bird is
        <div style="position: relative; z-index: -1;">the</div>
        <div style="position: relative; z-index: -2;">word</div>
      </div>
    `);

    expect(this.paint().getCalls()).to.deep.equal([
      {t: 'text', x: 0, y: 28, text: 'word', fillColor: '#000'},
      {t: 'text', x: 0, y: 18, text: 'the', fillColor: '#000'},
      {t: 'rect', x: 0, y: 0, width: 640, height: 30, fillColor: '#f00'},
      {t: 'text', x: 0, y: 8, text: 'the bird is', fillColor: '#000'}
    ]);
  });

  it('paints z-index: 1, 2 after floats', function () {
    this.layout(`
      <div style="position: relative; width: 10px; height: 10px; z-index: 2; background-color: #f00;"></div>
      <div style="position: relative; width: 10px; height: 10px; z-index: 1; background-color: #0f0;"></div>
      <div style="float: left; width: 10px; height: 10px; background-color: #00f;"></div>
    `);

    expect(this.paint().getCalls()).to.deep.equal([
      {t: 'rect', x: 0, y: 20, width: 10, height: 10, fillColor: '#00f'},
      {t: 'rect', x: 0, y: 10, width: 10, height: 10, fillColor: '#0f0'},
      {t: 'rect', x: 0, y: 0, width: 10, height: 10, fillColor: '#f00'}
    ]);
  });

  it('layers within the boundaries of stacking contexts', function () {
    this.layout(`
      <div style="z-index: 0; position: relative; background-color: #001;">
        <div style="width: 10px; height: 10px; background-color: #002;"></div>
        <div style="z-index: 2; width: 10px; height: 10px; background-color: #003;"></div>
      </div>
      <div style="z-index: 1; position: relative; width: 10px; height: 10px; background-color: #004;"></div>
    `);

    // right: 1, 2, 3, 4 // wrong: 1, 2, 4, 3
    expect(this.paint().getCalls()).to.deep.equal([
      {t: 'rect', x: 0, y: 0, width: 640, height: 20, fillColor: '#001'},
      {t: 'rect', x: 0, y: 0, width: 10, height: 10, fillColor: '#002'},
      {t: 'rect', x: 0, y: 10, width: 10, height: 10, fillColor: '#003'},
      {t: 'rect', x: 0, y: 20, width: 10, height: 10, fillColor: '#004'}
    ]);
  });

  it('ignores z-index if the element isn\'t positioned', function () {
    this.layout(`
      <div style="z-index: 1; background-color: #001; width: 10px; height: 10px;"></div>
      <div style="width: 10px; height: 10px; background-color: #002;"></div>
    `);

    expect(this.paint().getCalls()).to.deep.equal([
      {t: 'rect', x: 0, y: 0, width: 10, height: 10, fillColor: '#001'},
      {t: 'rect', x: 0, y: 10, width: 10, height: 10, fillColor: '#002'}
    ]);
  });

  it('layers inlines with a z-index and jails content', function () {
    this.layout(`
      <div style="font-size: 10px;">
        beans
        <span style="position: relative; z-index: -1; background-color: #001;">
          tofu
          <div style="display: inline-block; background-color: #002;">peppers</div>
          <span style="position: relative; z-index: -1;">onion</span>
        </span>
      </div>
    `);

    expect(this.paint().getCalls()).to.deep.equal([
      {t: 'text', x: 190, y: 8, text: 'onion', fillColor: '#000'},
      {t: 'rect', x: 60, y: 0, width: 180, height: 10, fillColor: '#001'},
      {t: 'text', x: 60, y: 8, text: 'tofu ', fillColor: '#000'},
      {t: 'rect', x: 110, y: 0, width: 70, height: 10, fillColor: '#002'},
      {t: 'text', x: 110, y: 8, text: 'peppers', fillColor: '#000'},
      {t: 'text', x: 180, y: 8, text: ' ', fillColor: '#000'},
      {t: 'text', x: 0, y: 8, text: 'beans ', fillColor: '#000'}
    ]);
  });

  it('paints inline-block inside of an inline with a stacking context', function () {
    this.layout(`
      <div style="font-size: 10px;">
        <span style="position: relative; z-index: 1; background-color: #001;">
          <span style="display: inline-block;">look at</span>
        </span>
        this photograph
      </div>
    `);

    expect(this.paint().getCalls()).to.deep.equal([
      {t: 'text', x: 80, y: 8, text: 'this photograph', fillColor: '#000'},
      {t: 'rect', x: 0, y: 0, width: 80, height: 10, fillColor: '#001'},
      {t: 'text', x: 0, y: 8, text: 'look at', fillColor: '#000'},
      {t: 'text', x: 70, y: 8, text: ' ', fillColor: '#000'}
    ]);
  });

  it('paints z-index: 0 at the same layer as auto', function () {
    this.layout(`
      <div style="font-size: 10px;">
        <span style="position: relative; z-index: 0;">play</span>
        <span style="position: relative;">
          ice
          <span style="position: relative; z-index: -1;">hockey</span>
        </span>
      </div>
    `);

    expect(this.paint().getCalls()).to.deep.equal([
      {t: 'text', x: 90, y: 8, text: 'hockey', fillColor: '#000'},
      {t: 'text', x: 40, y: 8, text: ' ', fillColor: '#000'},
      {t: 'text', x: 0, y: 8, text: 'play', fillColor: '#000'},
      {t: 'text', x: 50, y: 8, text: 'ice ', fillColor: '#000'}
    ]);
  });

  it('forwards the background color of <html> to the icb', function () {
    this.layout(`
      <html style="background-color: #fad;"></html>
    `);

    expect(this.paint().getCalls()).to.deep.equal([
      {t: 'rect', x: 0, y: 0, width: 640, height: 480, fillColor: '#fad'}
    ]);
  });

  it('doesn\'t paint text inside of positioned inside of positioned twice', function () {
    this.layout(`
      <div style="position: relative; font-size: 10px;">
        <div style="position: relative;">
          twice
        </div>
      </div>
    `);

    expect(this.paint().getCalls()).to.deep.equal([
      {t: 'text', x: 0, y: 8, text: 'twice', fillColor: '#000'}
    ]);
  });
});

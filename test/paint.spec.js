//@ts-check
import {expect} from 'chai';
import * as flow from '../src/api-with-parse.js';
import {registerFontAsset, unregisterFontAsset} from '../assets/register.js';
import paint from '../src/paint.js';
import PaintSpy from './paint-spy.js';
import {Logger} from '../src/util.js';

const log = new Logger();

function setupLayoutTests() {
  this.layout = function (html) {
    const rootElement = flow.parse(html);
    this.blockContainer = flow.generate(rootElement);
    flow.layout(this.blockContainer);
  };

  this.paint = function () {
    const b = new PaintSpy();
    paint(this.blockContainer, b);
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
      log.pushIndent('  '.repeat(indent));
      this.currentTest.ctx.blockContainer.log({bits: true}, log);
      log.popIndent();
      log.flush();
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

  it('doesn\'t paint text inside of floats inside of positioned twice', function () {
    this.layout(`
      <div style="position: relative; font-size: 10px;">
        <div style="float: left;">twice</div>
      </div>
    `);

    expect(this.paint().getCalls()).to.deep.equal([
      {t: 'text', x: 0, y: 8, text: 'twice', fillColor: '#000'}
    ]);
  });

  it('clips to overflow to padding area', function () {
    this.layout(`
      <div style="font-size: 10px; width: 50px;">
        <div style="overflow: hidden; border: 10px solid transparent; padding: 10px; height: 10px;">
          Ada
        </div>
      </div>
    `);

    expect(this.paint().getCalls()).to.deep.equal([
      {t: 'pushClip', x: 10, y: 10, width: 30, height: 30},
      {t: 'text', x: 20, y: 28, text: 'Ada', fillColor: '#000'},
      {t: 'popClip'}
    ]);
  });

  it('clips overflow of inline-blocks', function () {
    this.layout(`
      <div style="font-size: 10px; width: 200px;">
        NextStep Logo:<div style="display: inline-block; overflow: hidden;">ne<br>xt</div>
      </div>
    `);

    expect(this.paint().getCalls()).to.deep.equal([
      {t: 'text', x: 0, y: 20, text: 'NextStep Logo:', fillColor: '#000'},
      {t: 'pushClip', x: 140, y: 0, width: 20, height: 20},
      {t: 'text', x: 140, y: 8, text: 'ne', fillColor: '#000'},
      {t: 'text', x: 140, y: 18, text: 'xt', fillColor: '#000'},
      {t: 'popClip'}
    ]);
  });

  it('clips overflow of floats', function () {
    this.layout(`
      <div style="font-size: 10px; width: 200px; background-color: #567; display: flow-root;">
        <div style="float: left; overflow: hidden;">sleepy<br>puppy</div>
      </div>
    `);

    expect(this.paint().getCalls()).to.deep.equal([
      {t: 'rect', x: 0, y: 0, width: 200, height: 20, fillColor: '#567'},
      {t: 'pushClip', x: 0, y: 0, width: 60, height: 20},
      {t: 'text', x: 0, y: 8, text: 'sleepy', fillColor: '#000'},
      {t: 'text', x: 0, y: 18, text: 'puppy', fillColor: '#000'},
      {t: 'popClip'}
    ]);
  });

  it('propagates the overflow property to the viewport', function () {
    const rootElement = flow.parse(`
      <html style="overflow: hidden;">
        <div style="background-color: #321; width: 100px; height: 100px;"></div>
      </html>
    `);
    const blockContainer = flow.generate(rootElement);
    const b = new PaintSpy();
    flow.layout(blockContainer, 20, 20);
    paint(blockContainer, b);

    expect(b.getCalls()).to.deep.equal([
      {t: 'pushClip', x: 0, y: 0, width: 20, height: 20},
      {t: 'rect', x: 0, y: 0, width: 100, height: 100, fillColor: '#321'},
      {t: 'popClip'}
    ]);
  });

  it('nests clipping calls in the same stacking context', function () {
    this.layout(`
      <div style="overflow: hidden; width: 10px; background-color: #123;">
        <div style="overflow: hidden; height: 10px; font-size: 20px;">
          ohnoyouwontseeme
        </div>
      </div>
    `);

    expect(this.paint().getCalls()).to.deep.equal([
      {t: 'rect', x: 0, y: 0, width: 10, height: 10, fillColor: '#123'},
      {t: 'pushClip', x: 0, y: 0, width: 10, height: 10},
      {t: 'pushClip', x: 0, y: 0, width: 10, height: 10},
      {t: 'text', x: 0, y: 16, text: 'ohnoyouwontseeme', fillColor: '#000'},
      {t: 'popClip'},
      {t: 'popClip'}
    ]);
  });

  it('clips stacking context roots by their overflow and their parents\'', function () {
    this.layout(`
      <div style="overflow: hidden; width: 20px; height: 20px; font-size: 10px;">
        <div style="overflow: hidden; width: 30px; height: 30px; position: relative; left: 10px; top: 10px;">
          <div style="overflow: hidden; width: 5px; height: 5px; position: relative; z-index: -1;">
            ohno
          </div>
        </div>
      </div>
    `);

    expect(this.paint().getCalls()).to.deep.equal([
      {t: 'pushClip', x: 0, y: 0, width: 20, height: 20},
      {t: 'pushClip', x: 10, y: 10, width: 30, height: 30},
      {t: 'pushClip', x: 10, y: 10, width: 5, height: 5},
      {t: 'text', x: 10, y: 18, text: 'ohno', fillColor: '#000'},
      {t: 'popClip'},
      {t: 'popClip'},
      {t: 'popClip'}
    ]);
  });

  it('clips by parents across multiple layers', function () {
    this.layout(`
      <div style="overflow: hidden; width: 200px; font-size: 10px;">
        <div style="display: inline-block; background-color: #456; overflow: hidden; width: 150px;">
          <div style="position: relative; z-index: -1;">negative nancy</div>
        </div>
        <div style="background-color: #789; height: 10px;"></div>
      </div>
    `);

    expect(this.paint().getCalls()).to.deep.equal([
      {t: 'pushClip', x: 0, y: 0, width: 200, height: 22},
      {t: 'pushClip', x: 0, y: 0, width: 150, height: 10},
      {t: 'text', x: 0, y: 8, text: 'negative nancy', fillColor: '#000'},
      {t: 'popClip'},
      {t: 'popClip'},
      {t: 'pushClip', x: 0, y: 0, width: 200, height: 22},
      {t: 'rect', x: 0, y: 12, width: 200, height: 10, fillColor: '#789'},
      {t: 'popClip'},
      {t: 'pushClip', x: 0, y: 0, width: 200, height: 22},
      {t: 'rect', x: 0, y: 0, width: 150, height: 10, fillColor: '#456'},
      {t: 'pushClip', x: 0, y: 0, width: 150, height: 10},
      {t: 'popClip'},
      {t: 'popClip'}
    ]);
  });

  it('doesn\'t try to clip around non-existant foreground', function () {
    this.layout(`
      <div style="overflow: hidden; width: 1px; height: 1px; padding: 1px;">
        <div style="width: 1px; height: 1px; background-color: #dedbef;"></div>
      </div>
    `);

    expect(this.paint().getCalls()).to.deep.equal([
      {t: 'pushClip', x: 0, y: 0, width: 3, height: 3},
      {t: 'rect', x: 1, y: 1, width: 1, height: 1, fillColor: '#dedbef'},
      {t: 'popClip'}
    ]);
  });

  it('doesn\'t overflow the border of the box itself when it\'s a layer root', function () {
    this.layout(`
      <div style="position: relative; overflow: hidden; border: 1px solid #000; width: 1px; height: 1px;">
        <div style="width: 1px; height: 1px; background-color: #dedbef;"></div>
      </div>
    `);

    expect(this.paint().getCalls()).to.deep.equal([
      {t: 'edge', x: 0, y: 0.5, length: 3, side: 'top', strokeColor: '#000', lineWidth: 1},
      {t: 'edge', x: 2.5, y: 0, length: 3, side: 'right', strokeColor: '#000', lineWidth: 1},
      {t: 'edge', x: 0, y: 2.5, length: 3, side: 'bottom', strokeColor: '#000', lineWidth: 1},
      {t: 'edge', x: 0.5, y: 0, length: 3, side: 'left', strokeColor: '#000', lineWidth: 1},
      {t: 'pushClip', x: 1, y: 1, width: 1, height: 1},
      {t: 'rect', x: 1, y: 1, width: 1, height: 1, fillColor: '#dedbef'},
      {t: 'popClip'}
    ]);
  });

  it('paints inline layer roots inside of an overflow: hidden', function () {
    this.layout(`
      <div style="width: 300px; font-size: 10px; height: 10px; overflow: hidden;">
        a <span style="position: relative; top: 5px;">tired</span> puppy is a good puppy
      </div>
    `);

    expect(this.paint().getCalls()).to.deep.equal([
      {t: 'pushClip', x: 0, y: 0, width: 300, height: 10},
      {t: 'text', x: 0, y: 8, text: 'a ', fillColor: '#000'},
      {t: 'text', x: 70, y: 8, text: ' puppy is a good puppy', fillColor: '#000'},
      {t: 'popClip'},
      {t: 'pushClip', x: 0, y: 0, width: 300, height: 10},
      {t: 'text', x: 20, y: 13, text: 'tired', fillColor: '#000'},
      {t: 'popClip'}
    ]);
  });
});

// @ts-check
import {expect} from 'chai';
import {registerFontAsset, unregisterFontAsset} from '../assets/register.js';
import {HTMLElement} from '../src/dom.js';
import {h, dom, generate, layout} from '../src/api-with-parse.js';
import {parse} from '../src/api-with-parse.js';
import {getFontUrls} from '../src/text-font.js';

describe('Hyperscript API', function () {
  describe('h()', function () {
    it('accepts children argument', function () {
      const div = h('div', [h('span'), 'chocolate']);
      expect(div.tagName).to.equal('div');
      expect(div.children).to.have.lengthOf(2);
      expect(div.children[0].tagName).to.equal('span');
      expect(div.children[1].text).to.equal('chocolate');
    });

    it('accepts text content argument', function () {
      const div = h('div', 'text content');
      expect(div.tagName).to.equal('div');
      expect(div.children).to.have.lengthOf(1);
      expect(div.children[0].text).to.equal('text content');
    });

    it('accepts attrs argument', function () {
      const div = h('div', {
        style: {fontSize: 66},
        attrs: {direction: 'rtl'}
      });
      expect(div.declaredStyle.fontSize).to.equal(66);
      expect(div.attrs.direction).to.equal('rtl');
    });

    it('accepts attrs, children arguments', function () {
      const div = h('div', {style: {lineHeight: 20}}, [h('span')]);
      expect(div.declaredStyle.lineHeight).to.equal(20);
      expect(div.children).to.have.lengthOf(1);
      expect(div.children[0].tagName).to.equal('span');
    });

    it('accepts attrs, text content arguments', function () {
      const div = h('div', {style: {display: 'inline'}}, 'text content');
      expect(div.declaredStyle.display).to.equal('inline');
      expect(div.children).to.have.lengthOf(1);
      expect(div.children[0].text).to.equal('text content');
    });
  });

  describe('dom()', function () {
    it('sets parents', function () {
      const div = dom(h('div', [h('div')]));
      expect(div.children[0].parent).to.equal(div);
      expect(div.children[0].children[0].parent).to.equal(div.children[0]);
    });

    it('computes styles', function () {
      const h1 = dom(h('div', {style: {fontSize: 99}}, 'abc'));
      expect(h1.children[0].style.fontSize).to.equal(99);
      const h2 = dom(h('div', {style: {lineHeight: {value: 123, unit: null}}}, [h('div')]));
      expect(h2.children[0].style.lineHeight).to.deep.equal({value: 123, unit: null});
    });

    it('uses the html element', function () {
      expect(dom(h('html', {})).children.length).to.equal(0);
    });

    it('makes the root element block-level, flow-root', function () {
      const html = dom(h('html', {style: {display: {outer: 'inline', inner: 'flow'}}}));
      expect(html.style.display.outer).to.equal('block');
      expect(html.style.display.inner).to.equal('flow-root');
    });

    it('accepts a mixed list', function () {
      const html = dom([
        h('div', {attrs: {div1: 'div1'}}),
        'text1'
      ]);

      expect(html.children).to.have.lengthOf(2);
      expect(html.children[0].attrs.div1).to.equal('div1');
      expect(html.children[1].text).to.equal('text1');
    });
  });

  it('lays out successfully', async function () {
    const style = {fontSize: 10, lineHeight: 20, fontFamily: ['Arimo']};
    const tree = dom([
      h('div', {style}, [
        h('div', 'Chapter 1'),
        h('div', {attrs: {id: 't'}}, ['The quick brown fox jumps over the lazy dog', h('br'), 'The end'])
      ])
    ]);

    const box = generate(tree);
    registerFontAsset('Arimo/Arimo-Regular.ttf');
    layout(box, 100);
    const ifc = box.children[0].children[1].children[0];
    expect(ifc.paragraph.lineboxes).to.have.lengthOf(4);
    expect(ifc.paragraph.lineboxes[0].blockOffset).to.equal(0);
    expect(ifc.paragraph.lineboxes[1].startOffset).to.equal(20);
    expect(ifc.paragraph.lineboxes[1].blockOffset).to.equal(20);
    expect(ifc.paragraph.lineboxes[2].startOffset).to.equal(40);
    expect(ifc.paragraph.lineboxes[2].blockOffset).to.equal(40);
    expect(ifc.paragraph.lineboxes[3].startOffset).to.equal(43);
    expect(ifc.paragraph.lineboxes[3].blockOffset).to.equal(60);
    expect(ifc.paragraph.height).to.equal(80);
    unregisterFontAsset('Arimo/Arimo-Regular.ttf');
  });

  it('layout twice is successful', async function () {
    const style = {fontSize: 10, lineHeight: 20, fontFamily: ['Arimo']};
    const tree = dom([
      h('div', {style}, [
        h('div', 'Chapter 1'),
        h('div', {attrs: {id: 't'}}, ['The quick brown fox jumps over the lazy dog', h('br'), 'The end'])
      ])
    ]);

    const box = generate(tree);
    registerFontAsset('Arimo/Arimo-Regular.ttf');
    layout(box, 100);
    layout(box, 100);
    const ifc = box.children[0].children[1].children[0];
    expect(ifc.paragraph.lineboxes).to.have.lengthOf(4);
    unregisterFontAsset('Arimo/Arimo-Regular.ttf');
  });
});

describe('Parse API', function () {
  it('parses <html> ignoring ws before but not content after', function () {
    const html = parse('\t\n <html></html><p>wat</p> ');
    expect(html.children.length).to.equal(2);
    expect(html.children[0].tagName).to.equal('p');
    expect(html.children[0].children[0].text).to.equal('wat');
    expect(html.children[1].text).to.equal(' ');
  });

  it('wraps with <html> except leading whitespace', function () {
    const html = parse('\r   <p>hello world</p>');
    expect(html.children.length).to.equal(1);
    expect(html.children[0].tagName).to.equal('p');
    expect(html.children[0].children[0].text).to.equal('hello world');
  });

  it('combines text after <html> correctly', function () {
    const html = parse('<html> bingo</html> bango ');
    expect(html.children.length).to.equal(1);
    expect(html.children[0].text).to.equal(' bingo bango ');
  });

  it('returns an empty element if there\'s no content', function () {
    expect(parse('').children.length).to.equal(0);
    expect(parse('\t\n  ').children.length).to.equal(0);
  });

  it('computes styles', function () {
    const html = parse('<p style="white-space: pre;">coffee</p>');
    expect(html.children[0].style.whiteSpace).to.equal('pre');
    expect(html.children[0].children[0].style.whiteSpace).to.equal('pre');
  });

  it('computes styles on reparented elements/text', function () {
    const html = parse('<html style="font: 12px Bro;">happy </html><span>birthday</span>');
    expect(html.children[0].style.fontFamily).to.deep.equal(['Bro']);
    expect(html.children[1].style.fontFamily).to.deep.equal(['Bro']);
  });
});

describe('DOM API', function () {
  it('supports query', function () {
    const html = parse('<div id="d1"></div><div class="d2"></div>');
    expect(html.query('#d1')).to.be.instanceOf(HTMLElement);
    expect(html.query('.d2')).to.be.instanceOf(HTMLElement);
  });

  it('supports queryAll', function () {
    const html = parse('<div class="d1"></div><div class="d2"></div>');
    const elements = html.queryAll('.d1, .d2');
    expect(elements).to.have.lengthOf(2);
    expect(elements[0]).to.be.instanceof(HTMLElement);
    expect(elements[1]).to.be.instanceof(HTMLElement);
  });

  it('exposes boxes', function () {
    const html = parse('<div id="d" style="width: 100px; height: 100px;"></div>');
    layout(generate(html));
    const [box] = html.query('#d').boxes;
    expect(box.contentArea.width).to.equal(100);
    expect(box.contentArea.height).to.equal(100);
  });
});

describe('loadNotoFonts', function () {
  it('loads arabic', function () {
    expect(getFontUrls(parse('المادة'))).to.eql([
      'https://cdn.jsdelivr.net/fontsource/fonts/noto-sans-arabic@latest/arabic-400-normal.ttf',
      'https://cdn.jsdelivr.net/fontsource/fonts/noto-sans-arabic@latest/arabic-700-normal.ttf'
    ]);
  });

  it('loads latin', function () {
    expect(getFontUrls(parse('the quick brown fox'))).to.eql([
      'https://cdn.jsdelivr.net/fontsource/fonts/noto-sans@latest/latin-400-normal.ttf',
      'https://cdn.jsdelivr.net/fontsource/fonts/noto-sans@latest/latin-400-italic.ttf',
      'https://cdn.jsdelivr.net/fontsource/fonts/noto-sans@latest/latin-700-normal.ttf',
      'https://cdn.jsdelivr.net/fontsource/fonts/noto-sans@latest/latin-700-italic.ttf'
    ]);
  });

  it('loads devanagari', function () {
    expect(getFontUrls(parse('अनुच्छेद'))).to.eql([
      'https://cdn.jsdelivr.net/fontsource/fonts/noto-sans@latest/devanagari-400-normal.ttf',
      'https://cdn.jsdelivr.net/fontsource/fonts/noto-sans@latest/devanagari-700-normal.ttf'
    ]);
  });

  it('loads khmer', function () {
    expect(getFontUrls(parse('មាត្រា'))).to.eql([
      'https://cdn.jsdelivr.net/fontsource/fonts/noto-sans-khmer@latest/khmer-400-normal.ttf',
      'https://cdn.jsdelivr.net/fontsource/fonts/noto-sans-khmer@latest/khmer-700-normal.ttf'
    ]);
  });

  it('loads chinese', function () {
    expect(getFontUrls(parse('人人生而自由在尊严和权利上律平等'))).to.eql([
      'https://cdn.jsdelivr.net/fontsource/fonts/noto-sans-sc@latest/chinese-simplified-400-normal.ttf',
      'https://cdn.jsdelivr.net/fontsource/fonts/noto-sans-sc@latest/chinese-simplified-700-normal.ttf'
    ]);
  });
});

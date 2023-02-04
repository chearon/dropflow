import {expect} from 'chai';
import {registerFontAsset} from '../assets/register.js';
import {h, dom, generate, layout} from '../src/api.js';

describe('Hyperscript API', function () {
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

  it('sets parents', function () {
    const div = dom(h('div', [h('div')]));
    expect(div.children[0].parent).to.equal(div);
    expect(div.children[0].children[0].parent).to.equal(div.children[0]);
  });

  it('computes styles', function () {
    const d1 = dom(h('div', {style: {fontSize: 99}}, 'abc'));
    expect(d1.children[0].style.fontSize).to.equal(99);
    const d2 = dom(h('div', {style: {lineHeight: {value: 123, unit: null}}}, [h('div')]));
    expect(d2.children[0].style.lineHeight).to.deep.equal({value: 123, unit: null});
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
    await layout(box, 100);
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
    await layout(box, 100);
    await layout(box, 100);
    const ifc = box.children[0].children[1].children[0];
    expect(ifc.paragraph.lineboxes).to.have.lengthOf(4);
  });
});

import {createStyle, createDeclaredStyle, getOriginStyle, inherited, initial} from '../src/style.ts';
import {BlockContainer} from '../src/layout-flow.ts';
import {BoxArea} from '../src/layout-box.ts';
import {expect} from 'chai';

describe('CSS Style', function () {
  it('calculates used value for border width', function () {
    const style = createStyle(getOriginStyle(), createDeclaredStyle({
      borderTopWidth: 1,
      borderTopStyle: 'none',
      borderRightWidth: 1,
      borderRightStyle: 'none',
      borderBottomWidth: 1,
      borderBottomStyle: 'none',
      borderLeftWidth: 1,
      borderLeftStyle: 'none'
    }));

    const box = new BlockContainer(style, [], 0);
    box.getBorderArea().parent = new BoxArea(box, 0, 0, 100, 100);
    const containingBlock = box.getContainingBlock();

    expect(style.getBorderBlockStartWidth(containingBlock)).to.equal(0);
    expect(style.getBorderBlockEndWidth(containingBlock)).to.equal(0);
    expect(style.getBorderLineLeftWidth(containingBlock)).to.equal(0);
    expect(style.getBorderLineRightWidth(containingBlock)).to.equal(0);
  });

  it('calculates used values for percentages', function () {
    const style = createStyle(getOriginStyle(), createDeclaredStyle({
      paddingTop: {value: 50, unit: '%'},
      paddingRight: {value: 50, unit: '%'},
      paddingBottom: {value: 50, unit: '%'},
      paddingLeft: {value: 50, unit: '%'},
      width: {value: 50, unit: '%'},
      height: {value: 50, unit: '%'},
      marginTop: {value: 50, unit: '%'},
      marginRight: {value: 50, unit: '%'},
      marginBottom: {value: 50, unit: '%'},
      marginLeft: {value: 50, unit: '%'}
    }));

    const documentElement = new BlockContainer(
      createStyle(getOriginStyle(), createDeclaredStyle({width: 100, height: 200})), [], 0
    );
    const box = new BlockContainer(style, [], 0);
    box.getBorderArea().parent = new BoxArea(documentElement, 0, 0, 100, 200);
    const containingBlock = box.getContainingBlock();

    expect(style.getPaddingBlockStart(containingBlock)).to.equal(50);
    expect(style.getPaddingLineRight(containingBlock)).to.equal(50);
    expect(style.getPaddingBlockEnd(containingBlock)).to.equal(50);
    expect(style.getPaddingLineLeft(containingBlock)).to.equal(50);
    expect(style.getInlineSize(containingBlock)).to.equal(50);
    expect(style.getBlockSize(containingBlock)).to.equal(100);
    expect(style.getMarginBlockStart(containingBlock)).to.equal(50);
    expect(style.getMarginLineRight(containingBlock)).to.equal(50);
    expect(style.getMarginBlockEnd(containingBlock)).to.equal(50);
    expect(style.getMarginLineLeft(containingBlock)).to.equal(50);
  });

  it('normalizes border-box to content-box', function () {
    const style = createStyle(getOriginStyle(), createDeclaredStyle({
      width: 100,
      borderLeftWidth: 10,
      borderLeftStyle: 'solid',
      borderRightWidth: 10,
      borderRightStyle: 'solid',
      paddingRight: 10,
      paddingLeft: 10,
      boxSizing: 'border-box'
    }));

    const box = new BlockContainer(style, [], 0);
    box.getBorderArea().parent = new BoxArea(box, 0, 0, 100, 100);
    const containingBlock = box.getContainingBlock();
    expect(style.getInlineSize(containingBlock)).to.equal(60);
  });

  it('normalizes padding-box to content-box', function () {
    const style = createStyle(getOriginStyle(), createDeclaredStyle({
      width: 100,
      borderLeftWidth: 10,
      borderRightWidth: 10,
      paddingRight: 10,
      paddingLeft: 10,
      boxSizing: 'padding-box'
    }));

    const box = new BlockContainer(style, [], 0);
    box.getBorderArea().parent = new BoxArea(box, 0, 0, 100, 100);
    const containingBlock = box.getContainingBlock();

    expect(style.getInlineSize(containingBlock)).to.equal(80);
  });

  it('computes unitless line-height', function () {
    const parentDeclared = createDeclaredStyle({fontSize: 10});
    const parentComputed = createStyle(getOriginStyle(), parentDeclared);
    const childDeclared = createDeclaredStyle({lineHeight: {value: 2, unit: null}});
    const childComputed = createStyle(parentComputed, childDeclared);
    expect(childComputed.lineHeight).to.deep.equal(20);
  });

  it('computes line-height as a percentage', function () {
    const parentDeclared = createDeclaredStyle({fontSize: 50});
    const parentComputed = createStyle(getOriginStyle(), parentDeclared);
    const childDeclared = createDeclaredStyle({lineHeight: {value: 50, unit: '%'}});
    const childComputed = createStyle(parentComputed, childDeclared);
    expect(childComputed.lineHeight).to.equal(25);
  });

  it('computes font-size as a percentage', function () {
    const parentDeclared = createDeclaredStyle({fontSize: 50});
    const parentComputed = createStyle(getOriginStyle(), parentDeclared);
    const childDeclared = createDeclaredStyle({fontSize: {value: 50, unit: '%'}});
    const childComputed = createStyle(parentComputed, childDeclared);
    expect(childComputed.fontSize).to.equal(25);
  });

  it('computes font-weight: bolder', function () {
    const parentDeclared = createDeclaredStyle({fontWeight: 400});
    const parentComputed = createStyle(getOriginStyle(), parentDeclared);
    const childDeclared = createDeclaredStyle({fontWeight: 'bolder'});
    const childComputed = createStyle(parentComputed, childDeclared);
    expect(childComputed.fontWeight).to.equal(700);
  });

  it('computes font-weight: lighter', function () {
    const parentDeclared = createDeclaredStyle({fontWeight: 400});
    const parentComputed = createStyle(getOriginStyle(), parentDeclared);
    const childDeclared = createDeclaredStyle({fontWeight: 'lighter'});
    const childComputed = createStyle(parentComputed, childDeclared);
    expect(childComputed.fontWeight).to.equal(100);
  });

  it('supports the inherit keyword', function () {
    const parentDeclared = createDeclaredStyle({backgroundColor: {r: 200, g: 200, b: 200, a: 1}});
    const parentComputed = createStyle(getOriginStyle(), parentDeclared);
    const childDeclared = createDeclaredStyle({backgroundColor: inherited});
    const childComputed = createStyle(parentComputed, childDeclared);
    expect(childComputed.backgroundColor).to.deep.equal({r: 200, g: 200, b: 200, a: 1});
  });

  it('supports the initial keyword', function () {
    const parentDeclared = createDeclaredStyle({color: {r: 200, g: 200, b: 200, a: 1}});
    const parentComputed = createStyle(getOriginStyle(), parentDeclared);
    const childDeclared = createDeclaredStyle({color: initial});
    const childComputed = createStyle(parentComputed, childDeclared);
    expect(childComputed.color).to.deep.equal(getOriginStyle().color);
  });

  it('defaultifies correctly if the style has a zero', function () {
    const style = createDeclaredStyle({width: 0});
    expect(createStyle(getOriginStyle(), style).width).to.equal(0);
  });

  it('resolves em on the element itself', function () {
    const parentDeclared = createDeclaredStyle({fontSize: 16});
    const parentComputed = createStyle(getOriginStyle(), parentDeclared);
    const childDeclared = createDeclaredStyle({fontSize: 64, marginTop: {value: 1, unit: 'em'}});
    const childComputed = createStyle(parentComputed, childDeclared);
    expect(childComputed.marginTop).to.equal(64);
  });

  it('resolves em on the parent when font-size is used', function () {
    const parentDeclared = createDeclaredStyle({fontSize: 16});
    const parentComputed = createStyle(getOriginStyle(), parentDeclared);
    const childDeclared = createDeclaredStyle({fontSize: {value: 2, unit: 'em'}});
    const childComputed = createStyle(parentComputed, childDeclared);
    expect(childComputed.fontSize).to.equal(32);
  });
});

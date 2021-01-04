//@ts-check

const {createComputedStyle, initialStyle, Style} = require('./cascade');
const {Area} = require('./box');
const {expect} = require('chai');

describe('CSS', function () {
  it('calculates used value for border width', function () {
    const computed = createComputedStyle(initialStyle, {
      borderTopWidth: 1,
      borderTopStyle: 'none',
      borderRightWidth: 1,
      borderRightStyle: 'none',
      borderBottomWidth: 1,
      borderBottomStyle: 'none',
      borderLeftWidth: 1,
      borderLeftStyle: 'none'
    });

    const style = new Style('root', computed);

    expect(style.borderTopWidth).to.equal(0);
    expect(style.borderRightWidth).to.equal(0);
    expect(style.borderBottomWidth).to.equal(0);
    expect(style.borderLeftWidth).to.equal(0);
  });

  it('calculates used values for percentages', function () {
    const computed = createComputedStyle(initialStyle, {
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
    });

    const style = new Style('root', computed);

    style.resolvePercentages(new Area('a', 0, 0, 100, 200));

    expect(style.paddingTop).to.equal(50);
    expect(style.paddingRight).to.equal(50);
    expect(style.paddingBottom).to.equal(50);
    expect(style.paddingLeft).to.equal(50);
    expect(style.width).to.equal(50);
    expect(style.height).to.equal(100);
    expect(style.marginTop).to.equal(50);
    expect(style.marginRight).to.equal(50);
    expect(style.marginBottom).to.equal(50);
    expect(style.marginLeft).to.equal(50);
  });

  it('normalizes border-box to content-box', function () {
    const computed = createComputedStyle(initialStyle, {
      width: 100,
      borderLeftWidth: 10,
      borderRightWidth: 10,
      paddingRight: 10,
      paddingLeft: 10,
      boxSizing: 'border-box'
    });

    const style = new Style('root', computed);
    style.resolveBoxModel();
    expect(style.width).to.equal(60);
  });

  it('normalizes padding-box to content-box', function () {
    const computed = createComputedStyle(initialStyle, {
      width: 100,
      borderLeftWidth: 10,
      borderRightWidth: 10,
      paddingRight: 10,
      paddingLeft: 10,
      boxSizing: 'padding-box'
    });

    const style = new Style('root', computed);
    style.resolveBoxModel();
    expect(style.width).to.equal(80);
  });

  it('computes unitless line-height', function () {
    const parentComputed = createComputedStyle(initialStyle, {fontSize: 10});
    const childComputed = createComputedStyle(parentComputed, {lineHeight: {value: 2, unit: null}});
    expect(childComputed.lineHeight).to.equal(20);
  });
});

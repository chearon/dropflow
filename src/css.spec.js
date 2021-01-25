const {parse} = require('./css');
const {expect} = require('chai');

describe('CSS Parser', function () {
  it('parses font shorthand with weight', function () {
    expect(parse('font: 300 24px arial')).to.deep.equal({
      fontWeight: 300,
      fontStyle: 'normal',
      fontStretch: 'normal',
      fontVariant: 'normal',
      fontSize: 24,
      fontFamily: ['arial'],
      lineHeight: 'normal'
    });
  });

  it('parses font shorthand with style', function () {
    expect(parse('font: italic 24px arial')).to.deep.equal({
      fontWeight: 'normal',
      fontStyle: 'italic',
      fontStretch: 'normal',
      fontVariant: 'normal',
      fontSize: 24,
      fontFamily: ['arial'],
      lineHeight: 'normal'
    });
  });

  it('parses font shorthand with stretch', function () {
    expect(parse('font: condensed 24px arial')).to.deep.equal({
      fontWeight: 'normal',
      fontStyle: 'normal',
      fontStretch: 'condensed',
      fontVariant: 'normal',
      fontSize: 24,
      fontFamily: ['arial'],
      lineHeight: 'normal'
    });
  });

  it('parses font shorthand with variant', function () {
    expect(parse('font: small-caps 24px arial')).to.deep.equal({
      fontWeight: 'normal',
      fontStyle: 'normal',
      fontStretch: 'normal',
      fontVariant: 'small-caps',
      fontSize: 24,
      fontFamily: ['arial'],
      lineHeight: 'normal'
    });
  });

  it('parses font shorthand with weight, style, stretch, and variant', function () {
    expect(parse('font: 300 oblique condensed small-caps 24px arial')).to.deep.equal({
      fontWeight: 300,
      fontStyle: 'oblique',
      fontStretch: 'condensed',
      fontVariant: 'small-caps',
      fontSize: 24,
      fontFamily: ['arial'],
      lineHeight: 'normal'
    });
  });

  it('parses font shorthand with line height', function () {
    expect(parse('font: 16px/1.4 arial')).to.deep.equal({
      fontWeight: 'normal',
      fontStyle: 'normal',
      fontStretch: 'normal',
      fontVariant: 'normal',
      fontSize: 16,
      fontFamily: ['arial'],
      lineHeight: {unit: null, value: 1.4}
    });
  });

  it('parses font shorthand with no weight, style, variant or stretch', function () {
    expect(parse('font: 24px arial')).to.deep.equal({
      fontWeight: 'normal',
      fontStyle: 'normal',
      fontStretch: 'normal',
      fontVariant: 'normal',
      fontSize: 24,
      fontFamily: ['arial'],
      lineHeight: 'normal'
    });
  });
});

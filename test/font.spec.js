//@ts-check
import {expect} from 'chai';
import * as oflo from '../src/api-with-parse.js';
import {registerFontAsset, unregisterFontAsset} from '../assets/register.js';
import {getCascade} from '../src/text-font.js';
import {getOriginStyle, createStyle, createDeclaredStyle} from '../src/style.js';

/** @param {import("../src/style.js").DeclaredStyleProperties} style */
function style(style) {
  return createStyle(getOriginStyle(), createDeclaredStyle(style));
}

describe('Font Registration and Matching', function () {
  before(function () {
    registerFontAsset('Arimo/Arimo-Regular.ttf');
    registerFontAsset('Arimo/Arimo-Bold.ttf');
    registerFontAsset('Arimo/Arimo-Italic.ttf');
    registerFontAsset('Cairo/Cairo-Regular.ttf');
    registerFontAsset('Cairo/Cairo-Bold.ttf');
  });

  after(function () {
    unregisterFontAsset('Arimo/Arimo-Regular.ttf');
    unregisterFontAsset('Arimo/Arimo-Bold.ttf');
    unregisterFontAsset('Arimo/Arimo-Italic.ttf');
    unregisterFontAsset('Cairo/Cairo-Regular.ttf');
    unregisterFontAsset('Cairo/Cairo-Bold.ttf');
  });

  it('looks up a single font', function () {
    const cascade = getCascade(style({fontFamily: ['Cairo']}), 'en');
    expect(cascade.matches.find(match => match.family === 'Cairo')).to.be.ok;
  });

  it('distinguishes Korean and Japanese', function () {
    // note dropflow doesn't support [lang] yet so this can't be done just via script
    registerFontAsset('Noto/NotoSansJP-Regular.otf');
    registerFontAsset('Noto/NotoSansKR-Regular.otf');
    const c1 = getCascade(style({}), 'kr');
    expect(c1.matches.find(match => match.family === 'Noto Sans KR')).to.be.ok;
    const c2 = getCascade(style({}), 'jp');
    expect(c2.matches.find(match => match.family === 'Noto Sans JP')).to.be.ok;
    unregisterFontAsset('Noto/NotoSansJP-Regular.otf');
    unregisterFontAsset('Noto/NotoSansKR-Regular.otf');
  });

  it('includes one of each other family at the right style', function () {
    const cascade = getCascade(style({fontFamily: ['Cairo'], fontWeight: 700}), 'en');
    expect(cascade.matches[0].weight).to.equal(700);
    const arimo = cascade.matches.filter(match => match.family === 'Arimo');
    expect(arimo).to.have.lengthOf(1);
    expect(arimo[0].weight).to.equal(700);
  });

  it('looks up italic fonts', function () {
    const cascade = getCascade(style({fontFamily: ['Arimo'], fontStyle: 'italic'}), 'en');
    expect(cascade.matches[0].italic).to.be.true;
  });

  it('deregisters fonts', function () {
    unregisterFontAsset('Cairo/Cairo-Regular.ttf');
    unregisterFontAsset('Cairo/Cairo-Bold.ttf');
    const cascade = getCascade(style({fontFamily: ['Cairo']}), 'en');
    expect(cascade.matches.find(match => match.family === 'Cairo')).not.to.be.ok;
    registerFontAsset('Cairo/Cairo-Regular.ttf');
    registerFontAsset('Cairo/Cairo-Bold.ttf');
  });

  it('looks up based on script when nothing is specified', function () {
    const bc1 = oflo.generate(oflo.parse('هل تتحدث لغة أخرى بجانب العربية؟'));
    oflo.layout(bc1);
    expect(bc1.children[0].paragraph.wholeItems[0].match.family).to.equal('Cairo');
    const bc2 = oflo.generate(oflo.parse('Do you speak another language besides Arabic?'));
    oflo.layout(bc2);
    expect(bc2.children[0].paragraph.wholeItems[0].match.family).to.equal('Arimo');
  });

  it('selects 500 if 400 is requested but not found', function () {
    registerFontAsset('Roboto/Roboto-Light.ttf'); // 300
    registerFontAsset('Roboto/Roboto-Medium.ttf'); // 500
    const cascade = getCascade(style({fontFamily: ['Roboto'], fontWeight: 400}), 'en');
    expect(cascade.matches.find(match => match.family === 'Roboto').weight).to.equal(500);
    unregisterFontAsset('Roboto/Roboto-Medium.ttf');
    unregisterFontAsset('Roboto/Roboto-Light.ttf');
  });

  it('selects 400 if 600 is requested but not found', function () {
    registerFontAsset('Roboto/Roboto-Light.ttf'); // 300
    registerFontAsset('Roboto/Roboto-Regular.ttf'); // 400
    const cascade = getCascade(style({fontFamily: ['Roboto'], fontWeight: 500}), 'en');
    expect(cascade.matches.find(match => match.family === 'Roboto').weight).to.equal(400);
    unregisterFontAsset('Roboto/Roboto-Regular.ttf');
    unregisterFontAsset('Roboto/Roboto-Light.ttf');
  });

  it('picks matches below when there\'s a tie and the weight is low', function () {
    registerFontAsset('NotoSansArabic/NotoSansArabic-Thin.ttf'); // 100
    registerFontAsset('NotoSansArabic/NotoSansArabic-ExtraLight.ttf'); // 200
    const cascade = getCascade(style({fontFamily: ['Noto Sans Arabic'], fontWeight: 150}), 'ar');
    expect(cascade.matches.find(match => match.family === 'Noto Sans Arabic').weight).to.equal(100);
    unregisterFontAsset('NotoSansArabic/NotoSansArabic-Thin.ttf');
    unregisterFontAsset('NotoSansArabic/NotoSansArabic-ExtraLight.ttf');
  });

  it('picks matches above when there\'s a tie and the weight is high', function () {
    registerFontAsset('NotoSansArabic/NotoSansArabic-Bold.ttf'); // 700
    registerFontAsset('NotoSansArabic/NotoSansArabic-ExtraBold.ttf'); // 800
    const cascade = getCascade(style({fontFamily: ['Noto Sans Arabic'], fontWeight: 750}), 'ar');
    expect(cascade.matches.find(match => match.family === 'Noto Sans Arabic').weight).to.equal(800);
    unregisterFontAsset('NotoSansArabic/NotoSansArabic-Bold.ttf');
    unregisterFontAsset('NotoSansArabic/NotoSansArabic-ExtraBold.ttf');
  });
});

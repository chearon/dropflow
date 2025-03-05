//@ts-check
import {expect} from 'chai';
import fs from 'node:fs';
import * as oflo from '../src/api-with-parse.js';
import {registerFontAsset, unregisterFontAsset} from '../assets/register.js';
import {getCascade, fonts, FontFace, createFaceFromTables} from '../src/text-font.js';
import {getOriginStyle, createStyle, createDeclaredStyle} from '../src/style.js';

/** @param {import("../src/style.js").DeclaredStyleProperties} style */
function style(style) {
  return createStyle(getOriginStyle(), createDeclaredStyle(style));
}

const url = path => new URL(`../assets/${path}`, import.meta.url);

// Simple version of {mock} from node:test. Bun doesn't support node:test yet.
// Eventually the tests should get migrated to either jest or node:test since
// those will work in both bun and node
const mock = {
  undo: [],
  method(target, key, impl) {
    const old = target[key];
    target[key] = impl;
    this.undo.push(() => target[key] = old);
  },
  reset() {
    for (const fn of this.undo.reverse()) fn();
    this.undo.length = 0;
  }
};

const arrayBuffer = () => fs.readFileSync(url('Cairo/Cairo-Bold.ttf'));

describe('Fonts', function () {
  describe('Matching', function () {
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
      expect(cascade.matches[0].style).to.equal('italic');
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
      expect(bc1.children[0].paragraph.wholeItems[0].face.family).to.equal('Cairo');
      const bc2 = oflo.generate(oflo.parse('Do you speak another language besides Arabic?'));
      oflo.layout(bc2);
      expect(bc2.children[0].paragraph.wholeItems[0].face.family).to.equal('Arimo');
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

  describe('FontFaceSet API', function () {
    it('initializes a FontFace correctly', function () {
      const f = new FontFace('f', url('Roboto/Roboto-Light.ttf'), {
        style: 'italic',
        weight: 'bold',
        stretch: 'condensed',
        variant: 'small-caps'
      });
      expect(f.status).to.equal('unloaded');
      expect(f.style).to.equal('italic');
      expect(f.weight).to.equal(700);
      expect(f.stretch).to.equal('condensed');
      expect(f.variant).to.equal('small-caps');
    });

    it('loads FontFaces with an ArrayBuffer source immediately', async function () {
      // browsers do this but it isn't in the spec directly
      const f = new FontFace('f', arrayBuffer());
      expect(f.status).to.equal('loaded');
      await f.loaded; // does not wait forever
    });

    it('exposes and resolves FontFace\'s ready promise', async function () {
      const f1 = new FontFace('f1', new URL('http://notarealdomain.notarealtld/'));
      mock.method(global, 'fetch', async () => ({ok: true, status: 200, arrayBuffer}));
      let resolved = false;
      f1.loaded.then(() => resolved = true);
      f1.load();
      await f1.loaded;
      expect(resolved).to.be.true;
      mock.reset();
    });

    it('selects fonts that are loaded and added', function () {
      const f1 = new FontFace('f1', url('NotoSansArabic/NotoSansArabic-Regular.ttf'));
      const f2 = new FontFace('f2', url('Roboto/Roboto-Regular.ttf'));
      const f3 = new FontFace('f2', url('Roboto/Roboto-Italic.ttf'));
      f3.load(); // but never registered, so shouldn't show up below
      const cascade = () => getCascade(style({fontFamily: ['f1', 'f2']}), 'en');
      expect(cascade().matches.length).to.equal(0);
      f2.load();
      expect(cascade().matches.length).to.equal(0);
      fonts.add(f2);
      expect(cascade().matches.length).to.equal(1);
      fonts.add(f1);
      expect(cascade().matches.length).to.equal(1);
      f1.load();
      expect(cascade().matches.length).to.equal(2);
      fonts.delete(f1);
      fonts.delete(f2);
    });

    it('remembers the url on a loaded font (for backends to have)', function () {
      const furl = url('NotoSansArabic/NotoSansArabic-Regular.ttf');
      const cascade = () => getCascade(style({fontFamily: ['f1', 'Noto Sans Arabic']}), 'en');

      const f1 = new FontFace('f1', furl);
      f1.load();
      fonts.add(f1);
      expect(cascade().matches[0].url).to.equal(furl);
      fonts.delete(f1);

      const f2 = createFaceFromTables(furl);
      f2.load();
      fonts.add(f2);
      expect(cascade().matches[0].url.href).to.equal(furl.href);
      fonts.delete(f2);
    });

    it('rejects the load promise if the font 404s', async function () {
      const f1 = new FontFace('f1', new URL('http://notarealdomain.notarealtld/'));
      mock.method(global, 'fetch', async () => ({ok: false, status: 404}));
      let e;
      try {
        await f1.load();
      } catch (e2) {
        e = e2;
      }
      expect(e).to.be.an.instanceOf(Error);
      expect(f1.status).to.equal('error');
      const cascade = getCascade(style({fontFamily: ['f1']}), 'en');
      expect(cascade.matches.length).to.equal(0);
      mock.reset();
    });

    it('rejects the load promise if the font cannot be parsed', async function () {
      const f1 = new FontFace('f1', new URL('http://notarealdomain.notarealtld/'));
      const arrayBuffer = () => Buffer.from('nonsense');
      mock.method(global, 'fetch', async () => ({ok: true, status: 200, arrayBuffer}));
      let e;
      try {
        await f1.load();
      } catch (e2) {
        e = e2;
      }
      expect(e).to.be.an.instanceOf(Error);
      expect(f1.status).to.equal('error');
      const cascade = getCascade(style({fontFamily: ['f1']}), 'en');
      expect(cascade.matches.length).to.equal(0);
      mock.reset();
    });

    it('updates status and promise when a font loads', async function () {
      const f1 = new FontFace('f1', new URL('http://notarealdomain.notarealtld/'));
      const pstack = [];
      const fetch = async () => {
        await pstack.at(-1).promise;
        return {ok: true, status: 200, arrayBuffer};
      };
      const push = () => pstack.push(Promise.withResolvers());
      const pop = err => err ? pstack.pop().reject(err) : pstack.pop().resolve();
      let ready = false;

      mock.method(global, 'fetch', fetch);

      expect(fonts.status).to.equal('loaded');
      fonts.add(f1);
      expect(fonts.status).to.equal('loaded');
      push();
      const load = f1.load();
      fonts.ready.then(() => ready = true);
      expect(fonts.status).to.equal('loading');
      pop();
      await load;
      expect(fonts.status).to.equal('loaded');
      expect(ready).to.be.true;

      mock.reset();
    });

    it('updates status and promise when all fonts load or error', async function () {
      const f1 = new FontFace('f1', new URL('http://notarealdomain.notarealtld/'));
      const f2 = new FontFace('f2', new URL('http://notarealdomain.notarealtld/'));
      const pstack = [];
      const fetch = async () => {
        await pstack.at(-1).promise;
        return {ok: true, status: 200, arrayBuffer};
      };
      const push = () => pstack.push(Promise.withResolvers());
      const pop = err => err ? pstack.pop().reject(err) : pstack.pop().resolve();

      mock.method(global, 'fetch', fetch);

      fonts.add(f1);
      fonts.add(f2);
      push();
      push();
      const f1load =f1.load();
      let ready = false;
      expect(fonts.status).to.equal('loading');
      fonts.ready.then(() => ready = true);
      pop(new Error('err'));
      try { await f1load; } catch {}
      expect(fonts.status).to.equal('loading');
      const f2load = f2.load();
      expect(fonts.status).to.equal('loading');
      pop();
      await f2load;
      expect(fonts.status).to.equal('loaded');
      expect(f1.status).to.equal('error');
      expect(f2.status).to.equal('loaded');

      expect(ready).to.be.true;

      mock.reset();
    });

    it('updates status and promise when a loading font is added/removed', async function () {
      const f1 = new FontFace('f1', new URL('http://notarealdomain.notarealtld/'));
      const fetch = async () => {
        await Promise.withResolvers().promise;
        return {ok: true, status: 200, arrayBuffer};
      };
      f1.load();
      fonts.add(f1);
      expect(fonts.status).to.equal('loading');
      fonts.delete(f1);
      expect(fonts.status).to.equal('loaded');
    });

    it('clears FontFaceSet', async function () {
      const f1 = new FontFace('f1', new URL('http://notarealdomain.notarealtld/'));
      const f2 = new FontFace('f2', new URL('http://notarealdomain.notarealtld/'));
      mock.method(global, 'fetch', async () => ({ok: true, status: 200, arrayBuffer}));
      f1.load();
      f2.load();
      fonts.add(f1);
      fonts.add(f2);
      expect(fonts.status).to.equal('loading');
      fonts.clear();
      expect(fonts.status).to.equal('loaded');
      expect([...fonts].length).to.equal(0);
      mock.reset();
    });
  });
});

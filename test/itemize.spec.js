import wasm from '../src/wasm.ts';
import {expect} from 'chai';
import {
  createBidiIteratorState,
  bidiIteratorNext,
  createEmojiIteratorState,
  emojiIteratorNext,
  createScriptIteratorState,
  scriptIteratorNext,
  createNewlineIteratorState,
  newlineIteratorNext,
  createStyleIteratorState,
  styleIteratorNext
} from '../src/text-itemize.ts';
import * as flow from 'dropflow';
import parse from 'dropflow/parse.js';
import {registerFontAsset, unregisterFontAsset} from '../assets/register.ts';

const {malloc, free} = wasm.instance.exports;

function createJsString(str) {
  const buffer = wasm.instance.exports.memory.buffer;
  const ptr = malloc(str.length * 2);
  const words = new Uint16Array(buffer, ptr, str.length);
  for (let i = 0; i < words.length; ++i) words[i] = str.charCodeAt(i);
  return {
    ptr: ptr,
    length: words.length,
    free: function () { free(ptr); }
  };
}

function layout(html) {
  const el = parse(html);
  const bc = flow.generate(el);
  flow.layout(bc);
  return bc;
}

// These tests are mostly useful for debugging. They should already be covered
// by the higher-level flow tests
describe('Itemization', function () {
  describe('Bidi', function () {
    it('finishes on all ltr text', function () {
      const str = createJsString('hello world');
      const state = createBidiIteratorState(str.ptr, str.length);
      bidiIteratorNext(state);
      expect(state.offset).to.equal(11);
      expect(state.level).to.equal(0);
      expect(state.done).to.be.true;
      str.free();
    });

    it('finishes on all rtl text', function () {
      const str = createJsString('مرحبا بالعالم');
      const state = createBidiIteratorState(str.ptr, str.length);
      bidiIteratorNext(state);
      expect(state.offset).to.equal(13);
      expect(state.level).to.equal(1);
      expect(state.done).to.be.true;
      str.free();
    });

    it('stops at the right places in bidi text', function () {
      const str = createJsString('apple: تفاحة orange: تفاحة');
      const state = createBidiIteratorState(str.ptr, str.length);

      // apple: 
      bidiIteratorNext(state);
      expect(state.offset).to.equal(7);
      expect(state.level).to.equal(0);
      expect(state.done).to.be.false;
      // apple: تفاحة 
      bidiIteratorNext(state);
      expect(state.offset).to.equal(12);
      expect(state.level).to.equal(1);
      expect(state.done).to.be.false;
      // apple: تفاحة orange: 
      bidiIteratorNext(state);
      expect(state.offset).to.equal(21);
      expect(state.level).to.equal(0);
      expect(state.done).to.be.false;
      // apple: تفاحة orange: تفاحة
      bidiIteratorNext(state);
      expect(state.offset).to.equal(26);
      expect(state.level).to.equal(1);
      expect(state.done).to.be.true;

      str.free();
    });
  });

  describe('Emoji', function () {
    it('finishes on all non-emoji text', function () {
      const str = createJsString('hello world');
      const state = createEmojiIteratorState(str.ptr, str.length);
      emojiIteratorNext(state);
      expect(state.offset).to.equal(11);
      expect(state.isEmoji).to.be.false;
      expect(state.done).to.be.true;
      str.free();
    });

    it('finishes on all emoji text', function () {
      const str = createJsString('👨‍👩‍👦🚌');
      const state = createEmojiIteratorState(str.ptr, str.length);
      emojiIteratorNext(state);
      expect(state.offset).to.equal(10);
      expect(state.isEmoji).to.be.true;
      expect(state.done).to.be.true;
      str.free();
    });

    it('stops at the right places in text with emojis', function () {
      const str = createJsString('fam 👨‍👩‍👦 bus 🚌');
      const state = createEmojiIteratorState(str.ptr, str.length);

      // fam 
      emojiIteratorNext(state);
      expect(state.offset).to.equal(4);
      expect(state.isEmoji).to.be.false;
      expect(state.done).to.be.false;
      // fam 👨‍👩‍👦
      emojiIteratorNext(state);
      expect(state.offset).to.equal(12);
      expect(state.isEmoji).to.be.true;
      expect(state.done).to.be.false;
      // fam 👨‍👩‍👦 bus 
      emojiIteratorNext(state);
      expect(state.offset).to.equal(17);
      expect(state.isEmoji).to.be.false;
      expect(state.done).to.be.false;
      // fam 👨‍👩‍👦 bus 🚌
      emojiIteratorNext(state);
      expect(state.offset).to.equal(19);
      expect(state.isEmoji).to.be.true;
      expect(state.done).to.be.true;

      str.free();
    });
  });

  describe('Script', function () {
    it('finishes on all Latin text', function () {
      const str = createJsString('hello world');
      const state = createScriptIteratorState(str.ptr, str.length);
      scriptIteratorNext(state);
      expect(state.script).to.equal('Latin');
      expect(state.offset).to.equal(11);
      expect(state.done).to.be.true;
      str.free();
    });

    it('finishes on all Arabic text', function () {
      const str = createJsString('إني مشتاق إليك 123');
      const state = createScriptIteratorState(str.ptr, str.length);
      scriptIteratorNext(state);
      expect(state.script).to.equal('Arabic');
      expect(state.offset).to.equal(18);
      expect(state.done).to.be.true;
      str.free();
    });

    it('stops at the right places with Latin and Arabic', function () {
      const str = createJsString('apple: تفاحة orange: تفاحة');
      const state = createScriptIteratorState(str.ptr, str.length);

      // apple: 
      scriptIteratorNext(state);
      expect(state.offset).to.equal(7);
      expect(state.script).to.equal('Latin');
      expect(state.done).to.be.false;
      // apple: تفاحة
      scriptIteratorNext(state);
      expect(state.offset).to.equal(13);
      expect(state.script).to.equal('Arabic');
      expect(state.done).to.be.false;
      // apple: تفاحة orange: 
      scriptIteratorNext(state);
      expect(state.offset).to.equal(21);
      expect(state.script).to.equal('Latin');
      expect(state.done).to.be.false;
      // apple: تفاحة orange: تفاحة
      scriptIteratorNext(state);
      expect(state.offset).to.equal(26);
      expect(state.script).to.equal('Arabic');
      expect(state.done).to.be.true;

      str.free();
    });

    it('goes back to the previous script with parens', function () {
      const str = createJsString('آلو (hello) 123');
      const state = createScriptIteratorState(str.ptr, str.length);

      // آلو (
      scriptIteratorNext(state);
      expect(state.offset).to.equal(5);
      expect(state.script).to.equal('Arabic');
      expect(state.done).to.be.false;

      //آلو (hello
      scriptIteratorNext(state);
      expect(state.offset).to.equal(10);
      expect(state.script).to.equal('Latin');
      expect(state.done).to.be.false;

      //آلو (hello) 123
      scriptIteratorNext(state);
      expect(state.offset).to.equal(15);
      expect(state.script).to.equal('Arabic');
      expect(state.done).to.be.true;

      str.free();
    });
  });

  describe('Newline', function () {
    it('goes to the end if no newlines', function () {
      const state = createNewlineIteratorState('hello world');
      newlineIteratorNext(state);
      expect(state.done).to.be.true;
      expect(state.offset).to.equal(11);
    });

    it('stops at \\n correctly', function () {
      const state = createNewlineIteratorState('hello\nworld');

      newlineIteratorNext(state);
      expect(state.done).to.be.false;
      expect(state.offset).to.equal(6);

      newlineIteratorNext(state);
      expect(state.done).to.be.true;
      expect(state.offset).to.equal(11);
    });

    it('crosses two \\ns correctly', function () {
      const state = createNewlineIteratorState('abc\n\n123');

      newlineIteratorNext(state);
      expect(state.done).to.be.false;
      expect(state.offset).to.equal(4);

      newlineIteratorNext(state);
      expect(state.done).to.be.false;
      expect(state.offset).to.equal(5);

      newlineIteratorNext(state);
      expect(state.done).to.be.true;
      expect(state.offset).to.equal(8);
    });
  });

  describe('Inline / Style', function () {
    before(function () {
      registerFontAsset('Arimo/Arimo-Regular.ttf');
    });

    it('stops at the end when all is the same', function () {
      /** @type {import('../src/layout-flow.ts').IfcInline} */
      const ifc = layout(`
        <div style="font-size: 8px;">
          <span style="font-size: 8px;">hello</span>
          <span style="font-size: 8px;">
            <span><span><span>chump</span></span</span>
          </span>
        </div>
      `).children[0].ifc;
      const state = createStyleIteratorState(ifc);

      styleIteratorNext(state);
      expect(state.offset).to.equal(13);
      expect(state.done).to.be.true;

    });

    it('stops at font changes', function () {
      /** @type {import('../src/layout-flow.ts').IfcInline} */
      const ifc = layout(`
        <span style="font-size: 1px;">hello</span>
        <span style="font-size: 2px;">world</span>
      `).ifc;
      const state = createStyleIteratorState(ifc);

      styleIteratorNext(state);
      expect(state.offset).to.equal(5);
      expect(state.done).to.be.false;

      styleIteratorNext(state);
      expect(state.offset).to.equal(6);
      expect(state.done).to.be.false;

      styleIteratorNext(state);
      expect(state.offset).to.equal(11);
      expect(state.done).to.be.false;

      styleIteratorNext(state);
      expect(state.offset).to.equal(12);
      expect(state.done).to.be.true;
    });

    it('stops at vertical-align changes', function () {
      /** @type {import('../src/layout-flow.ts').IfcInline} */
      const ifc = layout(`
        <span style="position: relative;">sanitizers:</span>
        bromine
        <span style="position: relative;">chlorine</span>
      `).ifc;
      const state = createStyleIteratorState(ifc);

      styleIteratorNext(state);
      expect(state.offset).to.equal(11);
      expect(state.done).to.be.false;

      styleIteratorNext(state);
      expect(state.offset).to.equal(20);
      expect(state.done).to.be.false;

      styleIteratorNext(state);
      expect(state.offset).to.equal(28);
      expect(state.done).to.be.false;

      styleIteratorNext(state);
      expect(state.offset).to.equal(29);
      expect(state.done).to.be.true;
    });

    it('stops at inline-block', function () {
      /** @type {import('../src/layout-flow.ts').IfcInline} */
      const ifc = layout(`
        cat
        <div style="display: inline-block;">dog</div>
        rat
      `).ifc;
      const state = createStyleIteratorState(ifc);

      styleIteratorNext(state);
      expect(state.offset).to.equal(4);
      expect(state.done).to.be.false;

      styleIteratorNext(state);
      expect(state.offset).to.equal(9);
      expect(state.done).to.be.true;
    });

    it('stops at position: relative', function () {
      /** @type {import('../src/layout-flow.ts').IfcInline} */
      const ifc = layout(`
        <span style="vertical-align: sub;">
          <span style="vertical-align: sub;">sub</span>
        </span>
      `).ifc;
      const state = createStyleIteratorState(ifc);

      styleIteratorNext(state);
      expect(state.offset).to.equal(1);
      expect(state.done).to.be.false;

      styleIteratorNext(state);
      expect(state.offset).to.equal(4);
      expect(state.done).to.be.false;

      styleIteratorNext(state);
      expect(state.offset).to.equal(5);
      expect(state.done).to.be.true;
    });

    it('stops with the right style with nested inlines', function () {
      /** @type {import('../src/layout-flow.ts').IfcInline} */
      const ifc = layout('<span style="font-family: Abc;">Abc</span>').ifc;
      const state = createStyleIteratorState(ifc);

      styleIteratorNext(state);
      expect(state.style.fontFamily[0]).to.equal('Abc');
      expect(state.offset).to.equal(3);
      expect(state.done).to.be.true;
    });

    it('stops at padding', function () {
      /** @type {import('../src/layout-flow.ts').IfcInline} */
      const ifc = layout(`
        <span>abc</span><span style="padding-left: 3px;">def</span>
      `).ifc;
      const state = createStyleIteratorState(ifc);

      styleIteratorNext(state);
      expect(state.offset).to.equal(3);
      expect(state.done).to.be.false;

      styleIteratorNext(state);
      expect(state.offset).to.equal(7);
      expect(state.done).to.be.true;
    });

    it('stops after negative margin', function () {
      /** @type {import('../src/layout-flow.ts').IfcInline} */
      const ifc = layout(`
        <span style="margin-right: -1px;">a</span> b
      `).ifc;
      const state = createStyleIteratorState(ifc);

      styleIteratorNext(state);
      expect(state.offset).to.equal(1);
      expect(state.done).to.be.false;

      styleIteratorNext(state);
      expect(state.offset).to.equal(4);
      expect(state.done).to.be.true;
    });

    it('stops after <img>', function () {
      /** @type {import('../src/layout-flow.ts').IfcInline} */
      const ifc = layout('a<img>b').ifc;
      const state = createStyleIteratorState(ifc);

      styleIteratorNext(state);
      expect(state.offset).to.equal(1);
      expect(state.done).to.be.false;

      styleIteratorNext(state);
      expect(state.offset).to.equal(2);
      expect(state.done).to.be.true;
    });

    after(function () {
      unregisterFontAsset('Arimo/Arimo-Regular.ttf');
    });
  });
});

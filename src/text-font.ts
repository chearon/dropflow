import * as hb from './text-harfbuzz.js';
import langCoverage from '../gen/lang-script-coverage.js';
import wasm from './wasm.js';
import {HbSet, hb_tag, HB_OT_TAG_GSUB, HB_OT_TAG_GPOS, HB_OT_LAYOUT_DEFAULT_LANGUAGE_INDEX} from './text-harfbuzz.js';
import {environment} from './environment.js';
import {nameToCode, tagToCode} from '../gen/script-names.js';
import {HTMLElement} from './dom.js';

import type {HbFace, HbFont} from './text-harfbuzz.js';
import type {Style, FontWeight, FontStyle, FontVariant, FontStretch} from './style.js';

// See FcStrContainsIgnoreCase in fcstr.c
function strContainsIgnoreCase(s1: string, s2: string) {
  return s1.replace(/ /g, '').toLowerCase().indexOf(s2) > -1;
}

// See FcContainsWeight in fcfreetype.c
function containsWeight(s: string) {
  if (strContainsIgnoreCase(s, 'thin')) return 100;
  if (strContainsIgnoreCase(s, 'extralight')) return 200;
  if (strContainsIgnoreCase(s, 'ultralight')) return 200;
  if (strContainsIgnoreCase(s, 'demilight')) return 350;
  if (strContainsIgnoreCase(s, 'semilight')) return 350;
  if (strContainsIgnoreCase(s, 'light')) return 300;
  if (strContainsIgnoreCase(s, 'book')) return 380;
  if (strContainsIgnoreCase(s, 'regular')) return 400;
  if (strContainsIgnoreCase(s, 'normal')) return 400;
  if (strContainsIgnoreCase(s, 'medium')) return 500;
  if (strContainsIgnoreCase(s, 'demibold')) return 600;
  if (strContainsIgnoreCase(s, 'demi')) return 600;
  if (strContainsIgnoreCase(s, 'semibold')) return 600;
  if (strContainsIgnoreCase(s, 'extrabold')) return 800;
  if (strContainsIgnoreCase(s, 'superbold')) return 800;
  if (strContainsIgnoreCase(s, 'ultrabold')) return 800;
  if (strContainsIgnoreCase(s, 'bold')) return 700;
  if (strContainsIgnoreCase(s, 'ultrablack')) return 1000;
  if (strContainsIgnoreCase(s, 'superblack')) return 1000;
  if (strContainsIgnoreCase(s, 'extrablack')) return 1000;
  // TODO ultra?
  if (strContainsIgnoreCase(s, 'black')) return 900;
  if (strContainsIgnoreCase(s, 'heavy')) return 900;
}

// See FcContainsWidth in fcfreetype.c
function containsStretch(s: string): FontStretch {
  if (strContainsIgnoreCase(s, 'ultracondensed')) return 'ultra-condensed';
  if (strContainsIgnoreCase(s, 'extracondensed')) return 'extra-condensed';
  if (strContainsIgnoreCase(s, 'semicondensed')) return 'semi-condensed';
  if (strContainsIgnoreCase(s, 'condensed')) return 'condensed';
  if (strContainsIgnoreCase(s, 'normal')) return 'normal';
  if (strContainsIgnoreCase(s, 'semiexpanded')) return 'semi-expanded';
  if (strContainsIgnoreCase(s, 'ultraexpanded')) return 'ultra-expanded';
  if (strContainsIgnoreCase(s, 'expanded')) return 'expanded';
  return 'normal';
}

// See FcContainsSlant in fcfreetype.c
function containsSlant(s: string): FontStyle {
  if (strContainsIgnoreCase(s, 'italic')) return 'italic';
  if (strContainsIgnoreCase(s, 'kursiv')) return 'italic';
  if (strContainsIgnoreCase(s, 'oblique')) return 'oblique';
  return 'normal';
}

const defaultFeatures = new Set([
  hb_tag('abvf'),
  hb_tag('abvs'),
  hb_tag('akhn'),
  hb_tag('blwf'),
  hb_tag('blws'),
  hb_tag('calt'),
  hb_tag('ccmp'),
  hb_tag('cfar'),
  hb_tag('cjct'),
  hb_tag('clig'),
  hb_tag('fin2'),
  hb_tag('fin3'),
  hb_tag('fina'),
  hb_tag('half'),
  hb_tag('haln'),
  hb_tag('init'),
  hb_tag('isol'),
  hb_tag('liga'),
  hb_tag('ljmo'),
  hb_tag('locl'),
  hb_tag('ltra'),
  hb_tag('ltrm'),
  hb_tag('med2'),
  hb_tag('medi'),
  hb_tag('mset'),
  hb_tag('nukt'),
  hb_tag('pref'),
  hb_tag('pres'),
  hb_tag('pstf'),
  hb_tag('psts'),
  hb_tag('rclt'),
  hb_tag('rlig'),
  hb_tag('rkrf'),
  hb_tag('rphf'),
  hb_tag('rtla'),
  hb_tag('rtlm'),
  hb_tag('tjmo'),
  hb_tag('vatu'),
  hb_tag('vert'),
  hb_tag('vjmo')
]);

const kerningFeatures = new Set([
  hb_tag('kern')
]);

const UninitializedSpaceFeatures = 0xff;
const NoSpaceFeatures = 0;
const HasSpaceFeatures = 1 << 0;
const KerningSpaceFeatures = 1 << 1;
const NonKerningSpaceFeatures = 1 << 2;

let uniqueFamily = 1;

export class LoadedFontFace {
  data: ArrayBufferLike;
  allocated: boolean;
  hbface: HbFace;
  hbfont: HbFont;
  /**
   * The family name referenced within dropflow and read during font matching
   */
  family: string;
  style: FontStyle;
  weight: number;
  stretch: FontStretch;
  variant: FontVariant;
  languages: Set<string>;
  /**
   * A globally unique family name. Used like a handle when interacting with the
   * render target, such as the first argument to the browser's FontFace and as
   * the font string given to ctx.font
   */
  uniqueFamily: string;
  /**
   * Only for logging. When users register an ArrayBuffer, this is
   * anon://family-weight-style
   */
  url: URL;
  spaceFeatures: number;
  defaultSubSpaceFeatures: Uint32Array;
  nonDefaultSubSpaceFeatures: Uint32Array;
  onDestroy?: () => void;

  _createHb(data: ArrayBufferLike, url?: URL) {
    const blob = hb.createBlob(new Uint8Array(data));
    if (blob.countFaces() !== 1) {
      blob.destroy();
      if (url) {
        throw new SyntaxError(`Error reading font ${url}`);
      } else {
        throw new SyntaxError('Error reading font');
      }
    }
    const hbface = hb.createFace(blob, 0);
    const hbfont = hb.createFont(hbface);
    blob.destroy();
    return {hbface, hbfont};
  }

  _createUrl(desc: {family: string; weight: number; style: string}) {
    const family = encodeURI(desc.family.replaceAll(' ', '-'));
    return new URL(`anon://${family}-${desc.weight}-${desc.style}`);
  }

  constructor(data: ArrayBufferLike, face?: FontFace, url?: URL) {
    this.data = data;
    this.allocated = true;

    if (!url && face) url = this._createUrl(face);

    const {hbface, hbfont} = this._createHb(data, url);
    this.hbface = hbface;
    this.hbfont = hbfont;

    const desc = face || this.describeSelfFromTables();

    this.family = desc.family;
    this.style = desc.style;
    this.weight = desc.weight;
    this.stretch = desc.stretch;
    this.variant = desc.variant;
    this.languages = 'languages' in desc ? desc.languages : this.getLanguages();
    this.uniqueFamily = `${this.family}_${String(uniqueFamily++).padStart(4, '0')}`;

    if (!url) url = this._createUrl(this);
    this.url = url;

    this.spaceFeatures = UninitializedSpaceFeatures;
    this.defaultSubSpaceFeatures = new Uint32Array(Math.ceil(nameToCode.size / 32));
    this.nonDefaultSubSpaceFeatures = new Uint32Array(Math.ceil(nameToCode.size / 32));
  }

  /**
   * Ensures HbFace and HbFont instances. This gets called synchronously (by the
   * ctor) when the font is first loaded for proper error handling, and gets
   * called again when it's added to the "font face source" (`flow.fonts`).
   */
  allocate() {
    if (!this.allocated) {
      const {hbface, hbfont} = this._createHb(this.data);
      this.hbface = hbface;
      this.hbfont = hbfont;
      this.allocated = true;
    }
  }

  /**
   * Deallocates HbFace and HbFont instances. This gets called when the font is
   * removed from the "font face source" (`flow.fonts`) and whenever the
   * FontFace is GC'd, via FinalizationRegistry. We could only do the latter,
   * but GC performs much better if we don't wait for the FinalizationRegistry.
   */
  deallocate() {
    if (this.allocated) {
      this.onDestroy?.();
      this.hbface.destroy();
      this.hbfont.destroy();
      this.allocated = false;
    }
  }

  private getExclusiveLanguage() {
    const os2 = this.hbface.referenceTable('OS/2');
    const buffer = os2.getData();
    const words = new Uint16Array(buffer);
    const [version] = words;

    if (version === 1 || version === 2 || version === 3 || version == 4 || version === 5) {
      const codePageRange1 = buffer[78 /* bytes */ / 2];
      const bits17to20 = codePageRange1 & 0x1E0000;
      if ((codePageRange1 & (1 << 17)) === bits17to20) return 'ja';
      if ((codePageRange1 & (1 << 18)) === bits17to20) return 'zh-cn';
      if ((codePageRange1 & (1 << 19)) === bits17to20) return 'ko';
      if ((codePageRange1 & (1 << 20)) === bits17to20) return 'zh-tw';
    }

    os2.destroy();
  }

  static isExclusiveLang(lang: string) {
    // Fontconfig says: Keep Han languages separated by eliminating languages
    // that the codePageRange bits says aren't supported
    return lang === 'ja' || lang === 'zh-cn' || lang === 'ko' || lang === 'zh-tw';
  }

  private getLanguages() {
    const fontCoverage = this.hbface.collectUnicodes();
    const langs: Set<string> = new Set();
    const exclusiveLang = this.getExclusiveLanguage();

    if (exclusiveLang) langs.add(exclusiveLang);

    for (const lang of langCoverage) {
      // Fontconfig says: Check for Han charsets to make fonts which advertise
      // support for a single language not support other Han languages
      if (exclusiveLang && LoadedFontFace.isExclusiveLang(lang) && lang !== exclusiveLang) {
        continue;
      }

      const heapu32 = new Uint32Array(wasm.instance.exports.memory.buffer);
      const setPtr = heapu32[wasm.instance.exports[lang + '_coverage'].value / 4];
      const testSet = new HbSet(setPtr).copy();
      testSet.subtract(fontCoverage);
      if (testSet.getPopulation() === 0) langs.add(lang);
      testSet.destroy();
    }
    fontCoverage.destroy();
    return langs;
  }

  private describeSelfFromTables() {
    const subfamily = this.hbface.getName(17, 'en') || this.hbface.getName(2, 'en');
    const family = this.hbface.getName(16, 'en') || this.hbface.getName(1, 'en');
    const languages = this.getLanguages();

    let weight = containsWeight(subfamily);
    if (!weight) weight = this.hbfont.getStyle('wght');

    let style = containsSlant(subfamily);
    if (!style) {
      const italic = this.hbfont.getStyle('ital') !== 0;
      const slant = this.hbfont.getStyle('slnt');
      style = italic ? 'italic' : slant ? 'oblique' : 'normal';
    }

    let stretch = containsStretch(subfamily);
    if (!stretch) stretch = 'normal';

    return {family, weight, style, stretch, variant: 'normal' as const, languages};
  }

  getBuffer() {
    const blob = this.hbface.referenceBlob();
    const data = blob.getData();
    blob.destroy();
    return data;
  }

  private getLookupsByLangScript(
    table: number,
    scriptIndex: number,
    langIndex: number,
    specificFeatures: Set<number>,
    specificLookups: HbSet,
    otherLookups: HbSet
  ) {
    const featureIndexes = this.hbface.getFeatureIndexes(table, scriptIndex, langIndex);
    const featureTags = this.hbface.getFeatureTags(table, scriptIndex, langIndex);

    // TODO a quick look at the HarfBuzz source makes me think this is already
    // returned in hb_ot_layout_language_get_feature_indexes, but Firefox makes
    // this call
    const requiredIndex = this.hbface.getRequiredFeatureIndex(table, scriptIndex, langIndex);
    if (requiredIndex > -1) featureIndexes.push(requiredIndex);

    for (let i = 0; i < featureIndexes.length; i++) {
      const set = specificFeatures.has(featureTags[i]) ? specificLookups : otherLookups;
      this.hbface.getLookupsByFeature(table, featureIndexes[i], set);
    }
  }

  private hasLookupRuleWithGlyphByScript(
    table: number,
    scriptIndex: number,
    glyph: number,
    specificFeatures: Set<number>,
    stopAfterSpecificFound = true
  ) {
    const numLangs = this.hbface.getNumLangsForScript(table, scriptIndex);
    const specificLookups = hb.createSet();
    const otherLookups = hb.createSet();
    const glyphs = hb.createSet();
    let inSpecific = false;
    let inNonSpecific = false;

    this.getLookupsByLangScript(
      table,
      scriptIndex,
      HB_OT_LAYOUT_DEFAULT_LANGUAGE_INDEX,
      specificFeatures,
      specificLookups,
      otherLookups
    );

    for (let langIndex = 0; langIndex < numLangs; langIndex++) {
      this.getLookupsByLangScript(
        table,
        scriptIndex,
        langIndex,
        specificFeatures,
        specificLookups,
        otherLookups
      );
    }

    for (const lookupIndex of specificLookups) {
      this.hbface.collectGlyphs(table, lookupIndex, glyphs, glyphs, glyphs);
      if (glyphs.has(glyph)) {
        inSpecific = true;
        break;
      }
    }

    if (!stopAfterSpecificFound || !inSpecific) {
      glyphs.clear();
      for (const lookupIndex of otherLookups) {
        this.hbface.collectGlyphs(table, lookupIndex, glyphs, glyphs, glyphs);
        if (glyphs.has(glyph)) {
          inNonSpecific = true;
          break;
        }
      }
    }

    specificLookups.destroy();
    otherLookups.destroy();
    glyphs.destroy();

    return {inSpecific, inNonSpecific};
  }

  private checkForFeaturesInvolvingSpace() {
    this.spaceFeatures = NoSpaceFeatures;

    if (this.hbfont.getNominalGlyph(32)) {
      const spaceGlyph = this.hbfont.getNominalGlyph(32);
      const scripts = this.hbface.getScripts();

      if (this.hbface.hasSubstitution()) {
        for (let scriptIndex = 0; scriptIndex < scripts.length; scriptIndex++) {
          const {inSpecific, inNonSpecific} = this.hasLookupRuleWithGlyphByScript(
            HB_OT_TAG_GSUB,
            scriptIndex,
            spaceGlyph,
            defaultFeatures
          );

          if (inSpecific || inNonSpecific) {
            const scriptCode = tagToCode.get(scripts[scriptIndex]) || 0;
            const map = inSpecific
              ? this.defaultSubSpaceFeatures
              : this.nonDefaultSubSpaceFeatures;

            this.spaceFeatures |= HasSpaceFeatures;
            map[scriptCode >>> 5] |= (1 << (scriptCode & 31))
          }
        }
      }

      if (
        this.hbface.hasPositioning() &&
        !this.hasSubstitution(this.defaultSubSpaceFeatures, 0)
      ) {
        let inKerning = false;
        let inNonKerning = false;

        for (let scriptIndex = 0; scriptIndex < scripts.length; scriptIndex++) {
          const {inSpecific, inNonSpecific} = this.hasLookupRuleWithGlyphByScript(
            HB_OT_TAG_GPOS,
            scriptIndex,
            spaceGlyph,
            kerningFeatures,
            false
          );

          inKerning = inKerning || inSpecific;
          inNonKerning = inNonKerning || inNonSpecific;

          if (inKerning && inNonKerning) break;
        }

        if (inKerning) {
          this.spaceFeatures |= HasSpaceFeatures | KerningSpaceFeatures;
        }

        if (inNonKerning) {
          this.spaceFeatures |= HasSpaceFeatures | NonKerningSpaceFeatures;
        }
      }
    }
  }

  private hasSubstitution(map: Uint32Array, scriptCode: number) {
    return map[scriptCode >>> 5] & (1 << (scriptCode & 31));
  }

  private hasSubstitutionRulesWithSpaceLookups(scriptCode: number) {
    if (
      this.hasSubstitution(this.defaultSubSpaceFeatures, scriptCode) ||
      this.hasSubstitution(this.defaultSubSpaceFeatures, 0)
    ) return true;

    // TODO also check nonDefaultSubSpaceFeatures, but only when non-default
    // font features are set, which isn't yet possible

    return false;
  }

  spaceMayParticipateInShaping(script: string) {
    const scriptCode = nameToCode.get(script) || 0;

    if (this.spaceFeatures === UninitializedSpaceFeatures) {
      this.checkForFeaturesInvolvingSpace();
    }

    if (!(this.spaceFeatures & HasSpaceFeatures)) return false;

    if (
      this.hasSubstitutionRulesWithSpaceLookups(scriptCode) ||
      (this.spaceFeatures & NonKerningSpaceFeatures)
    ) return true;

    // TOOD: return this.spaceFeatures & KerningSpaceFeatures if kerning is
    // explicitly enabled, which isn't yet possible

    return false;
  }

  toFontString(size: number) {
    return `${size}px ${this.uniqueFamily}`;
  }
}

class Deferred<T> {
  status: 'unresolved' | 'resolved' | 'rejected';
  promise: Promise<T>;
  resolve!: (v: T) => void;
  reject!: (e?: unknown) => void;

  constructor() {
    this.status = 'unresolved';
    this.promise = new Promise((resolve, reject) => {
      this.resolve = (t: T) => {
        if (this.status === 'unresolved') {
          this.status = 'resolved';
          resolve(t);
        }
      };

      this.reject = (e: unknown) => {
        if (this.status === 'unresolved') {
          this.status = 'rejected';
          reject(e);
        }
      };
    });
  }
}

function externallyRegisterFont(face: LoadedFontFace) {
  const cb = environment.registerFont(face);
  if (typeof cb === 'function') face.onDestroy = cb;
}

const faceToLoaded = new WeakMap<FontFace, LoadedFontFace>();

// Currently everything is designed for only one instance of FontFaceSet since
// only one browser lets you have more than one. The spec allows you to create
// as many as you want, which could be cool. The tight coupling would require
// several changes to the implementations here and in FontFace, but it wouldn't
// be difficult.
class FontFaceSet {
  #loading = new Set<FontFace>();
  #loaded = new Set<FontFace>();
  #failed = new Set<FontFace>();
  #faces = new Set<FontFace>();
  #ready = new Deferred<FontFaceSet>;
  status: 'loading' | 'loaded' = 'loaded';

  [Symbol.iterator]() {
    return this.#faces.values();
  }

  get ready(): Promise<FontFaceSet> {
   return this.#ready.promise;
  }

  has(face: FontFace) {
    return this.#faces.has(face);
  }

  add(face: FontFace) {
    if (this.#faces.add(face)) {
      langCascade = undefined;
      urangeCascade = undefined;
      if (face.status === 'loading') this._onLoading(face);
      const loaded = faceToLoaded.get(face);
      if (loaded) {
        loaded.allocate();
        externallyRegisterFont(loaded);
      }
    }
    return this;
  }

  /** @internal */
  _switchToLoaded() {
    this.status = 'loaded';
    this.#ready.resolve(this);
    this.#loaded.clear();
    this.#failed.clear();
  }

  delete(face: FontFace) {
    if (this.#faces.delete(face)) {
      faceToLoaded.get(face)?.deallocate();
      faceToLoaded.delete(face);
      this.#loaded.delete(face);
      this.#failed.delete(face);
      if (this.#loading.delete(face) && this.#loading.size === 0) {
        this._switchToLoaded();
      }
      langCascade = undefined;
      urangeCascade = undefined;
      return true;
    }

    return false;
  }

  clear() {
    for (const face of this.#faces) faceToLoaded.get(face)?.deallocate();
    this.#faces.clear();
    this.#loaded.clear();
    this.#failed.clear();
    langCascade = undefined;
    urangeCascade = undefined;
    if (this.#loading.size !== 0) {
      this.#loading.clear();
      this._switchToLoaded();
    }
  }

  /** @internal */
  _onLoading(face: FontFace) {
    if (this.has(face)) {
      if (this.#loading.size === 0) {
        this.status = 'loading';
        if (this.#ready.status !== 'unresolved') {
          this.#ready = new Deferred();
        }
      }
      this.#loading.add(face);
    }
  }

  /** @internal */
  _onLoaded(face: FontFace, loaded: LoadedFontFace) {
    if (this.has(face)) {
      langCascade = undefined;
      this.#loaded.add(face);
      if (this.#loading.delete(face)) {
        if (this.#loading.size === 0) this._switchToLoaded();
        externallyRegisterFont(loaded);
      }
    }
  }

  /** @internal */
  _onError(face: FontFace) {
    if (this.has(face)) {
      this.#failed.add(face);
      if (this.#loading.delete(face) && this.#loading.size === 0) {
        this._switchToLoaded();
      }
    }
  }
}

const loadedFaceRegistry = new FinalizationRegistry<LoadedFontFace>(f => f.deallocate());

interface FontFaceDescriptors {
  style?: FontStyle;
  weight?: FontWeight | 'bold' | 'bolder' | 'lighter' | 'normal';
  stretch?: FontStretch;
  variant?: FontVariant;
  unicodeRange?: string;
}

let __font_face_skip_ctor_load = false;

function isWhitespace(c: string) {
  return c === ' ' || c === '\t' || c === '\r' || c === '\n' || c === '\f';
}

function parseHex(s: string, i: number, len: number): number {
  let v = 0;
  for (; len > 0; len--, i++) {
    const c = s[i];
    if (c === '?') v = v << 4;
    else if (c >= '0' && c <= '9') v = (v << 4) | (c.charCodeAt(0) - 48);
    else if (c >= 'a' && c <= 'f') v = (v << 4) | (c.charCodeAt(0) - 87);
    else if (c >= 'A' && c <= 'F') v = (v << 4) | (c.charCodeAt(0) - 55);
    else throw new SyntaxError('Invalid hex digit in unicode-range');
  }
  return v;
}

function parseUnicodeRange(range: string, set: HbSet) {
  let i = 0;
  const len = range.length;

  while (i < len) {
    while (i < len && isWhitespace(range[i])) i++;
    if (i === len) break;

    const c = range[i];
    if (c !== 'u' && c !== 'U') throw new SyntaxError('Expected u+ or U+ in unicode-range');
    i++;
    if (range[i] !== '+') throw new SyntaxError('Expected + after u in unicode-range');
    i++;

    // Count hex digits and question marks
    let hexLen = 0, qLen = 0;
    let j = i;
    while (j < len && hexLen < 6 && (
      (range[j] >= '0' && range[j] <= '9') ||
      (range[j] >= 'a' && range[j] <= 'f') ||
      (range[j] >= 'A' && range[j] <= 'F')
    )) { hexLen++; j++; }
    while (j < len && qLen < 5 && range[j] === '?') { qLen++; j++; }

    if (!hexLen || hexLen + qLen > 6) throw new SyntaxError('Invalid hex digits in unicode-range');

    // Parse single value or range
    const start = parseHex(range, i, hexLen);
    i = j;

    if (qLen) {
      const repeat = 1 << (qLen * 4);
      set.addRange(start, start + repeat - 1);
    } else if (i < len && range[i] === '-') {
      i++;
      j = i;
      while (j < len && j - i < 6 && (
        (range[j] >= '0' && range[j] <= '9') ||
        (range[j] >= 'a' && range[j] <= 'f') ||
        (range[j] >= 'A' && range[j] <= 'F')
      )) j++;
      if (j === i) throw new SyntaxError('Expected hex digits after - in unicode-range');
      const end = parseHex(range, i, j - i);
      if (end < start) throw new SyntaxError('Invalid range in unicode-range');
      set.addRange(start, end);
      i = j;
    } else {
      set.add(start);
    }

    while (i < len && isWhitespace(range[i])) i++;
    if (i === len) break;

    if (range[i] !== ',') throw new SyntaxError('Expected comma between unicode-range tokens');
    i++;
  }
}

export class FontFace {
  family: string;
  style: FontStyle;
  weight: number;
  stretch: FontStretch;
  variant: FontVariant;
  unicodeRange: string;
  status: 'unloaded' | 'loading' | 'loaded' | 'error';
  /** @internal */
  _unicodeRange: HbSet | undefined;
  #status: Deferred<FontFace>;
  #url: URL | undefined;
  #sync: boolean;

  constructor(
    family: string,
    source: URL | ArrayBufferLike,
    descriptors?: FontFaceDescriptors
  ) {
    this.family = family;
    this.style = descriptors?.style ?? 'normal';
    if (descriptors?.weight === 'bold' || descriptors?.weight === 'bolder') {
      this.weight = 700;
    } else if (descriptors?.weight === 'lighter') {
      this.weight = 300;
    } else if (descriptors?.weight === 'normal') {
      this.weight = 400;
    } else {
      this.weight = descriptors?.weight ?? 400;
    }
    this.stretch = descriptors?.stretch ?? 'normal';
    this.variant = descriptors?.variant ?? 'normal';
    this.unicodeRange = descriptors?.unicodeRange ?? 'U+0-10FFFF';
    this.status = 'unloaded';
    this.#status = new Deferred();

    if (descriptors?.unicodeRange) {
      this._unicodeRange = hb.createSet();
      parseUnicodeRange(descriptors.unicodeRange, this._unicodeRange);
    } else {
      this._unicodeRange = undefined;
    }

    if (source instanceof URL) {
      this.#url = source;
    } else if (!__font_face_skip_ctor_load) {
      this.#loadData(source);
    }

    this.#sync = false;
  }

  #onError(error: unknown) {
    this.status = 'error';
    fonts._onError(this);
    this.#status.reject(error);
  }

  /** @internal */
  _matchToLoaded(face: LoadedFontFace) {
    this.status = 'loaded';
    faceToLoaded.set(this, face);
    langCascade = undefined;
    urangeCascade = undefined;
    loadedFaceRegistry.register(this, face);
    fonts._onLoaded(this, face);
    this.#status.resolve(this);
  }

  /** @internal */
  _hasUnicode(unicode: number) {
    return !this._unicodeRange || this._unicodeRange.has(unicode);
  }

  #loadData(data: ArrayBufferLike, url?: URL) {
    let face: LoadedFontFace | undefined;

    try {
      face = new LoadedFontFace(data, this, url);
    } catch (e) {
      this.#onError(e);
    }

    if (face) this._matchToLoaded(face);
  }

  load(): Promise<FontFace> {
    if (!this.#url || this.status !== 'unloaded') return this.#status.promise;
    const url = this.#url;
    this.status = 'loading';
    fonts._onLoading(this);

    let result;
    try {
      if (this.#sync) {
        result = environment.resolveUrlSync(url);
      } else {
        result = environment.resolveUrl(url);
      }
    } catch (e) {
      this.#onError(e);
      if (this.#sync) throw e;
    }

    if (result instanceof Promise) {
      result.then(
        (data: ArrayBufferLike) => this.#loadData(data, url),
        (error: Error) => this.#onError(error)
      );
    } else if (result) {
      // #sync = true
      this.#loadData(result, url);
    }
    return this.#status.promise;
  }

  loadSync() {
    this.#sync = true;
    try {
      this.load();
      return this;
    } finally {
      this.#sync = false;
    }
  }

  get loaded() {
    return this.#status.promise;
  }
}

export const fonts = new FontFaceSet();

function createFaceFromTablesImpl(source: ArrayBufferLike, url?: URL): FontFace {
  const loaded = new LoadedFontFace(source, undefined, url);
  let face: FontFace | undefined;

  try {
    __font_face_skip_ctor_load = true;
    face = new FontFace(loaded.family, url || source, loaded);
  } finally {
    __font_face_skip_ctor_load = false;
  }

  face._matchToLoaded(loaded);

  return face;
}

// Dropflow's original font registration system was designed after OS
// implementations: read the font tables and strings and generate a good
// description from that.
//
// CSS moves the responsibility of creating font descriptions to the content
// author instead of the font author, so when dropflow's font system was
// redesigned to resemble the CSS Font Loading Module, the original code to
// read font tables could have become obsolete.
//
// But one thing I wanted to keep was knowing what languages the font supports
// during font selection, since this can produce much higher quality font
// fallbacks. The CSS Font Loading Module does not provide a way to specify
// this, and the CSSWG has turned the proposal down, sadly:
// https://github.com/w3c/csswg-drafts/issues/1744
// So I added a non-standard `languages` to `FontFaceDescriptors`.
//
// The other font values are convenient for the tests, or for when you don't
// care what the description is. Plus I didn't want to delete all this work!
export function createFaceFromTables(source: URL): FontFace | Promise<FontFace> {
  const res = environment.resolveUrl(source);
  return res.then(buf => createFaceFromTablesImpl(buf, source));
}

export function createFaceFromTablesSync(source: URL | ArrayBufferLike): FontFace {
  if (source instanceof URL) {
    const res = environment.resolveUrlSync(source);
    return createFaceFromTablesImpl(res, source);
  } else {
    return createFaceFromTablesImpl(source);
  }
}

interface FontDescriptors {
  family: string;
  style: FontStyle;
  weight: number;
  stretch: FontStretch;
  variant: FontVariant;
}

class FontCascadeBase<T extends FontDescriptors> {
  source: T[];

  /**
   * @param source fonts in prioritized order. All else equal, fonts earlier in
   * the list will be preferred over those later.
   */
  constructor(source: T[]) {
    this.source = source;
  }

  reset(source: T[]) {
    this.source = source;
  }

  static stretchToLinear: Record<FontStretch, number> = {
    'ultra-condensed': 1,
    'extra-condensed': 2,
    'condensed': 3,
    'semi-condensed': 4,
    'normal': 5,
    'semi-expanded': 6,
    'expanded': 7,
    'extra-expanded': 8,
    'ultra-expanded': 9,
  };

  narrowByFontStretch(style: Style, matches: T[]) {
    const toLinear = FontCascadeBase.stretchToLinear;
    const desiredLinearStretch = toLinear[style.fontStretch];
    const search = matches.slice()

    if (desiredLinearStretch <= 5) {
      search.sort((a, b) => toLinear[a.stretch] - toLinear[b.stretch]);
    } else {
      search.sort((a, b) => toLinear[b.stretch] - toLinear[a.stretch]);
    }

    let bestDistance = 10;
    let bestMatch = search[0];

    for (const match of search) {
      const distance = Math.abs(desiredLinearStretch - toLinear[match.stretch]);
      if (distance < bestDistance) {
        bestDistance = distance;
        bestMatch = match;
      }
    }

    return matches.filter(match => match.stretch === bestMatch.stretch);
  }

  narrowByFontStyle(style: Style, matches: T[]) {
    const italics = matches.filter(match => match.style === 'italic');
    const obliques = matches.filter(match => match.style === 'oblique');
    const normals = matches.filter(match => match.style === 'normal');

    if (style.fontStyle === 'italic') {
      return italics.length ? italics : obliques.length ? obliques : normals;
    }

    if (style.fontStyle === 'oblique') {
      return obliques.length ? obliques : italics.length ? italics : normals;
    }

    return normals.length ? normals : obliques.length ? obliques : italics;
  }

  narrowByFontWeight(style: Style, matches: T[]) {
    const desiredWeight = style.fontWeight;
    const exact = matches.find(match => match.weight === desiredWeight);
    let lt400 = desiredWeight < 400;

    if (exact) return exact;

    if (desiredWeight === 400) {
      const exact = matches.find(match => match.weight === 500);
      if (exact) return exact;
    } else if (desiredWeight === 500) {
      const exact = matches.find(match => match.weight === 400);
      if (exact) return exact;
      lt400 = true;
    }

    const below = matches.slice().filter(match => match.weight < desiredWeight);
    const above = matches.slice().filter(match => match.weight > desiredWeight);

    let bestMatch = matches[0];
    let bestWeightDistance = 1000;

    if (lt400) {
      below.sort((a, b) => b.weight - a.weight);
      above.sort((a, b) => a.weight - b.weight);

      for (const match of below) {
        const distance = Math.abs(match.weight - style.fontWeight);
        if (distance < bestWeightDistance) {
          bestWeightDistance = distance;
          bestMatch = match;
        }
      }

      for (const match of above) {
        const distance = Math.abs(match.weight - style.fontWeight);
        if (distance < bestWeightDistance) {
          bestWeightDistance = distance;
          bestMatch = match;
        }
      }
    } else {
      below.sort((a, b) => a.weight - b.weight);
      above.sort((a, b) => b.weight - a.weight);

      for (const match of above) {
        const distance = Math.abs(match.weight - style.fontWeight);
        if (distance < bestWeightDistance) {
          bestWeightDistance = distance;
          bestMatch = match;
        }
      }

      for (const match of below) {
        const distance = Math.abs(match.weight - style.fontWeight);
        if (distance < bestWeightDistance) {
          bestWeightDistance = distance;
          bestMatch = match;
        }
      }
    }

    return bestMatch;
  }
}

export class LangFontCascade extends FontCascadeBase<LoadedFontFace> {
  private cache: WeakMap<Style, Map<string, LoadedFontFace[]>>;

  constructor(list: LoadedFontFace[]) {
    super(list);
    this.cache = new WeakMap();
  }

  sortByLang(style: Style, lang: string) {
    const ret = new Set<LoadedFontFace>();
    const selectedFamilies = new Set<string>();
    let matches = this.cache.get(style)?.get(lang);
    if (matches) return matches;

    let map1 = this.cache.get(style);
    if (!map1) this.cache.set(style, map1 = new Map());

    for (const searchFamily of style.fontFamily) {
      let matches: LoadedFontFace[] = [];

      for (const candidate of this.source) {
        if (candidate.family.toLowerCase().trim() === searchFamily.toLowerCase().trim()) {
          matches.push(candidate);
        }
      }

      if (!matches.length) continue;

      matches = this.narrowByFontStretch(style, matches);
      matches = this.narrowByFontStyle(style, matches);
      const match = this.narrowByFontWeight(style, matches);
      ret.add(match);
      selectedFamilies.add(match.family);
    }

    // Now we're at the point that the spec calls system fallbacks, since
    // this.matches could be empty. This could be adjusted in all kinds of
    // arbitrary ways. It's most important to ensure a fallback for the
    // language, which is based on the script.
    let languageCandidates: LoadedFontFace[] = [];
    for (const candidate of this.source) {
      if (candidate.languages.has(lang) && !ret.has(candidate)) {
        languageCandidates.push(candidate);
      }
    }

    if (languageCandidates.length) {
      languageCandidates = this.narrowByFontStretch(style, languageCandidates);
      languageCandidates = this.narrowByFontStyle(style, languageCandidates);
      const match = this.narrowByFontWeight(style, languageCandidates);
      ret.add(match);
      selectedFamilies.add(match.family);
    }

    // Finally, push one of each of the rest of the families
    const groups = new Map<string, LoadedFontFace[]>();
    for (const candidate of this.source) {
      if (!selectedFamilies.has(candidate.family)) {
        let candidates = groups.get(candidate.family);
        if (!candidates) groups.set(candidate.family, candidates = []);
        candidates.push(candidate);
      }
    }

    for (let candidates of groups.values()) {
      candidates = this.narrowByFontStretch(style, candidates);
      candidates = this.narrowByFontStyle(style, candidates);
      ret.add(this.narrowByFontWeight(style, candidates));
    }

    matches = [...ret];
    map1.set(lang, matches);
    return matches;
  }
}

// Note this is NOT cached, so use it very carefully. It isn't realistic to
// cache per unicode character; you should instead hold onto the result and
// use style.fontsEqual and _hasUnicode on the first match when iterating
// over document styles and characters.
class UrangeFontCascade extends FontCascadeBase<FontFace> {
  sortByUnicode(style: Style, unicode: number) {
    let ret = [];

    for (const searchFamily of style.fontFamily) {
      let matches: FontFace[] = [];

      for (const candidate of this.source) {
        if (
          candidate.family.toLowerCase().trim() === searchFamily.toLowerCase().trim() &&
          candidate._hasUnicode(unicode)
        ) matches.push(candidate);
      }

      if (!matches.length) continue;

      matches = this.narrowByFontStretch(style, matches);
      matches = this.narrowByFontStyle(style, matches);
      ret.push(this.narrowByFontWeight(style, matches));
    }

    if (!ret.length) {
      let matches: FontFace[] = [];

      for (const candidate of this.source) {
        if (candidate._hasUnicode(unicode)) matches.push(candidate);
      }

      if (matches.length) {
        matches = this.narrowByFontStretch(style, matches);
        matches = this.narrowByFontStyle(style, matches);
        ret.push(this.narrowByFontWeight(style, matches));
      }
    }

    return ret;
  }
}

let langCascade: LangFontCascade | undefined;
let urangeCascade: UrangeFontCascade | undefined;

export function getLangCascade(style: Style, lang: string) {
  if (!langCascade) {
    const list: LoadedFontFace[] = [];
    for (const face of fonts) {
      const match = faceToLoaded.get(face);
      if (match) list.push(match);
    }
    // reverse() is due to §4.5.1
    // https://drafts.csswg.org/css-fonts/#composite-fonts
    // If the unicode ranges overlap for a set of @font-face rules with the
    // same family and style descriptor values, the rules are ordered in the
    // reverse order they were defined; the last rule defined is the first to
    // be checked for a given character.
    langCascade = new LangFontCascade(list.reverse());
  }
  return langCascade.sortByLang(style, lang);
}

function getUrangeCascade() {
  if (!urangeCascade) {
    urangeCascade = new UrangeFontCascade([...fonts].reverse());
  }
  return urangeCascade;
}

export function eachRegisteredFont(cb: (family: LoadedFontFace) => void) {
  for (const face of fonts) {
    const match = faceToLoaded.get(face);
    if (match) cb(match);
  }
}

function loadFontsImpl(root: HTMLElement, cb: (face: FontFace) => void) {
  const stack = root.children.slice().reverse();
  const cache: {style: Style, faces: FontFace[]}[] = [];
  const cascade = getUrangeCascade();
  let entry: {style: Style, faces: FontFace[]} | undefined;

  if (!cascade.source.length) return;

  while (stack.length) {
    const el = stack.pop()!;
    if (el instanceof HTMLElement) {
      for (let i = el.children.length - 1; i >= 0; i--) stack.push(el.children[i]);
    } else {
      const isWsCollapsible = el.style.isWsCollapsible();
      let i = 0;
      while (i < el.text.length) {
        const code = el.text.charCodeAt(i++);
        const next = el.text.charCodeAt(i);
        let unicode = code;

        // Faster than using the string's builtin iterator in Firefox
        if ((0xd800 <= code && code <= 0xdbff) && (0xdc00 <= next && next <= 0xdfff)) {
          i++;
          unicode = ((code - 0xd800) * 0x400) + (next - 0xdc00) + 0x10000;
        }

        if (
          isWsCollapsible &&
          (unicode === 0x20 || unicode === 0x09 || unicode === 0x0a || unicode === 0x0d)
        ) continue;

        // Only recalc the cascade when the style changes or when the old list's
        // _first_ match doesn't support the character. That means that fallback
        // list for later characters may not be ideal, but we aren't required to
        // load every font in the user-specified fallback list.
        if (!entry?.style.fontsEqual(el.style, false) || !entry.faces[0]._hasUnicode(unicode)) {
          entry = cache.find(entry => entry.style.fontsEqual(el.style, false));
          if (!entry || !entry.faces[0]._hasUnicode(unicode)) {
            const matches = cascade.sortByUnicode(el.style, unicode);
            for (const font of matches) cb(font);
            entry = {style: el.style, faces: matches};
            cache.push(entry);
          }
        }
      }
    }
  }
}

export async function loadFonts(root: HTMLElement) {
  const promises: Promise<any>[] = [];
  const faces: FontFace[] = [];

  loadFontsImpl(root, face => {
    faces.push(face);
    const promise = face.load().catch(() => {
      // Swallowed. Users can unwrap face.loaded to get the error.
    });
    promises.push(promise);
  });

  await Promise.all(promises);

  return faces;
}

export function loadFontsSync(root: HTMLElement) {
  const faces: FontFace[] = [];

  loadFontsImpl(root, face => {
    faces.push(face);
    try {
      face.loadSync();
    } catch (e) {
      // Swallowed. Users can unwrap face.loaded to get the error.
    }
  });

  return faces;
}

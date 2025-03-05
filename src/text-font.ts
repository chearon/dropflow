import * as hb from './text-harfbuzz.js';
import langCoverage from '../gen/lang-script-coverage.js';
import wasm from './wasm.js';
import {HbSet, hb_tag, HB_OT_TAG_GSUB, HB_OT_TAG_GPOS, HB_OT_LAYOUT_DEFAULT_LANGUAGE_INDEX} from './text-harfbuzz.js';
import {environment} from './environment.js';
import {nameToCode, tagToCode} from '../gen/script-names.js';
import subsetIdToUrls from '../gen/system-fonts-database.js';
import UnicodeTrie from './text-unicode-trie.js';
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

const EMPTY_LANGUAGES = Object.freeze(new Set<string>());

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
    this.languages = 'languages' in desc ? desc.languages : EMPTY_LANGUAGES;
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
          this.status = 'resolved';
          reject(e);
        }
      };
    });
  }
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
      if (face.status === 'loading') this._onLoading(face);
      faceToLoaded.get(face)?.allocate();
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
      cascades = new WeakMap();
      return true;
    }

    return false;
  }

  clear() {
    this.#faces.clear();
    this.#loaded.clear();
    this.#failed.clear();
    cascades = new WeakMap();
    if (this.#loading.size !== 0) {
      this.#loading.clear();
      this._switchToLoaded();
    }
  }

  /** @internal */
  _onLoading(face: FontFace) {
    if (this.has(face) && this.#loading.size === 0) {
      this.#loading.add(face);
      this.status = 'loading';
      if (this.#ready.status !== 'unresolved') {
        this.#ready = new Deferred();
      }
    }
  }

  /** @internal */
  _onLoaded(face: FontFace) {
    if (this.has(face)) {
      this.#loaded.add(face);
      if (this.#loading.delete(face) && this.#loading.size === 0) {
        this._switchToLoaded();
      }
    }
  }

  /** @internal */
  _onError(face: FontFace) {
    if (this.has(face)) {
      this.#failed.add(face);
      this.#loading.delete(face);
    }
  }
}

const loadedFaceRegistry = new FinalizationRegistry<LoadedFontFace>(f => f.deallocate());

interface FontFaceDescriptors {
  style?: FontStyle;
  weight?: FontWeight;
  stretch?: FontStretch;
  variant?: FontVariant;
}

let __font_face_skip_ctor_load = false;

export class FontFace {
  family: string;
  style: FontStyle;
  weight: number;
  stretch: FontStretch;
  variant: FontVariant;
  status: 'unloaded' | 'loading' | 'loaded' | 'error';
  #status: Deferred<FontFace>;
  #url: URL | undefined;

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
    this.status = 'unloaded';
    this.#status = new Deferred();

    if (source instanceof URL) {
      this.#url = source;
    } else if (!__font_face_skip_ctor_load) {
      this.#loadData(source);
    }
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
    loadedFaceRegistry.register(this, face);
    fonts._onLoaded(this);
    environment.registerFont(face);
    this.#status.resolve(this);
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
    const result = environment.resolveUrl(url);
    if (result instanceof Promise) {
      result.then(
        (data: ArrayBufferLike) => this.#loadData(data, url),
        (error: Error) => this.#onError(error)
      );
    } else {
      // Allow for synchronous load() if the environment supports it. This is
      // an "extension" to the specification so it's easy to register file URLs
      // in node and then do layout immediately.
      this.#loadData(result, url);
    }
    return this.#status.promise;
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
export function createFaceFromTables(source: URL | ArrayBufferLike): FontFace | Promise<FontFace> {
  if (source instanceof URL) {
    const res = environment.resolveUrl(source);
    if (res instanceof Promise) {
      return res.then(buf => createFaceFromTablesImpl(buf, source));
    } else {
      return createFaceFromTablesImpl(res, source);
    }
  } else {
    return createFaceFromTablesImpl(source);
  }
}

class FontCascade {
  matches: LoadedFontFace[];
  style: Style;

  constructor(list: LoadedFontFace[], style: Style) {
    this.matches = list;
    this.style = style;
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

  narrowByFontStretch(matches: LoadedFontFace[]) {
    const toLinear = FontCascade.stretchToLinear;
    const desiredLinearStretch = toLinear[this.style.fontStretch];
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

  narrowByFontStyle(matches: LoadedFontFace[]) {
    const italics = matches.filter(match => match.style === 'italic');
    const obliques = matches.filter(match => match.style === 'oblique');
    const normals = matches.filter(match => match.style === 'normal');

    if (this.style.fontStyle === 'italic') {
      return italics.length ? italics : obliques.length ? obliques : normals;
    }

    if (this.style.fontStyle === 'oblique') {
      return obliques.length ? obliques : italics.length ? italics : normals;
    }

    return normals.length ? normals : obliques.length ? obliques : italics;
  }

  narrowByFontWeight(matches: LoadedFontFace[]) {
    const desiredWeight = this.style.fontWeight;
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
        const distance = Math.abs(match.weight - this.style.fontWeight);
        if (distance < bestWeightDistance) {
          bestWeightDistance = distance;
          bestMatch = match;
        }
      }

      for (const match of above) {
        const distance = Math.abs(match.weight - this.style.fontWeight);
        if (distance < bestWeightDistance) {
          bestWeightDistance = distance;
          bestMatch = match;
        }
      }
    } else {
      below.sort((a, b) => a.weight - b.weight);
      above.sort((a, b) => b.weight - a.weight);

      for (const match of above) {
        const distance = Math.abs(match.weight - this.style.fontWeight);
        if (distance < bestWeightDistance) {
          bestWeightDistance = distance;
          bestMatch = match;
        }
      }

      for (const match of below) {
        const distance = Math.abs(match.weight - this.style.fontWeight);
        if (distance < bestWeightDistance) {
          bestWeightDistance = distance;
          bestMatch = match;
        }
      }
    }

    return bestMatch;
  }

  sort(style: Style, lang: string) {
    const newMatches = new Set<LoadedFontFace>();
    const selectedFamilies = new Set<string>();

    for (const searchFamily of style.fontFamily) {
      let matches: LoadedFontFace[] = [];

      for (const candidate of this.matches) {
        if (candidate.family.toLowerCase().trim() === searchFamily.toLowerCase().trim()) {
          matches.push(candidate);
        }
      }

      if (!matches.length) continue;

      matches = this.narrowByFontStretch(matches);
      matches = this.narrowByFontStyle(matches);
      const match = this.narrowByFontWeight(matches);
      newMatches.add(match);
      selectedFamilies.add(match.family);
    }

    // Now we're at the point that the spec calls system fallbacks, since
    // this.matches could be empty. This could be adjusted in all kinds of
    // arbitrary ways. It's most important to ensure a fallback for the
    // language, which is based on the script.
    let languageCandidates: LoadedFontFace[] = [];
    for (const candidate of this.matches) {
      if (candidate.languages.has(lang) && !newMatches.has(candidate)) {
        languageCandidates.push(candidate);
      }
    }

    if (languageCandidates.length) {
      languageCandidates = this.narrowByFontStretch(languageCandidates);
      languageCandidates = this.narrowByFontStyle(languageCandidates);
      const match = this.narrowByFontWeight(languageCandidates);
      newMatches.add(match);
      selectedFamilies.add(match.family);
    }

    // Finally, push one of each of the rest of the families
    const groups = new Map<string, LoadedFontFace[]>();
    for (const candidate of this.matches) {
      if (!selectedFamilies.has(candidate.family)) {
        let candidates = groups.get(candidate.family);
        if (!candidates) groups.set(candidate.family, candidates = []);
        candidates.push(candidate);
      }
    }

    for (let candidates of groups.values()) {
      candidates = this.narrowByFontStretch(candidates);
      candidates = this.narrowByFontStyle(candidates);
      newMatches.add(this.narrowByFontWeight(candidates));
    }

    this.matches = [...newMatches];
  }
}

let cascades = new WeakMap<Style, Map<string, FontCascade>>();

export function getCascade(style: Style, lang: string) {
  let cascade = cascades.get(style)?.get(lang);
  if (!cascade) {
    let map1 = cascades.get(style);
    if (!map1) cascades.set(style, map1 = new Map());
    const list: LoadedFontFace[] = [];
    for (const face of fonts) {
      const match = faceToLoaded.get(face);
      if (match) list.push(match);
    }
    cascade = new FontCascade(list, style);
    cascade.sort(style, lang);
    map1.set(lang, cascade);
  }
  return cascade;
}

export function eachRegisteredFont(cb: (family: LoadedFontFace) => void) {
  for (const face of fonts) {
    const match = faceToLoaded.get(face);
    if (match) cb(match);
  }
}

const systemFontTrie = new UnicodeTrie(wasm.instance.exports.system_font_trie.value);

export function getFontUrls(root: HTMLElement) {
  const stack = root.children.slice();
  const subsetIds = new Set<number>();

  while (stack.length) {
    const el = stack.pop()!;
    if (el instanceof HTMLElement) {
      for (const child of el.children) stack.push(child);
    } else {
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

        const subsetId = systemFontTrie.get(unicode);
        if (subsetId) subsetIds.add(subsetId);
      }
    }
  }

  return [...subsetIds].flatMap(subsetId => subsetIdToUrls.get(subsetId)!);
}

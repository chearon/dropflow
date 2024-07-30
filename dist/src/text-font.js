import * as hb from './text-harfbuzz.js';
import langCoverage from '../gen/lang-script-coverage.js';
import wasm from './wasm.js';
import { HbSet, hb_tag, HB_OT_TAG_GSUB, HB_OT_TAG_GPOS, HB_OT_LAYOUT_DEFAULT_LANGUAGE_INDEX } from './text-harfbuzz.js';
import { registerPaintFont } from '#backend';
import { nameToCode, tagToCode } from '../gen/script-names.js';
import subsetIdToUrls from '../gen/system-fonts-database.js';
import UnicodeTrie from './text-unicode-trie.js';
import { HTMLElement } from './dom.js';
// See FcStrContainsIgnoreCase in fcstr.c
function strContainsIgnoreCase(s1, s2) {
    return s1.replace(/ /g, '').toLowerCase().indexOf(s2) > -1;
}
// See FcContainsWeight in fcfreetype.c
function containsWeight(s) {
    if (strContainsIgnoreCase(s, 'thin'))
        return 100;
    if (strContainsIgnoreCase(s, 'extralight'))
        return 200;
    if (strContainsIgnoreCase(s, 'ultralight'))
        return 200;
    if (strContainsIgnoreCase(s, 'demilight'))
        return 350;
    if (strContainsIgnoreCase(s, 'semilight'))
        return 350;
    if (strContainsIgnoreCase(s, 'light'))
        return 300;
    if (strContainsIgnoreCase(s, 'book'))
        return 380;
    if (strContainsIgnoreCase(s, 'regular'))
        return 400;
    if (strContainsIgnoreCase(s, 'normal'))
        return 400;
    if (strContainsIgnoreCase(s, 'medium'))
        return 500;
    if (strContainsIgnoreCase(s, 'demibold'))
        return 600;
    if (strContainsIgnoreCase(s, 'demi'))
        return 600;
    if (strContainsIgnoreCase(s, 'semibold'))
        return 600;
    if (strContainsIgnoreCase(s, 'extrabold'))
        return 800;
    if (strContainsIgnoreCase(s, 'superbold'))
        return 800;
    if (strContainsIgnoreCase(s, 'ultrabold'))
        return 800;
    if (strContainsIgnoreCase(s, 'bold'))
        return 700;
    if (strContainsIgnoreCase(s, 'ultrablack'))
        return 1000;
    if (strContainsIgnoreCase(s, 'superblack'))
        return 1000;
    if (strContainsIgnoreCase(s, 'extrablack'))
        return 1000;
    // TODO ultra?
    if (strContainsIgnoreCase(s, 'black'))
        return 900;
    if (strContainsIgnoreCase(s, 'heavy'))
        return 900;
}
// See FcContainsWidth in fcfreetype.c
function containsStretch(s) {
    if (strContainsIgnoreCase(s, 'ultracondensed'))
        return 'ultra-condensed';
    if (strContainsIgnoreCase(s, 'extracondensed'))
        return 'extra-condensed';
    if (strContainsIgnoreCase(s, 'semicondensed'))
        return 'semi-condensed';
    if (strContainsIgnoreCase(s, 'condensed'))
        return 'condensed';
    if (strContainsIgnoreCase(s, 'normal'))
        return 'normal';
    if (strContainsIgnoreCase(s, 'semiexpanded'))
        return 'semi-expanded';
    if (strContainsIgnoreCase(s, 'ultraexpanded'))
        return 'ultra-expanded';
    if (strContainsIgnoreCase(s, 'expanded'))
        return 'expanded';
}
// See FcContainsSlant in fcfreetype.c
function containsSlant(s) {
    if (strContainsIgnoreCase(s, 'italic'))
        return 'italic';
    if (strContainsIgnoreCase(s, 'kursiv'))
        return 'italic';
    if (strContainsIgnoreCase(s, 'oblique'))
        return 'oblique';
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
export class FaceMatch {
    face;
    font;
    filename;
    index;
    languages;
    families;
    family;
    weight;
    stretch;
    italic;
    oblique;
    spaceFeatures;
    defaultSubSpaceFeatures;
    nonDefaultSubSpaceFeatures;
    constructor(blob, index, filename) {
        this.face = hb.createFace(blob, index);
        this.font = hb.createFont(this.face);
        this.filename = filename;
        this.index = index;
        this.languages = this.getLanguages();
        const { families, family, weight, stretch, italic, oblique } = this.createDescription();
        this.families = families;
        this.family = family;
        this.weight = weight;
        this.stretch = stretch;
        this.italic = italic;
        this.oblique = oblique;
        this.spaceFeatures = UninitializedSpaceFeatures;
        this.defaultSubSpaceFeatures = new Uint32Array(Math.ceil(nameToCode.size / 32));
        this.nonDefaultSubSpaceFeatures = new Uint32Array(Math.ceil(nameToCode.size / 32));
    }
    destroy() {
        this.face.destroy();
        this.font.destroy();
    }
    getExclusiveLanguage() {
        const os2 = this.face.referenceTable('OS/2');
        const buffer = os2.getData();
        const words = new Uint16Array(buffer);
        const [version] = words;
        if (version === 1 || version === 2 || version === 3 || version == 4 || version === 5) {
            const codePageRange1 = buffer[78 /* bytes */ / 2];
            const bits17to20 = codePageRange1 & 0x1E0000;
            if ((codePageRange1 & (1 << 17)) === bits17to20)
                return 'ja';
            if ((codePageRange1 & (1 << 18)) === bits17to20)
                return 'zh-cn';
            if ((codePageRange1 & (1 << 19)) === bits17to20)
                return 'ko';
            if ((codePageRange1 & (1 << 20)) === bits17to20)
                return 'zh-tw';
        }
        os2.destroy();
    }
    static isExclusiveLang(lang) {
        // Fontconfig says: Keep Han languages separated by eliminating languages
        // that the codePageRange bits says aren't supported
        return lang === 'ja' || lang === 'zh-cn' || lang === 'ko' || lang === 'zh-tw';
    }
    getLanguages() {
        const fontCoverage = this.face.collectUnicodes();
        const langs = new Set();
        const exclusiveLang = this.getExclusiveLanguage();
        if (exclusiveLang)
            langs.add(exclusiveLang);
        for (const lang of langCoverage) {
            // Fontconfig says: Check for Han charsets to make fonts which advertise
            // support for a single language not support other Han languages
            if (exclusiveLang && FaceMatch.isExclusiveLang(lang) && lang !== exclusiveLang) {
                continue;
            }
            const heapu32 = new Uint32Array(wasm.instance.exports.memory.buffer);
            const setPtr = heapu32[wasm.instance.exports[lang + '_coverage'].value / 4];
            const testSet = new HbSet(setPtr).copy();
            testSet.subtract(fontCoverage);
            if (testSet.getPopulation() === 0)
                langs.add(lang);
            testSet.destroy();
        }
        fontCoverage.destroy();
        return langs;
    }
    getNames() {
        return {
            family: this.face.getName(1, 'en'),
            subfamily: this.face.getName(2, 'en'),
            fullName: this.face.getName(4, 'en'),
            postscriptName: this.face.getName(6, 'en'),
            preferredFamily: this.face.getName(16, 'en'),
            preferredSubfamily: this.face.getName(17, 'en'),
        };
    }
    getFamiliesFromNames(names) {
        const families = [];
        if (names.preferredFamily)
            families.push(names.preferredFamily);
        if (names.family)
            families.push(names.family);
        if (names.fullName)
            families.push(names.fullName);
        if (names.postscriptName)
            families.push(names.postscriptName);
        return families;
    }
    createDescription() {
        const names = this.getNames();
        const families = this.getFamiliesFromNames(names);
        const family = names.preferredFamily || names.family; // only used for final family grouping in fallbacks
        const font = hb.createFont(this.face);
        let weight = containsWeight(names.preferredSubfamily);
        if (!weight)
            weight = containsWeight(names.subfamily);
        if (!weight)
            weight = font.getStyle('wght');
        let slantKind = containsSlant(names.preferredSubfamily);
        if (!slantKind)
            slantKind = containsSlant(names.subfamily);
        if (!slantKind) {
            const italic = font.getStyle('ital') !== 0;
            const slant = font.getStyle('slnt');
            slantKind = italic ? 'italic' : slant ? 'oblique' : undefined;
        }
        let stretch = containsStretch(names.preferredSubfamily);
        if (!stretch)
            stretch = containsStretch(names.subfamily);
        if (!stretch)
            stretch = 'normal';
        const italic = slantKind === 'italic';
        const oblique = slantKind === 'oblique';
        font.destroy();
        return { families, family, weight, stretch, italic, oblique };
    }
    getLookupsByLangScript(table, scriptIndex, langIndex, specificFeatures, specificLookups, otherLookups) {
        const featureIndexes = this.face.getFeatureIndexes(table, scriptIndex, langIndex);
        const featureTags = this.face.getFeatureTags(table, scriptIndex, langIndex);
        // TODO a quick look at the HarfBuzz source makes me think this is already
        // returned in hb_ot_layout_language_get_feature_indexes, but Firefox makes
        // this call
        const requiredIndex = this.face.getRequiredFeatureIndex(table, scriptIndex, langIndex);
        if (requiredIndex > -1)
            featureIndexes.push(requiredIndex);
        for (let i = 0; i < featureIndexes.length; i++) {
            const set = specificFeatures.has(featureTags[i]) ? specificLookups : otherLookups;
            this.face.getLookupsByFeature(table, featureIndexes[i], set);
        }
    }
    hasLookupRuleWithGlyphByScript(table, scriptIndex, glyph, specificFeatures, stopAfterSpecificFound = true) {
        const numLangs = this.face.getNumLangsForScript(table, scriptIndex);
        const specificLookups = hb.createSet();
        const otherLookups = hb.createSet();
        const glyphs = hb.createSet();
        let inSpecific = false;
        let inNonSpecific = false;
        this.getLookupsByLangScript(table, scriptIndex, HB_OT_LAYOUT_DEFAULT_LANGUAGE_INDEX, specificFeatures, specificLookups, otherLookups);
        for (let langIndex = 0; langIndex < numLangs; langIndex++) {
            this.getLookupsByLangScript(table, scriptIndex, langIndex, specificFeatures, specificLookups, otherLookups);
        }
        for (const lookupIndex of specificLookups) {
            this.face.collectGlyphs(table, lookupIndex, glyphs, glyphs, glyphs);
            if (glyphs.has(glyph)) {
                inSpecific = true;
                break;
            }
        }
        if (!stopAfterSpecificFound || !inSpecific) {
            glyphs.clear();
            for (const lookupIndex of otherLookups) {
                this.face.collectGlyphs(table, lookupIndex, glyphs, glyphs, glyphs);
                if (glyphs.has(glyph)) {
                    inNonSpecific = true;
                    break;
                }
            }
        }
        specificLookups.destroy();
        otherLookups.destroy();
        glyphs.destroy();
        return { inSpecific, inNonSpecific };
    }
    checkForFeaturesInvolvingSpace() {
        this.spaceFeatures = NoSpaceFeatures;
        if (this.font.getNominalGlyph(32)) {
            const spaceGlyph = this.font.getNominalGlyph(32);
            const scripts = this.face.getScripts();
            if (this.face.hasSubstitution()) {
                for (let scriptIndex = 0; scriptIndex < scripts.length; scriptIndex++) {
                    const { inSpecific, inNonSpecific } = this.hasLookupRuleWithGlyphByScript(HB_OT_TAG_GSUB, scriptIndex, spaceGlyph, defaultFeatures);
                    if (inSpecific || inNonSpecific) {
                        const scriptCode = tagToCode.get(scripts[scriptIndex]) || 0;
                        const map = inSpecific
                            ? this.defaultSubSpaceFeatures
                            : this.nonDefaultSubSpaceFeatures;
                        this.spaceFeatures |= HasSpaceFeatures;
                        map[scriptCode >>> 5] |= (1 << (scriptCode & 31));
                    }
                }
            }
            if (this.face.hasPositioning() &&
                !this.hasSubstitution(this.defaultSubSpaceFeatures, 0)) {
                let inKerning = false;
                let inNonKerning = false;
                for (let scriptIndex = 0; scriptIndex < scripts.length; scriptIndex++) {
                    const { inSpecific, inNonSpecific } = this.hasLookupRuleWithGlyphByScript(HB_OT_TAG_GPOS, scriptIndex, spaceGlyph, kerningFeatures, false);
                    inKerning = inKerning || inSpecific;
                    inNonKerning = inNonKerning || inNonSpecific;
                    if (inKerning && inNonKerning)
                        break;
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
    hasSubstitution(map, scriptCode) {
        return map[scriptCode >>> 5] & (1 << (scriptCode & 31));
    }
    hasSubstitutionRulesWithSpaceLookups(scriptCode) {
        if (this.hasSubstitution(this.defaultSubSpaceFeatures, scriptCode) ||
            this.hasSubstitution(this.defaultSubSpaceFeatures, 0))
            return true;
        // TODO also check nonDefaultSubSpaceFeatures, but only when non-default
        // font features are set, which isn't yet possible
        return false;
    }
    spaceMayParticipateInShaping(script) {
        const scriptCode = nameToCode.get(script) || 0;
        if (this.spaceFeatures === UninitializedSpaceFeatures) {
            this.checkForFeaturesInvolvingSpace();
        }
        if (!(this.spaceFeatures & HasSpaceFeatures))
            return false;
        if (this.hasSubstitutionRulesWithSpaceLookups(scriptCode) ||
            (this.spaceFeatures & NonKerningSpaceFeatures))
            return true;
        // TOOD: return this.spaceFeatures & KerningSpaceFeatures if kerning is
        // explicitly enabled, which isn't yet possible
        return false;
    }
    toFontString(size) {
        const style = this.italic ? 'italic' : this.oblique ? 'oblique' : 'normal';
        return `${style} ${this.weight} ${this.stretch} ${size}px ${this.family}`;
    }
    toCssDescriptor() {
        return {
            family: this.family,
            weight: String(this.weight),
            style: this.italic ? 'italic' : this.oblique ? 'oblique' : 'normal',
            stretch: this.stretch
        };
    }
}
const registeredFonts = new Map();
export async function registerFont(arg1, arg2, arg3) {
    let buffer;
    let url;
    let options;
    if (arg1 instanceof ArrayBuffer) {
        buffer = new Uint8Array(arg1);
        url = arg2;
        options = arg3 || { paint: true };
    }
    else {
        url = arg1;
        buffer = null;
        options = arg2 || { paint: true };
    }
    const stringUrl = String(url);
    if (!registeredFonts.has(stringUrl)) {
        if (!buffer) {
            const arrayBuffer = await fetch(url).then(res => res.arrayBuffer());
            buffer = new Uint8Array(arrayBuffer);
        }
        const blob = hb.createBlob(buffer);
        const matches = [];
        for (let i = 0, l = blob.countFaces(); i < l; ++i) {
            const match = new FaceMatch(blob, i, stringUrl);
            // Browsers don't support registering collections because there would be
            // no way to clearly associate one description with one buffer. I suppose
            // this should be enforced elsewhere too...
            if (options.paint && i === 0 && l === 1) {
                registerPaintFont(match, buffer, url);
            }
            matches.push(match);
        }
        registeredFonts.set(stringUrl, matches);
        blob.destroy();
    }
}
export function unregisterFont(url) {
    const stringUrl = String(url);
    const matches = registeredFonts.get(stringUrl);
    if (matches) {
        for (const match of matches)
            match.destroy();
        registeredFonts.delete(stringUrl);
    }
    cascades = new WeakMap();
}
class FontCascade {
    matches;
    style;
    constructor(list, style) {
        this.matches = list;
        this.style = style;
    }
    static fromSet(set, style) {
        const list = [];
        for (const matches of set.values()) {
            for (const match of matches)
                list.push(match);
        }
        return new FontCascade(list, style);
    }
    static stretchToLinear = {
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
    narrowByFontStretch(matches) {
        const toLinear = FontCascade.stretchToLinear;
        const desiredLinearStretch = toLinear[this.style.fontStretch];
        const search = matches.slice();
        if (desiredLinearStretch <= 5) {
            search.sort((a, b) => toLinear[a.stretch] - toLinear[b.stretch]);
        }
        else {
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
    narrowByFontStyle(matches) {
        const italics = matches.filter(match => match.italic);
        const obliques = matches.filter(match => match.oblique);
        const normals = matches.filter(match => !match.oblique && !match.italic);
        if (this.style.fontStyle === 'italic') {
            return italics.length ? italics : obliques.length ? obliques : normals;
        }
        if (this.style.fontStyle === 'oblique') {
            return obliques.length ? obliques : italics.length ? italics : normals;
        }
        return normals.length ? normals : obliques.length ? obliques : italics;
    }
    narrowByFontWeight(matches) {
        const desiredWeight = this.style.fontWeight;
        const exact = matches.find(match => match.weight === desiredWeight);
        let lt400 = desiredWeight < 400;
        if (exact)
            return exact;
        if (desiredWeight === 400) {
            const exact = matches.find(match => match.weight === 500);
            if (exact)
                return exact;
        }
        else if (desiredWeight === 500) {
            const exact = matches.find(match => match.weight === 400);
            if (exact)
                return exact;
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
        }
        else {
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
    sort(style, lang) {
        const selectedFamilies = new Set();
        const newMatches = [];
        families: for (const searchFamily of style.fontFamily) {
            let matches = [];
            candidates: for (const candidate of this.matches) {
                for (const family of candidate.families) {
                    if (family.toLowerCase().trim() === searchFamily.toLowerCase().trim()) {
                        matches.push(candidate);
                        for (const selectedFamily of candidate.families) {
                            selectedFamilies.add(selectedFamily);
                        }
                        continue candidates;
                    }
                }
            }
            if (!matches.length)
                continue families;
            matches = this.narrowByFontStretch(matches);
            matches = this.narrowByFontStyle(matches);
            newMatches.push(this.narrowByFontWeight(matches));
        }
        // Now we're at the point that the spec calls system fallbacks, since
        // this.matches could be empty. This could be adjusted in all kinds of
        // arbitrary ways. It's most important to ensure a fallback for the
        // language, which is based on the script.
        let languageCandidates = [];
        for (const candidate of this.matches) {
            if (candidate.languages.has(lang)) {
                if (candidate.families.every(family => !selectedFamilies.has(family))) {
                    languageCandidates.push(candidate);
                }
            }
        }
        for (const selectedLanguageCandidate of languageCandidates) {
            for (const selectedFamily of selectedLanguageCandidate.families) {
                selectedFamilies.add(selectedFamily);
            }
        }
        if (languageCandidates.length) {
            languageCandidates = this.narrowByFontStretch(languageCandidates);
            languageCandidates = this.narrowByFontStyle(languageCandidates);
            newMatches.push(this.narrowByFontWeight(languageCandidates));
        }
        // Finally, push one of each of the rest of the families
        const groups = new Map();
        for (const candidate of this.matches) {
            if (!selectedFamilies.has(candidate.family)) {
                let candidates = groups.get(candidate.family);
                if (!candidates)
                    groups.set(candidate.family, candidates = []);
                candidates.push(candidate);
            }
        }
        for (let candidates of groups.values()) {
            candidates = this.narrowByFontStretch(candidates);
            candidates = this.narrowByFontStyle(candidates);
            newMatches.push(this.narrowByFontWeight(candidates));
        }
        this.matches = newMatches;
    }
}
let cascades = new WeakMap();
export function getCascade(style, lang) {
    let cascade = cascades.get(style)?.get(lang);
    if (!cascade) {
        let map1 = cascades.get(style);
        if (!map1)
            cascades.set(style, map1 = new Map());
        cascade = FontCascade.fromSet(registeredFonts, style);
        cascade.sort(style, lang);
        map1.set(lang, cascade);
    }
    return cascade;
}
export function eachRegisteredFont(cb) {
    for (const matches of registeredFonts.values()) {
        for (const match of matches)
            cb(match);
    }
}
export function firstCascadeItem() {
    return registeredFonts.values().next().value; // TODO Why is this any?
}
const systemFontTrie = new UnicodeTrie(wasm.instance.exports.system_font_trie.value);
export function getFontUrls(root) {
    const stack = root.children.slice();
    const subsetIds = new Set();
    while (stack.length) {
        const el = stack.pop();
        if (el instanceof HTMLElement) {
            for (const child of el.children)
                stack.push(child);
        }
        else {
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
                if (subsetId)
                    subsetIds.add(subsetId);
            }
        }
    }
    return [...subsetIds].flatMap(subsetId => subsetIdToUrls.get(subsetId));
}

import * as hb from './harfbuzz.js';
import langCoverage from '../gen/lang-script-coverage.js';
import wasm from './wasm.js';
import { HbSet } from './harfbuzz.js';
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
export class FaceMatch {
    constructor(face, font, filename, index) {
        this.face = face;
        this.font = font;
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
    }
    getExclusiveLanguage() {
        const os2 = this.face.reference_table('OS/2');
        if (os2) {
            const words = new Uint16Array(os2);
            const [version] = words;
            if (version === 1 || version === 2 || version === 3 || version == 4 || version === 5) {
                const codePageRange1 = os2[78 /* bytes */ / 2];
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
        }
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
    toFontString(size) {
        const style = this.italic ? 'italic' : this.oblique ? 'oblique' : 'normal';
        return `${style} ${this.weight} ${this.stretch} ${size}px ${this.family}`;
    }
    toNodeCanvas() {
        return {
            family: this.family,
            weight: String(this.weight),
            style: this.italic ? 'italic' : this.oblique ? 'oblique' : 'normal',
            stretch: this.stretch
        };
    }
}
const hbBlobs = new Map();
const hbFaces = new Map();
const hbFonts = new Map();
const faces = new Map();
try {
    var { registerFont: canvasRegisterFont } = await import('canvas');
}
catch (e) {
    // who knows if they even have canvas
}
export function registerFont(buffer, filename, options = { canvas: true }) {
    if (!hbBlobs.has(filename)) {
        const blob = hb.createBlob(buffer);
        let family;
        hbBlobs.set(filename, blob);
        for (let i = 0, l = blob.countFaces(); i < l; ++i) {
            const face = hb.createFace(blob, i);
            const font = hb.createFont(face);
            const match = new FaceMatch(face, font, filename, i);
            hbFaces.set(filename + i, face);
            hbFonts.set(filename + i, font);
            faces.set(filename + i, match);
            if (family === undefined)
                family = match.family;
        }
        // TODO: this is a little bit hacky
        // node-canvas doesn't support font collections
        if (canvasRegisterFont && family && options.canvas) {
            try {
                canvasRegisterFont(filename, { family });
            }
            catch (e) {
                // we tried
            }
        }
    }
}
export function unregisterFont(filename) {
    const blob = hbBlobs.get(filename);
    if (blob) {
        for (let i = 0, l = blob.countFaces(); i < l; i++) {
            const face = hbFaces.get(filename + i);
            const font = hbFonts.get(filename + i);
            blob.destroy();
            face.destroy();
            font.destroy();
            hbFaces.delete(filename + i);
            faces.delete(filename + i);
        }
        hbBlobs.delete(filename);
    }
    cascades = new WeakMap();
}
class FontCascade {
    constructor(list, style) {
        this.matches = list;
        this.style = style;
    }
    static fromSet(set, style) {
        const list = [];
        for (const match of set.values())
            list.push(match);
        return new FontCascade(list, style);
    }
    static { this.stretchToLinear = {
        'ultra-condensed': 1,
        'extra-condensed': 2,
        'condensed': 3,
        'semi-condensed': 4,
        'normal': 5,
        'semi-expanded': 6,
        'expanded': 7,
        'extra-expanded': 8,
        'ultra-expanded': 9,
    }; }
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
        cascade = FontCascade.fromSet(faces, style);
        cascade.sort(style, lang);
        map1.set(lang, cascade);
    }
    return cascade;
}
export function eachRegisteredFont(cb) {
    for (const match of faces.values()) {
        cb(match);
    }
}
export function firstCascadeItem() {
    return faces.values().next().value; // TODO Why is this any?
}

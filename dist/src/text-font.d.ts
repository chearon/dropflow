import { HTMLElement } from './dom.js';
import type { HbBlob, HbFace, HbFont } from './text-harfbuzz.js';
import type { Style, FontStretch } from './style.js';
interface FaceDescription {
    family: string;
    families: string[];
    weight: number;
    stretch: FontStretch;
    italic: boolean;
    oblique: boolean;
}
interface FaceNames {
    family: string;
    subfamily: string;
    fullName: string;
    postscriptName: string;
    preferredFamily: string;
    preferredSubfamily: string;
}
export declare class FaceMatch {
    face: HbFace;
    font: HbFont;
    filename: string;
    index: number;
    languages: Set<string>;
    families: string[];
    family: string;
    weight: number;
    stretch: FontStretch;
    italic: boolean;
    oblique: boolean;
    spaceFeatures: number;
    defaultSubSpaceFeatures: Uint32Array;
    nonDefaultSubSpaceFeatures: Uint32Array;
    constructor(blob: HbBlob, index: number, filename: string);
    destroy(): void;
    getExclusiveLanguage(): "ko" | "ja" | "zh-cn" | "zh-tw" | undefined;
    static isExclusiveLang(lang: string): boolean;
    getLanguages(): Set<string>;
    getNames(): FaceNames;
    getFamiliesFromNames(names: FaceNames): string[];
    createDescription(): FaceDescription;
    private getLookupsByLangScript;
    private hasLookupRuleWithGlyphByScript;
    private checkForFeaturesInvolvingSpace;
    private hasSubstitution;
    private hasSubstitutionRulesWithSpaceLookups;
    spaceMayParticipateInShaping(script: string): boolean;
    toFontString(size: number): string;
    toCssDescriptor(): {
        family: string;
        weight: string;
        style: string;
        stretch: FontStretch;
    };
}
export interface RegisterFontOptions {
    paint?: boolean;
}
export declare function registerFont(url: URL, options?: RegisterFontOptions): Promise<void>;
export declare function registerFont(buffer: ArrayBuffer, url: URL, options?: RegisterFontOptions): Promise<void>;
export declare function unregisterFont(url: URL): void;
declare class FontCascade {
    matches: FaceMatch[];
    style: Style;
    constructor(list: FaceMatch[], style: Style);
    static fromSet(set: Map<string, FaceMatch[]>, style: Style): FontCascade;
    static stretchToLinear: Record<FontStretch, number>;
    narrowByFontStretch(matches: FaceMatch[]): FaceMatch[];
    narrowByFontStyle(matches: FaceMatch[]): FaceMatch[];
    narrowByFontWeight(matches: FaceMatch[]): FaceMatch;
    sort(style: Style, lang: string): void;
}
export declare function getCascade(style: Style, lang: string): FontCascade;
export declare function eachRegisteredFont(cb: (family: FaceMatch) => void): void;
export declare function firstCascadeItem(): FaceMatch;
export declare function getFontUrls(root: HTMLElement): string[];
export {};

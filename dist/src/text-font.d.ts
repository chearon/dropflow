import * as hb from './text-harfbuzz.ts';
import type { HbFace, HbFont } from './text-harfbuzz.ts';
import type { Style, FontWeight, FontStyle, FontVariant, FontStretch } from './style.ts';
import type { LoadWalkerContext } from './api.ts';
import type { HTMLElement, TextNode } from './dom.ts';
import type { BufferSource } from './util.ts';
export declare class LoadedFontFace {
    data: Uint8Array;
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
    _createHb(data: Uint8Array, url?: URL): {
        hbface: hb.HbFace;
        hbfont: hb.HbFont;
    };
    _createUrl(desc: {
        family: string;
        weight: number;
        style: string;
    }): import("node:url").URL;
    constructor(data: Uint8Array, face?: FontFace, url?: URL);
    /**
     * Ensures HbFace and HbFont instances. This gets called synchronously (by the
     * ctor) when the font is first loaded for proper error handling, and gets
     * called again when it's added to the "font face source" (`flow.fonts`).
     */
    allocate(): void;
    /**
     * Deallocates HbFace and HbFont instances. This gets called when the font is
     * removed from the "font face source" (`flow.fonts`) and whenever the
     * FontFace is GC'd, via FinalizationRegistry. We could only do the latter,
     * but GC performs much better if we don't wait for the FinalizationRegistry.
     */
    deallocate(): void;
    private getExclusiveLanguage;
    static isExclusiveLang(lang: string): lang is "ko" | "ja" | "zh-cn" | "zh-tw";
    private getLanguages;
    private describeSelfFromTables;
    getBuffer(): Uint8Array<any>;
    private getLookupsByLangScript;
    private hasLookupRuleWithGlyphByScript;
    private checkForFeaturesInvolvingSpace;
    private hasSubstitution;
    private hasSubstitutionRulesWithSpaceLookups;
    spaceMayParticipateInShaping(script: string): boolean;
    toFontString(size: number): string;
}
declare class FontFaceSet {
    #private;
    status: 'loading' | 'loaded';
    [Symbol.iterator](): SetIterator<FontFace>;
    get ready(): Promise<FontFaceSet>;
    has(face: FontFace): boolean;
    add(face: FontFace): this;
    delete(face: FontFace): boolean;
    clear(): void;
}
interface FontFaceDescriptors {
    style?: FontStyle;
    weight?: FontWeight | 'bold' | 'bolder' | 'lighter' | 'normal';
    stretch?: FontStretch;
    variant?: FontVariant;
    unicodeRange?: string;
}
export declare class FontFace {
    #private;
    family: string;
    style: FontStyle;
    weight: number;
    stretch: FontStretch;
    variant: FontVariant;
    unicodeRange: string;
    status: 'unloaded' | 'loading' | 'loaded' | 'error';
    constructor(family: string, source: URL | BufferSource, descriptors?: FontFaceDescriptors);
    load(): Promise<FontFace>;
    loadSync(): this;
    get loaded(): Promise<FontFace>;
}
export declare const fonts: FontFaceSet;
export declare function createFaceFromTables(source: URL): FontFace | Promise<FontFace>;
export declare function createFaceFromTablesSync(source: URL | BufferSource): FontFace;
interface FontDescriptors {
    family: string;
    style: FontStyle;
    weight: number;
    stretch: FontStretch;
    variant: FontVariant;
}
declare class FontCascadeBase<T extends FontDescriptors> {
    source: T[];
    /**
     * @param source fonts in prioritized order. All else equal, fonts earlier in
     * the list will be preferred over those later.
     */
    constructor(source: T[]);
    reset(source: T[]): void;
    static stretchToLinear: Record<FontStretch, number>;
    narrowByFontStretch(style: Style, matches: T[]): T[];
    narrowByFontStyle(style: Style, matches: T[]): T[];
    narrowByFontWeight(style: Style, matches: T[]): T;
}
export declare class LangFontCascade extends FontCascadeBase<LoadedFontFace> {
    private cache;
    constructor(list: LoadedFontFace[]);
    sortByLang(style: Style, lang: string): LoadedFontFace[];
}
export declare function getLangCascade(style: Style, lang: string): LoadedFontFace[];
export declare function eachRegisteredFont(cb: (family: LoadedFontFace) => void): void;
export declare function onLoadWalkerTextNodeForFonts(ctx: LoadWalkerContext, el: TextNode): void;
export declare function onLoadWalkerElementForFonts(ctx: LoadWalkerContext, el: HTMLElement): void;
export {};

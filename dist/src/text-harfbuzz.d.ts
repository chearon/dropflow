export interface CanvasContext {
    moveTo(x: number, y: number): void;
    lineTo(x: number, y: number): void;
    quadraticCurveTo(cx: number, cy: number, tx: number, ty: number): void;
    bezierCurveTo(c1x: number, c1y: number, c2x: number, c2y: number, x: number, y: number): void;
    closePath(): void;
}
export declare function hb_tag(s: string): number;
export declare function _hb_untag(tag: number): string;
export declare const HB_BUFFER_FLAG_BOT = 1;
export declare const HB_BUFFER_FLAG_EOT = 2;
export declare const HB_BUFFER_FLAG_PRESERVE_DEFAULT_IGNORABLES = 4;
export declare const HB_BUFFER_FLAG_REMOVE_DEFAULT_IGNORABLES = 8;
export declare const HB_BUFFER_FLAG_DO_NOT_INSERT_DOTTED_CIRCLE = 16;
export declare const HB_BUFFER_FLAG_PRODUCE_UNSAFE_TO_CONCAT = 64;
export declare class HbSet {
    ptr: number;
    constructor(ptr: number);
    add(codepoint: number): number;
    addRange(start: number, end: number): void;
    has(value: number): boolean;
    union(set: HbSet): void;
    copy(): HbSet;
    subtract(set: HbSet): void;
    getPopulation(): number;
    clear(): void;
    destroy(): void;
    [Symbol.iterator](): {
        next: () => {
            readonly value: number;
            readonly done: false;
        } | {
            readonly done: true;
            readonly value?: undefined;
        };
        return: (value: number) => {
            value: number;
            done: boolean;
        };
    };
}
export declare function createSet(): HbSet;
export declare function wrapExternalSet(ptr: number): HbSet;
export declare class HbBlob {
    ptr: number;
    constructor(ptr: number);
    destroy(): void;
    countFaces(): number;
    getData(): Uint8Array<any>;
}
export declare function createBlob(blob: Uint8Array): HbBlob;
export declare const HB_OT_TAG_GSUB: number;
export declare const HB_OT_TAG_GPOS: number;
export declare const HB_OT_LAYOUT_DEFAULT_LANGUAGE_INDEX = 65535;
export declare class HbFace {
    ptr: number;
    upem: number;
    constructor(ptr: number);
    getAxisInfos(): Record<string, {
        min: number;
        default: number;
        max: number;
    }>;
    collectUnicodes(): HbSet;
    getName(nameId: number, language: string): string;
    hasSubstitution(): boolean;
    hasPositioning(): boolean;
    referenceTable(tag: string): HbBlob;
    getScripts(): number[];
    getNumLangsForScript(table: number, scriptIndex: number): any;
    getFeatureIndexes(table: number, scriptIndex: number, langIndex: number): number[];
    getRequiredFeatureIndex(table: number, scriptIndex: number, langIndex: number): number;
    getFeatureTags(table: number, scriptIndex: number, langIndex: number): number[];
    getLookupsByFeature(table: number, featureIndex: number, lookups: HbSet): void;
    collectGlyphs(table: number, lookupIndex: number, beforeGlyphs?: HbSet, inputGlyphs?: HbSet, afterGlyphs?: HbSet, outputGlyphs?: HbSet): void;
    referenceBlob(): HbBlob;
    destroy(): void;
}
export declare function createFace(blob: HbBlob, index: number): HbFace;
export declare class HbFont {
    ptr: number;
    constructor(ptr: number);
    glyphName(glyphId: number): any;
    getNominalGlyph(codepoint: number): number;
    drawGlyph(glyphId: number, ctx: CanvasContext): void;
    getStyle(styleTag: string): number;
    setScale(xScale: number, yScale: number): void;
    setVariations(variations: Record<string, number>): void;
    getMetrics(dir: 'ltr' | 'rtl'): {
        ascender: number;
        descender: number;
        lineGap: number;
        superscript: number;
        subscript: number;
        xHeight: number;
        strikeoutSize: number;
        strikeoutOffset: number;
        underlineSize: number;
        underlineOffset: number;
    };
    destroy(): void;
}
export declare function createFont(face: HbFace): HbFont;
export declare const G_ID = 0;
export declare const G_CL = 1;
export declare const G_AX = 2;
export declare const G_AY = 3;
export declare const G_DX = 4;
export declare const G_DY = 5;
export declare const G_FL = 6;
export declare const G_SZ = 7;
export declare class HbBuffer {
    ptr: number;
    constructor(ptr: number);
    getLength(): number;
    setLength(length: number): void;
    addText(text: string): void;
    addUtf16(paragraphPtr: number, paragraphLength: number, offset: number, length: number): void;
    guessSegmentProperties(): void;
    setDirection(dir: 'ltr' | 'rtl' | 'ttb' | 'btt'): void;
    setFlags(flags: number): void;
    setLanguage(language: string): void;
    setScript(script: number): void;
    setClusterLevel(level: number): void;
    getGlyphInfos(): Uint32Array<any>;
    getGlyphPositions(): Int32Array<any>;
    getGlyphFlags(glyphIndex: number): number;
    extractGlyphs(): Int32Array<ArrayBuffer>;
    destroy(): void;
}
export declare function createBuffer(): HbBuffer;
export declare function shape(font: HbFont, buffer: HbBuffer): void;
export interface AllocatedUint16Array {
    array: Uint16Array;
    destroy: () => void;
}
export declare function allocateUint16Array(size: number): AllocatedUint16Array;

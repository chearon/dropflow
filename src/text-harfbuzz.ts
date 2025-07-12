import wasm from './wasm.ts';
import {setCtx, onWasmMemoryResized} from './wasm-env.ts';

export interface CanvasContext {
  moveTo(x: number, y: number): void;
  lineTo(x: number, y: number): void;
  quadraticCurveTo(cx: number, cy: number, tx: number, ty: number): void;
  bezierCurveTo(c1x: number, c1y: number, c2x: number, c2y: number, x: number, y: number): void;
  closePath(): void;
}

const exports = wasm.instance.exports;

// no idea why this isn't in @types/node (also see WebAssembly)
declare const TextDecoder: any;

let heapu8 = new Uint8Array(exports.memory.buffer);
let heapu32 = new Uint32Array(exports.memory.buffer);
let heapi32 = new Int32Array(exports.memory.buffer);
let heapf32 = new Float32Array(exports.memory.buffer);

onWasmMemoryResized(() => {
  heapu8 = new Uint8Array(exports.memory.buffer);
  heapu32 = new Uint32Array(exports.memory.buffer);
  heapi32 = new Int32Array(exports.memory.buffer);
  heapf32 = new Float32Array(exports.memory.buffer);
});

const utf8Decoder = new TextDecoder('utf8');
const utf16Decoder = new TextDecoder('utf-16');

const HB_MEMORY_MODE_WRITABLE = 2;
const bytes4 = exports.malloc(4);

export function hb_tag(s: string) {
  return (
    (s.charCodeAt(0) & 0xFF) << 24 |
    (s.charCodeAt(1) & 0xFF) << 16 |
    (s.charCodeAt(2) & 0xFF) <<  8 |
    (s.charCodeAt(3) & 0xFF) <<  0
  );
}

export function _hb_untag(tag: number) {
  return [
    String.fromCharCode((tag >> 24) & 0xFF),
    String.fromCharCode((tag >> 16) & 0xFF),
    String.fromCharCode((tag >>  8) & 0xFF),
    String.fromCharCode((tag >>  0) & 0xFF)
  ].join('');
}

export const HB_BUFFER_FLAG_BOT = 0x1;
export const HB_BUFFER_FLAG_EOT = 0x2;
export const HB_BUFFER_FLAG_PRESERVE_DEFAULT_IGNORABLES = 0x4;
export const HB_BUFFER_FLAG_REMOVE_DEFAULT_IGNORABLES = 0x8;
export const HB_BUFFER_FLAG_DO_NOT_INSERT_DOTTED_CIRCLE = 0x10;
export const HB_BUFFER_FLAG_PRODUCE_UNSAFE_TO_CONCAT = 0x40;

export class HbSet {
  ptr: number;

  constructor(ptr: number) {
    this.ptr = ptr;
  }

  add(codepoint: number): number {
    return exports.hb_set_add(this.ptr, codepoint);
  }

  addRange(start: number, end: number) {
    exports.hb_set_add_range(this.ptr, start, end);
  }

  has(value: number): boolean {
    return exports.hb_set_has(this.ptr, value);
  }

  union(set: HbSet) {
    exports.hb_set_union(this.ptr, set.ptr);
  }

  copy() {
    return createSetInternal(exports.hb_set_copy(this.ptr));
  }

  subtract(set: HbSet) {
    exports.hb_set_subtract(this.ptr, set.ptr);
  }

  getPopulation(): number {
    return exports.hb_set_get_population(this.ptr);
  }

  clear() {
    exports.hb_set_clear(this.ptr);
  }

  destroy() {
    exports.hb_set_destroy(this.ptr);
  }

  [Symbol.iterator]() {
    const valuePtr = exports.malloc(4);

    heapu32[valuePtr >>> 2] = -1;

    const next = () => {
      if (exports.hb_set_next(this.ptr, valuePtr)) {
        return {value: heapu32[valuePtr >>> 2], done: false} as const;
      } else {
        return {done: true} as const;
      }
    };

    const return_ = (value: number) => {
      exports.free(valuePtr);
      return {value, done: true};
    };

    return {next, return: return_};
  }
}

function createSetInternal(uptr = 0) {
  return new HbSet(uptr || exports.hb_set_create());
}

export function createSet() {
  return createSetInternal();
}

export function wrapExternalSet(ptr: number) {
  return createSetInternal(ptr);
}

export class HbBlob {
  ptr: number;

  constructor(ptr: number) {
    this.ptr = ptr;
  }

  destroy() {
    exports.hb_blob_destroy(this.ptr);
  }

  countFaces(): number {
    return exports.hb_face_count(this.ptr);
  }

  getData() {
    const length = exports.hb_blob_get_length(this.ptr);
    const ptr = exports.hb_blob_get_data(this.ptr, 0);
    return heapu8.subarray(ptr, ptr + length);
  }
}

export function createBlob(blob: Uint8Array) {
  const blobPtr = exports.malloc(blob.byteLength);
  heapu8.set(blob, blobPtr);
  return new HbBlob(
    exports.hb_blob_create(blobPtr, blob.byteLength, HB_MEMORY_MODE_WRITABLE, blobPtr, exports.free_ptr())
  );
}

const fontNameBufferSize = 2048;
const fontNameBuffer = exports.malloc(fontNameBufferSize); // permanently allocated

function createAsciiString(text: string) {
  var ptr = exports.malloc(text.length + 1);
  for (let i = 0; i < text.length; ++i) {
    const char = text.charCodeAt(i);
    if (char > 127) throw new Error('Expected ASCII text');
    heapu8[ptr + i] = char;
  }
  heapu8[ptr + text.length] = 0;
  return {
    ptr: ptr,
    length: text.length,
    free: function () { exports.free(ptr); }
  };
}

export const HB_OT_TAG_GSUB = hb_tag('GSUB');
export const HB_OT_TAG_GPOS = hb_tag('GPOS');
export const HB_OT_LAYOUT_DEFAULT_LANGUAGE_INDEX = 0xffff;

export class HbFace {
  ptr: number;
  upem: number;

  constructor(ptr: number) {
    this.ptr = ptr;
    this.upem = exports.hb_face_get_upem(ptr);
  }

  getAxisInfos() {
    const axis = exports.malloc(64 * 32);
    const c = exports.malloc(4);
    heapu32[c / 4] = 64;
    exports.hb_ot_var_get_axis_infos(this.ptr, 0, c, axis);
    const result: Record<string, {min: number, default: number, max: number}> = {};
    Array.from({length: heapu32[c / 4]}).forEach(function (_, i) {
      result[_hb_untag(heapu32[axis / 4 + i * 8 + 1])] = {
        min: heapf32[axis / 4 + i * 8 + 4],
        default: heapf32[axis / 4 + i * 8 + 5],
        max: heapf32[axis / 4 + i * 8 + 6]
      };
    });
    exports.free(c);
    exports.free(axis);
    return result;
  }

  collectUnicodes() {
    const setPtr = exports.hb_set_create();
    exports.hb_face_collect_unicodes(this.ptr, setPtr);
    return createSetInternal(setPtr);
  }

  getName(nameId: number, language: string): string {
    const writtenPtr = exports.malloc(4);
    const written = new Uint32Array(exports.memory.buffer, writtenPtr, 1);
    const cLanguage = createAsciiString(language);
    const hbLanguage = exports.hb_language_from_string(cLanguage, -1);
    cLanguage.free();

    written[0] = fontNameBufferSize;
    exports.hb_ot_name_get_utf16(this.ptr, nameId, hbLanguage, writtenPtr, fontNameBuffer);
    const str = utf16Decoder.decode(new Uint16Array(exports.memory.buffer, fontNameBuffer, written[0]));

    exports.free(writtenPtr);

    return str;
  }

  hasSubstitution(): boolean {
    return exports.hb_ot_layout_has_substitution(this.ptr);
  }

  hasPositioning(): boolean {
    return exports.hb_ot_layout_has_positioning(this.ptr);
  }

  referenceTable(tag: string) {
    return new HbBlob(exports.hb_face_reference_table(this.ptr, hb_tag(tag)));
  }

  getScripts() {
    const lengthPtr = bytes4;
    const maxLength = 8;
    const tagsPtr = exports.malloc(maxLength * 4);
    const tags: number[] = [];
    let offset = 0;
    let length: number;

    heapu32[lengthPtr >> 2] = maxLength;

    do {
      exports.hb_ot_layout_table_get_script_tags(
        this.ptr,
        HB_OT_TAG_GSUB,
        offset,
        lengthPtr,
        tagsPtr
      );

      length = heapu32[lengthPtr >> 2];

      for (let i = 0; i < length; i++) {
        tags.push(heapu32[(tagsPtr >> 2) + i]);
      }

      offset += length;
    } while (length === maxLength);

    exports.free(tagsPtr);

    return tags;
  }

  getNumLangsForScript(table: number, scriptIndex: number) {
    return exports.hb_ot_layout_script_get_language_tags(this.ptr, table, scriptIndex, 0, 0, 0);
  }

  getFeatureIndexes(table: number, scriptIndex: number, langIndex: number) {
    const lengthPtr = bytes4;
    const maxLength = 32;
    const featureIndexesPtr = exports.malloc(maxLength * 4);
    const indexes: number[] = [];
    let offset = 0;
    let length: number;

    heapu32[lengthPtr >> 2] = maxLength;

    do {
      exports.hb_ot_layout_language_get_feature_indexes(
        this.ptr,
        table,
        scriptIndex,
        langIndex,
        offset,
        lengthPtr,
        featureIndexesPtr
      );

      length = heapu32[lengthPtr >> 2];

      for (let i = 0; i < length; i++) {
        indexes.push(heapu32[(featureIndexesPtr >> 2) + i]);
      }

      offset += length;
    } while (length === maxLength);

    exports.free(featureIndexesPtr);

    return indexes;
  }

  getRequiredFeatureIndex(table: number, scriptIndex: number, langIndex: number) {
    const featurePtr = bytes4;

    if (
      exports.hb_ot_layout_language_get_required_feature_index(
        this.ptr,
        table,
        scriptIndex,
        langIndex,
        featurePtr
      )
    ) {
      return heapu32[featurePtr >> 2];
    } else {
      return -1;
    }
  }

  getFeatureTags(table: number, scriptIndex: number, langIndex: number) {
    const lengthPtr = bytes4;
    const maxLength = 32;
    const featureTagsPtr = exports.malloc(maxLength * 4);
    const tags: number[] = [];
    let offset = 0;
    let length: number;

    heapu32[lengthPtr >> 2] = maxLength;

    do {
      exports.hb_ot_layout_language_get_feature_tags(
        this.ptr,
        table,
        scriptIndex,
        langIndex,
        offset,
        lengthPtr,
        featureTagsPtr
      );

      length = heapu32[lengthPtr >> 2];

      for (let i = 0; i < length; i++) {
        tags.push(heapu32[(featureTagsPtr >> 2) + i]);
      }

      offset += length;
    } while (length === maxLength);

    exports.free(featureTagsPtr);

    return tags;
  }

  getLookupsByFeature(table: number, featureIndex: number, lookups: HbSet) {
    const lengthPtr = bytes4;
    const maxLength = 32;
    const lookupsPtr = exports.malloc(maxLength * 4);
    let offset = 0;
    let length: number;

    heapu32[lengthPtr >> 2] = maxLength;

    do {
      exports.hb_ot_layout_feature_get_lookups(
        this.ptr,
        table,
        featureIndex,
        offset,
        lengthPtr,
        lookupsPtr
      );

      length = heapu32[lengthPtr >> 2];

      for (let i = 0; i < length; i++) {
        lookups.add(heapu32[(lookupsPtr >> 2) + i]);
      }

      offset += length;
    } while (length === maxLength);

    exports.free(lookupsPtr);
  }

  collectGlyphs(
    table: number,
    lookupIndex: number,
    beforeGlyphs?: HbSet,
    inputGlyphs?: HbSet,
    afterGlyphs?: HbSet,
    outputGlyphs?: HbSet
  ) {
    exports.hb_ot_layout_lookup_collect_glyphs(
      this.ptr,
      table,
      lookupIndex,
      beforeGlyphs?.ptr ?? 0,
      inputGlyphs?.ptr ?? 0,
      afterGlyphs?.ptr ?? 0,
      outputGlyphs?.ptr ?? 0
    );
  }

  referenceBlob() {
    return new HbBlob(exports.hb_face_reference_blob(this.ptr));
  }

  destroy() {
    exports.hb_face_destroy(this.ptr);
  }
}

export function createFace(blob: HbBlob, index: number) {
  return new HbFace(exports.hb_face_create(blob.ptr, index));
}

const nameBufferSize = 256; // should be enough for most glyphs
const nameBuffer = exports.malloc(nameBufferSize); // permanently allocated

export class HbFont {
  ptr: number;

  constructor(ptr: number) {
    this.ptr = ptr;
  }

  glyphName(glyphId: number) {
    exports.hb_font_glyph_to_string(
      this.ptr,
      glyphId,
      nameBuffer,
      nameBufferSize
    );
    const array = heapu8.subarray(nameBuffer, nameBuffer + nameBufferSize);
    return utf8Decoder.decode(array.slice(0, array.indexOf(0)));
  }

  getNominalGlyph(codepoint: number) {
    exports.hb_font_get_nominal_glyph(this.ptr, codepoint, bytes4);
    return heapu32[bytes4 >>> 2];
  }

  drawGlyph(glyphId: number, ctx: CanvasContext) {
    setCtx(ctx);
    exports.hbjs_glyph_draw(this.ptr, glyphId);
  }

  getStyle(styleTag: string): number {
    return exports.hb_style_get_value(this.ptr, hb_tag(styleTag));
  }

  setScale(xScale: number, yScale: number) {
    exports.hb_font_set_scale(this.ptr, xScale, yScale);
  }

  setVariations(variations: Record<string, number>) {
    const entries = Object.entries(variations);
    const vars = exports.malloc(8 * entries.length);
    entries.forEach(function (entry, i) {
      heapu32[vars / 4 + i * 2 + 0] = hb_tag(entry[0]);
      heapf32[vars / 4 + i * 2 + 1] = entry[1];
    });
    exports.hb_font_set_variations(this.ptr, vars, entries.length);
    exports.free(vars);
  }

  getMetrics(dir: 'ltr' | 'rtl') {
    const extentsPtr = exports.malloc(4); // i32 * 12
    const extentsOffset = extentsPtr / 4;
    let ascender: number, descender: number, lineGap: number;

    if (dir === 'ltr' || dir === 'rtl') {
      exports.hb_ot_metrics_get_position_with_fallback(this.ptr, hb_tag('hasc'), extentsPtr);
      ascender = heapi32[extentsOffset];
      exports.hb_ot_metrics_get_position_with_fallback(this.ptr, hb_tag('hdsc'), extentsPtr);
      descender = heapi32[extentsOffset];
      exports.hb_ot_metrics_get_position_with_fallback(this.ptr, hb_tag('hlgp'), extentsPtr);
      lineGap = heapi32[extentsOffset];
    } else {
      exports.hb_ot_metrics_get_position_with_fallback(this.ptr, hb_tag('vasc'), extentsPtr);
      ascender = heapi32[extentsOffset];
      exports.hb_ot_metrics_get_position_with_fallback(this.ptr, hb_tag('vdsc'), extentsPtr);
      descender = heapi32[extentsOffset];
      exports.hb_ot_metrics_get_position_with_fallback(this.ptr, hb_tag('vlgp'), extentsPtr);
      lineGap = heapi32[extentsOffset];
    }

    exports.hb_ot_metrics_get_position_with_fallback(this.ptr, hb_tag('spyo'), extentsPtr);
    const superscript = heapi32[extentsOffset];
    exports.hb_ot_metrics_get_position_with_fallback(this.ptr, hb_tag('sbyo'), extentsPtr);
    const subscript = heapi32[extentsOffset];
    exports.hb_ot_metrics_get_position_with_fallback(this.ptr, hb_tag('xhgt'), extentsPtr);
    const xHeight = heapi32[extentsOffset];

    exports.free(extentsPtr);

    return {ascender, descender, lineGap, superscript, subscript, xHeight};
  }

  destroy() {
    exports.hb_font_destroy(this.ptr);
  }
}

export function createFont(face: HbFace) {
  return new HbFont(exports.hb_font_create(face.ptr));
}

function createJsString(text: string) {
  const ptr = exports.malloc(text.length * 2);
  const words = new Uint16Array(exports.memory.buffer, ptr, text.length);
  for (let i = 0; i < words.length; ++i) words[i] = text.charCodeAt(i);
  return {
    ptr: ptr,
    length: words.length,
    free: function () { exports.free(ptr); }
  };
}

const langPtr = exports.malloc(3);

// hbjs_extract_glyphs
export const G_ID = 0;
export const G_CL = 1;
export const G_AX = 2;
export const G_AY = 3;
export const G_DX = 4;
export const G_DY = 5;
export const G_FL = 6;
export const G_SZ = 7;

export class HbBuffer {
  ptr: number;

  constructor(ptr: number) {
    this.ptr = ptr;
  }

  getLength(): number {
    return exports.hb_buffer_get_length(this.ptr);
  }

  setLength(length: number) {
    exports.hb_buffer_set_length(this.ptr, length);
  }

  addText(text: string) {
    const str = createJsString(text);
    exports.hb_buffer_add_utf16(this.ptr, str.ptr, str.length, 0, str.length);
    str.free();
  }

  addUtf16(paragraphPtr: number, paragraphLength: number, offset: number, length: number) {
    exports.hb_buffer_add_utf16(this.ptr, paragraphPtr, paragraphLength, offset, length);
  }

  guessSegmentProperties() {
    exports.hb_buffer_guess_segment_properties(this.ptr);
  }

  setDirection(dir: 'ltr' | 'rtl' | 'ttb' | 'btt') {
    exports.hb_buffer_set_direction(this.ptr, {
      ltr: 4,
      rtl: 5,
      ttb: 6,
      btt: 7
    }[dir] || 0);
  }

  setFlags(flags: number) {
    exports.hb_buffer_set_flags(this.ptr, flags);
  }

  setLanguage(language: string) {
    const len = Math.min(3, language.length);
    for (let i = 0; i < len; i++) heapu8[langPtr + i] = language.codePointAt(i)!;
    exports.hb_buffer_set_language(this.ptr, exports.hb_language_from_string(langPtr, len));
  }

  setScript(script: number) {
    exports.hb_buffer_set_script(this.ptr, script);
  }

  setClusterLevel(level: number) {
    exports.hb_buffer_set_cluster_level(this.ptr, level)
  }

  getGlyphInfos() {
    const length = exports.hb_buffer_get_length(this.ptr);
    const infosPtr = exports.hb_buffer_get_glyph_infos(this.ptr, 0);
    const infosPtr32 = infosPtr / 4;
    return heapu32.subarray(infosPtr32, infosPtr32 + 5 * length);
  }

  getGlyphPositions() {
    const length = exports.hb_buffer_get_length(this.ptr);
    const positionsPtr32 = exports.hb_buffer_get_glyph_positions(this.ptr, 0) / 4;
    return heapi32.subarray(positionsPtr32, positionsPtr32 + 5 * length);
  }

  getGlyphFlags(glyphIndex: number): number {
    const infosPtr = exports.hb_buffer_get_glyph_infos(this.ptr, 0);
    return exports.hb_glyph_info_get_glyph_flags(infosPtr + glyphIndex * 20);
  }

  extractGlyphs() {
    const glyphsPtr = exports.hbjs_extract_glyphs(this.ptr);
    const glyphsPtr32 = glyphsPtr >>> 2;
    const ret = heapi32.slice(glyphsPtr32, glyphsPtr32 + this.getLength() * 7);
    exports.free(glyphsPtr);
    return ret;
  }

  destroy() {
    exports.hb_buffer_destroy(this.ptr);
  }
}

export function createBuffer() {
  return new HbBuffer(exports.hb_buffer_create());
}

export function shape(font: HbFont, buffer: HbBuffer) {
  exports.hb_shape(font.ptr, buffer.ptr, 0, 0);
}

export interface AllocatedUint16Array {
  array: Uint16Array;
  destroy: () => void;
}

export function allocateUint16Array(size: number): AllocatedUint16Array {
  const ptr = exports.malloc(size * 2);
  const array = new Uint16Array(exports.memory.buffer, ptr, size);
  return {array, destroy: function () { exports.free(ptr); }};
}

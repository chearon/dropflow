import wasm from './wasm.js';
import { setCtx } from './wasm-env.js';
const exports = wasm.instance.exports;
const heapu8 = () => new Uint8Array(exports.memory.buffer);
const heapu32 = () => new Uint32Array(exports.memory.buffer);
const heapi32 = () => new Int32Array(exports.memory.buffer);
const heapf32 = () => new Float32Array(exports.memory.buffer);
const utf8Decoder = new TextDecoder('utf8');
const utf16Decoder = new TextDecoder('utf-16');
const HB_MEMORY_MODE_WRITABLE = 2;
function hb_tag(s) {
    return ((s.charCodeAt(0) & 0xFF) << 24 |
        (s.charCodeAt(1) & 0xFF) << 16 |
        (s.charCodeAt(2) & 0xFF) << 8 |
        (s.charCodeAt(3) & 0xFF) << 0);
}
function _hb_untag(tag) {
    return [
        String.fromCharCode((tag >> 24) & 0xFF),
        String.fromCharCode((tag >> 16) & 0xFF),
        String.fromCharCode((tag >> 8) & 0xFF),
        String.fromCharCode((tag >> 0) & 0xFF)
    ].join('');
}
function _buffer_flag(s) {
    if (s == 'BOT') {
        return 0x1;
    }
    if (s == 'EOT') {
        return 0x2;
    }
    if (s == 'PRESERVE_DEFAULT_IGNORABLES') {
        return 0x4;
    }
    if (s == 'REMOVE_DEFAULT_IGNORABLES') {
        return 0x8;
    }
    if (s == 'DO_NOT_INSERT_DOTTED_CIRCLE') {
        return 0x10;
    }
    if (s == 'PRODUCE_UNSAFE_TO_CONCAT') {
        return 0x40;
    }
    return 0x0;
}
export class HbSet {
    constructor(ptr) {
        this.ptr = ptr;
    }
    add(codepoint) {
        return exports.hb_set_add(this.ptr, codepoint);
    }
    addRange(start, end) {
        exports.hb_set_add_range(this.ptr, start, end);
    }
    union(set) {
        exports.hb_set_union(this.ptr, set.ptr);
    }
    copy() {
        return createSetInternal(exports.hb_set_copy(this.ptr));
    }
    subtract(set) {
        exports.hb_set_subtract(this.ptr, set.ptr);
    }
    getPopulation() {
        return exports.hb_set_get_population(this.ptr);
    }
    destroy() {
        exports.hb_set_destroy(this.ptr);
    }
}
function createSetInternal(uptr = 0) {
    return new HbSet(uptr || exports.hb_set_create());
}
export function createSet() {
    return createSetInternal();
}
export class HbBlob {
    constructor(ptr) {
        this.ptr = ptr;
    }
    destroy() {
        exports.hb_blob_destroy(this.ptr);
    }
    countFaces() {
        return exports.hb_face_count(this.ptr);
    }
}
export function createBlob(blob) {
    const blobPtr = exports.malloc(blob.byteLength);
    heapu8().set(blob, blobPtr);
    return new HbBlob(exports.hb_blob_create(blobPtr, blob.byteLength, HB_MEMORY_MODE_WRITABLE, blobPtr, exports.free_ptr()));
}
const fontNameBufferSize = 2048;
const fontNameBuffer = exports.malloc(fontNameBufferSize); // permanently allocated
function createAsciiString(text) {
    var ptr = exports.malloc(text.length + 1);
    for (let i = 0; i < text.length; ++i) {
        const char = text.charCodeAt(i);
        if (char > 127)
            throw new Error('Expected ASCII text');
        heapu8()[ptr + i] = char;
    }
    heapu8()[ptr + text.length] = 0;
    return {
        ptr: ptr,
        length: text.length,
        free: function () { exports.free(ptr); }
    };
}
export class HbFace {
    constructor(ptr) {
        this.ptr = ptr;
        this.upem = exports.hb_face_get_upem(ptr);
    }
    reference_table(table) {
        const blob = exports.hb_face_reference_table(this.ptr, hb_tag(table));
        const length = exports.hb_blob_get_length(blob);
        if (!length)
            return;
        const blobptr = exports.hb_blob_get_data(blob, null);
        return heapu8().subarray(blobptr, blobptr + length);
    }
    getAxisInfos() {
        const axis = exports.malloc(64 * 32);
        const c = exports.malloc(4);
        heapu32()[c / 4] = 64;
        exports.hb_ot_var_get_axis_infos(this.ptr, 0, c, axis);
        const result = {};
        Array.from({ length: heapu32()[c / 4] }).forEach(function (_, i) {
            result[_hb_untag(heapu32()[axis / 4 + i * 8 + 1])] = {
                min: heapf32()[axis / 4 + i * 8 + 4],
                default: heapf32()[axis / 4 + i * 8 + 5],
                max: heapf32()[axis / 4 + i * 8 + 6]
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
    getName(nameId, language) {
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
    destroy() {
        exports.hb_face_destroy(this.ptr);
    }
}
export function createFace(blob, index) {
    return new HbFace(exports.hb_face_create(blob.ptr, index));
}
const nameBufferSize = 256; // should be enough for most glyphs
const nameBuffer = exports.malloc(nameBufferSize); // permanently allocated
export class HbFont {
    constructor(ptr) {
        this.ptr = ptr;
    }
    glyphName(glyphId) {
        exports.hb_font_glyph_to_string(this.ptr, glyphId, nameBuffer, nameBufferSize);
        const array = heapu8().subarray(nameBuffer, nameBuffer + nameBufferSize);
        return utf8Decoder.decode(array.slice(0, array.indexOf(0)));
    }
    drawGlyph(glyphId, ctx) {
        setCtx(ctx);
        exports.hbjs_glyph_draw(this.ptr, glyphId);
    }
    getStyle(styleTag) {
        return exports.hb_style_get_value(this.ptr, hb_tag(styleTag));
    }
    setScale(xScale, yScale) {
        exports.hb_font_set_scale(this.ptr, xScale, yScale);
    }
    setVariations(variations) {
        const entries = Object.entries(variations);
        const vars = exports.malloc(8 * entries.length);
        entries.forEach(function (entry, i) {
            heapu32()[vars / 4 + i * 2 + 0] = hb_tag(entry[0]);
            heapf32()[vars / 4 + i * 2 + 1] = entry[1];
        });
        exports.hb_font_set_variations(this.ptr, vars, entries.length);
        exports.free(vars);
    }
    getMetrics(dir) {
        const extentsPtr = exports.malloc(4); // i32 * 12
        const extentsOffset = extentsPtr / 4;
        let ascender, descender, lineGap;
        if (dir === 'ltr' || dir === 'rtl') {
            exports.hb_ot_metrics_get_position_with_fallback(this.ptr, hb_tag('hasc'), extentsPtr);
            ascender = heapi32()[extentsOffset];
            exports.hb_ot_metrics_get_position_with_fallback(this.ptr, hb_tag('hdsc'), extentsPtr);
            descender = heapi32()[extentsOffset];
            exports.hb_ot_metrics_get_position_with_fallback(this.ptr, hb_tag('hlgp'), extentsPtr);
            lineGap = heapi32()[extentsOffset];
        }
        else {
            exports.hb_ot_metrics_get_position_with_fallback(this.ptr, hb_tag('vasc'), extentsPtr);
            ascender = heapi32()[extentsOffset];
            exports.hb_ot_metrics_get_position_with_fallback(this.ptr, hb_tag('vdsc'), extentsPtr);
            descender = heapi32()[extentsOffset];
            exports.hb_ot_metrics_get_position_with_fallback(this.ptr, hb_tag('vlgp'), extentsPtr);
            lineGap = heapi32()[extentsOffset];
        }
        exports.hb_ot_metrics_get_position_with_fallback(this.ptr, hb_tag('spyo'), extentsPtr);
        const superscript = heapi32()[extentsOffset];
        exports.hb_ot_metrics_get_position_with_fallback(this.ptr, hb_tag('sbyo'), extentsPtr);
        const subscript = heapi32()[extentsOffset];
        exports.hb_ot_metrics_get_position_with_fallback(this.ptr, hb_tag('xhgt'), extentsPtr);
        const xHeight = heapi32()[extentsOffset];
        exports.free(extentsPtr);
        return { ascender, descender, lineGap, superscript, subscript, xHeight };
    }
    destroy() {
        exports.hb_font_destroy(this.ptr);
    }
}
export function createFont(face) {
    return new HbFont(exports.hb_font_create(face.ptr));
}
function createJsString(text) {
    const ptr = exports.malloc(text.length * 2);
    const words = new Uint16Array(exports.memory.buffer, ptr, text.length);
    for (let i = 0; i < words.length; ++i)
        words[i] = text.charCodeAt(i);
    return {
        ptr: ptr,
        length: words.length,
        free: function () { exports.free(ptr); }
    };
}
export class HbBuffer {
    constructor(ptr) {
        this.ptr = ptr;
    }
    getLength() {
        return exports.hb_buffer_get_length(this.ptr);
    }
    setLength(length) {
        exports.hb_buffer_set_length(this.ptr, length);
    }
    addText(text) {
        const str = createJsString(text);
        exports.hb_buffer_add_utf16(this.ptr, str.ptr, str.length, 0, str.length);
        str.free();
    }
    addUtf16(paragraphPtr, paragraphLength, offset, length) {
        exports.hb_buffer_add_utf16(this.ptr, paragraphPtr, paragraphLength, offset, length);
    }
    guessSegmentProperties() {
        exports.hb_buffer_guess_segment_properties(this.ptr);
    }
    setDirection(dir) {
        exports.hb_buffer_set_direction(this.ptr, {
            ltr: 4,
            rtl: 5,
            ttb: 6,
            btt: 7
        }[dir] || 0);
    }
    setFlags(flags) {
        let flagValue = 0;
        flags.forEach(function (s) {
            flagValue |= _buffer_flag(s);
        });
        exports.hb_buffer_set_flags(this.ptr, flagValue);
    }
    setLanguage(language) {
        const str = createAsciiString(language);
        exports.hb_buffer_set_language(this.ptr, exports.hb_language_from_string(str.ptr, -1));
        str.free();
    }
    setScript(script) {
        const str = createAsciiString(script);
        exports.hb_buffer_set_script(this.ptr, exports.hb_script_from_string(str.ptr, -1));
        str.free();
    }
    setClusterLevel(level) {
        exports.hb_buffer_set_cluster_level(this.ptr, level);
    }
    getGlyphInfos() {
        const length = exports.hb_buffer_get_length(this.ptr);
        const infosPtr = exports.hb_buffer_get_glyph_infos(this.ptr, 0);
        const infosPtr32 = infosPtr / 4;
        return heapu32().subarray(infosPtr32, infosPtr32 + 5 * length);
    }
    getGlyphPositions() {
        const length = exports.hb_buffer_get_length(this.ptr);
        const positionsPtr32 = exports.hb_buffer_get_glyph_positions(this.ptr, 0) / 4;
        return heapi32().subarray(positionsPtr32, positionsPtr32 + 5 * length);
    }
    getGlyphFlags(glyphIndex) {
        const infosPtr = exports.hb_buffer_get_glyph_infos(this.ptr, 0);
        return exports.hb_glyph_info_get_glyph_flags(infosPtr + glyphIndex * 20);
    }
    destroy() {
        exports.hb_buffer_destroy(this.ptr);
    }
}
export function createBuffer() {
    return new HbBuffer(exports.hb_buffer_create());
}
export function shape(font, buffer) {
    exports.hb_shape(font.ptr, buffer.ptr, 0, 0);
}
export function allocateUint16Array(size) {
    const ptr = exports.malloc(size * 2);
    const array = new Uint16Array(exports.memory.buffer, ptr, size);
    return { array, destroy: function () { exports.free(ptr); } };
}

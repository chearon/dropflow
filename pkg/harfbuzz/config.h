#undef HB_NO_CFF
#undef HB_NO_OT_FONT_CFF
#undef HB_NO_DRAW
#undef HB_NO_BUFFER_MESSAGE
#undef HB_NO_BUFFER_SERIALIZE
#undef HB_NO_VAR
#undef HB_NO_OT_FONT_GLYPH_NAMES
#undef HB_NO_NAME
#undef HB_NO_STYLE
#undef HB_NO_FACE_COLLECT_UNICODES
#undef HB_NO_METRICS
#undef HB_NO_LAYOUT_COLLECT_GLYPHS
// this is needed because WASI defines errno, so harfbuzz trying to define
// it breaks it. we need wasi for stuff like inttypes.h, unfortunately
#undef HB_NO_ERRNO

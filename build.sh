#!/bin/bash
# TODO: turn this into a proper makefile, maybe even cmake or meson
set -e

mkdir -p dist

ragel src/emoji-scan.rl -o gen/emoji-scan.c

emcc \
  -c \
  -o dist/emoji-scan.o \
  gen/emoji-scan.c

emcc \
  -DSB_CONFIG_UNITY \
  -I../SheenBidi/Headers \
  -c \
  -o dist/sheenbidi.o \
  ../SheenBidi/Source/SheenBidi.c

em++ \
	-std=c++11 \
	-fno-exceptions \
	-fno-rtti \
	-fno-threadsafe-statics \
	-fvisibility-inlines-hidden \
	-flto \
	-Oz \
	-I. \
	-DHB_TINY \
	-DHB_USE_INTERNAL_QSORT \
	-DHB_CONFIG_OVERRIDE_H=\"src/harfbuzz-config.h\" \
	-DHB_EXPERIMENTAL_API \
	--no-entry \
  -Wl,--export -Wl,hb_blob_create \
  -Wl,--export -Wl,hb_blob_destroy \
  -Wl,--export -Wl,hb_blob_get_data \
  -Wl,--export -Wl,hb_blob_get_length \
  -Wl,--export -Wl,hb_buffer_add_utf16 \
  -Wl,--export -Wl,hb_buffer_add_utf8 \
  -Wl,--export -Wl,hb_buffer_create \
  -Wl,--export -Wl,hb_buffer_destroy \
  -Wl,--export -Wl,hb_buffer_get_glyph_infos \
  -Wl,--export -Wl,hb_buffer_get_glyph_positions \
  -Wl,--export -Wl,hb_buffer_get_length \
  -Wl,--export -Wl,hb_buffer_set_length \
  -Wl,--export -Wl,hb_buffer_guess_segment_properties \
  -Wl,--export -Wl,hb_buffer_set_cluster_level \
  -Wl,--export -Wl,hb_buffer_set_direction \
  -Wl,--export -Wl,hb_buffer_set_flags \
  -Wl,--export -Wl,hb_buffer_set_language \
  -Wl,--export -Wl,hb_buffer_set_script \
  -Wl,--export -Wl,hb_face_create \
  -Wl,--export -Wl,hb_face_collect_unicodes \
  -Wl,--export -Wl,hb_face_destroy \
  -Wl,--export -Wl,hb_face_get_upem \
  -Wl,--export -Wl,hb_face_reference_table \
  -Wl,--export -Wl,hb_face_count \
  -Wl,--export -Wl,hb_font_create \
  -Wl,--export -Wl,hb_font_destroy \
  -Wl,--export -Wl,hb_font_get_extents_for_direction \
  -Wl,--export -Wl,hb_font_glyph_to_string \
  -Wl,--export -Wl,hb_font_set_scale \
  -Wl,--export -Wl,hb_font_set_variations \
  -Wl,--export -Wl,hb_style_get_value \
  -Wl,--export -Wl,hb_ot_name_get_utf16 \
  -Wl,--export -Wl,hb_glyph_info_get_glyph_flags \
  -Wl,--export -Wl,hb_language_from_string \
  -Wl,--export -Wl,hb_ot_var_get_axis_infos \
  -Wl,--export -Wl,hb_ot_metrics_get_position_with_fallback \
  -Wl,--export -Wl,hb_script_from_string \
  -Wl,--export -Wl,hb_set_create \
  -Wl,--export -Wl,hb_set_destroy \
  -Wl,--export -Wl,hb_set_get_population \
  -Wl,--export -Wl,hb_set_next_many \
  -Wl,--export -Wl,hb_set_add \
  -Wl,--export -Wl,hb_set_add_range \
  -Wl,--export -Wl,hb_set_union \
  -Wl,--export -Wl,hb_set_copy \
  -Wl,--export -Wl,hb_set_subtract \
  -Wl,--export -Wl,hb_shape \
  -Wl,--export -Wl,hbjs_glyph_draw \
  -Wl,--export -Wl,SBAlgorithmCreate \
  -Wl,--export -Wl,SBAlgorithmRelease \
  -Wl,--export -Wl,SBAlgorithmGetParagraphBoundary \
  -Wl,--export -Wl,SBAlgorithmCreateParagraph \
  -Wl,--export -Wl,SBParagraphRelease \
  -Wl,--export -Wl,SBParagraphGetLevelsPtr \
  -Wl,--export -Wl,malloc \
  -Wl,--export -Wl,free \
  -Wl,--export -Wl,free_ptr \
	-s ERROR_ON_UNDEFINED_SYMBOLS=0 \
	-s WARN_ON_UNDEFINED_SYMBOLS=0 \
  -s ALLOW_MEMORY_GROWTH=1 \
	-s INITIAL_MEMORY=4MB \
	-o dist/overflow.wasm \
	dist/sheenbidi.o \
	dist/emoji-scan.o \
	src/overflow.cc \
	gen/lang-script-database.cc \
	gen/grapheme-break-trie.cc \
	gen/line-break-trie.cc \
	gen/emoji-trie.cc \
	gen/script-trie.cc

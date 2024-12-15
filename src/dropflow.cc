// note: change this to point to your harfbuzz directory
#include "../harfbuzz/src/harfbuzz.cc"

HB_BEGIN_DECLS

typedef struct hbjs_glyph {
  uint32_t cl;
  uint16_t id;
  int16_t ad;
  int16_t dx;
  int16_t dy;
} hbjs_glyph;

/* imports */
void hbjs_glyph_draw_move_to(float to_x, float to_y);
void hbjs_glyph_draw_line_to(float to_x, float to_y);
void hbjs_glyph_draw_quadratic_to(float control_x, float control_y, float to_x, float to_y);
void hbjs_glyph_draw_cubic_to(
  float control1_x, float control1_y,
  float control2_x, float control2_y,
  float to_x, float to_y
);
void hbjs_glyph_draw_close_path();
void hbjs_glyph_draw(hb_font_t *font, hb_codepoint_t glyph);
hbjs_glyph* hbjs_extract_glyphs(hb_buffer_t* buf);

void *free_ptr(void);

HB_END_DECLS

void *free_ptr(void) { return (void *) free; }

static void
glyph_draw_move_to (hb_draw_funcs_t *dfuncs, void *draw_data, hb_draw_state_t *,
	 float to_x, float to_y,
	 void *)
{
  hbjs_glyph_draw_move_to(to_x, to_y);
}

static void
glyph_draw_line_to (hb_draw_funcs_t *dfuncs, void *draw_data, hb_draw_state_t *,
	 float to_x, float to_y,
	 void *)
{
  hbjs_glyph_draw_line_to(to_x, to_y);
}

static void
glyph_draw_quadratic_to (hb_draw_funcs_t *dfuncs, void *draw_data, hb_draw_state_t *,
	      float control_x, float control_y,
	      float to_x, float to_y,
	      void *)
{
  hbjs_glyph_draw_quadratic_to(control_x, control_y, to_x, to_y);
}

static void
glyph_draw_cubic_to (hb_draw_funcs_t *dfuncs, void *draw_data, hb_draw_state_t *,
	  float control1_x, float control1_y,
	  float control2_x, float control2_y,
	  float to_x, float to_y,
	  void *)
{
  hbjs_glyph_draw_cubic_to(control1_x, control1_y, control2_x, control2_y, to_x, to_y);
}

static void
glyph_draw_close_path (hb_draw_funcs_t *dfuncs, void *draw_data, hb_draw_state_t *, void *)
{
  hbjs_glyph_draw_close_path();
}

static hb_draw_funcs_t *glyph_draw_funcs = 0;

void
hbjs_glyph_draw(hb_font_t *font, hb_codepoint_t glyph)
{
  if (glyph_draw_funcs == 0)
  {
    glyph_draw_funcs = hb_draw_funcs_create ();
    hb_draw_funcs_set_move_to_func (glyph_draw_funcs, (hb_draw_move_to_func_t) glyph_draw_move_to, nullptr, nullptr);
    hb_draw_funcs_set_line_to_func (glyph_draw_funcs, (hb_draw_line_to_func_t) glyph_draw_line_to, nullptr, nullptr);
    hb_draw_funcs_set_quadratic_to_func (glyph_draw_funcs, (hb_draw_quadratic_to_func_t) glyph_draw_quadratic_to, nullptr, nullptr);
    hb_draw_funcs_set_cubic_to_func (glyph_draw_funcs, (hb_draw_cubic_to_func_t) glyph_draw_cubic_to, nullptr, nullptr);
    hb_draw_funcs_set_close_path_func (glyph_draw_funcs, (hb_draw_close_path_func_t) glyph_draw_close_path, nullptr, nullptr);
  }

  hb_font_draw_glyph (font, glyph, glyph_draw_funcs, nullptr);
}

__attribute__((export_name("hbjs_extract_glyphs")))
hbjs_glyph*
hbjs_extract_glyphs(hb_buffer_t* buf) {
  unsigned int len = 0;
  hb_glyph_info_t* infos = hb_buffer_get_glyph_infos(buf, &len);
  hb_glyph_position_t* positions = hb_buffer_get_glyph_positions(buf, &len);
  hbjs_glyph* ret = (hbjs_glyph*) malloc(sizeof(hbjs_glyph) * len);

  for (unsigned int i = 0; i < len; i++) {
    hb_glyph_flags_t flags = hb_glyph_info_get_glyph_flags(infos + i);
    ret[i].cl = infos[i].cluster << 2;
    ret[i].id = static_cast<int16_t>(infos[i].codepoint);
    // TODO: vertical text
    ret[i].ad = static_cast<int16_t>(positions[i].x_advance);

    if (flags & HB_GLYPH_FLAG_UNSAFE_TO_BREAK) ret[i].cl |= 0x1;
    if (flags & HB_GLYPH_FLAG_UNSAFE_TO_CONCAT) ret[i].cl |= 0x2;
    ret[i].dx = static_cast<int16_t>(positions[i].x_offset);
    ret[i].dy = static_cast<int16_t>(positions[i].y_offset);
  }

  return ret;
}

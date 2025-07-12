import type {CanvasContext} from './text-harfbuzz.ts';

const resizeCallbacks: (() => void)[] = [];

export function onWasmMemoryResized(fn: () => void) {
  resizeCallbacks.push(fn);
}

let ctx: CanvasContext | undefined;

export function setCtx(uctx: CanvasContext) {
  ctx = uctx;
}

export default {
  hb_ot_layout_get_size_params() {
    return 0;
  },
  hbjs_glyph_draw_move_to(x: number, y: number) {
    if (ctx) ctx.moveTo(x, y);
  },
  hbjs_glyph_draw_line_to(x: number, y: number) {
    if (ctx) ctx.lineTo(x, y);
  },
  hbjs_glyph_draw_quadratic_to(cx: number, cy: number, tx: number, ty: number) {
    if (ctx) ctx.quadraticCurveTo(cx, cy, tx, ty);
  },
  hbjs_glyph_draw_cubic_to(c1x: number, c1y: number, c2x: number, c2y: number, x: number, y: number) {
    if (ctx) ctx.bezierCurveTo(c1x, c1y, c2x, c2y, x, y);
  },
  hbjs_glyph_draw_close_path() {
    if (ctx) ctx.closePath();
  },
  notify_memory_resize() {
    for (const cb of resizeCallbacks) cb();
  }
};

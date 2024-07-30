const resizeCallbacks = [];
export function onWasmMemoryResized(fn) {
    resizeCallbacks.push(fn);
}
let ctx;
export function setCtx(uctx) {
    ctx = uctx;
}
export default {
    hb_ot_layout_get_size_params() {
        return 0;
    },
    hbjs_glyph_draw_move_to(x, y) {
        if (ctx)
            ctx.moveTo(x, y);
    },
    hbjs_glyph_draw_line_to(x, y) {
        if (ctx)
            ctx.lineTo(x, y);
    },
    hbjs_glyph_draw_quadratic_to(cx, cy, tx, ty) {
        if (ctx)
            ctx.quadraticCurveTo(cx, cy, tx, ty);
    },
    hbjs_glyph_draw_cubic_to(c1x, c1y, c2x, c2y, x, y) {
        if (ctx)
            ctx.bezierCurveTo(c1x, c1y, c2x, c2y, x, y);
    },
    hbjs_glyph_draw_close_path() {
        if (ctx)
            ctx.closePath();
    },
    emscripten_notify_memory_growth() {
        for (const cb of resizeCallbacks)
            cb();
    }
};

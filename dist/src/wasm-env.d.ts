import type { CanvasContext } from './text-harfbuzz.ts';
export declare function onWasmMemoryResized(fn: () => void): void;
export declare function setCtx(uctx: CanvasContext): void;
declare const _default: {
    hb_ot_layout_get_size_params(): number;
    hbjs_glyph_draw_move_to(x: number, y: number): void;
    hbjs_glyph_draw_line_to(x: number, y: number): void;
    hbjs_glyph_draw_quadratic_to(cx: number, cy: number, tx: number, ty: number): void;
    hbjs_glyph_draw_cubic_to(c1x: number, c1y: number, c2x: number, c2y: number, x: number, y: number): void;
    hbjs_glyph_draw_close_path(): void;
    notify_memory_resize(): void;
};
export default _default;

import { fonts, FontFace, createFaceFromTablesSync } from "../src/api.js";
const registration = new Map();
export function registerFontAsset(filename) {
    if (!registration.has(filename)) {
        const url = new URL(import.meta.resolve(`#assets/${filename}`));
        const face = createFaceFromTablesSync(url);
        fonts.add(face);
        registration.set(filename, face);
    }
}
export function unregisterFontAsset(filename) {
    const face = registration.get(filename);
    if (face)
        fonts.delete(face);
    registration.delete(filename);
}

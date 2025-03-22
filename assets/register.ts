import {fonts, FontFace, createFaceFromTablesSync} from '../src/api.js';

const registration = new Map<string, FontFace>();

export function registerFontAsset(filename: string) {
  if (!registration.has(filename)) {
    const url = new URL(filename, import.meta.url)
    const face = createFaceFromTablesSync(url);
    fonts.add(face);
    registration.set(filename, face);
  }
}

export function unregisterFontAsset(filename: string) {
  const face = registration.get(filename);
  if (face) fonts.delete(face);
  registration.delete(filename);
}

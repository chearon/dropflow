import type {FaceMatch} from './font.js';

// TypeScript does not support different possibilities of runtime environments,
// so the types loaded are for node. To add the browser environment too would
// add too many globals.
//
// https://gist.github.com/RyanCavanaugh/702ebd1ca2fc060e58e634b4e30c1c1c
declare const document: any;
declare const FontFace: any;

export function registerPaintFont(match: FaceMatch, buffer: Uint8Array, filename: string) {
  const descriptor = match.toCssDescriptor();
  const face = new FontFace(descriptor.family, buffer, descriptor);
  document.fonts.add(face);
}

export async function loadBuffer(path: URL) {
  return await fetch(path).then((res: any) => res.arrayBuffer());
}

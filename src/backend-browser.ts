import type {FaceMatch} from './font.js';

declare const document: any;
declare const FontFace: any;
declare const fetch: any;

export function registerPaintFont(match: FaceMatch, buffer: Uint8Array, filename: string) {
  const descriptor = match.toCssDescriptor();
  const face = new FontFace(descriptor.family, buffer, descriptor);
  document.fonts.add(face);
}

export async function loadBuffer(path: URL) {
  return await fetch(path).then((res: any) => res.arrayBuffer());
}

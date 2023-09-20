import type {FaceMatch} from './font.js';

try {
  var canvas = await import('canvas');
} catch (e) {
}

export default function registerPaintFont(match: FaceMatch, buffer: Uint8Array, filename: string) {
  if (canvas?.registerFont) {
    const descriptor = match.toCssDescriptor();
    canvas.registerFont(filename, descriptor);
  }
}

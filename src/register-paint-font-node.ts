import type {FaceMatch} from './font.js';

const alreadyRegistered = new Set<string>();

try {
  var canvas = await import('canvas');
} catch (e) {
}

export default function registerPaintFont(match: FaceMatch, buffer: Uint8Array, filename: string) {
  if (canvas?.registerFont && !alreadyRegistered.has(filename)) {
    const descriptor = match.toCssDescriptor();
    canvas.registerFont(filename, descriptor);
    alreadyRegistered.add(filename);
  }
}

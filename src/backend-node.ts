import type {FaceMatch} from './text-font.js';
import fs from 'node:fs';
import {fileURLToPath} from 'url';

const alreadyRegistered = new Set<string>();

try {
  var canvas = await import('canvas');
} catch (e) {
}

export function registerPaintFont(match: FaceMatch, buffer: Uint8Array, url: URL) {
  const filename = fileURLToPath(url);
  if (canvas?.registerFont && !alreadyRegistered.has(filename)) {
    const descriptor = match.toCssDescriptor();
    canvas.registerFont(filename, descriptor);
    alreadyRegistered.add(filename);
  }
}

export async function loadBuffer(path: URL) {
  return fs.readFileSync(path).buffer;
}

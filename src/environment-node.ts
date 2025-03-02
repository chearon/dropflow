import {environment, defaultEnvironment} from './environment.js';
import {fileURLToPath} from 'url';
import fs from 'node:fs';

if (environment.wasmLocator === defaultEnvironment.wasmLocator) {
  environment.wasmLocator = async () => {
    return fs.readFileSync(new URL('../dropflow.wasm', import.meta.url));
  };
}

const alreadyRegistered = new Set<string>();

let canvas: typeof import('canvas') | undefined;

try {
  canvas = await import('canvas');
} catch (e) {
}

// TODO: the await above might create a race condition: if registerFont is
// called before the canvas import completes, an error would throw in
// environment.ts
if (canvas?.registerFont && environment.registerFont === defaultEnvironment.registerFont) {
  environment.registerFont = (face, buffer, url) => {
    const filename = fileURLToPath(url);
    if (canvas?.registerFont && !alreadyRegistered.has(filename)) {
      canvas.registerFont(filename, {family: face.uniqueFamily});
      alreadyRegistered.add(filename);
    }
  };
}

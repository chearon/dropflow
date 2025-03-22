import {environment, defaultEnvironment} from './environment.js';
import {fileURLToPath} from 'url';
import fs from 'node:fs';

if (environment.wasmLocator === defaultEnvironment.wasmLocator) {
  environment.wasmLocator = async () => {
    return fs.readFileSync(new URL('../dropflow.wasm', import.meta.url));
  };
}

if (environment.resolveUrl === defaultEnvironment.resolveUrl) {
  environment.resolveUrl = async function (url) {
    if (url.protocol === 'file:') {
      return fs.readFileSync(url).buffer;
    } else {
      return fetch(url).then(res => {
        if (!res.ok) throw new Error(res.statusText);
        return res.arrayBuffer();
      });
    }
  };
}

if (environment.resolveUrlSync === defaultEnvironment.resolveUrlSync) {
  environment.resolveUrlSync = function (url) {
    if (url.protocol === 'file:') {
      return fs.readFileSync(url).buffer;
    } else {
      throw new Error(`Cannot load synchronously: ${url}`);
    }
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
if (environment.registerFont === defaultEnvironment.registerFont) {
  environment.registerFont = face => {
    if (face.url.protocol === 'file:') {
      const filename = fileURLToPath(face.url);
      if (canvas?.registerFont && !alreadyRegistered.has(filename)) {
        canvas.registerFont(filename, {family: face.uniqueFamily});
        alreadyRegistered.add(filename);
      }
    } else {
      // TODO:
      // some kind of warning configuration? if NODE_ENV is "development" say something like
      // node-canvas can only register fonts from a file path. Please register your font with a full file:// URL.
    }
  };
}

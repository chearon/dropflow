import {environment, defaultEnvironment} from './environment.js';
import {fileURLToPath} from 'url';

const alreadyRegistered = new Set<string>();

let canvas: typeof import('canvas') | undefined;

try {
  canvas = await import('canvas');
} catch (e) {
}

if (canvas?.registerFont && environment.registerFont === defaultEnvironment.registerFont) {
  environment.registerFont = (match, buffer, url) => {
    const filename = fileURLToPath(url);
    if (canvas?.registerFont && !alreadyRegistered.has(filename)) {
      const descriptor = match.toCssDescriptor();
      canvas.registerFont(filename, descriptor);
      alreadyRegistered.add(filename);
    }
  };
}

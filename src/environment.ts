import type {LoadedFontFace} from './text-font.js';

export interface Environment {
  wasmLocator(): Promise<Uint8Array>;
  registerFont(face: LoadedFontFace): void;
  resolveUrl(url: URL): Promise<ArrayBufferLike> | ArrayBufferLike;
}

export const defaultEnvironment: Environment = {
  wasmLocator() {
    throw new Error(
      'Wasm location not configured. Import {environment} from ' +
      '\'dropflow/environment.js\' before importing \'dropflow\' and assign ' +
      'an async function that returns a Uint8Array to wasmLocator.'
    );
  },
  registerFont() {
    throw new Error('Invalid build! Your bundler needs to support "exports" in package.json.');
  },
  resolveUrl() {
    throw new Error('Invalid build! Your bundler needs to support "exports" in package.json.');
  }
};

export const environment = {...defaultEnvironment};

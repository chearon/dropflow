import type {FaceMatch} from './text-font.js';

export interface Environment {
  registerFont(match: FaceMatch, buffer: Uint8Array, url: URL): void;
}

export const defaultEnvironment: Environment = {
  registerFont() {
    throw new Error('Invalid build! Your bundler needs to support "exports" in package.json.');
  }
};

export const environment = {...defaultEnvironment};

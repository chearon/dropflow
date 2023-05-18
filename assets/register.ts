import {registerFont, unregisterFont} from '../src/api.js';
import {fileURLToPath} from 'url';
import fs from 'fs';

export function registerFontAsset(filename: string) {
  const path = new URL(filename, import.meta.url);
  const array = new Uint8Array(fs.readFileSync(path));
  registerFont(array, fileURLToPath(path));
}

export function unregisterFontAsset(filename: string) {
  const path = new URL(filename, import.meta.url);
  unregisterFont(fileURLToPath(path));
}

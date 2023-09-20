import fs from 'node:fs';

export const locatorFunction = {
  value: async (): Promise<Uint8Array> => {
    return fs.readFileSync(new URL('../overflow.wasm', import.meta.url));
  }
};

export default function setBundleLocator(fn: () => Promise<Uint8Array>) {
  locatorFunction.value = fn;
}

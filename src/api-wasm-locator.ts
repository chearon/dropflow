export const locatorFunction = {
  value: async (): Promise<Uint8Array> => {
    const fs = await import('node:fs');
    return fs.readFileSync(new URL('../overflow.wasm', import.meta.url));
  }
};

export default function setBundleLocator(fn: () => Promise<Uint8Array>) {
  locatorFunction.value = fn;
}

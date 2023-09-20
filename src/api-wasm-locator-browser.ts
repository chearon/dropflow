export const locatorFunction = {
  value: async (): Promise<Uint8Array> => {
    throw new Error(
      'Wasm location not configured. Import setBundleLocator from ' +
      '\'overflow/wasm-locator.js\' before importing \'overflow\' and ' +
      'pass it a function that fetches and returns a Uint8Array'
    );
  }
};

export default function setBundleLocator(fn: () => Promise<Uint8Array>) {
  locatorFunction.value = fn;
}

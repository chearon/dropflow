export const locatorFunction = {
  value: async (): Promise<Uint8Array> => {
    throw new Error(
      'Wasm location not configured. Import setBundleLocator from ' +
      '\'dropflow/wasm-locator.js\' before importing \'dropflow\' and ' +
      'pass it a function that fetches and returns a Uint8Array'
    );
  }
};

export default function setBundleLocator(fn: () => Promise<Uint8Array>) {
  locatorFunction.value = fn;
}

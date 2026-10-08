export const defaultEnvironment = {
    wasmLocator() {
        throw new Error("Wasm location not configured. Import {environment} from " +
            "'dropflow/environment.js' before importing 'dropflow' and assign " +
            "an async function that returns a Uint8Array to wasmLocator.");
    },
    registerFont() {
        // optional (dropflow can be used for layout only)
    },
    resolveUrl() {
        throw new Error('Invalid build! Your bundler needs to support "exports" in package.json.');
    },
    resolveUrlSync() {
        throw new Error('Invalid build! Your bundler needs to support "exports" in package.json.');
    },
    async createDecodedImage() {
        // optional (svg doesn't use it)
    },
    destroyDecodedImage() {
        // optional (node-canvas just gc's, but browser needs revokeObjectURL)
    },
};
export const environment = { ...defaultEnvironment };

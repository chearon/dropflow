import fs from 'node:fs';
export const locatorFunction = {
    value: async () => {
        return fs.readFileSync(new URL('../dropflow.wasm', import.meta.url));
    }
};
export default function setBundleLocator(fn) {
    locatorFunction.value = fn;
}

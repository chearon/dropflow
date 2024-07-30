export const locatorFunction = {
    value: async () => {
        const fs = await import('node:fs');
        return fs.readFileSync(new URL('../overflow.wasm', import.meta.url));
    }
};
export default function setBundleLocator(fn) {
    locatorFunction.value = fn;
}

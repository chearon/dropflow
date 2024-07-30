import { fileURLToPath } from 'url';
const alreadyRegistered = new Set();
try {
    var canvas = await import('canvas');
}
catch (e) {
}
export function registerPaintFont(match, buffer, url) {
    const filename = fileURLToPath(url);
    if (canvas?.registerFont && !alreadyRegistered.has(filename)) {
        const descriptor = match.toCssDescriptor();
        canvas.registerFont(filename, descriptor);
        alreadyRegistered.add(filename);
    }
}

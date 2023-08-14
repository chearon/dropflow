import fs from 'node:fs';
import env from './wasm-env.js';

const buffer = fs.readFileSync(new URL('../overflow.wasm', import.meta.url));

// no idea why this isn't in @types/node (also see TextDecoder)
declare const WebAssembly: any;

export default await WebAssembly.instantiate(buffer, {env});

import fs from 'node:fs';
import env from './wasm-env.js';

const buffer = fs.readFileSync(new URL('../overflow.wasm', import.meta.url));

declare const WebAssembly: any;

// some C++ calls this?
const wasi_snapshot_preview1 = {proc_exit(){}};

// no idea why this isn't in @types/node (also see TextDecoder)
const wasm = await WebAssembly.instantiate(buffer, {env, wasi_snapshot_preview1});

wasm.instance.exports.lang_script_database_init();

export default wasm;

import env from './wasm-env.js';
import {environment} from './environment.js';

const buffer = await environment.wasmLocator();

declare const WebAssembly: any;

const wasi_snapshot_preview1 = {
  // some C++ calls this?
  proc_exit() {},
  // emscripten I think 😑
  fd_close() {},
  fd_write() {},
  fd_seek() {}
};

// no idea why this isn't in @types/node (also see TextDecoder)
const wasm = await WebAssembly.instantiate(buffer, {env, wasi_snapshot_preview1});

wasm.instance.exports.lang_script_database_init();

export default wasm;

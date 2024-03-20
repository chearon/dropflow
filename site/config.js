import setWasmLocator from 'dropflow/wasm-locator.js';
import wasmUrl from 'dropflow/dropflow.wasm?url';

setWasmLocator(function () {
  return fetch(wasmUrl).then(res => {
    if (res.status === 200) {
      return res.arrayBuffer()
    } else {
      throw new Error(res.statusText);
    }
  });
});


import {environment} from 'dropflow/environment.js';
import wasmUrl from 'dropflow/dropflow.wasm?url';

environment.wasmLocator = function () {
  return fetch(wasmUrl).then(res => {
    if (res.status === 200) {
      return res.arrayBuffer()
    } else {
      throw new Error(res.statusText);
    }
  });
};


///<reference types="node" />

import {readFile} from 'fs/promises';

export async function getBuffer(path: string) {
  return await readFile(path);
}

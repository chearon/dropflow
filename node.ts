import {setGetBufferImpl} from './src/io.js';
import {readFile} from 'fs/promises';
setGetBufferImpl(readFile);
export * from './src/api.js';

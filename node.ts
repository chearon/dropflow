import {setGetBufferImpl} from './src/io.js';
import {readFileSync} from 'fs';
setGetBufferImpl(readFileSync);
export * from './src/api.js';

import {setGetBufferImpl} from './src/io';
import {readFile} from 'fs/promises';
setGetBufferImpl(readFile);
export * from './api';

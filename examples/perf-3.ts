import * as oflo from '../src/api-with-parse.js';
import {registerFontAsset} from '../assets/register.js';
import {bench, run} from 'mitata';
import {clearWordCache} from '../src/text.js';

console.time('Add fonts');
registerFontAsset('Roboto/Roboto-Regular.ttf');
console.timeEnd('Add fonts');
console.log();

function word() {
  let ret = '';
  for (let i = 0; i < 10; i++) {
    ret += String.fromCharCode(97 + Math.floor(Math.random() * 26));
  }
  return ret;
}

const words: string[] = [];

for (let i = 0; i < 10000; i++) words.push(word());

bench('generate and layout one random word', () => {
  const rootElement = oflo.dom(words[Math.floor(Math.random() * words.length)]);
  const blockContainer = oflo.generate(rootElement);
  clearWordCache();
  oflo.layout(blockContainer, 100, 20);
});

await run();

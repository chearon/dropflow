import fs from 'fs';
import path from 'path';
import request from 'request';
import * as lbClasses from './src/line-break.js';
import * as gbClasses from './src/grapheme-break.js';
import UnicodeTrieBuilder from 'unicode-trie/builder.js';
import {URL} from 'url';

const __dirname = new URL('.', import.meta.url).pathname;

function writeTrie(filename, trie) {
  const buffer = trie.toBuffer();
  let src = 'import UnicodeTrie from \'unicode-trie\';\n'
    + 'export default new UnicodeTrie(new Uint8Array([';
  for (let i = 0; i < buffer.length; ++i) {
    src += i > 0 ? ',' + buffer[i] : buffer[i];
  }
  src += ']));';
  fs.writeFileSync(filename, src);
}

request('http://www.unicode.org/Public/14.0.0/ucd/LineBreak.txt', function (err, res, data) {
  const matches = data.match(/^[0-9A-F]+(\.\.[0-9A-F]+)?;[A-Z][A-Z0-9]([A-Z])?/gm);

  let start = null;
  let end = null;
  let type = null;
  const trie = new UnicodeTrieBuilder(lbClasses.XX, 0);

  // collect entries in the linebreaking table into ranges
  // to keep things smaller.
  for (let line of matches) {
    let rangeEnd, rangeType;
    const matches = line.split(/;|\.\./);
    const rangeStart = matches[0];

    if (matches.length === 3) {
      rangeEnd = matches[1];
      rangeType = matches[2];
    } else {
      rangeEnd = rangeStart;
      rangeType = matches[1];
    }

    if ((type != null) && (rangeType !== type)) {
      if (typeof lbClasses[type] !== 'number') {
        throw new Error(`Class ${type} not found; update line-break.ts?`);
      }
      trie.setRange(parseInt(start, 16), parseInt(end, 16), lbClasses[type], true);
      type = null;
    }

    if (type == null) {
      start = rangeStart;
      type = rangeType;
    }

    end = rangeEnd;
  }

  trie.setRange(parseInt(start, 16), parseInt(end, 16), lbClasses[type], true);
  
  writeTrie(path.join(__dirname, 'gen/line-break-trie.ts'), trie);
});

request(`http://www.unicode.org/Public/8.0.0/ucd/auxiliary/GraphemeBreakProperty.txt`, function (err, res, data) {
  let match;
  const re = /^([0-9A-F]+)(?:\.\.([0-9A-F]+))?\s*;\s*([A-Za-z_]+)/gm;

  const trie = new UnicodeTrieBuilder(gbClasses.Other, 0);

  // collect entries in the table into ranges
  // to keep things smaller.
  while ((match = re.exec(data))) {
    const start = match[1];
    const end = match[2] != null ? match[2] : start;
    const type = match[3];
    if (typeof gbClasses[type] !== 'number') {
      throw new Error(`Class ${type} not found; update grapheme-break.ts?`);
    }

    trie.setRange(parseInt(start, 16), parseInt(end, 16), gbClasses[type]);
  }

  writeTrie(path.join(__dirname, 'gen/grapheme-break-trie.ts'), trie);
});

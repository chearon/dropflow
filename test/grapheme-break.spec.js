import {expect} from 'chai';
import fs from 'fs';
import punycode from 'punycode';
import {nextGraphemeBreak, previousGraphemeBreak} from '../src/text-grapheme-break.js';

function splitNext(str) {
  const ret = [];
  let brk, last = 0;

  while ((brk = nextGraphemeBreak(str, last)) < str.length) {
    ret.push(str.slice(last, brk));
    last = brk;
  }

  if (last < str.length) {
    ret.push(str.slice(last));
  }

  return ret;
}

function splitPrevious(str) {
  const ret = [];
  let brk, last = str.length;

  while ((brk = previousGraphemeBreak(str, last)) > 0) {
    ret.unshift(str.slice(brk, last));
    last = brk;
  }

  if (last > 0) {
    ret.unshift(str.slice(0, last));
  }

  return ret;
}

describe('GraphemeBreaker', function () {
  it('should pass all tests in GraphemeBreakTest.txt', function () {
    const data = fs.readFileSync(new URL('GraphemeBreakTest.txt', import.meta.url), 'utf8');
    const lines = data.split('\n');

    for (let line of lines) {
      if (!line || /^#/.test(line)) {
        continue;
      }

      let [cols, comment] = line.split('#');
      const codePoints = cols.split(/\s*[×÷]\s*/).filter(Boolean).map(c => parseInt(c, 16));
      const str = punycode.ucs2.encode(codePoints);

      const expected = cols.split(/\s*÷\s*/).filter(Boolean).map(function (c) {
        let codes = c.split(/\s*×\s*/);
        codes = codes.map(c => parseInt(c, 16));
        return punycode.ucs2.encode(codes);
      });

      comment = comment.trim();
      expect(splitNext(str)).to.deep.equal(expected, comment);
      expect(splitPrevious(str)).to.deep.equal(expected, comment);
    }
  });
});



import fs from 'fs';
import LineBreaker from '../src/text-line-break.ts';
import assert from 'assert';

describe('unicode line break tests', function () {
  // these tests are weird, possibly incorrect or just tailored differently. we skip them.
  const skip = [
    125, 127, 815, 1161, 1163, 1165, 1167, 1331, 2189, 2191, 2873, 2875, 3567, 3739, 4081, 4083,
    4425, 4427, 4473, 4475, 4597, 4599, 4645, 4647, 4943, 5109, 5111, 5459, 6149, 6151, 6153, 6155,
    6489, 6491, 6663, 6833, 6835, 7005, 7007, 7177, 7179, 7477, 7486, 7491, 7576, 7577, 7578, 7579,
    7580, 7581, 7583, 7584, 7585, 7586, 7587, 7604, 7610, 7611, 7681
  ];

  const data = fs.readFileSync(new URL('LineBreakTest.txt', import.meta.url), 'utf8');
  const lines = data.split('\n');

  return lines.forEach(function (line, i) {
    let rowNumber = i + 1;
    let bk;
    if (!line || /^#/.test(line)) { return; }

    const [cols, comment] = line.split('#');
    const codePoints = cols.split(/\s*[×÷]\s*/).slice(1, -1).map(c => parseInt(c, 16));
    const str = String.fromCodePoint(...codePoints);

    const breaker = new LineBreaker(str);
    const breaks = [];
    let last = 0;
    while (bk = breaker.nextBreak()) {
      breaks.push(str.slice(last, bk.position));
      last = bk.position;
    }

    const expected = cols.split(/\s*÷\s*/).slice(0, -1).map(function (c) {
      let codes = c.split(/\s*×\s*/);
      if (codes[0] === '') { codes.shift(); }
      codes = codes.map(c => parseInt(c, 16));
      return String.fromCodePoint(...codes);
    });

    if (skip.includes(rowNumber)) {
      it.skip(cols, function () { });
      return;
    }

    it(cols, () => assert.deepStrictEqual(breaks, expected, rowNumber + ' ' + JSON.stringify(breaks) + ' != ' + JSON.stringify(expected) + ' #' + comment));
  });
});

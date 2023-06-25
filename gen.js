import fs from 'fs';
import path from 'path';
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

async function generateLineBreakTrie() {
  const res = await fetch('http://www.unicode.org/Public/14.0.0/ucd/LineBreak.txt');
  if (res.status !== 200) throw new Error(res.status);
  const data = await res.text();
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
}

async function generateGraphemeBreakTrie() {
  const res = await fetch(`http://www.unicode.org/Public/8.0.0/ucd/auxiliary/GraphemeBreakProperty.txt`);
  if (res.status !== 200) throw new Error(res.status);
  const data = await res.text();
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
}

async function generateLangScriptDatabase() {
  // To update, clone fontconfig and ls fc-lang/*.orth
  const langs = ['aa', 'bg', 'co', 'fat', 'hif', 'ka', 'ky', 'mjw', 'nn', 'pt', 'shn', 'szl', 'ug', 'yuw', 'ab', 'bh', 'crh', 'ff', 'hne', 'kaa', 'la', 'mk', 'no', 'qu', 'shs', 'ta', 'uk', 'za', 'af', 'bhb', 'cs', 'fi', 'ho', 'kab', 'lah', 'ml', 'nqo', 'quz', 'si', 'tcy', 'und_zmth', 'zh_cn', 'agr', 'bho', 'csb', 'fil', 'hr', 'ki', 'lb', 'mn_cn', 'nr', 'raj', 'sid', 'te', 'und_zsye', 'zh_hk', 'ak', 'bi', 'cu', 'fj', 'hsb', 'kj', 'lez', 'mn_mn', 'nso', 'rif', 'sk', 'tg', 'unm', 'zh_mo', 'am', 'bin', 'cv', 'fo', 'ht', 'kk', 'lg', 'mni', 'nv', 'rm', 'sl', 'th', 'ur', 'zh_sg', 'an', 'bm', 'cy', 'fr', 'hu', 'kl', 'li', 'mnw', 'ny', 'rn', 'sm', 'the', 'uz', 'zh_tw', 'anp', 'bn', 'da', 'fur', 'hy', 'km', 'lij', 'mo', 'oc', 'ro', 'sma', 'ti_er', 've', 'zu', 'ar', 'bo', 'de', 'fy', 'hz', 'kn', 'ln', 'mr', 'om', 'ru', 'smj', 'ti_et', 'vi', 'as', 'br', 'doi', 'ga', 'ia', 'ko', 'lo', 'ms', 'or', 'rw', 'smn', 'tig', 'vo', 'ast', 'brx', 'dsb', 'gd', 'id', 'kok', 'lt', 'mt', 'os', 'sa', 'sms', 'tk', 'vot', 'av', 'bs', 'dv', 'gez', 'ie', 'kr', 'lv', 'my', 'ota', 'sah', 'sn', 'tl', 'wa', 'ay', 'bua', 'dz', 'gl', 'ig', 'ks', 'lzh', 'na', 'pa', 'sat', 'so', 'tn', 'wae', 'ayc', 'byn', 'ee', 'gn', 'ii', 'ku_am', 'mag', 'nan', 'pa_pk', 'sc', 'sq', 'to', 'wal', 'az_az', 'ca', 'el', 'gu', 'ik', 'ku_iq', 'mai', 'nb', 'pap_an', 'sco', 'sr', 'tpi', 'wen', 'az_ir', 'ce', 'en', 'gv', 'io', 'ku_ir', 'mfe', 'nds', 'pap_aw', 'sd', 'ss', 'tr', 'wo', 'ba', 'ch', 'eo', 'ha', 'is', 'ku_tr', 'mg', 'ne', 'pes', 'se', 'st', 'ts', 'xh', 'be', 'chm', 'es', 'hak', 'it', 'kum', 'mh', 'ng', 'pl', 'sel', 'su', 'tt', 'yap', 'bem', 'chr', 'et', 'haw', 'iu', 'kv', 'mhr', 'nhn', 'prs', 'sg', 'sv', 'tw', 'yi', 'ber_dz', 'ckb', 'eu', 'he', 'ja', 'kw', 'mi', 'niu', 'ps_af', 'sgs', 'sw', 'ty', 'yo', 'ber_ma', 'cmn', 'fa', 'hi', 'jv', 'kwm', 'miq', 'nl', 'ps_pk', 'sh', 'syr', 'tyv', 'yue'];

  /** @type {Map<string, ([number] | [number, number])[]>} */
  const orths = new Map();
  /** @type {Map<string, string[]>} */
  const dependencies = new Map();

  let errors = 0;
  console.log('Rebuilding gen/lang-script-database.ts...');
  for (const langFile of langs) {
    const lang = langFile.replace('_', '-');
    const url = `https://gitlab.freedesktop.org/fontconfig/fontconfig/-/raw/main/fc-lang/${langFile}.orth`;
    console.log(url);
    let errored = false;
    let res;

    try {
      res = await fetch(url);
    } catch (e) {
      console.log(`==> Fetch error: ${e.message}`);
      errors += 1;
      errored = true;
    }

    if (res.status !== 200) {
      console.log(`==> Got ${res.status}`);
      errors += 1;
      errored = true;
    }

    if (errored) {
      if (errors > 5) {
        console.log('==> Too many errors, quitting');
        process.exit();
      } else {
        console.log('==> Continuing anyways');
        continue;
      }
    }

    const text = await res.text();
    const rStartToComment = /^([^#]+)/;
    const rSingleCodepoint = /[0-9A-Fa-f]{4}/;
    const rCodepointRange = /([0-9A-Fa-f]{4})-([0-9A-Fa-f]{4})/;
    const rInclude = /include ([^.]+).orth/;
    /** @type {([string] | [string, string])[]} */
    const langOrths = [];
    const langDeps = [];

    let nRanges = 0;
    let nSingle = 0;
    let nIncludes = 0;

    for (const line of text.split('\n')) {
      const untilCommentMatch = rStartToComment.exec(line);

      if (untilCommentMatch) {
        const [, untilComment] = untilCommentMatch;
        const codepointRangeMatch = rCodepointRange.exec(untilComment);

        if (codepointRangeMatch) {
          const [, start, end] = codepointRangeMatch;
          langOrths.push([parseInt(start, 16), parseInt(end, 16)]);
          nRanges += 1;
          continue;
        }

        const singleCodepointMatch = rSingleCodepoint.exec(untilComment);

        if (singleCodepointMatch) {
          const [codepoint] = singleCodepointMatch;
          langOrths.push([parseInt(codepoint, 16)]);
          nSingle += 1;
          continue;
        }

        const includeMatch = rInclude.exec(untilComment);

        if (includeMatch) {
          const [, dependsOn] = includeMatch;
          langDeps.push(dependsOn.replace('_', '-'));
          nIncludes += 1;
        }
      }
    }

    console.log(`==> ${nRanges} range(s), ${nSingle} single codepoints, ${nIncludes} includes`);

    orths.set(lang, langOrths);
    dependencies.set(lang, langDeps);

    // Seems curteous
    await new Promise(resolve => setTimeout(resolve, 100));
  }

  let scriptDatabaseTs = `import {hb} from '../src/deps.js';\n`;
  scriptDatabaseTs += `import type {HbSet} from 'harfbuzzjs';\n\n`;
  scriptDatabaseTs += `const langs = new Map(${JSON.stringify([...orths.entries()])})\n`;
  scriptDatabaseTs += `const dependencies = new Map(${JSON.stringify([...dependencies.entries()])});\n\n`;
  scriptDatabaseTs += `export const languageCoverage: Record<string, HbSet> = {};\n`;
  scriptDatabaseTs += `
  for (const [lang, ranges] of langs) {
    const set = hb.createSet();
    for (const range of ranges) {
      if (range.length === 1) {
        set.add(range[0]);
      } else {
        set.addRange(range[0], range[1]);
      }
    }
    languageCoverage[lang] = set;
  }

  const seen = new Set();
  const stack = [...dependencies.keys()];

  while (stack.length) {
    const lang = stack.pop()!;
    const dependsOnLangs = dependencies.get(lang)!;
    const processed = seen.has(lang) || dependsOnLangs.length === 0;

    seen.add(lang);

    if (processed) {
      for (const dependsOn of dependsOnLangs) {
        languageCoverage[lang].union(languageCoverage[dependsOn]);
      }
    } else {
      stack.push(lang);
      for (const dependsOn of dependsOnLangs) {
        stack.push(dependsOn);
      }
    }
  }
  `;

  fs.writeFileSync(path.join(__dirname, 'gen/lang-script-database.ts'), scriptDatabaseTs);
}

const fns = process.argv.slice(2).map(command => {
  if (command === 'line-break-trie') return generateLineBreakTrie;
  if (command === 'grapheme-break-trie') return generateGraphemeBreakTrie;
  if (command === 'lang-script-database') return generateLangScriptDatabase;
  console.error(`Usage: node gen.js (cmd )+
Available commands:
  line-break-trie
  grapheme-break-trie
  lang-script-database`);
  process.exit(1);
});

for (const fn of fns) await fn();

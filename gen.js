import 'dropflow'; // needed because some import below imports WASM
import fs from 'fs';
import path from 'path';
import * as LineBreakTrie from './dist/src/trie-line-break.js';
import * as GraphemeBreakTrie from './dist/src/trie-grapheme-break.js';
import * as EmojiTrie from './dist/src/trie-emoji.js';
import * as DerivedCorePropertiesTrie from './dist/src/trie-derived-core-properties.js';
import UnicodeTrieBuilder from './dist/src/text-unicode-trie-builder.js';
import {getTrie, encodeTrie} from './dist/src/string-trie-encode.js';
import {hb_tag} from './dist/src/text-harfbuzz.js';
import {URL} from 'url';

// TODO: common function for unicode data file parsing

const __dirname = new URL('.', import.meta.url).pathname;

function writeTrie(filename, varname, trie) {
  const buffer = trie.toBuffer();
  fs.writeFileSync(filename, `// generated from gen.js
#include <stdint.h>
__attribute__((used))
uint32_t ${varname}[] = {${buffer.join(', ')}};
`);
}

async function generateLineBreakTrie() {
  const res = await fetch('http://www.unicode.org/Public/14.0.0/ucd/LineBreak.txt');
  if (res.status !== 200) throw new Error(res.status);
  const data = await res.text();
  const matches = data.match(/^[0-9A-F]+(\.\.[0-9A-F]+)?;[A-Z][A-Z0-9]([A-Z])?/gm);

  let start = null;
  let end = null;
  let type = null;
  const trie = new UnicodeTrieBuilder(LineBreakTrie.XX, 0);

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
      if (typeof LineBreakTrie[type] !== 'number') {
        throw new Error(`Class ${type} not found; update text-line-break.ts?`);
      }
      trie.setRange(parseInt(start, 16), parseInt(end, 16), LineBreakTrie[type], true);
      type = null;
    }

    if (type == null) {
      start = rangeStart;
      type = rangeType;
    }

    end = rangeEnd;
  }

  trie.setRange(parseInt(start, 16), parseInt(end, 16), LineBreakTrie[type], true);
  
  writeTrie(path.join(__dirname, 'gen/line-break-trie.cc'), 'line_break_trie', trie);
}

async function generateGraphemeBreakTrie() {
  const res = await fetch(`https://www.unicode.org/Public/15.1.0/ucd/auxiliary/GraphemeBreakProperty.txt`);
  if (res.status !== 200) throw new Error(res.status);
  const data = await res.text();
  let match;
  const re = /^([0-9A-F]+)(?:\.\.([0-9A-F]+))?\s*;\s*([A-Za-z_]+)/gm;

  const trie = new UnicodeTrieBuilder(GraphemeBreakTrie.Other, 0);

  // collect entries in the table into ranges
  // to keep things smaller.
  while ((match = re.exec(data))) {
    const start = match[1];
    const end = match[2] != null ? match[2] : start;
    const type = match[3];
    if (typeof GraphemeBreakTrie[type] !== 'number') {
      throw new Error(`Class ${type} not found; update text-grapheme-break.ts?`);
    }

    trie.setRange(parseInt(start, 16), parseInt(end, 16), GraphemeBreakTrie[type]);
  }

  writeTrie(path.join(__dirname, 'gen/grapheme-break-trie.cc'), 'grapheme_break_trie', trie);
}

async function generateDerivedCorePropertiesTrie() {
  const res = await fetch(`https://www.unicode.org/Public/15.1.0/ucd/DerivedCoreProperties.txt`);
  if (res.status !== 200) throw new Error(response.status);
  const data = await res.text();

  let match;
  const re = /^([0-9A-F]+)(?:\.\.([0-9A-F]+))?\s*;\s*([A-Za-z_]+)(;?\s*([A-Za-z_]+))?/gm;

  const trie = new UnicodeTrieBuilder();

  while ((match = re.exec(data))) {
    const start = match[1];
    const end = match[2] != null ? match[2] : start;
    const type = match[3];
    const subtype = match[5];
    const varname = subtype ? `${type}_${subtype}` : type;
    if (typeof DerivedCorePropertiesTrie[varname] === 'number') {
      trie.setRange(parseInt(start, 16), parseInt(end, 16), DerivedCorePropertiesTrie[varname]);
    }
  }

  writeTrie(path.join(__dirname, 'gen/derived-core-properties-trie.cc'), 'derived_core_properties_trie', trie);
}
async function generateLangScriptDatabase() {
  // To update, clone fontconfig and ls fc-lang/*.orth
  const langs = ['aa', 'bg', 'co', 'fat', 'hif', 'ka', 'ky', 'mjw', 'nn', 'pt', 'shn', 'szl', 'ug', 'yuw', 'ab', 'bh', 'crh', 'ff', 'hne', 'kaa', 'la', 'mk', 'no', 'qu', 'shs', 'ta', 'uk', 'za', 'af', 'bhb', 'cs', 'fi', 'ho', 'kab', 'lah', 'ml', 'nqo', 'quz', 'si', 'tcy', 'und_zmth', 'zh_cn', 'agr', 'bho', 'csb', 'fil', 'hr', 'ki', 'lb', 'mn_cn', 'nr', 'raj', 'sid', 'te', 'und_zsye', 'zh_hk', 'ak', 'bi', 'cu', 'fj', 'hsb', 'kj', 'lez', 'mn_mn', 'nso', 'rif', 'sk', 'tg', 'unm', 'zh_mo', 'am', 'bin', 'cv', 'fo', 'ht', 'kk', 'lg', 'mni', 'nv', 'rm', 'sl', 'th', 'ur', 'zh_sg', 'an', 'bm', 'cy', 'fr', 'hu', 'kl', 'li', 'mnw', 'ny', 'rn', 'sm', 'the', 'uz', 'zh_tw', 'anp', 'bn', 'da', 'fur', 'hy', 'km', 'lij', 'mo', 'oc', 'ro', 'sma', 'ti_er', 've', 'zu', 'ar', 'bo', 'de', 'fy', 'hz', 'kn', 'ln', 'mr', 'om', 'ru', 'smj', 'ti_et', 'vi', 'as', 'br', 'doi', 'ga', 'ia', 'ko', 'lo', 'ms', 'or', 'rw', 'smn', 'tig', 'vo', 'ast', 'brx', 'dsb', 'gd', 'id', 'kok', 'lt', 'mt', 'os', 'sa', 'sms', 'tk', 'vot', 'av', 'bs', 'dv', 'gez', 'ie', 'kr', 'lv', 'my', 'ota', 'sah', 'sn', 'tl', 'wa', 'ay', 'bua', 'dz', 'gl', 'ig', 'ks', 'lzh', 'na', 'pa', 'sat', 'so', 'tn', 'wae', 'ayc', 'byn', 'ee', 'gn', 'ii', 'ku_am', 'mag', 'nan', 'pa_pk', 'sc', 'sq', 'to', 'wal', 'az_az', 'ca', 'el', 'gu', 'ik', 'ku_iq', 'mai', 'nb', 'pap_an', 'sco', 'sr', 'tpi', 'wen', 'az_ir', 'ce', 'en', 'gv', 'io', 'ku_ir', 'mfe', 'nds', 'pap_aw', 'sd', 'ss', 'tr', 'wo', 'ba', 'ch', 'eo', 'ha', 'is', 'ku_tr', 'mg', 'ne', 'pes', 'se', 'st', 'ts', 'xh', 'be', 'chm', 'es', 'hak', 'it', 'kum', 'mh', 'ng', 'pl', 'sel', 'su', 'tt', 'yap', 'bem', 'chr', 'et', 'haw', 'iu', 'kv', 'mhr', 'nhn', 'prs', 'sg', 'sv', 'tw', 'yi', 'ber_dz', 'ckb', 'eu', 'he', 'ja', 'kw', 'mi', 'niu', 'ps_af', 'sgs', 'sw', 'ty', 'yo', 'ber_ma', 'cmn', 'fa', 'hi', 'jv', 'kwm', 'miq', 'nl', 'ps_pk', 'sh', 'syr', 'tyv', 'yue'];

  fs.writeFileSync(
    path.join(__dirname, 'gen/lang-script-coverage.ts'),
    `export default ${JSON.stringify(langs)};\n`
  );

  /** @type {Map<string, ([number] | [number, number])[]>} */
  const orths = new Map();
  /** @type {Map<string, string[]>} */
  const dependencies = new Map();

  let errors = 0;
  console.log('Rebuilding gen/lang-script-database.cc...');
  for (const lang of langs) {
    const url = `https://gitlab.freedesktop.org/fontconfig/fontconfig/-/raw/main/fc-lang/${lang}.orth`;
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
          langDeps.push(dependsOn);
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

  /**
   * @param {number[][]} ranges
   */
  function toFlatUtf16Array(ranges) {
    const ret = [];
    for (const range of ranges) {
      for (const num of range) {
        for (let s = String.fromCodePoint(num), i = 0; i < s.length; i++) {
          ret.push(s.charCodeAt(i));
        }
      }
    }
    return ret;
  }

  let c = `// generated by gen.js
#include "../../harfbuzz/src/hb.h"
#include <unordered_map>
#include <vector>
#include <unordered_set>

#define U16_SURROGATE_OFFSET ((0xd800<<10UL)+0xdc00-0x10000)
#define U16_GET_SUPPLEMENTARY(lead, trail) \\
  (((int32_t)(lead)<<10UL)+(int32_t)(trail)-U16_SURROGATE_OFFSET)
#define U16_IS_LEAD(c) (((c)&0xfffffc00)==0xd800)
#define U16_IS_TRAIL(c) (((c)&0xfffffc00)==0xdc00)
#define U16_NEXT(s, i, length, c) do { \\
  (c)=(s)[(i)++]; \\
  if(U16_IS_LEAD(c)) { \\
    uint16_t __c2; \\
    if((i)!=(length) && U16_IS_TRAIL(__c2=(s)[(i)])) { \\
      ++(i); \\
      (c)=U16_GET_SUPPLEMENTARY((c), __c2); \\
    } \\
  } \\
} while (0)

`;

  for (const [lang, ranges] of orths) {
    const range1s = toFlatUtf16Array(ranges.filter(r => r.length === 1));
    const range2s = toFlatUtf16Array(ranges.filter(r => r.length === 2));
    c += `static uint16_t lcov_${lang}_1[] = {${range1s.join(', ')}};\n`;
    c += `static int32_t lcov_${lang}_1_length = ${range1s.length};\n`;
    c += `static uint16_t lcov_${lang}_2[] = {${range2s.join(', ')}};\n`;
    c += `static int32_t lcov_${lang}_2_length = ${range2s.length};\n`;
  }

  c += `
static void fill_set(
  hb_set_t* set,
  uint16_t* lcov_1,
  int32_t lcov_1_length,
  uint16_t* lcov_2,
  int32_t lcov_2_length
) {
  int32_t c = 0;
  int32_t i = 0;
  while (i < lcov_1_length) {
    U16_NEXT(lcov_1, i, lcov_1_length, c);
    hb_set_add(set, c);
  }

  int32_t c1 = 0;
  int32_t c2 = 0;
  i = 0;
  while (i < lcov_2_length) {
    U16_NEXT(lcov_2, i, lcov_2_length, c1);
    U16_NEXT(lcov_2, i, lcov_2_length, c2);
    hb_set_add_range(set, c1, c2);
  }
}

`;

  for (const [lang] of orths) {
    c += '__attribute__((visibility("default")))\n';
    c += `__attribute__((used)) hb_set_t* ${lang}_coverage;\n`;
  }

  c += '__attribute__((export_name("lang_script_database_init")))\n';
  c += 'void lang_script_database_init() {\n';
  for (const [lang] of orths) {
    c += `  ${lang}_coverage = hb_set_create();\n`;
    c += `  fill_set(
    ${lang}_coverage,
    lcov_${lang}_1,
    lcov_${lang}_1_length,
    lcov_${lang}_2,
    lcov_${lang}_2_length
  );
`;
  }
  c += `
  std::unordered_set<hb_set_t*> seen;
  std::vector<hb_set_t*> stack = {${[...dependencies.keys()].map(l => l + '_coverage').join(', ')}};
  std::unordered_map<hb_set_t*, std::vector<hb_set_t*>> dependencies = {\n`;

  for (const [name, langs] of dependencies) {
    const vector = `{${langs.map(lang => lang + '_coverage').join(', ')}}`;
    c += `    {${name + '_coverage'}, ${vector}},\n`
  }

  c += '  };\n';

  c += `
  while (stack.size()) {
    hb_set_t* lang = stack.back();
    std::vector<hb_set_t*> depends_on_langs = dependencies[lang];
    bool processed = seen.find(lang) != seen.end() || depends_on_langs.size() == 0;

    stack.pop_back();
    seen.insert(lang);

    if (processed) {
      for (hb_set_t* depends_on : depends_on_langs) {
        hb_set_union(lang, depends_on);
      }
    } else {
      stack.push_back(lang);
      for (hb_set_t* depends_on : depends_on_langs) {
        stack.push_back(depends_on);
      }
    }
  }
}
`;

  fs.writeFileSync(path.join(__dirname, 'gen/lang-script-database.cc'), c);
}

async function generateEntityTrie() {
  const res = await fetch('https://html.spec.whatwg.org/entities.json');
  if (res.status !== 200) throw new Error(res.status);
  const resMap = JSON.parse(await res.text());
  const map = {};
  for (const key in resMap) map[key.slice(1)] = resMap[key].characters;
  console.log(`Generating ${Object.keys(map).length} entities...`);
  const encoded = encodeTrie(getTrie(map));
  const stringified = JSON.stringify(String.fromCharCode(...encoded))
    .replace(
        /[^\x20-\x7e]/g,
        (c) => `\\u${c.charCodeAt(0).toString(16).padStart(4, "0")}`
    )
    .replace(/\\u0000/g, "\\0")
    .replace(/\\u00([\da-f]{2})/g, "\\x$1");

  // Write the encoded trie to disk
  fs.writeFileSync(
  path.join(__dirname, `gen/entity-trie.ts`),
  `// Generated from gen.js

export default new Uint16Array(
    ${stringified}
        .split("")
        .map((c) => c.charCodeAt(0))
);
`);
}

async function generateEmojiTrie() {
  const res = await fetch('https://www.unicode.org/Public/15.0.0/ucd/emoji/emoji-data.txt');
  const re = /^([0-9A-F]+)(?:\.\.([0-9A-F]+))?\s*;\s*([A-Za-z_]+)/gm;
  const trie = new UnicodeTrieBuilder();

  if (res.status !== 200) throw new Error(res.status);

  const text = await res.text();

  let match;

  while ((match = re.exec(text))) {
    const start = parseInt(match[1], 16);
    const end = match[2] != null ? parseInt(match[2], 16) : start;
    const type = match[3];
    if (typeof EmojiTrie[type] !== 'number') continue;
    for (let i = start; i <= end; i++) {
      const current = trie.get(i);
      trie.set(i, current | EmojiTrie[type]);
    }
  }

  writeTrie(path.join(__dirname, 'gen/emoji-trie.cc'), 'emoji_trie', trie);
}

async function getScriptNames() {
  const res = await fetch('https://www.unicode.org/iso15924/iso15924.txt');
  if (res.status !== 200) throw new Error(res.statusText);
  const text = await res.text();
  /** @type {Map<string, number>} */
  const nameToCode = new Map([['Common', 0]]);
  /** @type {Map<string, number>} */
  const nameToTag = new Map([['Common', hb_tag('dflt')]]);
  /** @type {Map<number, string>} */
  const codeToName = new Map([[0, 'Common']]);
  /** @type {Map<number, number>} */
  const tagToCode = new Map([[hb_tag('dflt'), 0]]);
  let code = 1;

  for (const line of text.split('\n')) {
    if (line.startsWith('#') || !line.trim().length) continue;
    const [tag, /*no*/, /*en*/, /*fr*/, name, /*ver*/, /*date*/] = line.split(';');
    if (nameToCode.has(name)) continue; // Common
    nameToCode.set(name, code);
    nameToTag.set(name, hb_tag(tag));
    codeToName.set(code, name);
    tagToCode.set(hb_tag(tag), code);
    code += 1;
  }

  return {nameToCode, nameToTag, codeToName, tagToCode};
}

async function generateScriptNames() {
  const {nameToCode, nameToTag, codeToName, tagToCode} = await getScriptNames();
  fs.writeFileSync(path.join(__dirname, 'gen/script-names.ts'), `// generated from gen.js
export const nameToCode = new Map(${JSON.stringify([...nameToCode.entries()])});
export const nameToTag = new Map(${JSON.stringify([...nameToTag.entries()])});
export const codeToName = new Map(${JSON.stringify([...codeToName.entries()])});
export const tagToCode = new Map(${JSON.stringify([...tagToCode.entries()])});
`);
}

async function generateScriptTrie() {
  const res = await fetch('https://www.unicode.org/Public/15.0.0/ucd/Scripts.txt');
  const re = /^([0-9A-F]+)(?:\.\.([0-9A-F]+))?\s*;\s*([A-Za-z_]+)/gm;
  const trie = new UnicodeTrieBuilder();
  /** @type {Map<string, number>} */
  const {nameToCode} = await getScriptNames();

  if (res.status !== 200) throw new Error(res.status);

  const text = await res.text();

  let match;

  while ((match = re.exec(text))) {
    const start = match[1];
    const end = match[2] != null ? match[2] : start;
    const name = match[3];
    const code = nameToCode.get(name);
    if (code === undefined) throw new Error(`PVA ${name} not found in iso15924.txt`);
    trie.setRange(parseInt(start, 16), parseInt(end, 16), code);
  }

  writeTrie(path.join(__dirname, 'gen/script-trie.cc'), 'script_trie', trie);
}

const excludedFonts = new Set([
  'Noto Sans Mono', // Don't know why this is in sans-serif category
  'Noto Sans Emoji', // Color Emoji is enough
  'Noto Sans Display', // Don't know what it is
  'Noto Sans HK', // I think TC is more widely applicable
]);

// We only add one of each subset (eg latin, khmer) and there is overlap between
// families, so tweak the ordering here. Note 50 is the default priority.
const priorities = new Map([
  ['Noto Sans', 0], // Just because Latin is so common
  ['Noto Sans Arabic', 0], // Noto Sans Kufi Arabic is a traditional style
  ['Noto Sans Math', 0], // Lots of other fonts encode math
  ['Noto Sans TC', 90], // Seems to overwrite other fonts like Khmer
  ['Noto Sans JP', 91], // I think Japanese should load later since it uses some Chinese
  ['Noto Sans KR', 91], // Same for Korean
  ['Noto Sans Mongolian', 91], // And Mongolian
]);

async function generateNotoFonts() {
  const res = await fetch('https://api.fontsource.org/v1/fonts')
  /** @type {Set<string>} */
  const addedSubsets = new Set();

  if (res.status !== 200) throw new Error(res.statusText);

  const json = await res.json();
  const calls = [];
  let skipSubsets = new Set(addedSubsets);

  function addVariants(unicodeRange, family, weight, style, variantMap) {
    if (!variantMap) return;

    for (const [subset, data] of Object.entries(variantMap)) {
      const ttf = data?.url?.ttf;
      if (ttf && !skipSubsets.has(subset) && unicodeRange[subset]) {
        const subsetUnicodeRange = unicodeRange[subset];
        addedSubsets.add(subset);
        console.log(family, ttf);
        let ts = '';
        ts += `fonts.add(\n`;
        ts += `  new FontFace(\n`;
        ts += `    '${family}',\n`;
        ts += `    new URL('${ttf}'),\n`
        ts += `    {weight: ${weight}, style: '${style}', unicodeRange: '${subsetUnicodeRange}'}\n`
        ts += `  )\n`;
        ts += `);\n`;
        calls.push(ts);
      }
    }
  }

  // Descending priority so it's easy to track which subsets we added already
  json.sort((f1, f2) => {
    const p1 = priorities.get(f1.family) ?? 50;
    const p2 = priorities.get(f2.family) ?? 50;
    return p1 < p2 ? -1 : p1 > p2 ? 1 : 0;
  });

  let ts = '// generated from gen.js\n';
  ts += 'import {fonts, FontFace} from \'../src/text-font.ts\';\n';
  ts += 'let called = false;\n';
  ts += 'export default function registerNotoFonts() {\n';
  ts += 'if (called) return;\n';
  ts += 'called = true;\n';

  for (const {family, category, id} of json) {
    if (
      family.startsWith('Noto') &&
      !excludedFonts.has(family) &&
      category === 'sans-serif'
    ) {
      const res = await fetch(`https://api.fontsource.org/v1/fonts/${id}`);

      if (res.status !== 200) throw new Error(res.statusText);

      const {unicodeRange, subsets, variants} = await res.json();

      // Normally, all subsets are in the unicodeRange map.
      // Noto Sans TC (and maybe JP/KR?) has keys like [0] and [1] in the
      // unicodeRange since those fonts are, for CJK characters, normally split
      // up into subsets on NPM. However, the URL given by the fontsource API is
      // the full TTF, so just merge those unicode ranges and assume they go
      // with the missing subset
      const missingSubsets = new Set(subsets);
      for (const subset in unicodeRange) missingSubsets.delete(subset);
      if (missingSubsets.size === 1) {
        const subset = missingSubsets.values().next().value;
        let combinedRange = '';
        for (const subset in unicodeRange) {
          if (subset.startsWith('[') && subset.endsWith(']')) {
            combinedRange += (combinedRange.length ? ',' : '') + unicodeRange[subset];
          }
        }
        unicodeRange[subset] = combinedRange;
      }

      // Some subsetted scripts that aren't Latin have italic versions, but as
      // far as I know, italics is a Latin-specific thing. I looked at
      // Devanagari's italic versions and it was just a bold version.
      const italicRegular = {latin: variants['400']?.['italic']?.['latin']};
      const italicBold = {latin: variants['700']?.['italic']?.['latin']};

      skipSubsets = new Set(addedSubsets);
      addVariants(unicodeRange, family, '400', 'normal', variants['400']?.['normal']);
      addVariants(unicodeRange, family, '400', 'italic', italicRegular);
      addVariants(unicodeRange, family, '700', 'normal', variants['700']?.['normal']);
      addVariants(unicodeRange, family, '700', 'italic', italicBold);
    }
  }

  // FontFaceSet is in ascending priority
  ts += calls.reverse().join('');

  ts += '}\n';

  fs.writeFileSync(path.join(__dirname, `gen/register-noto-fonts.ts`), ts);
}

const fns = process.argv.slice(2).map(command => {
  if (command === 'line-break-trie') return generateLineBreakTrie;
  if (command === 'grapheme-break-trie') return generateGraphemeBreakTrie;
  if (command === 'lang-script-database') return generateLangScriptDatabase;
  if (command === 'entity-trie') return generateEntityTrie;
  if (command === 'emoji-trie') return generateEmojiTrie;
  if (command === 'script-trie') return generateScriptTrie;
  if (command === 'script-names') return generateScriptNames;
  if (command === 'noto-fonts') return generateNotoFonts;
  if (command === 'derived-core-properties-trie') return generateDerivedCorePropertiesTrie;
  console.error(`Usage: node gen.js (cmd )+
Available commands:
  line-break-trie
  grapheme-break-trie
  lang-script-database
  entity-trie
  emoji-trie
  script-trie
  script-names
  noto-fonts
  derived-core-properties-trie`);
  process.exit(1);
});

for (const fn of fns) await fn();



// Based on unicode-trie from Devon Govett, which is based on Utrie2 from the
// ICU project.
//
// The unicode-trie port is a direct code translation without much understanding
// of the original source. I have removed several features that are only used
// for collation and handling encoding errors, making the index tables and data
// block layout much easier to understand. The result is a codepoint-only trie.
//
// I've also removed gzip since it's another dependency and redundant since
// browsers already do that
//
// Copyright 2018 Devon Govett
//
// Permission is hereby granted, free of charge, to any person obtaining a copy
// of this software and associated documentation files (the "Software"), to
// deal in the Software without restriction, including without limitation the
// rights to use, copy, modify, merge, publish, distribute, sublicense, and/or
// sell copies of the Software, and to permit persons to whom the Software is
// furnished to do so, subject to the following conditions:
//
// The above copyright notice and this permission notice shall be included in
// all copies or substantial portions of the Software.
//
// THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
// IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,
// FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE
// AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER
// LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING
// FROM, OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS
// IN THE SOFTWARE.

/** Shift size for getting the index-1 table offset. */
export const SHIFT_1 = 6 + 5;

/** Shift size for getting the index-2 table offset. */
export const SHIFT_2 = 5;

/**
 * Difference between the two shift sizes;
 * for getting an index-1 offset from an index-2 offset. 6=11-5
 */
export const SHIFT_1_2 = SHIFT_1 - SHIFT_2;

/**
 * Number of index-1 entries for the BMP. 32=0x20
 * This part of the index-1 table is omitted from the serialized form.
 */
export const OMITTED_BMP_INDEX_1_LENGTH = 0x10000 >> SHIFT_1;

/** Number of code points per index-1 table entry. 2048=0x800 */
export const CP_PER_INDEX_1_ENTRY = 1 << SHIFT_1;

/** Number of entries in an index-2 block. 64=0x40 */
export const INDEX_2_BLOCK_LENGTH = 1 << SHIFT_1_2;

/** Mask for getting the lower bits for the in-index-2-block offset. */
export const INDEX_2_MASK=INDEX_2_BLOCK_LENGTH - 1;

/** Number of entries in a data block. 32=0x20 */
export const DATA_BLOCK_LENGTH = 1 << SHIFT_2;

/** Mask for getting the lower bits for the in-data-block offset. */
export const DATA_MASK=DATA_BLOCK_LENGTH - 1;

/**
 * Shift size for shifting left the index array values.
 * Increases possible data size with 16-bit index values at the cost
 * of compactability.
 * This requires data blocks to be aligned by DATA_GRANULARITY.
 */
export const INDEX_SHIFT = 2;

/** The alignment size of a data block. Also the granularity for compaction. */
export const DATA_GRANULARITY = 1 << INDEX_SHIFT;

/* Fixed layout of the first part of the index array. ------------------- */

/**
 * The BMP part of the index-2 table is fixed and linear and starts at offset 0.
 */
export const INDEX_2_OFFSET = 0;

/**
 * Length=2048=0x800=0x10000>>SHIFT_2.
 */
export const INDEX_2_BMP_LENGTH = 0x10000 >> SHIFT_2;

/**
 * The index-1 table, only used for supplementary code points, at offset 2048=0x800.
 * Variable length, for code points up to highStart, where the last single-value range starts.
 * Maximum length 512=0x200=0x100000>>SHIFT_1.
 * (For 0x100000 supplementary code points U+10000..U+10ffff.)
 *
 * The part of the index-2 table for supplementary code points starts
 * after this index-1 table.
 *
 * Both the index-1 table and the following part of the index-2 table
 * are omitted completely if there is only BMP data.
 */
export const INDEX_1_OFFSET = INDEX_2_BMP_LENGTH;
export const MAX_INDEX_1_LENGTH = 0x100000 >> SHIFT_1;

export default class UnicodeTrie {
  highStart: number;
  errorValue: number;
  data: Uint32Array;

  constructor(data: Uint32Array) {
    this.highStart = data[0];
    this.errorValue = data[1];
    this.data = data.subarray(2);
  }

  get(codePoint: number) {
    let index;

    if (codePoint < 0 || codePoint > 0x10ffff) {
      return this.errorValue;
    }

    if (codePoint <= 0xffff) {
      // Ordinary BMP code point, excluding leading surrogates.
      // BMP uses a single level lookup.  BMP index starts at offset 0 in the index.
      // data is stored in the index array itself.
      index = (this.data[codePoint >> SHIFT_2] << INDEX_SHIFT) + (codePoint & DATA_MASK);
      return this.data[index];
    }

    if (codePoint < this.highStart) {
      // Supplemental code point, use two-level lookup.
      index = this.data[(INDEX_1_OFFSET - OMITTED_BMP_INDEX_1_LENGTH) + (codePoint >> SHIFT_1)];
      index = this.data[index + ((codePoint >> SHIFT_2) & INDEX_2_MASK)];
      index = (index << INDEX_SHIFT) + (codePoint & DATA_MASK);
      return this.data[index];
    }

    return this.data[this.data.length - DATA_GRANULARITY];
  }
}


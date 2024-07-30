/** Shift size for getting the index-1 table offset. */
export declare const SHIFT_1: number;
/** Shift size for getting the index-2 table offset. */
export declare const SHIFT_2 = 5;
/**
 * Difference between the two shift sizes;
 * for getting an index-1 offset from an index-2 offset. 6=11-5
 */
export declare const SHIFT_1_2: number;
/**
 * Number of index-1 entries for the BMP. 32=0x20
 * This part of the index-1 table is omitted from the serialized form.
 */
export declare const OMITTED_BMP_INDEX_1_LENGTH: number;
/** Number of code points per index-1 table entry. 2048=0x800 */
export declare const CP_PER_INDEX_1_ENTRY: number;
/** Number of entries in an index-2 block. 64=0x40 */
export declare const INDEX_2_BLOCK_LENGTH: number;
/** Mask for getting the lower bits for the in-index-2-block offset. */
export declare const INDEX_2_MASK: number;
/** Number of entries in a data block. 32=0x20 */
export declare const DATA_BLOCK_LENGTH: number;
/** Mask for getting the lower bits for the in-data-block offset. */
export declare const DATA_MASK: number;
/**
 * Shift size for shifting left the index array values.
 * Increases possible data size with 16-bit index values at the cost
 * of compactability.
 * This requires data blocks to be aligned by DATA_GRANULARITY.
 */
export declare const INDEX_SHIFT = 2;
/** The alignment size of a data block. Also the granularity for compaction. */
export declare const DATA_GRANULARITY: number;
/**
 * The BMP part of the index-2 table is fixed and linear and starts at offset 0.
 */
export declare const INDEX_2_OFFSET = 0;
/**
 * Length=2048=0x800=0x10000>>SHIFT_2.
 */
export declare const INDEX_2_BMP_LENGTH: number;
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
export declare const INDEX_1_OFFSET: number;
export declare const MAX_INDEX_1_LENGTH: number;
export default class UnicodeTrie {
    highStart: number;
    errorValue: number;
    dataPtr32: number;
    dataLength: number;
    constructor(dataPtr: number);
    get(codePoint: number): number;
}

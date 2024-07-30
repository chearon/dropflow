export interface TrieNode {
    value?: string;
    next?: Map<number, TrieNode> | undefined;
}
export declare function getTrie(map: Record<string, string>): TrieNode;
/**
 * Encodes the trie in binary form.
 *
 * We have three different types of nodes:
 * - Values are UNICODE values that an entity resolves to
 * - Branches can be:
 *      1. If size is 1, then a matching character followed by the destination
 *      2. Two successive tables: characters and destination pointers.
 *          Characters have to be binary-searched to get the index of the destination pointer.
 *      3. A jump table: For each character, the destination pointer is stored in a jump table.
 * - Records have a value greater than 128 (the max ASCII value). Their format is 8 bits main data, 8 bits supplemental data:
 *   (
 *      1 bit has has value flag
 *      7 bit branch length if this is a branch — needs to be here to ensure value is >128 with a branch
 *      1 bit data is multi-byte
 *      7 bit branch jump table offset (if branch is a jump table)
 *   )
 *
 */
export declare function encodeTrie(trie: TrieNode, maxJumpTableOverhead?: number): number[];

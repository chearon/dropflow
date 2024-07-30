export declare enum BinTrieFlags {
    VALUE_LENGTH = 49152,
    BRANCH_LENGTH = 16256,
    JUMP_TABLE = 127
}
/**
 * Determines the branch of the current node that is taken given the current
 * character. This function is used to traverse the trie.
 *
 * @param decodeTree The trie.
 * @param current The current node.
 * @param nodeIdx The index right after the current node and its value.
 * @param char The current character.
 * @returns The index of the next node, or -1 if no branch is taken.
 */
export declare function determineBranch(decodeTree: Uint16Array, current: number, nodeIdx: number, char: number): number;

export declare const BinTrieFlags: {
    VALUE_LENGTH: number;
    BRANCH_LENGTH: number;
    JUMP_TABLE: number;
};
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

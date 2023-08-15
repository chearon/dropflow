// entities
//
// This should only be used by gen.js: it uses nodejs imports
//
// Copyright (c) Felix Böhm
// All rights reserved.
//
// Redistribution and use in source and binary forms, with or without
// modification, are permitted provided that the following conditions are met:
//
// Redistributions of source code must retain the above copyright notice, this
// list of conditions and the following disclaimer.
//
// Redistributions in binary form must reproduce the above copyright notice,
// this list of conditions and the following disclaimer in the documentation
// and/or other materials provided with the distribution.
// THIS IS PROVIDED BY THE COPYRIGHT HOLDERS AND CONTRIBUTORS "AS IS" AND ANY
// EXPRESS OR IMPLIED WARRANTIES, INCLUDING, BUT NOT LIMITED TO, THE IMPLIED
// WARRANTIES OF MERCHANTABILITY AND FITNESS FOR A PARTICULAR PURPOSE ARE
// DISCLAIMED. IN NO EVENT SHALL THE COPYRIGHT HOLDER OR CONTRIBUTORS BE LIABLE
// FOR ANY DIRECT, INDIRECT, INCIDENTAL, SPECIAL, EXEMPLARY, OR CONSEQUENTIAL
// DAMAGES (INCLUDING, BUT NOT LIMITED TO, PROCUREMENT OF SUBSTITUTE GOODS OR
// SERVICES; LOSS OF USE, DATA, OR PROFITS; OR BUSINESS INTERRUPTION) HOWEVER
// CAUSED AND ON ANY THEORY OF LIABILITY, WHETHER IN CONTRACT, STRICT
// LIABILITY, OR TORT (INCLUDING NEGLIGENCE OR OTHERWISE) ARISING IN ANY WAY
// OUT OF THE USE OF THIS, EVEN IF ADVISED OF THE POSSIBILITY OF SUCH DAMAGE.

import * as assert from 'assert';

export interface TrieNode {
  value?: string;
  next?: Map<number, TrieNode> | undefined;
}

export function getTrie(map: Record<string, string>): TrieNode {
  const trie = new Map<number, TrieNode>();
  const root = {next: trie};

  for (const key of Object.keys(map)) {
    // Resolve the key
    let lastMap = trie;
    let next!: TrieNode;
    for (let i = 0; i < key.length; i++) {
      const char = key.charCodeAt(i);
      next = lastMap.get(char) ?? {};
      lastMap.set(char, next);
      if (i === key.length - 1) {
        next.value = map[key];
      } else {
        lastMap = next.next ??= new Map();
      }
    }
  }

  function isEqual(node1: TrieNode, node2: TrieNode): boolean {
    if (node1 === node2) return true;

    if (node1.value !== node2.value) {
      return false;
    }

    // Check if the next nodes are equal. That means both are undefined.
    if (node1.next === node2.next) return true;
    if (
      node1.next == null ||
      node2.next == null ||
      node1.next.size !== node2.next.size
    ) {
      return false;
    }

    const next1 = Array.from(node1.next);
    const next2 = Array.from(node2.next);

    return next1.every(([char1, node1], idx) => {
      const [char2, node2] = next2[idx];
      return char1 === char2 && isEqual(node1, node2);
    });
  }

  function mergeDuplicates(node: TrieNode) {
    const nodes = [node];

    for (let nodeIdx = 0; nodeIdx < nodes.length; nodeIdx++) {
      const {next} = nodes[nodeIdx];

      if (!next) continue;

      for (const [char, node] of next) {
        const idx = nodes.findIndex((n) => isEqual(n, node));

        if (idx > -1) {
          next.set(char, nodes[idx]);
        } else {
          nodes.push(node);
        }
      }
    }
  }

  mergeDuplicates(root);

  return root;
}

function binaryLength(num: number) {
  return Math.ceil(Math.log2(num));
}

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
export function encodeTrie(trie: TrieNode, maxJumpTableOverhead = 2): number[] {
  const encodeCache = new Map<TrieNode, number>();
  const enc: number[] = [];

  function encodeNode(node: TrieNode): number {
    // Cache nodes, as we can have loops
    const cached = encodeCache.get(node);
    if (cached != null) return cached;

    const startIndex = enc.length;

    encodeCache.set(node, startIndex);

    const nodeIdx = enc.push(0) - 1;

    if (node.value != null) {
      let valueLength = 0;

      /*
       * If we don't have a branch and the value is short, we can
       * store the value in the node.
       */
      if (
        node.next ||
        node.value.length > 1 ||
        binaryLength(node.value.charCodeAt(0)) > 14
      ) {
        valueLength = node.value.length;
      }

      // Add 1 to the value length, to signal that we have a value.
      valueLength += 1;

      assert.ok(
        binaryLength(valueLength) <= 2,
        'Too many bits for value length'
      );

      enc[nodeIdx] |= valueLength << 14;

      if (valueLength === 1) {
        enc[nodeIdx] |= node.value.charCodeAt(0);
      } else {
        for (let i = 0; i < node.value.length; i++) {
          enc.push(node.value.charCodeAt(i));
        }
      }
    }

    if (node.next) addBranches(node.next, nodeIdx);

    assert.strictEqual(nodeIdx, startIndex, 'Has expected location');

    return startIndex;
  }

  function addBranches(next: Map<number, TrieNode>, nodeIdx: number) {
    const branches = Array.from(next.entries());

    // Sort branches ASC by key
    branches.sort(([a], [b]) => a - b);

    assert.ok(
      binaryLength(branches.length) <= 6,
      'Too many bits for branches'
    );

    // If we only have a single branch, we can write the next value directly
    if (branches.length === 1 && !encodeCache.has(branches[0][1])) {
      const [char, next] = branches[0];

      assert.ok(binaryLength(char) <= 7, 'Too many bits for single char');

      enc[nodeIdx] |= char;
      encodeNode(next);
      return;
    }

    const branchIndex = enc.length;

    // If we have consecutive branches, we can write the next value as a jump table

    /*
     * First, we determine how much space adding the jump table adds.
     *
     * If it is more than 2x the number of branches (which is equivalent
     * to the size of the dictionary), skip it.
     */

    const jumpOffset = branches[0][0];
    const jumpEndValue = branches[branches.length - 1][0];

    const jumpTableLength = jumpEndValue - jumpOffset + 1;

    const jumpTableOverhead = jumpTableLength / branches.length;

    if (jumpTableOverhead <= maxJumpTableOverhead) {
      assert.ok(
        binaryLength(jumpOffset) <= 16,
        `Offset ${jumpOffset} too large at ${binaryLength(jumpOffset)}`
      );

      // Write the length of the adjusted table, plus jump offset
      enc[nodeIdx] |= (jumpTableLength << 7) | jumpOffset;

      assert.ok(
        binaryLength(jumpTableLength) <= 7,
        `Too many bits (${binaryLength(jumpTableLength)}) for branches`
      );

      // Reserve space for the jump table
      for (let i = 0; i < jumpTableLength; i++) enc.push(0);

      // Write the jump table
      for (const [char, next] of branches) {
        const index = char - jumpOffset;
        // Write all values + 1, so 0 will result in a -1 when decoding
        enc[branchIndex + index] = encodeNode(next) + 1;
      }

      return;
    }

    enc[nodeIdx] |= branches.length << 7;

    enc.push(
      ...branches.map(([char]) => char),
      // Reserve space for destinations, using a value that is out of bounds
      ...branches.map((_) => Number.MAX_SAFE_INTEGER)
    );

    assert.strictEqual(
      enc.length,
      branchIndex + branches.length * 2,
      'Did not reserve enough space'
    );

    // Encode the branches
    branches.forEach(([val, next], idx) => {
      assert.ok(val < 128, 'Branch value too large');

      const currentIndex = branchIndex + branches.length + idx;
      assert.strictEqual(
        enc[currentIndex - branches.length],
        val,
        'Should have the value as the first element'
      );
      assert.strictEqual(
        enc[currentIndex],
        Number.MAX_SAFE_INTEGER,
        'Should have the placeholder as the second element'
      );
      const offset = encodeNode(next);

      assert.ok(binaryLength(offset) <= 16, 'Too many bits for offset');
      enc[currentIndex] = offset;
    });
  }

  encodeNode(trie);

  // Make sure that every value fits in a UInt16
  assert.ok(
    enc.every(
      (val) =>
      typeof val === 'number' && val >= 0 && binaryLength(val) <= 16
    ),
    'Too many bits'
  );

  return enc;
}


import wasm from './wasm.js';

const {
  SBAlgorithmCreate,
  SBAlgorithmRelease,
  SBAlgorithmGetParagraphBoundary,
  SBAlgorithmCreateParagraph,
  SBParagraphRelease,
  SBParagraphGetLevelsPtr,
  malloc,
  memory
} = wasm.instance.exports;

const seqPtr = malloc(12); // sizeof(SBCodepointSequence)
const paraLenPtr = malloc(8 /* sizeof(SBUInteger) * 2 */);
const paraSepPtr = paraLenPtr + 4;

export function* bidiIterator(str: Uint16Array, initialLevel = 0) {
  // first byte is 1 because 1 === SBStringEncodingUTF16
  new Uint32Array(memory.buffer, seqPtr, 3).set([1, str.byteOffset, str.length]);

  const algorithm = SBAlgorithmCreate(seqPtr);
  let offset = 0;
  let lastLevel = 0;
  while (offset < str.length) {
    const twoInts = new Uint32Array(memory.buffer, paraLenPtr, 2);
    twoInts.set([0, 0]);
    SBAlgorithmGetParagraphBoundary(algorithm, offset, str.length - offset, paraLenPtr, paraSepPtr);
    const [paraLen, paraSep] = twoInts;
    const paragraph = SBAlgorithmCreateParagraph(algorithm, offset, paraLen + paraSep, initialLevel);
    const levels = new Uint8Array(memory.buffer, SBParagraphGetLevelsPtr(paragraph), paraLen + paraSep);
    const isFirstParagraph = offset === 0;
    const isLastParagraph = offset + paraLen + paraSep >= /* see Tehreer/SheenBidi#18 */ str.length;
    let j = paraLen + paraSep;

    if (isFirstParagraph) lastLevel = levels[0];
    if (isLastParagraph) j += 1; /* check levels[levels.length] to emit the final character */

    for (let i = 0; i < j; ++i) {
      const level = levels[i];
      if (level !== lastLevel) yield {i: offset + i, level: lastLevel};
      lastLevel = level;
    }

    offset += paraLen + paraSep;

    SBParagraphRelease(paragraph);
  }

  SBAlgorithmRelease(algorithm);

}

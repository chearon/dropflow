declare module 'grapheme-breaker' {
  type GraphemeBreaker = {
    break(str: string): string[],
    countBreaks(str: string): number,
    nextBreak(string: string, number: number): number,
    nextBreak(string: string, number: number): number
  };
  const ret: GraphemeBreaker;
  export = ret;
}


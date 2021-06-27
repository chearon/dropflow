declare module 'linebreak' {
  type LineBreakBreakT = {position: number, required: boolean};

  class LineBreak {
    constructor(str: string);
    nextBreak():LineBreakBreakT | undefined;
  }

  namespace LineBreak {
    type LineBreakBreak = LineBreakBreakT;
  }

  export = LineBreak;
}


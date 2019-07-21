import {bsearchj, loggableText} from './util';
import {Box} from './box';

let id = 1;
let debug = true;

function argcheck(a, i, type, required = true) {
  if (required || (i in a)) {
    const valid = type === 'array' ? Array.isArray(a[i]) : typeof a[i] === type;
    if (!valid) throw new Error(`Expected argument ${i} to be of type ${type}`);
  }
}

export class Run extends Box {
  constructor(text, style = {whiteSpace: 'normal'}) {
    super();

    if (debug) {
      argcheck(arguments, 0, 'string');
      argcheck(arguments, 1, 'object', false);
    }

    this.text = text;
    this.style = style;
    this.sym = 'Ͳ';

    this.i = 0;
    this.j = 0;
  }

  setRange(i, j) {
    if (debug) {
      if (this.text.length !== j - i + 1) {
        throw new Error(`j=${j} - i=${i} + 1 should sum to text.length=${this.text.length}`);
      }
    }

    this.i = i;
    this.j = j;
  }

  shift(n) {
    this.i -= n;
    this.j -= n;
  }

  get isInlineLevel() {
    return true;
  }

  get isRun() {
    return true;
  }

  get desc() {
    return `${this.i},${this.j} "${loggableText(this.text)}"`;
  }

  get wsCollapsible() {
    return this.style.whiteSpace.match(/^(normal|nowrap|pre-line)$/);
  }

  get sgUncollapsible() {
    return this.style.whiteSpace.match(/^(pre|pre-wrap|break-spaces|pre-line)$/);
  }

  get sgCollapsible() {
    return !this.sgUncollapsible;
  }

  mod(i, j, s) {
    const text = this.text;
    const li = Math.max(0, i - this.i);
    const lj = j - this.i;

    this.text = text.slice(0, li) + s + text.slice(lj + 1);

    const n = text.length - this.text.length;

    this.j -= n;

    return n;
  }

  allCollapsible() {
    return this.text.match(/^( |\r\n|\n|\t)*$/);
  }
}

export class Collapser {
  constructor(buf, runs) {
    if (debug) {
      argcheck(arguments, 0, 'string');
      argcheck(arguments, 1, 'array');

      if (buf.length > 0 || runs.length > 0) {
        const start = runs[0];
        let last;

        for (const run of runs) {
          if (last && run.i !== last.j + 1) {
            throw new Error('Run objects have gaps or overlap');
          }

          if (run.text !== buf.slice(run.i, run.j + 1)) {
            throw new Error('Run/buffer mismatch');
          }

          last = run;
        }

        if (!start || last.j - start.i + 1 !== buf.length) {
          throw new Error('Buffer size doesn\'t match sum of run sizes'); 
        }
      }
    }

    this.buf = buf;
    this.runs = runs;
  }

  mod(i, j, s) {
    if (j < i) return 0;

    const start = bsearchj(this.runs, i);
    const end = j <= this.runs[start].j ? start : bsearchj(this.runs, j);
    let shrinkahead = 0;

    this.buf = this.buf.slice(0, i) + s + this.buf.slice(j + 1);

    for (let k = start; k < this.runs.length; ++k) {
      const run = this.runs[k];

      run.shift(shrinkahead);

      if (k <= end) shrinkahead += run.mod(i, j - shrinkahead, s);
      if (run.j < run.i) this.runs.splice(k--, 1);

      s = '';
    }

    return shrinkahead;
  }

  *collapsibleRanges(filter) {
    let i = 0;
    let j = 0;
    let wasInCollapse = false;

    while (true) {
      const end = j >= this.runs.length;
      const isInCollapse = !end && this.runs[j][filter];

      if (wasInCollapse && !isInCollapse) yield [this.runs[i], this.runs[j - 1]];

      if (end) break;

      wasInCollapse = isInCollapse;

      if (isInCollapse) {
        j += 1;
      } else {
        i = j = j + 1;
      }
    }
  }

  modRanges(ranges) {
    let shrinkahead = 0;

    for (const [start, end, s] of ranges) {
      if (end < start) continue;
      shrinkahead += this.mod(start - shrinkahead, end - shrinkahead, s);
    }
  }

  // CSS Text Module Level 3 §4.1.1 step 1
  stepOne() {
    const toRemove = [];

    for (const [start, end] of this.collapsibleRanges('wsCollapsible')) {
      const range = this.buf.slice(start.i, end.j + 1);
      const rBefore = /([ \t]*)((\r\n|\n)+)([ \t]*)/g;
      let match;

      while (match = rBefore.exec(range)) {
        const [, leftWs, allNl, , rightWs] = match;
        const rangeStart = start.i + match.index;

        if (leftWs.length) {
          toRemove.push([rangeStart, rangeStart + leftWs.length - 1, '']);
        }

        if (rightWs.length) {
          const rightWsStart = rangeStart + leftWs.length + allNl.length;
          toRemove.push([rightWsStart, rightWsStart + rightWs.length - 1, '']);
        }
      }
    }

    this.modRanges(toRemove);
  }

  // CSS Text Module Level 3 §4.1.1 step 2 (defined in §4.1.2)
  stepTwo() {
    const removeCarriageReturn = [];

    for (const [start, end] of this.collapsibleRanges('sgUncollapsible')) {
      const range = this.buf.slice(start.i, end.j + 1);
      const rBreak = /\r\n/g;
      let match;

      while (match = rBreak.exec(range)) {
        const rangeStart = start.i + match.index;
        removeCarriageReturn.push([rangeStart + 1, rangeStart + 1, '']);
      }
    }

    this.modRanges(removeCarriageReturn);

    const modConsecutiveSegments = [];

    for (const [start, end] of this.collapsibleRanges('sgCollapsible')) {
      const range = this.buf.slice(start.i, end.j + 1);
      const rSegment = /(\n|\r\n)((\n|\r\n)*)/g;
      let match;

      while (match = rSegment.exec(range)) {
        const {1: sg, 2: asg} = match;
        const rangeStart = start.i + match.index;

        const s = ' '; // TODO spec says this is contextual based on some Asian scripts
        modConsecutiveSegments.push([rangeStart, rangeStart + sg.length - 1, s]);

        modConsecutiveSegments.push([rangeStart + sg.length, rangeStart + sg.length + asg.length - 1, '']);
      }
    }

    this.modRanges(modConsecutiveSegments);
  }

  // CSS Text Module Level 3 §4.1.1 step 3
  stepThree() {
    const removeTab = [];

    for (const [start, end] of this.collapsibleRanges('wsCollapsible')) {
      const range = this.buf.slice(start.i, end.j + 1);
      const rTab = /\t/g;
      let match;

      while (match = rTab.exec(range)) {
        removeTab.push([start.i + match.index, start.i + match.index, ' ']);
      }
    }

    this.modRanges(removeTab);
  }

  // CSS Text Module Level 3 §4.1.1 step 4
  stepFour() {
    const collapseWs = [];

    for (const [start, end] of this.collapsibleRanges('wsCollapsible')) {
      const range = this.buf.slice(start.i, end.j + 1);
      const rSpSeq = /  +/g;
      let match;

      while (match = rSpSeq.exec(range)) {
        const rangeStart = start.i + match.index;
        collapseWs.push([rangeStart + 1, rangeStart + 1 + match[0].length - 2, '']);
      }
    }
    
    this.modRanges(collapseWs);
  }

  collapse() {
    this.stepOne();
    this.stepTwo();
    this.stepThree();
    this.stepFour();
  }
}

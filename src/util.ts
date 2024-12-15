import {Glyphs} from './layout-text.js';
import type {Style} from './style.js';

/**
 * Binary search that returns the position `x` should be in
 */
export function binarySearch(a: number[], x: number) {
  let l = 0, r = a.length - 1;

  while (true) {
    let i = Math.floor((l+r)/2);

    if (a[i] < x) {
      l = i + 1;
      if (l > r) return l;
    } else if (a[i] > x) {
      r = i - 1;
      if (r < l) return i;
    } else {
      return i;
    }
  }
}

/**
 * Binary search that returns the position `x` should be in, using the `end`
 * property of objects in the `a` array
 */
export function binarySearchOf<T>(
  a: T[],
  x: number,
  end: (item: T) => number
): number {
  let l = 0, r = a.length - 1;

  if (r < 0) return -1;

  while (true) {
    let i = Math.floor((l+r)/2);

    if (end(a[i]) < x) {
      l = i + 1;
      if (l > r) return l;
    } else if (end(a[i]) > x) {
      r = i - 1;
      if (r < l) return i;
    } else {
      return i;
    }
  }
}

/**
 * Binary search that returns the position `x` should be in, using the second
 * value in a tuple in the `a` array
 */
export function binarySearchTuple<T>(a: [T, number][], x: number): number {
  let l = 0, r = a.length - 1;

  if (r < 0) return -1;

  while (true) {
    let i = Math.floor((l+r)/2);

    if (a[i][1] < x) {
      l = i + 1;
      if (l > r) return l;
    } else if (a[i][1] > x) {
      r = i - 1;
      if (r < l) return i;
    } else {
      return i;
    }
  }
}

let _id = 0;
export function id(): string {
  return String(_id++);
}

export function loggableText(text: string): string {
  return text.replace(/\n/g, '⏎').replace(/\t/g, '␉');
}

export function basename(p: string) {
  return p.match(/([^.\/]+)\.[A-z]+$/)?.[1] || p;
}

export interface TreeLogOptions {
  containingBlocks?: boolean;
  css?: keyof Style
  paragraphText?: string;
  bits?: boolean;
}

export class Logger {
  string: string;
  formats: string[]; // only for browsers
  indent: string[];
  lineIsEmpty: boolean;

  constructor() {
    this.string = '';
    this.formats = [];
    this.indent = [];
    this.lineIsEmpty = true;
  }

  bold() {
    if (typeof process === 'object') {
      this.string += '\x1b[1m';
    } else {
      this.string += '%c';
      this.formats.push('font-weight: bold');
    }
  }

  underline() {
    if (typeof process === 'object') {
      this.string += '\x1b[4m';
    } else {
      this.string += '%c';
      this.formats.push('text-decoration: underline');
    }
  }

  dim() {
    if (typeof process === 'object') {
      this.string += '\x1b[2m';
    } else {
      this.string += '%c';
      this.formats.push('color: gray');
    }
  }

  reset() {
    if (typeof process === 'object') {
      this.string += '\x1b[0m';
    } else {
      this.string += '%c';
      this.formats.push('font-weight: normal');
    }
  }

  flush() {
    console.log(this.string, ...this.formats);
    this.string = '';
    this.formats = [];
  }

  text(str: string | number) {
    const lines = String(str).split('\n');

    const append = (s: string) => {
      if (s) {
        if (this.lineIsEmpty) this.string += this.indent.join('');
        this.string += s;
        this.lineIsEmpty = false;
      }
    };

    for (let i = 0; i < lines.length; i++) {
      if (i === 0) {
        append(lines[i]);
      } else {
        this.string += '\n';
        this.lineIsEmpty = true;
        append(lines[i]);
      }
    }
  }

  glyphs(glyphs: Glyphs) {
    for (let i = 0; i < glyphs.glyphLength; i++) {
      const cl = glyphs.cl(i);
      const isp = i - 1 >= 0 && glyphs.cl(i - 1) === cl;
      const isn = i + 1 < glyphs.glyphLength && glyphs.cl(i + 1) === cl;
      if (isp || isn) this.bold();
      if (isn && !isp) this.text('(');
      this.text(glyphs.id(i));
      if (!isn && isp) this.text(')');
      this.text(' ');
      if (isp || isn) this.reset();
    }
  }

  pushIndent(indent = '  ') {
    this.indent.push(indent);
  }

  popIndent() {
    this.indent.pop();
  }
}

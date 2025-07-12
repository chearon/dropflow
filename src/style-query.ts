// fb55/css-select by Felix Böhm
//
// selectAll from index.ts and all dependencies from all files were inlined here
// with no modifications other than style changes and imports/exports (at time
// of writing)
//
// The MIT License (MIT)
// 
// Copyright (c) 2016 Nik Coughlin
//
// Permission is hereby granted, free of charge, to any person obtaining a copy
// of this software and associated documentation files (the "Software"), to deal
// in the Software without restriction, including without limitation the rights
// to use, copy, modify, merge, publish, distribute, sublicense, and/or sell
// copies of the Software, and to permit persons to whom the Software is
// furnished to do so, subject to the following conditions:
//
// The above copyright notice and this permission notice shall be included in all
// copies or substantial portions of the Software.
//
// THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
// IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,
// FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE
// AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER
// LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM,
// OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE
// SOFTWARE.
//
// fb55/nth-check by Felix Böhm
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
//
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

import {
  parse,
} from './style-selector.ts';

import type {
  Selector,
  AttributeAction,
  AttributeSelector,
  PseudoSelector,
  Traversal
} from './style-selector.ts';

function trueFunc() {
  return true;
}

function falseFunc() {
  return false;
}

/**
 * Returns a function that checks if an elements index matches the given rule
 * highly optimized to return the fastest solution.
 *
 * @param parsed A tuple [a, b], as returned by `parse`.
 * @returns A highly optimized function that returns whether an index matches the nth-check.
 * @example
 *
 * ```js
 * const check = nthCheck.compile([2, 3]);
 *
 * check(0); // `false`
 * check(1); // `false`
 * check(2); // `true`
 * check(3); // `false`
 * check(4); // `true`
 * check(5); // `false`
 * check(6); // `true`
 * ```
 */
function compileNcheck(parsed: [a: number, b: number]): (index: number) => boolean {
  const a = parsed[0];
  // Subtract 1 from `b`, to convert from one- to zero-indexed.
  const b = parsed[1] - 1;

  /*
   * When `b <= 0`, `a * n` won't be lead to any matches for `a < 0`.
   * Besides, the specification states that no elements are
   * matched when `a` and `b` are 0.
   *
   * `b < 0` here as we subtracted 1 from `b` above.
   */
  if (b < 0 && a <= 0) return falseFunc;

  // When `a` is in the range -1..1, it matches any element (so only `b` is checked).
  if (a === -1) return index => index <= b;
  if (a === 0) return index => index === b;
  // When `b <= 0` and `a === 1`, they match any element.
  if (a === 1) return b < 0 ? trueFunc : (index) => index >= b;

  /*
   * Otherwise, modulo can be used to check if there is a match.
   *
   * Modulo doesn't care about the sign, so let's use `a`s absolute value.
   */
  const absA = Math.abs(a);
  // Get `b mod a`, + a if this is negative.
  const bMod = ((b % absA) + absA) % absA;

  return a > 1
    ? index => index >= b && index % absA === bMod
    : index => index <= b && index % absA === bMod;
}

// Following http://www.w3.org/TR/css3-selectors/#nth-child-pseudo

// Whitespace as per https://www.w3.org/TR/selectors-3/#lex is " \t\r\n\f"
const whitespace = new Set([9, 10, 12, 13, 32]);
const ZERO = '0'.charCodeAt(0);
const NINE = '9'.charCodeAt(0);

/**
 * Parses an expression.
 *
 * @throws An `Error` if parsing fails.
 * @returns An array containing the integer step size and the integer offset of the nth rule.
 * @example nthCheck.parse('2n+3'); // returns [2, 3]
 */
function parseNCheck(formula: string): [a: number, b: number] {
  formula = formula.trim().toLowerCase();

  if (formula === 'even') {
    return [2, 0];
  } else if (formula === 'odd') {
    return [2, 1];
  }

  // Parse [ ['-'|'+']? INTEGER? {N} [ S* ['-'|'+'] S* INTEGER ]?

  let idx = 0;

  let a = 0;
  let sign = readSign();
  let number = readNumber();

  if (idx < formula.length && formula.charAt(idx) === 'n') {
    idx++;
    a = sign * (number ?? 1);

    skipWhitespace();

    if (idx < formula.length) {
      sign = readSign();
      skipWhitespace();
      number = readNumber();
    } else {
      sign = number = 0;
    }
  }

  // Throw if there is anything else
  if (number === null || idx < formula.length) {
    throw new Error(`n-th rule couldn't be parsed ('${formula}')`);
  }

  return [a, sign * number];

  function readSign() {
    if (formula.charAt(idx) === '-') {
      idx++;
      return -1;
    }

    if (formula.charAt(idx) === '+') {
      idx++;
    }

    return 1;
  }

  function readNumber() {
    const start = idx;
    let value = 0;

    while (
      idx < formula.length &&
      formula.charCodeAt(idx) >= ZERO &&
      formula.charCodeAt(idx) <= NINE
    ) {
      value = value * 10 + (formula.charCodeAt(idx) - ZERO);
      idx++;
    }

    // Return `null` if we didn't read anything.
    return idx === start ? null : value;
  }

  function skipWhitespace() {
    while (
      idx < formula.length &&
      whitespace.has(formula.charCodeAt(idx))
    ) {
      idx++;
    }
  }
}

function getNCheck(formula: string): (index: number) => boolean {
  return compileNcheck(parseNCheck(formula));
}

type Predicate<Value> = (v: Value) => boolean;

export interface Adapter<Node, ElementNode extends Node> {
  /**
   *  Is the node a tag?
   */
  isTag: (node: Node) => node is ElementNode;

  /**
   * Does at least one of passed element nodes pass the test predicate?
   */
  existsOne: (test: Predicate<ElementNode>, elems: Node[]) => boolean;

  /**
   * Get the attribute value.
   */
  getAttributeValue: (elem: ElementNode, name: string) => string | undefined;

  /**
   * Get the node's children
   */
  getChildren: (node: Node) => Node[];

  /**
   * Get the name of the tag
   */
  getName: (elem: ElementNode) => string;

  /**
   * Get the parent of the node
   */
  getParent: (node: ElementNode) => Node | null;

  /**
   * Get the siblings of the node. Note that unlike jQuery's `siblings` method,
   * this is expected to include the current node as well
   */
  getSiblings: (node: Node) => Node[];

  /**
   * Returns the previous element sibling of a node.
   */
  prevElementSibling?: (node: Node) => ElementNode | null;

  /**
   * Get the text content of the node, and its children if it has any.
   */
  getText: (node: Node) => string;

  /**
   * Does the element have the named attribute?
   */
  hasAttrib: (elem: ElementNode, name: string) => boolean;

  /**
   * Takes an array of nodes, and removes any duplicates, as well as any
   * nodes whose ancestors are also in the array.
   */
  removeSubsets: (nodes: Node[]) => Node[];

  /**
   * Finds all of the element nodes in the array that match the test predicate,
   * as well as any of their children that match it.
   */
  findAll: (test: Predicate<ElementNode>, nodes: Node[]) => ElementNode[];

  /**
   * Finds the first node in the array that matches the test predicate, or one
   * of its children.
   */
  findOne: (
    test: Predicate<ElementNode>,
    elems: Node[]
  ) => ElementNode | null;

  /**
   * The adapter can also optionally include an equals method, if your DOM
   * structure needs a custom equality test to compare two objects which refer
   * to the same underlying node. If not provided, `css-select` will fall back to
   * `a === b`.
   */
  equals?: (a: Node, b: Node) => boolean;

  /**
   * Is the element in hovered state?
   */
  isHovered?: (elem: ElementNode) => boolean;

  /**
   * Is the element in visited state?
   */
  isVisited?: (elem: ElementNode) => boolean;

  /**
   * Is the element in active state?
   */
  isActive?: (elem: ElementNode) => boolean;
}

interface Options<Node, ElementNode extends Node> {
  /**
   * When enabled, tag names will be case-sensitive.
   *
   * @default false
   */
  xmlMode?: boolean;
  /**
   * Lower-case attribute names.
   *
   * @default !xmlMode
   */
  lowerCaseAttributeNames?: boolean;
  /**
   * Lower-case tag names.
   *
   * @default !xmlMode
   */
  lowerCaseTags?: boolean;
  /**
   * Is the document in quirks mode?
   *
   * This will lead to .className and #id being case-insensitive.
   *
   * @default false
   */
  quirksMode?: boolean;
  /**
   * Pseudo-classes that override the default ones.
   *
   * Maps from names to either strings of functions.
   * - A string value is a selector that the element must match to be selected.
   * - A function is called with the element as its first argument, and optional
   *  parameters second. If it returns true, the element is selected.
   */
  pseudos?:
    | Record<
        string,
        string | ((elem: ElementNode, value?: string | null) => boolean)
      >
    | undefined;
  /**
   * The last function in the stack, will be called with the last element
   * that's looked at.
   */
  rootFunc?: (element: ElementNode) => boolean;
  /**
   * The adapter to use when interacting with the backing DOM structure. By
   * default it uses the `domutils` module.
   */
  adapter?: Adapter<Node, ElementNode>;
  /**
   * The context of the current query. Used to limit the scope of searches.
   * Can be matched directly using the `:scope` pseudo-class.
   */
  context?: Node | Node[];
  /**
   * Indicates whether to consider the selector as a relative selector.
   *
   * Relative selectors that don't include a `:scope` pseudo-class behave
   * as if they have a `:scope ` prefix (a `:scope` pseudo-class, followed by
   * a descendant selector).
   *
   * If relative selectors are disabled, selectors starting with a traversal
   * will lead to an error.
   *
   * @default true
   * @see {@link https://www.w3.org/TR/selectors-4/#relative}
   */
  relativeSelector?: boolean;
  /**
   * Allow css-select to cache results for some selectors, sometimes greatly
   * improving querying performance. Disable this if your document can
   * change in between queries with the same compiled selector.
   *
   * @default true
   */
  cacheResults?: boolean;
}

// Internally, we want to ensure that no propterties are accessed on the passed objects
interface InternalOptions<Node, ElementNode extends Node>
  extends Options<Node, ElementNode> {
  adapter: Adapter<Node, ElementNode>;
  equals: (a: Node, b: Node) => boolean;
}

interface CompiledQuery<ElementNode> {
  (node: ElementNode): boolean;
  shouldTestNextSiblings?: boolean;
}

type Query<ElementNode> =
  | string
  | CompiledQuery<ElementNode>
  | Selector[][];

const defaultEquals = <Node>(a: Node, b: Node) => a === b;

function convertOptionFormats<Node, ElementNode extends Node>(
  options?: Options<Node, ElementNode>
): InternalOptions<Node, ElementNode> {
  /*
   * We force one format of options to the other one.
   */
  // @ts-expect-error Default options may have incompatible `Node` / `ElementNode`.
  const opts: Options<Node, ElementNode> = options ?? defaultOptions;
  // @ts-expect-error Same as above.
  opts.adapter ??= DomUtils;
  // @ts-expect-error `equals` does not exist on `Options`
  opts.equals ??= opts.adapter?.equals ?? defaultEquals;

  return opts as InternalOptions<Node, ElementNode>;
}

function getNextSiblings<Node, ElementNode extends Node>(
  elem: Node,
  adapter: Adapter<Node, ElementNode>
): ElementNode[] {
  const siblings = adapter.getSiblings(elem);
  if (siblings.length <= 1) return [];
  const elemIndex = siblings.indexOf(elem);
  if (elemIndex < 0 || elemIndex === siblings.length - 1) return [];
  return siblings.slice(elemIndex + 1).filter(adapter.isTag);
}

function appendNextSiblings<Node, ElementNode extends Node>(
  elem: Node | Node[],
  adapter: Adapter<Node, ElementNode>
): Node[] {
  // Order matters because jQuery seems to check the children before the siblings
  const elems = Array.isArray(elem) ? elem.slice(0) : [elem];
  const elemsLength = elems.length;

  for (let i = 0; i < elemsLength; i++) {
    const nextSiblings = getNextSiblings(elems[i], adapter);
    elems.push(...nextSiblings);
  }
  return elems;
}

function prepareContext<Node, ElementNode extends Node>(
  elems: Node | Node[],
  adapter: Adapter<Node, ElementNode>,
  shouldTestNextSiblings = false
): Node[] {
  /*
   * Add siblings if the query requires them.
   * See https://github.com/fb55/css-select/pull/43#issuecomment-225414692
   */
  if (shouldTestNextSiblings) {
    elems = appendNextSiblings(elems, adapter);
  }

  return Array.isArray(elems)
    ? adapter.removeSubsets(elems)
    : adapter.getChildren(elems);
}

type InternalSelector = Selector | { type: '_flexibleDescendant' };

const procedure = new Map<InternalSelector['type'], number>([
  ['universal', 50],
  ['tag', 30],
  ['attribute', 1],
  ['pseudo', 0],
]);

function isTraversal(token: InternalSelector): token is Traversal {
  return !procedure.has(token.type);
}

const attributes = new Map<AttributeAction, number>([
  ['exists', 10],
  ['equals', 8],
  ['not', 7],
  ['start', 6],
  ['end', 6],
  ['any', 5],
]);

/**
 * Sort the parts of the passed selector,
 * as there is potential for optimization
 * (some types of selectors are faster than others)
 *
 * @param arr Selector to sort
 */
function sortByProcedure(arr: InternalSelector[]): void {
  const procs = arr.map(getProcedure);
  for (let i = 1; i < arr.length; i++) {
    const procNew = procs[i];

    if (procNew < 0) continue;

    for (let j = i - 1; j >= 0 && procNew < procs[j]; j--) {
      const token = arr[j + 1];
      arr[j + 1] = arr[j];
      arr[j] = token;
      procs[j + 1] = procs[j];
      procs[j] = procNew;
    }
  }
}

function getProcedure(token: InternalSelector): number {
  let proc = procedure.get(token.type) ?? -1;

  if (token.type === 'attribute') {
    proc = attributes.get(token.action) ?? 4;

    if (token.action === 'equals' && token.name === 'id') {
      // Prefer ID selectors (eg. #ID)
      proc = 9;
    }

    if (token.ignoreCase) {
      /*
       * IgnoreCase adds some overhead, prefer 'normal' token
       * this is a binary operation, to ensure it's still an int
       */
      proc >>= 1;
    }
  } else if (token.type === 'pseudo') {
    if (!token.data) {
      proc = 3;
    } else if (token.name === 'has' || token.name === 'contains') {
      proc = 0; // Expensive in any case
    } else if (Array.isArray(token.data)) {
      // Eg. :matches, :not
      proc = Math.min(
        ...token.data.map((d) => Math.min(...d.map(getProcedure)))
      );

      // If we have traversals, try to avoid executing this selector
      if (proc < 0) {
        proc = 0;
      }
    } else {
      proc = 2;
    }
  }
  return proc;
}

const DESCENDANT_TOKEN: Selector = { type: 'descendant' };
const FLEXIBLE_DESCENDANT_TOKEN: InternalSelector = {
  type: '_flexibleDescendant',
};
const SCOPE_TOKEN: Selector = {
  type: 'pseudo',
  name: 'scope',
  data: null,
};

/** Used as a placeholder for :has. Will be replaced with the actual element. */
const PLACEHOLDER_ELEMENT = {};

function includesScopePseudo(t: InternalSelector): boolean {
  return (
    t.type === 'pseudo' &&
    (t.name === 'scope' ||
      (Array.isArray(t.data) &&
        t.data.some((data) => data.some(includesScopePseudo))))
  );
}

/*
 * CSS 4 Spec (Draft): 3.4.1. Absolutizing a Relative Selector
 * http://www.w3.org/TR/selectors4/#absolutizing
 */
function absolutize<Node, ElementNode extends Node>(
  token: InternalSelector[][],
  { adapter }: InternalOptions<Node, ElementNode>,
  context?: Node[]
) {
  // TODO Use better check if the context is a document
  const hasContext = !!context?.every((e) => {
    const parent = adapter.isTag(e) && adapter.getParent(e);
    return e === PLACEHOLDER_ELEMENT || (parent && adapter.isTag(parent));
  });

  for (const t of token) {
    if (
      t.length > 0 &&
      isTraversal(t[0]) &&
      t[0].type !== 'descendant'
    ) {
      // Don't continue in else branch
    } else if (hasContext && !t.some(includesScopePseudo)) {
      t.unshift(DESCENDANT_TOKEN);
    } else {
      continue;
    }

    t.unshift(SCOPE_TOKEN);
  }
}

type CompileToken<Node, ElementNode extends Node> = (
  token: InternalSelector[][],
  options: InternalOptions<Node, ElementNode>,
  context?: Node[] | Node
) => CompiledQuery<ElementNode>;

/**
 * Attributes that are case-insensitive in HTML.
 *
 * @private
 * @see https://html.spec.whatwg.org/multipage/semantics-other.html#case-sensitivity-of-selectors
 */
const caseInsensitiveAttributes = new Set([
  'accept',
  'accept-charset',
  'align',
  'alink',
  'axis',
  'bgcolor',
  'charset',
  'checked',
  'clear',
  'codetype',
  'color',
  'compact',
  'declare',
  'defer',
  'dir',
  'direction',
  'disabled',
  'enctype',
  'face',
  'frame',
  'hreflang',
  'http-equiv',
  'lang',
  'language',
  'link',
  'media',
  'method',
  'multiple',
  'nohref',
  'noresize',
  'noshade',
  'nowrap',
  'readonly',
  'rel',
  'rev',
  'rules',
  'scope',
  'scrolling',
  'selected',
  'shape',
  'target',
  'text',
  'type',
  'valign',
  'valuetype',
  'vlink',
]);

function shouldIgnoreCase<Node, ElementNode extends Node>(
  selector: AttributeSelector,
  options: InternalOptions<Node, ElementNode>
): boolean {
  return typeof selector.ignoreCase === 'boolean'
    ? selector.ignoreCase
    : selector.ignoreCase === 'quirks'
    ? !!options.quirksMode
    : !options.xmlMode && caseInsensitiveAttributes.has(selector.name);
}

/**
 * All reserved characters in a regex, used for escaping.
 *
 * Taken from XRegExp, (c) 2007-2020 Steven Levithan under the MIT license
 * https://github.com/slevithan/xregexp/blob/95eeebeb8fac8754d54eafe2b4743661ac1cf028/src/xregexp.js#L794
 */
const reChars = /[-[\]{}()*+?.,\\^$|#\s]/g;
function escapeRegex(value: string): string {
  return value.replace(reChars, '\\$&');
}

/**
 * Attribute selectors
 */
const attributeRules: Record<
  AttributeAction,
  <Node, ElementNode extends Node>(
    next: CompiledQuery<ElementNode>,
    data: AttributeSelector,
    options: InternalOptions<Node, ElementNode>
  ) => CompiledQuery<ElementNode>
> = {
  equals(next, data, options) {
    const { adapter } = options;
    const { name } = data;
    let { value } = data;

    if (shouldIgnoreCase(data, options)) {
      value = value.toLowerCase();

      return (elem) => {
        const attr = adapter.getAttributeValue(elem, name);
        return (
          attr != null &&
          attr.length === value.length &&
          attr.toLowerCase() === value &&
          next(elem)
        );
      };
    }

    return (elem) =>
      adapter.getAttributeValue(elem, name) === value && next(elem);
  },
  hyphen(next, data, options) {
    const { adapter } = options;
    const { name } = data;
    let { value } = data;
    const len = value.length;

    if (shouldIgnoreCase(data, options)) {
      value = value.toLowerCase();

      return function hyphenIC(elem) {
        const attr = adapter.getAttributeValue(elem, name);
        return (
          attr != null &&
          (attr.length === len || attr.charAt(len) === '-') &&
          attr.substr(0, len).toLowerCase() === value &&
          next(elem)
        );
      };
    }

    return function hyphen(elem) {
      const attr = adapter.getAttributeValue(elem, name);
      return (
        attr != null &&
        (attr.length === len || attr.charAt(len) === '-') &&
        attr.substr(0, len) === value &&
        next(elem)
      );
    };
  },
  element(next, data, options) {
    const { adapter } = options;
    const { name, value } = data;
    if (/\s/.test(value)) {
      return falseFunc;
    }

    const regex = new RegExp(
      `(?:^|\\s)${escapeRegex(value)}(?:$|\\s)`,
      shouldIgnoreCase(data, options) ? 'i' : ''
    );

    return function element(elem) {
      const attr = adapter.getAttributeValue(elem, name);
      return (
        attr != null &&
        attr.length >= value.length &&
        regex.test(attr) &&
        next(elem)
      );
    };
  },
  exists(next, { name }, { adapter }) {
    return (elem) => adapter.hasAttrib(elem, name) && next(elem);
  },
  start(next, data, options) {
    const { adapter } = options;
    const { name } = data;
    let { value } = data;
    const len = value.length;

    if (len === 0) {
      return falseFunc;
    }

    if (shouldIgnoreCase(data, options)) {
      value = value.toLowerCase();

      return (elem) => {
        const attr = adapter.getAttributeValue(elem, name);
        return (
          attr != null &&
          attr.length >= len &&
          attr.substr(0, len).toLowerCase() === value &&
          next(elem)
        );
      };
    }

    return (elem) =>
      !!adapter.getAttributeValue(elem, name)?.startsWith(value) &&
      next(elem);
  },
  end(next, data, options) {
    const { adapter } = options;
    const { name } = data;
    let { value } = data;
    const len = -value.length;

    if (len === 0) {
      return falseFunc;
    }

    if (shouldIgnoreCase(data, options)) {
      value = value.toLowerCase();

      return (elem) =>
        adapter
          .getAttributeValue(elem, name)
          ?.substr(len)
          .toLowerCase() === value && next(elem);
    }

    return (elem) =>
      !!adapter.getAttributeValue(elem, name)?.endsWith(value) &&
      next(elem);
  },
  any(next, data, options) {
    const { adapter } = options;
    const { name, value } = data;

    if (value === '') {
      return falseFunc;
    }

    if (shouldIgnoreCase(data, options)) {
      const regex = new RegExp(escapeRegex(value), 'i');

      return function anyIC(elem) {
        const attr = adapter.getAttributeValue(elem, name);
        return (
          attr != null &&
          attr.length >= value.length &&
          regex.test(attr) &&
          next(elem)
        );
      };
    }

    return (elem) =>
      !!adapter.getAttributeValue(elem, name)?.includes(value) &&
      next(elem);
  },
  not(next, data, options) {
    const { adapter } = options;
    const { name } = data;
    let { value } = data;

    if (value === '') {
      return (elem) =>
        !!adapter.getAttributeValue(elem, name) && next(elem);
    } else if (shouldIgnoreCase(data, options)) {
      value = value.toLowerCase();

      return (elem) => {
        const attr = adapter.getAttributeValue(elem, name);
        return (
          (attr == null ||
            attr.length !== value.length ||
            attr.toLowerCase() !== value) &&
          next(elem)
        );
      };
    }

    return (elem) =>
      adapter.getAttributeValue(elem, name) !== value && next(elem);
  },
};

type Subselect = <Node, ElementNode extends Node>(
  next: CompiledQuery<ElementNode>,
  subselect: Selector[][],
  options: InternalOptions<Node, ElementNode>,
  context: Node[] | undefined,
  compileToken: CompileToken<Node, ElementNode>
) => CompiledQuery<ElementNode>;

function copyOptions<Node, ElementNode extends Node>(
  options: InternalOptions<Node, ElementNode>
): InternalOptions<Node, ElementNode> {
  // Not copied: context, rootFunc
  return {
    xmlMode: !!options.xmlMode,
    lowerCaseAttributeNames: !!options.lowerCaseAttributeNames,
    lowerCaseTags: !!options.lowerCaseTags,
    quirksMode: !!options.quirksMode,
    cacheResults: !!options.cacheResults,
    pseudos: options.pseudos,
    adapter: options.adapter,
    equals: options.equals,
  };
}

const is: Subselect = (next, token, options, context, compileToken) => {
  const func = compileToken(token, copyOptions(options), context);

  return func === trueFunc
    ? next
    : func === falseFunc
    ? falseFunc
    : (elem) => func(elem) && next(elem);
};

function ensureIsTag<Node, ElementNode extends Node>(
  next: CompiledQuery<ElementNode>,
  adapter: Adapter<Node, ElementNode>
): CompiledQuery<Node> {
  if (next === falseFunc) return falseFunc;
  return (elem: Node) => adapter.isTag(elem) && next(elem);
}

/*
 * :not, :has, :is, :matches and :where have to compile selectors
 * doing this in src/pseudos.ts would lead to circular dependencies,
 * so we add them here
 */
const subselects: Record<string, Subselect> = {
  is,
  /**
   * `:matches` and `:where` are aliases for `:is`.
   */
  matches: is,
  where: is,
  not(next, token, options, context, compileToken) {
    const func = compileToken(token, copyOptions(options), context);

    return func === falseFunc
      ? next
      : func === trueFunc
      ? falseFunc
      : (elem) => !func(elem) && next(elem);
  },
  has<Node, ElementNode extends Node>(
    next: CompiledQuery<ElementNode>,
    subselect: Selector[][],
    options: InternalOptions<Node, ElementNode>,
    _context: Node[] | undefined,
    compileToken: CompileToken<Node, ElementNode>
  ): CompiledQuery<ElementNode> {
    const { adapter } = options;

    const opts = copyOptions(options);
    opts.relativeSelector = true;

    const context = subselect.some((s) => s.some(isTraversal))
      ? // Used as a placeholder. Will be replaced with the actual element.
        ([PLACEHOLDER_ELEMENT] as unknown as ElementNode[])
      : undefined;

    const compiled = compileToken(subselect, opts, context);

    if (compiled === falseFunc) return falseFunc;

    const hasElement = ensureIsTag(compiled, adapter);

    // If `compiled` is `trueFunc`, we can skip this.
    if (context && compiled !== trueFunc) {
      /*
       * `shouldTestNextSiblings` will only be true if the query starts with
       * a traversal (sibling or adjacent). That means we will always have a context.
       */
      const { shouldTestNextSiblings = false } = compiled;

      return (elem) => {
        if (!next(elem)) return false;

        context[0] = elem;
        const childs = adapter.getChildren(elem);
        const nextElements = shouldTestNextSiblings
          ? [...childs, ...getNextSiblings(elem, adapter)]
          : childs;

        return adapter.existsOne(hasElement, nextElements);
      };
    }

    return (elem) =>
      next(elem) &&
      adapter.existsOne(hasElement, adapter.getChildren(elem));
  },
};

/**
 * Aliases are pseudos that are expressed as selectors.
 */
const aliases: Record<string, string> = {
  // Links

  'any-link': ':is(a, area, link)[href]',
  link: ':any-link:not(:visited)',

  // Forms

  // https://html.spec.whatwg.org/multipage/scripting.html#disabled-elements
  disabled: `:is(
    :is(button, input, select, textarea, optgroup, option)[disabled],
    optgroup[disabled] > option,
    fieldset[disabled]:not(fieldset[disabled] legend:first-of-type *)
  )`,
  enabled: ':not(:disabled)',
  checked:
    ':is(:is(input[type=radio], input[type=checkbox])[checked], option:selected)',
  required: ':is(input, select, textarea)[required]',
  optional: ':is(input, select, textarea):not([required])',

  // JQuery extensions

  // https://html.spec.whatwg.org/multipage/form-elements.html#concept-option-selectedness
  selected:
    'option:is([selected], select:not([multiple]):not(:has(> option[selected])) > :first-of-type)',

  checkbox: '[type=checkbox]',
  file: '[type=file]',
  password: '[type=password]',
  radio: '[type=radio]',
  reset: '[type=reset]',
  image: '[type=image]',
  submit: '[type=submit]',

  parent: ':not(:empty)',
  header: ':is(h1, h2, h3, h4, h5, h6)',

  button: ':is(button, input[type=button])',
  input: ':is(input, textarea, select, button)',
  text: 'input:is(:not([type!=""]), [type=text])',
};

type Filter = <Node, ElementNode extends Node>(
  next: CompiledQuery<ElementNode>,
  text: string,
  options: InternalOptions<Node, ElementNode>,
  context?: Node[]
) => CompiledQuery<ElementNode>;

function getChildFunc<Node, ElementNode extends Node>(
  next: CompiledQuery<ElementNode>,
  adapter: Adapter<Node, ElementNode>
): CompiledQuery<ElementNode> {
  return (elem) => {
    const parent = adapter.getParent(elem);
    return parent != null && adapter.isTag(parent) && next(elem);
  };
}

/**
 * Dynamic state pseudos. These depend on optional Adapter methods.
 *
 * @param name The name of the adapter method to call.
 * @returns Pseudo for the `filters` object.
 */
function dynamicStatePseudo(
  name: 'isHovered' | 'isVisited' | 'isActive'
): Filter {
  return function dynamicPseudo(next, _rule, { adapter }) {
    const func = adapter[name];

    if (typeof func !== 'function') {
      return falseFunc;
    }

    return function active(elem) {
      return func(elem) && next(elem);
    };
  };
}

const filters: Record<string, Filter> = {
  contains(next, text, { adapter }) {
    return function contains(elem) {
      return next(elem) && adapter.getText(elem).includes(text);
    };
  },
  icontains(next, text, { adapter }) {
    const itext = text.toLowerCase();

    return function icontains(elem) {
      return (
        next(elem) &&
        adapter.getText(elem).toLowerCase().includes(itext)
      );
    };
  },

  // Location specific methods
  'nth-child'(next, rule, { adapter, equals }) {
    const func = getNCheck(rule);

    if (func === falseFunc) return falseFunc;
    if (func === trueFunc) return getChildFunc(next, adapter);

    return function nthChild(elem) {
      const siblings = adapter.getSiblings(elem);
      let pos = 0;

      for (let i = 0; i < siblings.length; i++) {
        if (equals(elem, siblings[i])) break;
        if (adapter.isTag(siblings[i])) {
          pos++;
        }
      }

      return func(pos) && next(elem);
    };
  },
  'nth-last-child'(next, rule, { adapter, equals }) {
    const func = getNCheck(rule);

    if (func === falseFunc) return falseFunc;
    if (func === trueFunc) return getChildFunc(next, adapter);

    return function nthLastChild(elem) {
      const siblings = adapter.getSiblings(elem);
      let pos = 0;

      for (let i = siblings.length - 1; i >= 0; i--) {
        if (equals(elem, siblings[i])) break;
        if (adapter.isTag(siblings[i])) {
          pos++;
        }
      }

      return func(pos) && next(elem);
    };
  },
  'nth-of-type'(next, rule, { adapter, equals }) {
    const func = getNCheck(rule);

    if (func === falseFunc) return falseFunc;
    if (func === trueFunc) return getChildFunc(next, adapter);

    return function nthOfType(elem) {
      const siblings = adapter.getSiblings(elem);
      let pos = 0;

      for (let i = 0; i < siblings.length; i++) {
        const currentSibling = siblings[i];
        if (equals(elem, currentSibling)) break;
        if (
          adapter.isTag(currentSibling) &&
          adapter.getName(currentSibling) === adapter.getName(elem)
        ) {
          pos++;
        }
      }

      return func(pos) && next(elem);
    };
  },
  'nth-last-of-type'(next, rule, { adapter, equals }) {
    const func = getNCheck(rule);

    if (func === falseFunc) return falseFunc;
    if (func === trueFunc) return getChildFunc(next, adapter);

    return function nthLastOfType(elem) {
      const siblings = adapter.getSiblings(elem);
      let pos = 0;

      for (let i = siblings.length - 1; i >= 0; i--) {
        const currentSibling = siblings[i];
        if (equals(elem, currentSibling)) break;
        if (
          adapter.isTag(currentSibling) &&
          adapter.getName(currentSibling) === adapter.getName(elem)
        ) {
          pos++;
        }
      }

      return func(pos) && next(elem);
    };
  },

  // TODO determine the actual root element
  root(next, _rule, { adapter }) {
    return (elem) => {
      const parent = adapter.getParent(elem);
      return (parent == null || !adapter.isTag(parent)) && next(elem);
    };
  },

  scope<Node, ElementNode extends Node>(
    next: CompiledQuery<ElementNode>,
    rule: string,
    options: InternalOptions<Node, ElementNode>,
    context?: Node[]
  ): CompiledQuery<ElementNode> {
    const { equals } = options;

    if (!context || context.length === 0) {
      // Equivalent to :root
      return filters['root'](next, rule, options);
    }

    if (context.length === 1) {
      // NOTE: can't be unpacked, as :has uses this for side-effects
      return (elem) => equals(context[0], elem) && next(elem);
    }

    return (elem) => context.includes(elem) && next(elem);
  },

  hover: dynamicStatePseudo('isHovered'),
  visited: dynamicStatePseudo('isVisited'),
  active: dynamicStatePseudo('isActive'),
};

type Pseudo = <Node, ElementNode extends Node>(
  elem: ElementNode,
  options: InternalOptions<Node, ElementNode>,
  subselect?: string | null
) => boolean;

/**
 * CSS limits the characters considered as whitespace to space, tab & line
 * feed. We add carriage returns as htmlparser2 doesn't normalize them to
 * line feeds.
 *
 * @see {@link https://www.w3.org/TR/css-text-3/#white-space}
 */
const isDocumentWhiteSpace = /^[ \t\r\n]*$/;

// While filters are precompiled, pseudos get called when they are needed
const pseudos: Record<string, Pseudo> = {
  empty(elem, { adapter }) {
    return !adapter.getChildren(elem).some(
      (elem) =>
        adapter.isTag(elem) ||
        // FIXME: `getText` call is potentially expensive.
        !isDocumentWhiteSpace.test(adapter.getText(elem))
    );
  },

  'first-child'(elem, { adapter, equals }) {
    if (adapter.prevElementSibling) {
      return adapter.prevElementSibling(elem) == null;
    }

    const firstChild = adapter
      .getSiblings(elem)
      .find((elem) => adapter.isTag(elem));
    return firstChild != null && equals(elem, firstChild);
  },
  'last-child'(elem, { adapter, equals }) {
    const siblings = adapter.getSiblings(elem);

    for (let i = siblings.length - 1; i >= 0; i--) {
      if (equals(elem, siblings[i])) return true;
      if (adapter.isTag(siblings[i])) break;
    }

    return false;
  },
  'first-of-type'(elem, { adapter, equals }) {
    const siblings = adapter.getSiblings(elem);
    const elemName = adapter.getName(elem);

    for (let i = 0; i < siblings.length; i++) {
      const currentSibling = siblings[i];
      if (equals(elem, currentSibling)) return true;
      if (
        adapter.isTag(currentSibling) &&
        adapter.getName(currentSibling) === elemName
      ) {
        break;
      }
    }

    return false;
  },
  'last-of-type'(elem, { adapter, equals }) {
    const siblings = adapter.getSiblings(elem);
    const elemName = adapter.getName(elem);

    for (let i = siblings.length - 1; i >= 0; i--) {
      const currentSibling = siblings[i];
      if (equals(elem, currentSibling)) return true;
      if (
        adapter.isTag(currentSibling) &&
        adapter.getName(currentSibling) === elemName
      ) {
        break;
      }
    }

    return false;
  },
  'only-of-type'(elem, { adapter, equals }) {
    const elemName = adapter.getName(elem);

    return adapter
      .getSiblings(elem)
      .every(
        (sibling) =>
          equals(elem, sibling) ||
          !adapter.isTag(sibling) ||
          adapter.getName(sibling) !== elemName
      );
  },
  'only-child'(elem, { adapter, equals }) {
    return adapter
      .getSiblings(elem)
      .every(
        (sibling) => equals(elem, sibling) || !adapter.isTag(sibling)
      );
  },
};

function verifyPseudoArgs<T extends Array<unknown>>(
  func: (...args: T) => boolean,
  name: string,
  subselect: PseudoSelector['data'],
  argIndex: number
): void {
  if (subselect === null) {
    if (func.length > argIndex) {
      throw new Error(`Pseudo-class :${name} requires an argument`);
    }
  } else if (func.length === argIndex) {
    throw new Error(`Pseudo-class :${name} doesn't have any arguments`);
  }
}

function compilePseudoSelector<Node, ElementNode extends Node>(
  next: CompiledQuery<ElementNode>,
  selector: PseudoSelector,
  options: InternalOptions<Node, ElementNode>,
  context: Node[] | undefined,
  compileToken: CompileToken<Node, ElementNode>
): CompiledQuery<ElementNode> {
  const { name, data } = selector;

  if (Array.isArray(data)) {
    if (!(name in subselects)) {
      throw new Error(`Unknown pseudo-class :${name}(${data})`);
    }

    return subselects[name](next, data, options, context, compileToken);
  }

  const userPseudo = options.pseudos?.[name];

  const stringPseudo =
    typeof userPseudo === 'string' ? userPseudo : aliases[name];

  if (typeof stringPseudo === 'string') {
    if (data != null) {
      throw new Error(`Pseudo ${name} doesn't have any arguments`);
    }

    // The alias has to be parsed here, to make sure options are respected.
    const alias = parse(stringPseudo);
    return subselects['is'](next, alias, options, context, compileToken);
  }

  if (typeof userPseudo === 'function') {
    verifyPseudoArgs(userPseudo, name, data, 1);

    return (elem) => userPseudo(elem, data) && next(elem);
  }

  if (name in filters) {
    return filters[name](next, data as string, options, context);
  }

  if (name in pseudos) {
    const pseudo = pseudos[name];
    verifyPseudoArgs(pseudo, name, data, 2);

    return (elem) => pseudo(elem, options, data) && next(elem);
  }

  throw new Error(`Unknown pseudo-class :${name}`);
}

function getElementParent<Node, ElementNode extends Node>(
  node: ElementNode,
  adapter: Adapter<Node, ElementNode>
): ElementNode | null {
  const parent = adapter.getParent(node);
  if (parent && adapter.isTag(parent)) {
    return parent;
  }
  return null;
}

/*
 * All available rules
 */

function compileGeneralSelector<Node, ElementNode extends Node>(
  next: CompiledQuery<ElementNode>,
  selector: InternalSelector,
  options: InternalOptions<Node, ElementNode>,
  context: Node[] | undefined,
  compileToken: CompileToken<Node, ElementNode>
): CompiledQuery<ElementNode> {
  const { adapter, equals } = options;

  switch (selector.type) {
    case 'pseudo-element': {
      throw new Error('Pseudo-elements are not supported by css-select');
    }
    case 'column-combinator': {
      throw new Error(
        'Column combinators are not yet supported by css-select'
      );
    }
    case 'attribute': {
      if (selector.namespace != null) {
        throw new Error(
          'Namespaced attributes are not yet supported by css-select'
        );
      }

      if (!options.xmlMode || options.lowerCaseAttributeNames) {
        selector.name = selector.name.toLowerCase();
      }
      return attributeRules[selector.action](next, selector, options);
    }
    case 'pseudo': {
      return compilePseudoSelector(
        next,
        selector,
        options,
        context,
        compileToken
      );
    }
    // Tags
    case 'tag': {
      if (selector.namespace != null) {
        throw new Error(
          'Namespaced tag names are not yet supported by css-select'
        );
      }

      let { name } = selector;

      if (!options.xmlMode || options.lowerCaseTags) {
        name = name.toLowerCase();
      }

      return function tag(elem: ElementNode): boolean {
        return adapter.getName(elem) === name && next(elem);
      };
    }

    // Traversal
    case 'descendant': {
      if (
        options.cacheResults === false ||
        typeof WeakSet === 'undefined'
      ) {
        return function descendant(elem: ElementNode): boolean {
          let current: ElementNode | null = elem;

          while ((current = getElementParent(current, adapter))) {
            if (next(current)) {
              return true;
            }
          }

          return false;
        };
      }

      // @ts-expect-error `ElementNode` is not extending object
      const isFalseCache = new WeakSet<ElementNode>();
      return function cachedDescendant(elem: ElementNode): boolean {
        let current: ElementNode | null = elem;

        while ((current = getElementParent(current, adapter))) {
          if (!isFalseCache.has(current)) {
            if (adapter.isTag(current) && next(current)) {
              return true;
            }
            isFalseCache.add(current);
          }
        }

        return false;
      };
    }
    case '_flexibleDescendant': {
      // Include element itself, only used while querying an array
      return function flexibleDescendant(elem: ElementNode): boolean {
        let current: ElementNode | null = elem;

        do {
          if (next(current)) return true;
        } while ((current = getElementParent(current, adapter)));

        return false;
      };
    }
    case 'parent': {
      return function parent(elem: ElementNode): boolean {
        return adapter
          .getChildren(elem)
          .some((elem) => adapter.isTag(elem) && next(elem));
      };
    }
    case 'child': {
      return function child(elem: ElementNode): boolean {
        const parent = adapter.getParent(elem);
        return parent != null && adapter.isTag(parent) && next(parent);
      };
    }
    case 'sibling': {
      return function sibling(elem: ElementNode): boolean {
        const siblings = adapter.getSiblings(elem);

        for (let i = 0; i < siblings.length; i++) {
          const currentSibling = siblings[i];
          if (equals(elem, currentSibling)) break;
          if (adapter.isTag(currentSibling) && next(currentSibling)) {
            return true;
          }
        }

        return false;
      };
    }
    case 'adjacent': {
      if (adapter.prevElementSibling) {
        return function adjacent(elem: ElementNode): boolean {
          const previous = adapter.prevElementSibling!(elem);
          return previous != null && next(previous);
        };
      }

      return function adjacent(elem: ElementNode): boolean {
        const siblings = adapter.getSiblings(elem);
        let lastElement;

        for (let i = 0; i < siblings.length; i++) {
          const currentSibling = siblings[i];
          if (equals(elem, currentSibling)) break;
          if (adapter.isTag(currentSibling)) {
            lastElement = currentSibling;
          }
        }

        return !!lastElement && next(lastElement);
      };
    }
    case 'universal': {
      if (selector.namespace != null && selector.namespace !== '*') {
        throw new Error(
          'Namespaced universal selectors are not yet supported by css-select'
        );
      }

      return next;
    }
  }
}

function compileRules<Node, ElementNode extends Node>(
  rules: InternalSelector[],
  options: InternalOptions<Node, ElementNode>,
  context: Node[] | undefined,
  rootFunc: CompiledQuery<ElementNode>
): CompiledQuery<ElementNode> {
  return rules.reduce<CompiledQuery<ElementNode>>(
    (previous, rule) =>
      previous === falseFunc
        ? falseFunc
        : compileGeneralSelector(
            previous,
            rule,
            options,
            context,
            compileToken
          ),
    rootFunc
  );
}

function compileToken<Node, ElementNode extends Node>(
  token: InternalSelector[][],
  options: InternalOptions<Node, ElementNode>,
  ctx?: Node[] | Node
): CompiledQuery<ElementNode> {
  token.forEach(sortByProcedure);

  const { context = ctx, rootFunc = trueFunc } = options;

  const isArrayContext = Array.isArray(context);

  const finalContext =
    context && (Array.isArray(context) ? context : [context]);

  // Check if the selector is relative
  if (options.relativeSelector !== false) {
    absolutize(token, options, finalContext);
  } else if (token.some((t) => t.length > 0 && isTraversal(t[0]))) {
    throw new Error(
      'Relative selectors are not allowed when the `relativeSelector` option is disabled'
    );
  }

  let shouldTestNextSiblings = false;

  const query = token
    .map((rules) => {
      if (rules.length >= 2) {
        const [first, second] = rules;

        if (
          first.type !== 'pseudo' ||
          first.name !== 'scope'
        ) {
          // Ignore
        } else if (
          isArrayContext &&
          second.type === 'descendant'
        ) {
          rules[1] = FLEXIBLE_DESCENDANT_TOKEN;
        } else if (
          second.type === 'adjacent' ||
          second.type === 'sibling'
        ) {
          shouldTestNextSiblings = true;
        }
      }

      return compileRules<Node, ElementNode>(
        rules,
        options,
        finalContext,
        rootFunc
      );
    })
    .reduce<CompiledQuery<ElementNode>>(
      (a, b) =>
        b === falseFunc || a === rootFunc
          ? a
          : a === falseFunc || b === rootFunc
          ? b
          : function combine(elem) {
              return a(elem) || b(elem);
            },
      falseFunc
    );

  query.shouldTestNextSiblings = shouldTestNextSiblings;

  return query;
}

function compileUnsafe<Node, ElementNode extends Node>(
  selector: string | Selector[][],
  options: InternalOptions<Node, ElementNode>,
  context?: Node[] | Node
): CompiledQuery<ElementNode> {
  const token = typeof selector === 'string' ? parse(selector) : selector;
  return compileToken<Node, ElementNode>(token, options, context);
}

function getSelectorFunc<Node, ElementNode extends Node, T>(
  searchFunc: (
    query: Predicate<ElementNode>,
    elems: Array<Node>,
    options: InternalOptions<Node, ElementNode>
  ) => T
) {
  return function select(
    query: Query<ElementNode>,
    elements: Node[] | Node,
    options?: Options<Node, ElementNode>
  ): T {
    const opts = convertOptionFormats(options);

    if (typeof query !== 'function') {
      query = compileUnsafe<Node, ElementNode>(query, opts, elements);
    }

    const filteredElements = prepareContext(
      elements,
      opts.adapter,
      query.shouldTestNextSiblings
    );
    return searchFunc(query, filteredElements, opts);
  };
}

export const query = getSelectorFunc(
  <Node, ElementNode extends Node>(
    query: Predicate<ElementNode>,
    elems: Node[] | null,
    options: InternalOptions<Node, ElementNode>
  ): ElementNode | null =>
    query === falseFunc || !elems || elems.length === 0
      ? null
      : options.adapter.findOne(query, elems)
);

export const queryAll = getSelectorFunc(
  <Node, ElementNode extends Node>(
    query: Predicate<ElementNode>,
    elems: Node[] | null,
    options: InternalOptions<Node, ElementNode>
  ): ElementNode[] =>
    query === falseFunc || !elems || elems.length === 0
      ? []
      : options.adapter.findAll(query, elems)
);

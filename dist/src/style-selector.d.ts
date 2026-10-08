export type Selector = PseudoSelector | PseudoElement | AttributeSelector | TagSelector | UniversalSelector | Traversal;
export type SelectorType = 'attribute' | 'pseudo' | 'pseudo-element' | 'tag' | 'universal' | 'adjacent' | 'child' | 'descendant' | 'parent' | 'sibling' | 'column-combinator';
export interface AttributeSelector {
    type: 'attribute';
    name: string;
    action: AttributeAction;
    value: string;
    ignoreCase: 'quirks' | boolean | null;
    namespace: string | null;
}
type DataType = Selector[][] | null | string;
export interface PseudoSelector {
    type: 'pseudo';
    name: string;
    data: DataType;
}
interface PseudoElement {
    type: 'pseudo-element';
    name: string;
    data: string | null;
}
interface TagSelector {
    type: 'tag';
    name: string;
    namespace: string | null;
}
interface UniversalSelector {
    type: 'universal';
    namespace: string | null;
}
export interface Traversal {
    type: TraversalType;
}
export type AttributeAction = 'any' | 'element' | 'end' | 'equals' | 'exists' | 'hyphen' | 'not' | 'start';
type TraversalType = 'adjacent' | 'child' | 'descendant' | 'parent' | 'sibling' | 'column-combinator';
/**
 * Parses `selector`, optionally with the passed `options`.
 *
 * @param selector Selector to parse.
 * @param options Options for parsing.
 * @returns Returns a two-dimensional array.
 * The first dimension represents selectors separated by commas (eg. `sub1, sub2`),
 * the second contains the relevant tokens for that selector.
 */
export declare function parse(selector: string): Selector[][];
export {};

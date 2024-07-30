export type Selector = PseudoSelector | PseudoElement | AttributeSelector | TagSelector | UniversalSelector | Traversal;
export declare enum SelectorType {
    Attribute = "attribute",
    Pseudo = "pseudo",
    PseudoElement = "pseudo-element",
    Tag = "tag",
    Universal = "universal",
    Adjacent = "adjacent",
    Child = "child",
    Descendant = "descendant",
    Parent = "parent",
    Sibling = "sibling",
    ColumnCombinator = "column-combinator"
}
export interface AttributeSelector {
    type: SelectorType.Attribute;
    name: string;
    action: AttributeAction;
    value: string;
    ignoreCase: 'quirks' | boolean | null;
    namespace: string | null;
}
type DataType = Selector[][] | null | string;
export interface PseudoSelector {
    type: SelectorType.Pseudo;
    name: string;
    data: DataType;
}
interface PseudoElement {
    type: SelectorType.PseudoElement;
    name: string;
    data: string | null;
}
interface TagSelector {
    type: SelectorType.Tag;
    name: string;
    namespace: string | null;
}
interface UniversalSelector {
    type: SelectorType.Universal;
    namespace: string | null;
}
export interface Traversal {
    type: TraversalType;
}
export declare enum AttributeAction {
    Any = "any",
    Element = "element",
    End = "end",
    Equals = "equals",
    Exists = "exists",
    Hyphen = "hyphen",
    Not = "not",
    Start = "start"
}
type TraversalType = SelectorType.Adjacent | SelectorType.Child | SelectorType.Descendant | SelectorType.Parent | SelectorType.Sibling | SelectorType.ColumnCombinator;
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

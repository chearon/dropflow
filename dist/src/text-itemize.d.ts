import { BlockContainerOfInlines, Inline } from './layout-flow.ts';
import type { InlineLevel } from './layout-flow.ts';
import { Style } from './style.ts';
import type { Layout } from './layout-box.ts';
interface BidiIteratorState {
    offset: number;
    level: number;
    done: boolean;
    stringLength: number;
    paragraphStart: number;
    paragraphEnd: number;
    algorithmPtr: number;
    paragraphPtr: number;
    levelsPtr: number;
    initialLevel: number;
}
export declare function createBidiIteratorState(stringPtr: number, stringLength: number, initialLevel?: number): BidiIteratorState;
export declare function bidiIteratorNext(state: BidiIteratorState): void;
interface EmojiIteratorState {
    offset: number;
    isEmoji: boolean;
    done: boolean;
    index: number;
    typesPtr: number;
    typesLength: number;
    offsets: number[];
}
export declare function createEmojiIteratorState(stringPtr: number, stringLength: number): EmojiIteratorState;
export declare function emojiIteratorNext(state: EmojiIteratorState): void;
interface ScriptIteratorState {
    offset: number;
    script: string;
    done: boolean;
    stringPtr16: number;
    stringLength: number;
    parens: {
        index: number;
        script: string;
    }[];
    startParen: number;
}
export declare function createScriptIteratorState(stringPtr: number, stringLength: number): ScriptIteratorState;
export declare function scriptIteratorNext(state: ScriptIteratorState): void;
interface NewlineIteratorState {
    offset: number;
    done: boolean;
    str: string;
}
export declare function createNewlineIteratorState(str: string): NewlineIteratorState;
export declare function newlineIteratorNext(state: NewlineIteratorState): void;
interface StyleIteratorState {
    offset: number;
    style: Style;
    done: boolean;
    layout: Layout;
    index: number;
    parents: Inline[];
    leader: InlineLevel;
    direction: 'ltr' | 'rtl';
    lastOffset: number;
    block: BlockContainerOfInlines;
}
export declare function createStyleIteratorState(layout: Layout, block: BlockContainerOfInlines): StyleIteratorState;
export declare function styleIteratorNext(state: StyleIteratorState): void;
interface ShapingAttrs {
    isEmoji: boolean;
    level: number;
    script: string;
    style: Style;
}
interface ItemizeState {
    attrs: ShapingAttrs;
    offset: number;
    done: boolean;
    newlineState: NewlineIteratorState | undefined;
    inlineState: StyleIteratorState | undefined;
    emojiState: EmojiIteratorState | undefined;
    bidiState: BidiIteratorState | undefined;
    scriptState: ScriptIteratorState | undefined;
    simple: boolean;
    length: number;
    free: (() => void) | undefined;
}
export declare function createItemizeState(layout: Layout, block: BlockContainerOfInlines): ItemizeState;
export declare function itemizeNext(state: ItemizeState): void;
export {};

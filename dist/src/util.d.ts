import type { Style } from './style.ts';
/**
 * Binary search that returns the position `x` should be in
 */
export declare function binarySearch(a: number[], x: number): number;
/**
 * Binary search that returns the position `x` should be in, using the `end`
 * property of objects in the `a` array
 */
export declare function binarySearchOf<T>(a: T[], x: number, end: (item: T) => number): number;
export declare function id(): string;
export declare function uuid(): string;
export declare function loggableText(text: string): string;
export declare function basename(url: URL): string;
export interface TreeLogOptions {
    containingBlocks?: boolean;
    css?: keyof Style;
    paragraphText?: string;
    bits?: boolean;
}
export declare class Logger {
    string: string;
    formats: string[];
    indent: string[];
    lineIsEmpty: boolean;
    constructor();
    bold(): void;
    underline(): void;
    dim(): void;
    reset(): void;
    flush(): void;
    text(str: string | number): void;
    glyphs(glyphs: Int32Array): void;
    pushIndent(indent?: string): void;
    popIndent(): void;
}
export declare class Deferred<T> {
    status: 'unresolved' | 'resolved' | 'rejected';
    promise: Promise<T>;
    resolve: (v: T) => void;
    reject: (e?: unknown) => void;
    constructor();
}
export type BufferSource = ArrayBufferView<ArrayBufferLike> | ArrayBufferLike;
export declare function toTypedArray(buf: BufferSource): Uint8Array<ArrayBufferLike>;

/**
 * Binary search that returns the position `x` should be in
 */
export declare function binarySearch(a: number[], x: number): number;
/**
 * Binary search that returns the position `x` should be in, using the `end`
 * property of objects in the `a` array
 */
export declare function binarySearchOf<T>(a: T[], x: number, end: (item: T) => number): number;
/**
 * Binary search that returns the position `x` should be in, using the second
 * value in a tuple in the `a` array
 */
export declare function binarySearchTuple<T>(a: [T, number][], x: number): number;
export declare function id(): string;
export declare function loggableText(text: string): string;
export declare function basename(p: string): string;

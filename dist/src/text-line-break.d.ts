declare class Break {
    position: number;
    required: boolean;
    constructor(position: number, required?: boolean);
}
export declare class HardBreaker {
    private string;
    private pos;
    constructor(string: string);
    nextBreak(): Break | null;
}
export declare const pairTable: number[][];
export default class LineBreaker {
    private string;
    private pos;
    private lastPos;
    private curClass;
    private nextClass;
    private LB8a;
    private LB21a;
    private LB30a;
    private hardBreaksOnly;
    constructor(string: string, hardBreaksOnly: boolean);
    nextCodePoint(): number;
    nextCharClass(): number;
    getSimpleBreak(): false | null;
    getPairTableBreak(lastClass: number): boolean;
    nextBreak(): Break | null;
}
export {};

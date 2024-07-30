export declare function isWhitespace(c: number): boolean;
declare enum QuoteType {
    NoValue = 0,
    Unquoted = 1,
    Single = 2,
    Double = 3
}
interface Callbacks {
    onattribdata(start: number, endIndex: number): void;
    onattribentity(codepoint: number): void;
    onattribend(quote: QuoteType, endIndex: number): void;
    onattribname(start: number, endIndex: number): void;
    oncdata(start: number, endIndex: number, endOffset: number): void;
    onclosetag(start: number, endIndex: number): void;
    oncomment(start: number, endIndex: number, endOffset: number): void;
    ondeclaration(start: number, endIndex: number): void;
    onend(): void;
    onopentagend(endIndex: number): void;
    onopentagname(start: number, endIndex: number): void;
    onprocessinginstruction(start: number, endIndex: number): void;
    onselfclosingtag(endIndex: number): void;
    ontext(start: number, endIndex: number): void;
    ontextentity(codepoint: number): void;
}
declare class Tokenizer {
    private readonly cbs;
    /** The current state the tokenizer is in. */
    private state;
    /** The read buffer. */
    private buffer;
    /** The beginning of the section that is currently being read. */
    private sectionStart;
    /** The index within the buffer that we are currently looking at. */
    private index;
    /** Some behavior, eg. when decoding entities, is done while we are in another state. This keeps track of the other state type. */
    private baseState;
    /** For special parsing behavior inside of script and style tags. */
    private isSpecial;
    /** Indicates whether the tokenizer has been paused. */
    running: boolean;
    /** The offset of the current buffer. */
    private offset;
    constructor(cbs: Callbacks);
    reset(): void;
    write(chunk: string): void;
    end(): void;
    pause(): void;
    resume(): void;
    /**
     * The current index within all of the written data.
     */
    getIndex(): number;
    /**
     * The start of the current section.
     */
    getSectionStart(): number;
    private stateText;
    private currentSequence;
    private sequenceIndex;
    private stateSpecialStartSequence;
    /** Look for an end tag. For <title> tags, also decode entities. */
    private stateInSpecialTag;
    private stateCDATASequence;
    /**
     * When we wait for one specific character, we can speed things up
     * by skipping through the buffer until we find it.
     *
     * @returns Whether the character was found.
     */
    private fastForwardTo;
    /**
     * Comments and CDATA end with `-->` and `]]>`.
     *
     * Their common qualities are:
     * - Their end sequences have a distinct character they start with.
     * - That character is then repeated, so we have to check multiple repeats.
     * - All characters but the start character of the sequence can be skipped.
     */
    private stateInCommentLike;
    /**
     * HTML only allows ASCII alpha characters (a-z and A-Z) at the beginning of a tag name.
     */
    private isTagStartChar;
    private startSpecial;
    private stateBeforeTagName;
    private stateInTagName;
    private stateBeforeClosingTagName;
    private stateInClosingTagName;
    private stateAfterClosingTagName;
    private stateBeforeAttributeName;
    private stateInSelfClosingTag;
    private stateInAttributeName;
    private stateAfterAttributeName;
    private stateBeforeAttributeValue;
    private handleInAttributeValue;
    private stateInAttributeValueDoubleQuotes;
    private stateInAttributeValueSingleQuotes;
    private stateInAttributeValueNoQuotes;
    private stateBeforeDeclaration;
    private stateInDeclaration;
    private stateInProcessingInstruction;
    private stateBeforeComment;
    private stateInSpecialComment;
    private stateBeforeSpecialS;
    private trieIndex;
    private trieCurrent;
    /** For named entities, the index of the value. For numeric entities, the code point. */
    private entityResult;
    private entityExcess;
    private stateBeforeEntity;
    private stateInNamedEntity;
    private emitNamedEntity;
    private stateBeforeNumericEntity;
    private emitNumericEntity;
    private stateInNumericEntity;
    private stateInHexEntity;
    private allowLegacyEntity;
    /**
     * Remove data that has already been consumed from the buffer.
     */
    private cleanup;
    private shouldContinue;
    /**
     * Iterates through the buffer, calling the function corresponding to the current state.
     *
     * States that are more likely to be hit are higher up, as a performance improvement.
     */
    private parse;
    private finish;
    /** Handle any trailing data. */
    private handleTrailingData;
    private emitPartial;
    private emitCodePoint;
}
export interface ParserOptions {
    /**
     * Allows the default tokenizer to be overwritten.
     */
    Tokenizer?: typeof Tokenizer;
}
export interface Handler {
    onparserinit(parser: Parser): void;
    /**
     * Resets the handler back to starting state
     */
    onreset(): void;
    /**
     * Signals the handler that parsing is done
     */
    onend(): void;
    onerror(error: Error): void;
    onclosetag(name: string, isImplied: boolean): void;
    onopentagname(name: string): void;
    /**
     *
     * @param name Name of the attribute
     * @param value Value of the attribute.
     * @param quote Quotes used around the attribute. `null` if the attribute has no quotes around the value, `undefined` if the attribute has no value.
     */
    onattribute(name: string, value: string, quote?: string | undefined | null): void;
    onopentag(name: string, attribs: {
        [s: string]: string;
    }, isImplied: boolean): void;
    ontext(data: string): void;
    oncomment(data: string): void;
    oncdatastart(): void;
    oncdataend(): void;
    oncommentend(): void;
    onprocessinginstruction(name: string, data: string): void;
}
export declare class Parser implements Callbacks {
    /** The start index of the last event. */
    startIndex: number;
    /** The end index of the last event. */
    endIndex: number;
    /**
     * Store the start index of the current open tag,
     * so we can update the start index for attributes.
     */
    private openTagStart;
    private tagname;
    private attribname;
    private attribvalue;
    private attribs;
    private stack;
    private readonly foreignContext;
    private readonly cbs;
    private readonly tokenizer;
    private readonly buffers;
    private bufferOffset;
    /** The index of the last written buffer. Used when resuming after a `pause()`. */
    private writeIndex;
    /** Indicates whether the parser has finished running / `.end` has been called. */
    private ended;
    constructor(cbs?: Partial<Handler> | null, options?: ParserOptions);
    /** @internal */
    ontext(start: number, endIndex: number): void;
    /** @internal */
    ontextentity(cp: number): void;
    protected isVoidElement(name: string): boolean;
    /** @internal */
    onopentagname(start: number, endIndex: number): void;
    private emitOpenTag;
    private endOpenTag;
    /** @internal */
    onopentagend(endIndex: number): void;
    /** @internal */
    onclosetag(start: number, endIndex: number): void;
    /** @internal */
    onselfclosingtag(endIndex: number): void;
    private closeCurrentTag;
    /** @internal */
    onattribname(start: number, endIndex: number): void;
    /** @internal */
    onattribdata(start: number, endIndex: number): void;
    /** @internal */
    onattribentity(cp: number): void;
    /** @internal */
    onattribend(quote: QuoteType, endIndex: number): void;
    private getInstructionName;
    /** @internal */
    ondeclaration(start: number, endIndex: number): void;
    /** @internal */
    onprocessinginstruction(start: number, endIndex: number): void;
    /** @internal */
    oncomment(start: number, endIndex: number, offset: number): void;
    /** @internal */
    oncdata(start: number, endIndex: number, offset: number): void;
    /** @internal */
    onend(): void;
    /**
     * Resets the parser to a blank state, ready to parse a new HTML document
     */
    reset(): void;
    /**
     * Resets the parser, then parses a complete document and
     * pushes it to the handler.
     *
     * @param data Document to parse.
     */
    parseComplete(data: string): void;
    private getSlice;
    private shiftBuffer;
    /**
     * Parses a chunk of data and calls the corresponding callbacks.
     *
     * @param chunk Chunk to parse.
     */
    write(chunk: string): void;
    /**
     * Parses the end of the buffer and clears the stack, calls onend.
     *
     * @param chunk Optional final chunk to parse.
     */
    end(chunk?: string): void;
    /**
     * Pauses parsing. The parser won't emit events until `resume` is called.
     */
    pause(): void;
    /**
     * Resumes parsing after `pause` was called.
     */
    resume(): void;
}
export {};

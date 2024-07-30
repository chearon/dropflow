// fb55/htmlparser2 by Felix Böhm
//
// Parser.ts and Tokenizer.ts were inlined into this file with no modifications
// other than style changes and imports/exports (at time of writing)
//
// Copyright 2010, 2011, Chris Winberry <chris@winberry.net>. All rights reserved.
// Permission is hereby granted, free of charge, to any person obtaining a copy
// of this software and associated documentation files (the "Software"), to
// deal in the Software without restriction, including without limitation the
// rights to use, copy, modify, merge, publish, distribute, sublicense, and/or
// sell copies of the Software, and to permit persons to whom the Software is
// furnished to do so, subject to the following conditions:
//
// The above copyright notice and this permission notice shall be included in
// all copies or substantial portions of the Software.
//
// THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
// IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,
// FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE
// AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER
// LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING
// FROM, OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS
// IN THE SOFTWARE.
import { determineBranch, BinTrieFlags } from './string-trie.js';
import entityTrie from '../gen/entity-trie.js';
const decodeMap = new Map([
    [0, 65533],
    // C1 Unicode control character reference replacements
    [128, 8364],
    [130, 8218],
    [131, 402],
    [132, 8222],
    [133, 8230],
    [134, 8224],
    [135, 8225],
    [136, 710],
    [137, 8240],
    [138, 352],
    [139, 8249],
    [140, 338],
    [142, 381],
    [145, 8216],
    [146, 8217],
    [147, 8220],
    [148, 8221],
    [149, 8226],
    [150, 8211],
    [151, 8212],
    [152, 732],
    [153, 8482],
    [154, 353],
    [155, 8250],
    [156, 339],
    [158, 382],
    [159, 376]
]);
/**
 * Replace the given code point with a replacement character if it is a
 * surrogate or is outside the valid range. Otherwise return the code
 * point unchanged.
 */
function replaceCodePoint(codePoint) {
    if ((codePoint >= 0xd800 && codePoint <= 0xdfff) || codePoint > 0x10ffff) {
        return 0xfffd;
    }
    return decodeMap.get(codePoint) ?? codePoint;
}
export function isWhitespace(c) {
    return (c === 32 /* CharCodes.Space */ ||
        c === 10 /* CharCodes.NewLine */ ||
        c === 9 /* CharCodes.Tab */ ||
        c === 12 /* CharCodes.FormFeed */ ||
        c === 13 /* CharCodes.CarriageReturn */);
}
function isEndOfTagSection(c) {
    return c === 47 /* CharCodes.Slash */ || c === 62 /* CharCodes.Gt */ || isWhitespace(c);
}
function isNumber(c) {
    return c >= 48 /* CharCodes.Zero */ && c <= 57 /* CharCodes.Nine */;
}
function isASCIIAlpha(c) {
    return ((c >= 97 /* CharCodes.LowerA */ && c <= 122 /* CharCodes.LowerZ */) ||
        (c >= 65 /* CharCodes.UpperA */ && c <= 90 /* CharCodes.UpperZ */));
}
function isHexDigit(c) {
    return ((c >= 65 /* CharCodes.UpperA */ && c <= 70 /* CharCodes.UpperF */) ||
        (c >= 97 /* CharCodes.LowerA */ && c <= 102 /* CharCodes.LowerF */));
}
var QuoteType;
(function (QuoteType) {
    QuoteType[QuoteType["NoValue"] = 0] = "NoValue";
    QuoteType[QuoteType["Unquoted"] = 1] = "Unquoted";
    QuoteType[QuoteType["Single"] = 2] = "Single";
    QuoteType[QuoteType["Double"] = 3] = "Double";
})(QuoteType || (QuoteType = {}));
/**
 * Sequences used to match longer strings.
 *
 * We don't have `Script`, `Style`, or `Title` here. Instead, we re-use the *End
 * sequences with an increased offset.
 */
const Sequences = {
    Cdata: new Uint8Array([0x43, 0x44, 0x41, 0x54, 0x41, 0x5b]),
    CdataEnd: new Uint8Array([0x5d, 0x5d, 0x3e]),
    CommentEnd: new Uint8Array([0x2d, 0x2d, 0x3e]),
    ScriptEnd: new Uint8Array([0x3c, 0x2f, 0x73, 0x63, 0x72, 0x69, 0x70, 0x74]),
    StyleEnd: new Uint8Array([0x3c, 0x2f, 0x73, 0x74, 0x79, 0x6c, 0x65]),
    TitleEnd: new Uint8Array([0x3c, 0x2f, 0x74, 0x69, 0x74, 0x6c, 0x65]), // `</title`
};
class Tokenizer {
    cbs;
    /** The current state the tokenizer is in. */
    state = 1 /* State.Text */;
    /** The read buffer. */
    buffer = '';
    /** The beginning of the section that is currently being read. */
    sectionStart = 0;
    /** The index within the buffer that we are currently looking at. */
    index = 0;
    /** Some behavior, eg. when decoding entities, is done while we are in another state. This keeps track of the other state type. */
    baseState = 1 /* State.Text */;
    /** For special parsing behavior inside of script and style tags. */
    isSpecial = false;
    /** Indicates whether the tokenizer has been paused. */
    running = true;
    /** The offset of the current buffer. */
    offset = 0;
    constructor(cbs) {
        this.cbs = cbs;
    }
    reset() {
        this.state = 1 /* State.Text */;
        this.buffer = '';
        this.sectionStart = 0;
        this.index = 0;
        this.baseState = 1 /* State.Text */;
        this.currentSequence = undefined;
        this.running = true;
        this.offset = 0;
    }
    write(chunk) {
        this.offset += this.buffer.length;
        this.buffer = chunk;
        this.parse();
    }
    end() {
        if (this.running)
            this.finish();
    }
    pause() {
        this.running = false;
    }
    resume() {
        this.running = true;
        if (this.index < this.buffer.length + this.offset) {
            this.parse();
        }
    }
    /**
     * The current index within all of the written data.
     */
    getIndex() {
        return this.index;
    }
    /**
     * The start of the current section.
     */
    getSectionStart() {
        return this.sectionStart;
    }
    stateText(c) {
        if (c === 60 /* CharCodes.Lt */) {
            if (this.index > this.sectionStart) {
                this.cbs.ontext(this.sectionStart, this.index);
            }
            this.state = 2 /* State.BeforeTagName */;
            this.sectionStart = this.index;
        }
        else if (c === 38 /* CharCodes.Amp */) {
            this.state = 25 /* State.BeforeEntity */;
        }
    }
    currentSequence;
    sequenceIndex = 0;
    stateSpecialStartSequence(c) {
        const isEnd = this.sequenceIndex === this.currentSequence.length;
        const isMatch = isEnd
            ? // If we are at the end of the sequence, make sure the tag name has ended
                isEndOfTagSection(c)
            : // Otherwise, do a case-insensitive comparison
                (c | 0x20) === this.currentSequence[this.sequenceIndex];
        if (!isMatch) {
            this.isSpecial = false;
        }
        else if (!isEnd) {
            this.sequenceIndex++;
            return;
        }
        this.sequenceIndex = 0;
        this.state = 3 /* State.InTagName */;
        this.stateInTagName(c);
    }
    /** Look for an end tag. For <title> tags, also decode entities. */
    stateInSpecialTag(c) {
        if (this.sequenceIndex === this.currentSequence.length) {
            if (c === 62 /* CharCodes.Gt */ || isWhitespace(c)) {
                const endOfText = this.index - this.currentSequence.length;
                if (this.sectionStart < endOfText) {
                    // Spoof the index so that reported locations match up.
                    const actualIndex = this.index;
                    this.index = endOfText;
                    this.cbs.ontext(this.sectionStart, endOfText);
                    this.index = actualIndex;
                }
                this.isSpecial = false;
                this.sectionStart = endOfText + 2; // Skip over the `</`
                this.stateInClosingTagName(c);
                return; // We are done; skip the rest of the function.
            }
            this.sequenceIndex = 0;
        }
        if ((c | 0x20) === this.currentSequence[this.sequenceIndex]) {
            this.sequenceIndex += 1;
        }
        else if (this.sequenceIndex === 0) {
            if (this.currentSequence === Sequences.TitleEnd) {
                // We have to parse entities in <title> tags.
                if (c === 38 /* CharCodes.Amp */) {
                    this.state = 25 /* State.BeforeEntity */;
                }
            }
            else if (this.fastForwardTo(60 /* CharCodes.Lt */)) {
                // Outside of <title> tags, we can fast-forward.
                this.sequenceIndex = 1;
            }
        }
        else {
            // If we see a `<`, set the sequence index to 1; useful for eg. `<</script>`.
            this.sequenceIndex = Number(c === 60 /* CharCodes.Lt */);
        }
    }
    stateCDATASequence(c) {
        if (c === Sequences.Cdata[this.sequenceIndex]) {
            if (++this.sequenceIndex === Sequences.Cdata.length) {
                this.state = 21 /* State.InCommentLike */;
                this.currentSequence = Sequences.CdataEnd;
                this.sequenceIndex = 0;
                this.sectionStart = this.index + 1;
            }
        }
        else {
            this.sequenceIndex = 0;
            this.state = 16 /* State.InDeclaration */;
            this.stateInDeclaration(c); // Reconsume the character
        }
    }
    /**
     * When we wait for one specific character, we can speed things up
     * by skipping through the buffer until we find it.
     *
     * @returns Whether the character was found.
     */
    fastForwardTo(c) {
        while (++this.index < this.buffer.length + this.offset) {
            if (this.buffer.charCodeAt(this.index - this.offset) === c) {
                return true;
            }
        }
        /*
         * We increment the index at the end of the `parse` loop,
         * so set it to `buffer.length - 1` here.
         *
         * TODO: Refactor `parse` to increment index before calling states.
         */
        this.index = this.buffer.length + this.offset - 1;
        return false;
    }
    /**
     * Comments and CDATA end with `-->` and `]]>`.
     *
     * Their common qualities are:
     * - Their end sequences have a distinct character they start with.
     * - That character is then repeated, so we have to check multiple repeats.
     * - All characters but the start character of the sequence can be skipped.
     */
    stateInCommentLike(c) {
        if (c === this.currentSequence[this.sequenceIndex]) {
            if (++this.sequenceIndex === this.currentSequence.length) {
                if (this.currentSequence === Sequences.CdataEnd) {
                    this.cbs.oncdata(this.sectionStart, this.index, 2);
                }
                else {
                    this.cbs.oncomment(this.sectionStart, this.index, 2);
                }
                this.sequenceIndex = 0;
                this.sectionStart = this.index + 1;
                this.state = 1 /* State.Text */;
            }
        }
        else if (this.sequenceIndex === 0) {
            // Fast-forward to the first character of the sequence
            if (this.fastForwardTo(this.currentSequence[0])) {
                this.sequenceIndex = 1;
            }
        }
        else if (c !== this.currentSequence[this.sequenceIndex - 1]) {
            // Allow long sequences, eg. --->, ]]]>
            this.sequenceIndex = 0;
        }
    }
    /**
     * HTML only allows ASCII alpha characters (a-z and A-Z) at the beginning of a tag name.
     */
    isTagStartChar(c) {
        return isASCIIAlpha(c);
    }
    startSpecial(sequence, offset) {
        this.isSpecial = true;
        this.currentSequence = sequence;
        this.sequenceIndex = offset;
        this.state = 23 /* State.SpecialStartSequence */;
    }
    stateBeforeTagName(c) {
        if (c === 33 /* CharCodes.ExclamationMark */) {
            this.state = 15 /* State.BeforeDeclaration */;
            this.sectionStart = this.index + 1;
        }
        else if (c === 63 /* CharCodes.Questionmark */) {
            this.state = 17 /* State.InProcessingInstruction */;
            this.sectionStart = this.index + 1;
        }
        else if (this.isTagStartChar(c)) {
            const lower = c | 0x20;
            this.sectionStart = this.index;
            if (lower === Sequences.TitleEnd[2]) {
                this.startSpecial(Sequences.TitleEnd, 3);
            }
            else {
                this.state =
                    lower === Sequences.ScriptEnd[2]
                        ? 22 /* State.BeforeSpecialS */
                        : 3 /* State.InTagName */;
            }
        }
        else if (c === 47 /* CharCodes.Slash */) {
            this.state = 5 /* State.BeforeClosingTagName */;
        }
        else {
            this.state = 1 /* State.Text */;
            this.stateText(c);
        }
    }
    stateInTagName(c) {
        if (isEndOfTagSection(c)) {
            this.cbs.onopentagname(this.sectionStart, this.index);
            this.sectionStart = -1;
            this.state = 8 /* State.BeforeAttributeName */;
            this.stateBeforeAttributeName(c);
        }
    }
    stateBeforeClosingTagName(c) {
        if (isWhitespace(c)) {
            // Ignore
        }
        else if (c === 62 /* CharCodes.Gt */) {
            this.state = 1 /* State.Text */;
        }
        else {
            this.state = this.isTagStartChar(c)
                ? 6 /* State.InClosingTagName */
                : 20 /* State.InSpecialComment */;
            this.sectionStart = this.index;
        }
    }
    stateInClosingTagName(c) {
        if (c === 62 /* CharCodes.Gt */ || isWhitespace(c)) {
            this.cbs.onclosetag(this.sectionStart, this.index);
            this.sectionStart = -1;
            this.state = 7 /* State.AfterClosingTagName */;
            this.stateAfterClosingTagName(c);
        }
    }
    stateAfterClosingTagName(c) {
        // Skip everything until ">"
        if (c === 62 /* CharCodes.Gt */ || this.fastForwardTo(62 /* CharCodes.Gt */)) {
            this.state = 1 /* State.Text */;
            this.sectionStart = this.index + 1;
        }
    }
    stateBeforeAttributeName(c) {
        if (c === 62 /* CharCodes.Gt */) {
            this.cbs.onopentagend(this.index);
            if (this.isSpecial) {
                this.state = 24 /* State.InSpecialTag */;
                this.sequenceIndex = 0;
            }
            else {
                this.state = 1 /* State.Text */;
            }
            this.baseState = this.state;
            this.sectionStart = this.index + 1;
        }
        else if (c === 47 /* CharCodes.Slash */) {
            this.state = 4 /* State.InSelfClosingTag */;
        }
        else if (!isWhitespace(c)) {
            this.state = 9 /* State.InAttributeName */;
            this.sectionStart = this.index;
        }
    }
    stateInSelfClosingTag(c) {
        if (c === 62 /* CharCodes.Gt */) {
            this.cbs.onselfclosingtag(this.index);
            this.state = 1 /* State.Text */;
            this.baseState = 1 /* State.Text */;
            this.sectionStart = this.index + 1;
            this.isSpecial = false; // Reset special state, in case of self-closing special tags
        }
        else if (!isWhitespace(c)) {
            this.state = 8 /* State.BeforeAttributeName */;
            this.stateBeforeAttributeName(c);
        }
    }
    stateInAttributeName(c) {
        if (c === 61 /* CharCodes.Eq */ || isEndOfTagSection(c)) {
            this.cbs.onattribname(this.sectionStart, this.index);
            this.sectionStart = -1;
            this.state = 10 /* State.AfterAttributeName */;
            this.stateAfterAttributeName(c);
        }
    }
    stateAfterAttributeName(c) {
        if (c === 61 /* CharCodes.Eq */) {
            this.state = 11 /* State.BeforeAttributeValue */;
        }
        else if (c === 47 /* CharCodes.Slash */ || c === 62 /* CharCodes.Gt */) {
            this.cbs.onattribend(QuoteType.NoValue, this.index);
            this.state = 8 /* State.BeforeAttributeName */;
            this.stateBeforeAttributeName(c);
        }
        else if (!isWhitespace(c)) {
            this.cbs.onattribend(QuoteType.NoValue, this.index);
            this.state = 9 /* State.InAttributeName */;
            this.sectionStart = this.index;
        }
    }
    stateBeforeAttributeValue(c) {
        if (c === 34 /* CharCodes.DoubleQuote */) {
            this.state = 12 /* State.InAttributeValueDq */;
            this.sectionStart = this.index + 1;
        }
        else if (c === 39 /* CharCodes.SingleQuote */) {
            this.state = 13 /* State.InAttributeValueSq */;
            this.sectionStart = this.index + 1;
        }
        else if (!isWhitespace(c)) {
            this.sectionStart = this.index;
            this.state = 14 /* State.InAttributeValueNq */;
            this.stateInAttributeValueNoQuotes(c); // Reconsume token
        }
    }
    handleInAttributeValue(c, quote) {
        if (c === quote) {
            this.cbs.onattribdata(this.sectionStart, this.index);
            this.sectionStart = -1;
            this.cbs.onattribend(quote === 34 /* CharCodes.DoubleQuote */
                ? QuoteType.Double
                : QuoteType.Single, this.index);
            this.state = 8 /* State.BeforeAttributeName */;
        }
        else if (c === 38 /* CharCodes.Amp */) {
            this.baseState = this.state;
            this.state = 25 /* State.BeforeEntity */;
        }
    }
    stateInAttributeValueDoubleQuotes(c) {
        this.handleInAttributeValue(c, 34 /* CharCodes.DoubleQuote */);
    }
    stateInAttributeValueSingleQuotes(c) {
        this.handleInAttributeValue(c, 39 /* CharCodes.SingleQuote */);
    }
    stateInAttributeValueNoQuotes(c) {
        if (isWhitespace(c) || c === 62 /* CharCodes.Gt */) {
            this.cbs.onattribdata(this.sectionStart, this.index);
            this.sectionStart = -1;
            this.cbs.onattribend(QuoteType.Unquoted, this.index);
            this.state = 8 /* State.BeforeAttributeName */;
            this.stateBeforeAttributeName(c);
        }
        else if (c === 38 /* CharCodes.Amp */) {
            this.baseState = this.state;
            this.state = 25 /* State.BeforeEntity */;
        }
    }
    stateBeforeDeclaration(c) {
        if (c === 91 /* CharCodes.OpeningSquareBracket */) {
            this.state = 19 /* State.CDATASequence */;
            this.sequenceIndex = 0;
        }
        else {
            this.state =
                c === 45 /* CharCodes.Dash */
                    ? 18 /* State.BeforeComment */
                    : 16 /* State.InDeclaration */;
        }
    }
    stateInDeclaration(c) {
        if (c === 62 /* CharCodes.Gt */ || this.fastForwardTo(62 /* CharCodes.Gt */)) {
            this.cbs.ondeclaration(this.sectionStart, this.index);
            this.state = 1 /* State.Text */;
            this.sectionStart = this.index + 1;
        }
    }
    stateInProcessingInstruction(c) {
        if (c === 62 /* CharCodes.Gt */ || this.fastForwardTo(62 /* CharCodes.Gt */)) {
            this.cbs.onprocessinginstruction(this.sectionStart, this.index);
            this.state = 1 /* State.Text */;
            this.sectionStart = this.index + 1;
        }
    }
    stateBeforeComment(c) {
        if (c === 45 /* CharCodes.Dash */) {
            this.state = 21 /* State.InCommentLike */;
            this.currentSequence = Sequences.CommentEnd;
            // Allow short comments (eg. <!-->)
            this.sequenceIndex = 2;
            this.sectionStart = this.index + 1;
        }
        else {
            this.state = 16 /* State.InDeclaration */;
        }
    }
    stateInSpecialComment(c) {
        if (c === 62 /* CharCodes.Gt */ || this.fastForwardTo(62 /* CharCodes.Gt */)) {
            this.cbs.oncomment(this.sectionStart, this.index, 0);
            this.state = 1 /* State.Text */;
            this.sectionStart = this.index + 1;
        }
    }
    stateBeforeSpecialS(c) {
        const lower = c | 0x20;
        if (lower === Sequences.ScriptEnd[3]) {
            this.startSpecial(Sequences.ScriptEnd, 4);
        }
        else if (lower === Sequences.StyleEnd[3]) {
            this.startSpecial(Sequences.StyleEnd, 4);
        }
        else {
            this.state = 3 /* State.InTagName */;
            this.stateInTagName(c); // Consume the token again
        }
    }
    trieIndex = 0;
    trieCurrent = 0;
    /** For named entities, the index of the value. For numeric entities, the code point. */
    entityResult = 0;
    entityExcess = 0;
    stateBeforeEntity(c) {
        // Start excess with 1 to include the '&'
        this.entityExcess = 1;
        this.entityResult = 0;
        if (c === 35 /* CharCodes.Num */) {
            this.state = 26 /* State.BeforeNumericEntity */;
        }
        else if (c === 38 /* CharCodes.Amp */) {
            // We have two `&` characters in a row. Stay in the current state.
        }
        else {
            this.trieIndex = 0;
            this.trieCurrent = entityTrie[0];
            this.state = 27 /* State.InNamedEntity */;
            this.stateInNamedEntity(c);
        }
    }
    stateInNamedEntity(c) {
        this.entityExcess += 1;
        this.trieIndex = determineBranch(entityTrie, this.trieCurrent, this.trieIndex + 1, c);
        if (this.trieIndex < 0) {
            this.emitNamedEntity();
            this.index--;
            return;
        }
        this.trieCurrent = entityTrie[this.trieIndex];
        const masked = this.trieCurrent & BinTrieFlags.VALUE_LENGTH;
        // If the branch is a value, store it and continue
        if (masked) {
            // The mask is the number of bytes of the value, including the current byte.
            const valueLength = (masked >> 14) - 1;
            // If we have a legacy entity while parsing strictly, just skip the number of bytes
            if (!this.allowLegacyEntity() && c !== 59 /* CharCodes.Semi */) {
                this.trieIndex += valueLength;
            }
            else {
                // Add 1 as we have already incremented the excess
                const entityStart = this.index - this.entityExcess + 1;
                if (entityStart > this.sectionStart) {
                    this.emitPartial(this.sectionStart, entityStart);
                }
                // If this is a surrogate pair, consume the next two bytes
                this.entityResult = this.trieIndex;
                this.trieIndex += valueLength;
                this.entityExcess = 0;
                this.sectionStart = this.index + 1;
                if (valueLength === 0) {
                    this.emitNamedEntity();
                }
            }
        }
    }
    emitNamedEntity() {
        this.state = this.baseState;
        if (this.entityResult === 0) {
            return;
        }
        const valueLength = (entityTrie[this.entityResult] & BinTrieFlags.VALUE_LENGTH) >>
            14;
        switch (valueLength) {
            case 1:
                this.emitCodePoint(entityTrie[this.entityResult] &
                    ~BinTrieFlags.VALUE_LENGTH);
                break;
            case 2:
                this.emitCodePoint(entityTrie[this.entityResult + 1]);
                break;
            case 3: {
                const first = entityTrie[this.entityResult + 1];
                const second = entityTrie[this.entityResult + 2];
                // If this is a surrogate pair, combine the code points.
                if (first >= 0xd8_00 && first <= 0xdf_ff) {
                    this.emitCodePoint(
                    // http://mathiasbynens.be/notes/javascript-encoding#surrogate-formulae
                    (first - 0xd8_00) * 0x4_00 + second + 0x24_00);
                }
                else {
                    this.emitCodePoint(first);
                    this.emitCodePoint(second);
                }
            }
        }
    }
    stateBeforeNumericEntity(c) {
        if ((c | 0x20) === 120 /* CharCodes.LowerX */) {
            this.entityExcess++;
            this.state = 29 /* State.InHexEntity */;
        }
        else {
            this.state = 28 /* State.InNumericEntity */;
            this.stateInNumericEntity(c);
        }
    }
    emitNumericEntity(strict) {
        const entityStart = this.index - this.entityExcess - 1;
        const numberStart = entityStart + 2 + Number(this.state === 29 /* State.InHexEntity */);
        if (numberStart !== this.index) {
            // Emit leading data if any
            if (entityStart > this.sectionStart) {
                this.emitPartial(this.sectionStart, entityStart);
            }
            this.sectionStart = this.index + Number(strict);
            this.emitCodePoint(this.entityResult);
        }
        this.state = this.baseState;
    }
    stateInNumericEntity(c) {
        if (c === 59 /* CharCodes.Semi */) {
            this.emitNumericEntity(true);
        }
        else if (isNumber(c)) {
            this.entityResult = this.entityResult * 10 + (c - 48 /* CharCodes.Zero */);
            this.entityExcess++;
        }
        else {
            if (this.allowLegacyEntity()) {
                this.emitNumericEntity(false);
            }
            else {
                this.state = this.baseState;
            }
            this.index--;
        }
    }
    stateInHexEntity(c) {
        if (c === 59 /* CharCodes.Semi */) {
            this.emitNumericEntity(true);
        }
        else if (isNumber(c)) {
            this.entityResult = this.entityResult * 16 + (c - 48 /* CharCodes.Zero */);
            this.entityExcess++;
        }
        else if (isHexDigit(c)) {
            this.entityResult =
                this.entityResult * 16 + ((c | 0x20) - 97 /* CharCodes.LowerA */ + 10);
            this.entityExcess++;
        }
        else {
            if (this.allowLegacyEntity()) {
                this.emitNumericEntity(false);
            }
            else {
                this.state = this.baseState;
            }
            this.index--;
        }
    }
    allowLegacyEntity() {
        return this.baseState === 1 /* State.Text */ || this.baseState === 24 /* State.InSpecialTag */;
    }
    /**
     * Remove data that has already been consumed from the buffer.
     */
    cleanup() {
        // If we are inside of text or attributes, emit what we already have.
        if (this.running && this.sectionStart !== this.index) {
            if (this.state === 1 /* State.Text */ ||
                (this.state === 24 /* State.InSpecialTag */ && this.sequenceIndex === 0)) {
                this.cbs.ontext(this.sectionStart, this.index);
                this.sectionStart = this.index;
            }
            else if (this.state === 12 /* State.InAttributeValueDq */ ||
                this.state === 13 /* State.InAttributeValueSq */ ||
                this.state === 14 /* State.InAttributeValueNq */) {
                this.cbs.onattribdata(this.sectionStart, this.index);
                this.sectionStart = this.index;
            }
        }
    }
    shouldContinue() {
        return this.index < this.buffer.length + this.offset && this.running;
    }
    /**
     * Iterates through the buffer, calling the function corresponding to the current state.
     *
     * States that are more likely to be hit are higher up, as a performance improvement.
     */
    parse() {
        while (this.shouldContinue()) {
            const c = this.buffer.charCodeAt(this.index - this.offset);
            if (this.state === 1 /* State.Text */) {
                this.stateText(c);
            }
            else if (this.state === 23 /* State.SpecialStartSequence */) {
                this.stateSpecialStartSequence(c);
            }
            else if (this.state === 24 /* State.InSpecialTag */) {
                this.stateInSpecialTag(c);
            }
            else if (this.state === 19 /* State.CDATASequence */) {
                this.stateCDATASequence(c);
            }
            else if (this.state === 12 /* State.InAttributeValueDq */) {
                this.stateInAttributeValueDoubleQuotes(c);
            }
            else if (this.state === 9 /* State.InAttributeName */) {
                this.stateInAttributeName(c);
            }
            else if (this.state === 21 /* State.InCommentLike */) {
                this.stateInCommentLike(c);
            }
            else if (this.state === 20 /* State.InSpecialComment */) {
                this.stateInSpecialComment(c);
            }
            else if (this.state === 8 /* State.BeforeAttributeName */) {
                this.stateBeforeAttributeName(c);
            }
            else if (this.state === 3 /* State.InTagName */) {
                this.stateInTagName(c);
            }
            else if (this.state === 6 /* State.InClosingTagName */) {
                this.stateInClosingTagName(c);
            }
            else if (this.state === 2 /* State.BeforeTagName */) {
                this.stateBeforeTagName(c);
            }
            else if (this.state === 10 /* State.AfterAttributeName */) {
                this.stateAfterAttributeName(c);
            }
            else if (this.state === 13 /* State.InAttributeValueSq */) {
                this.stateInAttributeValueSingleQuotes(c);
            }
            else if (this.state === 11 /* State.BeforeAttributeValue */) {
                this.stateBeforeAttributeValue(c);
            }
            else if (this.state === 5 /* State.BeforeClosingTagName */) {
                this.stateBeforeClosingTagName(c);
            }
            else if (this.state === 7 /* State.AfterClosingTagName */) {
                this.stateAfterClosingTagName(c);
            }
            else if (this.state === 22 /* State.BeforeSpecialS */) {
                this.stateBeforeSpecialS(c);
            }
            else if (this.state === 14 /* State.InAttributeValueNq */) {
                this.stateInAttributeValueNoQuotes(c);
            }
            else if (this.state === 4 /* State.InSelfClosingTag */) {
                this.stateInSelfClosingTag(c);
            }
            else if (this.state === 16 /* State.InDeclaration */) {
                this.stateInDeclaration(c);
            }
            else if (this.state === 15 /* State.BeforeDeclaration */) {
                this.stateBeforeDeclaration(c);
            }
            else if (this.state === 18 /* State.BeforeComment */) {
                this.stateBeforeComment(c);
            }
            else if (this.state === 17 /* State.InProcessingInstruction */) {
                this.stateInProcessingInstruction(c);
            }
            else if (this.state === 27 /* State.InNamedEntity */) {
                this.stateInNamedEntity(c);
            }
            else if (this.state === 25 /* State.BeforeEntity */) {
                this.stateBeforeEntity(c);
            }
            else if (this.state === 29 /* State.InHexEntity */) {
                this.stateInHexEntity(c);
            }
            else if (this.state === 28 /* State.InNumericEntity */) {
                this.stateInNumericEntity(c);
            }
            else {
                // `this._state === State.BeforeNumericEntity`
                this.stateBeforeNumericEntity(c);
            }
            this.index++;
        }
        this.cleanup();
    }
    finish() {
        if (this.state === 27 /* State.InNamedEntity */) {
            this.emitNamedEntity();
        }
        // If there is remaining data, emit it in a reasonable way
        if (this.sectionStart < this.index) {
            this.handleTrailingData();
        }
        this.cbs.onend();
    }
    /** Handle any trailing data. */
    handleTrailingData() {
        const endIndex = this.buffer.length + this.offset;
        if (this.state === 21 /* State.InCommentLike */) {
            if (this.currentSequence === Sequences.CdataEnd) {
                this.cbs.oncdata(this.sectionStart, endIndex, 0);
            }
            else {
                this.cbs.oncomment(this.sectionStart, endIndex, 0);
            }
        }
        else if (this.state === 28 /* State.InNumericEntity */ &&
            this.allowLegacyEntity()) {
            this.emitNumericEntity(false);
            // All trailing data will have been consumed
        }
        else if (this.state === 29 /* State.InHexEntity */ &&
            this.allowLegacyEntity()) {
            this.emitNumericEntity(false);
            // All trailing data will have been consumed
        }
        else if (this.state === 3 /* State.InTagName */ ||
            this.state === 8 /* State.BeforeAttributeName */ ||
            this.state === 11 /* State.BeforeAttributeValue */ ||
            this.state === 10 /* State.AfterAttributeName */ ||
            this.state === 9 /* State.InAttributeName */ ||
            this.state === 13 /* State.InAttributeValueSq */ ||
            this.state === 12 /* State.InAttributeValueDq */ ||
            this.state === 14 /* State.InAttributeValueNq */ ||
            this.state === 6 /* State.InClosingTagName */) {
            /*
             * If we are currently in an opening or closing tag, us not calling the
             * respective callback signals that the tag should be ignored.
             */
        }
        else {
            this.cbs.ontext(this.sectionStart, endIndex);
        }
    }
    emitPartial(start, endIndex) {
        if (this.baseState !== 1 /* State.Text */ &&
            this.baseState !== 24 /* State.InSpecialTag */) {
            this.cbs.onattribdata(start, endIndex);
        }
        else {
            this.cbs.ontext(start, endIndex);
        }
    }
    emitCodePoint(cp) {
        if (this.baseState !== 1 /* State.Text */ &&
            this.baseState !== 24 /* State.InSpecialTag */) {
            this.cbs.onattribentity(cp);
        }
        else {
            this.cbs.ontextentity(cp);
        }
    }
}
const formTags = new Set([
    'input',
    'option',
    'optgroup',
    'select',
    'button',
    'datalist',
    'textarea',
]);
const pTag = new Set(['p']);
const tableSectionTags = new Set(['thead', 'tbody']);
const ddtTags = new Set(['dd', 'dt']);
const rtpTags = new Set(['rt', 'rp']);
const openImpliesClose = new Map([
    ['tr', new Set(['tr', 'th', 'td'])],
    ['th', new Set(['th'])],
    ['td', new Set(['thead', 'th', 'td'])],
    ['body', new Set(['head', 'link', 'script'])],
    ['li', new Set(['li'])],
    ['p', pTag],
    ['h1', pTag],
    ['h2', pTag],
    ['h3', pTag],
    ['h4', pTag],
    ['h5', pTag],
    ['h6', pTag],
    ['select', formTags],
    ['input', formTags],
    ['output', formTags],
    ['button', formTags],
    ['datalist', formTags],
    ['textarea', formTags],
    ['option', new Set(['option'])],
    ['optgroup', new Set(['optgroup', 'option'])],
    ['dd', ddtTags],
    ['dt', ddtTags],
    ['address', pTag],
    ['article', pTag],
    ['aside', pTag],
    ['blockquote', pTag],
    ['details', pTag],
    ['div', pTag],
    ['dl', pTag],
    ['fieldset', pTag],
    ['figcaption', pTag],
    ['figure', pTag],
    ['footer', pTag],
    ['form', pTag],
    ['header', pTag],
    ['hr', pTag],
    ['main', pTag],
    ['nav', pTag],
    ['ol', pTag],
    ['pre', pTag],
    ['section', pTag],
    ['table', pTag],
    ['ul', pTag],
    ['rt', rtpTags],
    ['rp', rtpTags],
    ['tbody', tableSectionTags],
    ['tfoot', tableSectionTags],
]);
const voidElements = new Set([
    'area',
    'base',
    'basefont',
    'br',
    'col',
    'command',
    'embed',
    'frame',
    'hr',
    'img',
    'input',
    'isindex',
    'keygen',
    'link',
    'meta',
    'param',
    'source',
    'track',
    'wbr',
]);
const foreignContextElements = new Set(['math', 'svg']);
const htmlIntegrationElements = new Set([
    'mi',
    'mo',
    'mn',
    'ms',
    'mtext',
    'annotation-xml',
    'foreignobject',
    'desc',
    'title',
]);
const reNameEnd = /\s|\//;
export class Parser {
    /** The start index of the last event. */
    startIndex = 0;
    /** The end index of the last event. */
    endIndex = 0;
    /**
     * Store the start index of the current open tag,
     * so we can update the start index for attributes.
     */
    openTagStart = 0;
    tagname = '';
    attribname = '';
    attribvalue = '';
    attribs = null;
    stack = [];
    foreignContext = [];
    cbs;
    tokenizer;
    buffers = [];
    bufferOffset = 0;
    /** The index of the last written buffer. Used when resuming after a `pause()`. */
    writeIndex = 0;
    /** Indicates whether the parser has finished running / `.end` has been called. */
    ended = false;
    constructor(cbs, options = {}) {
        this.cbs = cbs ?? {};
        this.tokenizer = new (options.Tokenizer ?? Tokenizer)(this);
        this.cbs.onparserinit?.(this);
    }
    // Tokenizer event handlers
    /** @internal */
    ontext(start, endIndex) {
        const data = this.getSlice(start, endIndex);
        this.endIndex = endIndex - 1;
        this.cbs.ontext?.(data);
        this.startIndex = endIndex;
    }
    /** @internal */
    ontextentity(cp) {
        /*
         * Entities can be emitted on the character, or directly after.
         * We use the section start here to get accurate indices.
         */
        const idx = this.tokenizer.getSectionStart();
        this.endIndex = idx - 1;
        this.cbs.ontext?.(String.fromCodePoint(replaceCodePoint(cp)));
        this.startIndex = idx;
    }
    isVoidElement(name) {
        return voidElements.has(name);
    }
    /** @internal */
    onopentagname(start, endIndex) {
        this.endIndex = endIndex;
        const name = this.getSlice(start, endIndex).toLowerCase();
        this.emitOpenTag(name);
    }
    emitOpenTag(name) {
        this.openTagStart = this.startIndex;
        this.tagname = name;
        const impliesClose = openImpliesClose.get(name);
        if (impliesClose) {
            while (this.stack.length > 0 &&
                impliesClose.has(this.stack[this.stack.length - 1])) {
                const el = this.stack.pop();
                this.cbs.onclosetag?.(el, true);
            }
        }
        if (!this.isVoidElement(name)) {
            this.stack.push(name);
            if (foreignContextElements.has(name)) {
                this.foreignContext.push(true);
            }
            else if (htmlIntegrationElements.has(name)) {
                this.foreignContext.push(false);
            }
        }
        this.cbs.onopentagname?.(name);
        if (this.cbs.onopentag)
            this.attribs = {};
    }
    endOpenTag(isImplied) {
        this.startIndex = this.openTagStart;
        if (this.attribs) {
            this.cbs.onopentag?.(this.tagname, this.attribs, isImplied);
            this.attribs = null;
        }
        if (this.cbs.onclosetag && this.isVoidElement(this.tagname)) {
            this.cbs.onclosetag(this.tagname, true);
        }
        this.tagname = '';
    }
    /** @internal */
    onopentagend(endIndex) {
        this.endIndex = endIndex;
        this.endOpenTag(false);
        // Set `startIndex` for next node
        this.startIndex = endIndex + 1;
    }
    /** @internal */
    onclosetag(start, endIndex) {
        this.endIndex = endIndex;
        const name = this.getSlice(start, endIndex).toLowerCase();
        if (foreignContextElements.has(name) ||
            htmlIntegrationElements.has(name)) {
            this.foreignContext.pop();
        }
        if (!this.isVoidElement(name)) {
            const pos = this.stack.lastIndexOf(name);
            if (pos !== -1) {
                if (this.cbs.onclosetag) {
                    let count = this.stack.length - pos;
                    while (count--) {
                        // We know the stack has sufficient elements.
                        this.cbs.onclosetag(this.stack.pop(), count !== 0);
                    }
                }
                else
                    this.stack.length = pos;
            }
            else if (name === 'p') {
                // Implicit open before close
                this.emitOpenTag('p');
                this.closeCurrentTag(true);
            }
        }
        else if (name === 'br') {
            // We can't use `emitOpenTag` for implicit open, as `br` would be implicitly closed.
            this.cbs.onopentagname?.('br');
            this.cbs.onopentag?.('br', {}, true);
            this.cbs.onclosetag?.('br', false);
        }
        // Set `startIndex` for next node
        this.startIndex = endIndex + 1;
    }
    /** @internal */
    onselfclosingtag(endIndex) {
        this.endIndex = endIndex;
        if (this.foreignContext[this.foreignContext.length - 1]) {
            this.closeCurrentTag(false);
            // Set `startIndex` for next node
            this.startIndex = endIndex + 1;
        }
        else {
            // Ignore the fact that the tag is self-closing.
            this.onopentagend(endIndex);
        }
    }
    closeCurrentTag(isOpenImplied) {
        const name = this.tagname;
        this.endOpenTag(isOpenImplied);
        // Self-closing tags will be on the top of the stack
        if (this.stack[this.stack.length - 1] === name) {
            // If the opening tag isn't implied, the closing tag has to be implied.
            this.cbs.onclosetag?.(name, !isOpenImplied);
            this.stack.pop();
        }
    }
    /** @internal */
    onattribname(start, endIndex) {
        this.startIndex = start;
        const name = this.getSlice(start, endIndex);
        this.attribname = name.toLowerCase();
    }
    /** @internal */
    onattribdata(start, endIndex) {
        this.attribvalue += this.getSlice(start, endIndex);
    }
    /** @internal */
    onattribentity(cp) {
        this.attribvalue += String.fromCodePoint(replaceCodePoint(cp));
    }
    /** @internal */
    onattribend(quote, endIndex) {
        this.endIndex = endIndex;
        this.cbs.onattribute?.(this.attribname, this.attribvalue, quote === QuoteType.Double
            ? '"'
            : quote === QuoteType.Single
                ? '\''
                : quote === QuoteType.NoValue
                    ? undefined
                    : null);
        if (this.attribs &&
            !Object.prototype.hasOwnProperty.call(this.attribs, this.attribname)) {
            this.attribs[this.attribname] = this.attribvalue;
        }
        this.attribname = '';
        this.attribvalue = '';
    }
    getInstructionName(value) {
        const idx = value.search(reNameEnd);
        let name = idx < 0 ? value : value.substr(0, idx);
        return name.toLowerCase();
    }
    /** @internal */
    ondeclaration(start, endIndex) {
        this.endIndex = endIndex;
        const value = this.getSlice(start, endIndex);
        if (this.cbs.onprocessinginstruction) {
            const name = this.getInstructionName(value);
            this.cbs.onprocessinginstruction(`!${name}`, `!${value}`);
        }
        // Set `startIndex` for next node
        this.startIndex = endIndex + 1;
    }
    /** @internal */
    onprocessinginstruction(start, endIndex) {
        this.endIndex = endIndex;
        const value = this.getSlice(start, endIndex);
        if (this.cbs.onprocessinginstruction) {
            const name = this.getInstructionName(value);
            this.cbs.onprocessinginstruction(`?${name}`, `?${value}`);
        }
        // Set `startIndex` for next node
        this.startIndex = endIndex + 1;
    }
    /** @internal */
    oncomment(start, endIndex, offset) {
        this.endIndex = endIndex;
        this.cbs.oncomment?.(this.getSlice(start, endIndex - offset));
        this.cbs.oncommentend?.();
        // Set `startIndex` for next node
        this.startIndex = endIndex + 1;
    }
    /** @internal */
    oncdata(start, endIndex, offset) {
        this.endIndex = endIndex;
        const value = this.getSlice(start, endIndex - offset);
        this.cbs.oncomment?.(`[CDATA[${value}]]`);
        this.cbs.oncommentend?.();
        // Set `startIndex` for next node
        this.startIndex = endIndex + 1;
    }
    /** @internal */
    onend() {
        if (this.cbs.onclosetag) {
            // Set the end index for all remaining tags
            this.endIndex = this.startIndex;
            for (let i = this.stack.length; i > 0; this.cbs.onclosetag(this.stack[--i], true))
                ;
        }
        this.cbs.onend?.();
    }
    /**
     * Resets the parser to a blank state, ready to parse a new HTML document
     */
    reset() {
        this.cbs.onreset?.();
        this.tokenizer.reset();
        this.tagname = '';
        this.attribname = '';
        this.attribs = null;
        this.stack.length = 0;
        this.startIndex = 0;
        this.endIndex = 0;
        this.cbs.onparserinit?.(this);
        this.buffers.length = 0;
        this.bufferOffset = 0;
        this.writeIndex = 0;
        this.ended = false;
    }
    /**
     * Resets the parser, then parses a complete document and
     * pushes it to the handler.
     *
     * @param data Document to parse.
     */
    parseComplete(data) {
        this.reset();
        this.end(data);
    }
    getSlice(start, end) {
        while (start - this.bufferOffset >= this.buffers[0].length) {
            this.shiftBuffer();
        }
        let str = this.buffers[0].slice(start - this.bufferOffset, end - this.bufferOffset);
        while (end - this.bufferOffset > this.buffers[0].length) {
            this.shiftBuffer();
            str += this.buffers[0].slice(0, end - this.bufferOffset);
        }
        return str;
    }
    shiftBuffer() {
        this.bufferOffset += this.buffers[0].length;
        this.writeIndex--;
        this.buffers.shift();
    }
    /**
     * Parses a chunk of data and calls the corresponding callbacks.
     *
     * @param chunk Chunk to parse.
     */
    write(chunk) {
        if (this.ended) {
            this.cbs.onerror?.(new Error('.write() after done!'));
            return;
        }
        this.buffers.push(chunk);
        if (this.tokenizer.running) {
            this.tokenizer.write(chunk);
            this.writeIndex++;
        }
    }
    /**
     * Parses the end of the buffer and clears the stack, calls onend.
     *
     * @param chunk Optional final chunk to parse.
     */
    end(chunk) {
        if (this.ended) {
            this.cbs.onerror?.(Error('.end() after done!'));
            return;
        }
        if (chunk)
            this.write(chunk);
        this.ended = true;
        this.tokenizer.end();
    }
    /**
     * Pauses parsing. The parser won't emit events until `resume` is called.
     */
    pause() {
        this.tokenizer.pause();
    }
    /**
     * Resumes parsing after `pause` was called.
     */
    resume() {
        this.tokenizer.resume();
        while (this.tokenizer.running &&
            this.writeIndex < this.buffers.length) {
            this.tokenizer.write(this.buffers[this.writeIndex++]);
        }
        if (this.ended)
            this.tokenizer.end();
    }
}

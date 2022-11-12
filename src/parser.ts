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

import {TextNode, HTMLElement} from './dom.js';
import {parse as StyleParser} from './css.js';
import {createComputedStyle, uaDeclaredStyles} from './cascade.js';
import {id} from './util.js';
import {
  htmlDecodeTree,
  xmlDecodeTree,
  BinTrieFlags,
  determineBranch,
  decodeCodePoint
} from 'entities/lib/decode.js';

const enum CharCodes {
  Tab = 0x9, // "\t"
  NewLine = 0xa, // "\n"
  FormFeed = 0xc, // "\f"
  CarriageReturn = 0xd, // "\r"
  Space = 0x20, // " "
  ExclamationMark = 0x21, // "!"
  Num = 0x23, // "#"
  Amp = 0x26, // "&"
  SingleQuote = 0x27, // "'"
  DoubleQuote = 0x22, // '"'
  Dash = 0x2d, // "-"
  Slash = 0x2f, // "/"
  Zero = 0x30, // "0"
  Nine = 0x39, // "9"
  Semi = 0x3b, // ";"
  Lt = 0x3c, // "<"
  Eq = 0x3d, // "="
  Gt = 0x3e, // ">"
  Questionmark = 0x3f, // "?"
  UpperA = 0x41, // "A"
  LowerA = 0x61, // "a"
  UpperF = 0x46, // "F"
  LowerF = 0x66, // "f"
  UpperZ = 0x5a, // "Z"
  LowerZ = 0x7a, // "z"
  LowerX = 0x78, // "x"
  OpeningSquareBracket = 0x5b, // "["
}

/** All the states the tokenizer can be in. */
const enum State {
  Text = 1,
  BeforeTagName, // After <
  InTagName,
  InSelfClosingTag,
  BeforeClosingTagName,
  InClosingTagName,
  AfterClosingTagName,

  // Attributes
  BeforeAttributeName,
  InAttributeName,
  AfterAttributeName,
  BeforeAttributeValue,
  InAttributeValueDq, // "
  InAttributeValueSq, // '
  InAttributeValueNq,

  // Declarations
  BeforeDeclaration, // !
  InDeclaration,

  // Processing instructions
  InProcessingInstruction, // ?

  // Comments & CDATA
  BeforeComment,
  CDATASequence,
  InSpecialComment,
  InCommentLike,

  // Special tags
  BeforeSpecialS, // Decide if we deal with `<script` or `<style`
  SpecialStartSequence,
  InSpecialTag,

  BeforeEntity, // &
  BeforeNumericEntity, // #
  InNamedEntity,
  InNumericEntity,
  InHexEntity, // X
}

function isWhitespace(c: number): boolean {
  return (
    c === CharCodes.Space ||
    c === CharCodes.NewLine ||
    c === CharCodes.Tab ||
    c === CharCodes.FormFeed ||
    c === CharCodes.CarriageReturn
  );
}

function isEndOfTagSection(c: number): boolean {
  return c === CharCodes.Slash || c === CharCodes.Gt || isWhitespace(c);
}

function isNumber(c: number): boolean {
  return c >= CharCodes.Zero && c <= CharCodes.Nine;
}

function isASCIIAlpha(c: number): boolean {
  return (
    (c >= CharCodes.LowerA && c <= CharCodes.LowerZ) ||
    (c >= CharCodes.UpperA && c <= CharCodes.UpperZ)
  );
}

function isHexDigit(c: number): boolean {
  return (
    (c >= CharCodes.UpperA && c <= CharCodes.UpperF) ||
    (c >= CharCodes.LowerA && c <= CharCodes.LowerF)
  );
}

enum QuoteType {
  NoValue = 0,
  Unquoted = 1,
  Single = 2,
  Double = 3,
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

/**
 * Sequences used to match longer strings.
 *
 * We don't have `Script`, `Style`, or `Title` here. Instead, we re-use the *End
 * sequences with an increased offset.
 */
const Sequences = {
  Cdata: new Uint8Array([0x43, 0x44, 0x41, 0x54, 0x41, 0x5b]), // CDATA[
  CdataEnd: new Uint8Array([0x5d, 0x5d, 0x3e]), // ]]>
  CommentEnd: new Uint8Array([0x2d, 0x2d, 0x3e]), // `-->`
  ScriptEnd: new Uint8Array([0x3c, 0x2f, 0x73, 0x63, 0x72, 0x69, 0x70, 0x74]), // `</script`
  StyleEnd: new Uint8Array([0x3c, 0x2f, 0x73, 0x74, 0x79, 0x6c, 0x65]), // `</style`
  TitleEnd: new Uint8Array([0x3c, 0x2f, 0x74, 0x69, 0x74, 0x6c, 0x65]), // `</title`
};

class Tokenizer {
  /** The current state the tokenizer is in. */
  private state = State.Text;
  /** The read buffer. */
  private buffer = '';
  /** The beginning of the section that is currently being read. */
  private sectionStart = 0;
  /** The index within the buffer that we are currently looking at. */
  private index = 0;
  /** Some behavior, eg. when decoding entities, is done while we are in another state. This keeps track of the other state type. */
  private baseState = State.Text;
  /** For special parsing behavior inside of script and style tags. */
  private isSpecial = false;
  /** Indicates whether the tokenizer has been paused. */
  public running = true;
  /** The offset of the current buffer. */
  private offset = 0;

  private readonly xmlMode: boolean;
  private readonly decodeEntities: boolean;
  private readonly entityTrie: Uint16Array;

  constructor(
    {
      xmlMode = false,
      decodeEntities = true,
    }: { xmlMode?: boolean; decodeEntities?: boolean },
    private readonly cbs: Callbacks
  ) {
    this.xmlMode = xmlMode;
    this.decodeEntities = decodeEntities;
    this.entityTrie = xmlMode ? xmlDecodeTree : htmlDecodeTree;
  }

  public reset(): void {
    this.state = State.Text;
    this.buffer = '';
    this.sectionStart = 0;
    this.index = 0;
    this.baseState = State.Text;
    this.currentSequence = undefined!;
    this.running = true;
    this.offset = 0;
  }

  public write(chunk: string): void {
    this.offset += this.buffer.length;
    this.buffer = chunk;
    this.parse();
  }

  public end(): void {
    if (this.running) this.finish();
  }

  public pause(): void {
    this.running = false;
  }

  public resume(): void {
    this.running = true;
    if (this.index < this.buffer.length + this.offset) {
      this.parse();
    }
  }

  /**
   * The current index within all of the written data.
   */
  public getIndex(): number {
    return this.index;
  }

  /**
   * The start of the current section.
   */
  public getSectionStart(): number {
    return this.sectionStart;
  }

  private stateText(c: number): void {
    if (
      c === CharCodes.Lt ||
      (!this.decodeEntities && this.fastForwardTo(CharCodes.Lt))
    ) {
      if (this.index > this.sectionStart) {
        this.cbs.ontext(this.sectionStart, this.index);
      }
      this.state = State.BeforeTagName;
      this.sectionStart = this.index;
    } else if (this.decodeEntities && c === CharCodes.Amp) {
      this.state = State.BeforeEntity;
    }
  }

  private currentSequence!: Uint8Array;
  private sequenceIndex = 0;
  private stateSpecialStartSequence(c: number): void {
    const isEnd = this.sequenceIndex === this.currentSequence.length;
    const isMatch = isEnd
      ? // If we are at the end of the sequence, make sure the tag name has ended
      isEndOfTagSection(c)
      : // Otherwise, do a case-insensitive comparison
      (c | 0x20) === this.currentSequence[this.sequenceIndex];

    if (!isMatch) {
      this.isSpecial = false;
    } else if (!isEnd) {
      this.sequenceIndex++;
      return;
    }

    this.sequenceIndex = 0;
    this.state = State.InTagName;
    this.stateInTagName(c);
  }

  /** Look for an end tag. For <title> tags, also decode entities. */
  private stateInSpecialTag(c: number): void {
    if (this.sequenceIndex === this.currentSequence.length) {
      if (c === CharCodes.Gt || isWhitespace(c)) {
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
    } else if (this.sequenceIndex === 0) {
      if (this.currentSequence === Sequences.TitleEnd) {
        // We have to parse entities in <title> tags.
        if (this.decodeEntities && c === CharCodes.Amp) {
          this.state = State.BeforeEntity;
        }
      } else if (this.fastForwardTo(CharCodes.Lt)) {
        // Outside of <title> tags, we can fast-forward.
        this.sequenceIndex = 1;
      }
    } else {
      // If we see a `<`, set the sequence index to 1; useful for eg. `<</script>`.
      this.sequenceIndex = Number(c === CharCodes.Lt);
    }
  }

  private stateCDATASequence(c: number): void {
    if (c === Sequences.Cdata[this.sequenceIndex]) {
      if (++this.sequenceIndex === Sequences.Cdata.length) {
        this.state = State.InCommentLike;
        this.currentSequence = Sequences.CdataEnd;
        this.sequenceIndex = 0;
        this.sectionStart = this.index + 1;
      }
    } else {
      this.sequenceIndex = 0;
      this.state = State.InDeclaration;
      this.stateInDeclaration(c); // Reconsume the character
    }
  }

  /**
   * When we wait for one specific character, we can speed things up
   * by skipping through the buffer until we find it.
   *
   * @returns Whether the character was found.
   */
  private fastForwardTo(c: number): boolean {
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
  private stateInCommentLike(c: number): void {
    if (c === this.currentSequence[this.sequenceIndex]) {
      if (++this.sequenceIndex === this.currentSequence.length) {
        if (this.currentSequence === Sequences.CdataEnd) {
          this.cbs.oncdata(this.sectionStart, this.index, 2);
        } else {
          this.cbs.oncomment(this.sectionStart, this.index, 2);
        }

        this.sequenceIndex = 0;
        this.sectionStart = this.index + 1;
        this.state = State.Text;
      }
    } else if (this.sequenceIndex === 0) {
      // Fast-forward to the first character of the sequence
      if (this.fastForwardTo(this.currentSequence[0])) {
        this.sequenceIndex = 1;
      }
    } else if (c !== this.currentSequence[this.sequenceIndex - 1]) {
      // Allow long sequences, eg. --->, ]]]>
      this.sequenceIndex = 0;
    }
  }

  /**
   * HTML only allows ASCII alpha characters (a-z and A-Z) at the beginning of a tag name.
   *
   * XML allows a lot more characters here (@see https://www.w3.org/TR/REC-xml/#NT-NameStartChar).
   * We allow anything that wouldn't end the tag.
   */
  private isTagStartChar(c: number) {
    return this.xmlMode ? !isEndOfTagSection(c) : isASCIIAlpha(c);
  }

  private startSpecial(sequence: Uint8Array, offset: number) {
    this.isSpecial = true;
    this.currentSequence = sequence;
    this.sequenceIndex = offset;
    this.state = State.SpecialStartSequence;
  }

  private stateBeforeTagName(c: number): void {
    if (c === CharCodes.ExclamationMark) {
      this.state = State.BeforeDeclaration;
      this.sectionStart = this.index + 1;
    } else if (c === CharCodes.Questionmark) {
      this.state = State.InProcessingInstruction;
      this.sectionStart = this.index + 1;
    } else if (this.isTagStartChar(c)) {
      const lower = c | 0x20;
      this.sectionStart = this.index;
      if (!this.xmlMode && lower === Sequences.TitleEnd[2]) {
        this.startSpecial(Sequences.TitleEnd, 3);
      } else {
        this.state =
          !this.xmlMode && lower === Sequences.ScriptEnd[2]
            ? State.BeforeSpecialS
            : State.InTagName;
      }
    } else if (c === CharCodes.Slash) {
      this.state = State.BeforeClosingTagName;
    } else {
      this.state = State.Text;
      this.stateText(c);
    }
  }
  private stateInTagName(c: number): void {
    if (isEndOfTagSection(c)) {
      this.cbs.onopentagname(this.sectionStart, this.index);
      this.sectionStart = -1;
      this.state = State.BeforeAttributeName;
      this.stateBeforeAttributeName(c);
    }
  }
  private stateBeforeClosingTagName(c: number): void {
    if (isWhitespace(c)) {
      // Ignore
    } else if (c === CharCodes.Gt) {
      this.state = State.Text;
    } else {
      this.state = this.isTagStartChar(c)
        ? State.InClosingTagName
        : State.InSpecialComment;
      this.sectionStart = this.index;
    }
  }
  private stateInClosingTagName(c: number): void {
    if (c === CharCodes.Gt || isWhitespace(c)) {
      this.cbs.onclosetag(this.sectionStart, this.index);
      this.sectionStart = -1;
      this.state = State.AfterClosingTagName;
      this.stateAfterClosingTagName(c);
    }
  }
  private stateAfterClosingTagName(c: number): void {
    // Skip everything until ">"
    if (c === CharCodes.Gt || this.fastForwardTo(CharCodes.Gt)) {
      this.state = State.Text;
      this.sectionStart = this.index + 1;
    }
  }
  private stateBeforeAttributeName(c: number): void {
    if (c === CharCodes.Gt) {
      this.cbs.onopentagend(this.index);
      if (this.isSpecial) {
        this.state = State.InSpecialTag;
        this.sequenceIndex = 0;
      } else {
        this.state = State.Text;
      }
      this.baseState = this.state;
      this.sectionStart = this.index + 1;
    } else if (c === CharCodes.Slash) {
      this.state = State.InSelfClosingTag;
    } else if (!isWhitespace(c)) {
      this.state = State.InAttributeName;
      this.sectionStart = this.index;
    }
  }
  private stateInSelfClosingTag(c: number): void {
    if (c === CharCodes.Gt) {
      this.cbs.onselfclosingtag(this.index);
      this.state = State.Text;
      this.baseState = State.Text;
      this.sectionStart = this.index + 1;
      this.isSpecial = false; // Reset special state, in case of self-closing special tags
    } else if (!isWhitespace(c)) {
      this.state = State.BeforeAttributeName;
      this.stateBeforeAttributeName(c);
    }
  }
  private stateInAttributeName(c: number): void {
    if (c === CharCodes.Eq || isEndOfTagSection(c)) {
      this.cbs.onattribname(this.sectionStart, this.index);
      this.sectionStart = -1;
      this.state = State.AfterAttributeName;
      this.stateAfterAttributeName(c);
    }
  }
  private stateAfterAttributeName(c: number): void {
    if (c === CharCodes.Eq) {
      this.state = State.BeforeAttributeValue;
    } else if (c === CharCodes.Slash || c === CharCodes.Gt) {
      this.cbs.onattribend(QuoteType.NoValue, this.index);
      this.state = State.BeforeAttributeName;
      this.stateBeforeAttributeName(c);
    } else if (!isWhitespace(c)) {
      this.cbs.onattribend(QuoteType.NoValue, this.index);
      this.state = State.InAttributeName;
      this.sectionStart = this.index;
    }
  }
  private stateBeforeAttributeValue(c: number): void {
    if (c === CharCodes.DoubleQuote) {
      this.state = State.InAttributeValueDq;
      this.sectionStart = this.index + 1;
    } else if (c === CharCodes.SingleQuote) {
      this.state = State.InAttributeValueSq;
      this.sectionStart = this.index + 1;
    } else if (!isWhitespace(c)) {
      this.sectionStart = this.index;
      this.state = State.InAttributeValueNq;
      this.stateInAttributeValueNoQuotes(c); // Reconsume token
    }
  }
  private handleInAttributeValue(c: number, quote: number) {
    if (
      c === quote ||
      (!this.decodeEntities && this.fastForwardTo(quote))
    ) {
      this.cbs.onattribdata(this.sectionStart, this.index);
      this.sectionStart = -1;
      this.cbs.onattribend(
        quote === CharCodes.DoubleQuote
          ? QuoteType.Double
          : QuoteType.Single,
        this.index
      );
      this.state = State.BeforeAttributeName;
    } else if (this.decodeEntities && c === CharCodes.Amp) {
      this.baseState = this.state;
      this.state = State.BeforeEntity;
    }
  }
  private stateInAttributeValueDoubleQuotes(c: number): void {
    this.handleInAttributeValue(c, CharCodes.DoubleQuote);
  }
  private stateInAttributeValueSingleQuotes(c: number): void {
    this.handleInAttributeValue(c, CharCodes.SingleQuote);
  }
  private stateInAttributeValueNoQuotes(c: number): void {
    if (isWhitespace(c) || c === CharCodes.Gt) {
      this.cbs.onattribdata(this.sectionStart, this.index);
      this.sectionStart = -1;
      this.cbs.onattribend(QuoteType.Unquoted, this.index);
      this.state = State.BeforeAttributeName;
      this.stateBeforeAttributeName(c);
    } else if (this.decodeEntities && c === CharCodes.Amp) {
      this.baseState = this.state;
      this.state = State.BeforeEntity;
    }
  }
  private stateBeforeDeclaration(c: number): void {
    if (c === CharCodes.OpeningSquareBracket) {
      this.state = State.CDATASequence;
      this.sequenceIndex = 0;
    } else {
      this.state =
        c === CharCodes.Dash
          ? State.BeforeComment
          : State.InDeclaration;
    }
  }
  private stateInDeclaration(c: number): void {
    if (c === CharCodes.Gt || this.fastForwardTo(CharCodes.Gt)) {
      this.cbs.ondeclaration(this.sectionStart, this.index);
      this.state = State.Text;
      this.sectionStart = this.index + 1;
    }
  }
  private stateInProcessingInstruction(c: number): void {
    if (c === CharCodes.Gt || this.fastForwardTo(CharCodes.Gt)) {
      this.cbs.onprocessinginstruction(this.sectionStart, this.index);
      this.state = State.Text;
      this.sectionStart = this.index + 1;
    }
  }
  private stateBeforeComment(c: number): void {
    if (c === CharCodes.Dash) {
      this.state = State.InCommentLike;
      this.currentSequence = Sequences.CommentEnd;
      // Allow short comments (eg. <!-->)
      this.sequenceIndex = 2;
      this.sectionStart = this.index + 1;
    } else {
      this.state = State.InDeclaration;
    }
  }
  private stateInSpecialComment(c: number): void {
    if (c === CharCodes.Gt || this.fastForwardTo(CharCodes.Gt)) {
      this.cbs.oncomment(this.sectionStart, this.index, 0);
      this.state = State.Text;
      this.sectionStart = this.index + 1;
    }
  }
  private stateBeforeSpecialS(c: number): void {
    const lower = c | 0x20;
    if (lower === Sequences.ScriptEnd[3]) {
      this.startSpecial(Sequences.ScriptEnd, 4);
    } else if (lower === Sequences.StyleEnd[3]) {
      this.startSpecial(Sequences.StyleEnd, 4);
    } else {
      this.state = State.InTagName;
      this.stateInTagName(c); // Consume the token again
    }
  }

  private trieIndex = 0;
  private trieCurrent = 0;
  /** For named entities, the index of the value. For numeric entities, the code point. */
  private entityResult = 0;
  private entityExcess = 0;

  private stateBeforeEntity(c: number): void {
    // Start excess with 1 to include the '&'
    this.entityExcess = 1;
    this.entityResult = 0;

    if (c === CharCodes.Num) {
      this.state = State.BeforeNumericEntity;
    } else if (c === CharCodes.Amp) {
      // We have two `&` characters in a row. Stay in the current state.
    } else {
      this.trieIndex = 0;
      this.trieCurrent = this.entityTrie[0];
      this.state = State.InNamedEntity;
      this.stateInNamedEntity(c);
    }
  }

  private stateInNamedEntity(c: number): void {
    this.entityExcess += 1;

    this.trieIndex = determineBranch(
      this.entityTrie,
      this.trieCurrent,
      this.trieIndex + 1,
      c
    );

    if (this.trieIndex < 0) {
      this.emitNamedEntity();
      this.index--;
      return;
    }

    this.trieCurrent = this.entityTrie[this.trieIndex];

    const masked = this.trieCurrent & BinTrieFlags.VALUE_LENGTH;

    // If the branch is a value, store it and continue
    if (masked) {
      // The mask is the number of bytes of the value, including the current byte.
      const valueLength = (masked >> 14) - 1;

      // If we have a legacy entity while parsing strictly, just skip the number of bytes
      if (!this.allowLegacyEntity() && c !== CharCodes.Semi) {
        this.trieIndex += valueLength;
      } else {
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

  private emitNamedEntity(): void {
    this.state = this.baseState;

    if (this.entityResult === 0) {
      return;
    }

    const valueLength =
      (this.entityTrie[this.entityResult] & BinTrieFlags.VALUE_LENGTH) >>
    14;

    switch (valueLength) {
      case 1:
        this.emitCodePoint(
          this.entityTrie[this.entityResult] &
            ~BinTrieFlags.VALUE_LENGTH
      );
      break;
      case 2:
        this.emitCodePoint(this.entityTrie[this.entityResult + 1]);
      break;
      case 3: {
        const first = this.entityTrie[this.entityResult + 1];
        const second = this.entityTrie[this.entityResult + 2];

        // If this is a surrogate pair, combine the code points.
        if (first >= 0xd8_00 && first <= 0xdf_ff) {
          this.emitCodePoint(
            // http://mathiasbynens.be/notes/javascript-encoding#surrogate-formulae
            (first - 0xd8_00) * 0x4_00 + second + 0x24_00
          );
        } else {
          this.emitCodePoint(first);
          this.emitCodePoint(second);
        }
      }
    }
  }

  private stateBeforeNumericEntity(c: number): void {
    if ((c | 0x20) === CharCodes.LowerX) {
      this.entityExcess++;
      this.state = State.InHexEntity;
    } else {
      this.state = State.InNumericEntity;
      this.stateInNumericEntity(c);
    }
  }

  private emitNumericEntity(strict: boolean) {
    const entityStart = this.index - this.entityExcess - 1;
    const numberStart =
      entityStart + 2 + Number(this.state === State.InHexEntity);

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
  private stateInNumericEntity(c: number): void {
    if (c === CharCodes.Semi) {
      this.emitNumericEntity(true);
    } else if (isNumber(c)) {
      this.entityResult = this.entityResult * 10 + (c - CharCodes.Zero);
      this.entityExcess++;
    } else {
      if (this.allowLegacyEntity()) {
        this.emitNumericEntity(false);
      } else {
        this.state = this.baseState;
      }
      this.index--;
    }
  }
  private stateInHexEntity(c: number): void {
    if (c === CharCodes.Semi) {
      this.emitNumericEntity(true);
    } else if (isNumber(c)) {
      this.entityResult = this.entityResult * 16 + (c - CharCodes.Zero);
      this.entityExcess++;
    } else if (isHexDigit(c)) {
      this.entityResult =
        this.entityResult * 16 + ((c | 0x20) - CharCodes.LowerA + 10);
      this.entityExcess++;
    } else {
      if (this.allowLegacyEntity()) {
        this.emitNumericEntity(false);
      } else {
        this.state = this.baseState;
      }
      this.index--;
    }
  }

  private allowLegacyEntity() {
    return (
      !this.xmlMode &&
            (this.baseState === State.Text ||
                this.baseState === State.InSpecialTag)
    );
  }

  /**
   * Remove data that has already been consumed from the buffer.
   */
  private cleanup() {
    // If we are inside of text or attributes, emit what we already have.
    if (this.running && this.sectionStart !== this.index) {
      if (
        this.state === State.Text ||
        (this.state === State.InSpecialTag && this.sequenceIndex === 0)
      ) {
        this.cbs.ontext(this.sectionStart, this.index);
        this.sectionStart = this.index;
      } else if (
        this.state === State.InAttributeValueDq ||
        this.state === State.InAttributeValueSq ||
        this.state === State.InAttributeValueNq
      ) {
        this.cbs.onattribdata(this.sectionStart, this.index);
        this.sectionStart = this.index;
      }
    }
  }

  private shouldContinue() {
    return this.index < this.buffer.length + this.offset && this.running;
  }

  /**
     * Iterates through the buffer, calling the function corresponding to the current state.
     *
     * States that are more likely to be hit are higher up, as a performance improvement.
     */
  private parse() {
    while (this.shouldContinue()) {
      const c = this.buffer.charCodeAt(this.index - this.offset);
      if (this.state === State.Text) {
        this.stateText(c);
      } else if (this.state === State.SpecialStartSequence) {
        this.stateSpecialStartSequence(c);
      } else if (this.state === State.InSpecialTag) {
        this.stateInSpecialTag(c);
      } else if (this.state === State.CDATASequence) {
        this.stateCDATASequence(c);
      } else if (this.state === State.InAttributeValueDq) {
        this.stateInAttributeValueDoubleQuotes(c);
      } else if (this.state === State.InAttributeName) {
        this.stateInAttributeName(c);
      } else if (this.state === State.InCommentLike) {
        this.stateInCommentLike(c);
      } else if (this.state === State.InSpecialComment) {
        this.stateInSpecialComment(c);
      } else if (this.state === State.BeforeAttributeName) {
        this.stateBeforeAttributeName(c);
      } else if (this.state === State.InTagName) {
        this.stateInTagName(c);
      } else if (this.state === State.InClosingTagName) {
        this.stateInClosingTagName(c);
      } else if (this.state === State.BeforeTagName) {
        this.stateBeforeTagName(c);
      } else if (this.state === State.AfterAttributeName) {
        this.stateAfterAttributeName(c);
      } else if (this.state === State.InAttributeValueSq) {
        this.stateInAttributeValueSingleQuotes(c);
      } else if (this.state === State.BeforeAttributeValue) {
        this.stateBeforeAttributeValue(c);
      } else if (this.state === State.BeforeClosingTagName) {
        this.stateBeforeClosingTagName(c);
      } else if (this.state === State.AfterClosingTagName) {
        this.stateAfterClosingTagName(c);
      } else if (this.state === State.BeforeSpecialS) {
        this.stateBeforeSpecialS(c);
      } else if (this.state === State.InAttributeValueNq) {
        this.stateInAttributeValueNoQuotes(c);
      } else if (this.state === State.InSelfClosingTag) {
        this.stateInSelfClosingTag(c);
      } else if (this.state === State.InDeclaration) {
        this.stateInDeclaration(c);
      } else if (this.state === State.BeforeDeclaration) {
        this.stateBeforeDeclaration(c);
      } else if (this.state === State.BeforeComment) {
        this.stateBeforeComment(c);
      } else if (this.state === State.InProcessingInstruction) {
        this.stateInProcessingInstruction(c);
      } else if (this.state === State.InNamedEntity) {
        this.stateInNamedEntity(c);
      } else if (this.state === State.BeforeEntity) {
        this.stateBeforeEntity(c);
      } else if (this.state === State.InHexEntity) {
        this.stateInHexEntity(c);
      } else if (this.state === State.InNumericEntity) {
        this.stateInNumericEntity(c);
      } else {
        // `this._state === State.BeforeNumericEntity`
        this.stateBeforeNumericEntity(c);
      }
      this.index++;
    }
    this.cleanup();
  }

  private finish() {
    if (this.state === State.InNamedEntity) {
      this.emitNamedEntity();
    }

    // If there is remaining data, emit it in a reasonable way
    if (this.sectionStart < this.index) {
      this.handleTrailingData();
    }
    this.cbs.onend();
  }

  /** Handle any trailing data. */
  private handleTrailingData() {
    const endIndex = this.buffer.length + this.offset;
    if (this.state === State.InCommentLike) {
      if (this.currentSequence === Sequences.CdataEnd) {
        this.cbs.oncdata(this.sectionStart, endIndex, 0);
      } else {
        this.cbs.oncomment(this.sectionStart, endIndex, 0);
      }
    } else if (
      this.state === State.InNumericEntity &&
      this.allowLegacyEntity()
    ) {
      this.emitNumericEntity(false);
      // All trailing data will have been consumed
    } else if (
      this.state === State.InHexEntity &&
            this.allowLegacyEntity()
    ) {
      this.emitNumericEntity(false);
      // All trailing data will have been consumed
    } else if (
      this.state === State.InTagName ||
      this.state === State.BeforeAttributeName ||
      this.state === State.BeforeAttributeValue ||
      this.state === State.AfterAttributeName ||
      this.state === State.InAttributeName ||
      this.state === State.InAttributeValueSq ||
      this.state === State.InAttributeValueDq ||
      this.state === State.InAttributeValueNq ||
      this.state === State.InClosingTagName
    ) {
      /*
       * If we are currently in an opening or closing tag, us not calling the
       * respective callback signals that the tag should be ignored.
       */
    } else {
      this.cbs.ontext(this.sectionStart, endIndex);
    }
  }

  private emitPartial(start: number, endIndex: number): void {
    if (
      this.baseState !== State.Text &&
      this.baseState !== State.InSpecialTag
    ) {
      this.cbs.onattribdata(start, endIndex);
    } else {
      this.cbs.ontext(start, endIndex);
    }
  }
  private emitCodePoint(cp: number): void {
    if (
      this.baseState !== State.Text &&
      this.baseState !== State.InSpecialTag
    ) {
      this.cbs.onattribentity(cp);
    } else {
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

const openImpliesClose = new Map<string, Set<string>>([
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

export interface ParserOptions {
  /**
   * Indicates whether special tags (`<script>`, `<style>`, and `<title>`) should get special treatment
   * and if "empty" tags (eg. `<br>`) can have children.  If `false`, the content of special tags
   * will be text only. For feeds and other XML content (documents that don't consist of HTML),
   * set this to `true`.
   *
   * @default false
   */
  xmlMode?: boolean;

  /**
   * Decode entities within the document.
   *
   * @default true
   */
  decodeEntities?: boolean;

  /**
   * If set to true, all tags will be lowercased.
   *
   * @default !xmlMode
   */
  lowerCaseTags?: boolean;

  /**
   * If set to `true`, all attribute names will be lowercased. This has noticeable impact on speed.
   *
   * @default !xmlMode
   */
  lowerCaseAttributeNames?: boolean;

  /**
   * If set to true, CDATA sections will be recognized as text even if the xmlMode option is not enabled.
   * NOTE: If xmlMode is set to `true` then CDATA sections will always be recognized as text.
   *
   * @default xmlMode
   */
  recognizeCDATA?: boolean;

  /**
   * If set to `true`, self-closing tags will trigger the onclosetag event even if xmlMode is not set to `true`.
   * NOTE: If xmlMode is set to `true` then self-closing tags will always be recognized.
   *
   * @default xmlMode
   */
  recognizeSelfClosing?: boolean;

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
  onattribute(
      name: string,
      value: string,
      quote?: string | undefined | null
  ): void;
  onopentag(
      name: string,
      attribs: { [s: string]: string },
      isImplied: boolean
  ): void;
  ontext(data: string): void;
  oncomment(data: string): void;
  oncdatastart(): void;
  oncdataend(): void;
  oncommentend(): void;
  onprocessinginstruction(name: string, data: string): void;
}

const reNameEnd = /\s|\//;

export class Parser implements Callbacks {
  /** The start index of the last event. */
  public startIndex = 0;
  /** The end index of the last event. */
  public endIndex = 0;
  /**
     * Store the start index of the current open tag,
     * so we can update the start index for attributes.
     */
  private openTagStart = 0;

  private tagname = '';
  private attribname = '';
  private attribvalue = '';
  private attribs: null | { [key: string]: string } = null;
  private stack: string[] = [];
  private readonly foreignContext: boolean[] = [];
  private readonly cbs: Partial<Handler>;
  private readonly lowerCaseTagNames: boolean;
  private readonly lowerCaseAttributeNames: boolean;
  private readonly tokenizer: Tokenizer;

  private readonly buffers: string[] = [];
  private bufferOffset = 0;
  /** The index of the last written buffer. Used when resuming after a `pause()`. */
  private writeIndex = 0;
  /** Indicates whether the parser has finished running / `.end` has been called. */
  private ended = false;

  constructor(
    cbs?: Partial<Handler> | null,
    private readonly options: ParserOptions = {}
  ) {
    this.cbs = cbs ?? {};
    this.lowerCaseTagNames = options.lowerCaseTags ?? !options.xmlMode;
    this.lowerCaseAttributeNames =
            options.lowerCaseAttributeNames ?? !options.xmlMode;
    this.tokenizer = new (options.Tokenizer ?? Tokenizer)(
      this.options,
      this
    );
    this.cbs.onparserinit?.(this);
  }

  // Tokenizer event handlers

  /** @internal */
  ontext(start: number, endIndex: number): void {
    const data = this.getSlice(start, endIndex);
    this.endIndex = endIndex - 1;
    this.cbs.ontext?.(data);
    this.startIndex = endIndex;
  }

  /** @internal */
  ontextentity(cp: number): void {
    /*
     * Entities can be emitted on the character, or directly after.
     * We use the section start here to get accurate indices.
     */
    const idx = this.tokenizer.getSectionStart();
    this.endIndex = idx - 1;
    this.cbs.ontext?.(decodeCodePoint(cp));
    this.startIndex = idx;
  }

  protected isVoidElement(name: string): boolean {
    return !this.options.xmlMode && voidElements.has(name);
  }

  /** @internal */
  onopentagname(start: number, endIndex: number): void {
    this.endIndex = endIndex;

    let name = this.getSlice(start, endIndex);

    if (this.lowerCaseTagNames) {
      name = name.toLowerCase();
    }

    this.emitOpenTag(name);
  }

  private emitOpenTag(name: string) {
    this.openTagStart = this.startIndex;
    this.tagname = name;

    const impliesClose =
      !this.options.xmlMode && openImpliesClose.get(name);

    if (impliesClose) {
      while (
        this.stack.length > 0 &&
        impliesClose.has(this.stack[this.stack.length - 1])
      ) {
        const el = this.stack.pop()!;
        this.cbs.onclosetag?.(el, true);
      }
    }
    if (!this.isVoidElement(name)) {
      this.stack.push(name);
      if (foreignContextElements.has(name)) {
        this.foreignContext.push(true);
      } else if (htmlIntegrationElements.has(name)) {
        this.foreignContext.push(false);
      }
    }
    this.cbs.onopentagname?.(name);
    if (this.cbs.onopentag) this.attribs = {};
  }

  private endOpenTag(isImplied: boolean) {
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
  onopentagend(endIndex: number): void {
    this.endIndex = endIndex;
    this.endOpenTag(false);

    // Set `startIndex` for next node
    this.startIndex = endIndex + 1;
  }

  /** @internal */
  onclosetag(start: number, endIndex: number): void {
    this.endIndex = endIndex;

    let name = this.getSlice(start, endIndex);

    if (this.lowerCaseTagNames) {
      name = name.toLowerCase();
    }

    if (
      foreignContextElements.has(name) ||
      htmlIntegrationElements.has(name)
    ) {
      this.foreignContext.pop();
    }

    if (!this.isVoidElement(name)) {
      const pos = this.stack.lastIndexOf(name);
      if (pos !== -1) {
        if (this.cbs.onclosetag) {
          let count = this.stack.length - pos;
          while (count--) {
            // We know the stack has sufficient elements.
            this.cbs.onclosetag(this.stack.pop()!, count !== 0);
          }
        } else this.stack.length = pos;
      } else if (!this.options.xmlMode && name === 'p') {
        // Implicit open before close
        this.emitOpenTag('p');
        this.closeCurrentTag(true);
      }
    } else if (!this.options.xmlMode && name === 'br') {
      // We can't use `emitOpenTag` for implicit open, as `br` would be implicitly closed.
      this.cbs.onopentagname?.('br');
      this.cbs.onopentag?.('br', {}, true);
      this.cbs.onclosetag?.('br', false);
    }

    // Set `startIndex` for next node
    this.startIndex = endIndex + 1;
  }

  /** @internal */
  onselfclosingtag(endIndex: number): void {
    this.endIndex = endIndex;
    if (
      this.options.xmlMode ||
      this.options.recognizeSelfClosing ||
      this.foreignContext[this.foreignContext.length - 1]
    ) {
      this.closeCurrentTag(false);

      // Set `startIndex` for next node
      this.startIndex = endIndex + 1;
    } else {
      // Ignore the fact that the tag is self-closing.
      this.onopentagend(endIndex);
    }
  }

  private closeCurrentTag(isOpenImplied: boolean) {
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
  onattribname(start: number, endIndex: number): void {
    this.startIndex = start;
    const name = this.getSlice(start, endIndex);

    this.attribname = this.lowerCaseAttributeNames
      ? name.toLowerCase()
      : name;
  }

  /** @internal */
  onattribdata(start: number, endIndex: number): void {
    this.attribvalue += this.getSlice(start, endIndex);
  }

  /** @internal */
  onattribentity(cp: number): void {
    this.attribvalue += decodeCodePoint(cp);
  }

  /** @internal */
  onattribend(quote: QuoteType, endIndex: number): void {
    this.endIndex = endIndex;

    this.cbs.onattribute?.(
      this.attribname,
      this.attribvalue,
      quote === QuoteType.Double
        ? '"'
        : quote === QuoteType.Single
          ? '\''
          : quote === QuoteType.NoValue
            ? undefined
            : null
    );

    if (
      this.attribs &&
      !Object.prototype.hasOwnProperty.call(this.attribs, this.attribname)
    ) {
      this.attribs[this.attribname] = this.attribvalue;
    }
    this.attribname = '';
    this.attribvalue = '';
  }

  private getInstructionName(value: string) {
    const idx = value.search(reNameEnd);
    let name = idx < 0 ? value : value.substr(0, idx);

    if (this.lowerCaseTagNames) {
      name = name.toLowerCase();
    }

    return name;
  }

  /** @internal */
  ondeclaration(start: number, endIndex: number): void {
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
  onprocessinginstruction(start: number, endIndex: number): void {
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
  oncomment(start: number, endIndex: number, offset: number): void {
    this.endIndex = endIndex;

    this.cbs.oncomment?.(this.getSlice(start, endIndex - offset));
    this.cbs.oncommentend?.();

    // Set `startIndex` for next node
    this.startIndex = endIndex + 1;
  }

  /** @internal */
  oncdata(start: number, endIndex: number, offset: number): void {
    this.endIndex = endIndex;
    const value = this.getSlice(start, endIndex - offset);

    if (this.options.xmlMode || this.options.recognizeCDATA) {
      this.cbs.oncdatastart?.();
      this.cbs.ontext?.(value);
      this.cbs.oncdataend?.();
    } else {
      this.cbs.oncomment?.(`[CDATA[${value}]]`);
      this.cbs.oncommentend?.();
    }

    // Set `startIndex` for next node
    this.startIndex = endIndex + 1;
  }

  /** @internal */
  onend(): void {
    if (this.cbs.onclosetag) {
      // Set the end index for all remaining tags
      this.endIndex = this.startIndex;
      for (
        let i = this.stack.length;
        i > 0;
        this.cbs.onclosetag(this.stack[--i], true)
      );
    }
    this.cbs.onend?.();
  }

  /**
   * Resets the parser to a blank state, ready to parse a new HTML document
   */
  public reset(): void {
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
  public parseComplete(data: string): void {
    this.reset();
    this.end(data);
  }

  private getSlice(start: number, end: number) {
    while (start - this.bufferOffset >= this.buffers[0].length) {
      this.shiftBuffer();
    }

    let str = this.buffers[0].slice(
      start - this.bufferOffset,
      end - this.bufferOffset
    );

    while (end - this.bufferOffset > this.buffers[0].length) {
      this.shiftBuffer();
      str += this.buffers[0].slice(0, end - this.bufferOffset);
    }

    return str;
  }

  private shiftBuffer(): void {
    this.bufferOffset += this.buffers[0].length;
    this.writeIndex--;
    this.buffers.shift();
  }

  /**
   * Parses a chunk of data and calls the corresponding callbacks.
   *
   * @param chunk Chunk to parse.
   */
  public write(chunk: string): void {
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
  public end(chunk?: string): void {
    if (this.ended) {
      this.cbs.onerror?.(Error('.end() after done!'));
      return;
    }

    if (chunk) this.write(chunk);
    this.ended = true;
    this.tokenizer.end();
  }

  /**
   * Pauses parsing. The parser won't emit events until `resume` is called.
   */
  public pause(): void {
    this.tokenizer.pause();
  }

  /**
   * Resumes parsing after `pause` was called.
   */
  public resume(): void {
    this.tokenizer.resume();

    while (
      this.tokenizer.running &&
            this.writeIndex < this.buffers.length
    ) {
      this.tokenizer.write(this.buffers[this.writeIndex++]);
    }

    if (this.ended) this.tokenizer.end();
  }

  /**
   * Alias of `write`, for backwards compatibility.
   *
   * @param chunk Chunk to parse.
   * @deprecated
   */
  public parseChunk(chunk: string): void {
    this.write(chunk);
  }
  /**
   * Alias of `end`, for backwards compatibility.
   *
   * @param chunk Optional final chunk to parse.
   * @deprecated
   */
  public done(chunk?: string): void {
    this.end(chunk);
  }
}

export function parseNodes(rootElement: HTMLElement, str: string) {
  const stack:HTMLElement[] = [];
  let parent = rootElement;
  let tn:TextNode | null = null;
  const parser = new Parser({
    onopentag(tagName, attrs) {
      const newId = id();
      const uaDeclaredStyle = uaDeclaredStyles[tagName] || {};
      const style = attrs.style;
      let cascadedStyle;

      // Just ignore invalid styles so the parser can continue
      try {
        if (style) {
          const styleDeclaredStyle = StyleParser(style);
          // 2-level cascade:
          cascadedStyle = Object.assign({}, uaDeclaredStyle, styleDeclaredStyle);
        } else {
          cascadedStyle = uaDeclaredStyle;
        }
      } catch (e) {
        cascadedStyle = uaDeclaredStyle;
      }

      const computedStyle = createComputedStyle(parent.style, cascadedStyle);
      const element = new HTMLElement(newId, tagName, computedStyle, parent, attrs);

      parent.children.push(element);
      stack.push(parent);
      parent = element;
      tn = null;
    },
    onclosetag(tagName) {
      parent = stack.pop()!;
      tn = null;
    },
    ontext(text) {
      if (tn) {
        tn.text += text;
      } else {
        const newId = id();
        const computedStyle = createComputedStyle(parent.style, {});
        parent.children.push(tn = new TextNode(newId, text, computedStyle));
      }
    }
  });

  parser.write(str);
  parser.end();
}

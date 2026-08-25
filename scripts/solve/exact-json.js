// Minimal exact JSON parser for hostile file-ingestion boundaries. Native
// JSON.parse silently keeps the last duplicate object key; this parser rejects
// duplicates (including escape-equivalent keys) before data reaches a schema.

const jsonParse = JSON.parse;
const objectCreate = Object.create;
const objectDefineProperty = Object.defineProperty;
const objectHasOwn = Object.hasOwn;
const stringSlice = Function.call.bind(String.prototype.slice);

const INVALID_JSON = 'exact JSON data required';
const TOKEN = Object.freeze({
  ARRAY_CLOSE: ']',
  ARRAY_OPEN: '[',
  BACKSLASH: '\\',
  CARRIAGE_RETURN: '\r',
  COLON: ':',
  COMMA: ',',
  DIGIT_NINE: '9',
  DIGIT_ZERO: '0',
  FALSE_INITIAL: 'f',
  FALSE_LITERAL: 'false',
  LINE_FEED: '\n',
  MINUS: '-',
  NULL_INITIAL: 'n',
  NULL_LITERAL: 'null',
  OBJECT_CLOSE: '}',
  OBJECT_OPEN: '{',
  QUOTE: '"',
  SPACE: ' ',
  TAB: '\t',
  TRUE_INITIAL: 't',
  TRUE_LITERAL: 'true',
});

function fail() {
  throw new Error(INVALID_JSON);
}

function whitespace(character) {
  return character === TOKEN.SPACE || character === TOKEN.LINE_FEED ||
    character === TOKEN.CARRIAGE_RETURN || character === TOKEN.TAB;
}

class ExactJsonParser {
  constructor(source) {
    this.source = source;
    this.index = 0;
  }

  parse() {
    this.skipWhitespace();
    const value = this.value();
    this.skipWhitespace();
    if (this.index !== this.source.length) fail();
    return value;
  }

  skipWhitespace() {
    while (whitespace(this.source[this.index])) this.index += 1;
  }

  value() {
    const character = this.source[this.index];
    if (character === TOKEN.OBJECT_OPEN) return this.object();
    if (character === TOKEN.ARRAY_OPEN) return this.array();
    if (character === TOKEN.QUOTE) return this.string();
    if (character === TOKEN.TRUE_INITIAL) {
      return this.literal(TOKEN.TRUE_LITERAL, true);
    }
    if (character === TOKEN.FALSE_INITIAL) {
      return this.literal(TOKEN.FALSE_LITERAL, false);
    }
    if (character === TOKEN.NULL_INITIAL) {
      return this.literal(TOKEN.NULL_LITERAL, null);
    }
    if (character === TOKEN.MINUS ||
      (character >= TOKEN.DIGIT_ZERO && character <= TOKEN.DIGIT_NINE)) {
      return this.number();
    }
    return fail();
  }

  literal(token, value) {
    for (let offset = 0; offset < token.length; offset += 1) {
      if (this.source[this.index + offset] !== token[offset]) fail();
    }
    this.index += token.length;
    return value;
  }

  string() {
    const start = this.index;
    this.index += 1;
    while (this.index < this.source.length) {
      const character = this.source[this.index];
      this.index += 1;
      if (character === TOKEN.QUOTE) {
        try {
          return jsonParse(stringSlice(this.source, start, this.index));
        } catch {
          return fail();
        }
      }
      if (character === TOKEN.BACKSLASH) this.index += 1;
    }
    return fail();
  }

  number() {
    const start = this.index;
    while (this.index < this.source.length) {
      const character = this.source[this.index];
      if (whitespace(character) || character === TOKEN.COMMA ||
        character === TOKEN.ARRAY_CLOSE || character === TOKEN.OBJECT_CLOSE) break;
      this.index += 1;
    }
    try {
      return jsonParse(stringSlice(this.source, start, this.index));
    } catch {
      return fail();
    }
  }

  object() {
    this.index += 1;
    const result = objectCreate(null);
    this.skipWhitespace();
    if (this.source[this.index] === TOKEN.OBJECT_CLOSE) {
      this.index += 1;
      return result;
    }
    while (this.index < this.source.length) {
      if (this.source[this.index] !== TOKEN.QUOTE) fail();
      const key = this.string();
      if (objectHasOwn(result, key)) fail();
      this.skipWhitespace();
      if (this.source[this.index] !== TOKEN.COLON) fail();
      this.index += 1;
      this.skipWhitespace();
      const value = this.value();
      objectDefineProperty(result, key, {
        configurable: true,
        enumerable: true,
        value,
        writable: true,
      });
      this.skipWhitespace();
      if (this.source[this.index] === TOKEN.OBJECT_CLOSE) {
        this.index += 1;
        return result;
      }
      if (this.source[this.index] !== TOKEN.COMMA) fail();
      this.index += 1;
      this.skipWhitespace();
    }
    return fail();
  }

  array() {
    this.index += 1;
    const result = [];
    this.skipWhitespace();
    if (this.source[this.index] === TOKEN.ARRAY_CLOSE) {
      this.index += 1;
      return result;
    }
    let itemIndex = 0;
    while (this.index < this.source.length) {
      objectDefineProperty(result, itemIndex, {
        configurable: true,
        enumerable: true,
        value: this.value(),
        writable: true,
      });
      itemIndex += 1;
      this.skipWhitespace();
      if (this.source[this.index] === TOKEN.ARRAY_CLOSE) {
        this.index += 1;
        return result;
      }
      if (this.source[this.index] !== TOKEN.COMMA) fail();
      this.index += 1;
      this.skipWhitespace();
    }
    return fail();
  }
}

export function parseExactJson(source) {
  if (typeof source !== 'string') fail();
  return new ExactJsonParser(source).parse();
}

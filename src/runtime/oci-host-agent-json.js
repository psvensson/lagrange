import {TextDecoder} from 'node:util';

import {
  OCI_HOST_AGENT_PROTOCOL_ERROR,
  OciHostAgentProtocolError,
  protocolError,
} from './oci-host-agent-protocol-errors.js';

const JSON_WHITESPACE = new Set([' ', '\t', '\n', '\r']);
const HEXADECIMAL_DIGIT = /^[0-9A-Fa-f]$/u;
const ARRAY_INDEX = /^(0|[1-9][0-9]*)$/u;
const UTF8_DECODER = new TextDecoder('utf-8', {fatal: true});
const C0_CONTROL_MAX = 0x1f;
const C1_CONTROL_MIN = 0x7f;
const C1_CONTROL_MAX = 0x9f;
const HIGH_SURROGATE_MIN = 0xd800;
const HIGH_SURROGATE_MAX = 0xdbff;
const LOW_SURROGATE_MIN = 0xdc00;
const LOW_SURROGATE_MAX = 0xdfff;
const ESCAPE_DIGITS = 4;
const HEX_RADIX = 16;
const LENGTH_FIELD = 'length';
const DESCRIPTOR_VALUE = 'value';
const ARRAY_CLOSE = ']';
const ARRAY_OPEN = '[';
const DECIMAL_POINT = '.';
const DIGIT_NINE = '9';
const DIGIT_ONE = '1';
const DIGIT_ZERO = '0';
const ESCAPE = '\\';
const EXPONENT_LOWER = 'e';
const EXPONENT_UPPER = 'E';
const FALSE_INITIAL = 'f';
const FALSE_LITERAL = 'false';
const MEMBER_SEPARATOR = ',';
const MINUS = '-';
const NAME_SEPARATOR = ':';
const NULL_INITIAL = 'n';
const NULL_LITERAL = 'null';
const OBJECT_CLOSE = '}';
const OBJECT_OPEN = '{';
const PLUS = '+';
const QUOTE = '"';
const TRUE_INITIAL = 't';
const TRUE_LITERAL = 'true';
const UNICODE_ESCAPE = 'u';

function invalidJson() {
  protocolError(OCI_HOST_AGENT_PROTOCOL_ERROR.INVALID_JSON);
}

function assertUnicodeScalarString(value) {
  for (let index = 0; index < value.length; index += 1) {
    const codeUnit = value.charCodeAt(index);
    if (codeUnit <= C0_CONTROL_MAX ||
        (codeUnit >= C1_CONTROL_MIN && codeUnit <= C1_CONTROL_MAX)) {
      protocolError(OCI_HOST_AGENT_PROTOCOL_ERROR.INVALID_UNICODE);
    }
    if (codeUnit >= HIGH_SURROGATE_MIN && codeUnit <= HIGH_SURROGATE_MAX) {
      const nextCodeUnit = value.charCodeAt(index + 1);
      if (index + 1 >= value.length ||
          nextCodeUnit < LOW_SURROGATE_MIN ||
          nextCodeUnit > LOW_SURROGATE_MAX) {
        protocolError(OCI_HOST_AGENT_PROTOCOL_ERROR.INVALID_UNICODE);
      }
      index += 1;
    } else if (codeUnit >= LOW_SURROGATE_MIN &&
        codeUnit <= LOW_SURROGATE_MAX) {
      protocolError(OCI_HOST_AGENT_PROTOCOL_ERROR.INVALID_UNICODE);
    }
  }
}

function decodeJsonInput(input) {
  if (typeof input === 'string') return input;
  if (!Buffer.isBuffer(input)) invalidJson();
  try {
    return UTF8_DECODER.decode(input);
  } catch {
    protocolError(OCI_HOST_AGENT_PROTOCOL_ERROR.INVALID_UNICODE);
  }
}

class ExactJsonParser {
  constructor(source) {
    this.source = source;
    this.index = 0;
  }

  parse() {
    this.#skipWhitespace();
    const value = this.#parseValue();
    this.#skipWhitespace();
    if (this.index !== this.source.length) invalidJson();
    return value;
  }

  #parseValue() {
    const token = this.source[this.index];
    if (token === OBJECT_OPEN) return this.#parseObject();
    if (token === ARRAY_OPEN) return this.#parseArray();
    if (token === QUOTE) return this.#parseString();
    if (token === TRUE_INITIAL) {
      return this.#parseLiteral(TRUE_LITERAL, true);
    }
    if (token === FALSE_INITIAL) {
      return this.#parseLiteral(FALSE_LITERAL, false);
    }
    if (token === NULL_INITIAL) {
      this.#parseLiteral(NULL_LITERAL, null);
      protocolError(OCI_HOST_AGENT_PROTOCOL_ERROR.NULL_NOT_ALLOWED);
    }
    if (token === MINUS || (token >= DIGIT_ZERO && token <= DIGIT_NINE)) {
      return this.#parseNumber();
    }
    invalidJson();
  }

  #parseLiteral(literal, value) {
    if (!this.source.startsWith(literal, this.index)) invalidJson();
    this.index += literal.length;
    return value;
  }

  #parseObject() {
    this.index += 1;
    const result = {};
    this.#skipWhitespace();
    if (this.source[this.index] === OBJECT_CLOSE) {
      this.index += 1;
      return result;
    }

    while (this.index < this.source.length) {
      if (this.source[this.index] !== QUOTE) invalidJson();
      const key = this.#parseString();
      if (Object.hasOwn(result, key)) {
        protocolError(OCI_HOST_AGENT_PROTOCOL_ERROR.DUPLICATE_OBJECT_KEY);
      }
      this.#skipWhitespace();
      if (this.source[this.index] !== NAME_SEPARATOR) invalidJson();
      this.index += 1;
      this.#skipWhitespace();
      const value = this.#parseValue();
      Object.defineProperty(result, key, {
        configurable: true,
        enumerable: true,
        value,
        writable: true,
      });
      this.#skipWhitespace();
      const separator = this.source[this.index];
      if (separator === OBJECT_CLOSE) {
        this.index += 1;
        return result;
      }
      if (separator !== MEMBER_SEPARATOR) invalidJson();
      this.index += 1;
      this.#skipWhitespace();
    }
    invalidJson();
  }

  #parseArray() {
    this.index += 1;
    const result = [];
    this.#skipWhitespace();
    if (this.source[this.index] === ARRAY_CLOSE) {
      this.index += 1;
      return result;
    }

    while (this.index < this.source.length) {
      result.push(this.#parseValue());
      this.#skipWhitespace();
      const separator = this.source[this.index];
      if (separator === ARRAY_CLOSE) {
        this.index += 1;
        return result;
      }
      if (separator !== MEMBER_SEPARATOR) invalidJson();
      this.index += 1;
      this.#skipWhitespace();
    }
    invalidJson();
  }

  #parseString() {
    this.index += 1;
    let result = '';
    while (this.index < this.source.length) {
      const character = this.source[this.index];
      this.index += 1;
      if (character === QUOTE) {
        assertUnicodeScalarString(result);
        return result;
      }
      if (character === ESCAPE) {
        result += this.#parseEscape();
        continue;
      }
      if (character.charCodeAt(0) <= C0_CONTROL_MAX) {
        protocolError(OCI_HOST_AGENT_PROTOCOL_ERROR.INVALID_UNICODE);
      }
      result += character;
    }
    invalidJson();
  }

  #parseEscape() {
    const escape = this.source[this.index];
    this.index += 1;
    const simpleEscapes = {
      '"': '"',
      '\\': '\\',
      '/': '/',
      'b': '\b',
      'f': '\f',
      'n': '\n',
      'r': '\r',
      't': '\t',
    };
    if (Object.hasOwn(simpleEscapes, escape)) return simpleEscapes[escape];
    if (escape !== UNICODE_ESCAPE) invalidJson();
    const hexadecimal = this.source.slice(
      this.index,
      this.index + ESCAPE_DIGITS,
    );
    if (hexadecimal.length !== ESCAPE_DIGITS ||
        [...hexadecimal].some((digit) => !HEXADECIMAL_DIGIT.test(digit))) {
      invalidJson();
    }
    this.index += ESCAPE_DIGITS;
    return String.fromCharCode(Number.parseInt(hexadecimal, HEX_RADIX));
  }

  #parseNumber() {
    const start = this.index;
    if (this.source[this.index] === MINUS) this.index += 1;
    this.#parseIntegerPart();
    this.#parseFractionPart();
    this.#parseExponentPart();
    const value = Number(this.source.slice(start, this.index));
    if (!Number.isSafeInteger(value)) {
      protocolError(OCI_HOST_AGENT_PROTOCOL_ERROR.INVALID_JSON_NUMBER);
    }
    return value;
  }

  #parseIntegerPart() {
    if (this.source[this.index] === DIGIT_ZERO) {
      this.index += 1;
      return;
    }
    if (!this.#isDigitOneToNine(this.source[this.index])) invalidJson();
    while (this.#isDigit(this.source[this.index])) this.index += 1;
  }

  #parseFractionPart() {
    if (this.source[this.index] !== DECIMAL_POINT) return;
    this.index += 1;
    if (!this.#isDigit(this.source[this.index])) invalidJson();
    while (this.#isDigit(this.source[this.index])) this.index += 1;
  }

  #parseExponentPart() {
    if (this.source[this.index] !== EXPONENT_LOWER &&
        this.source[this.index] !== EXPONENT_UPPER) return;
    this.index += 1;
    if (this.source[this.index] === PLUS ||
        this.source[this.index] === MINUS) {
      this.index += 1;
    }
    if (!this.#isDigit(this.source[this.index])) invalidJson();
    while (this.#isDigit(this.source[this.index])) this.index += 1;
  }

  #isDigit(character) {
    return character >= DIGIT_ZERO && character <= DIGIT_NINE;
  }

  #isDigitOneToNine(character) {
    return character >= DIGIT_ONE && character <= DIGIT_NINE;
  }

  #skipWhitespace() {
    while (JSON_WHITESPACE.has(this.source[this.index])) this.index += 1;
  }
}

function canonicalizeArray(value, ancestors) {
  if (Object.getPrototypeOf(value) !== Array.prototype) invalidJson();
  const ownKeys = Reflect.ownKeys(value);
  if (ownKeys.some((key) => key !== LENGTH_FIELD &&
      (typeof key !== 'string' || !ARRAY_INDEX.test(key) ||
        Number(key) >= value.length))) {
    invalidJson();
  }
  if (ownKeys.length !== value.length + 1) invalidJson();

  const elements = [];
  for (let index = 0; index < value.length; index += 1) {
    const descriptor = Object.getOwnPropertyDescriptor(value, String(index));
    if (!descriptor || !descriptor.enumerable ||
        !(DESCRIPTOR_VALUE in descriptor)) {
      invalidJson();
    }
    elements.push(canonicalizeValue(descriptor.value, ancestors));
  }
  return `[${elements.join(MEMBER_SEPARATOR)}]`;
}

function canonicalizeObject(value, ancestors) {
  if (Object.getPrototypeOf(value) !== Object.prototype) invalidJson();
  const keys = Reflect.ownKeys(value);
  if (keys.some((key) => typeof key !== 'string')) invalidJson();
  keys.sort();
  const members = keys.map((key) => {
    assertUnicodeScalarString(key);
    const descriptor = Object.getOwnPropertyDescriptor(value, key);
    if (!descriptor || !descriptor.enumerable ||
        !(DESCRIPTOR_VALUE in descriptor)) {
      invalidJson();
    }
    return `${JSON.stringify(key)}:${canonicalizeValue(
      descriptor.value,
      ancestors,
    )}`;
  });
  return `{${members.join(MEMBER_SEPARATOR)}}`;
}

function canonicalizeValue(value, ancestors) {
  if (value === null) {
    protocolError(OCI_HOST_AGENT_PROTOCOL_ERROR.NULL_NOT_ALLOWED);
  }
  if (typeof value === 'string') {
    assertUnicodeScalarString(value);
    return JSON.stringify(value);
  }
  if (typeof value === 'boolean') {
    return value ? TRUE_LITERAL : FALSE_LITERAL;
  }
  if (typeof value === 'number') {
    if (!Number.isSafeInteger(value)) {
      protocolError(OCI_HOST_AGENT_PROTOCOL_ERROR.INVALID_JSON_NUMBER);
    }
    return JSON.stringify(value);
  }
  if (typeof value !== 'object') invalidJson();
  if (ancestors.has(value)) invalidJson();

  ancestors.add(value);
  try {
    if (Array.isArray(value)) return canonicalizeArray(value, ancestors);
    return canonicalizeObject(value, ancestors);
  } finally {
    ancestors.delete(value);
  }
}

function parseExactOciHostAgentJson(input) {
  try {
    return new ExactJsonParser(decodeJsonInput(input)).parse();
  } catch (error) {
    if (error instanceof OciHostAgentProtocolError) throw error;
    invalidJson();
  }
}

function canonicalizeOciHostAgentJson(value) {
  try {
    return canonicalizeValue(value, new Set());
  } catch (error) {
    if (error instanceof OciHostAgentProtocolError) throw error;
    invalidJson();
  }
}

export {
  canonicalizeOciHostAgentJson,
  parseExactOciHostAgentJson,
};

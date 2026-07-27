// Intrinsics-independent canonical JSON data: admission predicates, index-based
// collection processing, owned serialization, and content digests that stay
// correct when Object/Array/String prototypes or global intrinsics are
// polluted. Extracted from the opportunity-calculator input-integrity owner
// after fourteen independent verification rounds established the invariant:
// an accepted analytical input must be canonical JSON DATA (own enumerable
// data properties, dense standard arrays, canonical finite numbers), not
// merely JavaScript-coercible data, and no mutable host prototype method is a
// trustworthy validator or serializer. Any guard or contract module that
// admits hostile input should build on these primitives instead of re-deriving
// them per quest.

import {createHash} from 'node:crypto';

const arrayIsArray = Array.isArray;
const jsonStringify = JSON.stringify;
const numberIsFinite = Number.isFinite;
const objectDefineProperty = Object.defineProperty;
const objectGetOwnPropertyDescriptor = Object.getOwnPropertyDescriptor;
const objectGetPrototypeOf = Object.getPrototypeOf;
const objectHasOwn = Object.hasOwn;
const objectKeys = Object.keys;
const reflectOwnKeys = Reflect.ownKeys;
const canonicalArrayPrototype = Array.prototype;
const canonicalObjectPrototype = Object.prototype;

const SHA256 = Object.freeze({
  ALGORITHM: 'sha256',
  FIRST_HEX_LETTER: 'a',
  HEX_LENGTH: 64,
  LAST_HEX_LETTER: 'f',
  OUTPUT_ENCODING: 'hex',
  PREFIX: 'sha256:',
});
const WHITESPACE_CHARACTERS =
  '\u0009\u000a\u000b\u000c\u000d\u0020\u00a0\u1680' +
  '\u2000\u2001\u2002\u2003\u2004\u2005\u2006\u2007\u2008\u2009\u200a' +
  '\u2028\u2029\u202f\u205f\u3000\ufeff';
const ARRAY_KEY_CHARACTER = Object.freeze({
  FIRST_DIGIT: '0',
  LAST_DIGIT: '9',
});
const DATA_PROPERTY = Object.freeze({
  LENGTH: 'length',
  VALUE: 'value',
});
const SERIALIZATION_TEXT = Object.freeze({
  ARRAY_CLOSE: ']',
  ARRAY_EMPTY: '[]',
  ARRAY_OPEN: '[',
  ARRAY_OPEN_PRETTY: '[\n',
  BOOLEAN_FALSE: 'false',
  BOOLEAN_TRUE: 'true',
  COLON: ':',
  COLON_PRETTY: ': ',
  COMMA: ',',
  COMMA_PRETTY: ',\n',
  INDENTATION_CHARACTER: ' ',
  INVALID_DATA: 'canonical JSON data required',
  NEWLINE: '\n',
  NULL: 'null',
  OBJECT_CLOSE: '}',
  OBJECT_EMPTY: '{}',
  OBJECT_OPEN: '{',
  OBJECT_OPEN_PRETTY: '{\n',
});

function isNonEmptyText(value) {
  if (typeof value !== 'string') return false;
  for (let index = 0; index < value.length; index += 1) {
    const character = value[index];
    let isWhitespace = false;
    for (
      let whitespaceIndex = 0;
      whitespaceIndex < WHITESPACE_CHARACTERS.length;
      whitespaceIndex += 1
    ) {
      if (character === WHITESPACE_CHARACTERS[whitespaceIndex]) {
        isWhitespace = true;
        break;
      }
    }
    if (!isWhitespace) return true;
  }
  return false;
}

function isSha256Digest(value) {
  if (
    typeof value !== 'string' ||
    value.length !== SHA256.PREFIX.length + SHA256.HEX_LENGTH
  ) {
    return false;
  }
  for (let index = 0; index < SHA256.PREFIX.length; index += 1) {
    if (value[index] !== SHA256.PREFIX[index]) return false;
  }
  for (let index = SHA256.PREFIX.length; index < value.length; index += 1) {
    const character = value[index];
    const isDigit = character >= ARRAY_KEY_CHARACTER.FIRST_DIGIT &&
      character <= ARRAY_KEY_CHARACTER.LAST_DIGIT;
    const isLowerHex = character >= SHA256.FIRST_HEX_LETTER &&
      character <= SHA256.LAST_HEX_LETTER;
    if (!isDigit && !isLowerHex) return false;
  }
  return true;
}

function isOwnEnumerableDataProperty(value, key) {
  const descriptor = objectGetOwnPropertyDescriptor(value, key);
  return descriptor?.enumerable === true &&
    objectHasOwn(descriptor, DATA_PROPERTY.VALUE);
}

function isRecord(value) {
  if (!value || typeof value !== 'object' || arrayIsArray(value)) {
    return false;
  }
  const prototype = objectGetPrototypeOf(value);
  if (prototype !== canonicalObjectPrototype && prototype !== null) {
    return false;
  }
  const keys = reflectOwnKeys(value);
  for (let index = 0; index < keys.length; index += 1) {
    const key = keys[index];
    if (typeof key !== 'string' ||
        !isOwnEnumerableDataProperty(value, key)) {
      return false;
    }
  }
  return true;
}

function isCanonicalArrayIndexKey(key, length) {
  if (typeof key !== 'string' || key.length === 0) return false;
  if (key.length > 1 && key[0] === ARRAY_KEY_CHARACTER.FIRST_DIGIT) {
    return false;
  }
  for (let index = 0; index < key.length; index += 1) {
    const character = key[index];
    if (character < ARRAY_KEY_CHARACTER.FIRST_DIGIT ||
        character > ARRAY_KEY_CHARACTER.LAST_DIGIT) {
      return false;
    }
  }
  return +key < length;
}

function hasCanonicalLength(value) {
  const descriptor = objectGetOwnPropertyDescriptor(
    value,
    DATA_PROPERTY.LENGTH,
  );
  return objectHasOwn(descriptor, DATA_PROPERTY.VALUE) &&
    descriptor.value === value.length;
}

function isDenseDataArray(value) {
  if (!arrayIsArray(value) ||
      objectGetPrototypeOf(value) !== canonicalArrayPrototype ||
      !hasCanonicalLength(value)) {
    return false;
  }
  const keys = reflectOwnKeys(value);
  if (keys.length !== value.length + 1) return false;
  for (let index = 0; index < keys.length; index += 1) {
    const key = keys[index];
    if (key === DATA_PROPERTY.LENGTH) continue;
    if (!isCanonicalArrayIndexKey(key, value.length) ||
        !isOwnEnumerableDataProperty(value, key)) {
      return false;
    }
  }
  return true;
}

function appendOwnArrayValue(value, item) {
  objectDefineProperty(value, value.length, {
    configurable: true,
    enumerable: true,
    writable: true,
    value: item,
  });
}

function copyArrayByIndex(value, mapper = (item) => item) {
  const copy = [];
  for (let index = 0; index < value.length; index += 1) {
    appendOwnArrayValue(copy, mapper(value[index], index));
  }
  return copy;
}

function concatenateArraysByIndex(first, second) {
  const combined = copyArrayByIndex(first);
  for (let index = 0; index < second.length; index += 1) {
    appendOwnArrayValue(combined, second[index]);
  }
  return combined;
}

function joinArrayByIndex(value, separator) {
  let joined = '';
  for (let index = 0; index < value.length; index += 1) {
    if (index > 0) joined += separator;
    joined += value[index];
  }
  return joined;
}

function replaceExactSuffixByIndex(value, suffix, replacement) {
  const prefixLength = value.length - suffix.length;
  if (prefixLength < 0) return value;
  for (let index = 0; index < suffix.length; index += 1) {
    if (value[prefixLength + index] !== suffix[index]) return value;
  }
  let result = '';
  for (let index = 0; index < prefixLength; index += 1) {
    result += value[index];
  }
  return result + replacement;
}

function sortedOwnStringKeys(value) {
  const keys = objectKeys(value);
  for (let index = 1; index < keys.length; index += 1) {
    const current = keys[index];
    let insertionIndex = index;
    while (
      insertionIndex > 0 &&
      keys[insertionIndex - 1] > current
    ) {
      keys[insertionIndex] = keys[insertionIndex - 1];
      insertionIndex -= 1;
    }
    keys[insertionIndex] = current;
  }
  return keys;
}

function buildIndentation(spacing, depth) {
  let indentation = '';
  const length = spacing * depth;
  for (let index = 0; index < length; index += 1) {
    indentation += SERIALIZATION_TEXT.INDENTATION_CHARACTER;
  }
  return indentation;
}

function serializeArrayData(value, options, depth) {
  if (value.length === 0) return SERIALIZATION_TEXT.ARRAY_EMPTY;
  const pretty = options.spacing > 0;
  const separator = pretty ?
    SERIALIZATION_TEXT.COMMA_PRETTY :
    SERIALIZATION_TEXT.COMMA;
  const indentation = pretty ?
    buildIndentation(options.spacing, depth + 1) :
    '';
  let serialized = pretty ?
    SERIALIZATION_TEXT.ARRAY_OPEN_PRETTY :
    SERIALIZATION_TEXT.ARRAY_OPEN;
  for (let index = 0; index < value.length; index += 1) {
    if (index > 0) serialized += separator;
    serialized += indentation +
      serializeDataValue(value[index], options, depth + 1);
  }
  if (!pretty) return serialized + SERIALIZATION_TEXT.ARRAY_CLOSE;
  return serialized + SERIALIZATION_TEXT.NEWLINE +
    buildIndentation(options.spacing, depth) +
    SERIALIZATION_TEXT.ARRAY_CLOSE;
}

function serializeRecordData(value, options, depth) {
  if (!isRecord(value)) throw new TypeError(SERIALIZATION_TEXT.INVALID_DATA);
  const keys = options.sortKeys ?
    sortedOwnStringKeys(value) :
    objectKeys(value);
  if (keys.length === 0) return SERIALIZATION_TEXT.OBJECT_EMPTY;
  const pretty = options.spacing > 0;
  const separator = pretty ?
    SERIALIZATION_TEXT.COMMA_PRETTY :
    SERIALIZATION_TEXT.COMMA;
  const indentation = pretty ?
    buildIndentation(options.spacing, depth + 1) :
    '';
  let serialized = pretty ?
    SERIALIZATION_TEXT.OBJECT_OPEN_PRETTY :
    SERIALIZATION_TEXT.OBJECT_OPEN;
  for (let index = 0; index < keys.length; index += 1) {
    if (index > 0) serialized += separator;
    const key = keys[index];
    serialized += indentation + jsonStringify(key) +
      (pretty ? SERIALIZATION_TEXT.COLON_PRETTY : SERIALIZATION_TEXT.COLON) +
      serializeDataValue(value[key], options, depth + 1);
  }
  if (!pretty) return serialized + SERIALIZATION_TEXT.OBJECT_CLOSE;
  return serialized + SERIALIZATION_TEXT.NEWLINE +
    buildIndentation(options.spacing, depth) +
    SERIALIZATION_TEXT.OBJECT_CLOSE;
}

function serializeDataValue(value, options, depth) {
  if (value === null) return SERIALIZATION_TEXT.NULL;
  if (typeof value === 'string') return jsonStringify(value);
  if (typeof value === 'boolean') {
    return value ?
      SERIALIZATION_TEXT.BOOLEAN_TRUE :
      SERIALIZATION_TEXT.BOOLEAN_FALSE;
  }
  if (typeof value === 'number' && numberIsFinite(value)) return `${value}`;
  if (arrayIsArray(value)) return serializeArrayData(value, options, depth);
  return serializeRecordData(value, options, depth);
}

function serializeJsonData(value, options = {}) {
  const spacing = options.spacing === 2 ? 2 : 0;
  return serializeDataValue(
    value,
    {
      sortKeys: options.sortKeys === true,
      spacing,
    },
    0,
  );
}

function digest(value) {
  const bytes = serializeJsonData(value, {sortKeys: true});
  return SHA256.PREFIX + createHash(SHA256.ALGORITHM)
    .update(bytes)
    .digest(SHA256.OUTPUT_ENCODING);
}

export {
  appendOwnArrayValue,
  concatenateArraysByIndex,
  copyArrayByIndex,
  digest,
  isDenseDataArray,
  isNonEmptyText,
  isRecord,
  isSha256Digest,
  joinArrayByIndex,
  replaceExactSuffixByIndex,
  serializeJsonData,
};

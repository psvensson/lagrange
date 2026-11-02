/**
 * Canonical finite-JSON codec and schema validator for Call Cell partial
 * contributions and bounded accumulator state (Quest Q4 / Q3).
 */

import {isDenseDataArray, isRecord} from '../utils/canonical-json-data.js';

const PARTIAL_CODEC_VERSION = 1;
const DEFAULT_PARTIAL_SCHEMA_ID = 'lagrange.partial.v1';

const DEFAULT_PARTIAL_CODEC_LIMITS = Object.freeze({
  MAX_ARRAY_LENGTH: 1024,
  MAX_CONTRIBUTION_BYTES: 65536,
  MAX_DEPTH: 16,
  MAX_GROUP_KEY_BYTES: 1024,
  MAX_RECORD_FIELDS: 128,
  MAX_STRING_BYTES: 16384,
});

const PARTIAL_CODEC_ERROR_CODE = Object.freeze({
  BYTE_OVERFLOW: 'partial_byte_overflow',
  CYCLIC_PARTIAL_VALUE: 'cyclic_partial_value',
  DEPTH_OVERFLOW: 'partial_depth_overflow',
  DUPLICATE_OBJECT_KEY: 'duplicate_object_key',
  ELEMENT_COUNT_OVERFLOW: 'partial_element_count_overflow',
  INVALID_GROUP_KEY: 'invalid_group_key',
  INVALID_PARTIAL_SCHEMA: 'invalid_partial_schema',
  INVALID_PARTIAL_VALUE: 'invalid_partial_value',
  INVALID_UNICODE_STRING: 'invalid_unicode_string',
  MALFORMED_PARTIAL_WIRE: 'malformed_partial_wire',
  NON_CANONICAL_PARTIAL_WIRE: 'non_canonical_partial_wire',
  UNSAFE_INTEGER_VALUE: 'unsafe_integer_value',
  UNSUPPORTED_PARTIAL_CODEC_VERSION: 'unsupported_partial_codec_version',
  UNSUPPORTED_PARTIAL_SCHEMA: 'unsupported_partial_schema',
});

const PARTIAL_SCHEMA_TYPE = Object.freeze({
  ARRAY: 'array',
  BOOLEAN: 'boolean',
  INTEGER: 'integer',
  NULL: 'null',
  NUMBER: 'number',
  OBJECT: 'object',
  RECORD: 'record',
  STRING: 'string',
  TEXT: 'text',
});

const ADMITTED_SCHEMA_TYPES = Object.freeze(new Set(
  Object.values(PARTIAL_SCHEMA_TYPE),
));

const GROUP_KEY_TAG = Object.freeze({
  NUL_PREFIX: '\u0000',
  NUMBER_PREFIX: '\u0000num:',
  STRING_PREFIX: '\u0000str:',
});

const ENVELOPE_FIELD = Object.freeze({
  SCHEMA: 'schema',
  VALUE: 'value',
  VERSION: 'v',
});

const ENVELOPE_SORTED_KEYS = Object.freeze([
  ENVELOPE_FIELD.SCHEMA,
  ENVELOPE_FIELD.VERSION,
  ENVELOPE_FIELD.VALUE,
]);

const JSON_TOKEN = Object.freeze({
  ARRAY_CLOSE: ']',
  ARRAY_EMPTY: '[]',
  ARRAY_OPEN: '[',
  BACKSLASH: '\\',
  COLON: ':',
  COMMA: ',',
  FALSE: 'false',
  NULL: 'null',
  OBJECT_CLOSE: '}',
  OBJECT_EMPTY: '{}',
  OBJECT_OPEN: '{',
  QUOTE: '"',
  TRUE: 'true',
  ZERO: '0',
});

const SURROGATE_RANGE = Object.freeze({
  HIGH_END: 0xDBFF,
  HIGH_START: 0xD800,
  LOW_END: 0xDFFF,
  LOW_START: 0xDC00,
});

const UTF8_TEXT_ENCODER = new globalThis.TextEncoder();
const PARTIAL_CODEC_ERROR_NAME = 'PartialCodecError';
const ASCII_SPACE_CODE = 32;
const NEWLINE_CHAR = '\n';
const LIMIT_KEY = Object.freeze({
  CAMEL_ARRAY: 'maxArrayLength', CAMEL_BYTES: 'maxContributionBytes',
  CAMEL_DEPTH: 'maxDepth', CAMEL_KEY_BYTES: 'maxGroupKeyBytes',
  CAMEL_RECORD: 'maxRecordFields', CAMEL_STRING: 'maxStringBytes',
  UPPER_ARRAY: 'MAX_ARRAY_LENGTH', UPPER_BYTES: 'MAX_CONTRIBUTION_BYTES',
  UPPER_DEPTH: 'MAX_DEPTH', UPPER_KEY_BYTES: 'MAX_GROUP_KEY_BYTES',
  UPPER_RECORD: 'MAX_RECORD_FIELDS', UPPER_STRING: 'MAX_STRING_BYTES',
});

const ERROR_MESSAGE = Object.freeze({
  ARRAY_ELEMENTS_INVALID: 'array must be a dense standard array of data values',
  ARRAY_LENGTH_OVERFLOW: 'partial array exceeds maximum element count',
  BYTE_LIMIT_EXCEEDED: 'encoded partial exceeds maximum byte budget',
  CYCLE_DETECTED: 'cyclic partial value is not permitted',
  DEPTH_LIMIT_EXCEEDED: 'partial nesting exceeds maximum depth',
  DUPLICATE_KEY: 'duplicate object key in partial wire payload',
  ENVELOPE_INVALID: 'partial envelope must contain schema, v, and value',
  ENVELOPE_SCHEMA_MISMATCH: 'partial envelope schema does not match expected',
  ENVELOPE_VERSION_UNSUPPORTED: 'unsupported partial codec envelope version',
  GROUP_KEY_INVALID: 'group key must be a non-empty valid string or number',
  MALFORMED_JSON: 'partial wire payload is not valid JSON',
  NON_CANONICAL_WIRE: 'partial wire payload is not in canonical JSON form',
  RECORD_FIELDS_OVERFLOW: 'partial record exceeds maximum field count',
  RECORD_INVALID: 'record must be a plain object with enumerable data fields',
  SCHEMA_FIELD_MISSING: 'required partial schema field is missing',
  SCHEMA_FIELD_UNKNOWN: 'unknown field is not permitted by closed schema',
  SCHEMA_INVALID: 'partial schema descriptor is invalid',
  SCHEMA_TYPE_MISMATCH: 'partial value does not match declared partial schema',
  STRING_BYTE_OVERFLOW: 'partial string exceeds maximum UTF-8 byte length',
  UNICODE_INVALID: 'partial string contains unpaired Unicode surrogate',
  UNSAFE_INTEGER: 'integer partial value must be an IEEE-754 safe integer',
  VALUE_INVALID: 'partial value is outside the closed finite-JSON grammar',
});

const CANONICAL_PARTIAL_GOLDEN_VECTORS = Object.freeze([
  Object.freeze({
    canonicalWire: '0',
    description: 'negative zero normalizes to positive zero',
    input: -0,
  }),
  Object.freeze({
    canonicalWire: '{"a":1,"b":[true,null,"ok"],"c":{"x":0,"y":2.5}}',
    description: 'nested record keys sort by UTF-16 code units',
    input: Object.freeze({
      c: Object.freeze({y: 2.5, x: -0}),
      b: Object.freeze([true, null, 'ok']),
      a: 1,
    }),
  }),
  Object.freeze({
    canonicalWire: '{"\\n":"line","a":1,"z":2,"😀":4,"\uE000":3}',
    description: 'UTF-16 code-unit key order across control, BMP, and astral',
    input: Object.freeze({'😀': 4, '\uE000': 3, 'z': 2, 'a': 1, '\n': 'line'}),
  }),
]);

const CODE = PARTIAL_CODEC_ERROR_CODE;
const MSG = ERROR_MESSAGE;

class PartialCodecError extends Error {
  constructor(code, message, options = {}) {
    super(message, options);
    this.name = PARTIAL_CODEC_ERROR_NAME;
    this.code = code;
  }
}

function createPartialCodecError(code, message, options) {
  return new PartialCodecError(code, message, options);
}

function failCodec(code, message, options) {
  throw new PartialCodecError(code, message, options);
}

function utf8ByteLength(text) {
  return UTF8_TEXT_ENCODER.encode(text).byteLength;
}

function isWellFormedUnicode(text) {
  if (typeof text !== 'string') return false;
  for (let index = 0; index < text.length; index += 1) {
    const code = text.charCodeAt(index);
    if (code >= SURROGATE_RANGE.HIGH_START &&
        code <= SURROGATE_RANGE.HIGH_END) {
      const next = index + 1 < text.length ? text.charCodeAt(index + 1) : 0;
      if (next < SURROGATE_RANGE.LOW_START || next > SURROGATE_RANGE.LOW_END) {
        return false;
      }
      index += 1;
    } else if (code >= SURROGATE_RANGE.LOW_START &&
        code <= SURROGATE_RANGE.LOW_END) {
      return false;
    }
  }
  return true;
}

function resolveLimit(overrides, camelKey, upperKey) {
  if (!overrides || typeof overrides !== 'object') {
    return DEFAULT_PARTIAL_CODEC_LIMITS[upperKey];
  }
  return overrides[camelKey] ??
    overrides[upperKey] ??
    DEFAULT_PARTIAL_CODEC_LIMITS[upperKey];
}

function resolveCodecLimits(overrides) {
  if (!overrides || typeof overrides !== 'object') {
    return DEFAULT_PARTIAL_CODEC_LIMITS;
  }
  return Object.freeze({
    MAX_ARRAY_LENGTH: resolveLimit(
      overrides, LIMIT_KEY.CAMEL_ARRAY, LIMIT_KEY.UPPER_ARRAY),
    MAX_CONTRIBUTION_BYTES: resolveLimit(
      overrides, LIMIT_KEY.CAMEL_BYTES, LIMIT_KEY.UPPER_BYTES),
    MAX_DEPTH: resolveLimit(
      overrides, LIMIT_KEY.CAMEL_DEPTH, LIMIT_KEY.UPPER_DEPTH),
    MAX_GROUP_KEY_BYTES: resolveLimit(
      overrides, LIMIT_KEY.CAMEL_KEY_BYTES, LIMIT_KEY.UPPER_KEY_BYTES),
    MAX_RECORD_FIELDS: resolveLimit(
      overrides, LIMIT_KEY.CAMEL_RECORD, LIMIT_KEY.UPPER_RECORD),
    MAX_STRING_BYTES: resolveLimit(
      overrides, LIMIT_KEY.CAMEL_STRING, LIMIT_KEY.UPPER_STRING),
  });
}

function compareCanonicalStrings(left, right) {
  if (left < right) return -1;
  if (left > right) return 1;
  return 0;
}

function sortStringsByCodeUnit(values) {
  return [...values].sort(compareCanonicalStrings);
}

function validateAndCanonicalizeString(value, limits) {
  if (!isWellFormedUnicode(value)) {
    failCodec(CODE.INVALID_UNICODE_STRING, MSG.UNICODE_INVALID);
  }
  if (utf8ByteLength(value) > limits.MAX_STRING_BYTES) {
    failCodec(CODE.BYTE_OVERFLOW, MSG.STRING_BYTE_OVERFLOW);
  }
  return value;
}

function validateAndCanonicalizeNumber(value) {
  if (!Number.isFinite(value)) {
    failCodec(CODE.INVALID_PARTIAL_VALUE, MSG.VALUE_INVALID);
  }
  if (Number.isInteger(value) && !Number.isSafeInteger(value)) {
    failCodec(CODE.UNSAFE_INTEGER_VALUE, MSG.UNSAFE_INTEGER);
  }
  return Object.is(value, -0) ? 0 : value;
}

function enterContainer(value, depth, limits, ancestors) {
  if (ancestors.has(value)) failCodec(CODE.CYCLIC_PARTIAL_VALUE, MSG.CYCLE_DETECTED);
  const nextDepth = depth + 1;
  if (nextDepth > limits.MAX_DEPTH) {
    failCodec(CODE.DEPTH_OVERFLOW, MSG.DEPTH_LIMIT_EXCEEDED);
  }
  ancestors.add(value);
  return nextDepth;
}

function canonicalizeArrayNode(value, depth, limits, ancestors) {
  if (!isDenseDataArray(value)) {
    failCodec(CODE.INVALID_PARTIAL_VALUE, MSG.ARRAY_ELEMENTS_INVALID);
  }
  const nextDepth = enterContainer(value, depth, limits, ancestors);
  if (value.length > limits.MAX_ARRAY_LENGTH) {
    ancestors.delete(value);
    failCodec(CODE.ELEMENT_COUNT_OVERFLOW, MSG.ARRAY_LENGTH_OVERFLOW);
  }
  const items = [];
  try {
    for (let index = 0; index < value.length; index += 1) {
      items.push(
        canonicalizeValueNode(value[index], nextDepth, limits, ancestors));
    }
  } finally {
    ancestors.delete(value);
  }
  return Object.freeze(items);
}

function canonicalizeRecordNode(value, depth, limits, ancestors) {
  if (!isRecord(value)) failCodec(CODE.INVALID_PARTIAL_VALUE, MSG.RECORD_INVALID);
  const ownKeys = Object.keys(value);
  const nextDepth = enterContainer(value, depth, limits, ancestors);
  if (ownKeys.length > limits.MAX_RECORD_FIELDS) {
    ancestors.delete(value);
    failCodec(CODE.ELEMENT_COUNT_OVERFLOW, MSG.RECORD_FIELDS_OVERFLOW);
  }
  const sortedKeys = sortStringsByCodeUnit(ownKeys);
  const record = {};
  try {
    for (let index = 0; index < sortedKeys.length; index += 1) {
      const key = validateAndCanonicalizeString(sortedKeys[index], limits);
      const child = canonicalizeValueNode(
        value[key], nextDepth, limits, ancestors);
      Object.defineProperty(record, key, {
        configurable: false, enumerable: true, value: child, writable: false,
      });
    }
  } finally {
    ancestors.delete(value);
  }
  return Object.freeze(record);
}

function canonicalizeValueNode(value, depth, limits, ancestors) {
  if (value === null || typeof value === 'boolean') return value;
  if (typeof value === 'number') return validateAndCanonicalizeNumber(value);
  if (typeof value === 'string') {
    return validateAndCanonicalizeString(value, limits);
  }
  if (Array.isArray(value)) {
    return canonicalizeArrayNode(value, depth, limits, ancestors);
  }
  return canonicalizeRecordNode(value, depth, limits, ancestors);
}

function serializeCanonicalNode(value) {
  if (value === null) return JSON_TOKEN.NULL;
  if (typeof value === 'boolean') {
    return value ? JSON_TOKEN.TRUE : JSON_TOKEN.FALSE;
  }
  if (typeof value === 'number') {
    return Object.is(value, -0) ? JSON_TOKEN.ZERO : String(value);
  }
  if (typeof value === 'string') return JSON.stringify(value);
  if (Array.isArray(value)) {
    if (value.length === 0) return JSON_TOKEN.ARRAY_EMPTY;
    const parts = value.map(serializeCanonicalNode);
    return `${JSON_TOKEN.ARRAY_OPEN}${parts.join(JSON_TOKEN.COMMA)}${JSON_TOKEN.ARRAY_CLOSE}`;
  }
  const keys = sortStringsByCodeUnit(Object.keys(value));
  if (keys.length === 0) return JSON_TOKEN.OBJECT_EMPTY;
  const pairs = keys.map(
    (key) => `${JSON.stringify(key)}${JSON_TOKEN.COLON}${serializeCanonicalNode(value[key])}`,
  );
  return `${JSON_TOKEN.OBJECT_OPEN}${pairs.join(JSON_TOKEN.COMMA)}${JSON_TOKEN.OBJECT_CLOSE}`;
}

function normalizeRecordSchemaFields(rawFields) {
  const keys = rawFields && typeof rawFields === 'object' && !Array.isArray(rawFields) ?
    sortStringsByCodeUnit(Object.keys(rawFields)) :
    [];
  if (keys.length === 0) {
    failCodec(CODE.INVALID_PARTIAL_SCHEMA, MSG.SCHEMA_INVALID);
  }
  const fields = {};
  for (const key of keys) {
    fields[key] = normalizePartialValueSchema(rawFields[key]);
  }
  return Object.freeze(fields);
}

function isAdmittedSchemaDescriptor(rawSchema) {
  return Boolean(
    rawSchema && typeof rawSchema === 'object' && !Array.isArray(rawSchema) &&
    typeof rawSchema.type === 'string' && ADMITTED_SCHEMA_TYPES.has(rawSchema.type),
  );
}

function normalizePartialValueSchema(rawSchema) {
  if (rawSchema === undefined || rawSchema === null) return null;
  if (!isAdmittedSchemaDescriptor(rawSchema)) {
    failCodec(CODE.INVALID_PARTIAL_SCHEMA, MSG.SCHEMA_INVALID);
  }
  const {type} = rawSchema;
  const normalized = {
    nullable: rawSchema.nullable === true,
    optional: rawSchema.optional === true,
    type,
  };
  if (type === PARTIAL_SCHEMA_TYPE.ARRAY) {
    if (!rawSchema.items) {
      failCodec(CODE.INVALID_PARTIAL_SCHEMA, MSG.SCHEMA_INVALID);
    }
    normalized.items = normalizePartialValueSchema(rawSchema.items);
  } else if (type === PARTIAL_SCHEMA_TYPE.RECORD ||
      type === PARTIAL_SCHEMA_TYPE.OBJECT) {
    normalized.additionalProperties = rawSchema.additionalProperties === true;
    normalized.fields = normalizeRecordSchemaFields(rawSchema.fields);
  }
  return Object.freeze(normalized);
}

function matchesScalarSchemaType(value, type) {
  if (type === PARTIAL_SCHEMA_TYPE.NULL) return value === null;
  if (type === PARTIAL_SCHEMA_TYPE.BOOLEAN) return typeof value === 'boolean';
  if (type === PARTIAL_SCHEMA_TYPE.INTEGER) {
    return typeof value === 'number' && Number.isSafeInteger(value);
  }
  if (type === PARTIAL_SCHEMA_TYPE.NUMBER) {
    return typeof value === 'number' && Number.isFinite(value);
  }
  return (type === PARTIAL_SCHEMA_TYPE.TEXT ||
    type === PARTIAL_SCHEMA_TYPE.STRING) && typeof value === 'string';
}

function validateRecordAgainstSchema(value, schema) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    failCodec(CODE.INVALID_PARTIAL_VALUE, MSG.SCHEMA_TYPE_MISMATCH);
  }
  for (const fieldName of Object.keys(schema.fields)) {
    const fieldSchema = schema.fields[fieldName];
    if (!Object.prototype.hasOwnProperty.call(value, fieldName)) {
      if (fieldSchema.optional === true) continue;
      failCodec(
        CODE.INVALID_PARTIAL_VALUE, `${MSG.SCHEMA_FIELD_MISSING}: ${fieldName}`);
    }
    validateValueAgainstSchema(value[fieldName], fieldSchema);
  }
  if (schema.additionalProperties === true) return;
  for (const actualKey of Object.keys(value)) {
    if (!Object.prototype.hasOwnProperty.call(schema.fields, actualKey)) {
      failCodec(
        CODE.INVALID_PARTIAL_VALUE, `${MSG.SCHEMA_FIELD_UNKNOWN}: ${actualKey}`);
    }
  }
}

function validateArrayAgainstSchema(value, schema) {
  if (!Array.isArray(value)) {
    failCodec(CODE.INVALID_PARTIAL_VALUE, MSG.SCHEMA_TYPE_MISMATCH);
  }
  for (let index = 0; index < value.length; index += 1) {
    validateValueAgainstSchema(value[index], schema.items);
  }
}

function validateValueAgainstSchema(value, rawSchema) {
  const schema = rawSchema && Object.isFrozen(rawSchema) && rawSchema.type ?
    rawSchema :
    normalizePartialValueSchema(rawSchema);
  if (!schema) return;
  if (value === null) {
    if (schema.nullable === true || schema.type === PARTIAL_SCHEMA_TYPE.NULL) {
      return;
    }
    failCodec(CODE.INVALID_PARTIAL_VALUE, MSG.SCHEMA_TYPE_MISMATCH);
  }
  if (schema.type === PARTIAL_SCHEMA_TYPE.ARRAY) {
    validateArrayAgainstSchema(value, schema);
  } else if (schema.type === PARTIAL_SCHEMA_TYPE.RECORD ||
      schema.type === PARTIAL_SCHEMA_TYPE.OBJECT) {
    validateRecordAgainstSchema(value, schema);
  } else if (!matchesScalarSchemaType(value, schema.type)) {
    failCodec(CODE.INVALID_PARTIAL_VALUE, MSG.SCHEMA_TYPE_MISMATCH);
  }
}

function readJsonStringToken(wire, startIndex) {
  let cursor = startIndex + 1;
  while (cursor < wire.length) {
    const ch = wire[cursor];
    if (ch === JSON_TOKEN.QUOTE) {
      return {
        endIndex: cursor + 1,
        rawToken: wire.slice(startIndex, cursor + 1),
      };
    }
    cursor += ch === JSON_TOKEN.BACKSLASH ? 2 : 1;
  }
  failCodec(CODE.MALFORMED_PARTIAL_WIRE, MSG.MALFORMED_JSON);
}

function assertWellFormedEscapedStringToken(rawToken) {
  let parsed;
  try {
    parsed = JSON.parse(rawToken);
  } catch (error) {
    failCodec(CODE.MALFORMED_PARTIAL_WIRE, MSG.MALFORMED_JSON, {cause: error});
  }
  if (!isWellFormedUnicode(parsed)) {
    failCodec(CODE.INVALID_UNICODE_STRING, MSG.UNICODE_INVALID);
  }
  return parsed;
}

function nextNonWhitespaceChar(wire, startIndex) {
  let index = startIndex;
  while (index < wire.length && wire.charCodeAt(index) <= ASCII_SPACE_CODE) {
    index += 1;
  }
  return index < wire.length ? wire[index] : '';
}

function pushScannerContainer(stack, kind, maxDepth) {
  stack.push(
    kind === JSON_TOKEN.OBJECT_OPEN ? {keys: new Set(), kind} : {kind});
  if (stack.length > maxDepth) {
    failCodec(CODE.DEPTH_OVERFLOW, MSG.DEPTH_LIMIT_EXCEEDED);
  }
}

function recordScannedStringToken(wire, startIndex, stack) {
  const {endIndex, rawToken} = readJsonStringToken(wire, startIndex);
  const decoded = assertWellFormedEscapedStringToken(rawToken);
  const top = stack.length > 0 ? stack[stack.length - 1] : null;
  if (top && top.kind === JSON_TOKEN.OBJECT_OPEN &&
      nextNonWhitespaceChar(wire, endIndex) === JSON_TOKEN.COLON) {
    if (top.keys.has(decoded)) {
      failCodec(CODE.DUPLICATE_OBJECT_KEY, `${MSG.DUPLICATE_KEY}: ${decoded}`);
    }
    top.keys.add(decoded);
  }
  return endIndex;
}

function scanWireStructureAndDuplicateKeys(wire, maxDepth) {
  const stack = [];
  let cursor = 0;
  while (cursor < wire.length) {
    const ch = wire[cursor];
    if (ch === JSON_TOKEN.QUOTE) {
      cursor = recordScannedStringToken(wire, cursor, stack);
      continue;
    }
    if (ch === JSON_TOKEN.OBJECT_OPEN || ch === JSON_TOKEN.ARRAY_OPEN) {
      pushScannerContainer(stack, ch, maxDepth);
    } else if (ch === JSON_TOKEN.OBJECT_CLOSE ||
        ch === JSON_TOKEN.ARRAY_CLOSE) {
      stack.pop();
    }
    cursor += 1;
  }
}

function validateCanonicalPartialValue(value, options = {}) {
  const limits = resolveCodecLimits(options.limits ?? options);
  const canonical = canonicalizeValueNode(value, 0, limits, new Set());
  if (options.schema) validateValueAgainstSchema(canonical, options.schema);
  return canonical;
}

function encodeCanonicalPartialValue(value, options = {}) {
  const limits = resolveCodecLimits(options.limits ?? options);
  const canonical = validateCanonicalPartialValue(value, {...options, limits});
  const wire = serializeCanonicalNode(canonical);
  if (utf8ByteLength(wire) > limits.MAX_CONTRIBUTION_BYTES) {
    failCodec(CODE.BYTE_OVERFLOW, MSG.BYTE_LIMIT_EXCEEDED);
  }
  return wire;
}

function parseJsonOrThrowMalformed(wireBytes) {
  try {
    return JSON.parse(wireBytes);
  } catch (error) {
    failCodec(CODE.MALFORMED_PARTIAL_WIRE, MSG.MALFORMED_JSON, {cause: error});
  }
}

function decodeCanonicalPartialValue(wireBytes, options = {}) {
  if (typeof wireBytes !== 'string' || wireBytes.length === 0) {
    failCodec(CODE.MALFORMED_PARTIAL_WIRE, MSG.MALFORMED_JSON);
  }
  const limits = resolveCodecLimits(options.limits ?? options);
  if (!isWellFormedUnicode(wireBytes)) {
    failCodec(CODE.INVALID_UNICODE_STRING, MSG.UNICODE_INVALID);
  }
  if (utf8ByteLength(wireBytes) > limits.MAX_CONTRIBUTION_BYTES) {
    failCodec(CODE.BYTE_OVERFLOW, MSG.BYTE_LIMIT_EXCEEDED);
  }
  scanWireStructureAndDuplicateKeys(wireBytes, limits.MAX_DEPTH);
  const parsed = parseJsonOrThrowMalformed(wireBytes);
  const canonical = validateCanonicalPartialValue(parsed, {...options, limits});
  if (serializeCanonicalNode(canonical) !== wireBytes) {
    failCodec(CODE.NON_CANONICAL_PARTIAL_WIRE, MSG.NON_CANONICAL_WIRE);
  }
  return canonical;
}

function encodeCanonicalPartialEnvelope(value, options = {}) {
  const limits = resolveCodecLimits(options.limits ?? options);
  const schemaId = options.schemaId ?? DEFAULT_PARTIAL_SCHEMA_ID;
  if (typeof schemaId !== 'string' || schemaId.length === 0 ||
      !isWellFormedUnicode(schemaId)) {
    failCodec(CODE.INVALID_PARTIAL_SCHEMA, MSG.SCHEMA_INVALID);
  }
  const canonicalValue = validateCanonicalPartialValue(value, {
    ...options,
    limits,
  });
  const envelope = Object.create(null);
  envelope[ENVELOPE_FIELD.SCHEMA] = schemaId;
  envelope[ENVELOPE_FIELD.VERSION] = PARTIAL_CODEC_VERSION;
  envelope[ENVELOPE_FIELD.VALUE] = canonicalValue;
  const wire = serializeCanonicalNode(envelope);
  if (utf8ByteLength(wire) > limits.MAX_CONTRIBUTION_BYTES) {
    failCodec(CODE.BYTE_OVERFLOW, MSG.BYTE_LIMIT_EXCEEDED);
  }
  return wire;
}

function isEnvelopeRecordShape(decoded) {
  if (!decoded || typeof decoded !== 'object' || Array.isArray(decoded)) {
    return false;
  }
  const keys = Object.keys(decoded);
  return keys.length === ENVELOPE_SORTED_KEYS.length &&
    keys.every((key, index) => key === ENVELOPE_SORTED_KEYS[index]);
}

function unwrapValidatedEnvelope(decoded, options = {}) {
  if (!isEnvelopeRecordShape(decoded)) {
    failCodec(CODE.INVALID_PARTIAL_VALUE, MSG.ENVELOPE_INVALID);
  }
  if (decoded[ENVELOPE_FIELD.VERSION] !== PARTIAL_CODEC_VERSION) {
    failCodec(
      CODE.UNSUPPORTED_PARTIAL_CODEC_VERSION, MSG.ENVELOPE_VERSION_UNSUPPORTED);
  }
  const schemaId = decoded[ENVELOPE_FIELD.SCHEMA];
  if (typeof schemaId !== 'string' || schemaId.length === 0 ||
      (options.expectedSchemaId && schemaId !== options.expectedSchemaId)) {
    failCodec(CODE.UNSUPPORTED_PARTIAL_SCHEMA, MSG.ENVELOPE_SCHEMA_MISMATCH);
  }
  const innerValue = decoded[ENVELOPE_FIELD.VALUE];
  if (options.schema) validateValueAgainstSchema(innerValue, options.schema);
  return Object.freeze({
    schema: schemaId,
    v: PARTIAL_CODEC_VERSION,
    value: innerValue,
  });
}

function decodeCanonicalPartialEnvelope(wireBytes, options = {}) {
  const limits = resolveCodecLimits(options.limits ?? options);
  const decoded = decodeCanonicalPartialValue(wireBytes, {
    limits: {...limits, MAX_DEPTH: limits.MAX_DEPTH + 1},
  });
  return unwrapValidatedEnvelope(decoded, options);
}

function decodeCanonicalPartialWire(wireBytes, options = {}) {
  const limits = resolveCodecLimits(options.limits ?? options);
  const decoded = decodeCanonicalPartialValue(wireBytes, {
    limits: {...limits, MAX_DEPTH: limits.MAX_DEPTH + 1},
  });
  if (isEnvelopeRecordShape(decoded)) {
    const unwrapped = unwrapValidatedEnvelope(decoded, options);
    const valueOnly = validateCanonicalPartialValue(unwrapped.value, {
      ...options,
      limits,
    });
    return Object.freeze({
      canonicalValueJson: serializeCanonicalNode(valueOnly),
      envelope: unwrapped,
      schema: unwrapped.schema,
      v: unwrapped.v,
      value: valueOnly,
    });
  }
  const validated = validateCanonicalPartialValue(decoded, {
    ...options,
    limits,
  });
  const canonicalValueJson = serializeCanonicalNode(validated);
  const schemaId = options.schemaId ?? DEFAULT_PARTIAL_SCHEMA_ID;
  return Object.freeze({
    canonicalValueJson,
    envelope: Object.freeze({
      schema: schemaId,
      v: PARTIAL_CODEC_VERSION,
      value: validated,
    }),
    schema: schemaId,
    v: PARTIAL_CODEC_VERSION,
    value: validated,
  });
}

function encodeCanonicalGroupKey(groupKey, options = {}) {
  const limits = resolveCodecLimits(options.limits ?? options);
  if (typeof groupKey === 'number') {
    const normalized = validateAndCanonicalizeNumber(groupKey);
    return `${GROUP_KEY_TAG.NUMBER_PREFIX}${String(normalized)}`;
  }
  if (typeof groupKey !== 'string' || groupKey.length === 0) {
    failCodec(CODE.INVALID_GROUP_KEY, MSG.GROUP_KEY_INVALID);
  }
  if (!isWellFormedUnicode(groupKey)) {
    failCodec(CODE.INVALID_UNICODE_STRING, MSG.UNICODE_INVALID);
  }
  if (utf8ByteLength(groupKey) > limits.MAX_GROUP_KEY_BYTES) {
    failCodec(CODE.BYTE_OVERFLOW, MSG.STRING_BYTE_OVERFLOW);
  }
  return groupKey.startsWith(GROUP_KEY_TAG.NUL_PREFIX) ?
    `${GROUP_KEY_TAG.STRING_PREFIX}${groupKey}` :
    groupKey;
}

function decodeCanonicalGroupKey(wireGroupKey, options = {}) {
  const limits = resolveCodecLimits(options.limits ?? options);
  if (typeof wireGroupKey !== 'string' || wireGroupKey.length === 0) {
    failCodec(CODE.INVALID_GROUP_KEY, MSG.GROUP_KEY_INVALID);
  }
  if (!isWellFormedUnicode(wireGroupKey)) {
    failCodec(CODE.INVALID_UNICODE_STRING, MSG.UNICODE_INVALID);
  }
  if (wireGroupKey.startsWith(GROUP_KEY_TAG.NUMBER_PREFIX)) {
    const numText = wireGroupKey.slice(GROUP_KEY_TAG.NUMBER_PREFIX.length);
    const validated = validateAndCanonicalizeNumber(Number(numText));
    if (String(validated) !== numText) {
      failCodec(CODE.NON_CANONICAL_PARTIAL_WIRE, MSG.GROUP_KEY_INVALID);
    }
    return validated;
  }
  const plainKey = wireGroupKey.startsWith(GROUP_KEY_TAG.STRING_PREFIX) ?
    wireGroupKey.slice(GROUP_KEY_TAG.STRING_PREFIX.length) :
    wireGroupKey;
  if (plainKey.length === 0 ||
      utf8ByteLength(plainKey) > limits.MAX_GROUP_KEY_BYTES) {
    failCodec(CODE.INVALID_GROUP_KEY, MSG.GROUP_KEY_INVALID);
  }
  return plainKey;
}

const GUEST_CODEC_FUNCTIONS = Object.freeze([
  PartialCodecError, createPartialCodecError, failCodec, utf8ByteLength,
  isWellFormedUnicode, resolveLimit, resolveCodecLimits,
  compareCanonicalStrings, sortStringsByCodeUnit,
  validateAndCanonicalizeString, validateAndCanonicalizeNumber, enterContainer,
  canonicalizeArrayNode, canonicalizeRecordNode, canonicalizeValueNode,
  serializeCanonicalNode, normalizeRecordSchemaFields,
  isAdmittedSchemaDescriptor, normalizePartialValueSchema,
  matchesScalarSchemaType, validateRecordAgainstSchema,
  validateArrayAgainstSchema, validateValueAgainstSchema, readJsonStringToken,
  assertWellFormedEscapedStringToken, nextNonWhitespaceChar,
  pushScannerContainer, recordScannedStringToken,
  scanWireStructureAndDuplicateKeys, validateCanonicalPartialValue,
  encodeCanonicalPartialValue, parseJsonOrThrowMalformed,
  decodeCanonicalPartialValue, encodeCanonicalGroupKey, decodeCanonicalGroupKey,
]);

const GUEST_PREDICATE_PREAMBLE = [
  'function isDenseDataArray(v) {',
  '  if (!Array.isArray(v) || Object.getPrototypeOf(v) !== Array.prototype) return false;',
  '  const keys = Reflect.ownKeys(v);',
  '  if (keys.length !== v.length + 1) return false;',
  '  for (let i = 0; i < v.length; i += 1) {',
  '    const d = Object.getOwnPropertyDescriptor(v, String(i));',
  '    if (!d || !d.enumerable || !Object.prototype.hasOwnProperty.call(d, \'value\')) return false;',
  '  }',
  '  return true;',
  '}',
  'function isRecord(v) {',
  '  if (!v || typeof v !== \'object\' || Array.isArray(v)) return false;',
  '  const p = Object.getPrototypeOf(v);',
  '  if (p !== Object.prototype && p !== null) return false;',
  '  for (const k of Reflect.ownKeys(v)) {',
  '    if (typeof k !== \'string\') return false;',
  '    const d = Object.getOwnPropertyDescriptor(v, k);',
  '    if (!d || !d.enumerable || !Object.prototype.hasOwnProperty.call(d, \'value\')) return false;',
  '  }',
  '  return true;',
  '}',
].join(NEWLINE_CHAR);

const GUEST_CODEC_SOURCE = [
  `const DEFAULT_PARTIAL_CODEC_LIMITS = Object.freeze(${JSON.stringify(DEFAULT_PARTIAL_CODEC_LIMITS)});`,
  `const PARTIAL_CODEC_ERROR_CODE = Object.freeze(${JSON.stringify(PARTIAL_CODEC_ERROR_CODE)});`,
  `const PARTIAL_SCHEMA_TYPE = Object.freeze(${JSON.stringify(PARTIAL_SCHEMA_TYPE)});`,
  'const ADMITTED_SCHEMA_TYPES = Object.freeze(new Set(Object.values(PARTIAL_SCHEMA_TYPE)));',
  `const GROUP_KEY_TAG = Object.freeze(${JSON.stringify(GROUP_KEY_TAG)});`,
  `const JSON_TOKEN = Object.freeze(${JSON.stringify(JSON_TOKEN)});`,
  `const SURROGATE_RANGE = Object.freeze(${JSON.stringify(SURROGATE_RANGE)});`,
  `const ERROR_MESSAGE = Object.freeze(${JSON.stringify(ERROR_MESSAGE)});`,
  `const LIMIT_KEY = Object.freeze(${JSON.stringify(LIMIT_KEY)});`,
  'const CODE = PARTIAL_CODEC_ERROR_CODE;',
  'const MSG = ERROR_MESSAGE;',
  'const UTF8_TEXT_ENCODER = new globalThis.TextEncoder();',
  `const PARTIAL_CODEC_ERROR_NAME = ${JSON.stringify(PARTIAL_CODEC_ERROR_NAME)};`,
  `const ASCII_SPACE_CODE = ${ASCII_SPACE_CODE};`,
  GUEST_PREDICATE_PREAMBLE,
  ...GUEST_CODEC_FUNCTIONS.map((fn) => fn.toString()),
].join(NEWLINE_CHAR);

function renderGuestCanonicalPartialCodecSource() {
  return GUEST_CODEC_SOURCE;
}

export {
  CANONICAL_PARTIAL_GOLDEN_VECTORS, DEFAULT_PARTIAL_SCHEMA_ID,
  PARTIAL_CODEC_ERROR_CODE, PARTIAL_CODEC_VERSION, compareCanonicalStrings,
  decodeCanonicalGroupKey, decodeCanonicalPartialEnvelope,
  decodeCanonicalPartialValue, decodeCanonicalPartialWire,
  encodeCanonicalGroupKey, encodeCanonicalPartialEnvelope,
  encodeCanonicalPartialValue, isWellFormedUnicode,
  normalizePartialValueSchema, renderGuestCanonicalPartialCodecSource,
  validateCanonicalPartialValue, validateValueAgainstSchema,
};

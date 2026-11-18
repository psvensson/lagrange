import assert from 'node:assert/strict';
import {spawnSync} from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {describe, it} from 'node:test';

import {
  decodeCanonicalPartialValue,
  encodeCanonicalPartialValue,
} from '../../src/service/call-canonical-partial-codec.js';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const VECTORS_PATH = path.join(
  ROOT, 'test/service/call-finite-json-portability-v1.vectors.json');
const PYTHON_REFERENCE = path.join(
  ROOT, 'test/service/call-finite-json-portability-reference.py');
const VECTORS = JSON.parse(fs.readFileSync(VECTORS_PATH, 'utf8'));
const LIMITS = VECTORS.defaultLimits;
const PYTHON_MAX_BYTES = 1024 * 1024;
const PYTHON_TIMEOUT_MS = 15000;

function runPythonReference(manifest) {
  const result = spawnSync('python3', [PYTHON_REFERENCE, '-'], {
    encoding: 'utf8', input: JSON.stringify(manifest),
    maxBuffer: PYTHON_MAX_BYTES, timeout: PYTHON_TIMEOUT_MS,
  });
  assert.equal(result.error, undefined);
  assert.equal(result.status, 0, result.stderr);
  return JSON.parse(result.stdout).results;
}

function nestArrays(depth) {
  let value = 0;
  for (let index = 0; index < depth; index += 1) value = [value];
  return value;
}

function numberedRecord(size) {
  const record = Object.create(null);
  for (let index = 0; index < size; index += 1) {
    record[`k${String(index).padStart(3, '0')}`] = index;
  }
  return record;
}

describe('Call Cell finite-JSON Q1b value-only independent portability', () => {
  it('source codec reproduces every independently authored canonical encoding', () => {
    for (const vector of VECTORS.encode) {
      const value = JSON.parse(vector.inputJson);
      const encoded = encodeCanonicalPartialValue(value, {limits: LIMITS});
      assert.equal(encoded, vector.wire, vector.id);
      const decoded = decodeCanonicalPartialValue(vector.wire, {limits: LIMITS});
      assert.equal(
        encodeCanonicalPartialValue(decoded, {limits: LIMITS}),
        vector.wire, vector.id);
    }
  });

  it('source codec refuses every independently authored noncanonical wire', () => {
    for (const vector of VECTORS.rejectWire) {
      assert.throws(
        () => decodeCanonicalPartialValue(vector.wire, {limits: LIMITS}),
        {code: vector.code}, vector.id);
    }
  });

  it('source and standalone Python return matching independently computed results', () => {
    const results = runPythonReference(VECTORS);
    const expected = [
      ...VECTORS.encode.map((item) => ({
        id: item.id, kind: 'encode', wire: item.wire,
      })),
      ...VECTORS.rejectWire.map((item) => ({
        id: item.id, kind: 'decode', error: item.code,
      })),
    ];
    assert.deepEqual(results, expected);
  });

  it('Python reference computes novel inputs without using vector expected fields', () => {
    const altered = {
      defaultLimits: LIMITS,
      encode: [
        {
          id: 'unseen-nested',
          inputJson: '{"z":{"y":[1,2]},"a":null}',
          wire: 'deliberately-false-expected-answer',
        },
        {
          id: 'unseen-small-decimal',
          inputJson: '3.125e-7',
          wire: 'also-false',
        },
      ],
      rejectWire: [
        {
          id: 'unseen-duplicate',
          wire: '{"outer":{"a":1,"\\u0061":2}}',
          code: 'deliberately-false-code',
        },
      ],
    };
    assert.deepEqual(runPythonReference(altered), [
      {id: 'unseen-nested', kind: 'encode', wire: '{"a":null,"z":{"y":[1,2]}}'},
      {id: 'unseen-small-decimal', kind: 'encode', wire: '3.125e-7'},
      {id: 'unseen-duplicate', kind: 'decode', error: 'duplicate_object_key'},
    ]);
  });

  it('enforces default nesting and bounded collection edges', () => {
    const nestedAtLimit = nestArrays(LIMITS.maxDepth);
    const nestedAbove = nestArrays(LIMITS.maxDepth + 1);
    assert.equal(
      encodeCanonicalPartialValue(nestedAtLimit),
      '['.repeat(LIMITS.maxDepth) + '0' + ']'.repeat(LIMITS.maxDepth));
    assert.throws(
      () => encodeCanonicalPartialValue(nestedAbove),
      {code: 'partial_depth_overflow'});
    assert.throws(
      () => decodeCanonicalPartialValue('['.repeat(12000) + '0' +
        ']'.repeat(12000)),
      {code: 'partial_depth_overflow'});

    const arrayAtLimit = Array.from(
      {length: LIMITS.maxArrayLength}, (_value, index) => index);
    assert.equal(
      decodeCanonicalPartialValue(encodeCanonicalPartialValue(arrayAtLimit))
        .length,
      LIMITS.maxArrayLength);
    assert.throws(
      () => encodeCanonicalPartialValue([...arrayAtLimit, 0]),
      {code: 'partial_element_count_overflow'});
    assert.equal(
      Object.keys(decodeCanonicalPartialValue(
        encodeCanonicalPartialValue(numberedRecord(LIMITS.maxRecordFields))))
        .length,
      LIMITS.maxRecordFields);
    assert.throws(
      () => encodeCanonicalPartialValue(
        numberedRecord(LIMITS.maxRecordFields + 1)),
      {code: 'partial_element_count_overflow'});
  });

  it('enforces string UTF-8 and aggregate contribution byte ceilings', () => {
    const asciiAtLimit = 'a'.repeat(LIMITS.maxStringBytes);
    const twoByteAtLimit = 'é'.repeat(LIMITS.maxStringBytes / 2);
    assert.equal(
      decodeCanonicalPartialValue(
        encodeCanonicalPartialValue(asciiAtLimit)),
      asciiAtLimit);
    assert.equal(
      decodeCanonicalPartialValue(
        encodeCanonicalPartialValue(twoByteAtLimit)),
      twoByteAtLimit);
    assert.throws(
      () => encodeCanonicalPartialValue(asciiAtLimit + 'a'),
      {code: 'partial_byte_overflow'});
    assert.throws(
      () => encodeCanonicalPartialValue(twoByteAtLimit + 'é'),
      {code: 'partial_byte_overflow'});
    assert.throws(
      () => encodeCanonicalPartialValue({
        a: asciiAtLimit, b: asciiAtLimit,
        c: asciiAtLimit, d: asciiAtLimit,
      }),
      {code: 'partial_byte_overflow'});
    const aggregateBelow = 'b'.repeat(LIMITS.maxStringBytes - 384);
    assert.ok(
      encodeCanonicalPartialValue({
        a: aggregateBelow, b: aggregateBelow,
        c: aggregateBelow, d: aggregateBelow,
      }).length < LIMITS.maxContributionBytes);
  });

  it('refuses invalid JavaScript values before serialization', () => {
    const cyclic = {};
    cyclic.self = cyclic;
    const accessor = {};
    Object.defineProperty(accessor, 'x', {enumerable: true, get: () => 1});
    const sparse = Array(2);
    sparse[0] = 'present';
    for (const invalid of [
      NaN, Infinity, -Infinity, 9007199254740992, undefined,
      Symbol('not-json'), () => true, cyclic, accessor, sparse,
      new Date(), Object.assign(Object.create(null), {a: BigInt(1)}),
    ]) {
      assert.throws(() => encodeCanonicalPartialValue(invalid), {
        name: 'PartialCodecError',
      });
    }
    const safe = JSON.parse('{"__proto__":{"enabled":true}}');
    assert.equal(
      encodeCanonicalPartialValue(safe),
      '{"__proto__":{"enabled":true}}');
    assert.equal(({}).enabled, undefined);
  });
});

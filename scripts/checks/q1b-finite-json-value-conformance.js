#!/usr/bin/env node

// Read-only Quest probe: the independent Python value codec must reproduce the
// authored boundary vectors and fail when acceptance inputs are mutated. This
// is not a public/production, envelope or group-key conformance certification.
import fs from 'node:fs';
import path from 'node:path';
import {spawnSync} from 'node:child_process';
import {fileURLToPath} from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const VECTORS = path.join(
  ROOT, 'test/service/call-finite-json-portability-v1.vectors.json');
const REFERENCE = path.join(
  ROOT, 'test/service/call-finite-json-portability-reference.py');
const SOURCE_WITNESS = path.join(
  ROOT, 'test/service/call-finite-json-portability-v1.test.js');
const PYTHON_LIMIT_WITNESS = path.join(
  ROOT, 'test/service/call-finite-json-portability-reference-test.py');
const PYTHON = 'python3';
const ENCODING = 'utf8';
const arrayEvery = Function.call.bind(Array.prototype.every);
const arrayIncludes = Function.call.bind(Array.prototype.includes);
const arrayMap = Function.call.bind(Array.prototype.map);
const stringIncludes = Function.call.bind(String.prototype.includes);
const METRIC_FLAG = '--metric';
const REGEX_MULTILINE_FLAG = 'm';
const SUCCESS_MESSAGE = 'Q1b value-only reference and negative controls pass\n';
const EXPECTED_SCHEMA = 'lagrange-portability-finite-json-value-v1';
const EXPECTED_SCOPE = 'value-only';
const EXPECTED_POSITIVE_COUNT = 18;
const EXPECTED_REFUSAL_COUNT = 19;
const OUTPUT_LIMIT_BYTES = 1024 * 1024;
const PYTHON_TIMEOUT_MS = 15000;
const EXPECTED_PYTHON_LIMIT_TESTS = 10;
const REQUIRED_IDS = Object.freeze([
  'negative-zero',
  'safe-positive-integer',
  'safe-negative-integer',
  'decimal-small',
  'exponent-negative',
  'smallest-subnormal',
  'utf16-key-order',
  'escape-normalization',
  'duplicate-key',
  'duplicate-escaped-key',
  'out-of-order-keys',
  'unpaired-high-surrogate',
  'unpaired-low-surrogate-key',
  'unsafe-positive-integer',
  'unsafe-negative-integer',
  'nonfinite-overflow',
  'nan-token',
  'infinity-token',
]);
const EXPECTED_LIMITS = Object.freeze({
  maxDepth: 16,
  maxArrayLength: 1024,
  maxRecordFields: 128,
  maxStringBytes: 16384,
  maxContributionBytes: 65536,
});
const REQUIRED_SOURCE_TESTS = Object.freeze([
  'source codec reproduces every independently authored canonical encoding',
  'source codec refuses every independently authored noncanonical wire',
  'source and standalone Python return matching independently computed results',
  'Python reference computes novel inputs without using vector expected fields',
  'enforces default nesting and bounded collection edges',
  'enforces string UTF-8 and aggregate contribution byte ceilings',
  'refuses invalid JavaScript values before serialization',
]);

function referenceResults(vectors) {
  const result = spawnSync(PYTHON, [REFERENCE, '-'], {
    cwd: ROOT, encoding: ENCODING, input: JSON.stringify(vectors),
    timeout: PYTHON_TIMEOUT_MS, maxBuffer: OUTPUT_LIMIT_BYTES,
  });
  if (result.error || result.status !== 0) return null;
  try {
    const parsed = JSON.parse(result.stdout);
    return Array.isArray(parsed.results) ? parsed.results : null;
  } catch (_error) {
    return null;
  }
}

function limitsMatch(actual) {
  return arrayEvery(Object.entries(EXPECTED_LIMITS),
    ([key, limit]) => actual?.[key] === limit);
}

function casesCoverDomain(vectors) {
  const ids = [
    ...arrayMap(vectors.encode, (item) => item.id),
    ...arrayMap(vectors.rejectWire, (item) => item.id),
  ];
  return new Set(ids).size === ids.length &&
    arrayEvery(REQUIRED_IDS, (id) => arrayIncludes(ids, id)) &&
    new Set(arrayMap(vectors.encode, (item) => item.wire)).size >=
      EXPECTED_POSITIVE_COUNT;
}

function shapeProblems(vectors) {
  if (!vectors || vectors.schema !== EXPECTED_SCHEMA ||
      vectors.scope !== EXPECTED_SCOPE ||
      !Array.isArray(vectors.encode) || !Array.isArray(vectors.rejectWire)) {
    return 1;
  }
  if (vectors.encode.length < EXPECTED_POSITIVE_COUNT ||
      vectors.rejectWire.length < EXPECTED_REFUSAL_COUNT) return 1;
  if (!limitsMatch(vectors.defaultLimits) || !casesCoverDomain(vectors)) {
    return 1;
  }
  return 0;
}

function compare(vectors) {
  if (shapeProblems(vectors)) return 1;
  const results = referenceResults(vectors);
  if (!results || results.length !==
      vectors.encode.length + vectors.rejectWire.length) return 1;
  const expected = [
    ...arrayMap(vectors.encode, (item) => ({
      id: item.id, kind: 'encode', wire: item.wire,
    })),
    ...arrayMap(vectors.rejectWire, (item) => ({
      id: item.id, kind: 'decode', error: item.code,
    })),
  ];
  return expected.reduce((count, item, index) =>
    count + (JSON.stringify(item) === JSON.stringify(results[index]) ? 0 : 1), 0);
}

function inverseControls(vectors) {
  const controls = [
    (copy) => {
      copy.encode[0].wire = 'not-the-canonical-answer';
    },
    (copy) => {
      copy.rejectWire[0].code = 'invalid_partial_value';
    },
    (copy) => {
      copy.encode[1].inputJson = 'null';
    },
    (copy) => {
      copy.rejectWire[0].wire = '"ok"';
    },
    (copy) => {
      copy.encode.pop();
    },
    (copy) => {
      copy.rejectWire.pop();
    },
    (copy) => {
      copy.encode[1].id = copy.encode[0].id;
    },
    (copy) => {
      copy.defaultLimits.maxDepth = 1;
    },
    (copy) => {
      copy.encode = arrayMap(copy.encode, (item) => ({
        ...item, inputJson: 'null', wire: 'null',
      }));
    },
  ];
  return controls.reduce((failed, mutate) => {
    const copy = structuredClone(vectors);
    mutate(copy);
    return failed + (compare(copy) === 0 ? 1 : 0);
  }, 0);
}

function executedSourceWitness(tap) {
  const summary = {
    tests: REQUIRED_SOURCE_TESTS.length,
    suites: 1,
    pass: REQUIRED_SOURCE_TESTS.length,
    fail: 0, cancelled: 0, skipped: 0, todo: 0,
  };
  return arrayEvery(Object.entries(summary), ([name, count]) =>
    new RegExp(`^# ${name} ${count}$`, REGEX_MULTILINE_FLAG).test(tap)) &&
    arrayEvery(REQUIRED_SOURCE_TESTS, (name, index) =>
      stringIncludes(tap, `    ok ${index + 1} - ${name}\n`));
}

function sourceWitnessPasses() {
  if (!fs.existsSync(SOURCE_WITNESS)) return false;
  const result = spawnSync(process.execPath,
    ['--test', '--test-reporter=tap', SOURCE_WITNESS], {
      cwd: ROOT, encoding: ENCODING, timeout: PYTHON_TIMEOUT_MS,
      maxBuffer: OUTPUT_LIMIT_BYTES,
    });
  return !result.error && result.status === 0 &&
    executedSourceWitness(result.stdout);
}

function pythonDefaultLimitsPass() {
  if (!fs.existsSync(PYTHON_LIMIT_WITNESS)) return false;
  const result = spawnSync(PYTHON, [PYTHON_LIMIT_WITNESS], {
    cwd: ROOT, encoding: ENCODING, timeout: PYTHON_TIMEOUT_MS,
    maxBuffer: OUTPUT_LIMIT_BYTES,
  });
  const summary = new RegExp(
    `^Ran ${EXPECTED_PYTHON_LIMIT_TESTS} tests in `, REGEX_MULTILINE_FLAG);
  return !result.error && result.status === 0 &&
    summary.test(result.stderr) && /^OK$/m.test(result.stderr);
}

function measure() {
  if (!fs.existsSync(REFERENCE) || !fs.existsSync(VECTORS)) return 1;
  let vectors;
  try {
    vectors = JSON.parse(fs.readFileSync(VECTORS, ENCODING));
  } catch (_error) {
    return 1;
  }
  const base = compare(vectors);
  if (base !== 0) return base;
  const inverseFailures = inverseControls(vectors);
  if (inverseFailures !== 0) return inverseFailures;
  // The accepted Quest needs an executed source-bound witness as well as the
  // independent reference. A file's mere presence cannot turn the probe green.
  return sourceWitnessPasses() && pythonDefaultLimitsPass() ? 0 : 1;
}

const metric = measure();
if (arrayIncludes(process.argv, METRIC_FLAG)) {
  process.stdout.write(`${metric}\n`);
} else if (metric === 0) {
  process.stdout.write(SUCCESS_MESSAGE);
} else {
  process.stderr.write(`Q1b value conformance deficits: ${metric}\n`);
  process.exitCode = 1;
}

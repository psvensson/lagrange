// The value-or-promise probe is an ESLint error over src (quest
// always-promise-port-answers): every shape the navigability budget's
// value_or_promise_then_checks detector counts draws exactly one
// no-restricted-syntax report carrying the row's promotion marker, a read or
// call of a promise method that decides nothing draws none, and the one
// foreign-answer adapter (turnFromForeignAnswer) lints clean without an
// exemption.
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import {test} from 'node:test';
import {fileURLToPath} from 'node:url';
import {ESLint} from 'eslint';

const ROOT = fileURLToPath(new URL('../../', import.meta.url));
const RULE = 'no-restricted-syntax';
const MARKER = /(?<![A-Za-z0-9_-])navigability-rule:value_or_promise_then_checks(?![A-Za-z0-9_-])/u;
// A path under src the config resolves; the file need not exist.
const FIXTURE_PATH = path.join(ROOT, 'src', 'value-or-promise-fixture.js');
const ADAPTER_PATH = path.join(ROOT, 'src', 'raft', 'raft-rs-turn-answer.js');
const ERROR_SEVERITY = 2;

// One detector-fixture shape per entry: the probe is the whole body.
const PROBE_SHAPES = Object.freeze({
  'typeof .then === ': 'export const f = (x) => typeof x.then === \'function\';',
  'typeof .catch !== ': 'export const f = (x) => typeof x.catch !== \'function\';',
  'reversed operands': 'export const f = (x) => \'function\' === typeof x.then;',
  'optional chain typeof': 'export const f = (x) => typeof x?.then === \'function\';',
  'computed key typeof': 'export const f = (x) => typeof x[\'catch\'] === \'function\';',
  'truthiness in if': 'export function f(x) {\n  if (x.then) return 1;\n  return 0;\n}',
  'optional truthiness in conditional':
    'export const f = (x) => x?.catch ? 1 : 0;',
  'negated truthiness under logical in if':
    'export function f(x, y) {\n  if (y && !(x.then || y.z)) return 1;\n  return 0;\n}',
  'nullish truthiness in conditional':
    'export const f = (x, y) => (y ?? x.then) ? 1 : 0;',
  'instanceof Promise': 'export const f = (x) => x instanceof Promise;',
});

// Promise-method reads and calls that probe nothing.
const NON_PROBE_SHAPES = Object.freeze({
  'a then call': 'export const f = (x) => x.then(() => 1);',
  'a then call deciding an if':
    'export function f(x) {\n  if (x.then(() => 1)) return 1;\n  return 0;\n}',
  'a then read passed to a call in a test':
    'export function f(x, g) {\n  if (g(x.then)) return 1;\n  return 0;\n}',
  'typeof on another member': 'export const f = (x) => typeof x.run === \'function\';',
  'typeof on a local named then':
    'export function f(x) {\n  const then = x.then;\n  return typeof then === \'function\';\n}',
  'instanceof another class': 'export const f = (x) => x instanceof Error;',
});

function markedReports(result) {
  return result.messages.filter((message) =>
    message.ruleId === RULE && MARKER.test(message.message));
}

async function lintShape(eslint, code) {
  const [result] = await eslint.lintText(`${code}\n`, {filePath: FIXTURE_PATH});
  return result;
}

test('the rule is promoted: error severity with the row marker on src', async () => {
  const eslint = new ESLint({cwd: ROOT});
  const config = await eslint.calculateConfigForFile(FIXTURE_PATH);
  const setting = config.rules[RULE];
  assert.equal(setting[0], ERROR_SEVERITY, 'the selector is an error');
  assert.equal(setting.slice(1).some((entry) => MARKER.test(entry.message)), true,
    'an entry carries the value_or_promise_then_checks marker');
});

test('every detector-fixture shape draws exactly one marked report', async () => {
  const eslint = new ESLint({cwd: ROOT});
  for (const [shape, code] of Object.entries(PROBE_SHAPES)) {
    const result = await lintShape(eslint, code);
    assert.equal(result.messages.filter((message) => message.fatal).length, 0,
      `${shape}: the fixture parses`);
    assert.equal(markedReports(result).length, 1, `${shape}: one report`);
  }
});

test('a promise-method read that decides nothing draws no report', async () => {
  const eslint = new ESLint({cwd: ROOT});
  for (const [shape, code] of Object.entries(NON_PROBE_SHAPES)) {
    const result = await lintShape(eslint, code);
    assert.equal(result.messages.filter((message) => message.fatal).length, 0,
      `${shape}: the fixture parses`);
    assert.equal(markedReports(result).length, 0, `${shape}: no report`);
  }
});

test('the foreign-answer adapter lints clean with no exemption', async () => {
  const source = fs.readFileSync(ADAPTER_PATH, 'utf8');
  assert.match(source, /function turnFromForeignAnswer\(/u,
    'the adapter module holds turnFromForeignAnswer');
  assert.match(source, /value\.then;/u, 'it reads the answer\'s then once');
  const eslint = new ESLint({cwd: ROOT});
  const config = await eslint.calculateConfigForFile(ADAPTER_PATH);
  assert.equal(config.rules[RULE][0], ERROR_SEVERITY,
    'the rule is not switched off for the adapter');
  const [result] = await eslint.lintFiles([ADAPTER_PATH]);
  assert.deepEqual(markedReports(result), [], 'no marked report');
});

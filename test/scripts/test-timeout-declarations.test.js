import assert from 'node:assert/strict';
import {execFileSync} from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import {test} from 'node:test';

import {
  extractTimeoutDeclarations,
} from '../../scripts/checks/test-timeout-declarations.js';

const FILE = 'fixture.test.js';
const RUNNER = 'scripts/run-test-files.js';
const TAP_DEFAULT_SECONDS = 30;

function extract(source) {
  return extractTimeoutDeclarations(source, FILE);
}

test('a literal timeout resolves', () => {
  const {milliseconds, problems} = extract(
    'test(\'slow\', {timeout: 90000}, async () => {});');
  assert.deepEqual(problems, []);
  assert.equal(milliseconds, 90000);
});

test('a file-local named constant resolves', () => {
  const {milliseconds, problems} = extract(
    'const TOOLCHAIN_TIMEOUT_MS = 300000;\n' +
    'test(\'slow\', {timeout: TOOLCHAIN_TIMEOUT_MS}, async () => {});');
  assert.deepEqual(problems, []);
  assert.equal(milliseconds, 300000,
    'the guideline-compliant named form must not be inert: this exact shape ' +
    'silently ran under the 30s cap in 18 files');
});

test('numeric separators in a named constant resolve', () => {
  const {milliseconds, problems} = extract(
    'const FILE_TIMEOUT_MS = 180_000;\n' +
    'test(\'slow\', {timeout: FILE_TIMEOUT_MS}, async () => {});');
  assert.deepEqual(problems, []);
  assert.equal(milliseconds, 180000);
});

test('arithmetic over resolvable operands folds', () => {
  const {milliseconds, problems} = extract(
    'const BASE_MS = 120000;\n' +
    'test(\'slow\', {timeout: BASE_MS * 2}, async () => {});');
  assert.deepEqual(problems, []);
  assert.equal(milliseconds, 240000);
});

test('the largest of several declarations wins', () => {
  const {milliseconds, problems} = extract(
    'const SMALL_MS = 45000;\n' +
    'test(\'a\', {timeout: SMALL_MS}, async () => {});\n' +
    'test(\'b\', {timeout: 90000}, async () => {});\n' +
    'test(\'c\', {timeout: 60000}, async () => {});');
  assert.deepEqual(problems, []);
  assert.equal(milliseconds, 90000);
});

test('declarations below the tap default need no lift', () => {
  const {milliseconds, problems} = extract(
    'test(\'quick\', {timeout: 5000}, async () => {});');
  assert.deepEqual(problems, []);
  assert.ok(milliseconds / 1000 <= TAP_DEFAULT_SECONDS,
    'a sub-default declaration must not raise the cap');
});

test('comments and strings are never read as declarations', () => {
  const {milliseconds, problems} = extract(
    '// test("x", {timeout: 999000}, async () => {});\n' +
    '/* {timeout: 888000} */\n' +
    'const note = \'use {timeout: 777000} for slow tests\';\n' +
    'test(\'quick\', {timeout: 5000}, async () => {});');
  assert.deepEqual(problems, []);
  assert.equal(milliseconds, 5000,
    'a regex over raw source would have picked up the commented and quoted ' +
    'values; parsing must not');
});

test('a timeout option not passed to a test call is ignored', () => {
  const {milliseconds, problems} = extract(
    'validateRuntimeConfig({timeout: 500000});\n' +
    'test(\'quick\', {timeout: 5000}, async () => {});');
  assert.deepEqual(problems, []);
  assert.equal(milliseconds, 5000,
    'only options objects passed to a test call declare a test timeout');
});

test('an unresolvable expression is reported, never silently inert', () => {
  const {milliseconds, problems} = extract(
    'const BASE_MS = 1000;\n' +
    'test(\'slow\', {timeout: BASE_MS * multiplier()}, async () => {});');
  assert.equal(milliseconds, 0);
  assert.equal(problems.length, 1);
  assert.match(problems[0], /cannot resolve/u);
  assert.match(problems[0], new RegExp(FILE, 'u'),
    'the diagnostic must name the file');
});

test('an unknown identifier is reported with its name', () => {
  const {problems} = extract(
    'test(\'slow\', {timeout: SOME_OTHER_TIMEOUT_MS}, async () => {});');
  assert.equal(problems.length, 1);
  assert.match(problems[0], /SOME_OTHER_TIMEOUT_MS/u);
});

test('an ambiguously rebound identifier is reported', () => {
  const {problems} = extract(
    'const LIMIT_MS = 45000;\n' +
    'function other() { const LIMIT_MS = 90000; return LIMIT_MS; }\n' +
    'test(\'slow\', {timeout: LIMIT_MS}, async () => {});');
  assert.equal(problems.length, 1);
  assert.match(problems[0], /ambiguous/u);
});

// Boundary cases an independent verifier found silently returning a wrong
// number or a silent 0 — each contradicting this module's promise that anything
// unresolvable is reported. They are regression tests, not hypotheticals.
test('a let-bound timeout is reported rather than assumed constant', () => {
  const rebound = extract(
    'let LIMIT_MS = 90000;\n' +
    'LIMIT_MS = 1000;\n' +
    'test(\'slow\', {timeout: LIMIT_MS}, async () => {});');
  assert.equal(rebound.milliseconds, 0,
    'a reassignable binding must never be resolved to a stale literal');
  assert.equal(rebound.problems.length, 1);

  const declaredLet = extract(
    'let LIMIT_MS = 90000;\n' +
    'test(\'slow\', {timeout: LIMIT_MS}, async () => {});');
  assert.equal(declaredLet.problems.length, 1,
    'let is reassignable anywhere, so it is not a stable declaration');
});

test('a computed timeout key is reported, not skipped', () => {
  const {milliseconds, problems} = extract(
    'test(\'slow\', {[\'timeout\']: 300000}, async () => {});');
  assert.equal(milliseconds, 0);
  assert.equal(problems.length, 1);
  assert.match(problems[0], /computed key/u);
});

test('a spread options object is reported, not silently empty', () => {
  const {milliseconds, problems} = extract(
    'const OPTS = {timeout: 300000};\n' +
    'test(\'slow\', {...OPTS}, async () => {});');
  assert.equal(milliseconds, 0);
  assert.equal(problems.length, 1);
  assert.match(problems[0], /spread/u);
});

test('division by zero is reported, not a silent fallback', () => {
  const {milliseconds, problems} = extract(
    'const BASE_MS = 300000;\n' +
    'const DIVISOR = 0;\n' +
    'test(\'slow\', {timeout: BASE_MS / DIVISOR}, async () => {});');
  assert.equal(milliseconds, 0);
  assert.equal(problems.length, 1);
  assert.match(problems[0], /divides by zero/u);
});

test('modifier forms such as test.only still declare a timeout', () => {
  const only = extract(
    'test.only(\'slow\', {timeout: 300000}, async () => {});');
  assert.deepEqual(only.problems, []);
  assert.equal(only.milliseconds, 300000,
    'matching only on the property name missed test.only entirely');
});

test('an unparseable file is reported rather than treated as undeclared', () => {
  const {problems} = extract('this is ( not javascript');
  assert.equal(problems.length, 1);
  assert.match(problems[0], /could not be parsed/u);
});

// tap arms ONE root timer per file, so every top-level test shares it: the
// file's root budget is the SUM of the top-level declarations, while a nested
// subtest runs inside its parent's budget and a test call the harness cannot
// see run (a loop body, a function) is left to the largest-anywhere fallback.
test('top-level declarations are summed and nested subtests are not counted', () => {
  const {milliseconds, topLevelMilliseconds, problems} = extract(
    'const TEST_TIMEOUT_MS = 40000;\n' +
    't.test(\'a\', {timeout: TEST_TIMEOUT_MS}, async (t) => {\n' +
    '  await t.test(\'nested\', {timeout: TEST_TIMEOUT_MS}, async () => {});\n' +
    '});\n' +
    'await t.test(\'b\', {timeout: TEST_TIMEOUT_MS}, async () => {});\n' +
    'test.only(\'c\', {timeout: TEST_TIMEOUT_MS}, async () => {});\n' +
    'for (const name of NAMES) {\n' +
    '  t.test(name, {timeout: TEST_TIMEOUT_MS}, async () => {});\n' +
    '}\n');
  assert.deepEqual(problems, []);
  assert.equal(milliseconds, 40000, 'the largest anywhere is unchanged');
  assert.equal(topLevelMilliseconds, 120000,
    'a, the awaited b and the modifier form c are top-level and sum; the ' +
    'nested subtest and the loop-generated tests are not counted');
});

test('a file with no top-level declaration reports a zero top-level sum', () => {
  const {milliseconds, topLevelMilliseconds, fileMilliseconds} = extract(
    'describe(\'suite\', () => {\n' +
    '  it(\'slow\', {timeout: 90000}, async () => {});\n' +
    '});');
  assert.equal(milliseconds, 90000, 'the largest-anywhere fallback still sees it');
  assert.equal(topLevelMilliseconds, 0);
  assert.equal(fileMilliseconds, 0);
});

// A file that calls setTimeout on the tap root declares its whole root budget
// in one place; tap honours the call as its root timer and the runner must
// never export less.
test('a file-level setTimeout on the tap root is the file budget', () => {
  const {fileMilliseconds, topLevelMilliseconds, problems} = extract(
    'import t from \'tap\';\n' +
    'const TOOLCHAIN_TIMEOUT_MS = 50000;\n' +
    't.setTimeout(TOOLCHAIN_TIMEOUT_MS * 2);\n' +
    't.test(\'x\', {timeout: TOOLCHAIN_TIMEOUT_MS}, async () => {});');
  assert.deepEqual(problems, []);
  assert.equal(fileMilliseconds, 100000, 'resolved like any other declaration');
  assert.equal(topLevelMilliseconds, 50000, 'and kept apart from the test sum');
});

test('a setTimeout that is not on the tap root at top level is not the file budget', () => {
  const {fileMilliseconds, problems} = extract(
    't.test(\'x\', async (tt) => {\n' +
    '  tt.setTimeout(100000);\n' +
    '});\n' +
    'setTimeout(() => {}, 100000);\n' +
    'server.setTimeout(100000);');
  assert.deepEqual(problems, []);
  assert.equal(fileMilliseconds, 0,
    'a subtest\'s own timer, the global timer and another receiver\'s ' +
    'setTimeout say nothing about the root budget');
});

test('an unresolvable file-level setTimeout is reported, never silently inert', () => {
  const {fileMilliseconds, problems} = extract('t.setTimeout(budget());');
  assert.equal(fileMilliseconds, 0);
  assert.equal(problems.length, 1);
  assert.match(problems[0], /cannot resolve/u);
});

// End-to-end: the runner must export the derived TAP_TIMEOUT, and an explicit
// caller value must still win (the classified exclusive lane relies on it).
// The fixture must live INSIDE the working directory (the runner refuses
// outside paths) but OUTSIDE test/ (a *.test.js file there would join the live
// census and show up as manifest drift). test-output/ is gitignored and is not
// walked by the classification census, so it satisfies both.
const FIXTURE_PARENT = 'test-output/tap-timeout-fixtures';

// The fixture ASSERTS the cap it was given rather than printing it: the runner
// summarises child TAP output, so a printed value would never reach stdout,
// whereas a mismatch fails the child and makes execFileSync throw.
function runFixture(declaredMs, expectedSeconds, env, topLevelTests = 1) {
  fs.mkdirSync(FIXTURE_PARENT, {recursive: true});
  const directory = fs.mkdtempSync(path.join(FIXTURE_PARENT, 'run-'));
  const fixture = path.join(directory, 'echo-timeout.test.js');
  const topLevelTest =
    't.test(\'observes the cap\', {timeout: FIXTURE_TIMEOUT_MS}, (tt) => {\n' +
    '  tt.equal(process.env.TAP_TIMEOUT, ' +
    `${JSON.stringify(expectedSeconds)});\n` +
    '  tt.end();\n' +
    '});\n';
  fs.writeFileSync(fixture,
    'import t from \'tap\';\n' +
    `const FIXTURE_TIMEOUT_MS = ${declaredMs};\n` +
    topLevelTest.repeat(topLevelTests));
  // Strip any ambient lane-owned TAP_TIMEOUT / TAP_TIMEOUT_FLOOR, and the
  // placed-run machine factor, before applying the case's own env: CI lanes
  // legitimately export a floor (release.yml/ci.yml set TAP_TIMEOUT_FLOOR=120)
  // and a lab placement exports LAGRANGE_TEST_MACHINE_FACTOR, and the
  // derivation cases must observe the runner's derived value for the
  // reference machine, not the lane's or the host's. The explicit-caller,
  // floor and factor cases supply their own values via `env`.
  const {
    TAP_TIMEOUT: _ambientLaneCap,
    TAP_TIMEOUT_FLOOR: _ambientLaneFloor,
    LAGRANGE_TEST_MACHINE_FACTOR: _ambientHostFactor,
    ...hermeticEnv
  } = process.env;
  try {
    execFileSync(process.execPath, [RUNNER, '--jobs=1', fixture], {
      cwd: process.cwd(),
      encoding: 'utf8',
      env: {...hermeticEnv, ...env},
    });
    return true;
  } finally {
    fs.rmSync(directory, {force: true, recursive: true});
  }
}

test('the runner exports the derived cap and honours a lane-owned one', () => {
  assert.equal(runFixture(90000, '90', {}), true,
    'a 90000ms declaration must reach the child as TAP_TIMEOUT=90');
  assert.equal(runFixture(90000, '120', {TAP_TIMEOUT: '120'}), true,
    'an explicit caller TAP_TIMEOUT must win over the derived value');
  assert.throws(() => runFixture(90000, '45', {}), /Command failed/u,
    'the fixture must genuinely observe the cap, not pass unconditionally');
});

// One root timer per file (ledger S1/S2, 2026-10-11): two top-level tests that
// each declare 90s share it, so the child must see their sum; and the root
// timer is wall-clock, so a x2.1 host sees the declaration scaled.
test('the runner exports the top-level sum, scaled by the machine factor', () => {
  assert.equal(runFixture(90000, '180', {}, 2), true,
    'two 90000ms top-level tests must reach the child as TAP_TIMEOUT=180');
  assert.throws(() => runFixture(90000, '90', {}, 2), /Command failed/u,
    'the largest declaration alone is the shared-budget defect');
  assert.equal(runFixture(90000, '189', {LAGRANGE_TEST_MACHINE_FACTOR: '2.1'}),
    true, 'a 90000ms declaration on a x2.1 host runs at 189s');
});

// The CI lanes export TAP_TIMEOUT_FLOOR (ci.yml, release.yml): a minimum for
// files that declare less, never a cap on a file that declares more. An
// ambient TAP_TIMEOUT clobbered declarations — critical-replica-placement-
// causal-trace declares 300s, runs ~150s, and died at 120s on main.
test('a lane floor raises a smaller declaration and never cuts a larger one',
  () => {
    assert.equal(runFixture(90000, '120', {TAP_TIMEOUT_FLOOR: '120'}), true,
      'a 90000ms declaration under a 120s floor runs at the floor');
    assert.equal(runFixture(300000, '300', {TAP_TIMEOUT_FLOOR: '120'}), true,
      'a 300000ms declaration under a 120s floor keeps its 300s budget');
    assert.throws(
      () => runFixture(300000, '120', {TAP_TIMEOUT_FLOOR: '120'}),
      /Command failed/u,
      'the floor must not be observed as a 120s cap on a 300s declaration');
  });

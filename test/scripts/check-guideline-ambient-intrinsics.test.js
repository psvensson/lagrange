import {test} from '../../src/test-helpers/tap.js';
import {
  collectAmbientIntrinsicViolationsFromSource,
  isGovernedPath,
} from '../../scripts/check-guideline-ambient-intrinsics.js';

const GOVERNED_FILE_PATH =
  'test/distributed/harness/benchmark-example-admission.js';
const CHECKS_FILE_PATH = 'scripts/checks/run-example-guard.js';
const UNGOVERNED_FILE_PATH = 'src/utils/plain-helper.js';

test('flags direct ambient prototype-method calls in governed trees',
  async (t) => {
    const violations = collectAmbientIntrinsicViolationsFromSource(
      [
        'export function admit(stdout) {',
        '  const lines = stdout.trim().split("\\n");',
        '  return lines.map((line) => line.toLowerCase());',
        '}',
      ].join('\n'),
      GOVERNED_FILE_PATH,
    );
    t.same(
      violations.map((violation) => violation.methodName).sort(),
      ['map', 'split', 'toLowerCase', 'trim'],
      'every ambient call is reported with its method name');
    t.equal(violations[0].kind, 'ambient_intrinsic_call');
    t.match(violations[0].reason, /module-load capture/,
      'the reason names the fix');
  });

test('accepts module-load captures and namespace calls', async (t) => {
  const violations = collectAmbientIntrinsicViolationsFromSource(
    [
      'const stringTrim = Function.call.bind(String.prototype.trim);',
      'const arrayMap = Function.call.bind(Array.prototype.map);',
      'export function admit(stdout, items) {',
      '  if (!Array.isArray(items)) return null;',
      '  const clean = stringTrim(stdout);',
      '  return arrayMap(items, (item) => Object.hasOwn(item, clean));',
      '}',
    ].join('\n'),
    GOVERNED_FILE_PATH,
  );
  t.same(violations, [], 'captured intrinsics and namespace members pass');
});

test('scripts/checks is governed; other trees are not', async (t) => {
  const source = 'export const f = (s) => s.trim();';
  t.equal(
    collectAmbientIntrinsicViolationsFromSource(source, CHECKS_FILE_PATH)
      .length,
    1, 'scripts/checks is governed');
  t.same(
    collectAmbientIntrinsicViolationsFromSource(source, UNGOVERNED_FILE_PATH),
    [], 'src/ is outside this audit so the seal gate cannot misfire on it');
  t.equal(isGovernedPath('test/distributed/harness/x.js'), true);
  t.equal(isGovernedPath('test/distributed/harness-other/x.js'), false,
    'prefix match is segment-exact');
});

test('computed and low-signal members are not flagged', async (t) => {
  const violations = collectAmbientIntrinsicViolationsFromSource(
    [
      'import path from "node:path";',
      'export function report(t, parts, key, record) {',
      '  t.test("x", () => {});',
      '  const p = path.join(...parts);',
      '  return record[key](p);',
      '}',
    ].join('\n'),
    GOVERNED_FILE_PATH,
  );
  t.same(violations, [],
    'tap t.test, path.join, and computed calls stay outside the rule');
});

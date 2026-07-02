import {test} from '../../src/test-helpers/tap.js';
import {collectOpaqueAddedConstants} from
  '../../scripts/check-staged-constant-names.js';
import {isOpaqueConstantName} from
  '../../scripts/check-guideline-constant-names.js';

// Declaration lines are assembled from fragments so this test file's own
// staged diff never contains a contiguous `const LOCAL_STR_...` declaration
// (the gate scans raw added lines and would flag its own fixture).
const HASH_CONSTANT_NAME = ['LOCAL', 'STR', '1ABCD'].join('_');
const DIFF_WITH_NEW_HASH_CONSTANT = [
  'diff --git a/src/example/decision-owner.js b/src/example/decision-owner.js',
  '--- a/src/example/decision-owner.js',
  '+++ b/src/example/decision-owner.js',
  '@@ -10,0 +11,2 @@',
  `+const ${HASH_CONSTANT_NAME} = 'new hash-named constant';`,
  '+const REASON_SPREAD_PENDING = \'priority_spread_pending\';',
].join('\n');

const DIFF_TOUCHING_LEGACY_FILE_WITHOUT_NEW_HASH = [
  'diff --git a/src/example/legacy.js b/src/example/legacy.js',
  '--- a/src/example/legacy.js',
  '+++ b/src/example/legacy.js',
  '@@ -5,1 +5,1 @@',
  '-  return LOCAL_STR_1ABCD;',
  '+  return LOCAL_STR_1ABCD.trim();',
].join('\n');

test('staged gate flags only newly added opaque constant declarations', (t) => {
  const findings = collectOpaqueAddedConstants(DIFF_WITH_NEW_HASH_CONSTANT);
  t.equal(findings.length, 1, 'one opaque declaration flagged');
  t.equal(findings[0].constantName, HASH_CONSTANT_NAME);
  t.equal(findings[0].filePath, 'src/example/decision-owner.js');
  t.end();
});

test('staged gate ignores usages of inherited hash constants', (t) => {
  const findings = collectOpaqueAddedConstants(
    DIFF_TOUCHING_LEGACY_FILE_WITHOUT_NEW_HASH,
  );
  t.same(findings, [], 'usage-only edits pass');
  t.end();
});

test('opaque-name predicate covers digit and known letters-only hashes', (t) => {
  t.ok(isOpaqueConstantName('LOCAL_STR_1E2OT'), 'digit hash flagged');
  t.ok(isOpaqueConstantName('TEST_NUM_42ABC'), 'TEST digit hash flagged');
  t.ok(isOpaqueConstantName('LOCAL_STR_ABFPD'), 'known letters-only hash flagged');
  t.notOk(isOpaqueConstantName('LOCAL_STR_SLASH'), 'semantic word passes');
  t.notOk(isOpaqueConstantName('LOCAL_STR_TEST_JS'), 'compound semantic passes');
  t.notOk(isOpaqueConstantName('REASON_SPREAD_PENDING'), 'non-LOCAL name passes');
  t.end();
});

test('empty staged diff yields no findings', (t) => {
  t.same(collectOpaqueAddedConstants(''), []);
  t.end();
});

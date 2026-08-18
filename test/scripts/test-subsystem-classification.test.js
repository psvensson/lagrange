// Contract for the subsystem axis.
//
// The classification will decide which tests CI runs, so every property below
// is a hard contract rather than a report: a taxonomy that silently
// under-classifies is indistinguishable from a correct one, and the failure
// mode is invisible - tests simply stop running.
//
// These tests attack INPUTS AND OUTPUTS. Three review rounds rejected earlier
// versions for the same reason: an assertion checked a representation of a
// property rather than the property (`assert.equal(f(x), f(x))`), or exercised
// a helper instead of the code under test. Where a digest is checked it is
// checked against an INDEPENDENT oracle computed here, never against the
// production function, because a function always equals itself.

import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import {test} from 'node:test';

import {
  buildSubsystemManifest,
  explainSubsystemClassification,
  SUBSYSTEM_OVERRIDES,
  SUBSYSTEM_RULES,
  subsystemRulesMatching,
  SUBSYSTEMS,
} from '../../scripts/checks/test-subsystem-classification.js';
import {
  SUBSYSTEM_MANIFEST_PATH,
} from '../../scripts/checks/test-subsystem-classification-constants.js';

const root = process.cwd();
const UTF8 = 'utf8';
const PRIMARY_PATH = 'test/shards/primary-classes.json';
const RESOURCE_PATH = 'test/shards/resource-classes.json';
const FNV_OFFSET = 0x811c9dc5;
const FNV_PRIME = 0x01000193;

// Deliberately a second implementation of the digest. Importing the production
// one to check the production one proves only that a function equals itself,
// and would stay green if that function secretly folded in rule identity.
function independentFnv1a32(input) {
  let hash = FNV_OFFSET;
  for (let index = 0; index < input.length; index += 1) {
    hash ^= input.charCodeAt(index);
    hash = Math.imul(hash, FNV_PRIME) >>> 0;
  }
  return `fnv1a32-${hash.toString(16).padStart(8, '0')}`;
}

const manifest = buildSubsystemManifest(root);
const readJson = (relative) =>
  JSON.parse(fs.readFileSync(path.join(root, relative), UTF8));

test('the live taxonomy derives without any integrity problem', () => {
  assert.deepEqual(manifest.problems, [],
    'unclassified, ambiguous, dead-rule, dead-override and empty-subsystem ' +
    'problems are all fatal by construction');
});

test('every test has exactly one subsystem', () => {
  const values = Object.values(manifest.classes);
  assert.equal(values.length, manifest.censusSize);
  for (const subsystem of values) {
    assert.ok(SUBSYSTEMS.includes(subsystem), `unknown subsystem ${subsystem}`);
    assert.equal(typeof subsystem, 'string',
      'a subsystem is a single primary home, never an array of tags');
  }
});

test('classification is all-rules, so no test relies on rule order', () => {
  // If two rules ever matched, a first-match implementation would silently pick
  // by position and a reordering would change what CI runs.
  const offenders = [];
  for (const testPath of Object.keys(manifest.classes)) {
    if (Object.hasOwn(SUBSYSTEM_OVERRIDES, testPath)) continue;
    const hits = subsystemRulesMatching(testPath);
    if (hits.length !== 1) offenders.push(`${testPath} matched ${hits.length}`);
  }
  assert.deepEqual(offenders, []);
});

test('pgwire disjointness holds by construction, not by luck', () => {
  // Every directory rule must exclude a pgwire basename at any nesting depth.
  // An earlier version guarded only three of them and left 28 collisions that
  // were merely fail-closed rather than impossible.
  const areas = ['storage', 'cli', 'raft', 'config', 'distributed', 'query',
    'partition', 'cdc', 'transport', 'admin', 'solve', 'scripts', 'policy',
    'closure', 'contract', 'model', 'runtime', 'node', 'bootstrap', 'utils'];
  for (const area of areas) {
    for (const shape of [
      `test/${area}/pgwire-x.test.js`,
      `test/${area}/sub/pgwire-y.test.js`,
      `test/${area}/deep/deeper/pgwire-z.test.js`,
    ]) {
      assert.equal(subsystemRulesMatching(shape).length, 1,
        `${shape} must match exactly one rule`);
    }
    // A basename that merely CONTAINS pgwire- is not a pgwire test.
    assert.equal(subsystemRulesMatching(
      `test/${area}/a-pgwire-b.test.js`).length, 1);
  }
});

test('there is no catch-all: an unrecognised path matches nothing', () => {
  for (const stray of [
    'test/not-a-real-area/whatever.test.js',
    'test/zzz/deeply/nested/thing.test.js',
  ]) {
    assert.deepEqual(subsystemRulesMatching(stray), [],
      `${stray} must be unclassified, forcing an explicit taxonomy decision`);
  }
});

test('every rule matches at least one live test', () => {
  const live = Object.keys(manifest.classes);
  const dead = SUBSYSTEM_RULES.filter((rule) =>
    !live.some((testPath) => rule.pattern.test(testPath))).map((r) => r.id);
  assert.deepEqual(dead, [],
    'a rule matching nothing is stale taxonomy, like a stale exemption');
});

test('every override names one live test and carries a reason', () => {
  const live = new Set(Object.keys(manifest.classes));
  for (const [testPath, override] of Object.entries(SUBSYSTEM_OVERRIDES)) {
    assert.ok(live.has(testPath), `override names a dead path: ${testPath}`);
    assert.ok(override.reason && override.reason.length > 0,
      `override for ${testPath} must record why its path is misleading`);
    assert.ok(SUBSYSTEMS.includes(override.subsystem));
  }
});

test('every declared subsystem contains at least one test', () => {
  const empty = SUBSYSTEMS.filter((subsystem) => !manifest.counts[subsystem]);
  assert.deepEqual(empty, [],
    'the subsystem list must not accumulate areas nothing proves');
});

test('the three classification axes describe the same population', () => {
  const primary = readJson(PRIMARY_PATH);
  const resource = readJson(RESOURCE_PATH);
  assert.equal(manifest.censusSize, primary.censusSize);
  assert.equal(manifest.censusSize, resource.censusSize);
  for (const testPath of Object.keys(primary.classes)) {
    assert.ok(manifest.classes[testPath], `${testPath}: primary but no subsystem`);
  }
  for (const testPath of Object.keys(resource.classes)) {
    assert.ok(manifest.classes[testPath], `${testPath}: resource but no subsystem`);
  }
});

test('the digest is fnv1a32 over path:subsystem and nothing else', () => {
  // Bound to an independent oracle, so an implementation that folded rule
  // identity into the digest fails here instead of moving both sides together.
  assert.equal(manifest.digest, independentFnv1a32(
    Object.keys(manifest.classes).sort()
      .map((key) => `${key}:${manifest.classes[key]}`).join('\n')));
});

test('the committed manifest equals a fresh in-memory derivation', () => {
  // This is what --check does, and it is now the ONLY correctness command:
  // re-derive everything and compare against the committed artifact. A second
  // command that inspected stored fields was three times found weaker than it
  // claimed, so it was removed rather than repaired a fourth time.
  const committed = readJson(SUBSYSTEM_MANIFEST_PATH);
  assert.deepEqual(committed.classes, manifest.classes);
  assert.equal(committed.digest, manifest.digest);
  assert.equal(committed.censusSize, manifest.censusSize);
  assert.deepEqual(committed.counts, manifest.counts);
  assert.ok(!Object.hasOwn(committed, 'classificationEvidence'),
    'derivation identity is derived on demand, never published');
  assert.ok(!Object.hasOwn(committed, 'evidenceDigest'),
    'a second digest would be a second thing needing verification');

  // A silently moved test must change the derivation, or --check cannot see it.
  const victim = Object.keys(manifest.classes)
    .find((key) => manifest.classes[key] === 'query-sql');
  const moved = {...manifest.classes, [victim]: 'storage-raft'};
  assert.notEqual(independentFnv1a32(Object.keys(moved).sort()
    .map((key) => `${key}:${moved[key]}`).join('\n')), committed.digest);
});

test('regeneration is deterministic', () => {
  const again = buildSubsystemManifest(root);
  assert.equal(again.digest, manifest.digest);
  assert.deepEqual(again.classes, manifest.classes);
});

test('--explain derives the placing rule live', () => {
  const byRule = explainSubsystemClassification('test/query/pg-translate.test.js');
  assert.equal(byRule.subsystem, 'query-sql');
  assert.equal(byRule.rule, 'directory-query');

  const overridden = explainSubsystemClassification(
    'test/integration/control-plane-rebalance.integration.test.js');
  assert.equal(overridden.subsystem, 'placement-rebalance');
  assert.ok(overridden.reason, 'an override must explain why its path misleads');

  const unknown = explainSubsystemClassification('test/nowhere/x.test.js');
  assert.equal(unknown.subsystem, null,
    'an unclassifiable path must explain as unclassified, never guess');
});

test('subsystem is orthogonal to primary and resource', () => {
  const primary = readJson(PRIMARY_PATH);
  const seen = new Map();
  for (const [testPath, subsystem] of Object.entries(manifest.classes)) {
    if (!seen.has(subsystem)) seen.set(subsystem, new Set());
    seen.get(subsystem).add(primary.classes[testPath]);
  }
  assert.ok([...seen].some(([, kinds]) => kinds.size > 1),
    'subsystems must span primary classes, or the axis is redundant');
});

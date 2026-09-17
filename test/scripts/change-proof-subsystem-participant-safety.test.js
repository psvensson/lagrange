import assert from 'node:assert/strict';
import {spawnSync} from 'node:child_process';
import {test} from 'node:test';

const root = process.cwd();
const UTF8 = 'utf8';

test('the real subsystem participant resists every mutable input intrinsic', () => {
  const source = `
    import fs from 'node:fs';
    import {buildExecutionPlan} from './scripts/select-change-tests.js';
    import {testsForSubsystem} from './scripts/check-subsystem.js';
    const replacements = [
      [JSON, 'parse', () => ({classes: {}})],
      [Object, 'keys', () => []],
      [Array.prototype, 'sort', function sort() { return []; }],
      [Array.prototype, 'filter', function filter() { return []; }],
    ];
    const plans = [];
    for (const [owner, key, replacement] of replacements) {
      const original = owner[key];
      try {
        Reflect.set(owner, key, replacement);
        plans.push(buildExecutionPlan({
          changedPaths: ['package.json', 'package-lock.json'],
          packageFields: ['version'],
          lockfileGraphChanged: false,
          planRoot: process.cwd(),
        }));
      } finally {
        Reflect.set(owner, key, original);
      }
    }
    const packaging = testsForSubsystem('release-packaging');
    // Tests that READ package.json or the lockfile observe the change too
    // (proof-authority-integrity); with every intrinsic restored the
    // expected set is the packaging subsystem plus those observers.
    const {observersOf} = await import(
      './scripts/checks/test-subsystem-classification.js');
    const manifest = JSON.parse(fs.readFileSync(
      'test/shards/subsystem-classes.json', 'utf8'));
    const expected = new Set(packaging);
    for (const changed of ['package.json', 'package-lock.json']) {
      for (const observer of observersOf(manifest.observations, changed,
        manifest.classes)) {
        expected.add(observer.test);
      }
    }
    const results = plans.map((plan) => ({
      selectedCount: plan.selectedCount,
      missing: [...expected].filter((testPath) =>
        !plan.tests.some((entry) => entry.path === testPath)),
    }));
    process.stdout.write(JSON.stringify({
      packaging, expectedCount: expected.size, results}));
  `;
  const env = {...process.env, NODE_OPTIONS: ''};
  const result = spawnSync(process.execPath,
    ['--input-type=module', '--eval', source],
    {cwd: root, encoding: UTF8, env});
  assert.equal(result.status, 0, result.stderr);
  const proof = JSON.parse(result.stdout);
  assert.ok(proof.packaging.length > 0);
  for (const participant of proof.results) {
    assert.equal(participant.selectedCount, proof.expectedCount);
    assert.deepEqual(participant.missing, []);
  }
});

import assert from 'node:assert/strict';
import {test} from 'node:test';

import {
  classifyChangedPath,
  selectProofCone,
} from '../../scripts/checks/impact-proof-cone.js';
import {
  TIER_CORE_METADATA,
  TIER_DOCUMENTATION,
  TIER_OWNER_BOUNDARY,
  TIER_SELECTOR_SELF,
  TIER_UNKNOWN,
} from '../../scripts/checks/impact-proof-cone-constants.js';

const root = process.cwd();

test('tier policy: documentation, self, core metadata, unknown', () => {
  assert.equal(classifyChangedPath('docs/steering/llm/core.md', []), TIER_DOCUMENTATION);
  assert.equal(classifyChangedPath('README.md', []), TIER_DOCUMENTATION);
  assert.equal(classifyChangedPath('scripts/run-test-files.js', []), TIER_SELECTOR_SELF);
  assert.equal(classifyChangedPath('scripts/select-proof-cone.js', []), TIER_SELECTOR_SELF);
  assert.equal(classifyChangedPath('test/shards/impact-contracts.json', []), TIER_SELECTOR_SELF);
  assert.equal(classifyChangedPath('src/raft/raft-node.js', []), TIER_CORE_METADATA);
  assert.equal(classifyChangedPath('wit/world.wit', []), TIER_CORE_METADATA);
  assert.equal(classifyChangedPath('substrate.toml', []), TIER_UNKNOWN);
  assert.equal(classifyChangedPath('src/index.js', []), TIER_OWNER_BOUNDARY);
});

test('leaf source change selects a strict subset plus the safety floor', () => {
  const {selection, problems} = selectProofCone(
    root, ['src/runtime/call-cell-value-mapping.js']);
  assert.deepEqual(problems, []);
  assert.equal(selection.fullSuite, false);
  assert.ok(selection.counts.uniqueSelected > 0);
  assert.ok(selection.counts.uniqueSelected < selection.counts.totalTests);
  assert.ok(selection.counts['safety-floor'] > 0);
  assert.ok(selection.selectedTests.includes('test/closure/CL-040.repro.test.js'));
});

test('changed test file is always selected itself', () => {
  const changedTest = 'test/service/call-cell-batch-executor.test.js';
  const {selection} = selectProofCone(root, [changedTest]);
  assert.ok(selection.selectedTests.includes(changedTest));
  assert.ok(selection.counts['changed-test'] >= 1);
});

test('selector self-change forces the complete census', () => {
  const {selection} = selectProofCone(root, ['scripts/run-test-files.js']);
  assert.equal(selection.fullSuite, true);
  assert.equal(selection.selectedTests.length, selection.counts.totalTests);
});

test('unknown path forces full suite and names the path', () => {
  const {selection, problems} = selectProofCone(root, ['substrate.toml']);
  assert.equal(selection.fullSuite, true);
  assert.ok(problems.some((problem) => problem.includes('substrate.toml')));
});

test('empty change set fails closed to the full suite', () => {
  const {selection, problems} = selectProofCone(root, []);
  assert.equal(selection.fullSuite, true);
  assert.ok(problems.length > 0);
});

test('contract owner change selects claimant tests via contract edge', () => {
  const {selection} = selectProofCone(
    root, ['src/rebalancer/placement-owner-decision.js']);
  assert.equal(selection.fullSuite, false);
  assert.ok(selection.changedContracts.includes('partition-topology'));
  assert.ok(selection.counts.contract > 0);
  assert.ok(selection.rationale.contract.some((testPath) =>
    testPath.startsWith('test/topology/')));
});

test('receipt pins selector version and input digests', () => {
  const {selection} = selectProofCone(root, ['src/runtime/call-cell-value-mapping.js']);
  assert.equal(selection.selectorVersion, 'proof-cone-selector/1');
  assert.ok(selection.inputs.primaryClassDigest);
  assert.ok(selection.inputs.importGraphDigest);
  assert.equal(typeof selection.inputs.coverageFresh, 'boolean');
});

test('documentation-only change runs just the safety floor', () => {
  const {selection} = selectProofCone(root, ['docs/steering/llm/core.md']);
  assert.equal(selection.fullSuite, false);
  assert.equal(selection.escalation, TIER_DOCUMENTATION);
  assert.equal(selection.counts.uniqueSelected, selection.counts['safety-floor']);
});

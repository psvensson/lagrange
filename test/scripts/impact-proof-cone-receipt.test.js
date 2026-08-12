import assert from 'node:assert/strict';
import {test} from 'node:test';

import {selectProofCone} from '../../scripts/checks/impact-proof-cone.js';
import {TIER_DOCUMENTATION} from
  '../../scripts/checks/impact-proof-cone-constants.js';

const root = process.cwd();

test('empty change set fails closed to the full suite', () => {
  const {selection, problems} = selectProofCone(root, []);
  assert.equal(selection.fullSuite, true);
  assert.ok(problems.length > 0);
});

test('contract owner change selects claimant tests via contract edge', () => {
  const {selection} = selectProofCone(
    root, ['src/rebalancer/placement-owner-decision.js']);
  assert.ok(selection.changedContracts.includes('partition-topology'));
  if (!selection.fullSuite) {
    assert.ok(selection.counts.contract > 0);
    assert.ok(selection.rationale.contract.some((testPath) =>
      testPath.startsWith('test/topology/')));
  }
});

test('legacy filename-stem owner selects its semantic contract', () => {
  const {selection} = selectProofCone(
    root, ['src/service/call-cell-batch-executor.js']);
  assert.ok(selection.changedContracts.includes('call-cell-routing'));
  if (!selection.fullSuite) {
    assert.ok(selection.rationale.contract.some((testPath) =>
      testPath.startsWith('test/service/')));
  }
});

test('receipt pins selector version and input digests', () => {
  const {selection} = selectProofCone(
    root, ['src/runtime/call-cell-value-mapping.js']);
  assert.equal(selection.selectorVersion, 'proof-cone-selector/1');
  assert.ok(selection.inputs.primaryClassDigest);
  assert.ok(selection.inputs.importGraphDigest);
  assert.match(selection.inputs.contractRegistryDigest, /^sha256:[a-f0-9]{64}$/u);
  assert.equal(typeof selection.inputs.coverageFresh, 'boolean');
});

test('documentation-only change runs just the safety floor', () => {
  const {selection} = selectProofCone(root, ['docs/steering/llm/core.md']);
  assert.equal(selection.fullSuite, false);
  assert.equal(selection.escalation, TIER_DOCUMENTATION);
  assert.equal(selection.counts.uniqueSelected, selection.counts['safety-floor']);
});

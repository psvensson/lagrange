import assert from 'node:assert/strict';
import {test} from '../../../../src/test-helpers/tap.js';
import {
  runTopologyFailureGate,
  runTopologyFailureGateMatrix,
} from '../topology-failure-gate-runner.js';
import {
  TOPOLOGY_FAILURE_GATE_MATRIX,
} from '../topology-failure-gate-matrix.js';

test('topology-failure-gate-runner executes and validates all matrix gates', async (t) => {
  const matrixResult = await runTopologyFailureGateMatrix();
  
  assert.equal(matrixResult.gateCount, TOPOLOGY_FAILURE_GATE_MATRIX.length);
  assert.equal(matrixResult.passedCount, TOPOLOGY_FAILURE_GATE_MATRIX.length);
  
  for (const result of matrixResult.results) {
    assert.equal(result.passed, true);
    assert.ok(result.gateId);
    assert.ok(result.scenario);
    assert.ok(result.owner);
    assert.ok(result.boundary);
    assert.ok(result.expectedDurableOutcome);
    assert.ok(Array.isArray(result.durableAssertions));
    assert.ok(Array.isArray(result.invariantResults));
    assert.ok(result.invariantState);
    assert.ok(Array.isArray(result.eventLog));
  }
  
  t.end();
});

test('topology-failure-gate-runner validates each gate entry individually', async (t) => {
  for (const entry of TOPOLOGY_FAILURE_GATE_MATRIX) {
    const result = await runTopologyFailureGate(entry);
    assert.equal(result.passed, true);
    assert.equal(result.gateId, entry.gateId);
  }
  t.end();
});

test('topology-failure-gate-runner contract validation engine rejects mismatching expectations', async (t) => {
  const originalEntry = TOPOLOGY_FAILURE_GATE_MATRIX[0];
  
  // Test 1: Mismatched/unknown expected owner reasons
  const invalidReasonsEntry = {
    ...originalEntry,
    expectedOwnerReasons: ['non_existent_reason'],
  };
  await assert.rejects(
    async () => {
      await runTopologyFailureGate(invalidReasonsEntry);
    },
    /Unknown expected owner reason: non_existent_reason/
  );

  // Test 2: Unwitnessed owner reason
  const unwitnessedReasonEntry = {
    ...originalEntry,
    expectedOwnerReasons: ['remote_coordinator_lost'],
  };
  await assert.rejects(
    async () => {
      await runTopologyFailureGate(unwitnessedReasonEntry);
    },
    /Expected owner reason "remote_coordinator_lost" was not witnessed/
  );

  // Test 3: Mismatched fencing requirement
  const invalidFencingEntry = {
    ...originalEntry,
    fencingRequirement: 'invalid_fencing',
  };
  await assert.rejects(
    async () => {
      await runTopologyFailureGate(invalidFencingEntry);
    },
    /Unknown fencing requirement: invalid_fencing/
  );

  // Test 4: Mismatched progress mechanism
  const unwitnessedMechanismEntry = {
    ...originalEntry,
    boundedProgressMechanisms: ['non_existent_mechanism'],
  };
  await assert.rejects(
    async () => {
      await runTopologyFailureGate(unwitnessedMechanismEntry);
    },
    /Unknown progress mechanism: non_existent_mechanism/
  );

  // Test 5: Mismatched durable assertion
  const invalidAssertionEntry = {
    ...originalEntry,
    durableAssertions: ['non_existent_assertion'],
  };
  await assert.rejects(
    async () => {
      await runTopologyFailureGate(invalidAssertionEntry);
    },
    /Unknown durable assertion: non_existent_assertion/
  );

  t.end();
});

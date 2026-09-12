import assert from 'node:assert/strict';

import {
  OLTP_SCENARIO_A_VISIBILITY_PROOF_IDS,
  buildScenarioAVisibilityCase,
  evaluateScenarioAVisibilityObservation,
} from '../../test/distributed/harness/oltp-scenario-a-visibility-case.js';

const PASSING_OBSERVATION = Object.freeze({
  initialWriterValue: 0,
  initialObserverValue: 0,
  writerOwnWriteValue: 137,
  observerUncommittedValue: 0,
  writerAfterRollbackValue: 0,
  observerAfterRollbackValue: 0,
});

const definition = buildScenarioAVisibilityCase();
const repeated = buildScenarioAVisibilityCase();

assert.equal(definition.identity.caseId, 'scenario-a-visibility-v1');
assert.equal(definition.identity.target.table, 'warehouse');
assert.equal(definition.identity.target.key.id, 1);
assert.equal(definition.identity.target.field, 'ytd_cents');
assert.equal(definition.identity.writeDeltaCents, 137);
assert.equal(definition.caseSha256, repeated.caseSha256);
assert.match(definition.caseSha256, /^[0-9a-f]{64}$/u);
assert.match(definition.identity.datasetSha256, /^[0-9a-f]{64}$/u);
assert.deepEqual(OLTP_SCENARIO_A_VISIBILITY_PROOF_IDS, [
  'forbidden:dirty_read',
  'isolation:dirtyReadsForbidden',
  'isolation:readYourOwnWritesRequired',
]);

const passing = evaluateScenarioAVisibilityObservation(PASSING_OBSERVATION);
assert.equal(passing.passed, true);
assert.deepEqual(passing.failures, []);
assert.deepEqual(passing.proofIds, OLTP_SCENARIO_A_VISIBILITY_PROOF_IDS);

const dirtyRead = evaluateScenarioAVisibilityObservation({
  ...PASSING_OBSERVATION,
  observerUncommittedValue: 137,
});
assert.equal(dirtyRead.passed, false);
assert.deepEqual(dirtyRead.failures, ['dirty_read']);
assert.deepEqual(dirtyRead.proofIds, []);

const missingOwnWrite = evaluateScenarioAVisibilityObservation({
  ...PASSING_OBSERVATION,
  writerOwnWriteValue: 0,
});
assert.equal(missingOwnWrite.passed, false);
assert.deepEqual(missingOwnWrite.failures, ['read_your_own_write']);
assert.deepEqual(missingOwnWrite.proofIds, []);

const rollbackLeak = evaluateScenarioAVisibilityObservation({
  ...PASSING_OBSERVATION,
  writerAfterRollbackValue: 137,
});
assert.equal(rollbackLeak.passed, false);
assert.deepEqual(rollbackLeak.failures, ['rollback_state']);
assert.deepEqual(rollbackLeak.proofIds, []);

assert.throws(
  () => evaluateScenarioAVisibilityObservation({}),
  /visibility initialWriterValue must be an integer/u,
);

console.log('oltp-scenario-a-visibility-case-guard: PASS');

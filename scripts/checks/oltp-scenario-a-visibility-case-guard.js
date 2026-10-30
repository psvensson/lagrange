import assert from 'node:assert/strict';

import {
  OLTP_SCENARIO_A_VISIBILITY_PROOF_IDS,
  buildScenarioAVisibilityCase,
  evaluateScenarioAVisibilityObservation,
} from '../../test/distributed/harness/oltp-scenario-a-visibility-case.js';

const EXPECTED_CASE_ID = 'scenario-a-visibility-v1';
const TARGET_TABLE = 'warehouse';
const TARGET_FIELD = 'ytd_cents';
const WRITE_DELTA_CENTS = 137;
const PROOF_ID_DIRTY_READ = 'forbidden:dirty_read';
const PROOF_ID_ISOLATION_DIRTY = 'isolation:dirtyReadsForbidden';
const PROOF_ID_ISOLATION_RYOW = 'isolation:readYourOwnWritesRequired';
const EXPECTED_PROOF_IDS = Object.freeze([
  PROOF_ID_DIRTY_READ,
  PROOF_ID_ISOLATION_DIRTY,
  PROOF_ID_ISOLATION_RYOW,
]);
const FAILURE_DIRTY_READ = 'dirty_read';
const FAILURE_READ_YOUR_OWN_WRITE = 'read_your_own_write';
const FAILURE_ROLLBACK_STATE = 'rollback_state';
const PASS_MESSAGE = 'oltp-scenario-a-visibility-case-guard: PASS';

const PASSING_OBSERVATION = Object.freeze({
  initialWriterValue: 0,
  initialObserverValue: 0,
  writerOwnWriteValue: WRITE_DELTA_CENTS,
  observerUncommittedValue: 0,
  writerAfterRollbackValue: 0,
  observerAfterRollbackValue: 0,
});

const definition = buildScenarioAVisibilityCase();
const repeated = buildScenarioAVisibilityCase();

assert.equal(definition.identity.caseId, EXPECTED_CASE_ID);
assert.equal(definition.identity.target.table, TARGET_TABLE);
assert.equal(definition.identity.target.key.id, 1);
assert.equal(definition.identity.target.field, TARGET_FIELD);
assert.equal(definition.identity.writeDeltaCents, WRITE_DELTA_CENTS);
assert.equal(definition.caseSha256, repeated.caseSha256);
assert.match(definition.caseSha256, /^[0-9a-f]{64}$/u);
assert.match(definition.identity.datasetSha256, /^[0-9a-f]{64}$/u);
assert.deepEqual(OLTP_SCENARIO_A_VISIBILITY_PROOF_IDS, EXPECTED_PROOF_IDS);

const passing = evaluateScenarioAVisibilityObservation(PASSING_OBSERVATION);
assert.equal(passing.passed, true);
assert.deepEqual(passing.failures, []);
assert.deepEqual(passing.proofIds, OLTP_SCENARIO_A_VISIBILITY_PROOF_IDS);

const dirtyRead = evaluateScenarioAVisibilityObservation({
  ...PASSING_OBSERVATION,
  observerUncommittedValue: WRITE_DELTA_CENTS,
});
assert.equal(dirtyRead.passed, false);
assert.deepEqual(dirtyRead.failures, [FAILURE_DIRTY_READ]);
assert.deepEqual(dirtyRead.proofIds, []);

const missingOwnWrite = evaluateScenarioAVisibilityObservation({
  ...PASSING_OBSERVATION,
  writerOwnWriteValue: 0,
});
assert.equal(missingOwnWrite.passed, false);
assert.deepEqual(missingOwnWrite.failures, [FAILURE_READ_YOUR_OWN_WRITE]);
assert.deepEqual(missingOwnWrite.proofIds, []);

const rollbackLeak = evaluateScenarioAVisibilityObservation({
  ...PASSING_OBSERVATION,
  writerAfterRollbackValue: WRITE_DELTA_CENTS,
});
assert.equal(rollbackLeak.passed, false);
assert.deepEqual(rollbackLeak.failures, [FAILURE_ROLLBACK_STATE]);
assert.deepEqual(rollbackLeak.proofIds, []);

assert.throws(
  () => evaluateScenarioAVisibilityObservation({}),
  /visibility initialWriterValue must be an integer/u,
);

console.log(PASS_MESSAGE);

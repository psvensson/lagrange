import assert from 'node:assert/strict';

import {
  OLTP_PAIRED_RETRY_OUTCOME,
  OLTP_SERIALIZATION_FAILURE_SQLSTATE,
  classifyOltpAttemptError,
} from '../../test/distributed/harness/oltp-paired-retry-owner.js';
import {
  OLTP_SCENARIO_A_RETRYABLE_CONFLICT_PROOF_IDS,
  buildScenarioARetryableConflictCase,
  evaluateScenarioARetryableConflictObservation,
} from '../../test/distributed/harness/oltp-scenario-a-retryable-conflict-case.js';

const definition = buildScenarioARetryableConflictCase();
const repeated = buildScenarioARetryableConflictCase();

assert.equal(definition.identity.caseId, 'scenario-a-retryable-conflict-v1');
assert.equal(definition.caseSha256, repeated.caseSha256);
assert.match(definition.caseSha256, /^[0-9a-f]{64}$/u);
assert.deepEqual(OLTP_SCENARIO_A_RETRYABLE_CONFLICT_PROOF_IDS, [
  'outcome:retryableConflictSqlState:40001',
]);
assert.equal(
  definition.identity.expected.sqlState,
  OLTP_SERIALIZATION_FAILURE_SQLSTATE,
);
assert.equal(
  definition.identity.expected.outcome,
  OLTP_PAIRED_RETRY_OUTCOME.SERIALIZATION_CONFLICT,
);

const classification = classifyOltpAttemptError({sqlState: '40001'});
assert.deepEqual(classification, {
  retryable: true,
  outcome: OLTP_PAIRED_RETRY_OUTCOME.SERIALIZATION_CONFLICT,
  sqlState: '40001',
});

const passing = evaluateScenarioARetryableConflictObservation({sqlState: '40001'});
assert.equal(passing.passed, true);
assert.deepEqual(passing.failures, []);
assert.deepEqual(
  passing.proofIds,
  OLTP_SCENARIO_A_RETRYABLE_CONFLICT_PROOF_IDS,
);

const terminal = evaluateScenarioARetryableConflictObservation({sqlState: 'HY000'});
assert.equal(terminal.passed, false);
assert.deepEqual(terminal.failures, ['sql_state', 'retryable', 'outcome']);
assert.deepEqual(terminal.proofIds, []);

const absent = evaluateScenarioARetryableConflictObservation({});
assert.equal(absent.passed, false);
assert.deepEqual(absent.failures, ['sql_state', 'retryable', 'outcome']);
assert.deepEqual(absent.proofIds, []);

console.log('oltp-scenario-a-retryable-conflict-case-guard: PASS');

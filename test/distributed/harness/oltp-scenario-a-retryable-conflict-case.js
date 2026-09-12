import {createHash} from 'node:crypto';

import {
  OLTP_PAIRED_RETRY_OUTCOME,
  OLTP_SERIALIZATION_FAILURE_SQLSTATE,
  classifyOltpAttemptError,
} from './oltp-paired-retry-owner.js';
import {
  OLTP_SCENARIO_A_REQUIRED_SYSTEM_PROOF_IDS,
} from './oltp-scenario-a-semantic-gate.js';

const ZERO = 0;
const CASE_ID = 'scenario-a-retryable-conflict-v1';
const CLAIMED_PROOF_IDS = Object.freeze([
  `outcome:retryableConflictSqlState:${OLTP_SERIALIZATION_FAILURE_SQLSTATE}`,
]);

function freezeRecord(value) {
  if (!value || typeof value !== 'object' || Object.isFrozen(value)) return value;
  for (const child of Object.values(value)) freezeRecord(child);
  return Object.freeze(value);
}

function buildScenarioARetryableConflictCase() {
  const identity = freezeRecord({
    caseId: CASE_ID,
    expected: {
      sqlState: OLTP_SERIALIZATION_FAILURE_SQLSTATE,
      retryable: true,
      outcome: OLTP_PAIRED_RETRY_OUTCOME.SERIALIZATION_CONFLICT,
    },
    claimedProofIds: CLAIMED_PROOF_IDS,
  });
  return freezeRecord({
    identity,
    caseSha256: createHash('sha256')
      .update(JSON.stringify(identity))
      .digest('hex'),
  });
}

function normalizeSqlState(value) {
  return String(value || '').trim().toUpperCase();
}

function evaluateScenarioARetryableConflictObservation(observation = {}) {
  const definition = buildScenarioARetryableConflictCase();
  const expected = definition.identity.expected;
  const classification = classifyOltpAttemptError({
    sqlState: normalizeSqlState(observation.sqlState),
  });
  const actual = freezeRecord({
    sqlState: classification.sqlState,
    retryable: classification.retryable,
    outcome: classification.outcome,
  });
  const failures = [];
  if (actual.sqlState !== expected.sqlState) failures.push('sql_state');
  if (actual.retryable !== expected.retryable) failures.push('retryable');
  if (actual.outcome !== expected.outcome) failures.push('outcome');
  return freezeRecord({
    passed: failures.length === ZERO,
    failures,
    actual,
    expected,
    proofIds: failures.length === ZERO ? CLAIMED_PROOF_IDS : [],
  });
}

function assertClaimedProofIdsAreCanonical() {
  const required = new Set(OLTP_SCENARIO_A_REQUIRED_SYSTEM_PROOF_IDS);
  for (const proofId of CLAIMED_PROOF_IDS) {
    if (!required.has(proofId)) {
      throw new Error(`retryable-conflict case claims unknown semantic proof ${proofId}`);
    }
  }
}

assertClaimedProofIdsAreCanonical();

export {
  CLAIMED_PROOF_IDS as OLTP_SCENARIO_A_RETRYABLE_CONFLICT_PROOF_IDS,
  buildScenarioARetryableConflictCase,
  evaluateScenarioARetryableConflictObservation,
};

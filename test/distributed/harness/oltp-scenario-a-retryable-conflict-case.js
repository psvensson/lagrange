import {createHash} from 'node:crypto';

import {
  OLTP_PAIRED_RETRY_OUTCOME,
  OLTP_SERIALIZATION_FAILURE_SQLSTATE,
  classifyOltpAttemptError,
} from './oltp-paired-retry-owner.js';
import {
  OLTP_SCENARIO_A_REQUIRED_SYSTEM_PROOF_IDS,
} from './oltp-scenario-a-semantic-gate.js';

const stringToUpperCase = Function.call.bind(String.prototype.toUpperCase);
const stringTrim = Function.call.bind(String.prototype.trim);

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

// The semantic profile's observable contract for two concurrent conflicting
// logical requests (coordinator decision 5, 2026-11-02): both end committed
// with BOTH effects in the final state - either because the engine blocked
// the second until the first committed, or because the loser got exactly one
// retryable conflict (40001) and committed on retry through the retry owner.
// A lost effect or any other SQLSTATE is a product anomaly. The mechanism is
// a recorded fact, not a requirement.
function buildScenarioARetryableConflictCase() {
  const identity = freezeRecord({
    caseId: CASE_ID,
    expected: {
      effectsPresent: 2,
      loserSqlStateWhenConflicting: OLTP_SERIALIZATION_FAILURE_SQLSTATE,
      loserOutcomeWhenConflicting: OLTP_PAIRED_RETRY_OUTCOME.SERIALIZATION_CONFLICT,
      loserCommitsOnRetry: true,
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
  return stringToUpperCase(stringTrim(String(value || '')));
}

function effectsObserved(effects) {
  return Boolean(effects) && Number.isFinite(effects.baseline) &&
    Number.isFinite(effects.final) && Number.isFinite(effects.delta);
}

function evaluateScenarioARetryableConflictObservation(observation = {}) {
  const definition = buildScenarioARetryableConflictCase();
  const expected = definition.identity.expected;
  const failures = [];
  const effects = observation.effects;
  const victimSqlState = observation.victimSqlState ?? null;
  if (!effectsObserved(effects)) {
    failures.push('effects_unobserved');
  } else {
    if (victimSqlState !== null) {
      const classification = classifyOltpAttemptError({
        sqlState: normalizeSqlState(victimSqlState),
      });
      if (!classification.retryable) failures.push('unexpected_sql_state');
      else if (observation.retryCommitted !== true) failures.push('retry_not_committed');
    }
    if (effects.final !== effects.baseline + expected.effectsPresent * effects.delta) {
      failures.push('lost_update');
    }
  }
  const actual = freezeRecord({mechanism: observation.mechanism ?? null, victimSqlState,
    retryCommitted: observation.retryCommitted ?? null, effects: effects ?? null});
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

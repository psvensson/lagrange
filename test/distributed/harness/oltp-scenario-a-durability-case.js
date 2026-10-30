import {createHash} from 'node:crypto';

import {
  buildScenarioAPaymentCase,
  evaluateScenarioAPaymentObservation,
} from './oltp-scenario-a-payment-case.js';
import {
  OLTP_SCENARIO_A_REQUIRED_SYSTEM_PROOF_IDS,
} from './oltp-scenario-a-semantic-gate.js';

const ZERO = 0;
const CASE_ID = 'scenario-a-durable-commit-v1';
const SHA256_PATTERN = /^[0-9a-f]{64}$/u;
const CLAIMED_PROOF_IDS = Object.freeze([
  'isolation:atomicCommitRequired',
  'isolation:successfulCommitDurable',
].sort());

function freezeRecord(value) {
  if (!value || typeof value !== 'object' || Object.isFrozen(value)) return value;
  for (const child of Object.values(value)) freezeRecord(child);
  return Object.freeze(value);
}

function buildScenarioADurabilityCase() {
  const payment = buildScenarioAPaymentCase();
  const identity = freezeRecord({
    caseId: CASE_ID,
    sourcePaymentCaseId: payment.identity.caseId,
    sourcePaymentCaseSha256: payment.caseSha256,
    datasetSha256: payment.identity.datasetSha256,
    workload: payment.identity.workload,
    operation: payment.identity.operation,
    claimedProofIds: CLAIMED_PROOF_IDS,
  });
  return freezeRecord({
    identity,
    caseSha256: createHash('sha256')
      .update(JSON.stringify(identity))
      .digest('hex'),
  });
}

function normalizeSha256(value, label) {
  const digest = String(value || '').trim().toLowerCase();
  if (!SHA256_PATTERN.test(digest)) {
    throw new Error(`${label} must be a SHA-256 digest`);
  }
  return digest;
}

function evaluateScenarioADurabilityObservation(observation = {}) {
  const paymentEvaluation = evaluateScenarioAPaymentObservation(
    observation.paymentObservation || {},
  );
  const actual = freezeRecord({
    commitAcknowledged: observation.commitAcknowledged === true,
    paymentPassed: paymentEvaluation.passed,
    stateBeforeRestartSha256: normalizeSha256(
      observation.stateBeforeRestartSha256,
      'durability stateBeforeRestartSha256',
    ),
    stateAfterRestartSha256: normalizeSha256(
      observation.stateAfterRestartSha256,
      'durability stateAfterRestartSha256',
    ),
  });
  const failures = [];
  if (!actual.commitAcknowledged) failures.push('commit_not_acknowledged');
  if (!actual.paymentPassed) failures.push('transaction_state');
  if (actual.stateBeforeRestartSha256 !== actual.stateAfterRestartSha256) {
    failures.push('durability_state');
  }
  return freezeRecord({
    passed: failures.length === ZERO,
    failures,
    actual,
    paymentEvaluation,
    proofIds: failures.length === ZERO ? CLAIMED_PROOF_IDS : [],
  });
}

function assertClaimedProofIdsAreCanonical() {
  const required = new Set(OLTP_SCENARIO_A_REQUIRED_SYSTEM_PROOF_IDS);
  for (const proofId of CLAIMED_PROOF_IDS) {
    if (!required.has(proofId)) {
      throw new Error(`durability case claims unknown semantic proof ${proofId}`);
    }
  }
}

assertClaimedProofIdsAreCanonical();

export {
  CLAIMED_PROOF_IDS as OLTP_SCENARIO_A_DURABILITY_PROOF_IDS,
  buildScenarioADurabilityCase,
  evaluateScenarioADurabilityObservation,
};

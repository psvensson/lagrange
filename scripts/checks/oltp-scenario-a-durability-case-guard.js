import assert from 'node:assert/strict';

import {
  buildScenarioADurabilityCase,
  evaluateScenarioADurabilityObservation,
  OLTP_SCENARIO_A_DURABILITY_PROOF_IDS,
} from '../../test/distributed/harness/oltp-scenario-a-durability-case.js';
import {
  buildScenarioAPaymentCase,
} from '../../test/distributed/harness/oltp-scenario-a-payment-case.js';

const definition = buildScenarioADurabilityCase();
const repeated = buildScenarioADurabilityCase();
const payment = buildScenarioAPaymentCase();
const stableStateSha256 = 'a'.repeat(64);
const passingObservation = {
  commitAcknowledged: true,
  paymentObservation: {...payment.identity.expected},
  stateBeforeRestartSha256: stableStateSha256,
  stateAfterRestartSha256: stableStateSha256,
};

assert.equal(definition.identity.caseId, 'scenario-a-durable-commit-v1');
assert.equal(definition.identity.sourcePaymentCaseId, payment.identity.caseId);
assert.equal(definition.identity.sourcePaymentCaseSha256, payment.caseSha256);
assert.equal(definition.caseSha256, repeated.caseSha256);
assert.match(definition.caseSha256, /^[0-9a-f]{64}$/u);
assert.match(definition.identity.datasetSha256, /^[0-9a-f]{64}$/u);
assert.deepEqual(OLTP_SCENARIO_A_DURABILITY_PROOF_IDS, [
  'isolation:atomicCommitRequired',
  'isolation:successfulCommitDurable',
]);

const passing = evaluateScenarioADurabilityObservation(passingObservation);
assert.equal(passing.passed, true);
assert.deepEqual(passing.failures, []);
assert.equal(passing.paymentEvaluation.passed, true);
assert.deepEqual(passing.proofIds, OLTP_SCENARIO_A_DURABILITY_PROOF_IDS);

const notAcknowledged = evaluateScenarioADurabilityObservation({
  ...passingObservation,
  commitAcknowledged: false,
});
assert.equal(notAcknowledged.passed, false);
assert.deepEqual(notAcknowledged.failures, ['commit_not_acknowledged']);
assert.deepEqual(notAcknowledged.proofIds, []);

const partialTransaction = evaluateScenarioADurabilityObservation({
  ...passingObservation,
  paymentObservation: {
    ...passingObservation.paymentObservation,
    warehouseYtdCents: payment.identity.expected.warehouseYtdCents + 1,
  },
});
assert.equal(partialTransaction.passed, false);
assert.deepEqual(partialTransaction.failures, ['transaction_state']);
assert.deepEqual(partialTransaction.proofIds, []);

const lostAfterRestart = evaluateScenarioADurabilityObservation({
  ...passingObservation,
  stateAfterRestartSha256: 'b'.repeat(64),
});
assert.equal(lostAfterRestart.passed, false);
assert.deepEqual(lostAfterRestart.failures, ['durability_state']);
assert.deepEqual(lostAfterRestart.proofIds, []);

assert.throws(
  () => evaluateScenarioADurabilityObservation({
    ...passingObservation,
    stateAfterRestartSha256: 'not-a-digest',
  }),
  /durability stateAfterRestartSha256 must be a SHA-256 digest/u,
);

console.log('oltp-scenario-a-durability-case-guard: PASS');

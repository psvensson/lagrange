import assert from 'node:assert/strict';

import {
  OLTP_SCENARIO_A_PAYMENT_PROOF_IDS,
  buildScenarioAPaymentCase,
  evaluateScenarioAPaymentObservation,
} from '../../test/distributed/harness/oltp-scenario-a-payment-case.js';

const definition = buildScenarioAPaymentCase();
const repeated = buildScenarioAPaymentCase();
const expected = definition.identity.expected;
const passingObservation = {...expected};

assert.equal(definition.identity.caseId, 'scenario-a-payment-v1');
assert.equal(definition.identity.operation.kind, 'payment');
assert.equal(definition.caseSha256, repeated.caseSha256);
assert.match(definition.caseSha256, /^[0-9a-f]{64}$/u);
assert.match(definition.identity.datasetSha256, /^[0-9a-f]{64}$/u);
assert.equal(OLTP_SCENARIO_A_PAYMENT_PROOF_IDS.length, 7);

const passing = evaluateScenarioAPaymentObservation(passingObservation);
assert.equal(passing.passed, true);
assert.deepEqual(passing.failures, []);
assert.deepEqual(passing.proofIds, OLTP_SCENARIO_A_PAYMENT_PROOF_IDS);

const duplicateWarehouseEffect = evaluateScenarioAPaymentObservation({
  ...passingObservation,
  warehouseYtdCents:
    expected.warehouseYtdCents + definition.identity.operation.amountCents,
});
assert.equal(duplicateWarehouseEffect.passed, false);
assert.deepEqual(duplicateWarehouseEffect.failures, ['warehouse_ytd']);
assert.deepEqual(duplicateWarehouseEffect.proofIds, []);

const missingHistory = evaluateScenarioAPaymentObservation({
  ...passingObservation,
  historyCount: 0,
});
assert.equal(missingHistory.passed, false);
assert.deepEqual(missingHistory.failures, ['history_row']);
assert.deepEqual(missingHistory.proofIds, []);

const wrongCounters = evaluateScenarioAPaymentObservation({
  ...passingObservation,
  customerPaymentCount: expected.customerPaymentCount + 1,
});
assert.equal(wrongCounters.passed, false);
assert.deepEqual(wrongCounters.failures, ['customer_payment_counters']);
assert.deepEqual(wrongCounters.proofIds, []);

assert.throws(
  () => evaluateScenarioAPaymentObservation({}),
  /payment paidCents must be an integer/u,
);

console.log('oltp-scenario-a-payment-case-guard: PASS');

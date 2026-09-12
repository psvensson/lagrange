import assert from 'node:assert/strict';

import {
  OLTP_SCENARIO_A_ORDER_STATUS_PROOF_IDS,
  buildScenarioAOrderStatusCase,
  evaluateScenarioAOrderStatusObservation,
} from '../../test/distributed/harness/oltp-scenario-a-order-status-case.js';

const definition = buildScenarioAOrderStatusCase();
const repeated = buildScenarioAOrderStatusCase();
const expected = definition.identity.expected;
const stableStateSha256 = 'a'.repeat(64);
const passingObservation = {
  orderId: expected.orderId,
  lineCount: expected.lineCount,
  stateBeforeSha256: stableStateSha256,
  stateAfterSha256: stableStateSha256,
};

assert.equal(definition.identity.caseId, 'scenario-a-order-status-v1');
assert.equal(definition.identity.operation.kind, 'order_status');
assert.equal(definition.identity.setupOperation.kind, 'new_order');
assert.equal(
  definition.identity.setupOperation.customerId,
  definition.identity.operation.customerId,
);
assert.equal(
  definition.identity.setupOperation.warehouseId,
  definition.identity.operation.warehouseId,
);
assert.equal(
  definition.identity.setupOperation.districtId,
  definition.identity.operation.districtId,
);
assert.equal(definition.identity.setupOperation.lines.length, 5);
assert.equal(definition.caseSha256, repeated.caseSha256);
assert.match(definition.caseSha256, /^[0-9a-f]{64}$/u);
assert.match(definition.identity.datasetSha256, /^[0-9a-f]{64}$/u);
assert.equal(OLTP_SCENARIO_A_ORDER_STATUS_PROOF_IDS.length, 3);
assert.equal(
  OLTP_SCENARIO_A_ORDER_STATUS_PROOF_IDS.includes(
    'forbidden:read_only_transaction_mutation',
  ),
  true,
);

const passing = evaluateScenarioAOrderStatusObservation(passingObservation);
assert.equal(passing.passed, true);
assert.deepEqual(passing.failures, []);
assert.deepEqual(passing.proofIds, OLTP_SCENARIO_A_ORDER_STATUS_PROOF_IDS);

const staleOrder = evaluateScenarioAOrderStatusObservation({
  ...passingObservation,
  orderId: expected.orderId + 1,
});
assert.equal(staleOrder.passed, false);
assert.deepEqual(staleOrder.failures, ['latest_order']);
assert.deepEqual(staleOrder.proofIds, []);

const missingLine = evaluateScenarioAOrderStatusObservation({
  ...passingObservation,
  lineCount: expected.lineCount - 1,
});
assert.equal(missingLine.passed, false);
assert.deepEqual(missingLine.failures, ['line_count']);
assert.deepEqual(missingLine.proofIds, []);

const mutatedState = evaluateScenarioAOrderStatusObservation({
  ...passingObservation,
  stateAfterSha256: 'b'.repeat(64),
});
assert.equal(mutatedState.passed, false);
assert.deepEqual(mutatedState.failures, ['database_state']);
assert.deepEqual(mutatedState.proofIds, []);

assert.throws(
  () => evaluateScenarioAOrderStatusObservation({}),
  /order-status orderId must be an integer/u,
);

console.log('oltp-scenario-a-order-status-case-guard: PASS');

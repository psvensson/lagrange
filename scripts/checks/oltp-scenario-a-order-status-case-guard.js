import assert from 'node:assert/strict';

import {
  OLTP_SCENARIO_A_ORDER_STATUS_PROOF_IDS,
  buildScenarioAOrderStatusCase,
  evaluateScenarioAOrderStatusObservation,
} from '../../test/distributed/harness/oltp-scenario-a-order-status-case.js';

const arrayIncludes = Function.call.bind(Array.prototype.includes);

const EXPECTED_CASE_ID = 'scenario-a-order-status-v1';
const EXPECTED_OPERATION_KIND = 'order_status';
const EXPECTED_SETUP_KIND = 'new_order';
const EXPECTED_LINE_COUNT = 5;
const EXPECTED_PROOF_ID_COUNT = 4;
const PROOF_ID_READ_ONLY = 'forbidden:read_only_transaction_mutation';
const PROOF_ID_LINES_MATCH =
  'transaction:order_status:returned_lines_belong_to_returned_order';
const FAILURE_LATEST_ORDER = 'latest_order';
const FAILURE_LINE_COUNT = 'line_count';
const FAILURE_ORDER_LINES = 'order_lines';
const FAILURE_DATABASE_STATE = 'database_state';
const SHA256_STABLE_CHAR = 'a';
const SHA256_MUTATED_CHAR = 'b';
const SHA256_LENGTH = 64;
const PASS_MESSAGE = 'oltp-scenario-a-order-status-case-guard: PASS';

const definition = buildScenarioAOrderStatusCase();
const repeated = buildScenarioAOrderStatusCase();
const expected = definition.identity.expected;
const stableStateSha256 = SHA256_STABLE_CHAR.repeat(SHA256_LENGTH);
const passingObservation = {
  orderId: expected.orderId,
  lineCount: expected.lineCount,
  lines: expected.lines,
  stateBeforeSha256: stableStateSha256,
  stateAfterSha256: stableStateSha256,
};

assert.equal(definition.identity.caseId, EXPECTED_CASE_ID);
assert.equal(definition.identity.operation.kind, EXPECTED_OPERATION_KIND);
assert.equal(definition.identity.setupOperation.kind, EXPECTED_SETUP_KIND);
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
assert.equal(definition.identity.setupOperation.lines.length, EXPECTED_LINE_COUNT);
assert.equal(expected.lines.length, EXPECTED_LINE_COUNT);
assert.equal(definition.caseSha256, repeated.caseSha256);
assert.match(definition.caseSha256, /^[0-9a-f]{64}$/u);
assert.match(definition.identity.datasetSha256, /^[0-9a-f]{64}$/u);
assert.equal(OLTP_SCENARIO_A_ORDER_STATUS_PROOF_IDS.length, EXPECTED_PROOF_ID_COUNT);
assert.equal(
  arrayIncludes(
    OLTP_SCENARIO_A_ORDER_STATUS_PROOF_IDS,
    PROOF_ID_READ_ONLY,
  ),
  true,
);
assert.equal(
  arrayIncludes(
    OLTP_SCENARIO_A_ORDER_STATUS_PROOF_IDS,
    PROOF_ID_LINES_MATCH,
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
assert.deepEqual(staleOrder.failures, [FAILURE_LATEST_ORDER]);
assert.deepEqual(staleOrder.proofIds, []);

const missingLine = evaluateScenarioAOrderStatusObservation({
  ...passingObservation,
  lineCount: expected.lineCount - 1,
});
assert.equal(missingLine.passed, false);
assert.deepEqual(missingLine.failures, [FAILURE_LINE_COUNT]);
assert.deepEqual(missingLine.proofIds, []);

const wrongLine = structuredClone(passingObservation);
wrongLine.lines[0].itemId += 1;
const foreignLine = evaluateScenarioAOrderStatusObservation(wrongLine);
assert.equal(foreignLine.passed, false);
assert.deepEqual(foreignLine.failures, [FAILURE_ORDER_LINES]);
assert.deepEqual(foreignLine.proofIds, []);

const mutatedState = evaluateScenarioAOrderStatusObservation({
  ...passingObservation,
  stateAfterSha256: SHA256_MUTATED_CHAR.repeat(SHA256_LENGTH),
});
assert.equal(mutatedState.passed, false);
assert.deepEqual(mutatedState.failures, [FAILURE_DATABASE_STATE]);
assert.deepEqual(mutatedState.proofIds, []);

assert.throws(
  () => evaluateScenarioAOrderStatusObservation({}),
  /order-status orderId must be an integer/u,
);
assert.throws(
  () => evaluateScenarioAOrderStatusObservation({
    ...passingObservation,
    lines: null,
  }),
  /order-status lines must be an array/u,
);

console.log(PASS_MESSAGE);

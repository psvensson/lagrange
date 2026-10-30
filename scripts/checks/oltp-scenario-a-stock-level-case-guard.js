import assert from 'node:assert/strict';

import {
  OLTP_SCENARIO_A_STOCK_LEVEL_PROOF_IDS,
  buildScenarioAStockLevelCase,
  evaluateScenarioAStockLevelObservation,
  projectScenarioAStockQuantity,
} from '../../test/distributed/harness/oltp-scenario-a-stock-level-case.js';

const arrayIncludes = Function.call.bind(Array.prototype.includes);

const EXPECTED_CASE_ID = 'scenario-a-stock-level-v1';
const EXPECTED_OPERATION_KIND = 'stock_level';
const EXPECTED_SETUP_KIND = 'new_order';
const EXPECTED_THRESHOLD = 19;
const EXPECTED_LINE_COUNT = 5;
const EXPECTED_LOW_STOCK = 5;
const EXPECTED_PROOF_ID_COUNT = 2;
const EXPECTED_QUANTITY = 10;
const PROOF_ID_READ_ONLY = 'forbidden:read_only_transaction_mutation';
const FAILURE_LOW_STOCK_COUNT = 'low_stock_count';
const FAILURE_DATABASE_STATE = 'database_state';
const SHA256_STABLE_CHAR = 'c';
const SHA256_MUTATED_CHAR = 'd';
const SHA256_LENGTH = 64;
const PASS_MESSAGE = 'oltp-scenario-a-stock-level-case-guard: PASS';

const definition = buildScenarioAStockLevelCase();
const repeated = buildScenarioAStockLevelCase();
const expected = definition.identity.expected;
const stableStateSha256 = SHA256_STABLE_CHAR.repeat(SHA256_LENGTH);
const passingObservation = {
  lowStock: expected.lowStock,
  stateBeforeSha256: stableStateSha256,
  stateAfterSha256: stableStateSha256,
};

assert.equal(definition.identity.caseId, EXPECTED_CASE_ID);
assert.equal(definition.identity.operation.kind, EXPECTED_OPERATION_KIND);
assert.equal(definition.identity.setupOperation.kind, EXPECTED_SETUP_KIND);
assert.equal(definition.identity.operation.threshold, EXPECTED_THRESHOLD);
assert.equal(definition.identity.setupOperation.lines.length, EXPECTED_LINE_COUNT);
assert.equal(definition.identity.expected.lowStock, EXPECTED_LOW_STOCK);
assert.equal(definition.caseSha256, repeated.caseSha256);
assert.match(definition.caseSha256, /^[0-9a-f]{64}$/u);
assert.match(definition.identity.datasetSha256, /^[0-9a-f]{64}$/u);
assert.equal(OLTP_SCENARIO_A_STOCK_LEVEL_PROOF_IDS.length, EXPECTED_PROOF_ID_COUNT);
assert.equal(
  arrayIncludes(
    OLTP_SCENARIO_A_STOCK_LEVEL_PROOF_IDS,
    PROOF_ID_READ_ONLY,
  ),
  false,
);

for (const line of definition.identity.setupOperation.lines) {
  assert.equal(line.quantity, EXPECTED_QUANTITY);
  assert.equal(line.supplyWarehouseId, definition.identity.operation.warehouseId);
}

const initialQuantities = new Map([
  [9, 25],
  [23, 27],
  [52, 22],
  [54, 22],
  [67, 28],
]);
for (const line of definition.identity.setupOperation.lines) {
  const initial = initialQuantities.get(line.itemId);
  assert.notEqual(initial, undefined);
  assert.equal(
    projectScenarioAStockQuantity(initial, line.quantity) <
      definition.identity.operation.threshold,
    true,
  );
}

const passing = evaluateScenarioAStockLevelObservation(passingObservation);
assert.equal(passing.passed, true);
assert.deepEqual(passing.failures, []);
assert.deepEqual(passing.proofIds, OLTP_SCENARIO_A_STOCK_LEVEL_PROOF_IDS);

const wrongCount = evaluateScenarioAStockLevelObservation({
  ...passingObservation,
  lowStock: expected.lowStock - 1,
});
assert.equal(wrongCount.passed, false);
assert.deepEqual(wrongCount.failures, [FAILURE_LOW_STOCK_COUNT]);
assert.deepEqual(wrongCount.proofIds, []);

const mutatedState = evaluateScenarioAStockLevelObservation({
  ...passingObservation,
  stateAfterSha256: SHA256_MUTATED_CHAR.repeat(SHA256_LENGTH),
});
assert.equal(mutatedState.passed, false);
assert.deepEqual(mutatedState.failures, [FAILURE_DATABASE_STATE]);
assert.deepEqual(mutatedState.proofIds, []);

assert.throws(
  () => evaluateScenarioAStockLevelObservation({}),
  /stock-level lowStock must be an integer/u,
);

console.log(PASS_MESSAGE);

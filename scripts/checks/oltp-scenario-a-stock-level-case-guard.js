import assert from 'node:assert/strict';

import {
  OLTP_SCENARIO_A_STOCK_LEVEL_PROOF_IDS,
  buildScenarioAStockLevelCase,
  evaluateScenarioAStockLevelObservation,
  projectScenarioAStockQuantity,
} from '../../test/distributed/harness/oltp-scenario-a-stock-level-case.js';

const definition = buildScenarioAStockLevelCase();
const repeated = buildScenarioAStockLevelCase();
const expected = definition.identity.expected;
const stableStateSha256 = 'c'.repeat(64);
const passingObservation = {
  lowStock: expected.lowStock,
  stateBeforeSha256: stableStateSha256,
  stateAfterSha256: stableStateSha256,
};

assert.equal(definition.identity.caseId, 'scenario-a-stock-level-v1');
assert.equal(definition.identity.operation.kind, 'stock_level');
assert.equal(definition.identity.setupOperation.kind, 'new_order');
assert.equal(definition.identity.operation.threshold, 19);
assert.equal(definition.identity.setupOperation.lines.length, 5);
assert.equal(definition.identity.expected.lowStock, 5);
assert.equal(definition.caseSha256, repeated.caseSha256);
assert.match(definition.caseSha256, /^[0-9a-f]{64}$/u);
assert.match(definition.identity.datasetSha256, /^[0-9a-f]{64}$/u);
assert.equal(OLTP_SCENARIO_A_STOCK_LEVEL_PROOF_IDS.length, 2);
assert.equal(
  OLTP_SCENARIO_A_STOCK_LEVEL_PROOF_IDS.includes(
    'forbidden:read_only_transaction_mutation',
  ),
  false,
);

for (const line of definition.identity.setupOperation.lines) {
  assert.equal(line.quantity, 10);
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
assert.deepEqual(wrongCount.failures, ['low_stock_count']);
assert.deepEqual(wrongCount.proofIds, []);

const mutatedState = evaluateScenarioAStockLevelObservation({
  ...passingObservation,
  stateAfterSha256: 'd'.repeat(64),
});
assert.equal(mutatedState.passed, false);
assert.deepEqual(mutatedState.failures, ['database_state']);
assert.deepEqual(mutatedState.proofIds, []);

assert.throws(
  () => evaluateScenarioAStockLevelObservation({}),
  /stock-level lowStock must be an integer/u,
);

console.log('oltp-scenario-a-stock-level-case-guard: PASS');

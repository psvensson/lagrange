#!/usr/bin/env node

import assert from 'node:assert/strict';

import {
  OLTP_SCENARIO_A_NEW_ORDER_CONTENTION_OPERATIONS,
  OLTP_SCENARIO_A_NEW_ORDER_CONTENTION_PROOF_IDS,
  OLTP_SCENARIO_A_NEW_ORDER_CONTENTION_WORKLOAD,
  buildScenarioANewOrderContentionCase,
  evaluateScenarioANewOrderContentionObservation,
} from '../../test/distributed/harness/oltp-scenario-a-new-order-contention-case.js';
import {
  OLTP_SCENARIO_A_REQUIRED_SYSTEM_PROOF_IDS,
} from '../../test/distributed/harness/oltp-scenario-a-semantic-gate.js';

const arrayEvery = Function.call.bind(Array.prototype.every);
const arrayIncludes = Function.call.bind(Array.prototype.includes);
const arrayMap = Function.call.bind(Array.prototype.map);
const arraySome = Function.call.bind(Array.prototype.some);

const PASS_LINE = 'oltp-scenario-a-new-order-contention-case-guard: PASS\n';
const EXPECTED_CASE_ID = 'scenario-a-new-order-district-contention-v1';
const EXPECTED_OPERATION_KIND = 'new_order';
const EXPECTED_DISTRICT_NEXT_ORDER_ID = 3;
const EXPECTED_LINE_COUNT = 5;
const EXPECTED_STOCK_ROWS_COUNT = 10;
const PROOF_ID_DURABLE = 'isolation:successfulCommitDurable';
const PROOF_ID_CONFLICT = 'outcome:retryableConflictSqlState:40001';
const PROOF_ID_FAILURE_ATOMICITY =
  'failureAtomicity:terminal_logical_request_must_not_leave_partial_transaction_effects';
const FAILURE_STOCK_EFFECTS = 'stock_effects';
const INVALID_STOCK_ROWS = 'not-an-array';

function passingObservation() {
  const {identity} = buildScenarioANewOrderContentionCase();
  return {
    logicalCommitted: identity.expected.logicalRequestCount,
    districtNextOrderId: identity.expected.districtNextOrderId,
    orderIds: [...identity.expected.orderIds].reverse(),
    newOrderIds: [...identity.expected.newOrderIds].reverse(),
    orderLineCountByOrderId: {...identity.expected.orderLineCountByOrderId},
    stockRows: [...identity.expected.stockRows].reverse(),
  };
}

function assertDefinition() {
  const first = buildScenarioANewOrderContentionCase();
  const second = buildScenarioANewOrderContentionCase();
  assert.equal(first.identity.caseId, EXPECTED_CASE_ID);
  assert.equal(first.caseSha256, second.caseSha256);
  assert.match(first.caseSha256, /^[0-9a-f]{64}$/u);
  assert.match(first.identity.datasetSha256, /^[0-9a-f]{64}$/u);
  assert.equal(OLTP_SCENARIO_A_NEW_ORDER_CONTENTION_WORKLOAD.workers, 2);
  assert.equal(OLTP_SCENARIO_A_NEW_ORDER_CONTENTION_OPERATIONS.length, 2);
  assert.equal(
    arrayEvery(
      OLTP_SCENARIO_A_NEW_ORDER_CONTENTION_OPERATIONS,
      (operation) =>
        operation.kind === EXPECTED_OPERATION_KIND &&
        operation.warehouseId === 1 &&
        operation.districtId === 1,
    ),
    true,
  );
  const itemSets = arrayMap(
    OLTP_SCENARIO_A_NEW_ORDER_CONTENTION_OPERATIONS,
    (operation) => new Set(arrayMap(operation.lines, ({itemId}) => itemId)),
  );
  assert.equal(
    arraySome([...itemSets[0]], (itemId) => itemSets[1].has(itemId)),
    false,
  );
  assert.equal(
    first.identity.expected.districtNextOrderId,
    EXPECTED_DISTRICT_NEXT_ORDER_ID,
  );
  assert.deepEqual(first.identity.expected.orderIds, [1, 2]);
  assert.deepEqual(first.identity.expected.newOrderIds, [1, 2]);
  assert.deepEqual(first.identity.expected.orderLineCountByOrderId, {
    1: EXPECTED_LINE_COUNT,
    2: EXPECTED_LINE_COUNT,
  });
  assert.equal(
    first.identity.expected.stockRows.length,
    EXPECTED_STOCK_ROWS_COUNT,
  );
}

function assertClaimSurface() {
  const required = new Set(OLTP_SCENARIO_A_REQUIRED_SYSTEM_PROOF_IDS);
  assert.ok(OLTP_SCENARIO_A_NEW_ORDER_CONTENTION_PROOF_IDS.length > 0);
  assert.equal(
    arrayEvery(
      OLTP_SCENARIO_A_NEW_ORDER_CONTENTION_PROOF_IDS,
      (id) => required.has(id),
    ),
    true,
  );
  assert.equal(
    arrayIncludes(
      OLTP_SCENARIO_A_NEW_ORDER_CONTENTION_PROOF_IDS,
      PROOF_ID_DURABLE,
    ),
    false,
  );
  assert.equal(
    arrayIncludes(
      OLTP_SCENARIO_A_NEW_ORDER_CONTENTION_PROOF_IDS,
      PROOF_ID_CONFLICT,
    ),
    false,
  );
  assert.equal(
    arrayIncludes(
      OLTP_SCENARIO_A_NEW_ORDER_CONTENTION_PROOF_IDS,
      PROOF_ID_FAILURE_ATOMICITY,
    ),
    false,
  );
}

function assertPassingOracle() {
  const result = evaluateScenarioANewOrderContentionObservation(passingObservation());
  assert.equal(result.passed, true);
  assert.deepEqual(result.failures, []);
  assert.deepEqual(
    result.proofIds,
    OLTP_SCENARIO_A_NEW_ORDER_CONTENTION_PROOF_IDS,
  );
}

function assertFailuresAreSpecificAndClaimNothing() {
  const cases = [
    ['logicalCommitted', 1, 'logical_committed_count'],
    ['districtNextOrderId', 2, 'district_next_order_id'],
    ['orderIds', [1, 3], 'order_ids'],
    ['newOrderIds', [1], 'new_order_ids'],
    ['orderLineCountByOrderId', {1: 5, 2: 4}, 'order_line_counts'],
  ];
  for (const [field, value, failure] of cases) {
    const observation = passingObservation();
    observation[field] = value;
    const result = evaluateScenarioANewOrderContentionObservation(observation);
    assert.equal(result.passed, false);
    assert.equal(arrayIncludes(result.failures, failure), true);
    assert.deepEqual(result.proofIds, []);
  }

  const stockObservation = passingObservation();
  stockObservation.stockRows[0] = {
    ...stockObservation.stockRows[0],
    orderCount: 2,
  };
  const stockResult = evaluateScenarioANewOrderContentionObservation(stockObservation);
  assert.equal(stockResult.passed, false);
  assert.equal(arrayIncludes(stockResult.failures, FAILURE_STOCK_EFFECTS), true);
  assert.deepEqual(stockResult.proofIds, []);
}

function assertMalformedObservationsFailClosed() {
  assert.throws(
    () => evaluateScenarioANewOrderContentionObservation({}),
    /logicalCommitted must be an integer/u,
  );
  const observation = passingObservation();
  observation.stockRows = INVALID_STOCK_ROWS;
  assert.throws(
    () => evaluateScenarioANewOrderContentionObservation(observation),
    /stockRows must be an array/u,
  );
}

function main() {
  assertDefinition();
  assertClaimSurface();
  assertPassingOracle();
  assertFailuresAreSpecificAndClaimNothing();
  assertMalformedObservationsFailClosed();
  process.stdout.write(PASS_LINE);
}

try {
  main();
} catch (error) {
  process.stderr.write(`${error.stack || error.message || error}\n`);
  process.exitCode = 1;
}

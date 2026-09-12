import {createHash} from 'node:crypto';

import {
  buildOltpBaselineDataset,
  hashOltpBaselineDataset,
} from './oltp-baseline-dataset.js';
import {OLTP_OPERATION_KIND} from './oltp-baseline-workload.js';
import {
  OLTP_SCENARIO_A_REQUIRED_SYSTEM_PROOF_IDS,
} from './oltp-scenario-a-semantic-gate.js';

const ZERO = 0;
const ONE = 1;
const CASE_ID = 'scenario-a-new-order-district-contention-v1';
const WORKLOAD = Object.freeze({
  seed: 20260912,
  workers: 2,
  warmupOperationsPerWorker: 0,
  measurementOperationsPerWorker: 1,
  warehouseCount: 1,
  districtsPerWarehouse: 1,
  customersPerDistrict: 2,
  itemCount: 20,
});

function freezeRecord(value) {
  if (!value || typeof value !== 'object' || Object.isFrozen(value)) return value;
  for (const child of Object.values(value)) freezeRecord(child);
  return Object.freeze(value);
}

function line(itemId, quantity) {
  return Object.freeze({
    itemId,
    quantity,
    supplyWarehouseId: ONE,
  });
}

const OPERATIONS = freezeRecord([
  {
    kind: OLTP_OPERATION_KIND.NEW_ORDER,
    phase: 'semantic-proof',
    workerId: 1,
    sequence: 1,
    warehouseId: 1,
    districtId: 1,
    customerId: 1,
    lines: [
      line(1, 1),
      line(2, 2),
      line(3, 3),
      line(4, 4),
      line(5, 5),
    ],
  },
  {
    kind: OLTP_OPERATION_KIND.NEW_ORDER,
    phase: 'semantic-proof',
    workerId: 2,
    sequence: 1,
    warehouseId: 1,
    districtId: 1,
    customerId: 2,
    lines: [
      line(6, 2),
      line(7, 3),
      line(8, 4),
      line(9, 5),
      line(10, 6),
    ],
  },
]);

const CLAIMED_PROOF_IDS = freezeRecord([
  'isolation:successfulEffectsExactlyOnce',
  'isolation:lostSuccessfulWriteForbidden',
  'forbidden:lost_successful_write',
  'forbidden:duplicate_success_effect',
  'transaction:new_order:district_next_order_id_advances_once',
  'transaction:new_order:one_order_row_created_for_allocated_order_id',
  'transaction:new_order:one_new_order_row_created_for_allocated_order_id',
  'transaction:new_order:one_order_line_created_per_input_line',
  'transaction:new_order:stock_effects_applied_once_per_input_line',
].sort());

function nextStockQuantity(currentQuantity, orderedQuantity) {
  return currentQuantity >= orderedQuantity + 10 ?
    currentQuantity - orderedQuantity :
    currentQuantity + 91 - orderedQuantity;
}

function expectedStockRows(dataset) {
  const byItem = new Map(dataset.stock.map((row) => [row.itemId, row]));
  return OPERATIONS.flatMap((operation) => operation.lines.map((value) => {
    const initial = byItem.get(value.itemId);
    return Object.freeze({
      warehouseId: ONE,
      itemId: value.itemId,
      quantity: nextStockQuantity(initial.quantity, value.quantity),
      ytdQuantity: value.quantity,
      orderCount: ONE,
      remoteCount: ZERO,
    });
  })).sort((left, right) => left.itemId - right.itemId);
}

function buildScenarioANewOrderContentionCase() {
  const dataset = buildOltpBaselineDataset(WORKLOAD);
  const expectedOrderIds = Object.freeze([1, 2]);
  const expected = freezeRecord({
    logicalRequestCount: 2,
    initialDistrictNextOrderId: 1,
    districtNextOrderId: 3,
    orderIds: expectedOrderIds,
    newOrderIds: expectedOrderIds,
    orderLineCountByOrderId: {
      1: OPERATIONS[0].lines.length,
      2: OPERATIONS[1].lines.length,
    },
    stockRows: expectedStockRows(dataset),
  });
  const identity = freezeRecord({
    caseId: CASE_ID,
    datasetSha256: hashOltpBaselineDataset(dataset),
    workload: WORKLOAD,
    operations: OPERATIONS,
    claimedProofIds: CLAIMED_PROOF_IDS,
    expected,
  });
  return freezeRecord({
    identity,
    caseSha256: createHash('sha256')
      .update(JSON.stringify(identity))
      .digest('hex'),
  });
}

function normalizeInteger(value, label) {
  const number = Number(value);
  if (!Number.isInteger(number)) throw new Error(`${label} must be an integer`);
  return number;
}

function normalizeIntegerArray(values, label) {
  if (!Array.isArray(values)) throw new Error(`${label} must be an array`);
  return values.map((value) => normalizeInteger(value, label)).sort((a, b) => a - b);
}

function normalizeStockRows(values) {
  if (!Array.isArray(values)) throw new Error('observation stockRows must be an array');
  return values.map((row) => ({
    warehouseId: normalizeInteger(row?.warehouseId, 'stock warehouseId'),
    itemId: normalizeInteger(row?.itemId, 'stock itemId'),
    quantity: normalizeInteger(row?.quantity, 'stock quantity'),
    ytdQuantity: normalizeInteger(row?.ytdQuantity, 'stock ytdQuantity'),
    orderCount: normalizeInteger(row?.orderCount, 'stock orderCount'),
    remoteCount: normalizeInteger(row?.remoteCount, 'stock remoteCount'),
  })).sort((left, right) => left.itemId - right.itemId);
}

function evaluateScenarioANewOrderContentionObservation(observation = {}) {
  const definition = buildScenarioANewOrderContentionCase();
  const expected = definition.identity.expected;
  const actual = {
    logicalCommitted: normalizeInteger(
      observation.logicalCommitted,
      'observation logicalCommitted',
    ),
    districtNextOrderId: normalizeInteger(
      observation.districtNextOrderId,
      'observation districtNextOrderId',
    ),
    orderIds: normalizeIntegerArray(observation.orderIds, 'observation orderIds'),
    newOrderIds: normalizeIntegerArray(
      observation.newOrderIds,
      'observation newOrderIds',
    ),
    orderLineCountByOrderId: Object.fromEntries(
      Object.entries(observation.orderLineCountByOrderId || {})
        .map(([orderId, count]) => [
          String(normalizeInteger(orderId, 'order-line orderId')),
          normalizeInteger(count, 'order-line count'),
        ])
        .sort(([left], [right]) => Number(left) - Number(right)),
    ),
    stockRows: normalizeStockRows(observation.stockRows),
  };
  const failures = [];
  if (actual.logicalCommitted !== expected.logicalRequestCount) {
    failures.push('logical_committed_count');
  }
  if (actual.districtNextOrderId !== expected.districtNextOrderId) {
    failures.push('district_next_order_id');
  }
  if (JSON.stringify(actual.orderIds) !== JSON.stringify(expected.orderIds)) {
    failures.push('order_ids');
  }
  if (JSON.stringify(actual.newOrderIds) !== JSON.stringify(expected.newOrderIds)) {
    failures.push('new_order_ids');
  }
  if (JSON.stringify(actual.orderLineCountByOrderId) !==
      JSON.stringify(expected.orderLineCountByOrderId)) {
    failures.push('order_line_counts');
  }
  if (JSON.stringify(actual.stockRows) !== JSON.stringify(expected.stockRows)) {
    failures.push('stock_effects');
  }
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
      throw new Error(`contention case claims unknown semantic proof ${proofId}`);
    }
  }
}

assertClaimedProofIdsAreCanonical();

export {
  CLAIMED_PROOF_IDS as OLTP_SCENARIO_A_NEW_ORDER_CONTENTION_PROOF_IDS,
  OPERATIONS as OLTP_SCENARIO_A_NEW_ORDER_CONTENTION_OPERATIONS,
  WORKLOAD as OLTP_SCENARIO_A_NEW_ORDER_CONTENTION_WORKLOAD,
  buildScenarioANewOrderContentionCase,
  evaluateScenarioANewOrderContentionObservation,
};

import {createHash} from 'node:crypto';

import {
  buildOltpBaselineDataset,
  hashOltpBaselineDataset,
} from './oltp-baseline-dataset.js';
import {
  OLTP_OPERATION_KIND,
  buildOltpBaselinePlan,
} from './oltp-baseline-workload.js';
import {
  OLTP_SCENARIO_A_REQUIRED_SYSTEM_PROOF_IDS,
} from './oltp-scenario-a-semantic-gate.js';

const ZERO = 0;
const ONE = 1;
const SETUP_LINE_COUNT = 5;
const SETUP_QUANTITY = 10;
const STOCK_ROLLOVER_MARGIN = 10;
const STOCK_ROLLOVER_INCREMENT = 91;
const CASE_ID = 'scenario-a-stock-level-v1';
const SHA256_PATTERN = /^[0-9a-f]{64}$/u;
const WORKLOAD = Object.freeze({
  seed: 20260912,
  workers: 1,
  warmupOperationsPerWorker: 0,
  measurementOperationsPerWorker: 100,
  warehouseCount: 1,
  districtsPerWarehouse: 2,
  customersPerDistrict: 8,
  itemCount: 100,
});

function freezeRecord(value) {
  if (!value || typeof value !== 'object' || Object.isFrozen(value)) return value;
  for (const child of Object.values(value)) freezeRecord(child);
  return Object.freeze(value);
}

const CLAIMED_PROOF_IDS = freezeRecord([
  'transaction:stock_level:database_state_is_unchanged',
  'transaction:stock_level:reported_low_stock_count_uses_canonical_recent_order_window',
].sort());

function requireRow(rows, predicate, label) {
  const matches = rows.filter(predicate);
  if (matches.length !== ONE) {
    throw new Error(`Scenario A stock-level expected one ${label} row`);
  }
  return matches[ZERO];
}

function nextStockQuantity(currentQuantity, requestedQuantity) {
  if (currentQuantity >= requestedQuantity + STOCK_ROLLOVER_MARGIN) {
    return currentQuantity - requestedQuantity;
  }
  return currentQuantity + STOCK_ROLLOVER_INCREMENT - requestedQuantity;
}

function buildSetupOperation(dataset, operation) {
  const candidates = dataset.stock.filter((row) => {
    if (row.warehouseId !== operation.warehouseId) return false;
    const nextQuantity = nextStockQuantity(row.quantity, SETUP_QUANTITY);
    return row.quantity >= SETUP_QUANTITY + STOCK_ROLLOVER_MARGIN &&
      nextQuantity < operation.threshold;
  });
  if (candidates.length < SETUP_LINE_COUNT) {
    throw new Error(
      'Scenario A stock-level setup requires five deterministic low-stock candidates',
    );
  }
  return freezeRecord({
    kind: OLTP_OPERATION_KIND.NEW_ORDER,
    phase: 'setup',
    workerId: operation.workerId,
    sequence: ONE,
    warehouseId: operation.warehouseId,
    districtId: operation.districtId,
    customerId: ONE,
    lines: candidates.slice(ZERO, SETUP_LINE_COUNT).map((row) => ({
      itemId: row.itemId,
      quantity: SETUP_QUANTITY,
      supplyWarehouseId: operation.warehouseId,
    })),
  });
}

function buildScenarioAStockLevelCase() {
  const dataset = buildOltpBaselineDataset(WORKLOAD);
  const plan = buildOltpBaselinePlan(WORKLOAD);
  const operation = plan.workers[ZERO].measurement.find(
    ({kind}) => kind === OLTP_OPERATION_KIND.STOCK_LEVEL,
  );
  if (!operation) throw new Error('Scenario A stock-level case has no operation');

  const district = requireRow(
    dataset.districts,
    (row) => row.warehouseId === operation.warehouseId &&
      row.districtId === operation.districtId,
    'district',
  );
  const setupOperation = buildSetupOperation(dataset, operation);
  const expected = freezeRecord({
    setupOrderId: district.nextOrderId,
    lowStock: setupOperation.lines.length,
  });
  const identity = freezeRecord({
    caseId: CASE_ID,
    datasetSha256: hashOltpBaselineDataset(dataset),
    workload: WORKLOAD,
    setupOperation,
    operation,
    expected,
    claimedProofIds: CLAIMED_PROOF_IDS,
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

function normalizeSha256(value, label) {
  const digest = String(value || '').trim().toLowerCase();
  if (!SHA256_PATTERN.test(digest)) {
    throw new Error(`${label} must be a SHA-256 digest`);
  }
  return digest;
}

function evaluateScenarioAStockLevelObservation(observation = {}) {
  const definition = buildScenarioAStockLevelCase();
  const expected = definition.identity.expected;
  const actual = freezeRecord({
    lowStock: normalizeInteger(observation.lowStock, 'stock-level lowStock'),
    stateBeforeSha256: normalizeSha256(
      observation.stateBeforeSha256,
      'stock-level stateBeforeSha256',
    ),
    stateAfterSha256: normalizeSha256(
      observation.stateAfterSha256,
      'stock-level stateAfterSha256',
    ),
  });
  const failures = [];
  if (actual.lowStock !== expected.lowStock) failures.push('low_stock_count');
  if (actual.stateBeforeSha256 !== actual.stateAfterSha256) {
    failures.push('database_state');
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
      throw new Error(`stock-level case claims unknown semantic proof ${proofId}`);
    }
  }
}

assertClaimedProofIdsAreCanonical();

export {
  CLAIMED_PROOF_IDS as OLTP_SCENARIO_A_STOCK_LEVEL_PROOF_IDS,
  WORKLOAD as OLTP_SCENARIO_A_STOCK_LEVEL_WORKLOAD,
  buildScenarioAStockLevelCase,
  evaluateScenarioAStockLevelObservation,
  nextStockQuantity as projectScenarioAStockQuantity,
};

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
const CASE_ID = 'scenario-a-order-status-v1';
const SHA256_PATTERN = /^[0-9a-f]{64}$/u;
const WORKLOAD = Object.freeze({
  seed: 20260912,
  workers: 1,
  warmupOperationsPerWorker: 0,
  measurementOperationsPerWorker: 100,
  warehouseCount: 1,
  districtsPerWarehouse: 2,
  customersPerDistrict: 8,
  itemCount: 15,
});

function freezeRecord(value) {
  if (!value || typeof value !== 'object' || Object.isFrozen(value)) return value;
  for (const child of Object.values(value)) freezeRecord(child);
  return Object.freeze(value);
}

const CLAIMED_PROOF_IDS = freezeRecord([
  'forbidden:read_only_transaction_mutation',
  'transaction:order_status:database_state_is_unchanged',
  'transaction:order_status:latest_customer_order_is_returned_when_present',
].sort());

function requireRow(rows, predicate, label) {
  const matches = rows.filter(predicate);
  if (matches.length !== ONE) {
    throw new Error(`Scenario A order-status expected one ${label} row`);
  }
  return matches[ZERO];
}

function buildSetupOperation(operation) {
  const lines = Array.from({length: SETUP_LINE_COUNT}, (_unused, index) => ({
    itemId: index + ONE,
    quantity: index + ONE,
    supplyWarehouseId: operation.warehouseId,
  }));
  return freezeRecord({
    kind: OLTP_OPERATION_KIND.NEW_ORDER,
    phase: 'setup',
    workerId: operation.workerId,
    sequence: ONE,
    warehouseId: operation.warehouseId,
    districtId: operation.districtId,
    customerId: operation.customerId,
    lines,
  });
}

function buildScenarioAOrderStatusCase() {
  const dataset = buildOltpBaselineDataset(WORKLOAD);
  const plan = buildOltpBaselinePlan(WORKLOAD);
  const operation = plan.workers[ZERO].measurement.find(
    ({kind}) => kind === OLTP_OPERATION_KIND.ORDER_STATUS,
  );
  if (!operation) throw new Error('Scenario A order-status case has no operation');

  const district = requireRow(
    dataset.districts,
    (row) => row.warehouseId === operation.warehouseId &&
      row.districtId === operation.districtId,
    'district',
  );
  const setupOperation = buildSetupOperation(operation);
  const expected = freezeRecord({
    orderId: district.nextOrderId,
    lineCount: setupOperation.lines.length,
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

function evaluateScenarioAOrderStatusObservation(observation = {}) {
  const definition = buildScenarioAOrderStatusCase();
  const expected = definition.identity.expected;
  const actual = freezeRecord({
    orderId: normalizeInteger(observation.orderId, 'order-status orderId'),
    lineCount: normalizeInteger(observation.lineCount, 'order-status lineCount'),
    stateBeforeSha256: normalizeSha256(
      observation.stateBeforeSha256,
      'order-status stateBeforeSha256',
    ),
    stateAfterSha256: normalizeSha256(
      observation.stateAfterSha256,
      'order-status stateAfterSha256',
    ),
  });
  const failures = [];
  if (actual.orderId !== expected.orderId) failures.push('latest_order');
  if (actual.lineCount !== expected.lineCount) failures.push('line_count');
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
      throw new Error(`order-status case claims unknown semantic proof ${proofId}`);
    }
  }
}

assertClaimedProofIdsAreCanonical();

export {
  CLAIMED_PROOF_IDS as OLTP_SCENARIO_A_ORDER_STATUS_PROOF_IDS,
  WORKLOAD as OLTP_SCENARIO_A_ORDER_STATUS_WORKLOAD,
  buildScenarioAOrderStatusCase,
  evaluateScenarioAOrderStatusObservation,
};

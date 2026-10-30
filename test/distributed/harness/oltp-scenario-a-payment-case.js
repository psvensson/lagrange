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
const CASE_ID = 'scenario-a-payment-v1';
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
  'transaction:payment:warehouse_ytd_increases_by_payment_amount',
  'transaction:payment:district_ytd_increases_by_payment_amount',
  'transaction:payment:customer_balance_decreases_by_payment_amount',
  'transaction:payment:customer_payment_counters_advance_once',
  'transaction:payment:one_history_row_created_for_logical_payment',
].sort());

function requireRow(rows, predicate, label) {
  const matches = rows.filter(predicate);
  if (matches.length !== ONE) {
    throw new Error(`Scenario A payment case expected one ${label} row`);
  }
  return matches[ZERO];
}

function buildScenarioAPaymentCase() {
  const dataset = buildOltpBaselineDataset(WORKLOAD);
  const plan = buildOltpBaselinePlan(WORKLOAD);
  const operation = plan.workers[ZERO].measurement.find(
    ({kind}) => kind === OLTP_OPERATION_KIND.PAYMENT,
  );
  if (!operation) throw new Error('Scenario A payment case has no payment operation');

  const warehouse = requireRow(
    dataset.warehouses,
    ({id}) => id === operation.warehouseId,
    'warehouse',
  );
  const district = requireRow(
    dataset.districts,
    (row) => row.warehouseId === operation.warehouseId &&
      row.districtId === operation.districtId,
    'district',
  );
  const customer = requireRow(
    dataset.customers,
    (row) => row.warehouseId === operation.customerWarehouseId &&
      row.districtId === operation.customerDistrictId &&
      row.customerId === operation.customerId,
    'customer',
  );
  const expected = freezeRecord({
    paidCents: operation.amountCents,
    warehouseYtdCents: warehouse.ytdCents + operation.amountCents,
    districtYtdCents: district.ytdCents + operation.amountCents,
    customerBalanceCents: customer.balanceCents - operation.amountCents,
    customerYtdPaymentCents:
      customer.ytdPaymentCents + operation.amountCents,
    customerPaymentCount: customer.paymentCount + ONE,
    historyCount: ONE,
    historyAmountCents: operation.amountCents,
  });
  const identity = freezeRecord({
    caseId: CASE_ID,
    datasetSha256: hashOltpBaselineDataset(dataset),
    workload: WORKLOAD,
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

function evaluateScenarioAPaymentObservation(observation = {}) {
  const definition = buildScenarioAPaymentCase();
  const expected = definition.identity.expected;
  const actual = freezeRecord({
    paidCents: normalizeInteger(observation.paidCents, 'payment paidCents'),
    warehouseYtdCents: normalizeInteger(
      observation.warehouseYtdCents,
      'payment warehouseYtdCents',
    ),
    districtYtdCents: normalizeInteger(
      observation.districtYtdCents,
      'payment districtYtdCents',
    ),
    customerBalanceCents: normalizeInteger(
      observation.customerBalanceCents,
      'payment customerBalanceCents',
    ),
    customerYtdPaymentCents: normalizeInteger(
      observation.customerYtdPaymentCents,
      'payment customerYtdPaymentCents',
    ),
    customerPaymentCount: normalizeInteger(
      observation.customerPaymentCount,
      'payment customerPaymentCount',
    ),
    historyCount: normalizeInteger(
      observation.historyCount,
      'payment historyCount',
    ),
    historyAmountCents: normalizeInteger(
      observation.historyAmountCents,
      'payment historyAmountCents',
    ),
  });
  const failures = [];
  if (actual.paidCents !== expected.paidCents) failures.push('result_amount');
  if (actual.warehouseYtdCents !== expected.warehouseYtdCents) {
    failures.push('warehouse_ytd');
  }
  if (actual.districtYtdCents !== expected.districtYtdCents) {
    failures.push('district_ytd');
  }
  if (actual.customerBalanceCents !== expected.customerBalanceCents) {
    failures.push('customer_balance');
  }
  if (actual.customerYtdPaymentCents !== expected.customerYtdPaymentCents ||
      actual.customerPaymentCount !== expected.customerPaymentCount) {
    failures.push('customer_payment_counters');
  }
  if (actual.historyCount !== expected.historyCount ||
      actual.historyAmountCents !== expected.historyAmountCents) {
    failures.push('history_row');
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
      throw new Error(`payment case claims unknown semantic proof ${proofId}`);
    }
  }
}

assertClaimedProofIdsAreCanonical();

export {
  CLAIMED_PROOF_IDS as OLTP_SCENARIO_A_PAYMENT_PROOF_IDS,
  WORKLOAD as OLTP_SCENARIO_A_PAYMENT_WORKLOAD,
  buildScenarioAPaymentCase,
  evaluateScenarioAPaymentObservation,
};

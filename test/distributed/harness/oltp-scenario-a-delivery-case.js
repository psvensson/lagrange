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
const CASE_ID = 'scenario-a-delivery-v1';
const WORKLOAD = Object.freeze({
  seed: 20260912,
  workers: 1,
  warmupOperationsPerWorker: 0,
  measurementOperationsPerWorker: 100,
  warehouseCount: 1,
  districtsPerWarehouse: 2,
  customersPerDistrict: 4,
  itemCount: 20,
});

function freezeRecord(value) {
  if (!value || typeof value !== 'object' || Object.isFrozen(value)) return value;
  for (const child of Object.values(value)) freezeRecord(child);
  return Object.freeze(value);
}

const CLAIMED_PROOF_IDS = freezeRecord([
  'transaction:delivery:selected_new_order_is_removed_once_per_serviced_district',
  'transaction:delivery:selected_order_carrier_is_set_once',
  'transaction:delivery:selected_order_lines_are_marked_delivered',
  'transaction:delivery:customer_balance_increases_by_selected_line_total',
  'transaction:delivery:customer_delivery_count_advances_once_per_delivered_order',
].sort());

function requireRow(rows, predicate, label) {
  const matches = rows.filter(predicate);
  if (matches.length !== ONE) {
    throw new Error(`Scenario A delivery expected one ${label} row`);
  }
  return matches[ZERO];
}

function setupLines(districtId) {
  const firstItemId = (districtId - ONE) * SETUP_LINE_COUNT + ONE;
  return Array.from({length: SETUP_LINE_COUNT}, (_unused, index) => ({
    itemId: firstItemId + index,
    quantity: districtId,
    supplyWarehouseId: ONE,
  }));
}

function buildSetupOperations(operation) {
  return freezeRecord(Array.from(
    {length: WORKLOAD.districtsPerWarehouse},
    (_unused, index) => {
      const districtId = index + ONE;
      return {
        kind: OLTP_OPERATION_KIND.NEW_ORDER,
        phase: 'setup',
        workerId: operation.workerId,
        sequence: districtId,
        warehouseId: operation.warehouseId,
        districtId,
        customerId: districtId,
        lines: setupLines(districtId),
      };
    },
  ));
}

function buildExpectedDistrict(dataset, setupOperation, carrierId) {
  const district = requireRow(
    dataset.districts,
    (row) => row.warehouseId === setupOperation.warehouseId &&
      row.districtId === setupOperation.districtId,
    `district ${setupOperation.districtId}`,
  );
  const customer = requireRow(
    dataset.customers,
    (row) => row.warehouseId === setupOperation.warehouseId &&
      row.districtId === setupOperation.districtId &&
      row.customerId === setupOperation.customerId,
    `customer ${setupOperation.districtId}`,
  );
  const lineTotalCents = setupOperation.lines.reduce((sum, line) => {
    const item = requireRow(
      dataset.items,
      (row) => row.itemId === line.itemId,
      `item ${line.itemId}`,
    );
    return sum + item.priceCents * line.quantity;
  }, ZERO);
  return freezeRecord({
    districtId: setupOperation.districtId,
    orderId: district.nextOrderId,
    customerId: setupOperation.customerId,
    carrierId,
    lineCount: setupOperation.lines.length,
    lineTotalCents,
    customerBalanceCents: customer.balanceCents + lineTotalCents,
    customerDeliveryCount: customer.deliveryCount + ONE,
  });
}

function buildScenarioADeliveryCase() {
  const dataset = buildOltpBaselineDataset(WORKLOAD);
  const plan = buildOltpBaselinePlan(WORKLOAD);
  const operation = plan.workers[ZERO].measurement.find(
    ({kind}) => kind === OLTP_OPERATION_KIND.DELIVERY,
  );
  if (!operation) throw new Error('Scenario A delivery case has no operation');
  const setupOperations = buildSetupOperations(operation);
  const expected = freezeRecord({
    deliveredOrders: setupOperations.length,
    districts: setupOperations.map((setupOperation) =>
      buildExpectedDistrict(dataset, setupOperation, operation.carrierId)),
  });
  const identity = freezeRecord({
    caseId: CASE_ID,
    datasetSha256: hashOltpBaselineDataset(dataset),
    workload: WORKLOAD,
    setupOperations,
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

function normalizeDistrict(value = {}, index) {
  const label = `delivery district ${index + ONE}`;
  return freezeRecord({
    districtId: normalizeInteger(value.districtId, `${label} districtId`),
    orderId: normalizeInteger(value.orderId, `${label} orderId`),
    customerId: normalizeInteger(value.customerId, `${label} customerId`),
    newOrderCount: normalizeInteger(value.newOrderCount, `${label} newOrderCount`),
    carrierId: normalizeInteger(value.carrierId, `${label} carrierId`),
    deliveredLineCount: normalizeInteger(
      value.deliveredLineCount,
      `${label} deliveredLineCount`,
    ),
    lineCount: normalizeInteger(value.lineCount, `${label} lineCount`),
    lineTotalCents: normalizeInteger(value.lineTotalCents, `${label} lineTotalCents`),
    customerBalanceCents: normalizeInteger(
      value.customerBalanceCents,
      `${label} customerBalanceCents`,
    ),
    customerDeliveryCount: normalizeInteger(
      value.customerDeliveryCount,
      `${label} customerDeliveryCount`,
    ),
  });
}

function evaluateScenarioADeliveryObservation(observation = {}) {
  const definition = buildScenarioADeliveryCase();
  const expected = definition.identity.expected;
  if (!Array.isArray(observation.districts)) {
    throw new Error('delivery districts must be an array');
  }
  const actual = freezeRecord({
    deliveredOrders: normalizeInteger(
      observation.deliveredOrders,
      'delivery deliveredOrders',
    ),
    districts: observation.districts.map(normalizeDistrict),
  });
  const failures = [];
  if (actual.deliveredOrders !== expected.deliveredOrders ||
      actual.districts.length !== expected.districts.length) {
    failures.push('delivered_order_count');
  }
  for (const expectedDistrict of expected.districts) {
    const actualDistrict = actual.districts.find(
      ({districtId}) => districtId === expectedDistrict.districtId,
    );
    if (!actualDistrict) {
      failures.push(`district_${expectedDistrict.districtId}_missing`);
      continue;
    }
    if (actualDistrict.orderId !== expectedDistrict.orderId ||
        actualDistrict.newOrderCount !== ZERO) {
      failures.push(`district_${expectedDistrict.districtId}_new_order`);
    }
    if (actualDistrict.carrierId !== expectedDistrict.carrierId) {
      failures.push(`district_${expectedDistrict.districtId}_carrier`);
    }
    if (actualDistrict.lineCount !== expectedDistrict.lineCount ||
        actualDistrict.deliveredLineCount !== expectedDistrict.lineCount) {
      failures.push(`district_${expectedDistrict.districtId}_lines`);
    }
    if (actualDistrict.customerId !== expectedDistrict.customerId ||
        actualDistrict.lineTotalCents !== expectedDistrict.lineTotalCents ||
        actualDistrict.customerBalanceCents !==
          expectedDistrict.customerBalanceCents) {
      failures.push(`district_${expectedDistrict.districtId}_balance`);
    }
    if (actualDistrict.customerDeliveryCount !==
        expectedDistrict.customerDeliveryCount) {
      failures.push(`district_${expectedDistrict.districtId}_delivery_count`);
    }
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
      throw new Error(`delivery case claims unknown semantic proof ${proofId}`);
    }
  }
}

assertClaimedProofIdsAreCanonical();

export {
  CLAIMED_PROOF_IDS as OLTP_SCENARIO_A_DELIVERY_PROOF_IDS,
  WORKLOAD as OLTP_SCENARIO_A_DELIVERY_WORKLOAD,
  buildScenarioADeliveryCase,
  evaluateScenarioADeliveryObservation,
};

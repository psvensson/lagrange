import assert from 'node:assert/strict';

import {
  OLTP_SCENARIO_A_DELIVERY_PROOF_IDS,
  buildScenarioADeliveryCase,
  evaluateScenarioADeliveryObservation,
} from '../../test/distributed/harness/oltp-scenario-a-delivery-case.js';

const definition = buildScenarioADeliveryCase();
const repeated = buildScenarioADeliveryCase();
const expected = definition.identity.expected;
const passingObservation = {
  deliveredOrders: expected.deliveredOrders,
  districts: expected.districts.map((district) => ({
    ...district,
    newOrderCount: 0,
    deliveredLineCount: district.lineCount,
  })),
};

assert.equal(definition.identity.caseId, 'scenario-a-delivery-v1');
assert.equal(definition.identity.operation.kind, 'delivery');
assert.equal(definition.identity.setupOperations.length, 2);
assert.deepEqual(
  definition.identity.setupOperations.map(({districtId}) => districtId),
  [1, 2],
);
assert.deepEqual(
  definition.identity.setupOperations.map(({customerId}) => customerId),
  [1, 2],
);
assert.equal(
  definition.identity.setupOperations.every(({lines}) => lines.length === 5),
  true,
);
assert.equal(definition.caseSha256, repeated.caseSha256);
assert.match(definition.caseSha256, /^[0-9a-f]{64}$/u);
assert.match(definition.identity.datasetSha256, /^[0-9a-f]{64}$/u);
assert.equal(OLTP_SCENARIO_A_DELIVERY_PROOF_IDS.length, 5);
assert.equal(
  OLTP_SCENARIO_A_DELIVERY_PROOF_IDS.every(
    (proofId) => proofId.startsWith('transaction:delivery:'),
  ),
  true,
);

const passing = evaluateScenarioADeliveryObservation(passingObservation);
assert.equal(passing.passed, true);
assert.deepEqual(passing.failures, []);
assert.deepEqual(passing.proofIds, OLTP_SCENARIO_A_DELIVERY_PROOF_IDS);

const retainedNewOrder = structuredClone(passingObservation);
retainedNewOrder.districts[0].newOrderCount = 1;
const retained = evaluateScenarioADeliveryObservation(retainedNewOrder);
assert.equal(retained.passed, false);
assert.deepEqual(retained.failures, ['district_1_new_order']);
assert.deepEqual(retained.proofIds, []);

const wrongCarrier = structuredClone(passingObservation);
wrongCarrier.districts[1].carrierId += 1;
const carrier = evaluateScenarioADeliveryObservation(wrongCarrier);
assert.equal(carrier.passed, false);
assert.deepEqual(carrier.failures, ['district_2_carrier']);
assert.deepEqual(carrier.proofIds, []);

const undeliveredLine = structuredClone(passingObservation);
undeliveredLine.districts[0].deliveredLineCount -= 1;
const lines = evaluateScenarioADeliveryObservation(undeliveredLine);
assert.equal(lines.passed, false);
assert.deepEqual(lines.failures, ['district_1_lines']);
assert.deepEqual(lines.proofIds, []);

const wrongBalance = structuredClone(passingObservation);
wrongBalance.districts[0].customerBalanceCents += 1;
const balance = evaluateScenarioADeliveryObservation(wrongBalance);
assert.equal(balance.passed, false);
assert.deepEqual(balance.failures, ['district_1_balance']);
assert.deepEqual(balance.proofIds, []);

const wrongDeliveryCount = structuredClone(passingObservation);
wrongDeliveryCount.districts[1].customerDeliveryCount += 1;
const count = evaluateScenarioADeliveryObservation(wrongDeliveryCount);
assert.equal(count.passed, false);
assert.deepEqual(count.failures, ['district_2_delivery_count']);
assert.deepEqual(count.proofIds, []);

assert.throws(
  () => evaluateScenarioADeliveryObservation({}),
  /delivery districts must be an array/u,
);

console.log('oltp-scenario-a-delivery-case-guard: PASS');

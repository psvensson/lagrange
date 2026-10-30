import assert from 'node:assert/strict';

import {
  OLTP_SCENARIO_A_DELIVERY_PROOF_IDS,
  buildScenarioADeliveryCase,
  evaluateScenarioADeliveryObservation,
} from '../../test/distributed/harness/oltp-scenario-a-delivery-case.js';

const arrayEvery = Function.call.bind(Array.prototype.every);
const arrayMap = Function.call.bind(Array.prototype.map);
const stringStartsWith = Function.call.bind(String.prototype.startsWith);

const EXPECTED_CASE_ID = 'scenario-a-delivery-v1';
const EXPECTED_OPERATION_KIND = 'delivery';
const EXPECTED_LINES_PER_OP = 5;
const EXPECTED_PROOF_IDS_COUNT = 5;
const PROOF_ID_PREFIX = 'transaction:delivery:';
const FAILURE_DISTRICT_1_NEW_ORDER = 'district_1_new_order';
const FAILURE_DISTRICT_2_CARRIER = 'district_2_carrier';
const FAILURE_DISTRICT_1_LINES = 'district_1_lines';
const FAILURE_DISTRICT_1_BALANCE = 'district_1_balance';
const FAILURE_DISTRICT_2_DELIVERY_COUNT = 'district_2_delivery_count';
const PASS_MESSAGE = 'oltp-scenario-a-delivery-case-guard: PASS';

const definition = buildScenarioADeliveryCase();
const repeated = buildScenarioADeliveryCase();
const expected = definition.identity.expected;
const passingObservation = {
  deliveredOrders: expected.deliveredOrders,
  districts: arrayMap(expected.districts, (district) => ({
    ...district,
    newOrderCount: 0,
    deliveredLineCount: district.lineCount,
  })),
};

assert.equal(definition.identity.caseId, EXPECTED_CASE_ID);
assert.equal(definition.identity.operation.kind, EXPECTED_OPERATION_KIND);
assert.equal(definition.identity.setupOperations.length, 2);
assert.deepEqual(
  arrayMap(definition.identity.setupOperations, ({districtId}) => districtId),
  [1, 2],
);
assert.deepEqual(
  arrayMap(definition.identity.setupOperations, ({customerId}) => customerId),
  [1, 2],
);
assert.equal(
  arrayEvery(
    definition.identity.setupOperations,
    ({lines}) => lines.length === EXPECTED_LINES_PER_OP,
  ),
  true,
);
assert.equal(definition.caseSha256, repeated.caseSha256);
assert.match(definition.caseSha256, /^[0-9a-f]{64}$/u);
assert.match(definition.identity.datasetSha256, /^[0-9a-f]{64}$/u);
assert.equal(OLTP_SCENARIO_A_DELIVERY_PROOF_IDS.length, EXPECTED_PROOF_IDS_COUNT);
assert.equal(
  arrayEvery(
    OLTP_SCENARIO_A_DELIVERY_PROOF_IDS,
    (proofId) => stringStartsWith(proofId, PROOF_ID_PREFIX),
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
assert.deepEqual(retained.failures, [FAILURE_DISTRICT_1_NEW_ORDER]);
assert.deepEqual(retained.proofIds, []);

const wrongCarrier = structuredClone(passingObservation);
wrongCarrier.districts[1].carrierId += 1;
const carrier = evaluateScenarioADeliveryObservation(wrongCarrier);
assert.equal(carrier.passed, false);
assert.deepEqual(carrier.failures, [FAILURE_DISTRICT_2_CARRIER]);
assert.deepEqual(carrier.proofIds, []);

const undeliveredLine = structuredClone(passingObservation);
undeliveredLine.districts[0].deliveredLineCount -= 1;
const lines = evaluateScenarioADeliveryObservation(undeliveredLine);
assert.equal(lines.passed, false);
assert.deepEqual(lines.failures, [FAILURE_DISTRICT_1_LINES]);
assert.deepEqual(lines.proofIds, []);

const wrongBalance = structuredClone(passingObservation);
wrongBalance.districts[0].customerBalanceCents += 1;
const balance = evaluateScenarioADeliveryObservation(wrongBalance);
assert.equal(balance.passed, false);
assert.deepEqual(balance.failures, [FAILURE_DISTRICT_1_BALANCE]);
assert.deepEqual(balance.proofIds, []);

const wrongDeliveryCount = structuredClone(passingObservation);
wrongDeliveryCount.districts[1].customerDeliveryCount += 1;
const count = evaluateScenarioADeliveryObservation(wrongDeliveryCount);
assert.equal(count.passed, false);
assert.deepEqual(count.failures, [FAILURE_DISTRICT_2_DELIVERY_COUNT]);
assert.deepEqual(count.proofIds, []);

assert.throws(
  () => evaluateScenarioADeliveryObservation({}),
  /delivery districts must be an array/u,
);

console.log(PASS_MESSAGE);

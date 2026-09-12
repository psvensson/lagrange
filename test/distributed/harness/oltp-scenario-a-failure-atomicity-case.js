import {createHash} from 'node:crypto';

import {
  buildOltpBaselineDataset,
  hashOltpBaselineDataset,
} from './oltp-baseline-dataset.js';
import {
  OLTP_OPERATION_KIND,
} from './oltp-baseline-workload.js';
import {
  OLTP_SCENARIO_A_REQUIRED_SYSTEM_PROOF_IDS,
} from './oltp-scenario-a-semantic-gate.js';

const ZERO = 0;
const ONE = 1;
const CASE_ID = 'scenario-a-failure-atomicity-v1';
const TERMINAL_ERROR_SUBSTRING = 'OLTP transaction expected one item row';
const SHA256_PATTERN = /^[0-9a-f]{64}$/u;
const WORKLOAD = Object.freeze({
  seed: 20260912,
  workers: 1,
  warmupOperationsPerWorker: 0,
  measurementOperationsPerWorker: 1,
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
  'failureAtomicity:terminal_logical_request_must_not_leave_partial_transaction_effects',
  'forbidden:partial_commit',
].sort());

function buildFailureOperation() {
  return freezeRecord({
    kind: OLTP_OPERATION_KIND.NEW_ORDER,
    phase: 'failure',
    workerId: ONE,
    sequence: ONE,
    warehouseId: ONE,
    districtId: ONE,
    customerId: ONE,
    lines: [
      {
        itemId: ONE,
        quantity: 3,
        supplyWarehouseId: ONE,
      },
      {
        itemId: WORKLOAD.itemCount + ONE,
        quantity: 4,
        supplyWarehouseId: ONE,
      },
    ],
  });
}

function buildScenarioAFailureAtomicityCase() {
  const dataset = buildOltpBaselineDataset(WORKLOAD);
  const operation = buildFailureOperation();
  const identity = freezeRecord({
    caseId: CASE_ID,
    datasetSha256: hashOltpBaselineDataset(dataset),
    workload: WORKLOAD,
    operation,
    expected: {
      terminalErrorSubstring: TERMINAL_ERROR_SUBSTRING,
      stateUnchanged: true,
    },
    claimedProofIds: CLAIMED_PROOF_IDS,
  });
  return freezeRecord({
    identity,
    caseSha256: createHash('sha256')
      .update(JSON.stringify(identity))
      .digest('hex'),
  });
}

function normalizeSha256(value, label) {
  const digest = String(value || '').trim().toLowerCase();
  if (!SHA256_PATTERN.test(digest)) {
    throw new Error(`${label} must be a SHA-256 digest`);
  }
  return digest;
}

function evaluateScenarioAFailureAtomicityObservation(observation = {}) {
  const definition = buildScenarioAFailureAtomicityCase();
  const expected = definition.identity.expected;
  const actual = freezeRecord({
    terminalFailureObserved: observation.terminalFailureObserved === true,
    errorMessage: String(observation.errorMessage || ''),
    stateBeforeSha256: normalizeSha256(
      observation.stateBeforeSha256,
      'failure-atomicity stateBeforeSha256',
    ),
    stateAfterSha256: normalizeSha256(
      observation.stateAfterSha256,
      'failure-atomicity stateAfterSha256',
    ),
  });
  const failures = [];
  if (!actual.terminalFailureObserved) failures.push('terminal_failure_missing');
  if (!actual.errorMessage.includes(expected.terminalErrorSubstring)) {
    failures.push('unexpected_error');
  }
  if (actual.stateBeforeSha256 !== actual.stateAfterSha256) {
    failures.push('partial_commit');
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
      throw new Error(`failure-atomicity case claims unknown semantic proof ${proofId}`);
    }
  }
}

assertClaimedProofIdsAreCanonical();

export {
  CLAIMED_PROOF_IDS as OLTP_SCENARIO_A_FAILURE_ATOMICITY_PROOF_IDS,
  WORKLOAD as OLTP_SCENARIO_A_FAILURE_ATOMICITY_WORKLOAD,
  buildScenarioAFailureAtomicityCase,
  evaluateScenarioAFailureAtomicityObservation,
};

import {createHash} from 'node:crypto';

import {
  buildOltpBaselineDataset,
  hashOltpBaselineDataset,
} from './oltp-baseline-dataset.js';
import {
  OLTP_SCENARIO_A_REQUIRED_SYSTEM_PROOF_IDS,
} from './oltp-scenario-a-semantic-gate.js';

const ZERO = 0;
const CASE_ID = 'scenario-a-visibility-v1';
const TARGET_WAREHOUSE_ID = 1;
const WRITE_DELTA_CENTS = 137;
const WORKLOAD = Object.freeze({
  seed: 20260912,
  workers: 2,
  warmupOperationsPerWorker: 0,
  measurementOperationsPerWorker: 1,
  warehouseCount: 1,
  districtsPerWarehouse: 1,
  customersPerDistrict: 2,
  itemCount: 15,
});

function freezeRecord(value) {
  if (!value || typeof value !== 'object' || Object.isFrozen(value)) return value;
  for (const child of Object.values(value)) freezeRecord(child);
  return Object.freeze(value);
}

const CLAIMED_PROOF_IDS = freezeRecord([
  'isolation:dirtyReadsForbidden',
  'isolation:readYourOwnWritesRequired',
  'forbidden:dirty_read',
].sort());

const STEPS = freezeRecord([
  'writer_begin',
  'writer_read_initial',
  'observer_read_initial',
  'writer_update_uncommitted',
  'writer_read_own_write',
  'observer_read_while_writer_uncommitted',
  'writer_rollback',
  'writer_read_after_rollback',
  'observer_read_after_rollback',
]);

function buildScenarioAVisibilityCase() {
  const dataset = buildOltpBaselineDataset(WORKLOAD);
  const warehouse = dataset.warehouses.find(
    ({id}) => id === TARGET_WAREHOUSE_ID,
  );
  if (!warehouse) throw new Error('visibility case target warehouse is missing');
  const expected = freezeRecord({
    initialValue: warehouse.ytdCents,
    writerOwnWriteValue: warehouse.ytdCents + WRITE_DELTA_CENTS,
    observerUncommittedValue: warehouse.ytdCents,
    writerAfterRollbackValue: warehouse.ytdCents,
    observerAfterRollbackValue: warehouse.ytdCents,
  });
  const identity = freezeRecord({
    caseId: CASE_ID,
    datasetSha256: hashOltpBaselineDataset(dataset),
    workload: WORKLOAD,
    target: {
      table: 'warehouse',
      key: {id: TARGET_WAREHOUSE_ID},
      field: 'ytd_cents',
    },
    writeDeltaCents: WRITE_DELTA_CENTS,
    steps: STEPS,
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

function evaluateScenarioAVisibilityObservation(observation = {}) {
  const definition = buildScenarioAVisibilityCase();
  const expected = definition.identity.expected;
  const actual = freezeRecord({
    initialWriterValue: normalizeInteger(
      observation.initialWriterValue,
      'visibility initialWriterValue',
    ),
    initialObserverValue: normalizeInteger(
      observation.initialObserverValue,
      'visibility initialObserverValue',
    ),
    writerOwnWriteValue: normalizeInteger(
      observation.writerOwnWriteValue,
      'visibility writerOwnWriteValue',
    ),
    observerUncommittedValue: normalizeInteger(
      observation.observerUncommittedValue,
      'visibility observerUncommittedValue',
    ),
    writerAfterRollbackValue: normalizeInteger(
      observation.writerAfterRollbackValue,
      'visibility writerAfterRollbackValue',
    ),
    observerAfterRollbackValue: normalizeInteger(
      observation.observerAfterRollbackValue,
      'visibility observerAfterRollbackValue',
    ),
  });
  const failures = [];
  if (actual.initialWriterValue !== expected.initialValue ||
      actual.initialObserverValue !== expected.initialValue) {
    failures.push('initial_value');
  }
  if (actual.writerOwnWriteValue !== expected.writerOwnWriteValue) {
    failures.push('read_your_own_write');
  }
  if (actual.observerUncommittedValue !== expected.observerUncommittedValue) {
    failures.push('dirty_read');
  }
  if (actual.writerAfterRollbackValue !== expected.writerAfterRollbackValue ||
      actual.observerAfterRollbackValue !== expected.observerAfterRollbackValue) {
    failures.push('rollback_state');
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
      throw new Error(`visibility case claims unknown semantic proof ${proofId}`);
    }
  }
}

assertClaimedProofIdsAreCanonical();

export {
  CLAIMED_PROOF_IDS as OLTP_SCENARIO_A_VISIBILITY_PROOF_IDS,
  WORKLOAD as OLTP_SCENARIO_A_VISIBILITY_WORKLOAD,
  buildScenarioAVisibilityCase,
  evaluateScenarioAVisibilityObservation,
};

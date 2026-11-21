/**
 * Reservation reconcile must not conclude an operation is ABSENT (and release
 * its active reservation) on a transient lagging local read. A silent-absent
 * preferred read must be disproven or confirmed by an owner-RPC-required
 * authority read before RELEASE_ACTIVE fires.
 *
 * Quest: formation-reservation-reconcile-premature-orphan-release
 * ROOT: solve/changes/formation-ledger-self-move-blocks-cluster-ops/
 *   design-cdc-nontermination-fix.md gap (iv), live run
 *   run-legA-1-2026-07-07T06-34-29Z.
 */

import assert from 'node:assert/strict';
import {test} from '../../src/test-helpers/tap.js';
import {ConfigurationManager} from '../../src/config/configuration-manager.js';
import {NUM, TABLES, WORKFLOW_STEP} from '../../src/constants/index.js';
import {
  CONTROL_PLANE_AUTHORITATIVE_READ_MODE, CONTROL_PLANE_READ_LEADER_MODE,
} from '../../src/control-plane/control-plane-system-table-gateway-constants.js';
import {normalizeRebalancerEntityIdentity} from
  '../../src/rebalancer/rebalancer-entity-identity.js';
import {createOperation, OperationType, WORKFLOW_STEP_TO_STATUS} from
  '../../src/rebalancer/replica-status.js';
import {SQL} from '../../src/rebalancer/replica-operation-repository.js';
import {REPLICA_OPERATION_UPDATE_DISPOSITION} from
  '../../src/rebalancer/replica-operation-update-disposition.js';
import {
  RESERVATION_STATUS, STORAGE_CAPACITY_DEFAULT,
} from '../../src/rebalancer/storage-capacity-constants.js';
import {installCommittedOperationMutationFixture} from './operation-outcome-fixture.js';
import {
  createCoordinatorSqlStore, createMockControlPlaneSystemTableGateway, createTestCoordinator,
} from './test-helpers.js';

const TEST_NODE_ID = 'reconcile-node-1';
const TEST_OPERATION_ID = 'op-inflight-add';
const TEST_RESERVATION_ID = `res-${TEST_OPERATION_ID}`;
const TEST_PARTITION_ID = 'p-reconcile-1';
const TEST_TARGET_NODE_ID = 'node-target-1';

function initializeConfig() {
  ConfigurationManager.resetInstance();
  ConfigurationManager.getInstance().initialize({
    rebalancer: {
      minimumReplicaBytes: NUM.TEN,
      partitionReplicaOverheadBytes: NUM.FIVE,
      storageReservationTtlMs: STORAGE_CAPACITY_DEFAULT.RESERVATION_TTL_MS,
    },
  });
}

async function seedLiveAdd(coordinator) {
  const input = {
    operationId: TEST_OPERATION_ID, type: OperationType.ADD, partitionId: TEST_PARTITION_ID,
    replicaId: `${TEST_PARTITION_ID}-r2`, sourceNodeId: TEST_NODE_ID, targetNodeId: TEST_TARGET_NODE_ID,
  };
  const operation = {...createOperation(input), ...normalizeRebalancerEntityIdentity(input)};
  assert.equal(await coordinator.repository.persistNewOperation(operation), true);
  const stepsHistory = [...operation.stepsHistory];
  for (const step of [WORKFLOW_STEP.SENDING, WORKFLOW_STEP.CREATING, WORKFLOW_STEP.SYNCING]) {
    const prior = stepsHistory.at(-1);
    stepsHistory.push({step, previousStep: prior.step, timestamp: prior.timestamp + 1});
  }
  const syncing = {
    ...operation, workflowStep: WORKFLOW_STEP.SYNCING,
    status: WORKFLOW_STEP_TO_STATUS[WORKFLOW_STEP.SYNCING],
    updatedAt: stepsHistory.at(-1).timestamp, stepsHistory,
  };
  const outcome = await coordinator.repository.persistOperationUpdate(syncing, {
    expectedWorkflowStep: operation.workflowStep,
  });
  assert.equal(outcome.disposition, REPLICA_OPERATION_UPDATE_DISPOSITION.UPDATED);
  await coordinator.createReservationForOperation(syncing, {resolvedEntitySizeBytes: NUM.HUNDRED});
  return syncing;
}

async function withReservationLedger(measure) {
  initializeConfig();
  const store = createCoordinatorSqlStore({});
  const sqlQueryEngine = {executeQuery: async (sql, params) => store.execute(sql, params)};
  const gateway = createMockControlPlaneSystemTableGateway(sqlQueryEngine);
  gateway.submitMutation = (mutation) => store.submitMutation(mutation);
  installCommittedOperationMutationFixture(gateway);
  const read = gateway.readAuthoritativeRows.bind(gateway);
  const reads = [];
  let exerciseReconcile = false;
  let unavailable = false;
  gateway.readAuthoritativeRows = async (table, sql, params, options) => {
    if (!exerciseReconcile || table !== TABLES.REPLICA_OPERATIONS ||
        sql !== SQL.SELECT_OPERATION_BY_ID || params[0] !== TEST_OPERATION_ID) {
      return read(table, sql, params, options);
    }
    const strict = options.authoritativeReadMode ===
      CONTROL_PLANE_AUTHORITATIVE_READ_MODE.OWNER_RPC_REQUIRED;
    let result;
    if (!strict) result = {success: true, rows: [], rowSetComplete: true};
    else if (unavailable) result = {success: false, error: 'owner read unavailable'};
    else result = await read(table, sql, params, options);
    reads.push({strict, params, leaderMode: options.leaderMode, result});
    return result;
  };
  const coordinator = createTestCoordinator({
    nodeId: TEST_NODE_ID, sqlQueryEngine, controlPlaneSystemTableGateway: gateway,
    cdcIntegrationService: gateway.cdcIntegrationService,
  });
  const readReservation = () => store.execute(
    'SELECT * FROM storage_reservations WHERE reservation_id = ?', [TEST_RESERVATION_ID],
  ).rows[0];
  try {
    const operation = await seedLiveAdd(coordinator);
    const original = readReservation();
    assert.equal(original.status, RESERVATION_STATUS.ACTIVE);
    assert.equal(original.operation_id, operation.operationId);
    assert.equal(original.entity_id, operation.entityId);
    exerciseReconcile = true;
    const visibility = coordinator.getReservationOperationVisibilityObservation.bind(coordinator);
    const decisions = [];
    coordinator.getReservationOperationVisibilityObservation = async (operationId) => {
      const observation = await visibility(operationId);
      decisions.push(observation);
      return observation;
    };
    await measure({
      coordinator, operation, original, readReservation, reads, decisions,
      failOwnerRead() {
        unavailable = true;
      },
      removeOperation() {
        const result = store.submitMutation({
          operation: 'delete', tableName: TABLES.REPLICA_OPERATIONS,
          whereClause: {operation_id: TEST_OPERATION_ID},
        });
        assert.equal(result.partitionResult.affectedRows, 1);
      },
    });
  } finally {
    try {
      await coordinator.shutdown();
    } finally {
      store.suspend();
      ConfigurationManager.resetInstance();
    }
  }
}

function assertStrictOwnerRead(t, reads) {
  const strict = reads.find((read) => read.strict);
  t.same(strict?.params, [TEST_OPERATION_ID], 'reconciliation queries the reserved operation key');
  t.equal(strict?.leaderMode, CONTROL_PLANE_READ_LEADER_MODE.REQUIRED,
    'the reservation decision requires leader authority');
  return strict?.result;
}

test('reconcileReservations retains the live ADD after an optional local miss', async (t) => {
  await withReservationLedger(async (f) => {
    t.equal(await f.coordinator.queryOperationById(TEST_OPERATION_ID), null,
      'the ordinary lookup first sees the lagging empty view');
    t.equal(f.reads[0]?.strict, false);

    const result = await f.coordinator.reconcileReservations();

    t.same(result, {expired: 0, orphansReleased: 0});
    const ownerRead = assertStrictOwnerRead(t, f.reads);
    t.equal(ownerRead?.rowSetComplete, true);
    t.same(ownerRead?.rows.map((row) => row.operation_id), [f.operation.operationId]);
    t.equal(f.decisions.at(-1)?.operation?.workflowStep, WORKFLOW_STEP.SYNCING,
      'the exact owner reads the canonical committed operation history');
    t.same(f.readReservation(), f.original, 'the held reservation is unchanged');
  });
});

test('reconcileReservations retains its reservation debt when the owner read defers', async (t) => {
  await withReservationLedger(async (f) => {
    f.failOwnerRead();
    const result = await f.coordinator.reconcileReservations();

    t.same(result, {expired: 0, orphansReleased: 0});
    t.equal(assertStrictOwnerRead(t, f.reads)?.success, false);
    t.ok(f.decisions.at(-1)?.deferredOutcome, 'the owner describes unconfirmed absence');
    t.same(f.readReservation(), f.original, 'unavailable authority preserves the reservation debt');
  });
});

test('reconcileReservations releases only after complete exact owner absence', async (t) => {
  await withReservationLedger(async (f) => {
    f.removeOperation();
    const result = await f.coordinator.reconcileReservations();

    t.same(result, {expired: 0, orphansReleased: 1});
    const ownerRead = assertStrictOwnerRead(t, f.reads);
    t.equal(ownerRead?.rowSetComplete, true);
    t.same(ownerRead?.rows, []);
    t.equal(f.decisions.at(-1)?.deferredOutcome, null);
    t.equal(f.readReservation().status, RESERVATION_STATUS.RELEASED);
    t.ok(Number.isFinite(f.readReservation().released_at), 'SQLite records the release');
  });
});

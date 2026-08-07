/**
 * Reservation expiry must be operation-aware (audit finding 4). Nothing ever
 * renews expires_at after insert, so:
 *
 *  1. The TTL-expiry sweep must consult operation state the way the
 *     orphan-release arm already does — KEEP_ACTIVE for a non-terminal
 *     operation, EXPIRED only once the operation is visible-and-terminal (or
 *     confirmed absent). A live operation must never lose its admission
 *     witness mid-flight.
 *  2. Capacity accounting must stop treating expires_at <= now as
 *     already-released before the sweep has actually reclaimed it — a
 *     reservation backing a live (non-terminal) operation keeps its admitted
 *     capacity counted even past expiry; only an expired reservation with a
 *     terminal or absent operation is excluded.
 *
 * Red-on-revert: each test fails if the operation-state consult is reverted
 * in either the TTL sweep or capacity accounting while the rest remains.
 *
 * Quest: reservation-expiry-operation-aware
 * Epic: solve/epics/rebalancer-operation-safety-audit-remediation.md
 */

import {test} from '../../src/test-helpers/tap.js';
import {ConfigurationManager} from '../../src/config/configuration-manager.js';
import {SystemTableCache} from '../../src/cache/system-table-cache.js';
import {CDC_OPERATION} from '../../src/constants/cdc.js';
import {COLUMN, NUM, TABLES, WORKFLOW_STEP} from
  '../../src/constants/index.js';
import {SERVICE_TYPE} from '../../src/constants/service.js';
import {
  RESERVATION_REASON,
  RESERVATION_STATUS,
  STORAGE_CAPACITY_DEFAULT,
} from '../../src/rebalancer/storage-capacity-constants.js';
import {OperationType, ReplicaStatus} from
  '../../src/rebalancer/replica-status.js';
import {
  StorageCapacityAccountingService,
} from '../../src/rebalancer/storage-capacity-accounting-service.js';
import {RebalanceCoordinator} from
  '../../src/rebalancer/rebalance-coordinator.js';
import {
  createMockCache,
  createMockCdcService,
  createMockPolicyService,
  createMockMessageRouter,
  createMockControlPlaneReadinessService,
  createMockTransactionCoordinator,
} from './test-helpers.js';

const TEST_NODE_ID = 'expiry-node-1';
const TEST_TARGET_NODE_ID = 'node-target-1';
const TEST_PARTITION_ID = 'p-expiry-1';

const LIVE_OPERATION_ID = 'op-live-add';
const LIVE_RESERVATION_ID = `res-${LIVE_OPERATION_ID}`;
const TERMINAL_OPERATION_ID = 'op-terminal-add';
const TERMINAL_RESERVATION_ID = `res-${TERMINAL_OPERATION_ID}`;

function initializeConfig() {
  ConfigurationManager.resetInstance();
  const config = ConfigurationManager.getInstance();
  config.initialize({
    rebalancer: {
      minimumReplicaBytes: NUM.TEN,
      partitionReplicaOverheadBytes: NUM.FIVE,
      storageReservationTtlMs: STORAGE_CAPACITY_DEFAULT.RESERVATION_TTL_MS,
    },
  });
}

function insertRow(cache, tableName, row) {
  cache.applySystemTableChange(tableName, CDC_OPERATION.INSERT, row);
}

/**
 * Minimal store answering the reconcile SELECT/UPDATE shapes plus the
 * replica_operations by-id reads the operation-state consult issues.
 */
function createExpiryStore() {
  const reservations = new Map();
  const operations = new Map();

  const executeQuery = async (sql, params = []) => {
    if (sql.includes('UPDATE storage_reservations')) {
      const [newStatus, updated, released, reservationId, activeStatus] =
        params;
      let changes = 0;
      for (const [key, row] of reservations) {
        if (row.reservation_id === reservationId &&
            row.status === activeStatus) {
          reservations.set(key, {
            ...row,
            status: newStatus,
            updated_at: updated,
            released_at: released,
          });
          changes++;
        }
      }
      return {success: true, changes};
    }
    if (sql.includes('FROM storage_reservations') &&
        sql.includes('expires_at <= ?')) {
      const [status, expiryThreshold] = params;
      const rows = Array.from(reservations.values()).filter((row) =>
        row.status === status && row.expires_at <= expiryThreshold);
      return {success: true, rows};
    }
    if (sql.includes('FROM storage_reservations')) {
      const [status] = params;
      const rows = Array.from(reservations.values())
        .filter((row) => row.status === status);
      return {success: true, rows};
    }
    if (sql.includes('FROM replica_operations') &&
        sql.includes('operation_id = ?')) {
      const [operationId] = params;
      const row = operations.get(operationId);
      return {success: true, rows: row ? [row] : []};
    }
    return {success: true, rows: []};
  };

  return {reservations, operations, executeQuery};
}

function createCoordinatorWithStore(store) {
  const cache = createMockCache();
  const accounting = new StorageCapacityAccountingService({
    systemTableCache: cache,
  });
  accounting.initialize({systemTableCache: cache});

  const coordinator = new RebalanceCoordinator({
    nodeId: TEST_NODE_ID,
    systemTableCache: cache,
    cdcIntegrationService: createMockCdcService(),
    controlPlaneSystemTableGateway: {
      readAuthoritativeRows: (tableName, sql, params) =>
        store.executeQuery(sql, params),
      readRows: (tableName, sql, params) => store.executeQuery(sql, params),
      executeQuery: (sql, params) => store.executeQuery(sql, params),
    },
    tablePolicyService: createMockPolicyService(),
    messageRouter: createMockMessageRouter(),
    sqlQueryEngine: {executeQuery: store.executeQuery},
    transactionCoordinator: createMockTransactionCoordinator(),
    controlPlaneReadinessService: createMockControlPlaneReadinessService({
      systemTableCache: cache,
    }),
    enableTimeouts: false,
    storageAccountingService: accounting,
  });
  coordinator.initialize();
  return coordinator;
}

function seedExpiredReservation(store, reservationId, operationId) {
  const now = Date.now();
  store.reservations.set(reservationId, {
    reservation_id: reservationId,
    operation_id: operationId,
    entity_type: SERVICE_TYPE.PARTITION,
    entity_id: TEST_PARTITION_ID,
    partition_id: TEST_PARTITION_ID,
    target_node_id: TEST_TARGET_NODE_ID,
    estimated_bytes: NUM.HUNDRED,
    amplification_factor: 1,
    status: RESERVATION_STATUS.ACTIVE,
    reason_code: RESERVATION_REASON.ADD_REPLICA,
    created_at: now - NUM.THIRTY_THOUSAND,
    updated_at: now - NUM.THIRTY_THOUSAND,
    // Already past TTL — the sweep's expiry arm selects this row.
    expires_at: now - NUM.THOUSAND,
    released_at: null,
  });
}

function seedOperation(store, operationId, status, workflowStep) {
  store.operations.set(operationId, {
    operation_id: operationId,
    type: OperationType.ADD,
    partition_id: TEST_PARTITION_ID,
    target_node_id: TEST_TARGET_NODE_ID,
    status,
    workflow_step: workflowStep,
    completed_at: null,
  });
}

// --- TTL sweep is operation-aware ---

test('reconcileReservations - a TTL-expired reservation for a LIVE ' +
  '(non-terminal) operation is kept ACTIVE, not expired', async (t) => {
  initializeConfig();
  const store = createExpiryStore();
  const coordinator = createCoordinatorWithStore(store);
  seedExpiredReservation(store, LIVE_RESERVATION_ID, LIVE_OPERATION_ID);
  // In-flight ADD: syncing is non-terminal for ADD (terminal = active/failed).
  seedOperation(store, LIVE_OPERATION_ID, 'syncing', WORKFLOW_STEP.SYNCING);

  const result = await coordinator.reconcileReservations();

  t.equal(result.expired, 0,
    'no expiry while the backing operation is still live');
  t.equal(
    store.reservations.get(LIVE_RESERVATION_ID).status,
    RESERVATION_STATUS.ACTIVE,
    'live operation keeps its reservation active past expires_at',
  );
  t.end();
});

test('reconcileReservations - a TTL-expired reservation for a TERMINAL ' +
  'operation is expired', async (t) => {
  initializeConfig();
  const store = createExpiryStore();
  const coordinator = createCoordinatorWithStore(store);
  seedExpiredReservation(store, TERMINAL_RESERVATION_ID, TERMINAL_OPERATION_ID);
  // active is the terminal success status for ADD.
  seedOperation(
    store,
    TERMINAL_OPERATION_ID,
    ReplicaStatus.ACTIVE,
    WORKFLOW_STEP.ACTIVE,
  );

  const result = await coordinator.reconcileReservations();

  t.equal(result.expired, 1,
    'terminal operation lets its expired reservation expire');
  t.equal(
    store.reservations.get(TERMINAL_RESERVATION_ID).status,
    RESERVATION_STATUS.EXPIRED,
    'reservation transitions to EXPIRED once the operation is terminal',
  );
  t.end();
});

// --- Capacity accounting respects a live operation ---

test('getCapacitySnapshots - an expired reservation for a LIVE operation ' +
  'keeps its reserved bytes counted', async (t) => {
  initializeConfig();
  const cache = new SystemTableCache();
  const service = new StorageCapacityAccountingService({
    systemTableCache: cache,
  });
  service.initialize({systemTableCache: cache});

  insertRow(cache, TABLES.NODES, {
    [COLUMN.NODE_ID]: TEST_TARGET_NODE_ID,
    [COLUMN.STORAGE_BUDGET_BYTES]: NUM.THOUSAND,
  });
  insertRow(cache, TABLES.STORAGE_RESERVATIONS, {
    [COLUMN.RESERVATION_ID]: LIVE_RESERVATION_ID,
    [COLUMN.OPERATION_ID]: LIVE_OPERATION_ID,
    [COLUMN.TARGET_NODE_ID]: TEST_TARGET_NODE_ID,
    [COLUMN.ESTIMATED_BYTES]: NUM.HUNDRED,
    [COLUMN.AMPLIFICATION_FACTOR]: 1,
    [COLUMN.STATUS]: RESERVATION_STATUS.ACTIVE,
    // Past expiry, but the backing operation is still live.
    [COLUMN.EXPIRES_AT]: Date.now() - NUM.THOUSAND,
  });
  insertRow(cache, TABLES.REPLICA_OPERATIONS, {
    [COLUMN.OPERATION_ID]: LIVE_OPERATION_ID,
    operation_type: OperationType.ADD,
    [COLUMN.STATUS]: 'syncing',
    workflow_step: WORKFLOW_STEP.SYNCING,
  });

  const snapshots = await service.getCapacitySnapshots();
  t.equal(snapshots[0].reservedBytes, NUM.HUNDRED,
    'live operation keeps its expired reservation counted');
  t.end();
});

test('getCapacitySnapshots - an expired reservation for a TERMINAL ' +
  'operation is excluded from reserved bytes', async (t) => {
  initializeConfig();
  const cache = new SystemTableCache();
  const service = new StorageCapacityAccountingService({
    systemTableCache: cache,
  });
  service.initialize({systemTableCache: cache});

  insertRow(cache, TABLES.NODES, {
    [COLUMN.NODE_ID]: TEST_TARGET_NODE_ID,
    [COLUMN.STORAGE_BUDGET_BYTES]: NUM.THOUSAND,
  });
  insertRow(cache, TABLES.STORAGE_RESERVATIONS, {
    [COLUMN.RESERVATION_ID]: TERMINAL_RESERVATION_ID,
    [COLUMN.OPERATION_ID]: TERMINAL_OPERATION_ID,
    [COLUMN.TARGET_NODE_ID]: TEST_TARGET_NODE_ID,
    [COLUMN.ESTIMATED_BYTES]: NUM.HUNDRED,
    [COLUMN.AMPLIFICATION_FACTOR]: 1,
    [COLUMN.STATUS]: RESERVATION_STATUS.ACTIVE,
    [COLUMN.EXPIRES_AT]: Date.now() - NUM.THOUSAND,
  });
  insertRow(cache, TABLES.REPLICA_OPERATIONS, {
    [COLUMN.OPERATION_ID]: TERMINAL_OPERATION_ID,
    operation_type: OperationType.ADD,
    [COLUMN.STATUS]: ReplicaStatus.ACTIVE,
    workflow_step: WORKFLOW_STEP.ACTIVE,
  });

  const snapshots = await service.getCapacitySnapshots();
  t.equal(snapshots[0].reservedBytes, 0,
    'terminal operation lets its expired reservation stop counting');
  t.end();
});

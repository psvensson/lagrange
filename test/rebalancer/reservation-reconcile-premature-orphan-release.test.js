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

import {test} from '../../src/test-helpers/tap.js';
import {ConfigurationManager} from '../../src/config/configuration-manager.js';
import {NUM, WORKFLOW_STEP} from '../../src/constants/index.js';
import {SERVICE_TYPE} from '../../src/constants/service.js';
import {
  RESERVATION_REASON,
  RESERVATION_STATUS,
  STORAGE_CAPACITY_DEFAULT,
} from '../../src/rebalancer/storage-capacity-constants.js';
import {OperationType} from '../../src/rebalancer/replica-status.js';
import {
  CONTROL_PLANE_AUTHORITATIVE_READ_MODE,
} from '../../src/control-plane/control-plane-system-table-gateway-constants.js';
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

const TEST_NODE_ID = 'reconcile-node-1';
const TEST_OPERATION_ID = 'op-inflight-add';
const TEST_RESERVATION_ID = `res-${TEST_OPERATION_ID}`;
const TEST_PARTITION_ID = 'p-reconcile-1';
const TEST_TARGET_NODE_ID = 'node-target-1';
const TEST_AUTHORITY_UNREACHABLE_ERROR =
  'authority read path unavailable for test';
const REPLICA_OPERATIONS_TABLE_FRAGMENT = 'FROM replica_operations';
const OPERATION_BY_ID_PREDICATE_FRAGMENT = 'operation_id = ?';

const AUTHORITY_READ_BEHAVIOR = Object.freeze({
  SERVE_AUTHORITY_ROWS: 'serve_authority_rows',
  FAIL_UNREACHABLE: 'fail_unreachable',
});

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

/**
 * Minimal reservation/operation store: reservations answer the reconcile
 * SELECT/UPDATE shapes; replica_operations by-id reads are answered from an
 * "authority" view that the lag-aware gateway decides whether to serve.
 */
function createReconcileStore() {
  const reservations = new Map();
  const authorityOperations = new Map();

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
    if (sql.includes(REPLICA_OPERATIONS_TABLE_FRAGMENT) &&
        sql.includes(OPERATION_BY_ID_PREDICATE_FRAGMENT)) {
      const [operationId] = params;
      const row = authorityOperations.get(operationId);
      return {success: true, rows: row ? [row] : []};
    }
    return {success: true, rows: []};
  };

  return {reservations, authorityOperations, executeQuery};
}

/**
 * Gateway that simulates a lagging non-owner read path: every
 * replica_operations by-id read that is NOT owner-RPC-required is served
 * from an empty (lagging) view; owner-RPC-required reads either serve the
 * authority view or fail as unreachable, per scenario.
 */
function createLagAwareGateway(store, options = {}) {
  const authorityReadBehavior = options.authorityReadBehavior ||
    AUTHORITY_READ_BEHAVIOR.SERVE_AUTHORITY_ROWS;
  const readLog = {strictReads: 0, laggedReads: 0};

  const readRows = async (_tableName, sql, params = [], queryOptions = {}) => {
    const isOperationByIdRead =
      sql.includes(REPLICA_OPERATIONS_TABLE_FRAGMENT) &&
      sql.includes(OPERATION_BY_ID_PREDICATE_FRAGMENT);
    if (!isOperationByIdRead) {
      return store.executeQuery(sql, params);
    }
    const isOwnerRpcRequiredRead =
      queryOptions?.authoritativeReadMode ===
        CONTROL_PLANE_AUTHORITATIVE_READ_MODE.OWNER_RPC_REQUIRED;
    if (!isOwnerRpcRequiredRead) {
      readLog.laggedReads++;
      return {success: true, rows: []};
    }
    readLog.strictReads++;
    if (authorityReadBehavior === AUTHORITY_READ_BEHAVIOR.FAIL_UNREACHABLE) {
      return {
        success: false,
        error: TEST_AUTHORITY_UNREACHABLE_ERROR,
        rows: [],
      };
    }
    return store.executeQuery(sql, params);
  };

  return {
    readLog,
    gateway: {
      readAuthoritativeRows: readRows,
      readRows,
      executeQuery: async (sql, params = [], _queryOptions = {}) =>
        store.executeQuery(sql, params),
    },
  };
}

function createCoordinatorWithLaggingReads(options = {}) {
  const store = createReconcileStore();
  const {gateway, readLog} = createLagAwareGateway(store, options);
  const cache = createMockCache();
  const accounting = new StorageCapacityAccountingService({
    systemTableCache: cache,
  });
  accounting.initialize({systemTableCache: cache});

  const coordinator = new RebalanceCoordinator({
    nodeId: TEST_NODE_ID,
    systemTableCache: cache,
    cdcIntegrationService: createMockCdcService(),
    controlPlaneSystemTableGateway: gateway,
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
  return {coordinator, store, readLog};
}

function seedActiveReservation(store) {
  const now = Date.now();
  store.reservations.set(TEST_RESERVATION_ID, {
    reservation_id: TEST_RESERVATION_ID,
    operation_id: TEST_OPERATION_ID,
    entity_type: SERVICE_TYPE.PARTITION,
    entity_id: TEST_PARTITION_ID,
    partition_id: TEST_PARTITION_ID,
    target_node_id: TEST_TARGET_NODE_ID,
    estimated_bytes: NUM.HUNDRED,
    amplification_factor: 1,
    status: RESERVATION_STATUS.ACTIVE,
    reason_code: RESERVATION_REASON.ADD_REPLICA,
    created_at: now,
    updated_at: now,
    expires_at: now + NUM.THIRTY_THOUSAND,
    released_at: null,
  });
}

function seedInFlightAddOperation(store) {
  store.authorityOperations.set(TEST_OPERATION_ID, {
    operation_id: TEST_OPERATION_ID,
    type: OperationType.ADD,
    partition_id: TEST_PARTITION_ID,
    entity_type: SERVICE_TYPE.PARTITION,
    entity_id: TEST_PARTITION_ID,
    target_node_id: TEST_TARGET_NODE_ID,
    status: 'syncing',
    workflow_step: WORKFLOW_STEP.SYNCING,
    completed_at: null,
  });
}

test('reconcileReservations - a lagging local miss is disproven by the ' +
  'owner-RPC authority read and the reservation stays active', async (t) => {
  initializeConfig();
  const {coordinator, store, readLog} = createCoordinatorWithLaggingReads();
  seedActiveReservation(store);
  seedInFlightAddOperation(store);

  const result = await coordinator.reconcileReservations();

  t.equal(result.orphansReleased, 0,
    'no orphan release on a lagging local miss with a live authority row');
  const reservation = store.reservations.get(TEST_RESERVATION_ID);
  t.equal(reservation.status, RESERVATION_STATUS.ACTIVE,
    'reservation stays active for the in-flight ADD operation');
  t.ok(readLog.laggedReads > 0, 'the lagging read path was exercised');
  t.ok(readLog.strictReads > 0,
    'the owner-RPC-required escalation read was issued');
  t.end();
});

test('reconcileReservations - unconfirmed absence (authority unreachable) ' +
  'keeps the reservation active', async (t) => {
  initializeConfig();
  const {coordinator, store, readLog} = createCoordinatorWithLaggingReads({
    authorityReadBehavior: AUTHORITY_READ_BEHAVIOR.FAIL_UNREACHABLE,
  });
  seedActiveReservation(store);
  seedInFlightAddOperation(store);

  const result = await coordinator.reconcileReservations();

  t.equal(result.orphansReleased, 0,
    'no orphan release while absence is unconfirmed by the authority read');
  const reservation = store.reservations.get(TEST_RESERVATION_ID);
  t.equal(reservation.status, RESERVATION_STATUS.ACTIVE,
    'reservation stays active when the authority read cannot confirm absence');
  t.ok(readLog.strictReads > 0,
    'the owner-RPC-required escalation read was attempted');
  t.end();
});

test('reconcileReservations - an owner-confirmed absent operation still ' +
  'releases the orphan reservation', async (t) => {
  initializeConfig();
  const {coordinator, store, readLog} = createCoordinatorWithLaggingReads();
  seedActiveReservation(store);

  const result = await coordinator.reconcileReservations();

  t.equal(result.orphansReleased, 1,
    'a true orphan (owner-confirmed empty read) is still released');
  const reservation = store.reservations.get(TEST_RESERVATION_ID);
  t.equal(reservation.status, RESERVATION_STATUS.RELEASED,
    'orphan reservation transitions to released');
  t.ok(readLog.strictReads > 0,
    'release was gated on the owner-RPC-required confirmation read');
  t.end();
});

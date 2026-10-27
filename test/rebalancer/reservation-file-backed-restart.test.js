/**
 * Production-owner restart witness for reservation adoption.
 *
 * Unlike the in-memory reservation harness, this test closes and reopens the
 * canonical replica_operations and storage_reservations SQLite tables between
 * owners. The fresh owner must reconstruct one progress obligation from those
 * rows, remain fail closed while strict operation authority is unavailable,
 * and cross the existing reservation dispatch gate once authority returns.
 */

import Database from 'better-sqlite3';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

import {test} from '../../src/test-helpers/tap.js';
import {UNIFIED_SERVICE_TYPE, WORKFLOW_STEP} from
  '../../src/constants/index.js';
import {
  REPLICA_OPERATIONS_SCHEMA,
  STORAGE_RESERVATIONS_SCHEMA,
} from '../../src/bootstrap/system-table-schemas-constants.js';
import {
  generateCreateIndexSQL,
  generateCreateTableSQL,
} from '../../src/bootstrap/system-table-schema-sql.js';
import {RESERVATION_STATUS} from
  '../../src/rebalancer/storage-capacity-constants.js';
import {OperationType} from '../../src/rebalancer/replica-status.js';
import {
  OPERATION_RESERVATION_ATTEMPT_OUTCOME,
} from '../../src/rebalancer/operation-reservation-attempt-outcome.js';
import {
  REBALANCE_COORDINATOR_EVENT,
} from '../../src/rebalancer/rebalancer-constants.js';
import {
  TEST_OPERATION_ID,
  TEST_RESERVATION_ID,
  TEST_TARGET_NODE_ID,
  createCoordinatorWithStorage,
  createDeterministicTimerQueue,
  initializeConfig,
} from './reservation-dispatch-gate-test-harness.js';

const RUNTIME_SERVICE_ID = 'sys-postgres-wire';
const RUNTIME_REPLICA_ID = `${RUNTIME_SERVICE_ID}-r1`;
const TABLES = Object.freeze([
  REPLICA_OPERATIONS_SCHEMA,
  STORAGE_RESERVATIONS_SCHEMA,
]);

function executeSql(database, sql, params = []) {
  try {
    const statement = database.prepare(sql);
    if (statement.reader) {
      const rows = statement.all(...params);
      return {success: true, rows, affectedRows: rows.length};
    }
    const result = statement.run(...params);
    return {
      success: true,
      affectedRows: result.changes,
      changes: result.changes,
      lastInsertRowid: Number(result.lastInsertRowid),
    };
  } catch (error) {
    return {
      success: false,
      error: error.message,
      errorCode: error.code || null,
    };
  }
}

function openCanonicalStore(dbPath) {
  const database = new Database(dbPath);
  database.pragma('journal_mode = WAL');
  for (const schema of TABLES) {
    database.exec(generateCreateTableSQL(schema));
    for (const indexSql of generateCreateIndexSQL(schema)) {
      database.exec(indexSql);
    }
  }
  const engine = {
    reservations: {
      get size() {
        return database.prepare(
          'SELECT COUNT(*) FROM storage_reservations',
        ).pluck().get();
      },
    },
    async executeQuery(sql, params = []) {
      return executeSql(database, sql, params);
    },
    row(tableName, identityColumn, identity) {
      return database.prepare(
        `SELECT * FROM ${tableName} WHERE ${identityColumn} = ?`,
      ).get(identity) || null;
    },
    count(tableName) {
      return database.prepare(`SELECT COUNT(*) FROM ${tableName}`)
        .pluck().get();
    },
    close() {
      database.close();
    },
  };
  return engine;
}

function activeProgressOwnerCount(owner, operationId) {
  return Number(owner.transitionRetryTimerByOperationId.has(operationId)) +
    Number(owner.dispatchRetryTimerByOperationId.has(operationId)) +
    Number(owner.createdOperationHandoffRetryTimerByOperationId.has(
      operationId,
    ));
}

function observeStrictAuthorityFault(coordinator) {
  let faultCount = 0;
  const query = coordinator.repository
    .queryAuthoritativeOperationVisibilityObservation
    .bind(coordinator.repository);
  coordinator.repository.queryAuthoritativeOperationVisibilityObservation =
    async (...args) => {
      const result = await query(...args);
      if (
        result?.deferredOutcome?.deferRetry === true &&
        result.deferredOutcome.errorCode ===
          'CONTROL_PLANE_PRESSURE_DEGRADED'
      ) {
        faultCount++;
      }
      return result;
    };
  return () => faultCount;
}

function liveTimerCount(timers) {
  return timers.scheduled.filter((timer) => timer.cleared !== true).length;
}

function runtimeMove() {
  return {
    type: OperationType.ADD,
    operationIntentId: TEST_OPERATION_ID,
    replicaIntentId: RUNTIME_REPLICA_ID,
    partitionId: RUNTIME_SERVICE_ID,
    nodeId: TEST_TARGET_NODE_ID,
    entityType: UNIFIED_SERVICE_TYPE.RUNTIME_SERVICE,
    entityId: RUNTIME_SERVICE_ID,
    emitOperationCreated: true,
  };
}

test('file-backed restart adopts one durable operation/reservation and ' +
  'dispatches once after strict authority returns', async (t) => {
  initializeConfig();
  const directory = fs.mkdtempSync(path.join(
    os.tmpdir(),
    'reservation-file-backed-restart-',
  ));
  const dbPath = path.join(directory, 'control-plane.sqlite');
  t.teardown(() => fs.rmSync(directory, {recursive: true, force: true}));

  const firstTimers = createDeterministicTimerQueue();
  let firstStore = openCanonicalStore(dbPath);
  let first = createCoordinatorWithStorage({
    sqlQueryEngine: firstStore,
    unavailableOperationAuthorityReadsAfterReservationInsert: 1,
    setTimeoutFn: firstTimers.setTimeoutFn,
    clearTimeoutFn: firstTimers.clearTimeoutFn,
  }).coordinator;
  const firstOwner = first.workflowOwner;
  const firstAuthorityFaultCount = observeStrictAuthorityFault(first);
  await t.rejects(
    first.createOperation(runtimeMove()),
    /Storage reservation creation failed/,
    'lost strict-authority answer leaves the durable owner rows fail closed',
  );
  t.ok(firstAuthorityFaultCount() > 0,
    'the first owner reaches the typed strict-authority fault after INSERT');
  const originalOperation = firstStore.row(
    'replica_operations',
    'operation_id',
    TEST_OPERATION_ID,
  );
  const originalReservation = firstStore.row(
    'storage_reservations',
    'reservation_id',
    TEST_RESERVATION_ID,
  );
  t.equal(originalOperation?.workflow_step, WORKFLOW_STEP.PENDING,
    'the production repository durably wrote PENDING');
  t.equal(originalReservation?.status, RESERVATION_STATUS.ACTIVE,
    'the production reservation owner durably wrote the exact ACTIVE hold');
  t.equal(firstStore.count('replica_operations'), 1,
    'one operation generation exists before restart');
  t.equal(firstStore.count('storage_reservations'), 1,
    'one capacity hold exists before restart');
  await first.shutdown();
  t.equal(activeProgressOwnerCount(first.workflowOwner, TEST_OPERATION_ID), 0,
    'the destroyed owner retains no in-memory retry registry');
  t.equal(liveTimerCount(firstTimers), 0,
    'shutdown leaves no live retry timer owned by the first process');
  firstStore.close();
  first = null;
  firstStore = null;

  const restartTimers = createDeterministicTimerQueue();
  const reopenedStore = openCanonicalStore(dbPath);
  const restarted = createCoordinatorWithStorage({
    sqlQueryEngine: reopenedStore,
    unavailableOperationAuthorityReadsAfterReservationInsert: 1,
    setTimeoutFn: restartTimers.setTimeoutFn,
    clearTimeoutFn: restartTimers.clearTimeoutFn,
  }).coordinator;
  const dispatchCalls = [];
  const sequence = [];
  const reservationObservations = [];
  const freshAuthorityFaultCount = observeStrictAuthorityFault(restarted);
  let operationCreatedEvents = 0;
  let reservationCreatedEvents = 0;
  restarted.on(REBALANCE_COORDINATOR_EVENT.OPERATION_CREATED, () => {
    operationCreatedEvents++;
  });
  restarted.on(REBALANCE_COORDINATOR_EVENT.RESERVATION_CREATED, () => {
    reservationCreatedEvents++;
  });
  const ensureReservation =
    restarted.ensureReservationForOperation.bind(restarted);
  restarted.ensureReservationForOperation = async (operation, options = {}) => {
    const attempt = await ensureReservation(operation, options);
    const observation = {
      allowCreate: options.allowCreate,
      outcome: attempt?.outcome,
      authorityUnavailable: attempt?.authorityUnavailable === true,
    };
    reservationObservations.push(observation);
    sequence.push({kind: 'reservation', ...observation});
    return attempt;
  };
  restarted.workflowOwner.repository.isOperationLocallyOwned = () => true;
  restarted.workflowOwner.executeOperationInternal = async (operation) => {
    sequence.push({kind: 'execute', operationId: operation.operationId});
    dispatchCalls.push(operation.operationId);
    return {success: true, operationId: operation.operationId};
  };
  try {
    t.not(restarted.workflowOwner, firstOwner,
      'restart constructs a distinct workflow owner over the reopened file');
    t.equal(restarted.hasStorageReservationSupport(), true,
      'the fresh coordinator engages canonical storage reservation support');
    const recovery = await restarted.workflowOwner.handleRecovery();
    t.ok(freshAuthorityFaultCount() > 0,
      'the fresh owner reaches the typed strict-authority fault during recovery');
    t.same(dispatchCalls, [],
      'strict owner-authority loss permits no dispatch after reopen');
    t.equal(activeProgressOwnerCount(
      restarted.workflowOwner,
      TEST_OPERATION_ID,
    ), 1, 'the fresh owner reconstructs exactly one canonical retry');
    t.equal(recovery.markedFailed, 0,
      'the durable PENDING obligation is not terminalized');
    t.equal(reopenedStore.row(
      'replica_operations',
      'operation_id',
      TEST_OPERATION_ID,
    )?.workflow_step, WORKFLOW_STEP.PENDING,
    'the reopened SQL operation remains PENDING before the retry wake');
    t.equal(reopenedStore.count('replica_operations'), 1,
      'restart inserts no duplicate operation generation');
    t.equal(reopenedStore.count('storage_reservations'), 1,
      'restart inserts no duplicate capacity hold');
    const retainedReservation = reopenedStore.row(
      'storage_reservations',
      'reservation_id',
      TEST_RESERVATION_ID,
    );
    t.equal(retainedReservation?.created_at, originalReservation?.created_at,
      'restart retains the same exact hold rather than replacing it');
    t.equal(retainedReservation?.status, RESERVATION_STATUS.ACTIVE,
      'the retained hold stays ACTIVE while authority is unavailable');
    t.equal(operationCreatedEvents, 0,
      'restart recovery emits no fresh operation-created event');
    t.equal(reservationCreatedEvents, 0,
      'restart recovery emits no fresh reservation-created event');
    t.equal(restarted.stats.operationsCreated, 0,
      'restart recovery increments no operation creation statistic');
    t.equal(restarted.stats.reservationsCreated, 0,
      'restart recovery increments no reservation creation statistic');

    restarted.restoreOperationAuthority();
    t.equal(await restartTimers.runNext(), true,
      'the reconstructed retry observes restored strict authority');
    t.same(dispatchCalls, [TEST_OPERATION_ID],
      'the existing reservation gate dispatches exactly once');
    const recoveryAuthorityFailureIndex = sequence.findIndex((entry) =>
      entry.kind === 'reservation' &&
      entry.allowCreate === false &&
      entry.outcome === OPERATION_RESERVATION_ATTEMPT_OUTCOME.FAILED &&
      entry.authorityUnavailable === true);
    const ordinaryGateObservationIndex = sequence.findIndex((entry) =>
      entry.kind === 'reservation' &&
      entry.allowCreate !== false &&
      entry.outcome ===
        OPERATION_RESERVATION_ATTEMPT_OUTCOME.ALREADY_ACTIVE);
    const executeIndex = sequence.findIndex((entry) =>
      entry.kind === 'execute');
    t.ok(recoveryAuthorityFailureIndex >= 0,
      'recovery-specific no-create check fails closed on typed authority loss');
    t.ok(ordinaryGateObservationIndex > recoveryAuthorityFailureIndex,
      'retained recovery obligation reaches the ordinary gate after authority');
    t.ok(executeIndex > ordinaryGateObservationIndex,
      'physical execution starts only after the ordinary reservation gate');
    t.same(
      reservationObservations.filter((entry) =>
        entry.outcome ===
          OPERATION_RESERVATION_ATTEMPT_OUTCOME.ALREADY_ACTIVE),
      [
        {
          allowCreate: undefined,
          outcome: 'already_active',
          authorityUnavailable: false,
        },
      ],
      'the ordinary last-responsible gate adopts the exact hold exactly once',
    );
    t.equal(activeProgressOwnerCount(
      restarted.workflowOwner,
      TEST_OPERATION_ID,
    ), 0, 'the one dispatch consumes the sole progress owner');
    t.equal(reopenedStore.count('replica_operations'), 1,
      'dispatch creates no second operation row');
    t.equal(reopenedStore.count('storage_reservations'), 1,
      'dispatch creates no second reservation row');
    t.equal(reopenedStore.row(
      'storage_reservations',
      'reservation_id',
      TEST_RESERVATION_ID,
    )?.created_at, originalReservation?.created_at,
    'dispatch continues under the original capacity hold');
    t.equal(reopenedStore.row(
      'storage_reservations',
      'reservation_id',
      TEST_RESERVATION_ID,
    )?.status, RESERVATION_STATUS.ACTIVE,
    'dispatch preserves the original ACTIVE reservation status');
    t.equal(operationCreatedEvents, 0,
      'dispatch recovery emits no fresh operation-created event');
    t.equal(reservationCreatedEvents, 0,
      'dispatch recovery emits no fresh reservation-created event');
    t.equal(restarted.stats.operationsCreated, 0,
      'dispatch recovery creates no operation statistic');
    t.equal(restarted.stats.reservationsCreated, 0,
      'dispatch recovery creates no reservation statistic');
  } finally {
    await restarted.shutdown();
    reopenedStore.close();
  }
});

/**
 * Production-owner restart witness for reservation adoption.
 *
 * Unlike the in-memory reservation harness, this test closes and reopens the
 * canonical replica_operations and storage_reservations SQLite tables between
 * owners. The fresh owner runs the production restart path (the coordinator
 * timer tick: step-budget timeout sweep, then orphan sweep) over those rows.
 * It must remain fail closed while strict operation authority is unavailable,
 * never fail the pre-effect PENDING row merely for being incomplete, and keep
 * the one exact capacity hold: no duplicate operation generation, no duplicate
 * hold, no fresh creation events or accounting. The deleted restart routine's
 * reservation-backed re-drive (and its allowCreate:false restart check) has no
 * successor: a pre-effect row is re-driven or timed out by its own owner.
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
  runRestartTimerTick,
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

test('file-backed restart retains one durable operation/reservation through ' +
  'the production restart tick and never fails it for being incomplete',
async (t) => {
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
  const reservationOutcomes = [];
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
    reservationOutcomes.push(attempt?.outcome);
    return attempt;
  };
  restarted.workflowOwner.repository.isOperationLocallyOwned = () => true;
  restarted.workflowOwner.executeOperationInternal = async (operation) => {
    dispatchCalls.push(operation.operationId);
    return {success: true, operationId: operation.operationId};
  };
  try {
    t.not(restarted.workflowOwner, firstOwner,
      'restart constructs a distinct workflow owner over the reopened file');
    t.equal(restarted.hasStorageReservationSupport(), true,
      'the fresh coordinator engages canonical storage reservation support');
    await runRestartTimerTick(restarted);
    t.same(dispatchCalls, [],
      'strict owner-authority loss permits no dispatch after reopen');
    t.ok(activeProgressOwnerCount(
      restarted.workflowOwner,
      TEST_OPERATION_ID,
    ) <= 1, 'the fresh owner holds at most one progress owner for the row');
    t.equal(reopenedStore.row(
      'replica_operations',
      'operation_id',
      TEST_OPERATION_ID,
    )?.workflow_step, WORKFLOW_STEP.PENDING,
    'the restart tick does not fail the durable PENDING obligation');
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
      'the retained hold stays ACTIVE while its operation is live');
    t.equal(operationCreatedEvents, 0,
      'restart emits no fresh operation-created event');
    t.equal(reservationCreatedEvents, 0,
      'restart emits no fresh reservation-created event');
    t.equal(restarted.stats.operationsCreated, 0,
      'restart increments no operation creation statistic');
    t.equal(restarted.stats.reservationsCreated, 0,
      'restart increments no reservation creation statistic');

    restarted.restoreOperationAuthority();
    await restarted.checkTimeouts();
    t.equal(reopenedStore.count('replica_operations'), 1,
      'a later tick with authority restored inserts no second operation row');
    t.equal(reopenedStore.count('storage_reservations'), 1,
      'a later tick with authority restored inserts no second reservation row');
    t.equal(reopenedStore.row(
      'storage_reservations',
      'reservation_id',
      TEST_RESERVATION_ID,
    )?.created_at, originalReservation?.created_at,
    'the original capacity hold remains the sole hold');
    t.equal(restarted.stats.reservationsCreated, 0,
      'a later tick creates no reservation statistic');
    t.notOk(reservationOutcomes.includes(
      OPERATION_RESERVATION_ATTEMPT_OUTCOME.CREATED),
    'no reservation attempt after restart creates a second hold');
  } finally {
    await restarted.shutdown();
    reopenedStore.close();
  }
});

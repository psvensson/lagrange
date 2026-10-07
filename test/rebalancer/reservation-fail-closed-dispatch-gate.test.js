/**
 * Fail-closed storage-reservation dispatch gate regression tests
 * (verified-audit findings 3+11, quest reservation-fail-closed-dispatch-gate).
 *
 * Receipts:
 * - reservation-failure-blocks-dispatch: a failed reservation insert rejects
 *   operation creation; no OPERATION_CREATED is emitted and nothing is
 *   dispatched under-reserved.
 * - dispatch-gate-repairs-via-ensure: dispatch of a storage-increasing
 *   operation with no ACTIVE reservation repairs through
 *   ensureReservationForOperation (deterministic res-${operationId}) and
 *   proceeds; when the repair insert fails, dispatch is skipped as
 *   OPERATION_NOT_DISPATCHABLE.
 * - divergence-arm-keeps-reservation: a terminal persist that reports
 *   unresolved divergence (zero-change, authority row still non-terminal)
 *   keeps the reservation ACTIVE; a terminal persist that lost to a
 *   DIFFERENT durable terminal (TERMINAL_ADOPTED) releases it.
 *
 * Every test is red-on-revert: reverting the creation-time fail-closed
 * throw, the dispatch gate, or the typed-release gating flips the matching
 * test to red.
 */

import {test} from '../../src/test-helpers/tap.js';
import {UNIFIED_SERVICE_TYPE, WORKFLOW_STEP} from
  '../../src/constants/index.js';
import {SERVICE_TYPE} from '../../src/constants/service.js';
import {RESERVATION_STATUS} from
  '../../src/rebalancer/storage-capacity-constants.js';
import {OperationType, ReplicaStatus} from
  '../../src/rebalancer/replica-status.js';
import {
  REBALANCE_COORDINATOR_EVENT,
} from '../../src/rebalancer/rebalancer-constants.js';
import {
  REPLICA_OPERATION_UPDATE_DISPOSITION,
} from '../../src/rebalancer/replica-operation-update-disposition.js';
import {
  OPERATION_WORKFLOW_OWNER_SHARED,
} from '../../src/rebalancer/operation-workflow-owner-shared.js';
import {
  TEST_OPERATION_ID,
  TEST_PARTITION_ID,
  TEST_RESERVATION_ID,
  TEST_TARGET_NODE_ID,
  buildStorageIncreasingOperation,
  createCoordinatorWithStorage,
  createDeterministicTimerQueue,
  createRuntimeServiceDeferralFixture,
  createTrackingSqlEngine,
  initializeConfig,
  seedActiveReservation,
  seedAuthoritativeOperation,
} from './reservation-dispatch-gate-test-harness.js';

const {OPERATION_WORKFLOW_OWNER_REASON} = OPERATION_WORKFLOW_OWNER_SHARED;

// --- reservation-failure-blocks-dispatch ---

test('reservation-failure-blocks-dispatch: reservation insert failure ' +
  'rejects creation with no OPERATION_CREATED and no dispatch',
async (t) => {
  initializeConfig();
  const sqlEngine = createTrackingSqlEngine({failReservationInsert: true});
  const {coordinator} = createCoordinatorWithStorage({
    sqlQueryEngine: sqlEngine,
  });

  let operationCreatedEmitted = false;
  coordinator.on(REBALANCE_COORDINATOR_EVENT.OPERATION_CREATED, () => {
    operationCreatedEmitted = true;
  });
  const dispatchCalls = [];
  coordinator.workflowOwner.executeOperationInternal = async (operation) => {
    dispatchCalls.push(operation.operationId);
    return {success: true, operationId: operation.operationId};
  };

  try {
    await t.rejects(
      coordinator.createOperation({
        type: OperationType.ADD,
        partitionId: TEST_PARTITION_ID,
        nodeId: TEST_TARGET_NODE_ID,
        entityType: SERVICE_TYPE.PARTITION,
        entityId: TEST_PARTITION_ID,
        emitOperationCreated: true,
      }),
      /Storage reservation creation failed/,
      'creation must fail closed when the reservation insert fails',
    );

    t.equal(
      operationCreatedEmitted,
      false,
      'OPERATION_CREATED must not be emitted after a reservation failure',
    );
    t.equal(
      dispatchCalls.length,
      0,
      'no dispatch may run for an under-reserved operation',
    );
    t.equal(
      sqlEngine.reservations.size,
      0,
      'no reservation row exists after the failed insert',
    );
    t.equal(
      coordinator.workflowOwner.transitionRetryTimerByOperationId.size,
      0,
      'a confirmed INSERT failure installs no reservation progress retry',
    );
  } finally {
    await coordinator.shutdown();
  }
});

test('post-insert authority deferral: zero-change INSERT adoption retains ' +
  'the exact hold and redrives through the same gate', async (t) => {
  initializeConfig();
  const {coordinator, dispatchCalls, move, sqlEngine, timers} =
    createRuntimeServiceDeferralFixture({
      sqlEngineOptions: {reservationInsertChangeCount: 0},
    });

  try {
    await t.rejects(
      coordinator.createOperation(move),
      /Storage reservation creation failed/,
      'ambiguous INSERT adoption remains fail closed while authority is unavailable',
    );
    t.equal(
      sqlEngine.reservations.get(TEST_RESERVATION_ID)?.status,
      RESERVATION_STATUS.ACTIVE,
      'the authoritative ACTIVE row remains the sole capacity hold',
    );
    t.equal(coordinator.stats.reservationsCreated, 0,
      'ambiguous INSERT adoption emits no creation accounting');
    coordinator.restoreOperationAuthority();
    t.equal(await timers.runNext(), true,
      'the canonical retry observes restored operation authority');
    t.same(dispatchCalls, [TEST_OPERATION_ID],
      'restored authority dispatches exactly once through the existing gate');
  } finally {
    await coordinator.shutdown();
  }
});

test('post-insert authority deferral: terminal settlement wins before rearm ' +
  'and releases the exact hold', async (t) => {
  initializeConfig();
  const {coordinator, dispatchCalls, move, sqlEngine, timers} =
    createRuntimeServiceDeferralFixture();

  try {
    await t.rejects(
      coordinator.createOperation(move),
      /Storage reservation creation failed/,
      'temporary authority loss leaves one retained retry before terminal settlement',
    );
    const operation = await coordinator.repository.queryOperationById(
      TEST_OPERATION_ID,
    );
    await coordinator.workflowOwner.failOperation(
      operation,
      'terminal owner won before reservation rearm',
    );
    await timers.runNext();
    t.equal(dispatchCalls.length, 0,
      'a queued retry cannot dispatch after terminal settlement');
    t.equal(
      sqlEngine.reservations.get(TEST_RESERVATION_ID)?.status,
      RESERVATION_STATUS.RELEASED,
      'terminal settlement releases the exact retained hold',
    );
    t.equal(
      sqlEngine.operations.get(TEST_OPERATION_ID)?.workflow_step,
      WORKFLOW_STEP.FAILED,
      'the durable terminal operation remains authoritative',
    );
  } finally {
    await coordinator.shutdown();
  }
});

test('post-insert authority deferral: shutdown cancels the retained retry ' +
  'without dispatch', async (t) => {
  initializeConfig();
  const {coordinator, dispatchCalls, move, sqlEngine, timers} =
    createRuntimeServiceDeferralFixture();

  await t.rejects(
    coordinator.createOperation(move),
    /Storage reservation creation failed/,
    'temporary authority loss installs one retry before shutdown',
  );
  await coordinator.shutdown();
  t.equal(await timers.runNext(), false,
    'shutdown clears the retained owner retry');
  t.equal(dispatchCalls.length, 0,
    'no physical dispatch runs during or after shutdown');
  t.equal(
    sqlEngine.reservations.get(TEST_RESERVATION_ID)?.status,
    RESERVATION_STATUS.ACTIVE,
    'shutdown preserves the durable hold for restart recovery',
  );
});

test('post-insert authority deferral: runtime-service create keeps its exact ' +
  'ACTIVE hold and re-enters the canonical dispatch gate once authority recovers',
async (t) => {
  initializeConfig();
  const {coordinator, dispatchCalls, move, sqlEngine, timers} =
    createRuntimeServiceDeferralFixture({
      unavailableOperationAuthorityReadsAfterReservationInsert: 4,
    });
  let operationCreatedCount = 0;
  let reservationCreatedCount = 0;
  coordinator.on(REBALANCE_COORDINATOR_EVENT.OPERATION_CREATED, () => {
    operationCreatedCount++;
  });
  coordinator.on(REBALANCE_COORDINATOR_EVENT.RESERVATION_CREATED, () => {
    reservationCreatedCount++;
  });
  try {
    await t.rejects(
      coordinator.createOperation(move),
      /Storage reservation creation failed/,
      'temporary operation authority loss remains fail closed to the caller',
    );

    t.equal(
      sqlEngine.reservations.get(TEST_RESERVATION_ID)?.status,
      RESERVATION_STATUS.ACTIVE,
      'the exact successfully inserted capacity hold remains ACTIVE',
    );
    t.equal(reservationCreatedCount, 0,
      'ambiguous authority does not publish a reservation creation event');
    t.equal(coordinator.stats.reservationsCreated, 0,
      'ambiguous authority does not increment reservation creation stats');
    t.equal(operationCreatedCount, 0,
      'the coordinator-created dispatch event is not published prematurely');
    t.equal(dispatchCalls.length, 0,
      'no physical dispatch occurs before authoritative adoption');
    t.ok(
      coordinator.workflowOwner.transitionRetryTimerByOperationId.has(
        TEST_OPERATION_ID,
      ),
      'the operation owner retains one retry obligation for the durable PENDING row',
    );
    const reusedOperation = await coordinator.createOperation(move);
    t.equal(reusedOperation.operationId, TEST_OPERATION_ID,
      'a caller retry reuses the durable operation generation');
    t.equal(dispatchCalls.length, 0,
      'a caller retry cannot bypass the live canonical retry owner');
    t.equal(coordinator.stats.operationsCreated, 1,
      'a caller retry does not duplicate operation creation accounting');

    t.equal(await timers.runNext(), true, 'the retained owner retry fires');
    t.equal(dispatchCalls.length, 0,
      'continued authority loss remains non-dispatching');
    t.ok(
      coordinator.workflowOwner.transitionRetryTimerByOperationId.has(
        TEST_OPERATION_ID,
      ),
      'the same owner retry obligation is re-armed within the existing deadline',
    );
    coordinator.restoreOperationAuthority();
    t.equal(await timers.runNext(), true,
      'the re-armed owner retry observes recovered authority');
    t.same(dispatchCalls, [TEST_OPERATION_ID],
      'recovered authority crosses the existing reservation gate exactly once');
    t.equal(reservationCreatedCount, 0,
      'adopting the exact existing hold emits no duplicate creation event');
    t.equal(coordinator.stats.reservationsCreated, 0,
      'adopting the exact existing hold increments no duplicate creation stat');
    t.equal(coordinator.stats.operationsCreated, 1,
      'the retry does not account a second operation creation');
  } finally {
    await coordinator.shutdown();
  }
});

test('post-insert authority deferral: restart recovery discovers the durable ' +
  'PENDING runtime-service operation and exact ACTIVE hold', async (t) => {
  initializeConfig();
  const firstTimers = createDeterministicTimerQueue();
  const sqlEngine = createTrackingSqlEngine();
  const runtimeServiceId = 'sys-postgres-wire';
  const runtimeReplicaId = `${runtimeServiceId}-r1`;
  const first = createCoordinatorWithStorage({
    sqlQueryEngine: sqlEngine,
    unavailableOperationAuthorityReadsAfterReservationInsert: 1,
    setTimeoutFn: firstTimers.setTimeoutFn,
    clearTimeoutFn: firstTimers.clearTimeoutFn,
  }).coordinator;

  await t.rejects(
    first.createOperation({
      type: OperationType.ADD,
      operationIntentId: TEST_OPERATION_ID,
      replicaIntentId: runtimeReplicaId,
      partitionId: runtimeServiceId,
      nodeId: TEST_TARGET_NODE_ID,
      entityType: UNIFIED_SERVICE_TYPE.RUNTIME_SERVICE,
      entityId: runtimeServiceId,
      emitOperationCreated: true,
    }),
    /Storage reservation creation failed/,
    'the first owner leaves a durable retryable PENDING operation',
  );
  await first.shutdown();

  const restartTimers = createDeterministicTimerQueue();
  const restarted = createCoordinatorWithStorage({
    sqlQueryEngine: sqlEngine,
    unavailableOperationAuthorityReadsAfterReservationInsert: 1,
    setTimeoutFn: restartTimers.setTimeoutFn,
    clearTimeoutFn: restartTimers.clearTimeoutFn,
  }).coordinator;
  const dispatchCalls = [];
  restarted.workflowOwner.repository.isOperationLocallyOwned = () => true;
  restarted.workflowOwner.executeOperationInternal = async (operation) => {
    dispatchCalls.push(operation.operationId);
    return {success: true, operationId: operation.operationId};
  };
  try {
    const recoveryResult = await restarted.workflowOwner.handleRecovery();
    t.equal(dispatchCalls.length, 0,
      'restart remains fail closed while operation authority is unavailable');
    t.ok(
      restarted.workflowOwner.transitionRetryTimerByOperationId.has(
        TEST_OPERATION_ID,
      ),
      'startup recovery transfers the durable obligation to the canonical retry owner',
    );
    t.equal(recoveryResult.markedFailed, 0,
      'restart does not report the reservation-backed PENDING row as failed');
    restarted.restoreOperationAuthority();
    t.equal(await restartTimers.runNext(), true,
      'recovered startup authority wakes the retained owner retry');
    t.same(dispatchCalls, [TEST_OPERATION_ID],
      'startup recovery re-enters the canonical owner dispatch path once');
    t.not(
      sqlEngine.operations.get(TEST_OPERATION_ID)?.workflow_step,
      WORKFLOW_STEP.FAILED,
      'restart does not terminalize the reservation-backed progress obligation',
    );
    t.equal(
      sqlEngine.reservations.get(TEST_RESERVATION_ID)?.status,
      RESERVATION_STATUS.ACTIVE,
      'restart adopts the same exact capacity hold',
    );
  } finally {
    await restarted.shutdown();
  }
});

// --- dispatch-gate-repairs-via-ensure ---

test('dispatch-gate-repairs-via-ensure: dispatch of an ADD operation with ' +
  'no ACTIVE reservation repairs through ensureReservationForOperation',
async (t) => {
  initializeConfig();
  const sqlEngine = createTrackingSqlEngine();
  const {coordinator} = createCoordinatorWithStorage({
    sqlQueryEngine: sqlEngine,
  });

  const operation = buildStorageIncreasingOperation();
  seedAuthoritativeOperation(sqlEngine, operation);
  const owner = coordinator.workflowOwner;
  owner.repository.isOperationLocallyOwned = () => true;
  owner.executeOperationInternal = async (dispatchedOperation) => ({
    success: true,
    operationId: dispatchedOperation.operationId,
  });

  try {
    const result = await owner.dispatchOperationInternal(operation);

    t.equal(result?.success, true, 'dispatch proceeded after repair');
    const reservation = sqlEngine.reservations.get(TEST_RESERVATION_ID);
    t.ok(
      reservation,
      'the deterministic res-${operationId} reservation was created',
    );
    t.equal(
      reservation?.status,
      RESERVATION_STATUS.ACTIVE,
      'the repaired reservation is ACTIVE',
    );
    t.equal(
      reservation?.operation_id,
      TEST_OPERATION_ID,
      'the reservation is bound to the dispatching operation',
    );
  } finally {
    await coordinator.shutdown();
  }
});

test('dispatch-gate-repairs-via-ensure: a failing reservation repair ' +
  'skips dispatch as OPERATION_NOT_DISPATCHABLE',
async (t) => {
  initializeConfig();
  const sqlEngine = createTrackingSqlEngine({failReservationInsert: true});
  const {coordinator} = createCoordinatorWithStorage({
    sqlQueryEngine: sqlEngine,
  });

  const operation = buildStorageIncreasingOperation();
  seedAuthoritativeOperation(sqlEngine, operation);
  const owner = coordinator.workflowOwner;
  owner.repository.isOperationLocallyOwned = () => true;
  const dispatchCalls = [];
  owner.executeOperationInternal = async (dispatchedOperation) => {
    dispatchCalls.push(dispatchedOperation.operationId);
    return {
      success: true,
      operationId: dispatchedOperation.operationId,
    };
  };

  try {
    const result = await owner.dispatchOperationInternal(operation);

    t.equal(result?.success, false, 'dispatch did not proceed');
    t.equal(result?.skipped, true, 'dispatch is reported as skipped');
    t.equal(
      result?.reason,
      OPERATION_WORKFLOW_OWNER_REASON.OPERATION_NOT_DISPATCHABLE,
      'skip reason is OPERATION_NOT_DISPATCHABLE',
    );
    t.equal(
      result?.operationId,
      TEST_OPERATION_ID,
      'skip result carries the operation id',
    );
    t.equal(
      dispatchCalls.length,
      0,
      'executeOperationInternal never ran under-reserved',
    );
    t.equal(
      sqlEngine.reservations.size,
      0,
      'no reservation row after the failed repair insert',
    );
  } finally {
    await coordinator.shutdown();
  }
});

// --- divergence-arm-keeps-reservation ---

test('divergence-arm-keeps-reservation: unresolved terminal divergence ' +
  'keeps the reservation ACTIVE', async (t) => {
  initializeConfig();
  const sqlEngine = createTrackingSqlEngine();
  const {coordinator} = createCoordinatorWithStorage({
    sqlQueryEngine: sqlEngine,
  });

  seedActiveReservation(sqlEngine, TEST_OPERATION_ID);
  const owner = coordinator.workflowOwner;
  // Unresolved divergence: the terminal persist wins zero rows and the
  // authority row is still NON-terminal — the operation is live and
  // re-driveable, so its reservation must survive.
  owner.repository.persistOperationUpdate = async (operation, options) => {
    if (options?.returnDisposition === true) {
      return Object.freeze({
        persisted: false,
        disposition: REPLICA_OPERATION_UPDATE_DISPOSITION.REFUSED,
        operation: null,
      });
    }
    return false;
  };

  try {
    await owner.completeOperation(buildStorageIncreasingOperation());

    t.equal(
      sqlEngine.reservations.get(TEST_RESERVATION_ID)?.status,
      RESERVATION_STATUS.ACTIVE,
      'completeOperation keeps the reservation ACTIVE on divergence',
    );

    await owner.failOperation(
      buildStorageIncreasingOperation(),
      'divergence failure probe',
    );

    t.equal(
      sqlEngine.reservations.get(TEST_RESERVATION_ID)?.status,
      RESERVATION_STATUS.ACTIVE,
      'failOperation keeps the reservation ACTIVE on divergence',
    );
  } finally {
    await coordinator.shutdown();
  }
});

test('divergence-arm-keeps-reservation: losing to a DIFFERENT durable ' +
  'terminal releases the reservation', async (t) => {
  initializeConfig();
  const sqlEngine = createTrackingSqlEngine();
  const {coordinator} = createCoordinatorWithStorage({
    sqlQueryEngine: sqlEngine,
  });

  seedActiveReservation(sqlEngine, TEST_OPERATION_ID);
  const owner = coordinator.workflowOwner;
  // Lost-to-other-terminal: a DIFFERENT durable terminal already won; the
  // winning terminal owns the operation, so the reservation is released.
  owner.repository.persistOperationUpdate = async (operation, options) => {
    const winningTerminal = {
      ...operation,
      status: ReplicaStatus.FAILED,
      workflowStep: WORKFLOW_STEP.FAILED,
      completedAt: Date.now(),
      errorMessage: 'winning terminal',
    };
    if (options?.returnDisposition === true) {
      return Object.freeze({
        persisted: false,
        disposition: REPLICA_OPERATION_UPDATE_DISPOSITION.TERMINAL_ADOPTED,
        operation: winningTerminal,
      });
    }
    return false;
  };

  try {
    await owner.completeOperation(buildStorageIncreasingOperation());

    t.equal(
      sqlEngine.reservations.get(TEST_RESERVATION_ID)?.status,
      RESERVATION_STATUS.RELEASED,
      'completeOperation releases the reservation on TERMINAL_ADOPTED',
    );
  } finally {
    await coordinator.shutdown();
  }
});

/**
 * Successor to the immutable 9dede formation witness. The historical control
 * intentionally remains unchanged. This witness observes the owned mutation
 * boundary, so both INSERT and INSERT OR IGNORE spellings count as the same
 * durable reservation mutation. It accepts either immediate canonical arm or
 * a retained canonical transition retry; it does not require zero owner reads.
 */

import {test} from '../../src/test-helpers/tap.js';
import {ConfigurationManager} from '../../src/config/configuration-manager.js';
import {LoggingService} from '../../src/logging/logging-service.js';
import {OperationType} from '../../src/rebalancer/replica-status.js';
import {REBALANCE_COORDINATOR_EVENT} from
  '../../src/rebalancer/rebalancer-constants.js';
import {
  activeReservationFor,
  createRuntimeServiceIngress,
  createSuccessorFixture,
  isPendingOperation,
  readStoredOperation,
} from './formation-cure-reservation-progress-successor-harness.js';

const RUNTIME_SERVICE_ID = 'sys-postgres-wire';
const TARGET_NODE_ID = 'successor-target-node';
const RUNTIME_REPLICA_ID = `${RUNTIME_SERVICE_ID}-r1`;

function initializeTestEnvironment() {
  ConfigurationManager.resetInstance();
  LoggingService.resetInstance();
  ConfigurationManager.getInstance().initialize({
    node: {id: 'successor-owner-node'},
    logging: {level: 'error'},
  });
  LoggingService.getInstance().initialize({level: 'error'});
}

test('successor discriminator: runtime-service ingress retains exactly one ' +
  'progress owner after a durable reservation INSERT', async (t) => {
  initializeTestEnvironment();
  const fixture = createSuccessorFixture();
  const {
    boundary,
    coordinator,
    normalArmOperationIds,
    recoveredDispatchOperationIds,
    timers,
  } = fixture;
  const runtimeRebalancer = createRuntimeServiceIngress(
    coordinator,
    RUNTIME_SERVICE_ID,
  );
  const requests = [];
  const originalCreateOperation = coordinator.createOperation.bind(coordinator);
  coordinator.createOperation = async (request) => {
    requests.push({...request});
    return originalCreateOperation(request);
  };
  let operationCreatedCount = 0;
  let reservationCreatedCount = 0;
  coordinator.on(REBALANCE_COORDINATOR_EVENT.OPERATION_CREATED, () => {
    operationCreatedCount++;
  });
  coordinator.on(REBALANCE_COORDINATOR_EVENT.RESERVATION_CREATED, () => {
    reservationCreatedCount++;
  });

  try {
    let moveResult = null;
    let moveError = null;
    try {
      moveResult = await runtimeRebalancer.executeMoveViaCoordinator({
        type: 'add',
        partitionId: RUNTIME_SERVICE_ID,
        entityType: 'runtime_service',
        entityId: RUNTIME_SERVICE_ID,
        nodeId: TARGET_NODE_ID,
        replicaId: RUNTIME_REPLICA_ID,
      });
    } catch (error) {
      moveError = error;
    }

    t.equal(requests.length, 1,
      'the real UnifiedRebalancer ingress submits one coordinator request');
    t.equal(requests[0].operationIntentId, undefined,
      'runtime ingress does not fabricate an explicit operation identity');
    t.equal(requests[0].replicaIntentId, undefined,
      'runtime ingress carries the canonical replicaId without a fixture intent');
    t.equal(requests[0].replicaId, RUNTIME_REPLICA_ID,
      'runtime ingress preserves the canonical runtime-service replica identity');
    t.equal(boundary.insertCount(), 1,
      'the owned SQL boundary observes one reservation INSERT independent of spelling');

    const reservation = Array.from(boundary.reservations.values())[0];
    const operationId = reservation?.operation_id;
    t.ok(operationId,
      'the durable reservation names the generated production operation identity');
    t.ok(activeReservationFor(boundary, operationId),
      'the exact durable reservation remains ACTIVE');
    boundary.restoreAuthority();
    const durableOperation = await readStoredOperation(coordinator, operationId);
    t.ok(isPendingOperation(durableOperation),
      'the exact durable operation remains PENDING');

    const retainedRetry =
      coordinator.workflowOwner.transitionRetryTimerByOperationId.has(
        operationId,
      );
    t.equal(normalArmOperationIds.length + Number(retainedRetry), 1,
      'exactly one canonical progress owner is retained');
    if (retainedRetry) {
      t.ok(moveError,
        'the unavailable post-INSERT owner read stays fail closed to the caller');
      t.equal(normalArmOperationIds.length, 0,
        'ordinary arm does not run before owner authority recovers');
      t.equal(recoveredDispatchOperationIds.length, 0,
        'physical progression does not run before owner authority recovers');
      t.equal(await timers.runNext(), true,
        'authority restoration wakes the retained canonical retry');
      t.same(recoveredDispatchOperationIds, [operationId],
        'the restored retry enters the existing dispatch owner exactly once');
    } else {
      t.equal(moveError, null,
        'the control without a post-INSERT wait returns through ordinary creation');
      t.equal(moveResult?.success, true,
        'the clean control schedules the runtime-service operation');
      t.same(normalArmOperationIds, [operationId],
        'the clean control retains the ordinary canonical arm');
      t.equal(recoveredDispatchOperationIds.length, 0,
        'the clean control needs no reservation recovery dispatch');
    }
    t.equal(coordinator.stats.operationsCreated, 1,
      'progress recovery does not duplicate operation creation accounting');
    t.ok(reservationCreatedCount <= 1,
      'progress recovery does not duplicate reservation creation accounting');
    t.ok(operationCreatedCount <= 1,
      'progress recovery does not duplicate OPERATION_CREATED publication');
    t.equal(boundary.reservations.size, 1,
      'one exact capacity hold exists after authority restoration');
    t.ok(boundary.authorityReadCount() >= Number(retainedRetry),
      'the unavailable path is tied to an actual post-INSERT owner read');
  } finally {
    await coordinator.shutdown();
    ConfigurationManager.resetInstance();
    LoggingService.resetInstance();
  }
});

test('successor discriminator: terminal settlement wins before retained ' +
  'reservation rearm', async (t) => {
  initializeTestEnvironment();
  const fixture = createSuccessorFixture();
  const {boundary, coordinator, recoveredDispatchOperationIds, timers} = fixture;
  try {
    let createError = null;
    try {
      await coordinator.createOperation({
        type: OperationType.ADD,
        partitionId: 'successor-terminal-p1',
        entityType: 'partition',
        entityId: 'successor-terminal-p1',
        nodeId: TARGET_NODE_ID,
        replicaIntentId: 'successor-terminal-p1-r4',
        operationIntentId: 'successor-terminal-op',
        emitOperationCreated: true,
      });
    } catch (error) {
      createError = error;
    }
    const operationId = 'successor-terminal-op';
    const retainedRetry =
      coordinator.workflowOwner.transitionRetryTimerByOperationId.has(
        operationId,
      );
    boundary.restoreAuthority();
    const operation = await readStoredOperation(coordinator, operationId);
    t.ok(operation, 'the exact durable operation is recoverable for settlement');
    await coordinator.workflowOwner.failOperation(
      operation,
      'successor terminal owner won',
    );
    if (retainedRetry) {
      t.ok(createError, 'the deferred creation was fail closed');
      await timers.runNext();
    }
    t.equal(recoveredDispatchOperationIds.length, 0,
      'terminal settlement prevents later physical progression');
    t.equal(activeReservationFor(boundary, operationId), null,
      'terminal settlement releases the exact ACTIVE hold');
  } finally {
    await coordinator.shutdown();
    ConfigurationManager.resetInstance();
    LoggingService.resetInstance();
  }
});

test('successor discriminator: a continuation older than the shutdown fence ' +
  'cannot register retry after reinitialize', async (t) => {
  initializeTestEnvironment();
  const fixture = createSuccessorFixture();
  const {boundary, coordinator} = fixture;
  boundary.blockAuthority();
  coordinator.shutdownJoinTimeoutMs = 1;
  const operationId = 'successor-shutdown-op';
  const createPromise = coordinator.createOperation({
    type: OperationType.ADD,
    partitionId: 'successor-shutdown-p1',
    entityType: 'partition',
    entityId: 'successor-shutdown-p1',
    nodeId: TARGET_NODE_ID,
    replicaIntentId: 'successor-shutdown-p1-r4',
    operationIntentId: operationId,
    emitOperationCreated: true,
  });
  const creationOutcome = createPromise.then(
    () => 'created',
    () => 'rejected',
  );
  try {
    const firstOutcome = await Promise.race([
      boundary.authorityReadStarted(),
      creationOutcome,
    ]);
    if (firstOutcome !== 'authority_read') {
      t.equal(firstOutcome, 'created',
        'the clean control completes without a post-INSERT owner wait');
      t.equal(
        coordinator.workflowOwner.transitionRetryTimerByOperationId.size,
        0,
        'the clean control has no stale retry registration',
      );
      return;
    }

    const oldFence =
      coordinator.workflowOwner.getOperationOwnershipFenceEpoch();
    await coordinator.shutdown();
    t.ok(
      coordinator.workflowOwner.getOperationOwnershipFenceEpoch() > oldFence,
      'shutdown advances the canonical operation-owner fence',
    );
    coordinator.initialize();
    boundary.releaseBlockedAuthorityAsUnavailable();
    t.equal(await creationOutcome, 'rejected',
      'the old continuation observes the unavailable owner result');
    t.equal(
      coordinator.workflowOwner.transitionRetryTimerByOperationId.has(
        operationId,
      ),
      false,
      'the stale pre-shutdown continuation cannot register retry in the new epoch',
    );
  } finally {
    boundary.releaseBlockedAuthorityAsUnavailable();
    await creationOutcome;
    await coordinator.shutdown();
    ConfigurationManager.resetInstance();
    LoggingService.resetInstance();
  }
});

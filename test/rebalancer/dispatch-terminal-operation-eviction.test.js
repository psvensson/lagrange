/**
 * Terminal operation eviction & reconciliation in reservation and epoch gates.
 * Verifies that when an operation becomes terminal authoritatively or is failed
 * closed by the epoch gate:
 * 1. The local operation object is reconciled to terminal state.
 * 2. The local priority operation progress row is applied to systemTableCache.
 * 3. Terminal retry state is cleared on the coordinator.
 * 4. A terminal failed result is returned so ReplicaDispatchService does not
 *    defer and retry endlessly.
 * 5. ReplicaDispatchService drops stale retries when an authoritative row
 *    has become terminal.
 */

import {test} from '../../src/test-helpers/tap.js';
import {WORKFLOW_STEP} from '../../src/constants/index.js';
import {OperationType, ReplicaStatus} from '../../src/rebalancer/replica-status.js';
import {ensureDispatchReservationOrSkip} from '../../src/rebalancer/operation-workflow-dispatch-reservation-gate.js';
import {
  STALE_DISPATCH_EPOCH_PREFIX,
  ensureDispatchMembershipEpochOrSkip,
} from '../../src/rebalancer/operation-workflow-dispatch-epoch-gate.js';
import {STORAGE_RESERVATION_AUTHORITY_ERROR} from '../../src/rebalancer/storage-reservation-authority.js';
import {
  buildStorageIncreasingOperation,
  createCoordinatorWithStorage,
  createTrackingSqlEngine,
  initializeConfig,
  seedAuthoritativeOperation,
} from './reservation-dispatch-gate-test-harness.js';
import {
  PLANNING_EPOCH,
  buildEpochBoundAddOperation,
  createEpochCoordinator,
} from './epoch-fence-test-harness.js';
import {
  ReplicaDispatchService,
} from '../../src/control-plane/replica-dispatch-service.js';

test('terminal authoritative operation in reservation gate reconciles local state and returns terminal result', async (t) => {
  initializeConfig();
  const sqlEngine = createTrackingSqlEngine();
  const {coordinator} = createCoordinatorWithStorage({
    sqlQueryEngine: sqlEngine,
  });

  const operation = buildStorageIncreasingOperation();
  const authoritativeTerminal = {
    ...operation,
    status: ReplicaStatus.FAILED,
    workflowStep: WORKFLOW_STEP.FAILED,
    completedAt: Date.now(),
    errorMessage: 'terminal in authority',
  };
  seedAuthoritativeOperation(sqlEngine, authoritativeTerminal);

  let progressRowApplied = null;
  coordinator.repository.applyLocalPriorityOperationProgressRow = (op) => {
    progressRowApplied = op;
    return true;
  };
  coordinator.workflowOwner.repository.isOperationLocallyOwned = () => true;
  coordinator.workflowOwner.confirmCommittedTransitionPersistence = async () => {};
  let retriesCleared = false;
  coordinator.workflowOwner.clearTerminalOperationRetryState = () => {
    retriesCleared = true;
  };

  try {
    const result = await ensureDispatchReservationOrSkip(
      coordinator.workflowOwner,
      operation,
    );
    t.ok(result, 'dispatch gate returns a result');
    t.equal(result.success, false, 'dispatch result is failure');
    t.equal(result.terminal, true, 'dispatch result is terminal');
    t.equal(
      operation.status,
      ReplicaStatus.FAILED,
      'local operation is reconciled to authoritative failed status',
    );
    t.equal(
      operation.workflowStep,
      WORKFLOW_STEP.FAILED,
      'local operation step is reconciled to FAILED',
    );
    t.ok(progressRowApplied, 'progress row was applied to cache');
    t.equal(retriesCleared, true, 'coordinator terminal retries were cleared');
  } finally {
    await coordinator.shutdown();
  }
});

test('stale epoch in epoch gate marks terminal, updates cache progress row and clears retries', async (t) => {
  initializeConfig();
  const {coordinator} = createEpochCoordinator({
    currentEpoch: PLANNING_EPOCH + 1,
  });
  const operation = buildEpochBoundAddOperation(PLANNING_EPOCH, {
    operationId: 'epoch-stale-terminal-test',
    type: OperationType.ADD,
    workflowStep: WORKFLOW_STEP.PENDING,
  });

  let progressRowApplied = null;
  coordinator.repository.applyLocalPriorityOperationProgressRow = (op) => {
    progressRowApplied = op;
    return true;
  };
  coordinator.workflowOwner.repository.isOperationLocallyOwned = () => true;
  coordinator.workflowOwner.confirmCommittedTransitionPersistence = async () => {};
  let retriesCleared = false;
  coordinator.workflowOwner.clearTerminalOperationRetryState = () => {
    retriesCleared = true;
  };

  try {
    const result = await ensureDispatchMembershipEpochOrSkip(
      coordinator.workflowOwner,
      operation,
    );
    t.ok(result, 'epoch gate returns a result');
    t.equal(result.success, false, 'epoch gate result is failure');
    t.equal(result.terminal, true, 'epoch gate result is terminal');
    t.match(
      result.error,
      new RegExp(STALE_DISPATCH_EPOCH_PREFIX),
      'error matches stale epoch prefix',
    );
    t.ok(progressRowApplied, 'progress row was applied to cache');
    t.equal(retriesCleared, true, 'coordinator terminal retries were cleared');
  } finally {
    await coordinator.shutdown();
  }
});

test('ReplicaDispatchService recognizes terminal dispatch results and drops stale retries on authoritative terminal row', async (t) => {
  initializeConfig();
  const dispatchService = new ReplicaDispatchService({
    nodeId: 'test-node',
    systemTableCache: {
      get: () => null,
      getAll: () => [],
      onCacheChange: () => {},
    },
    messageRouter: {
      getConnectionState: () => 'connected',
      isOutboundQueueAvailable: () => true,
      getConnectedNodes: () => [],
    },
    controlPlaneReadinessService: {},
  });

  t.equal(
    dispatchService.isTerminalDispatchResult({terminal: true}),
    true,
    'explicit terminal property is recognized as terminal',
  );
  t.equal(
    dispatchService.isTerminalDispatchResult({
      error: `storage reservation unavailable: ${STORAGE_RESERVATION_AUTHORITY_ERROR.OPERATION_TERMINAL}`,
    }),
    true,
    'reservation terminal error is recognized as terminal',
  );
  t.equal(
    dispatchService.isTerminalDispatchResult({
      error: `${STALE_DISPATCH_EPOCH_PREFIX}6; current epoch is 9`,
    }),
    true,
    'stale dispatch epoch error is recognized as terminal',
  );
  t.equal(
    dispatchService.isTerminalDispatchResult({
      error: 'transient network timeout',
    }),
    false,
    'transient error is not terminal',
  );

  const staleContextRow = {
    operation_id: 'op-stale-1',
    type: 'add',
    status: 'sending',
    workflow_step: 'sending',
  };
  const authoritativeTerminalRow = {
    operation_id: 'op-stale-1',
    type: 'add',
    status: 'failed',
    workflow_step: 'failed',
  };

  dispatchService.getReplicaOperationRow = async (operationId) => {
    if (operationId === 'op-stale-1') {
      return authoritativeTerminalRow;
    }
    return null;
  };

  const resolvedRow = await dispatchService.resolveOperationDispatchReconcileRow(
    'op-stale-1',
    {row: staleContextRow},
  );
  t.equal(
    resolvedRow.workflow_step,
    'failed',
    'resolveOperationDispatchReconcileRow prefers authoritative terminal row over stale SENDING contextRow',
  );
});

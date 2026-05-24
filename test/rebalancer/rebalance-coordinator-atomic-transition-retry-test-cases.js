import {WORKFLOW_STEP} from '../../src/constants/index.js';
import {
  PARTITION_SERVICE_ERROR_MSG,
} from '../../src/partition/partition-service-constants.js';
import {
  REBALANCER_SKIP_REASON,
} from '../../src/rebalancer/rebalancer-constants.js';

const TRANSITION_RETRY_FALLBACK_PARTITION_ID = 'replica_operations-p1';
const TRANSITION_RETRY_FALLBACK_REPLICA_ID =
  `${TRANSITION_RETRY_FALLBACK_PARTITION_ID}-r4`;
const TRANSITION_RETRY_VISIBILITY_DEFERRED_COMPLETION_STATE =
  'authoritative_operation_read_deferred';

export function registerRebalanceCoordinatorAtomicTransitionRetryTests({
  test,
  createMinimalCoordinator,
  createTestOperation,
}) {
  test('executeAtomicTransition does not rotate the transition session on ' +
    'partition contention without stale-session evidence', async (t) => {
    let rotateCalls = 0;
    let recoverCalls = 0;
    const coordinator = createMinimalCoordinator();
    const workflowOwner = coordinator.workflowOwner;
    coordinator.repository.persistOperationUpdate =
      async () => {
        throw new Error(
          PARTITION_SERVICE_ERROR_MSG.TRANSACTION_ALREADY_ACTIVE,
        );
      };
    workflowOwner.recoverTransitionExecutionSession =
      async () => {
        recoverCalls += 1;
        return false;
      };
    workflowOwner.rotateTransitionExecutionAttemptAfterStaleSessionConflict =
      () => {
        rotateCalls += 1;
      };
    coordinator.initialize();

    try {
      await t.rejects(
        coordinator.updateStep(
          createTestOperation(),
          WORKFLOW_STEP.SENDING,
        ),
        /Transaction already active on this partition/i,
        'partition-level contention should still surface when no stale ' +
          'same-session state can be recovered',
      );

      t.ok(
        recoverCalls >= 1,
        'the owner should still probe for stale same-session state before giving up',
      );
      t.equal(
        rotateCalls,
        0,
        'generic partition contention must not rotate the canonical transition session',
      );
    } finally {
      await coordinator.shutdown();
    }
  });

  test('executeAtomicTransition retries the same step after a failed persist ' +
    'without idempotency poisoning', async (t) => {
    let persistUpdateCalls = 0;
    const operationId = 'op-atomic-retry-step';
    const coordinator = createMinimalCoordinator({
      sqlQueryEngine: {
        async executeQuery(sql) {
          if (!sql.includes('UPDATE replica_operations')) {
            return {success: true, rows: [], changes: 1};
          }
          persistUpdateCalls += 1;
          if (persistUpdateCalls === 1) {
            return {success: false, error: 'persist failed'};
          }
          return {success: true, rows: [], changes: 1};
        },
      },
    });
    coordinator.initialize();

    try {
      const firstAttempt = createTestOperation({
        operationId,
        workflowStep: WORKFLOW_STEP.PENDING,
        status: 'pending',
      });

      await t.rejects(
        coordinator.updateStep(
          firstAttempt,
          WORKFLOW_STEP.SENDING,
        ),
        'first persist failure should propagate',
      );

      t.equal(
        coordinator.operationWorkflowCoordinator
          .isTransitionIdempotent(
            operationId,
            WORKFLOW_STEP.SENDING,
          ),
        false,
        'failed persist must not mark the transition idempotent',
      );

      const secondAttempt = createTestOperation({
        operationId,
        workflowStep: WORKFLOW_STEP.PENDING,
        status: 'pending',
      });
      await coordinator.updateStep(
        secondAttempt,
        WORKFLOW_STEP.SENDING,
      );

      t.equal(
        persistUpdateCalls,
        2,
        'same step should be persisted again after the first failure',
      );
      t.equal(
        secondAttempt.workflowStep,
        WORKFLOW_STEP.SENDING,
        'retry should advance the workflow step',
      );
      t.equal(
        coordinator.operationWorkflowCoordinator
          .isTransitionIdempotent(
            operationId,
            WORKFLOW_STEP.SENDING,
          ),
        true,
        'transition should become idempotent only after the successful commit',
      );
    } finally {
      await coordinator.shutdown();
    }
  });

  test('dispatchOperation defers retryable transition persistence failures ' +
    'through the shared owner retry lane', async (t) => {
    const deferredTimers = [];
    const deliveries = [];
    const operation = createTestOperation({
      operationId: 'op-transition-retry-dispatch',
      partitionId: 'control_plane_publications-p1',
    });
    let persistCalls = 0;
    const coordinator = createMinimalCoordinator({
      messageRouter: {
        async deliver(target, payload, options) {
          deliveries.push({target, payload, options});
          return {acknowledged: true, status: 'initiated'};
        },
      },
      setTimeoutFn(fn, delayMs) {
        const handle = {fn, delayMs};
        deferredTimers.push(handle);
        return handle;
      },
      clearTimeoutFn() {},
    });
    coordinator.repository.queryOperationById = async () => operation;
    coordinator.repository.queryAuthoritativeOperationById =
      async () => operation;
    coordinator.repository.persistOperationUpdate =
      async (nextOperation) => {
        persistCalls += 1;
        if (persistCalls === 1) {
          throw new Error(
            PARTITION_SERVICE_ERROR_MSG.TRANSACTION_ALREADY_ACTIVE,
          );
        }
        operation.workflowStep = nextOperation.workflowStep;
        operation.status = nextOperation.status;
        operation.updatedAt = nextOperation.updatedAt;
        operation.completedAt = nextOperation.completedAt;
        operation.errorMessage = nextOperation.errorMessage;
        operation.replicaId = nextOperation.replicaId;
        operation.stepsHistory = nextOperation.stepsHistory.map(
          (entry) => ({...entry}),
        );
      };
    coordinator.initialize();

    try {
      const result = await coordinator.dispatchOperation(
        operation.operationId,
      );

      t.equal(
        result?.success,
        false,
        'retryable transition contention should stop the current dispatch attempt',
      );
      t.equal(
        result?.skipped,
        true,
        'retryable transition contention should defer rather than fail closed',
      );
      t.equal(
        result?.reason,
        REBALANCER_SKIP_REASON.DEFERRED_RETRY_PENDING,
        'dispatch should return the canonical deferred-retry reason',
      );
      t.equal(
        deliveries.length,
        0,
        'the shared retry lane should defer before any duplicate dispatch leaves the node',
      );
      t.equal(
        deferredTimers.length,
        1,
        'dispatch should schedule one owner-lane retry',
      );

      await deferredTimers[0].fn();

      t.equal(
        deliveries.length,
        1,
        'the deferred retry should resume the dispatch on the same owner lane',
      );
      t.equal(
        operation.workflowStep,
        WORKFLOW_STEP.CREATING,
        'the resumed owner path should advance the operation after persistence recovers',
      );
    } finally {
      await coordinator.shutdown();
    }
  });

  test('deferred transition retry resumes a stale critical pending operation ' +
    'instead of timing it out before the retry lane runs', async (t) => {
    const deferredTimers = [];
    const deliveries = [];
    const staleNow = Date.now();
    const operation = createTestOperation({
      operationId: 'op-stale-transition-retry-dispatch',
      partitionId: 'control_plane_publications-p1',
      createdAt: staleNow - 70000,
      updatedAt: staleNow - 65000,
    });
    let persistCalls = 0;
    const coordinator = createMinimalCoordinator({
      messageRouter: {
        async deliver(target, payload, options) {
          deliveries.push({target, payload, options});
          return {acknowledged: true, status: 'initiated'};
        },
      },
      setTimeoutFn(fn, delayMs) {
        const handle = {fn, delayMs};
        deferredTimers.push(handle);
        return handle;
      },
      clearTimeoutFn() {},
    });
    coordinator.repository.queryOperationById = async () => operation;
    coordinator.repository.queryAuthoritativeOperationById =
      async () => operation;
    coordinator.repository.persistOperationUpdate =
      async (nextOperation) => {
        persistCalls += 1;
        if (persistCalls === 1) {
          throw new Error(
            PARTITION_SERVICE_ERROR_MSG.TRANSACTION_ALREADY_ACTIVE,
          );
        }
        operation.workflowStep = nextOperation.workflowStep;
        operation.status = nextOperation.status;
        operation.updatedAt = nextOperation.updatedAt;
        operation.completedAt = nextOperation.completedAt;
        operation.errorMessage = nextOperation.errorMessage;
        operation.replicaId = nextOperation.replicaId;
        operation.stepsHistory = nextOperation.stepsHistory.map(
          (entry) => ({...entry}),
        );
      };
    coordinator.initialize();

    try {
      const firstAttempt = await coordinator.dispatchOperation(
        operation.operationId,
      );

      t.equal(
        firstAttempt?.reason,
        REBALANCER_SKIP_REASON.DEFERRED_RETRY_PENDING,
        'the initial retryable contention should defer through the shared retry lane',
      );
      t.equal(
        deferredTimers.length,
        1,
        'a deferred owner-lane retry should be armed',
      );

      await deferredTimers[0].fn();

      t.equal(
        deliveries.length,
        1,
        'the deferred retry should still replay dispatch for the stale critical operation',
      );
      t.equal(
        operation.workflowStep,
        WORKFLOW_STEP.CREATING,
        'the retried owner path should advance the stale operation instead of failing it closed',
      );
      t.not(
        String(operation.status || '').toUpperCase(),
        'FAILED',
        'critical deferred retries should not collapse into terminal timeout before retry execution',
      );
    } finally {
      await coordinator.shutdown();
    }
  });

  test('deferred transition retry reuses the last owner snapshot when ' +
    'operation visibility is still deferred', async (t) => {
    const deferredTimers = [];
    const deliveries = [];
    const operation = createTestOperation({
      operationId: 'op-transition-retry-fallback-snapshot',
      createdAt: Date.now() - 1000,
      updatedAt: Date.now() - 1000,
    });
    let persistCalls = 0;
    const coordinator = createMinimalCoordinator({
      messageRouter: {
        async deliver(target, payload, options) {
          deliveries.push({target, payload, options});
          return {acknowledged: true, status: 'initiated'};
        },
      },
      setTimeoutFn(fn, delayMs) {
        const handle = {fn, delayMs};
        deferredTimers.push(handle);
        return handle;
      },
      clearTimeoutFn() {},
    });
    coordinator.repository.getOperationByIdVisibilityObservation =
      async () => ({
        operation: null,
        deferredOutcome: {
          completionState:
            TRANSITION_RETRY_VISIBILITY_DEFERRED_COMPLETION_STATE,
          retryAfterMs: 25,
        },
        retryAfterMs: 25,
      });
    coordinator.repository.persistOperationUpdate =
      async (nextOperation) => {
        persistCalls += 1;
        if (persistCalls === 1) {
          throw new Error(
            PARTITION_SERVICE_ERROR_MSG.TRANSACTION_ALREADY_ACTIVE,
          );
        }
        operation.workflowStep = nextOperation.workflowStep;
        operation.status = nextOperation.status;
        operation.updatedAt = nextOperation.updatedAt;
        operation.completedAt = nextOperation.completedAt;
        operation.errorMessage = nextOperation.errorMessage;
        operation.replicaId = nextOperation.replicaId;
        operation.stepsHistory = nextOperation.stepsHistory.map(
          (entry) => ({...entry}),
        );
      };
    coordinator.initialize();

    try {
      const firstAttempt = await coordinator.dispatchOperation(operation);

      t.equal(
        firstAttempt?.reason,
        REBALANCER_SKIP_REASON.DEFERRED_RETRY_PENDING,
        'retryable transition contention should defer through the shared retry lane',
      );
      t.equal(
        deferredTimers.length,
        1,
        'the deferred retry should arm one owner-lane timer',
      );

      await deferredTimers[0].fn();

      t.equal(
        deliveries.length,
        1,
        'the deferred retry should still reach dispatch when visibility is only recoverable from the last owner snapshot',
      );
      t.equal(
        operation.workflowStep,
        WORKFLOW_STEP.CREATING,
        'the fallback owner snapshot should let the retry advance the operation',
      );
    } finally {
      await coordinator.shutdown();
    }
  });

  test('deferred transition retry clears stale grace once the retry lane can no ' +
    'longer see the operation', async (t) => {
    const deferredTimers = [];
    const operation = createTestOperation({
      operationId: 'op-transition-retry-clears-stale-grace',
      partitionId: TRANSITION_RETRY_FALLBACK_PARTITION_ID,
      replicaId: TRANSITION_RETRY_FALLBACK_REPLICA_ID,
      createdAt: Date.now() - 1000,
      updatedAt: Date.now() - 1000,
    });
    const coordinator = createMinimalCoordinator({
      setTimeoutFn(fn, delayMs) {
        const handle = {fn, delayMs};
        deferredTimers.push(handle);
        return handle;
      },
      clearTimeoutFn() {},
    });
    coordinator.repository.queryOperationById = async () => operation;
    coordinator.repository.getOperationByIdVisibilityObservation =
      async () => ({
        operation: null,
        deferredOutcome: {
          completionState:
            TRANSITION_RETRY_VISIBILITY_DEFERRED_COMPLETION_STATE,
          retryAfterMs: 25,
        },
        retryAfterMs: 25,
      });
    coordinator.repository.persistOperationUpdate = async () => {
      throw new Error(
        PARTITION_SERVICE_ERROR_MSG.TRANSACTION_ALREADY_ACTIVE,
      );
    };
    coordinator.initialize();

    try {
      const firstAttempt = await coordinator.dispatchOperation(
        operation.operationId,
      );

      t.equal(
        firstAttempt?.reason,
        REBALANCER_SKIP_REASON.DEFERRED_RETRY_PENDING,
        'retryable transition contention should still arm the retry lane',
      );
      t.equal(
        deferredTimers.length,
        1,
        'the deferred retry timer should be scheduled once',
      );
      t.equal(
        coordinator.workflowOwner.hasActiveTransitionRetryGrace(
          operation.operationId,
        ),
        true,
        'the retry lane should start with active timeout grace',
      );

      await deferredTimers[0].fn();

      t.equal(
        coordinator.workflowOwner.hasActiveTransitionRetryGrace(
          operation.operationId,
        ),
        false,
        'retry grace should clear once the retry lane cannot recover the operation',
      );
    } finally {
      await coordinator.shutdown();
    }
  });
}

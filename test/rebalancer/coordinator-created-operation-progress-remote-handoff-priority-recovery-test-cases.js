import {SERVICE_TYPE, WORKFLOW_STEP} from '../../src/constants/index.js';
import {
  OperationType,
  ReplicaStatus,
} from '../../src/rebalancer/replica-status.js';
import {
  OPERATION_WORKFLOW_OUTCOME_VALUES,
} from '../../src/rebalancer/operation-workflow-owner-constants.js';
import {PRIORITY_RECOVERY_COMPLETION_STATE} from
  '../../src/control-plane/priority-recovery-completion.js';
import {
  PRIORITY_RECOVERY_ACTUATION_STATE,
  PRIORITY_RECOVERY_BLOCKING_BOUNDARY,
  PRIORITY_RECOVERY_NEXT_REQUIRED_ACTION,
  PRIORITY_RECOVERY_SEMANTIC_STATE,
  PRIORITY_RECOVERY_WAIT_MODE,
  PRIORITY_RECOVERY_WORKFLOW_PROGRESS_PHASE,
} from '../../src/control-plane/priority-recovery-diagnostics-constants.js';
import {
  PRIORITY_RECOVERY_TARGET_SERVICE_TERMINAL_STATE,
} from '../../src/control-plane/priority-recovery-snapshot-contract.js';
import {
  buildRemotePriorityDispatchPendingOperation,
  buildRemotePriorityDispatchPendingPlanningSnapshot,
  buildRemotePriorityDispatchPendingTimeoutPlanningSnapshot,
  buildRemotePrioritySerialWaitPlanningSnapshot,
  buildRemotePrioritySerialWaitSourcePlanningSnapshot,
  buildRemotePriorityTimeoutOperation,
  buildRemotePriorityTimeoutPlanningSnapshot,
  buildRemotePriorityVisibilityOperation,
  createRemotePriorityVisibilityCoordinator,
  REMOTE_HANDOFF_TIMEOUT_OVERRUN_MS,
  REMOTE_PRIORITY_DISPATCH_PENDING_CAPTURED_AT_MS,
  REMOTE_PRIORITY_DISPATCH_PENDING_OPERATION_ID,
  REMOTE_PRIORITY_DISPATCH_PENDING_PARTITION_ID,
  REMOTE_PRIORITY_DISPATCH_PENDING_TIMEOUT_SUPPORTING_PARTITION_IDS,
  REMOTE_PRIORITY_EMPTY_OBSERVATION_STATE,
  REMOTE_PRIORITY_SERIAL_WAIT_CAPTURED_AT_MS,
  REMOTE_PRIORITY_SERIAL_WAIT_SOURCE_ACTIVE_CREATED_AT_MS,
  REMOTE_PRIORITY_SERIAL_WAIT_SOURCE_ACTIVE_OPERATION_ID,
  REMOTE_PRIORITY_SERIAL_WAIT_SOURCE_ACTIVE_UPDATED_AT_MS,
  REMOTE_PRIORITY_SERIAL_WAIT_SOURCE_NODE_ID,
  REMOTE_PRIORITY_SERIAL_WAIT_SOURCE_OPERATION_ID,
  REMOTE_PRIORITY_SERIAL_WAIT_SOURCE_PARTITION_ID,
  REMOTE_PRIORITY_SERIAL_WAIT_SOURCE_REMOVED_COMPLETED_AT_MS,
  REMOTE_PRIORITY_SERIAL_WAIT_SOURCE_REMOVED_CREATED_AT_MS,
  REMOTE_PRIORITY_SERIAL_WAIT_SOURCE_REMOVED_OPERATION_ID,
  REMOTE_PRIORITY_SERIAL_WAIT_SOURCE_REPLICA_ID,
  REMOTE_PRIORITY_SERIAL_WAIT_SOURCE_TARGET_NODE_ID,
  REMOTE_PRIORITY_TIMEOUT_CAPTURED_AT_MS,
  REMOTE_PRIORITY_TIMEOUT_OPERATION_ID,
  REMOTE_PRIORITY_TIMEOUT_PARTITION_ID,
  REMOTE_PRIORITY_TIMEOUT_SUPPORTING_PARTITION_IDS,
  REMOTE_PRIORITY_VISIBILITY_DEFERRED_SOURCE,
  REMOTE_PRIORITY_VISIBILITY_OPERATION_ID,
  REMOTE_PRIORITY_VISIBILITY_PARTITION_ID,
} from './coordinator-created-operation-progress-remote-handoff-fixture-builders.js';

export function registerCoordinatorCreatedRemoteHandoffPriorityRecoveryTests({
  test,
}) {
  test('workflowOwner priority recovery partition snapshots preserve ' +
    'planning serial-wait witnesses for carrier partitions without local ' +
    'operation rows',
  async (t) => {
    const coordinator = createRemotePriorityVisibilityCoordinator();
    coordinator.initialize();

    coordinator.controlPlaneReadinessService
      .getPriorityRecoveryPlanningSnapshotBestEffort = async () => {
        return buildRemotePrioritySerialWaitPlanningSnapshot();
      };
    coordinator.workflowOwner.repository.getOperationsByEntityAuthoritativeObservation =
      async () => {
        return Object.freeze({
          state: 'present',
          operationCount: 0,
          operations: [],
          deferredOutcome: null,
          retryAfterMs: null,
        });
      };

    try {
      const snapshot =
        await coordinator.workflowOwner
          .getPriorityRecoveryDecisionSnapshotForPartitionOperations(
            REMOTE_PRIORITY_VISIBILITY_PARTITION_ID,
            [],
          );

      t.equal(
        snapshot?.progress?.nextRequiredAction,
        'wait_for_operation_progress',
        'carrier partitions should retain the planning serial-wait next action when the supporting source partition operation is still in flight',
      );
      t.equal(
        snapshot?.progress?.blockingBoundary,
        'workflow_progress',
        'carrier partitions should stay on the workflow-progress boundary instead of reopening follow-up scheduling',
      );
      t.same(
        snapshot?.coordinator?.serialWaitPartitionIds,
        [REMOTE_PRIORITY_SERIAL_WAIT_SOURCE_PARTITION_ID],
        'carrier snapshots should retain the supporting source partition context from planning',
      );
      t.same(
        snapshot?.coordinator?.serialWaitOperationIds,
        [REMOTE_PRIORITY_SERIAL_WAIT_SOURCE_OPERATION_ID],
        'carrier snapshots should retain the supporting source operation context from planning',
      );
    } finally {
      await coordinator.shutdown();
    }
  });

  test('workflowOwner priority recovery source partition snapshots prefer ' +
    'live workflow progress over stale planning serial-wait matches while ' +
    'preserving supporting carrier context',
  async (t) => {
    const coordinator = createRemotePriorityVisibilityCoordinator();
    const originalDateNow = Date.now;
    Date.now = () => REMOTE_PRIORITY_SERIAL_WAIT_CAPTURED_AT_MS;
    coordinator.initialize();

    coordinator.controlPlaneReadinessService
      .getPriorityRecoveryPlanningSnapshotBestEffort = async () => {
        return buildRemotePrioritySerialWaitSourcePlanningSnapshot();
      };
    coordinator.workflowOwner.repository.getOperationsByEntityAuthoritativeObservation =
      async () => {
        return Object.freeze({
          state: 'present',
          operationCount: 2,
          operations: [
            Object.freeze({
              operationId: REMOTE_PRIORITY_SERIAL_WAIT_SOURCE_ACTIVE_OPERATION_ID,
              type: OperationType.REMOVE,
              partitionId: REMOTE_PRIORITY_SERIAL_WAIT_SOURCE_PARTITION_ID,
              entityType: SERVICE_TYPE.PARTITION,
              entityId: REMOTE_PRIORITY_SERIAL_WAIT_SOURCE_PARTITION_ID,
              sourceNodeId: REMOTE_PRIORITY_SERIAL_WAIT_SOURCE_NODE_ID,
              targetNodeId: REMOTE_PRIORITY_SERIAL_WAIT_SOURCE_TARGET_NODE_ID,
              replicaId: REMOTE_PRIORITY_SERIAL_WAIT_SOURCE_REPLICA_ID,
              status: ReplicaStatus.PENDING,
              workflowStep: WORKFLOW_STEP.SENDING,
              createdAt: REMOTE_PRIORITY_SERIAL_WAIT_SOURCE_ACTIVE_CREATED_AT_MS,
              updatedAt: REMOTE_PRIORITY_SERIAL_WAIT_SOURCE_ACTIVE_UPDATED_AT_MS,
              completedAt: null,
            }),
            Object.freeze({
              operationId:
                REMOTE_PRIORITY_SERIAL_WAIT_SOURCE_REMOVED_OPERATION_ID,
              type: OperationType.REPLACE,
              partitionId: REMOTE_PRIORITY_SERIAL_WAIT_SOURCE_PARTITION_ID,
              entityType: SERVICE_TYPE.PARTITION,
              entityId: REMOTE_PRIORITY_SERIAL_WAIT_SOURCE_PARTITION_ID,
              sourceNodeId: REMOTE_PRIORITY_SERIAL_WAIT_SOURCE_NODE_ID,
              targetNodeId: REMOTE_PRIORITY_SERIAL_WAIT_SOURCE_TARGET_NODE_ID,
              replicaId: REMOTE_PRIORITY_SERIAL_WAIT_SOURCE_REPLICA_ID,
              status: ReplicaStatus.REMOVED,
              workflowStep: WORKFLOW_STEP.REMOVED,
              createdAt:
                REMOTE_PRIORITY_SERIAL_WAIT_SOURCE_REMOVED_CREATED_AT_MS,
              updatedAt:
                REMOTE_PRIORITY_SERIAL_WAIT_SOURCE_REMOVED_COMPLETED_AT_MS,
              completedAt:
                REMOTE_PRIORITY_SERIAL_WAIT_SOURCE_REMOVED_COMPLETED_AT_MS,
            }),
          ],
          deferredOutcome: null,
          retryAfterMs: null,
        });
      };

    try {
      const snapshot =
        await coordinator.workflowOwner
          .getPriorityRecoveryDecisionSnapshotForPartitionOperations(
            REMOTE_PRIORITY_SERIAL_WAIT_SOURCE_PARTITION_ID,
            [],
          );

      t.equal(
        snapshot?.semanticState,
        'recovering_in_flight',
        'source partitions should keep the live in-flight workflow state when authoritative operations exist',
      );
      t.equal(
        snapshot?.actuation?.state,
        'dispatched_waiting_progress',
        'source partitions should keep the live workflow-progress actuation state',
      );
      t.equal(
        snapshot?.progress?.nextRequiredAction,
        'wait_for_operation_progress',
        'source partitions should keep waiting on workflow progress instead of falling back to a planning-only needs_operation state',
      );
      t.equal(
        snapshot?.coordinator?.operation?.operationId,
        REMOTE_PRIORITY_SERIAL_WAIT_SOURCE_ACTIVE_OPERATION_ID,
        'source partitions should target the live in-flight authoritative operation context',
      );
      t.same(
        snapshot?.coordinator?.serialWaitPartitionIds,
        ['replica_operations-p1', REMOTE_PRIORITY_VISIBILITY_PARTITION_ID],
        'source partitions should preserve supporting carrier partition context from planning',
      );
      t.same(
        snapshot?.coordinator?.serialWaitOperationIds,
        [
          REMOTE_PRIORITY_SERIAL_WAIT_SOURCE_OPERATION_ID,
          REMOTE_PRIORITY_VISIBILITY_OPERATION_ID,
        ],
        'source partitions should preserve supporting carrier operation context from planning',
      );
    } finally {
      Date.now = originalDateNow;
      await coordinator.shutdown();
    }
  });

  test('workflowOwner priority recovery dispatch-pending partition snapshots ' +
    'reclassify persisted-not-dispatched workflow waits to advance the ' +
    'existing operation',
  async (t) => {
    const coordinator = createRemotePriorityVisibilityCoordinator();
    const originalDateNow = Date.now;
    const dispatchPendingOperation =
      buildRemotePriorityDispatchPendingOperation();
    Date.now = () => REMOTE_PRIORITY_DISPATCH_PENDING_CAPTURED_AT_MS;
    coordinator.initialize();

    coordinator.controlPlaneReadinessService
      .getPriorityRecoveryPlanningSnapshotBestEffort = async () => {
        return buildRemotePriorityDispatchPendingPlanningSnapshot();
      };
    coordinator.workflowOwner.repository.getOperationsByEntityAuthoritativeObservation =
      async () => {
        return Object.freeze({
          state: 'present',
          operationCount: 1,
          operations: [dispatchPendingOperation],
          deferredOutcome: null,
          retryAfterMs: null,
        });
      };

    try {
      const snapshot =
        await coordinator.workflowOwner
          .getPriorityRecoveryDecisionSnapshotForPartitionOperations(
            REMOTE_PRIORITY_DISPATCH_PENDING_PARTITION_ID,
            [dispatchPendingOperation],
          );

      t.equal(
        snapshot?.semanticState,
        'recovering_in_flight',
        'dispatch-pending persisted rows should stay on the in-flight semantic state',
      );
      t.equal(
        snapshot?.actuation?.state,
        'persisted_not_dispatched',
        'dispatch-pending persisted rows should preserve the undispatched actuation state',
      );
      t.equal(
        snapshot?.progress?.nextRequiredAction,
        'advance_existing_operation',
        'dispatch-pending persisted rows should surface owner advancement instead of a generic workflow wait',
      );
      t.equal(
        snapshot?.progress?.blockingBoundary,
        'workflow_progress',
        'dispatch-pending persisted rows should stay on the workflow-progress boundary',
      );
      t.equal(
        snapshot?.progress?.waitMode,
        'event_driven',
        'dispatch-pending persisted rows should keep the event-driven wait mode while the owner advances the operation',
      );
      t.equal(
        snapshot?.progress?.workflowProgressPhaseId,
        'dispatch_pending',
        'dispatch-pending persisted rows should preserve the dispatch-pending workflow phase',
      );
    } finally {
      Date.now = originalDateNow;
      await coordinator.shutdown();
    }
  });

  test('workflowOwner priority recovery dispatch-pending handoff retries use ' +
    'the operation owner rebalancer-handoff outcome',
  async (t) => {
    const coordinator = createRemotePriorityVisibilityCoordinator();
    const originalDateNow = Date.now;
    const dispatchPendingOperation =
      buildRemotePriorityDispatchPendingOperation();
    Date.now = () => REMOTE_PRIORITY_DISPATCH_PENDING_CAPTURED_AT_MS;
    coordinator.initialize();

    coordinator.controlPlaneReadinessService
      .getPriorityRecoveryPlanningSnapshotBestEffort = async () => {
        const planning = buildRemotePriorityDispatchPendingPlanningSnapshot();
        const snapshot =
          planning.priorityRecoveryDecisionSnapshots.snapshots[0];
        return Object.freeze({
          ...planning,
          priorityRecoveryDecisionSnapshots: Object.freeze({
            ...planning.priorityRecoveryDecisionSnapshots,
            snapshots: [
              Object.freeze({
                ...snapshot,
                actuation: Object.freeze({
                  ...snapshot.actuation,
                  state: 'dispatched_waiting_progress',
                }),
              }),
            ],
          }),
        });
      };
    coordinator.workflowOwner.repository.getOperationsByEntityAuthoritativeObservation =
      async () => {
        return Object.freeze({
          state: 'present',
          operationCount: 1,
          operations: [dispatchPendingOperation],
          deferredOutcome: null,
          retryAfterMs: null,
        });
      };
    coordinator.workflowOwner.createdOperationHandoffRetryTimerByOperationId.set(
      REMOTE_PRIORITY_DISPATCH_PENDING_OPERATION_ID,
      Object.freeze({}),
    );
    coordinator.workflowOwner.createdOperationHandoffRetryDeadlineMsByOperationId
      .set(
        REMOTE_PRIORITY_DISPATCH_PENDING_OPERATION_ID,
        REMOTE_PRIORITY_DISPATCH_PENDING_CAPTURED_AT_MS +
          REMOTE_HANDOFF_TIMEOUT_OVERRUN_MS,
      );

    try {
      const snapshot =
        await coordinator.workflowOwner
          .getPriorityRecoveryDecisionSnapshotForPartitionOperations(
            REMOTE_PRIORITY_DISPATCH_PENDING_PARTITION_ID,
            [dispatchPendingOperation],
          );

      t.equal(
        snapshot?.semanticState,
        'recovering_in_flight',
        'scheduled handoff retries remain an in-flight workflow state',
      );
      t.equal(
        snapshot?.progress?.nextAction,
        'retry',
        'scheduled handoff retries surface retry as the owner contract action',
      );
      t.equal(
        snapshot?.progress?.nextRequiredAction,
        'wait_for_operation_progress',
        'scheduled handoff retries wait for operation progress re-entry',
      );
      t.equal(
        snapshot?.progress?.blockingBoundary,
        'rebalancer_handoff',
        'scheduled handoff retries stay on the rebalancer handoff boundary',
      );
      t.equal(
        snapshot?.progress?.waitMode,
        'retry_scheduled',
        'scheduled handoff retries expose the retry-scheduled wait mode',
      );
      t.equal(
        snapshot?.operationOwnerObservation?.outcome,
        'wait_for_rebalancer_handoff_retry',
        'snapshot carries the canonical operation-owner handoff outcome',
      );
    } finally {
      Date.now = originalDateNow;
      await coordinator.shutdown();
    }
  });

  test('workflowOwner priority recovery target-progress handoff retries use ' +
    'the operation owner rebalancer-handoff outcome',
  async (t) => {
    const coordinator = createRemotePriorityVisibilityCoordinator();
    const originalDateNow = Date.now;
    const deliveries = [];
    const targetProgressOperation = Object.freeze({
      ...buildRemotePriorityTimeoutOperation(
        REMOTE_PRIORITY_TIMEOUT_CAPTURED_AT_MS,
      ),
      status: ReplicaStatus.CREATING,
      targetServiceTerminalState:
        PRIORITY_RECOVERY_TARGET_SERVICE_TERMINAL_STATE.TERMINAL,
    });
    Date.now = () => REMOTE_PRIORITY_TIMEOUT_CAPTURED_AT_MS;
    coordinator.initialize();
    coordinator.messageRouter.deliver = async (target, payload, options) => {
      deliveries.push({target, payload, options});
      return {acknowledged: true};
    };

    coordinator.controlPlaneReadinessService
      .getPriorityRecoveryPlanningSnapshotBestEffort = async () => {
        const planning = buildRemotePriorityTimeoutPlanningSnapshot();
        const snapshot =
          planning.priorityRecoveryDecisionSnapshots.snapshots[0];
        return Object.freeze({
          ...planning,
          priorityRecoveryDecisionSnapshots: Object.freeze({
            ...planning.priorityRecoveryDecisionSnapshots,
            snapshots: [
              Object.freeze({
                ...snapshot,
                blockerReasons: [],
                semanticState:
                  PRIORITY_RECOVERY_SEMANTIC_STATE.RECOVERING_IN_FLIGHT,
                actuation: Object.freeze({
                  ...snapshot.actuation,
                  state:
                    PRIORITY_RECOVERY_ACTUATION_STATE
                      .DISPATCHED_WAITING_PROGRESS,
                  workflowProgressPhaseId:
                    PRIORITY_RECOVERY_WORKFLOW_PROGRESS_PHASE.TARGET_CREATION,
                }),
                progress: Object.freeze({
                  ...snapshot.progress,
                  contractState: 'pending',
                  nextAction: 'wait',
                  nextRequiredAction:
                    PRIORITY_RECOVERY_NEXT_REQUIRED_ACTION
                      .ADVANCE_EXISTING_OPERATION,
                  blockingBoundary:
                    PRIORITY_RECOVERY_BLOCKING_BOUNDARY.WORKFLOW_PROGRESS,
                  waitMode: PRIORITY_RECOVERY_WAIT_MODE.EVENT_DRIVEN,
                  workflowProgressPhaseId:
                    PRIORITY_RECOVERY_WORKFLOW_PROGRESS_PHASE.TARGET_CREATION,
                }),
              }),
            ],
          }),
        });
      };
    coordinator.workflowOwner.repository.getOperationsByEntityAuthoritativeObservation =
      async () => {
        return Object.freeze({
          state: 'present',
          operationCount: 1,
          operations: [targetProgressOperation],
          deferredOutcome: null,
          retryAfterMs: null,
        });
      };
    coordinator.workflowOwner.createdOperationHandoffRetryTimerByOperationId.set(
      REMOTE_PRIORITY_TIMEOUT_OPERATION_ID,
      Object.freeze({}),
    );
    coordinator.workflowOwner.createdOperationHandoffRetryDeadlineMsByOperationId
      .set(
        REMOTE_PRIORITY_TIMEOUT_OPERATION_ID,
        REMOTE_PRIORITY_TIMEOUT_CAPTURED_AT_MS +
          REMOTE_HANDOFF_TIMEOUT_OVERRUN_MS,
      );

    try {
      const snapshot =
        await coordinator.workflowOwner
          .getPriorityRecoveryDecisionSnapshotForPartitionOperations(
            REMOTE_PRIORITY_TIMEOUT_PARTITION_ID,
            [targetProgressOperation],
          );

      t.equal(
        snapshot?.progress?.blockingBoundary,
        PRIORITY_RECOVERY_BLOCKING_BOUNDARY.REBALANCER_HANDOFF,
        'active target-progress handoff retries should use the rebalancer-handoff boundary',
      );
      t.equal(
        snapshot?.progress?.waitMode,
        PRIORITY_RECOVERY_WAIT_MODE.RETRY_SCHEDULED,
        'active target-progress handoff retries should expose retry-scheduled wait mode',
      );
      t.equal(
        snapshot?.operationOwnerObservation?.outcome,
        OPERATION_WORKFLOW_OUTCOME_VALUES.WAIT_FOR_REBALANCER_HANDOFF_RETRY,
        'target-progress snapshots should carry the canonical operation-owner handoff outcome',
      );
      t.equal(
        snapshot?.progress?.progressContract?.representativeRerunRoute,
        'blocked_model_route',
        'target-progress handoff retries should block representative rerun',
      );
      t.same(
        deliveries,
        [],
        'active target-progress handoff retries should not duplicate remote owner wakes',
      );
    } finally {
      Date.now = originalDateNow;
      await coordinator.shutdown();
    }
  });

  test('workflowOwner priority recovery dispatch-pending stale PENDING rows ' +
    'stay on owner advancement instead of workflow-timeout reconcile',
  async (t) => {
    const coordinator = createRemotePriorityVisibilityCoordinator();
    const originalDateNow = Date.now;
    Date.now = () => REMOTE_PRIORITY_DISPATCH_PENDING_CAPTURED_AT_MS;
    coordinator.initialize();

    coordinator.controlPlaneReadinessService
      .getPriorityRecoveryPlanningSnapshotBestEffort = async () => {
        return buildRemotePriorityDispatchPendingTimeoutPlanningSnapshot();
      };

    const pendingTimeoutMs = coordinator.getTimeoutForStep(
      WORKFLOW_STEP.PENDING,
      buildRemotePriorityDispatchPendingOperation(
        REMOTE_PRIORITY_DISPATCH_PENDING_CAPTURED_AT_MS,
      ),
    );
    const staleProgressAtMs =
      REMOTE_PRIORITY_DISPATCH_PENDING_CAPTURED_AT_MS -
      pendingTimeoutMs -
      REMOTE_HANDOFF_TIMEOUT_OVERRUN_MS;
    const staleDispatchPendingOperation =
      buildRemotePriorityDispatchPendingOperation(staleProgressAtMs);

    coordinator.workflowOwner.repository.getOperationsByEntityAuthoritativeObservation =
      async () => {
        return Object.freeze({
          state: 'present',
          operationCount: 1,
          operations: [staleDispatchPendingOperation],
          deferredOutcome: null,
          retryAfterMs: null,
        });
      };

    try {
      const snapshot =
        await coordinator.workflowOwner
          .getPriorityRecoveryDecisionSnapshotForPartitionOperations(
            REMOTE_PRIORITY_DISPATCH_PENDING_PARTITION_ID,
            [staleDispatchPendingOperation],
          );

      t.equal(
        snapshot?.semanticState,
        'recovering_in_flight',
        'stale dispatch-pending PENDING rows should normalize back to the in-flight semantic state',
      );
      t.same(
        snapshot?.blockerReasons,
        [],
        'stale dispatch-pending PENDING rows should clear stale timeout blocker reasons after reclassification',
      );
      t.equal(
        snapshot?.actuation?.state,
        'persisted_not_dispatched',
        'stale dispatch-pending PENDING rows should preserve persisted-not-dispatched actuation',
      );
      t.equal(
        snapshot?.progress?.contractState,
        'pending',
        'stale dispatch-pending PENDING rows should remain in the pending owner contract state',
      );
      t.equal(
        snapshot?.progress?.nextAction,
        'wait',
        'stale dispatch-pending PENDING rows should wait for owner advancement instead of scheduling timeout retry',
      );
      t.equal(
        snapshot?.progress?.nextRequiredAction,
        'advance_existing_operation',
        'stale dispatch-pending PENDING rows should surface owner advancement instead of stale-progress reconcile',
      );
      t.equal(
        snapshot?.progress?.blockingBoundary,
        'workflow_progress',
        'stale dispatch-pending PENDING rows should stay on the workflow-progress boundary',
      );
      t.equal(
        snapshot?.progress?.waitMode,
        'event_driven',
        'stale dispatch-pending PENDING rows should keep the event-driven owner wait mode',
      );
      t.equal(
        snapshot?.progress?.workflowProgressPhaseId,
        'dispatch_pending',
        'stale dispatch-pending PENDING rows should preserve the dispatch-pending workflow phase',
      );
      t.same(
        snapshot?.coordinator?.serialWaitPartitionIds,
        REMOTE_PRIORITY_DISPATCH_PENDING_TIMEOUT_SUPPORTING_PARTITION_IDS,
        'stale dispatch-pending timeout witnesses should retain the supporting timeout partition context from planning',
      );
    } finally {
      Date.now = originalDateNow;
      await coordinator.shutdown();
    }
  });

  test('workflowOwner priority recovery partition snapshots recover ' +
    'authoritative remote operations for observer-only nodes',
  async (t) => {
    const coordinator = createRemotePriorityVisibilityCoordinator();
    coordinator.initialize();

    const authoritativeObservationCalls = [];
    coordinator.workflowOwner.repository.getOperationsByEntityAuthoritativeObservation =
      async (entityType, entityId) => {
        authoritativeObservationCalls.push({entityType, entityId});
        return Object.freeze({
          state: 'present',
          operationCount: 1,
          operations: [buildRemotePriorityVisibilityOperation()],
          deferredOutcome: null,
          retryAfterMs: null,
        });
      };

    try {
      const snapshot =
        await coordinator.workflowOwner
          .getPriorityRecoveryDecisionSnapshotForPartitionOperations(
            REMOTE_PRIORITY_VISIBILITY_PARTITION_ID,
            [],
          );

      t.same(
        authoritativeObservationCalls,
        [{
          entityType: SERVICE_TYPE.PARTITION,
          entityId: REMOTE_PRIORITY_VISIBILITY_PARTITION_ID,
        }],
        'observer-only partition snapshot reads should escalate to the authoritative entity visibility path',
      );
      t.match(snapshot, {
        partitionId: REMOTE_PRIORITY_VISIBILITY_PARTITION_ID,
        operationId: REMOTE_PRIORITY_VISIBILITY_OPERATION_ID,
        coordinator: {
          operationIds: [REMOTE_PRIORITY_VISIBILITY_OPERATION_ID],
        },
      });
    } finally {
      await coordinator.shutdown();
    }
  });

  test('workflowOwner priority recovery partition snapshots preserve deferred ' +
    'authoritative-read state when authoritative observation returns the ' +
    'remote operation plus a deferred outcome',
  async (t) => {
    const coordinator = createRemotePriorityVisibilityCoordinator();
    coordinator.initialize();

    coordinator.workflowOwner.repository.getOperationsByEntityAuthoritativeObservation =
      async () => {
        return Object.freeze({
          state: 'deferred',
          operationCount: 1,
          operations: [buildRemotePriorityVisibilityOperation()],
          deferredOutcome: Object.freeze({
            completionState:
              PRIORITY_RECOVERY_COMPLETION_STATE
                .AUTHORITATIVE_OPERATION_READ_DEFERRED,
            retryAfterMs: 250,
            source: REMOTE_PRIORITY_VISIBILITY_DEFERRED_SOURCE,
          }),
          retryAfterMs: 250,
        });
      };

    try {
      const snapshot =
        await coordinator.workflowOwner
          .getPriorityRecoveryDecisionSnapshotForPartitionOperations(
            REMOTE_PRIORITY_VISIBILITY_PARTITION_ID,
            [],
          );

      t.equal(
        snapshot?.operationId,
        REMOTE_PRIORITY_VISIBILITY_OPERATION_ID,
        'the planning-snapshot match should still retain the remote operation identity',
      );
      t.equal(
        snapshot?.completion?.state,
        PRIORITY_RECOVERY_COMPLETION_STATE
          .AUTHORITATIVE_OPERATION_READ_DEFERRED,
        'the workflow-owner fallback should preserve the deferred authoritative-read completion state',
      );
      t.equal(
        snapshot?.progress?.nextRequiredAction,
        'observe_authoritative_visibility',
        'deferred authoritative reads should keep the partition on the canonical authoritative-visibility action',
      );
    } finally {
      await coordinator.shutdown();
    }
  });

  test('workflowOwner priority recovery planning-only partition snapshots ' +
    'preserve deferred authoritative-read state when authoritative ' +
    'observation returns zero operations plus a deferred outcome',
  async (t) => {
    const coordinator = createRemotePriorityVisibilityCoordinator();
    coordinator.initialize();

    coordinator.controlPlaneReadinessService
      .getPriorityRecoveryPlanningSnapshotBestEffort = async () => {
        return buildRemotePrioritySerialWaitPlanningSnapshot();
      };
    coordinator.workflowOwner.repository.getOperationsByEntityAuthoritativeObservation =
      async () => {
        return Object.freeze({
          state: 'deferred',
          operationCount: 0,
          operations: [],
          deferredOutcome: Object.freeze({
            completionState:
              PRIORITY_RECOVERY_COMPLETION_STATE
                .AUTHORITATIVE_OPERATION_READ_DEFERRED,
            retryAfterMs: 250,
            source: REMOTE_PRIORITY_VISIBILITY_DEFERRED_SOURCE,
          }),
          retryAfterMs: 250,
        });
      };

    try {
      const snapshot =
        await coordinator.workflowOwner
          .getPriorityRecoveryDecisionSnapshotForPartitionOperations(
            REMOTE_PRIORITY_VISIBILITY_PARTITION_ID,
            [],
          );

      t.equal(
        snapshot?.completion?.state,
        PRIORITY_RECOVERY_COMPLETION_STATE
          .AUTHORITATIVE_OPERATION_READ_DEFERRED,
        'planning-only snapshot reuse should not mask deferred authoritative-read completion state',
      );
      t.equal(
        snapshot?.progress?.nextRequiredAction,
        'observe_authoritative_visibility',
        'planning-only deferred reads should keep the partition on the canonical authoritative-visibility action',
      );
    } finally {
      await coordinator.shutdown();
    }
  });

  test('workflowOwner priority recovery partition snapshots keep deferred ' +
    'authoritative-read handling when a stale cache-visible operation would ' +
    'otherwise fall through to workflow-timeout reconcile',
  async (t) => {
    const coordinator = createRemotePriorityVisibilityCoordinator();
    const originalDateNow = Date.now;
    const authoritativeObservationCalls = [];
    Date.now = () => REMOTE_PRIORITY_TIMEOUT_CAPTURED_AT_MS;
    coordinator.initialize();

    coordinator.controlPlaneReadinessService
      .getPriorityRecoveryPlanningSnapshotBestEffort = async () => {
        return buildRemotePriorityTimeoutPlanningSnapshot();
      };

    const creatingTimeoutMs = coordinator.getTimeoutForStep(
      WORKFLOW_STEP.CREATING,
      buildRemotePriorityTimeoutOperation(REMOTE_PRIORITY_TIMEOUT_CAPTURED_AT_MS),
    );
    const staleStartedAtMs =
      REMOTE_PRIORITY_TIMEOUT_CAPTURED_AT_MS -
      creatingTimeoutMs -
      REMOTE_HANDOFF_TIMEOUT_OVERRUN_MS;
    const staleCacheVisibleOperation =
      buildRemotePriorityTimeoutOperation(staleStartedAtMs);

    coordinator.workflowOwner.repository.getOperationsByEntityAuthoritativeObservation =
      async (entityType, entityId) => {
        authoritativeObservationCalls.push({entityType, entityId});
        return Object.freeze({
          state: 'deferred',
          operationCount: 1,
          operations: [staleCacheVisibleOperation],
          deferredOutcome: Object.freeze({
            completionState:
              PRIORITY_RECOVERY_COMPLETION_STATE
                .AUTHORITATIVE_OPERATION_READ_DEFERRED,
            retryAfterMs: 250,
            source: REMOTE_PRIORITY_VISIBILITY_DEFERRED_SOURCE,
          }),
          retryAfterMs: 250,
        });
      };

    try {
      const snapshot =
        await coordinator.workflowOwner
          .getPriorityRecoveryDecisionSnapshotForPartitionOperations(
            REMOTE_PRIORITY_TIMEOUT_PARTITION_ID,
            [staleCacheVisibleOperation],
          );

      t.same(
        authoritativeObservationCalls,
        [{
          entityType: SERVICE_TYPE.PARTITION,
          entityId: REMOTE_PRIORITY_TIMEOUT_PARTITION_ID,
        }],
        'cache-visible inputs should still consult the authoritative entity visibility path',
      );
      t.equal(
        snapshot?.completion?.state,
        PRIORITY_RECOVERY_COMPLETION_STATE
          .AUTHORITATIVE_OPERATION_READ_DEFERRED,
        'deferred authoritative reads should override stale cache-visible timeout classification',
      );
      t.equal(
        snapshot?.progress?.nextRequiredAction,
        'observe_authoritative_visibility',
        'stale cache-visible operations should stay on the canonical authoritative-visibility action while the authoritative read is deferred',
      );
      t.equal(
        snapshot?.progress?.blockingBoundary,
        'authoritative_visibility',
        'deferred authoritative reads should stay on the visibility boundary instead of reopening workflow-timeout reconcile',
      );
      t.same(
        snapshot?.coordinator?.serialWaitPartitionIds,
        REMOTE_PRIORITY_TIMEOUT_SUPPORTING_PARTITION_IDS,
        'the stale timeout witness should retain the supporting partition context from planning',
      );
    } finally {
      Date.now = originalDateNow;
      await coordinator.shutdown();
    }
  });

  test('workflowOwner priority recovery partition snapshots let a resolved ' +
    'authoritative empty observation displace stale cache-visible timeout ' +
    'inputs',
  async (t) => {
    const coordinator = createRemotePriorityVisibilityCoordinator();
    const originalDateNow = Date.now;
    const authoritativeObservationCalls = [];
    Date.now = () => REMOTE_PRIORITY_TIMEOUT_CAPTURED_AT_MS;
    coordinator.initialize();

    coordinator.controlPlaneReadinessService
      .getPriorityRecoveryPlanningSnapshotBestEffort = async () => {
        return buildRemotePriorityTimeoutPlanningSnapshot();
      };

    const creatingTimeoutMs = coordinator.getTimeoutForStep(
      WORKFLOW_STEP.CREATING,
      buildRemotePriorityTimeoutOperation(REMOTE_PRIORITY_TIMEOUT_CAPTURED_AT_MS),
    );
    const staleStartedAtMs =
      REMOTE_PRIORITY_TIMEOUT_CAPTURED_AT_MS -
      creatingTimeoutMs -
      REMOTE_HANDOFF_TIMEOUT_OVERRUN_MS;
    const staleCacheVisibleOperation =
      buildRemotePriorityTimeoutOperation(staleStartedAtMs);

    coordinator.workflowOwner.repository.getOperationsByEntityAuthoritativeObservation =
      async (entityType, entityId) => {
        authoritativeObservationCalls.push({entityType, entityId});
        return Object.freeze({
          state: REMOTE_PRIORITY_EMPTY_OBSERVATION_STATE,
          operationCount: 0,
          operations: [],
          deferredOutcome: null,
          retryAfterMs: null,
        });
      };

    try {
      const snapshot =
        await coordinator.workflowOwner
          .getPriorityRecoveryDecisionSnapshotForPartitionOperations(
            REMOTE_PRIORITY_TIMEOUT_PARTITION_ID,
            [staleCacheVisibleOperation],
          );

      t.same(
        authoritativeObservationCalls,
        [{
          entityType: SERVICE_TYPE.PARTITION,
          entityId: REMOTE_PRIORITY_TIMEOUT_PARTITION_ID,
        }],
        'cache-visible timeout inputs should still consult the authoritative entity visibility path',
      );
      t.equal(
        snapshot?.operationId,
        null,
        'a resolved authoritative empty should clear the stale operation identity from the partition snapshot',
      );
      t.same(
        snapshot?.coordinator?.operationIds,
        [],
        'a resolved authoritative empty should remove stale operation contexts from the coordinator contract',
      );
      t.ok(
        snapshot?.progress?.nextRequiredAction !==
          'reconcile_stale_operation_progress' &&
          snapshot?.progress?.nextRequiredAction !==
            'wait_for_operation_progress',
        'a resolved authoritative empty should stop stale cache-visible operations from driving timeout or workflow-progress follow-up actions',
      );
      t.ok(
        snapshot?.progress?.blockingBoundary !== 'workflow_timeout' &&
          snapshot?.progress?.blockingBoundary !== 'workflow_progress',
        'a resolved authoritative empty should move the partition off the stale operation blocker boundaries',
      );
    } finally {
      Date.now = originalDateNow;
      await coordinator.shutdown();
    }
  });
}

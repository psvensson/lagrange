/**
 * Owner contract:
 * Owner: OperationWorkflowOwner owns replica-operation workflow lifecycle progress.
 * Inputs: operation repository state, executor outcomes, readiness, replica status.
 * Canonical output: one workflow owner class with canonical transition methods.
 * Prohibited fallbacks: callers must not import segment classes to bypass this surface.
 * Primary tests: test/rebalancer/replace-replica-workflow.test.js.
 */
import {OperationWorkflowRecoveryReconcile} from
  './operation-workflow-recovery-reconcile.js';
import {createOperationWorkflowOwnerAdapter} from
  './operation-workflow-owner-adapter.js';
import {createOperationProgressStore} from './operation-progress-store.js';
import {
  PRIORITY_RECOVERY_ACTUATION_STATE,
  PRIORITY_RECOVERY_BLOCKING_BOUNDARY,
  PRIORITY_RECOVERY_NEXT_REQUIRED_ACTION,
  PRIORITY_RECOVERY_PROGRESS_OWNER,
  PRIORITY_RECOVERY_WAIT_MODE,
  PRIORITY_RECOVERY_WORKFLOW_PROGRESS_PHASE,
} from '../control-plane/priority-recovery-diagnostics-constants.js';
import {
  normalizePriorityRecoveryDispatchPendingDecisionSnapshot,
} from '../control-plane/priority-recovery-snapshot.js';
import {
  OPERATION_WORKFLOW_OWNER_PORT_CONTEXT_CAUSE,
  OPERATION_WORKFLOW_OWNER_PORT_CONTEXT_MODE,
  createOperationWorkflowOwnerPorts,
} from './operation-workflow-owner-ports.js';
import {
  OPERATION_WORKFLOW_EFFECT_COMMAND_VALUES,
  OPERATION_WORKFLOW_OUTCOME_VALUES,
} from './operation-workflow-owner-constants.js';
import {
  OPERATION_WORKFLOW_OWNER_SEGMENT_7_STAGE_SHARED,
} from './operation-workflow-recovery-reconcile-shared.js';
import {
  applyOperationWorkflowOwnerTargetProgressReentryAction,
  isOperationWorkflowOwnerDispatchPendingTargetProgressReady,
  resolveOperationWorkflowOwnerTargetProgressReentryAction,
  shouldNormalizeOperationWorkflowOwnerTargetProgressHandoffRetry,
} from './operation-workflow-owner-priority-recovery-reentry.js';

const OPERATION_WORKFLOW_OWNER_ADAPTER_DEFAULT_CONTEXT = Object.freeze({});
const OPERATION_WORKFLOW_OWNER_EMPTY_TEXT = '';
const OPERATION_WORKFLOW_OWNER_LOCAL_INITIALIZATION_RETRY_BOUNDARY =
  'coordinator_created_local_initialization';
const OPERATION_WORKFLOW_OWNER_LOCAL_INITIALIZATION_RETRY_ERROR =
  'control_plane_pressure_degraded while local workflow owner initialization is pending';
const OPERATION_WORKFLOW_OWNER_NO_OPERATION = null;
const OPERATION_WORKFLOW_OWNER_NO_OPERATION_ID = null;
const OPERATION_WORKFLOW_OWNER_OBJECT_REFERENCE = Object.freeze({});
const {
  OBSERVED_PROGRESS_OPERATION_ROUTE_ACTION:
    OPERATION_WORKFLOW_OWNER_OBSERVED_PROGRESS_ROUTE_ACTION,
} = OPERATION_WORKFLOW_OWNER_SEGMENT_7_STAGE_SHARED;
const OPERATION_WORKFLOW_OWNER_PRIORITY_RECOVERY_REENTRY_OPTION =
  Object.freeze({
    ALLOW_OWNER_LANE_RETRY: 'allowOwnerLaneRetry',
    EXECUTE_OWNER_OBSERVATION_EFFECT: 'executeOwnerObservationEffect',
  });
const OPERATION_WORKFLOW_OWNER_DISPATCH_PENDING_REENTRY_STATE =
  Object.freeze({
    OPERATION_UNAVAILABLE: 'operation_unavailable',
    NOT_OPERATION_WORKFLOW_OWNER: 'not_operation_workflow_owner',
    NOT_DISPATCH_PENDING: 'not_dispatch_pending',
    REBALANCER_HANDOFF_RETRY_ACTIVE: 'rebalancer_handoff_retry_active',
    REBALANCER_HANDOFF_RETRY_SNAPSHOT: 'rebalancer_handoff_retry_snapshot',
    PERSISTED_NOT_DISPATCHED: 'persisted_not_dispatched',
    EVENT_DRIVEN_ADVANCE: 'event_driven_advance',
    NOT_REENTERABLE: 'not_reenterable',
  });

const OPERATION_WORKFLOW_OWNER_DISPATCH_PENDING_REENTRY_CONTEXT_STATE =
  Object.freeze({
    REBALANCER_HANDOFF_RETRY_ACTIVE: 'rebalancer_handoff_retry_active',
    TIMEOUT_RECONCILE_DUE: 'timeout_reconcile_due',
    OWNER_RECONCILE: 'owner_reconcile',
  });

const OPERATION_WORKFLOW_OWNER_DISPATCH_PENDING_REENTRY_ALLOWED_STATES =
  Object.freeze(new Set([
    OPERATION_WORKFLOW_OWNER_DISPATCH_PENDING_REENTRY_STATE
      .PERSISTED_NOT_DISPATCHED,
    OPERATION_WORKFLOW_OWNER_DISPATCH_PENDING_REENTRY_STATE
      .EVENT_DRIVEN_ADVANCE,
    OPERATION_WORKFLOW_OWNER_DISPATCH_PENDING_REENTRY_STATE
      .REBALANCER_HANDOFF_RETRY_ACTIVE,
    OPERATION_WORKFLOW_OWNER_DISPATCH_PENDING_REENTRY_STATE
      .REBALANCER_HANDOFF_RETRY_SNAPSHOT,
  ]));

function shouldReturnDeferredDispatchOwnerProgressResult(result) {
  return (
    result?.applied !== true &&
    result?.outcome?.outcome ===
      OPERATION_WORKFLOW_OUTCOME_VALUES.DISPATCH_LOCAL_OWNER &&
    result?.command?.effectCommand ===
      OPERATION_WORKFLOW_EFFECT_COMMAND_VALUES.DISPATCH_LOCAL_OWNER_COMMAND
  );
}

const OPERATION_WORKFLOW_OWNER_DISPATCH_PENDING_ACTUATION_STATES =
  Object.freeze(new Set([
    PRIORITY_RECOVERY_ACTUATION_STATE.PERSISTED_NOT_DISPATCHED,
    PRIORITY_RECOVERY_ACTUATION_STATE.DISPATCHED_WAITING_PROGRESS,
  ]));

const OPERATION_WORKFLOW_OWNER_DISPATCH_PENDING_REENTRY_TABLE =
  Object.freeze([
    Object.freeze({
      state:
        OPERATION_WORKFLOW_OWNER_DISPATCH_PENDING_REENTRY_STATE
          .OPERATION_UNAVAILABLE,
      matches: (evidence) => evidence.operationAvailable !== true,
    }),
    Object.freeze({
      state:
        OPERATION_WORKFLOW_OWNER_DISPATCH_PENDING_REENTRY_STATE
          .NOT_OPERATION_WORKFLOW_OWNER,
      matches: (evidence) => evidence.operationWorkflowOwner !== true,
    }),
    Object.freeze({
      state:
        OPERATION_WORKFLOW_OWNER_DISPATCH_PENDING_REENTRY_STATE
          .NOT_DISPATCH_PENDING,
      matches: (evidence) => evidence.dispatchPending !== true,
    }),
    Object.freeze({
      state:
        OPERATION_WORKFLOW_OWNER_DISPATCH_PENDING_REENTRY_STATE
          .NOT_REENTERABLE,
      matches: (evidence) =>
        evidence.dispatchPendingTargetProgressReady === true,
    }),
    Object.freeze({
      state:
        OPERATION_WORKFLOW_OWNER_DISPATCH_PENDING_REENTRY_STATE
          .REBALANCER_HANDOFF_RETRY_ACTIVE,
      matches: (evidence) => evidence.rebalancerHandoffRetryActive === true,
    }),
    Object.freeze({
      state:
        OPERATION_WORKFLOW_OWNER_DISPATCH_PENDING_REENTRY_STATE
          .REBALANCER_HANDOFF_RETRY_SNAPSHOT,
      matches: (evidence) => evidence.rebalancerHandoffRetrySnapshot === true,
    }),
    Object.freeze({
      state:
        OPERATION_WORKFLOW_OWNER_DISPATCH_PENDING_REENTRY_STATE
          .PERSISTED_NOT_DISPATCHED,
      matches: (evidence) => evidence.persistedNotDispatched === true,
    }),
    Object.freeze({
      state:
        OPERATION_WORKFLOW_OWNER_DISPATCH_PENDING_REENTRY_STATE
          .EVENT_DRIVEN_ADVANCE,
      matches: (evidence) => evidence.eventDrivenAdvance === true,
    }),
    Object.freeze({
      state:
        OPERATION_WORKFLOW_OWNER_DISPATCH_PENDING_REENTRY_STATE
          .NOT_REENTERABLE,
      matches: () => true,
    }),
  ]);

const OPERATION_WORKFLOW_OWNER_DISPATCH_PENDING_REENTRY_CONTEXT_TABLE =
  Object.freeze([
    Object.freeze({
      state:
        OPERATION_WORKFLOW_OWNER_DISPATCH_PENDING_REENTRY_CONTEXT_STATE
          .REBALANCER_HANDOFF_RETRY_ACTIVE,
      matches: (evidence) => evidence.rebalancerHandoffRetryActive === true,
    }),
    Object.freeze({
      state:
        OPERATION_WORKFLOW_OWNER_DISPATCH_PENDING_REENTRY_CONTEXT_STATE
          .TIMEOUT_RECONCILE_DUE,
      matches: (evidence) =>
        evidence.timeoutReconcileDue === true ||
        evidence.timeoutProgressWait === true,
    }),
    Object.freeze({
      state:
        OPERATION_WORKFLOW_OWNER_DISPATCH_PENDING_REENTRY_CONTEXT_STATE
          .OWNER_RECONCILE,
      matches: () => true,
    }),
  ]);

function buildOperationWorkflowOwnerDispatchPendingReentryEvidence(
  snapshot,
  operation,
  rebalancerHandoffRetryActive,
) {
  const targetVisibilityState =
    snapshot?.coordinator?.operation?.targetVisibilityState ||
    operation?.targetVisibilityState ||
    OPERATION_WORKFLOW_OWNER_EMPTY_TEXT;
  const eventDrivenWorkflowProgressBoundary =
    snapshot?.progress?.blockingBoundary ===
      PRIORITY_RECOVERY_BLOCKING_BOUNDARY.WORKFLOW_PROGRESS &&
    snapshot?.progress?.waitMode ===
      PRIORITY_RECOVERY_WAIT_MODE.EVENT_DRIVEN;
  return Object.freeze({
    operationAvailable: Boolean(operation),
    operationWorkflowOwner:
      snapshot?.actuation?.owner ===
        PRIORITY_RECOVERY_PROGRESS_OWNER.OPERATION_WORKFLOW_OWNER &&
      snapshot?.progress?.currentOwner ===
        PRIORITY_RECOVERY_PROGRESS_OWNER.OPERATION_WORKFLOW_OWNER,
    dispatchPending:
      OPERATION_WORKFLOW_OWNER_DISPATCH_PENDING_ACTUATION_STATES.has(
        snapshot?.actuation?.state,
      ) &&
      snapshot?.actuation?.workflowProgressPhaseId ===
        PRIORITY_RECOVERY_WORKFLOW_PROGRESS_PHASE.DISPATCH_PENDING &&
      snapshot?.progress?.workflowProgressPhaseId ===
        PRIORITY_RECOVERY_WORKFLOW_PROGRESS_PHASE.DISPATCH_PENDING,
    dispatchPendingTargetProgressReady:
      isOperationWorkflowOwnerDispatchPendingTargetProgressReady(
        snapshot,
        targetVisibilityState,
      ),
    persistedNotDispatched:
      snapshot?.actuation?.state ===
        PRIORITY_RECOVERY_ACTUATION_STATE.PERSISTED_NOT_DISPATCHED,
    rebalancerHandoffRetryActive,
    rebalancerHandoffRetrySnapshot:
      isOperationWorkflowOwnerDispatchPendingHandoffRetrySnapshot(snapshot),
    eventDrivenAdvance:
      snapshot?.progress?.nextRequiredAction ===
        PRIORITY_RECOVERY_NEXT_REQUIRED_ACTION.ADVANCE_EXISTING_OPERATION &&
      eventDrivenWorkflowProgressBoundary === true,
  });
}

function resolveOperationWorkflowOwnerDispatchPendingReentryState(evidence) {
  return (
    OPERATION_WORKFLOW_OWNER_DISPATCH_PENDING_REENTRY_TABLE.find((entry) =>
      entry.matches(evidence),
    )?.state ||
    OPERATION_WORKFLOW_OWNER_DISPATCH_PENDING_REENTRY_STATE
      .OPERATION_UNAVAILABLE
  );
}

function isOperationWorkflowOwnerSnapshotCandidate(value) {
  return Boolean(value) &&
    typeof value === typeof OPERATION_WORKFLOW_OWNER_OBJECT_REFERENCE &&
    !Array.isArray(value);
}

function normalizeOperationWorkflowOwnerSnapshotOperationId(operation) {
  const operationId = String(
    operation?.operationId || OPERATION_WORKFLOW_OWNER_EMPTY_TEXT,
  ).trim();
  return operationId.length > OPERATION_WORKFLOW_OWNER_EMPTY_TEXT.length ?
    operationId :
    OPERATION_WORKFLOW_OWNER_NO_OPERATION_ID;
}

function hasActiveOperationWorkflowOwnerDispatchPendingHandoffRetry(
  owner,
  operation,
) {
  const operationId = normalizeOperationWorkflowOwnerSnapshotOperationId(
    operation,
  );
  return (
    typeof operationId === typeof OPERATION_WORKFLOW_OWNER_EMPTY_TEXT &&
    operationId.length > OPERATION_WORKFLOW_OWNER_EMPTY_TEXT.length &&
    owner.hasActiveCreatedOperationHandoffRetry(operationId)
  );
}

function isOperationWorkflowOwnerDispatchPendingHandoffRetrySnapshot(
  snapshot,
) {
  return (
    snapshot?.progress?.blockingBoundary ===
      PRIORITY_RECOVERY_BLOCKING_BOUNDARY.REBALANCER_HANDOFF &&
    snapshot?.progress?.waitMode ===
      PRIORITY_RECOVERY_WAIT_MODE.RETRY_SCHEDULED &&
    snapshot?.progress?.nextRequiredAction ===
      PRIORITY_RECOVERY_NEXT_REQUIRED_ACTION.WAIT_FOR_OPERATION_PROGRESS
  );
}

function isOperationWorkflowOwnerDispatchPendingOwnerLaneHeld(
  owner,
  operation,
) {
  const operationId = normalizeOperationWorkflowOwnerSnapshotOperationId(
    operation,
  );
  return (
    typeof operationId === typeof OPERATION_WORKFLOW_OWNER_EMPTY_TEXT &&
    operationId.length > OPERATION_WORKFLOW_OWNER_EMPTY_TEXT.length &&
    owner.isOperationOwnerLaneHeld(operationId)
  );
}

function shouldReenterOperationWorkflowOwnerDispatchPending(
  owner,
  snapshot,
  operation,
) {
  const evidence = buildOperationWorkflowOwnerDispatchPendingReentryEvidence(
    snapshot,
    operation,
    hasActiveOperationWorkflowOwnerDispatchPendingHandoffRetry(
      owner,
      operation,
    ),
  );
  return OPERATION_WORKFLOW_OWNER_DISPATCH_PENDING_REENTRY_ALLOWED_STATES.has(
    resolveOperationWorkflowOwnerDispatchPendingReentryState(evidence),
  );
}

function buildOperationWorkflowOwnerDispatchPendingReentryContextEvidence(
  owner,
  snapshot,
  operation,
) {
  const ownerLaneHeld =
    isOperationWorkflowOwnerDispatchPendingOwnerLaneHeld(owner, operation);
  return Object.freeze({
    rebalancerHandoffRetryActive:
      hasActiveOperationWorkflowOwnerDispatchPendingHandoffRetry(
        owner,
        operation,
      ) && ownerLaneHeld !== true,
    ownerLaneHeld,
    timeoutReconcileDue: snapshot?.actuation?.timeoutReconcileDue === true,
    timeoutProgressWait:
      snapshot?.progress?.blockingBoundary ===
        PRIORITY_RECOVERY_BLOCKING_BOUNDARY.WORKFLOW_TIMEOUT &&
      snapshot?.progress?.waitMode ===
        PRIORITY_RECOVERY_WAIT_MODE.TIMEOUT_RECONCILE_DUE,
  });
}

function resolveOperationWorkflowOwnerDispatchPendingReentryContextState(
  evidence,
) {
  return (
    OPERATION_WORKFLOW_OWNER_DISPATCH_PENDING_REENTRY_CONTEXT_TABLE.find(
      (entry) => entry.matches(evidence),
    )?.state ||
    OPERATION_WORKFLOW_OWNER_DISPATCH_PENDING_REENTRY_CONTEXT_STATE
      .OWNER_RECONCILE
  );
}

function buildPriorityRecoveryDispatchPendingOwnerReentryContext(
  owner,
  snapshot,
  operation,
) {
  const baseContext = Object.freeze({
    mode: OPERATION_WORKFLOW_OWNER_PORT_CONTEXT_MODE.OWNER_RECONCILE,
  });
  const state =
    resolveOperationWorkflowOwnerDispatchPendingReentryContextState(
      buildOperationWorkflowOwnerDispatchPendingReentryContextEvidence(
        owner,
        snapshot,
        operation,
      ),
    );
  return state ===
    OPERATION_WORKFLOW_OWNER_DISPATCH_PENDING_REENTRY_CONTEXT_STATE
      .TIMEOUT_RECONCILE_DUE ?
    Object.freeze({
      ...baseContext,
      cause: OPERATION_WORKFLOW_OWNER_PORT_CONTEXT_CAUSE.TIMEOUT,
    }) :
    baseContext;
}

function normalizePriorityRecoveryDispatchPendingOwnerSnapshot(
  owner,
  snapshot,
  operation,
) {
  if (!shouldReenterOperationWorkflowOwnerDispatchPending(
    owner,
    snapshot,
    operation,
  )) {
    return snapshot;
  }
  const normalizedSnapshot =
    normalizePriorityRecoveryDispatchPendingDecisionSnapshot(
      snapshot,
      owner.operationWorkflowOwnerAdapter.decide(
        operation,
        buildPriorityRecoveryDispatchPendingOwnerReentryContext(
          owner,
          snapshot,
          operation,
        ),
      ),
    );
  owner.schedulePriorityRecoveryDispatchPendingReentry(
    normalizedSnapshot,
    [operation],
    {
      [OPERATION_WORKFLOW_OWNER_PRIORITY_RECOVERY_REENTRY_OPTION
        .ALLOW_OWNER_LANE_RETRY]: true,
      [OPERATION_WORKFLOW_OWNER_PRIORITY_RECOVERY_REENTRY_OPTION
        .EXECUTE_OWNER_OBSERVATION_EFFECT]: true,
    },
  );
  return normalizedSnapshot;
}

function normalizePriorityRecoveryTargetProgressOwnerSnapshot(
  owner,
  snapshot,
  operation,
) {
  if (
    !shouldNormalizeOperationWorkflowOwnerTargetProgressHandoffRetry(
      owner,
      snapshot,
      operation,
    )
  ) {
    return snapshot;
  }
  return normalizePriorityRecoveryDispatchPendingDecisionSnapshot(
    snapshot,
    owner.operationWorkflowOwnerAdapter.decide(
      operation,
      Object.freeze({
        mode: OPERATION_WORKFLOW_OWNER_PORT_CONTEXT_MODE.OWNER_RECONCILE,
      }),
    ),
  );
}

class OperationWorkflowOwner extends OperationWorkflowRecoveryReconcile {
  constructor(options) {
    super(options);
    // DT6 seam: optional TimeSource so the timeout-check orchestration can run on a virtual clock
    // (default null -> checkTimeouts falls back to Date.now(), byte-identical). See
    // OperationWorkflowRecoveryTimeout.resolveTimeoutCheckNowMs.
    this.timeSource = options?.timeSource || null;
    this.operationWorkflowOwnerAdapterOperationSnapshotByOperationId =
      new Map();
    this.operationWorkflowOwnerPorts =
      createOperationWorkflowOwnerPorts(this);
    this.operationProgressStore =
      options?.operationProgressStore || createOperationProgressStore();
    this.operationWorkflowOwnerAdapter =
      createOperationWorkflowOwnerAdapter({
        ports: this.operationWorkflowOwnerPorts,
      });
  }

  selectOperationWorkflowOwnerAdapterSnapshotOperation(
    operationInput,
    context = OPERATION_WORKFLOW_OWNER_ADAPTER_DEFAULT_CONTEXT,
  ) {
    if (isOperationWorkflowOwnerSnapshotCandidate(operationInput)) {
      return operationInput;
    }
    if (isOperationWorkflowOwnerSnapshotCandidate(context?.operationSnapshot)) {
      return context.operationSnapshot;
    }
    if (isOperationWorkflowOwnerSnapshotCandidate(context?.operation)) {
      return context.operation;
    }
    if (isOperationWorkflowOwnerSnapshotCandidate(context?.fallbackOperation)) {
      return context.fallbackOperation;
    }
    return OPERATION_WORKFLOW_OWNER_NO_OPERATION;
  }

  retainOperationWorkflowOwnerAdapterOperationSnapshot(
    operationInput,
    context = OPERATION_WORKFLOW_OWNER_ADAPTER_DEFAULT_CONTEXT,
  ) {
    const operation = this.selectOperationWorkflowOwnerAdapterSnapshotOperation(
      operationInput,
      context,
    );
    const operationId =
      normalizeOperationWorkflowOwnerSnapshotOperationId(operation);
    if (!operationId) {
      return OPERATION_WORKFLOW_OWNER_NO_OPERATION_ID;
    }
    const operationSnapshot = this.cloneOperationSnapshot(operation);
    if (!operationSnapshot) {
      return OPERATION_WORKFLOW_OWNER_NO_OPERATION_ID;
    }
    this.operationWorkflowOwnerAdapterOperationSnapshotByOperationId.set(
      operationId,
      operationSnapshot,
    );
    return operationId;
  }

  clearOperationWorkflowOwnerAdapterOperationSnapshot(operationId) {
    if (!operationId) {
      return;
    }
    this.operationWorkflowOwnerAdapterOperationSnapshotByOperationId.delete(
      operationId,
    );
  }

  buildTransitionRetryContextWithAdapterOperationSnapshot(
    operationId,
    context = OPERATION_WORKFLOW_OWNER_ADAPTER_DEFAULT_CONTEXT,
  ) {
    if (
      isOperationWorkflowOwnerSnapshotCandidate(context?.operationSnapshot) ||
      isOperationWorkflowOwnerSnapshotCandidate(context?.operation)
    ) {
      return context;
    }
    const operationSnapshot =
      this.operationWorkflowOwnerAdapterOperationSnapshotByOperationId.get(
        operationId,
      );
    if (!operationSnapshot) {
      return context;
    }
    return {
      ...context,
      operationSnapshot: this.cloneOperationSnapshot(operationSnapshot),
    };
  }

  deferTransitionRetry(
    operationId,
    errorLike,
    context = OPERATION_WORKFLOW_OWNER_ADAPTER_DEFAULT_CONTEXT,
  ) {
    return super.deferTransitionRetry(
      operationId,
      errorLike,
      this.buildTransitionRetryContextWithAdapterOperationSnapshot(
        operationId,
        context,
      ),
    );
  }

  async runOperationWorkflowOwnerAdapter(
    operationInput,
    context = OPERATION_WORKFLOW_OWNER_ADAPTER_DEFAULT_CONTEXT,
  ) {
    const retainedOperationId =
      this.retainOperationWorkflowOwnerAdapterOperationSnapshot(
        operationInput,
        context,
      );
    try {
      const result = await this.operationWorkflowOwnerAdapter.run(
        operationInput,
        context,
      );
      return result;
    } finally {
      this.clearOperationWorkflowOwnerAdapterOperationSnapshot(
        retainedOperationId,
      );
    }
  }

  buildCoordinatorCreatedLocalInitializationRetryError() {
    const error = new Error(
      OPERATION_WORKFLOW_OWNER_LOCAL_INITIALIZATION_RETRY_ERROR,
    );
    error.deferRetry = true;
    return error;
  }

  shouldDeferCoordinatorCreatedLocalInitialization(operationInput) {
    return (
      this.isCoordinatorCreatedOperationLocallyOwned(operationInput) &&
      this.isDispatchRetryableWorkflowStep(operationInput)
    );
  }

  deferCoordinatorCreatedLocalInitializationRetry(operationInput) {
    const operationId = operationInput?.operationId || null;
    if (
      !operationId ||
      !this.shouldDeferCoordinatorCreatedLocalInitialization(operationInput)
    ) {
      return false;
    }
    return this.deferTransitionRetry(
      operationId,
      this.buildCoordinatorCreatedLocalInitializationRetryError(),
      {
        boundary: OPERATION_WORKFLOW_OWNER_LOCAL_INITIALIZATION_RETRY_BOUNDARY,
        workflowStep: operationInput?.workflowStep || null,
        partitionId: operationInput?.partitionId || null,
        updatedAt: operationInput?.updatedAt,
        createdAt: operationInput?.createdAt,
        operationSnapshot: operationInput,
      },
    );
  }

  async armCoordinatorCreatedOperation(operationInput) {
    const operationId = operationInput?.operationId || null;
    if (!operationId || this.isShuttingDown) {
      return false;
    }
    if (
      !this.isInitialized &&
      !this.shouldArmCoordinatorCreatedOperationWhileUninitialized(
        operationInput,
      )
    ) {
      return this.deferCoordinatorCreatedLocalInitializationRetry(
        operationInput,
      );
    }

    const singleFlightKey = this.getOperationOwnerSingleFlightKey(operationId);
    try {
      const result = await this.operationWorkflowRunExclusive(
        singleFlightKey,
        () => this.runOperationWorkflowOwnerAdapter(
          operationInput,
          {
            mode:
              OPERATION_WORKFLOW_OWNER_PORT_CONTEXT_MODE
                .COORDINATOR_CREATED_OPERATION,
            fallbackOperation: operationInput,
          },
        ),
      );
      if (result?.applied === true) {
        return true;
      }
      if (shouldReturnDeferredDispatchOwnerProgressResult(result)) {
        return result;
      }
      return false;
    } catch (error) {
      if (
        this.deferCoordinatorCreatedRemoteHandoffRetry(operationInput, error)
      ) {
        return false;
      }
      throw error;
    }
  }

  async reconcileObservedProgressOperation(operationId) {
    if (!operationId) {
      return false;
    }
    const visibilityObservation =
      await this.repository.getOperationByIdVisibilityObservation(
        operationId,
        {
          requireOwnerRpcRead: false,
          allowPriorityRecoveryDeferredVisibility: true,
        },
      );
    const operation = visibilityObservation?.operation || null;
    const routeEvidence =
      this.buildObservedProgressOperationRouteEvidence(operation);
    const routeAction =
      this.resolveObservedProgressOperationRouteAction(routeEvidence);
    if (
      routeAction ===
      OPERATION_WORKFLOW_OWNER_OBSERVED_PROGRESS_ROUTE_ACTION.SKIP
    ) {
      this.clearObservedProgressRetry(operationId);
      return false;
    }
    if (
      routeAction ===
      OPERATION_WORKFLOW_OWNER_OBSERVED_PROGRESS_ROUTE_ACTION.WAKE_REMOTE_OWNER
    ) {
      const woken = await this.wakeCoordinatorCreatedRemoteOwner(operation);
      this.clearObservedProgressRetry(operationId);
      return woken;
    }
    try {
      return await this.runOperationWorkflowOwnerAdapter(
        operation,
        {
          ...OPERATION_WORKFLOW_OWNER_ADAPTER_DEFAULT_CONTEXT,
          mode: OPERATION_WORKFLOW_OWNER_PORT_CONTEXT_MODE.OBSERVED_PROGRESS,
        },
      );
    } finally {
      this.clearObservedProgressRetry(operationId);
    }
  }

  async reconcileOperationProgress(
    operation,
    options = OPERATION_WORKFLOW_OWNER_ADAPTER_DEFAULT_CONTEXT,
  ) {
    return super.reconcileOperationProgress(operation, options);
  }

  buildPriorityRecoveryDecisionSnapshotForOperations(
    partitionId,
    operations = [],
    planningSnapshot = null,
    incompleteOperationObservation = null,
  ) {
    const snapshot = super.buildPriorityRecoveryDecisionSnapshotForOperations(
      partitionId,
      operations,
      planningSnapshot,
      incompleteOperationObservation,
    );
    const operation =
      this.selectPriorityRecoveryDispatchPendingReentryOperation(
        snapshot,
        operations,
      );
    const normalizedSnapshot =
      this.normalizePriorityRecoveryDispatchPendingOwnerSnapshot(
        snapshot,
        operation,
      );
    const targetProgressNormalizedSnapshot =
      normalizePriorityRecoveryTargetProgressOwnerSnapshot(
        this,
        normalizedSnapshot,
        operation,
      );
    this.schedulePriorityRecoveryTargetProgressReentry(
      targetProgressNormalizedSnapshot,
      operations,
    );
    return targetProgressNormalizedSnapshot;
  }

  normalizePriorityRecoveryDispatchPendingOwnerSnapshot(snapshot, operation) {
    return normalizePriorityRecoveryDispatchPendingOwnerSnapshot(
      this,
      snapshot,
      operation,
    );
  }

  schedulePriorityRecoveryTargetProgressReentry(snapshot, operations = []) {
    const operation =
      this.selectPriorityRecoveryDispatchPendingReentryOperation(
        snapshot,
        operations,
      );
    const action =
      resolveOperationWorkflowOwnerTargetProgressReentryAction(
        this,
        snapshot,
        operation,
      );
    return applyOperationWorkflowOwnerTargetProgressReentryAction(
      this,
      operation,
      action,
    );
  }
}

export {OperationWorkflowOwner};

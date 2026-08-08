import {
  REBALANCER_SKIP_REASON,
} from './rebalancer-constants.js';
import {
  ReplicaStatus,
  REPLICA_OPERATION_SEMANTIC_PHASE,
} from './replica-status.js';
import {
  WORKFLOW_STEP,
} from '../constants/index.js';
import {
  ReplicaOperationField,
} from './replica-operation-constants.js';
import {
  attachPriorityRecoveryOperationOwnerProgressContract,
} from '../control-plane/priority-recovery-operation-owner-progress-contract.js';
import {
  OPERATION_WORKFLOW_COMMAND_STATE,
  OPERATION_WORKFLOW_DISPATCH_STATE,
  OPERATION_WORKFLOW_DURABLE_OPERATION_STATE,
  OPERATION_WORKFLOW_HISTORY_FRESHNESS_STATE,
  OPERATION_WORKFLOW_IDENTIFIER_VARIANTS,
  OPERATION_WORKFLOW_OWNER_AUTHORITY_STATE,
  OPERATION_WORKFLOW_RETRY_BUDGET_STATE,
  OPERATION_WORKFLOW_RETRY_DEADLINE_STATE,
  OPERATION_WORKFLOW_REVISION_VARIANTS,
  OPERATION_WORKFLOW_SERIAL_DEPENDENCY_STATE,
  OPERATION_WORKFLOW_STALE_PROGRESS_STATE,
  OPERATION_WORKFLOW_TERMINAL_STATE,
  OPERATION_WORKFLOW_TIMEOUT_STATE,
  OPERATION_WORKFLOW_TRANSITION_STATE,
  OPERATION_WORKFLOW_TYPE,
  OPERATION_WORKFLOW_WAKE_STATE,
} from './operation-workflow-owner-constants.js';
import {
  createOperationProgressStore,
} from './operation-progress-store.js';
import {
  OPERATION_WORKFLOW_OWNER_PORT_RECONCILE_DISPATCH_PENDING_STEPS,
} from './replica-operation-step-policy.js';
import {
  resolveOperationWorkflowOwnerLeaseFreshnessState,
  resolveOperationWorkflowPublicationFenceState,
} from './operation-workflow-port-freshness.js';

const OPERATION_WORKFLOW_OWNER_PORT_EMPTY_TEXT = '';
const OPERATION_WORKFLOW_OWNER_PORT_NO_RECORD = null;
const OPERATION_WORKFLOW_OWNER_PORT_NO_OWNER = null;
const OPERATION_WORKFLOW_OWNER_PORT_DEFAULT_CONTEXT = Object.freeze({});
const OPERATION_WORKFLOW_OWNER_PORT_CONTEXT_CAUSE = Object.freeze({
  TIMEOUT: 'timeout',
});
const OPERATION_WORKFLOW_OWNER_PORT_CONTEXT_MODE = Object.freeze({
  COORDINATOR_CREATED_OPERATION: 'coordinator_created_operation',
  OBSERVED_PROGRESS: 'observed_progress',
  OWNER_RECONCILE: 'owner_reconcile',
});
const OPERATION_WORKFLOW_OWNER_PORT_FUNCTION_TYPE = 'function';
const OPERATION_WORKFLOW_OWNER_PORT_OPERATION_ID_UNDERSCORE =
  'operation_id';
const OPERATION_WORKFLOW_OWNER_PORT_WORKFLOW_STEP_UNDERSCORE =
  'workflow_step';
const OPERATION_WORKFLOW_OWNER_PORT_STATUS_UNDERSCORE = 'status';
const OPERATION_WORKFLOW_OWNER_PORT_REMOTE_HANDOFF_SNAPSHOT_STATE =
  Object.freeze({
    COORDINATOR_MODE_UNAVAILABLE: 'coordinator_mode_unavailable',
    SNAPSHOT_UNAVAILABLE: 'snapshot_unavailable',
    REMOTE_AUTHORITY_UNAVAILABLE: 'remote_authority_unavailable',
    REMOTE_HANDOFF_INELIGIBLE: 'remote_handoff_ineligible',
    DISPATCH_RETRY_UNAVAILABLE: 'dispatch_retry_unavailable',
    SNAPSHOT_READY: 'snapshot_ready',
  });
const OPERATION_WORKFLOW_OWNER_PORT_REMOTE_HANDOFF_SNAPSHOT_ALLOWED_STATES =
  Object.freeze(new Set([
    OPERATION_WORKFLOW_OWNER_PORT_REMOTE_HANDOFF_SNAPSHOT_STATE
      .SNAPSHOT_READY,
  ]));

const OPERATION_WORKFLOW_OWNER_PORT_DISPATCH_STATE_TABLE = Object.freeze([
  Object.freeze({
    state: OPERATION_WORKFLOW_DISPATCH_STATE.OBSERVED,
    matches: (evidence) => evidence.observedProgressMode === true,
  }),
  Object.freeze({
    state: OPERATION_WORKFLOW_DISPATCH_STATE.NOT_OBSERVED,
    matches: (evidence) =>
      evidence.dispatchPendingReentryCandidate === true,
  }),
  Object.freeze({
    state: OPERATION_WORKFLOW_DISPATCH_STATE.UNAVAILABLE,
    matches: (evidence) =>
      evidence.dispatchRetrySupportAvailable !== true,
  }),
  Object.freeze({
    state: OPERATION_WORKFLOW_DISPATCH_STATE.NOT_OBSERVED,
    matches: (evidence) => evidence.dispatchRetryable === true,
  }),
  Object.freeze({
    state: OPERATION_WORKFLOW_DISPATCH_STATE.OBSERVED,
    matches: () => true,
  }),
]);

const OPERATION_WORKFLOW_OWNER_PORT_TRANSITION_STATE_TABLE = Object.freeze([
  Object.freeze({
    state: OPERATION_WORKFLOW_TRANSITION_STATE.AVAILABLE,
    matches: (evidence) => evidence.observedProgressMode === true,
  }),
  Object.freeze({
    state: OPERATION_WORKFLOW_TRANSITION_STATE.BLOCKED,
    matches: (evidence) =>
      evidence.dispatchState ===
        OPERATION_WORKFLOW_DISPATCH_STATE.NOT_OBSERVED,
  }),
  Object.freeze({
    state: OPERATION_WORKFLOW_TRANSITION_STATE.BLOCKED,
    matches: (evidence) =>
      evidence.terminalState !==
        OPERATION_WORKFLOW_TERMINAL_STATE.NON_TERMINAL,
  }),
  Object.freeze({
    state: OPERATION_WORKFLOW_TRANSITION_STATE.AVAILABLE,
    matches: () => true,
  }),
]);

const OPERATION_WORKFLOW_OWNER_PORT_REMOTE_HANDOFF_SNAPSHOT_STATE_TABLE =
  Object.freeze([
    Object.freeze({
      state:
        OPERATION_WORKFLOW_OWNER_PORT_REMOTE_HANDOFF_SNAPSHOT_STATE
          .COORDINATOR_MODE_UNAVAILABLE,
      matches: (evidence) => evidence.coordinatorCreatedMode !== true,
    }),
    Object.freeze({
      state:
        OPERATION_WORKFLOW_OWNER_PORT_REMOTE_HANDOFF_SNAPSHOT_STATE
          .SNAPSHOT_UNAVAILABLE,
      matches: (evidence) => evidence.snapshotAvailable !== true,
    }),
    Object.freeze({
      state:
        OPERATION_WORKFLOW_OWNER_PORT_REMOTE_HANDOFF_SNAPSHOT_STATE
          .REMOTE_AUTHORITY_UNAVAILABLE,
      matches: (evidence) =>
        evidence.authorityState !==
        OPERATION_WORKFLOW_OWNER_AUTHORITY_STATE.REMOTE_AUTHORITATIVE,
    }),
    Object.freeze({
      state:
        OPERATION_WORKFLOW_OWNER_PORT_REMOTE_HANDOFF_SNAPSHOT_STATE
          .REMOTE_HANDOFF_INELIGIBLE,
      matches: (evidence) => evidence.remoteHandoffEligible !== true,
    }),
    Object.freeze({
      state:
        OPERATION_WORKFLOW_OWNER_PORT_REMOTE_HANDOFF_SNAPSHOT_STATE
          .DISPATCH_RETRY_UNAVAILABLE,
      matches: (evidence) => evidence.dispatchRetryable !== true,
    }),
    Object.freeze({
      state:
        OPERATION_WORKFLOW_OWNER_PORT_REMOTE_HANDOFF_SNAPSHOT_STATE
          .SNAPSHOT_READY,
      matches: () => true,
    }),
  ]);

function isOperationWorkflowOwnerPortRecord(value) {
  return Boolean(value) &&
    typeof value === OPERATION_WORKFLOW_TYPE.OBJECT &&
    !Array.isArray(value);
}

function normalizeOperationWorkflowOwnerPortText(value, fallback) {
  if (typeof value !== OPERATION_WORKFLOW_TYPE.STRING) {
    return fallback;
  }
  const normalized = value.trim();
  return normalized || fallback;
}

function getOperationWorkflowOwnerPortOperationId(owner, operationInput) {
  if (
    typeof owner.getOperationIdFromInput ===
      OPERATION_WORKFLOW_OWNER_PORT_FUNCTION_TYPE
  ) {
    return owner.getOperationIdFromInput(operationInput);
  }
  if (typeof operationInput === OPERATION_WORKFLOW_TYPE.STRING) {
    return normalizeOperationWorkflowOwnerPortText(
      operationInput,
      OPERATION_WORKFLOW_IDENTIFIER_VARIANTS.OPERATION_KEY_UNAVAILABLE,
    );
  }
  if (!isOperationWorkflowOwnerPortRecord(operationInput)) {
    return OPERATION_WORKFLOW_IDENTIFIER_VARIANTS.OPERATION_KEY_UNAVAILABLE;
  }
  return normalizeOperationWorkflowOwnerPortText(
    operationInput.operationId ||
      operationInput[OPERATION_WORKFLOW_OWNER_PORT_OPERATION_ID_UNDERSCORE],
    OPERATION_WORKFLOW_IDENTIFIER_VARIANTS.OPERATION_KEY_UNAVAILABLE,
  );
}

function resolveOperationWorkflowOwnerProgressStore(owner) {
  if (!owner.operationProgressStore) {
    owner.operationProgressStore = createOperationProgressStore();
  }
  return owner.operationProgressStore;
}

function getOperationWorkflowOwnerPortWorkflowStep(operation) {
  return normalizeOperationWorkflowOwnerPortText(
    operation?.workflowStep ||
      operation?.[OPERATION_WORKFLOW_OWNER_PORT_WORKFLOW_STEP_UNDERSCORE],
    OPERATION_WORKFLOW_IDENTIFIER_VARIANTS.OPERATION_KEY_UNAVAILABLE,
  );
}

function getOperationWorkflowOwnerPortStatus(operation) {
  return normalizeOperationWorkflowOwnerPortText(
    operation?.status ||
      operation?.[OPERATION_WORKFLOW_OWNER_PORT_STATUS_UNDERSCORE],
    OPERATION_WORKFLOW_IDENTIFIER_VARIANTS.OPERATION_KEY_UNAVAILABLE,
  );
}

function resolveOperationWorkflowTerminalState(owner, operation) {
  const workflowStep = getOperationWorkflowOwnerPortWorkflowStep(operation);
  const status = getOperationWorkflowOwnerPortStatus(operation);
  if (
    workflowStep === WORKFLOW_STEP.FAILED ||
    status === ReplicaStatus.FAILED ||
    operation?.semanticPhase === REPLICA_OPERATION_SEMANTIC_PHASE.FAILED
  ) {
    return OPERATION_WORKFLOW_TERMINAL_STATE.FAILURE;
  }
  if (owner.repository?.isOperationTerminal(operation)) {
    return OPERATION_WORKFLOW_TERMINAL_STATE.SUCCESS;
  }
  return OPERATION_WORKFLOW_TERMINAL_STATE.NON_TERMINAL;
}

function resolveOperationWorkflowOwnerAuthorityState(owner, operation) {
  const ownerNodeId =
    typeof owner.resolveCoordinatorCreatedOperationOwnerNodeId ===
      OPERATION_WORKFLOW_OWNER_PORT_FUNCTION_TYPE ?
      owner.resolveCoordinatorCreatedOperationOwnerNodeId(operation) :
      OPERATION_WORKFLOW_OWNER_PORT_NO_OWNER;
  if (
    typeof ownerNodeId !== OPERATION_WORKFLOW_TYPE.STRING ||
    ownerNodeId.length === OPERATION_WORKFLOW_OWNER_PORT_EMPTY_TEXT.length
  ) {
    return OPERATION_WORKFLOW_OWNER_AUTHORITY_STATE.UNAVAILABLE;
  }
  return ownerNodeId === owner.nodeId ?
    OPERATION_WORKFLOW_OWNER_AUTHORITY_STATE.LOCAL_AUTHORITATIVE :
    OPERATION_WORKFLOW_OWNER_AUTHORITY_STATE.REMOTE_AUTHORITATIVE;
}

function resolveOperationWorkflowDispatchState(owner, operation, context) {
  const dispatchRetrySupportAvailable =
    typeof owner.isDispatchRetryableWorkflowStep ===
      OPERATION_WORKFLOW_OWNER_PORT_FUNCTION_TYPE;
  const workflowStep = getOperationWorkflowOwnerPortWorkflowStep(operation);
  const evidence = Object.freeze({
    observedProgressMode:
      context.mode ===
        OPERATION_WORKFLOW_OWNER_PORT_CONTEXT_MODE.OBSERVED_PROGRESS,
    dispatchPendingReentryCandidate:
      context.mode ===
        OPERATION_WORKFLOW_OWNER_PORT_CONTEXT_MODE.OWNER_RECONCILE &&
      OPERATION_WORKFLOW_OWNER_PORT_RECONCILE_DISPATCH_PENDING_STEPS.has(
        workflowStep,
      ) &&
      getOperationWorkflowOwnerPortStatus(operation) ===
        ReplicaStatus.PENDING,
    dispatchRetrySupportAvailable,
    dispatchRetryable:
      dispatchRetrySupportAvailable === true &&
      owner.isDispatchRetryableWorkflowStep(operation),
  });
  return OPERATION_WORKFLOW_OWNER_PORT_DISPATCH_STATE_TABLE.find((entry) =>
    entry.matches(evidence),
  ).state;
}

function resolveOperationWorkflowTransitionState(owner, operation, context) {
  const evidence = Object.freeze({
    observedProgressMode:
      context.mode ===
        OPERATION_WORKFLOW_OWNER_PORT_CONTEXT_MODE.OBSERVED_PROGRESS,
    dispatchState: resolveOperationWorkflowDispatchState(
      owner,
      operation,
      context,
    ),
    terminalState: resolveOperationWorkflowTerminalState(owner, operation),
  });
  return OPERATION_WORKFLOW_OWNER_PORT_TRANSITION_STATE_TABLE.find((entry) =>
    entry.matches(evidence),
  ).state;
}

function resolveOperationWorkflowTimeoutState(context) {
  return context.cause === OPERATION_WORKFLOW_OWNER_PORT_CONTEXT_CAUSE.TIMEOUT ?
    OPERATION_WORKFLOW_TIMEOUT_STATE.EXPIRED :
    OPERATION_WORKFLOW_TIMEOUT_STATE.ACTIVE;
}

function resolveOperationWorkflowHistoryFreshnessState(context) {
  return context.cause === OPERATION_WORKFLOW_OWNER_PORT_CONTEXT_CAUSE.TIMEOUT ?
    OPERATION_WORKFLOW_HISTORY_FRESHNESS_STATE.STALE :
    OPERATION_WORKFLOW_HISTORY_FRESHNESS_STATE.CURRENT;
}

function buildOperationWorkflowOwnerPortDurableOperation(
  owner,
  operation,
  context,
) {
  if (!isOperationWorkflowOwnerPortRecord(operation)) {
    return Object.freeze({
      recordState: OPERATION_WORKFLOW_DURABLE_OPERATION_STATE.UNAVAILABLE,
      operationKey:
        OPERATION_WORKFLOW_IDENTIFIER_VARIANTS.OPERATION_KEY_UNAVAILABLE,
      terminalState: OPERATION_WORKFLOW_TERMINAL_STATE.UNAVAILABLE,
      dispatchState: OPERATION_WORKFLOW_DISPATCH_STATE.UNAVAILABLE,
      sourceRevision:
        OPERATION_WORKFLOW_REVISION_VARIANTS.SOURCE_REVISION_UNAVAILABLE,
    });
  }
  return Object.freeze({
    recordState: OPERATION_WORKFLOW_DURABLE_OPERATION_STATE.AVAILABLE,
    operationKey: getOperationWorkflowOwnerPortOperationId(owner, operation),
    terminalState: resolveOperationWorkflowTerminalState(owner, operation),
    dispatchState: resolveOperationWorkflowDispatchState(
      owner,
      operation,
      context,
    ),
    sourceRevision:
      operation.updatedAt ||
      operation.createdAt ||
      OPERATION_WORKFLOW_REVISION_VARIANTS.SOURCE_REVISION_UNAVAILABLE,
  });
}

function buildOperationWorkflowOwnerPortWorkflowHistory(
  owner,
  operation,
  context,
) {
  return Object.freeze({
    freshnessState: resolveOperationWorkflowHistoryFreshnessState(context),
    terminalState: resolveOperationWorkflowTerminalState(owner, operation),
    transitionState: resolveOperationWorkflowTransitionState(
      owner,
      operation,
      context,
    ),
    commandState: OPERATION_WORKFLOW_COMMAND_STATE.IDLE,
    sourceRevision:
      operation?.updatedAt ||
      operation?.createdAt ||
      OPERATION_WORKFLOW_REVISION_VARIANTS.SOURCE_REVISION_UNAVAILABLE,
  });
}

function buildOperationWorkflowOwnerPortOwnerLease(owner, operation) {
  const ownerNodeId =
    typeof owner.resolveCoordinatorCreatedOperationOwnerNodeId ===
      OPERATION_WORKFLOW_OWNER_PORT_FUNCTION_TYPE ?
      owner.resolveCoordinatorCreatedOperationOwnerNodeId(operation) :
      OPERATION_WORKFLOW_OWNER_PORT_NO_OWNER;
  return Object.freeze({
    authorityState: resolveOperationWorkflowOwnerAuthorityState(
      owner,
      operation,
    ),
    // Derived from the durable row lease (lease_expires_at; audit finding
    // 18) — never a hard-coded CURRENT. An expired lease reads STALE; a
    // legacy row with no lease stamp reads UNAVAILABLE.
    freshnessState: resolveOperationWorkflowOwnerLeaseFreshnessState(
      operation,
      typeof owner.nowFn === OPERATION_WORKFLOW_OWNER_PORT_FUNCTION_TYPE ?
        owner.nowFn() :
        undefined,
    ),
    ownerNodeKey: normalizeOperationWorkflowOwnerPortText(
      ownerNodeId,
      OPERATION_WORKFLOW_IDENTIFIER_VARIANTS.OWNER_NODE_KEY_UNAVAILABLE,
    ),
    leaseTerm:
      operation?.updatedAt ||
      OPERATION_WORKFLOW_REVISION_VARIANTS.LEASE_TERM_UNAVAILABLE,
  });
}

function buildOperationWorkflowOwnerPortSerialDependency() {
  return Object.freeze({
    dependencyState: OPERATION_WORKFLOW_SERIAL_DEPENDENCY_STATE.CLEAR,
    priorOperationKey:
      OPERATION_WORKFLOW_IDENTIFIER_VARIANTS
        .PRIOR_OPERATION_KEY_UNAVAILABLE,
    sourceRevision:
      OPERATION_WORKFLOW_REVISION_VARIANTS.SOURCE_REVISION_UNAVAILABLE,
  });
}

function buildOperationWorkflowOwnerPortTimeoutBudget(context) {
  return Object.freeze({
    timeoutState: resolveOperationWorkflowTimeoutState(context),
    staleProgressState:
      context.cause === OPERATION_WORKFLOW_OWNER_PORT_CONTEXT_CAUSE.TIMEOUT ?
        OPERATION_WORKFLOW_STALE_PROGRESS_STATE.PROVEN :
        OPERATION_WORKFLOW_STALE_PROGRESS_STATE.NOT_OBSERVED,
    sourceRevision:
      OPERATION_WORKFLOW_REVISION_VARIANTS.SOURCE_REVISION_UNAVAILABLE,
  });
}

function hasActiveOperationWorkflowOwnerPortRetry(owner, operationId, nowMs) {
  return (
    typeof owner.hasActiveCreatedOperationHandoffRetry ===
      OPERATION_WORKFLOW_OWNER_PORT_FUNCTION_TYPE &&
    owner.hasActiveCreatedOperationHandoffRetry(operationId, nowMs)
  ) || (
    typeof owner.hasActiveOperationDispatchDeferredRetry ===
      OPERATION_WORKFLOW_OWNER_PORT_FUNCTION_TYPE &&
    owner.hasActiveOperationDispatchDeferredRetry(operationId, nowMs)
  );
}

function buildOperationWorkflowOwnerPortRetryBudget(owner, operation) {
  const operationId = getOperationWorkflowOwnerPortOperationId(
    owner,
    operation,
  );
  const retryScheduled = hasActiveOperationWorkflowOwnerPortRetry(
    owner,
    operationId,
  );
  return Object.freeze({
    budgetState: retryScheduled === true ?
      OPERATION_WORKFLOW_RETRY_BUDGET_STATE.AVAILABLE :
      OPERATION_WORKFLOW_RETRY_BUDGET_STATE.UNAVAILABLE,
    deadlineState: retryScheduled === true ?
      OPERATION_WORKFLOW_RETRY_DEADLINE_STATE.ACTIVE :
      OPERATION_WORKFLOW_RETRY_DEADLINE_STATE.UNAVAILABLE,
    sourceRevision:
      operation?.updatedAt ||
      operation?.createdAt ||
      OPERATION_WORKFLOW_REVISION_VARIANTS.SOURCE_REVISION_UNAVAILABLE,
  });
}

function buildOperationWorkflowOwnerPortPublicationFence(owner, operation) {
  const operationId = getOperationWorkflowOwnerPortOperationId(
    owner,
    operation,
  );
  let workflow =
    owner.operationWorkflowCoordinator &&
      typeof owner.operationWorkflowCoordinator.getWorkflowById ===
        OPERATION_WORKFLOW_OWNER_PORT_FUNCTION_TYPE ?
      owner.operationWorkflowCoordinator.getWorkflowById(operationId) :
      OPERATION_WORKFLOW_OWNER_PORT_NO_RECORD;
  if (
    !workflow &&
    isOperationWorkflowOwnerPortRecord(operation) &&
    operationId !==
      OPERATION_WORKFLOW_IDENTIFIER_VARIANTS.OPERATION_KEY_UNAVAILABLE &&
    typeof owner.ensureOperationWorkflow ===
      OPERATION_WORKFLOW_OWNER_PORT_FUNCTION_TYPE
  ) {
    // First observation after a restart: hydrate the witness from the
    // durable row mirror before judging the fence — never report a bare
    // INCOMPLETE against evidence the store simply has not loaded yet.
    owner.ensureOperationWorkflow(operation);
    workflow = owner.operationWorkflowCoordinator &&
        typeof owner.operationWorkflowCoordinator.getWorkflowById ===
          OPERATION_WORKFLOW_OWNER_PORT_FUNCTION_TYPE ?
      owner.operationWorkflowCoordinator.getWorkflowById(operationId) :
      OPERATION_WORKFLOW_OWNER_PORT_NO_RECORD;
  }
  // Derived from the persisted transition-history witness against the
  // durable row mirror (audit findings 15+18) — never a hard-coded
  // CURRENT. A divergent or rewound witness reads STALE; no persisted
  // witness against a row that already carries history reads INCOMPLETE.
  return Object.freeze({
    fenceState: resolveOperationWorkflowPublicationFenceState(
      operation,
      workflow,
    ),
    requiredRevision:
      operation?.updatedAt ||
      operation?.createdAt ||
      OPERATION_WORKFLOW_REVISION_VARIANTS
        .REQUIRED_PUBLICATION_REVISION_UNAVAILABLE,
    observedRevision:
      workflow?.updatedAt ||
      OPERATION_WORKFLOW_REVISION_VARIANTS
        .OBSERVED_PUBLICATION_REVISION_UNAVAILABLE,
    sourceRevision:
      OPERATION_WORKFLOW_REVISION_VARIANTS.SOURCE_REVISION_UNAVAILABLE,
  });
}

function buildOperationWorkflowOwnerPortDispatchObservation(
  owner,
  operation,
  context,
) {
  return Object.freeze({
    dispatchState: resolveOperationWorkflowDispatchState(
      owner,
      operation,
      context,
    ),
    wakeState:
      resolveOperationWorkflowOwnerAuthorityState(owner, operation) ===
        OPERATION_WORKFLOW_OWNER_AUTHORITY_STATE.REMOTE_AUTHORITATIVE ?
        OPERATION_WORKFLOW_WAKE_STATE.REQUIRED :
        OPERATION_WORKFLOW_WAKE_STATE.OBSERVED,
    commandState: OPERATION_WORKFLOW_COMMAND_STATE.IDLE,
    sourceRevision:
      operation?.updatedAt ||
      operation?.createdAt ||
      OPERATION_WORKFLOW_REVISION_VARIANTS.SOURCE_REVISION_UNAVAILABLE,
  });
}

function shouldPrimeCoordinatorCreatedLocalOwnerOperation(
  operation,
  context,
) {
  return context.mode ===
      OPERATION_WORKFLOW_OWNER_PORT_CONTEXT_MODE
        .COORDINATOR_CREATED_OPERATION &&
    getOperationWorkflowOwnerPortWorkflowStep(operation) ===
      WORKFLOW_STEP.PENDING;
}

function buildCoordinatorCreatedRemoteHandoffSnapshotEvidence(
  owner,
  operationInput,
  context,
) {
  const operation = isOperationWorkflowOwnerPortRecord(operationInput) ?
    operationInput :
    context.fallbackOperation;
  const snapshotAvailable = isOperationWorkflowOwnerPortRecord(operation);
  const dispatchRetrySupportAvailable =
    typeof owner.isDispatchRetryableWorkflowStep ===
      OPERATION_WORKFLOW_OWNER_PORT_FUNCTION_TYPE;
  return Object.freeze({
    operation,
    coordinatorCreatedMode:
      context.mode ===
      OPERATION_WORKFLOW_OWNER_PORT_CONTEXT_MODE.COORDINATOR_CREATED_OPERATION,
    snapshotAvailable,
    authorityState: snapshotAvailable === true ?
      resolveOperationWorkflowOwnerAuthorityState(owner, operation) :
      OPERATION_WORKFLOW_OWNER_AUTHORITY_STATE.UNAVAILABLE,
    remoteHandoffEligible:
      snapshotAvailable === true &&
      typeof owner.shouldRetryCoordinatorCreatedRemoteHandoff ===
        OPERATION_WORKFLOW_OWNER_PORT_FUNCTION_TYPE &&
      owner.shouldRetryCoordinatorCreatedRemoteHandoff(operation) === true,
    dispatchRetryable:
      snapshotAvailable === true &&
      (
        dispatchRetrySupportAvailable !== true ||
        owner.isDispatchRetryableWorkflowStep(operation) === true
      ),
  });
}

function resolveCoordinatorCreatedRemoteHandoffSnapshotState(evidence) {
  return OPERATION_WORKFLOW_OWNER_PORT_REMOTE_HANDOFF_SNAPSHOT_STATE_TABLE
    .find((entry) => entry.matches(evidence))
    .state;
}

function selectCoordinatorCreatedRemoteHandoffSnapshot(
  owner,
  operationInput,
  context,
) {
  const evidence = buildCoordinatorCreatedRemoteHandoffSnapshotEvidence(
    owner,
    operationInput,
    context,
  );
  const state = resolveCoordinatorCreatedRemoteHandoffSnapshotState(evidence);
  if (
    !OPERATION_WORKFLOW_OWNER_PORT_REMOTE_HANDOFF_SNAPSHOT_ALLOWED_STATES
      .has(state)
  ) {
    return OPERATION_WORKFLOW_OWNER_PORT_NO_RECORD;
  }
  return owner.cloneOperationSnapshot?.(evidence.operation) ||
    evidence.operation;
}

function mergeCoordinatorCreatedBootstrapMetadata(
  authoritativeOperation,
  fallbackOperation,
) {
  if (
    !isOperationWorkflowOwnerPortRecord(authoritativeOperation) ||
    !isOperationWorkflowOwnerPortRecord(fallbackOperation)
  ) {
    return authoritativeOperation;
  }
  const mergedOperation = {...authoritativeOperation};
  for (const fieldName of [
    ReplicaOperationField.REPLICA_IDS,
    ReplicaOperationField.PEER_ADDRESSES,
  ]) {
    if (
      (!Array.isArray(mergedOperation[fieldName]) ||
        mergedOperation[fieldName].length === 0) &&
      Array.isArray(fallbackOperation[fieldName]) &&
      fallbackOperation[fieldName].length > 0
    ) {
      mergedOperation[fieldName] = [...fallbackOperation[fieldName]];
    }
  }
  for (const fieldName of [
    ReplicaOperationField.BOOTSTRAP_TABLE_METADATA,
    ReplicaOperationField.BOOTSTRAP_PARTITION_METADATA,
  ]) {
    if (
      (!mergedOperation[fieldName] ||
        typeof mergedOperation[fieldName] !== OPERATION_WORKFLOW_TYPE.OBJECT) &&
      fallbackOperation[fieldName] &&
      typeof fallbackOperation[fieldName] === OPERATION_WORKFLOW_TYPE.OBJECT
    ) {
      mergedOperation[fieldName] = {...fallbackOperation[fieldName]};
    }
  }
  return mergedOperation;
}

async function readOperationWorkflowOwnerPortDurableOperation(
  owner,
  operationInput,
  context,
) {
  const operationId = getOperationWorkflowOwnerPortOperationId(
    owner,
    operationInput,
  );
  if (
    operationId ===
    OPERATION_WORKFLOW_IDENTIFIER_VARIANTS.OPERATION_KEY_UNAVAILABLE
  ) {
    return OPERATION_WORKFLOW_OWNER_PORT_NO_RECORD;
  }
  const remoteHandoffSnapshot =
    selectCoordinatorCreatedRemoteHandoffSnapshot(
      owner,
      operationInput,
      context,
    );
  if (remoteHandoffSnapshot) {
    return remoteHandoffSnapshot;
  }
  if (
    context.mode ===
      OPERATION_WORKFLOW_OWNER_PORT_CONTEXT_MODE
        .COORDINATOR_CREATED_OPERATION &&
    typeof owner.repository?.queryAuthoritativeOperationById ===
      OPERATION_WORKFLOW_OWNER_PORT_FUNCTION_TYPE
  ) {
    const operation = await owner.repository.queryAuthoritativeOperationById(
      operationId,
      {requireOwnerRpcRead: false},
    );
    return mergeCoordinatorCreatedBootstrapMetadata(
      operation,
      context.fallbackOperation,
    ) ||
      owner.cloneOperationSnapshot?.(context.fallbackOperation) ||
      OPERATION_WORKFLOW_OWNER_PORT_NO_RECORD;
  }
  if (isOperationWorkflowOwnerPortRecord(operationInput)) {
    return operationInput;
  }
  if (
    typeof owner.repository?.queryOperationById ===
      OPERATION_WORKFLOW_OWNER_PORT_FUNCTION_TYPE
  ) {
    return owner.repository.queryOperationById(operationId);
  }
  return OPERATION_WORKFLOW_OWNER_PORT_NO_RECORD;
}

async function primeCoordinatorCreatedLocalOwnerOperation(
  owner,
  operation,
  context,
) {
  owner.clearCreatedOperationHandoffRetry?.(operation.operationId);
  try {
    const claimedOperation = await owner.claimPendingDispatchOperation(
      operation,
    );
    return owner.applyCoordinatorCreatedLocalOperationPrimeAction(
      claimedOperation,
    );
  } catch (error) {
    if (
      typeof owner.deferTransitionRetry ===
        OPERATION_WORKFLOW_OWNER_PORT_FUNCTION_TYPE &&
      owner.deferTransitionRetry(operation.operationId, error, {
        boundary: context.effectCommand,
        workflowStep: operation.workflowStep,
        partitionId: operation.partitionId,
        updatedAt: operation.updatedAt,
        createdAt: operation.createdAt,
      })
    ) {
      return false;
    }
    throw error;
  }
}

async function dispatchOperationWorkflowLocalOwner(owner, operation, context) {
  if (shouldPrimeCoordinatorCreatedLocalOwnerOperation(operation, context)) {
    return primeCoordinatorCreatedLocalOwnerOperation(
      owner,
      operation,
      context,
    );
  }
  owner.clearCreatedOperationHandoffRetry?.(operation.operationId);
  try {
    const dispatchResult = await owner.dispatchOperationInternal(operation);
    return dispatchResult?.success === true ||
      dispatchResult?.reason === REBALANCER_SKIP_REASON.DEFERRED_RETRY_PENDING;
  } catch (error) {
    if (
      typeof owner.deferTransitionRetry ===
        OPERATION_WORKFLOW_OWNER_PORT_FUNCTION_TYPE &&
      owner.deferTransitionRetry(operation.operationId, error, {
        boundary: context.effectCommand,
        workflowStep: operation.workflowStep,
        partitionId: operation.partitionId,
        updatedAt: operation.updatedAt,
        createdAt: operation.createdAt,
        operationSnapshot: operation,
      })
    ) {
      return false;
    }
    throw error;
  }
}

async function wakeOperationWorkflowRemoteOwner(
  owner,
  operation,
  context = OPERATION_WORKFLOW_OWNER_PORT_DEFAULT_CONTEXT,
) {
  const nowMs = Number.isFinite(context?.nowMs) ? context.nowMs : Date.now();
  const operationId = getOperationWorkflowOwnerPortOperationId(
    owner,
    operation,
  );
  const hasActiveHandoffRetry = hasActiveOperationWorkflowOwnerPortRetry(
    owner,
    operationId,
    nowMs,
  );
  if (hasActiveHandoffRetry) {
    return true;
  }
  const handoffTimeoutDecision =
    owner.buildCoordinatorCreatedRemoteHandoffTimeoutDecision?.(
      operation,
      nowMs,
    );
  if (handoffTimeoutDecision?.shouldStop === true) {
    owner.clearCreatedOperationHandoffRetry?.(operation.operationId);
    return false;
  }
  return owner.wakeCoordinatorCreatedRemoteOwner(operation);
}

async function reconcileOperationWorkflowStaleProgress(
  owner,
  operation,
  context,
) {
  if (
    typeof owner.repository?.isOperationLocallyOwned ===
      OPERATION_WORKFLOW_OWNER_PORT_FUNCTION_TYPE &&
    owner.repository.isOperationLocallyOwned(operation) !== true
  ) {
    return wakeOperationWorkflowRemoteOwner(owner, operation);
  }
  return owner.reconcileOperationLifecycle(operation, context);
}

function createOperationWorkflowOwnerPorts(owner) {
  const originalNormalize = owner.normalizePriorityRecoveryDispatchPendingOwnerSnapshot;
  if (
    typeof originalNormalize ===
      OPERATION_WORKFLOW_OWNER_PORT_FUNCTION_TYPE
  ) {
    owner.normalizePriorityRecoveryDispatchPendingOwnerSnapshot = function(
      snapshot,
      operation,
    ) {
      const result = originalNormalize.call(this, snapshot, operation);
      return attachPriorityRecoveryOperationOwnerProgressContract(result);
    };
  }

  return Object.freeze({
    async readDurableOperation(
      operationInput,
      context = OPERATION_WORKFLOW_OWNER_PORT_DEFAULT_CONTEXT,
    ) {
      return readOperationWorkflowOwnerPortDurableOperation(
        owner,
        operationInput,
        context,
      );
    },
    readWorkflowHistory(operation, context) {
      return buildOperationWorkflowOwnerPortWorkflowHistory(
        owner,
        operation,
        context,
      );
    },
    buildDurableOperationEvidence(operation, context) {
      return buildOperationWorkflowOwnerPortDurableOperation(
        owner,
        operation,
        context,
      );
    },
    readOwnerLease(operation) {
      return buildOperationWorkflowOwnerPortOwnerLease(owner, operation);
    },
    readSerialDependency() {
      return buildOperationWorkflowOwnerPortSerialDependency();
    },
    readRetryBudget(operation) {
      return buildOperationWorkflowOwnerPortRetryBudget(owner, operation);
    },
    readTimeoutBudget(context) {
      return buildOperationWorkflowOwnerPortTimeoutBudget(context);
    },
    readPublicationFence(operation) {
      return buildOperationWorkflowOwnerPortPublicationFence(
        owner,
        operation,
      );
    },
    readDispatchObservation(operation, context) {
      return buildOperationWorkflowOwnerPortDispatchObservation(
        owner,
        operation,
        context,
      );
    },
    loadOperationProgress(operation, context) {
      return resolveOperationWorkflowOwnerProgressStore(owner)
        .loadOperationProgress(operation, context);
    },
    persistOperationProgress({expectedVersion, progress}) {
      return resolveOperationWorkflowOwnerProgressStore(owner)
        .compareAndSwapOperationProgress({
          expectedVersion,
          progress,
        });
    },
    appendOperationProgressEvent(event) {
      return resolveOperationWorkflowOwnerProgressStore(owner)
        .appendEvent(event);
    },
    dispatchLocalOwner(operation, context) {
      return dispatchOperationWorkflowLocalOwner(owner, operation, context);
    },
    wakeRemoteOwner(operation, context) {
      return wakeOperationWorkflowRemoteOwner(owner, operation, context);
    },
    advanceExistingOperation(operation, context) {
      return owner.reconcileOperationLifecycle(operation, context);
    },
    reconcileStaleProgress(operation, context) {
      return reconcileOperationWorkflowStaleProgress(
        owner,
        operation,
        context,
      );
    },
    retainPublicationForRetry(operation, context) {
      return owner.reconcileOperationLifecycle(operation, context);
    },
    markActiveGateVisible() {
      return true;
    },
    recordTerminalSuccess() {
      return true;
    },
    recordTerminalFailure() {
      return true;
    },
    waitForOwnerProgress() {
      return false;
    },
  });
}

export {
  OPERATION_WORKFLOW_OWNER_PORT_CONTEXT_CAUSE,
  OPERATION_WORKFLOW_OWNER_PORT_CONTEXT_MODE,
  createOperationWorkflowOwnerPorts,
};

import {
  REBALANCER_SKIP_REASON,
} from './rebalancer-constants.js';
import {
  ReplicaStatus,
  REPLICA_OPERATION_SEMANTIC_PHASE,
} from './replica-status.js';
import {WORKFLOW_STEP} from '../constants/index.js';
import {
  OPERATION_WORKFLOW_COMMAND_STATE,
  OPERATION_WORKFLOW_DISPATCH_STATE,
  OPERATION_WORKFLOW_DURABLE_OPERATION_STATE,
  OPERATION_WORKFLOW_HISTORY_FRESHNESS_STATE,
  OPERATION_WORKFLOW_IDENTIFIER_VARIANTS,
  OPERATION_WORKFLOW_LEASE_FRESHNESS_STATE,
  OPERATION_WORKFLOW_OWNER_AUTHORITY_STATE,
  OPERATION_WORKFLOW_PUBLICATION_FENCE_STATE,
  OPERATION_WORKFLOW_REVISION_VARIANTS,
  OPERATION_WORKFLOW_SERIAL_DEPENDENCY_STATE,
  OPERATION_WORKFLOW_STALE_PROGRESS_STATE,
  OPERATION_WORKFLOW_TERMINAL_STATE,
  OPERATION_WORKFLOW_TIMEOUT_STATE,
  OPERATION_WORKFLOW_TRANSITION_STATE,
  OPERATION_WORKFLOW_TYPE,
  OPERATION_WORKFLOW_WAKE_STATE,
} from './operation-workflow-owner-constants.js';

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
});
const OPERATION_WORKFLOW_OWNER_PORT_FUNCTION_TYPE = 'function';
const OPERATION_WORKFLOW_OWNER_PORT_OPERATION_ID_UNDERSCORE =
  'operation_id';
const OPERATION_WORKFLOW_OWNER_PORT_WORKFLOW_STEP_UNDERSCORE =
  'workflow_step';
const OPERATION_WORKFLOW_OWNER_PORT_STATUS_UNDERSCORE = 'status';

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
  if (
    context.mode ===
      OPERATION_WORKFLOW_OWNER_PORT_CONTEXT_MODE.OBSERVED_PROGRESS
  ) {
    return OPERATION_WORKFLOW_DISPATCH_STATE.OBSERVED;
  }
  if (
    typeof owner.isDispatchRetryableWorkflowStep !==
      OPERATION_WORKFLOW_OWNER_PORT_FUNCTION_TYPE
  ) {
    return OPERATION_WORKFLOW_DISPATCH_STATE.UNAVAILABLE;
  }
  return owner.isDispatchRetryableWorkflowStep(operation) ?
    OPERATION_WORKFLOW_DISPATCH_STATE.NOT_OBSERVED :
    OPERATION_WORKFLOW_DISPATCH_STATE.OBSERVED;
}

function resolveOperationWorkflowTransitionState(owner, operation, context) {
  if (
    context.mode ===
      OPERATION_WORKFLOW_OWNER_PORT_CONTEXT_MODE.OBSERVED_PROGRESS
  ) {
    return OPERATION_WORKFLOW_TRANSITION_STATE.AVAILABLE;
  }
  if (
    typeof owner.isDispatchRetryableWorkflowStep ===
      OPERATION_WORKFLOW_OWNER_PORT_FUNCTION_TYPE &&
    owner.isDispatchRetryableWorkflowStep(operation)
  ) {
    return OPERATION_WORKFLOW_TRANSITION_STATE.BLOCKED;
  }
  if (resolveOperationWorkflowTerminalState(owner, operation) !==
    OPERATION_WORKFLOW_TERMINAL_STATE.NON_TERMINAL
  ) {
    return OPERATION_WORKFLOW_TRANSITION_STATE.BLOCKED;
  }
  return OPERATION_WORKFLOW_TRANSITION_STATE.AVAILABLE;
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
    freshnessState: OPERATION_WORKFLOW_LEASE_FRESHNESS_STATE.CURRENT,
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

function buildOperationWorkflowOwnerPortPublicationFence() {
  return Object.freeze({
    fenceState: OPERATION_WORKFLOW_PUBLICATION_FENCE_STATE.CURRENT,
    requiredRevision:
      OPERATION_WORKFLOW_REVISION_VARIANTS
        .REQUIRED_PUBLICATION_REVISION_UNAVAILABLE,
    observedRevision:
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
    return operation ||
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

async function wakeOperationWorkflowRemoteOwner(owner, operation) {
  const handoffTimeoutDecision =
    owner.buildCoordinatorCreatedRemoteHandoffTimeoutDecision?.(operation);
  if (handoffTimeoutDecision?.shouldStop === true) {
    owner.clearCreatedOperationHandoffRetry?.(operation.operationId);
    return false;
  }
  return owner.wakeCoordinatorCreatedRemoteOwner(operation);
}

function createOperationWorkflowOwnerPorts(owner) {
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
    readTimeoutBudget(context) {
      return buildOperationWorkflowOwnerPortTimeoutBudget(context);
    },
    readPublicationFence() {
      return buildOperationWorkflowOwnerPortPublicationFence();
    },
    readDispatchObservation(operation, context) {
      return buildOperationWorkflowOwnerPortDispatchObservation(
        owner,
        operation,
        context,
      );
    },
    dispatchLocalOwner(operation, context) {
      return dispatchOperationWorkflowLocalOwner(owner, operation, context);
    },
    wakeRemoteOwner(operation) {
      return wakeOperationWorkflowRemoteOwner(owner, operation);
    },
    advanceExistingOperation(operation, context) {
      return owner.reconcileOperationLifecycle(operation, context);
    },
    reconcileStaleProgress(operation, context) {
      return owner.reconcileOperationLifecycle(operation, context);
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
  OPERATION_WORKFLOW_OWNER_PORT_CONTEXT_MODE,
  createOperationWorkflowOwnerPorts,
};

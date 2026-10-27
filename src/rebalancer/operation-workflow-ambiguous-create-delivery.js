import {OPERATION_WORKFLOW_OWNER_SHARED} from
  './operation-workflow-owner-shared.js';
import {operationCarriesReplicaCreateAdmission} from
  './replica-operation-create-admission-fields.js';
import {isTerminalSuccessfulCreateOperation} from './replica-status.js';

const {
  CONTROL_PLANE_AUTHORITATIVE_READ_MODE,
  OPERATION_WORKFLOW_OWNER_LITERAL,
  OperationType,
  REBALANCER_SKIP_REASON,
  REBALANCE_COORDINATOR_ERROR_MSG,
  ReplicaOperationResponseStatus,
  SYSTEM_TABLE_NAME,
} = OPERATION_WORKFLOW_OWNER_SHARED;

const CREATE_DISPATCH_IDENTITY_FIELDS = Object.freeze([
  'operationId',
  'type',
  'entityType',
  'entityId',
  'partitionId',
  'replicaId',
  'targetNodeId',
]);
const AMBIGUOUS_CREATE_DELIVERY_NOT_HANDLED = false;
const AMBIGUOUS_CREATE_DELIVERY_ACTION = Object.freeze({
  RETAIN: 'RETAIN',
});

function isCreateDispatchPhase(operation, replaceRemoveDispatchPhase) {
  return replaceRemoveDispatchPhase !== true &&
    (operation?.type === OperationType.ADD ||
      operation?.type === OperationType.REPLACE);
}

function sameCreateDispatchIdentity(left, right) {
  return CREATE_DISPATCH_IDENTITY_FIELDS.every(
    (field) => left?.[field] === right?.[field],
  );
}

async function observeCreateDeliveryAdmission(owner, operation) {
  try {
    return await owner.repository.getOperationByIdVisibilityObservation(
      operation.operationId,
      {
        authoritativeReadMode:
          CONTROL_PLANE_AUTHORITATIVE_READ_MODE.OWNER_RPC_REQUIRED,
        allowOwnerPersistedTransitionDeferredVisibility: false,
      },
    );
  } catch (error) {
    return {operation: null, deferredOutcome: error};
  }
}

function scheduleCreateDeliveryObservation(owner, operation) {
  return owner.scheduleObservedProgressRetry(
    operation.operationId,
    SYSTEM_TABLE_NAME.REPLICA_OPERATIONS,
    OPERATION_WORKFLOW_OWNER_LITERAL.SYNTHETIC_UPSERT,
  );
}

function buildDeferredCreateDelivery(owner, operation, errorMsg) {
  return owner.buildSkippedOperationResult(
    REBALANCER_SKIP_REASON.DEFERRED_RETRY_PENDING,
    operation.operationId,
    {error: errorMsg},
  );
}

function buildRetainedCreateDelivery(operation, errorMsg, owner) {
  return Object.freeze({
    action: AMBIGUOUS_CREATE_DELIVERY_ACTION.RETAIN,
    operation,
    response: Object.freeze({
      status: ReplicaOperationResponseStatus.IN_PROGRESS,
    }),
    result: buildDeferredCreateDelivery(owner, operation, errorMsg),
  });
}

function isRetainedCreateDeliveryResolution(value) {
  return value?.action === AMBIGUOUS_CREATE_DELIVERY_ACTION.RETAIN;
}

function scheduleUnretainedCreateDelivery(owner, operation) {
  scheduleCreateDeliveryObservation(owner, operation);
}

function resolveTerminalCreateDelivery(owner, operation, errorMsg) {
  return isTerminalSuccessfulCreateOperation(operation) ?
    owner.buildSuccessfulOperationResult(operation.operationId, {
      status: ReplicaOperationResponseStatus.COMPLETED,
    }) :
    owner.buildFailedOperationResult(
      operation.operationId,
      operation.errorMessage || errorMsg,
    );
}

function isRetainedAdmission(owner, requested, authoritative) {
  return Boolean(authoritative) &&
    sameCreateDispatchIdentity(requested, authoritative) &&
    operationCarriesReplicaCreateAdmission(authoritative) &&
    !owner.repository.isOperationTerminal(authoritative);
}

function createDeliveryAuthorityDiverged(requested, authoritative) {
  return !authoritative ||
    !sameCreateDispatchIdentity(requested, authoritative);
}

async function resolveAmbiguousCreateDeliveryFailure(
  owner,
  operation,
  errorLike,
  replaceRemoveDispatchPhase,
) {
  if (!isCreateDispatchPhase(operation, replaceRemoveDispatchPhase)) {
    return AMBIGUOUS_CREATE_DELIVERY_NOT_HANDLED;
  }
  const errorMsg = owner.normalizeErrorMessage(
    errorLike,
    REBALANCE_COORDINATOR_ERROR_MSG.MESSAGE_NOT_ACKED,
  );
  const observation = await observeCreateDeliveryAdmission(owner, operation);
  const authoritativeOperation = observation?.operation || null;
  if (isRetainedAdmission(owner, operation, authoritativeOperation)) {
    Object.assign(operation, authoritativeOperation);
    return buildRetainedCreateDelivery(operation, errorMsg, owner);
  }
  if (createDeliveryAuthorityDiverged(operation, authoritativeOperation)) {
    scheduleCreateDeliveryObservation(owner, operation);
    return buildDeferredCreateDelivery(owner, operation, errorMsg);
  }
  if (owner.repository.isOperationTerminal(authoritativeOperation)) {
    Object.assign(operation, authoritativeOperation);
    return resolveTerminalCreateDelivery(owner, operation, errorMsg);
  }
  if (owner.deferDispatchRetry(operation, errorLike)) {
    return buildDeferredCreateDelivery(owner, operation, errorMsg);
  }
  const terminalOutcome = await owner.failOperation(operation, errorMsg, {
    requireCreateAdmissionAbsent: true,
    deferWhenCreateAdmissionWins: true,
  });
  if (terminalOutcome?.createAdmissionWon === true) {
    Object.assign(operation, terminalOutcome.operation);
    return buildRetainedCreateDelivery(operation, errorMsg, owner);
  }
  if (Number.isFinite(operation.completedAt)) {
    return resolveTerminalCreateDelivery(owner, operation, errorMsg);
  }
  scheduleCreateDeliveryObservation(owner, operation);
  return buildDeferredCreateDelivery(owner, operation, errorMsg);
}

export {
  isRetainedCreateDeliveryResolution,
  resolveAmbiguousCreateDeliveryFailure,
  scheduleUnretainedCreateDelivery,
};

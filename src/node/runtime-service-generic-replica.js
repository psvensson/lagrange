// The handler's generic runtime-service execution. It shares the installed
// entry lifetime with bound work, but preserves the generic lifecycle path.
import {UNIFIED_SERVICE_TYPE, WORKFLOW_STEP} from '../constants/index.js';
import {ReplicaStatus} from '../rebalancer/replica-status.js';
import {ReplicaOperationMessageType, ReplicaOperationResponseStatus} from
  '../rebalancer/replica-operation-constants.js';
import {EXECUTOR_OUTCOME_TYPE} from '../rebalancer/executor-outcome-constants.js';
import {currentExecution, releaseExecution, executionRefusal,
  replyToGenericExecutionGate} from './runtime-service-creation-execution.js';
import {
  SERVICE_DEFINITION_RESOLUTION_OUTCOME,
} from './runtime-service-definition-resolution.js';
import {RUNTIME_SERVICE_HANDLER_ERROR_MSG, RUNTIME_SERVICE_HANDLER_LOG_MSG} from
  './runtime-service-handler-constants.js';

const FUNCTION_TYPE = 'function';
const BOOLEAN_TYPE = 'boolean';

function buildDefinitionResolutionError(entityId, outcome) {
  if (outcome === SERVICE_DEFINITION_RESOLUTION_OUTCOME.UNAVAILABLE) {
    const formatAuthorityUnavailable =
      RUNTIME_SERVICE_HANDLER_ERROR_MSG.DEFINITION_AUTHORITY_UNAVAILABLE;
    const error = new Error(formatAuthorityUnavailable(entityId));
    error.errorCode =
      RUNTIME_SERVICE_HANDLER_ERROR_MSG.DEFINITION_AUTHORITY_UNAVAILABLE_CODE;
    error.deferRetry = true;
    return error;
  }
  const formatDefinitionNotFound =
    RUNTIME_SERVICE_HANDLER_ERROR_MSG.DEFINITION_NOT_FOUND;
  const error = new Error(formatDefinitionNotFound(entityId));
  error.errorCode =
    outcome === SERVICE_DEFINITION_RESOLUTION_OUTCOME.INELIGIBLE ?
      RUNTIME_SERVICE_HANDLER_ERROR_MSG.DEFINITION_INELIGIBLE :
      RUNTIME_SERVICE_HANDLER_ERROR_MSG.DEFINITION_NOT_FOUND_CODE;
  error.deferRetry = false;
  return error;
}

async function resolveDefinitionForGenericCreate(handler, entityId) {
  if (typeof handler.resolveServiceDefinitionOutcomeForCreate === FUNCTION_TYPE) {
    const resolution = await handler.resolveServiceDefinitionOutcomeForCreate(
      entityId,
    );
    if (
      resolution?.outcome !== SERVICE_DEFINITION_RESOLUTION_OUTCOME.ELIGIBLE ||
      !resolution?.definition
    ) {
      throw buildDefinitionResolutionError(
        entityId,
        resolution?.outcome || SERVICE_DEFINITION_RESOLUTION_OUTCOME.ABSENT,
      );
    }
    return resolution.definition;
  }
  const definition =
    typeof handler.resolveServiceDefinitionForCreate === FUNCTION_TYPE ?
      await handler.resolveServiceDefinitionForCreate(entityId) :
      handler.resolveServiceDefinition(entityId);
  if (!definition) {
    throw buildDefinitionResolutionError(
      entityId,
      SERVICE_DEFINITION_RESOLUTION_OUTCOME.ABSENT,
    );
  }
  return definition;
}

function buildGenericFailedOutcomeOptions(replicaId, error) {
  return {
    replicaId,
    errorMessage: error.message,
    ...(error?.errorCode ? {errorCode: error.errorCode} : {}),
    ...(typeof error?.deferRetry === BOOLEAN_TYPE ?
      {deferRetry: error.deferRetry} :
      {}),
  };
}

async function genericCreateHandle(handler, entityId, replicaId) {
  const definition = await resolveDefinitionForGenericCreate(handler, entityId);

  return {
    serviceId: replicaId,
    serviceType: UNIFIED_SERVICE_TYPE.RUNTIME_SERVICE,
    replicaId,
    entityId,
    nodeId: handler.nodeId,
    ...definition,
    // service_definitions rows are stored snake_case, but the runtime
    // descriptor validator (and adapter) read camelCase. Provide the
    // camelCase runtime fields additively so a placed replica validates;
    // without this every runtime-service create fails "runtime_kind is
    // required". (Accept an already-camelCase definition too.)
    runtimeKind: definition.runtime_kind ?? definition.runtimeKind ?? null,
    runtimeRef: definition.runtime_ref ?? definition.runtimeRef ?? null,
    runtimeConfig:
        definition.runtime_config ?? definition.runtimeConfig ?? null,
  };
}

async function createGenericReplica(handler, params, entry) {
  if (!currentExecution(handler, entry) || entry.params !== params) return;
  const {operationId, entityId, replicaId} = params;
  try {
    const replicaHandle = await genericCreateHandle(handler, entityId, replicaId);
    if (!currentExecution(handler, entry)) return;

    await handler.serviceLifecycleManager.createReplica(
      replicaHandle, {nodeId: handler.nodeId},
    );
    if (!currentExecution(handler, entry)) return;
    await handler.serviceLifecycleManager.startReplica(
      replicaHandle, {nodeId: handler.nodeId},
    );
    if (!currentExecution(handler, entry)) return;

    handler.localReplicas.set(replicaId, {
      replicaHandle,
      replicaId,
      entityId,
      status: ReplicaStatus.ACTIVE,
    });

    // Emit active outcome — coordinator will transition workflow.
    handler.emitExecutorOutcome(
      EXECUTOR_OUTCOME_TYPE.RUNTIME_SERVICE_CREATE_ACTIVE,
      operationId,
      WORKFLOW_STEP.ACTIVE,
      {replicaId},
    );

    handler.logger.info(
      RUNTIME_SERVICE_HANDLER_LOG_MSG.CREATE_COMPLETED,
      {operationId, replicaId, entityId, nodeId: handler.nodeId},
    );
  } catch (error) {
    if (!currentExecution(handler, entry)) return;
    handler.localReplicas.set(replicaId, {
      replicaId,
      entityId,
      status: ReplicaStatus.FAILED,
      ...(error?.deferRetry === true ? {deferRetry: true} : {}),
    });

    // Emit failed outcome — coordinator will transition workflow.
    handler.emitExecutorOutcome(
      EXECUTOR_OUTCOME_TYPE.RUNTIME_SERVICE_CREATE_FAILED,
      operationId,
      WORKFLOW_STEP.FAILED,
      buildGenericFailedOutcomeOptions(replicaId, error),
    );

    handler.logger.error(
      RUNTIME_SERVICE_HANDLER_LOG_MSG.CREATE_FAILED,
      {
        operationId, replicaId, entityId,
        error: error.message, nodeId: handler.nodeId,
      },
    );
  } finally {
    releaseExecution(handler, entry);
  }
}

// The existing admitted execution is the only holder of this local memo
// until the generic STOP settles. In-flight identity alone is not sufficient:
// another local generation can replace a replicaId while STOP is queued or
// waiting on the adapter. A late old continuation must not stop or publish
// over that successor.
function currentRemovalMemo(handler, entry) {
  return currentExecution(handler, entry) && entry?.admittedMemo !== undefined &&
    handler.localReplicas.get(entry.replicaId) === entry.admittedMemo;
}

async function removeGenericReplica(handler, {
  operationId, entityId, replicaId, reason,
}, entry) {
  try {
    if (!currentRemovalMemo(handler, entry)) return;
    const definition = handler.resolveServiceDefinition(entityId);
    const replicaHandle = {
      serviceId: replicaId,
      serviceType: UNIFIED_SERVICE_TYPE.RUNTIME_SERVICE,
      replicaId,
      entityId,
      nodeId: handler.nodeId,
      ...(definition || {}),
    };

    // This is the last synchronous fence before invoking an irreversible
    // physical STOP. The owner may have replaced the memo after scheduling.
    if (!currentRemovalMemo(handler, entry)) return;
    await handler.serviceLifecycleManager.stopReplica(
      replicaHandle, {nodeId: handler.nodeId, reason},
    );
    if (!currentRemovalMemo(handler, entry)) return;

    handler.localReplicas.set(replicaId, {
      replicaId, entityId, status: ReplicaStatus.REMOVED,
    });

    // Emit removed outcome — coordinator will transition workflow.
    handler.emitExecutorOutcome(
      EXECUTOR_OUTCOME_TYPE.RUNTIME_SERVICE_REMOVE_COMPLETED,
      operationId,
      WORKFLOW_STEP.REMOVED,
      {replicaId},
    );

    handler.logger.info(
      RUNTIME_SERVICE_HANDLER_LOG_MSG.REMOVE_COMPLETED,
      {operationId, replicaId, entityId, nodeId: handler.nodeId},
    );
  } catch (error) {
    if (!currentRemovalMemo(handler, entry)) return;
    handler.localReplicas.set(replicaId, {
      replicaId, entityId, status: ReplicaStatus.FAILED,
    });

    // Emit failed outcome — coordinator will transition workflow.
    handler.emitExecutorOutcome(
      EXECUTOR_OUTCOME_TYPE.RUNTIME_SERVICE_REMOVE_FAILED,
      operationId,
      WORKFLOW_STEP.FAILED,
      {replicaId, errorMessage: error.message},
    );

    handler.logger.error(
      RUNTIME_SERVICE_HANDLER_LOG_MSG.REMOVE_FAILED,
      {
        operationId, replicaId, entityId,
        error: error.message, nodeId: handler.nodeId,
      },
    );
  } finally {
    releaseExecution(handler, entry);
  }
}

function admitGenericRemoval(handler, params, replica) {
  const {operationId, replicaId} = params;
  // The shared execution owner only acknowledges an exact duplicate.
  // A foreign REMOVE has no registered outcome observer and must retry.
  const joined = replyToGenericExecutionGate(handler, params,
    ReplicaOperationMessageType.REMOVE_REPLICA);
  if (joined !== undefined) return joined;
  if (replica.status === ReplicaStatus.REMOVED) {
    handler.logger.info(RUNTIME_SERVICE_HANDLER_LOG_MSG.REMOVE_ALREADY_REMOVED,
      {replicaId, nodeId: handler.nodeId});
    return {status: ReplicaOperationResponseStatus.COMPLETED, replicaId, nodeId: handler.nodeId};
  }
  const entry = handler.trackReplicaRemovalOperation(params);
  if (entry === undefined) return executionRefusal(handler);
  const admittedMemo = {...replica, status: ReplicaStatus.REMOVING};
  entry.admittedMemo = admittedMemo;
  handler.localReplicas.set(replicaId, admittedMemo);
  handler.startRemoveReplicaAsync(params, entry);
  return {status: replica.status === ReplicaStatus.REMOVING ?
    ReplicaOperationResponseStatus.IN_PROGRESS : ReplicaOperationResponseStatus.INITIATED,
  operationId, replicaId, nodeId: handler.nodeId};
}

export {createGenericReplica, removeGenericReplica, admitGenericRemoval};

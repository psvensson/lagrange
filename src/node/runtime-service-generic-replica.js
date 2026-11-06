// The handler's generic runtime-service execution. It shares the installed
// entry lifetime with bound work, but preserves the generic lifecycle path.
import {UNIFIED_SERVICE_TYPE, WORKFLOW_STEP} from '../constants/index.js';
import {ReplicaStatus} from '../rebalancer/replica-status.js';
import {ReplicaOperationMessageType, ReplicaOperationResponseStatus} from
  '../rebalancer/replica-operation-constants.js';
import {EXECUTOR_OUTCOME_TYPE} from '../rebalancer/executor-outcome-constants.js';
import {currentExecution, releaseExecution, executionRefusal,
  replyToGenericExecutionGate} from './runtime-service-creation-execution.js';
import {RUNTIME_SERVICE_HANDLER_LOG_MSG} from
  './runtime-service-handler-constants.js';

const BOOLEAN_TYPE = 'boolean';

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

function genericCreateHandle(handler, entityId, replicaId, resolution) {
  const definition = resolution.definition;

  return {
    ...definition,
    serviceId: replicaId,
    serviceType: UNIFIED_SERVICE_TYPE.RUNTIME_SERVICE,
    replicaId,
    entityId,
    nodeId: handler.nodeId,
    // service_definitions rows are stored snake_case, but the runtime
    // descriptor validator (and adapter) read camelCase. Provide the
    // camelCase runtime fields at this representation boundary.
    runtimeKind: definition.runtime_kind ?? null,
    runtimeRef: definition.runtime_ref ?? null,
    runtimeConfig:
        definition.runtime_config ?? null,
  };
}

async function createGenericReplica(handler, params, entry, resolution) {
  if (!currentExecution(handler, entry) || entry.params !== params) return;
  const {operationId, entityId, replicaId} = params;
  try {
    const replicaHandle = genericCreateHandle(handler, entityId, replicaId, resolution);
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

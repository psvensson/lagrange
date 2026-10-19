// The handler's existing canonical execution gate. Startup plans retain one
// admission marker each; only this map entry owns an admitted attempt.
import {SERVICE_INSTANCE_LIMIT as LIMIT, SERVICE_INSTANCE_OUTCOME as OUTCOME} from
  '../constants/service-instance.js';
import {captureInstanceJson, instanceDigest} from
  '../control-plane/owners/service-instance-contract.js';
import {matchesInstanceResourceToken} from '../control-plane/owners/service-instance-state.js';
import {ReplicaOperationMessageType as MESSAGE_TYPE, ReplicaOperationResponseStatus as REPLY} from
  '../rebalancer/replica-operation-constants.js';
import {RUNTIME_SERVICE_HANDLER_ERROR_MSG as ERROR,
  RUNTIME_SERVICE_RESTART_PLAN_STATE as PLAN_STATE} from './runtime-service-handler-constants.js';

function captureCreationRequest(request, params) {
  return {...params, request: captureInstanceJson(request, LIMIT.STATE_BYTES)};
}

function sameJson(left, right) {
  return instanceDigest(left) === instanceDigest(right);
}

function matchesSuppliedOrigin(request, origin) {
  const fields = [
    [request.intent, origin.intent], [request.descriptor, origin.intent.descriptor],
    [request.consensusBinding, origin.intent.consensusBinding],
    [request.consensusSlotRequest, origin.intent.consensusSlotRequest],
    [request.consensusResourceToken, origin.token], [request.token, origin.token],
    [request.consensusCreation?.intent, origin.intent],
    [request.consensusCreation?.token, origin.token],
    [request.consensusCreation?.operationId, origin.operationId],
  ];
  return fields.every(([provided, retained]) =>
    provided === undefined || sameJson(provided, retained));
}

function matchesCreationRequest(handler, origin, params) {
  try {
    return origin.operationId === params.operationId &&
      origin.intent.descriptor.serviceId === params.entityId &&
      origin.intent.consensusSlotRequest.replicaId === params.replicaId &&
      origin.intent.consensusSlotRequest.nodeId === handler.nodeId &&
      matchesSuppliedOrigin(params.request ?? {}, origin);
  } catch (_error) {
    return false;
  }
}

function matchesCreationWake(origin, serviceDefinitionId, wake) {
  try {
    return origin?.intent.descriptor.serviceId === serviceDefinitionId &&
      sameJson(wake.binding, origin.intent.consensusBinding) &&
      matchesInstanceResourceToken(origin.intent.consensusBinding,
        origin.intent.consensusSlotRequest, wake.token) &&
      (origin.token === null || sameJson(origin.token, wake.token));
  } catch (_error) {
    return false;
  }
}

function replicaExecution(handler, replicaId) {
  return [...handler.inProgressOperations.values()].find((entry) => entry.replicaId === replicaId);
}

function executionForRequest(handler, operationId) {
  return [...handler.inProgressOperations.values()].find((entry) =>
    entry.operationId === operationId || entry.observer?.operationId === operationId);
}

function sameExecutionRequest(entry, params) {
  return entry.operationId === params.operationId && entry.entityId === params.entityId &&
    entry.replicaId === params.replicaId && entry.reason === params.reason &&
    sameJson(entry.request ?? {}, params.request ?? {});
}

function executionRequestConflict(handler, params, type) {
  const entry = executionForRequest(handler, params.operationId);
  if (entry === undefined) return false;
  const request = entry.observer?.operationId === params.operationId ? entry.observer : entry;
  // A restart-created entry deliberately has no inbound request envelope. Its
  // original journaled creation, not an empty synthetic envelope, is the
  // authority for an exact duplicate of that same in-flight CREATE.
  if (entry.type === type && type === MESSAGE_TYPE.CREATE_REPLICA &&
      request === entry && entry.origin !== undefined &&
      entry.params?.request === undefined && params.request !== undefined) {
    return !matchesCreationRequest(handler, entry.origin, params);
  }
  return entry.type !== type || !sameExecutionRequest(request, params);
}

function currentExecution(handler, entry) {
  return !handler.stopped && entry !== undefined &&
    handler.inProgressOperations.get(entry.operationId) === entry;
}

function retainedCreationPlan(handler, operationId) {
  return handler.restartTask?.applied === true ?
    handler.restartTask.plansById.get(operationId) : undefined;
}

function executionRefusal(handler, reason = ERROR.RETIREMENT_IN_PROGRESS, deferRetry = true) {
  return {status: REPLY.ERROR, error: reason, errorCode: reason,
    deferRetry, nodeId: handler.nodeId};
}

function inProgressReply(handler, replicaId) {
  return {status: REPLY.IN_PROGRESS, replicaId, nodeId: handler.nodeId};
}

function installExecution(handler, params, type, options = {}) {
  if (handler.stopped || replicaExecution(handler, params.replicaId) !== undefined ||
      executionForRequest(handler, params.operationId) !== undefined) return undefined;
  const entry = {...params, type, params, startedAt: Date.now(), wakePending: false, ...options};
  handler.inProgressOperations.set(params.operationId, entry);
  if (entry.plan !== undefined) {
    entry.plan.state = PLAN_STATE.RUNNING;
    entry.plan.queued = false;
    entry.plan.wakePending = false;
  }
  return entry;
}

function releaseExecution(handler, entry) {
  if (!currentExecution(handler, entry)) return false;
  handler.inProgressOperations.delete(entry.operationId);
  handler.resumeRestartPlans(entry.replicaId);
  return true;
}

function sameCoordinatorRequest(entry, params, creationOperationId) {
  return sameExecutionRequest(entry, params) && entry.creationOperationId === creationOperationId;
}

function joinRetirementObserver(handler, entry, params, creationOperationId) {
  const requestEntry = executionForRequest(handler, params.operationId);
  if (requestEntry !== undefined && requestEntry !== entry) {
    return executionRefusal(handler, OUTCOME.CONTENT_CONFLICT, false);
  }
  if (entry.creationOperationId !== creationOperationId || entry.entityId !== params.entityId) {
    return executionRefusal(handler);
  }
  if (entry.silent !== true) {
    return sameCoordinatorRequest(entry, params, creationOperationId) ?
      inProgressReply(handler, params.replicaId) :
      executionRefusal(handler, entry.operationId === params.operationId ?
        OUTCOME.CONTENT_CONFLICT : ERROR.RETIREMENT_IN_PROGRESS,
      entry.operationId !== params.operationId);
  }
  const observer = entry.observer;
  if (observer === undefined) {
    entry.observer = {...params, creationOperationId};
    return inProgressReply(handler, params.replicaId);
  }
  return sameCoordinatorRequest(observer, params, creationOperationId) ?
    inProgressReply(handler, params.replicaId) :
    executionRefusal(handler, observer.operationId === params.operationId ?
      OUTCOME.CONTENT_CONFLICT : ERROR.RETIREMENT_IN_PROGRESS,
    observer.operationId !== params.operationId);
}

export {captureCreationRequest, matchesCreationRequest, matchesCreationWake, replicaExecution,
  currentExecution, retainedCreationPlan, executionRefusal, inProgressReply, installExecution,
  releaseExecution, joinRetirementObserver, executionForRequest, executionRequestConflict};

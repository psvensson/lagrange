// Message envelope dispatch for RuntimeServiceHandler. Replica execution and
// cell invocation remain owned by the handler's existing operation paths.
import {ReplicaOperationMessageType, ReplicaOperationResponseStatus} from
  '../rebalancer/replica-operation-constants.js';
import {REQUEST_CELL_ROUTE_MESSAGE_TYPE, REQUEST_CELL_ROUTE_OPERATION} from
  '../service/request-cell-routing-contract.js';
import {CALL_CELL_ROUTE_MESSAGE_TYPE, CALL_CELL_ROUTE_OPERATION} from
  '../service/call-cell-routing-contract.js';
import {RUNTIME_SERVICE_HANDLER_ERROR_MSG} from './runtime-service-handler-constants.js';

function resolveRequestCellServiceEnvelope(envelope) {
  if (envelope?.operation === REQUEST_CELL_ROUTE_OPERATION) {
    return envelope;
  }
  if (envelope?.payload?.operation === REQUEST_CELL_ROUTE_OPERATION) {
    return envelope.payload;
  }
  return null;
}

function resolveCallCellServiceEnvelope(envelope) {
  if (envelope?.operation === CALL_CELL_ROUTE_OPERATION) {
    return envelope;
  }
  if (envelope?.payload?.operation === CALL_CELL_ROUTE_OPERATION) {
    return envelope.payload;
  }
  return null;
}

async function dispatchRuntimeServiceMessage(
  handler,
  type,
  payload,
  serviceEnvelope,
) {
  if (type === ReplicaOperationMessageType.CREATE_REPLICA) {
    return handler.handleCreateReplica(payload);
  }
  if (type === ReplicaOperationMessageType.REMOVE_REPLICA) {
    return handler.handleRemoveReplica(payload);
  }
  if (type === REQUEST_CELL_ROUTE_MESSAGE_TYPE) {
    return handler.handleRequestCellInvocation(serviceEnvelope);
  }
  if (type === CALL_CELL_ROUTE_MESSAGE_TYPE) {
    return handler.handleCallCellInvocation(serviceEnvelope);
  }
  const unknownType =
    RUNTIME_SERVICE_HANDLER_ERROR_MSG.UNKNOWN_MESSAGE_TYPE;
  return {status: ReplicaOperationResponseStatus.ERROR, error: unknownType(type)};
}


export {resolveRequestCellServiceEnvelope, resolveCallCellServiceEnvelope,
  dispatchRuntimeServiceMessage};

import {performance} from 'node:perf_hooks';
import {
  MESSAGE_ROUTER_LITERAL,
  extractSqlOperationKind,
} from '../transport/message-router-shared-vocabulary.js';

// Process-local field diagnostic. The request object links the two generated
// IDs without adding metadata to a delivery option or a serialized frame.
const SERVICES_QUERY_TRACE_ENV = 'LAGRANGE_SERVICES_QUERY_TRACE';
const TRACE_EVENT = 'services_query_delivery_trace';
const TRACE_MESSAGE = 'Services query delivery trace';
const TRACE_LOG_LEVEL = 'info';
const QUERY_SUCCESS_FIELD = 'success';
const QUERY_TRACE_STAGE = Object.freeze({
  RECORD_LIMIT_REACHED: 'record_limit_reached',
  QUERY_START: 'query_start',
  QUERY_FAILED: 'query_failed',
  QUERY_SUCCEEDED: 'query_succeeded',
  OUTER_DISPATCH: 'outer_dispatch',
  OUTER_OUTCOME: 'outer_outcome',
  OUTER_CLOSED: 'outer_retired',
  MESSAGE_GROUP_DISPATCH: 'message_group_dispatch',
  SERVICE_SOCKET_NOT_OPEN: 'service_socket_not_open',
  ACK_WAIT_CLOSED: 'ack_wait_retired',
  SERVICE_PRE_HANDOFF_REFUSED: 'service_pre_handoff_refused',
  SERVICE_WRITE_CALLBACK: 'service_write_callback',
  SERVICE_SOCKET_HANDOFF: 'service_socket_handoff',
  SERVICE_WRITE_THREW: 'service_write_threw',
  WRITE_CALLBACK: 'write_callback',
  WRITE_THREW: 'write_threw',
  SOCKET_HANDOFF: 'socket_handoff',
  SOCKET_NOT_OPEN: 'socket_not_open',
  FRAME_PARSED: 'frame_parsed',
  FRAME_AUTH_REFUSED: 'frame_auth_refused',
  ACK_RECEIVED: 'ack_received',
  PARTITION_HANDLER_MISSING: 'partition_handler_missing',
  PARTITION_DISPATCH: 'partition_dispatch',
  RESPONSE_RECEIVED: 'response_received',
});
const TRACE_WINDOW_MS = 120_000;
const TRACE_MAX_RECORDS = 2_400;
const TRACE_MAX_OUTBOUND_IDS = 256;
const TRACE_FIELD_LENGTH = 96;
const TRACE_ENABLED = process.env[SERVICES_QUERY_TRACE_ENV] === '1';
const SERVICES_PARTITION = 'services-p1';
const SERVICES_REPLICA_ADDRESS = /\/partition\/services-p1-r[0-9]+$/;
class ServicesQueryTraceState {
  requests = new WeakMap();
  outbound = new WeakMap();
  startedAtMs = null;
  stopped = !TRACE_ENABLED;
  sequence = 0;
  querySequence = 0;

  stop() {
    this.stopped = true;
    this.requests = new WeakMap();
    this.outbound = new WeakMap();
  }
}

const traceState = new ServicesQueryTraceState();

function isServicesQueryTraceOpen() {
  if (traceState.stopped) return false;
  if (traceState.startedAtMs === null ||
      performance.now() - traceState.startedAtMs < TRACE_WINDOW_MS) return true;
  traceState.stop();
  return false;
}

function isTracedServicesAddress(address) {
  return isServicesQueryTraceOpen() && typeof address === 'string' &&
    SERVICES_REPLICA_ADDRESS.test(address);
}

function boundedField(value) {
  if (typeof value === 'string') return value.slice(0, TRACE_FIELD_LENGTH);
  if (typeof value === 'boolean' || Number.isFinite(value)) return value;
  return null;
}

function recordServicesQueryTrace(owner, stage, fields) {
  if (!isServicesQueryTraceOpen()) return;
  try {
    const now = performance.now();
    traceState.startedAtMs ??= now;
    traceState.sequence += 1;
    const exhausted = traceState.sequence > TRACE_MAX_RECORDS;
    if (exhausted) traceState.stop();
    owner.logger.logConsoleOnly(TRACE_LOG_LEVEL, TRACE_MESSAGE, {
      event: TRACE_EVENT,
      sequence: traceState.sequence,
      stage: exhausted ? QUERY_TRACE_STAGE.RECORD_LIMIT_REACHED : stage,
      atMs: Date.now(),
      processElapsedMs: now - traceState.startedAtMs,
      nodeId: boundedField(owner.nodeId),
      bootIncarnation: boundedField(owner.bootIncarnation),
      ...(exhausted ? {} : Object.fromEntries(Object.entries(fields).map(
        ([key, value]) => [key, boundedField(value)],
      ))),
    });
  } catch (_error) {
    // Stop measuring if the capture sink fails. Delivery continues.
    traceState.stop();
  }
}

const NO_QUERY_TRACE = Object.freeze({
  bind: (request) => request,
  finish: (result) => result,
  fail: (result) => result,
});

function startServicesPartitionQuery(executor, partitionId, forRead) {
  if (forRead !== true || partitionId !== SERVICES_PARTITION || !isServicesQueryTraceOpen()) {
    return NO_QUERY_TRACE;
  }
  const queryId = ++traceState.querySequence;
  recordServicesQueryTrace(executor, QUERY_TRACE_STAGE.QUERY_START, {
    queryId, partitionId, forRead,
  });
  return {
    bind(request) {
      if (request !== null && typeof request === 'object') {
        traceState.requests.set(request, {queryId});
      }
      return request;
    },
    finish(result) {
      const success = Object.getOwnPropertyDescriptor(result ?? {}, QUERY_SUCCESS_FIELD)?.value;
      const stage = success === false ?
        QUERY_TRACE_STAGE.QUERY_FAILED : QUERY_TRACE_STAGE.QUERY_SUCCEEDED;
      recordServicesQueryTrace(executor, stage, {queryId, partitionId});
      return result;
    },
    fail(result) {
      recordServicesQueryTrace(executor, QUERY_TRACE_STAGE.QUERY_FAILED, {queryId, partitionId});
      return result;
    },
  };
}

function isTracedServicesRead(router, address, request) {
  return isTracedServicesAddress(address) && router.isQueryDataPlaneMessage(request) &&
    extractSqlOperationKind(request.sql) === MESSAGE_ROUTER_LITERAL.STRING_SELECT;
}

function isTracedServicesReadFrame(router, address, payload, messageId) {
  return isTracedServicesRead(router, address,
    payload?.messageId === messageId ? payload.payload : payload);
}

function traceOuterServicesQuery(router, request, address, messageId) {
  if (!isTracedServicesRead(router, address, request)) {
    return null;
  }
  const queryId = traceState.requests.get(request)?.queryId ?? null;
  traceState.requests.set(request, {queryId, outerId: messageId});
  recordServicesQueryTrace(router, QUERY_TRACE_STAGE.OUTER_DISPATCH, {address, messageId, queryId});
  return (stage, fields) =>
    recordServicesQueryTrace(router, stage, {address, messageId, queryId, ...fields});
}

function traceMessageGroupQuery(service, request, address, messageId) {
  if (!isTracedServicesAddress(address)) return;
  const binding = traceState.requests.get(request);
  if (binding?.outerId === undefined) return;
  recordServicesQueryTrace(service, QUERY_TRACE_STAGE.MESSAGE_GROUP_DISPATCH, {
    address, messageId, ...binding,
  });
}

function traceOutboundServicesQuery(
  router, targetAddress, payload, messageId, targetNodeId, connectionId,
) {
  if (!isTracedServicesReadFrame(router, targetAddress, payload, messageId)) return null;
  if (typeof messageId !== 'string' || messageId.length > TRACE_FIELD_LENGTH) return null;
  let messages = traceState.outbound.get(router);
  if (!messages) {
    messages = new Map();
    traceState.outbound.set(router, messages);
  }
  if (!messages.has(messageId) && messages.size >= TRACE_MAX_OUTBOUND_IDS) {
    messages.delete(messages.keys().next().value);
  }
  const trace = {
    targetAddress: boundedField(targetAddress),
    targetNodeId: boundedField(targetNodeId),
    sentConnectionId: boundedField(connectionId),
  };
  messages.set(messageId, trace);
  return trace;
}

function getOutboundServicesQueryTrace(router, messageId) {
  if (!isServicesQueryTraceOpen()) return null;
  return traceState.outbound.get(router)?.get(messageId) ?? null;
}

export {
  SERVICES_QUERY_TRACE_ENV,
  QUERY_TRACE_STAGE,
  getOutboundServicesQueryTrace,
  isServicesQueryTraceOpen,
  isTracedServicesReadFrame,
  recordServicesQueryTrace,
  startServicesPartitionQuery,
  traceMessageGroupQuery,
  traceOuterServicesQuery,
  traceOutboundServicesQuery,
};

import {performance} from 'node:perf_hooks';

// Process-local field diagnostic. The request object links the two generated
// IDs without adding metadata to a delivery option or a serialized frame.
const SERVICES_QUERY_TRACE_ENV = 'LAGRANGE_SERVICES_QUERY_TRACE';
const TRACE_EVENT = 'services_query_delivery_trace';
const TRACE_WINDOW_MS = 720_000;
const TRACE_MAX_RECORDS = 12_000;
const TRACE_FIELD_LENGTH = 96;
const TRACE_ENABLED = process.env[SERVICES_QUERY_TRACE_ENV] === '1';
const TRACE_STARTED_AT = TRACE_ENABLED ? performance.now() : 0;
const SERVICES_PARTITION = 'services-p1';
const SERVICES_REPLICA_ADDRESS = /\/partition\/services-p1-r[0-9]+$/;
const requests = new WeakMap();
const outbound = new WeakMap();
let sequence = 0;
let querySequence = 0;

function isServicesQueryTraceOpen() {
  return TRACE_ENABLED && performance.now() - TRACE_STARTED_AT < TRACE_WINDOW_MS &&
    sequence <= TRACE_MAX_RECORDS;
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
    sequence += 1;
    const exhausted = sequence > TRACE_MAX_RECORDS;
    owner.logger.logConsoleOnly('info', 'Services query delivery trace', {
      event: TRACE_EVENT,
      sequence,
      stage: exhausted ? 'record_limit_reached' : stage,
      atMs: Date.now(),
      processElapsedMs: performance.now() - TRACE_STARTED_AT,
      nodeId: boundedField(owner.nodeId),
      bootIncarnation: boundedField(owner.bootIncarnation),
      ...(exhausted ? {} : Object.fromEntries(Object.entries(fields).map(
        ([key, value]) => [key, boundedField(value)],
      ))),
    });
  } catch (_error) {
    // Logging cannot change a delivery outcome.
  }
}

function startServicesPartitionQuery(executor, partitionId, forRead) {
  if (!isServicesQueryTraceOpen() || partitionId !== SERVICES_PARTITION) return null;
  const queryId = ++querySequence;
  recordServicesQueryTrace(executor, 'query_start', {queryId, partitionId, forRead});
  return {
    bind(request) {
      if (request !== null && typeof request === 'object') {
        requests.set(request, {queryId});
      }
      return request;
    },
    observe(stage) {
      recordServicesQueryTrace(executor, stage, {queryId, partitionId});
    },
  };
}

function traceOuterServicesQuery(router, request, address, messageId) {
  if (!isTracedServicesAddress(address) || !router.isQueryDataPlaneMessage(request)) {
    return null;
  }
  const queryId = requests.get(request)?.queryId ?? null;
  requests.set(request, {queryId, outerId: messageId});
  recordServicesQueryTrace(router, 'outer_dispatch', {address, messageId, queryId});
  return (stage, fields) =>
    recordServicesQueryTrace(router, stage, {address, messageId, queryId, ...fields});
}

function traceMessageGroupQuery(service, request, address, messageId) {
  if (!isTracedServicesAddress(address)) return;
  const binding = requests.get(request);
  if (binding?.outerId === undefined) return;
  recordServicesQueryTrace(service, 'message_group_dispatch', {address, messageId, ...binding});
}

function traceOutboundServicesQuery(
  router, targetAddress, payload, messageId, targetNodeId, connectionId,
) {
  if (!isTracedServicesAddress(targetAddress) ||
      !(router.isQueryDataPlaneMessage(payload) ||
        (payload?.messageId === messageId && router.isQueryDataPlaneMessage(payload.payload)))) {
    return null;
  }
  let messages = outbound.get(router);
  if (!messages) {
    messages = new Map();
    outbound.set(router, messages);
  }
  if (messages.size >= TRACE_MAX_RECORDS) return null;
  const trace = {targetAddress, targetNodeId, sentConnectionId: connectionId};
  messages.set(messageId, trace);
  return trace;
}

function getOutboundServicesQueryTrace(router, messageId) {
  if (!isServicesQueryTraceOpen()) return null;
  return outbound.get(router)?.get(messageId) ?? null;
}

export {
  SERVICES_QUERY_TRACE_ENV,
  getOutboundServicesQueryTrace,
  isServicesQueryTraceOpen,
  isTracedServicesAddress,
  recordServicesQueryTrace,
  startServicesPartitionQuery,
  traceMessageGroupQuery,
  traceOuterServicesQuery,
  traceOutboundServicesQuery,
};

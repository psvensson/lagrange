import {ADMIN_ROUTE} from '../../../src/admin/admin-constants.js';
import {CLUSTER_BASE_LAYER} from './cluster-base-layer.js';

const {
  FETCH_TIMEOUT_MS, HTTP_METHOD_GET, HTTP_OK_LOWER, HTTP_OK_UPPER,
  ZERO, httpRequest, resolvePositiveTimeoutMs,
} = CLUSTER_BASE_LAYER;

const PROCESS_RESOURCE_DIAGNOSTICS_UNAVAILABLE_PREFIX =
  'Process resource diagnostics unavailable for node ';
const PROCESS_RESOURCE_DIAGNOSTICS_INVALID_PREFIX =
  'Process resource diagnostics invalid for node ';
const numberIsFinite = Number.isFinite;
const stringConstructor = String;

function requiredProcessResourceCounter(value, nodeId, field) {
  // Only an emitted measurement can be counted. Missing/null/boolean
  // counters cannot become measured zero through numeric coercion.
  if (!numberIsFinite(value) || value < ZERO) {
    throw new Error(
      PROCESS_RESOURCE_DIAGNOSTICS_INVALID_PREFIX + nodeId + ': ' + field,
    );
  }
  return value;
}

function normalizeProcessResourceDiagnostics(body, expectedNodeId) {
  if (
    !body ||
    typeof body !== 'object' ||
    body.nodeId !== expectedNodeId
  ) {
    throw new Error(
      PROCESS_RESOURCE_DIAGNOSTICS_INVALID_PREFIX +
        expectedNodeId + ': node identity',
    );
  }
  const latest = body?.diagnostics?.resources?.latest;
  const processSnapshot = latest?.process;
  if (
    !latest ||
    typeof latest !== 'object' ||
    !processSnapshot ||
    typeof processSnapshot !== 'object'
  ) {
    throw new Error(
      PROCESS_RESOURCE_DIAGNOSTICS_INVALID_PREFIX +
        expectedNodeId + ': resource sample',
    );
  }
  return {
    nodeId: expectedNodeId,
    capturedAt: requiredProcessResourceCounter(
      latest.timestamp,
      expectedNodeId,
      'timestamp',
    ),
    process: {
      rssBytes: requiredProcessResourceCounter(
        processSnapshot.rssBytes,
        expectedNodeId,
        'rssBytes',
      ),
      heapUsedBytes: requiredProcessResourceCounter(
        processSnapshot.heapUsedBytes,
        expectedNodeId,
        'heapUsedBytes',
      ),
      heapTotalBytes: requiredProcessResourceCounter(
        processSnapshot.heapTotalBytes,
        expectedNodeId,
        'heapTotalBytes',
      ),
      externalBytes: requiredProcessResourceCounter(
        processSnapshot.externalBytes,
        expectedNodeId,
        'externalBytes',
      ),
      arrayBuffersBytes: requiredProcessResourceCounter(
        processSnapshot.arrayBuffersBytes,
        expectedNodeId,
        'arrayBuffersBytes',
      ),
    },
  };
}

async function requestProcessResourceDiagnostics(node, options = {}) {
  const timeoutMs = resolvePositiveTimeoutMs(options.timeoutMs, FETCH_TIMEOUT_MS);
  const url = 'http://' + node.ip + ':' + node.adminApiPort +
    ADMIN_ROUTE.SERVICE_DIAGNOSTICS;
  const response = await httpRequest({
    url, timeoutMs, method: HTTP_METHOD_GET, includeBody: true,
  });
  const status = response?.status;
  if (!numberIsFinite(status) || status < HTTP_OK_LOWER || status > HTTP_OK_UPPER) {
    throw new Error(
      PROCESS_RESOURCE_DIAGNOSTICS_UNAVAILABLE_PREFIX + node.nodeId +
        ' (status=' + stringConstructor(status) + ')',
    );
  }
  return normalizeProcessResourceDiagnostics(response.body, node.nodeId);
}

export {requestProcessResourceDiagnostics};

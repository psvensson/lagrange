import {
  COLUMN,
  ENDPOINT_STATUS,
  NUM,
  SERVICE_STATUS,
  STATE,
  TRANSPORT_TYPE,
  TYPEOF,
} from '../constants/index.js';
import {
  CONTROL_PLANE_READINESS_DIMENSION,
} from './control-plane-readiness-constants.js';
import {
  normalizeNodeEndpointRow,
  normalizeNodeRow,
  normalizeServiceRow,
} from './system-row-normalizers.js';

function resolveReadyLeaseExpiresAtMs(row) {
  const readyLeaseExpiresAt = Number(
    row?.[COLUMN.READY_LEASE_EXPIRES_AT] ??
      row?.ready_lease_expires_at ??
      row?.readyLeaseExpiresAt,
  );
  return Number.isFinite(readyLeaseExpiresAt) ?
    readyLeaseExpiresAt :
    null;
}

function buildReadinessByNodeId(options = {}) {
  if (options.readinessByNodeId &&
      typeof options.readinessByNodeId === TYPEOF.OBJECT) {
    return options.readinessByNodeId;
  }

  const readinessEntries = Array.isArray(options.readinessEntries) ?
    options.readinessEntries :
    [];
  const readinessByNodeId = {};
  for (const entry of readinessEntries) {
    const normalizedNode = normalizeNodeRow(entry);
    if (!normalizedNode.nodeId) {
      continue;
    }
    readinessByNodeId[normalizedNode.nodeId] = entry;
  }
  return readinessByNodeId;
}

function isCanonicalWebSocketEndpointRow(endpointRow) {
  const normalizedEndpoint = normalizeNodeEndpointRow(endpointRow);
  return normalizedEndpoint.transportType ===
    String(TRANSPORT_TYPE.WEBSOCKET).toLowerCase() &&
    normalizedEndpoint.status ===
      String(ENDPOINT_STATUS.ACTIVE).toLowerCase() &&
    typeof normalizedEndpoint.address === TYPEOF.STRING &&
    normalizedEndpoint.address.length > NUM.ZERO;
}

function hasCanonicalWebSocketEndpoints(nodeEndpointRows = []) {
  return (Array.isArray(nodeEndpointRows) ? nodeEndpointRows : [])
    .some((row) => isCanonicalWebSocketEndpointRow(row));
}

function hasCanonicalWebSocketEndpoint(nodeId, nodeEndpointRows = []) {
  return (Array.isArray(nodeEndpointRows) ? nodeEndpointRows : [])
    .some((row) => {
      const normalizedEndpoint = normalizeNodeEndpointRow(row);
      return normalizedEndpoint.nodeId === nodeId &&
        isCanonicalWebSocketEndpointRow(row);
    });
}

function hasCanonicalActiveService(nodeId, serviceRows = []) {
  return (Array.isArray(serviceRows) ? serviceRows : [])
    .some((row) => {
      const normalizedService = normalizeServiceRow(row);
      return normalizedService.nodeId === nodeId &&
        normalizedService.status ===
          String(SERVICE_STATUS.ACTIVE).toLowerCase() &&
        typeof normalizedService.serviceId === TYPEOF.STRING &&
        normalizedService.serviceId.length > NUM.ZERO;
    });
}

function isCanonicallyActiveNode(nodeRow, options = {}) {
  const normalizedNode = normalizeNodeRow(nodeRow);
  if (!normalizedNode.nodeId) {
    return false;
  }
  if (normalizedNode.status !==
      String(SERVICE_STATUS.ACTIVE).toLowerCase()) {
    return false;
  }

  const readinessByNodeId = buildReadinessByNodeId(options);
  const readinessEntry = readinessByNodeId?.[normalizedNode.nodeId] || null;
  const readinessDimensions = readinessEntry?.dimensions &&
    typeof readinessEntry.dimensions === TYPEOF.OBJECT ?
    readinessEntry.dimensions :
    null;
  const hasReadinessEvidence = readinessDimensions &&
    Object.keys(readinessDimensions).length > NUM.ZERO;
  if (hasReadinessEvidence) {
    if (readinessDimensions[
      CONTROL_PLANE_READINESS_DIMENSION.CLUSTER_MEMBER_HEALTHY
    ] !== true) {
      return false;
    }
  } else {
    const nowMs = Number.isFinite(options.nowMs) ?
      options.nowMs :
      Date.now();
    const readyLeaseExpiresAtMs = resolveReadyLeaseExpiresAtMs(nodeRow);
    if (normalizedNode.connectionState !==
        String(STATE.READY).toLowerCase() ||
        !Number.isFinite(readyLeaseExpiresAtMs) ||
        readyLeaseExpiresAtMs <= nowMs) {
      return false;
    }
  }

  const nodeEndpointRows = Array.isArray(options.nodeEndpointRows) ?
    options.nodeEndpointRows :
    [];
  if (hasCanonicalWebSocketEndpoints(nodeEndpointRows) &&
      !hasCanonicalWebSocketEndpoint(
        normalizedNode.nodeId,
        nodeEndpointRows,
      )) {
    return false;
  }

  return true;
}

function resolveCanonicalActiveNodeIds(options = {}) {
  const nodeRows = Array.isArray(options.nodeRows) ? options.nodeRows : [];
  const readinessByNodeId = buildReadinessByNodeId(options);
  const nodeRowsById = new Map();
  for (const nodeRow of nodeRows) {
    const normalizedNode = normalizeNodeRow(nodeRow);
    if (!normalizedNode.nodeId) {
      continue;
    }
    nodeRowsById.set(normalizedNode.nodeId, nodeRow);
  }

  const candidateNodeIds = new Set([
    ...nodeRowsById.keys(),
    ...Object.keys(readinessByNodeId || {}),
  ]);
  const activeNodeIds = [];
  const requireWebSocketEndpoint =
    hasCanonicalWebSocketEndpoints(options.nodeEndpointRows);

  for (const nodeId of candidateNodeIds) {
    const nodeRow = nodeRowsById.get(nodeId) || null;
    if (nodeRow) {
      if (isCanonicallyActiveNode(nodeRow, {
        readinessByNodeId,
        nodeEndpointRows: options.nodeEndpointRows,
        serviceRows: options.serviceRows,
        nowMs: options.nowMs,
      })) {
        activeNodeIds.push(nodeId);
      }
      continue;
    }

    const readinessEntry = readinessByNodeId?.[nodeId] || null;
    const readinessDimensions = readinessEntry?.dimensions &&
      typeof readinessEntry.dimensions === TYPEOF.OBJECT ?
      readinessEntry.dimensions :
      null;
    if (!readinessDimensions ||
        readinessDimensions[
          CONTROL_PLANE_READINESS_DIMENSION.CLUSTER_MEMBER_HEALTHY
        ] !== true) {
      continue;
    }
    if (requireWebSocketEndpoint &&
        !hasCanonicalWebSocketEndpoint(nodeId, options.nodeEndpointRows)) {
      continue;
    }
    if (!hasCanonicalActiveService(nodeId, options.serviceRows) &&
        !hasCanonicalWebSocketEndpoint(nodeId, options.nodeEndpointRows)) {
      continue;
    }
    activeNodeIds.push(nodeId);
  }

  return [...new Set(
    activeNodeIds.filter((nodeId) =>
      typeof nodeId === TYPEOF.STRING &&
      nodeId.length > NUM.ZERO,
    ),
  )].sort();
}

export {
  buildReadinessByNodeId,
  hasCanonicalActiveService,
  hasCanonicalWebSocketEndpoint,
  hasCanonicalWebSocketEndpoints,
  isCanonicalWebSocketEndpointRow,
  isCanonicallyActiveNode,
  resolveCanonicalActiveNodeIds,
};

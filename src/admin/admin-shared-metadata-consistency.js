import {
  COLUMN,
  NUM,
  TYPEOF,
} from '../constants/index.js';

function normalizeNodeId(value) {
  if (typeof value !== TYPEOF.STRING) {
    return null;
  }
  const normalized = value.trim();
  return normalized.length > NUM.ZERO ? normalized : null;
}

function normalizeLowerString(value) {
  if (typeof value !== TYPEOF.STRING) {
    return null;
  }
  const normalized = value.trim().toLowerCase();
  return normalized.length > NUM.ZERO ? normalized : null;
}

function collectNodeIds(rows, fieldCandidates, predicate = null) {
  const nodeIds = new Set();
  const normalizedRows = Array.isArray(rows) ? rows : [];
  for (const row of normalizedRows) {
    if (predicate && predicate(row) !== true) {
      continue;
    }
    for (const fieldName of fieldCandidates) {
      const nodeId = normalizeNodeId(row?.[fieldName]);
      if (nodeId) {
        nodeIds.add(nodeId);
        break;
      }
    }
  }
  return nodeIds;
}

function isActiveServiceRow(row) {
  const status = normalizeLowerString(
    row?.[COLUMN.STATUS] ?? row?.status,
  );
  return status === 'active';
}

function isActiveEndpointRow(row) {
  const status = normalizeLowerString(
    row?.[COLUMN.STATUS] ?? row?.status,
  );
  return status === 'active' || status === null;
}

function sortNodeIds(nodeIds) {
  return [...nodeIds].sort((left, right) => left.localeCompare(right));
}

function evaluateSharedMetadataNodeCoverage(options = {}) {
  const observedNodeIds = collectNodeIds(
    options.nodeRows,
    [COLUMN.NODE_ID, 'node_id', 'nodeId', 'id'],
  );
  const referencedNodeIds = new Set();

  for (const nodeId of collectNodeIds(
    options.serviceRows,
    [COLUMN.NODE_ID, 'node_id', 'nodeId'],
    isActiveServiceRow,
  )) {
    referencedNodeIds.add(nodeId);
  }

  for (const nodeId of collectNodeIds(
    options.nodeEndpointRows,
    [COLUMN.NODE_ID, 'node_id', 'nodeId'],
    isActiveEndpointRow,
  )) {
    referencedNodeIds.add(nodeId);
  }

  for (const nodeId of collectNodeIds(
    options.partitionRows,
    [COLUMN.LEADER_NODE_ID, 'leader_node_id', 'leaderNodeId'],
  )) {
    referencedNodeIds.add(nodeId);
  }

  const missingNodeIds = sortNodeIds(
    new Set(
      [...referencedNodeIds].filter((nodeId) => !observedNodeIds.has(nodeId)),
    ),
  );

  return Object.freeze({
    hasCoverageGap: missingNodeIds.length > NUM.ZERO,
    observedNodeIds: Object.freeze(sortNodeIds(observedNodeIds)),
    referencedNodeIds: Object.freeze(sortNodeIds(referencedNodeIds)),
    missingNodeIds: Object.freeze(missingNodeIds),
  });
}

export {evaluateSharedMetadataNodeCoverage};

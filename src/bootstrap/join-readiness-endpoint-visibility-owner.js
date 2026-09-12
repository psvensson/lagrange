import {
  ENDPOINT_STATUS,
  TABLES,
  TRANSPORT_TYPE,
} from '../constants/index.js';
import {
  normalizeNodeEndpointRow,
} from '../control-plane/system-row-normalizers.js';

/**
 * Canonical bootstrap endpoint-visibility owner.
 *
 * Join admission is concerned with the node's bootstrap transport, not with
 * optional runtime services. Runtime services such as sys-postgres-wire have
 * their own desired-vs-actual placement and endpoint-publication owners and may
 * legitimately have replica_count=0 while the cluster forms.
 *
 * @param {Object|null} systemTableCache
 * @return {{ready:boolean, missingNodeEndpointNodeIds:string[],
 *   missingPostgresWireNodeIds:string[]}}
 */
function evaluateBootstrapEndpointVisibility(systemTableCache) {
  if (!systemTableCache ||
      typeof systemTableCache.getAll !== 'function') {
    return {
      ready: false,
      missingNodeEndpointNodeIds: [],
      missingPostgresWireNodeIds: [],
    };
  }

  const requiredNodeIds = [this.nodeId];
  const nodeEndpointRows =
    systemTableCache.getAll(TABLES.NODE_ENDPOINTS) || [];
  const visibleNodeEndpointNodeIds = new Set();

  for (const row of nodeEndpointRows) {
    const normalizedRow = normalizeNodeEndpointRow(row);
    const {nodeId, transportType, status} = normalizedRow;
    if (nodeId.length === 0) continue;
    if (status !== String(ENDPOINT_STATUS.ACTIVE).toLowerCase()) continue;
    if (transportType !==
        String(TRANSPORT_TYPE.WEBSOCKET).toLowerCase()) continue;
    visibleNodeEndpointNodeIds.add(nodeId);
  }

  const missingNodeEndpointNodeIds = requiredNodeIds.filter(
    (nodeId) => !visibleNodeEndpointNodeIds.has(nodeId),
  );

  return {
    ready: missingNodeEndpointNodeIds.length === 0,
    missingNodeEndpointNodeIds,
    // Retained as a compatibility diagnostic field. PG wire is a runtime
    // service and is deliberately not an input to generic node admission.
    missingPostgresWireNodeIds: [],
  };
}

function createJoinReadinessEndpointVisibilityOwnerMethods() {
  return {
    evaluateCanonicalJoinEndpointVisibility: {
      configurable: true,
      enumerable: false,
      writable: true,
      value: evaluateBootstrapEndpointVisibility,
    },
  };
}

export {
  createJoinReadinessEndpointVisibilityOwnerMethods,
  evaluateBootstrapEndpointVisibility,
};

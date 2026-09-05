import {
  COLUMN,
  SERVICE_STATUS,
  SERVICE_TYPE,
  TABLES,
} from '../../src/constants/index.js';
import {
  projectNodeLivenessSemantics,
} from '../../src/control-plane/node-liveness-semantic-projection.js';
import {
  installControlPlaneReadinessSnapshotStoreMethods,
} from '../../src/control-plane/control-plane-readiness-snapshot-store.js';

export function buildNodeLivenessTestEvidence(
  nodeIdOrRow,
  candidateRow = null,
) {
  const nodeRow = candidateRow && typeof candidateRow === 'object' ?
    candidateRow : nodeIdOrRow || {};
  const normalizedRow = {status: 'active', ...nodeRow};
  const rowConnectionState = normalizedRow.connection_state || null;
  return {
    nodeRow: normalizedRow,
    rowConnectionState,
    routerConnectionState: null,
    routerTransportConnected: false,
    transportConnected:
      rowConnectionState === 'connected' || rowConnectionState === 'ready',
  };
}

export function projectNodeLivenessForTest(
  nodeId,
  evidence,
  nowMs,
  staleHeartbeatMaxAgeMs,
) {
  return projectNodeLivenessSemantics({
    ...evidence,
    localNodeId: 'other-node',
    nodeId,
    nowMs,
    thresholds: {
      clusterMemberStaleHeartbeatMs: staleHeartbeatMaxAgeMs,
    },
  }).projection;
}

function buildNodeRowFromStoredReadinessSnapshot(stub, nodeId) {
  const evidence = stub.lastReadinessSnapshotByNodeId
    .get(nodeId)?.nodeEvidence;
  if (!evidence) return null;
  const row = {
    node_id: nodeId,
    status: evidence.status,
    connection_state: evidence.rowConnectionState,
    last_heartbeat: evidence.lastHeartbeat,
  };
  if (Number.isFinite(evidence.readyLeaseExpiresAt)) {
    row.ready_lease_expires_at = evidence.readyLeaseExpiresAt;
  }
  return row;
}

export function createReadinessSnapshotStoreTestStub({
  nowMs,
  staleHeartbeatMaxAgeMs,
  projectNodeLiveness,
  systemTableCache,
}) {
  const state = {nowMs};
  const stub = {
    now: () => state.nowMs,
    clusterMemberStaleHeartbeatMaxAgeMs: staleHeartbeatMaxAgeMs,
    ...(systemTableCache === undefined ? {} : {systemTableCache}),
    lastReadinessSnapshotByNodeId: new Map(),
    lastReadinessSnapshotAtMsByNodeId: new Map(),
    lastReadinessSnapshotInvalidatedAtMsByNodeId: new Map(),
    lastReadinessSnapshotClusterInvalidatedAtMs: 0,
    membershipPublicationDiagnosticsMemo: null,
    currentRecoveryEpochByNodeId: new Map(),
    recoveryEpochHistoryByNodeId: new Map(),
    nodeLivenessSemanticProjectionOwner: {
      projectNodeLivenessFromEvidence: projectNodeLiveness,
      recordAllSourceChanges() {},
      recordNodeSourceChange() {},
    },
    buildNodeLivenessSourceEvidence: buildNodeLivenessTestEvidence,
    getNodeRow(nodeId) {
      return buildNodeRowFromStoredReadinessSnapshot(this, nodeId);
    },
    getReadinessTransitionHistory: () => Object.freeze([]),
    recordRecoveryEpochObservation: () => {},
  };
  installControlPlaneReadinessSnapshotStoreMethods(stub);
  return {stub, state};
}

export function createCache({nodes = [], services = []} = {}) {
  const nodeRows = new Map(nodes.map((row) => [row[COLUMN.NODE_ID], row]));
  const serviceRows = new Map(
    services.map((row) => [row[COLUMN.SERVICE_ID], row]),
  );
  const listeners = new Set();

  function notify(tableName, operation, row) {
    for (const listener of listeners) {
      listener(tableName, operation, row, null);
    }
  }

  return {
    get(tableName, key) {
      if (tableName === TABLES.NODES) {
        return nodeRows.get(key) || null;
      }
      return null;
    },
    getAll(tableName) {
      if (tableName === TABLES.NODES) {
        return [...nodeRows.values()];
      }
      if (tableName === TABLES.SERVICES) {
        return [...serviceRows.values()];
      }
      return [];
    },
    filter(tableName, predicate) {
      if (tableName !== TABLES.SERVICES) {
        return [];
      }
      return [...serviceRows.values()].filter((row) => predicate(row));
    },
    applySystemTableChange(tableName, operation, row) {
      const normalizedOperation = String(operation || '').toUpperCase();
      if (tableName === TABLES.NODES) {
        const key = row?.[COLUMN.NODE_ID];
        if (!key) {
          return;
        }
        if (normalizedOperation === 'DELETE') {
          nodeRows.delete(key);
          notify(tableName, normalizedOperation, row);
          return;
        }
        const existing = nodeRows.get(key) || {};
        nodeRows.set(
          key,
          normalizedOperation === 'UPDATE' ?
            {...existing, ...row} :
            {...row},
        );
        notify(tableName, normalizedOperation, nodeRows.get(key));
      }
      if (tableName === TABLES.SERVICES) {
        const key = row?.[COLUMN.SERVICE_ID];
        if (!key) {
          return;
        }
        if (normalizedOperation === 'DELETE') {
          serviceRows.delete(key);
          notify(tableName, normalizedOperation, row);
          return;
        }
        const existing = serviceRows.get(key) || {};
        serviceRows.set(
          key,
          normalizedOperation === 'UPDATE' ?
            {...existing, ...row} :
            {...row},
        );
        notify(tableName, normalizedOperation, serviceRows.get(key));
      }
    },
    onCacheChange(listener) {
      listeners.add(listener);
    },
  };
}

export function createAccountingService(snapshots = {}) {
  return {
    async getCapacitySnapshotForNode(nodeId) {
      return snapshots[nodeId] || null;
    },
  };
}

export function createPublicationService(snapshot) {
  return {
    getPublicationModeDiagnostics() {
      return snapshot;
    },
  };
}

export function createActiveNode(nodeId) {
  return {
    [COLUMN.NODE_ID]: nodeId,
    [COLUMN.STATUS]: SERVICE_STATUS.ACTIVE,
    [COLUMN.READY_LEASE_EXPIRES_AT]: 2000,
    [COLUMN.LAST_HEARTBEAT]: 1000,
    [COLUMN.CPU_USAGE_PERCENT]: 10,
    [COLUMN.MEMORY_USAGE_PERCENT]: 20,
    [COLUMN.DISK_USAGE_PERCENT]: 30,
    [COLUMN.STORAGE_BUDGET_BYTES]: 1000,
  };
}

export function createMessageGroupService(nodeId) {
  return {
    [COLUMN.SERVICE_ID]: `mg-${nodeId}`,
    [COLUMN.NODE_ID]: nodeId,
    [COLUMN.SERVICE_TYPE]: SERVICE_TYPE.MESSAGE_GROUP,
    [COLUMN.STATUS]: SERVICE_STATUS.ACTIVE,
    [COLUMN.ADDRESS]: `${nodeId}/message-group/mg-${nodeId}`,
  };
}

export function createPartitionService(nodeId, serviceId = `part-${nodeId}`) {
  return {
    [COLUMN.SERVICE_ID]: serviceId,
    [COLUMN.NODE_ID]: nodeId,
    [COLUMN.SERVICE_TYPE]: SERVICE_TYPE.PARTITION,
    [COLUMN.STATUS]: SERVICE_STATUS.ACTIVE,
    [COLUMN.ADDRESS]: `${nodeId}/partition/${serviceId}`,
  };
}

export const READINESS_CHURN_NOW_MS = 1_780_000_000_000;
export const READINESS_CHURN_NODE_COUNT = 5;

export function createReadinessChurnCache() {
  return createCache({
    nodes: Array.from(
      {length: READINESS_CHURN_NODE_COUNT},
      (_, index) => createActiveNode(`node-${index}`),
    ),
  });
}

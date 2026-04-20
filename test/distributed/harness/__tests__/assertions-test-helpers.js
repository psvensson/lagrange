const CONTROL_SNAPSHOT_SCHEMA_VERSION = 1;
const TERMINAL_OPERATION_STATUSES = new Set(['active', 'removed', 'failed']);

function normalizeReplicaRowsByPartition(rows) {
  const membership = {};
  if (!Array.isArray(rows)) {
    return membership;
  }
  for (const row of rows) {
    if (!row || row.service_type !== 'partition' || !row.partition_id) {
      continue;
    }
    const partitionId = String(row.partition_id);
    if (!membership[partitionId]) {
      membership[partitionId] = {
        voterCount: 0,
        leader: null,
        replicas: [],
      };
    }
    const raftRole = String(row.raft_role || '').toLowerCase();
    const status = String(row.status || '').toLowerCase();
    const address = String(row.address || '').trim();
    membership[partitionId].replicas.push({
      nodeId: row.node_id ? String(row.node_id) : null,
      address: address || null,
      status: row.status ? String(row.status) : null,
      raftRole: row.raft_role ? String(row.raft_role) : null,
    });
    if (address.length > 0 &&
      status === 'active' &&
      raftRole.length > 0 &&
      raftRole !== 'learner') {
      membership[partitionId].voterCount += 1;
    }
    if (raftRole === 'leader' && address.length > 0) {
      membership[partitionId].leader = address;
    }
  }

  for (const details of Object.values(membership)) {
    details.replicas.sort((left, right) => {
      const leftKey = String(left.nodeId || left.address || '');
      const rightKey = String(right.nodeId || right.address || '');
      return leftKey.localeCompare(rightKey);
    });
  }
  return membership;
}

function summarizeOperationStatuses(rows) {
  const statusHistogram = {};
  let inFlightCount = 0;
  if (!Array.isArray(rows)) {
    return {
      inFlightCount,
      statusHistogram,
    };
  }
  for (const row of rows) {
    const status = String(row?.status || row?.state || 'unknown').toLowerCase();
    statusHistogram[status] = (statusHistogram[status] || 0) + 1;
    if (!TERMINAL_OPERATION_STATUSES.has(status)) {
      inFlightCount += 1;
    }
  }
  return {
    inFlightCount,
    statusHistogram,
  };
}

function buildControlSnapshotRecord(options = {}) {
  const servicesRows = Array.isArray(options.servicesRows) ? options.servicesRows : [];
  const operationRows = Array.isArray(options.operationRows) ?
    options.operationRows :
    [];
  const explicitPartitionIds = Array.isArray(options.partitionIds) ?
    options.partitionIds.map((partitionId) => String(partitionId)) :
    [];
  const partitionMembership = normalizeReplicaRowsByPartition(servicesRows);
  const discoveredPartitionIds = Object.keys(partitionMembership);
  const partitionIds = explicitPartitionIds.length > 0 ?
    explicitPartitionIds :
    discoveredPartitionIds;
  const leaders = {};
  const voterCounts = {};

  for (const partitionId of partitionIds) {
    const details = partitionMembership[partitionId];
    if (details?.leader) {
      leaders[partitionId] = details.leader;
    }
    if (Number.isInteger(details?.voterCount)) {
      voterCounts[partitionId] = details.voterCount;
    }
    if (!partitionMembership[partitionId]) {
      partitionMembership[partitionId] = {
        voterCount: 0,
        leader: null,
        replicas: [],
      };
    }
  }

  const operationSummary = summarizeOperationStatuses(operationRows);
  return {
    schemaVersion: CONTROL_SNAPSHOT_SCHEMA_VERSION,
    nodeId: String(options.nodeId || 'mock-node'),
    capturedAt: Number.isFinite(options.capturedAt) ? options.capturedAt : Date.now(),
    nodes: Array.isArray(options.nodes) ? options.nodes : [String(options.nodeId || 'mock-node')],
    partitions: partitionIds,
    leaders,
    voterCounts,
    ...(Number.isInteger(options.snapshotRevision) ?
      {snapshotRevision: options.snapshotRevision} :
      {}),
    ...(typeof options.snapshotRevisionState === 'string' ?
      {snapshotRevisionState: options.snapshotRevisionState} :
      {}),
    ...(Number.isInteger(options.snapshotExpectedMinimumRevision) ?
      {
        snapshotExpectedMinimumRevision:
          options.snapshotExpectedMinimumRevision,
      } :
      {}),
    ...(Number.isInteger(options.snapshotRevisionGap) ?
      {snapshotRevisionGap: options.snapshotRevisionGap} :
      {}),
    ...(typeof options.snapshotResumeToken === 'string' ?
      {snapshotResumeToken: options.snapshotResumeToken} :
      {}),
    partitionMembership,
    replicaOperations: {
      inFlightCount: operationSummary.inFlightCount,
      statusHistogram: operationSummary.statusHistogram,
      rows: operationRows,
    },
    ...(options.controlPlaneDiagnostics &&
      typeof options.controlPlaneDiagnostics === 'object' &&
      !Array.isArray(options.controlPlaneDiagnostics) ?
      {controlPlaneDiagnostics: options.controlPlaneDiagnostics} :
      {}),
  };
}

function buildConvergedMockNode(partitionIds, targetVoterCount) {
  const rows = [];
  for (const pid of partitionIds) {
    for (let i = 0; i < targetVoterCount; i++) {
      rows.push({
        service_type: 'partition',
        status: 'ACTIVE',
        raft_role: i === 0 ? 'leader' : 'follower',
        address: 'node-1/' + pid + '/r' + i,
        partition_id: pid,
      });
    }
  }
  const snapshot = buildControlSnapshotRecord({
    nodeId: 'mock-node-1',
    partitionIds,
    servicesRows: rows,
  });
  return {
    id: 'mock-node-1',
    isReachable: async () => true,
    getControlSnapshot: async () => ({rows: [snapshot]}),
  };
}

function buildNonConvergingMockNode() {
  const snapshot = buildControlSnapshotRecord({
    nodeId: 'mock-node-nc',
    partitionIds: [],
    servicesRows: [],
  });
  return {
    id: 'mock-node-nc',
    isReachable: async () => true,
    getControlSnapshot: async () => ({rows: [snapshot]}),
  };
}

function buildPartitionReplicaRow(partitionId, replicaSuffix, raftRole) {
  return {
    service_type: 'partition',
    status: 'ACTIVE',
    raft_role: raftRole,
    address: 'node-' + replicaSuffix + '/' + partitionId + '/r-' + replicaSuffix,
    node_id: 'node-' + replicaSuffix,
    partition_id: partitionId,
  };
}

function buildSequencedConvergenceNode(options = {}) {
  const snapshots = Array.isArray(options.snapshots) ? options.snapshots : [];
  const operationSnapshots = Array.isArray(options.operationSnapshots) ?
    options.operationSnapshots :
    [];
  const partitionIds = Array.isArray(options.partitionIds) ?
    options.partitionIds :
    ['p1'];
  let snapshotIndex = 0;
  let operationSnapshotIndex = 0;

  return {
    id: options.id || 'mock-sequence-node',
    isReachable: async () => true,
    getControlSnapshot: async () => {
      const serviceSnapshotIndex = Math.min(
        snapshotIndex,
        Math.max(snapshots.length - 1, 0),
      );
      const operationSnapshotBoundedIndex = Math.min(
        operationSnapshotIndex,
        Math.max(operationSnapshots.length - 1, 0),
      );
      snapshotIndex += 1;
      operationSnapshotIndex += 1;

      const snapshot = buildControlSnapshotRecord({
        nodeId: options.id || 'mock-sequence-node',
        partitionIds,
        servicesRows: snapshots[serviceSnapshotIndex] || [],
        operationRows: operationSnapshots[operationSnapshotBoundedIndex] || [],
      });
      return {rows: [snapshot]};
    },
  };
}

export {
  buildConvergedMockNode,
  buildControlSnapshotRecord,
  buildNonConvergingMockNode,
  buildPartitionReplicaRow,
  buildSequencedConvergenceNode,
};

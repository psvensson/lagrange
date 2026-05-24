import {PORTS} from '../constants.js';

export const TEST_WS_ADDRESS = `ws://node-2:${PORTS.WS_TRANSPORT}`;
export const TEST_LEADER_ADDRESS = `ws://node-1:${PORTS.WS_TRANSPORT}`;
export const TEST_NODE_A_ID = 'node-a';
export const TEST_NODE_B_ID = 'node-b';
export const TEST_CLUSTER_NODE_1_ID = 'node-1';
export const TEST_CLUSTER_NODE_2_ID = 'node-2';
export const TEST_PUBLICATION_EPOCH = 14;
export const TEST_PARTITION_ID = 'p1';
export const TEST_PUBLICATION_STATUS_PUBLISHED = 'PUBLISHED';
export const TEST_RECOVERY_STATE_PRIORITY_SPREAD_PENDING = 'priority_spread_pending';
export const TEST_RECOVERY_STATE_STEADY_PUBLISHED = 'steady_published';
export const TEST_REASON_PRIORITY_PARTITIONS_NOT_SPREAD =
  'priority_partitions_not_spread';
export const TEST_BLOCKED_PRIORITY_PARTITION_ID = 'replica_operations-p1';
export const TEST_CONTROL_PLANE_PUBLICATION_PARTITION_ID =
  'control_plane_publications-p1';
export const TEST_PRIORITY_RECOVERY_CLOSURE_SATISFIED_FRESH =
  'closure_satisfied_fresh';
export const TEST_CONSISTENCY_REASON_LEADER_IDENTITIES_DISAGREE =
  'leader_identities_disagree';
export const TEST_CONSISTENCY_REASON_OBSERVER_SNAPSHOT_REVISION_LAG =
  'observer_snapshot_revision_lag';
export const TEST_CONSISTENCY_REASON_OBSERVER_SNAPSHOT_REPAIR_DEFERRED =
  'observer_snapshot_repair_deferred';
export const TEST_CONSISTENCY_REASON_MIXED_OBSERVATION_MODE =
  'mixed_observation_mode';
export const TEST_CONSISTENCY_REASON_OBSERVER_AUTHORITY_VISIBILITY_LAG =
  'observer_authority_visibility_lag';
export const TEST_CONSISTENCY_REASON_PARTITION_LEADER_AUTHORITY_DIVERGED =
  'partition_leader_authority_diverged';
export const TEST_CONSISTENCY_REASON_ACTIVE_NODES_DISAGREE =
  'active_nodes_disagree';
export const TEST_FINAL_CONSISTENCY_STATE_LEADER_MAP_MISMATCH =
  'leader_map_mismatch';
export const TEST_FINAL_CONSISTENCY_STATE_OBSERVER_REVISION_LAG =
  'observer_revision_lag';
export const TEST_FINAL_CONSISTENCY_STATE_OBSERVER_REPAIR_DEFERRED =
  'observer_repair_deferred';
export const TEST_FINAL_CONSISTENCY_STATE_OBSERVATION_MODE_MISMATCH =
  'observation_mode_mismatch';
export const TEST_FINAL_CONSISTENCY_STATE_OBSERVER_AUTHORITY_VISIBILITY_LAG =
  'observer_authority_visibility_lag';
export const TEST_FINAL_CONSISTENCY_STATE_AUTHORITY_DIVERGED =
  'authority_diverged';
export const TEST_ROOT_CAUSE_TOPOLOGY = 'topology';
export const TEST_ROOT_CAUSE_CACHE = 'cache';
export const TEST_OBSERVATION_MODE_LOCAL_CACHE = 'local_cache';
export const TEST_OBSERVATION_MODE_FRESH_OWNER = 'fresh_owner';
export const TEST_OBSERVATION_MODE_REPAIR_DEFERRED = 'repair_deferred';
export const TEST_SNAPSHOT_REVISION_STATE_STALE_USABLE = 'stale_usable';
export const TEST_SNAPSHOT_REVISION_A = 31;
export const TEST_SNAPSHOT_REVISION_B = 29;
export const TEST_TOPOLOGY_EPOCH = 7;
export const TEST_SHORT_CONVERGENCE_TIMEOUT_MS = 25;
export const TEST_SHORT_CONVERGENCE_POLL_MS = 1;
export const TEST_EMPTY_COUNT = 0;
export const TEST_BLOCKED_COUNT = 1;

export const NODE_ROWS = Object.freeze([
  {node_id: 'node-1'},
  {node_id: 'node-2'},
  {node_id: 'node-3'},
]);
export const PARTITION_ROWS = Object.freeze([
  {partition_id: 'p1'},
]);

export function buildServiceRows(leaderAddress) {
  return [
    {
      service_type: 'partition',
      status: 'active',
      raft_role: 'leader',
      address: leaderAddress,
      partition_id: 'p1',
      node_id: 'node-1',
    },
    {
      service_type: 'partition',
      status: 'active',
      raft_role: 'follower',
      address: TEST_WS_ADDRESS,
      partition_id: 'p1',
      node_id: 'node-2',
    },
  ];
}

export function buildQueryableNode(nodeId, leaderAddress = TEST_LEADER_ADDRESS) {
  return {
    id: nodeId,
    async isReachable() {
      return true;
    },
    async query(sql) {
      if (sql.includes('FROM nodes')) {
        return {rows: NODE_ROWS};
      }
      if (sql.includes('FROM partitions')) {
        return {rows: PARTITION_ROWS};
      }
      if (sql.includes('FROM services')) {
        return {rows: buildServiceRows(leaderAddress)};
      }
      return {rows: []};
    },
  };
}

export function buildControlSnapshotNode(nodeId, snapshotOverrides = {}) {
  return {
    id: nodeId,
    async isReachable() {
      return true;
    },
    async getControlSnapshot() {
      return {
        rows: [{
          nodes: ['node-1', 'node-2', 'node-3'],
          partitions: ['p1'],
          leaders: {
            p1: TEST_LEADER_ADDRESS,
          },
          controlPlaneDiagnostics: {
            publicationConvergence: {
              publicationEpoch: 14,
              publishedActiveNodeIds: ['node-1', 'node-3'],
            },
          },
          ...snapshotOverrides,
        }],
      };
    },
    async query() {
      throw new Error('raw consistency SQL should not run when control snapshot is available');
    },
  };
}

export function buildPublicationReadySnapshot(nodeId, controlPlaneDiagnostics) {
  return {
    nodeId,
    nodes: [TEST_CLUSTER_NODE_1_ID, TEST_CLUSTER_NODE_2_ID],
    publishedNodes: [TEST_CLUSTER_NODE_1_ID, TEST_CLUSTER_NODE_2_ID],
    partitions: [TEST_PARTITION_ID],
    leaders: {[TEST_PARTITION_ID]: TEST_LEADER_ADDRESS},
    publicationEpoch: TEST_PUBLICATION_EPOCH,
    controlPlaneDiagnostics,
  };
}

export function buildFreshPriorityDecisionClosureWitness() {
  return {
    state: TEST_PRIORITY_RECOVERY_CLOSURE_SATISFIED_FRESH,
    prioritySpreadPending: false,
    publicationRefreshRequired: false,
    blockedPartitionIds: [],
    blockedPartitionCount: TEST_EMPTY_COUNT,
    unresolvedSemanticStateIds: [],
    satisfiedPartitionIds: [TEST_CONTROL_PLANE_PUBLICATION_PARTITION_ID],
    decisionPartitionIds: [TEST_CONTROL_PLANE_PUBLICATION_PARTITION_ID],
    refreshedPriorityPartitionSummary: {
      satisfied: true,
      blockedPartitionCount: TEST_EMPTY_COUNT,
      largestSpreadGap: TEST_EMPTY_COUNT,
      totalSpreadGap: TEST_EMPTY_COUNT,
    },
    summarySpreadPending: false,
    publicationEpoch: TEST_PUBLICATION_EPOCH,
  };
}

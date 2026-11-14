// Shared deterministic fixture for formation placement and startup-authority DTs:
// a SystemTableCache formation shape (all ledger voters concentrated on the
// seed while joiners have published their local READY leases), the
// owner-derived startup-authority snapshot for the join cohort, and a real
// MovePlanner over the live cache rows.

import {SystemTableCache} from '../../src/cache/system-table-cache.js';
import {ConfigurationManager} from '../../src/config/configuration-manager.js';
import {LoggingService} from '../../src/logging/logging-service.js';
import {NodeService} from '../../src/node/node-service.js';
import {MovePlanner} from '../../src/rebalancer/move-planner.js';
import {
  REBALANCER_ENTITY_TYPE,
} from '../../src/rebalancer/rebalancer-constants.js';
import {ReplicaStatus} from '../../src/rebalancer/replica-status.js';
import {
  isTerminalStep,
} from '../../src/rebalancer/replica-operation-progress.js';
import {
  deriveMembershipPublicationCandidate,
} from '../../src/control-plane/membership-publication-coordinator.js';
import {
  buildStartupAuthoritySnapshotFromPlanningAnswer,
} from '../../src/control-plane/startup-authority-snapshot-owner.js';

const LEDGER_PARTITION_ID = 'replica_operations-p1';
const SEED_NODE_ID = 'seed-node';
const JOINER_1_NODE_ID = 'joining-node';
const JOINER_2_NODE_ID = 'joining-node-2';
const JOINER_3_NODE_ID = 'joining-node-3';
const JOINER_4_NODE_ID = 'joining-node-4';
const JOINER_NODE_IDS = Object.freeze([
  JOINER_1_NODE_ID,
  JOINER_2_NODE_ID,
  JOINER_3_NODE_ID,
  JOINER_4_NODE_ID,
]);

function initializeEnvironment() {
  ConfigurationManager.resetInstance();
  LoggingService.resetInstance();
  NodeService.resetInstance();
  ConfigurationManager.getInstance().initialize({});
  LoggingService.getInstance().initialize({level: 'error'});
}

function resetEnvironment() {
  NodeService.resetInstance();
  ConfigurationManager.resetInstance();
  LoggingService.resetInstance();
}

function applyRow(cache, tableName, record) {
  cache.applySystemTableChange(tableName, 'INSERT', record);
}

function buildFormationCache(options = {}) {
  const joinerNodeIds = options.joinerNodeIds || JOINER_NODE_IDS;
  const cache = new SystemTableCache();
  const now = Date.now();
  for (const nodeId of [SEED_NODE_ID, ...joinerNodeIds]) {
    applyRow(cache, 'nodes', {
      node_id: nodeId,
      status: ReplicaStatus.ACTIVE,
      connection_state: 'ready',
      last_heartbeat: now,
      ready_lease_expires_at: now + 60000,
    });
  }
  applyRow(cache, 'partitions', {
    partition_id: LEDGER_PARTITION_ID,
    table_id: 'replica_operations',
    replica_count: 3,
  });
  for (const [index, raftRole] of [
    [1, 'leader'],
    [2, 'follower'],
    [3, 'follower'],
  ]) {
    applyRow(cache, 'services', {
      service_id: `${LEDGER_PARTITION_ID}-r${index}`,
      replica_id: `${LEDGER_PARTITION_ID}-r${index}`,
      partition_id: LEDGER_PARTITION_ID,
      node_id: SEED_NODE_ID,
      service_type: REBALANCER_ENTITY_TYPE.PARTITION,
      status: ReplicaStatus.ACTIVE,
      raft_role: raftRole,
    });
  }
  return cache;
}

function buildOwnerDerivedStartupAuthoritySnapshot(options = {}) {
  const joinerNodeIds = options.joinerNodeIds || JOINER_NODE_IDS;
  const now = 1000;
  const planningAnswer = deriveMembershipPublicationCandidate({
    publisherNodeId: SEED_NODE_ID,
    sourceTopologyEpoch: 1,
    sourceSnapshotVersion: 1,
    nowMs: now,
    latestPublicationRow: {
      publication_epoch: 1,
      status: 'PUBLISHED',
      published_active_node_ids: [SEED_NODE_ID],
      required_ack_node_ids: [SEED_NODE_ID],
      acknowledged_node_ids: [SEED_NODE_ID],
      priority_partition_summary: {
        satisfied: false,
        missingPartitionIds: [LEDGER_PARTITION_ID],
      },
    },
    nodeRows: [
      {
        node_id: SEED_NODE_ID,
        status: ReplicaStatus.ACTIVE,
        connection_state: 'ready',
        last_heartbeat: now,
        ready_lease_expires_at: now + 60000,
      },
      ...joinerNodeIds.map((joinerNodeId) => ({
        node_id: joinerNodeId,
        status: ReplicaStatus.ACTIVE,
        connection_state: 'connected',
        last_heartbeat: now,
        ready_lease_expires_at: null,
      })),
    ],
    readinessEntries: [],
    connectedNodeIds: joinerNodeIds,
  });
  return {
    planningAnswer,
    startupAuthority:
      buildStartupAuthoritySnapshotFromPlanningAnswer(planningAnswer),
  };
}

function currentLedgerReplicas(cache) {
  return cache.filter(
    'services',
    (row) => row.partition_id === LEDGER_PARTITION_ID,
  );
}

function buildRealLedgerPlanner(cache, trackedOperations) {
  const provider = {
    systemTableCache: cache,
    getAvailableNodes: () => cache.getAll('nodes'),
    getCurrentReplicas: () => currentLedgerReplicas(cache),
    getHealthyReplicas: (replicas) =>
      replicas.filter((replica) => replica.status === ReplicaStatus.ACTIVE),
    getInFlightOperations: () =>
      [...trackedOperations.values()].filter(
        (operation) =>
          !isTerminalStep(operation.type, operation.workflow_step),
      ),
    getTopologyBlockingInFlightOperations: () => [],
    getGlobalTopologyBlockingInFlightOperations: () => [],
    getTerminalFailedReplaceTargetReplicaIds: () => new Set(),
    getPartitionDescriptorEpochEvidence: () => null,
    hasPendingMove: () => false,
    hasPendingAddForNode: () => false,
  };
  return new MovePlanner({
    entityId: LEDGER_PARTITION_ID,
    entityType: REBALANCER_ENTITY_TYPE.PARTITION,
    moveStateProvider: provider,
  });
}

export {
  LEDGER_PARTITION_ID,
  SEED_NODE_ID,
  JOINER_1_NODE_ID,
  JOINER_NODE_IDS,
  applyRow,
  buildFormationCache,
  buildOwnerDerivedStartupAuthoritySnapshot,
  buildRealLedgerPlanner,
  currentLedgerReplicas,
  initializeEnvironment,
  resetEnvironment,
};

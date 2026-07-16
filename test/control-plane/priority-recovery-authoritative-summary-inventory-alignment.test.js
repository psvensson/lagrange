import {test} from '../../src/test-helpers/tap.js';
import {
  COLUMN,
  SERVICE_STATUS,
  SERVICE_TYPE,
  TABLES,
} from '../../src/constants/index.js';
import {
  INITIAL_PARTITION_IDS,
  SYSTEM_TABLE_NAME,
} from '../../src/bootstrap/system-table-schemas-constants.js';
import {
  PRIORITY_CONTROL_PLANE_TABLE_IDS,
} from '../../src/bootstrap/system-partition-classification.js';
import {
  MembershipPublicationCoordinator,
} from '../../src/control-plane/membership-publication-coordinator.js';
import {
  ControlPlaneReadinessService,
} from '../../src/control-plane/control-plane-readiness-service.js';
import {
  buildReplicaInventorySnapshot,
} from '../../src/rebalancer/replica-inventory.js';

const NODE_IDS = Object.freeze(['seed', 'node-2', 'node-3', 'node-4']);
const READY_NODE_IDS = Object.freeze(['seed', 'node-2', 'node-4']);
const PRIORITY_PARTITION_IDS = Object.freeze([
  ...PRIORITY_CONTROL_PLANE_TABLE_IDS,
].map((tableId) => INITIAL_PARTITION_IDS[tableId]));
const SCHEMA_OPERATIONS_PARTITION_ID =
  INITIAL_PARTITION_IDS[SYSTEM_TABLE_NAME.SCHEMA_OPERATIONS];
const PUBLICATION_EPOCH = 3;
const REPLICA_TARGET = 3;

function createNodeRow(nodeId) {
  return {
    [COLUMN.NODE_ID]: nodeId,
    [COLUMN.STATUS]: SERVICE_STATUS.ACTIVE,
    connection_state: 'ready',
    ready_lease_expires_at: 50_000,
  };
}

function createEndpointRow(nodeId) {
  return {
    endpoint_id: `${nodeId}-ws`,
    [COLUMN.NODE_ID]: nodeId,
    transport_type: 'ws',
    [COLUMN.STATUS]: SERVICE_STATUS.ACTIVE,
    [COLUMN.ADDRESS]: `ws://${nodeId}:8082`,
  };
}

function createPartitionService(partitionId, nodeId, replicaId, status) {
  return {
    [COLUMN.SERVICE_ID]: replicaId,
    [COLUMN.NODE_ID]: nodeId,
    [COLUMN.PARTITION_ID]: partitionId,
    [COLUMN.SERVICE_TYPE]: SERVICE_TYPE.PARTITION,
    [COLUMN.STATUS]: status,
    [COLUMN.RAFT_ROLE]: 'follower',
    [COLUMN.ADDRESS]: `${nodeId}/partition/${partitionId}`,
  };
}

function createPriorityServiceRows() {
  return PRIORITY_PARTITION_IDS.flatMap((partitionId) => {
    if (partitionId === SCHEMA_OPERATIONS_PARTITION_ID) {
      return [
        createPartitionService(partitionId, 'seed', `${partitionId}-r2`, 'active'),
        createPartitionService(partitionId, 'seed', `${partitionId}-r3`, 'active'),
        createPartitionService(partitionId, 'node-2', `${partitionId}-r4`, 'syncing'),
      ];
    }
    return READY_NODE_IDS.map((nodeId, index) =>
      createPartitionService(
        partitionId,
        nodeId,
        `${partitionId}-r${index + 1}`,
        'active',
      ),
    );
  });
}

function createPlanningCache() {
  const rowsByTableName = new Map([
    [TABLES.NODES, NODE_IDS.map(createNodeRow)],
    [TABLES.NODE_ENDPOINTS, NODE_IDS.map(createEndpointRow)],
    [
      TABLES.PARTITIONS,
      PRIORITY_PARTITION_IDS.map((partitionId) => ({
        [COLUMN.PARTITION_ID]: partitionId,
        replica_count: REPLICA_TARGET,
      })),
    ],
    [TABLES.SERVICES, createPriorityServiceRows()],
    [TABLES.REPLICA_OPERATIONS, []],
    [
      TABLES.CONTROL_PLANE_PUBLICATIONS,
      [{
        publication_id: 'membership-epoch-3',
        publication_kind: 'cluster_membership',
        publication_epoch: PUBLICATION_EPOCH,
        published_active_node_ids: NODE_IDS,
        required_ack_node_ids: NODE_IDS,
        acknowledged_node_ids: NODE_IDS,
        status: 'PUBLISHED',
      }],
    ],
  ]);
  const listeners = new Set();
  return {
    getAll(tableName) {
      return rowsByTableName.get(tableName) || [];
    },
    onCacheChange(listener) {
      listeners.add(listener);
    },
    applyServiceChange(operation, row) {
      const rows = rowsByTableName.get(TABLES.SERVICES) || [];
      const serviceId = row[COLUMN.SERVICE_ID];
      const existingIndex = rows.findIndex(
        (candidate) => candidate[COLUMN.SERVICE_ID] === serviceId,
      );
      const existing = existingIndex >= 0 ? rows[existingIndex] : {};
      const nextRow = {...existing, ...row};
      if (existingIndex >= 0) {
        rows.splice(existingIndex, 1, nextRow);
      } else {
        rows.push(nextRow);
      }
      for (const listener of listeners) {
        listener(TABLES.SERVICES, operation, nextRow, null);
      }
    },
  };
}

function schemaOperationsBlock(summary) {
  return summary?.blockedPartitions?.find(
    (partition) => partition.partitionId === SCHEMA_OPERATIONS_PARTITION_ID,
  ) || null;
}

test('priority planning invalidates every publisher memo when terminal replica rows change the cluster summary',
  (t) => {
    let nowMs = 10_000;
    const cache = createPlanningCache();
    const publicationCoordinator = new MembershipPublicationCoordinator({
      nodeId: 'seed',
      systemTableCache: cache,
      now: () => nowMs,
    });
    const readinessService = new ControlPlaneReadinessService({
      nodeId: 'seed',
      systemTableCache: cache,
      membershipPublicationService: publicationCoordinator,
      now: () => nowMs,
    });

    const stalePlanning =
      readinessService.getMembershipPublicationPlanningAnswerSync('seed', nowMs);
    t.match(
      schemaOperationsBlock(stalePlanning.priorityPartitionSummary),
      {
        readyReplicaCount: 2,
        readyDistinctNodeCount: 1,
        exclusionReasonCounts: {status_syncing: 1},
      },
      'the first observation reproduces the cache-lagged schema_operations summary',
    );

    const authoritativeRows = [
      createPartitionService(
        SCHEMA_OPERATIONS_PARTITION_ID,
        'seed',
        `${SCHEMA_OPERATIONS_PARTITION_ID}-r2`,
        'active',
      ),
      createPartitionService(
        SCHEMA_OPERATIONS_PARTITION_ID,
        'seed',
        `${SCHEMA_OPERATIONS_PARTITION_ID}-r3`,
        'active',
      ),
      createPartitionService(
        SCHEMA_OPERATIONS_PARTITION_ID,
        'node-4',
        'replace-replica-terminal',
        'active',
      ),
      createPartitionService(
        SCHEMA_OPERATIONS_PARTITION_ID,
        'node-2',
        `${SCHEMA_OPERATIONS_PARTITION_ID}-r4`,
        'active',
      ),
    ];
    const authoritativeInventory = buildReplicaInventorySnapshot({
      entityType: SERVICE_TYPE.PARTITION,
      entityId: SCHEMA_OPERATIONS_PARTITION_ID,
      capturedAtMs: nowMs,
      committedRowsObservation: {
        state: 'present',
        rows: authoritativeRows,
        observedAtMs: nowMs,
      },
      inFlightOperationObservation: {
        state: 'empty',
        operations: [],
        observedAtMs: nowMs,
      },
    });
    t.equal(
      authoritativeInventory.accounting.activeCount,
      4,
      'the canonical create-admission inventory sees four active replicas',
    );
    t.same(
      authoritativeInventory.occupiedNodeIds,
      ['node-2', 'node-4', 'seed'],
      'the canonical create-admission inventory sees the terminal three-node spread',
    );

    nowMs += 1;
    cache.applyServiceChange('INSERT', authoritativeRows[2]);
    nowMs += 1;
    cache.applyServiceChange('UPDATE', authoritativeRows[3]);

    const terminalPlanning =
      readinessService.getMembershipPublicationPlanningAnswerSync('seed', nowMs);
    t.equal(
      terminalPlanning.priorityPartitionSummary.satisfied,
      true,
      'terminal owner rows must replace the stale publisher summary immediately',
    );
    t.same(
      terminalPlanning.priorityPartitionSummary.blockedPartitions,
      [],
      'no cache-only SYNCING witness may survive the terminal handoff',
    );
    t.end();
  });

test('priority planning invalidates the publication merge memo on remote terminal rows',
  (t) => {
    let nowMs = 20_000;
    const cache = createPlanningCache();
    const publicationCoordinator = new MembershipPublicationCoordinator({
      nodeId: 'seed',
      systemTableCache: cache,
      now: () => nowMs,
    });
    const readinessService = new ControlPlaneReadinessService({
      nodeId: 'seed',
      systemTableCache: cache,
      membershipPublicationService: publicationCoordinator,
      now: () => nowMs,
    });
    const membershipPublication =
      publicationCoordinator.getLatestPublicationForNodeSync('seed');
    const staleProvidedPlanning =
      publicationCoordinator.deriveClusterMembershipCandidateSync({
        publisherNodeId: 'seed',
        nowMs,
      });
    const staleMergedPlanning =
      readinessService.resolveMemoizedMembershipPublicationPlanningSnapshotSync(
        'seed',
        nowMs,
        membershipPublication,
        staleProvidedPlanning,
      );
    t.match(
      schemaOperationsBlock(staleMergedPlanning.priorityPartitionSummary),
      {readyDistinctNodeCount: 1},
      'the merge memo first captures the cache-lagged spread',
    );

    nowMs += 1;
    cache.applyServiceChange(
      'INSERT',
      createPartitionService(
        SCHEMA_OPERATIONS_PARTITION_ID,
        'node-4',
        'replace-replica-terminal',
        'active',
      ),
    );
    nowMs += 1;
    cache.applyServiceChange(
      'UPDATE',
      createPartitionService(
        SCHEMA_OPERATIONS_PARTITION_ID,
        'node-2',
        `${SCHEMA_OPERATIONS_PARTITION_ID}-r4`,
        'active',
      ),
    );
    const terminalProvidedPlanning =
      publicationCoordinator.deriveClusterMembershipCandidateSync({
        publisherNodeId: 'seed',
        nowMs,
      });
    const terminalMergedPlanning =
      readinessService.resolveMemoizedMembershipPublicationPlanningSnapshotSync(
        'seed',
        nowMs,
        membershipPublication,
        terminalProvidedPlanning,
      );

    t.equal(
      terminalMergedPlanning.priorityPartitionSummary.satisfied,
      true,
      'the merge memo must consume the terminal owner projection',
    );
    t.same(
      terminalMergedPlanning.priorityPartitionSummary.blockedPartitions,
      [],
      'the merge memo must not retain a pre-terminal partition witness',
    );
    t.end();
  });

import {
  INITIAL_PARTITION_IDS,
  SYSTEM_TABLE_NAME,
} from '../../src/bootstrap/system-table-schemas-constants.js';

const PRIORITY_REFRESH_NODE_IDS = Object.freeze([
  'node-1',
  'node-2',
  'node-3',
]);
const PRIORITY_REFRESH_PARTITION_IDS = Object.freeze([
  INITIAL_PARTITION_IDS[SYSTEM_TABLE_NAME.CONTROL_PLANE_PUBLICATIONS],
  INITIAL_PARTITION_IDS[SYSTEM_TABLE_NAME.REPLICA_OPERATIONS],
  INITIAL_PARTITION_IDS[SYSTEM_TABLE_NAME.SCHEMA_OPERATIONS],
  INITIAL_PARTITION_IDS[SYSTEM_TABLE_NAME.SQL_TRANSACTIONS],
  INITIAL_PARTITION_IDS[SYSTEM_TABLE_NAME.SQL_TRANSACTION_PARTICIPANTS],
  INITIAL_PARTITION_IDS[SYSTEM_TABLE_NAME.SQL_WRITE_OPERATIONS],
]);
const PRIORITY_REFRESH_STALE_MISSING_PARTITION_IDS = Object.freeze([
  INITIAL_PARTITION_IDS[SYSTEM_TABLE_NAME.CONTROL_PLANE_PUBLICATIONS],
  INITIAL_PARTITION_IDS[SYSTEM_TABLE_NAME.REPLICA_OPERATIONS],
  INITIAL_PARTITION_IDS[SYSTEM_TABLE_NAME.SQL_WRITE_OPERATIONS],
]);
const PRIORITY_REFRESH_PUBLICATION_ID = 'publication-priority-refresh';
const PRIORITY_REFRESH_PUBLICATION_KIND = 'cluster_membership';
const PRIORITY_REFRESH_PUBLICATION_EPOCH = 21;
const PRIORITY_REFRESH_OLD_TIMESTAMP_MS = 2100;
const PRIORITY_REFRESH_NOW_MS = 2400;
const PRIORITY_REFRESH_READY_LEASE_EXPIRES_AT_MS = 5000;
const PRIORITY_REFRESH_REQUIRED_DISTINCT_NODE_COUNT = 3;
const PRIORITY_REFRESH_READY_DISTINCT_NODE_COUNT = 2;
const PRIORITY_REFRESH_READY_ELIGIBLE_NODE_COUNT = 3;
const PRIORITY_REFRESH_SPREAD_GAP = 1;
const PRIORITY_REFRESH_REPLICA_COUNT = 3;
const PRIORITY_REFRESH_EXPECTED_PERSIST_COUNT = 1;
const PRIORITY_REFRESH_LOCAL_NODE_INDEX = 0;
const PRIORITY_REFRESH_ENDPOINT_PORT = 8082;
const PRIORITY_REFRESH_STATUS_ACTIVE = 'active';
const PRIORITY_REFRESH_CONNECTION_READY = 'ready';
const PRIORITY_REFRESH_ENDPOINT_TRANSPORT_WS = 'ws';
const PRIORITY_REFRESH_SERVICE_TYPE_PARTITION = 'partition';
const PRIORITY_REFRESH_RAFT_ROLE_FOLLOWER = 'follower';
const PRIORITY_REFRESH_STATUS_SYNCING = 'syncing';
const PRIORITY_REFRESH_STATUS_PUBLISHED = 'PUBLISHED';
const PRIORITY_REFRESH_EPOCH_BOUNDARY = 'published_membership';
const PRIORITY_REFRESH_STALE_SERVICE_NODE_IDS = Object.freeze([
  PRIORITY_REFRESH_NODE_IDS[0],
  PRIORITY_REFRESH_NODE_IDS[1],
]);
const PRIORITY_REFRESH_STILL_BLOCKED_PARTITION_ID =
  INITIAL_PARTITION_IDS[SYSTEM_TABLE_NAME.SQL_TRANSACTIONS];
const PRIORITY_REFRESH_STALE_READ_SOURCE = 'authoritative';
const PRIORITY_REFRESH_FRESH_READ_SOURCE = 'cache';

export function registerMembershipPublicationCoordinatorPriorityRefreshTests({
  test,
  MembershipPublicationCoordinator,
  MEMBERSHIP_LIFECYCLE_STATE,
}) {
  test('reconcileClusterMembership refreshes stale priority spread to satisfied when terminal service rows are visible',
    async (t) => {
      const nodeRows = PRIORITY_REFRESH_NODE_IDS.map((nodeId) => ({
        node_id: nodeId,
        status: PRIORITY_REFRESH_STATUS_ACTIVE,
        connection_state: PRIORITY_REFRESH_CONNECTION_READY,
        ready_lease_expires_at: PRIORITY_REFRESH_READY_LEASE_EXPIRES_AT_MS,
      }));
      const nodeEndpointRows = PRIORITY_REFRESH_NODE_IDS.map((nodeId) => ({
        endpoint_id: `${nodeId}-ws`,
        node_id: nodeId,
        transport_type: PRIORITY_REFRESH_ENDPOINT_TRANSPORT_WS,
        status: PRIORITY_REFRESH_STATUS_ACTIVE,
        address:
          `${PRIORITY_REFRESH_ENDPOINT_TRANSPORT_WS}://${nodeId}:` +
          `${PRIORITY_REFRESH_ENDPOINT_PORT}`,
      }));
      const partitionRows = PRIORITY_REFRESH_PARTITION_IDS.map((partitionId) => ({
        partition_id: partitionId,
        replica_count: PRIORITY_REFRESH_REPLICA_COUNT,
      }));
      const serviceRows = PRIORITY_REFRESH_PARTITION_IDS.flatMap((partitionId) =>
        PRIORITY_REFRESH_NODE_IDS.map((nodeId) => ({
          service_id: `${partitionId}-${nodeId}`,
          node_id: nodeId,
          partition_id: partitionId,
          service_type: PRIORITY_REFRESH_SERVICE_TYPE_PARTITION,
          status: PRIORITY_REFRESH_STATUS_ACTIVE,
          raft_role: PRIORITY_REFRESH_RAFT_ROLE_FOLLOWER,
          address: `${nodeId}/partition/${partitionId}`,
        })),
      );
      let durableRow = {
        publication_id: PRIORITY_REFRESH_PUBLICATION_ID,
        publication_kind: PRIORITY_REFRESH_PUBLICATION_KIND,
        publication_epoch: PRIORITY_REFRESH_PUBLICATION_EPOCH,
        published_active_node_ids: [...PRIORITY_REFRESH_NODE_IDS],
        required_ack_node_ids: [...PRIORITY_REFRESH_NODE_IDS],
        acknowledged_node_ids: [...PRIORITY_REFRESH_NODE_IDS],
        priority_partition_summary: {
          satisfied: false,
          requiredDistinctNodeCount: PRIORITY_REFRESH_REQUIRED_DISTINCT_NODE_COUNT,
          readyEligibleNodeCount: PRIORITY_REFRESH_READY_ELIGIBLE_NODE_COUNT,
          totalPriorityPartitionCount: PRIORITY_REFRESH_PARTITION_IDS.length,
          missingPartitionIds: [...PRIORITY_REFRESH_STALE_MISSING_PARTITION_IDS],
          blockedPartitions: PRIORITY_REFRESH_STALE_MISSING_PARTITION_IDS.map(
            (partitionId) => ({
              partitionId,
              requiredDistinctNodeCount:
                PRIORITY_REFRESH_REQUIRED_DISTINCT_NODE_COUNT,
              readyDistinctNodeCount:
                PRIORITY_REFRESH_READY_DISTINCT_NODE_COUNT,
              spreadGap: PRIORITY_REFRESH_SPREAD_GAP,
            }),
          ),
        },
        membership_lifecycle_summary: {
          lifecycleState: MEMBERSHIP_LIFECYCLE_STATE.PUBLISHED_ACTIVE,
          epochBoundary: PRIORITY_REFRESH_EPOCH_BOUNDARY,
        },
        status: PRIORITY_REFRESH_STATUS_PUBLISHED,
        updated_at: PRIORITY_REFRESH_OLD_TIMESTAMP_MS,
        published_at: PRIORITY_REFRESH_OLD_TIMESTAMP_MS,
        closed_at: PRIORITY_REFRESH_OLD_TIMESTAMP_MS,
      };
      const persistedRows = [];
      const coordinator = new MembershipPublicationCoordinator({
        nodeId: PRIORITY_REFRESH_NODE_IDS[PRIORITY_REFRESH_LOCAL_NODE_INDEX],
        controlPlanePublicationsOwner: {
          async listPublications() {
            return {rows: [durableRow]};
          },
          async upsertPublication(row) {
            persistedRows.push(row);
            durableRow = row;
          },
        },
        systemTableCache: {
          getAll(tableName) {
            if (tableName === SYSTEM_TABLE_NAME.NODES) {
              return nodeRows;
            }
            if (tableName === SYSTEM_TABLE_NAME.NODE_ENDPOINTS) {
              return nodeEndpointRows;
            }
            if (tableName === SYSTEM_TABLE_NAME.PARTITIONS) {
              return partitionRows;
            }
            if (tableName === SYSTEM_TABLE_NAME.SERVICES) {
              return serviceRows;
            }
            if (tableName === SYSTEM_TABLE_NAME.CONTROL_PLANE_PUBLICATIONS) {
              return [durableRow];
            }
            return [];
          },
        },
        now: () => PRIORITY_REFRESH_NOW_MS,
      });

      const result = await coordinator.reconcileClusterMembership();

      t.equal(
        persistedRows.length,
        PRIORITY_REFRESH_EXPECTED_PERSIST_COUNT,
        'unchanged membership should still persist the fresher priority spread summary',
      );
      t.match(
        durableRow,
        {
          publication_epoch: PRIORITY_REFRESH_PUBLICATION_EPOCH,
          status: PRIORITY_REFRESH_STATUS_PUBLISHED,
          priority_partition_summary: {
            satisfied: true,
            missingPartitionIds: [],
            blockedPartitions: [],
          },
        },
        'terminal priority service rows should refresh stale durable spread metadata to satisfied',
      );
      t.match(
        result.publicationRow,
        {
          publicationEpoch: PRIORITY_REFRESH_PUBLICATION_EPOCH,
          status: PRIORITY_REFRESH_STATUS_PUBLISHED,
          priorityPartitionSummary: {
            satisfied: true,
            missingPartitionIds: [],
            blockedPartitions: [],
          },
        },
        'the publication owner should return the refreshed satisfied priority summary',
      );
    });

  test('reconcileClusterMembership merges stale authoritative and fresher projected planning evidence',
    async (t) => {
      const nodeRows = PRIORITY_REFRESH_NODE_IDS.map((nodeId) => ({
        node_id: nodeId,
        status: PRIORITY_REFRESH_STATUS_ACTIVE,
        connection_state: PRIORITY_REFRESH_CONNECTION_READY,
        ready_lease_expires_at: PRIORITY_REFRESH_READY_LEASE_EXPIRES_AT_MS,
        updated_at: PRIORITY_REFRESH_NOW_MS,
      }));
      const nodeEndpointRows = PRIORITY_REFRESH_NODE_IDS.map((nodeId) => ({
        endpoint_id: `${nodeId}-ws`,
        node_id: nodeId,
        transport_type: PRIORITY_REFRESH_ENDPOINT_TRANSPORT_WS,
        status: PRIORITY_REFRESH_STATUS_ACTIVE,
        address:
          `${PRIORITY_REFRESH_ENDPOINT_TRANSPORT_WS}://${nodeId}:` +
          `${PRIORITY_REFRESH_ENDPOINT_PORT}`,
        updated_at: PRIORITY_REFRESH_NOW_MS,
      }));
      const partitionRows = PRIORITY_REFRESH_PARTITION_IDS.map((partitionId) => ({
        partition_id: partitionId,
        replica_count: PRIORITY_REFRESH_REPLICA_COUNT,
        updated_at: PRIORITY_REFRESH_NOW_MS,
      }));
      const staleServiceRows = PRIORITY_REFRESH_PARTITION_IDS.flatMap((partitionId) =>
        PRIORITY_REFRESH_STALE_SERVICE_NODE_IDS.map((nodeId) => ({
          service_id: `${partitionId}-${nodeId}`,
          node_id: nodeId,
          partition_id: partitionId,
          service_type: PRIORITY_REFRESH_SERVICE_TYPE_PARTITION,
          status: PRIORITY_REFRESH_STATUS_ACTIVE,
          raft_role: PRIORITY_REFRESH_RAFT_ROLE_FOLLOWER,
          address: `${nodeId}/partition/${partitionId}`,
          updated_at: PRIORITY_REFRESH_OLD_TIMESTAMP_MS,
          read_source: PRIORITY_REFRESH_STALE_READ_SOURCE,
        })),
      );
      const projectedServiceRows = PRIORITY_REFRESH_PARTITION_IDS.flatMap((partitionId) => {
        const nodeIds =
          partitionId === PRIORITY_REFRESH_STILL_BLOCKED_PARTITION_ID ?
            PRIORITY_REFRESH_STALE_SERVICE_NODE_IDS :
            PRIORITY_REFRESH_NODE_IDS;
        return nodeIds.map((nodeId) => ({
          service_id: `${partitionId}-${nodeId}`,
          node_id: nodeId,
          partition_id: partitionId,
          service_type: PRIORITY_REFRESH_SERVICE_TYPE_PARTITION,
          status: PRIORITY_REFRESH_STATUS_ACTIVE,
          raft_role: PRIORITY_REFRESH_RAFT_ROLE_FOLLOWER,
          address: `${nodeId}/partition/${partitionId}`,
          updated_at: PRIORITY_REFRESH_NOW_MS,
          read_source: PRIORITY_REFRESH_FRESH_READ_SOURCE,
        }));
      });
      let durableRow = {
        publication_id: PRIORITY_REFRESH_PUBLICATION_ID,
        publication_kind: PRIORITY_REFRESH_PUBLICATION_KIND,
        publication_epoch: PRIORITY_REFRESH_PUBLICATION_EPOCH,
        published_active_node_ids: [...PRIORITY_REFRESH_NODE_IDS],
        required_ack_node_ids: [...PRIORITY_REFRESH_NODE_IDS],
        acknowledged_node_ids: [...PRIORITY_REFRESH_NODE_IDS],
        priority_partition_summary: {
          satisfied: false,
          requiredDistinctNodeCount: PRIORITY_REFRESH_REQUIRED_DISTINCT_NODE_COUNT,
          readyEligibleNodeCount: PRIORITY_REFRESH_READY_ELIGIBLE_NODE_COUNT,
          totalPriorityPartitionCount: PRIORITY_REFRESH_PARTITION_IDS.length,
          missingPartitionIds: [...PRIORITY_REFRESH_STALE_MISSING_PARTITION_IDS],
          blockedPartitions: PRIORITY_REFRESH_STALE_MISSING_PARTITION_IDS.map(
            (partitionId) => ({
              partitionId,
              requiredDistinctNodeCount:
                PRIORITY_REFRESH_REQUIRED_DISTINCT_NODE_COUNT,
              readyDistinctNodeCount:
                PRIORITY_REFRESH_READY_DISTINCT_NODE_COUNT,
              spreadGap: PRIORITY_REFRESH_SPREAD_GAP,
            }),
          ),
        },
        membership_lifecycle_summary: {
          lifecycleState: MEMBERSHIP_LIFECYCLE_STATE.PUBLISHED_ACTIVE,
          epochBoundary: PRIORITY_REFRESH_EPOCH_BOUNDARY,
        },
        status: PRIORITY_REFRESH_STATUS_PUBLISHED,
        updated_at: PRIORITY_REFRESH_OLD_TIMESTAMP_MS,
        published_at: PRIORITY_REFRESH_OLD_TIMESTAMP_MS,
        closed_at: PRIORITY_REFRESH_OLD_TIMESTAMP_MS,
      };
      const cacheRowsByTableName = {
        [SYSTEM_TABLE_NAME.NODES]: nodeRows,
        [SYSTEM_TABLE_NAME.NODE_ENDPOINTS]: nodeEndpointRows,
        [SYSTEM_TABLE_NAME.PARTITIONS]: partitionRows,
        [SYSTEM_TABLE_NAME.SERVICES]: projectedServiceRows,
        [SYSTEM_TABLE_NAME.CONTROL_PLANE_PUBLICATIONS]: [durableRow],
      };
      const authoritativeRowsByTableName = {
        [SYSTEM_TABLE_NAME.NODES]: nodeRows,
        [SYSTEM_TABLE_NAME.NODE_ENDPOINTS]: nodeEndpointRows,
        [SYSTEM_TABLE_NAME.PARTITIONS]: partitionRows,
        [SYSTEM_TABLE_NAME.SERVICES]: staleServiceRows,
      };
      const persistedRows = [];
      const coordinator = new MembershipPublicationCoordinator({
        nodeId: PRIORITY_REFRESH_NODE_IDS[PRIORITY_REFRESH_LOCAL_NODE_INDEX],
        controlPlanePublicationsOwner: {
          async listPublications() {
            return {rows: [durableRow]};
          },
          async upsertPublication(row) {
            persistedRows.push(row);
            durableRow = row;
          },
        },
        authoritativeControlPlaneView: {
          canRead() {
            return true;
          },
          async readRows(tableName) {
            return {
              success: true,
              rows: authoritativeRowsByTableName[tableName] || [],
            };
          },
        },
        systemTableCache: {
          getAll(tableName) {
            return cacheRowsByTableName[tableName] || [];
          },
        },
        now: () => PRIORITY_REFRESH_NOW_MS,
      });

      const result = await coordinator.reconcileClusterMembership();

      t.equal(
        persistedRows.length,
        PRIORITY_REFRESH_EXPECTED_PERSIST_COUNT,
        'unchanged membership should persist one metadata refresh from merged planning evidence',
      );
      t.same(
        durableRow.priority_partition_summary.missingPartitionIds,
        [PRIORITY_REFRESH_STILL_BLOCKED_PARTITION_ID],
        'fresher projected service rows should clear partitions already spread in cache',
      );
      t.match(
        result.publicationRow,
        {
          priorityPartitionSummary: {
            satisfied: false,
            missingPartitionIds: [PRIORITY_REFRESH_STILL_BLOCKED_PARTITION_ID],
            blockedPartitions: [{
              partitionId: PRIORITY_REFRESH_STILL_BLOCKED_PARTITION_ID,
            }],
          },
        },
        'publication result should expose the merged-evidence priority spread summary',
      );
    });

  test('reconcileClusterMembership prefers fresher same-key projected planning rows',
    async (t) => {
      const nodeRows = PRIORITY_REFRESH_NODE_IDS.map((nodeId) => ({
        node_id: nodeId,
        status: PRIORITY_REFRESH_STATUS_ACTIVE,
        connection_state: PRIORITY_REFRESH_CONNECTION_READY,
        ready_lease_expires_at: PRIORITY_REFRESH_READY_LEASE_EXPIRES_AT_MS,
        updated_at: PRIORITY_REFRESH_NOW_MS,
      }));
      const nodeEndpointRows = PRIORITY_REFRESH_NODE_IDS.map((nodeId) => ({
        endpoint_id: `${nodeId}-ws`,
        node_id: nodeId,
        transport_type: PRIORITY_REFRESH_ENDPOINT_TRANSPORT_WS,
        status: PRIORITY_REFRESH_STATUS_ACTIVE,
        address:
          `${PRIORITY_REFRESH_ENDPOINT_TRANSPORT_WS}://${nodeId}:` +
          `${PRIORITY_REFRESH_ENDPOINT_PORT}`,
        updated_at: PRIORITY_REFRESH_NOW_MS,
      }));
      const partitionRows = PRIORITY_REFRESH_PARTITION_IDS.map((partitionId) => ({
        partition_id: partitionId,
        replica_count: PRIORITY_REFRESH_REPLICA_COUNT,
        updated_at: PRIORITY_REFRESH_NOW_MS,
      }));
      const authoritativeServiceRows = PRIORITY_REFRESH_PARTITION_IDS.flatMap((partitionId) =>
        PRIORITY_REFRESH_NODE_IDS.map((nodeId) => ({
          service_id: `${partitionId}-${nodeId}`,
          node_id: nodeId,
          partition_id: partitionId,
          service_type: PRIORITY_REFRESH_SERVICE_TYPE_PARTITION,
          status:
            nodeId === PRIORITY_REFRESH_NODE_IDS[2] ?
              PRIORITY_REFRESH_STATUS_SYNCING :
              PRIORITY_REFRESH_STATUS_ACTIVE,
          raft_role: PRIORITY_REFRESH_RAFT_ROLE_FOLLOWER,
          address: `${nodeId}/partition/${partitionId}`,
          updated_at: PRIORITY_REFRESH_OLD_TIMESTAMP_MS,
          read_source: PRIORITY_REFRESH_STALE_READ_SOURCE,
        })),
      );
      const projectedServiceRows = PRIORITY_REFRESH_PARTITION_IDS.flatMap((partitionId) =>
        PRIORITY_REFRESH_NODE_IDS.map((nodeId) => ({
          service_id: `${partitionId}-${nodeId}`,
          node_id: nodeId,
          partition_id: partitionId,
          service_type: PRIORITY_REFRESH_SERVICE_TYPE_PARTITION,
          status: PRIORITY_REFRESH_STATUS_ACTIVE,
          raft_role: PRIORITY_REFRESH_RAFT_ROLE_FOLLOWER,
          address: `${nodeId}/partition/${partitionId}`,
          updated_at: PRIORITY_REFRESH_NOW_MS,
          read_source: PRIORITY_REFRESH_FRESH_READ_SOURCE,
        })),
      );
      let durableRow = {
        publication_id: PRIORITY_REFRESH_PUBLICATION_ID,
        publication_kind: PRIORITY_REFRESH_PUBLICATION_KIND,
        publication_epoch: PRIORITY_REFRESH_PUBLICATION_EPOCH,
        published_active_node_ids: [...PRIORITY_REFRESH_NODE_IDS],
        required_ack_node_ids: [...PRIORITY_REFRESH_NODE_IDS],
        acknowledged_node_ids: [...PRIORITY_REFRESH_NODE_IDS],
        priority_partition_summary: {
          satisfied: false,
          requiredDistinctNodeCount: PRIORITY_REFRESH_REQUIRED_DISTINCT_NODE_COUNT,
          readyEligibleNodeCount: PRIORITY_REFRESH_READY_ELIGIBLE_NODE_COUNT,
          totalPriorityPartitionCount: PRIORITY_REFRESH_PARTITION_IDS.length,
          missingPartitionIds: [...PRIORITY_REFRESH_STALE_MISSING_PARTITION_IDS],
          blockedPartitions: PRIORITY_REFRESH_STALE_MISSING_PARTITION_IDS.map(
            (partitionId) => ({
              partitionId,
              requiredDistinctNodeCount:
                PRIORITY_REFRESH_REQUIRED_DISTINCT_NODE_COUNT,
              readyDistinctNodeCount:
                PRIORITY_REFRESH_READY_DISTINCT_NODE_COUNT,
              spreadGap: PRIORITY_REFRESH_SPREAD_GAP,
            }),
          ),
        },
        membership_lifecycle_summary: {
          lifecycleState: MEMBERSHIP_LIFECYCLE_STATE.PUBLISHED_ACTIVE,
          epochBoundary: PRIORITY_REFRESH_EPOCH_BOUNDARY,
        },
        status: PRIORITY_REFRESH_STATUS_PUBLISHED,
        updated_at: PRIORITY_REFRESH_OLD_TIMESTAMP_MS,
        published_at: PRIORITY_REFRESH_OLD_TIMESTAMP_MS,
        closed_at: PRIORITY_REFRESH_OLD_TIMESTAMP_MS,
      };
      const cacheRowsByTableName = {
        [SYSTEM_TABLE_NAME.NODES]: nodeRows,
        [SYSTEM_TABLE_NAME.NODE_ENDPOINTS]: nodeEndpointRows,
        [SYSTEM_TABLE_NAME.PARTITIONS]: partitionRows,
        [SYSTEM_TABLE_NAME.SERVICES]: projectedServiceRows,
        [SYSTEM_TABLE_NAME.CONTROL_PLANE_PUBLICATIONS]: [durableRow],
      };
      const authoritativeRowsByTableName = {
        [SYSTEM_TABLE_NAME.NODES]: nodeRows,
        [SYSTEM_TABLE_NAME.NODE_ENDPOINTS]: nodeEndpointRows,
        [SYSTEM_TABLE_NAME.PARTITIONS]: partitionRows,
        [SYSTEM_TABLE_NAME.SERVICES]: authoritativeServiceRows,
      };
      const coordinator = new MembershipPublicationCoordinator({
        nodeId: PRIORITY_REFRESH_NODE_IDS[PRIORITY_REFRESH_LOCAL_NODE_INDEX],
        controlPlanePublicationsOwner: {
          async listPublications() {
            return {rows: [durableRow]};
          },
          async upsertPublication(row) {
            durableRow = row;
          },
        },
        authoritativeControlPlaneView: {
          canRead() {
            return true;
          },
          async readRows(tableName) {
            return {
              success: true,
              rows: authoritativeRowsByTableName[tableName] || [],
            };
          },
        },
        systemTableCache: {
          getAll(tableName) {
            return cacheRowsByTableName[tableName] || [];
          },
        },
        now: () => PRIORITY_REFRESH_NOW_MS,
      });

      const result = await coordinator.reconcileClusterMembership();

      t.match(
        result.publicationRow,
        {
          priorityPartitionSummary: {
            satisfied: true,
            missingPartitionIds: [],
            blockedPartitions: [],
          },
        },
        'same-key fresher projection rows should replace stale authoritative rows',
      );
    });

  test('reconcileClusterMembership closes ack-complete open rows during metadata refresh',
    async (t) => {
      const REFRESH_PUBLICATION_ID = 'publication-ack-complete-refresh';
      const REFRESH_PUBLICATION_KIND = 'cluster_membership';
      const REFRESH_PUBLICATION_EPOCH = 24;
      const REFRESH_STATUS_OPEN = 'OPEN';
      const REFRESH_STATUS_PUBLISHED = 'PUBLISHED';
      const REFRESH_OLD_TIMESTAMP_MS = 2400;
      const REFRESH_NOW_MS = 2800;
      const REFRESH_REQUIRED_DISTINCT_NODE_COUNT = 3;
      const REFRESH_READY_ELIGIBLE_NODE_COUNT = 3;
      const REFRESH_STALE_READY_DISTINCT_NODE_COUNT = 2;
      const REFRESH_SPREAD_GAP = 1;
      const REFRESH_ACK_COMPLETED_REASON =
        'required_acknowledgements_completed';
      const REFRESH_STALE_PARTITION_ID = PRIORITY_REFRESH_PARTITION_IDS[0];
      const latestPublicationRow = {
        publication_id: REFRESH_PUBLICATION_ID,
        publication_kind: REFRESH_PUBLICATION_KIND,
        publication_epoch: REFRESH_PUBLICATION_EPOCH,
        published_active_node_ids: [...PRIORITY_REFRESH_NODE_IDS],
        required_ack_node_ids: [...PRIORITY_REFRESH_NODE_IDS],
        acknowledged_node_ids: [...PRIORITY_REFRESH_NODE_IDS],
        priority_partition_summary: {
          satisfied: false,
          requiredDistinctNodeCount: REFRESH_REQUIRED_DISTINCT_NODE_COUNT,
          readyEligibleNodeCount: REFRESH_READY_ELIGIBLE_NODE_COUNT,
          missingPartitionIds: [REFRESH_STALE_PARTITION_ID],
          blockedPartitions: [{
            partitionId: REFRESH_STALE_PARTITION_ID,
            requiredDistinctNodeCount: REFRESH_REQUIRED_DISTINCT_NODE_COUNT,
            readyDistinctNodeCount: REFRESH_STALE_READY_DISTINCT_NODE_COUNT,
            spreadGap: REFRESH_SPREAD_GAP,
          }],
        },
        membership_lifecycle_summary: {
          lifecycleState: MEMBERSHIP_LIFECYCLE_STATE.PUBLISH_PENDING,
        },
        status: REFRESH_STATUS_OPEN,
        updated_at: REFRESH_OLD_TIMESTAMP_MS,
      };
      const planningSnapshot = {
        latestPublicationRow,
        publishedActiveNodeIds: [...PRIORITY_REFRESH_NODE_IDS],
        requiredAckNodeIds: [...PRIORITY_REFRESH_NODE_IDS],
        priorityPartitionSummary: {
          satisfied: true,
          requiredDistinctNodeCount: REFRESH_REQUIRED_DISTINCT_NODE_COUNT,
          readyEligibleNodeCount: REFRESH_READY_ELIGIBLE_NODE_COUNT,
          missingPartitionIds: [],
          blockedPartitions: [],
        },
        nodeRows: [],
        nodeEndpointRows: [],
        serviceRows: [],
        partitionRows: [],
        replicaOperationRows: [],
        readinessEntries: [],
      };
      const persistedRows = [];
      const coordinator = new MembershipPublicationCoordinator({
        nodeId: PRIORITY_REFRESH_NODE_IDS[PRIORITY_REFRESH_LOCAL_NODE_INDEX],
        controlPlanePublicationsOwner: {
          async upsertPublication(row) {
            persistedRows.push(row);
          },
        },
        now: () => REFRESH_NOW_MS,
      });

      const result = await coordinator.reconcileClusterMembership({
        publicationRows: [latestPublicationRow],
        planningSnapshot,
      });

      t.equal(
        persistedRows.length,
        PRIORITY_REFRESH_EXPECTED_PERSIST_COUNT,
        'metadata refresh should persist exactly one repaired row',
      );
      t.match(
        persistedRows[0],
        {
          publication_id: REFRESH_PUBLICATION_ID,
          status: REFRESH_STATUS_PUBLISHED,
          published_at: REFRESH_NOW_MS,
          closed_at: REFRESH_NOW_MS,
          membership_lifecycle_summary: {
            lifecycleState: MEMBERSHIP_LIFECYCLE_STATE.PUBLISHED_ACTIVE,
          },
        },
        'ack-complete metadata refresh should close the durable row',
      );
      t.same(
        persistedRows[0].transition_history.map((entry) => entry.reasonCode),
        [REFRESH_ACK_COMPLETED_REASON],
        'repair transition should identify ack completion as the closure reason',
      );
      t.equal(
        result.publicationRow.status,
        REFRESH_STATUS_PUBLISHED,
        'reconcile result should expose the repaired published status',
      );
    });

  test('reconcileClusterMembership persists owner-derived ACK closure without metadata drift',
    async (t) => {
      const REFRESH_PUBLICATION_ID = 'publication-ack-owner-refresh';
      const REFRESH_PUBLICATION_KIND = 'cluster_membership';
      const REFRESH_PUBLICATION_EPOCH = 25;
      const REFRESH_STATUS_ACK_PENDING = 'ACK_PENDING';
      const REFRESH_STATUS_PUBLISHED = 'PUBLISHED';
      const REFRESH_OLD_TIMESTAMP_MS = 2500;
      const REFRESH_NOW_MS = 2900;
      const REFRESH_ACK_COMPLETED_REASON =
        'required_acknowledgements_completed';
      const latestPublicationRow = {
        publication_id: REFRESH_PUBLICATION_ID,
        publication_kind: REFRESH_PUBLICATION_KIND,
        publication_epoch: REFRESH_PUBLICATION_EPOCH,
        published_active_node_ids: [...PRIORITY_REFRESH_NODE_IDS],
        required_ack_node_ids: [...PRIORITY_REFRESH_NODE_IDS],
        acknowledged_node_ids: PRIORITY_REFRESH_NODE_IDS.slice(
          PRIORITY_REFRESH_LOCAL_NODE_INDEX,
          PRIORITY_REFRESH_NODE_IDS.length - 1,
        ),
        priority_partition_summary: {
          satisfied: true,
          requiredDistinctNodeCount: PRIORITY_REFRESH_REQUIRED_DISTINCT_NODE_COUNT,
          readyEligibleNodeCount: PRIORITY_REFRESH_READY_ELIGIBLE_NODE_COUNT,
          missingPartitionIds: [],
          blockedPartitions: [],
        },
        membership_lifecycle_summary: {
          lifecycleState: MEMBERSHIP_LIFECYCLE_STATE.PUBLISH_PENDING,
        },
        status: REFRESH_STATUS_ACK_PENDING,
        updated_at: REFRESH_OLD_TIMESTAMP_MS,
      };
      const planningSnapshot = {
        latestPublicationRow,
        publishedActiveNodeIds: [...PRIORITY_REFRESH_NODE_IDS],
        requiredAckNodeIds: [...PRIORITY_REFRESH_NODE_IDS],
        acknowledgedNodeIds: [...PRIORITY_REFRESH_NODE_IDS],
        priorityPartitionSummary: latestPublicationRow.priority_partition_summary,
        nodeRows: [],
        nodeEndpointRows: [],
        serviceRows: [],
        partitionRows: [],
        replicaOperationRows: [],
        readinessEntries: [],
      };
      const persistedRows = [];
      const coordinator = new MembershipPublicationCoordinator({
        nodeId: PRIORITY_REFRESH_NODE_IDS[PRIORITY_REFRESH_LOCAL_NODE_INDEX],
        controlPlanePublicationsOwner: {
          async upsertPublication(row) {
            persistedRows.push(row);
          },
        },
        now: () => REFRESH_NOW_MS,
      });

      const result = await coordinator.reconcileClusterMembership({
        publicationRows: [latestPublicationRow],
        planningSnapshot,
      });

      t.equal(
        persistedRows.length,
        PRIORITY_REFRESH_EXPECTED_PERSIST_COUNT,
        'ACK-only owner refresh should persist one repaired row',
      );
      t.same(
        persistedRows[0].acknowledged_node_ids,
        PRIORITY_REFRESH_NODE_IDS,
        'owner-derived ACK evidence should be written to the publication row',
      );
      t.equal(
        persistedRows[0].status,
        REFRESH_STATUS_PUBLISHED,
        'ACK-only owner refresh should close the publication',
      );
      t.same(
        persistedRows[0].transition_history.map((entry) => entry.reasonCode),
        [REFRESH_ACK_COMPLETED_REASON],
        'ACK-only closure should use the canonical ACK completion reason',
      );
      t.equal(
        result.publicationRow.status,
        REFRESH_STATUS_PUBLISHED,
        'reconcile result should expose the owner-closed publication',
      );
    });
}

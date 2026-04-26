import {registerMembershipPublicationCoordinatorTailFinalTests} from './membership-publication-coordinator-tail-final-test-cases.js';
import {
  INITIAL_PARTITION_IDS,
  SYSTEM_TABLE_NAME,
} from '../../src/bootstrap/system-table-schemas-constants.js';

export function registerMembershipPublicationCoordinatorTailMoreTests({
  test,
  acknowledgeMembershipPublication,
  buildMembershipPublicationRow,
  deriveMembershipPublicationCandidate,
  MembershipPublicationCoordinator,
  MEMBERSHIP_LIFECYCLE_STATE,
  isValidMembershipLifecycleTransition,
  ControlPlaneReadinessService,
  CONTROL_PLANE_AUTHORITATIVE_READ_MODE,
  REPLICA_OPERATION_VISIBILITY_READ_MODE,
  ControlPlanePublicationsOwner,
}) {
  const PRIORITY_REFRESH_NODE_IDS = Object.freeze([
    'node-1',
    'node-2',
    'node-3',
  ]);
  const PRIORITY_REFRESH_PARTITION_IDS = Object.freeze([
    INITIAL_PARTITION_IDS[SYSTEM_TABLE_NAME.CONTROL_PLANE_PUBLICATIONS],
    INITIAL_PARTITION_IDS[SYSTEM_TABLE_NAME.REPLICA_OPERATIONS],
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
  const DISPATCH_RETRY_SOURCE_NODE_ID = 'node-source';
  const DISPATCH_RETRY_TARGET_NODE_ID = 'node-target';
  const DISPATCH_RETRY_PARTITION_ID =
  INITIAL_PARTITION_IDS[SYSTEM_TABLE_NAME.SQL_TRANSACTION_PARTICIPANTS];
  const DISPATCH_RETRY_OPERATION_ID = 'op-active-source-removal-retry';
  const DISPATCH_RETRY_REPLICA_ID =
  'sql_transaction_participants-p1-r5';
  const DISPATCH_RETRY_OPERATION_TYPE_REPLACE = 'REPLACE';
  const DISPATCH_RETRY_STATUS_ACTIVE = 'active';
  const DISPATCH_RETRY_WORKFLOW_STEP_ACTIVE = 'ACTIVE';

  test('getDispatchRetryRowsForNode refreshes through the replica-operation owner when priority recovery leaves cache empty',
    async (t) => {
      const authoritativeQueryOptions = [];
      const coordinator = new MembershipPublicationCoordinator({
        nodeId: 'node-1',
        systemTableCache: {
          getAll(tableName) {
            if (tableName === 'replica_operations') {
              return [];
            }
            return [];
          },
        },
        controlPlaneReadinessService: {
          getMembershipPublicationDiagnosticsSync() {
            return {
              publicationEpoch: 14,
              publicationStatus: 'PUBLISHED',
              publishedActiveNodeIds: ['node-1'],
              priorityPartitionSummary: {
                requiredDistinctNodeCount: 2,
                readyEligibleNodeCount: 1,
                blockedPartitions: [{
                  partitionId: 'replica_operations-p1',
                  requiredDistinctNodeCount: 2,
                  readyDistinctNodeCount: 1,
                  spreadGap: 1,
                }],
                missingPartitionIds: ['replica_operations-p1'],
              },
              membershipLifecycleSummary: {
                locallyEligibleNodeIds: ['node-2'],
                projectedServingNodeIds: ['node-2'],
              },
            };
          },
        },
        replicaOperationRepository: {
          async queryIncompleteOperations(options) {
            authoritativeQueryOptions.push(options);
            return [{
              operationId: 'op-priority-retry-1',
              partitionId: 'replica_operations-p1',
              type: 'REPLACE',
              sourceNodeId: 'node-1',
              targetNodeId: 'node-2',
              status: 'pending',
              workflowStep: 'PENDING',
              stepsHistory: [],
            }];
          },
        },
      });

      const dispatchRows =
      await coordinator.getDispatchRetryRowsForNode('node-2');

      t.same(
        authoritativeQueryOptions,
        [{
          visibilityReadMode:
          REPLICA_OPERATION_VISIBILITY_READ_MODE.OWNER_RPC_REQUIRED,
        }],
        'priority recovery should ask the authoritative replica-operation owner for retry rows',
      );
      t.match(
        dispatchRows,
        [{
          operation_id: 'op-priority-retry-1',
          target_node_id: 'node-2',
          workflow_step: 'PENDING',
        }],
        'owner-selected retry rows should be returned in replica_operations row shape',
      );
      t.end();
    });

  test('getDispatchRetryRowsForNode respects canonical target ownership for replace operations',
    async (t) => {
      const authoritativeQueryOptions = [];
      const coordinator = new MembershipPublicationCoordinator({
        nodeId: 'node-2',
        systemTableCache: {
          getAll(tableName) {
            if (tableName === 'replica_operations') {
              return [];
            }
            return [];
          },
        },
        controlPlaneReadinessService: {
          getMembershipPublicationDiagnosticsSync() {
            return {
              publicationEpoch: 15,
              publicationStatus: 'PUBLISHED',
              publishedActiveNodeIds: ['node-1'],
              priorityPartitionSummary: {
                requiredDistinctNodeCount: 2,
                readyEligibleNodeCount: 1,
                blockedPartitions: [{
                  partitionId: 'replica_operations-p1',
                  requiredDistinctNodeCount: 2,
                  readyDistinctNodeCount: 1,
                  spreadGap: 1,
                }],
                missingPartitionIds: ['replica_operations-p1'],
              },
              membershipLifecycleSummary: {
                locallyEligibleNodeIds: ['node-2'],
                projectedServingNodeIds: ['node-2'],
              },
            };
          },
        },
        replicaOperationRepository: {
          isOperationLocallyOwned(operation) {
            return operation?.targetNodeId === 'node-2';
          },
          async queryIncompleteOperations(options) {
            authoritativeQueryOptions.push(options);
            return [{
              operationId: 'op-priority-retry-target-owner',
              partitionId: 'replica_operations-p1',
              type: 'REPLACE',
              sourceNodeId: 'node-1',
              targetNodeId: 'node-2',
              status: 'pending',
              workflowStep: 'PENDING',
              stepsHistory: [],
            }];
          },
        },
      });

      const dispatchRows =
      await coordinator.getDispatchRetryRowsForNode('node-2');

      t.same(
        authoritativeQueryOptions,
        [{
          visibilityReadMode:
          REPLICA_OPERATION_VISIBILITY_READ_MODE.OWNER_RPC_REQUIRED,
        }],
        'canonical ownership resolver should allow authoritative refresh for target-owned rows',
      );
      t.match(
        dispatchRows,
        [{
          operation_id: 'op-priority-retry-target-owner',
          target_node_id: 'node-2',
          workflow_step: 'PENDING',
        }],
        'owner-selected retry rows should include target-owned replace operations',
      );
      t.end();
    });

  test('getDispatchRetryRowsForNode replays ACTIVE replace source removal by source node',
    async (t) => {
      const coordinator = new MembershipPublicationCoordinator({
        nodeId: DISPATCH_RETRY_TARGET_NODE_ID,
        systemTableCache: {
          getAll(tableName) {
            if (tableName !== SYSTEM_TABLE_NAME.REPLICA_OPERATIONS) {
              return [];
            }
            return [{
              operation_id: DISPATCH_RETRY_OPERATION_ID,
              partition_id: DISPATCH_RETRY_PARTITION_ID,
              entity_id: DISPATCH_RETRY_PARTITION_ID,
              entity_type: PRIORITY_REFRESH_SERVICE_TYPE_PARTITION,
              type: DISPATCH_RETRY_OPERATION_TYPE_REPLACE,
              source_node_id: DISPATCH_RETRY_SOURCE_NODE_ID,
              target_node_id: DISPATCH_RETRY_TARGET_NODE_ID,
              replica_id: DISPATCH_RETRY_REPLICA_ID,
              status: DISPATCH_RETRY_STATUS_ACTIVE,
              workflow_step: DISPATCH_RETRY_WORKFLOW_STEP_ACTIVE,
              steps_history: [],
            }];
          },
        },
        replicaOperationRepository: {
          isOperationLocallyOwned(operation) {
            return operation?.targetNodeId === DISPATCH_RETRY_TARGET_NODE_ID;
          },
        },
      });

      const dispatchRows =
      await coordinator.getDispatchRetryRowsForNode(
        DISPATCH_RETRY_SOURCE_NODE_ID,
      );

      t.match(
        dispatchRows,
        [{
          operation_id: DISPATCH_RETRY_OPERATION_ID,
          source_node_id: DISPATCH_RETRY_SOURCE_NODE_ID,
          target_node_id: DISPATCH_RETRY_TARGET_NODE_ID,
          workflow_step: DISPATCH_RETRY_WORKFLOW_STEP_ACTIVE,
        }],
        'source-node retry should include target-owned ACTIVE replace source removal',
      );
      t.end();
    });

  test('getLatestPublishedClusterPublicationSync keeps the last published epoch when a newer publication is still open',
    async (t) => {
      const coordinator = new MembershipPublicationCoordinator({
        nodeId: 'seed-node',
        systemTableCache: {
          getAll(tableName) {
            if (tableName !== 'control_plane_publications') {
              return [];
            }
            return [
              {
                publication_id: 'publication-12',
                publication_kind: 'cluster_membership',
                publication_epoch: 12,
                published_active_node_ids: ['node-1', 'node-2', 'node-3'],
                status: 'PUBLISHED',
              },
              {
                publication_id: 'publication-13',
                publication_kind: 'cluster_membership',
                publication_epoch: 13,
                published_active_node_ids: ['node-1', 'node-2', 'node-3', 'node-4'],
                status: 'OPEN',
              },
            ];
          },
        },
      });

      const latestPublishedPublication =
      coordinator.getLatestPublishedClusterPublicationSync();

      t.match(latestPublishedPublication, {
        publicationEpoch: 12,
        status: 'PUBLISHED',
        publishedActiveNodeIds: ['node-1', 'node-2', 'node-3'],
      });
    });

  test('getLatestPublishedClusterPublication prefers authoritative publication history when requested',
    async (t) => {
      const coordinator = new MembershipPublicationCoordinator({
        nodeId: 'seed-node',
        systemTableCache: {
          getAll(tableName) {
            if (tableName !== 'control_plane_publications') {
              return [];
            }
            return [{
              publication_id: 'publication-13',
              publication_kind: 'cluster_membership',
              publication_epoch: 13,
              published_active_node_ids: ['node-1', 'node-2', 'node-3', 'node-4'],
              status: 'OPEN',
            }];
          },
        },
        controlPlanePublicationsOwner: {
          async listPublicationsFromCache() {
            t.fail('authoritative publication reads should bypass cache-only publication rows');
            return {rows: []};
          },
          async listPublications() {
            return {
              rows: [
                {
                  publication_id: 'publication-12',
                  publication_kind: 'cluster_membership',
                  publication_epoch: 12,
                  published_active_node_ids: ['node-1', 'node-2', 'node-3'],
                  status: 'PUBLISHED',
                },
                {
                  publication_id: 'publication-13',
                  publication_kind: 'cluster_membership',
                  publication_epoch: 13,
                  published_active_node_ids: ['node-1', 'node-2', 'node-3', 'node-4'],
                  status: 'OPEN',
                },
              ],
            };
          },
        },
      });

      const latestPublishedPublication =
      await coordinator.getLatestPublishedClusterPublication({
        preferAuthoritativeRead: true,
      });

      t.match(latestPublishedPublication, {
        publicationEpoch: 12,
        status: 'PUBLISHED',
        publishedActiveNodeIds: ['node-1', 'node-2', 'node-3'],
      });
    });

  test('reconcileClusterMembership reuses an unchanged published row instead of resetting it to OPEN',
    async (t) => {
      const latestPublicationRow = {
        publication_id: 'publication-12',
        publication_kind: 'cluster_membership',
        publication_epoch: 12,
        published_active_node_ids: ['node-1', 'node-2'],
        required_ack_node_ids: ['node-1', 'node-2'],
        acknowledged_node_ids: ['node-1', 'node-2'],
        membership_lifecycle_summary: {
          lifecycleState: MEMBERSHIP_LIFECYCLE_STATE.PUBLISHED_ACTIVE,
          epochBoundary: 'published_membership',
        },
        status: 'PUBLISHED',
        updated_at: 1200,
        published_at: 1200,
        closed_at: 1200,
      };
      let upsertCallCount = 0;
      const coordinator = new MembershipPublicationCoordinator({
        nodeId: 'node-1',
        controlPlanePublicationsOwner: {
          async listPublications() {
            return {rows: [latestPublicationRow]};
          },
          async upsertPublication() {
            upsertCallCount += 1;
          },
        },
        systemTableCache: {
          getAll(tableName) {
            if (tableName === 'nodes') {
              return [{
                node_id: 'node-1',
                status: 'active',
                connection_state: 'ready',
                ready_lease_expires_at: 5000,
              }, {
                node_id: 'node-2',
                status: 'active',
                connection_state: 'ready',
                ready_lease_expires_at: 5000,
              }];
            }
            if (tableName === 'node_endpoints') {
              return [{
                endpoint_id: 'node-1-ws',
                node_id: 'node-1',
                transport_type: 'ws',
                status: 'active',
                address: 'ws://node-1:8082',
              }, {
                endpoint_id: 'node-2-ws',
                node_id: 'node-2',
                transport_type: 'ws',
                status: 'active',
                address: 'ws://node-2:8082',
              }];
            }
            if (tableName === 'services') {
              return [{
                service_id: 'svc-1',
                node_id: 'node-1',
                status: 'active',
              }, {
                service_id: 'svc-2',
                node_id: 'node-2',
                status: 'active',
              }];
            }
            if (tableName === 'control_plane_publications') {
              return [latestPublicationRow];
            }
            return [];
          },
        },
        now: () => 1500,
      });

      const result = await coordinator.reconcileClusterMembership();

      t.equal(
        upsertCallCount,
        0,
        'unchanged published membership should not be rewritten through the publication owner',
      );
      t.match(
        result.publicationRow,
        {
          publicationId: 'publication-12',
          publicationEpoch: 12,
          status: 'PUBLISHED',
          publishedActiveNodeIds: ['node-1', 'node-2'],
          acknowledgedNodeIds: ['node-1', 'node-2'],
        },
        'the durable published membership should remain the observed truth when the candidate is unchanged',
      );
    });

  test('deriveMembershipPublicationCandidate counts promotable learners toward priority spread quorum',
    async (t) => {
      const priorityTableIds = [
        'control_plane_publications',
        'replica_operations',
        'sql_transaction_participants',
        'sql_transactions',
        'sql_write_operations',
      ];
      const serviceRows = priorityTableIds.flatMap((tableId, index) => {
        const partitionId = `${tableId}-p1`;
        return [{
          service_id: `${tableId}-leader-${index}`,
          node_id: 'node-1',
          partition_id: partitionId,
          service_type: 'partition',
          status: 'active',
          raft_role: 'leader',
          address: `node-1/partition/${partitionId}-r1`,
        }, {
          service_id: `${tableId}-learner-${index}`,
          node_id: 'node-2',
          partition_id: partitionId,
          service_type: 'partition',
          status: 'active',
          raft_role: 'learner',
          address: `node-2/partition/${partitionId}-r2`,
        }];
      });
      const candidate = deriveMembershipPublicationCandidate({
        publisherNodeId: 'seed-node',
        latestPublicationRow: {
          publication_epoch: 12,
          status: 'PUBLISHED',
          published_active_node_ids: ['node-1'],
          required_ack_node_ids: ['node-1'],
          acknowledged_node_ids: ['node-1'],
        },
        nodeRows: [
          {
            node_id: 'node-1',
            status: 'active',
            connection_state: 'ready',
            ready_lease_expires_at: 5000,
          },
          {
            node_id: 'node-2',
            status: 'active',
            connection_state: 'ready',
            ready_lease_expires_at: 5000,
          },
        ],
        readinessEntries: [
          {
            nodeId: 'node-1',
            dimensions: {
              clusterMemberHealthy: true,
              controlPlanePublished: true,
              controlPlaneWritable: true,
              repairEligible: true,
              serveEligible: true,
            },
          },
          {
            nodeId: 'node-2',
            dimensions: {
              clusterMemberHealthy: true,
              controlPlaneRecoveryEligible: true,
              controlPlaneWritable: true,
              repairEligible: true,
              serveEligible: true,
            },
          },
        ],
        nodeEndpointRows: [
          {
            endpoint_id: 'node-1-ws',
            node_id: 'node-1',
            transport_type: 'ws',
            status: 'active',
            address: 'ws://node-1:8082',
          },
          {
            endpoint_id: 'node-2-ws',
            node_id: 'node-2',
            transport_type: 'ws',
            status: 'active',
            address: 'ws://node-2:8082',
          },
        ],
        serviceRows,
        nowMs: 1000,
      });

      t.same(
        candidate.publishedActiveNodeIds,
        ['node-1', 'node-2'],
        'promotable learners should be included in the published active set while priority spread recovery is pending',
      );
      t.match(
        candidate.priorityPartitionSummary,
        {
          satisfied: true,
          requiredDistinctNodeCount: 2,
          missingPartitionIds: [],
          blockedPartitions: [],
        },
        'active promotable learners should satisfy the derived priority spread quorum',
      );
    });

  test('deriveMembershipPublicationCandidate prefers fresher derived priority spread over stale embedded metadata',
    async (t) => {
      const priorityTableIds = [
        'control_plane_publications',
        'replica_operations',
        'sql_transaction_participants',
        'sql_transactions',
        'sql_write_operations',
      ];
      const stalePriorityPartitionId = 'control_plane_publications-p1';
      const serviceRows = priorityTableIds.flatMap((tableId, index) => {
        const partitionId = `${tableId}-p1`;
        return [{
          service_id: `${tableId}-leader-${index}`,
          node_id: 'node-1',
          partition_id: partitionId,
          service_type: 'partition',
          status: 'active',
          raft_role: 'leader',
          address: `node-1/partition/${partitionId}-r1`,
        }, {
          service_id: `${tableId}-learner-${index}`,
          node_id: 'node-2',
          partition_id: partitionId,
          service_type: 'partition',
          status: 'active',
          raft_role: 'learner',
          address: `node-2/partition/${partitionId}-r2`,
        }];
      });
      const candidate = deriveMembershipPublicationCandidate({
        publisherNodeId: 'seed-node',
        latestPublicationRow: {
          publication_epoch: 12,
          status: 'PUBLISHED',
          published_active_node_ids: ['node-1'],
          required_ack_node_ids: ['node-1'],
          acknowledged_node_ids: ['node-1'],
          priority_partition_summary: {
            satisfied: false,
            requiredDistinctNodeCount: 2,
            readyEligibleNodeCount: 2,
            totalPriorityPartitionCount: priorityTableIds.length,
            missingPartitionIds: [stalePriorityPartitionId],
            blockedPartitions: [{
              partitionId: stalePriorityPartitionId,
              requiredDistinctNodeCount: 2,
              readyDistinctNodeCount: 1,
              spreadGap: 1,
            }],
          },
        },
        nodeRows: [
          {
            node_id: 'node-1',
            status: 'active',
            connection_state: 'ready',
            ready_lease_expires_at: 5000,
          },
          {
            node_id: 'node-2',
            status: 'active',
            connection_state: 'ready',
            ready_lease_expires_at: 5000,
          },
        ],
        readinessEntries: [
          {
            nodeId: 'node-1',
            dimensions: {
              clusterMemberHealthy: true,
              controlPlanePublished: true,
              controlPlaneWritable: true,
              repairEligible: true,
              serveEligible: true,
            },
          },
          {
            nodeId: 'node-2',
            dimensions: {
              clusterMemberHealthy: true,
              controlPlaneRecoveryEligible: true,
              controlPlaneWritable: true,
              repairEligible: true,
              serveEligible: true,
            },
          },
        ],
        nodeEndpointRows: [
          {
            endpoint_id: 'node-1-ws',
            node_id: 'node-1',
            transport_type: 'ws',
            status: 'active',
            address: 'ws://node-1:8082',
          },
          {
            endpoint_id: 'node-2-ws',
            node_id: 'node-2',
            transport_type: 'ws',
            status: 'active',
            address: 'ws://node-2:8082',
          },
        ],
        serviceRows,
        nowMs: 1000,
      });

      t.match(
        candidate.priorityPartitionSummary,
        {
          satisfied: true,
          requiredDistinctNodeCount: 2,
          missingPartitionIds: [],
          blockedPartitions: [],
        },
        'fresher service-row spread evidence should replace stale embedded blocked priority metadata',
      );
    });

  test('deriveClusterMembershipCandidateSync counts promotable learners toward priority spread quorum from cached readiness',
    async (t) => {
      const priorityTableIds = [
        'control_plane_publications',
        'replica_operations',
        'sql_transaction_participants',
        'sql_transactions',
        'sql_write_operations',
      ];
      const serviceRows = priorityTableIds.flatMap((tableId, index) => {
        const partitionId = `${tableId}-p1`;
        return [{
          service_id: `${tableId}-leader-${index}`,
          node_id: 'node-1',
          partition_id: partitionId,
          service_type: 'partition',
          status: 'active',
          raft_role: 'leader',
          address: `node-1/partition/${partitionId}-r1`,
        }, {
          service_id: `${tableId}-learner-${index}`,
          node_id: 'node-2',
          partition_id: partitionId,
          service_type: 'partition',
          status: 'active',
          raft_role: 'learner',
          address: `node-2/partition/${partitionId}-r2`,
        }];
      });
      const coordinator = new MembershipPublicationCoordinator({
        nodeId: 'node-1',
        systemTableCache: {
          getAll(tableName) {
            if (tableName === 'nodes') {
              return [{
                node_id: 'node-1',
                status: 'active',
                connection_state: 'ready',
                ready_lease_expires_at: 5000,
              }, {
                node_id: 'node-2',
                status: 'active',
                connection_state: 'ready',
                ready_lease_expires_at: 5000,
              }];
            }
            if (tableName === 'node_endpoints') {
              return [{
                endpoint_id: 'node-1-ws',
                node_id: 'node-1',
                transport_type: 'ws',
                status: 'active',
                address: 'ws://node-1:8082',
              }, {
                endpoint_id: 'node-2-ws',
                node_id: 'node-2',
                transport_type: 'ws',
                status: 'active',
                address: 'ws://node-2:8082',
              }];
            }
            if (tableName === 'services') {
              return serviceRows;
            }
            return [];
          },
        },
        controlPlaneReadinessService: {
          getAllNodeReadinessSync() {
            return [{
              nodeId: 'node-1',
              dimensions: {
                clusterMemberHealthy: true,
                controlPlanePublished: true,
                controlPlaneWritable: true,
                repairEligible: true,
                serveEligible: true,
              },
            }, {
              nodeId: 'node-2',
              dimensions: {
                clusterMemberHealthy: true,
                controlPlaneRecoveryEligible: true,
                controlPlaneWritable: true,
                repairEligible: true,
                serveEligible: true,
              },
            }];
          },
        },
        now: () => 1000,
      });
      const candidate = coordinator.deriveClusterMembershipCandidateSync({
        publisherNodeId: 'node-1',
        latestPublicationRow: {
          publication_epoch: 12,
          status: 'PUBLISHED',
          published_active_node_ids: ['node-1'],
          required_ack_node_ids: ['node-1'],
          acknowledged_node_ids: ['node-1'],
        },
        nowMs: 1000,
      });

      t.same(
        candidate.publishedActiveNodeIds,
        ['node-1', 'node-2'],
        'sync planning should include promotable learners in the published active set',
      );
      t.match(
        candidate.priorityPartitionSummary,
        {
          satisfied: true,
          requiredDistinctNodeCount: 2,
          missingPartitionIds: [],
          blockedPartitions: [],
        },
        'sync planning should count cached promotable learners toward priority spread quorum',
      );
    });

  test('getNodeReadinessSync avoids recursive membership publication planning when readiness is queried from publication planning',
    async (t) => {
      const priorityTableIds = [
        'control_plane_publications',
        'replica_operations',
        'sql_transaction_participants',
        'sql_transactions',
        'sql_write_operations',
      ];
      const serviceRows = priorityTableIds.flatMap((tableId, index) => {
        const partitionId = `${tableId}-p1`;
        return [{
          service_id: `${tableId}-leader-${index}`,
          node_id: 'node-1',
          partition_id: partitionId,
          service_type: 'partition',
          status: 'active',
          raft_role: 'leader',
          address: `node-1/partition/${partitionId}-r1`,
        }, {
          service_id: `${tableId}-learner-${index}`,
          node_id: 'node-2',
          partition_id: partitionId,
          service_type: 'partition',
          status: 'active',
          raft_role: 'learner',
          address: `node-2/partition/${partitionId}-r2`,
        }];
      });
      const partitionRows = priorityTableIds.map((tableId) => ({
        partition_id: `${tableId}-p1`,
        table_id: tableId,
        table_name: tableId,
        leader_node_id: 'node-1',
      }));
      const cacheRowsByTableName = {
        control_plane_publications: [{
          publication_id: 'pub-12',
          publication_epoch: 12,
          status: 'OPEN',
          published_active_node_ids: ['node-1'],
          required_ack_node_ids: ['node-1', 'node-2'],
          acknowledged_node_ids: ['node-1'],
        }],
        nodes: [{
          node_id: 'node-1',
          status: 'active',
          connection_state: 'ready',
          ready_lease_expires_at: 5000,
          last_heartbeat: 900,
        }, {
          node_id: 'node-2',
          status: 'active',
          connection_state: 'ready',
          ready_lease_expires_at: 5000,
          last_heartbeat: 900,
        }],
        node_endpoints: [{
          endpoint_id: 'node-1-ws',
          node_id: 'node-1',
          transport_type: 'ws',
          status: 'active',
          address: 'ws://node-1:8082',
        }, {
          endpoint_id: 'node-2-ws',
          node_id: 'node-2',
          transport_type: 'ws',
          status: 'active',
          address: 'ws://node-2:8082',
        }],
        services: serviceRows,
        partitions: partitionRows,
      };
      const systemTableCache = {
        getAll(tableName) {
          return cacheRowsByTableName[tableName] || [];
        },
      };
      const messageRouter = {
        getConnectedNodes() {
          return ['node-1', 'node-2'];
        },
        getConnectionState() {
          return 'connected';
        },
      };
      const readinessService = new ControlPlaneReadinessService({
        nodeId: 'node-1',
        systemTableCache,
        messageRouter,
        now: () => 1000,
      });
      const coordinator = new MembershipPublicationCoordinator({
        nodeId: 'node-1',
        systemTableCache,
        controlPlaneReadinessService: readinessService,
        now: () => 1000,
      });
      readinessService.syncOwnerDependencies({
        membershipPublicationService: coordinator,
        messageRouter,
        systemTableCache,
      });

      const readiness = readinessService.getNodeReadinessSync('node-1');

      t.equal(
        readiness?.nodeId,
        'node-1',
        'sync readiness should complete without recursive publication-planning overflow',
      );
      t.equal(
        readiness?.priorityControlPlaneRecovery?.active,
        true,
        'sync readiness should preserve priority recovery state while using direct publication-row planning',
      );
    });

  test('reconcileClusterMembership refreshes priority spread metadata when membership is unchanged',
    async (t) => {
      const latestPublicationRow = {
        publication_id: 'publication-12',
        publication_kind: 'cluster_membership',
        publication_epoch: 12,
        published_active_node_ids: ['node-1', 'node-2', 'node-3'],
        required_ack_node_ids: ['node-1', 'node-2', 'node-3'],
        acknowledged_node_ids: ['node-1', 'node-2', 'node-3'],
        membership_lifecycle_summary: {
          lifecycleState: MEMBERSHIP_LIFECYCLE_STATE.PUBLISHED_ACTIVE,
          epochBoundary: 'published_membership',
        },
        status: 'PUBLISHED',
        updated_at: 1200,
        published_at: 1200,
        closed_at: 1200,
      };
      const persistedRows = [];
      const coordinator = new MembershipPublicationCoordinator({
        nodeId: 'node-1',
        controlPlanePublicationsOwner: {
          async listPublications() {
            return {rows: [latestPublicationRow]};
          },
          async upsertPublication(row) {
            persistedRows.push(row);
          },
        },
        systemTableCache: {
          getAll(tableName) {
            if (tableName === 'nodes') {
              return [{
                node_id: 'node-1',
                status: 'active',
                connection_state: 'ready',
                ready_lease_expires_at: 5000,
              }, {
                node_id: 'node-2',
                status: 'active',
                connection_state: 'ready',
                ready_lease_expires_at: 5000,
              }, {
                node_id: 'node-3',
                status: 'active',
                connection_state: 'ready',
                ready_lease_expires_at: 5000,
              }];
            }
            if (tableName === 'node_endpoints') {
              return [{
                endpoint_id: 'node-1-ws',
                node_id: 'node-1',
                transport_type: 'ws',
                status: 'active',
                address: 'ws://node-1:8082',
              }, {
                endpoint_id: 'node-2-ws',
                node_id: 'node-2',
                transport_type: 'ws',
                status: 'active',
                address: 'ws://node-2:8082',
              }, {
                endpoint_id: 'node-3-ws',
                node_id: 'node-3',
                transport_type: 'ws',
                status: 'active',
                address: 'ws://node-3:8082',
              }];
            }
            if (tableName === 'services') {
              return [{
                service_id: 'cp-publications-r1',
                node_id: 'node-1',
                partition_id: 'control_plane_publications-p1',
                service_type: 'partition',
                status: 'active',
                raft_role: 'leader',
                address: 'node-1/partition/control_plane_publications-p1-r1',
              }, {
                service_id: 'cp-publications-r2',
                node_id: 'node-2',
                partition_id: 'control_plane_publications-p1',
                service_type: 'partition',
                status: 'active',
                raft_role: 'follower',
                address: 'node-2/partition/control_plane_publications-p1-r2',
              }, {
                service_id: 'cp-publications-r3',
                node_id: 'node-3',
                partition_id: 'control_plane_publications-p1',
                service_type: 'partition',
                status: 'active',
                raft_role: 'follower',
                address: 'node-3/partition/control_plane_publications-p1-r3',
              }, {
                service_id: 'replica-ops-r1',
                node_id: 'node-1',
                partition_id: 'replica_operations-p1',
                service_type: 'partition',
                status: 'active',
                raft_role: 'leader',
                address: 'node-1/partition/replica_operations-p1-r1',
              }, {
                service_id: 'replica-ops-r2',
                node_id: 'node-1',
                partition_id: 'replica_operations-p1',
                service_type: 'partition',
                status: 'active',
                raft_role: 'follower',
                address: 'node-1/partition/replica_operations-p1-r2',
              }, {
                service_id: 'replica-ops-r3',
                node_id: 'node-1',
                partition_id: 'replica_operations-p1',
                service_type: 'partition',
                status: 'active',
                raft_role: 'follower',
                address: 'node-1/partition/replica_operations-p1-r3',
              }];
            }
            if (tableName === 'control_plane_publications') {
              return [latestPublicationRow];
            }
            return [];
          },
        },
        now: () => 1500,
      });

      const result = await coordinator.reconcileClusterMembership();

      t.equal(
        persistedRows.length,
        1,
        'unchanged active membership should still refresh missing priority spread metadata',
      );
      t.match(
        result.publicationRow,
        {
          publicationEpoch: 12,
          status: 'PUBLISHED',
          priorityPartitionSummary: {
            satisfied: false,
          },
        },
        'metadata-only refreshes should update the existing epoch rather than reopening membership publication',
      );
    });

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

  test('reconcileClusterMembership uses authoritative readiness when published priority spread is still blocked',
    async (t) => {
      const latestPublicationRow = {
        publication_id: 'publication-12',
        publication_kind: 'cluster_membership',
        publication_epoch: 12,
        published_active_node_ids: ['node-1', 'node-2'],
        required_ack_node_ids: ['node-1', 'node-2'],
        acknowledged_node_ids: ['node-1', 'node-2'],
        priority_partition_summary: {
          satisfied: false,
          requiredDistinctNodeCount: 2,
          readyEligibleNodeCount: 2,
        },
        membership_lifecycle_summary: {
          lifecycleState: MEMBERSHIP_LIFECYCLE_STATE.PUBLISHED_ACTIVE,
          epochBoundary: 'published_membership',
        },
        status: 'PUBLISHED',
        updated_at: 1200,
        published_at: 1200,
        closed_at: 1200,
      };
      const persistedRows = [];
      const readinessRefreshModes = [];
      const coordinator = new MembershipPublicationCoordinator({
        nodeId: 'node-1',
        controlPlanePublicationsOwner: {
          async listPublications() {
            return {rows: [latestPublicationRow]};
          },
          async upsertPublication(row) {
            persistedRows.push(row);
          },
        },
        controlPlaneReadinessService: {
          async getAllNodeReadiness(options = {}) {
            readinessRefreshModes.push(options.allowAuthoritativeRefresh === true);
            if (options.allowAuthoritativeRefresh === true) {
              return [{
                nodeId: 'node-1',
                dimensions: {clusterMemberHealthy: true},
              }, {
                nodeId: 'node-2',
                dimensions: {clusterMemberHealthy: true},
              }, {
                nodeId: 'node-3',
                dimensions: {
                  clusterMemberHealthy: false,
                  controlPlaneRecoveryEligible: true,
                  controlPlaneWritable: false,
                },
              }];
            }
            return [{
              nodeId: 'node-1',
              dimensions: {clusterMemberHealthy: true},
            }, {
              nodeId: 'node-2',
              dimensions: {clusterMemberHealthy: true},
            }];
          },
          getRecoveryEpochHistoryByNodeId() {
            return {};
          },
        },
        systemTableCache: {
          getAll(tableName) {
            if (tableName === 'nodes') {
              return [{
                node_id: 'node-1',
                status: 'active',
                connection_state: 'ready',
                ready_lease_expires_at: 5000,
              }, {
                node_id: 'node-2',
                status: 'active',
                connection_state: 'ready',
                ready_lease_expires_at: 5000,
              }, {
                node_id: 'node-3',
                status: 'active',
                connection_state: 'ready',
                ready_lease_expires_at: 5000,
              }];
            }
            if (tableName === 'node_endpoints') {
              return [{
                endpoint_id: 'node-1-ws',
                node_id: 'node-1',
                transport_type: 'ws',
                status: 'active',
                address: 'ws://node-1:8082',
              }, {
                endpoint_id: 'node-2-ws',
                node_id: 'node-2',
                transport_type: 'ws',
                status: 'active',
                address: 'ws://node-2:8082',
              }, {
                endpoint_id: 'node-3-ws',
                node_id: 'node-3',
                transport_type: 'ws',
                status: 'active',
                address: 'ws://node-3:8082',
              }];
            }
            if (tableName === 'services') {
              return [{
                service_id: 'svc-1',
                node_id: 'node-1',
                status: 'active',
              }, {
                service_id: 'svc-2',
                node_id: 'node-2',
                status: 'active',
              }, {
                service_id: 'svc-3',
                node_id: 'node-3',
                status: 'active',
              }];
            }
            if (tableName === 'control_plane_publications') {
              return [latestPublicationRow];
            }
            return [];
          },
        },
        now: () => 1500,
      });

      const result = await coordinator.reconcileClusterMembership();

      t.same(
        readinessRefreshModes,
        [true],
        'priority-spread recovery should refresh readiness authoritatively before re-deriving membership',
      );
      t.equal(
        persistedRows.length,
        1,
        'reconciliation should persist a new publication once authoritative readiness exposes a promotable recovery node',
      );
      t.match(
        result.candidate,
        {
          publicationEpoch: 13,
          publishedActiveNodeIds: ['node-1', 'node-2', 'node-3'],
          requiredAckNodeIds: ['node-1', 'node-2', 'node-3'],
        },
        'the reopened publication candidate should promote the recovery-eligible node into the published membership set',
      );
      t.equal(
        result.publicationRow?.status,
        'OPEN',
        'the persisted publication row should reopen the membership epoch',
      );
    });


  registerMembershipPublicationCoordinatorTailFinalTests({
    test,
    acknowledgeMembershipPublication,
    buildMembershipPublicationRow,
    deriveMembershipPublicationCandidate,
    MembershipPublicationCoordinator,
    MEMBERSHIP_LIFECYCLE_STATE,
    isValidMembershipLifecycleTransition,
    ControlPlaneReadinessService,
    CONTROL_PLANE_AUTHORITATIVE_READ_MODE,
    REPLICA_OPERATION_VISIBILITY_READ_MODE,
    ControlPlanePublicationsOwner,
  });
}

import {registerMembershipPublicationCoordinatorDispatchRetryTests} from './membership-publication-coordinator-dispatch-retry-test-cases.js';
import {registerMembershipPublicationCoordinatorPriorityRefreshTests} from './membership-publication-coordinator-priority-refresh-test-cases.js';
import {registerMembershipPublicationCoordinatorTailFinalTests} from './membership-publication-coordinator-tail-final-test-cases.js';
import {MEMBERSHIP_PUBLICATION_READ_SOURCE} from
  '../../src/control-plane/membership-publication-row-contract.js';

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
  const UNCHANGED_PUBLISHED_METADATA_REFRESH_COUNT = 1;
  const UNCHANGED_PUBLISHED_METADATA_REFRESH_ASSERTION =
    'unchanged published membership should refresh lifecycle metadata without reopening publication';

  registerMembershipPublicationCoordinatorDispatchRetryTests({
    test,
    MembershipPublicationCoordinator,
    REPLICA_OPERATION_VISIBILITY_READ_MODE,
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
        readSource:
          MEMBERSHIP_PUBLICATION_READ_SOURCE.AUTHORITATIVE_PREFERRED,
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
        UNCHANGED_PUBLISHED_METADATA_REFRESH_COUNT,
        UNCHANGED_PUBLISHED_METADATA_REFRESH_ASSERTION,
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
        'schema_operations',
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
        'schema_operations',
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
        'schema_operations',
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
        'schema_operations',
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

      let readiness = readinessService.getNodeReadinessSync('node-1');
      const planningOwner = readinessService.readinessPlanningSnapshotOwner;
      for (let tick = 0; tick < 50; tick += 1) {
        await new Promise((resolve) => setImmediate(resolve));
        if (planningOwner.queue.pending.size === 0 &&
            planningOwner.queue.inFlight.size === 0) {
          break;
        }
      }
      readiness = readinessService.getNodeReadinessSync('node-1');

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

  registerMembershipPublicationCoordinatorPriorityRefreshTests({
    test,
    MembershipPublicationCoordinator,
    MEMBERSHIP_LIFECYCLE_STATE,
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

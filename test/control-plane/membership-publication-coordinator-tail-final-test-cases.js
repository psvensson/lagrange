import {
  COLUMN,
  SERVICE_STATUS,
  SERVICE_TYPE,
  TABLES,
  WORKFLOW_STEP,
} from '../../src/constants/index.js';
import {
  MEMBERSHIP_PUBLICATION_READ_PROFILE,
  MEMBERSHIP_PUBLICATION_READ_SOURCE,
} from '../../src/control-plane/membership-publication-row-contract.js';
import {
  PUBLICATION_WRITE_OUTCOME,
  PUBLICATION_WRITE_REFUSAL,
} from '../../src/control-plane/owners/control-plane-publication-change.js';
import {
  authoritativePlanningViewOverRows,
  createPublicationStore,
  publicationsOwnerOverRows,
} from './publication-owner-test-support.js';

export function registerMembershipPublicationCoordinatorTailFinalTests({
  test,
  MembershipPublicationCoordinator,
  MEMBERSHIP_LIFECYCLE_STATE,
  CONTROL_PLANE_AUTHORITATIVE_READ_MODE,
}) {
  const AUTHORITATIVE_OWNER_METADATA_REFRESH_COUNT = 1;
  const AUTHORITATIVE_OWNER_METADATA_REFRESH_ASSERTION =
    'authoritative published row should refresh lifecycle metadata without opening a duplicate epoch';

  test('reconcileClusterMembership enables recovery-eligible projection while priority spread remains blocked even when discovery rows lag',
    async (t) => {
      const latestPublicationRow = {
        publication_id: 'publication-14',
        publication_kind: 'cluster_membership',
        publication_epoch: 14,
        published_active_node_ids: ['node-1', 'node-2'],
        required_ack_node_ids: ['node-1', 'node-2'],
        acknowledged_node_ids: ['node-1', 'node-2'],
        priority_partition_summary: {
          satisfied: false,
          requiredDistinctNodeCount: 2,
          readyEligibleNodeCount: 2,
          missingPartitionIds: [
            'control_plane_publications-p1',
            'replica_operations-p1',
          ],
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
      const readPlanningRows = (tableName) => {
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
        if (tableName === 'partitions' || tableName === 'replica_operations') {
          return [];
        }
        throw new Error(`Unexpected planning table: ${tableName}`);
      };
      const coordinator = new MembershipPublicationCoordinator({
        resolveIsControlPlanePublicationsWriteLeader: () => true,
        nodeId: 'node-1',
        controlPlanePublicationsOwner: publicationsOwnerOverRows({
          async listPublications() {
            return {success: true, rows: [latestPublicationRow]};
          },
          // The durable read the owner's guarded write is computed from.
          async getPublication(publicationId) {
            return [latestPublicationRow, ...persistedRows].filter((row) =>
              row?.publication_id === publicationId).at(-1) ?? null;
          },
          async storeRow(row) {
            persistedRows.push(row);
          },
        }),
        controlPlaneReadinessService: {
          async getAllNodeReadiness(options = {}) {
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
        authoritativeControlPlaneView: authoritativePlanningViewOverRows(readPlanningRows),
        systemTableCache: {getAll: readPlanningRows},
        now: () => 1500,
      });

      const result = await coordinator.reconcileClusterMembership();

      t.equal(
        persistedRows.length,
        1,
        'priority spread reconciliation should reopen membership when only recovery-eligible evidence is available for missing nodes',
      );
      t.match(
        result.candidate,
        {
          publicationEpoch: 15,
          publishedActiveNodeIds: ['node-1', 'node-2', 'node-3'],
          requiredAckNodeIds: ['node-1', 'node-2', 'node-3'],
          membershipLifecycleSummary: {
            projectionDiagnostics: {
              readinessDecisionMode: 'cluster_member_or_recovery_eligible',
              recoveryEligibleProjectionEnabled: true,
              recoveryEligibleIncludedNodeIds: ['node-3'],
            },
          },
        },
        'priority-spread repair should promote recovery-eligible nodes into the reopened published membership even when endpoint/service rows lag',
      );
      t.equal(
        result.publicationRow?.status,
        'OPEN',
        'reopened membership should remain OPEN until acknowledgements confirm the widened set',
      );
    });

  test('reconcileClusterMembership can widen publication using liveness fallback while priority spread remains blocked',
    async (t) => {
      const latestPublicationRow = {
        publication_id: 'publication-16',
        publication_kind: 'cluster_membership',
        publication_epoch: 16,
        published_active_node_ids: ['node-1', 'node-2'],
        required_ack_node_ids: ['node-1', 'node-2'],
        acknowledged_node_ids: ['node-1', 'node-2'],
        priority_partition_summary: {
          satisfied: false,
          requiredDistinctNodeCount: 2,
          readyEligibleNodeCount: 2,
          missingPartitionIds: [
            'control_plane_publications-p1',
            'replica_operations-p1',
          ],
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
      const readPlanningRows = (tableName) => {
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
        if (tableName === 'partitions' || tableName === 'replica_operations') {
          return [];
        }
        throw new Error(`Unexpected planning table: ${tableName}`);
      };
      const coordinator = new MembershipPublicationCoordinator({
        resolveIsControlPlanePublicationsWriteLeader: () => true,
        nodeId: 'node-1',
        controlPlanePublicationsOwner: publicationsOwnerOverRows({
          async listPublications() {
            return {success: true, rows: [latestPublicationRow]};
          },
          // The durable read the owner's guarded write is computed from.
          async getPublication(publicationId) {
            return [latestPublicationRow, ...persistedRows].filter((row) =>
              row?.publication_id === publicationId).at(-1) ?? null;
          },
          async storeRow(row) {
            persistedRows.push(row);
          },
        }),
        controlPlaneReadinessService: {
          async getAllNodeReadiness(options = {}) {
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
                  controlPlaneRecoveryEligible: false,
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
        authoritativeControlPlaneView: authoritativePlanningViewOverRows(readPlanningRows),
        systemTableCache: {getAll: readPlanningRows},
        now: () => 1500,
      });

      const result = await coordinator.reconcileClusterMembership();

      t.equal(
        persistedRows.length,
        1,
        'priority-spread repair should persist a widened publication when fresh liveness evidence is present',
      );
      t.match(
        result.candidate,
        {
          publicationEpoch: 17,
          publishedActiveNodeIds: ['node-1', 'node-2', 'node-3'],
          requiredAckNodeIds: ['node-1', 'node-2', 'node-3'],
        },
        'liveness fallback should reopen membership for spread recovery even when authoritative readiness temporarily fails closed',
      );
    });

  test('reconcileClusterMembership retries transient priority spread refresh write failures when membership is unchanged',
    async (t) => {
      let upsertCallCount = 0;
      let durableRow = {
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
      const readPlanningRows = (tableName) => {
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
          return [durableRow];
        }
        if (tableName === 'partitions' || tableName === 'replica_operations') {
          return [];
        }
        throw new Error(`Unexpected planning table: ${tableName}`);
      };
      const coordinator = new MembershipPublicationCoordinator({
        resolveIsControlPlanePublicationsWriteLeader: () => true,
        nodeId: 'node-1',
        controlPlanePublicationsOwner: publicationsOwnerOverRows({
          async listPublications() {
            return {success: true, rows: [durableRow]};
          },
          async getPublication(publicationId, options) {
            t.equal(
              publicationId,
              'publication-12',
              'metadata refresh retries should re-read the same publication row',
            );
            // Guarded write (2026-11-11): the change is computed from the
            // partition leader's own answer, never a preferred read. (A call
            // carrying a write's idempotency key is the test seam evaluating
            // that write's revision predicate, not a read of the owner.)
            if (options?.idempotencyKey !== undefined) {
              return durableRow;
            }
            t.match(options, {
              authoritativeReadMode:
              CONTROL_PLANE_AUTHORITATIVE_READ_MODE.OWNER_RPC_REQUIRED,
            }, 'metadata refresh retries should use owner-rpc required reads');
            return durableRow;
          },
          async storeRow(row) {
            upsertCallCount += 1;
            if (upsertCallCount === 1) {
              const error = new Error('Distributed operation failed due to participant failures');
              error.code = 'DISTRIBUTED_PARTICIPANT_FAILURE';
              throw error;
            }
            durableRow = row;
          },
        }),
        authoritativeControlPlaneView: authoritativePlanningViewOverRows(readPlanningRows),
        systemTableCache: {getAll: readPlanningRows},
        now: () => 1500,
      });

      const result = await coordinator.reconcileClusterMembership();

      t.equal(
        upsertCallCount,
        2,
        'transient priority spread refresh write failures should retry within the existing persistence budget',
      );
      t.match(
        durableRow,
        {
          publication_epoch: 12,
          status: 'PUBLISHED',
          priority_partition_summary: {
            satisfied: false,
          },
        },
        'the retried metadata refresh should persist the updated priority spread summary on the existing epoch',
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
        'the caller should receive the refreshed priority spread summary after retry',
      );
    });

  test('reconcileClusterMembership reads the publication owner directly when the cache is empty',
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
      let cacheReadCount = 0;
      let authoritativeReadCount = 0;
      const readPlanningRows = (tableName) => {
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
          return [];
        }
        if (tableName === 'partitions' || tableName === 'replica_operations') {
          return [];
        }
        throw new Error(`Unexpected planning table: ${tableName}`);
      };
      const coordinator = new MembershipPublicationCoordinator({
        resolveIsControlPlanePublicationsWriteLeader: () => true,
        nodeId: 'node-1',
        controlPlanePublicationsOwner: publicationsOwnerOverRows({
          async listPublicationsFromCache() {
            cacheReadCount += 1;
            return {rows: []};
          },
          async listPublications() {
            authoritativeReadCount += 1;
            return {success: true, rows: [latestPublicationRow]};
          },
          // The durable read the owner's guarded write is computed from.
          async getPublication(publicationId) {
            return latestPublicationRow.publication_id === publicationId ?
              latestPublicationRow : null;
          },
          async storeRow() {
            upsertCallCount += 1;
          },
        }),
        authoritativeControlPlaneView: authoritativePlanningViewOverRows(readPlanningRows),
        systemTableCache: {getAll: readPlanningRows},
        now: () => 1500,
      });

      const result = await coordinator.reconcileClusterMembership();

      t.equal(
        cacheReadCount,
        0,
        'planning should never consult the cache-backed publication owner',
      );
      t.equal(
        authoritativeReadCount,
        1,
        'the canonical planning read should obtain the durable publication once',
      );
      t.equal(
        upsertCallCount,
        AUTHORITATIVE_OWNER_METADATA_REFRESH_COUNT,
        AUTHORITATIVE_OWNER_METADATA_REFRESH_ASSERTION,
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
        'the authoritative published publication should be reused when the cache is empty',
      );
    });

  test('reconcileClusterMembership uses the named owner-local publication planning profile',
    async (t) => {
      let authoritativeReadOptions = null;
      const planningTablesRead = new Set();
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
      const readPlanningRows = (tableName) => {
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
        if (tableName === 'control_plane_publications' ||
            tableName === 'partitions' || tableName === 'replica_operations') {
          return [];
        }
        throw new Error(`Unexpected planning table: ${tableName}`);
      };
      const coordinator = new MembershipPublicationCoordinator({
        resolveIsControlPlanePublicationsWriteLeader: () => true,
        nodeId: 'node-1',
        controlPlanePublicationsOwner: publicationsOwnerOverRows({
          async listPublications(options = {}) {
            authoritativeReadOptions = options;
            return {success: true, rows: [latestPublicationRow]};
          },
          async getPublication(publicationId) {
            return latestPublicationRow.publication_id === publicationId ?
              latestPublicationRow : null;
          },
          async storeRow() {},
        }),
        authoritativeControlPlaneView: authoritativePlanningViewOverRows((tableName) => {
          planningTablesRead.add(tableName);
          return readPlanningRows(tableName);
        }),
        systemTableCache: {getAll: readPlanningRows},
        now: () => 1500,
      });

      await coordinator.reconcileClusterMembership({
        readSource:
          MEMBERSHIP_PUBLICATION_READ_SOURCE.AUTHORITATIVE_PREFERRED,
      });

      t.match(authoritativeReadOptions, {
        readProfile: MEMBERSHIP_PUBLICATION_READ_PROFILE.PLANNING,
        readSource:
          MEMBERSHIP_PUBLICATION_READ_SOURCE.AUTHORITATIVE_PREFERRED,
        authoritativeReadMode:
        CONTROL_PLANE_AUTHORITATIVE_READ_MODE.OWNER_LOCAL_ONLY,
      }, 'publication planning should use its explicit owner-local authority contract');
      t.same([...planningTablesRead].sort(), [
        'node_endpoints',
        'nodes',
        'partitions',
        'replica_operations',
        'services',
      ], 'the successful planning read should obtain every census table from the declared owner view');
    });

  test('acknowledgePublication never writes from a projected row: without a durable row it is refused',
    async (t) => {
      const store = createPublicationStore();
      const coordinator = new MembershipPublicationCoordinator({
        resolveIsControlPlanePublicationsWriteLeader: () => true,
        nodeId: 'node-2',
        controlPlanePublicationsOwner: store.owner,
      });

      const outcome = await coordinator.acknowledgePublication(
        'publication-13',
        'node-2',
        {
          // The projection's row: it names the publication, it is never the
          // base of the write.
          publicationRow: {
            publicationId: 'publication-13',
            publicationKind: 'cluster_membership',
            publicationEpoch: 13,
            status: 'ACK_PENDING',
            publishedActiveNodeIds: ['node-1', 'node-2'],
            requiredAckNodeIds: ['node-1', 'node-2'],
            acknowledgedNodeIds: ['node-1'],
          },
        },
      );

      t.equal(outcome.outcome, PUBLICATION_WRITE_OUTCOME.REFUSED);
      t.equal(outcome.reason, PUBLICATION_WRITE_REFUSAL.PUBLICATION_ABSENT);
      t.equal(store.writes.length, 0,
        'owner fields are not rebuilt from a projected row for a write');
    });

  test('acknowledgePublication changes the durable row, read with the strict owner read, and sets only what the acknowledgement moved',
    async (t) => {
      const store = createPublicationStore({rows: [{
        publication_id: 'publication-14',
        publication_kind: 'cluster_membership',
        publication_epoch: 14,
        publisher_node_id: 'node-1',
        status: 'ACK_PENDING',
        published_active_node_ids: ['node-1', 'node-2'],
        required_ack_node_ids: ['node-1', 'node-2'],
        acknowledged_node_ids: ['node-1'],
        created_at: 1100,
        updated_at: 1200,
        transition_history: [],
      }]});
      const coordinator = new MembershipPublicationCoordinator({
        nodeId: 'node-2',
        now: () => 1300,
        controlPlanePublicationsOwner: store.owner,
      });

      const outcome = await coordinator.acknowledgePublication(
        'publication-14',
        'node-2',
        {
          // A stale projection (no acknowledgement yet) changes nothing.
          publicationRow: {
            publicationId: 'publication-14',
            status: 'OPEN',
            acknowledgedNodeIds: [],
          },
        },
      );

      t.equal(outcome.outcome, PUBLICATION_WRITE_OUTCOME.COMMITTED);
      t.match(store.reads[0].options, {
        authoritativeReadMode:
          CONTROL_PLANE_AUTHORITATIVE_READ_MODE.OWNER_RPC_REQUIRED,
      }, 'the base of the write is the durable owner\'s strict read');
      t.same(store.writes[0].whereClause,
        {publication_id: 'publication-14', publication_revision: 1});
      t.same(Object.keys(store.writes[0].data).sort(), [
        'acknowledged_node_ids',
        'closed_at',
        'membership_lifecycle_summary',
        'publication_revision',
        'published_at',
        'status',
        'transition_history',
        'updated_at',
      ], 'only the columns the acknowledgement moved are set');
      t.match(
        store.row('publication-14'),
        {
          publication_id: 'publication-14',
          publication_kind: 'cluster_membership',
          publication_epoch: 14,
          status: 'PUBLISHED',
          published_active_node_ids: ['node-1', 'node-2'],
          required_ack_node_ids: ['node-1', 'node-2'],
          acknowledged_node_ids: ['node-1', 'node-2'],
          publication_revision: 2,
          updated_at: 1300,
        },
        'the durable row holds both acknowledgements and is closed',
      );
      t.same(outcome.row.acknowledged_node_ids, ['node-1', 'node-2'],
        'the caller is answered the durable row');
    });

  test('acknowledgePublication does not write an acknowledgement that is already durable',
    async (t) => {
      const store = createPublicationStore({rows: [{
        publication_id: 'publication-16',
        publication_kind: 'cluster_membership',
        publication_epoch: 16,
        publisher_node_id: 'node-1',
        status: 'ACK_PENDING',
        published_active_node_ids: ['node-1', 'node-2', 'node-3'],
        required_ack_node_ids: ['node-1', 'node-2', 'node-3'],
        acknowledged_node_ids: ['node-2'],
        created_at: 1600,
        updated_at: 1600,
        transition_history: [],
      }]});
      const coordinator = new MembershipPublicationCoordinator({
        nodeId: 'node-2',
        controlPlanePublicationsOwner: store.owner,
      });

      const outcome = await coordinator.acknowledgePublication(
        'publication-16', 'node-2');

      t.equal(outcome.outcome, PUBLICATION_WRITE_OUTCOME.UNCHANGED);
      t.equal(store.writes.length, 0,
        'a durable acknowledgement is not written again');
      t.same(outcome.row.acknowledged_node_ids, ['node-2']);
    });

  test('acknowledgePublication keeps a concurrent writer\'s acknowledgement: its stale write affects no row and is re-applied',
    async (t) => {
      const store = createPublicationStore({rows: [{
        publication_id: 'publication-17',
        publication_kind: 'cluster_membership',
        publication_epoch: 17,
        publisher_node_id: 'node-1',
        status: 'ACK_PENDING',
        published_active_node_ids: ['node-1', 'node-2', 'node-3'],
        required_ack_node_ids: ['node-1', 'node-2', 'node-3'],
        acknowledged_node_ids: ['node-1'],
        created_at: 1700,
        updated_at: 1700,
        transition_history: [],
      }]});
      // Another writer records node-3 between this call's read and write.
      store.control.beforeWrite = () => {
        store.control.beforeWrite = null;
        store.changeDurably('publication-17', {
          acknowledged_node_ids: ['node-1', 'node-3'],
          updated_at: 1701,
        });
      };
      const coordinator = new MembershipPublicationCoordinator({
        nodeId: 'node-2',
        now: () => 1702,
        controlPlanePublicationsOwner: store.owner,
      });

      const outcome = await coordinator.acknowledgePublication(
        'publication-17', 'node-2');

      t.equal(outcome.outcome, PUBLICATION_WRITE_OUTCOME.COMMITTED);
      t.equal(store.writes.length, 2);
      t.equal(store.writes[0].affectedRows, 0,
        'the write computed from the stale row affected no row');
      t.match(
        store.row('publication-17'),
        {
          publication_id: 'publication-17',
          status: 'PUBLISHED',
          acknowledged_node_ids: ['node-1', 'node-2', 'node-3'],
          publication_revision: 3,
        },
        'the durable row keeps every acknowledgement',
      );
      t.match(
        outcome.row,
        {
          publication_id: 'publication-17',
          status: 'PUBLISHED',
          acknowledged_node_ids: ['node-1', 'node-2', 'node-3'],
        },
        'the caller receives the durable row',
      );
    });

  test('deriveClusterMembershipCandidate prefers authoritative reads when membership publication is still in flight',
    async (t) => {
      const expectedAuthoritativeReadTableNames = [
        TABLES.NODES,
        TABLES.NODE_ENDPOINTS,
        TABLES.SERVICES,
        TABLES.PARTITIONS,
        TABLES.REPLICA_OPERATIONS,
      ];
      const tableReadRequests = [];
      const readinessOptions = [];
      const coordinator = new MembershipPublicationCoordinator({
        nodeId: 'node-1',
        controlPlaneReadinessService: {
          async getAllNodeReadiness(options = {}) {
            readinessOptions.push(options);
            return [];
          },
          messageRouter: {
            getConnectedNodes() {
              return [];
            },
          },
        },
      });
      coordinator.readTableRows = async (tableName, options = {}) => {
        tableReadRequests.push({tableName, options});
        return [];
      };

      await coordinator.deriveClusterMembershipCandidate({
        latestPublicationRow: {
          publication_epoch: 12,
          status: 'ACK_PENDING',
          published_active_node_ids: ['node-1', 'node-2'],
          required_ack_node_ids: ['node-1', 'node-2'],
          acknowledged_node_ids: ['node-1'],
        },
        latestPublishedPublicationRow: {
          publication_epoch: 11,
          status: 'PUBLISHED',
          published_active_node_ids: ['node-1'],
          required_ack_node_ids: ['node-1'],
          acknowledged_node_ids: ['node-1'],
        },
      });

      t.same(
        tableReadRequests.map((request) => request.tableName),
        expectedAuthoritativeReadTableNames,
        'deriveClusterMembershipCandidate should read the canonical planning tables once each',
      );
      t.equal(
        tableReadRequests.every((request) =>
          request.options.readSource ===
            MEMBERSHIP_PUBLICATION_READ_SOURCE.AUTHORITATIVE_PREFERRED),
        true,
        'in-flight membership publications should force authoritative table reads',
      );
      t.same(
        readinessOptions,
        [{
          allowAuthoritativeRefresh: true,
          membershipPublicationPlanningSource: 'direct_publication_row',
        }],
        'readiness should refresh from the authoritative owner during in-flight publication convergence',
      );
    });

  test('readPublicationPlanningSnapshot uses owner-rpc service evidence while ' +
    'published priority spread remains pending',
  async (t) => {
    const publicationId = 'publication-priority-service-authoritative';
    const publicationKind = 'cluster_membership';
    const publicationStatus = 'PUBLISHED';
    const priorityPartitionId = 'sql_transactions-p1';
    const serviceId = 'sql_transactions-p1-r4';
    const nodeOneId = 'node-1';
    const nodeTwoId = 'node-2';
    const nodeThreeId = 'node-3';
    const activeConnectionState = 'ready';
    const endpointId = 'node-1-ws';
    const endpointStatus = 'active';
    const endpointAddress = 'ws://node-1:8082';
    const endpointTransport = 'ws';
    const raftRoleFollower = 'follower';
    const staleServiceStatus = 'syncing';
    const staleServiceUpdatedAt = 1000;
    const authoritativeServiceUpdatedAt = 2000;
    const publicationEpoch = 21;
    const readyDistinctNodeCount = 1;
    const requiredDistinctNodeCount = 3;
    const spreadGap = 2;
    const nowMs = 2500;
    const authoritativeReadOptionsByTableName = new Map();
    const latestPublicationRow = {
      publication_id: publicationId,
      publication_kind: publicationKind,
      publication_epoch: publicationEpoch,
      published_active_node_ids: [nodeOneId, nodeTwoId, nodeThreeId],
      required_ack_node_ids: [nodeOneId, nodeTwoId, nodeThreeId],
      acknowledged_node_ids: [nodeOneId, nodeTwoId, nodeThreeId],
      priority_partition_summary: {
        satisfied: false,
        missingPartitionIds: [priorityPartitionId],
        blockedPartitions: [{
          partitionId: priorityPartitionId,
          readyDistinctNodeCount,
          requiredDistinctNodeCount,
          spreadGap,
        }],
      },
      status: publicationStatus,
      updated_at: staleServiceUpdatedAt,
      published_at: staleServiceUpdatedAt,
      closed_at: staleServiceUpdatedAt,
    };
    const authoritativeServiceRow = {
      [COLUMN.SERVICE_ID]: serviceId,
      [COLUMN.SERVICE_TYPE]: SERVICE_TYPE.PARTITION,
      [COLUMN.NODE_ID]: nodeThreeId,
      [COLUMN.PARTITION_ID]: priorityPartitionId,
      [COLUMN.REPLICA_ID]: serviceId,
      [COLUMN.RAFT_ROLE]: raftRoleFollower,
      [COLUMN.STATUS]: SERVICE_STATUS.ACTIVE,
      [COLUMN.UPDATED_AT]: authoritativeServiceUpdatedAt,
    };
    const staleServiceRow = {
      ...authoritativeServiceRow,
      [COLUMN.STATUS]: staleServiceStatus,
      [COLUMN.UPDATED_AT]: staleServiceUpdatedAt,
    };
    const nodeRows = [
      {
        [COLUMN.NODE_ID]: nodeOneId,
        [COLUMN.STATUS]: SERVICE_STATUS.ACTIVE,
        [COLUMN.CONNECTION_STATE]: activeConnectionState,
      },
      {
        [COLUMN.NODE_ID]: nodeTwoId,
        [COLUMN.STATUS]: SERVICE_STATUS.ACTIVE,
        [COLUMN.CONNECTION_STATE]: activeConnectionState,
      },
      {
        [COLUMN.NODE_ID]: nodeThreeId,
        [COLUMN.STATUS]: SERVICE_STATUS.ACTIVE,
        [COLUMN.CONNECTION_STATE]: activeConnectionState,
      },
    ];
    const endpointRows = [{
      [COLUMN.ENDPOINT_ID]: endpointId,
      [COLUMN.NODE_ID]: nodeOneId,
      [COLUMN.STATUS]: endpointStatus,
      [COLUMN.ADDRESS]: endpointAddress,
      [COLUMN.TRANSPORT_TYPE]: endpointTransport,
    }];
    const partitionRows = [{
      [COLUMN.PARTITION_ID]: priorityPartitionId,
    }];
    const authoritativeRowsByTableName = new Map([
      [TABLES.NODES, nodeRows],
      [TABLES.NODE_ENDPOINTS, endpointRows],
      [TABLES.SERVICES, [authoritativeServiceRow]],
      [TABLES.PARTITIONS, partitionRows],
    ]);
    const cacheRowsByTableName = new Map([
      [TABLES.SERVICES, [staleServiceRow]],
    ]);
    const coordinator = new MembershipPublicationCoordinator({
      nodeId: nodeOneId,
      controlPlanePublicationsOwner: {
        async listPublications() {
          return {success: true, rows: [latestPublicationRow]};
        },
      },
      authoritativeControlPlaneView: {
        canRead() {
          return true;
        },
        async readRows(tableName, _sql, _params, options) {
          authoritativeReadOptionsByTableName.set(tableName, options);
          return {
            success: true,
            rows: authoritativeRowsByTableName.get(tableName) || [],
          };
        },
      },
      controlPlaneReadinessService: {
        async getAllNodeReadiness() {
          return [];
        },
        getRecoveryEpochHistoryByNodeId() {
          return {};
        },
        async getPriorityRecoveryPlanningSnapshotBestEffort() {
          return null;
        },
      },
      systemTableCache: {
        getAll(tableName) {
          return cacheRowsByTableName.get(tableName) || [];
        },
      },
      now: () => nowMs,
    });

    const snapshot = await coordinator.readPublicationPlanningSnapshot();
    const nodeReadOptions =
      authoritativeReadOptionsByTableName.get(TABLES.NODES);
    const serviceReadOptions =
      authoritativeReadOptionsByTableName.get(TABLES.SERVICES);

    t.equal(
      nodeReadOptions.readAuthority?.authoritativeReadMode,
      CONTROL_PLANE_AUTHORITATIVE_READ_MODE
        .OWNER_RPC_REQUIRED,
      'published priority spread gaps should require authoritative node evidence',
    );
    t.equal(
      serviceReadOptions.readAuthority?.authoritativeReadMode,
      CONTROL_PLANE_AUTHORITATIVE_READ_MODE.OWNER_RPC_REQUIRED,
      'published priority spread gaps should use owner-rpc service evidence',
    );
    t.equal(
      snapshot.serviceRows[0][COLUMN.STATUS],
      SERVICE_STATUS.ACTIVE,
      'authoritative service visibility should replace stale cache service evidence',
    );
    t.equal(
      snapshot.serviceRows[0][COLUMN.UPDATED_AT],
      authoritativeServiceUpdatedAt,
      'planning should retain the freshest authoritative service row',
    );
  });

  test('readPublicationPlanningSnapshot uses owner-rpc replica operation ' +
    'evidence while published priority spread remains pending',
  async (t) => {
    const publicationId = 'publication-priority-operation-authoritative';
    const publicationKind = 'cluster_membership';
    const publicationStatus = 'PUBLISHED';
    const priorityPartitionId = 'sql_write_operations-p1';
    const priorityTableId = 'sql_write_operations';
    const serviceId = 'sql_write_operations-p1-r1';
    const operationId = 'op-sql-write-recovery';
    const operationTypeField = 'type';
    const operationTypeReplace = 'REPLACE';
    const operationStatusPending = 'pending';
    const nodeOneId = 'node-1';
    const nodeTwoId = 'node-2';
    const nodeThreeId = 'node-3';
    const activeConnectionState = 'ready';
    const endpointId = 'node-1-ws';
    const endpointStatus = 'active';
    const endpointAddress = 'ws://node-1:8082';
    const endpointTransport = 'ws';
    const raftRoleFollower = 'follower';
    const publicationEpoch = 22;
    const readyDistinctNodeCount = 1;
    const requiredDistinctNodeCount = 3;
    const spreadGap = 2;
    const staleUpdatedAt = 1000;
    const authoritativeUpdatedAt = 2000;
    const nowMs = 2500;
    const authoritativeReadOptionsByTableName = new Map();
    const latestPublicationRow = {
      publication_id: publicationId,
      publication_kind: publicationKind,
      publication_epoch: publicationEpoch,
      published_active_node_ids: [nodeOneId, nodeTwoId, nodeThreeId],
      required_ack_node_ids: [nodeOneId, nodeTwoId, nodeThreeId],
      acknowledged_node_ids: [nodeOneId, nodeTwoId, nodeThreeId],
      priority_partition_summary: {
        satisfied: false,
        missingPartitionIds: [priorityPartitionId],
        blockedPartitions: [{
          partitionId: priorityPartitionId,
          readyDistinctNodeCount,
          requiredDistinctNodeCount,
          spreadGap,
        }],
      },
      status: publicationStatus,
      updated_at: staleUpdatedAt,
      published_at: staleUpdatedAt,
      closed_at: staleUpdatedAt,
    };
    const nodeRows = [
      {
        [COLUMN.NODE_ID]: nodeOneId,
        [COLUMN.STATUS]: SERVICE_STATUS.ACTIVE,
        [COLUMN.CONNECTION_STATE]: activeConnectionState,
      },
      {
        [COLUMN.NODE_ID]: nodeTwoId,
        [COLUMN.STATUS]: SERVICE_STATUS.ACTIVE,
        [COLUMN.CONNECTION_STATE]: activeConnectionState,
      },
      {
        [COLUMN.NODE_ID]: nodeThreeId,
        [COLUMN.STATUS]: SERVICE_STATUS.ACTIVE,
        [COLUMN.CONNECTION_STATE]: activeConnectionState,
      },
    ];
    const endpointRows = [{
      [COLUMN.ENDPOINT_ID]: endpointId,
      [COLUMN.NODE_ID]: nodeOneId,
      [COLUMN.STATUS]: endpointStatus,
      [COLUMN.ADDRESS]: endpointAddress,
      [COLUMN.TRANSPORT_TYPE]: endpointTransport,
    }];
    const serviceRows = [{
      [COLUMN.SERVICE_ID]: serviceId,
      [COLUMN.SERVICE_TYPE]: SERVICE_TYPE.PARTITION,
      [COLUMN.NODE_ID]: nodeOneId,
      [COLUMN.PARTITION_ID]: priorityPartitionId,
      [COLUMN.REPLICA_ID]: serviceId,
      [COLUMN.RAFT_ROLE]: raftRoleFollower,
      [COLUMN.STATUS]: SERVICE_STATUS.ACTIVE,
      [COLUMN.UPDATED_AT]: authoritativeUpdatedAt,
    }];
    const partitionRows = [{
      [COLUMN.PARTITION_ID]: priorityPartitionId,
      [COLUMN.TABLE_ID]: priorityTableId,
    }];
    const authoritativeOperationRow = {
      [COLUMN.OPERATION_ID]: operationId,
      [operationTypeField]: operationTypeReplace,
      [COLUMN.PARTITION_ID]: priorityPartitionId,
      [COLUMN.ENTITY_TYPE]: SERVICE_TYPE.PARTITION,
      [COLUMN.ENTITY_ID]: priorityPartitionId,
      [COLUMN.REPLICA_ID]: serviceId,
      [COLUMN.TARGET_NODE_ID]: nodeTwoId,
      [COLUMN.STATUS]: operationStatusPending,
      workflow_step: WORKFLOW_STEP.PENDING,
      [COLUMN.CREATED_AT]: authoritativeUpdatedAt,
      [COLUMN.UPDATED_AT]: authoritativeUpdatedAt,
    };
    const authoritativeRowsByTableName = new Map([
      [TABLES.NODES, nodeRows],
      [TABLES.NODE_ENDPOINTS, endpointRows],
      [TABLES.SERVICES, serviceRows],
      [TABLES.PARTITIONS, partitionRows],
      [TABLES.REPLICA_OPERATIONS, [authoritativeOperationRow]],
    ]);
    const coordinator = new MembershipPublicationCoordinator({
      nodeId: nodeOneId,
      controlPlanePublicationsOwner: {
        async listPublications() {
          return {success: true, rows: [latestPublicationRow]};
        },
      },
      authoritativeControlPlaneView: {
        canRead() {
          return true;
        },
        async readRows(tableName, _sql, _params, options) {
          authoritativeReadOptionsByTableName.set(tableName, options);
          return {
            success: true,
            rows: authoritativeRowsByTableName.get(tableName) || [],
          };
        },
      },
      controlPlaneReadinessService: {
        async getAllNodeReadiness() {
          return [];
        },
        getRecoveryEpochHistoryByNodeId() {
          return {};
        },
        async getPriorityRecoveryPlanningSnapshotBestEffort() {
          return null;
        },
      },
      systemTableCache: {
        getAll() {
          return [];
        },
      },
      now: () => nowMs,
    });

    const snapshot = await coordinator.readPublicationPlanningSnapshot();
    const candidate = await coordinator.deriveClusterMembershipCandidate();
    const operationReadOptions =
      authoritativeReadOptionsByTableName.get(TABLES.REPLICA_OPERATIONS);
    const operationSnapshot =
      candidate.priorityRecoveryDecisionSnapshots?.snapshots?.find(
        (entry) => entry?.partitionId === priorityPartitionId,
      );

    t.equal(
      operationReadOptions.readAuthority?.authoritativeReadMode,
      CONTROL_PLANE_AUTHORITATIVE_READ_MODE.OWNER_RPC_REQUIRED,
      'published priority spread gaps should use owner-rpc replica operation evidence',
    );
    t.equal(
      snapshot.replicaOperationRows[0]?.[COLUMN.OPERATION_ID],
      operationId,
      'planning should retain authoritative replica operation rows when cache is empty',
    );
    t.same(
      operationSnapshot?.coordinator?.operationIds,
      [operationId],
      'priority recovery decisions should include authoritative operation ids',
    );
    t.equal(
      operationSnapshot?.coordinator?.operation?.operationId,
      operationId,
      'priority recovery decisions should expose the authoritative operation context',
    );
  });
}

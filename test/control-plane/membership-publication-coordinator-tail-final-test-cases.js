import {
  COLUMN,
  SERVICE_STATUS,
  SERVICE_TYPE,
  TABLES,
  WORKFLOW_STEP,
} from '../../src/constants/index.js';
import {MEMBERSHIP_PUBLICATION_READ_SOURCE} from
  '../../src/control-plane/membership-publication-row-contract.js';

export function registerMembershipPublicationCoordinatorTailFinalTests({
  test,
  MembershipPublicationCoordinator,
  MEMBERSHIP_LIFECYCLE_STATE,
  CONTROL_PLANE_AUTHORITATIVE_READ_MODE,
  ControlPlanePublicationsOwner,
}) {
  const AUTHORITATIVE_FALLBACK_METADATA_REFRESH_COUNT = 1;
  const AUTHORITATIVE_FALLBACK_METADATA_REFRESH_ASSERTION =
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
      const coordinator = new MembershipPublicationCoordinator({
        nodeId: 'node-1',
        controlPlanePublicationsOwner: {
          async listPublications() {
            return {rows: [durableRow]};
          },
          async getPublication(publicationId, options) {
            t.equal(
              publicationId,
              'publication-12',
              'metadata refresh retries should re-read the same publication row',
            );
            t.match(options, {
              authoritativeReadMode:
              CONTROL_PLANE_AUTHORITATIVE_READ_MODE.OWNER_RPC_PREFERRED,
            }, 'metadata refresh retries should use owner-rpc preferred reads');
            return durableRow;
          },
          async upsertPublication(row) {
            upsertCallCount += 1;
            if (upsertCallCount === 1) {
              const error = new Error('Distributed operation failed due to participant failures');
              error.code = 'DISTRIBUTED_PARTICIPANT_FAILURE';
              throw error;
            }
            durableRow = row;
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
              return [durableRow];
            }
            return [];
          },
        },
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

  test('reconcileClusterMembership falls back to authoritative publication rows when the cache is empty',
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
      const coordinator = new MembershipPublicationCoordinator({
        nodeId: 'node-1',
        controlPlanePublicationsOwner: {
          async listPublicationsFromCache() {
            cacheReadCount += 1;
            return {rows: []};
          },
          async listPublications() {
            authoritativeReadCount += 1;
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
              return [];
            }
            return [];
          },
        },
        now: () => 1500,
      });

      const result = await coordinator.reconcileClusterMembership();

      t.equal(
        cacheReadCount,
        1,
        'the coordinator should consult the cache-backed publication owner first',
      );
      t.equal(
        authoritativeReadCount,
        1,
        'an empty publication cache should fall back to the authoritative owner read',
      );
      t.equal(
        upsertCallCount,
        AUTHORITATIVE_FALLBACK_METADATA_REFRESH_COUNT,
        AUTHORITATIVE_FALLBACK_METADATA_REFRESH_ASSERTION,
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

  test('reconcileClusterMembership avoids owner-rpc publication reads during authoritative repair',
    async (t) => {
      let authoritativeReadOptions = null;
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
      const coordinator = new MembershipPublicationCoordinator({
        nodeId: 'node-1',
        controlPlanePublicationsOwner: {
          async listPublications(options = {}) {
            authoritativeReadOptions = options;
            return {rows: [latestPublicationRow]};
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
            return [];
          },
        },
        now: () => 1500,
      });

      await coordinator.reconcileClusterMembership({
        readSource:
          MEMBERSHIP_PUBLICATION_READ_SOURCE.AUTHORITATIVE_PREFERRED,
      });

      t.match(authoritativeReadOptions, {
        readSource:
          MEMBERSHIP_PUBLICATION_READ_SOURCE.AUTHORITATIVE_PREFERRED,
        authoritativeReadMode:
        CONTROL_PLANE_AUTHORITATIVE_READ_MODE.OWNER_LOCAL_ONLY,
      }, 'authoritative publication repair should stay on local authoritative publication reads');
    });

  test('acknowledgePublication persists canonical snake_case fields when the latest publication was read from cache',
    async (t) => {
      const persistedRows = [];
      const coordinator = new MembershipPublicationCoordinator({
        nodeId: 'node-1',
        controlPlanePublicationsOwner: {
          async upsertPublication(row) {
            persistedRows.push(row);
          },
        },
      });

      await coordinator.acknowledgePublication(
        'publication-13',
        'node-2',
        {
          publicationRow: {
            publicationId: 'publication-13',
            publicationKind: 'cluster_membership',
            publicationEpoch: 13,
            status: 'ACK_PENDING',
            publishedActiveNodeIds: ['node-1', 'node-2'],
            requiredAckNodeIds: ['node-1', 'node-2'],
            acknowledgedNodeIds: ['node-1'],
            membershipLifecycleSummary: {
              lifecycleState: MEMBERSHIP_LIFECYCLE_STATE.PUBLISH_PENDING,
              epochBoundary: 'publication_pending',
            },
            updatedAt: 1200,
            createdAt: 1100,
          },
          nowMs: 1300,
        },
      );

      t.equal(persistedRows.length, 1);
      t.match(
        persistedRows[0],
        {
          publication_id: 'publication-13',
          publication_kind: 'cluster_membership',
          publication_epoch: 13,
          status: 'PUBLISHED',
          published_active_node_ids: ['node-1', 'node-2'],
          required_ack_node_ids: ['node-1', 'node-2'],
          acknowledged_node_ids: ['node-1', 'node-2'],
        },
        'acknowledgement writes should preserve canonical system-table field names',
      );
    });

  test('acknowledgePublication refreshes the authoritative publication row before persisting acknowledgements',
    async (t) => {
      const persistedRows = [];
      let getPublicationOptions = null;
      let durableRow = {
        publication_id: 'publication-14',
        publication_kind: 'cluster_membership',
        publication_epoch: 14,
        status: 'ACK_PENDING',
        published_active_node_ids: ['node-1', 'node-2', 'node-3'],
        required_ack_node_ids: ['node-1', 'node-2', 'node-3'],
        acknowledged_node_ids: ['node-1', 'node-2'],
      };
      const coordinator = new MembershipPublicationCoordinator({
        nodeId: 'node-3',
        controlPlanePublicationsOwner: {
          async getPublication(publicationId, options = {}) {
            getPublicationOptions = options;
            t.equal(
              publicationId,
              'publication-14',
              'acknowledgements should re-read the latest authoritative publication row',
            );
            return durableRow;
          },
          async upsertPublication(row) {
            persistedRows.push(row);
            durableRow = row;
          },
        },
      });

      await coordinator.acknowledgePublication(
        'publication-14',
        'node-3',
        {
          publicationRow: {
            publicationId: 'publication-14',
            publicationKind: 'cluster_membership',
            publicationEpoch: 14,
            status: 'OPEN',
            publishedActiveNodeIds: ['node-1', 'node-2', 'node-3'],
            requiredAckNodeIds: ['node-1', 'node-2', 'node-3'],
            acknowledgedNodeIds: [],
          },
          nowMs: 1400,
        },
      );

      t.equal(persistedRows.length, 1);
      t.match(
        persistedRows[0],
        {
          publication_id: 'publication-14',
          publication_epoch: 14,
          status: 'PUBLISHED',
          acknowledged_node_ids: ['node-1', 'node-2', 'node-3'],
        },
        'stale cache acknowledgements should merge from the authoritative publication row before persisting',
      );
      t.match(getPublicationOptions, {
        authoritativeReadMode:
        CONTROL_PLANE_AUTHORITATIVE_READ_MODE.OWNER_RPC_PREFERRED,
      }, 'acknowledgement refresh should request owner-rpc preferred publication reads');
    });

  test('acknowledgePublication unwraps owner read envelopes before persisting acknowledgements',
    async (t) => {
      const persistedRows = [];
      let durableRow = {
        publication_id: 'publication-15',
        publication_kind: 'cluster_membership',
        publication_epoch: 15,
        status: 'ACK_PENDING',
        published_active_node_ids: ['node-1', 'node-2', 'node-3'],
        required_ack_node_ids: ['node-1', 'node-2', 'node-3'],
        acknowledged_node_ids: ['node-1', 'node-2'],
      };
      const publicationsOwner = new ControlPlanePublicationsOwner({
        controlPlaneSystemTableGateway: {
          async readAuthoritativeRows(_tableName, _sql, params) {
            t.same(
              params,
              ['publication-15'],
              'owner reads should look up the authoritative publication by id',
            );
            return {
              success: true,
              rows: [durableRow],
            };
          },
          async upsertSystemTableRow(_tableName, row) {
            persistedRows.push(row);
            durableRow = row;
          },
        },
      });
      const coordinator = new MembershipPublicationCoordinator({
        nodeId: 'node-3',
        controlPlanePublicationsOwner: publicationsOwner,
      });

      await coordinator.acknowledgePublication(
        'publication-15',
        'node-3',
        {
          publicationRow: {
            publicationId: 'publication-15',
            publicationKind: 'cluster_membership',
            publicationEpoch: 15,
            status: 'OPEN',
            publishedActiveNodeIds: ['node-1', 'node-2', 'node-3'],
            requiredAckNodeIds: ['node-1', 'node-2', 'node-3'],
            acknowledgedNodeIds: [],
          },
          nowMs: 1500,
        },
      );

      t.equal(persistedRows.length, 1);
      t.match(
        persistedRows[0],
        {
          publication_id: 'publication-15',
          publication_epoch: 15,
          status: 'PUBLISHED',
          acknowledged_node_ids: ['node-1', 'node-2', 'node-3'],
        },
        'gateway read envelopes should be unwrapped to their row before acknowledgement persistence',
      );
    });

  test('acknowledgePublication does not persist duplicate acknowledgements that are already durable',
    async (t) => {
      let upsertCallCount = 0;
      const coordinator = new MembershipPublicationCoordinator({
        nodeId: 'node-1',
        controlPlanePublicationsOwner: {
          async getPublication(publicationId) {
            t.equal(
              publicationId,
              'publication-16',
              'duplicate acknowledgements should still read the latest publication row',
            );
            return {
              publication_id: 'publication-16',
              publication_kind: 'cluster_membership',
              publication_epoch: 16,
              status: 'ACK_PENDING',
              published_active_node_ids: ['node-1', 'node-2'],
              required_ack_node_ids: ['node-1', 'node-2'],
              acknowledged_node_ids: ['node-1'],
            };
          },
          async upsertPublication() {
            upsertCallCount += 1;
          },
        },
      });

      const publicationRow = await coordinator.acknowledgePublication(
        'publication-16',
        'node-1',
        {
          publicationRow: {
            publicationId: 'publication-16',
            publicationKind: 'cluster_membership',
            publicationEpoch: 16,
            status: 'OPEN',
            publishedActiveNodeIds: ['node-1', 'node-2'],
            requiredAckNodeIds: ['node-1', 'node-2'],
            acknowledgedNodeIds: [],
          },
          nowMs: 1600,
        },
      );

      t.equal(
        upsertCallCount,
        0,
        'duplicate acknowledgements should not rewrite the durable publication row',
      );
      t.match(
        publicationRow,
        {
          publication_id: 'publication-16',
          acknowledged_node_ids: ['node-1'],
          status: 'ACK_PENDING',
        },
        'the durable acknowledgement state should be returned without a redundant write',
      );
    });

  test('acknowledgePublication retries when a concurrent durable rewrite drops merged acknowledgements',
    async (t) => {
      let upsertCallCount = 0;
      let durableRow = {
        publication_id: 'publication-17',
        publication_kind: 'cluster_membership',
        publication_epoch: 17,
        status: 'ACK_PENDING',
        published_active_node_ids: ['node-1', 'node-2', 'node-3'],
        required_ack_node_ids: ['node-1', 'node-2', 'node-3'],
        acknowledged_node_ids: ['node-1'],
        updated_at: 1700,
      };
      const coordinator = new MembershipPublicationCoordinator({
        nodeId: 'node-2',
        controlPlanePublicationsOwner: {
          async getPublication(publicationId, options) {
            t.equal(
              publicationId,
              'publication-17',
              'durable merge retries should read the authoritative publication by id',
            );
            t.match(options, {
              authoritativeReadMode:
              CONTROL_PLANE_AUTHORITATIVE_READ_MODE.OWNER_RPC_PREFERRED,
            }, 'durable merge retries should use owner-rpc preferred reads');
            return durableRow;
          },
          async upsertPublication(row) {
            upsertCallCount += 1;
            if (upsertCallCount === 1) {
              durableRow = {
                ...row,
                status: 'ACK_PENDING',
                acknowledged_node_ids: ['node-1', 'node-3'],
                updated_at: 1701,
              };
              return;
            }
            durableRow = row;
          },
        },
      });

      const publicationRow = await coordinator.acknowledgePublication(
        'publication-17',
        'node-2',
        {
          publicationRow: {
            publicationId: 'publication-17',
            publicationKind: 'cluster_membership',
            publicationEpoch: 17,
            status: 'OPEN',
            publishedActiveNodeIds: ['node-1', 'node-2', 'node-3'],
            requiredAckNodeIds: ['node-1', 'node-2', 'node-3'],
            acknowledgedNodeIds: [],
          },
          nowMs: 1702,
        },
      );

      t.equal(
        upsertCallCount,
        2,
        'a dropped durable acknowledgement should trigger one retry with the merged set',
      );
      t.match(
        durableRow,
        {
          publication_id: 'publication-17',
          status: 'PUBLISHED',
          acknowledged_node_ids: ['node-1', 'node-2', 'node-3'],
        },
        'the retried durable publication row should retain the full acknowledgement union',
      );
      t.match(
        publicationRow,
        {
          publication_id: 'publication-17',
          status: 'PUBLISHED',
          acknowledged_node_ids: ['node-1', 'node-2', 'node-3'],
        },
        'the caller should receive the merged durable publication row after retry',
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
          return {rows: [latestPublicationRow]};
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
        async getMembershipPublicationPlanningSnapshotBestEffort() {
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
        .OWNER_RPC_PREFERRED_SQL_FALLBACK,
      'published priority spread gaps should preserve fallback-capable authoritative node evidence',
    );
    t.equal(
      serviceReadOptions.readAuthority?.authoritativeReadMode,
      CONTROL_PLANE_AUTHORITATIVE_READ_MODE.OWNER_RPC_PREFERRED,
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
          return {rows: [latestPublicationRow]};
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
        async getMembershipPublicationPlanningSnapshotBestEffort() {
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
      CONTROL_PLANE_AUTHORITATIVE_READ_MODE.OWNER_RPC_PREFERRED,
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

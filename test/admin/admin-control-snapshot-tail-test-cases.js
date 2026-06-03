import {
  registerAdminControlSnapshotPriorityRecoveryDecisionTests,
} from './admin-control-snapshot-priority-recovery-decision-test-cases.js';

export function registerAdminControlSnapshotTailTests({
  test,
  TABLES,
  AdminControlSnapshot,
  CONTROL_PLANE_READINESS_DIMENSION,
}) {
  test('AdminControlSnapshot default snapshots keep published membership recovery local after a cache miss on a pending publication',
    async (t) => {
      const publishedReadOptions = [];
      const snapshot = new AdminControlSnapshot({
        nodeId: 'node-1',
        nowFn: () => 1000,
        systemTableCache: {
          getAll(tableName) {
            if (tableName === TABLES.NODES) {
              return [{
                node_id: 'node-1',
                status: 'active',
                connection_state: 'ready',
                ready_lease_expires_at: 2000,
              }, {
                node_id: 'node-2',
                status: 'active',
                connection_state: 'ready',
                ready_lease_expires_at: 2000,
              }, {
                node_id: 'node-3',
                status: 'active',
                connection_state: 'ready',
                ready_lease_expires_at: 2000,
              }];
            }
            if (tableName === TABLES.SERVICES) {
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
            if (tableName === TABLES.CONTROL_PLANE_PUBLICATIONS) {
              return [{
                publication_id: 'publication-8',
                publication_kind: 'cluster_membership',
                publication_epoch: 8,
                status: 'OPEN',
                published_active_node_ids: ['node-1', 'node-2', 'node-3'],
                required_ack_node_ids: ['node-1', 'node-2', 'node-3'],
                acknowledged_node_ids: ['node-1'],
              }];
            }
            return [];
          },
        },
        controlPlaneReadinessService: {
          async getAllNodeReadiness() {
            return [{
              nodeId: 'node-1',
              dimensions: {
                [CONTROL_PLANE_READINESS_DIMENSION.CLUSTER_MEMBER_HEALTHY]: true,
              },
              membershipPublication: {
                publicationEpoch: 8,
                status: 'OPEN',
                publishedActiveNodeIds: ['node-1', 'node-2', 'node-3'],
                requiredAckNodeIds: ['node-1', 'node-2', 'node-3'],
                acknowledgedNodeIds: ['node-1'],
              },
            }];
          },
          membershipPublicationService: {
            getLatestClusterPublicationSync() {
              return {
                publication_id: 'publication-8',
                publication_kind: 'cluster_membership',
                publication_epoch: 8,
                status: 'OPEN',
                published_active_node_ids: ['node-1', 'node-2', 'node-3'],
                required_ack_node_ids: ['node-1', 'node-2', 'node-3'],
                acknowledged_node_ids: ['node-1'],
              };
            },
            getLatestPublishedClusterPublicationSync() {
              return null;
            },
            async getLatestPublishedClusterPublication(options = {}) {
              publishedReadOptions.push(options);
              if (options.preferAuthoritativeRead === true) {
                return {
                  publication_id: 'publication-7',
                  publication_kind: 'cluster_membership',
                  publication_epoch: 7,
                  status: 'PUBLISHED',
                  published_active_node_ids: ['node-1', 'node-2'],
                  required_ack_node_ids: ['node-1', 'node-2'],
                  acknowledged_node_ids: ['node-1', 'node-2'],
                };
              }
              return null;
            },
          },
        },
      });

      const result = await snapshot.buildLocalControlSnapshot();

      t.same(
        result.nodes,
        ['node-1', 'node-2', 'node-3'],
        'default snapshots should use the locally observed open membership without authoritative recovery',
      );
      t.same(
        publishedReadOptions,
        [
          {readProfile: 'diagnostics'},
        ],
        'default snapshots should not escalate to an authoritative published-membership read after a cache miss',
      );
      t.match(
        result.controlPlaneDiagnostics.publishedMembershipObservation,
        {
          publicationObservation: {
            state: 'unavailable',
          },
        },
        'default snapshot diagnostics should expose the unavailable durable published membership locally',
      );
      t.same(
        result.controlPlaneDiagnostics.activeNodeViews,
        {
          authoritativeSource: 'published_membership',
          authoritativeNodeIds: ['node-1', 'node-2', 'node-3'],
          projectedServingNodeIds: ['node-1', 'node-2', 'node-3'],
          locallyEligibleNodeIds: ['node-1', 'node-2', 'node-3'],
          suspectedOrTransitioningNodeIds: [],
          membershipFreeze: {
            active: false,
            reasonCode: null,
            retainedPublishedNodeIds: ['node-1', 'node-2', 'node-3'],
            missingProjectedNodeIds: [],
            unconfirmedProjectedNodeIds: [],
          },
          effectiveSource: 'published_membership',
          effectiveNodeIds: ['node-1', 'node-2', 'node-3'],
          projectedNodeIds: ['node-1', 'node-2', 'node-3'],
          publishedNodeIds: ['node-1', 'node-2', 'node-3'],
          publishedMembershipAvailable: true,
        },
        'default snapshots should advertise only local membership availability after recovery stays local',
      );
    });

  test('AdminControlSnapshot authoritative published membership bypasses stale cached published history',
    async (t) => {
      let authoritativePublishedReadCount = 0;
      const snapshot = new AdminControlSnapshot({
        nodeId: 'node-1',
        nowFn: () => 1000,
        controlPlaneReadinessService: {
          membershipPublicationService: {
            getLatestPublishedClusterPublicationSync() {
              return {
                publication_id: 'publication-1',
                publication_kind: 'cluster_membership',
                publication_epoch: 1,
                status: 'PUBLISHED',
                published_active_node_ids: ['node-1'],
                required_ack_node_ids: ['node-1'],
                acknowledged_node_ids: ['node-1'],
              };
            },
            async getLatestPublishedClusterPublication(options = {}) {
              authoritativePublishedReadCount += 1;
              t.same(
                options,
                {
                  preferAuthoritativeRead: true,
                  readProfile: 'diagnostics',
                },
                'authoritative published membership should request an authoritative history read',
              );
              return {
                publication_id: 'publication-2',
                publication_kind: 'cluster_membership',
                publication_epoch: 2,
                status: 'PUBLISHED',
                published_active_node_ids: ['node-1', 'node-2'],
                required_ack_node_ids: ['node-1', 'node-2'],
                acknowledged_node_ids: ['node-1', 'node-2'],
              };
            },
          },
        },
      });

      const result = await snapshot.ensurePublishedMembershipObservation(
        null,
        {preferAuthoritativeRead: true},
      );

      t.equal(
        authoritativePublishedReadCount,
        1,
        'authoritative published membership recovery should bypass the synchronous cache shortcut',
      );
      t.match(
        result,
        {
          publication_id: 'publication-2',
          publication_epoch: 2,
          status: 'PUBLISHED',
          published_active_node_ids: ['node-1', 'node-2'],
        },
        'authoritative published membership recovery should return the fresher published epoch',
      );
    });

  test('AdminControlSnapshot forced authoritative repair uses authoritative published membership without reconciling from observation',
    async (t) => {
      let authoritativePublishedReadCount = 0;
      let authoritativeQueueEnqueueCount = 0;
      const snapshot = new AdminControlSnapshot({
        nodeId: 'node-1',
        nowFn: () => 1000,
        systemTableCache: {
          getAll(tableName) {
            if (tableName === TABLES.NODES) {
              return [{
                node_id: 'node-1',
                status: 'active',
                connection_state: 'ready',
                ready_lease_expires_at: 2000,
              }, {
                node_id: 'node-2',
                status: 'active',
                connection_state: 'ready',
                ready_lease_expires_at: 2000,
              }];
            }
            if (tableName === TABLES.SERVICES) {
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
            if (tableName === TABLES.CONTROL_PLANE_PUBLICATIONS) {
              return [{
                publication_id: 'publication-8',
                publication_kind: 'cluster_membership',
                publication_epoch: 8,
                status: 'OPEN',
                published_active_node_ids: ['node-1', 'node-2', 'node-3'],
                required_ack_node_ids: ['node-1', 'node-2', 'node-3'],
                acknowledged_node_ids: ['node-1'],
              }];
            }
            return [];
          },
        },
        controlPlaneReadinessService: {
          async getAllNodeReadiness() {
            return [{
              nodeId: 'node-1',
              dimensions: {
                [CONTROL_PLANE_READINESS_DIMENSION.CLUSTER_MEMBER_HEALTHY]: true,
              },
              membershipPublication: {
                publicationEpoch: 8,
                status: 'OPEN',
                publishedActiveNodeIds: ['node-1', 'node-2', 'node-3'],
                requiredAckNodeIds: ['node-1', 'node-2', 'node-3'],
                acknowledgedNodeIds: ['node-1'],
              },
            }];
          },
          membershipPublicationService: {
            async getLatestClusterPublication(options = {}) {
              t.same(
                options,
                {
                  preferAuthoritativeRead: true,
                  readProfile: 'diagnostics',
                },
                'forced repair should still request an authoritative publication read',
              );
              return {
                publication_id: 'publication-8',
                publication_kind: 'cluster_membership',
                publication_epoch: 8,
                status: 'OPEN',
                published_active_node_ids: ['node-1', 'node-2', 'node-3'],
                required_ack_node_ids: ['node-1', 'node-2', 'node-3'],
                acknowledged_node_ids: ['node-1'],
              };
            },
            async getLatestPublishedClusterPublication(options = {}) {
              authoritativePublishedReadCount += 1;
              t.same(
                options,
                {
                  preferAuthoritativeRead: true,
                  readProfile: 'diagnostics',
                },
                'forced repair should request authoritative published membership history',
              );
              return {
                publication_id: 'publication-7',
                publication_kind: 'cluster_membership',
                publication_epoch: 7,
                status: 'PUBLISHED',
                published_active_node_ids: ['node-1', 'node-2'],
                required_ack_node_ids: ['node-1', 'node-2'],
                acknowledged_node_ids: ['node-1', 'node-2'],
              };
            },
            enqueueClusterMembershipReconcile(_reason, context = {}) {
              authoritativeQueueEnqueueCount += 1;
              t.match(
                context,
                {
                  latestPublicationRow: {
                    publication_id: 'publication-8',
                    publication_epoch: 8,
                    status: 'OPEN',
                  },
                  preferAuthoritativeRead: true,
                },
                'forced repair should queue reconciliation using the authoritative latest publication row',
              );
            },
          },
        },
      });

      const result = await snapshot.buildLocalControlSnapshot({
        forceAuthoritativeRepair: true,
      });

      t.same(
        result.nodes,
        ['node-1', 'node-2'],
        'forced repair snapshots should keep the last published membership for control snapshot coverage',
      );
      t.equal(
        authoritativePublishedReadCount,
        1,
        'forced repair should still read published membership history authoritatively',
      );
      t.equal(
        authoritativeQueueEnqueueCount,
        0,
        'forced repair snapshot polling should not enqueue reconciliation from publication observation',
      );
      t.match(
        result.controlPlaneDiagnostics.publishedMembershipObservation,
        {
          publicationEpoch: 7,
          status: 'PUBLISHED',
          publishedActiveNodeIds: ['node-1', 'node-2'],
        },
        'forced repair diagnostics should retain the authoritative published membership observation',
      );
    });

  test('AdminControlSnapshot forced authoritative repair retries after stale publication leader routing failures',
    async (t) => {
      const cacheRowsByTable = {
        [TABLES.NODES]: [{
          node_id: 'node-1',
          status: 'active',
          connection_state: 'ready',
          last_heartbeat: 900,
          ready_lease_expires_at: 2000,
        }, {
          node_id: 'node-2',
          status: 'active',
          connection_state: 'ready',
          last_heartbeat: 900,
          ready_lease_expires_at: 2000,
        }],
        [TABLES.TABLES]: [{
          table_id: 'tbl-bench',
          table_name: 'benchmark_events',
        }],
        [TABLES.PARTITIONS]: [{
          partition_id: 'tbl-bench-p1',
          table_id: 'tbl-bench',
          table_name: 'benchmark_events',
          partition_version: 1,
          leader_node_id: 'node-1',
          state: 'NORMAL',
        }],
        [TABLES.SERVICES]: [{
          service_id: 'tbl-bench-p1-r1',
          service_type: 'partition',
          node_id: 'node-1',
          partition_id: 'tbl-bench-p1',
          replica_id: 'tbl-bench-p1-r1',
          raft_role: 'leader',
          status: 'active',
          address: 'node-1/partition/tbl-bench-p1-r1',
        }],
        [TABLES.NODE_ENDPOINTS]: [],
        [TABLES.CONTROL_PLANE_PUBLICATIONS]: [],
        [TABLES.REPLICA_OPERATIONS]: [],
      };
      let repairApplied = false;
      let repairCallCount = 0;
      let authoritativePublicationReadCount = 0;

      const snapshot = new AdminControlSnapshot({
        nodeId: 'node-1',
        nowFn: () => 1000,
        systemTableCache: {
          getAll(tableName) {
            return cacheRowsByTable[tableName] || [];
          },
        },
        cacheMutationTarget: {
          applySystemTableChange() {},
        },
        ensureAuthoritativeDiscoveryCacheRepair: async () => {
          repairCallCount += 1;
          repairApplied = true;
          cacheRowsByTable[TABLES.PARTITIONS] = [
            ...cacheRowsByTable[TABLES.PARTITIONS],
            {
              partition_id: 'tbl-bench-left',
              table_id: 'tbl-bench',
              table_name: 'benchmark_events',
              partition_version: 1,
              leader_node_id: 'node-1',
              state: 'NORMAL',
            },
            {
              partition_id: 'tbl-bench-right',
              table_id: 'tbl-bench',
              table_name: 'benchmark_events',
              partition_version: 1,
              leader_node_id: 'node-2',
              state: 'NORMAL',
            },
          ];
          cacheRowsByTable[TABLES.SERVICES] = [
            ...cacheRowsByTable[TABLES.SERVICES],
            {
              service_id: 'tbl-bench-left-r1',
              service_type: 'partition',
              node_id: 'node-1',
              partition_id: 'tbl-bench-left',
              replica_id: 'tbl-bench-left-r1',
              raft_role: 'leader',
              status: 'active',
              address: 'node-1/partition/tbl-bench-left-r1',
            },
            {
              service_id: 'tbl-bench-right-r1',
              service_type: 'partition',
              node_id: 'node-2',
              partition_id: 'tbl-bench-right',
              replica_id: 'tbl-bench-right-r1',
              raft_role: 'leader',
              status: 'active',
              address: 'node-2/partition/tbl-bench-right-r1',
            },
          ];
          return {
            applied: true,
            tableNames: [TABLES.PARTITIONS, TABLES.SERVICES],
          };
        },
        controlPlaneReadinessService: {
          async getAllNodeReadiness() {
            return [];
          },
          membershipPublicationService: {
            async getLatestClusterPublication(options = {}) {
              authoritativePublicationReadCount += 1;
              t.same(
                options,
                {
                  preferAuthoritativeRead: true,
                  readProfile: 'diagnostics',
                },
                'forced repair should retry authoritative membership publication reads',
              );
              if (!repairApplied) {
                throw new Error('No handler registered for partition service');
              }
              return {
                publication_id: 'publication-2',
                publication_kind: 'cluster_membership',
                publication_epoch: 2,
                status: 'PUBLISHED',
                published_active_node_ids: ['node-1', 'node-2'],
                required_ack_node_ids: ['node-1', 'node-2'],
                acknowledged_node_ids: ['node-1', 'node-2'],
              };
            },
          },
        },
      });

      const result = await snapshot.resolveLocalControlSnapshot({
        forceAuthoritativeRepair: true,
      });

      t.equal(
        repairCallCount,
        1,
        'forced repair should run authoritative discovery repair after a stale publication read failure',
      );
      t.equal(
        authoritativePublicationReadCount,
        2,
        'forced repair should retry the authoritative publication read after repair',
      );
      t.same(
        result.partitions.sort(),
        ['tbl-bench-left', 'tbl-bench-p1', 'tbl-bench-right'],
        'repaired control snapshots should publish the split child partitions',
      );
      t.match(
        result.authoritativeRepair,
        {
          applied: true,
          forced: true,
        },
        'recovered snapshots should report that authoritative repair was applied',
      );
      t.match(
        result.controlPlaneDiagnostics.publishedMembershipObservation,
        {
          publicationEpoch: 2,
          status: 'PUBLISHED',
          publishedActiveNodeIds: ['node-1', 'node-2'],
        },
        'recovered snapshots should still surface the authoritative published membership observation',
      );
    });

  test('AdminControlSnapshot forced authoritative repair refreshes split topology even when stale table versions mask a local gap',
    async (t) => {
      const cacheRowsByTable = {
        [TABLES.NODES]: [{
          node_id: 'node-1',
          status: 'active',
          connection_state: 'ready',
          last_heartbeat: 900,
          ready_lease_expires_at: 2000,
        }, {
          node_id: 'node-2',
          status: 'active',
          connection_state: 'ready',
          last_heartbeat: 900,
          ready_lease_expires_at: 2000,
        }],
        [TABLES.TABLES]: [{
          table_id: 'tbl-bench',
          table_name: 'benchmark_events',
          active_partition_version: 1,
          partition_count: 1,
        }],
        [TABLES.PARTITIONS]: [{
          partition_id: 'tbl-bench-p1',
          table_id: 'tbl-bench',
          table_name: 'benchmark_events',
          partition_version: 1,
          leader_node_id: 'node-1',
          state: 'NORMAL',
        }],
        [TABLES.SERVICES]: [{
          service_id: 'tbl-bench-p1-r1',
          service_type: 'partition',
          node_id: 'node-1',
          partition_id: 'tbl-bench-p1',
          replica_id: 'tbl-bench-p1-r1',
          raft_role: 'leader',
          status: 'active',
          address: 'node-1/partition/tbl-bench-p1-r1',
        }],
        [TABLES.NODE_ENDPOINTS]: [{
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
        [TABLES.CONTROL_PLANE_PUBLICATIONS]: [],
        [TABLES.REPLICA_OPERATIONS]: [],
      };
      let repairCallCount = 0;

      const snapshot = new AdminControlSnapshot({
        nodeId: 'node-1',
        nowFn: () => 1000,
        systemTableCache: {
          getAll(tableName) {
            return cacheRowsByTable[tableName] || [];
          },
        },
        cacheMutationTarget: {
          applySystemTableChange() {},
        },
        ensureAuthoritativeDiscoveryCacheRepair: async () => {
          repairCallCount += 1;
          cacheRowsByTable[TABLES.TABLES] = [{
            table_id: 'tbl-bench',
            table_name: 'benchmark_events',
            active_partition_version: 2,
            partition_count: 2,
          }];
          cacheRowsByTable[TABLES.PARTITIONS] = [
            ...cacheRowsByTable[TABLES.PARTITIONS],
            {
              partition_id: 'tbl-bench-left',
              table_id: 'tbl-bench',
              table_name: 'benchmark_events',
              partition_version: 2,
              leader_node_id: 'node-1',
              state: 'NORMAL',
            },
            {
              partition_id: 'tbl-bench-right',
              table_id: 'tbl-bench',
              table_name: 'benchmark_events',
              partition_version: 2,
              leader_node_id: 'node-2',
              state: 'NORMAL',
            },
          ];
          cacheRowsByTable[TABLES.SERVICES] = [
            ...cacheRowsByTable[TABLES.SERVICES],
            {
              service_id: 'tbl-bench-left-r1',
              service_type: 'partition',
              node_id: 'node-1',
              partition_id: 'tbl-bench-left',
              replica_id: 'tbl-bench-left-r1',
              raft_role: 'leader',
              status: 'active',
              address: 'node-1/partition/tbl-bench-left-r1',
            },
            {
              service_id: 'tbl-bench-right-r1',
              service_type: 'partition',
              node_id: 'node-2',
              partition_id: 'tbl-bench-right',
              replica_id: 'tbl-bench-right-r1',
              raft_role: 'leader',
              status: 'active',
              address: 'node-2/partition/tbl-bench-right-r1',
            },
          ];
          return {
            applied: true,
            tableNames: [TABLES.TABLES, TABLES.PARTITIONS, TABLES.SERVICES],
          };
        },
        controlPlaneReadinessService: {
          async getAllNodeReadiness() {
            return [];
          },
        },
      });

      const result = await snapshot.resolveLocalControlSnapshot({
        forceAuthoritativeRepair: true,
      });

      t.equal(
        repairCallCount,
        1,
        'forced repair should still run when stale table versions hide the split from local topology heuristics',
      );
      t.same(
        result.partitions.sort(),
        ['tbl-bench-left', 'tbl-bench-right'],
        'forced repair should rebuild the active split topology from authoritative table and partition rows',
      );
      t.match(
        result.authoritativeRepair,
        {
          applied: true,
          forced: true,
        },
        'forced repair snapshots should report the authoritative refresh',
      );
    });

  registerAdminControlSnapshotPriorityRecoveryDecisionTests({
    test,
    AdminControlSnapshot,
    CONTROL_PLANE_READINESS_DIMENSION,
  });

  test('AdminControlSnapshot degrades non-forced repair failures under control-plane backpressure when local query transport is ready',
    async (t) => {
      let repairCallCount = 0;
      const localSnapshot = {
        nodes: ['node-1'],
        controlPlaneDiagnostics: {
          publicationConvergence: null,
        },
      };
      const snapshot = new AdminControlSnapshot({
        nodeId: 'node-1',
      });
      snapshot.buildLocalControlSnapshot = async () => localSnapshot;
      snapshot.canRunAuthoritativeControlSnapshotRepair = () => true;
      snapshot.evaluateAuthoritativeControlSnapshotRepair = () => ({
        shouldRepair: true,
        triggerCodes: ['replica_operations_stale'],
        nodeCoverage: {
          activeProjection: {
            hasCoverageGap: false,
          },
        },
      });
      snapshot.ensureAuthoritativeDiscoveryCacheRepair = async () => {
        repairCallCount += 1;
        return {
          applied: false,
          failedTables: [TABLES.SERVICES],
          causeChain: ['control_plane_backpressure'],
          localQueryTransport: {
            state: 'ready',
            ready: true,
          },
          errors: ['control_plane_pressure_degraded'],
        };
      };

      const result = await snapshot.resolveLocalControlSnapshot({
        allowAuthoritativeRepair: true,
      });

      t.equal(
        repairCallCount,
        1,
        'non-forced snapshots should still attempt one authoritative repair before degrading',
      );
      t.match(
        result,
        {
          nodes: localSnapshot.nodes,
          controlPlaneDiagnostics: localSnapshot.controlPlaneDiagnostics,
          observationMode: 'repair_deferred',
          adminObservation: {
            mode: 'repair_deferred',
            sharedOwnerResolved: false,
            repair: {
              applied: false,
              forced: false,
              deferred: true,
              failed: false,
              triggerCodes: ['replica_operations_stale'],
            },
          },
        },
        'backpressure-shaped repair failures should degrade to the local snapshot with explicit observation metadata',
      );
    });

  test('AdminControlSnapshot routes shared snapshot resolution through the injected control-plane snapshot owner with observation metadata',
    async (t) => {
      const ownerResult = {
        nodes: ['node-1'],
        snapshotObservation: {
          state: 'fresh',
        },
      };
      const ownerCalls = [];
      const localSnapshot = {
        nodes: ['node-1'],
      };
      const snapshot = new AdminControlSnapshot({
        nodeId: 'node-1',
        controlPlaneSnapshotOwner: {
          async resolveControlSnapshot(receivedSnapshot, options) {
            ownerCalls.push({
              receivedSnapshot,
              options,
            });
            return ownerResult;
          },
        },
      });
      snapshot.buildLocalControlSnapshot = async () => localSnapshot;

      const result = await snapshot.resolveLocalControlSnapshot({
        allowAuthoritativeRepair: true,
      });

      t.equal(
        ownerCalls.length,
        1,
        'control snapshot should delegate shared snapshot resolution exactly once',
      );
      t.equal(
        ownerCalls[0].receivedSnapshot,
        localSnapshot,
        'control snapshot should pass the local snapshot to the shared owner',
      );
      t.same(
        ownerCalls[0].options,
        {
          allowAuthoritativeRepair: true,
        },
        'control snapshot should preserve resolution options when delegating',
      );
      t.match(
        result,
        {
          nodes: ownerResult.nodes,
          snapshotObservation: ownerResult.snapshotObservation,
          observationMode: 'fresh_owner',
          adminObservation: {
            mode: 'fresh_owner',
            sharedOwnerResolved: true,
            repair: {
              applied: false,
              forced: false,
              deferred: false,
              failed: false,
              triggerCodes: [],
            },
          },
        },
        'control snapshot should return the shared owner result with explicit observation metadata',
      );
    });
}

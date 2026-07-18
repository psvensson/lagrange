/**
 * Tests for Admin WebSocket API.
 * Requirements: 32.1-32.39
 */

import {test} from '../../src/test-helpers/tap.js';
import {
  createMockQueryEngine,
  createPopulatedCache,
} from './admin-websocket-api-test-support.js';
import {AdminWebSocketAPI} from
  '../../src/admin/admin-websocket-api.js';
import {
  ADMIN_ERROR_MESSAGE,
  ADMIN_OPERATIONAL_DIAGNOSTICS,
  ADMIN_ROUTE,
  CONSISTENCY_MISMATCH_KIND,
} from '../../src/admin/admin-constants.js';
import {SystemTableCache} from '../../src/cache/system-table-cache.js';
import {ConfigurationManager} from '../../src/config/configuration-manager.js';
import {LoggingService} from '../../src/logging/logging-service.js';
import {LogsTableService} from '../../src/logging/logs-table-service.js';
import {COLUMN, TABLES, SERVICE_TYPE} from '../../src/constants/index.js';
import {
  CONTROL_PLANE_READINESS_DIMENSION,
} from '../../src/control-plane/control-plane-readiness-constants.js';
import {
} from '../../src/control-plane/control-plane-snapshot-owner.js';

// Initialize services for tests
ConfigurationManager.getInstance().initialize();
LoggingService.getInstance().initialize({level: 'error'});

test('AdminWebSocketAPI - local CDC diagnostics endpoint shape and readiness',
  async (t) => {
    const cache = createPopulatedCache();
    cache.applySystemTableChange(TABLES.PARTITIONS, 'INSERT', {
      id: 'partition-2',
      partition_id: 'partition-2',
      table_id: 'table-1',
      state: 'NORMAL',
    });
    const partitionServices = new Map([
      ['partition-1', {
        partitionId: 'partition-1',
        getCDCSubscriptionDiagnostics: () => ({
          subscriberCount: 1,
          bufferedEvents: 0,
          bufferReplayInFlight: false,
        }),
      }],
      ['partition-2', {
        partitionId: 'partition-2',
        getCDCSubscriptionDiagnostics: () => ({
          subscriberCount: 0,
          bufferedEvents: 3,
          bufferReplayInFlight: true,
        }),
      }],
    ]);
    const api = new AdminWebSocketAPI({
      nodeId: 'test-node',
      systemTableCache: cache,
      partitionServices,
      cdcIntegrationService: {
        getAuthoritativeFallbackDiagnostics: () => ({
          schemaVersion: 1,
          nodeId: 'test-node',
          windowMs: 60000,
          totalCount: 7,
          windowCount: 2,
          windowRatePerMinute: 2,
          phases: {
            bootstrap: {windowCount: 0, totalCount: 0},
            recovery: {windowCount: 0, totalCount: 0},
            steady_state: {windowCount: 2, totalCount: 7},
          },
          outcomes: {
            recovered: {windowCount: 2, totalCount: 7},
            failed: {windowCount: 0, totalCount: 0},
          },
          byTable: {},
          recentEvents: [],
        }),
      },
    });

    await api.initialize(0, {listen: false});
    const response = await api.getFastify().inject({
      method: 'GET',
      url: ADMIN_ROUTE.CDC_DIAGNOSTICS,
    });
    const payload = response.json();

    t.equal(response.statusCode, 200, 'should return 200');
    t.equal(
      payload.schemaVersion,
      ADMIN_OPERATIONAL_DIAGNOSTICS.CDC_SCHEMA_VERSION,
      'should expose CDC diagnostics schema version',
    );
    t.equal(payload.localPartitionCount, 2, 'should include local partition count');
    t.equal(payload.diagnosticsAvailablePartitionCount, 2,
      'should count available diagnostics');
    t.equal(payload.readyLocalPartitionCount, 1,
      'should count local partitions that are CDC-ready');
    t.same(payload.noSubscriberPartitionIds, ['partition-2'],
      'should flag partitions without subscribers');
    t.same(payload.bufferedPartitionIds, ['partition-2'],
      'should flag partitions with buffered CDC backlog');
    t.equal(payload.telemetry.subscriberCount, 1,
      'telemetry should aggregate local subscriber counts');
    t.equal(payload.telemetry.bufferedEvents, 3,
      'telemetry should aggregate buffered event backlog');
    t.equal(payload.telemetry.authoritativeFallback.totalCount, 7,
      'telemetry should include authoritative fallback diagnostics');

    await api.shutdown();
  });

test('AdminWebSocketAPI - local partition diagnostics endpoint exposes leader and replica state',
  async (t) => {
    const cache = new SystemTableCache();
    cache.applySystemTableChange(TABLES.PARTITIONS, 'INSERT', {
      partition_id: 'partition-1',
      table_id: 'table-1',
      table_name: 'events',
      state: 'NORMAL',
      leader_node_id: 'node-1',
    });
    cache.applySystemTableChange(TABLES.SERVICES, 'INSERT', {
      service_id: 'partition-1-r1',
      service_type: 'partition',
      partition_id: 'partition-1',
      replica_id: 'partition-1-r1',
      node_id: 'node-1',
      raft_role: 'leader',
      status: 'active',
      address: 'node-1/partition/partition-1-r1',
    });
    cache.applySystemTableChange(TABLES.SERVICES, 'INSERT', {
      service_id: 'partition-1-r2',
      service_type: 'partition',
      partition_id: 'partition-1',
      replica_id: 'partition-1-r2',
      node_id: 'node-2',
      raft_role: 'follower',
      status: 'active',
      address: 'node-2/partition/partition-1-r2',
    });
    cache.applySystemTableChange(TABLES.REPLICA_OPERATIONS, 'INSERT', {
      operation_id: 'op-1',
      partition_id: 'partition-1',
      status: 'creating',
    });
    const api = new AdminWebSocketAPI({
      nodeId: 'test-node',
      systemTableCache: cache,
    });

    await api.initialize(0, {listen: false});
    const response = await api.getFastify().inject({
      method: 'GET',
      url: ADMIN_ROUTE.PARTITION_DIAGNOSTICS,
    });
    const payload = response.json();

    t.equal(response.statusCode, 200, 'should return 200');
    t.equal(
      payload.schemaVersion,
      ADMIN_OPERATIONAL_DIAGNOSTICS.PARTITION_SCHEMA_VERSION,
      'should expose partition diagnostics schema version',
    );
    t.equal(payload.partitionCount, 1, 'should include partition count');
    t.equal(payload.leaders['partition-1'], 'node-1',
      'should include canonical partition leader');
    t.equal(payload.replicaOperations.inFlightCount, 1,
      'should include in-flight replica operation count');
    t.equal(payload.partitionsById['partition-1'].voterCount, 2,
      'should include per-partition voter count');
    t.equal(payload.partitionsById['partition-1'].replicaCount, 2,
      'should include per-partition replica count');
    t.equal(payload.partitionsById['partition-1'].activeReplicaCount, 2,
      'should include per-partition active replica count');
    t.equal(
      payload.partitionsById['partition-1'].replicaRoleDiagnostics
        .inconsistentReplicaRoles,
      false,
      'should expose replica-role consistency status',
    );

    await api.shutdown();
  });

test('AdminWebSocketAPI - local SQL diagnostics endpoint exposes coordinator metrics',
  async (t) => {
    const cache = createPopulatedCache();
    const api = new AdminWebSocketAPI({
      nodeId: 'test-node',
      systemTableCache: cache,
      sqlQueryEngine: {
        executeRequest: async () => ({success: true, rows: []}),
        queryTimeoutMs: 1234,
        queryExecutor: {
          getLastCoordinatorMetrics: () => ({
            totalLatencyMs: 42,
            medianLatencyMs: 21,
            stragglers: [],
          }),
        },
        resolveProvisionTargetNodeIdsWithDiagnostics: () => ({
          nodeIds: ['node-1'],
          diagnostics: {
            selectedNodeIds: ['node-1'],
            resolvedNodeIds: ['node-1'],
            usedDegradedFallback: false,
          },
        }),
        lastTransactionRecoveryReplayResult: {
          totalRecovered: 2,
          resumed: 2,
          failed: 0,
          results: [],
        },
        lastWriteSplitEvaluationByTable: new Map([
          ['table-1', {evaluated: true}],
        ]),
        partitionSplitMergeManager: {
          getEvaluationDiagnostics: () => ({
            state: 'IDLE',
          }),
        },
      },
    });

    await api.initialize(0, {listen: false});
    const response = await api.getFastify().inject({
      method: 'GET',
      url: ADMIN_ROUTE.SQL_DIAGNOSTICS,
    });
    const payload = response.json();

    t.equal(response.statusCode, 200, 'should return 200');
    t.equal(
      payload.schemaVersion,
      ADMIN_OPERATIONAL_DIAGNOSTICS.SQL_SCHEMA_VERSION,
      'should expose SQL diagnostics schema version',
    );
    t.equal(payload.queryEngineAvailable, true,
      'should report SQL query engine availability');
    t.equal(payload.queryEngine.timeoutMs, 1234,
      'should expose SQL query timeout budget');
    t.equal(payload.queryEngine.fanoutMetricsAvailable, true,
      'should indicate fanout coordinator metrics availability');
    t.equal(payload.queryEngine.lastCoordinatorMetrics.totalLatencyMs, 42,
      'should expose last coordinator total latency');
    t.same(payload.queryEngine.provisionTargetDiagnostics.selectedNodeIds, ['node-1'],
      'should include provision-target diagnostics');
    t.equal(payload.queryEngine.trackedWriteSplitEvaluations, 1,
      'should expose tracked write split evaluations');
    t.equal(payload.splitEvaluation.state, 'IDLE',
      'should expose split-evaluation diagnostics from SQL owner');

    await api.shutdown();
  });

test('AdminWebSocketAPI - operational diagnostics routes fail closed without cache',
  async (t) => {
    const api = new AdminWebSocketAPI({
      nodeId: 'test-node',
      enableAdminStream: false,
    });

    await api.initialize(0, {listen: false});
    const cdcResponse = await api.getFastify().inject({
      method: 'GET',
      url: ADMIN_ROUTE.CDC_DIAGNOSTICS,
    });
    const partitionResponse = await api.getFastify().inject({
      method: 'GET',
      url: ADMIN_ROUTE.PARTITION_DIAGNOSTICS,
    });
    const sqlResponse = await api.getFastify().inject({
      method: 'GET',
      url: ADMIN_ROUTE.SQL_DIAGNOSTICS,
    });

    t.equal(cdcResponse.statusCode, 503,
      'CDC diagnostics should fail closed without system cache');
    t.equal(cdcResponse.json().error, ADMIN_ERROR_MESSAGE.CDC_DIAGNOSTICS_UNAVAILABLE,
      'CDC diagnostics should return unavailable error message');
    t.equal(partitionResponse.statusCode, 503,
      'partition diagnostics should fail closed without system cache');
    t.equal(
      partitionResponse.json().error,
      ADMIN_ERROR_MESSAGE.PARTITION_DIAGNOSTICS_UNAVAILABLE,
      'partition diagnostics should return unavailable error message',
    );
    t.equal(sqlResponse.statusCode, 503,
      'SQL diagnostics should fail closed without system cache');
    t.equal(sqlResponse.json().error, ADMIN_ERROR_MESSAGE.SQL_DIAGNOSTICS_UNAVAILABLE,
      'SQL diagnostics should return unavailable error message');

    await api.shutdown();
  });

test('AdminWebSocketAPI - local control snapshot endpoint shape and non-mutation',
  async (t) => {
    let executeRequestCalls = 0;
    const cache = createPopulatedCache();
    cache.applySystemTableChange('replica_operations', 'INSERT', {
      operation_id: 'op-1',
      status: 'creating',
    });
    cache.applySystemTableChange('replica_operations', 'INSERT', {
      operation_id: 'op-2',
      status: 'active',
    });
    const beforeCounts = {
      nodes: cache.count(TABLES.NODES),
      partitions: cache.count(TABLES.PARTITIONS),
      services: cache.count(TABLES.SERVICES),
      replicaOperations: cache.count(TABLES.REPLICA_OPERATIONS),
    };
    const api = new AdminWebSocketAPI({
      nodeId: 'test-node',
      systemTableCache: cache,
      sqlQueryEngine: {
        executeRequest: async () => {
          executeRequestCalls++;
          return {success: true, rows: []};
        },
      },
    });

    await api.initialize(0, {listen: false});

    const startedAt = Date.now();
    const response = await api.getFastify().inject({
      method: 'GET',
      url: '/api/admin/control-snapshot?scope=local',
    });
    const elapsedMs = Date.now() - startedAt;
    const payload = response.json();

    t.equal(response.statusCode, 200, 'should return 200 for local snapshot');
    t.equal(elapsedMs < 100, true, 'should respond within local snapshot bound');
    t.equal(payload.schemaVersion, 1, 'should expose schema version');
    t.equal(payload.nodeId, 'test-node', 'should include current node id');
    t.equal(Array.isArray(payload.nodes), true, 'should include nodes array');
    t.equal(Array.isArray(payload.partitions), true, 'should include partitions array');
    t.equal(typeof payload.leaders, 'object', 'should include leaders map');
    t.equal(typeof payload.replicaRoles, 'object', 'should include replica-role detail');
    t.equal(typeof payload.replicaRoleDiagnostics, 'object',
      'should include replica-role diagnostics');
    t.equal(typeof payload.voterCounts, 'object', 'should include voter-count map');
    t.equal(typeof payload.cdcTelemetry, 'object', 'should include cdc telemetry');
    t.equal(typeof payload.cdcTelemetry.authoritativeFallback, 'object',
      'should include authoritative fallback telemetry');
    t.equal(typeof payload.replicaOperations, 'object',
      'should include replica operation summary');
    t.equal(
      typeof payload.controlPlaneDiagnostics
        .currentPriorityPlacementObservation,
      'object',
      'should include the current row-derived priority placement witness',
    );
    t.equal(
      payload.controlPlaneDiagnostics.currentPriorityPlacementObservation
        .capturedAt,
      payload.capturedAt,
      'priority placement and the enclosing control snapshot share one capture',
    );
    t.equal(
      Number.isInteger(payload.replicaOperations.inFlightCount),
      true,
      'should include in-flight operation count',
    );
    t.equal(
      typeof payload.replicaOperations.statusHistogram,
      'object',
      'should include status histogram',
    );
    t.equal(
      typeof payload.replicaOperations.partitionGroupInFlight,
      'object',
      'should include partition-group in-flight summary',
    );
    t.equal(
      payload.replicaOperations.partitionGroupInFlight.unknown,
      1,
      'creating operation without explicit partition id should be grouped',
    );
    t.equal(executeRequestCalls, 0,
      'local snapshot endpoint should not execute SQL query engine requests');

    t.equal(cache.count(TABLES.NODES), beforeCounts.nodes, 'should not mutate nodes table');
    t.equal(cache.count(TABLES.PARTITIONS), beforeCounts.partitions,
      'should not mutate partitions table');
    t.equal(cache.count(TABLES.SERVICES), beforeCounts.services,
      'should not mutate services table');
    t.equal(cache.count(TABLES.REPLICA_OPERATIONS), beforeCounts.replicaOperations,
      'should not mutate replica operations table');

    await api.shutdown();
  });

test('AdminWebSocketAPI - local control snapshot exports authoritative fallback telemetry',
  async (t) => {
    const cache = createPopulatedCache();
    const api = new AdminWebSocketAPI({
      nodeId: 'test-node',
      systemTableCache: cache,
      cdcIntegrationService: {
        getAuthoritativeFallbackDiagnostics: () => ({
          schemaVersion: 1,
          nodeId: 'test-node',
          windowMs: 60000,
          totalCount: 3,
          windowCount: 2,
          windowRatePerMinute: 2,
          phases: {
            bootstrap: {windowCount: 0, totalCount: 0},
            recovery: {windowCount: 0, totalCount: 0},
            steady_state: {windowCount: 2, totalCount: 3},
          },
          outcomes: {
            recovered: {windowCount: 2, totalCount: 3},
            failed: {windowCount: 0, totalCount: 0},
          },
          byTable: {
            nodes: {windowCount: 2, totalCount: 3, lastRecordedAt: Date.now()},
          },
          recentEvents: [],
        }),
      },
    });

    await api.initialize(0, {listen: false});

    const response = await api.getFastify().inject({
      method: 'GET',
      url: '/api/admin/control-snapshot?scope=local',
    });
    const payload = response.json();

    t.equal(response.statusCode, 200, 'should return 200 for local snapshot');
    t.equal(payload.cdcTelemetry.authoritativeFallback.totalCount, 3,
      'should export fallback totals');
    t.equal(payload.cdcTelemetry.authoritativeFallback.phases.steady_state.windowCount, 2,
      'should export steady-state fallback window counts');

    await api.shutdown();
  });

test('AdminWebSocketAPI - local control snapshot derives canonical leaders ' +
  'from partition owner rows', async (t) => {
  const cache = new SystemTableCache();
  cache.applySystemTableChange(TABLES.PARTITIONS, 'INSERT', {
    [COLUMN.PARTITION_ID]: 'partition-1',
    [COLUMN.TABLE_ID]: 'table-1',
    [COLUMN.LEADER_NODE_ID]: 'node-owner',
  });
  cache.applySystemTableChange(TABLES.SERVICES, 'INSERT', {
    [COLUMN.SERVICE_ID]: 'partition-1-r1',
    [COLUMN.SERVICE_TYPE]: 'partition',
    [COLUMN.PARTITION_ID]: 'partition-1',
    [COLUMN.REPLICA_ID]: 'partition-1-r1',
    [COLUMN.NODE_ID]: 'node-stale-a',
    [COLUMN.RAFT_ROLE]: 'leader',
    [COLUMN.STATUS]: 'active',
    [COLUMN.ADDRESS]: 'node-stale-a/partition/partition-1-r1',
  });
  cache.applySystemTableChange(TABLES.SERVICES, 'INSERT', {
    [COLUMN.SERVICE_ID]: 'partition-1-r2',
    [COLUMN.SERVICE_TYPE]: 'partition',
    [COLUMN.PARTITION_ID]: 'partition-1',
    [COLUMN.REPLICA_ID]: 'partition-1-r2',
    [COLUMN.NODE_ID]: 'node-stale-b',
    [COLUMN.RAFT_ROLE]: 'leader',
    [COLUMN.STATUS]: 'active',
    [COLUMN.ADDRESS]: 'node-stale-b/partition/partition-1-r2',
  });

  const api = new AdminWebSocketAPI({
    nodeId: 'test-node',
    systemTableCache: cache,
    sqlQueryEngine: {
      executeRequest: async () => ({success: true, rows: []}),
    },
  });

  await api.initialize(0, {listen: false});

  const response = await api.getFastify().inject({
    method: 'GET',
    url: '/api/admin/control-snapshot?scope=local',
  });
  const payload = response.json();

  t.equal(payload.leaders['partition-1'], 'node-owner',
    'canonical leader should come from partitions.leader_node_id');
  t.same(payload.replicaRoles['partition-1'], {
    'partition-1-r1': 'leader',
    'partition-1-r2': 'leader',
  }, 'replica-role detail should remain available separately');
  t.same(payload.replicaRoleDiagnostics['partition-1'], {
    canonicalLeaderNodeId: 'node-owner',
    source: 'partitions',
    inconsistentReplicaRoles: true,
    replicaLeaderNodeIds: ['node-stale-a', 'node-stale-b'],
    issues: [CONSISTENCY_MISMATCH_KIND.REPLICA_ROLE],
  }, 'snapshot should surface replica-role inconsistency without changing canonical leader');

  await api.shutdown();
});

test(
  'AdminWebSocketAPI - local control snapshot ignores stale ADD rows once exact target replica services are active',
  async (t) => {
    const cache = createPopulatedCache();
    cache.applySystemTableChange(TABLES.PARTITIONS, 'INSERT', {
      partition_id: 'partition-1',
      table_id: 'table-1',
      table_name: 'events',
      state: 'NORMAL',
      leader_node_id: 'node-1',
    });
    cache.applySystemTableChange(TABLES.SERVICES, 'INSERT', {
      service_id: 'partition-1-r1',
      service_type: 'partition',
      partition_id: 'partition-1',
      replica_id: 'partition-1-r1',
      node_id: 'node-1',
      raft_role: 'leader',
      status: 'active',
      address: 'node-1/partition/partition-1-r1',
    });
    cache.applySystemTableChange(TABLES.SERVICES, 'INSERT', {
      service_id: 'partition-1-r2',
      service_type: 'partition',
      partition_id: 'partition-1',
      replica_id: 'partition-1-r2',
      node_id: 'node-2',
      raft_role: 'follower',
      status: 'active',
      address: 'node-2/partition/partition-1-r2',
    });
    cache.applySystemTableChange(TABLES.REPLICA_OPERATIONS, 'INSERT', {
      operation_id: 'op-add-stale-active-replica',
      type: 'ADD',
      partition_id: 'partition-1',
      entity_type: 'partition',
      entity_id: 'partition-1',
      source_node_id: 'node-1',
      target_node_id: 'node-2',
      replica_id: 'partition-1-r2',
      status: 'creating',
      workflow_step: 'CREATING',
      created_at: 1741000000000,
      updated_at: 1741000001000,
    });
    const api = new AdminWebSocketAPI({
      nodeId: 'test-node',
      systemTableCache: cache,
      sqlQueryEngine: createMockQueryEngine(),
    });

    const result = await api.buildControlSnapshotQueryResult();
    const payload = result?.rows?.[0] || null;
    const timeline =
      payload?.replicaOperations?.operationTimelineById
        ?.['op-add-stale-active-replica'] || [];
    const currentStateEntry = timeline[timeline.length - 1] || null;

    t.equal(
      payload?.replicaOperations?.inFlightCount,
      0,
      'control snapshot should not count stale ADD rows once the exact target replica is active',
    );
    t.equal(
      currentStateEntry?.inFlight,
      false,
      'replica-operation timeline should mark the current state as non-blocking after observed service convergence',
    );
  },
);

test('AdminWebSocketAPI - local control snapshot exposes structured control-plane diagnostics',
  async (t) => {
    const workflowId = 'split-table-1-partition-1-v2';
    const readinessRequests = [];
    const splitEvaluationDiagnostics = {
      state: 'IDLE',
      evaluationIntervalMs: 60000,
      reactiveEvaluationDebounceMs: 1000,
      inFlight: false,
      requestedEvaluationPending: false,
      requestedAtMs: 1709510460100,
      requestedReasonCodes: ['write_activity'],
      requestedPartitionIds: ['table-1-p1'],
      lastStartedAtMs: 1709510460200,
      lastCompletedAtMs: 1709510460300,
      lastDurationMs: 100,
      lastError: null,
      lastSummary: {
        evaluated: true,
        partitionsEvaluated: 3,
        splitCandidateCount: 2,
        executedSplitCount: 1,
        splitDeferredCount: 1,
        splitErrorCount: 0,
        mergeCandidateCount: 0,
      },
    };
    const cache = createPopulatedCache();
    const originalLogsTableInstance = LogsTableService.instance;
    LogsTableService.instance = {
      getStats() {
        return {
          pendingWrites: 4,
          pendingWriteGrowthCount: 2,
          retainedBacklogGrowthCount: 1,
          retainedPressureBacklogCap: 16,
          maxPendingWrites: 32,
          isWriting: true,
          consecutiveDeferredWriteFailures: 3,
          sharedPressureBackpressured: true,
        };
      },
    };
    t.teardown(() => {
      LogsTableService.instance = originalLogsTableInstance;
    });
    cache.applySystemTableChange(TABLES.TABLES, 'UPDATE', {
      id: 'table-1',
      partition_transition_state: 'failed',
      partition_transition_metadata: JSON.stringify({
        workflowId,
        sourcePartitionId: 'partition-1',
        targetPartitionIds: ['partition-1-left', 'partition-1-right'],
        admission: {
          decisionType: 'blocked',
          blockingReasons: [{
            code: 'metadata_publication_degraded',
          }],
        },
        failure: {
          classification: 'split_execution_failure',
          timeoutClassification: {
            classification: 'cache_visibility_timeout',
            boundaryHit: true,
            nestedOperation: 'table_partition_metadata_wait',
          },
        },
      }),
    });

    const api = new AdminWebSocketAPI({
      nodeId: 'node-1',
      systemTableCache: cache,
      controlPlaneReadinessService: {
        async getAllNodeReadiness(options = {}) {
          readinessRequests.push(options);
          return [{
            nodeId: 'node-1',
            nodeEvidence: {
              lastHeartbeat: 1000,
              heartbeatAgeMs: 25,
              readyLeaseExpiresAt: 1200,
              readyLeaseAgeMs: -175,
            },
            dimensions: {
              processAlive: true,
              clusterMemberHealthy: true,
              routingReady: true,
              loadReady: true,
              placementEligible: false,
              controlPlaneWritable: false,
              metadataPublicationHealthy: false,
            },
            reasons: [{
              code: 'metadata_publication_degraded',
            }],
            publication: {
              currentMode: 'conservative_fanout',
              reasonCode: 'grouped_delivery_failed',
              enteredAt: '2026-03-04T00:00:00.000Z',
              recentTransitions: [{
                mode: 'conservative_fanout',
                reasonCode: 'grouped_delivery_failed',
              }],
            },
            membershipPublication: {
              publicationEpoch: 14,
              status: 'ACK_PENDING',
              publishedActiveNodeIds: ['node-1', 'node-3'],
              requiredAckNodeIds: ['node-1', 'node-2'],
              acknowledgedNodeIds: ['node-1'],
              sourceTopologyEpoch: 9,
              sourceSnapshotVersion: 21,
              updatedAt: '2026-03-04T00:02:30.000Z',
              priorityPartitionSummary: {
                satisfied: false,
                missingNodeIds: ['node-2'],
              },
            },
            priorityControlPlaneRecovery: {
              active: true,
              reasonCodes: [
                'publication_epoch_pending',
                'priority_partitions_not_spread',
              ],
            },
          }];
        },
        getReadinessTransitionHistoryByNodeId() {
          return {
            'node-1': [{
              nodeId: 'node-1',
              observedAt: '2026-03-04T00:01:00.000Z',
              observedAtMs: 1709510460000,
              previousServeEligible: true,
              serveEligible: false,
              previousRepairEligible: true,
              repairEligible: false,
              reasonCodes: ['metadata_publication_degraded'],
              flippedDimensions: ['serveEligible', 'repairEligible'],
              rawInputs: {
                heartbeatAgeMs: 25,
                readyLeaseLagMs: -175,
              },
            }],
          };
        },
        getParticipationDecisionLedgerEntries() {
          return [{
            nodeId: 'node-1',
            participationKind: 'control_plane_recovery',
            decisionDimension: 'controlPlaneRecoveryEligible',
            decision: 'ready',
            eligible: true,
          }];
        },
        getAuthoritativeReadinessRepairLedgerEntries() {
          return [{
            nodeId: 'node-1',
            stage: 'completed',
            outcome: 'repaired',
            repaired: true,
          }];
        },
        getRecoveryEpochHistoryByNodeId() {
          return {
            'node-1': [{
              epochId: 'node-1:1',
              nodeId: 'node-1',
              open: false,
              startedAt: '2026-03-04T00:00:00.000Z',
              endedAt: '2026-03-04T00:03:00.000Z',
              events: [{
                nodeId: 'node-1',
                recoveryActive: true,
              }, {
                nodeId: 'node-1',
                recoveryActive: false,
              }],
            }],
          };
        },
      },
      heartbeatService: {
        getHeartbeatPublicationDiagnostics() {
          return {
            publicationPath: 'node_state_reporter',
            targetAddress: 'seed-1/message-group/mg-1',
            targetNodeId: 'seed-1',
            targetServiceType: 'message-group',
            targetServiceId: 'mg-1',
            lastAttemptAt: '2026-03-04T00:02:00.000Z',
            lastSuccessAt: '2026-03-04T00:02:00.100Z',
            lastFailureAt: null,
            lastFailureStage: null,
            lastFailureReason: null,
            consecutiveFailures: 0,
          };
        },
      },
      sqlQueryEngine: {
        executeRequest: async () => ({success: true, rows: []}),
        partitionSplitMergeManager: {
          getEvaluationDiagnostics() {
            return splitEvaluationDiagnostics;
          },
        },
      },
      controlPlaneSystemTableGateway: {
        getControlPlaneOperationLedgerEntries() {
          return [{
            nodeId: 'node-1',
            operationClass: 'read',
            tableName: 'nodes',
            success: true,
          }];
        },
      },
    });

    await api.initialize(0, {listen: false});
    api.controlSnapshot.resolveLocalPartitionServices = () => new Map([
      ['partition-1', {
        getStats() {
          return {
            partitionId: 'partition-1',
            cdcReplay: {
              bufferedEvents: 7,
              replayBufferGrowthCount: 3,
              replayRetryDepth: 2,
              replayInFlight: true,
            },
          };
        },
      }],
    ]);

    const response = await api.getFastify().inject({
      method: 'GET',
      url: '/api/admin/control-snapshot?scope=local',
    });
    const payload = response.json();
    const diagnostics = payload.controlPlaneDiagnostics;

    t.equal(response.statusCode, 200, 'should return 200 for local snapshot');
    t.equal(
      diagnostics.publicationMode.currentMode,
      'conservative_fanout',
      'snapshot should expose canonical publication mode',
    );
    t.equal(
      diagnostics.publicationConvergence.publicationEpoch,
      14,
      'snapshot should expose the latest durable publication epoch',
    );
    t.same(
      diagnostics.publicationConvergence.pendingAckNodeIds,
      ['node-2'],
      'snapshot should expose pending publication acknowledgements separately from durable published state',
    );
    t.equal(
      diagnostics.priorityControlPlaneRecoveryByNodeId['node-1'].active,
      true,
      'snapshot should expose per-node priority recovery diagnostics',
    );
    t.equal(
      diagnostics.readinessByNodeId['node-1'].dimensions.placementEligible,
      false,
      'snapshot should expose per-node readiness dimensions',
    );
    t.same(
      diagnostics.placementEligibilityByNodeId['node-1'].reasonCodes,
      ['metadata_publication_degraded'],
      'snapshot should expose placement-eligibility reason codes',
    );
    t.equal(
      diagnostics.workflowAdmissionsByWorkflowId[workflowId].blockingReasons[0].code,
      'metadata_publication_degraded',
      'snapshot should expose persisted workflow admission reasons',
    );
    t.equal(
      diagnostics.heartbeatPublication.targetAddress,
      'seed-1/message-group/mg-1',
      'snapshot should expose heartbeat publication target diagnostics',
    );
    t.equal(
      diagnostics.nodeLivenessByNodeId['node-1'].heartbeatAgeMs,
      25,
      'snapshot should expose node heartbeat age for current readiness',
    );
    t.equal(
      diagnostics.readinessTransitionsByNodeId['node-1'][0].serveEligible,
      false,
      'snapshot should expose recent readiness eligibility flips',
    );
    t.equal(
      diagnostics.participationDecisions[0].decisionDimension,
      'controlPlaneRecoveryEligible',
      'snapshot should expose recent participation decisions',
    );
    t.equal(
      diagnostics.authoritativeReadinessRepairs[0].stage,
      'completed',
      'snapshot should expose authoritative readiness repair attempts',
    );
    t.equal(
      diagnostics.recoveryEpochsByNodeId['node-1'][0].events.length,
      2,
      'snapshot should expose bounded recovery epoch history',
    );
    t.equal(
      diagnostics.controlPlaneOperations[0].operationClass,
      'read',
      'snapshot should expose recent control-plane table operations',
    );
    t.ok(readinessRequests.length >= 1,
      'control snapshot should request readiness at least once');
    t.same(
      readinessRequests[0],
      {
        allowAuthoritativeRefresh: true,
        allowStaleOnCacheChange: true,
        maxCachedAgeMs: 5000,
      },
      'control snapshot should request cached authoritative refresh',
    );
    t.equal(
      diagnostics.timeoutClassifications[0].timeoutClassification.classification,
      'cache_visibility_timeout',
      'snapshot should expose persisted timeout classifications',
    );
    t.equal(
      diagnostics.splitEvaluation.lastSummary.splitCandidateCount,
      2,
      'snapshot should expose split-evaluation candidate count from owner',
    );
    t.same(
      diagnostics.splitEvaluation.requestedReasonCodes,
      ['write_activity'],
      'snapshot should expose pending split-evaluation request reasons',
    );
    t.equal(
      diagnostics.logsTable.pendingWriteGrowthCount,
      2,
      'snapshot should expose logs-table retained-object growth diagnostics',
    );
    t.equal(
      diagnostics.cdcReplay.bufferedEvents,
      7,
      'snapshot should expose aggregated CDC replay backlog diagnostics',
    );
    t.equal(
      diagnostics.cdcReplayByPartitionId['partition-1'].replayRetryDepth,
      2,
      'snapshot should expose bounded per-partition CDC replay diagnostics',
    );

    const preflightResult =
      await api.buildPreflightCriticalPathSnapshotQueryResult();
    t.equal(
      preflightResult.rows[0].controlPlaneDiagnostics.publicationMode.currentMode,
      'conservative_fanout',
      'preflight snapshot should carry the same control-plane diagnostics block',
    );

    await api.shutdown();
  });

test('AdminWebSocketAPI - local control snapshot derives active nodes from readiness and canonical websocket endpoints',
  async (t) => {
    const cache = createPopulatedCache();
    cache.applySystemTableChange(TABLES.NODES, 'UPDATE', {
      id: 'node-1',
      node_id: 'node-1',
      status: 'active',
      connection_state: 'ready',
      last_heartbeat: 1000,
      ready_lease_expires_at: 2000,
    });
    cache.applySystemTableChange(TABLES.NODES, 'INSERT', {
      id: 'node-2',
      node_id: 'node-2',
      status: 'active',
      connection_state: 'ready',
      last_heartbeat: 1000,
      ready_lease_expires_at: 2000,
    });
    cache.applySystemTableChange(TABLES.NODES, 'INSERT', {
      id: 'node-3',
      node_id: 'node-3',
      status: 'active',
      connection_state: 'ready',
      last_heartbeat: 1000,
      ready_lease_expires_at: 2000,
    });
    cache.applySystemTableChange(TABLES.NODE_ENDPOINTS, 'INSERT', {
      endpoint_id: 'node-1-ws',
      node_id: 'node-1',
      transport_type: 'ws',
      status: 'active',
      address: 'ws://node-1:8082',
    });
    cache.applySystemTableChange(TABLES.NODE_ENDPOINTS, 'INSERT', {
      endpoint_id: 'node-2-ws',
      node_id: 'node-2',
      transport_type: 'ws',
      status: 'active',
      address: 'ws://node-2:8082',
    });

    const api = new AdminWebSocketAPI({
      nodeId: 'node-1',
      systemTableCache: cache,
      controlPlaneReadinessService: {
        async getAllNodeReadiness() {
          return [{
            nodeId: 'node-1',
            dimensions: {
              [CONTROL_PLANE_READINESS_DIMENSION.CLUSTER_MEMBER_HEALTHY]: true,
            },
          }, {
            nodeId: 'node-2',
            dimensions: {
              [CONTROL_PLANE_READINESS_DIMENSION.CLUSTER_MEMBER_HEALTHY]: false,
            },
          }, {
            nodeId: 'node-3',
            dimensions: {
              [CONTROL_PLANE_READINESS_DIMENSION.CLUSTER_MEMBER_HEALTHY]: true,
            },
          }];
        },
      },
    });

    await api.initialize(0, {listen: false});
    t.teardown(async () => {
      await api.shutdown();
    });

    const response = await api.getFastify().inject({
      method: 'GET',
      url: '/api/admin/control-snapshot?scope=local',
    });

    t.equal(response.statusCode, 200, 'should return 200 for local snapshot');
    t.same(
      response.json().nodes,
      ['node-1'],
      'snapshot should publish only readiness-healthy nodes with canonical websocket endpoints',
    );
  });

test('AdminWebSocketAPI - local control snapshot keeps readiness-healthy service-visible nodes when node rows lag the cache',
  async (t) => {
    const cache = createPopulatedCache();
    cache.applySystemTableChange(TABLES.NODES, 'UPDATE', {
      id: 'node-1',
      node_id: 'node-1',
      status: 'active',
      connection_state: 'ready',
      last_heartbeat: 1000,
      ready_lease_expires_at: 2000,
    });
    cache.applySystemTableChange(TABLES.SERVICES, 'INSERT', {
      service_id: 'svc-node-1',
      service_type: SERVICE_TYPE.MESSAGE_GROUP,
      node_id: 'node-1',
      status: 'active',
      address: 'node-1/message-group/svc-node-1',
      group_id: 'mg-node-1',
      replica_id: 'svc-node-1',
    });
    cache.applySystemTableChange(TABLES.SERVICES, 'INSERT', {
      service_id: 'svc-node-2',
      service_type: SERVICE_TYPE.MESSAGE_GROUP,
      node_id: 'node-2',
      status: 'active',
      address: 'node-2/message-group/svc-node-2',
      group_id: 'mg-node-2',
      replica_id: 'svc-node-2',
    });
    cache.applySystemTableChange(TABLES.NODE_ENDPOINTS, 'INSERT', {
      endpoint_id: 'node-1-ws',
      node_id: 'node-1',
      transport_type: 'ws',
      status: 'active',
      address: 'ws://node-1:8082',
    });
    cache.applySystemTableChange(TABLES.NODE_ENDPOINTS, 'INSERT', {
      endpoint_id: 'node-2-ws',
      node_id: 'node-2',
      transport_type: 'ws',
      status: 'active',
      address: 'ws://node-2:8082',
    });

    const api = new AdminWebSocketAPI({
      nodeId: 'node-1',
      systemTableCache: cache,
      controlPlaneReadinessService: {
        async getAllNodeReadiness() {
          return [{
            nodeId: 'node-1',
            dimensions: {
              [CONTROL_PLANE_READINESS_DIMENSION.CLUSTER_MEMBER_HEALTHY]: true,
            },
          }, {
            nodeId: 'node-2',
            dimensions: {
              [CONTROL_PLANE_READINESS_DIMENSION.CLUSTER_MEMBER_HEALTHY]: true,
            },
          }];
        },
      },
    });

    await api.initialize(0, {listen: false});
    t.teardown(async () => {
      await api.shutdown();
    });

    const response = await api.getFastify().inject({
      method: 'GET',
      url: '/api/admin/control-snapshot?scope=local',
    });

    t.equal(response.statusCode, 200, 'should return 200 for local snapshot');
    t.same(
      response.json().nodes,
      ['node-1', 'node-2'],
      'snapshot should keep readiness-healthy peers visible when their node row lags behind active service and endpoint evidence',
    );
  });

test('AdminWebSocketAPI - local control snapshot keeps readiness-healthy peers when node_endpoints lag repaired service rows',
  async (t) => {
    const cache = createPopulatedCache();
    cache.applySystemTableChange(TABLES.NODES, 'UPDATE', {
      id: 'node-1',
      node_id: 'node-1',
      status: 'active',
      connection_state: 'ready',
      last_heartbeat: 1000,
      ready_lease_expires_at: 2000,
    });
    cache.applySystemTableChange(TABLES.NODES, 'INSERT', {
      id: 'node-2',
      node_id: 'node-2',
      status: 'active',
      connection_state: 'ready',
      last_heartbeat: 1000,
      ready_lease_expires_at: 2000,
    });
    cache.applySystemTableChange(TABLES.SERVICES, 'INSERT', {
      service_id: 'svc-node-1',
      service_type: SERVICE_TYPE.MESSAGE_GROUP,
      node_id: 'node-1',
      status: 'active',
      address: 'node-1/message-group/svc-node-1',
      group_id: 'mg-node-1',
      replica_id: 'svc-node-1',
    });
    cache.applySystemTableChange(TABLES.SERVICES, 'INSERT', {
      service_id: 'svc-node-2',
      service_type: SERVICE_TYPE.MESSAGE_GROUP,
      node_id: 'node-2',
      status: 'active',
      address: 'node-2/message-group/svc-node-2',
      group_id: 'mg-node-2',
      replica_id: 'svc-node-2',
    });
    cache.applySystemTableChange(TABLES.NODE_ENDPOINTS, 'INSERT', {
      endpoint_id: 'node-1-ws',
      node_id: 'node-1',
      transport_type: 'ws',
      status: 'active',
      address: 'ws://node-1:8082',
    });

    const api = new AdminWebSocketAPI({
      nodeId: 'node-1',
      systemTableCache: cache,
      controlPlaneReadinessService: {
        async getAllNodeReadiness() {
          return [{
            nodeId: 'node-1',
            dimensions: {
              [CONTROL_PLANE_READINESS_DIMENSION.CLUSTER_MEMBER_HEALTHY]: true,
            },
          }, {
            nodeId: 'node-2',
            dimensions: {
              [CONTROL_PLANE_READINESS_DIMENSION.CLUSTER_MEMBER_HEALTHY]: true,
            },
          }];
        },
      },
    });

    await api.initialize(0, {listen: false});
    t.teardown(async () => {
      await api.shutdown();
    });

    const response = await api.getFastify().inject({
      method: 'GET',
      url: '/api/admin/control-snapshot?scope=local',
    });

    t.equal(response.statusCode, 200, 'should return 200 for local snapshot');
    t.same(
      response.json().nodes,
      ['node-1', 'node-2'],
      'snapshot should keep healthy peers visible when service rows are repaired before endpoint rows',
    );
  });

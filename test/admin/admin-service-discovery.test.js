import {test} from '../../src/test-helpers/tap.js';
import {TABLES} from '../../src/constants/index.js';
import {AdminServiceDiscovery} from '../../src/admin/admin-service-discovery.js';
import {
  CONTROL_PLANE_READINESS_DIMENSION,
} from '../../src/control-plane/control-plane-readiness-constants.js';
import {
  PROJECTION_READINESS_ACTIVE_GATE_STATE,
} from '../../src/control-plane/projection-readiness-constants.js';
import {
  buildProjectionReadinessContract,
} from '../../src/control-plane/projection-readiness-state.js';
import {
  CONTROL_PLANE_PUBLICATION_STATUS,
} from '../../src/control-plane/publication-owner-constants.js';
import {
  CONTROL_PLANE_DELIVERY_PRIORITY,
} from '../../src/control-plane/control-plane-constants.js';
import {
  CONTROL_PLANE_AUTHORITATIVE_OBSERVATION_SCOPE,
  CONTROL_PLANE_CACHE_RECONCILE_INTENT,
} from '../../src/control-plane/control-plane-system-table-gateway.js';
import {
  CONTROL_PLANE_WORKLOAD_CLASS,
} from '../../src/control-plane/control-plane-workload-profile.js';

const TEST_DISCOVERY_NODE_ID = 'node-a';
const TEST_TRIGGER_CODES = ['discovery_node_coverage_gap'];
const TEST_DISCOVERY_SNAPSHOT_REASON = 'service_discovery_snapshot';
const TEST_DISCOVERY_TABLE_NAME = TABLES.SERVICES;
const TEST_DISCOVERY_TABLE_ID = 'services-p1';
const TEST_DISCOVERY_OWNER_MISSING_PARTITION_ID = 'benchmark_events-p1';
const TEST_DISCOVERY_ROUTING_GAP_OWNER_MISSING = 'owner_missing';
const TEST_AUTHORITATIVE_REPAIR_QUERY_TIMEOUT_MS = 3349;
const TEST_AUTHORITATIVE_OBSERVED_AT_MS = 1700000000000;
const TEST_SELECTED_SNAPSHOT_SOURCE_NODE_ID =
  '11601fe0-72d6-5853-8590-ec2881853e72';

function buildCompleteAuthoritativeReadResult(
  tableName,
  rows = [],
  causeId = `test-authoritative-read:${tableName}`,
) {
  return {
    success: true,
    tableName,
    rows,
    rowSetComplete: true,
    authoritativeObservation: {
      scope: CONTROL_PLANE_AUTHORITATIVE_OBSERVATION_SCOPE.COMPLETE_TABLE,
      tableName,
      observedAtMs: TEST_AUTHORITATIVE_OBSERVED_AT_MS,
      causeId,
      rowSetComplete: true,
    },
  };
}

function buildSuccessfulReconcileResult(mutationCount, options = {}) {
  return {
    success: true,
    mutationCount,
    authoritativeObservedAtMs:
      options?.authoritativeObservation?.observedAtMs || null,
  };
}

test('AdminServiceDiscovery routes authoritative cache repair through the ' +
  'gateway instead of mutating the cache directly', async (t) => {
  const repairCalls = [];
  const discovery = new AdminServiceDiscovery({
    nodeId: TEST_DISCOVERY_NODE_ID,
    systemTableCache: {
      getAll() {
        return [];
      },
    },
    cacheMutationTarget: {
      applySystemTableChange() {
        throw new Error('service discovery must not mutate cache directly');
      },
    },
    controlPlaneSystemTableGateway: {
      reconcileAuthoritativeCacheRows(tableName, rows, options) {
        repairCalls.push({tableName, rows, options});
        return Promise.resolve({success: true, mutationCount: 3});
      },
    },
  });

  const mutationCount = await discovery.applyAuthoritativeSystemTableRows(
    TABLES.SERVICES,
    [{service_id: 'svc-1'}],
    'admin-discovery:test',
  );

  t.equal(mutationCount, 3, 'gateway-provided mutation count should propagate');
  t.equal(repairCalls.length, 1, 'service discovery should delegate once');
  t.equal(
    repairCalls[0].options.causeId,
    'admin-discovery:test',
    'service discovery should preserve the repair cause',
  );
  t.equal(
    repairCalls[0].options.reconcileIntent,
    CONTROL_PLANE_CACHE_RECONCILE_INTENT.REFRESH_EVIDENCE,
    'service discovery repairs should preserve missing rows during refresh',
  );
});

test('AdminServiceDiscovery routes shared snapshot resolution through the injected control-plane snapshot owner',
  async (t) => {
    const ownerResult = {
      serviceCount: 1,
      snapshotObservation: {
        state: 'fresh',
      },
      snapshotRevision: 14,
      snapshotRevisionState: 'current',
      snapshotResumeToken: 'control-plane-revision:captured_at:14',
    };
    const ownerCalls = [];
    const localSnapshot = {
      serviceCount: 0,
    };
    const discovery = new AdminServiceDiscovery({
      nodeId: TEST_DISCOVERY_NODE_ID,
      controlPlaneSnapshotOwner: {
        async resolveServiceDiscoverySnapshot(receivedSnapshot, options) {
          ownerCalls.push({
            receivedSnapshot,
            options,
          });
          return ownerResult;
        },
      },
    });
    discovery.buildLocalServiceDiscoverySnapshot = () => localSnapshot;

    const result = await discovery.resolveServiceDiscoverySnapshot({
      allowAuthoritativeRepair: true,
      tableName: TEST_DISCOVERY_TABLE_NAME,
      tableId: TEST_DISCOVERY_TABLE_ID,
    });

    t.equal(
      ownerCalls.length,
      1,
      'service discovery should delegate shared snapshot resolution exactly once',
    );
    t.equal(
      ownerCalls[0].receivedSnapshot,
      localSnapshot,
      'service discovery should pass the local snapshot to the shared owner',
    );
    t.same(
      ownerCalls[0].options,
      {
        allowAuthoritativeRepair: true,
        tableName: TEST_DISCOVERY_TABLE_NAME,
        tableId: TEST_DISCOVERY_TABLE_ID,
      },
      'service discovery should preserve scope when delegating to the shared owner',
    );
    t.equal(
      result,
      ownerResult,
      'service discovery should return the shared owner result verbatim',
    );
  });

test('AdminServiceDiscovery follows the shared routing owner-gap state instead of local advisory leader roles',
  async (t) => {
    const discovery = new AdminServiceDiscovery({
      nodeId: TEST_DISCOVERY_NODE_ID,
      sqlQueryEngine: {
        queryExecutor: {
          getPartitionRoutingSnapshot(receivedPartitionId) {
            t.equal(
              receivedPartitionId,
              TEST_DISCOVERY_OWNER_MISSING_PARTITION_ID,
              'discovery should consult the shared routing snapshot for leader stability',
            );
            return {
              partitionId: receivedPartitionId,
              canonicalLeaderNodeId: null,
              canonicalLeaderRoutingGapState:
                TEST_DISCOVERY_ROUTING_GAP_OWNER_MISSING,
              serviceRowCount: 2,
              activeAddressedServiceCount: 2,
            };
          },
        },
      },
    });

    const leadershipStable = discovery.resolveDiscoveryLeadershipStable(
      new Set([TEST_DISCOVERY_OWNER_MISSING_PARTITION_ID]),
      [{
        partition_id: TEST_DISCOVERY_OWNER_MISSING_PARTITION_ID,
        leader_node_id: null,
      }],
      [{
        service_type: 'partition',
        partition_id: TEST_DISCOVERY_OWNER_MISSING_PARTITION_ID,
        node_id: 'node-a',
        status: 'active',
        raft_role: 'leader',
      }, {
        service_type: 'partition',
        partition_id: TEST_DISCOVERY_OWNER_MISSING_PARTITION_ID,
        node_id: 'node-b',
        status: 'active',
        raft_role: 'follower',
      }],
    );

    t.equal(
      leadershipStable,
      false,
      'discovery should not rebuild a local leader-stable answer once the shared routing owner reports an owner gap',
    );
  });

test('AdminServiceDiscovery authoritative cache repair reads use control-plane recovery semantics',
  async (t) => {
    const readCalls = [];
    const discovery = new AdminServiceDiscovery({
      nodeId: TEST_DISCOVERY_NODE_ID,
      systemTableCache: {
        getAll() {
          return [];
        },
      },
      cacheMutationTarget: {
        applySystemTableChange() {},
      },
      controlPlaneSystemTableGateway: {
        async executeRead(readIntent, options) {
          readCalls.push({
            tableName: readIntent?.tableName,
            queryTimeoutMs: options?.queryTimeoutMs,
            routingReadinessDimension: options?.routingReadinessDimension,
            workloadClass: options?.workloadClass,
            workClass: options?.workClass,
            deliveryPriority: options?.deliveryPriority,
          });
          return buildCompleteAuthoritativeReadResult(
            readIntent?.tableName,
          );
        },
        async reconcileAuthoritativeCacheRows(_tableName, _rows, options) {
          return buildSuccessfulReconcileResult(0, options);
        },
      },
    });

    await discovery.ensureAuthoritativeDiscoveryCacheRepair({
      reason: 'unit-test-recovery-routing',
      queryTimeoutMs: TEST_AUTHORITATIVE_REPAIR_QUERY_TIMEOUT_MS,
      triggerCodes: TEST_TRIGGER_CODES,
    });

    t.equal(readCalls.length > 0, true);
    t.equal(
      readCalls.every((call) =>
        call.queryTimeoutMs === TEST_AUTHORITATIVE_REPAIR_QUERY_TIMEOUT_MS,
      ),
      true,
      'authoritative discovery repair reads should preserve caller query timeout',
    );
    t.equal(
      readCalls.every((call) =>
        call.routingReadinessDimension ===
          CONTROL_PLANE_READINESS_DIMENSION.CONTROL_PLANE_RECOVERY_ELIGIBLE,
      ),
      true,
      'authoritative discovery repair should route gateway reads as control-plane recovery work',
    );
    t.equal(
      readCalls.every((call) =>
        call.workloadClass ===
          CONTROL_PLANE_WORKLOAD_CLASS.ADMIN_DIAGNOSTIC_READ,
      ),
      true,
      'service-discovery repair reads should carry the shared workload class',
    );
    t.equal(
      readCalls.every((call) => call.workClass === 'background'),
      true,
      'service-discovery repair reads should stay on the diagnostic work class',
    );
    t.equal(
      readCalls.every((call) =>
        call.deliveryPriority === CONTROL_PLANE_DELIVERY_PRIORITY.BACKGROUND),
      true,
      'service-discovery repair reads should stay off the critical transport lane',
    );
  });

test('AdminServiceDiscovery control snapshot repair reads bypass pressure degradation',
  async (t) => {
    const readCalls = [];
    const discovery = new AdminServiceDiscovery({
      nodeId: TEST_DISCOVERY_NODE_ID,
      systemTableCache: {
        getAll() {
          return [];
        },
      },
      cacheMutationTarget: {
        applySystemTableChange() {},
      },
      controlPlaneSystemTableGateway: {
        async executeRead(readIntent, options) {
          readCalls.push({
            tableName: readIntent?.tableName,
            readProfile: options?.readProfile,
            allowPressureDegrade: options?.allowPressureDegrade,
            workloadClass: options?.workloadClass,
            workClass: options?.workClass,
            deliveryPriority: options?.deliveryPriority,
            routingReadinessDimension: options?.routingReadinessDimension,
          });
          return buildCompleteAuthoritativeReadResult(
            readIntent?.tableName,
          );
        },
        async reconcileAuthoritativeCacheRows(_tableName, _rows, options) {
          return buildSuccessfulReconcileResult(0, options);
        },
      },
    });

    await discovery.ensureAuthoritativeDiscoveryCacheRepair({
      reason: 'control_snapshot',
      triggerCodes: TEST_TRIGGER_CODES,
    });

    t.equal(readCalls.length > 0, true,
      'control snapshot repair should issue authoritative discovery reads');
    t.equal(
      readCalls.every((call) => call.readProfile === 'repair_required'),
      true,
      'one repair profile owns the routed authoritative fallback path',
    );
    t.equal(
      readCalls.every((call) =>
        call.workClass === 'interactive'),
      true,
      'control snapshot repair should use the readiness read work class',
    );
    t.equal(
      readCalls.every((call) =>
        call.workloadClass ===
          CONTROL_PLANE_WORKLOAD_CLASS.READINESS_CRITICAL_READ),
      true,
      'control snapshot repair should carry the readiness workload class',
    );
    t.equal(
      readCalls.every((call) =>
        call.deliveryPriority === CONTROL_PLANE_DELIVERY_PRIORITY.READINESS),
      true,
      'control snapshot repair should use the transport readiness lane',
    );
    t.equal(
      readCalls.every((call) =>
        call.routingReadinessDimension ===
          CONTROL_PLANE_READINESS_DIMENSION.CONTROL_PLANE_RECOVERY_ELIGIBLE),
      true,
      'control snapshot repair should keep recovery-eligible routing semantics',
    );
  });

test('AdminServiceDiscovery table-scoped snapshot repair keeps recovery-eligible routing',
  async (t) => {
    const readCalls = [];
    const discovery = new AdminServiceDiscovery({
      nodeId: TEST_DISCOVERY_NODE_ID,
      systemTableCache: {
        getAll() {
          return [];
        },
      },
      cacheMutationTarget: {
        applySystemTableChange() {},
      },
      controlPlaneSystemTableGateway: {
        async executeRead(readIntent, options) {
          readCalls.push({
            tableName: readIntent?.tableName,
            readProfile: options?.readProfile,
            routingReadinessDimension: options?.routingReadinessDimension,
          });
          return buildCompleteAuthoritativeReadResult(
            readIntent?.tableName,
          );
        },
        async reconcileAuthoritativeCacheRows(_tableName, _rows, options) {
          return buildSuccessfulReconcileResult(0, options);
        },
      },
    });

    await discovery.ensureAuthoritativeDiscoveryCacheRepair({
      reason: TEST_DISCOVERY_SNAPSHOT_REASON,
      tableName: TEST_DISCOVERY_TABLE_NAME,
      tableId: TEST_DISCOVERY_TABLE_ID,
      triggerCodes: TEST_TRIGGER_CODES,
    });

    t.equal(readCalls.length > 0, true,
      'table-scoped service discovery repair should issue authoritative reads');
    t.equal(
      readCalls.every((call) => call.readProfile === 'repair_required'),
      true,
      'one repair profile owns SQL fallback',
    );
    t.equal(
      readCalls.every((call) =>
        call.routingReadinessDimension ===
          CONTROL_PLANE_READINESS_DIMENSION.CONTROL_PLANE_RECOVERY_ELIGIBLE),
      true,
      'table-scoped service discovery repair should use recovery-eligible routing',
    );
  });

test(
  'AdminServiceDiscovery does not report applied repair when any authoritative read fails',
  async (t) => {
    const reconcileCalls = [];
    const readCalls = [];
    const warnings = [];
    const discovery = new AdminServiceDiscovery({
      nodeId: TEST_DISCOVERY_NODE_ID,
      systemTableCache: {
        getAll() {
          return [];
        },
      },
      cacheMutationTarget: {
        applySystemTableChange() {},
      },
      controlPlaneSystemTableGateway: {
        async executeRead(readIntent) {
          const tableName = String(readIntent?.tableName || '');
          readCalls.push(tableName);
          if (tableName === TABLES.SERVICES) {
            return {
              success: false,
              error: 'authoritative_services_unavailable',
            };
          }
          return buildCompleteAuthoritativeReadResult(tableName);
        },
        async reconcileAuthoritativeCacheRows(tableName, rows, options) {
          reconcileCalls.push({tableName, rows, options});
          return buildSuccessfulReconcileResult(1, options);
        },
      },
    });
    discovery.logger = {
      warn(message, fields) {
        warnings.push({message, fields});
      },
      info() {},
    };

    const repair = await discovery.ensureAuthoritativeDiscoveryCacheRepair({
      reason: 'unit-test-partial-read-failure',
    });

    t.equal(repair.applied, false, 'repair should fail when any table read fails');
    t.equal(repair.tableCount, 0,
      'failed repair should not apply partial cache mutations');
    t.equal(
      Array.isArray(repair.failedTables) &&
        repair.failedTables.includes(TABLES.SERVICES),
      true,
      'failed table should be surfaced in repair diagnostics',
    );
    t.equal(reconcileCalls.length, 0,
      'repair should not mutate cache state after a read-stage failure');
    t.equal(readCalls.length > 0, true,
      'repair should attempt authoritative table reads through the gateway');
    t.equal(warnings.length, 1,
      'failed repair should emit one bounded warning');
    t.equal(
      warnings[0]?.fields?.requestedTableCount,
      repair.requestedTableCount,
      'warning should preserve requested table count',
    );
    t.same(
      warnings[0]?.fields?.failedTables,
      repair.failedTables,
      'warning should preserve failed table names',
    );
    t.equal(
      warnings[0]?.fields?.errorCount,
      repair.errorCount,
      'warning should preserve the error count',
    );
    t.same(
      warnings[0]?.fields?.errorCodes,
      ['authoritative_services_unavailable'],
      'warning should emit a bounded error-code summary',
    );
  },
);

test(
  'AdminServiceDiscovery classifies participant-failure repair cause chains',
  async (t) => {
    const warnings = [];
    const participantFailure = {
      success: false,
      errorCode: 'DISTRIBUTED_PARTICIPANT_FAILURE',
      error: 'Distributed operation failed due to participant failures',
      retryAfterMs: 250,
      participantFailures: [{
        partitionId: 'services-p1',
        participantNodeId: 'node-pressure',
        participantAddress: 'ws://node-pressure:7001',
        errorCode: 'CONTROL_PLANE_PRESSURE_DEGRADED',
        error: 'Outbound queue for node node-pressure is saturated',
        durationMs: 412,
        retryAfterMs: 250,
        backpressured: true,
        failedTable: TABLES.SERVICES,
      }],
      firstFailedParticipant: {
        partitionId: 'services-p1',
        participantNodeId: 'node-pressure',
        participantAddress: 'ws://node-pressure:7001',
        errorCode: 'CONTROL_PLANE_PRESSURE_DEGRADED',
        error: 'Outbound queue for node node-pressure is saturated',
        durationMs: 412,
        retryAfterMs: 250,
        backpressured: true,
        failedTable: TABLES.SERVICES,
      },
    };
    const discovery = new AdminServiceDiscovery({
      nodeId: 'node-a',
      systemTableCache: {
        getAll() {
          return [];
        },
      },
      cacheMutationTarget: {
        applySystemTableChange() {},
      },
      controlPlaneSystemTableGateway: {
        async executeRead(readIntent) {
          const tableName = String(readIntent?.tableName || '');
          if (tableName === TABLES.SERVICES) {
            return participantFailure;
          }
          return buildCompleteAuthoritativeReadResult(tableName);
        },
        async reconcileAuthoritativeCacheRows(_tableName, _rows, options) {
          return buildSuccessfulReconcileResult(1, options);
        },
      },
    });
    discovery.logger = {
      warn(message, fields) {
        warnings.push({message, fields});
      },
      info() {},
    };

    await discovery.ensureAuthoritativeDiscoveryCacheRepair({
      reason: 'unit-test-participant-cause-chain',
    });

    t.equal(warnings.length, 1, 'failed repair should emit one bounded warning');
    t.same(
      warnings[0]?.fields?.causeChain,
      ['query_participant_failure', 'control_plane_backpressure'],
      'warning should classify participant failure and backpressure',
    );
    t.equal(
      warnings[0]?.fields?.firstFailedParticipant?.participantNodeId,
      'node-pressure',
      'warning should preserve the first failed participant',
    );
  },
);

test(
  'AdminServiceDiscovery reuses recent pressure repair failures for the same repair scope',
  async (t) => {
    const INITIAL_NOW_MS = 1000;
    const SECOND_CALL_DELTA_MS = 1000;
    const FIRST_PRESSURE_RETRY_AFTER_MS = 8000;
    let nowMs = INITIAL_NOW_MS;
    const readCalls = [];
    const timeoutFailure = {
      success: false,
      errorCode: 'ROUTER_MESSAGE_TIMEOUT',
      error: 'Message timeout',
      retryAfterMs: 250,
      localQueryTransport: {
        ready: true,
        state: 'ready',
      },
    };
    const discovery = new AdminServiceDiscovery({
      nodeId: 'node-a',
      nowFn() {
        return nowMs;
      },
      systemTableCache: {
        getAll() {
          return [];
        },
      },
      cacheMutationTarget: {
        applySystemTableChange() {},
      },
      controlPlaneSystemTableGateway: {
        async executeRead(readIntent) {
          readCalls.push(String(readIntent?.tableName || ''));
          return timeoutFailure;
        },
        async reconcileAuthoritativeCacheRows(_tableName, _rows, options) {
          return buildSuccessfulReconcileResult(1, options);
        },
      },
    });

    const firstResult = await discovery.ensureAuthoritativeDiscoveryCacheRepair({
      reason: 'control_snapshot',
      triggerCodes: ['discovery_node_coverage_gap'],
    });

    t.match(
      firstResult,
      {
        applied: false,
        skipped: false,
        failureClass: 'pressure_or_timeout',
        failureCount: 1,
        retryAfterMs: FIRST_PRESSURE_RETRY_AFTER_MS,
      },
      'first pressure failure should create the initial repair backoff snapshot',
    );
    t.equal(readCalls.length > 0, true,
      'first attempt should issue authoritative reads');

    const firstReadCallCount = readCalls.length;
    nowMs += SECOND_CALL_DELTA_MS;

    const secondResult = await discovery.ensureAuthoritativeDiscoveryCacheRepair({
      reason: 'control_snapshot',
      triggerCodes: ['discovery_node_coverage_gap'],
    });

    t.equal(readCalls.length, firstReadCallCount,
      'second attempt should reuse the deferred failure snapshot');
    t.match(
      secondResult,
      {
        applied: false,
        skipped: true,
        deferred: true,
        reused: true,
        failureClass: 'pressure_or_timeout',
        failureCount: 1,
      },
      'second attempt should report the reused deferred failure state',
    );
    t.equal(
      secondResult.retryAfterMs,
      FIRST_PRESSURE_RETRY_AFTER_MS - SECOND_CALL_DELTA_MS,
      'reused failure should expose the remaining retry delay',
    );
  },
);

test(
  'AdminServiceDiscovery increases repair backoff after repeated pressure failures',
  async (t) => {
    const INITIAL_NOW_MS = 1000;
    const FIRST_PRESSURE_RETRY_AFTER_MS = 8000;
    const SECOND_PRESSURE_RETRY_AFTER_MS = 16000;
    let nowMs = INITIAL_NOW_MS;
    const readCalls = [];
    const timeoutFailure = {
      success: false,
      errorCode: 'ROUTER_MESSAGE_TIMEOUT',
      error: 'Message timeout',
      retryAfterMs: 250,
      localQueryTransport: {
        ready: true,
        state: 'ready',
      },
    };
    const discovery = new AdminServiceDiscovery({
      nodeId: 'node-a',
      nowFn() {
        return nowMs;
      },
      systemTableCache: {
        getAll() {
          return [];
        },
      },
      cacheMutationTarget: {
        applySystemTableChange() {},
      },
      controlPlaneSystemTableGateway: {
        async executeRead(readIntent) {
          readCalls.push(String(readIntent?.tableName || ''));
          return timeoutFailure;
        },
        async reconcileAuthoritativeCacheRows(_tableName, _rows, options) {
          return buildSuccessfulReconcileResult(1, options);
        },
      },
    });

    const firstResult = await discovery.ensureAuthoritativeDiscoveryCacheRepair({
      reason: 'control_snapshot',
      triggerCodes: ['discovery_node_coverage_gap'],
    });

    t.equal(firstResult.retryAfterMs, FIRST_PRESSURE_RETRY_AFTER_MS,
      'first failure should use the initial pressure retry delay');

    nowMs += FIRST_PRESSURE_RETRY_AFTER_MS;

    const secondResult = await discovery.ensureAuthoritativeDiscoveryCacheRepair({
      reason: 'control_snapshot',
      triggerCodes: ['discovery_node_coverage_gap'],
    });

    t.equal(readCalls.length > 1, true,
      'a retry after the cooldown should issue a new authoritative read');
    t.match(
      secondResult,
      {
        applied: false,
        skipped: false,
        failureClass: 'pressure_or_timeout',
        failureCount: 2,
        retryAfterMs: SECOND_PRESSURE_RETRY_AFTER_MS,
      },
      'second failure should increase the backoff window',
    );
  },
);

test(
  'AdminServiceDiscovery degrades both nodes for failed replace operations',
  async (t) => {
    const PARTITION_ID = 'partition-1';
    const OPERATION_ID = 'replace-1';
    const SOURCE_NODE_ID = 'node-source';
    const TARGET_NODE_ID = 'node-target';
    const FAILED_STATUS = 'failed';
    const MOVE_FAILED_STATE = 'move_failed';
    const REASON_CODE = 'replica_operation_failed';
    const discovery = new AdminServiceDiscovery({
      nodeId: 'node-local',
      nowFn() {
        return 200;
      },
    });

    const degradationByNodeId =
      discovery.buildDiscoveryReplicaOperationDegradationByNodeId(
        [{
          partition_id: PARTITION_ID,
          operation_id: OPERATION_ID,
          type: 'REPLACE',
          status: FAILED_STATUS,
          workflow_step: 'FAILED',
          source_node_id: SOURCE_NODE_ID,
          target_node_id: TARGET_NODE_ID,
          updated_at: 100,
        }],
        {
          partitionIds: new Set([PARTITION_ID]),
          serviceRows: [],
        },
      );

    t.same(
      degradationByNodeId.get(SOURCE_NODE_ID),
      {
        degradationState: MOVE_FAILED_STATE,
        operationIds: [OPERATION_ID],
        reasons: [{
          code: REASON_CODE,
          detail: `${OPERATION_ID}:REPLACE:${FAILED_STATUS}`,
        }],
      },
      'failed replace operations should degrade the source node',
    );
    t.same(
      degradationByNodeId.get(TARGET_NODE_ID),
      {
        degradationState: MOVE_FAILED_STATE,
        operationIds: [OPERATION_ID],
        reasons: [{
          code: REASON_CODE,
          detail: `${OPERATION_ID}:REPLACE:${FAILED_STATUS}`,
        }],
      },
      'failed replace operations should degrade the target node',
    );
  },
);

test(
  'AdminServiceDiscovery builds canonical readiness reasons for blocked replicas',
  async (t) => {
    const NODE_ID = 'node-local';
    const TABLE_NAME = 'users';
    const PARTITION_ID = 'users-p1';
    const UNHEALTHY_STATUS = 'unhealthy';
    const OPERATION_DETAIL = 'replace-1:REPLACE:failed';
    const ROUTING_NOT_READY = 'routing_not_ready';
    const SCHEMA_PARTITION_UNAVAILABLE = 'schema_partition_unavailable';
    const REPLICA_OPERATION_FAILED = 'replica_operation_failed';
    const LEADERSHIP_UNSTABLE = 'leadership_unstable';
    const LOCAL_REPLICA_NOT_VOTER_READY = 'local_replica_not_voter_ready';
    const LOCAL_CDC_DIAGNOSTICS_UNAVAILABLE =
      'local_cdc_diagnostics_unavailable';
    const LOCAL_CDC_SUBSCRIBER_MISSING =
      'local_cdc_subscriber_missing';
    const LOCAL_CDC_BUFFER_NOT_DRAINED =
      'local_cdc_buffer_not_drained';
    const discovery = new AdminServiceDiscovery({
      nodeId: NODE_ID,
    });

    const readiness = discovery.buildServiceDiscoveryReplicaReadiness(
      {
        nodeId: NODE_ID,
        healthStatus: UNHEALTHY_STATUS,
      },
      {
        activeNodeIds: new Set(),
        tableName: TABLE_NAME,
        tableFound: true,
        schemaReady: false,
        localTargetReplicaStateByNodeId: new Map([[
          NODE_ID,
          {
            nonVoterPartitionIds: new Set([PARTITION_ID]),
            replicaRoles: new Set(),
          },
        ]]),
        localPartitionCdcState: {
          applies: true,
          ready: false,
          diagnosticsAvailable: false,
          missingDiagnosticsPartitionIds: [PARTITION_ID],
          noSubscriberPartitionIds: [PARTITION_ID],
          bufferedPartitionIds: [PARTITION_ID],
        },
        replicaOperationDegradationByNodeId: new Map([[
          NODE_ID,
          {
            degradationState: 'move_failed',
            reasons: [{
              code: REPLICA_OPERATION_FAILED,
              detail: OPERATION_DETAIL,
            }],
          },
        ]]),
        leadershipStable: false,
        appliedSchemaVersion: 7,
        replicaOpsInFlight: 1,
      },
    );

    t.equal(readiness.benchmarkReady, false,
      'blocked readiness should keep benchmark admission false');
    t.same(
      readiness.reasons.map((reason) => reason.code),
      [
        ROUTING_NOT_READY,
        SCHEMA_PARTITION_UNAVAILABLE,
        REPLICA_OPERATION_FAILED,
        LEADERSHIP_UNSTABLE,
        LOCAL_REPLICA_NOT_VOTER_READY,
        LOCAL_CDC_DIAGNOSTICS_UNAVAILABLE,
        LOCAL_CDC_SUBSCRIBER_MISSING,
        LOCAL_CDC_BUFFER_NOT_DRAINED,
      ],
      'readiness reasons should preserve the canonical blocked signals',
    );
    t.equal(
      readiness.reasons.find((reason) =>
        reason.code === LOCAL_REPLICA_NOT_VOTER_READY)?.detail,
      PARTITION_ID,
      'local replica readiness should surface the blocked partition id',
    );
  },
);

test(
  'AdminServiceDiscovery routes replica readiness through projection serve lane',
  async (t) => {
    const NODE_ID = 'node-projection-repair-only';
    const ROUTING_NOT_READY = 'routing_not_ready';
    const discovery = new AdminServiceDiscovery({
      nodeId: NODE_ID,
    });
    const projectionReadiness = buildProjectionReadinessContract({
      dimensions: {
        [CONTROL_PLANE_READINESS_DIMENSION.PROCESS_ALIVE]: true,
        [CONTROL_PLANE_READINESS_DIMENSION.CLUSTER_MEMBER_HEALTHY]: false,
        [CONTROL_PLANE_READINESS_DIMENSION.REPAIR_ELIGIBLE]: true,
        [CONTROL_PLANE_READINESS_DIMENSION.CONTROL_PLANE_RECOVERY_ELIGIBLE]:
          true,
        [CONTROL_PLANE_READINESS_DIMENSION.SERVE_ELIGIBLE]: false,
      },
      membershipPublication: {
        publicationEpoch: 41,
        status: CONTROL_PLANE_PUBLICATION_STATUS.ACK_PENDING,
        requiredAckNodeIds: [NODE_ID],
        acknowledgedNodeIds: [],
      },
    });

    const readiness = discovery.buildServiceDiscoveryReplicaReadiness(
      {
        nodeId: NODE_ID,
        healthStatus: 'healthy',
      },
      {
        activeNodeIds: new Set([NODE_ID]),
        projectionReadinessByNodeId: new Map([[NODE_ID, projectionReadiness]]),
        tableName: null,
        tableFound: true,
        schemaReady: true,
        localTargetReplicaStateByNodeId: new Map(),
        localPartitionCdcState: null,
        replicaOperationDegradationByNodeId: new Map(),
        leadershipStable: true,
        appliedSchemaVersion: null,
        replicaOpsInFlight: 0,
      },
    );

    t.equal(
      readiness.routingReady,
      false,
      'repair-only projection readiness must not admit service-discovery routing',
    );
    t.equal(
      readiness.projectionReadiness.activeGate.state,
      PROJECTION_READINESS_ACTIVE_GATE_STATE.REPAIR_READY,
      'admin readiness should preserve the downstream active-gate state',
    );
    t.same(
      readiness.reasons.map((reason) => reason.code),
      [ROUTING_NOT_READY],
      'serve-lane denial should surface through the existing routing reason',
    );
  },
);

test(
  'AdminServiceDiscovery classifies control-plane backpressure repair cause chains',
  async (t) => {
    const warnings = [];
    const discovery = new AdminServiceDiscovery({
      nodeId: 'node-a',
      systemTableCache: {
        getAll() {
          return [];
        },
      },
      cacheMutationTarget: {
        applySystemTableChange() {},
      },
      controlPlaneSystemTableGateway: {
        async executeRead(readIntent) {
          const tableName = String(readIntent?.tableName || '');
          if (tableName === TABLES.SERVICES) {
            return {
              success: false,
              errorCode: 'CONTROL_PLANE_PRESSURE_DEGRADED',
              error: 'control_plane_pressure_degraded',
              retryAfterMs: 500,
            };
          }
          return buildCompleteAuthoritativeReadResult(tableName);
        },
        async reconcileAuthoritativeCacheRows(_tableName, _rows, options) {
          return buildSuccessfulReconcileResult(1, options);
        },
      },
    });
    discovery.logger = {
      warn(message, fields) {
        warnings.push({message, fields});
      },
      info() {},
    };

    await discovery.ensureAuthoritativeDiscoveryCacheRepair({
      reason: 'unit-test-backpressure-cause-chain',
    });

    t.equal(warnings.length, 1, 'failed repair should emit one bounded warning');
    t.same(
      warnings[0]?.fields?.causeChain,
      ['control_plane_backpressure'],
      'warning should classify control-plane backpressure directly',
    );
  },
);

test(
  'AdminServiceDiscovery preserves local query transport gating diagnostics ' +
    'from authoritative read failures',
  async (t) => {
    const warnings = [];
    const discovery = new AdminServiceDiscovery({
      nodeId: 'node-a',
      systemTableCache: {
        getAll() {
          return [];
        },
      },
      cacheMutationTarget: {
        applySystemTableChange() {},
      },
      controlPlaneSystemTableGateway: {
        async executeRead(readIntent) {
          const tableName = String(readIntent?.tableName || '');
          if (tableName === TABLES.SERVICES) {
            return {
              success: false,
              errorCode: 'ROUTER_QUERY_TRANSPORT_NOT_READY',
              error: 'query ingress owner not ready',
              retryAfterMs: 321,
              source: 'query_transport_preflight',
              localQueryTransport: {
                state: 'deferred',
                ready: false,
                reason: 'query ingress owner not ready',
                retryAfterMs: 321,
              },
            };
          }
          return buildCompleteAuthoritativeReadResult(tableName);
        },
        async reconcileAuthoritativeCacheRows(_tableName, _rows, options) {
          return buildSuccessfulReconcileResult(1, options);
        },
      },
    });
    discovery.logger = {
      warn(message, fields) {
        warnings.push({message, fields});
      },
      info() {},
    };

    const repair = await discovery.ensureAuthoritativeDiscoveryCacheRepair({
      reason: 'unit-test-query-transport-gating',
    });

    t.equal(repair.applied, false, 'repair should fail closed on transport gating');
    t.equal(
      repair.readSource,
      'query_transport_preflight',
      'repair result should preserve the bounded authoritative read source',
    );
    t.same(
      repair.localQueryTransport,
      {
        state: 'deferred',
        ready: false,
        reason: 'query ingress owner not ready',
        retryAfterMs: 321,
      },
      'repair result should preserve local query transport gating context',
    );
    t.equal(warnings.length, 1, 'failed repair should emit one bounded warning');
    t.equal(
      warnings[0]?.fields?.readSource,
      'query_transport_preflight',
      'warning should preserve the bounded authoritative read source',
    );
    t.same(
      warnings[0]?.fields?.localQueryTransport,
      {
        state: 'deferred',
        ready: false,
        reason: 'query ingress owner not ready',
        retryAfterMs: 321,
      },
      'warning should preserve local query transport gating context',
    );
  },
);

test('AdminServiceDiscovery marks repair as applied only after all tables are reconciled',
  async (t) => {
    const reconcileCalls = [];
    const discovery = new AdminServiceDiscovery({
      nodeId: 'node-a',
      systemTableCache: {
        getAll() {
          return [];
        },
      },
      cacheMutationTarget: {
        applySystemTableChange() {},
      },
      controlPlaneSystemTableGateway: {
        async executeRead(readIntent) {
          return buildCompleteAuthoritativeReadResult(
            String(readIntent?.tableName || ''),
          );
        },
        async reconcileAuthoritativeCacheRows(tableName, rows, options) {
          reconcileCalls.push({tableName, rows, options});
          return buildSuccessfulReconcileResult(1, options);
        },
      },
    });

    const repair = await discovery.ensureAuthoritativeDiscoveryCacheRepair({
      reason: 'unit-test-full-success',
    });

    t.equal(repair.applied, true,
      'repair should report applied only when all requested tables succeed');
    t.equal(
      repair.tableCount,
      repair.tableNames.length,
      'applied repair should report all reconciled tables',
    );
    t.equal(
      reconcileCalls.length,
      repair.tableNames.length,
      'applied repair should reconcile every requested table',
    );
  });

test(
  'AdminServiceDiscovery stops discovery repair after the first timeout-' +
    'shaped authoritative read failure',
  async (t) => {
    const readCalls = [];
    const discovery = new AdminServiceDiscovery({
      nodeId: 'node-a',
      systemTableCache: {
        getAll() {
          return [];
        },
      },
      cacheMutationTarget: {
        applySystemTableChange() {},
      },
      controlPlaneSystemTableGateway: {
        async executeRead(readIntent) {
          const tableName = String(readIntent?.tableName || '');
          readCalls.push(tableName);
          if (tableName === TABLES.SERVICES) {
            return {
              success: false,
              errorCode: 'QUERY_TIMEOUT',
              error: 'query_timeout',
            };
          }
          return buildCompleteAuthoritativeReadResult(tableName);
        },
        async reconcileAuthoritativeCacheRows(_tableName, _rows, options) {
          return buildSuccessfulReconcileResult(1, options);
        },
      },
    });
    discovery.resolveAuthoritativeDiscoveryRepairTables = () => [
      TABLES.SERVICES,
      TABLES.PARTITIONS,
      TABLES.TABLES,
    ];

    const repair = await discovery.ensureAuthoritativeDiscoveryCacheRepair({
      reason: 'unit-test-timeout-fail-fast',
    });

    t.same(
      readCalls,
      [TABLES.SERVICES],
      'timeout-shaped authoritative failures should stop the repair loop ' +
        'instead of probing every remaining table',
    );
    t.equal(repair.applied, false, 'timeout-shaped repair failures should still fail closed');
    t.same(
      repair.failedTables,
      [TABLES.SERVICES],
      'the first timed out table should remain the only failed table in the bounded repair result',
    );
    t.same(
      repair.causeChain,
      ['query_timeout'],
      'timeout-shaped failures should preserve the explicit timeout classification',
    );
  });

test(
  'AdminServiceDiscovery resolves a late authoritative row owner for forced repair',
  async (t) => {
    const readCalls = [];
    const reconcileCalls = [];
    const lateGateway = {
      async executeRead(readIntent, options = {}) {
        const tableName = String(readIntent?.tableName || '');
        readCalls.push({
          owner: readIntent?.owner,
          tableName,
          queryTimeoutMs: options.queryTimeoutMs,
        });
        return buildCompleteAuthoritativeReadResult(
          tableName,
          tableName === TABLES.NODES ?
            [{
              node_id: TEST_SELECTED_SNAPSHOT_SOURCE_NODE_ID,
              status: 'active',
            }] :
            [],
        );
      },
      async reconcileAuthoritativeCacheRows(tableName, rows, options) {
        reconcileCalls.push({tableName, rows});
        return buildSuccessfulReconcileResult(rows.length, options);
      },
    };
    const sqlQueryEngine = {
      rebalanceCoordinator: {
        controlPlaneSystemTableGateway: null,
      },
    };
    const discovery = new AdminServiceDiscovery({
      nodeId: TEST_SELECTED_SNAPSHOT_SOURCE_NODE_ID,
      sqlQueryEngine,
      systemTableCache: {
        getAll() {
          return [];
        },
      },
      cacheMutationTarget: {
        applySystemTableChange() {},
      },
    });

    sqlQueryEngine.rebalanceCoordinator.controlPlaneSystemTableGateway =
      lateGateway;

    const nodesRead = await discovery.readAuthoritativeSystemTableRows(
      TABLES.NODES,
      {
        reason: TEST_DISCOVERY_SNAPSHOT_REASON,
        queryTimeoutMs: TEST_AUTHORITATIVE_REPAIR_QUERY_TIMEOUT_MS,
      },
    );
    const repair = await discovery.ensureAuthoritativeDiscoveryCacheRepair({
      reason: TEST_DISCOVERY_SNAPSHOT_REASON,
      queryTimeoutMs: TEST_AUTHORITATIVE_REPAIR_QUERY_TIMEOUT_MS,
      triggerCodes: TEST_TRIGGER_CODES,
    });

    t.same(
      nodesRead,
      {
        tableName: TABLES.NODES,
        rows: [{
          node_id: TEST_SELECTED_SNAPSHOT_SOURCE_NODE_ID,
          status: 'active',
        }],
        authoritativeObservation:
          buildCompleteAuthoritativeReadResult(TABLES.NODES)
            .authoritativeObservation,
      },
      'selected source forced repair should obtain nodes rows from the late owner',
    );
    t.equal(
      repair.applied,
      true,
      'forced discovery repair should continue after the late row owner appears',
    );
    t.equal(
      readCalls.every((call) =>
        call.queryTimeoutMs === TEST_AUTHORITATIVE_REPAIR_QUERY_TIMEOUT_MS,
      ),
      true,
      'late-owner forced repair should preserve caller query timeout',
    );
    t.equal(
      reconcileCalls.length,
      repair.tableNames.length,
      'late-owner forced repair should reconcile every requested table',
    );
  },
);

import {test} from '../../src/test-helpers/tap.js';
import {
  CONTROL_PLANE_AUTHORITATIVE_READ_MODE,
  CONTROL_PLANE_CACHE_RECONCILE_INTENT,
  CONTROL_PLANE_PHASE_SCOPE,
  CONTROL_PLANE_READ_STRATEGY,
  CONTROL_PLANE_MUTATION_MERGE_POLICY,
  CONTROL_PLANE_MUTATION_OUTCOME,
  CONTROL_PLANE_MUTATION_OPERATION,
  ControlPlaneSystemTableGateway,
} from '../../src/control-plane/control-plane-system-table-gateway.js';
import {
  CONTROL_PLANE_READINESS_DIMENSION,
  PROJECTION_READINESS_CONTRACT_STATE,
} from '../../src/control-plane/control-plane-readiness-constants.js';
import {
  CDC_OPERATION,
  METRICS_LOG_TAG,
  TABLES,
} from '../../src/constants/index.js';
import {SystemTableCache} from '../../src/cache/system-table-cache.js';
import {
  PressureGovernor,
  PRESSURE_WORK_CLASS,
} from '../../src/control-plane/pressure-governor.js';
import {
  CONTROL_PLANE_WORKLOAD_CLASS,
} from '../../src/control-plane/control-plane-workload-profile.js';
import {registerControlPlaneSystemTableGatewayTailTests} from './control-plane-system-table-gateway-tail-test-cases.js';

const GATEWAY_ROUTING_GAP_OWNER_MISSING = 'owner_missing';
const GATEWAY_ROUTING_IDENTITY_MISSING = 'missing';
const GATEWAY_REPLACE_PENDING_SERVICE_KEY = 'services:svc-1';
const GATEWAY_MUTATION_STATUS_CREATING = 'creating';
const GATEWAY_MUTATION_STATUS_ACTIVE = 'active';
const GATEWAY_EXPECTED_FAILURE_MESSAGE = 'expected queued mutation failure';
const GATEWAY_FAILURE_PRIMARY_REASON =
  'authoritative_row_source_unavailable';
const GATEWAY_FAILURE_DISTRIBUTED_PARTICIPANT_CODE =
  'DISTRIBUTED_PARTICIPANT_FAILURE';
const GATEWAY_FAILURE_RECONNECT_MESSAGE =
  'Connection to node node-2 closed';
const CONTROL_PLANE_PUBLICATION_READ_DELIVERY_SOURCE =
  'control-plane:read:control_plane_publications';
const GATEWAY_DELIVERY_SOURCE_PREFIX_CONTROL_PLANE_WRITE =
  'control-plane:write';
const GATEWAY_DELIVERY_SOURCE_SEPARATOR = ':';
const GATEWAY_NODE_ENDPOINT_ID = 'ep-1';
const GATEWAY_NODE_ENDPOINT_ADDRESS = 'ws://127.0.0.1:8080';
const GATEWAY_NODE_ENDPOINT_WRITE_COALESCING_KEY =
  'gateway:node_endpoints:ep-1';
const GATEWAY_NODE_ENDPOINT_WRITE_DELIVERY_SOURCE = [
  GATEWAY_DELIVERY_SOURCE_PREFIX_CONTROL_PLANE_WRITE,
  TABLES.NODE_ENDPOINTS,
  GATEWAY_NODE_ENDPOINT_WRITE_COALESCING_KEY,
].join(GATEWAY_DELIVERY_SOURCE_SEPARATOR);
const GATEWAY_REPLICA_OPERATION_ID = 'op-gateway-1';
const GATEWAY_REPLICA_OPERATION_WRITE_COALESCING_KEY =
  'replica-operation:op-gateway-1';
const GATEWAY_REPLICA_OPERATION_WRITE_DELIVERY_SOURCE = [
  GATEWAY_DELIVERY_SOURCE_PREFIX_CONTROL_PLANE_WRITE,
  TABLES.REPLICA_OPERATIONS,
  GATEWAY_REPLICA_OPERATION_WRITE_COALESCING_KEY,
].join(GATEWAY_DELIVERY_SOURCE_SEPARATOR);

test('ControlPlaneSystemTableGateway readRows uses authoritative recovery-' +
  'eligible defaults', async (t) => {
  const calls = [];
  const gateway = new ControlPlaneSystemTableGateway({
    nodeId: 'node-gateway',
    cdcIntegrationService: {
      async executeAuthoritativeSystemTableRead(
        tableName,
        sql,
        params,
        options,
      ) {
        calls.push({tableName, sql, params, options});
        return {
          success: true,
          rows: [{node_id: 'node-a'}],
        };
      },
    },
    sqlQueryEngine: {
      async executeQuery() {
        throw new Error('should not fall back to raw SQL');
      },
    },
  });

  const result = await gateway.readRows(
    TABLES.NODES,
    'SELECT * FROM nodes WHERE node_id = ?',
    ['node-a'],
  );

  t.equal(result.success, true, 'authoritative read should succeed');
  t.equal(calls.length, 1, 'authoritative path should be used once');
  t.equal(
    calls[0].options.localReadConsistency,
    'local_leader',
    'gateway should prefer local authoritative reads',
  );
  t.equal(
    calls[0].options.replicaFallbackConsistency,
    'any_replica',
    'gateway should keep bounded replica fallback',
  );
  t.equal(
    calls[0].options.queryOptions.routingReadinessDimension,
    CONTROL_PLANE_READINESS_DIMENSION.CONTROL_PLANE_RECOVERY_ELIGIBLE,
    'gateway should route internal reads through control-plane recovery',
  );
});

test('ControlPlaneSystemTableGateway readAuthoritativeRows forwards strict ' +
  'owner-RPC publication read policy options',
async (t) => {
  const calls = [];
  const gateway = new ControlPlaneSystemTableGateway({
    nodeId: 'node-gateway',
    cdcIntegrationService: {
      async executeAuthoritativeSystemTableRead(
        tableName,
        sql,
        params,
        options,
      ) {
        calls.push({tableName, sql, params, options});
        return {
          success: true,
          rows: [{
            publication_id: 'pub-1',
            publication_kind: 'cluster_membership',
            publication_epoch: 1,
            status: 'PUBLISHED',
          }],
        };
      },
    },
  });

  const result = await gateway.readAuthoritativeRows(
    TABLES.CONTROL_PLANE_PUBLICATIONS,
    'SELECT * FROM control_plane_publications',
    [],
    {
      localReadConsistency: 'local_leader',
      replicaFallbackConsistency: 'local_leader',
      authoritativeReadMode:
        CONTROL_PLANE_AUTHORITATIVE_READ_MODE.OWNER_RPC_REQUIRED,
    },
  );

  t.equal(result.success, true, 'authoritative read should succeed');
  t.equal(calls.length, 1, 'gateway should execute one authoritative read');
  t.equal(
    calls[0]?.options?.authoritativeReadMode,
    CONTROL_PLANE_AUTHORITATIVE_READ_MODE.OWNER_RPC_REQUIRED,
    'gateway should pass the canonical authoritative read mode through to authoritative reads',
  );
  t.equal(
    calls[0]?.options?.localReadConsistency,
    'local_leader',
    'gateway should preserve explicit local-read consistency',
  );
  t.equal(
    calls[0]?.options?.replicaFallbackConsistency,
    'local_leader',
    'gateway should preserve explicit replica-fallback consistency',
  );
  t.equal(
    calls[0]?.options?.queryOptions?.deliverySource,
    CONTROL_PLANE_PUBLICATION_READ_DELIVERY_SOURCE,
    'gateway should stamp one canonical delivery source for priority publication reads',
  );
});

test('ControlPlaneSystemTableGateway readRows returns a typed failure when ' +
  'authoritative reads fail', async (t) => {
  const gateway = new ControlPlaneSystemTableGateway({
    nodeId: 'node-gateway',
    cdcIntegrationService: {
      async executeAuthoritativeSystemTableRead() {
        return {
          success: false,
          error: 'authoritative read unavailable',
          rows: [],
        };
      },
    },
    sqlQueryEngine: {
      async executeQuery() {
        throw new Error('gateway should not reconstruct with SQL fallback');
      },
    },
  });

  const result = await gateway.readRows(
    TABLES.SERVICES,
    'SELECT * FROM services WHERE service_id = ?',
    ['svc-1'],
  );

  t.equal(result.success, false, 'gateway should fail closed');
  t.equal(
    result.outcome,
    'owner_not_ready',
    'gateway should return a typed owner result instead of falling back',
  );
});

test('ControlPlaneSystemTableGateway records enriched read operation ' +
  'diagnostics', async (t) => {
  const gateway = new ControlPlaneSystemTableGateway({
    nodeId: 'node-gateway',
    cdcIntegrationService: {
      async executeAuthoritativeSystemTableRead() {
        return {
          success: true,
          rows: [{node_id: 'node-a'}],
          source: 'local_partition_replica',
          localReadHit: true,
          localReplicaFallbackHit: true,
          queryTimeoutMs: 987,
          systemTableDiagnostics: {
            partitionId: 'nodes-p1',
            leaderNodeId: 'node-a',
            serviceRowCount: 3,
            routableServiceCount: 2,
            routedToNode: null,
            deniedByReadiness: false,
          },
        };
      },
    },
  });

  await gateway.readRows(
    TABLES.NODES,
    'SELECT * FROM nodes WHERE node_id = ?',
    ['node-a'],
    {queryTimeoutMs: 987},
  );
  const entries = gateway.getControlPlaneOperationLedgerEntries();
  const latestEntry = entries[entries.length - 1] || null;

  t.match(latestEntry, {
    operationClass: 'read',
    tableName: TABLES.NODES,
    localReadHit: true,
    localReplicaFallbackHit: true,
    partitionId: 'nodes-p1',
    leaderNodeId: 'node-a',
    serviceRowCount: 3,
    routableServiceCount: 2,
    queryTimeoutMs: 987,
  });
});

test('ControlPlaneSystemTableGateway executeRead honors explicit routed ' +
  'authoritative read opt-in', async (t) => {
  const calls = [];
  const gateway = new ControlPlaneSystemTableGateway({
    nodeId: 'node-gateway',
    cdcIntegrationService: {
      async executeAuthoritativeSystemTableRead(
        tableName,
        sql,
        params,
        options,
      ) {
        calls.push({tableName, sql, params, options});
        return {
          success: true,
          rows: [{node_id: 'node-a'}],
        };
      },
    },
  });

  const result = await gateway.executeRead({
    owner: 'admin-service-discovery',
    tableName: TABLES.NODES,
    sql: 'SELECT * FROM nodes',
    params: [],
    strategy: 'authoritative_required',
  }, {
    allowSqlFallback: true,
  });

  t.equal(result.success, true, 'authoritative read should still succeed');
  t.equal(calls.length, 1, 'gateway should execute one authoritative read');
  t.equal(
    calls[0].options.allowSqlFallback,
    true,
    'gateway should pass explicit routed-authoritative opt-in to the owner',
  );
});

test('ControlPlaneSystemTableGateway executeRead lets workload classes own ' +
  'fairness defaults even when the read profile is repair_required',
async (t) => {
  let evaluateArgs = null;
  const gateway = new ControlPlaneSystemTableGateway({
    nodeId: 'node-gateway',
    pressureGovernor: {
      configure() {},
      evaluate(args) {
        evaluateArgs = args;
        return {
          action: 'allow',
          reason: 'test-allow',
          summary: null,
          retryAfterMs: 0,
        };
      },
    },
    cdcIntegrationService: {
      async executeAuthoritativeSystemTableRead() {
        return {
          success: true,
          rows: [{node_id: 'node-a'}],
        };
      },
    },
  });

  const result = await gateway.executeRead({
    owner: 'admin-service-discovery',
    tableName: TABLES.NODES,
    sql: 'SELECT * FROM nodes',
    params: [],
    strategy: CONTROL_PLANE_READ_STRATEGY.AUTHORITATIVE_REQUIRED,
  }, {
    readProfile: 'repair_required',
    workloadClass: CONTROL_PLANE_WORKLOAD_CLASS.ADMIN_DIAGNOSTIC_READ,
  });

  t.equal(result.success, true, 'authoritative read should succeed');
  t.equal(
    evaluateArgs?.workClass,
    PRESSURE_WORK_CLASS.BACKGROUND,
    'gateway should derive read pressure work class from the shared workload contract',
  );
  t.equal(
    evaluateArgs?.allowDegrade,
    true,
    'gateway should preserve workload-owned degrade semantics instead of forcing repair-profile defaults',
  );
  t.equal(
    evaluateArgs?.allowDefer,
    true,
    'gateway should preserve workload-owned defer semantics instead of forcing repair-profile defaults',
  );
  t.ok(
    evaluateArgs?.resourceKeys?.includes('control-plane:admin:diagnostics'),
    'gateway should forward workload-owned fairness resource keys to the pressure governor',
  );
});

test('ControlPlaneSystemTableGateway reconcileAuthoritativeCacheRows skips ' +
  'blank primary keys for control_plane_publications', async (t) => {
  const systemTableCache = new SystemTableCache();
  const gateway = new ControlPlaneSystemTableGateway({
    nodeId: 'node-gateway',
    systemTableCache,
  });

  const result = await gateway.reconcileAuthoritativeCacheRows(
    TABLES.CONTROL_PLANE_PUBLICATIONS,
    [
      {
        publication_id: '',
        publication_kind: 'cluster_membership',
        status: 'OPEN',
      },
      {
        publication_id: 'publication-1',
        publication_kind: 'cluster_membership',
        status: 'PUBLISHED',
        published_active_node_ids: ['node-a'],
        updated_at: 55,
      },
    ],
    {
      cacheMutationTarget: systemTableCache,
      systemTableCache,
    },
  );

  t.equal(result.success, true, 'reconciliation should still succeed');
  t.equal(result.mutationCount, 1, 'only valid keyed rows should be applied');
  t.same(
    systemTableCache.getAll(TABLES.CONTROL_PLANE_PUBLICATIONS),
    [{
      publication_id: 'publication-1',
      publication_kind: 'cluster_membership',
      publication_epoch: 1,
      publisher_node_id: '',
      source_topology_epoch: null,
      source_snapshot_version: null,
      status: 'PUBLISHED',
      published_active_node_ids: ['node-a'],
      required_ack_node_ids: [],
      acknowledged_node_ids: [],
      priority_partition_summary: null,
      membership_lifecycle_summary: null,
      reason_code: '',
      created_at: null,
      updated_at: 55,
      published_at: null,
      closed_at: null,
      transition_history: [],
    }],
    'blank-key publication rows should be skipped before cache upsert',
  );
});

test('ControlPlaneSystemTableGateway reconcileAuthoritativeCacheRows ' +
  'canonicalizes control_plane_publications before cache upsert',
async (t) => {
  const systemTableCache = new SystemTableCache();
  const gateway = new ControlPlaneSystemTableGateway({
    nodeId: 'node-gateway',
    systemTableCache,
  });

  const result = await gateway.reconcileAuthoritativeCacheRows(
    TABLES.CONTROL_PLANE_PUBLICATIONS,
    [{
      publicationId: 'publication-2',
      publicationKind: 'cluster_membership',
      publicationEpoch: 7,
      publisherNodeId: 'node-a',
      publishedActiveNodeIds: ['node-b', 'node-a'],
      requiredAckNodeIds: ['node-a'],
      acknowledgedNodeIds: ['node-a'],
      status: 'published',
      updatedAt: 123,
    }],
    {
      cacheMutationTarget: systemTableCache,
      systemTableCache,
    },
  );

  t.equal(result.success, true, 'reconciliation should succeed');
  t.equal(result.mutationCount, 1, 'canonical publication row should be applied');
  t.same(
    systemTableCache.getAll(TABLES.CONTROL_PLANE_PUBLICATIONS),
    [{
      publication_id: 'publication-2',
      publication_kind: 'cluster_membership',
      publication_epoch: 7,
      publisher_node_id: 'node-a',
      source_topology_epoch: null,
      source_snapshot_version: null,
      published_active_node_ids: ['node-b', 'node-a'],
      required_ack_node_ids: ['node-a'],
      acknowledged_node_ids: ['node-a'],
      priority_partition_summary: null,
      membership_lifecycle_summary: null,
      status: 'PUBLISHED',
      reason_code: '',
      created_at: null,
      updated_at: 123,
      published_at: null,
      closed_at: null,
      transition_history: [],
    }],
    'publication rows should be serialized into the persisted cache shape',
  );
});

test('ControlPlaneSystemTableGateway reconcileAuthoritativeCacheRows ' +
  'preserves missing cached rows during refresh-evidence reconciliation',
async (t) => {
  const systemTableCache = new SystemTableCache();
  const cachedServiceRow = {
    service_id: 'svc-preserve',
    node_id: 'node-a',
    service_type: 'partition',
    status: 'active',
    address: 'node-a/partition/svc-preserve',
  };
  systemTableCache.applySystemTableChange(
    TABLES.SERVICES,
    CDC_OPERATION.UPSERT,
    cachedServiceRow,
  );
  const gateway = new ControlPlaneSystemTableGateway({
    nodeId: 'node-gateway',
    systemTableCache,
  });

  const result = await gateway.reconcileAuthoritativeCacheRows(
    TABLES.SERVICES,
    [],
    {
      cacheMutationTarget: systemTableCache,
      reconcileIntent: CONTROL_PLANE_CACHE_RECONCILE_INTENT
        .REFRESH_EVIDENCE,
      systemTableCache,
    },
  );

  t.equal(result.success, true, 'refresh reconciliation should succeed');
  t.equal(
    result.reconcileIntent,
    CONTROL_PLANE_CACHE_RECONCILE_INTENT.REFRESH_EVIDENCE,
    'gateway should record the refresh-evidence reconcile intent',
  );
  t.equal(
    result.mutationCount,
    0,
    'refresh reconciliation should not mutate cache rows when the read is empty',
  );
  t.same(
    systemTableCache.getAll(TABLES.SERVICES),
    [cachedServiceRow],
    'refresh reconciliation should preserve cached service evidence on empty reads',
  );
});

test('ControlPlaneSystemTableGateway reconcileAuthoritativeCacheRows skips ' +
  'unchanged service rows by default',
async (t) => {
  const systemTableCache = new SystemTableCache();
  const cachedServiceRow = {
    service_id: 'svc-stable',
    node_id: 'node-a',
    service_type: 'partition',
    partition_id: 'nodes-p1',
    replica_id: 'nodes-p1-r1',
    raft_role: 'leader',
    status: 'active',
    address: 'node-a/partition/nodes-p1-r1',
  };
  systemTableCache.applySystemTableChange(
    TABLES.SERVICES,
    CDC_OPERATION.UPSERT,
    cachedServiceRow,
  );
  const gateway = new ControlPlaneSystemTableGateway({
    nodeId: 'node-gateway',
    systemTableCache,
  });

  const result = await gateway.reconcileAuthoritativeCacheRows(
    TABLES.SERVICES,
    [{
      address: 'node-a/partition/nodes-p1-r1',
      node_id: 'node-a',
      partition_id: 'nodes-p1',
      raft_role: 'leader',
      replica_id: 'nodes-p1-r1',
      service_id: 'svc-stable',
      service_type: 'partition',
      status: 'active',
    }],
    {
      cacheMutationTarget: systemTableCache,
      systemTableCache,
    },
  );

  t.equal(result.success, true, 'reconciliation should still succeed');
  t.equal(
    result.mutationCount,
    0,
    'unchanged authoritative service rows should reconcile as a no-op',
  );
  t.same(
    systemTableCache.getAll(TABLES.SERVICES),
    [cachedServiceRow],
    'no-op reconciliation should preserve the cached row without rewriting it',
  );
});

test('ControlPlaneSystemTableGateway reconcileAuthoritativeCacheRows skips ' +
  'canonical-equivalent publication rows by default',
async (t) => {
  const systemTableCache = new SystemTableCache();
  const cachedPublicationRow = {
    publication_id: 'publication-stable',
    publication_kind: 'cluster_membership',
    publication_epoch: 7,
    publisher_node_id: 'node-a',
    source_topology_epoch: null,
    source_snapshot_version: null,
    status: 'PUBLISHED',
    reason_code: '',
    published_active_node_ids: ['node-a', 'node-b'],
    required_ack_node_ids: ['node-a'],
    acknowledged_node_ids: ['node-a'],
    priority_partition_summary: null,
    membership_lifecycle_summary: null,
    created_at: null,
    updated_at: 123,
    published_at: null,
    closed_at: null,
    transition_history: [],
  };
  systemTableCache.applySystemTableChange(
    TABLES.CONTROL_PLANE_PUBLICATIONS,
    CDC_OPERATION.UPSERT,
    cachedPublicationRow,
  );
  const gateway = new ControlPlaneSystemTableGateway({
    nodeId: 'node-gateway',
    systemTableCache,
  });

  const result = await gateway.reconcileAuthoritativeCacheRows(
    TABLES.CONTROL_PLANE_PUBLICATIONS,
    [{
      publicationId: 'publication-stable',
      publicationKind: 'cluster_membership',
      publicationEpoch: 7,
      publisherNodeId: 'node-a',
      status: 'published',
      reasonCode: '',
      publishedActiveNodeIds: ['node-a', 'node-b'],
      requiredAckNodeIds: ['node-a'],
      acknowledgedNodeIds: ['node-a'],
      priorityPartitionSummary: null,
      membershipLifecycleSummary: null,
      updatedAt: 123,
      transitionHistory: [],
    }],
    {
      cacheMutationTarget: systemTableCache,
      systemTableCache,
    },
  );

  t.equal(result.success, true, 'reconciliation should still succeed');
  t.equal(
    result.mutationCount,
    0,
    'canonical-equivalent publication rows should reconcile as a no-op',
  );
  t.same(
    systemTableCache.getAll(TABLES.CONTROL_PLANE_PUBLICATIONS),
    [cachedPublicationRow],
    'no-op publication reconciliation should preserve the cached row',
  );
});

test('ControlPlaneSystemTableGateway readAuthoritativeRows bypasses legacy ' +
  'strategy inference', async (t) => {
  const calls = [];
  const gateway = new ControlPlaneSystemTableGateway({
    nodeId: 'node-gateway',
    cdcIntegrationService: {
      async executeAuthoritativeSystemTableRead(
        tableName,
        sql,
        params,
        options,
      ) {
        calls.push({tableName, sql, params, options});
        return {
          success: true,
          rows: [{node_id: 'node-a'}],
        };
      },
    },
  });

  const result = await gateway.readAuthoritativeRows(
    TABLES.NODES,
    'SELECT * FROM nodes WHERE node_id = ?',
    ['node-a'],
    {
      requireAuthoritative: true,
      allowSqlFallback: true,
    },
  );

  t.equal(result.success, true, 'authoritative helper should succeed');
  t.equal(calls.length, 1, 'authoritative helper should route one owner read');
  t.equal(
    calls[0].options.allowSqlFallback,
    true,
    'authoritative helper should preserve authoritative read options',
  );
});

test('ControlPlaneSystemTableGateway readProjectionRows routes cache reads ' +
  'explicitly', async (t) => {
  const gateway = new ControlPlaneSystemTableGateway({
    nodeId: 'node-gateway',
    systemTableCache: {
      getAll(tableName) {
        if (tableName !== TABLES.NODES) {
          return [];
        }
        return [{node_id: 'node-a'}];
      },
    },
  });

  const result = await gateway.readProjectionRows(TABLES.NODES);

  t.equal(result.success, true, 'projection helper should succeed');
  t.equal(result.outcome, 'cache_hit', 'projection helper should use cache');
  t.same(result.rows, [{node_id: 'node-a'}],
    'projection helper should return cached rows');
});

test('ControlPlaneSystemTableGateway records enriched mutation routing ' +
  'diagnostics', async (t) => {
  const gateway = new ControlPlaneSystemTableGateway({
    nodeId: 'node-gateway',
    cdcIntegrationService: {
      async insertSystemTableRow() {
        return {
          success: true,
          affectedRows: 1,
          systemTableDiagnostics: {
            partitionId: 'services-p1',
            leaderNodeId: 'seed-node',
            serviceRowCount: 2,
            routableServiceCount: 1,
            routedToNode: 'seed-node',
            deniedByReadiness: false,
          },
        };
      },
    },
  });

  await gateway.insertSystemTableRow(TABLES.SERVICES, {
    service_id: 'svc-1',
    service_type: 'message_group',
    node_id: 'seed-node',
    status: 'active',
  }, {
    queryTimeoutMs: 4321,
  });
  const entries = gateway.getControlPlaneOperationLedgerEntries();
  const latestEntry = entries[entries.length - 1] || null;

  t.match(latestEntry, {
    operationClass: 'mutation',
    tableName: TABLES.SERVICES,
    partitionId: 'services-p1',
    leaderNodeId: 'seed-node',
    routedToNode: 'seed-node',
    serviceRowCount: 2,
    routableServiceCount: 1,
    queryTimeoutMs: 4321,
  });
  t.equal(latestEntry.localReadHit, false, 'mutations should not log local reads');
});

test('ControlPlaneSystemTableGateway executeRead routes owner-local reads ' +
  'through the authoritative local-read owner first', async (t) => {
  const authoritativeCalls = [];
  let sqlQueryCalls = 0;
  const gateway = new ControlPlaneSystemTableGateway({
    nodeId: 'node-gateway',
    cdcIntegrationService: {
      async executeAuthoritativeSystemTableRead(
        tableName,
        sql,
        params,
        options,
      ) {
        authoritativeCalls.push({tableName, sql, params, options});
        return {
          success: true,
          rows: [{operation_id: 'op-1'}],
          source: 'local_partition_replica',
        };
      },
    },
    sqlQueryEngine: {
      async executeQuery() {
        sqlQueryCalls += 1;
        return {
          success: true,
          rows: [{operation_id: 'op-sql'}],
        };
      },
    },
  });

  const result = await gateway.executeRead({
    owner: 'replica-operation-repository',
    tableName: TABLES.REPLICA_OPERATIONS,
    sql: 'SELECT * FROM replica_operations WHERE 1 = 0',
    params: [],
    strategy: CONTROL_PLANE_READ_STRATEGY.OWNER_LOCAL_NON_PROPAGATED,
  });

  t.equal(result.success, true, 'owner-local authoritative read should succeed');
  t.equal(
    result.outcome,
    'owner_local_non_propagated',
    'gateway should preserve the owner-local outcome',
  );
  t.equal(
    authoritativeCalls.length,
    1,
    'gateway should use the authoritative local-read owner once',
  );
  t.equal(
    sqlQueryCalls,
    0,
    'gateway should not reconstruct owner-local reads through the query engine',
  );
  t.equal(
    authoritativeCalls[0].options.allowSqlFallback,
    false,
    'owner-local reads should not re-enable routed SQL fallback',
  );
  t.equal(
    authoritativeCalls[0].options.localReadConsistency,
    'local_leader',
    'owner-local reads should prefer the local leader replica',
  );
  t.equal(
    authoritativeCalls[0].options.replicaFallbackConsistency,
    'any_replica',
    'owner-local reads should keep bounded local replica fallback',
  );
  t.equal(
    authoritativeCalls[0].options.queryOptions.routingReadinessDimension,
    CONTROL_PLANE_READINESS_DIMENSION.CONTROL_PLANE_RECOVERY_ELIGIBLE,
    'owner-local reads should preserve control-plane recovery routing diagnostics',
  );
});

test('ControlPlaneSystemTableGateway owner-local reads fail closed when the ' +
  'authoritative local-read owner cannot satisfy them', async (t) => {
  let sqlQueryCalls = 0;
  const gateway = new ControlPlaneSystemTableGateway({
    nodeId: 'node-gateway',
    cdcIntegrationService: {
      async executeAuthoritativeSystemTableRead() {
        return {
          success: false,
          error: 'query_data_plane_transport_not_ready',
          errorCode: 'ROUTER_QUERY_TRANSPORT_NOT_READY',
          retryAfterMs: 250,
          rows: [],
          source: 'query_transport_preflight',
        };
      },
    },
    sqlQueryEngine: {
      async executeQuery() {
        sqlQueryCalls += 1;
        return {
          success: true,
          rows: [{operation_id: 'op-sql'}],
        };
      },
    },
  });

  const result = await gateway.executeRead({
    owner: 'replica-operation-repository',
    tableName: TABLES.REPLICA_OPERATIONS,
    sql: 'SELECT * FROM replica_operations WHERE 1 = 0',
    params: [],
    strategy: CONTROL_PLANE_READ_STRATEGY.OWNER_LOCAL_NON_PROPAGATED,
  });

  t.equal(result.success, false, 'owner-local read should fail closed');
  t.equal(
    result.outcome,
    'owner_not_ready',
    'gateway should preserve a typed owner-not-ready outcome',
  );
  t.equal(
    result.errorCode,
    'ROUTER_QUERY_TRANSPORT_NOT_READY',
    'gateway should preserve the authoritative local-read error code',
  );
  t.equal(sqlQueryCalls, 0,
    'gateway should not silently route through the query engine');
});

test('ControlPlaneSystemTableGateway owner-local reads honor explicit routed ' +
  'authoritative fallback opt-in', async (t) => {
  const authoritativeCalls = [];
  const gateway = new ControlPlaneSystemTableGateway({
    nodeId: 'node-gateway',
    cdcIntegrationService: {
      async executeAuthoritativeSystemTableRead(
        tableName,
        sql,
        params,
        options,
      ) {
        authoritativeCalls.push({tableName, sql, params, options});
        if (options.allowSqlFallback !== true) {
          return {
            success: false,
            error: 'authoritative_row_source_unavailable',
            rows: [],
          };
        }
        return {
          success: true,
          rows: [{operation_id: 'op-sql'}],
          source: 'sql_query_engine',
        };
      },
    },
    sqlQueryEngine: {
      async executeQuery() {
        throw new Error(
          'gateway should keep routed authoritative fallback inside the CDC owner path',
        );
      },
    },
  });

  const result = await gateway.executeRead({
    owner: 'replica-operation-repository',
    tableName: TABLES.REPLICA_OPERATIONS,
    sql: 'SELECT * FROM replica_operations WHERE 1 = 0',
    params: [],
    strategy: CONTROL_PLANE_READ_STRATEGY.OWNER_LOCAL_NON_PROPAGATED,
  }, {
    allowSqlFallback: true,
  });

  t.equal(result.success, true, 'owner-local read should succeed via routed authoritative fallback');
  t.equal(
    result.rows[0]?.operation_id,
    'op-sql',
    'gateway should surface the routed authoritative result',
  );
  t.equal(
    authoritativeCalls[0]?.options?.allowSqlFallback,
    true,
    'owner-local reads should pass the explicit routed-authoritative opt-in to the owner',
  );
});

test('ControlPlaneSystemTableGateway emits read telemetry with owner and ' +
  'strategy details', async (t) => {
  const metricEvents = [];
  let currentTimeMs = 1000;
  const gateway = new ControlPlaneSystemTableGateway({
    nodeId: 'node-gateway',
    now: () => currentTimeMs,
    logger: {
      info(tag, data) {
        metricEvents.push({tag, data});
      },
    },
    cdcIntegrationService: {
      async executeAuthoritativeSystemTableRead() {
        currentTimeMs += 12;
        return {
          success: true,
          rows: [{node_id: 'node-a'}],
        };
      },
    },
  });

  await gateway.executeRead({
    owner: 'nodes-owner',
    tableName: TABLES.NODES,
    sql: 'SELECT * FROM nodes WHERE node_id = ?',
    params: ['node-a'],
    strategy: 'authoritative',
  }, {
    workClass: PRESSURE_WORK_CLASS.INTERACTIVE,
    coalescingKey: 'nodes:node-a',
  });

  const readMetric = metricEvents.find((entry) => {
    return entry.tag === METRICS_LOG_TAG.CONTROL_PLANE_GATEWAY_READ;
  }) || null;

  t.ok(readMetric, 'read telemetry should emit one metric');
  t.equal(
    readMetric?.tag,
    METRICS_LOG_TAG.CONTROL_PLANE_GATEWAY_READ,
    'read telemetry should use the gateway read tag',
  );
  t.equal(readMetric?.data.owner, 'nodes-owner', 'owner should be included');
  t.equal(readMetric?.data.tableName, TABLES.NODES, 'table should be included');
  t.equal(readMetric?.data.outcome, 'authoritative', 'outcome should be included');
  t.equal(readMetric?.data.strategy, 'authoritative', 'strategy should be included');
  t.equal(
    readMetric?.data.workClass,
    PRESSURE_WORK_CLASS.INTERACTIVE,
    'work class should be included',
  );
  t.equal(
    readMetric?.data.coalescingKey,
    'nodes:node-a',
    'coalescing key should be included',
  );
  t.equal(readMetric?.data.latencyMs, 12, 'latency should be measured');
  t.equal(readMetric?.data.rowCount, 1, 'row count should be included');
  t.equal(
    gateway.getStats().metrics.readOutcomeCounts.authoritative,
    1,
    'read outcome counters should be tracked',
  );
  t.equal(
    gateway.getStats().metrics.maxObservedReadLatencyMs,
    12,
    'read latency metric should be tracked',
  );
});

test('ControlPlaneSystemTableGateway updateSystemTableRow routes writes ' +
  'through repairEligible', async (t) => {
  const updateCalls = [];
  const gateway = new ControlPlaneSystemTableGateway({
    nodeId: 'node-gateway',
    cdcIntegrationService: {
      async updateSystemTableRow(tableName, whereClause, data, options) {
        updateCalls.push({tableName, whereClause, data, options});
        return {success: true};
      },
    },
  });

  await gateway.updateSystemTableRow(
    TABLES.NODE_ENDPOINTS,
    {endpoint_id: GATEWAY_NODE_ENDPOINT_ID},
    {address: GATEWAY_NODE_ENDPOINT_ADDRESS},
    {coalescingKey: GATEWAY_NODE_ENDPOINT_WRITE_COALESCING_KEY},
  );

  t.equal(updateCalls.length, 1, 'write should be delegated once');
  t.equal(
    updateCalls[0].options.routingReadinessDimension,
    CONTROL_PLANE_READINESS_DIMENSION.CONTROL_PLANE_RECOVERY_ELIGIBLE,
    'control-plane writes should use control-plane recovery routing',
  );
  t.equal(
    updateCalls[0].options.deliverySource,
    GATEWAY_NODE_ENDPOINT_WRITE_DELIVERY_SOURCE,
    'coalesced control-plane writes should own a distinct delivery source',
  );
});

test('ControlPlaneSystemTableGateway updateSystemTableRow scopes ' +
  'replica_operations writes by row identity', async (t) => {
  const updateCalls = [];
  const gateway = new ControlPlaneSystemTableGateway({
    nodeId: 'node-gateway',
    cdcIntegrationService: {
      async updateSystemTableRow(tableName, whereClause, data, options) {
        updateCalls.push({tableName, whereClause, data, options});
        return {success: true};
      },
    },
  });

  await gateway.updateSystemTableRow(
    TABLES.REPLICA_OPERATIONS,
    {operation_id: GATEWAY_REPLICA_OPERATION_ID},
    {status: GATEWAY_MUTATION_STATUS_ACTIVE},
  );

  t.equal(updateCalls.length, 1, 'write should be delegated once');
  t.equal(
    updateCalls[0].options.coalescingKey,
    GATEWAY_REPLICA_OPERATION_WRITE_COALESCING_KEY,
    'replica operation gateway writes should coalesce by operation id',
  );
  t.equal(
    updateCalls[0].options.deliverySource,
    GATEWAY_REPLICA_OPERATION_WRITE_DELIVERY_SOURCE,
    'replica operation gateway writes should use an operation-scoped delivery source',
  );
});

test('ControlPlaneSystemTableGateway emits mutation telemetry with owner and ' +
  'coalescing details', async (t) => {
  const metricEvents = [];
  let currentTimeMs = 2000;
  const gateway = new ControlPlaneSystemTableGateway({
    nodeId: 'node-gateway',
    now: () => currentTimeMs,
    logger: {
      info(tag, data) {
        metricEvents.push({tag, data});
      },
    },
    cdcIntegrationService: {
      async updateSystemTableRow() {
        currentTimeMs += 7;
        return {success: true};
      },
    },
  });

  await gateway.submitMutation({
    owner: 'services-owner',
    operation: CONTROL_PLANE_MUTATION_OPERATION.UPDATE,
    tableName: TABLES.SERVICES,
    whereClause: {service_id: 'svc-1'},
    data: {status: 'active'},
  }, {
    workClass: PRESSURE_WORK_CLASS.BACKGROUND,
    coalescingKey: 'services:svc-1',
    mergePolicy: CONTROL_PLANE_MUTATION_MERGE_POLICY.SINGLE_FLIGHT,
  });

  const mutationMetric = metricEvents.find((entry) => {
    return entry.tag === METRICS_LOG_TAG.CONTROL_PLANE_GATEWAY_MUTATION;
  }) || null;

  t.ok(mutationMetric, 'mutation telemetry should emit one metric');
  t.equal(
    mutationMetric?.tag,
    METRICS_LOG_TAG.CONTROL_PLANE_GATEWAY_MUTATION,
    'mutation telemetry should use the gateway mutation tag',
  );
  t.equal(mutationMetric?.data.owner, 'services-owner', 'owner should be included');
  t.equal(mutationMetric?.data.tableName, TABLES.SERVICES, 'table should be included');
  t.equal(
    mutationMetric?.data.operation,
    CONTROL_PLANE_MUTATION_OPERATION.UPDATE,
    'operation should be included',
  );
  t.equal(
    mutationMetric?.data.outcome,
    CONTROL_PLANE_MUTATION_OUTCOME.APPLIED,
    'outcome should be included',
  );
  t.equal(
    mutationMetric?.data.workClass,
    PRESSURE_WORK_CLASS.BACKGROUND,
    'work class should be included',
  );
  t.equal(
    mutationMetric?.data.coalescingKey,
    'services:svc-1',
    'coalescing key should be included',
  );
  t.equal(
    mutationMetric?.data.mergePolicy,
    CONTROL_PLANE_MUTATION_MERGE_POLICY.SINGLE_FLIGHT,
    'merge policy should be included',
  );
  t.equal(mutationMetric?.data.latencyMs, 7, 'latency should be measured');
  t.equal(
    gateway.getStats().metrics.mutationOutcomeCounts.applied,
    1,
    'mutation outcome counters should be tracked',
  );
  t.equal(
    gateway.getStats().metrics.maxObservedMutationLatencyMs,
    7,
    'mutation latency metric should be tracked',
  );
});

test('ControlPlaneSystemTableGateway classifies mutation failures and includes ' +
  'transport pressure diagnostics', async (t) => {
  const metricEvents = [];
  const gateway = new ControlPlaneSystemTableGateway({
    nodeId: 'node-gateway',
    logger: {
      info(tag, data) {
        metricEvents.push({tag, data});
      },
    },
    messageRouter: {
      getOutboundPressureSummary() {
        return {
          backpressured: false,
          saturatedNodeCount: 0,
          totalPending: 0,
          maxPendingUtilization: 0,
          pendingNodeConnectionCount: 2,
          reconnectBeforeDeliveryFailureCount: 4,
          maxObservedPendingNodeConnectionCount: 3,
        };
      },
    },
    cdcIntegrationService: {
      async updateSystemTableRow() {
        return {
          success: false,
          error: 'Distributed operation failed due to participant failures',
          errorCode: GATEWAY_FAILURE_DISTRIBUTED_PARTICIPANT_CODE,
          participantFailures: [{
            error: GATEWAY_FAILURE_PRIMARY_REASON,
          }, {
            error: GATEWAY_FAILURE_RECONNECT_MESSAGE,
          }],
        };
      },
    },
  });

  const result = await gateway.submitMutation({
    owner: 'services-owner',
    operation: CONTROL_PLANE_MUTATION_OPERATION.UPDATE,
    tableName: TABLES.SERVICES,
    whereClause: {service_id: 'svc-1'},
    data: {status: 'active'},
  }, {
    workClass: PRESSURE_WORK_CLASS.BACKGROUND,
  });

  t.equal(result.success, false, 'the mutation should fail closed');
  const mutationMetric = metricEvents.find((entry) =>
    entry.tag === METRICS_LOG_TAG.CONTROL_PLANE_GATEWAY_MUTATION,
  ) || null;
  t.equal(
    mutationMetric?.data?.canonicalFailureReason,
    GATEWAY_FAILURE_PRIMARY_REASON,
    'telemetry should expose the canonical blocker',
  );
  t.equal(
    mutationMetric?.data?.authoritativeRowSourceUnavailableCount,
    1,
    'telemetry should count authoritative-source failures',
  );
  t.equal(
    mutationMetric?.data?.distributedParticipantFailureCount,
    1,
    'telemetry should count distributed participant failures',
  );
  t.equal(
    mutationMetric?.data?.reconnectDeliveryFailureCount,
    1,
    'telemetry should count reconnect-related delivery failures',
  );
  t.equal(
    mutationMetric?.data?.transportReconnectBeforeDeliveryFailureCount,
    4,
    'telemetry should include router reconnect-pressure counters',
  );
  t.equal(
    mutationMetric?.data?.transportPendingNodeConnectionCount,
    2,
    'telemetry should include current reconnect ownership pressure',
  );
  const latestEntry =
    gateway.getControlPlaneOperationLedgerEntries().at(-1) || null;
  t.equal(
    latestEntry?.canonicalFailureReason,
    GATEWAY_FAILURE_PRIMARY_REASON,
    'the operation ledger should preserve the canonical blocker',
  );
  t.equal(
    gateway.getStats().metrics.authoritativeRowSourceUnavailableCount,
    1,
    'gateway stats should accumulate authoritative-source failures',
  );
  t.equal(
    gateway.getStats().metrics.reconnectDeliveryFailureCount,
    1,
    'gateway stats should accumulate reconnect delivery failures',
  );
  t.equal(
    gateway.getStats().metrics.mutationFailureReasonCounts[
      GATEWAY_FAILURE_PRIMARY_REASON
    ],
    1,
    'gateway stats should accumulate canonical failure reasons',
  );
});

test('ControlPlaneSystemTableGateway records replace-pending queue wait in ' +
  'mutation telemetry', async (t) => {
  const metricEvents = [];
  let currentTimeMs = 1000;
  let releaseFirstMutation = null;
  let invocationCount = 0;
  const firstMutationReleased = new Promise((resolve) => {
    releaseFirstMutation = resolve;
  });
  const gateway = new ControlPlaneSystemTableGateway({
    nodeId: 'node-gateway',
    now: () => currentTimeMs,
    logger: {
      info(tag, data) {
        metricEvents.push({tag, data});
      },
    },
    cdcIntegrationService: {
      async updateSystemTableRow() {
        invocationCount += 1;
        if (invocationCount === 1) {
          await firstMutationReleased;
        }
        currentTimeMs += 5;
        return {success: true};
      },
    },
  });

  const firstMutation = gateway.submitMutation({
    owner: 'services-owner',
    operation: CONTROL_PLANE_MUTATION_OPERATION.UPDATE,
    tableName: TABLES.SERVICES,
    whereClause: {service_id: 'svc-1'},
    data: {status: GATEWAY_MUTATION_STATUS_CREATING},
    coalescingKey: GATEWAY_REPLACE_PENDING_SERVICE_KEY,
  }, {
    mergePolicy: CONTROL_PLANE_MUTATION_MERGE_POLICY.REPLACE_PENDING,
  });

  currentTimeMs += 10;

  const secondMutation = gateway.submitMutation({
    owner: 'services-owner',
    operation: CONTROL_PLANE_MUTATION_OPERATION.UPDATE,
    tableName: TABLES.SERVICES,
    whereClause: {service_id: 'svc-1'},
    data: {status: GATEWAY_MUTATION_STATUS_ACTIVE},
    coalescingKey: GATEWAY_REPLACE_PENDING_SERVICE_KEY,
  }, {
    mergePolicy: CONTROL_PLANE_MUTATION_MERGE_POLICY.REPLACE_PENDING,
  });

  currentTimeMs += 10;
  releaseFirstMutation();
  await firstMutation;
  await secondMutation;

  const mutationMetrics = metricEvents.filter((entry) =>
    entry.tag === METRICS_LOG_TAG.CONTROL_PLANE_GATEWAY_MUTATION,
  );
  const queuedMetric = mutationMetrics[mutationMetrics.length - 1] || null;

  t.equal(
    queuedMetric?.data?.queueState,
    'pending_replace',
    'the queued mutation should report its queue state',
  );
  t.equal(
    queuedMetric?.data?.queueWaitMs,
    15,
    'the queued mutation should report how long it waited before execution',
  );
  t.equal(
    gateway.getStats().metrics.maxObservedMutationQueueWaitMs,
    15,
    'gateway stats should track the worst observed queue wait',
  );
});

test('ControlPlaneSystemTableGateway emits shared pressure diagnostics with ' +
  'control-plane resource keys', async (t) => {
  const metricEvents = [];
  const gateway = new ControlPlaneSystemTableGateway({
    nodeId: 'pressure-gateway-node',
    logger: {
      info(tag, data) {
        metricEvents.push({tag, data});
      },
    },
    messageRouter: {
      getOutboundPressureSummary() {
        return {
          backpressured: true,
          saturatedNodeCount: 1,
          totalPending: 64,
          maxPendingUtilization: 1,
        };
      },
    },
  });

  await gateway.executeRead({
    tableName: TABLES.NODES,
    strategy: 'cache',
  }, {
    workClass: PRESSURE_WORK_CLASS.BACKGROUND,
  });

  const pressureMetric = metricEvents.find((entry) => {
    return entry.tag === METRICS_LOG_TAG.PRESSURE_POLICY;
  }) || null;

  t.ok(pressureMetric, 'pressure policy metric should be emitted');
  t.same(
    pressureMetric?.data?.resourceKeys,
    ['control-plane:read', `control-plane:table:${TABLES.NODES}`],
    'pressure diagnostics should preserve control-plane resource keys',
  );
  t.equal(
    pressureMetric?.data?.capacityPartition,
    'control-plane',
    'pressure diagnostics should preserve the control-plane partition',
  );
});

test('ControlPlaneSystemTableGateway logs typed defer reasons for harness ' +
  'playback', async (t) => {
  const warnings = [];
  const gateway = new ControlPlaneSystemTableGateway({
    nodeId: 'defer-gateway-node',
    logger: {
      info() {},
      warn(message, data) {
        warnings.push({message, data});
      },
    },
    messageRouter: {
      getOutboundPressureSummary() {
        return {
          backpressured: true,
          saturatedNodeCount: 1,
          totalPending: 64,
          maxPendingUtilization: 1,
        };
      },
    },
  });

  const result = await gateway.executeRead({
    tableName: TABLES.NODES,
    strategy: 'cache',
  }, {
    workClass: PRESSURE_WORK_CLASS.BACKGROUND,
    allowPressureDegrade: false,
    allowPressureDefer: true,
    pressureRetryAfterMs: 275,
  });

  t.equal(result.outcome, 'deferred', 'gateway should surface deferred outcome');
  t.equal(warnings.length, 1, 'gateway should emit one harness-friendly warning');
  t.equal(
    warnings[0].message,
    'Control-plane metadata read deferred',
    'warning should identify the deferred gateway path',
  );
  t.equal(
    warnings[0].data.pressureReason,
    'transport_backpressure',
    'warning should include the typed defer reason',
  );
  t.equal(
    warnings[0].data.retryAfterMs,
    275,
    'warning should include retry hints for the harness',
  );
});

registerControlPlaneSystemTableGatewayTailTests({
  test,
  TABLES,
  SystemTableCache,
  PressureGovernor,
  PRESSURE_WORK_CLASS,
  ControlPlaneSystemTableGateway,
  CONTROL_PLANE_AUTHORITATIVE_READ_MODE,
  CONTROL_PLANE_CACHE_RECONCILE_INTENT,
  CONTROL_PLANE_PHASE_SCOPE,
  CONTROL_PLANE_READ_STRATEGY,
  CONTROL_PLANE_MUTATION_MERGE_POLICY,
  CONTROL_PLANE_MUTATION_OUTCOME,
  CONTROL_PLANE_MUTATION_OPERATION,
  CONTROL_PLANE_READINESS_DIMENSION,
  PROJECTION_READINESS_CONTRACT_STATE,
  CONTROL_PLANE_WORKLOAD_CLASS,
  CDC_OPERATION,
  METRICS_LOG_TAG,
  GATEWAY_ROUTING_GAP_OWNER_MISSING,
  GATEWAY_ROUTING_IDENTITY_MISSING,
  GATEWAY_REPLACE_PENDING_SERVICE_KEY,
  GATEWAY_MUTATION_STATUS_CREATING,
  GATEWAY_MUTATION_STATUS_ACTIVE,
  GATEWAY_EXPECTED_FAILURE_MESSAGE,
  GATEWAY_FAILURE_PRIMARY_REASON,
  GATEWAY_FAILURE_DISTRIBUTED_PARTICIPANT_CODE,
  GATEWAY_FAILURE_RECONNECT_MESSAGE,
});

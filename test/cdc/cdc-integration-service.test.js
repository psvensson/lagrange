/**
 * Tests for CDCIntegrationService.
 * Requirements: 5.6, 5.7, 5.8, 5.9, 5.10
 */

import {test, beforeEach, afterEach} from '../../src/test-helpers/tap.js';
import {
  CDCIntegrationService,
  CDCOperationType,
} from '../../src/cdc/cdc-integration-service.js';
import {
  SYSTEM_TABLE_NAME,
} from '../../src/bootstrap/system-table-schemas-constants.js';
import {
} from '../../src/query/query-constants.js';
import {ConfigurationManager} from '../../src/config/configuration-manager.js';
import {LoggingService} from '../../src/logging/logging-service.js';
import {CDC_OPERATIONS, SystemTableCache} from '../../src/cache/system-table-cache.js';
import {createReadOnlyCache} from '../../src/cache/read-only-system-table-cache.js';
import {
} from '../../src/control-plane/control-plane-readiness-constants.js';
import {
  PressureGovernor,
  PRESSURE_WORK_CLASS,
} from '../../src/control-plane/pressure-governor.js';
import {
  CONTROL_PLANE_WORKLOAD_CLASS,
} from '../../src/control-plane/control-plane-workload-profile.js';
import {
  createMockSqlQueryEngine,
  createCacheWaitProbe,
  createLocalSystemTablePartitionServices,
} from './cdc-integration-service-test-support.js';

// Initialize configuration and logging for tests
beforeEach(() => {
  const config = ConfigurationManager.getInstance();
  if (!config.isInitialized()) {
    config.initialize({});
  }

  const logging = LoggingService.getInstance();
  if (!logging.isInitialized()) {
    logging.initialize({level: 'error'});
  }
});

afterEach(() => {
  ConfigurationManager.resetInstance();
  LoggingService.resetInstance();
});


test('CDCIntegrationService - constructor', async (t) => {
  const service = new CDCIntegrationService({
    nodeId: 'test-node',
  });

  t.equal(service.nodeId, 'test-node', 'should set nodeId');
  t.equal(service.isInitialized(), false, 'should not be initialized');
  t.end();
});

test('CDCIntegrationService - constructor has no _nodeStates field', async (t) => {
  const service = new CDCIntegrationService({
    nodeId: 'test-node',
  });

  t.equal(
    Object.prototype.hasOwnProperty.call(service, '_nodeStates'),
    false,
    'should not have _nodeStates property (node state tracking owned by CDCEventHandler)',
  );
  t.end();
});

test('CDCIntegrationService - initialize', async (t) => {
  const mockSqlEngine = createMockSqlQueryEngine();
  const service = new CDCIntegrationService({
    nodeId: 'test-node',
  });

  service.initialize({
    sqlQueryEngine: mockSqlEngine,
  });

  t.equal(service.isInitialized(), true, 'should be initialized');
  t.end();
});

test('CDCIntegrationService - insertSystemTableRow', async (t) => {
  const mockSqlEngine = createMockSqlQueryEngine();
  const service = new CDCIntegrationService({
    nodeId: 'test-node',
    sqlQueryEngine: mockSqlEngine,
  });
  service.initialize();

  const data = {
    node_id: 'node-1',
    node_address: 'localhost:8080',
    cpu_cores: 4,
    memory_mb: 8192,
    disk_gb: 100,
    status: 'active',
    last_heartbeat: Date.now(),
    created_at: Date.now(),
  };

  const result = await service.insertSystemTableRow(SYSTEM_TABLE_NAME.NODES, data);

  t.equal(result.success, true, 'should succeed');
  t.equal(result.operation, CDCOperationType.INSERT, 'should be INSERT operation');
  t.equal(result.tableName, SYSTEM_TABLE_NAME.NODES, 'should have correct table name');
  t.equal(mockSqlEngine.executedQueries.length, 1, 'should execute one query');
  t.ok(
    mockSqlEngine.executedQueries[0].sql.includes('INSERT INTO'),
    'should be INSERT query',
  );
  t.end();
});

test('CDCIntegrationService - insertSystemTableRow generates id', async (t) => {
  const mockSqlEngine = createMockSqlQueryEngine();
  const service = new CDCIntegrationService({
    nodeId: 'test-node',
    sqlQueryEngine: mockSqlEngine,
  });
  service.initialize();

  const data = {
    node_address: 'localhost:8080',
    cpu_cores: 4,
    memory_mb: 8192,
    disk_gb: 100,
    status: 'active',
    last_heartbeat: Date.now(),
    created_at: Date.now(),
  };

  const result = await service.insertSystemTableRow(SYSTEM_TABLE_NAME.NODES, data);

  t.equal(result.success, true, 'should succeed');
  t.ok(result.data.node_id, 'should generate node_id');
  t.end();
});

test('CDCIntegrationService - insertSystemTableRow can ignore existing rows',
  async (t) => {
    const mockSqlEngine = createMockSqlQueryEngine();
    mockSqlEngine.executeQuery = async (sql, params = [], options = {}) => {
      mockSqlEngine.executedQueries.push({sql, params, options});
      return {
        success: true,
        affectedRows: 0,
        rows: [],
      };
    };
    const service = new CDCIntegrationService({
      nodeId: 'test-node',
      sqlQueryEngine: mockSqlEngine,
    });
    service.initialize();

    const result = await service.insertSystemTableRow(
      SYSTEM_TABLE_NAME.NODES,
      {
        node_id: 'node-1',
        node_address: 'localhost:8080',
        cpu_cores: 4,
        memory_mb: 8192,
        disk_gb: 100,
        status: 'active',
        last_heartbeat: Date.now(),
        created_at: Date.now(),
      },
      {
        ignoreExisting: true,
      },
    );

    t.match(
      mockSqlEngine.executedQueries[0]?.sql,
      /^INSERT OR IGNORE INTO nodes \(/,
      'idempotent inserts should route through INSERT OR IGNORE',
    );
    t.equal(result.affectedRows, 0, 'ignored duplicates should preserve zero affected rows');
    t.equal(result.partitionResult?.affectedRows, 0,
      'partition result should preserve zero affected rows');
  });

test('CDCIntegrationService - insertSystemTableRow skips cache wait for logs', async (t) => {
  const mockSqlEngine = createMockSqlQueryEngine();
  const {cache, state} = createCacheWaitProbe();
  const service = new CDCIntegrationService({
    nodeId: 'test-node',
    sqlQueryEngine: mockSqlEngine,
    systemTableCache: cache,
  });
  service.initialize();

  const data = {
    log_id: 'log-1',
    timestamp: Date.now(),
    level: 'INFO',
    node_id: 'node-1',
    message: 'log message',
    created_at: Date.now(),
  };

  await service.insertSystemTableRow(SYSTEM_TABLE_NAME.LOGS, data);

  t.equal(
    state.onCacheChangeCalls,
    0,
    'should not subscribe to cache waits for non-propagated logs table',
  );
  t.end();
});

test('CDCIntegrationService - coalesces identical in-flight upserts into ' +
  'one routed write', async (t) => {
  let releaseWrite = null;
  const mockSqlEngine = {
    executedQueries: [],
    async executeQuery(sql, params = [], options = {}) {
      this.executedQueries.push({sql, params, options});
      await new Promise((resolve) => {
        releaseWrite = resolve;
      });
      return {
        success: true,
        affectedRows: 1,
      };
    },
  };
  const service = new CDCIntegrationService({
    nodeId: 'test-node',
    sqlQueryEngine: mockSqlEngine,
  });
  service.initialize();

  const row = {
    node_id: 'node-1',
    node_address: 'localhost:8080',
    status: 'active',
    last_heartbeat: 1000,
    created_at: 1000,
    updated_at: 1000,
  };

  const firstWrite = service.upsertSystemTableRow(
    SYSTEM_TABLE_NAME.NODES,
    row,
    {
      workClass: 'background',
      allowPressureDefer: true,
      deliveryPriority: 'background',
    },
  );
  const secondWrite = service.upsertSystemTableRow(
    SYSTEM_TABLE_NAME.NODES,
    {...row},
    {
      workClass: 'background',
      allowPressureDefer: true,
      deliveryPriority: 'background',
    },
  );

  await new Promise((resolve) => {
    setTimeout(resolve, 0);
  });

  t.equal(
    mockSqlEngine.executedQueries.length,
    1,
    'identical concurrent upserts should collapse into one routed mutation',
  );
  t.equal(
    mockSqlEngine.executedQueries[0]?.options?.deliveryPriority,
    'background',
    'coalesced writes should preserve routed delivery metadata',
  );
  t.equal(
    typeof releaseWrite,
    'function',
    'the routed write should be armed before releasing it',
  );

  releaseWrite();
  const [firstResult, secondResult] = await Promise.all([
    firstWrite,
    secondWrite,
  ]);

  t.same(firstResult, secondResult, 'coalesced upserts should share one result');
  t.end();
});

test('CDCIntegrationService - forwards pressure admission metadata to routed ' +
  'SQL writes', async (t) => {
  const mockSqlEngine = createMockSqlQueryEngine();
  const service = new CDCIntegrationService({
    nodeId: 'test-node',
    sqlQueryEngine: mockSqlEngine,
  });
  service.initialize();

  await service.upsertSystemTableRow(
    SYSTEM_TABLE_NAME.SQL_TRANSACTIONS,
    {
      transaction_id: 'tx-forwarded-1',
      session_id: 'session-1',
      status: 'ACTIVE',
      transaction_epoch: 1,
      timeout_deadline: 1000,
      created_at: 1,
      updated_at: 2,
    },
    {
      workClass: 'critical',
      allowPressureDefer: true,
      pressureRetryAfterMs: 777,
      deliveryPriority: 'background',
    },
  );

  t.equal(mockSqlEngine.executedQueries.length, 1,
    'routed SQL write should execute once');
  t.equal(mockSqlEngine.executedQueries[0]?.options?.workClass, 'critical',
    'work class should survive the CDC SQL handoff');
  t.equal(
    mockSqlEngine.executedQueries[0]?.options?.pressureRetryAfterMs,
    777,
    'retry-after hints should survive the CDC SQL handoff',
  );
  t.equal(
    mockSqlEngine.executedQueries[0]?.options?.deliveryPriority,
    'background',
    'delivery priority should survive the CDC SQL handoff',
  );
  t.end();
});

test('CDCIntegrationService - derives routed SQL admission defaults from one ' +
  'mutation workload class', async (t) => {
  const mockSqlEngine = createMockSqlQueryEngine();
  const service = new CDCIntegrationService({
    nodeId: 'test-node',
    sqlQueryEngine: mockSqlEngine,
  });
  service.initialize();

  let evaluateArgs = null;
  const originalGetShared = PressureGovernor.getShared;
  PressureGovernor.getShared = () => ({
    evaluate(args) {
      evaluateArgs = args;
      return {
        action: 'allow',
        reason: 'test-allow',
        summary: null,
        retryAfterMs: 0,
      };
    },
  });
  t.after(() => {
    PressureGovernor.getShared = originalGetShared;
  });

  await service.upsertSystemTableRow(
    SYSTEM_TABLE_NAME.SQL_TRANSACTIONS,
    {
      transaction_id: 'tx-workload-1',
      session_id: 'session-workload-1',
      status: 'ACTIVE',
      transaction_epoch: 1,
      timeout_deadline: 1000,
      created_at: 1,
      updated_at: 2,
    },
    {
      workloadClass: CONTROL_PLANE_WORKLOAD_CLASS.TRANSACTION_CONTROL_MUTATION,
    },
  );

  t.equal(mockSqlEngine.executedQueries.length, 1,
    'workload-owned routed SQL write should execute once');
  t.equal(
    evaluateArgs?.workClass,
    PRESSURE_WORK_CLASS.CRITICAL,
    'pressure admission should derive the workload-owned critical work class',
  );
  t.ok(
    evaluateArgs?.resourceKeys?.includes(
      'control-plane:transaction-control:recovery',
    ),
    'pressure admission should use the shared transaction-control recovery resource key',
  );
  t.ok(
    evaluateArgs?.resourceKeys?.includes(
      'control-plane:table:sql_transactions',
    ),
    'pressure admission should keep the table-scoped fairness key alongside the workload key',
  );
  t.equal(
    mockSqlEngine.executedQueries[0]?.options?.workloadClass,
    CONTROL_PLANE_WORKLOAD_CLASS.TRANSACTION_CONTROL_MUTATION,
    'routed SQL writes should preserve the mutation workload class',
  );
  t.equal(
    mockSqlEngine.executedQueries[0]?.options?.workClass,
    PRESSURE_WORK_CLASS.CRITICAL,
    'routed SQL writes should preserve the workload-owned critical work class',
  );
  t.end();
});

test('CDCIntegrationService - derives publication mutation pressure admission ' +
  'from the shared workload class', async (t) => {
  const mockSqlEngine = createMockSqlQueryEngine();
  const service = new CDCIntegrationService({
    nodeId: 'test-node',
    sqlQueryEngine: mockSqlEngine,
  });
  service.initialize();

  let evaluateArgs = null;
  const originalGetShared = PressureGovernor.getShared;
  PressureGovernor.getShared = () => ({
    evaluate(args) {
      evaluateArgs = args;
      return {
        action: 'allow',
        reason: 'test-allow',
        summary: null,
        retryAfterMs: 0,
      };
    },
  });
  t.after(() => {
    PressureGovernor.getShared = originalGetShared;
  });

  await service.upsertSystemTableRow(
    SYSTEM_TABLE_NAME.CONTROL_PLANE_PUBLICATIONS,
    {
      publicationId: 'pub-workload-1',
      publicationKind: 'cluster_membership',
      publicationEpoch: 7,
      publisherNodeId: 'node-a',
      publishedActiveNodeIds: ['node-a'],
      requiredAckNodeIds: ['node-a'],
      acknowledgedNodeIds: [],
      status: 'OPEN',
    },
    {
      workloadClass: CONTROL_PLANE_WORKLOAD_CLASS.PUBLICATION_MUTATION,
    },
  );

  t.equal(mockSqlEngine.executedQueries.length, 1,
    'publication workload write should execute once');
  t.equal(
    evaluateArgs?.workClass,
    PRESSURE_WORK_CLASS.CRITICAL,
    'publication pressure admission should derive the critical work class',
  );
  t.ok(
    evaluateArgs?.resourceKeys?.includes(
      'control-plane:membership:publication',
    ),
    'publication pressure admission should use the membership publication key',
  );
  t.ok(
    evaluateArgs?.resourceKeys?.includes(
      'control-plane:table:control_plane_publications',
    ),
    'publication pressure admission should keep the table-scoped fairness key',
  );
  t.equal(
    mockSqlEngine.executedQueries[0]?.options?.workloadClass,
    CONTROL_PLANE_WORKLOAD_CLASS.PUBLICATION_MUTATION,
    'publication routed SQL writes should preserve the workload class',
  );
  t.end();
});

test('CDCIntegrationService canonicalizes control_plane_publications upserts ' +
  'before filtering schema columns', async (t) => {
  const mockSqlEngine = createMockSqlQueryEngine();
  const service = new CDCIntegrationService({
    nodeId: 'test-node',
    sqlQueryEngine: mockSqlEngine,
  });
  service.initialize();

  await service.upsertSystemTableRow(
    SYSTEM_TABLE_NAME.CONTROL_PLANE_PUBLICATIONS,
    {
      publicationId: 'pub-1',
      publicationKind: 'cluster_membership',
      publicationEpoch: 7,
      publisherNodeId: 'node-a',
      publishedActiveNodeIds: ['node-a', 'node-b'],
      requiredAckNodeIds: ['node-a', 'node-b'],
      acknowledgedNodeIds: ['node-a'],
      status: 'OPEN',
      reasonCode: 'authoritative_membership_changed',
    },
    {
    },
  );

  t.equal(
    mockSqlEngine.executedQueries.length,
    1,
    'canonicalized publication upsert should execute once',
  );
  t.match(
    mockSqlEngine.executedQueries[0].sql,
    /^INSERT OR REPLACE INTO control_plane_publications \(/,
    'publication upsert should still use INSERT OR REPLACE',
  );
  t.same(
    mockSqlEngine.executedQueries[0].params.slice(0, 4),
    ['pub-1', 'cluster_membership', 7, 'node-a'],
    'canonicalized publication row should preserve the primary key and core fields',
  );
  t.end();
});

test('CDCIntegrationService - defers routed writes under pressure when allowed',
  async (t) => {
    let sqlCalls = 0;
    const service = new CDCIntegrationService({
      nodeId: 'pressure-node',
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
      sqlQueryEngine: {
        async executeQuery() {
          sqlCalls++;
          return {
            success: true,
            affectedRows: 1,
          };
        },
      },
    });
    service.initialize();

    const error = await t.rejects(
      service.updateSystemTableRow(
        SYSTEM_TABLE_NAME.SERVICES,
        {service_id: 'svc-1'},
        {status: 'active', updated_at: 1234},
        {
          workClass: 'background',
          deliveryPriority: 'background',
        },
      ),
      'deferable routed writes should fail closed before hitting SQL',
    );
    t.equal(
      error?.code,
      'CONTROL_PLANE_PRESSURE_DEGRADED',
      'pressure admission should surface the typed error code',
    );
    t.equal(
      error?.deferRetry,
      true,
      'pressure admission should mark the error as deferable',
    );
    t.ok(
      error?.retryAfterMs > 0,
      'pressure admission should preserve a derived retry-after hint',
    );

    t.equal(sqlCalls, 0, 'deferred routed writes should not hit routed SQL');
  });

function assertSingleRetryBudgetSpentError(t, errors) {
  t.equal(errors.length, 1,
    'only the spent retry budget is an ERROR, nothing else');
  const [, context] = errors[0];
  t.equal(context.event, 'wait_bound_spent');
  t.equal(context.wait, 'CDC_DEFAULTS.RETRY_MAX_ATTEMPTS');
  t.equal(context.lastObserved.errorCode, 'CONTROL_PLANE_PRESSURE_DEGRADED');
}

test('CDCIntegrationService logs retryable table-write failures as warnings',
  async (t) => {
    const service = new CDCIntegrationService({
      nodeId: 'test-node',
      sqlQueryEngine: {
        async executeQuery() {
          return {
            success: false,
            error: 'Distributed operation failed due to participant failures',
            errorCode: 'CONTROL_PLANE_PRESSURE_DEGRADED',
            retryAfterMs: 250,
          };
        },
      },
    });
    service.initialize();

    const warnings = [];
    const errors = [];
    service.logger = {
      debug() {},
      info() {},
      warn(...args) {
        warnings.push(args);
      },
      error(...args) {
        errors.push(args);
      },
    };

    await t.rejects(
      service.updateSystemTableRow(
        SYSTEM_TABLE_NAME.SERVICES,
        {service_id: 'svc-1'},
        {status: 'active'},
        {
          causeId: 'cdc-write-failure:test',
        },
      ),
      'retryable control-plane deferrals should still fail closed',
    );

    t.ok(warnings.length >= 1,
      'retryable table-write deferrals should log at least one warning');
    // The routed-mutation attempt budget spent on a retryable error is a
    // spent wait: exactly one wait_bound_spent ERROR, and no other error.
    assertSingleRetryBudgetSpentError(t, errors);
    const finalWarningPayload = warnings[warnings.length - 1]?.[1] || null;
    t.equal(finalWarningPayload?.code, 'CONTROL_PLANE_PRESSURE_DEGRADED',
      'warning should preserve the typed error code');
    t.equal(finalWarningPayload?.retryAfterMs, 250,
      'warning should preserve the retry-after hint');
    t.equal(finalWarningPayload?.causeId, 'cdc-write-failure:test',
      'warning should preserve the write cause');
    t.equal(finalWarningPayload?.operation, 'UPDATE',
      'warning should identify the failed write operation');
    t.equal(finalWarningPayload?.writeMode, 'sql-routed',
      'warning should identify the write path');
    t.equal(finalWarningPayload?.bootstrapMode, false,
      'warning should indicate bootstrap mode state');
    t.same(finalWarningPayload?.primaryKey, {service_id: 'svc-1'},
      'warning should preserve the primary key');
    t.ok(finalWarningPayload?.attempt > 1,
      'warning should preserve the final SQL attempt number after retries');
    t.equal(finalWarningPayload?.cacheWaitTimedOut, false,
      'warning should distinguish SQL failure from cache wait timeout');
  });

test('CDCIntegrationService preserves explicit deferRetry on routed SQL errors',
  async (t) => {
    const service = new CDCIntegrationService({
      nodeId: 'test-node',
      retryMaxAttempts: 1,
      sqlQueryEngine: {
        async executeQuery() {
          return {
            success: false,
            error: 'query transport reconnecting',
            errorCode: 'ROUTER_CONNECTION_CLOSED',
            deferRetry: true,
            participantFailures: [
              {
                failedPartition: 'nodes-p1',
                failedAddress: 'leader-node/partition/nodes-p1-r1',
              },
            ],
            firstFailedParticipant: {
              failedPartition: 'nodes-p1',
              failedAddress: 'leader-node/partition/nodes-p1-r1',
            },
          };
        },
      },
    });
    service.initialize();

    const error = await t.rejects(
      service.updateSystemTableRow(
        SYSTEM_TABLE_NAME.SERVICES,
        {service_id: 'svc-1'},
        {status: 'active'},
        {
        },
      ),
      'explicit routed deferrals should be preserved when CDC wraps failures',
    );

    t.equal(error?.code, 'ROUTER_CONNECTION_CLOSED',
      'wrapped error should preserve the canonical error code');
    t.equal(error?.errorCode, 'ROUTER_CONNECTION_CLOSED',
      'wrapped error should preserve errorCode for downstream owners');
    t.equal(error?.deferRetry, true,
      'wrapped error should preserve explicit deferRetry even without retryAfterMs');
    t.equal(error?.participantFailures?.length, 1,
      'wrapped error should preserve structured participant failures for upstream owners');
    t.equal(error?.firstFailedParticipant?.failedPartition, 'nodes-p1',
      'wrapped error should preserve the canonical first failed participant');
  });

// Re-derived from the deleted post-write cache wait (quest
// replica-admission-from-committed-operation, attempt 2): a routed write on a
// propagated table answers at its commit and never subscribes to the cache,
// (the bootstrap bypass of the wait is deleted with it). The wait's retry, pending and
// deferred-visibility answers have no reachable counterpart (their path is
// deleted); the projection wait's own semantics are witnessed in
// test/cdc/routed-system-table-write-answers-at-commit.test.js.
{
  test('CDCIntegrationService - insertSystemTableRow answers at its commit ' +
    'without subscribing to the cache',
  async (t) => {
    const {cache, state} = createCacheWaitProbe();
    const service = new CDCIntegrationService({
      nodeId: 'test-node',
      sqlQueryEngine: createMockSqlQueryEngine(),
      systemTableCache: cache,
    });
    service.initialize();
    const result = await service.insertSystemTableRow(SYSTEM_TABLE_NAME.NODES,
      {node_id: 'node-1', node_address: 'localhost:8080'});
    t.equal(result.committed, true, 'the insert answers committed');
    t.equal(state.onCacheChangeCalls, 0, 'no cache subscription');
    t.end();
  });
}

test('CDCIntegrationService - authoritative fallback diagnostics track phase windows',
  async (t) => {
    const mockSqlEngine = {
      queryExecutor: {
        async executeOnPartition() {
          return {
            success: true,
            participantNodeId: 'node-owner',
            rows: [{
              node_id: 'node-1',
              node_address: 'localhost:8080',
            }],
          };
        },
        getPartitionRoutingSnapshot() {
          return {
            canonicalLeaderNodeId: 'node-owner',
            serviceRowCount: 1,
            routableServiceCount: 1,
            deniedByNodeId: {},
          };
        },
      },
    };
    // The real cache (writable owner + its read view); each phase starts from
    // an empty cache so each repair is a cache-lag recovery.
    const bindEmptyCache = (service) => {
      const cache = new SystemTableCache();
      service.systemTableCache = createReadOnlyCache(cache);
      service.cacheMutationTarget = cache;
    };
    const service = new CDCIntegrationService({
      nodeId: 'test-node',
      sqlQueryEngine: mockSqlEngine,
    });
    bindEmptyCache(service);
    service.initialize();

    await service.repairCacheVisibilityHole(
      SYSTEM_TABLE_NAME.NODES,
      'node-1',
      true,
      null,
      null,
      {fallbackPhase: 'steady_state'},
    );
    bindEmptyCache(service);
    await service.repairCacheVisibilityHole(
      SYSTEM_TABLE_NAME.NODES,
      'node-1',
      true,
      null,
      null,
      {fallbackPhase: 'recovery'},
    );

    const diagnostics = service.getAuthoritativeFallbackDiagnostics();

    t.equal(diagnostics.totalCount, 2, 'should track total fallback diagnostics');
    t.equal(diagnostics.windowCount, 2, 'should track windowed fallback diagnostics');
    t.equal(diagnostics.phases.steady_state.totalCount, 1,
      'should classify steady-state fallback separately');
    t.equal(diagnostics.phases.recovery.totalCount, 1,
      'should classify recovery fallback separately');
    t.equal(diagnostics.outcomes.recovered.totalCount, 2,
      'should classify repaired cache lag separately from failure');
    t.equal(diagnostics.byTable.nodes.totalCount, 2,
      'should group fallback diagnostics by table');
    t.equal(diagnostics.recentEvents.length, 2,
      'should keep recent fallback events for diagnostics');
    t.end();
  },
);

test('CDCIntegrationService - steady-state system table writes prefer local partition services',
  async (t) => {
    const mockSqlEngine = createMockSqlQueryEngine();
    const localWrites = [];
    const service = new CDCIntegrationService({
      nodeId: 'test-node',
      sqlQueryEngine: mockSqlEngine,
      partitionServicesProvider: () => createLocalSystemTablePartitionServices(
        SYSTEM_TABLE_NAME.NODES,
        {
          async executeQuery(sql, params) {
            localWrites.push({sql, params});
            return {
              success: true,
              changes: 1,
            };
          },
        },
      ),
    });
    service.initialize();

    await service.updateSystemTableRow(
      SYSTEM_TABLE_NAME.NODES,
      {node_id: 'node-1'},
      {status: 'ready'},
      {},
    );

    t.equal(localWrites.length, 1, 'should execute through a local partition service');
    t.equal(
      mockSqlEngine.executedQueries.length,
      0,
      'should not hit routed SQL when a local system partition service is available',
    );
    t.match(
      localWrites[0]?.sql,
      /^UPDATE nodes SET /,
      'should preserve the system table SQL mutation',
    );
  });

test('CDCIntegrationService - local system table writes do not require SQL engine',
  async (t) => {
    const localWrites = [];
    const service = new CDCIntegrationService({
      nodeId: 'test-node',
      partitionServicesProvider: () => createLocalSystemTablePartitionServices(
        SYSTEM_TABLE_NAME.NODES,
        {
          async executeQuery(sql, params) {
            localWrites.push({sql, params});
            return {
              success: true,
              changes: 1,
            };
          },
        },
      ),
    });
    service.initialize();

    await service.updateSystemTableRow(
      SYSTEM_TABLE_NAME.NODES,
      {node_id: 'node-1'},
      {status: 'ready'},
      {},
    );

    t.equal(
      service.sqlQueryEngine,
      null,
      'test should cover the missing SQL engine path',
    );
    t.equal(
      localWrites.length,
      1,
      'local partition service should carry the write without routed SQL',
    );
  });

test('CDCIntegrationService - local system table routing ignores un-cut-over child partitions and bounded key ranges on unrouted writes',
  async (t) => {
    const mockSqlEngine = createMockSqlQueryEngine();
    const childWrites = [];
    const childService = {
      partitionId: 'logs_p_7cd6bb21_left',
      replicaId: 'logs_p_7cd6bb21_left-r1',
      nodeId: 'test-node',
      role: 'leader',
      leaderId: 'logs_p_7cd6bb21_left-r1',
      status: 'READY',
      keyRange: {start: null, end: '7e530709'},
      isLeaderReplica: () => true,
      async executeQuery(sql, params) {
        childWrites.push({sql, params});
        return {success: true, changes: 1};
      },
    };
    const services = new Map([['logs_p_7cd6bb21_left', childService]]);
    // The real cache holding the logs table at version 1 and an un-cut-over
    // version-2 child partition.
    const systemTableCache = new SystemTableCache();
    systemTableCache.applySystemTableChange(SYSTEM_TABLE_NAME.TABLES, CDC_OPERATIONS.UPSERT,
      {table_id: 'logs', table_name: 'logs', active_partition_version: 1});
    for (const [partitionId, version] of [['logs-p1', 1], ['logs_p_7cd6bb21_left', 2]]) {
      systemTableCache.applySystemTableChange(SYSTEM_TABLE_NAME.PARTITIONS,
        CDC_OPERATIONS.UPSERT, {partition_id: partitionId, table_id: 'logs',
          table_name: 'logs', partition_version: version, state: 'NORMAL'});
    }
    const service = new CDCIntegrationService({
      nodeId: 'test-node',
      sqlQueryEngine: mockSqlEngine,
      systemTableCache,
      partitionServicesProvider: () => services,
    });
    service.initialize();

    const resolvedServices = service.resolveLocalSystemTableServices(
      SYSTEM_TABLE_NAME.LOGS,
      {consistency: 'local_leader'},
    );
    t.equal(
      resolvedServices.length,
      0,
      'must not resolve v2 child partition while active_partition_version is 1',
    );

    const writeOutcome = await service.tryExecuteLocalSystemTableWrite(
      'INSERT INTO logs (log_id, message) VALUES (?, ?)',
      ['bd453ef1', 'test'],
    );
    t.equal(
      writeOutcome.handled,
      false,
      'must not execute unrouted system-table write on a bounded child partition',
    );
    t.equal(childWrites.length, 0, 'child partition must receive zero unrouted writes');
  });

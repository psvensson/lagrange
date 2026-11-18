import {FIXTURE_ENDPOINT_INCARNATION} from
  '../test-helpers/endpoint-incarnation-fixture.js';
import {
  createAuthoritativeCacheGateway,
  createSystemTableRepairQueryEngine,
  getAuthoritativeRepairReadTables,
} from './admin-websocket-api-test-support.js';
export function registerAdminWebSocketApiLoadBenchmarkTests({
  test,
  AdminWebSocketAPI,
  MessageType,
  ErrorCode,
  createReadOnlyCache,
  createPopulatedCache,
  connectAndReceive,
  waitForMessage,
  TABLES,
}) {
  const AUTHORITATIVE_REPAIR_TABLES = Object.freeze([
    TABLES.NODES,
    TABLES.PARTITIONS,
    TABLES.SERVICES,
    TABLES.TABLES,
    TABLES.NODE_ENDPOINTS,
    TABLES.SERVICE_DEFINITIONS,
    TABLES.SERVICE_ENDPOINTS,
    TABLES.REPLICA_OPERATIONS,
  ]);
  const BACKGROUND_REPAIR_SETTLE_TURNS = 8;
  const BACKGROUND_REPAIR_SETTLE_DELAY_MS = 0;
  const BACKGROUND_REPAIR_WAIT_ATTEMPTS = 40;

  async function waitForBackgroundRepairToSettle(
    turnCount = BACKGROUND_REPAIR_SETTLE_TURNS,
  ) {
    for (let index = 0; index < turnCount; index += 1) {
      await new Promise((resolve) => {
        setTimeout(resolve, BACKGROUND_REPAIR_SETTLE_DELAY_MS);
      });
    }
  }

  async function waitForBackgroundRepairCondition(
    conditionFn,
    attemptCount = BACKGROUND_REPAIR_WAIT_ATTEMPTS,
  ) {
    for (let index = 0; index < attemptCount; index += 1) {
      if (conditionFn()) {
        return true;
      }
      await waitForBackgroundRepairToSettle(1);
    }
    return conditionFn();
  }

  function seedRoutedTableDiscoveryRows(cache) {
    const updatedAt = Date.now();

    cache.applySystemTableChange(TABLES.NODES, 'INSERT', {
      boot_incarnation: FIXTURE_ENDPOINT_INCARNATION,
      id: 'node-2',
      node_id: 'node-2',
      address: 'localhost:8081',
      status: 'active',
    });

    cache.applySystemTableChange(TABLES.SERVICE_DEFINITIONS, 'INSERT', {
      service_id: 'sys-postgres-wire',
      service_name: 'sys-postgres-wire',
      replica_count: 2,
      runtime_kind: 'native_js',
    });

    cache.applySystemTableChange(TABLES.SERVICE_ENDPOINTS, 'INSERT', {
      boot_incarnation: FIXTURE_ENDPOINT_INCARNATION,
      endpoint_id: 'sys-postgres-wire-ep-node-1',
      service_id: 'sys-postgres-wire',
      node_id: 'node-1',
      protocol: 'postgresql',
      address: '10.0.0.1',
      port: 5432,
      health_status: 'healthy',
      metadata: JSON.stringify({
        service_name: 'sys-postgres-wire',
        protocol: 'postgresql',
        version: '1.0.0',
      }),
      updated_at: updatedAt,
    });

    cache.applySystemTableChange(TABLES.SERVICE_ENDPOINTS, 'INSERT', {
      boot_incarnation: FIXTURE_ENDPOINT_INCARNATION,
      endpoint_id: 'sys-postgres-wire-ep-node-2',
      service_id: 'sys-postgres-wire',
      node_id: 'node-2',
      protocol: 'postgresql',
      address: '10.0.0.2',
      port: 5432,
      health_status: 'healthy',
      metadata: JSON.stringify({
        service_name: 'sys-postgres-wire',
        protocol: 'postgresql',
        version: '1.0.0',
      }),
      updated_at: updatedAt,
    });

    cache.applySystemTableChange(TABLES.SERVICE_DEFINITIONS, 'INSERT', {
      service_id: 'sys-admin-meta',
      service_name: 'sys-admin-meta',
      protocol: 'websocket',
      replica_count: 2,
      runtime_kind: 'native_js',
    });

    cache.applySystemTableChange(TABLES.SERVICE_ENDPOINTS, 'INSERT', {
      boot_incarnation: FIXTURE_ENDPOINT_INCARNATION,
      endpoint_id: 'sys-admin-meta-ep-node-1',
      service_id: 'sys-admin-meta',
      node_id: 'node-1',
      protocol: 'websocket',
      address: '10.0.0.1',
      port: 8080,
      health_status: 'healthy',
      metadata: JSON.stringify({
        service_name: 'sys-admin-meta',
        protocol: 'websocket',
        version: '1.0.0',
      }),
      updated_at: updatedAt,
    });

    cache.applySystemTableChange(TABLES.SERVICE_ENDPOINTS, 'INSERT', {
      boot_incarnation: FIXTURE_ENDPOINT_INCARNATION,
      endpoint_id: 'sys-admin-meta-ep-node-2',
      service_id: 'sys-admin-meta',
      node_id: 'node-2',
      protocol: 'websocket',
      address: '10.0.0.2',
      port: 8080,
      health_status: 'healthy',
      metadata: JSON.stringify({
        service_name: 'sys-admin-meta',
        protocol: 'websocket',
        version: '1.0.0',
      }),
      updated_at: updatedAt,
    });

    cache.applySystemTableChange(TABLES.TABLES, 'INSERT', {
      id: 'table-benchmark-events',
      table_id: 'table-benchmark-events',
      name: 'benchmark_events',
      table_name: 'benchmark_events',
    });

    cache.applySystemTableChange(TABLES.PARTITIONS, 'INSERT', {
      id: 'partition-benchmark-events-1',
      partition_id: 'partition-benchmark-events-1',
      table_id: 'table-benchmark-events',
      table_name: 'benchmark_events',
      keyStart: null,
      keyEnd: null,
    });

    cache.applySystemTableChange(TABLES.SERVICES, 'INSERT', {
      service_id: 'service-benchmark-events-node-1',
      service_type: 'partition',
      partition_id: 'partition-benchmark-events-1',
      node_id: 'node-1',
      status: 'active',
      raft_role: 'leader',
      address: '10.0.0.1:7001',
    });
  }

  function seedTableDiscoveryRowsWithLocalCandidate(cache) {
    seedRoutedTableDiscoveryRows(cache);

    cache.applySystemTableChange(TABLES.SERVICES, 'INSERT', {
      service_id: 'service-benchmark-events-node-2',
      service_type: 'partition',
      partition_id: 'partition-benchmark-events-1',
      node_id: 'node-2',
      status: 'active',
      raft_role: 'candidate',
      address: '10.0.0.2:7001',
    });
  }

  function seedTableDiscoveryRowsWithLocalFollower(cache) {
    seedRoutedTableDiscoveryRows(cache);

    cache.applySystemTableChange(TABLES.SERVICES, 'INSERT', {
      service_id: 'service-benchmark-events-node-2',
      service_type: 'partition',
      partition_id: 'partition-benchmark-events-1',
      node_id: 'node-2',
      status: 'active',
      raft_role: 'follower',
      address: '10.0.0.2:7001',
    });
  }

  test('AdminWebSocketAPI - load lane blocks benchmark table queries until local benchmark admission is ready',
    async (t) => {
      let executedQueryCount = 0;
      const cache = createPopulatedCache();
      seedTableDiscoveryRowsWithLocalCandidate(cache);
      const api = new AdminWebSocketAPI({
        nodeId: 'node-2',
        systemTableCache: cache,
        sqlQueryEngine: {
          executeRequest: async () => {
            executedQueryCount += 1;
            return {
              success: true,
              rows: [{count: 1}],
              count: 1,
              tableName: 'benchmark_events',
            };
          },
        },
      });

      await api.initialize(0, {listen: false});
      const {ws} = await connectAndReceive(api, 2000, {
        query: {lane: 'load'},
      });

      ws.send(JSON.stringify({
        type: MessageType.QUERY,
        queryId: 'q-load-benchmark-blocked',
        sql: 'SELECT count(*) FROM benchmark_events WHERE payload = 1',
      }));

      const result = await waitForMessage(ws);
      t.equal(result.type, MessageType.QUERY_RESULT,
        'should return query_result envelope');
      t.equal(result.queryId, 'q-load-benchmark-blocked',
        'should preserve query id');
      t.equal(result.errorCode, ErrorCode.INTERNAL_ERROR,
        'blocked benchmark admission should surface as typed admin error');
      t.equal(result.deferRetry, true,
        'blocked benchmark admission should remain retryable');
      t.equal(result.retryAfterMs, 250,
        'blocked benchmark admission should carry bounded retry metadata');
      t.match(
        String(result.error || ''),
        /benchmarkReady=false/i,
        'blocked benchmark admission should report benchmark readiness state',
      );
      t.match(
        String(result.error || ''),
        /local_replica_not_voter_ready/i,
        'blocked benchmark admission should expose canonical readiness reasons',
      );
      t.equal(executedQueryCount, 0,
        'blocked benchmark admission should reject before SQL execution');

      ws.close();
      await api.shutdown();
    });

  test('AdminWebSocketAPI - load lane repairs cache-gap admission blockers before rejecting benchmark table queries',
    async (t) => {
      let executedQueryCount = 0;
      const writableCache = createPopulatedCache();
      seedTableDiscoveryRowsWithLocalFollower(writableCache);

      const authoritativeRowsByTable = {};
      for (const tableName of AUTHORITATIVE_REPAIR_TABLES) {
        authoritativeRowsByTable[tableName] = writableCache.getAll(tableName);
      }

      writableCache.applySystemTableChange(TABLES.TABLES, 'DELETE', {
        id: 'table-benchmark-events',
        table_id: 'table-benchmark-events',
      });
      writableCache.applySystemTableChange(TABLES.PARTITIONS, 'DELETE', {
        id: 'partition-benchmark-events-1',
        partition_id: 'partition-benchmark-events-1',
      });

      const repairEngine = createSystemTableRepairQueryEngine(
        authoritativeRowsByTable,
      );
      const authoritativeGateway = createAuthoritativeCacheGateway(writableCache, {
        queryEngine: repairEngine,
      });
      const api = new AdminWebSocketAPI({
        nodeId: 'node-2',
        systemTableCache: createReadOnlyCache(writableCache),
        cacheMutationTarget: writableCache,
        controlPlaneSystemTableGateway: authoritativeGateway,
        sqlQueryEngine: {
          executeRequest: async () => {
            executedQueryCount += 1;
            return {
              success: true,
              rows: [{count: 1}],
              count: 1,
              tableName: 'benchmark_events',
            };
          },
        },
      });

      await api.initialize(0, {listen: false});
      const {ws} = await connectAndReceive(api, 2000, {
        query: {lane: 'load'},
      });

      ws.send(JSON.stringify({
        type: MessageType.QUERY,
        queryId: 'q-load-benchmark-cache-gap-repair',
        sql: 'SELECT count(*) FROM benchmark_events WHERE payload = 1',
      }));

      const result = await waitForMessage(ws);
      const repairReadTables = getAuthoritativeRepairReadTables(
        repairEngine.executeRequestCalls,
      );

      t.equal(result.type, MessageType.QUERY_RESULT,
        'should return query_result envelope');
      t.match(
        result.error,
        /serve not ready: load lane admission denied/,
        'first load-lane observation should defer while the shared owner repairs discovery gaps',
      );
      t.equal(executedQueryCount, 0,
        'initial deferred observation should not execute the benchmark query');
      t.equal(authoritativeGateway.executeReadCalls.length > 0, true,
        'cache-gap admission should trigger an authoritative discovery read');
      t.equal(repairReadTables.includes(TABLES.PARTITIONS), true,
        'background repair should refresh partition rows for schema gap recovery');

      const tablesRefreshObserved = await waitForBackgroundRepairCondition(() =>
        repairEngine.executeRequestCalls.includes(`SELECT * FROM ${TABLES.TABLES}`),
      );
      t.equal(
        tablesRefreshObserved,
        true,
        'background repair should widen to TABLES rows for schema gap recovery',
      );
      ws.send(JSON.stringify({
        type: MessageType.QUERY,
        queryId: 'q-load-benchmark-cache-gap-repair-retry',
        sql: 'SELECT count(*) FROM benchmark_events WHERE payload = 1',
      }));
      const retryResult = await waitForMessage(ws);

      t.equal(retryResult.error, undefined,
        'retried load-lane query should admit once background discovery repair completes');
      t.equal(executedQueryCount, 1,
        'repaired benchmark admission should execute exactly once');

      ws.close();
      await api.shutdown();
    });

  test('AdminWebSocketAPI - load lane admits benchmark table queries on stable local follower',
    async (t) => {
      let executedQueryCount = 0;
      const cache = createPopulatedCache();
      seedTableDiscoveryRowsWithLocalFollower(cache);
      const api = new AdminWebSocketAPI({
        nodeId: 'node-2',
        systemTableCache: cache,
        sqlQueryEngine: {
          executeRequest: async () => {
            executedQueryCount += 1;
            return {
              success: true,
              rows: [{count: 1}],
              count: 1,
              tableName: 'benchmark_events',
            };
          },
        },
      });

      await api.initialize(0, {listen: false});
      const {ws} = await connectAndReceive(api, 2000, {
        query: {lane: 'load'},
      });

      ws.send(JSON.stringify({
        type: MessageType.QUERY,
        queryId: 'q-load-benchmark-ready',
        sql: 'SELECT count(*) FROM benchmark_events WHERE payload = 1',
      }));

      const result = await waitForMessage(ws);
      t.equal(result.type, MessageType.QUERY_RESULT,
        'should return query_result envelope');
      t.equal(result.error, undefined,
        'stable local follower should admit benchmark query');
      t.equal(executedQueryCount, 1,
        'admitted benchmark query should execute exactly once');

      ws.close();
      await api.shutdown();
    });

  test('AdminWebSocketAPI - load lane admits local voter-ready benchmark queries through transient schema and leadership jitter',
    async (t) => {
      let executedQueryCount = 0;
      const cache = createPopulatedCache();
      const api = new AdminWebSocketAPI({
        nodeId: 'node-2',
        systemTableCache: cache,
        sqlQueryEngine: {
          executeRequest: async () => {
            executedQueryCount += 1;
            return {
              success: true,
              rows: [{count: 1}],
              count: 1,
              tableName: 'benchmark_events',
            };
          },
        },
      });

      api.serviceDiscovery.resolveServiceDiscoverySnapshot = async () => ({
        services: [{
          serviceId: 'sys-admin-meta',
          serviceIds: ['sys-admin-meta'],
          protocol: 'websocket',
          replicas: [{
            nodeId: 'node-2',
            benchmarkAdmission: {
              state: 'blocked',
              routingReady: true,
              localReplicaRole: 'follower',
              degradedByOperationIds: [],
              reasons: [
                {code: 'schema_partition_unavailable'},
                {code: 'leadership_unstable'},
              ],
            },
          }],
        }],
      });

      await api.initialize(0, {listen: false});
      const {ws} = await connectAndReceive(api, 2000, {
        query: {lane: 'load'},
      });

      ws.send(JSON.stringify({
        type: MessageType.QUERY,
        queryId: 'q-load-benchmark-soft-blocker',
        sql: 'SELECT count(*) FROM benchmark_events WHERE payload = 1',
      }));

      const result = await waitForMessage(ws);
      t.equal(result.type, MessageType.QUERY_RESULT,
        'should return query_result envelope');
      t.equal(result.error, undefined,
        'load lane should execute through transient schema+leadership jitter when local voter is ready');
      t.equal(executedQueryCount, 1,
        'soft schema/leadership blockers should not reject before SQL execution');

      ws.close();
      await api.shutdown();
    });

  test('AdminWebSocketAPI - load lane admits readiness-only benchmark queries through transient schema and leadership jitter',
    async (t) => {
      let executedQueryCount = 0;
      const cache = createPopulatedCache();
      const api = new AdminWebSocketAPI({
        nodeId: 'node-2',
        systemTableCache: cache,
        sqlQueryEngine: {
          executeRequest: async () => {
            executedQueryCount += 1;
            return {
              success: true,
              rows: [{count: 1}],
              count: 1,
              tableName: 'benchmark_events',
            };
          },
        },
      });

      api.serviceDiscovery.resolveServiceDiscoverySnapshot = async () => ({
        services: [{
          serviceId: 'sys-admin-meta',
          serviceIds: ['sys-admin-meta'],
          protocol: 'websocket',
          replicas: [{
            nodeId: 'node-2',
            readiness: {
              benchmarkReady: false,
              routingReady: true,
              reasons: [
                {code: 'schema_partition_unavailable'},
                {code: 'leadership_unstable'},
              ],
            },
          }],
        }],
      });

      await api.initialize(0, {listen: false});
      const {ws} = await connectAndReceive(api, 2000, {
        query: {lane: 'load'},
      });

      ws.send(JSON.stringify({
        type: MessageType.QUERY,
        queryId: 'q-load-benchmark-soft-blocker-readiness-only',
        sql: 'SELECT count(*) FROM benchmark_events WHERE payload = 1',
      }));

      const result = await waitForMessage(ws);
      t.equal(result.type, MessageType.QUERY_RESULT,
        'should return query_result envelope');
      t.equal(result.error, undefined,
        'load lane should execute through transient schema+leadership jitter when only readiness fallback is available');
      t.equal(executedQueryCount, 1,
        'readiness-only soft blockers should not reject before SQL execution');

      ws.close();
      await api.shutdown();
    });

  test('AdminWebSocketAPI - load lane admits benchmark queries using boot-time sys-admin-meta websocket endpoint when sys-postgres-wire has 0 replicas',
    async (t) => {
      let executedQueryCount = 0;
      const cache = createPopulatedCache();
      cache.applySystemTableChange(TABLES.SERVICE_DEFINITIONS, 'INSERT', {
        service_id: 'sys-admin-meta',
        name: 'Admin & Control Plane API',
        type: 'meta',
        protocol: 'websocket',
        default_port: 8080,
        status: 'active',
        updated_at: 1000,
      });
      cache.applySystemTableChange(TABLES.SERVICE_ENDPOINTS, 'INSERT', {
        endpoint_id: 'ep-sys-admin-meta-node-1',
        service_id: 'sys-admin-meta',
        node_id: 'node-1',
        address: 'localhost',
        port: 8080,
        protocol: 'websocket',
        health_status: 'healthy',
        endpoint_incarnation: FIXTURE_ENDPOINT_INCARNATION,
        updated_at: 1000,
      });
      cache.applySystemTableChange(TABLES.TABLES, 'INSERT', {
        table_id: 'tbl-ratings',
        table_name: 'ratings',
        schema_json: JSON.stringify({
          tableName: 'ratings',
          columns: [{name: 'userId', type: ' INTEGER', primaryKey: true}],
        }),
        partition_count: 1,
        status: 'active',
        updated_at: 1000,
      });
      cache.applySystemTableChange(TABLES.PARTITIONS, 'INSERT', {
        id: 'ratings-p1',
        partition_id: 'ratings-p1',
        table_name: 'ratings',
        shard_id: 0,
        leader_node_id: 'node-1',
        raft_term: 1,
        status: 'active',
        updated_at: 1000,
      });
      cache.applySystemTableChange(TABLES.SERVICES, 'INSERT', {
        service_id: 'ratings-p1-r1',
        service_type: 'partition',
        node_id: 'node-1',
        partition_id: 'ratings-p1',
        replica_id: 'ratings-p1-r1',
        raft_role: 'leader',
        status: 'active',
        address: 'node-1/partition/ratings-p1-r1',
        updated_at: 1000,
      });

      const api = new AdminWebSocketAPI({
        nodeId: 'node-1',
        systemTableCache: cache,
        sqlQueryEngine: {
          executeRequest: async () => {
            executedQueryCount += 1;
            return {
              success: true,
              rows: [{count: 42}],
              count: 1,
              tableName: 'ratings',
            };
          },
        },
      });

      await api.initialize(0, {listen: false});
      const {ws} = await connectAndReceive(api, 2000, {
        query: {lane: 'load'},
      });

      ws.send(JSON.stringify({
        type: MessageType.QUERY,
        queryId: 'q-load-boot-admin-meta-only',
        sql: 'SELECT COUNT(*) AS count FROM ratings WHERE userId = 1',
      }));

      const result = await waitForMessage(ws);
      t.equal(result.type, MessageType.QUERY_RESULT,
        'should return query_result envelope when only sys-admin-meta endpoint is registered');
      t.equal(result.error, undefined,
        'load lane admission must succeed via sys-admin-meta without requiring scaled sys-postgres-wire');
      t.equal(executedQueryCount, 1,
        'query should execute on the admitted load lane');

      ws.close();
      await api.shutdown();
    });

  test('AdminWebSocketAPI - load lane awaits readServeEligibility when serveEligibility is unavailable_stale and surfaces committed reason on denial',
    async (t) => {
      let readServeEligibilityCount = 0;
      let serveEligibilityState = {
        state: 'unavailable',
        reason: 'unavailable_stale',
      };
      let lastMaxCachedAgeMs = null;
      const cache = createPopulatedCache();
      const api = new AdminWebSocketAPI({
        nodeId: 'node-2',
        systemTableCache: cache,
        controlPlaneReadinessService: {
          answerServeEligibility() {
            return serveEligibilityState;
          },
          async readServeEligibility() {
            readServeEligibilityCount += 1;
            if (readServeEligibilityCount === 1) {
              serveEligibilityState = {
                state: 'ready',
                decision: 'eligible',
                reasons: [],
              };
            }
            return serveEligibilityState;
          },
          async getNodeReadiness(_nodeId, options = {}) {
            lastMaxCachedAgeMs = options.maxCachedAgeMs;
            const eligible =
              serveEligibilityState?.state === 'ready' &&
              serveEligibilityState?.decision === 'eligible';
            return {
              dimensions: {
                serveEligible: eligible,
              },
              reasons: [],
              serveEligibility: serveEligibilityState,
            };
          },
        },
        sqlQueryEngine: {
          executeRequest: async () => ({
            success: true,
            rows: [{count: 1}],
            count: 1,
            tableName: 'benchmark_events',
          }),
        },
      });

      await api.initialize(0, {listen: false});
      const {ws} = await connectAndReceive(api, 2000, {
        query: {lane: 'load'},
      });

      ws.send(JSON.stringify({
        type: MessageType.QUERY,
        queryId: 'q-load-refresh-admitted',
        sql: 'SELECT 1',
      }));
      const admittedResult = await waitForMessage(ws);
      t.equal(
        admittedResult.type,
        MessageType.QUERY_RESULT,
        'should return query_result envelope after refreshed serve eligibility',
      );
      t.equal(
        admittedResult.error,
        undefined,
        'load lane query should succeed once readServeEligibility resolves eligible',
      );
      t.equal(
        readServeEligibilityCount,
        1,
        'load lane admission should await readServeEligibility when answerServeEligibility is unavailable_stale',
      );
      t.equal(
        lastMaxCachedAgeMs,
        0,
        'post-refresh readiness lookup should bypass cached snapshots via maxCachedAgeMs=0',
      );

      serveEligibilityState = {
        state: 'unavailable',
        reason: 'committed_read_failed',
      };
      ws.send(JSON.stringify({
        type: MessageType.QUERY,
        queryId: 'q-load-refresh-denied',
        sql: 'SELECT 1',
      }));
      const deniedResult = await waitForMessage(ws);
      t.equal(
        deniedResult.type,
        MessageType.QUERY_RESULT,
        'blocked load lane query should return query_result error envelope',
      );
      t.equal(
        deniedResult.errorCode,
        ErrorCode.INTERNAL_ERROR,
        'blocked load lane admission should return typed internal error code',
      );
      t.equal(
        deniedResult.deferRetry,
        true,
        'blocked load lane admission should mark retry deferral',
      );
      t.match(
        String(deniedResult.error || ''),
        /reasons=committed_read_failed/,
        'blocked load lane admission should surface committed serveEligibility reason when projection reasons are empty',
      );

      ws.close();
      await api.shutdown();
    });
}

export function registerAdminWebSocketApiLoadBenchmarkTests({
  test,
  AdminWebSocketAPI,
  MessageType,
  ErrorCode,
  createReadOnlyCache,
  getSystemCachePrimaryKeyField,
  createMockQueryEngine,
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

  function createSystemTableRepairQueryEngine(rowsByTable = {}) {
    const fallback = createMockQueryEngine();
    const executeRequestCalls = [];
    return {
      executeRequestCalls,
      async executeRequest(request) {
        const statement = String(request?.statement || '').trim();
        executeRequestCalls.push(statement);
        const match = statement.match(/^select \* from ([a-z_]+)$/i);
        if (!match) {
          return fallback.executeRequest(request);
        }
        const tableName = match[1].toLowerCase();
        const value = rowsByTable[tableName];
        const rows = typeof value === 'function' ? value(tableName) : value;
        return {
          success: true,
          rows: Array.isArray(rows) ? rows.map((row) => ({...row})) : [],
          count: Array.isArray(rows) ? rows.length : 0,
          partitions: [`partition-${tableName}`],
          tableName,
        };
      },
    };
  }

  function getAuthoritativeRepairReadTables(statements = []) {
    return [...new Set((Array.isArray(statements) ? statements : [])
      .map((statement) => {
        const match = String(statement || '').match(/^SELECT \* FROM ([a-z_]+)$/i);
        return match ? match[1].toLowerCase() : null;
      })
      .filter(Boolean))]
      .sort();
  }

  function createAuthoritativeCacheGateway(writableCache, options = {}) {
    const queryEngine = options.queryEngine || null;
    const readRowsByTable = options.readRowsByTable || {};
    const executeReadCalls = [];
    const cloneRows = (rows) => Array.isArray(rows) ?
      rows.map((row) => ({...row})) :
      [];
    const resolveAuthoritativeRows = async (tableName, readIntent = {}) => {
      const tableOverride = readRowsByTable[tableName];
      if (typeof tableOverride === 'function') {
        return cloneRows(await tableOverride(tableName, readIntent));
      }
      if (Array.isArray(tableOverride)) {
        return cloneRows(tableOverride);
      }

      if (queryEngine && typeof queryEngine.executeRequest === 'function') {
        const queryResult = await queryEngine.executeRequest({
          statement: readIntent?.sql || `SELECT * FROM ${tableName}`,
          params: Array.isArray(readIntent?.params) ? readIntent.params : [],
        });
        if (queryResult?.success !== true) {
          return null;
        }
        return cloneRows(queryResult?.rows);
      }

      return cloneRows(writableCache?.getAll(tableName));
    };

    return {
      executeReadCalls,
      async executeRead(readIntent = {}, readOptions = {}) {
        const statement = String(readIntent?.sql || '').trim();
        const statementMatch = statement.match(/^select \* from ([a-z_]+)$/i);
        const tableName = String(
          readIntent?.tableName ||
            statementMatch?.[1] ||
            '',
        )
          .trim()
          .toLowerCase();
        executeReadCalls.push({
          tableName,
          sql: statement,
          strategy: readIntent?.strategy || null,
          owner: readIntent?.owner || null,
          options: {...readOptions},
        });
        if (tableName.length === 0) {
          return {
            success: false,
            tableName: null,
            rows: [],
            error: 'table_name_required',
          };
        }
        const rows = await resolveAuthoritativeRows(tableName, readIntent);
        if (!rows) {
          return {
            success: false,
            tableName,
            rows: [],
            error: 'authoritative_query_failed',
          };
        }
        return {
          success: true,
          tableName,
          rows,
        };
      },
      async reconcileAuthoritativeCacheRows(
        tableName,
        authoritativeRows,
        options = {},
      ) {
        const cacheTarget = options.cacheMutationTarget || writableCache;
        const keyField =
          options.primaryKeyField || getSystemCachePrimaryKeyField(tableName);
        const cachedRows = Array.isArray(options.cachedRows) ?
          options.cachedRows :
          cacheTarget.getAll(tableName);
        const cachedByKey = new Map(
          cachedRows
            .map((row) => [String(row?.[keyField] || ''), row])
            .filter(([key]) => key.length > 0),
        );
        const authoritativeByKey = new Map(
          (Array.isArray(authoritativeRows) ? authoritativeRows : [])
            .map((row) => [String(row?.[keyField] || ''), row])
            .filter(([key]) => key.length > 0),
        );
        let mutationCount = 0;

        for (const [key, row] of authoritativeByKey.entries()) {
          cacheTarget.applySystemTableChange(
            tableName,
            cachedByKey.has(key) ? 'UPDATE' : 'INSERT',
            {...row},
          );
          mutationCount += 1;
        }

        for (const [key, row] of cachedByKey.entries()) {
          if (authoritativeByKey.has(key)) {
            continue;
          }
          cacheTarget.applySystemTableChange(tableName, 'DELETE', {...row});
          mutationCount += 1;
        }

        return {
          success: true,
          mutationCount,
        };
      },
    };
  }

  function seedRoutedTableDiscoveryRows(cache) {
    const updatedAt = Date.now();

    cache.applySystemTableChange(TABLES.NODES, 'INSERT', {
      id: 'node-2',
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
      id: 'service-benchmark-events-node-1',
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
      id: 'service-benchmark-events-node-2',
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
      id: 'service-benchmark-events-node-2',
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
}

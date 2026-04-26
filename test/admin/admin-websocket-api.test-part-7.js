/**
 * Tests for Admin WebSocket API.
 * Requirements: 32.1-32.39
 */

import {test} from '../../src/test-helpers/tap.js';
import {AdminWebSocketAPI, MessageType, ErrorCode} from
  '../../src/admin/admin-websocket-api.js';
import {
} from '../../src/admin/admin-constants.js';
import {createReadOnlyCache} from '../../src/cache/read-only-system-table-cache.js';
import {ConfigurationManager} from '../../src/config/configuration-manager.js';
import {LoggingService} from '../../src/logging/logging-service.js';
import {createInProcWebSocketPair} from '../../src/test-helpers/inproc-ws.js';
import {TraceCollector} from '../../src/debug/trace-collector.js';
import {TABLES} from '../../src/constants/index.js';
import {
  CONTROL_PLANE_READINESS_DIMENSION,
} from '../../src/control-plane/control-plane-readiness-constants.js';
import {
} from '../../src/control-plane/control-plane-snapshot-owner.js';

// Initialize services for tests
ConfigurationManager.getInstance().initialize();
LoggingService.getInstance().initialize({level: 'error'});

const BACKGROUND_REPAIR_SETTLE_TURNS = 8;
const BACKGROUND_REPAIR_SETTLE_DELAY_MS = 0;


/**
 * Create a mock SQL query engine.
 * @return {Object} Mock query engine.
 */
function createMockQueryEngine() {
  return {
    executeRequest: async (request) => {
      const sqlLower = request.statement.toLowerCase().trim();

      // Check for error conditions first (before checking statement type)
      if (sqlLower.includes('invalid_table')) {
        return {
          success: false,
          error: 'Table not found: invalid_table',
          errorCode: 'TABLE_NOT_FOUND',
        };
      } else if (sqlLower.includes('syntax_error')) {
        throw new Error('Parse error: syntax error near syntax_error');
      } else if (sqlLower.startsWith('select')) {
        return {
          success: true,
          rows: [{id: '1', name: 'test'}],
          count: 1,
          partitions: ['partition-1'],
          tableName: 'test_table',
        };
      } else if (sqlLower.startsWith('insert')) {
        return {
          success: true,
          operation: 'INSERT',
          affectedRows: 1,
          partitions: ['partition-1'],
          tableName: 'test_table',
        };
      } else if (sqlLower.startsWith('update')) {
        return {
          success: true,
          operation: 'UPDATE',
          affectedRows: 2,
          partitions: ['partition-1'],
          tableName: 'test_table',
        };
      } else if (sqlLower.startsWith('delete')) {
        return {
          success: true,
          operation: 'DELETE',
          affectedRows: 1,
          partitions: ['partition-1'],
          tableName: 'test_table',
        };
      }

      return {success: true, rows: [], count: 0};
    },
  };
}

/**
 * Create a mock query engine that returns authoritative rows per system table.
 * @param {Object<string, Array<Object>|Function>} rowsByTable
 * @return {Object}
 */
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

test(
  'AdminWebSocketAPI - local discovery ignores buffered CDC state for user tables',
  async (t) => {
    const cache = createPopulatedCache();
    seedTableDiscoveryRowsWithLocalFollower(cache);
    const api = new AdminWebSocketAPI({
      nodeId: 'node-2',
      systemTableCache: cache,
      sqlQueryEngine: createMockQueryEngine(),
      partitionServices: new Map([
        ['partition-benchmark-events-1', {
          partitionId: 'partition-benchmark-events-1',
          getCDCSubscriptionDiagnostics() {
            return {
              subscriberCount: 1,
              bufferedEvents: 3,
              bufferReplayInFlight: true,
            };
          },
        }],
      ]),
    });

    await api.initialize(0, {listen: false});
    const {ws} = await connectAndReceive(api);

    ws.send(JSON.stringify({
      type: MessageType.QUERY,
      queryId: 'q-local-cdc-buffered',
      sql: 'SELECT * FROM service_discovery_local(\'benchmark_events\')',
    }));
    const response = await waitForMessage(ws);

    t.equal(response.type, MessageType.QUERY_RESULT, 'should return query_result');
    const replicas = Array.isArray(response?.results?.[0]?.services?.[0]?.replicas) ?
      response.results[0].services[0].replicas :
      [];
    const readinessByNodeId = new Map(replicas.map((replica) => [
      String(replica?.nodeId || ''),
      replica?.readiness || null,
    ]));

    t.equal(
      readinessByNodeId.get('node-2')?.topologyReady,
      true,
      'user-table local followers should ignore system CDC buffer state',
    );
    t.equal(
      readinessByNodeId.get('node-2')?.benchmarkReady,
      true,
      'user-table local followers should remain benchmark ready despite system CDC buffer state',
    );
    t.equal(
      readinessByNodeId.get('node-2')?.reasons?.some((reason) =>
        reason.code === 'local_cdc_buffer_not_drained'),
      false,
      'user-table readiness should not report system CDC buffer state',
    );
    t.equal(
      replicas.find((replica) => replica?.nodeId === 'node-2')?.benchmarkAdmission?.state,
      'ready',
      'user-table local follower should publish ready benchmark admission state',
    );
    t.same(
      replicas.find((replica) => replica?.nodeId === 'node-2')?.benchmarkAdmission?.reasons,
      [],
      'ready benchmark admission should not carry blocker reasons',
    );

    ws.close();
    await api.shutdown();
  },
);

test(
  'AdminWebSocketAPI - table-scoped discovery ignores unrelated replica operations',
  async (t) => {
    const cache = createPopulatedCache();
    seedRoutedTableDiscoveryRows(cache);
    cache.applySystemTableChange(TABLES.REPLICA_OPERATIONS, 'INSERT', {
      operation_id: 'op-unrelated',
      partition_id: 'partition-unrelated-1',
      entity_id: 'partition-unrelated-1',
      status: 'creating',
    });
    const api = new AdminWebSocketAPI({
      nodeId: 'test-node',
      systemTableCache: cache,
      sqlQueryEngine: createMockQueryEngine(),
    });

    await api.initialize(0, {listen: false});
    const response = await api.getFastify().inject({
      method: 'GET',
      url: '/api/admin/discovery/services?' +
        'serviceId=sys-postgres-wire&protocol=postgresql&tableName=benchmark_events',
    });
    const payload = response.json();

    t.equal(response.statusCode, 200, 'should return 200');
    const replicas = Array.isArray(payload?.services?.[0]?.replicas) ?
      payload.services[0].replicas :
      [];
    const readinessByNodeId = new Map(replicas.map((replica) => [
      String(replica?.nodeId || ''),
      replica?.readiness || null,
    ]));

    t.equal(
      readinessByNodeId.get('node-1')?.topologyReady,
      true,
      'unrelated replica operations should not block target-partition topology',
    );
    t.equal(
      readinessByNodeId.get('node-1')?.benchmarkReady,
      true,
      'leader-hosting node should stay benchmark ready when only unrelated ops exist',
    );
    t.equal(
      readinessByNodeId.get('node-2')?.benchmarkReady,
      true,
      'routed peer should stay benchmark ready when unrelated ops are in flight',
    );
    t.equal(
      readinessByNodeId.get('node-1')?.reasons?.some((reason) =>
        reason.code === 'replica_operations_in_flight'),
      false,
      'readiness should not report unrelated replica operation pressure',
    );

    await api.shutdown();
  },
);

test(
  'AdminWebSocketAPI - table-scoped discovery falls back to partition schema watermark',
  async (t) => {
    const expectedSchemaVersion = 1740589945999;
    const cache = createPopulatedCache();
    seedPartitionScopedDiscoveryRowsWithoutTableRecord(cache, expectedSchemaVersion);
    const api = new AdminWebSocketAPI({
      nodeId: 'test-node',
      systemTableCache: cache,
      sqlQueryEngine: createMockQueryEngine(),
    });

    await api.initialize(0, {listen: false});
    const response = await api.getFastify().inject({
      method: 'GET',
      url: '/api/admin/discovery/services?' +
        'serviceId=sys-postgres-wire&protocol=postgresql&tableName=benchmark_events',
    });
    const payload = response.json();

    t.equal(response.statusCode, 200, 'should return 200');
    const readiness = payload.services[0].replicas[0].readiness;
    t.equal(
      readiness.schemaReady,
      true,
      'partition coverage should keep schema readiness true',
    );
    t.equal(
      readiness.appliedSchemaVersion,
      String(expectedSchemaVersion),
      'readiness should expose partition-derived schema watermark',
    );
    t.equal(
      readiness.benchmarkReady,
      true,
      'benchmark readiness should remain true when partition watermark is available',
    );

    await api.shutdown();
  },
);

test(
  'AdminWebSocketAPI - local discovery query supports table-id hints',
  async (t) => {
    const expectedSchemaVersion = 1740589946999;
    const cache = createPopulatedCache();
    seedPartitionScopedDiscoveryRowsWithoutTableName(cache, expectedSchemaVersion);
    const api = new AdminWebSocketAPI({
      nodeId: 'test-node',
      systemTableCache: cache,
      sqlQueryEngine: createMockQueryEngine(),
    });

    await api.initialize(0, {listen: false});
    const {ws} = await connectAndReceive(api);

    ws.send(JSON.stringify({
      type: MessageType.QUERY,
      queryId: 'q-table-id-hint',
      sql: 'SELECT * FROM service_discovery_local(' +
        '\'benchmark_events\', \'table-benchmark-events\')',
    }));
    const response = await waitForMessage(ws);

    t.equal(response.type, MessageType.QUERY_RESULT, 'should return query_result');
    t.equal(response.queryId, 'q-table-id-hint', 'should preserve query id');
    t.equal(Array.isArray(response.results), true, 'should include one snapshot row');
    t.equal(response.results.length, 1, 'should return one discovery snapshot');

    const readiness =
      response.results[0]?.services?.[0]?.replicas?.[0]?.readiness || null;
    t.equal(
      readiness?.schemaReady,
      true,
      'table-id hint should resolve partition-scoped schema readiness',
    );
    t.equal(
      readiness?.appliedSchemaVersion,
      String(expectedSchemaVersion),
      'table-id hint should expose partition-derived schema watermark',
    );

    ws.close();
    await api.shutdown();
  },
);

test(
  'AdminWebSocketAPI - preflight cache freshness keeps unknown watermark as null',
  async (t) => {
    const api = new AdminWebSocketAPI({
      nodeId: 'test-node',
      systemTableCache: {
        getAll() {
          return [];
        },
        count() {
          return 0;
        },
        getLastAppliedAtMs() {
          return null;
        },
        getLastAppliedCauseId() {
          return null;
        },
        getAppliedSchemaVersion() {
          return null;
        },
      },
    });

    const cacheFreshness = api.buildPreflightCacheFreshnessSummary({
      capturedAtMs: 12345,
    });

    t.equal(
      cacheFreshness.lastAppliedAtMs,
      null,
      'unknown watermark must remain null in snapshot output',
    );
    t.equal(
      cacheFreshness.stalenessMs,
      null,
      'unknown watermark must not coerce staleness to a synthetic value',
    );
  },
);

test(
  'AdminWebSocketAPI - preflight snapshot repairs stale cache watermark',
  async (t) => {
    const writableCache = createPopulatedCache();
    seedServiceDiscoveryRows(writableCache);
    writableCache.lastAppliedAtMsByTableName.set(
      TABLES.SERVICE_ENDPOINTS,
      Date.now() - 10000,
    );
    const cache = createReadOnlyCache(writableCache);

    const repairEngine = createSystemTableRepairQueryEngine({
      [TABLES.NODES]: writableCache.getAll(TABLES.NODES),
      [TABLES.PARTITIONS]: writableCache.getAll(TABLES.PARTITIONS),
      [TABLES.SERVICES]: writableCache.getAll(TABLES.SERVICES),
      [TABLES.TABLES]: writableCache.getAll(TABLES.TABLES),
      [TABLES.NODE_ENDPOINTS]: writableCache.getAll(TABLES.NODE_ENDPOINTS),
      [TABLES.SERVICE_DEFINITIONS]: writableCache.getAll(TABLES.SERVICE_DEFINITIONS),
      [TABLES.SERVICE_ENDPOINTS]: writableCache.getAll(TABLES.SERVICE_ENDPOINTS),
      [TABLES.REPLICA_OPERATIONS]: writableCache.getAll(TABLES.REPLICA_OPERATIONS),
    });
    const api = new AdminWebSocketAPI({
      nodeId: 'test-node',
      systemTableCache: cache,
      cacheMutationTarget: writableCache,
      controlPlaneSystemTableGateway: createAuthoritativeCacheGateway(writableCache, {
        queryEngine: repairEngine,
      }),
      sqlQueryEngine: repairEngine,
    });

    const result = await api.buildPreflightCriticalPathSnapshotQueryResult();
    const snapshot = result?.rows?.[0] || null;
    const stalenessMs = Number(snapshot?.cacheFreshness?.stalenessMs);

    t.equal(
      Number.isFinite(stalenessMs) && stalenessMs < 5000,
      true,
      'preflight repair should refresh stale cache watermark before responding',
    );
    t.equal(
      repairEngine.executeRequestCalls.includes(
        `SELECT * FROM ${TABLES.SERVICE_ENDPOINTS}`,
      ),
      true,
      'preflight repair should query authoritative service endpoints',
    );
  },
);

test(
  'AdminWebSocketAPI - preflight snapshot does not block on slow authoritative repair',
  async (t) => {
    const writableCache = createPopulatedCache();
    seedServiceDiscoveryRows(writableCache);
    writableCache.lastAppliedAtMsByTableName.set(
      TABLES.SERVICE_ENDPOINTS,
      Date.now() - 10000,
    );
    const api = new AdminWebSocketAPI({
      nodeId: 'test-node',
      systemTableCache: createReadOnlyCache(writableCache),
      cacheMutationTarget: writableCache,
      sqlQueryEngine: createMockQueryEngine(),
    });

    let repairAttempts = 0;
    api.preflightSnapshot.authoritativeRepairWaitBudgetMs = 10;
    api.preflightSnapshot.ensureAuthoritativeDiscoveryCacheRepair = async () => {
      repairAttempts++;
      await new Promise((resolve) => setTimeout(resolve, 50));
      return {applied: true, skipped: false, tableCount: 1};
    };

    const outcome = await Promise.race([
      api.buildPreflightCriticalPathSnapshotQueryResult(),
      new Promise((resolve) => setTimeout(() => resolve('timed_out'), 25)),
    ]);

    t.not(
      outcome,
      'timed_out',
      'preflight snapshot should return without waiting for slow repair',
    );
    t.equal(
      repairAttempts,
      1,
      'preflight snapshot should still trigger authoritative repair once',
    );
  },
);

test('AdminWebSocketAPI - cleanup on disconnect', async (t) => {
  const api = new AdminWebSocketAPI({
    nodeId: 'test-node',
    systemTableCache: createPopulatedCache(),
  });

  await api.initialize(0, {listen: false});
  const {ws} = await connectAndReceive(api);

  t.equal(api.getClientCount(), 1, 'should have 1 client');

  ws.close();
  await new Promise((resolve) => setTimeout(resolve, 50));

  t.equal(api.getClientCount(), 0, 'should have 0 clients after disconnect');

  await api.shutdown();
});

test('AdminWebSocketAPI - query without queryId', async (t) => {
  const api = new AdminWebSocketAPI({
    nodeId: 'test-node',
    systemTableCache: createPopulatedCache(),
    sqlQueryEngine: createMockQueryEngine(),
  });

  await api.initialize(0, {listen: false});
  const {ws} = await connectAndReceive(api);

  ws.send(JSON.stringify({type: MessageType.QUERY, sql: 'SELECT 1'}));

  const result = await waitForMessage(ws);

  t.ok(result.error, 'should have error');
  t.equal(result.errorCode, ErrorCode.MALFORMED_JSON, 'should have error code');

  ws.close();
  await api.shutdown();
});

test('AdminWebSocketAPI - query without sql', async (t) => {
  const api = new AdminWebSocketAPI({
    nodeId: 'test-node',
    systemTableCache: createPopulatedCache(),
    sqlQueryEngine: createMockQueryEngine(),
  });

  await api.initialize(0, {listen: false});
  const {ws} = await connectAndReceive(api);

  ws.send(JSON.stringify({type: MessageType.QUERY, queryId: 'q8'}));

  const result = await waitForMessage(ws);

  t.equal(result.queryId, 'q8', 'should have queryId');
  t.ok(result.error, 'should have error');
  t.equal(result.errorCode, ErrorCode.SYNTAX_ERROR, 'should have error code');

  ws.close();
  await api.shutdown();
});

test('AdminWebSocketAPI - dashboard landing page', async (t) => {
  const api = new AdminWebSocketAPI({
    nodeId: 'test-node',
    testRunService: createMockTestRunService({
      readDashboardPage: async () => '<html><body>landing-page</body></html>',
    }),
  });

  await api.initialize(0, {listen: false});

  const response = await api.getFastify().inject({method: 'GET', url: '/'});
  t.equal(response.statusCode, 200, 'should return 200');
  t.equal(
    response.headers['content-type'],
    'text/html; charset=utf-8',
    'should return html content type',
  );
  t.equal(
    response.headers['cache-control'],
    'no-store',
    'should disable dashboard page caching',
  );
  t.match(response.body, /landing-page/, 'should return dashboard html');

  await api.shutdown();
});

test('AdminWebSocketAPI - test catalog endpoint', async (t) => {
  const api = new AdminWebSocketAPI({
    nodeId: 'test-node',
    testRunService: createMockTestRunService({
      listAvailableTests: async () => [
        {id: 'alpha', file: 'test/distributed/scenarios/alpha.js'},
      ],
      listAvailableConfigs: async () => [
        {id: 'local.json', file: 'test/distributed/config/local.json'},
      ],
    }),
  });

  await api.initialize(0, {listen: false});

  const response = await api.getFastify().inject({
    method: 'GET',
    url: '/api/admin/tests',
  });
  const payload = response.json();
  t.equal(response.statusCode, 200, 'should return 200');
  t.equal(payload.tests.length, 1, 'should include test entries');
  t.equal(payload.tests[0].id, 'alpha', 'should return scenario id');
  t.equal(payload.configs.length, 1, 'should include config entries');
  t.equal(payload.defaultConfig, 'local.json',
    'should publish default config for UI selection');

  await api.shutdown();
});

test('AdminWebSocketAPI - start/stop test run endpoints', async (t) => {
  const run = {
    runId: 'run-1',
    scenario: 'alpha',
    status: 'running',
  };
  const api = new AdminWebSocketAPI({
    nodeId: 'test-node',
    testRunService: createMockTestRunService({
      startRun: async (_payload) => run,
      stopRun: async (_runId) => ({...run, status: 'stopping'}),
    }),
  });

  await api.initialize(0, {listen: false});

  const startResponse = await api.getFastify().inject({
    method: 'POST',
    url: '/api/admin/test-runs',
    payload: {scenario: 'alpha', config: 'local.json'},
  });
  t.equal(startResponse.statusCode, 200, 'should start run');
  t.equal(startResponse.json().run.runId, 'run-1', 'should return run id');

  const stopResponse = await api.getFastify().inject({
    method: 'POST',
    url: '/api/admin/test-runs/run-1/stop',
  });
  t.equal(stopResponse.statusCode, 200, 'should stop run');
  t.equal(stopResponse.json().run.status, 'stopping', 'should return stop status');

  await api.shutdown();
});

test('AdminWebSocketAPI - delete test run endpoint', async (t) => {
  const api = new AdminWebSocketAPI({
    nodeId: 'test-node',
    testRunService: createMockTestRunService({
      deleteRun: async (runId) => ({
        runId,
        deleted: true,
        removed: {metadata: true, report: true},
      }),
    }),
  });

  await api.initialize(0, {listen: false});

  const response = await api.getFastify().inject({
    method: 'DELETE',
    url: '/api/admin/test-runs/run-to-delete',
  });
  const payload = response.json();
  t.equal(response.statusCode, 200, 'should delete run');
  t.equal(payload.deleted, true, 'should return deleted flag');
  t.equal(payload.runId, 'run-to-delete', 'should return deleted run id');

  await api.shutdown();
});

test('AdminWebSocketAPI - output asset endpoint', async (t) => {
  const api = new AdminWebSocketAPI({
    nodeId: 'test-node',
    testRunService: createMockTestRunService({
      readOutputAsset: async (_path) => ({
        contentType: 'application/json; charset=utf-8',
        body: Buffer.from('{"ok":true}', 'utf8'),
      }),
    }),
  });

  await api.initialize(0, {listen: false});

  const response = await api.getFastify().inject({
    method: 'GET',
    url: '/ui/test-output/alpha/report.json',
  });
  t.equal(response.statusCode, 200, 'should return output file');
  t.equal(response.headers['content-type'], 'application/json; charset=utf-8');
  t.same(response.json(), {ok: true}, 'should return requested payload');

  await api.shutdown();
});

test('AdminWebSocketAPI - stream endpoint returns 404 for unknown run', async (t) => {
  const api = new AdminWebSocketAPI({
    nodeId: 'test-node',
    testRunService: createMockTestRunService({
      getRun: async (_runId) => null,
    }),
  });

  await api.initialize(0, {listen: false});
  const response = await api.getFastify().inject({
    method: 'GET',
    url: '/api/admin/test-runs/missing/stream',
  });
  t.equal(response.statusCode, 404, 'should return not found');
  t.equal(response.json().error, 'Test run not found');

  await api.shutdown();
});

test('AdminWebSocketAPI - stream endpoint serves archived run backlog', async (t) => {
  const archivedRun = {
    runId: 'archive-run',
    scenario: 'alpha',
    status: 'passed',
    logs: [{
      timestamp: '2026-02-14T12:00:00.000Z',
      stream: 'archive',
      line: 'archived line',
    }],
  };
  const api = new AdminWebSocketAPI({
    nodeId: 'test-node',
    testRunService: createMockTestRunService({
      getRun: async (_runId) => archivedRun,
      subscribeToRun: (_runId, _listener) => null,
    }),
  });

  await api.initialize(0, {listen: false});
  const response = await api.getFastify().inject({
    method: 'GET',
    url: '/api/admin/test-runs/archive-run/stream',
  });

  t.equal(response.statusCode, 200, 'should return stream response for archived run');
  t.match(response.body, /"type":"status"/, 'should include status frame');
  t.match(response.body, /"type":"log"/, 'should include archived log frame');
  t.match(response.body, /archived line/, 'should include archived log content');

  await api.shutdown();
});

test('AdminWebSocketAPI - debug routes require security headers', async (t) => {
  const api = new AdminWebSocketAPI({
    nodeId: 'test-node',
    debugMetadataStore: createMockDebugMetadataStore(),
  });

  await api.initialize(0, {listen: false});
  const response = await api.getFastify().inject({
    method: 'POST',
    url: '/api/admin/debug/sessions',
    payload: {sessionId: 'session-1', serviceName: 'svc-debug'},
  });

  t.equal(response.statusCode, 401, 'should reject missing security context');
  t.match(response.json().error, /requires tenant and principal headers/);

  await api.shutdown();
});

test('AdminWebSocketAPI - debug session create/get/attach routes', async (t) => {
  const calls = [];
  const api = new AdminWebSocketAPI({
    nodeId: 'test-node',
    debugMetadataStore: createMockDebugMetadataStore({
      createSession: async (request) => {
        calls.push({method: 'createSession', request});
        return {
          sessionId: request.sessionId,
          tenantId: request.securityContext.tenantId,
          serviceName: request.serviceName,
          status: 'active',
          createdAt: Date.now(),
          updatedAt: Date.now(),
        };
      },
      getSession: async (request) => {
        calls.push({method: 'getSession', request});
        return {
          sessionId: request.sessionId,
          tenantId: request.securityContext.tenantId,
          serviceName: 'svc-debug',
          status: 'active',
          createdAt: Date.now(),
          updatedAt: Date.now(),
        };
      },
      attachSession: async (request) => {
        calls.push({method: 'attachSession', request});
        return {
          sessionId: request.sessionId,
          tenantId: request.securityContext.tenantId,
          serviceName: 'svc-debug',
          status: 'active',
          createdAt: Date.now(),
          updatedAt: Date.now(),
        };
      },
    }),
  });

  await api.initialize(0, {listen: false});
  const headers = {
    'x-tenant-id': 'tenant-a',
    'x-principal': 'debug-user',
    'x-roles': 'debug_write,debug_read,debug_attach',
  };

  const createResponse = await api.getFastify().inject({
    method: 'POST',
    url: '/api/admin/debug/sessions',
    headers,
    payload: {
      sessionId: 'session-2',
      serviceName: 'svc-debug',
      lineageId: 'lineage-2',
      endpoint: 'ws://node-a/debug',
    },
  });
  t.equal(createResponse.statusCode, 200, 'should create debug session');
  t.equal(createResponse.json().session.sessionId, 'session-2');

  const getResponse = await api.getFastify().inject({
    method: 'GET',
    url: '/api/admin/debug/sessions/session-2',
    headers,
  });
  t.equal(getResponse.statusCode, 200, 'should fetch debug session');
  t.equal(getResponse.json().session.tenantId, 'tenant-a');

  const attachResponse = await api.getFastify().inject({
    method: 'POST',
    url: '/api/admin/debug/sessions/session-2/attach',
    headers,
  });
  t.equal(attachResponse.statusCode, 200, 'should attach debug session');
  t.equal(attachResponse.json().session.sessionId, 'session-2');

  t.equal(calls.length, 3, 'should route to metadata store methods');
  t.equal(calls[0].request.securityContext.tenantId, 'tenant-a');

  await api.shutdown();
});

test('AdminWebSocketAPI - debug session update/detach routes', async (t) => {
  const calls = [];
  const api = new AdminWebSocketAPI({
    nodeId: 'test-node',
    debugMetadataStore: createMockDebugMetadataStore({
      updateSession: async (request) => {
        calls.push({method: 'updateSession', request});
        return {
          sessionId: request.sessionId,
          tenantId: request.securityContext.tenantId,
          serviceName: request.serviceName || 'svc-debug',
          lineageId: request.lineageId || null,
          stageId: request.stageId || null,
          endpoint: request.endpoint || null,
          nodeId: request.nodeId || null,
          status: request.status || 'active',
          createdAt: Date.now(),
          updatedAt: Date.now(),
        };
      },
      detachSession: async (request) => {
        calls.push({method: 'detachSession', request});
        return {
          sessionId: request.sessionId,
          tenantId: request.securityContext.tenantId,
          serviceName: 'svc-debug',
          lineageId: null,
          stageId: null,
          endpoint: null,
          nodeId: null,
          status: 'detached',
          createdAt: Date.now(),
          updatedAt: Date.now(),
        };
      },
    }),
  });

  await api.initialize(0, {listen: false});
  const headers = {
    'x-tenant-id': 'tenant-a',
    'x-principal': 'debug-user',
    'x-roles': 'debug_write,debug_read,debug_attach',
  };

  const updateResponse = await api.getFastify().inject({
    method: 'PATCH',
    url: '/api/admin/debug/sessions/session-2',
    headers,
    payload: {
      endpoint: 'ws://node-b/debug',
      nodeId: 'node-b',
      lineageId: 'lineage-2',
      stageId: 2,
    },
  });
  t.equal(updateResponse.statusCode, 200, 'should update debug session');
  t.equal(updateResponse.json().session.endpoint, 'ws://node-b/debug');
  t.equal(updateResponse.json().session.nodeId, 'node-b');

  const detachResponse = await api.getFastify().inject({
    method: 'PATCH',
    url: '/api/admin/debug/sessions/session-2',
    headers,
    payload: {
      detach: true,
    },
  });
  t.equal(detachResponse.statusCode, 200, 'should detach debug session');
  t.equal(detachResponse.json().session.status, 'detached');
  t.equal(detachResponse.json().session.endpoint, null);

  t.equal(calls.length, 2, 'should route to update/detach metadata methods');
  t.equal(calls[0].method, 'updateSession');
  t.equal(calls[1].method, 'detachSession');

  await api.shutdown();
});

test('AdminWebSocketAPI - debug breakpoints/snapshots and DAP routes', async (t) => {
  const calls = [];
  const api = new AdminWebSocketAPI({
    nodeId: 'test-node',
    debugMetadataStore: createMockDebugMetadataStore({
      writeBreakpoints: async (request) => {
        calls.push({method: 'writeBreakpoints', request});
        return [{breakpointId: 'bp-1', lineNumber: 10, resolved: true}];
      },
      listBreakpoints: async (request) => {
        calls.push({method: 'listBreakpoints', request});
        return [{breakpointId: 'bp-1', lineNumber: 10, resolved: true}];
      },
      writeSnapshot: async (request) => {
        calls.push({method: 'writeSnapshot', request});
        return {
          snapshotId: 'snapshot-1',
          sessionId: request.sessionId,
          frameCount: 2,
          hostCallCount: 1,
          envelope: Buffer.from([1, 2, 3]),
        };
      },
      getSnapshot: async (request) => {
        calls.push({method: 'getSnapshot', request});
        return {
          snapshotId: request.snapshotId,
          sessionId: request.sessionId || 'session-3',
          frameCount: 2,
          hostCallCount: 1,
          envelope: Buffer.from([1, 2, 3]),
        };
      },
      listSnapshots: async (request) => {
        calls.push({method: 'listSnapshots', request});
        return [{
          snapshotId: 'snapshot-1',
          sessionId: request.sessionId,
          frameCount: 2,
          hostCallCount: 1,
        }];
      },
    }),
    debugDapRouter: {
      async handleRequest(request) {
        calls.push({method: 'dap', request});
        return {ok: true, sessionId: request.sessionId};
      },
    },
  });

  await api.initialize(0, {listen: false});
  const headers = {
    'x-tenant-id': 'tenant-a',
    'x-principal': 'debug-user',
    'x-roles': 'debug_write,debug_read,debug_attach',
  };

  const writeBreakpoints = await api.getFastify().inject({
    method: 'POST',
    url: '/api/admin/debug/sessions/session-3/breakpoints',
    headers,
    payload: {
      moduleRef: 'svc:debug@1.0.0',
      sourceFileUrl: 'file:///src/service.ts',
      breakpoints: [{lineNumber: 10}],
    },
  });
  t.equal(writeBreakpoints.statusCode, 200, 'should write breakpoints');
  t.equal(writeBreakpoints.json().breakpoints.length, 1);

  const listBreakpoints = await api.getFastify().inject({
    method: 'GET',
    url: '/api/admin/debug/sessions/session-3/breakpoints',
    headers,
  });
  t.equal(listBreakpoints.statusCode, 200, 'should list breakpoints');
  t.equal(listBreakpoints.json().breakpoints[0].breakpointId, 'bp-1');

  const writeSnapshot = await api.getFastify().inject({
    method: 'POST',
    url: '/api/admin/debug/sessions/session-3/snapshots',
    headers,
    payload: {
      snapshotArtifact: {
        manifest: {
          snapshotId: 'snapshot-1',
          moduleRef: 'svc:debug@1.0.0',
          moduleDigest: 'sha256:' + 'b'.repeat(64),
        },
        snapshot: {
          moduleRef: 'svc:debug@1.0.0',
          moduleDigest: 'sha256:' + 'b'.repeat(64),
        },
        envelope: [1, 2, 3],
      },
    },
  });
  t.equal(writeSnapshot.statusCode, 200, 'should write snapshot metadata');
  t.equal(writeSnapshot.json().snapshot.envelopeBase64, 'AQID');

  const listSnapshots = await api.getFastify().inject({
    method: 'GET',
    url: '/api/admin/debug/sessions/session-3/snapshots',
    headers,
  });
  t.equal(listSnapshots.statusCode, 200, 'should list snapshots');
  t.equal(listSnapshots.json().snapshots.length, 1);

  const getSnapshot = await api.getFastify().inject({
    method: 'GET',
    url: '/api/admin/debug/snapshots/snapshot-1?sessionId=session-3',
    headers,
  });
  t.equal(getSnapshot.statusCode, 200, 'should fetch snapshot by id');
  t.equal(getSnapshot.json().snapshot.envelopeBase64, 'AQID');

  const dapResponse = await api.getFastify().inject({
    method: 'POST',
    url: '/api/admin/debug/dap/request',
    headers,
    payload: {
      sessionId: 'session-3',
      request: {seq: 1, command: 'threads'},
    },
  });
  t.equal(dapResponse.statusCode, 200, 'should route DAP request');
  t.equal(dapResponse.json().response.ok, true);
  t.equal(calls.some((entry) => entry.method === 'dap'), true);

  await api.shutdown();
});

test('AdminWebSocketAPI - debug trace stream route wiring and filtering', async (t) => {
  const traceCollector = new TraceCollector();
  const api = new AdminWebSocketAPI({
    nodeId: 'test-node',
    traceCollector,
  });

  await api.initialize(0, {listen: false});
  const routes = api.getFastify().printRoutes();
  t.match(routes, /trace \(GET, HEAD\)/,
    'should register debug trace websocket route');

  const {clientSocket, serverSocket} = createInProcWebSocketPair();
  api.debugHandlers.handleDebugTraceConnection(serverSocket, {
    query: {lineagePrefix: 'lineage-allow'},
  });

  traceCollector.emit({
    level: 'info',
    message: 'allowed',
    lineageId: 'lineage-allow-1',
    source: 'service',
  });
  traceCollector.emit({
    level: 'info',
    message: 'blocked',
    lineageId: 'lineage-deny-1',
    source: 'service',
  });

  const first = await waitForMessage(clientSocket);
  t.equal(first.message, 'allowed', 'should receive matching lineage event');
  await waitForNoMessage(clientSocket, 80);

  t.equal(traceCollector.getSubscriberCount(), 1);
  clientSocket.close();
  await new Promise((resolve) => setTimeout(resolve, 20));
  t.equal(traceCollector.getSubscriberCount(), 0,
    'should cleanup subscription on disconnect');

  await api.shutdown();
});

// ============================================================================
// Live Query Wiring Tests
// ============================================================================

test('setSQLQueryEngine refreshes liveQueryManager when admin runtime starts early',
  async (t) => {
    const initializeCalls = [];
    const nodeRows = [
      {
        node_id: 'node-1',
        status: 'active',
        connection_state: 'ready',
        ready_lease_expires_at: 2000,
      },
      {
        node_id: 'node-2',
        status: 'active',
        connection_state: 'ready',
        ready_lease_expires_at: 2000,
      },
    ];
    const serviceRows = [
      {
        service_id: 'svc-1',
        node_id: 'node-1',
        status: 'active',
      },
      {
        service_id: 'svc-2',
        node_id: 'node-2',
        status: 'active',
      },
    ];
    const readinessService = {
      async getAllNodeReadiness() {
        return [
          {
            nodeId: 'node-1',
            dimensions: {
              [CONTROL_PLANE_READINESS_DIMENSION.CLUSTER_MEMBER_HEALTHY]: true,
            },
          },
          {
            nodeId: 'node-2',
            dimensions: {
              [CONTROL_PLANE_READINESS_DIMENSION.CLUSTER_MEMBER_HEALTHY]: true,
            },
          },
        ];
      },
      membershipPublicationService: {
        async getLatestClusterPublication() {
          return {
            publicationEpoch: 11,
            status: 'PUBLISHED',
            publishedActiveNodeIds: ['node-1', 'node-2'],
            requiredAckNodeIds: ['node-1', 'node-2'],
            acknowledgedNodeIds: ['node-1', 'node-2'],
          };
        },
        async getLatestPublishedClusterPublication() {
          return {
            publicationEpoch: 11,
            status: 'PUBLISHED',
            publishedActiveNodeIds: ['node-1', 'node-2'],
          };
        },
      },
    };
    const api = new AdminWebSocketAPI({
      systemTableCache: {
        getAll(tableName) {
          if (tableName === TABLES.NODES) {
            return nodeRows;
          }
          if (tableName === TABLES.SERVICES) {
            return serviceRows;
          }
          return [];
        },
      },
      sqlQueryEngine: null,
      nodeId: 'test-node',
      liveQueryManager: {
        initialized: true,
        isInitialized: () => true,
        initialize: (options) => {
          initializeCalls.push(options);
        },
        handleClientDisconnection: () => {},
      },
    });

    const engine = {
      ...createMockQueryEngine(),
      rebalanceCoordinator: {
        storageAdmissionService: {
          controlPlaneReadinessService: readinessService,
        },
      },
    };
    api.setSQLQueryEngine(engine);
    const snapshot = await api.controlSnapshot.buildLocalControlSnapshot({
      allowAuthoritativeReadinessRefresh: true,
      allowStaleReadinessOnCacheChange: false,
    });

    t.equal(api.sqlQueryEngine, engine,
      'admin API should retain the attached SQL engine');
    t.equal(
      api.controlSnapshot.sqlQueryEngine,
      engine,
      'late SQL attachment should refresh the control snapshot runtime',
    );
    t.equal(
      api.preflightSnapshot.sqlQueryEngine,
      engine,
      'late SQL attachment should refresh the preflight snapshot runtime',
    );
    t.equal(
      api.controlSnapshot.controlPlaneReadinessService,
      readinessService,
      'late SQL attachment should refresh the control-plane readiness dependency',
    );
    t.same(
      initializeCalls,
      [{sqlQueryEngine: engine}],
      'late SQL attachment should refresh the live query manager runtime',
    );
    t.same(
      snapshot.nodes,
      ['node-1', 'node-2'],
      'late SQL attachment should expose active nodes through the refreshed readiness service',
    );
    t.same(
      snapshot.controlPlaneDiagnostics.publicationConvergence
        ?.publishedActiveNodeIds,
      ['node-1', 'node-2'],
      'late SQL attachment should surface membership publication convergence',
    );
  });

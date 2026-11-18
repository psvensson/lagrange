import test from 'node:test';
import assert from 'node:assert/strict';

import {AdminWebSocketAPI, MessageType} from
  '../../src/admin/admin-websocket-api.js';
import {ADMIN_WEBSOCKET_API_SHARED} from
  '../../src/admin/admin-websocket-api-shared.js';
const {
  LOAD_LANE_TABLE_ADMISSION_STATE,
  META_SERVICE_ID,
  WASM_SERVICE_PROTOCOL,
} = ADMIN_WEBSOCKET_API_SHARED;
import {TABLES} from '../../src/constants/index.js';
import {
  FIXTURE_ENDPOINT_INCARNATION,
} from '../test-helpers/endpoint-incarnation-fixture.js';
import {
  connectAndReceive,
  createPopulatedCache,
  waitForMessage,
} from './admin-websocket-api-test-support.js';

const TEST_NODE_ID = 'node-load-admission-test';
const TEST_TABLE_RATINGS = 'ratings';
const TEST_INCARNATION_ONE = 1;
const TEST_INCARNATION_TWO = 2;

function createTestSystemCache({
  nodeId = TEST_NODE_ID,
  nodeIncarnation = TEST_INCARNATION_ONE,
  registerAdminEndpoint = true,
  adminEndpointIncarnation = TEST_INCARNATION_ONE,
  registerPostgresEndpoint = false,
  postgresEndpointIncarnation = TEST_INCARNATION_ONE,
} = {}) {
  const cache = createPopulatedCache();
  cache.applySystemTableChange(TABLES.NODES, 'INSERT', {
    node_id: nodeId,
    boot_incarnation: nodeIncarnation,
    status: 'active',
    connection_state: 'connected',
    last_heartbeat: 1000,
    created_at: 1000,
    updated_at: 1000,
  });

  cache.applySystemTableChange(TABLES.SERVICE_DEFINITIONS, 'INSERT', {
    service_id: META_SERVICE_ID.ADMIN_META,
    name: 'Admin & Control Plane API',
    type: 'meta',
    protocol: WASM_SERVICE_PROTOCOL.WEBSOCKET,
    default_port: 8080,
    status: 'active',
    updated_at: 1000,
  });

  cache.applySystemTableChange(TABLES.SERVICE_DEFINITIONS, 'INSERT', {
    service_id: META_SERVICE_ID.POSTGRES_WIRE,
    name: 'PostgreSQL Wire Protocol',
    type: 'meta',
    protocol: WASM_SERVICE_PROTOCOL.POSTGRESQL,
    default_port: 5432,
    status: 'active',
    updated_at: 1000,
  });

  if (registerAdminEndpoint) {
    cache.applySystemTableChange(TABLES.SERVICE_ENDPOINTS, 'INSERT', {
      endpoint_id: `ep-admin-${nodeId}`,
      service_id: META_SERVICE_ID.ADMIN_META,
      node_id: nodeId,
      address: '127.0.0.1',
      port: 8080,
      protocol: WASM_SERVICE_PROTOCOL.WEBSOCKET,
      health_status: 'healthy',
      boot_incarnation: adminEndpointIncarnation,
      updated_at: 1000,
    });
  }

  if (registerPostgresEndpoint) {
    cache.applySystemTableChange(TABLES.SERVICE_ENDPOINTS, 'INSERT', {
      endpoint_id: `ep-postgres-${nodeId}`,
      service_id: META_SERVICE_ID.POSTGRES_WIRE,
      node_id: nodeId,
      address: '127.0.0.1',
      port: 5432,
      protocol: WASM_SERVICE_PROTOCOL.POSTGRESQL,
      health_status: 'healthy',
      boot_incarnation: postgresEndpointIncarnation,
      updated_at: 1000,
    });
  }

  cache.applySystemTableChange(TABLES.TABLES, 'INSERT', {
    table_id: 'tbl-ratings',
    table_name: TEST_TABLE_RATINGS,
    schema_json: JSON.stringify({
      tableName: TEST_TABLE_RATINGS,
      columns: [{name: 'userId', type: 'INTEGER', primaryKey: true}],
    }),
    partition_count: 1,
    status: 'active',
    updated_at: 1000,
  });

  cache.applySystemTableChange(TABLES.PARTITIONS, 'INSERT', {
    id: 'ratings-p1',
    partition_id: 'ratings-p1',
    table_name: TEST_TABLE_RATINGS,
    shard_id: 0,
    leader_node_id: nodeId,
    raft_term: 1,
    status: 'active',
    updated_at: 1000,
  });

  cache.applySystemTableChange(TABLES.SERVICES, 'INSERT', {
    service_id: 'ratings-p1-r1',
    service_type: 'partition',
    node_id: nodeId,
    partition_id: 'ratings-p1',
    replica_id: 'ratings-p1-r1',
    raft_role: 'leader',
    status: 'active',
    address: `${nodeId}/partition/ratings-p1-r1`,
    updated_at: 1000,
  });

  return cache;
}

function buildMockServiceRecord({
  serviceId,
  protocol,
  nodeId = TEST_NODE_ID,
  ready = true,
  reasonCodes = [],
  bootIncarnation = FIXTURE_ENDPOINT_INCARNATION,
}) {
  return {
    serviceId,
    serviceIds: [serviceId],
    protocol,
    replicas: [
      {
        endpointId: `ep-${serviceId}-${nodeId}`,
        serviceId,
        nodeId,
        boot_incarnation: bootIncarnation,
        bootIncarnation,
        readiness: {
          routingReady: ready,
          benchmarkReady: ready,
          reasons: reasonCodes.map((code) => ({code})),
        },
        benchmarkAdmission: {
          state: ready ?
            LOAD_LANE_TABLE_ADMISSION_STATE.READY :
            LOAD_LANE_TABLE_ADMISSION_STATE.BENCHMARK_BLOCKED,
          routingReady: ready,
          reasons: reasonCodes.map((code) => ({code})),
        },
      },
    ],
  };
}

function createApiWithMockDiscovery({
  nodeId = TEST_NODE_ID,
  cache = null,
  servicesResolver,
}) {
  const systemTableCache = cache || createTestSystemCache({nodeId});
  const api = new AdminWebSocketAPI({
    nodeId,
    systemTableCache,
    sqlQueryEngine: {
      executeRequest: async () => ({
        success: true,
        rows: [{count: 42}],
        count: 1,
        tableName: TEST_TABLE_RATINGS,
      }),
    },
  });

  api.serviceDiscovery = {
    async resolveServiceDiscoverySnapshot(options = {}) {
      const services = typeof servicesResolver === 'function' ?
        await servicesResolver(options) :
        servicesResolver;
      return {
        schemaVersion: 1,
        nodeId,
        capturedAt: Date.now(),
        serviceCount: services?.length || 0,
        replicaCount: services?.reduce(
          (acc, s) => acc + (s.replicas?.length || 0), 0) || 0,
        services: services || [],
      };
    },
  };

  return api;
}

test('actual-ingress-binding: load lane table query binds strictly to actual ingress identity', async () => {
  // Discovery has healthy postgres-wire, but sys-admin-meta is missing entirely.
  // Unmodified code checks postgres-wire, finds it ready on local node, and admits!
  // Correct invariant: actual ingress is sys-admin-meta, so admission must be denied.
  const postgresService = buildMockServiceRecord({
    serviceId: META_SERVICE_ID.POSTGRES_WIRE,
    protocol: WASM_SERVICE_PROTOCOL.POSTGRESQL,
    ready: true,
  });

  const api = createApiWithMockDiscovery({
    servicesResolver: () => [postgresService],
  });

  const admission = await api.resolveLoadLaneTableAdmissionState(
    TEST_TABLE_RATINGS,
    {
      clientInfo: {id: 'client-1', lane: 'load'},
      // Even if spoofed serviceId is provided in executionContext:
      serviceId: META_SERVICE_ID.POSTGRES_WIRE,
      protocol: WASM_SERVICE_PROTOCOL.POSTGRESQL,
    },
  );

  assert.equal(
    admission.ready,
    false,
    'query must not be admitted when actual ingress service sys-admin-meta is missing',
  );
  assert.equal(
    admission.state,
    LOAD_LANE_TABLE_ADMISSION_STATE.DISCOVERY_MISSING,
    'missing actual ingress must resolve to discovery_missing',
  );
});

test('discovery-order-invariance: reordering discovery services does not alter load admission outcome', async () => {
  // sys-postgres-wire is blocked, sys-admin-meta is ready.
  // Order 1: [postgres (blocked), admin (ready)]
  // Order 2: [admin (ready), postgres (blocked)]
  // Unmodified code in Order 1 breaks on postgres (blocked) and rejects!
  // In Order 2 breaks on admin (ready) and admits!
  // Correct invariant: order must not alter admission outcome.
  const postgresBlocked = buildMockServiceRecord({
    serviceId: META_SERVICE_ID.POSTGRES_WIRE,
    protocol: WASM_SERVICE_PROTOCOL.POSTGRESQL,
    ready: false,
    reasonCodes: ['postgres_transport_blocked'],
  });
  const adminReady = buildMockServiceRecord({
    serviceId: META_SERVICE_ID.ADMIN_META,
    protocol: WASM_SERVICE_PROTOCOL.WEBSOCKET,
    ready: true,
  });

  const api1 = createApiWithMockDiscovery({
    servicesResolver: () => [postgresBlocked, adminReady],
  });
  const api2 = createApiWithMockDiscovery({
    servicesResolver: () => [adminReady, postgresBlocked],
  });

  const result1 = await api1.resolveLoadLaneTableAdmissionState(TEST_TABLE_RATINGS);
  const result2 = await api2.resolveLoadLaneTableAdmissionState(TEST_TABLE_RATINGS);

  assert.equal(
    result1.ready,
    true,
    'Order [postgres-blocked, admin-ready] must admit admin websocket query',
  );
  assert.equal(
    result2.ready,
    true,
    'Order [admin-ready, postgres-blocked] must admit admin websocket query',
  );
  assert.equal(
    result1.ready,
    result2.ready,
    'Discovery response order must be invariant',
  );
});

test('opposite-endpoint-health: admin blocked with postgres ready rejects, admin ready with postgres blocked admits', async () => {
  const postgresReady = buildMockServiceRecord({
    serviceId: META_SERVICE_ID.POSTGRES_WIRE,
    protocol: WASM_SERVICE_PROTOCOL.POSTGRESQL,
    ready: true,
  });
  const postgresBlocked = buildMockServiceRecord({
    serviceId: META_SERVICE_ID.POSTGRES_WIRE,
    protocol: WASM_SERVICE_PROTOCOL.POSTGRESQL,
    ready: false,
    reasonCodes: ['pg_blocked'],
  });
  const adminReady = buildMockServiceRecord({
    serviceId: META_SERVICE_ID.ADMIN_META,
    protocol: WASM_SERVICE_PROTOCOL.WEBSOCKET,
    ready: true,
  });
  const adminBlocked = buildMockServiceRecord({
    serviceId: META_SERVICE_ID.ADMIN_META,
    protocol: WASM_SERVICE_PROTOCOL.WEBSOCKET,
    ready: false,
    reasonCodes: ['admin_blocked'],
  });

  // Combo 1: postgres ready, admin blocked -> must REJECT for admin websocket query
  const apiCombo1 = createApiWithMockDiscovery({
    servicesResolver: () => [postgresReady, adminBlocked],
  });
  const resultCombo1 = await apiCombo1.resolveLoadLaneTableAdmissionState(TEST_TABLE_RATINGS);
  assert.equal(
    resultCombo1.ready,
    false,
    'admin query must be rejected when admin-meta is blocked despite postgres being ready',
  );

  // Combo 2: postgres blocked, admin ready -> must ADMIT for admin websocket query
  const apiCombo2 = createApiWithMockDiscovery({
    servicesResolver: () => [postgresBlocked, adminReady],
  });
  const resultCombo2 = await apiCombo2.resolveLoadLaneTableAdmissionState(TEST_TABLE_RATINGS);
  assert.equal(
    resultCombo2.ready,
    true,
    'admin query must be admitted when admin-meta is ready despite postgres being blocked',
  );
});

test('zero-postgres-replicas: admits admin websocket query when postgres wire has 0 replicas', async () => {
  const postgresEmpty = {
    serviceId: META_SERVICE_ID.POSTGRES_WIRE,
    serviceIds: [META_SERVICE_ID.POSTGRES_WIRE],
    protocol: WASM_SERVICE_PROTOCOL.POSTGRESQL,
    replicas: [],
  };
  const adminReady = buildMockServiceRecord({
    serviceId: META_SERVICE_ID.ADMIN_META,
    protocol: WASM_SERVICE_PROTOCOL.WEBSOCKET,
    ready: true,
  });

  const api = createApiWithMockDiscovery({
    servicesResolver: () => [postgresEmpty, adminReady],
  });

  const result = await api.resolveLoadLaneTableAdmissionState(TEST_TABLE_RATINGS);
  assert.equal(
    result.ready,
    true,
    'admin websocket query must succeed when sys-postgres-wire has 0 replicas',
  );
});

test('stale-endpoint-incarnation-refused: stale endpoint boot incarnation is refused for load admission', async () => {
  // Node is at boot incarnation 2
  const cache = createTestSystemCache({
    nodeId: TEST_NODE_ID,
    nodeIncarnation: TEST_INCARNATION_TWO,
    registerAdminEndpoint: true,
    adminEndpointIncarnation: TEST_INCARNATION_ONE, // Stale!
  });

  // Replica carries stale boot_incarnation: 1
  const staleAdminService = buildMockServiceRecord({
    serviceId: META_SERVICE_ID.ADMIN_META,
    protocol: WASM_SERVICE_PROTOCOL.WEBSOCKET,
    ready: true,
    bootIncarnation: TEST_INCARNATION_ONE,
  });

  const api = createApiWithMockDiscovery({
    cache,
    servicesResolver: () => [staleAdminService],
  });

  const result = await api.resolveLoadLaneTableAdmissionState(
    TEST_TABLE_RATINGS,
    {
      ingress: {
        serviceId: META_SERVICE_ID.ADMIN_META,
        protocol: WASM_SERVICE_PROTOCOL.WEBSOCKET,
        nodeId: TEST_NODE_ID,
        incarnation: TEST_INCARNATION_TWO,
      },
    },
  );

  assert.equal(
    result.ready,
    false,
    'replica with stale endpoint incarnation must be refused load admission',
  );
  assert.ok(
    result.reasonCodes.includes('stale_endpoint_incarnation') ||
    result.state === LOAD_LANE_TABLE_ADMISSION_STATE.DISCOVERY_MISSING ||
    result.state === LOAD_LANE_TABLE_ADMISSION_STATE.READINESS_BLOCKED,
    'stale incarnation refusal must be typed and bounded',
  );
});

test('admission-cache-binding: cache entries are bound to full composite identity and refuse cross-authorization', async () => {
  let discoveryResolutions = 0;
  const adminReady = buildMockServiceRecord({
    serviceId: META_SERVICE_ID.ADMIN_META,
    protocol: WASM_SERVICE_PROTOCOL.WEBSOCKET,
    ready: true,
    bootIncarnation: TEST_INCARNATION_ONE,
  });

  const api = createApiWithMockDiscovery({
    servicesResolver: () => {
      discoveryResolutions += 1;
      return [adminReady];
    },
  });

  const ingressAdmin1 = {
    serviceId: META_SERVICE_ID.ADMIN_META,
    protocol: WASM_SERVICE_PROTOCOL.WEBSOCKET,
    nodeId: TEST_NODE_ID,
    incarnation: TEST_INCARNATION_ONE,
  };

  // 1. Initial resolution for admin-meta at incarnation 1
  const res1 = await api.resolveLoadLaneTableAdmissionState(
    TEST_TABLE_RATINGS,
    {ingress: ingressAdmin1},
  );
  assert.equal(res1.ready, true);
  assert.equal(discoveryResolutions, 1);

  // 2. Subsequent resolution for the same identity hits cache
  const res2 = await api.resolveLoadLaneTableAdmissionState(
    TEST_TABLE_RATINGS,
    {ingress: ingressAdmin1},
  );
  assert.equal(res2.ready, true);
  assert.equal(discoveryResolutions, 1, 'identical identity must hit cache');

  // 3. Resolution for a different service (sys-postgres-wire) must NOT hit admin-meta cache
  const ingressPostgres = {
    serviceId: META_SERVICE_ID.POSTGRES_WIRE,
    protocol: WASM_SERVICE_PROTOCOL.POSTGRESQL,
    nodeId: TEST_NODE_ID,
    incarnation: TEST_INCARNATION_ONE,
  };
  const resDiffService = await api.resolveLoadLaneTableAdmissionState(
    TEST_TABLE_RATINGS,
    {ingress: ingressPostgres},
  );
  // postgres-wire was not in discovery resolver output
  assert.equal(
    resDiffService.ready,
    false,
    'different transport must not be authorized by warm admin-meta cache entry',
  );
  assert.equal(
    discoveryResolutions,
    2,
    'different service identity must bypass admin-meta cache entry',
  );

  // 4. Resolution for a later incarnation (incarnation 2) must NOT hit incarnation 1 cache
  const ingressAdmin2 = {
    serviceId: META_SERVICE_ID.ADMIN_META,
    protocol: WASM_SERVICE_PROTOCOL.WEBSOCKET,
    nodeId: TEST_NODE_ID,
    incarnation: TEST_INCARNATION_TWO,
  };
  const resDiffIncarnation = await api.resolveLoadLaneTableAdmissionState(
    TEST_TABLE_RATINGS,
    {ingress: ingressAdmin2},
  );
  assert.equal(
    resDiffIncarnation.ready,
    false,
    'older replica incarnation must not admit later node incarnation',
  );
  assert.equal(
    discoveryResolutions,
    3,
    'later incarnation must bypass earlier incarnation cache entry',
  );
});

test('real-ingress-to-query-composition: end-to-end admin websocket load-lane query verifies actual ingress binding', async () => {
  let executedQueryCount = 0;
  const cache = createTestSystemCache({
    nodeId: TEST_NODE_ID,
    registerAdminEndpoint: true,
    registerPostgresEndpoint: true,
  });

  const postgresBlocked = buildMockServiceRecord({
    serviceId: META_SERVICE_ID.POSTGRES_WIRE,
    protocol: WASM_SERVICE_PROTOCOL.POSTGRESQL,
    ready: false,
    reasonCodes: ['pg_blocked'],
  });
  const adminReady = buildMockServiceRecord({
    serviceId: META_SERVICE_ID.ADMIN_META,
    protocol: WASM_SERVICE_PROTOCOL.WEBSOCKET,
    ready: true,
  });

  const api = new AdminWebSocketAPI({
    nodeId: TEST_NODE_ID,
    systemTableCache: cache,
    sqlQueryEngine: {
      executeRequest: async () => {
        executedQueryCount += 1;
        return {
          success: true,
          rows: [{count: 42}],
          count: 1,
          tableName: TEST_TABLE_RATINGS,
        };
      },
    },
  });

  // Services returned with postgres-wire first and blocked!
  api.serviceDiscovery = {
    async resolveServiceDiscoverySnapshot() {
      return {
        schemaVersion: 1,
        nodeId: TEST_NODE_ID,
        capturedAt: Date.now(),
        serviceCount: 2,
        replicaCount: 2,
        services: [postgresBlocked, adminReady],
      };
    },
  };

  await api.initialize(0, {listen: false});
  const {ws} = await connectAndReceive(api, 2000, {
    query: {lane: 'load'},
  });

  ws.send(JSON.stringify({
    type: MessageType.QUERY,
    queryId: 'q-real-ingress-composition',
    sql: 'SELECT userId FROM ratings WHERE userId = 1',
  }));

  const result = await waitForMessage(ws);
  assert.equal(result.type, MessageType.QUERY_RESULT);
  assert.equal(
    result.error,
    undefined,
    'admin websocket query must succeed even if postgres-wire is first and blocked',
  );
  assert.equal(executedQueryCount, 1, 'query must be executed');

  ws.close();
  await api.shutdown();
});

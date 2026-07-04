/**
 * Guard tests for the Tier-3 affinity demo wiring
 * (quest: movielens-affinity-placement-demo, epic:
 * solve/epics/service-data-affinity-placement.md).
 *
 * Proves the three product mechanisms the demo stands on:
 *  1. Operator-pinned latency groups (zone labels): with
 *     latency.pinnedGroupId set, the LatencyGroupManager — still the
 *     single owner of nodes.latency_group_id — creates/joins/keeps the
 *     pinned group and never consults RTT, so a one-host cluster can
 *     form multiple zones.
 *  2. The sql-query-loop native_js lifecycle module: config
 *     validation, a shutdown-aware query loop issuing statements
 *     through the injected service-scoped executor, health counters.
 *  3. The production native_js handler map: createRuntimeStartupWiring
 *     registers the built-in modules on ServiceRuntimeLifecycle, so a
 *     placed replica resolves its runtime_ref through the REAL
 *     prepare/start path — including queryExecutor injection scoped to
 *     the service id (the seam that makes attribution + read-locality
 *     routing engage for deployed services).
 */

import {test} from '../../src/test-helpers/tap.js';
import assert from 'node:assert/strict';
import {ConfigurationManager} from '../../src/config/configuration-manager.js';
import {LoggingService} from '../../src/logging/logging-service.js';
import {COLUMN, NODE_STATE, TABLES} from '../../src/constants/index.js';
import {
  LATENCY_GROUP_STATE,
} from '../../src/topology/latency-topology-constants.js';
import {
  LatencyGroupManager,
} from '../../src/topology/latency-group-manager.js';
import {
  LATENCY_GROUP_MANAGER_REASON,
} from '../../src/topology/latency-group-manager-constants.js';
import {
  SQL_QUERY_LOOP_RUNTIME_REF,
  SqlQueryLoopRuntimeModule,
} from '../../src/runtime/sql-query-loop-runtime-module.js';
import {
  createRuntimeStartupWiring,
} from '../../src/runtime/runtime-startup-wiring.js';
import {
  PREPARE_STATUS,
  START_STATUS,
  HEALTH_STATUS,
} from '../../src/runtime/runtime-driver.js';

const ZONE_A = 'zone-a';
const LOOP_SQL = 'SELECT movie_id, rating FROM ratings';
const FAST_INTERVAL_MS = 5;
const WAIT_TIMEOUT_MS = 1500;
const WAIT_POLL_MS = 5;

function setupConfig(latencyOverrides = {}) {
  ConfigurationManager.resetInstance();
  LoggingService.resetInstance();
  const config = ConfigurationManager.getInstance();
  config.initialize({
    node: {id: 'node-a'},
    logging: {level: 'error'},
    latency: {
      groupThresholdMs: 100,
      recalcIntervalMs: 1000,
      ...latencyOverrides,
    },
  });
  LoggingService.getInstance().initialize({level: 'error'});
}

function teardownConfig() {
  ConfigurationManager.resetInstance();
  LoggingService.resetInstance();
}

function nodeRow(nodeId, groupId = null) {
  return {
    [COLUMN.NODE_ID]: nodeId,
    [COLUMN.STATUS]: NODE_STATE.ACTIVE,
    [COLUMN.LATENCY_GROUP_ID]: groupId,
    [COLUMN.CREATED_AT]: 1,
  };
}

function groupRow(groupId, representativeNodeId) {
  return {
    [COLUMN.GROUP_ID]: groupId,
    [COLUMN.REPRESENTATIVE_NODE_ID]: representativeNodeId,
    [COLUMN.COORDINATOR_NODE_ID]: representativeNodeId,
    [COLUMN.STATE]: LATENCY_GROUP_STATE.ACTIVE,
    [COLUMN.CREATED_AT]: 1,
    [COLUMN.UPDATED_AT]: 1,
  };
}

function mockCache({nodes = [], groups = []} = {}) {
  const tables = new Map([
    [TABLES.NODES, new Map(nodes.map((r) => [r[COLUMN.NODE_ID], {...r}]))],
    [
      TABLES.LATENCY_GROUPS,
      new Map(groups.map((r) => [r[COLUMN.GROUP_ID], {...r}])),
    ],
  ]);
  const tableOf = (name) => tables.get(name) || new Map();
  return {
    get: (name, key) => {
      const row = tableOf(name).get(key);
      return row ? {...row} : null;
    },
    getAll: (name) => [...tableOf(name).values()].map((r) => ({...r})),
    has: (name, key) => tableOf(name).has(key),
  };
}

function mockCdc() {
  const updates = [];
  const upserts = [];
  return {
    updates,
    upserts,
    updateSystemTableRow: async (tableName, whereClause, data) => {
      updates.push({tableName, whereClause, data});
      return {success: true};
    },
    upsertSystemTableRow: async (tableName, row) => {
      upserts.push({tableName, row});
      return {success: true};
    },
  };
}

function refusingMeasurementService() {
  const calls = [];
  return {
    calls,
    measureNodeLatency: async (nodeId) => {
      calls.push(nodeId);
      return {rttMs: 1, attempt: 0};
    },
  };
}

function buildManager({cache, cdc, measurement}) {
  return new LatencyGroupManager({
    nodeId: 'node-a',
    systemTableCache: cache,
    cdcIntegrationService: cdc,
    latencyMeasurementService: measurement,
    groupSelectionService: {
      applyGroupLeadership: async () => ({changed: false}),
    },
    nowFn: () => 5000,
  });
}

async function waitFor(predicate) {
  const deadline = Date.now() + WAIT_TIMEOUT_MS;
  while (!predicate()) {
    if (Date.now() > deadline) {
      throw new Error('waitFor timed out');
    }
    await new Promise((resolve) => setTimeout(resolve, WAIT_POLL_MS));
  }
}

test('pinned zone: the manager creates the pinned group without ever ' +
  'consulting RTT', async (t) => {
  setupConfig({pinnedGroupId: ZONE_A});
  const cache = mockCache({
    nodes: [nodeRow('node-a'), nodeRow('rep-g-1', 'g-1')],
    groups: [groupRow('g-1', 'rep-g-1')],
  });
  const cdc = mockCdc();
  const measurement = refusingMeasurementService();
  const manager = buildManager({cache, cdc, measurement});
  manager.initialize();

  const result = await manager.runAssignmentCycle();

  assert.equal(result.success, true);
  assert.equal(result.reason, LATENCY_GROUP_MANAGER_REASON.CREATE_NEW_GROUP);
  assert.equal(result.targetGroupId, ZONE_A,
    'a nearby eligible measured group cannot override the pin');
  assert.equal(measurement.calls.length, 0,
    'RTT is never measured under a pin');
  assert.equal(cdc.upserts[0].tableName, TABLES.LATENCY_GROUPS);
  assert.equal(cdc.upserts[0].row[COLUMN.GROUP_ID], ZONE_A,
    'the pinned group row is created on first use');
  const nodeUpdate = cdc.updates.find(
    (u) => u.tableName === TABLES.NODES,
  );
  assert.equal(nodeUpdate.data[COLUMN.LATENCY_GROUP_ID], ZONE_A,
    'the single owner writes the pinned label');
  teardownConfig();
  t.end();
});

test('pinned zone: joins an existing pinned group, then keeps it stable ' +
  'across cycles', async (t) => {
  setupConfig({pinnedGroupId: ZONE_A});
  const joining = buildManager({
    cache: mockCache({
      nodes: [nodeRow('node-a'), nodeRow('node-b', ZONE_A)],
      groups: [groupRow(ZONE_A, 'node-b')],
    }),
    cdc: mockCdc(),
    measurement: refusingMeasurementService(),
  });
  joining.initialize();
  const joinResult = await joining.runAssignmentCycle();
  assert.equal(
    joinResult.reason, LATENCY_GROUP_MANAGER_REASON.JOIN_NEAREST_GROUP,
  );
  assert.equal(joinResult.targetGroupId, ZONE_A);

  const settledCdc = mockCdc();
  const settled = buildManager({
    cache: mockCache({
      nodes: [nodeRow('node-a', ZONE_A)],
      groups: [groupRow(ZONE_A, 'node-a')],
    }),
    cdc: settledCdc,
    measurement: refusingMeasurementService(),
  });
  settled.initialize();
  const keepResult = await settled.runAssignmentCycle();
  assert.equal(
    keepResult.reason, LATENCY_GROUP_MANAGER_REASON.KEEP_CURRENT_GROUP,
  );
  assert.equal(keepResult.changed, false,
    'a settled pinned node never churns its label');
  teardownConfig();
  t.end();
});

test('sql-query-loop module: config validation', async (t) => {
  const module = new SqlQueryLoopRuntimeModule();
  const failing = [
    {runtime_config: '{}'},
    {runtime_config: JSON.stringify({sql: ''})},
    {runtime_config: JSON.stringify({sql: LOOP_SQL, params: 'nope'})},
    {runtime_config: JSON.stringify({sql: LOOP_SQL, intervalMs: -1})},
    {runtime_config: 'not-json'},
  ];
  for (const shape of failing) {
    const result = await module.prepare({serviceId: 'svc-x', ...shape});
    t.equal(result.status, PREPARE_STATUS.FAILED,
      `rejects ${shape.runtime_config}`);
  }
  const ok = await module.prepare({
    serviceId: 'svc-x',
    runtime_config: JSON.stringify({sql: LOOP_SQL}),
  });
  t.equal(ok.status, PREPARE_STATUS.READY, 'accepts a minimal config');
  t.end();
});

test('sql-query-loop module: shutdown-aware loop issues queries through ' +
  'the injected executor and stops cleanly', async (t) => {
  const module = new SqlQueryLoopRuntimeModule();
  const serviceId = 'svc-loop';
  const calls = [];
  let failNext = false;
  const queryExecutor = async (sql, params) => {
    calls.push({sql, params});
    if (failNext) {
      failNext = false;
      return {success: false, error: 'transient'};
    }
    return {success: true, rows: []};
  };
  await module.prepare({
    serviceId,
    runtime_config: JSON.stringify({
      sql: LOOP_SQL,
      params: [],
      intervalMs: FAST_INTERVAL_MS,
    }),
  });

  const noExecutor = await module.start({serviceId});
  t.equal(noExecutor.status, START_STATUS.FAILED,
    'start without the injected executor fails loudly');

  failNext = true;
  const started = await module.start({serviceId, queryExecutor});
  t.equal(started.status, START_STATUS.RUNNING);
  await waitFor(() => calls.length >= 3);
  t.equal(calls[0].sql, LOOP_SQL, 'the configured SQL is issued');

  const health = await module.health({serviceId});
  t.equal(health.status, HEALTH_STATUS.HEALTHY);
  t.ok(health.queriesIssued >= 2, 'successful statements are counted');
  t.equal(health.queryErrors, 1, 'failed statements are counted');

  await module.stop({serviceId});
  const countAtStop = calls.length;
  await new Promise((resolve) =>
    setTimeout(resolve, FAST_INTERVAL_MS * 6));
  t.ok(calls.length <= countAtStop + 1,
    'stop halts the loop (at most one in-flight statement completes)');
  const stopped = await module.health({serviceId});
  t.equal(stopped.status, HEALTH_STATUS.UNHEALTHY,
    'a stopped replica reports unhealthy');
  t.end();
});

test('in-service reduce: a full-scan query loop reduces rows to a ' +
  'top-N and replaces the result table through its own executor', async (t) => {
  const module = new SqlQueryLoopRuntimeModule();
  const scanRows = [
    {movie_id: 50, rating: 5}, {movie_id: 50, rating: 5},
    {movie_id: 100, rating: 4}, {movie_id: 100, rating: 2},
    {movie_id: 258, rating: 1},
  ];
  const statements = [];
  const queryExecutor = async (sql) => {
    statements.push(sql);
    if (sql.startsWith('SELECT')) {
      return {success: true, results: scanRows};
    }
    return {success: true};
  };
  const definition = {
    serviceId: 'svc-reduce',
    runtime_config: JSON.stringify({
      sql: 'SELECT movie_id, rating FROM ratings',
      intervalMs: 60000,
      reduce: {
        groupBy: 'movie_id',
        aggregate: 'avg',
        valueColumn: 'rating',
        limit: 2,
      },
      resultTable: 'movielens_top10',
    }),
  };
  const prepared = await module.prepare(definition);
  t.equal(prepared.status, PREPARE_STATUS.READY,
    'reduce config validates');
  const started = await module.start({
    serviceId: 'svc-reduce',
    queryExecutor,
  });
  t.equal(started.status, START_STATUS.RUNNING);
  await waitFor(() =>
    statements.filter((sql) => sql.startsWith('INSERT')).length >= 2);

  const health = await module.health({serviceId: 'svc-reduce'});
  t.equal(health.lastReducedRows, 2,
    'the 5 scanned rows reduced to the top-2 groups');
  t.ok(statements.some((sql) =>
    sql === 'DELETE FROM movielens_top10'),
  'each cycle replaces the result table');
  const inserts = statements.filter((sql) => sql.startsWith('INSERT'));
  t.match(inserts[0], /\(1, 50, 5,/,
    'rank 1 = movie 50 (avg 5) — the reduce is ordered');
  t.match(inserts[1], /\(2, 100, 3,/,
    'rank 2 = movie 100 (avg 3)');
  await module.stop({serviceId: 'svc-reduce'});
  t.end();
});

test('reduce config validation rejects malformed shapes', async (t) => {
  const module = new SqlQueryLoopRuntimeModule();
  const badConfigs = [
    {reduce: {groupBy: '', aggregate: 'avg', valueColumn: 'r', limit: 2}},
    {reduce: {groupBy: 'g', aggregate: 'median', valueColumn: 'r', limit: 2}},
    {reduce: {groupBy: 'g', aggregate: 'avg', limit: 2}},
    {reduce: {groupBy: 'g', aggregate: 'avg', valueColumn: 'r', limit: 0}},
    {resultTable: 'sink_without_reduce'},
  ];
  for (const extra of badConfigs) {
    const prepared = await module.prepare({
      serviceId: 'svc-bad',
      runtime_config: JSON.stringify({sql: 'SELECT 1', ...extra}),
    });
    t.equal(prepared.status, PREPARE_STATUS.FAILED,
      `rejected: ${JSON.stringify(extra).slice(0, 60)}`);
  }
  const countOk = await module.prepare({
    serviceId: 'svc-count',
    runtime_config: JSON.stringify({
      sql: 'SELECT 1',
      reduce: {groupBy: 'g', aggregate: 'count', limit: 3},
    }),
  });
  t.equal(countOk.status, PREPARE_STATUS.READY,
    'count aggregate needs no valueColumn');
  t.end();
});

test('ship-not-started holds at the PLANNER: an explicit runtime-service ' +
  'target of 0 places no replicas (min clamp and || coercion both ' +
  'defeated it before)', async (t) => {
  const {MovePlanner} = await import('../../src/rebalancer/move-planner.js');
  const planner = new MovePlanner({
    entityId: 'svc-ship-zero',
    entityType: 'runtime_service',
    moveStateProvider: {
      getAvailableNodes: () => [],
      getCurrentReplicas: () => [],
      getHealthyReplicas: () => [],
      getInFlightOperations: () => [],
      getGlobalTopologyBlockingInFlightOperations: () => [],
      getPartitionDescriptorEpochEvidence: () => null,
      hasPendingMove: () => false,
      hasPendingAddForNode: () => false,
    },
  });
  t.equal(
    planner.calculateTargetReplicaCount([], {
      targetReplicaCount: 0,
      minReplicaCount: 1,
      maxReplicaCount: 7,
    }),
    0,
    'explicit 0 survives both the || default and the min clamp',
  );
  t.equal(
    planner.calculateTargetReplicaCount([], {
      targetReplicaCount: 3,
      minReplicaCount: 1,
      maxReplicaCount: 7,
    }),
    3,
    'non-zero targets are unchanged',
  );
  t.equal(
    planner.isCriticalState([], {
      targetReplicaCount: 0,
      minReplicaCount: 1,
      maxReplicaCount: 7,
    }, [{node_id: 'n1'}, {node_id: 'n2'}]),
    false,
    'a ship-not-started service at zero replicas is NOT critical ' +
      '(the min floor was the third clamp forcing adds)',
  );
  t.equal(
    planner.isCriticalState([], {
      targetReplicaCount: 3,
      minReplicaCount: 1,
      maxReplicaCount: 7,
    }, [{node_id: 'n1'}, {node_id: 'n2'}]),
    true,
    'a wanted-but-absent service IS critical',
  );
  t.end();
});

test('production wiring: a placed native_js replica resolves its ' +
  'runtime_ref and gets a service-scoped executor', async (t) => {
  const {serviceRuntimeLifecycle} = createRuntimeStartupWiring();
  const factoryCalls = [];
  const queries = [];
  serviceRuntimeLifecycle.setQueryExecutorFactory((serviceId) => {
    factoryCalls.push(serviceId);
    return async (sql, params) => {
      queries.push({serviceId, sql, params});
      return {success: true, rows: []};
    };
  });

  const definition = {
    serviceId: 'svc-affinity-demo',
    serviceType: 'runtime_service',
    runtime_kind: 'native_js',
    runtime_ref: SQL_QUERY_LOOP_RUNTIME_REF,
    runtime_config: JSON.stringify({
      sql: LOOP_SQL,
      intervalMs: FAST_INTERVAL_MS,
    }),
  };

  const prepared = await serviceRuntimeLifecycle.prepare(
    definition,
    {nodeId: 'node-a'},
  );
  t.equal(prepared.status, PREPARE_STATUS.READY,
    'the lifecycle-registered handler map resolves the runtime_ref ' +
      'through the REAL prepare path (no caller-supplied handlerMap)');

  const started = await serviceRuntimeLifecycle.start({...definition});
  t.equal(started.status, START_STATUS.RUNNING);
  t.same(factoryCalls, ['svc-affinity-demo'],
    'the injected executor is scoped to the service id — the seam that ' +
      'tags issuingServiceId for attribution and locality routing');
  await waitFor(() => queries.length >= 2);
  t.equal(queries[0].sql, LOOP_SQL);
  t.equal(queries[0].serviceId, 'svc-affinity-demo');

  await serviceRuntimeLifecycle.stop({...definition});
  const countAtStop = queries.length;
  await new Promise((resolve) =>
    setTimeout(resolve, FAST_INTERVAL_MS * 6));
  t.ok(queries.length <= countAtStop + 1,
    'lifecycle stop halts the deployed query loop');
  t.end();
});

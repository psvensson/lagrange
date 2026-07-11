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
  mergeDisjointPartialRows,
} from '../../src/runtime/sql-query-loop-runtime-module.js';
import {
  PARALLEL_REDUCE_REASON,
  resolveCompletePartialSnapshot,
} from '../../src/runtime/sql-query-loop-parallel-reduce.js';
import {
  createRuntimeStartupWiring,
} from '../../src/runtime/runtime-startup-wiring.js';
import {
  SQLQueryEngineLifecycleAndCallbackDispatch,
} from '../../src/query/sql-query-engine-lifecycle-and-callback-dispatch.js';
import {
  assessAffinityDemoCompletion,
  buildWeightedLocalitySnapshot,
} from '../../examples/service-data-affinity/affinity-demo-evidence.js';
import {
  summarizePhase,
} from '../../examples/service-data-affinity/run-affinity-demo.js';
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
    statements.filter((sql) => sql.startsWith('INSERT')).length >= 1);

  const health = await module.health({serviceId: 'svc-reduce'});
  t.equal(health.lastReducedRows, 2,
    'the 5 scanned rows reduced to the top-2 groups');
  t.ok(statements.some((sql) =>
    sql === 'DELETE FROM movielens_top10'),
  'each cycle replaces the result table');
  const inserts = statements.filter((sql) => sql.startsWith('INSERT'));
  t.match(inserts[0], /\(1, 50, 5,/,
    'rank 1 = movie 50 (avg 5) — the reduce is ordered');
  t.match(inserts[0], /\(2, 100, 3,/,
    'rank 2 = movie 100 (avg 3) in the same bounded insert');
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
    {
      reduce: {groupBy: 'g', aggregate: 'count', limit: 3},
      resultTable: 'finals',
      parallelReduce: {
        shardSqlBySlot: {},
        coordinationTable: 'partials',
        leaseMs: 1000,
        coordinatorSlot: 1,
        resultId: 'result',
      },
    },
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

test('parallel reduce: replicas select disjoint shard SQL, publish bounded ' +
  'partials, and the coordinator merges the exact top-N', async (t) => {
  const config = {
    sql: LOOP_SQL,
    intervalMs: 5,
    reduce: {
      groupBy: 'movie_id',
      aggregate: 'avg',
      valueColumn: 'rating',
      limit: 2,
    },
    resultTable: 'final_topn',
    parallelReduce: {
      shardSqlBySlot: {
        1: `${LOOP_SQL} WHERE movie_id <= 100`,
        2: `${LOOP_SQL} WHERE movie_id > 100`,
      },
      coordinationTable: 'reduce_slots',
      leaseMs: 1000,
      coordinatorSlot: 1,
      resultId: 'global',
    },
  };
  const slots = [1, 2].map((slotId) => ({
    slot_id: slotId,
    replica_id: '',
    lease_expires_at: 0,
    partial_json: '[]',
    computed_at: 0,
  }));
  let finalRows = [];
  let finalUpdateCount = 0;
  const statements = new Map();
  const executorFor = (serviceId) => {
    const execute = async (sql) => {
      const ownStatements = statements.get(serviceId) || [];
      ownStatements.push(sql);
      statements.set(serviceId, ownStatements);
      if (sql.startsWith('SELECT slot_id')) {
        return {success: true, results: slots.map((row) => ({...row}))};
      }
      if (sql.startsWith('UPDATE reduce_slots')) {
        const slotId = Number(/slot_id = (\d+)/.exec(sql)?.[1]);
        const slot = slots.find((row) => row.slot_id === slotId);
        const claiming = /replica_id = '([^']+)'/.exec(sql)?.[1];
        const requiredOwner = /AND replica_id = '([^']+)'/.exec(sql)?.[1];
        if (claiming && slot.lease_expires_at <= Date.now()) {
          slot.replica_id = claiming;
          slot.partial_json = '[]';
          slot.computed_at = 0;
        }
        if (requiredOwner && slot.replica_id !== requiredOwner) {
          return {success: true};
        }
        const lease = /lease_expires_at = (\d+)/.exec(sql)?.[1];
        if (lease) {
          slot.lease_expires_at = Number(lease);
        }
        const partial = /partial_json = '(\[[^']*\])'/.exec(sql)?.[1];
        if (partial) {
          slot.partial_json = partial;
          slot.computed_at = Number(/computed_at = (\d+)/.exec(sql)?.[1]);
        }
        return {success: true};
      }
      if (sql === config.parallelReduce.shardSqlBySlot[1]) {
        return {success: true, results: [
          {movie_id: 50, rating: 5},
          {movie_id: 100, rating: 3},
        ]};
      }
      if (sql === config.parallelReduce.shardSqlBySlot[2]) {
        return {success: true, results: [
          {movie_id: 258, rating: 4},
          {movie_id: 300, rating: 2},
        ]};
      }
      if (sql.startsWith('UPDATE final_topn')) {
        finalRows = JSON.parse(/result_json = '(\[[^']*\])'/.exec(sql)[1]);
        finalUpdateCount += 1;
        return {success: true};
      }
      return {success: true, results: []};
    };
    execute.executeInternal = execute;
    return execute;
  };
  const replacements = ['svc-parallel-r3', 'svc-parallel-r4'];
  const modules = replacements.map(() => new SqlQueryLoopRuntimeModule());
  for (let index = 0; index < modules.length; index += 1) {
    await modules[index].prepare({
      serviceId: replacements[index],
      runtime_config: JSON.stringify(config),
    });
    await modules[index].start({
      serviceId: replacements[index],
      queryExecutor: executorFor(replacements[index]),
    });
    await waitFor(() => slots[index].replica_id === replacements[index]);
    if (index === 0) {
      await new Promise((resolve) => setTimeout(resolve, 20));
      t.same(finalRows, [],
        'an incomplete slot set never overwrites the result snapshot');
    }
  }
  await waitFor(() => finalRows.length === 2);
  t.same(slots.map((row) => row.replica_id), replacements,
    'replacement generations r3/r4 acquire stable slots 1/2');
  t.same(finalRows, [
    {groupKey: 50, aggValue: 5},
    {groupKey: 258, aggValue: 4},
  ], 'the coordinator atomically publishes the exact global top-N');
  const health = await modules[0].health({serviceId: replacements[0]});
  t.equal(health.partialRowsPublished, 2,
    'the replica publishes only its configured top-N');
  t.equal(health.mergeCandidates, 4,
    'the coordinator observes replicas×N bounded candidates');
  await modules[0].stop({serviceId: replacements[0]});
  const updatesBeforeReplacement = finalUpdateCount;
  const replacementId = 'svc-parallel-r5';
  const replacementModule = new SqlQueryLoopRuntimeModule();
  await replacementModule.prepare({
    serviceId: replacementId,
    runtime_config: JSON.stringify(config),
  });
  await replacementModule.start({
    serviceId: replacementId,
    queryExecutor: executorFor(replacementId),
  });
  await waitFor(() =>
    slots[0].replica_id === replacementId &&
    finalUpdateCount > updatesBeforeReplacement);
  t.equal(slots[0].replica_id, replacementId,
    'a later replacement generation reclaims stable slot 1 and resumes');
  t.notOk([...statements.values()].flat().some((sql) =>
    sql.startsWith('DELETE FROM reduce_slots') ||
    sql.startsWith('DELETE FROM final_topn')),
  'partial and result publication are atomic UPDATE snapshots, never gaps');
  await replacementModule.stop({serviceId: replacementId});
  await modules[1].stop({serviceId: replacements[1]});

  t.throws(() => mergeDisjointPartialRows([
    {groupKey: 50, aggValue: 5},
    {groupKey: 50, aggValue: 4},
  ], 2), /shard_overlap/,
  'overlapping group shards fail loudly instead of producing an ' +
    'inexact merge');
  const snapshotConfig = config.parallelReduce;
  const nowMs = Date.now();
  const snapshotRows = slots.map((row) => ({
    ...row,
    lease_expires_at: nowMs + snapshotConfig.leaseMs,
    computed_at: nowMs,
  }));
  t.equal(resolveCompletePartialSnapshot(
    snapshotRows.map((row, index) => index === 0 ? {
      ...row,
      partial_json: JSON.stringify([
        {groupKey: 1, aggValue: 5},
        {groupKey: 2, aggValue: 4},
        {groupKey: 3, aggValue: 3},
      ]),
    } : row),
    snapshotConfig,
    2,
    nowMs,
  ).reason, PARALLEL_REDUCE_REASON.PARTIAL_UNBOUNDED,
  'a replica cannot exceed its per-slot top-N bound');
  t.equal(resolveCompletePartialSnapshot(
    snapshotRows.map((row) => ({...row, computed_at: 0})),
    snapshotConfig,
    2,
    nowMs,
  ).reason, PARALLEL_REDUCE_REASON.PARTIAL_STALE,
  'expired partial generations cannot be merged');
  const invalidScalarSnapshot = resolveCompletePartialSnapshot(
    snapshotRows.map((row, index) => index === 0 ? {
      ...row,
      partial_json: JSON.stringify([
        {groupKey: {nested: true}, aggValue: null},
      ]),
    } : row),
    snapshotConfig,
    2,
    nowMs,
  );
  t.equal(invalidScalarSnapshot.reason,
    PARALLEL_REDUCE_REASON.PARTIAL_INVALID,
    'objects and coercible null values are not valid reduce scalars');
  const overlapSnapshot = resolveCompletePartialSnapshot(
    snapshotRows.map((row) => ({
      ...row,
      partial_json: JSON.stringify([{groupKey: 50, aggValue: 5}]),
    })),
    snapshotConfig,
    2,
    nowMs,
  );
  t.equal(overlapSnapshot.reason, PARALLEL_REDUCE_REASON.SHARD_OVERLAP,
    'the canonical snapshot resolver reports overlapping shards as ' +
      'incomplete');
  t.end();
});

test('single-zone learned-affinity evidence uses production node weights and requires ' +
  'the best achievable placement', async (t) => {
  const nowMs = 5000;
  const common = {
    serviceId: 'svc-affinity',
    nodes: [
      {node_id: 'n1', latency_group_id: 'one-zone'},
      {node_id: 'n2', latency_group_id: 'one-zone'},
      {node_id: 'n3', latency_group_id: 'one-zone'},
    ],
    partitions: [
      {partition_id: 'p1', leader_node_id: 'n1'},
      {partition_id: 'p2', leader_node_id: 'n2'},
    ],
    services: [
      {partition_id: 'p1', node_id: 'n1', service_type: 'partition',
        status: 'active'},
      {partition_id: 'p1', node_id: 'n2', service_type: 'partition',
        status: 'active'},
      {partition_id: 'p2', node_id: 'n2', service_type: 'partition',
        status: 'active'},
      {partition_id: 'p2', node_id: 'n3', service_type: 'partition',
        status: 'active'},
    ],
    attributionRows: [{
      node_id: 'n1',
      service_id: 'svc-affinity',
      access_json: JSON.stringify({
        p1: {r: 10, w: 0},
        p2: {r: 5, w: 0},
      }),
      published_at: nowMs,
    }],
    nowMs,
  };
  const affinityOff = buildWeightedLocalitySnapshot({
    ...common,
    placements: [{nodeId: 'n1'}, {nodeId: 'n3'}],
  });
  const affinityOn = buildWeightedLocalitySnapshot({
    ...common,
    placements: [{nodeId: 'n1'}, {nodeId: 'n2'}],
  });
  t.same(affinityOn.nodeWeights, {n1: 2 / 3, n2: 1, n3: 1 / 3},
    'the demo consumes the production weight owner rather than an ' +
      'any-holder union');
  t.ok(Math.abs(affinityOff.localityRatio - 0.6) < 1e-9,
    'an any-holder placement can still be observably suboptimal');
  t.equal(affinityOn.localityRatio, 1,
    'the highest-weight two-node placement is the measurable optimum');

  const topN = [
    {rank: 1, group_key: 50, agg_value: 5},
    {rank: 2, group_key: 258, agg_value: 4},
  ];
  const freshComputedAt = Date.now();
  const phaseStartedAt = freshComputedAt - 1;
  const freshLease = Date.now() + 10000;
  const evidenceParallelConfig = {
    shardSqlBySlot: {1: 'shard-one', 2: 'shard-two'},
    coordinationTable: 'reduce_slots',
    leaseMs: 10000,
    coordinatorSlot: 1,
    resultId: 'global',
  };
  const placements = [
    {replicaId: 'svc-affinity-r3', nodeId: 'n1'},
    {replicaId: 'svc-affinity-r4', nodeId: 'n2'},
  ];
  const reduceSlots = [
    {
      slot_id: 1,
      replica_id: 'svc-affinity-r3',
      lease_expires_at: freshLease,
      partial_json: JSON.stringify([{groupKey: 50, aggValue: 5}]),
      computed_at: freshComputedAt,
    },
    {
      slot_id: 2,
      replica_id: 'svc-affinity-r4',
      lease_expires_at: freshLease,
      partial_json: JSON.stringify([{groupKey: 258, aggValue: 4}]),
      computed_at: freshComputedAt,
    },
  ];
  const assessment = assessAffinityDemoCompletion({
    expectedReplicaCount: 2,
    placements,
    weightedLocality: affinityOn,
    referenceTopN: topN,
    serviceTopN: topN.map((row) => ({
      ...row, computed_at: freshComputedAt,
    })),
    reduceSlots,
    expectedMergeCandidateCount: 2,
    phaseStartedAt,
    parallelReduceConfig: evidenceParallelConfig,
    partialLimit: 1,
  });
  t.equal(assessment.complete, true,
    'completion joins optimal placement, both replica partials, and ' +
      'the unchanged exact result');
  const reportPhase = summarizePhase({
    phaseStartedAt,
    weightedLocality: affinityOn,
    placements,
    reduceSlots,
    serviceTopN: topN.map((row) => ({
      ...row, computed_at: freshComputedAt,
    })),
    assessment,
    elapsedMs: 25,
  });
  t.same(reportPhase.slotOwners.map((slot) => slot.replicaId),
    placements.map((placement) => placement.replicaId),
    'the live report projects the identities used by completion');
  t.equal(reportPhase.assessment.identitiesCurrent, true,
    'the live report retains the current-identity verdict');
  t.equal(reportPhase.assessment.partialsFresh, true,
    'the live report retains partial freshness evidence');
  t.equal(reportPhase.assessment.partialsBounded, true,
    'the live report retains the bounded-candidate verdict');
  t.equal(reportPhase.assessment.resultFresh, true,
    'the live report retains result chronology evidence');
  t.equal(reportPhase.assessment.placementOptimal, true,
    'the live report retains the production-weighted optimum verdict');
  t.equal(assessAffinityDemoCompletion({
    expectedReplicaCount: 2,
    placements,
    weightedLocality: affinityOn,
    referenceTopN: topN,
    serviceTopN: topN.map((row) => ({
      ...row, computed_at: freshComputedAt,
    })),
    reduceSlots: reduceSlots.map((slot) => ({
      ...slot,
      replica_id: `${slot.replica_id}-stale`,
    })),
    expectedMergeCandidateCount: 2,
    phaseStartedAt,
    parallelReduceConfig: evidenceParallelConfig,
    partialLimit: 1,
  }).complete, false, 'stale replica partial identities cannot close');
  t.equal(assessAffinityDemoCompletion({
    expectedReplicaCount: 2,
    placements: placements.map((placement) => ({
      ...placement, nodeId: 'n1',
    })),
    weightedLocality: {
      ...affinityOn, localityRatio: 1.2,
    },
    referenceTopN: topN,
    serviceTopN: topN.map((row) => ({
      ...row, computed_at: freshComputedAt,
    })),
    reduceSlots,
    expectedMergeCandidateCount: 2,
    phaseStartedAt,
    parallelReduceConfig: evidenceParallelConfig,
    partialLimit: 1,
  }).complete, false, 'duplicate-node placement cannot inflate locality');
  const completionForSlots = (slots) => assessAffinityDemoCompletion({
    expectedReplicaCount: 2,
    placements,
    weightedLocality: affinityOn,
    referenceTopN: topN,
    serviceTopN: topN.map((row) => ({
      ...row, computed_at: freshComputedAt,
    })),
    reduceSlots: slots,
    expectedMergeCandidateCount: 2,
    phaseStartedAt,
    parallelReduceConfig: evidenceParallelConfig,
    partialLimit: 1,
  }).complete;
  t.equal(completionForSlots(reduceSlots.map((slot, index) => ({
    ...slot,
    partial_json: index === 0 ?
      JSON.stringify([{bogus: true}]) :
      slot.partial_json,
  }))), false, 'malformed partial entries cannot close the demo');
  t.equal(completionForSlots(reduceSlots.map((slot) => ({
    ...slot,
    partial_json: JSON.stringify([{groupKey: 1, aggValue: 5}]),
  }))), false, 'overlapping group shards cannot close the demo');
  t.equal(assessAffinityDemoCompletion({
    expectedReplicaCount: 2,
    placements,
    weightedLocality: affinityOn,
    referenceTopN: topN,
    serviceTopN: topN.map((row) => ({
      ...row, computed_at: freshComputedAt - 1,
    })),
    reduceSlots,
    expectedMergeCandidateCount: 2,
    phaseStartedAt,
    parallelReduceConfig: evidenceParallelConfig,
    partialLimit: 1,
  }).complete, false,
  'a result older than its accepted partial snapshots cannot close');
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
    serviceId: 'svc-affinity-demo-r1',
    service_id: 'svc-affinity-demo',
    entityId: 'svc-affinity-demo',
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
    'the injected executor uses the canonical service entity id, not ' +
      'the placed replica id, so policy lookup and attribution join');
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

test('parallel coordination executor uses normal SQL without polluting ' +
  'service data-access attribution', async (t) => {
  const calls = [];
  const engine = Object.create(
    SQLQueryEngineLifecycleAndCallbackDispatch.prototype,
  );
  engine.executeQuery = async (sql, params, options) => {
    calls.push({sql, params, options});
    return {success: true};
  };
  engine.executeRequest = async () => ({success: true});
  let factory = null;
  engine._wireQueryExecutorFactory({
    setQueryExecutorFactory(value) {
      factory = value;
    },
  });
  const executor = factory('svc-affinity');
  await executor('SELECT * FROM ratings', []);
  await executor.executeInternal('SELECT * FROM reduce_slots', []);
  t.equal(calls[0].options.issuingServiceId, 'svc-affinity',
    'workload SQL contributes to the service/data affinity matrix');
  t.equal(calls[1].options.issuingServiceId, undefined,
    'lease and snapshot SQL cannot steer placement toward its own ' +
      'coordination table');
  t.equal(calls[1].options.sessionId, 'svc-affinity',
    'internal SQL retains the service session and normal query path');
  t.end();
});

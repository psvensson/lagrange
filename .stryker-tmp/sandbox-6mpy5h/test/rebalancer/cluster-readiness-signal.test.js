/**
 * Unit tests for ClusterReadinessSignal.
 * Tests cluster readiness evaluation for rebalancer planning.
 * Requirements: 4.2
 */
// @ts-nocheck


import {test} from '../../src/test-helpers/tap.js';
import {ClusterReadinessSignal} from
  '../../src/rebalancer/cluster-readiness-signal.js';
import {
  CLUSTER_READINESS_CONDITION,
} from '../../src/constants/cdc-lifecycle-constants.js';
import {NODE_STATE} from '../../src/constants/node-state.js';
import {CDC_PROPAGATED_TABLES} from '../../src/cache/cache-constants.js';

/**
 * Build a tables object with a placeholder record for every
 * CDC-propagated table, then overlay caller-provided overrides.
 * @param {Object} [overrides] — { tableName: [records] }
 * @return {Object}
 */
function buildHydratedTables(overrides = {}) {
  const tables = {};
  for (const t of CDC_PROPAGATED_TABLES) {
    tables[t] = [{_placeholder: true}];
  }
  return {...tables, ...overrides};
}

/**
 * Minimal SystemTableCache stub supporting filter and getAll.
 * @param {Object} tables — { tableName: [records] }
 */
function createCacheStub(tables = {}) {
  return {
    filter(tableName, predicate) {
      const records = tables[tableName] || [];
      return records.filter(predicate);
    },
    getAll(tableName) {
      return tables[tableName] || [];
    },
  };
}

/**
 * Minimal CDCPipelineReadinessGate stub.
 * @param {boolean} ready
 */
function createGateStub(ready) {
  return {
    evaluate(_context) {
      return {ready, unmetConditions: ready ? [] : ['stubCondition']};
    },
  };
}

/**
 * Build a minimal context object for evaluate().
 */
function createContext() {
  return {
    partitionServices: new Map(),
    messageGroupServices: new Map(),
  };
}

// --- All conditions met ---

test('ClusterReadinessSignal — all conditions met returns ready', (t) => {
  const cache = createCacheStub(buildHydratedTables({
    nodes: [
      {node_id: 'n1', status: NODE_STATE.ACTIVE},
      {node_id: 'n2', status: NODE_STATE.ACTIVE},
    ],
  }));

  const signal = new ClusterReadinessSignal({
    cdcPipelineReadinessGate: createGateStub(true),
    systemTableCache: cache,
    expectedNodeCount: 2,
  });

  const result = signal.evaluate(createContext());
  t.equal(result.ready, true);
  t.equal(result.unmetConditions.length, 0);
  t.end();
});

// --- No conditions met ---

test('ClusterReadinessSignal — no conditions met returns all unmet',
  (t) => {
    const cache = createCacheStub({});
    const signal = new ClusterReadinessSignal({
      cdcPipelineReadinessGate: createGateStub(false),
      systemTableCache: cache,
      expectedNodeCount: 2,
    });

    const result = signal.evaluate(createContext());
    t.equal(result.ready, false);
    t.equal(result.unmetConditions.length, 3);
    t.ok(result.unmetConditions.includes(
      CLUSTER_READINESS_CONDITION.CDC_PIPELINE_READY
    ));
    t.ok(result.unmetConditions.includes(
      CLUSTER_READINESS_CONDITION.NODES_REGISTERED
    ));
    t.ok(result.unmetConditions.includes(
      CLUSTER_READINESS_CONDITION.CACHE_HYDRATED
    ));
    t.end();
  });

// --- Individual condition failures ---

test('ClusterReadinessSignal — CDC pipeline not ready', (t) => {
  const cache = createCacheStub(buildHydratedTables({
    nodes: [{node_id: 'n1', status: NODE_STATE.ACTIVE}],
  }));

  const signal = new ClusterReadinessSignal({
    cdcPipelineReadinessGate: createGateStub(false),
    systemTableCache: cache,
    expectedNodeCount: 1,
  });

  const result = signal.evaluate(createContext());
  t.equal(result.ready, false);
  t.ok(result.unmetConditions.includes(
    CLUSTER_READINESS_CONDITION.CDC_PIPELINE_READY
  ));
  t.notOk(result.unmetConditions.includes(
    CLUSTER_READINESS_CONDITION.NODES_REGISTERED
  ));
  t.notOk(result.unmetConditions.includes(
    CLUSTER_READINESS_CONDITION.CACHE_HYDRATED
  ));
  t.end();
});

test('ClusterReadinessSignal — not enough active nodes', (t) => {
  const cache = createCacheStub(buildHydratedTables({
    nodes: [
      {node_id: 'n1', status: NODE_STATE.ACTIVE},
      {node_id: 'n2', status: NODE_STATE.JOINING},
    ],
  }));

  const signal = new ClusterReadinessSignal({
    cdcPipelineReadinessGate: createGateStub(true),
    systemTableCache: cache,
    expectedNodeCount: 2,
  });

  const result = signal.evaluate(createContext());
  t.equal(result.ready, false);
  t.ok(result.unmetConditions.includes(
    CLUSTER_READINESS_CONDITION.NODES_REGISTERED
  ));
  t.notOk(result.unmetConditions.includes(
    CLUSTER_READINESS_CONDITION.CDC_PIPELINE_READY
  ));
  t.end();
});

test('ClusterReadinessSignal — cache not hydrated for all tables', (t) => {
  const cache = createCacheStub({
    nodes: [{node_id: 'n1', status: NODE_STATE.ACTIVE}],
    partitions: [{partition_id: 'p1'}],
    // Missing other CDC-propagated tables
  });

  const signal = new ClusterReadinessSignal({
    cdcPipelineReadinessGate: createGateStub(true),
    systemTableCache: cache,
    expectedNodeCount: 1,
  });

  const result = signal.evaluate(createContext());
  t.equal(result.ready, false);
  t.ok(result.unmetConditions.includes(
    CLUSTER_READINESS_CONDITION.CACHE_HYDRATED
  ));
  t.end();
});

// --- Edge cases ---

test('ClusterReadinessSignal — zero expected nodes always passes node check',
  (t) => {
    const cache = createCacheStub(buildHydratedTables({
      nodes: [],
    }));

    const signal = new ClusterReadinessSignal({
      cdcPipelineReadinessGate: createGateStub(true),
      systemTableCache: cache,
      expectedNodeCount: 0,
    });

    const result = signal.evaluate(createContext());
    t.notOk(result.unmetConditions.includes(
      CLUSTER_READINESS_CONDITION.NODES_REGISTERED
    ));
    t.end();
  });

test('ClusterReadinessSignal — no gate instance fails CDC pipeline check',
  (t) => {
    const cache = createCacheStub({
      nodes: [{node_id: 'n1', status: NODE_STATE.ACTIVE}],
    });

    const signal = new ClusterReadinessSignal({
      systemTableCache: cache,
      expectedNodeCount: 1,
    });

    const result = signal.evaluate(createContext());
    t.ok(result.unmetConditions.includes(
      CLUSTER_READINESS_CONDITION.CDC_PIPELINE_READY
    ));
    t.end();
  });

test('ClusterReadinessSignal — no cache instance fails node and hydration',
  (t) => {
    const signal = new ClusterReadinessSignal({
      cdcPipelineReadinessGate: createGateStub(true),
      expectedNodeCount: 1,
    });

    const result = signal.evaluate(createContext());
    t.ok(result.unmetConditions.includes(
      CLUSTER_READINESS_CONDITION.NODES_REGISTERED
    ));
    t.ok(result.unmetConditions.includes(
      CLUSTER_READINESS_CONDITION.CACHE_HYDRATED
    ));
    t.end();
  });

test('ClusterReadinessSignal — nodes with non-ACTIVE status not counted',
  (t) => {
    const cache = createCacheStub(buildHydratedTables({
      nodes: [
        {node_id: 'n1', status: NODE_STATE.ACTIVE},
        {node_id: 'n2', status: NODE_STATE.FAILED},
        {node_id: 'n3', status: NODE_STATE.SUSPECTED},
        {node_id: 'n4', status: NODE_STATE.READY},
      ],
    }));

    const signal = new ClusterReadinessSignal({
      cdcPipelineReadinessGate: createGateStub(true),
      systemTableCache: cache,
      expectedNodeCount: 2,
    });

    const result = signal.evaluate(createContext());
    t.equal(result.ready, false);
    t.ok(result.unmetConditions.includes(
      CLUSTER_READINESS_CONDITION.NODES_REGISTERED
    ));
    t.end();
  });

test('ClusterReadinessSignal — cache getAll throwing returns not hydrated',
  (t) => {
    const cache = {
      filter() {
        return [{node_id: 'n1', status: NODE_STATE.ACTIVE}];
      },
      getAll() {
        throw new Error('table not found');
      },
    };

    const signal = new ClusterReadinessSignal({
      cdcPipelineReadinessGate: createGateStub(true),
      systemTableCache: cache,
      expectedNodeCount: 1,
    });

    const result = signal.evaluate(createContext());
    t.ok(result.unmetConditions.includes(
      CLUSTER_READINESS_CONDITION.CACHE_HYDRATED
    ));
    t.end();
  });

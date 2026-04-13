// @ts-nocheck
import {test} from '../../src/test-helpers/tap.js';
import assert from 'node:assert/strict';
import fc from 'fast-check';
import {LoggingService} from '../../src/logging/logging-service.js';
import {COLUMN, TABLES} from '../../src/constants/index.js';
import {LATENCY_GROUP_STATE} from '../../src/topology/latency-topology-constants.js';
import {LatencyTreeService} from '../../src/topology/latency-tree-service.js';

function setupLogging() {
  LoggingService.resetInstance();
  const logging = LoggingService.getInstance();
  logging.initialize({level: 'error'});
}

function teardownLogging() {
  LoggingService.resetInstance();
}

function createTopologyCache({nodes = [], groups = [], edges = []} = {}) {
  const nodeRows = new Map(
    nodes.map((row) => [row[COLUMN.NODE_ID], {...row}]),
  );
  const groupRows = groups.map((row) => ({...row}));
  const edgeRows = edges.map((row) => ({...row}));
  const listeners = new Set();

  return {
    get(tableName, key) {
      if (tableName === TABLES.NODES) {
        return nodeRows.get(key) || null;
      }
      return null;
    },
    getAll(tableName) {
      if (tableName === TABLES.LATENCY_GROUPS) {
        return groupRows.map((row) => ({...row}));
      }
      if (tableName === TABLES.INTER_GROUP_LATENCIES) {
        return edgeRows.map((row) => ({...row}));
      }
      return [];
    },
    onCacheChange(listener) {
      listeners.add(listener);
    },
    offCacheChange(listener) {
      listeners.delete(listener);
    },
    emitCacheChange(tableName) {
      for (const listener of listeners.values()) {
        listener(tableName);
      }
    },
    listenerCount() {
      return listeners.size;
    },
  };
}

function createGroupRow(groupId, state = LATENCY_GROUP_STATE.ACTIVE) {
  return {
    [COLUMN.GROUP_ID]: groupId,
    [COLUMN.STATE]: state,
  };
}

function createEdgeRow(sourceGroupId, targetGroupId, latencyMs, sampleCount = 3) {
  return {
    [COLUMN.SOURCE_GROUP_ID]: sourceGroupId,
    [COLUMN.TARGET_GROUP_ID]: targetGroupId,
    [COLUMN.LATENCY_MS]: latencyMs,
    [COLUMN.SAMPLE_COUNT]: sampleCount,
    [COLUMN.LAST_MEASURED_AT]: 1000,
  };
}

test('LatencyTreeService builds routing and neighbor order from topology metadata',
  async (t) => {
    setupLogging();
    const cache = createTopologyCache({
      nodes: [{
        [COLUMN.NODE_ID]: 'node-a',
        [COLUMN.LATENCY_GROUP_ID]: 'g-2',
      }],
      groups: [
        createGroupRow('g-1'),
        createGroupRow('g-2'),
        createGroupRow('g-3'),
      ],
      edges: [
        createEdgeRow('g-2', 'g-1', 10),
        createEdgeRow('g-1', 'g-3', 5),
        createEdgeRow('g-2', 'g-3', 30),
      ],
    });

    const service = new LatencyTreeService({
      nodeId: 'node-a',
      systemTableCache: cache,
      nowFn: () => 5000,
    });
    service.initialize();

    const result = service.recompute();

    assert.equal(result.localGroupId, 'g-2');
    assert.equal(result.groupCount, 3);
    assert.equal(result.edgeCount, 3);
    assert.deepEqual(service.getRoutingOrder(), ['g-2', 'g-1', 'g-3']);
    assert.deepEqual(
      service.getNeighborOrder('g-2').map((entry) => entry.targetGroupId),
      ['g-1', 'g-3'],
    );
    assert.equal(service.getLatencyMs('g-2', 'g-1'), 10);
    assert.equal(service.getStats().lastRecomputeAt, 5000);

    teardownLogging();
    t.end();
  });

test('LatencyTreeService recomputes on watched cache changes only', async (t) => {
  setupLogging();
  const cache = createTopologyCache({
    nodes: [{
      [COLUMN.NODE_ID]: 'node-a',
      [COLUMN.LATENCY_GROUP_ID]: 'g-1',
    }],
    groups: [
      createGroupRow('g-1'),
      createGroupRow('g-2'),
    ],
    edges: [createEdgeRow('g-1', 'g-2', 20)],
  });

  const service = new LatencyTreeService({
    nodeId: 'node-a',
    systemTableCache: cache,
  });
  service.initialize();
  service.start({recomputeImmediately: false});

  assert.equal(cache.listenerCount(), 1);
  assert.equal(service.getStats().recomputeCount, 0);
  cache.emitCacheChange(TABLES.SERVICES);
  assert.equal(service.getStats().recomputeCount, 0);

  cache.emitCacheChange(TABLES.LATENCY_GROUPS);
  assert.equal(service.getStats().cacheChangeTriggerCount, 1);
  assert.equal(service.getStats().recomputeCount, 1);

  service.stop();
  assert.equal(cache.listenerCount(), 0);
  cache.emitCacheChange(TABLES.LATENCY_GROUPS);
  assert.equal(service.getStats().recomputeCount, 1);

  teardownLogging();
  t.end();
});

test('LatencyTreeService ordering is deterministic across metadata row ordering',
  async (t) => {
    setupLogging();
    const canonicalEdges = [
      createEdgeRow('g-1', 'g-2', 20),
      createEdgeRow('g-1', 'g-2', 10),
      createEdgeRow('g-2', 'g-3', 5),
      createEdgeRow('g-1', 'g-3', 30),
    ];

    const computeOrdering = (edgeRows) => {
      const cache = createTopologyCache({
        nodes: [{
          [COLUMN.NODE_ID]: 'node-a',
          [COLUMN.LATENCY_GROUP_ID]: 'g-1',
        }],
        groups: [
          createGroupRow('g-1'),
          createGroupRow('g-2'),
          createGroupRow('g-3'),
        ],
        edges: edgeRows,
      });
      const service = new LatencyTreeService({
        nodeId: 'node-a',
        systemTableCache: cache,
      });
      service.initialize();
      service.recompute();
      return {
        routing: service.getRoutingOrder('g-1'),
        latencyToG2: service.getLatencyMs('g-1', 'g-2'),
      };
    };

    const baseline = computeOrdering(canonicalEdges);

    await fc.assert(
      fc.property(
        fc.shuffledSubarray(canonicalEdges, {
          minLength: canonicalEdges.length,
          maxLength: canonicalEdges.length,
        }),
        (shuffledEdges) => {
          const result = computeOrdering(shuffledEdges);
          assert.deepEqual(result.routing, baseline.routing);
          assert.equal(result.latencyToG2, baseline.latencyToG2);
        },
      ),
      {numRuns: 10},
    );

    teardownLogging();
    t.end();
  });

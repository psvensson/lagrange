/**
 * Property-based tests for load metrics accuracy.
 *
 * Feature: distributed-testing-framework
 * Property 11: Load Metrics Accuracy
 *
 * **Validates: Requirements 6.3**
 */

import {test} from '../../../../src/test-helpers/tap.js';
import assert from 'node:assert/strict';
import fc from 'fast-check';
import {computeMetrics} from '../load-generator.js';

const MS_PER_SECOND = 1000;

/**
 * Property 11: Load Metrics Accuracy
 *
 * *For any* sequence of operations with known success/failure
 * outcomes and measured latencies, the Load_Generator metrics
 * SHALL accurately report total count, success count, failure
 * count, and latency percentiles (p50, p95, p99) consistent
 * with the recorded latencies.
 *
 * **Validates: Requirements 6.3**
 */
test('Property 11: Load Metrics Accuracy', async (t) => {
  await t.test(
    'total, success, failed, errors match inputs',
    async () => {
      await fc.assert(
        fc.property(
          fc.array(fc.nat({max: 10000}), {maxLength: 50}),
          fc.nat({max: 10000}),
          fc.nat({max: 10000}),
          fc.nat({max: 10000}),
          fc.integer({min: 1, max: 100000}),
          (latencies, successCount, failedCount, errorCount,
            durationMs) => {
            const m = computeMetrics(
              latencies, successCount, failedCount,
              errorCount, durationMs,
            );

            assert.strictEqual(
              m.total, successCount + failedCount,
            );
            assert.strictEqual(m.success, successCount);
            assert.strictEqual(m.failed, failedCount);
            assert.strictEqual(m.errors, errorCount);
          },
        ),
        {numRuns: 10},
      );
    },
  );

  await t.test(
    'percentiles are values from sorted latencies or 0',
    async () => {
      await fc.assert(
        fc.property(
          fc.array(fc.nat({max: 10000}), {maxLength: 50}),
          fc.nat({max: 1000}),
          fc.nat({max: 1000}),
          fc.nat({max: 1000}),
          fc.integer({min: 1, max: 100000}),
          (latencies, successCount, failedCount, errorCount,
            durationMs) => {
            const m = computeMetrics(
              latencies, successCount, failedCount,
              errorCount, durationMs,
            );

            const sorted = [...latencies].sort((a, b) => a - b);

            if (sorted.length === 0) {
              assert.strictEqual(m.latency.p50, 0);
              assert.strictEqual(m.latency.p95, 0);
              assert.strictEqual(m.latency.p99, 0);
            } else {
              assert.ok(
                sorted.includes(m.latency.p50),
                'p50 should be a value in the sorted array',
              );
              assert.ok(
                sorted.includes(m.latency.p95),
                'p95 should be a value in the sorted array',
              );
              assert.ok(
                sorted.includes(m.latency.p99),
                'p99 should be a value in the sorted array',
              );
            }
          },
        ),
        {numRuns: 10},
      );
    },
  );

  await t.test(
    'percentiles are monotonic: p50 <= p95 <= p99',
    async () => {
      await fc.assert(
        fc.property(
          fc.array(fc.nat({max: 10000}), {maxLength: 50}),
          fc.nat({max: 1000}),
          fc.nat({max: 1000}),
          fc.nat({max: 1000}),
          fc.integer({min: 1, max: 100000}),
          (latencies, successCount, failedCount, errorCount,
            durationMs) => {
            const m = computeMetrics(
              latencies, successCount, failedCount,
              errorCount, durationMs,
            );

            assert.ok(
              m.latency.p50 <= m.latency.p95,
              `p50 (${m.latency.p50}) should be <= ` +
              `p95 (${m.latency.p95})`,
            );
            assert.ok(
              m.latency.p95 <= m.latency.p99,
              `p95 (${m.latency.p95}) should be <= ` +
              `p99 (${m.latency.p99})`,
            );
          },
        ),
        {numRuns: 10},
      );
    },
  );

  await t.test(
    'opsPerSec is computed correctly',
    async () => {
      await fc.assert(
        fc.property(
          fc.array(fc.nat({max: 10000}), {maxLength: 50}),
          fc.nat({max: 10000}),
          fc.nat({max: 10000}),
          fc.nat({max: 10000}),
          fc.integer({min: 1, max: 100000}),
          (latencies, successCount, failedCount, errorCount,
            durationMs) => {
            const m = computeMetrics(
              latencies, successCount, failedCount,
              errorCount, durationMs,
            );

            const expectedCorrect =
              (successCount / durationMs) * MS_PER_SECOND;
            const expectedAttempted =
              ((successCount + failedCount) / durationMs) * MS_PER_SECOND;
            assert.strictEqual(m.opsPerSec, expectedCorrect);
            assert.strictEqual(m.correctOpsPerSec, expectedCorrect);
            assert.strictEqual(m.attemptedOpsPerSec, expectedAttempted);
          },
        ),
        {numRuns: 10},
      );
    },
  );
});

/**
 * Unit tests for Load Generator.
 *
 * Tests: waitComplete resolves after duration (Req 6.4),
 *        node failover records failure and retries (Req 6.5),
 *        cancel stops the load run,
 *        getMetrics returns snapshot during run.
 */
import {LoadGenerator, LoadRun} from '../load-generator.js';
import {registerLoadGeneratorTailTests} from './load-generator-tail-test-cases.js';

const ZERO = 0;
const ONE = 1;
const CANCEL_DISPATCH_SETTLE_MS = 25;
const CANCEL_WAIT_TIMEOUT_MS = 200;
const ADMISSION_BACKOFF_MS = 30;
const BREAKER_OWNER_NODE_CLIENT = 'node-client';
const NODE_CLIENT_ERROR_CODE_CIRCUIT_OPEN = 'circuit_open';
const NODE_CLIENT_ERROR_CODE_OPERATION = 'operation_error';
const SLOT_STALLED_QUERY_TIMEOUT_MS = 200;
const SLOT_STALLED_MAX_IN_FLIGHT = 20;
const SLOT_STALLED_NODE_MAX_IN_FLIGHT = 2;
const SLOT_STALLED_OPERATION = 'SELECT';
const SLOT_STALLED_STARTED_AT_OFFSET_MS = 80;
const SLOT_STALLED_FRESH_STARTED_AT_OFFSET_MS = 10;
const SLOT_STALLED_EXPECTED_BORROWED_NODE_CAP = 10;
const SLOT_STALLED_EXPECTED_DISPATCH_NODE_IDS = Object.freeze([
  'healthy-a',
  'healthy-b',
]);
const SLOT_STALLED_EXPECTED_EMPTY_CANDIDATE_IDS = Object.freeze([]);

/**
 * Create a mock node whose query method resolves immediately.
 * @param {string} id
 * @returns {Object}
 */
function createMockNode(id) {
  return {
    id,
    async query(_sql) {
      return {rows: []};
    },
  };
}

/**
 * Create a mock node whose query method always rejects.
 * @param {string} id
 * @returns {Object}
 */
function createFailingNode(id) {
  return {
    id,
    async query(_sql) {
      throw new Error(`node ${id} unreachable`);
    },
  };
}

function createNodeInFlightTokens(startTokenId, tokenCount, startedAtMs) {
  return Array.from({length: tokenCount}, (_unusedValue, index) => ({
    tokenId: startTokenId + index,
    startedAtMs,
  }));
}

test('waitComplete resolves after duration with metrics', async () => {
  const nodes = [createMockNode('n1'), createMockNode('n2')];
  const gen = new LoadGenerator(nodes, {
    opsPerSec: 200,
    duration: 100,
  });
  const run = gen.start();
  try {
    const metrics = await run.waitComplete();
    assert.ok(metrics, 'waitComplete should resolve with metrics');
    assert.ok(
      metrics.total > ZERO,
      `expected total > 0, got ${metrics.total}`,
    );
    assert.strictEqual(typeof metrics.success, 'number');
    assert.strictEqual(typeof metrics.failed, 'number');
    assert.strictEqual(typeof metrics.errors, 'number');
    assert.ok(metrics.latency, 'metrics should include latency');
    assert.strictEqual(typeof metrics.opsPerSec, 'number');
  } finally {
    run.cancel();
  }
});

test('strict pacing does not exceed configured rate target', async () => {
  const nodes = [createMockNode('n1')];
  const opsPerSec = 100;
  const durationMs = 500;
  const expectedMaxTotal = Math.floor((opsPerSec * durationMs) / MS_PER_SECOND);
  const gen = new LoadGenerator(nodes, {
    opsPerSec,
    duration: durationMs,
    maxInFlight: 200,
  });
  const run = gen.start();
  try {
    const metrics = await run.waitComplete();
    assert.ok(
      metrics.total <= expectedMaxTotal,
      `expected total <= ${expectedMaxTotal}, got ${metrics.total}`,
    );
  } finally {
    run.cancel();
  }
});

test('load queries use the dedicated load lane when timeout-aware node handles are available',
  async () => {
    const observedLanes = [];
    const node = {
      id: 'lane-aware-node',
      async queryWithTimeout(_sql, _params = [], options = {}) {
        observedLanes.push(options?.lane || null);
        return {rows: []};
      },
    };
    const gen = new LoadGenerator([node], {
      opsPerSec: 50,
      duration: 120,
      maxInFlight: 4,
    });
    const run = gen.start();
    try {
      const metrics = await run.waitComplete();
      assert.ok(metrics.success > ZERO, 'expected at least one successful load query');
      assert.ok(observedLanes.length > ZERO, 'expected timeout-aware load queries to be observed');
      assert.deepEqual(
        [...new Set(observedLanes)],
        ['load'],
        'load-generator should route timeout-aware load queries through the dedicated load lane',
      );
    } finally {
      run.cancel();
    }
  });

test('load dispatch is spread across nodes', async () => {
  const calls = {
    n1: ZERO,
    n2: ZERO,
    n3: ZERO,
  };
  const nodes = ['n1', 'n2', 'n3'].map((id) => ({
    id,
    async query(_sql) {
      calls[id]++;
      return {rows: []};
    },
  }));

  const gen = new LoadGenerator(nodes, {
    opsPerSec: 120,
    duration: 200,
  });
  const run = gen.start();
  try {
    await run.waitComplete();
    assert.ok(
      calls.n1 > ZERO &&
      calls.n2 > ZERO &&
      calls.n3 > ZERO,
      'expected all nodes to receive load queries',
    );
  } finally {
    run.cancel();
  }
});

test('nodeResolver refreshes the tracked node set with stable per-node keys',
  async () => {
    const initialNode = {
      id: 'initial-node',
      async query() {
        return {rows: []};
      },
    };
    const lateNode = {
      id: 'late-node',
      async query() {
        return {rows: []};
      },
    };
    let dynamicNodes = [initialNode];

    const gen = new LoadGenerator([initialNode], {
      opsPerSec: 10,
      duration: 100,
      maxInFlight: 2,
      nodeMaxInFlight: 1,
      nodeResolver: () => dynamicNodes,
    });
    const run = gen.start();
    try {
      dynamicNodes = [initialNode, lateNode];
      run._syncAvailableNodesFromResolver();
      assert.equal(
        typeof run._nodeResolver,
        'function',
        'LoadGenerator.start should forward nodeResolver into the active load run',
      );
      assert.deepEqual(
        run._availableNodes.map((node) => node.id),
        ['initial-node', 'late-node'],
        'refreshed load runs should adopt the resolver-provided node set',
      );
      assert.ok(
        run._nodeHealthByKey.has('node-late-node'),
        'newly admitted nodes should receive stable health tracking keys',
      );
      assert.ok(
        run._nodeMetricsByKey.has('node-late-node'),
        'newly admitted nodes should receive stable metrics tracking keys',
      );
    } finally {
      run.cancel();
      await run.waitComplete();
    }
  });

test('nodeResolver can withdraw all active nodes without reverting to stale ' +
  'dispatch targets', async () => {
  const initialNode = {
    id: 'initial-node',
    async query() {
      return {rows: []};
    },
  };
  let dynamicNodes = [initialNode];

  const gen = new LoadGenerator([initialNode], {
    opsPerSec: 10,
    duration: 100,
    maxInFlight: 2,
    nodeMaxInFlight: 1,
    nodeResolver: () => dynamicNodes,
  });
  const run = gen.start();
  try {
    const initialNodeKey = 'node-initial-node';
    run._nodeMetricsByKey.get(initialNodeKey).dispatched = 3;
    dynamicNodes = [];
    run._syncAvailableNodesFromResolver();
    assert.deepEqual(
      run._availableNodes.map((node) => node.id),
      [],
      'resolver refresh should allow the active dispatch set to become empty',
    );
    assert.deepEqual(
      run._nodeHealthKeys,
      [],
      'no active node keys should remain after the resolver withdraws all nodes',
    );
    assert.equal(
      run._nodeMetricsByKey.get(initialNodeKey).dispatched,
      3,
      'historical metrics should survive temporary admission withdrawal',
    );
  } finally {
    run.cancel();
    await run.waitComplete();
  }
});

test('benchmark workload uses a unique event-id prefix for each run', async () => {
  const recordedSql = [];
  const node = {
    id: 'benchmark-node',
    async query(sql) {
      recordedSql.push(sql);
      return {rows: []};
    },
  };
  const extractEventIds = (statements) => statements
    .filter((sql) => sql.startsWith('INSERT OR IGNORE INTO benchmark_events '))
    .map((sql) => {
      const match = sql.match(/VALUES \('([^']+)'/);
      return match ? match[1] : null;
    })
    .filter(Boolean);

  const firstGenerator = new LoadGenerator([node], {
    opsPerSec: 80,
    duration: 120,
    workloadProfile: 'benchmark_events_mixed',
    maxInFlight: 16,
    nodeMaxInFlight: 2,
  });
  const firstRun = firstGenerator.start();
  try {
    await firstRun.waitComplete();
  } finally {
    firstRun.cancel();
  }
  const firstEventIds = extractEventIds(recordedSql.splice(ZERO));

  const secondGenerator = new LoadGenerator([node], {
    opsPerSec: 80,
    duration: 120,
    workloadProfile: 'benchmark_events_mixed',
    maxInFlight: 16,
    nodeMaxInFlight: 2,
  });
  const secondRun = secondGenerator.start();
  try {
    await secondRun.waitComplete();
  } finally {
    secondRun.cancel();
  }
  const secondEventIds = extractEventIds(recordedSql.splice(ZERO));
  const secondEventIdSet = new Set(secondEventIds);
  const overlappingEventIds = firstEventIds.filter((eventId) =>
    secondEventIdSet.has(eventId),
  );

  assert.ok(firstEventIds.length > ZERO, 'expected first run to issue INSERTs');
  assert.ok(secondEventIds.length > ZERO, 'expected second run to issue INSERTs');
  assert.deepEqual(
    overlappingEventIds,
    [],
    'benchmark event ids should not be reused across separate load runs',
  );
});

test('default workload uses a unique log-id prefix for each run', async () => {
  const recordedSql = [];
  const node = {
    id: 'default-node',
    async query(sql) {
      recordedSql.push(sql);
      return {rows: []};
    },
  };
  const extractLogIds = (statements) => statements
    .filter((sql) => sql.startsWith('INSERT INTO logs '))
    .map((sql) => {
      const match = sql.match(/VALUES \('([^']+)'/);
      return match ? match[1] : null;
    })
    .filter(Boolean);

  const firstGenerator = new LoadGenerator([node], {
    opsPerSec: 80,
    duration: 120,
    operations: ['INSERT'],
    maxInFlight: 16,
    nodeMaxInFlight: 2,
  });
  const firstRun = firstGenerator.start();
  try {
    await firstRun.waitComplete();
  } finally {
    firstRun.cancel();
  }
  const firstLogIds = extractLogIds(recordedSql.splice(ZERO));

  const secondGenerator = new LoadGenerator([node], {
    opsPerSec: 80,
    duration: 120,
    operations: ['INSERT'],
    maxInFlight: 16,
    nodeMaxInFlight: 2,
  });
  const secondRun = secondGenerator.start();
  try {
    await secondRun.waitComplete();
  } finally {
    secondRun.cancel();
  }
  const secondLogIds = extractLogIds(recordedSql.splice(ZERO));
  const secondLogIdSet = new Set(secondLogIds);
  const overlappingLogIds = firstLogIds.filter((logId) =>
    secondLogIdSet.has(logId),
  );

  assert.ok(firstLogIds.length > ZERO, 'expected first run to issue INSERTs');
  assert.ok(secondLogIds.length > ZERO, 'expected second run to issue INSERTs');
  assert.deepEqual(
    overlappingLogIds,
    [],
    'default workload log ids should not be reused across separate load runs',
  );
});

test('node failover retries without counting operation-level errors', async () => {
  const failNode = createFailingNode('fail-1');
  const goodNode = createMockNode('good-1');
  const gen = new LoadGenerator([failNode, goodNode], {
    opsPerSec: 200,
    duration: 100,
  });
  const run = gen.start();
  try {
    const metrics = await run.waitComplete();
    assert.strictEqual(metrics.errors, ZERO);
    assert.strictEqual(metrics.failed, ZERO);
    assert.ok(
      metrics.attemptErrors > ZERO,
      'expected failover attempts to be captured in attemptErrors',
    );
    assert.ok(
      metrics.success > ZERO,
      `expected success > 0, got ${metrics.success}`,
    );
  } finally {
    run.cancel();
  }
});

test('write timeouts do not fail over to another node', async () => {
  let timedOutCalls = ZERO;
  let goodNodeCalls = ZERO;
  const nodes = [
    {
      id: 'slow-writer',
      async queryWithTimeout() {
        timedOutCalls++;
        const error = new Error('query timed out after 2000ms');
        error.code = 'ETIMEDOUT';
        throw error;
      },
    },
    {
      id: 'good-writer',
      async queryWithTimeout() {
        goodNodeCalls++;
        return {rows: []};
      },
    },
  ];
  const gen = new LoadGenerator(nodes, {
    opsPerSec: 10,
    duration: 100,
    operations: ['INSERT'],
    queryTimeoutMs: 2000,
  });
  const run = gen.start();
  try {
    const metrics = await run.waitComplete();
    assert.ok(timedOutCalls > ZERO, 'expected timed-out writer to be attempted');
    assert.strictEqual(
      goodNodeCalls,
      ZERO,
      'timed-out INSERT should not be replayed on another node',
    );
    assert.ok(metrics.failed > ZERO, 'timed-out INSERT should surface as failed');
    assert.ok(metrics.errors > ZERO, 'timed-out INSERT should count as an error');
    assert.ok(
      metrics.attemptErrors > ZERO,
      'timed-out INSERT should still contribute attemptErrors',
    );
  } finally {
    run.cancel();
  }
});

test('benchmark INSERT timeouts fail over idempotently', async () => {
  let timedOutCalls = ZERO;
  let healthyNodeCalls = ZERO;
  const replayedSql = [];
  const nodes = [
    {
      id: 'slow-benchmark-writer',
      async queryWithTimeout(sql) {
        timedOutCalls++;
        replayedSql.push(sql);
        const error = new Error('query timed out after 2000ms');
        error.code = 'ETIMEDOUT';
        throw error;
      },
    },
    {
      id: 'healthy-benchmark-writer',
      async queryWithTimeout(sql) {
        healthyNodeCalls++;
        replayedSql.push(sql);
        return {rows: []};
      },
    },
  ];
  const gen = new LoadGenerator(nodes, {
    opsPerSec: 10,
    duration: 100,
    operations: ['INSERT'],
    workloadProfile: 'benchmark_events_mixed',
    queryTimeoutMs: 2000,
    maxInFlight: 1,
    nodeMaxInFlight: 1,
  });
  const run = gen.start();
  try {
    const metrics = await run.waitComplete();
    assert.ok(
      timedOutCalls > ZERO,
      'expected timed-out benchmark writer to be attempted',
    );
    assert.ok(
      healthyNodeCalls > ZERO,
      'timed-out benchmark INSERT should fail over to another node',
    );
    assert.equal(
      metrics.failed,
      ZERO,
      'idempotent benchmark INSERT retries should avoid failed operations',
    );
    assert.equal(
      metrics.errors,
      ZERO,
      'idempotent benchmark INSERT retries should avoid operation errors',
    );
    assert.ok(
      metrics.attemptErrors > ZERO,
      'timed-out benchmark INSERT should still contribute attemptErrors',
    );
    assert.ok(
      replayedSql.every((sql) =>
        sql.startsWith('INSERT OR IGNORE INTO benchmark_events ')),
      'benchmark INSERT retries should use idempotent INSERT OR IGNORE SQL',
    );
  } finally {
    run.cancel();
  }
});

test('read timeouts still fail over to another node', async () => {
  let timedOutCalls = ZERO;
  let goodNodeCalls = ZERO;
  const nodes = [
    {
      id: 'slow-reader',
      async queryWithTimeout() {
        timedOutCalls++;
        const error = new Error('query timed out after 2000ms');
        error.code = 'ETIMEDOUT';
        throw error;
      },
    },
    {
      id: 'good-reader',
      async queryWithTimeout() {
        goodNodeCalls++;
        return {rows: []};
      },
    },
  ];
  const gen = new LoadGenerator(nodes, {
    opsPerSec: 10,
    duration: 100,
    operations: ['SELECT'],
    queryTimeoutMs: 2000,
  });
  const run = gen.start();
  try {
    const metrics = await run.waitComplete();
    assert.ok(timedOutCalls > ZERO, 'expected timed-out reader to be attempted');
    assert.ok(goodNodeCalls > ZERO, 'timed-out SELECT should fail over');
    assert.strictEqual(metrics.failed, ZERO);
    assert.strictEqual(metrics.errors, ZERO);
    assert.ok(metrics.success > ZERO);
  } finally {
    run.cancel();
  }
});

test('benchmark retry-safe operations expose exhausted transient failures without counting them as throughput',
  async () => {
    let timedOutCalls = ZERO;
    let admissionBlockedCalls = ZERO;
    const nodes = [
      {
        id: 'timed-out-benchmark-node',
        async queryWithTimeout() {
          timedOutCalls++;
          const error = new Error('query timed out after 2000ms');
          error.code = 'ETIMEDOUT';
          throw error;
        },
      },
      {
        id: 'admission-blocked-benchmark-node',
        async queryWithTimeout() {
          admissionBlockedCalls++;
          const error = new Error('query_admission_deferred');
          error.code = 'routing_not_ready';
          throw error;
        },
      },
    ];
    const gen = new LoadGenerator(nodes, {
      opsPerSec: 10,
      duration: 100,
      operations: ['SELECT'],
      workloadProfile: 'benchmark_events_mixed',
      maxInFlight: 1,
      nodeMaxInFlight: 1,
      queryTimeoutMs: 2000,
    });
    const run = gen.start();
    try {
      const metrics = await run.waitComplete();
      assert.ok(timedOutCalls > ZERO, 'expected benchmark timeout attempts');
      assert.ok(
        admissionBlockedCalls > ZERO,
        'expected admission-blocked fallback attempts',
      );
      assert.ok(
        metrics.failed > ZERO,
        'exhausted retry-safe benchmark operations must remain terminal failures',
      );
      assert.ok(
        metrics.errors > ZERO,
        'exhausted retry-safe benchmark operations must remain explicit errors',
      );
      assert.ok(
        metrics.timedOut > ZERO,
        'exhausted timeout paths must remain an explicit denominator',
      );
      assert.equal(
        metrics.correct,
        ZERO,
        'exhausted retry-safe operations must never count as correct',
      );
      assert.ok(
        metrics.attemptErrors > ZERO,
        'transient benchmark control-plane failures should remain visible in attemptErrors',
      );
      assert.equal(
        Number(metrics?.nonAdmissionAttemptErrors || ZERO),
        ZERO,
        'retry-safe benchmark turbulence should not count against non-admission attempt-error gates',
      );
      assert.equal(
        Number(metrics?.nonAdmissionTimeoutWaits || ZERO),
        ZERO,
        'retry-safe benchmark turbulence should not count against timeout wait gates',
      );
    } finally {
      run.cancel();
    }
  });

test('circuit breaker suppresses retries on repeatedly failing nodes', async () => {
  let failingNodeCalls = ZERO;
  let healthyNodeCalls = ZERO;
  const nodes = [
    {
      id: 'flaky-node',
      async query(_sql) {
        failingNodeCalls++;
        throw new Error('flaky node unavailable');
      },
    },
    {
      id: 'healthy-node',
      async query(_sql) {
        healthyNodeCalls++;
        return {rows: []};
      },
    },
  ];

  const gen = new LoadGenerator(nodes, {
    opsPerSec: 120,
    duration: 200,
    nodeFailureThreshold: 2,
    nodeFailureCooldownMs: 1000,
  });
  const run = gen.start();
  try {
    const metrics = await run.waitComplete();
    assert.ok(metrics.success > ZERO, 'expected successful operations');
    assert.strictEqual(metrics.errors, ZERO);
    assert.strictEqual(metrics.failed, ZERO);
    assert.ok(
      metrics.attemptErrors > ZERO,
      'expected failed attempts to be captured in attemptErrors',
    );
    assert.ok(
      failingNodeCalls <= 6,
      `expected failing node calls <= 6, got ${failingNodeCalls}`,
    );
    assert.ok(
      healthyNodeCalls > failingNodeCalls,
      'expected healthy node to handle most load after circuit open',
    );
  } finally {
    run.cancel();
  }
});

test('circuit breaker allows node recovery after cooldown', async () => {
  const recoverAfterMs = 80;
  const startMs = Date.now();
  let recoveredSuccessCalls = ZERO;
  const nodes = [
    {
      id: 'recovering-node',
      async query(_sql) {
        if (Date.now() - startMs < recoverAfterMs) {
          throw new Error('recovering node warming');
        }
        recoveredSuccessCalls++;
        return {rows: []};
      },
    },
    createMockNode('always-healthy'),
  ];

  const gen = new LoadGenerator(nodes, {
    opsPerSec: 100,
    duration: 300,
    nodeFailureThreshold: 1,
    nodeFailureCooldownMs: 20,
  });
  const run = gen.start();
  try {
    const metrics = await run.waitComplete();
    assert.ok(metrics.success > ZERO, 'expected successful operations');
    assert.ok(
      recoveredSuccessCalls > ZERO,
      'expected recovering node to rejoin load after cooldown',
    );
  } finally {
    run.cancel();
  }
});

test('node-client breaker ownership disables local load-generator breaker transitions',
  async () => {
    let nodeClientFailCalls = ZERO;
    let healthyCalls = ZERO;
    const nodes = [
      {
        id: 'node-client-owned-breaker',
        breakerOwner: BREAKER_OWNER_NODE_CLIENT,
        async query(_sql) {
          nodeClientFailCalls++;
          const error = new Error('circuit breaker is open');
          error.code = NODE_CLIENT_ERROR_CODE_CIRCUIT_OPEN;
          throw error;
        },
      },
      {
        id: 'healthy-node',
        async query(_sql) {
          healthyCalls++;
          return {rows: []};
        },
      },
    ];

    const gen = new LoadGenerator(nodes, {
      opsPerSec: 120,
      duration: 180,
      admissionBackoffMs: ADMISSION_BACKOFF_MS,
    });
    const run = gen.start();
    try {
      const metrics = await run.waitComplete();
      const stateEntries = [...run._nodeHealthByKey.entries()];
      const failingStateEntry = stateEntries.find(([key]) =>
        key.includes('node-client-owned-breaker'));
      assert.ok(failingStateEntry, 'expected failing node state to exist');
      const failingState = failingStateEntry[1];
      assert.equal(
        failingState.localBreakerOwner,
        BREAKER_OWNER_NODE_CLIENT,
        'expected load-generator to treat node-client as breaker owner',
      );
      assert.equal(
        failingState.openUntilMs,
        ZERO,
        'expected local breaker cooldown to stay disabled for node-client owned node',
      );
      assert.ok(
        nodeClientFailCalls >= ONE,
        'expected node-client-owned node to remain probeable after admission backoff',
      );
      assert.ok(healthyCalls > ZERO, 'expected healthy node to absorb load');
      assert.equal(metrics.failed, ZERO);
      assert.equal(metrics.errors, ZERO);
    } finally {
      run.cancel();
    }
  });

test('node-client circuit-open honors cooldown floor instead of admission-storm retrying',
  async () => {
    let nodeClientFailCalls = ZERO;
    let healthyCalls = ZERO;
    const nodes = [
      {
        id: 'node-client-cooled-breaker',
        breakerOwner: BREAKER_OWNER_NODE_CLIENT,
        async query(_sql) {
          nodeClientFailCalls++;
          const error = new Error('circuit breaker is open');
          error.code = NODE_CLIENT_ERROR_CODE_CIRCUIT_OPEN;
          throw error;
        },
      },
      {
        id: 'healthy-node',
        async query(_sql) {
          healthyCalls++;
          return {rows: []};
        },
      },
    ];

    const gen = new LoadGenerator(nodes, {
      opsPerSec: 200,
      duration: 160,
      admissionBackoffMs: 5,
      nodeFailureCooldownMs: 80,
    });
    const run = gen.start();
    try {
      const metrics = await run.waitComplete();
      assert.ok(
        healthyCalls > ZERO,
        'expected healthy node to continue absorbing load',
      );
      assert.ok(
        nodeClientFailCalls < 10,
        'expected node-client-owned breaker node to respect cooldown floor ' +
          `instead of storm retrying; got ${nodeClientFailCalls} admission calls`,
      );
      assert.equal(metrics.failed, ZERO);
      assert.equal(metrics.errors, ZERO);
    } finally {
      run.cancel();
    }
  });

test('node-client circuit-open rechecks admission block before stale failover attempts',
  async () => {
    let nodeClientFailCalls = ZERO;
    let healthyCalls = ZERO;
    const nodes = [
      {
        id: 'node-client-stale-candidate',
        breakerOwner: BREAKER_OWNER_NODE_CLIENT,
        async query(_sql) {
          nodeClientFailCalls++;
          const error = new Error('circuit breaker is open');
          error.code = NODE_CLIENT_ERROR_CODE_CIRCUIT_OPEN;
          throw error;
        },
      },
      {
        id: 'slow-healthy-node',
        async query(_sql) {
          healthyCalls++;
          await new Promise((resolve) => setTimeout(resolve, 40));
          return {rows: []};
        },
      },
    ];

    const gen = new LoadGenerator(nodes, {
      opsPerSec: 400,
      duration: 1000,
      maxInFlight: 20,
      nodeMaxInFlight: 1,
      admissionBackoffMs: 5,
      nodeFailureCooldownMs: 80,
    });
    const run = gen.start();
    try {
      await new Promise((resolve) => setTimeout(resolve, 160));
      run.cancel();
      const metrics = await run.waitComplete();
      assert.ok(
        healthyCalls > ZERO,
        'expected healthy node to keep receiving failover traffic',
      );
      assert.ok(
        nodeClientFailCalls < 20,
        'expected stale failover candidates to honor refreshed admission block; ' +
          `got ${nodeClientFailCalls} node-client admission calls`,
      );
      assert.equal(metrics.failed, ZERO);
      assert.equal(metrics.errors, ZERO);
    } finally {
      run.cancel();
    }
  });

test('admission-control defers dispatch on circuit-open instead of counting operation failures',
  async () => {
    let admissionErrors = ZERO;
    const nodes = [{
      id: 'single-node-client-node',
      breakerOwner: BREAKER_OWNER_NODE_CLIENT,
      async query(_sql) {
        admissionErrors++;
        const error = new Error('circuit breaker is open');
        error.code = NODE_CLIENT_ERROR_CODE_CIRCUIT_OPEN;
        throw error;
      },
    }];

    const gen = new LoadGenerator(nodes, {
      opsPerSec: 200,
      duration: 140,
      admissionBackoffMs: ADMISSION_BACKOFF_MS,
    });
    const run = gen.start();
    try {
      const metrics = await run.waitComplete();
      assert.ok(admissionErrors > ZERO, 'expected admission errors to be observed');
      assert.equal(
        metrics.failed,
        ZERO,
        'expected admission-only failures to avoid operation-level failure counts',
      );
      assert.equal(
        metrics.errors,
        ZERO,
        'expected admission-only failures to avoid operation-level error counts',
      );
      assert.ok(
        metrics.attemptErrors > ZERO,
        'expected admission denials to be visible as attempt-level failures',
      );
    } finally {
      run.cancel();
    }
  });

test('admission-control treats load-lane serve-not-ready denials as admission signals',
  async () => {
    let admissionErrors = ZERO;
    const nodes = [{
      id: 'serve-not-ready-node',
      breakerOwner: BREAKER_OWNER_NODE_CLIENT,
      async query(_sql) {
        admissionErrors++;
        const error = new Error(
          'Admin API query failed for node serve-not-ready-node on lane load: ' +
            'serve not ready: load lane admission denied on node ' +
            'serve-not-ready-node (serveEligible=false, reasons=' +
            'cluster_member_unhealthy,control_plane_write_unhealthy)',
        );
        error.code = NODE_CLIENT_ERROR_CODE_OPERATION;
        throw error;
      },
    }];

    const gen = new LoadGenerator(nodes, {
      opsPerSec: 200,
      duration: 140,
      admissionBackoffMs: ADMISSION_BACKOFF_MS,
    });
    const run = gen.start();
    try {
      const metrics = await run.waitComplete();
      assert.ok(admissionErrors > ZERO, 'expected admission denials to occur');
      assert.equal(
        metrics.failed,
        ZERO,
        'expected serve-not-ready admission denials to avoid operation failures',
      );
      assert.equal(
        metrics.errors,
        ZERO,
        'expected serve-not-ready admission denials to avoid operation errors',
      );
      assert.ok(
        metrics.attemptErrors > ZERO,
        'expected serve-not-ready admission denials to remain visible in attemptErrors',
      );
    } finally {
      run.cancel();
    }
  });

test('admission-control treats query admission defers as admission signals',
  async () => {
    let admissionErrors = ZERO;
    const nodes = [{
      id: 'query-admission-node',
      breakerOwner: BREAKER_OWNER_NODE_CLIENT,
      async query(_sql) {
        admissionErrors++;
        const error = new Error(
          'Admin API query failed for node query-admission-node on lane default: ' +
            'query_admission_deferred',
        );
        error.code = NODE_CLIENT_ERROR_CODE_OPERATION;
        throw error;
      },
    }];

    const gen = new LoadGenerator(nodes, {
      opsPerSec: 200,
      duration: 140,
      admissionBackoffMs: ADMISSION_BACKOFF_MS,
    });
    const run = gen.start();
    try {
      const metrics = await run.waitComplete();
      assert.ok(admissionErrors > ZERO, 'expected admission defers to occur');
      assert.equal(
        metrics.failed,
        ZERO,
        'expected query admission defers to avoid operation failures',
      );
      assert.equal(
        metrics.errors,
        ZERO,
        'expected query admission defers to avoid operation errors',
      );
      assert.ok(
        metrics.attemptErrors > ZERO,
        'expected query admission defers to remain visible in attemptErrors',
      );
    } finally {
      run.cancel();
    }
  });

test('externally admission-blocked nodes are skipped before dispatch attempts',
  async () => {
    let blockedCalls = ZERO;
    const nodes = [
      {
        id: 'externally-blocked-node',
        isLoadAdmissionReady() {
          return false;
        },
        async query(_sql) {
          blockedCalls++;
          throw new Error('externally blocked node should not be queried');
        },
      },
      {
        id: 'healthy-node',
        async query(_sql) {
          return {rows: []};
        },
      },
    ];

    const gen = new LoadGenerator(nodes, {
      opsPerSec: 160,
      duration: 140,
      admissionBackoffMs: ADMISSION_BACKOFF_MS,
    });
    const run = gen.start();
    try {
      const metrics = await run.waitComplete();
      assert.equal(
        blockedCalls,
        ZERO,
        'expected externally blocked nodes to be skipped before query dispatch',
      );
      assert.equal(
        Number(metrics?.perNode?.['externally-blocked-node']?.attemptErrors || ZERO),
        ZERO,
        'expected externally blocked nodes to avoid synthetic attempt errors',
      );
      assert.ok(
        Number(
          metrics?.perNode?.['externally-blocked-node']?.waitReasons?.nodeAdmissionBlocked ||
            ZERO,
        ) > ZERO,
        'expected skipped externally blocked nodes to remain visible as wait pressure',
      );
      assert.equal(
        Number(metrics?.nonAdmissionAttemptErrors || ZERO),
        ZERO,
        'expected healthy-only execution to avoid non-admission attempt errors',
      );
    } finally {
      run.cancel();
    }
  });

test('fresh unreachable reachability diagnostics block dispatch before attempts',
  async () => {
    let blockedCalls = ZERO;
    const nowMs = Date.now();
    const nodes = [
      {
        id: 'reachability-blocked-node',
        getLastReachabilityDiagnostics() {
          return {
            timestamp: nowMs,
            reachable: false,
            adminReady: false,
          };
        },
        async query(_sql) {
          blockedCalls++;
          throw new Error('reachability-blocked node should not be queried');
        },
      },
      {
        id: 'healthy-node',
        async query(_sql) {
          return {rows: []};
        },
      },
    ];

    const gen = new LoadGenerator(nodes, {
      opsPerSec: 160,
      duration: 140,
      admissionBackoffMs: ADMISSION_BACKOFF_MS,
    });
    const run = gen.start();
    try {
      const metrics = await run.waitComplete();
      assert.equal(
        blockedCalls,
        ZERO,
        'expected reachability-blocked nodes to be skipped before dispatch',
      );
      assert.equal(
        Number(metrics?.perNode?.['reachability-blocked-node']?.attemptErrors || ZERO),
        ZERO,
        'expected reachability-blocked nodes to avoid attempt errors',
      );
      assert.ok(
        Number(
          metrics?.perNode?.['reachability-blocked-node']?.waitReasons?.nodeAdmissionBlocked ||
            ZERO,
        ) > ZERO,
        'expected blocked reachability diagnostics to register admission wait pressure',
      );
      assert.equal(
        Number(metrics?.nonAdmissionAttemptErrors || ZERO),
        ZERO,
        'expected healthy-only execution to avoid non-admission attempt errors',
      );
    } finally {
      run.cancel();
    }
  });

test('admission-control treats load-lane timeout churn as admission pressure',
  async () => {
    let transientTimeoutCalls = ZERO;
    const nodes = [{
      id: 'load-lane-timeout-node',
      breakerOwner: BREAKER_OWNER_NODE_CLIENT,
      async query(_sql) {
        transientTimeoutCalls++;
        const error = new Error(
          'Admin API query failed for node load-lane-timeout-node on lane load: ' +
            'Query timeout after 3000ms',
        );
        error.code = NODE_CLIENT_ERROR_CODE_OPERATION;
        throw error;
      },
    }];

    const gen = new LoadGenerator(nodes, {
      opsPerSec: 200,
      duration: 140,
      admissionBackoffMs: ADMISSION_BACKOFF_MS,
    });
    const run = gen.start();
    try {
      const metrics = await run.waitComplete();
      assert.ok(
        transientTimeoutCalls > ZERO,
        'expected load-lane timeout churn attempts',
      );
      assert.equal(
        metrics.failed,
        ZERO,
        'expected load-lane timeout churn to avoid operation failures',
      );
      assert.equal(
        metrics.errors,
        ZERO,
        'expected load-lane timeout churn to avoid operation errors',
      );
      assert.ok(
        metrics.attemptErrors > ZERO,
        'expected load-lane timeout churn to remain visible in attemptErrors',
      );
    } finally {
      run.cancel();
    }
  });

test('admission-control treats typed retryable participant failures as admission signals',
  async () => {
    let admissionErrors = ZERO;
    const nodes = [{
      id: 'participant-pressure-node',
      breakerOwner: BREAKER_OWNER_NODE_CLIENT,
      async query(_sql) {
        admissionErrors++;
        const error = new Error(
          'Distributed operation failed due to participant failures',
        );
        error.code = NODE_CLIENT_ERROR_CODE_OPERATION;
        error.deferRetry = true;
        error.retryAfterMs = 125;
        throw error;
      },
    }];

    const gen = new LoadGenerator(nodes, {
      opsPerSec: 200,
      duration: 140,
      admissionBackoffMs: ADMISSION_BACKOFF_MS,
    });
    const run = gen.start();
    try {
      const metrics = await run.waitComplete();
      assert.ok(
        admissionErrors > ZERO,
        'expected retryable participant failures to occur',
      );
      assert.equal(
        metrics.failed,
        ZERO,
        'expected retryable participant failures to avoid operation failures',
      );
      assert.equal(
        metrics.errors,
        ZERO,
        'expected retryable participant failures to avoid operation errors',
      );
      assert.ok(
        metrics.attemptErrors > ZERO,
        'expected retryable participant failures to remain visible in attemptErrors',
      );
    } finally {
      run.cancel();
    }
  });

test('typed retryAfterMs backoff suppresses reprobe storms on pressured nodes',
  async () => {
    let pressuredNodeCalls = ZERO;
    let healthyNodeCalls = ZERO;
    const nodes = [
      {
        id: 'typed-retry-pressure-node',
        breakerOwner: BREAKER_OWNER_NODE_CLIENT,
        async query(_sql) {
          pressuredNodeCalls++;
          const error = new Error(
            'Distributed operation failed due to participant failures',
          );
          error.code = NODE_CLIENT_ERROR_CODE_OPERATION;
          error.deferRetry = true;
          error.retryAfterMs = 90;
          throw error;
        },
      },
      {
        id: 'healthy-node',
        async query(_sql) {
          healthyNodeCalls++;
          return {rows: []};
        },
      },
    ];

    const gen = new LoadGenerator(nodes, {
      opsPerSec: 200,
      duration: 160,
      admissionBackoffMs: 5,
    });
    const run = gen.start();
    try {
      const metrics = await run.waitComplete();
      assert.ok(
        healthyNodeCalls > ZERO,
        'expected healthy node to continue absorbing load',
      );
      assert.ok(
        pressuredNodeCalls < 6,
        'expected typed retryAfterMs to suppress reprobe storms; got ' +
          `${pressuredNodeCalls} pressured-node attempts`,
      );
      assert.equal(metrics.failed, ZERO);
      assert.equal(metrics.errors, ZERO);
    } finally {
      run.cancel();
    }
  });

registerLoadGeneratorTailTests({
  test,
  assert,
  LoadGenerator,
  LoadRun,
  createMockNode,
  createNodeInFlightTokens,
  ZERO,
  ONE,
  CANCEL_DISPATCH_SETTLE_MS,
  CANCEL_WAIT_TIMEOUT_MS,
  ADMISSION_BACKOFF_MS,
  BREAKER_OWNER_NODE_CLIENT,
  NODE_CLIENT_ERROR_CODE_CIRCUIT_OPEN,
  NODE_CLIENT_ERROR_CODE_OPERATION,
  SLOT_STALLED_QUERY_TIMEOUT_MS,
  SLOT_STALLED_MAX_IN_FLIGHT,
  SLOT_STALLED_NODE_MAX_IN_FLIGHT,
  SLOT_STALLED_OPERATION,
  SLOT_STALLED_STARTED_AT_OFFSET_MS,
  SLOT_STALLED_FRESH_STARTED_AT_OFFSET_MS,
  SLOT_STALLED_EXPECTED_BORROWED_NODE_CAP,
  SLOT_STALLED_EXPECTED_DISPATCH_NODE_IDS,
  SLOT_STALLED_EXPECTED_EMPTY_CANDIDATE_IDS,
});

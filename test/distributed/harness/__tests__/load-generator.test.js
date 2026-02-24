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

            const expected =
              ((successCount + failedCount) / durationMs) *
              MS_PER_SECOND;
            assert.strictEqual(m.opsPerSec, expected);
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
import {LoadGenerator} from '../load-generator.js';

const ZERO = 0;
const ONE = 1;
const CANCEL_DISPATCH_SETTLE_MS = 25;
const CANCEL_WAIT_TIMEOUT_MS = 200;
const ADMISSION_BACKOFF_MS = 30;
const BREAKER_OWNER_NODE_CLIENT = 'node-client';
const NODE_CLIENT_ERROR_CODE_CIRCUIT_OPEN = 'circuit_open';

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

test('queue-delay metrics are emitted when dispatch pacing falls behind', async () => {
  const nodes = [{
    id: 'slow-node',
    async query(_sql) {
      await new Promise((resolve) => setTimeout(resolve, 40));
      return {rows: []};
    },
  }];

  const gen = new LoadGenerator(nodes, {
    opsPerSec: 200,
    duration: 220,
    maxInFlight: ONE,
    nodeMaxInFlight: ONE,
  });
  const run = gen.start();
  try {
    await new Promise((resolve) => setTimeout(resolve, 160));
    run.cancel();
    const metrics = await run.waitComplete();
    assert.ok(metrics.queueDelay, 'expected queueDelay metrics to be present');
    assert.ok(
      Number(metrics.queueDelay.avg) >= ZERO,
      'expected queueDelay.avg to be numeric',
    );
    assert.ok(
      Number(metrics.queueDelay.max) >= Number(metrics.queueDelay.p99),
      'expected queueDelay max to be >= p99',
    );
  } finally {
    run.cancel();
  }
});

test('dispatch accounting balances target, dispatched, and undispatched operations',
  async () => {
    const nodes = [{
      id: 'slow-node',
      async query(_sql) {
        await new Promise((resolve) => setTimeout(resolve, 40));
        return {rows: []};
      },
    }];

    const gen = new LoadGenerator(nodes, {
      opsPerSec: 200,
      duration: 220,
      maxInFlight: ONE,
      nodeMaxInFlight: ONE,
    });
    const run = gen.start();
    try {
      await new Promise((resolve) => setTimeout(resolve, 160));
      run.cancel();
      const metrics = await run.waitComplete();
      assert.strictEqual(typeof metrics.targetOperations, 'number');
      assert.strictEqual(typeof metrics.dispatchedOperations, 'number');
      assert.strictEqual(typeof metrics.undispatchedOperations, 'number');
      assert.strictEqual(
        metrics.dispatchedOperations + metrics.undispatchedOperations,
        metrics.targetOperations,
      );
    } finally {
      run.cancel();
    }
  });

test('undispatched reason classes are populated when dispatch falls behind',
  async () => {
    const nodes = [{
      id: 'slow-node',
      async query(_sql) {
        await new Promise((resolve) => setTimeout(resolve, 40));
        return {rows: []};
      },
    }];

    const gen = new LoadGenerator(nodes, {
      opsPerSec: 200,
      duration: 220,
      maxInFlight: ONE,
      nodeMaxInFlight: ONE,
    });
    const run = gen.start();
    try {
      await new Promise((resolve) => setTimeout(resolve, 160));
      const metrics = run.getMetrics();
      assert.ok(metrics.undispatchedByReason);
      assert.strictEqual(typeof metrics.undispatchedByReason.capacity, 'number');
      assert.ok(
        metrics.undispatchedByReason.capacity > ZERO,
        'expected capacity reason class to account for undispatched operations',
      );
    } finally {
      run.cancel();
      await run.waitComplete();
    }
  });

test('load path uses queryWithTimeout when node supports timeout-aware query',
  async () => {
    const capturedTimeouts = [];
    const nodes = [{
      id: 'n1',
      async queryWithTimeout(_sql, _params, options = {}) {
        capturedTimeouts.push(options.timeoutMs);
        return {rows: []};
      },
      async query(_sql) {
        throw new Error('query() should not be used when queryWithTimeout exists');
      },
    }];
    const gen = new LoadGenerator(nodes, {
      opsPerSec: 80,
      duration: 100,
      queryTimeoutMs: 321,
    });
    const run = gen.start();
    try {
      await run.waitComplete();
      assert.ok(
        capturedTimeouts.length > ZERO,
        'expected at least one timeout-aware load query',
      );
      assert.ok(
        capturedTimeouts.every((timeoutMs) => timeoutMs === 321),
        'expected all timeout-aware queries to use configured timeout',
      );
    } finally {
      run.cancel();
    }
  });

test('per-node in-flight bulkhead limits stalled node fanout', async () => {
  let stalledCalls = ZERO;
  let healthyCalls = ZERO;
  const nodes = [
    {
      id: 'stalled-node',
      async query(_sql) {
        stalledCalls++;
        return new Promise(() => {});
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
    opsPerSec: 500,
    duration: 200,
    maxInFlight: 20,
    nodeMaxInFlight: 2,
  });
  const run = gen.start();
  try {
    await new Promise((resolve) => setTimeout(resolve, 80));
    run.cancel();
    await run.waitComplete();
    assert.ok(
      stalledCalls <= 2,
      `expected stalled node calls <= 2, got ${stalledCalls}`,
    );
    assert.ok(
      healthyCalls > stalledCalls,
      'expected healthy node to receive more traffic once stalled node bulkhead is full',
    );
  } finally {
    run.cancel();
  }
});

test('cancel stops the load run immediately', async () => {
  const nodes = [createMockNode('n1')];
  const gen = new LoadGenerator(nodes, {
    opsPerSec: 10,
    duration: 5000,
  });
  const run = gen.start();
  try {
    run.cancel();
    const metrics = await run.waitComplete();
    assert.ok(metrics, 'waitComplete should resolve after cancel');
    assert.strictEqual(typeof metrics.total, 'number');
  } finally {
    run.cancel();
  }
});

test('cancel resolves waitComplete when in-flight query is stuck', async () => {
  const nodes = [{
    id: 'n1',
    async query(_sql) {
      return new Promise(() => {});
    },
  }];
  const gen = new LoadGenerator(nodes, {
    opsPerSec: 100,
    duration: 60000,
    maxInFlight: 1,
  });
  const run = gen.start();
  let timeoutId = null;

  try {
    await new Promise((resolve) => setTimeout(resolve, CANCEL_DISPATCH_SETTLE_MS));
    run.cancel();

    await Promise.race([
      run.waitComplete(),
      new Promise((_, reject) => {
        timeoutId = setTimeout(() => {
          reject(new Error('waitComplete did not resolve after cancel'));
        }, CANCEL_WAIT_TIMEOUT_MS);
      }),
    ]);
  } finally {
    if (timeoutId !== null) {
      clearTimeout(timeoutId);
    }
    run.cancel();
  }
});

test('configured maxInFlight is forwarded to load run', async () => {
  const nodes = [createMockNode('n1'), createMockNode('n2')];
  const gen = new LoadGenerator(nodes, {
    opsPerSec: 20,
    duration: 100,
    maxInFlight: 17,
  });
  const run = gen.start();
  try {
    assert.strictEqual(run._maxInFlight, 17);
    await run.waitComplete();
  } finally {
    run.cancel();
  }
});

test('getMetrics returns snapshot with expected shape', async () => {
  const nodes = [createMockNode('n1')];
  const gen = new LoadGenerator(nodes, {
    opsPerSec: 10,
    duration: 5000,
  });
  const run = gen.start();
  try {
    const metrics = run.getMetrics();
    assert.strictEqual(typeof metrics.total, 'number');
    assert.strictEqual(typeof metrics.success, 'number');
    assert.strictEqual(typeof metrics.failed, 'number');
    assert.strictEqual(typeof metrics.errors, 'number');
    assert.ok(metrics.latency, 'metrics should have latency');
    assert.strictEqual(typeof metrics.latency.p50, 'number');
    assert.strictEqual(typeof metrics.latency.p95, 'number');
    assert.strictEqual(typeof metrics.latency.p99, 'number');
    assert.strictEqual(typeof metrics.opsPerSec, 'number');
  } finally {
    run.cancel();
  }
});

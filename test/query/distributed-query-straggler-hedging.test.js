/**
 * Guard: distributed query straggler hedging in the wired production path.
 *
 * A slow-but-alive replica must no longer stall a distributed SELECT
 * fan-out until chunk timeout: with the partitionQueryExecutor callback
 * present (the wired path), the coordinator hedges a straggling partition
 * with a speculative retry against an ALTERNATIVE replica, the first
 * result wins, no rows are duplicated, and the losing attempt's eventual
 * completion is discarded without an unhandled rejection.
 *
 * Uses the real-SQLite-per-partition mock pattern from
 * distributed-select-global-merge-correctness.test.js, extended with two
 * replica service rows per partition (distinct node_ids/addresses),
 * per-address artificial delay, and delivery-address tracking.
 */

import Database from 'better-sqlite3';
import {test} from '../../src/test-helpers/tap.js';
import {QueryExecutor} from '../../src/query/query-executor.js';
import {SQLParser} from '../../src/query/sql-parser.js';
import {ConfigurationManager} from '../../src/config/configuration-manager.js';

const config = ConfigurationManager.getInstance();
if (!config.isInitialized()) {
  config.initialize();
}

const TABLE_DDL =
  'CREATE TABLE t (id INTEGER PRIMARY KEY, amount INTEGER)';

// The delayed replica answers only after this long; a hedged fan-out must
// complete well before it (generous margin for CI jitter: hedge fires at
// the ~100ms straggler floor and the alternative replica answers in ms;
// under parallel-suite CPU starvation the check interval can lag, so the
// slow delay and the completion bound keep a wide gap).
const SLOW_REPLICA_DELAY_MS = 1500;
const HEDGED_COMPLETION_BOUND_MS = 1000;
// Tighten the coordinator's straggler-check interval so the hedge trigger
// (bounded below by the named threshold floor) is not the flaky part.
const HEDGE_CHECK_INTERVAL_MS = 25;
// Shorter delay for the scenarios that must WAIT for the slow replica.
const LEGACY_WAIT_DELAY_MS = 300;
// setTimeout may fire marginally early; tolerate a small epsilon.
const WAIT_ASSERT_EPSILON_MS = 25;
const LOSER_SETTLE_GRACE_MS = 250;

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

/**
 * Build a mock cluster where each partition has one or more replica
 * service rows (distinct node ids and addresses) backed by ONE SQLite
 * database per partition, and selected replica addresses answer slowly.
 * @param {Object} spec - {partitions: {pid: {rows, replicaNodes}},
 *   slowAddresses: Set<string>, delayMs: number}
 * @return {Object} {executor, deliveries, partitionIds, slowSettled}
 */
function buildHedgingCluster(spec) {
  const partitionDbs = new Map();
  for (const [partitionId, partitionSpec] of Object.entries(spec.partitions)) {
    const db = new Database(':memory:');
    db.exec(TABLE_DDL);
    const insert = db.prepare('INSERT INTO t (id, amount) VALUES (?, ?)');
    for (const row of partitionSpec.rows) {
      insert.run(row.id, row.amount);
    }
    partitionDbs.set(partitionId, db);
  }

  const deliveries = [];
  const slowSettled = [];
  const messageRouter = {
    async deliver(address, message) {
      if (message.type !== 'QUERY') {
        return {acknowledged: true, success: true};
      }
      const partitionId = address.split('/')[2];
      deliveries.push({partitionId, address, atMs: Date.now()});
      const db = partitionDbs.get(partitionId);
      const rows = db.prepare(message.sql).all(...(message.params || []));
      if (spec.slowAddresses.has(address)) {
        await sleep(spec.delayMs);
        slowSettled.push(address);
      }
      return {
        acknowledged: true,
        success: true,
        rows,
        count: rows.length,
        partitionId,
      };
    },
  };

  const services = [];
  for (const [partitionId, partitionSpec] of Object.entries(spec.partitions)) {
    partitionSpec.replicaNodes.forEach((nodeId, index) => {
      services.push({
        service_id: `${partitionId}-${nodeId}`,
        service_type: 'partition',
        partition_id: partitionId,
        node_id: nodeId,
        raft_role: index === 0 ? 'leader' : 'follower',
        address: `${nodeId}/partition/${partitionId}`,
        status: 'active',
      });
    });
  }
  const systemCache = {
    services,
    filter(type, predicate) {
      return type === 'services' ? this.services.filter(predicate) : [];
    },
    get() {
      return null;
    },
    getAll(type) {
      return type === 'services' ? this.services : [];
    },
  };

  const executor = new QueryExecutor({messageRouter, systemCache});
  executor.parallelQueryCoordinator.speculativeExecutionDelayMs =
    HEDGE_CHECK_INTERVAL_MS;
  return {
    executor,
    deliveries,
    slowSettled,
    partitionIds: [...partitionDbs.keys()],
  };
}

async function select(executor, sql, partitionIds, params = []) {
  const ast = new SQLParser(sql).parse();
  const result = await executor.executeSelect(ast, partitionIds, params);
  if (!result.success) {
    throw new Error(`query failed: ${JSON.stringify(result)}`);
  }
  return result;
}

test('hedged fan-out completes despite one delayed replica', async (t) => {
  const unhandledRejections = [];
  const onUnhandled = (reason) => {
    unhandledRejections.push(reason);
  };
  process.on('unhandledRejection', onUnhandled);

  const slowAddress = 'node-a/partition/p1';
  const {executor, deliveries, slowSettled, partitionIds} =
    buildHedgingCluster({
      partitions: {
        p1: {
          rows: [1, 2, 3, 4, 5].map((i) => ({id: i, amount: i})),
          replicaNodes: ['node-a', 'node-b'],
        },
        p2: {
          rows: [6, 7, 8, 9, 10].map((i) => ({id: i, amount: i})),
          replicaNodes: ['node-c'],
        },
      },
      slowAddresses: new Set([slowAddress]),
      delayMs: SLOW_REPLICA_DELAY_MS,
    });

  try {
    const startedAtMs = Date.now();
    const result = await select(
      executor,
      'SELECT id, amount FROM t ORDER BY id',
      partitionIds,
    );
    const elapsedMs = Date.now() - startedAtMs;

    // (a) The fan-out completes well before the delayed replica responds.
    t.ok(
      elapsedMs < HEDGED_COMPLETION_BOUND_MS,
      `fan-out completed in ${elapsedMs}ms, ` +
        `bound ${HEDGED_COMPLETION_BOUND_MS}ms, ` +
        `slow replica delay ${SLOW_REPLICA_DELAY_MS}ms`,
    );
    t.equal(
      slowSettled.length,
      0,
      'delayed replica had not yet responded when the fan-out completed',
    );

    // (b) Result rows are correct and NOT duplicated.
    t.same(
      result.rows.map((row) => row.id),
      [1, 2, 3, 4, 5, 6, 7, 8, 9, 10],
      'all rows present exactly once (no hedge-duplicated partition)',
    );

    // (c) The hedge went to a DIFFERENT address than the primary.
    const p1Deliveries = deliveries.filter((d) => d.partitionId === 'p1');
    t.equal(p1Deliveries.length, 2, 'p1 saw a primary and a hedge delivery');
    t.equal(
      p1Deliveries[0].address,
      slowAddress,
      'primary delivery targeted the slow replica',
    );
    t.not(
      p1Deliveries[1].address,
      p1Deliveries[0].address,
      'hedge delivery targeted a different replica address',
    );
    t.equal(
      p1Deliveries[1].address,
      'node-b/partition/p1',
      'hedge delivery targeted the alternative replica',
    );

    // (d) speculativeExecutions metric counts the hedge in the wired path.
    t.ok(
      result.distributedMetrics.fanout.speculativeExecutions > 0,
      'speculativeExecutions metric > 0',
    );

    // (f) The losing attempt's eventual completion is swallowed: wait for
    // the delayed replica to respond and assert no unhandled rejection.
    await sleep(SLOW_REPLICA_DELAY_MS + LOSER_SETTLE_GRACE_MS);
    t.equal(
      slowSettled.length,
      1,
      'delayed replica eventually completed (loser settled)',
    );
    t.same(
      unhandledRejections,
      [],
      'no unhandled rejection when the loser eventually completes',
    );
  } finally {
    process.removeListener('unhandledRejection', onUnhandled);
  }
});

test('single-replica partitions do not hedge', async (t) => {
  const slowAddress = 'node-a/partition/p1';
  const {executor, deliveries, partitionIds} = buildHedgingCluster({
    partitions: {
      p1: {
        rows: [{id: 1, amount: 1}],
        replicaNodes: ['node-a'],
      },
      p2: {
        rows: [{id: 2, amount: 2}],
        replicaNodes: ['node-b'],
      },
    },
    slowAddresses: new Set([slowAddress]),
    delayMs: LEGACY_WAIT_DELAY_MS,
  });

  const startedAtMs = Date.now();
  const result = await select(
    executor,
    'SELECT id FROM t ORDER BY id',
    partitionIds,
  );
  const elapsedMs = Date.now() - startedAtMs;

  t.ok(
    elapsedMs >= LEGACY_WAIT_DELAY_MS - WAIT_ASSERT_EPSILON_MS,
    `fan-out waited for the only replica (${elapsedMs}ms)`,
  );
  t.same(result.rows.map((row) => row.id), [1, 2], 'rows correct');
  t.equal(
    result.distributedMetrics.fanout.speculativeExecutions,
    0,
    'no hedge launched when there is no alternative replica',
  );
  t.equal(
    deliveries.filter((d) => d.partitionId === 'p1').length,
    1,
    'single-replica partition saw exactly one delivery',
  );
});

test('hedging disabled preserves legacy waiting behavior', async (t) => {
  const slowAddress = 'node-a/partition/p1';
  const {executor, deliveries, partitionIds} = buildHedgingCluster({
    partitions: {
      p1: {
        rows: [{id: 1, amount: 1}],
        replicaNodes: ['node-a', 'node-b'],
      },
      p2: {
        rows: [{id: 2, amount: 2}],
        replicaNodes: ['node-c'],
      },
    },
    slowAddresses: new Set([slowAddress]),
    delayMs: LEGACY_WAIT_DELAY_MS,
  });
  // Existing config key queryCoordinator.speculativeExecutionEnabled turns
  // hedging off; mirror the coordinator's config-off state directly.
  executor.parallelQueryCoordinator.speculativeExecutionEnabled = false;

  const startedAtMs = Date.now();
  const result = await select(
    executor,
    'SELECT id FROM t ORDER BY id',
    partitionIds,
  );
  const elapsedMs = Date.now() - startedAtMs;

  t.ok(
    elapsedMs >= LEGACY_WAIT_DELAY_MS - WAIT_ASSERT_EPSILON_MS,
    `fan-out waited for the slow replica when disabled (${elapsedMs}ms)`,
  );
  t.same(result.rows.map((row) => row.id), [1, 2], 'rows correct');
  t.equal(
    result.distributedMetrics.fanout.speculativeExecutions,
    0,
    'no hedge launched when hedging is disabled',
  );
  t.equal(
    deliveries.filter((d) => d.partitionId === 'p1').length,
    1,
    'no second delivery for the slow partition when disabled',
  );
});

test('hedge timers do not leak: fan-out with cancellation token option',
  async (t) => {
    const slowAddress = 'node-a/partition/p1';
    const {executor, partitionIds} = buildHedgingCluster({
      partitions: {
        p1: {
          rows: [{id: 1, amount: 1}],
          replicaNodes: ['node-a', 'node-b'],
        },
        p2: {
          rows: [{id: 2, amount: 2}],
          replicaNodes: ['node-c'],
        },
      },
      slowAddresses: new Set([slowAddress]),
      delayMs: SLOW_REPLICA_DELAY_MS,
    });

    const cancelHandlers = [];
    const cancellationToken = {
      onCancel(handler) {
        cancelHandlers.push(handler);
      },
      isCancelled() {
        return false;
      },
    };

    const ast = new SQLParser('SELECT id FROM t ORDER BY id').parse();
    const result = await executor.executeSelect(ast, partitionIds, [], {
      cancellationToken,
    });
    t.equal(result.success, true, 'hedged fan-out completes with token');
    t.same(result.rows.map((row) => row.id), [1, 2], 'rows correct');
    t.ok(
      result.distributedMetrics.fanout.speculativeExecutions > 0,
      'hedge fired under a live cancellation token',
    );
    // Clean completion: the straggler-check interval and chunk timeout are
    // cleared, so tap's process would hang here if a timer leaked. The
    // delayed loser is still in flight; wait it out so the test ends with
    // no pending timers at all.
    await sleep(SLOW_REPLICA_DELAY_MS + LOSER_SETTLE_GRACE_MS);
    t.pass('no timer leak after hedged completion');
  });

test('losing primary completion does not double-count fan-out totals',
  async (t) => {
    // p1's primary is slow (hedge wins, loser completes later); p2 is a
    // slow SINGLE-replica partition that holds the fan-out open past the
    // loser's completion, so a double-counted loser would inflate the
    // formatted fan-out totals (and could spuriously trip the result
    // buffer limit).
    const cluster = buildHedgingCluster({
      partitions: {
        p0: {
          rows: [{id: 1, amount: 1}, {id: 2, amount: 2}],
          replicaNodes: ['node-a', 'node-b'],
        },
        p1: {
          rows: [{id: 3, amount: 3}, {id: 4, amount: 4}, {id: 5, amount: 5}],
          replicaNodes: ['node-c', 'node-d'],
        },
        p2: {
          rows: [{id: 6, amount: 6}],
          replicaNodes: ['node-e'],
        },
      },
      slowAddresses: new Set([
        'node-c/partition/p1',
        'node-e/partition/p2',
      ]),
      delayMs: LEGACY_WAIT_DELAY_MS,
    });

    const result = await select(
      cluster.executor,
      'SELECT id, amount FROM t',
      cluster.partitionIds,
    );
    t.equal(result.rows.length, 6, 'each row exactly once');
    t.ok(
      result.distributedMetrics.fanout.speculativeExecutions > 0,
      'the slow p1 primary was hedged',
    );
    t.equal(
      result.distributedMetrics.fanout.totalRows,
      6,
      'fan-out totalRows counts each partition exactly once ' +
        '(losing primary completion discarded)',
    );
    await sleep(LEGACY_WAIT_DELAY_MS + LOSER_SETTLE_GRACE_MS);
  });

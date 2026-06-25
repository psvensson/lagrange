import {test} from '../../src/test-helpers/tap.js';
import {
  getStepsHistoryParseMemoStats,
  resetStepsHistoryParseMemo,
} from '../../src/rebalancer/steps-history-parse-memo.js';
import {
  summarizeReplicaOperationLiveness,
} from '../../src/rebalancer/replica-operation-liveness.js';

const FLAG = 'LAGRANGE_PR_STEPS_HISTORY_PARSE_MEMO';
const ROW_COUNT = 50;
const TICK_COUNT = 8;
const NOW_MS = 1_000_000;

function buildReplicaOperationRows(count) {
  const rows = [];
  for (let index = 0; index < count; index += 1) {
    const replicaId = `replica_operations-p${index}-r1`;
    const stepsHistory = JSON.stringify([
      {step: 'PENDING', timestamp: NOW_MS - 500},
      {step: 'SYNCING', timestamp: NOW_MS - 300, replicaIds: [replicaId]},
      {step: 'ACTIVE', timestamp: NOW_MS - 100},
    ]);
    rows.push({
      operation_id: `op-${index}`,
      type: 'ADD',
      status: 'active',
      workflow_step: 'SYNCING',
      replica_id: replicaId,
      partition_group_id: `replica_operations-p${index}`,
      updated_at: NOW_MS - 100,
      // steps_history is the JSON STRING form the cache hands back per read.
      steps_history: stepsHistory,
    });
  }
  return rows;
}

function withFlag(value, fn) {
  const previous = process.env[FLAG];
  if (value === undefined) {
    delete process.env[FLAG];
  } else {
    process.env[FLAG] = value;
  }
  try {
    return fn();
  } finally {
    if (previous === undefined) {
      delete process.env[FLAG];
    } else {
      process.env[FLAG] = previous;
    }
  }
}

test(
  'steps-history parse memo FIRES: re-parse avoided across ticks (lever on)',
  async (t) => {
    const rows = buildReplicaOperationRows(ROW_COUNT);
    withFlag('true', () => {
      resetStepsHistoryParseMemo();
      for (let tick = 0; tick < TICK_COUNT; tick += 1) {
        summarizeReplicaOperationLiveness(rows, {nowMs: NOW_MS});
      }
      const stats = getStepsHistoryParseMemoStats();
      // Exactly one parse (miss) per distinct steps_history string, regardless
      // of how many ticks scan the same rows.
      t.equal(
        stats.misses,
        ROW_COUNT,
        'one parse per distinct steps_history string',
      );
      // Every subsequent tick is a pure cache hit — the re-parse the profiler
      // pinned is eliminated.
      t.ok(
        stats.hits >= ROW_COUNT * (TICK_COUNT - 1),
        'subsequent ticks re-use the memoized parse',
      );
      t.equal(stats.inlineParses, 0, 'lever-on path never parses inline');
    });
    t.end();
  },
);

test(
  'steps-history parse memo no-op when lever off (byte-identical fresh parse)',
  async (t) => {
    const rows = buildReplicaOperationRows(ROW_COUNT);
    withFlag(undefined, () => {
      resetStepsHistoryParseMemo();
      const summary = summarizeReplicaOperationLiveness(rows, {nowMs: NOW_MS});
      const stats = getStepsHistoryParseMemoStats();
      t.equal(stats.misses, 0, 'lever-off never populates the memo');
      t.equal(stats.hits, 0, 'lever-off never hits the memo');
      t.ok(stats.inlineParses > 0, 'lever-off parses inline');
      // Fresh (non-shared, non-frozen) array per the historical contract.
      const firstRecord = summary.rows[0];
      t.notOk(
        Object.isFrozen(firstRecord.stepsHistory),
        'lever-off returns a mutable fresh array',
      );
    });
    t.end();
  },
);

test(
  'steps-history parse memo result equivalence on/off + shared frozen on',
  async (t) => {
    const rows = buildReplicaOperationRows(3);
    const off = withFlag(undefined, () => {
      resetStepsHistoryParseMemo();
      return summarizeReplicaOperationLiveness(rows, {nowMs: NOW_MS});
    });
    const on = withFlag('true', () => {
      resetStepsHistoryParseMemo();
      return summarizeReplicaOperationLiveness(rows, {nowMs: NOW_MS});
    });
    t.same(
      on.rows.map((record) => record.stepsHistory),
      off.rows.map((record) => record.stepsHistory),
      'parsed steps_history is value-equivalent regardless of the lever',
    );
    withFlag('true', () => {
      t.ok(
        Object.isFrozen(on.rows[0].stepsHistory),
        'lever-on shares a frozen array (accidental mutation fails loudly)',
      );
    });
    t.end();
  },
);

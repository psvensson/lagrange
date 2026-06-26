import {test} from '../../src/test-helpers/tap.js';
import {
  getStepsHistoryParseMemoStats,
  resetStepsHistoryParseMemo,
} from '../../src/rebalancer/steps-history-parse-memo.js';
import {
  summarizeReplicaOperationLiveness,
} from '../../src/rebalancer/replica-operation-liveness.js';

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

test(
  'steps-history parse memo avoids re-parse across ticks',
  async (t) => {
    const rows = buildReplicaOperationRows(ROW_COUNT);
    resetStepsHistoryParseMemo();
    for (let tick = 0; tick < TICK_COUNT; tick += 1) {
      summarizeReplicaOperationLiveness(rows, {nowMs: NOW_MS});
    }
    const stats = getStepsHistoryParseMemoStats();
    // Exactly one parse (miss) per distinct steps_history string, regardless of
    // how many ticks scan the same rows.
    t.equal(
      stats.misses,
      ROW_COUNT,
      'one parse per distinct steps_history string',
    );
    // Every subsequent tick is a pure memo hit — the re-parse the profiler
    // pinned is eliminated.
    t.ok(
      stats.hits >= ROW_COUNT * (TICK_COUNT - 1),
      'subsequent ticks re-use the memoized parse',
    );
    t.end();
  },
);

test(
  'steps-history parse memo returns a shared frozen array',
  async (t) => {
    const rows = buildReplicaOperationRows(3);
    resetStepsHistoryParseMemo();
    const summary = summarizeReplicaOperationLiveness(rows, {nowMs: NOW_MS});
    // Value-equivalent to a direct parse of the same string.
    const expected = JSON.parse(rows[0].steps_history);
    t.same(
      summary.rows[0].stepsHistory,
      expected,
      'parsed steps_history is value-equivalent to a direct JSON.parse',
    );
    t.ok(
      Object.isFrozen(summary.rows[0].stepsHistory),
      'shared parse is frozen so accidental mutation fails loudly',
    );
    t.end();
  },
);

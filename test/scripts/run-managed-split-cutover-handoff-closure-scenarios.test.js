import {test} from '../../src/test-helpers/tap.js';
import {
  MANAGED_SPLIT_LOG_MSG,
} from '../../src/partition/partition-constants.js';
import {
  buildOrderedHandoffEvidence,
  countTerminalRoutingFailures,
} from '../../scripts/checks/run-managed-split-cutover-handoff-closure-scenarios.js';

const WORKFLOW_ID = 'split-ratings';
const GENERATION = 'split-ratings:1:2:7:node-a@3|node-b@4';

function event(time, msg, extra = {}) {
  return {time, msg, workflowId: WORKFLOW_ID, generation: GENERATION, ...extra};
}

test('live A/B analyzer requires the complete same-generation handoff before ' +
'source dissolution', (t) => {
  const handoffs = buildOrderedHandoffEvidence([
    event('2026-08-25T20:00:00.000Z',
      MANAGED_SPLIT_LOG_MSG.HANDOFF_CLOSING,
      {requiredNodeIds: ['node-a', 'node-b']}),
    event('2026-08-25T20:00:00.100Z',
      MANAGED_SPLIT_LOG_MSG.HANDOFF_QUERY_PLANE_READY,
      {acknowledgedNodeIds: ['node-a', 'node-b']}),
    event('2026-08-25T20:00:00.200Z',
      MANAGED_SPLIT_LOG_MSG.HANDOFF_CLOSED,
      {sourcePartitionId: 'ratings-p1', targetPartitionIds: ['left', 'right']}),
    event('2026-08-25T20:00:00.300Z',
      MANAGED_SPLIT_LOG_MSG.DISSOLUTION_DISPATCHED,
      {sourcePartitionId: 'ratings-p1'}),
  ]);
  t.equal(handoffs.length, 1, 'one closure yields one evidence row');
  t.equal(handoffs[0].ordered, true,
    'closing, query readiness, closure, and dissolution are ordered');
  t.equal(handoffs[0].requiredNodeCount, 2,
    'the captured live query cohort has N>=2 nodes');
  t.equal(handoffs[0].acknowledgedNodeCount, 2,
    'every required node has a generation-bound acknowledgement');
  t.end();
});

test('live A/B analyzer rejects source and child terminal routing failures ' +
'after handoff closure', (t) => {
  const failures = countTerminalRoutingFailures([
    {
      time: '2026-08-25T20:00:00.300Z',
      msg: 'Query execution failed',
      error: 'Partition service not found',
      sql: 'INSERT INTO ratings (rating_id) VALUES (1)',
    },
    {
      time: '2026-08-25T20:00:00.400Z',
      msg: 'Query execution failed',
      reasonCode: 'planning_snapshot_refresh_pending',
      error: 'No ready partition service available',
    },
  ], '2026-08-25T20:00:00.200Z');
  t.same(failures, {
    sourcePartitionServiceNotFound: 1,
    childPlanningSnapshotRefreshPending: 1,
  }, 'both historically observed terminal shapes fail the fixed arm');
  t.end();
});

test('live A/B lifecycle admission is stable under post-import intrinsic ' +
'replacement', (t) => {
  const events = [
    event('2026-08-25T20:00:00.000Z',
      MANAGED_SPLIT_LOG_MSG.HANDOFF_CLOSING,
      {requiredNodeIds: ['node-a', 'node-b']}),
    event('2026-08-25T20:00:00.100Z',
      MANAGED_SPLIT_LOG_MSG.HANDOFF_QUERY_PLANE_READY,
      {acknowledgedNodeIds: ['node-a', 'node-b']}),
    event('2026-08-25T20:00:00.200Z',
      MANAGED_SPLIT_LOG_MSG.HANDOFF_CLOSED),
    event('2026-08-25T20:00:00.300Z',
      MANAGED_SPLIT_LOG_MSG.DISSOLUTION_DISPATCHED),
  ];
  const mutations = [
    [Array.prototype, 'every', () => false],
    [Array.prototype, 'filter', () => []],
    [Array.prototype, 'find', () => undefined],
    [Array.prototype, 'map', () => []],
    [Set.prototype, 'has', () => false],
    [Number, 'isFinite', () => false],
    [Date, 'parse', () => Number.NaN],
  ];
  const originals = mutations.map(([target, key]) => [
    target,
    key,
    Object.getOwnPropertyDescriptor(target, key),
  ]);
  let handoffs;
  try {
    for (const [target, key, replacement] of mutations) {
      Object.defineProperty(target, key, {
        value: replacement,
        configurable: true,
        writable: true,
      });
    }
    handoffs = buildOrderedHandoffEvidence(events);
  } finally {
    for (const [target, key, descriptor] of originals) {
      Object.defineProperty(target, key, descriptor);
    }
  }
  t.equal(handoffs[0].ordered, true,
    'hostile collection and time intrinsics cannot erase ordered evidence');
  t.end();
});

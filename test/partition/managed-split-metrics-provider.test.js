/**
 * The managed-split metrics provider is the one QPM authority for automatic
 * split/merge. Contract: QPM is the rate over a full traffic window (the
 * newest sample at least one window old is the anchor); until one window
 * has been observed as local leader the QPM is null (no signal), never 0;
 * a counter regression or a leadership gap restarts the window; how often
 * the manager asks does not change the answer.
 */

import {test} from '../../src/test-helpers/tap.js';
import {createManagedSplitMetricsProvider} from '../../src/partition/managed-split-metrics-provider.js';

const WINDOW_MS = 60_000;

function buildLeaderServices(state) {
  return new Map([
    ['users-p1-r1', {
      partitionId: 'users-p1',
      get isLeader() {
        return state.isLeader !== false;
      },
      getSize() {
        return 622592;
      },
      cdcPipelineMetrics: {
        getSnapshot() {
          return {eventsGenerated: state.generatedCount};
        },
      },
    }],
  ]);
}

const ROW = Object.freeze({partition_id: 'users-p1', size_bytes: 0});

test('createManagedSplitMetricsProvider prefers live local leader size over stale ' +
  'partition row size', async (t) => {
  const partitionServices = new Map([
    ['users-p1-r1', {
      partitionId: 'users-p1',
      isLeader: true,
      getSize() {
        return 622592;
      },
    }],
  ]);

  const getPartitionMetrics = createManagedSplitMetricsProvider({
    partitionServices,
  });

  t.same(
    getPartitionMetrics('users-p1', {
      partition_id: 'users-p1',
      size_bytes: 0,
    }),
    {
      sizeBytes: 622592,
      queriesPerMinute: null,
      trafficObservedMs: 0,
    },
    'a leader without a CDC counter has a size but no traffic signal',
  );
});

test('createManagedSplitMetricsProvider has no traffic signal until one full ' +
  'window is observed, then reports the windowed rate', async (t) => {
  const state = {generatedCount: 10};
  let nowMs = 1_000_000;
  const getPartitionMetrics = createManagedSplitMetricsProvider({
    partitionServices: buildLeaderServices(state),
    now: () => nowMs,
    trafficWindowMs: WINDOW_MS,
  });

  t.equal(getPartitionMetrics('users-p1', ROW).queriesPerMinute, null,
    'the first observation is no signal, never 0');
  nowMs += 1000;
  state.generatedCount = 22;
  const early = getPartitionMetrics('users-p1', ROW);
  t.equal(early.queriesPerMinute, null,
    'one second of observations is still no signal');
  t.equal(early.trafficObservedMs, 1000);

  nowMs += WINDOW_MS - 1000;
  state.generatedCount = 10 + 720;
  const full = getPartitionMetrics('users-p1', ROW);
  t.equal(full.queriesPerMinute, 720,
    '720 writes over one full minute is 720 QPM');
  t.equal(full.trafficObservedMs, WINDOW_MS);
});

test('createManagedSplitMetricsProvider answers the same windowed rate when ' +
  're-sampled immediately (no zero-delta reading)', async (t) => {
  const state = {generatedCount: 0};
  let nowMs = 1_000_000;
  const getPartitionMetrics = createManagedSplitMetricsProvider({
    partitionServices: buildLeaderServices(state),
    now: () => nowMs,
    trafficWindowMs: WINDOW_MS,
  });
  getPartitionMetrics('users-p1', ROW);
  for (let second = 1; second <= 90; second += 1) {
    nowMs += 1000;
    state.generatedCount += 20;
    getPartitionMetrics('users-p1', ROW);
  }
  const first = getPartitionMetrics('users-p1', ROW).queriesPerMinute;
  nowMs += 1;
  const second = getPartitionMetrics('users-p1', ROW).queriesPerMinute;
  t.ok(first >= 1199 && first <= 1201,
    `steady 20 writes/s reads ~1200 (${first})`);
  t.ok(second >= 1199 && second <= 1201,
    `a re-sample 1 ms later still reads ~1200, not 0 (${second})`);
});

test('createManagedSplitMetricsProvider restarts the window on a CDC counter ' +
  'regression', async (t) => {
  const state = {generatedCount: 50};
  let nowMs = 1_000_000;
  const getPartitionMetrics = createManagedSplitMetricsProvider({
    partitionServices: buildLeaderServices(state),
    now: () => nowMs,
    trafficWindowMs: WINDOW_MS,
  });

  getPartitionMetrics('users-p1', ROW);
  nowMs += WINDOW_MS;
  state.generatedCount = 10;

  t.equal(
    getPartitionMetrics('users-p1', ROW).queriesPerMinute,
    null,
    'a counter reset is a new observation window: no signal, not 0',
  );
});

test('createManagedSplitMetricsProvider restarts the window after a ' +
  'leadership gap', async (t) => {
  const state = {generatedCount: 0, isLeader: true};
  let nowMs = 1_000_000;
  const getPartitionMetrics = createManagedSplitMetricsProvider({
    partitionServices: buildLeaderServices(state),
    now: () => nowMs,
    trafficWindowMs: WINDOW_MS,
  });
  getPartitionMetrics('users-p1', ROW);
  nowMs += WINDOW_MS;
  state.isLeader = false;
  t.equal(getPartitionMetrics('users-p1', ROW).queriesPerMinute, null,
    'not the local leader: no signal');
  state.isLeader = true;
  nowMs += 1000;
  t.equal(getPartitionMetrics('users-p1', ROW).queriesPerMinute, null,
    'leader again: the earlier samples are not reused');
});

test('createManagedSplitMetricsProvider falls back to persisted partition row size',
  async (t) => {
    const getPartitionMetrics = createManagedSplitMetricsProvider({
      partitionServices: new Map(),
    });

    t.same(
      getPartitionMetrics('users-p1', {
        partition_id: 'users-p1',
        size_bytes: 16384,
      }),
      {
        sizeBytes: 16384,
        queriesPerMinute: null,
        trafficObservedMs: 0,
      },
    );
  });

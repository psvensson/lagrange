/**
 * The managed-split metrics provider is the one QPM authority for automatic
 * split/merge. Contract: QPM is the average write rate over the most recent
 * span of at least one traffic window during which this node continuously
 * led the partition (one leadership tenure, one counter); the span runs from
 * the anchor (the newest retained sample at least one window old) to the
 * reading, and exceeds the window by less than one sampling cadence step
 * plus the longest gap between two consecutive provider calls. Until such
 * a span exists the QPM is null (no signal), never 0. Samples are stored on
 * the provider's own fixed cadence (window / 12), so how often the manager
 * asks neither destroys the window (dense calls) nor prevents one from
 * completing (sparse, periodic-only calls).
 */

import {test} from '../../src/test-helpers/tap.js';
import {createManagedSplitMetricsProvider} from '../../src/partition/managed-split-metrics-provider.js';
import {
  endReplicaLeadershipTenure,
  wireReplicaLifecycleEvents,
} from '../../src/raft/replica-leadership-state.js';

const WINDOW_MS = 60_000;
const CADENCE_MS = WINDOW_MS / 12;
const EVALUATION_INTERVAL_MS = 300_000;
const SAMPLE_CAPACITY = 13;
const ONE_MINUTE_MS = 60_000;

/**
 * One leadership tenure token, as the leadership edge mints it
 * (src/raft/replica-leadership-state.js): a NEW frozen object per tenure.
 * @param {number} term - Term.
 * @return {Object}
 */
function tenure(term) {
  return Object.freeze({term});
}

/**
 * A consensus port whose every property access throws: the QPM authority
 * must never touch the port (no readStatus, no side effect).
 */
const UNTOUCHABLE_RAFT = new Proxy({}, {
  get(_target, property) {
    throw new Error(`the QPM authority touched raft.${String(property)}`);
  },
  has(_target, property) {
    throw new Error(`the QPM authority probed raft.${String(property)}`);
  },
});

const STEADY_TENURE = tenure(1);

function buildLeaderServices(state) {
  return new Map([
    ['users-p1-r1', {
      partitionId: 'users-p1',
      get isLeader() {
        return state.isLeader !== false;
      },
      leadershipTenure: STEADY_TENURE,
      raft: UNTOUCHABLE_RAFT,
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

// --- Measurement invariants I1-I5 (B1/B2 of the 2026-10-05 rejection) ---

/**
 * One led partition whose CDC counter, leadership tenure and service
 * instance the test drives; its consensus port throws on any access.
 * @param {Object} state - Mutable {count, tenure, isLeader, metrics}.
 * @return {Map} partitionServices.
 */
function buildTermServices(state) {
  return new Map([['users-p1-r1', {
    partitionId: 'users-p1',
    get isLeader() {
      return state.isLeader !== false;
    },
    getSize: () => 1024,
    raft: UNTOUCHABLE_RAFT,
    get leadershipTenure() {
      return state.tenure;
    },
    get cdcPipelineMetrics() {
      return state.metrics;
    },
  }]]);
}

function createCounter(state) {
  return {getSnapshot: () => ({eventsGenerated: state.count})};
}

test('B1 witness: called 3x/s for 1 h at 0 QPM then 3000 QPM, the provider ' +
  'reads ~3000 one window (+ cadence) after the step - extra calls never ' +
  'stretch the window into the leadership average', async (t) => {
  for (const callsPerSecond of [1, 3, 20]) {
    const state = {count: 0, tenure: tenure(1)};
    state.metrics = createCounter(state);
    let nowMs = 1_700_000_000_000;
    const provider = createManagedSplitMetricsProvider({
      partitionServices: buildTermServices(state),
      now: () => nowMs,
      trafficWindowMs: WINDOW_MS,
      evaluationIntervalMs: EVALUATION_INTERVAL_MS,
    });
    let reading = null;
    // The step lands at second 3600; one window + one cadence step later
    // every span lies wholly after it.
    const readAtSecond = 3600 + (WINDOW_MS + CADENCE_MS) / 1000;
    for (let second = 0; second <= readAtSecond; second += 1) {
      nowMs += 1000;
      if (second >= 3600) {
        state.count += 50;
      }
      for (let call = 0; call < callsPerSecond; call += 1) {
        reading = provider('users-p1', ROW);
      }
    }
    t.equal(reading.queriesPerMinute, 3000,
      `${callsPerSecond} calls/s: reads 3000 one window + one cadence step ` +
      `after the step (read ${reading.queriesPerMinute})`);
    t.ok(reading.trafficObservedMs >= WINDOW_MS &&
      reading.trafficObservedMs < WINDOW_MS + 2 * CADENCE_MS,
    `${callsPerSecond} calls/s: span ${reading.trafficObservedMs} ms is ` +
      'one window plus less than one cadence step and one call gap');
  }
});

test('I3 provider: with ONLY the 300 s periodic evaluation the second ' +
  'periodic call has a signal (span = one evaluation interval) and the ' +
  'signal persists on every later periodic call', async (t) => {
  const state = {count: 0, tenure: tenure(1)};
  state.metrics = createCounter(state);
  let nowMs = 1_700_000_000_000;
  const provider = createManagedSplitMetricsProvider({
    partitionServices: buildTermServices(state),
    now: () => nowMs,
    trafficWindowMs: WINDOW_MS,
    evaluationIntervalMs: EVALUATION_INTERVAL_MS,
  });
  // The manager calls the provider ~3 times per partition per evaluation.
  const evaluate = () => [provider('users-p1', ROW), provider('users-p1', ROW),
    provider('users-p1', ROW)].at(-1);
  t.equal(evaluate().queriesPerMinute, null, 'first periodic call: no signal');
  for (let periodic = 2; periodic <= 10; periodic += 1) {
    nowMs += EVALUATION_INTERVAL_MS;
    const reading = evaluate();
    t.equal(reading.queriesPerMinute, 0,
      `periodic call ${periodic}: an idle partition reads 0 QPM`);
    t.equal(reading.trafficObservedMs, EVALUATION_INTERVAL_MS,
      `periodic call ${periodic}: over the span since the previous call`);
  }
});

test('I4: an UNOBSERVED leadership gap (a new tenure between two calls) and a ' +
  'restarted counter that overtakes the old value both restart the span',
async (t) => {
  const state = {count: 0, tenure: tenure(3)};
  state.metrics = createCounter(state);
  let nowMs = 1_700_000_000_000;
  const provider = createManagedSplitMetricsProvider({
    partitionServices: buildTermServices(state),
    now: () => nowMs,
    trafficWindowMs: WINDOW_MS,
    evaluationIntervalMs: EVALUATION_INTERVAL_MS,
  });
  provider('users-p1', ROW);
  nowMs += 2 * WINDOW_MS;
  state.count = 100;
  t.equal(provider('users-p1', ROW).queriesPerMinute, 50, 'baseline 50 QPM');
  // Leadership lost and regained between two calls: the counter froze
  // while another node led; the edge minted a new tenure.
  nowMs += 2 * WINDOW_MS;
  state.tenure = tenure(5);
  state.count = 110;
  t.equal(provider('users-p1', ROW).queriesPerMinute, null,
    'a new leadership tenure is a new span: no signal, not 5 QPM');
  nowMs += WINDOW_MS;
  state.count = 170;
  t.equal(provider('users-p1', ROW).queriesPerMinute, 60,
    'one window into the new tenure: the new tenure\'s rate only');
  // The partition service restarted (new counter instance) and its new
  // counter overtook the old value before the next call.
  nowMs += WINDOW_MS;
  state.metrics = createCounter(state);
  state.count = 400;
  t.equal(provider('users-p1', ROW).queriesPerMinute, null,
    'a new counter instance is a new span even when its value is higher');
});

test('I5: partitions no longer asked about are swept after the retention ' +
  'horizon (max(2 windows, evaluation interval + window)); the map is ' +
  'bounded by the partitions led recently', async (t) => {
  let nowMs = 1_700_000_000_000;
  const services = new Map();
  for (let index = 0; index < 50; index += 1) {
    const state = {count: 0, tenure: tenure(1)};
    state.metrics = createCounter(state);
    services.set(`p${index}-r1`, {
      partitionId: `p${index}`,
      isLeader: true,
      getSize: () => 1,
      raft: UNTOUCHABLE_RAFT,
      leadershipTenure: STEADY_TENURE,
      cdcPipelineMetrics: state.metrics,
    });
  }
  const provider = createManagedSplitMetricsProvider({
    partitionServices: services,
    now: () => nowMs,
    trafficWindowMs: WINDOW_MS,
    evaluationIntervalMs: EVALUATION_INTERVAL_MS,
  });
  for (let index = 0; index < 50; index += 1) {
    provider(`p${index}`, {partition_id: `p${index}`});
  }
  t.equal(provider.describeTrafficSamples().partitionCount, 50);
  nowMs += EVALUATION_INTERVAL_MS + WINDOW_MS;
  provider('p0', {partition_id: 'p0'});
  t.equal(provider.describeTrafficSamples().partitionCount, 50,
    'still inside the retention horizon: kept (a periodic-only partition ' +
    'keeps its anchor)');
  nowMs += WINDOW_MS + 1;
  provider('p0', {partition_id: 'p0'});
  t.equal(provider.describeTrafficSamples().partitionCount, 1,
    'past the horizon: the 49 partitions nobody asked about are forgotten');
});

/**
 * Deterministic PRNG (mulberry32).
 * @param {number} seed - Seed.
 * @return {Function} () => [0, 1).
 */
function createRandom(seed) {
  let value = seed >>> 0;
  return () => {
    value = (value + 0x6D2B79F5) >>> 0;
    let mixed = Math.imul(value ^ (value >>> 15), 1 | value);
    mixed = (mixed + Math.imul(mixed ^ (mixed >>> 7), 61 | mixed)) ^ mixed;
    return ((mixed ^ (mixed >>> 14)) >>> 0) / 4294967296;
  };
}

/**
 * Build one random world: piecewise-constant true write rates, leadership
 * gaps (the counter freezes while another node leads; regaining is a new
 * tenure), service restarts (a new counter instance from 0) and a random
 * provider call pattern from 0.01 to 20 calls/s.
 * @param {number} seed - Scenario seed.
 * @return {Object} World description.
 */
function buildRandomWorld(seed) {
  const random = createRandom(seed);
  const durationMs = 45 * ONE_MINUTE_MS;
  const callsPerSecond = 10 ** (-2 + random() * Math.log10(2000));
  const segments = [];
  for (let atMs = 0; atMs < durationMs;) {
    const lengthMs = 5000 + Math.floor(random() * 15 * ONE_MINUTE_MS);
    const qpm = random() < 0.3 ? 0 : Math.floor(random() * 8000);
    segments.push({startMs: atMs, endMs: atMs + lengthMs, qpm});
    atMs += lengthMs;
  }
  const breaks = [];
  for (let atMs = 0; atMs < durationMs;) {
    atMs += Math.floor(random() * 20 * ONE_MINUTE_MS);
    const kind = random() < 0.6 ? 'gap' : 'restart';
    const lengthMs = kind === 'gap' ? 1000 + Math.floor(random() * 4 *
      ONE_MINUTE_MS) : 0;
    breaks.push({kind, startMs: atMs, endMs: atMs + lengthMs});
    atMs += lengthMs;
  }
  const calls = [];
  for (let atMs = 0; atMs < durationMs;) {
    atMs += Math.max(1, Math.round(-Math.log(1 - random()) * 1000 /
      callsPerSecond));
    calls.push(atMs);
  }
  return {durationMs, callsPerSecond, segments, breaks, calls};
}

/**
 * The true number of writes in [fromMs, toMs).
 * @param {Array<Object>} segments - Rate segments.
 * @param {number} fromMs - Start.
 * @param {number} toMs - End.
 * @return {number}
 */
function trueWrites(segments, fromMs, toMs) {
  let writes = 0;
  for (const segment of segments) {
    const overlap = Math.min(toMs, segment.endMs) -
      Math.max(fromMs, segment.startMs);
    if (overlap > 0) {
      writes += segment.qpm * overlap / ONE_MINUTE_MS;
    }
  }
  return writes;
}

/**
 * Run one random world through the provider and check I1, I2 and I4 at
 * every call.
 * @param {number} seed - Scenario seed.
 * @return {Object} {failures, calls, signals, maxSpanExcessMs}.
 */
function runRandomWorld(seed) {
  const world = buildRandomWorld(seed);
  const baseMs = 1_700_000_000_000;
  const state = {count: 0, tenure: tenure(1), isLeader: true};
  state.metrics = createCounter(state);
  let nowMs = baseMs;
  const provider = createManagedSplitMetricsProvider({
    partitionServices: buildTermServices(state),
    now: () => nowMs,
    trafficWindowMs: WINDOW_MS,
    evaluationIntervalMs: EVALUATION_INTERVAL_MS,
  });
  const retentionMs = EVALUATION_INTERVAL_MS + WINDOW_MS;
  const failures = [];
  let continuityStartMs = 0;
  let lastAdvanceMs = 0;
  let previousCallMs = null;
  let maxGapSinceContinuityMs = 0;
  let firstCallSinceContinuityMs = null;
  let breakIndex = 0;
  let signals = 0;
  let maxSpanExcessMs = 0;
  const advanceCounter = (toMs) => {
    if (state.isLeader) {
      state.count += trueWrites(world.segments, lastAdvanceMs, toMs);
    }
    lastAdvanceMs = toMs;
  };
  let anchorCallIndex = -1;
  for (const [callIndex, callMs] of world.calls.entries()) {
    while (breakIndex < world.breaks.length &&
        world.breaks[breakIndex].startMs <= callMs) {
      const event = world.breaks[breakIndex];
      advanceCounter(event.startMs);
      if (event.kind === 'restart') {
        state.metrics = createCounter(state);
        state.count = 0;
        continuityStartMs = event.startMs;
      } else if (event.endMs <= callMs) {
        state.isLeader = false;
        advanceCounter(event.endMs);
        state.isLeader = true;
        state.tenure = tenure(state.tenure.term + 2);
        continuityStartMs = event.endMs;
      } else {
        break;
      }
      firstCallSinceContinuityMs = null;
      maxGapSinceContinuityMs = 0;
      breakIndex += 1;
    }
    const openGap = world.breaks[breakIndex];
    const inGap = openGap?.kind === 'gap' && openGap.startMs <= callMs;
    if (inGap && state.isLeader) {
      advanceCounter(openGap.startMs);
      state.isLeader = false;
    }
    advanceCounter(callMs);
    nowMs = baseMs + callMs;
    const reading = provider('users-p1', ROW);
    const census = provider.describeTrafficSamples();
    if (census.maxSamplesPerPartition > SAMPLE_CAPACITY) {
      failures.push({seed, callMs, census, why: 'I2 ring bound'});
    }
    if (inGap) {
      if (reading.queriesPerMinute !== null) {
        failures.push({seed, callMs, why: 'signal while not leader'});
      }
      previousCallMs = callMs;
      continue;
    }
    if (previousCallMs !== null && firstCallSinceContinuityMs !== null) {
      maxGapSinceContinuityMs = Math.max(maxGapSinceContinuityMs,
        callMs - previousCallMs);
    }
    if (firstCallSinceContinuityMs === null) {
      firstCallSinceContinuityMs = callMs;
    }
    previousCallMs = callMs;
    // The most recent earlier call at least one window old in this
    // continuity epoch (and no older than its first call).
    while (anchorCallIndex + 1 < callIndex &&
        world.calls[anchorCallIndex + 1] <= callMs - WINDOW_MS) {
      anchorCallIndex += 1;
    }
    if (reading.queriesPerMinute === null) {
      const anchorCallMs = anchorCallIndex >= 0 ?
        world.calls[anchorCallIndex] :
        null;
      const spanAvailable = anchorCallMs !== null &&
        anchorCallMs >= firstCallSinceContinuityMs &&
        callMs - anchorCallMs >= WINDOW_MS;
      if (spanAvailable && callMs - anchorCallMs <= retentionMs -
          CADENCE_MS) {
        failures.push({seed, callMs, why: 'I3/I1 liveness: a call one ' +
          'window to (retention - cadence) old anchors a span but no signal'});
      }
      continue;
    }
    signals += 1;
    const spanMs = reading.trafficObservedMs;
    const spanStartMs = callMs - spanMs;
    const expected = trueWrites(world.segments, spanStartMs, callMs) *
      ONE_MINUTE_MS / spanMs;
    maxSpanExcessMs = Math.max(maxSpanExcessMs, spanMs - WINDOW_MS);
    if (spanMs < WINDOW_MS) {
      failures.push({seed, callMs, spanMs, why: 'I1 span shorter than ' +
        'one window'});
    }
    if (spanMs >= WINDOW_MS + CADENCE_MS + maxGapSinceContinuityMs +
        1) {
      failures.push({seed, callMs, spanMs, maxGapSinceContinuityMs,
        why: 'I1 span longer than window + cadence + longest call gap ' +
          '(stale or whole-leadership anchor)'});
    }
    if (spanMs > retentionMs) {
      failures.push({seed, callMs, spanMs, why: 'S2 anchor older than the ' +
        'retention horizon'});
    }
    if (spanStartMs < continuityStartMs) {
      failures.push({seed, callMs, spanStartMs, continuityStartMs,
        why: 'I4 span crosses a leadership gap or counter restart'});
    }
    if (Math.abs(reading.queriesPerMinute - expected) >
        1e-6 * Math.max(1, expected)) {
      failures.push({seed, callMs, reported: reading.queriesPerMinute,
        expected, why: 'I1 reported != true average over the stated span'});
    }
  }
  return {failures, calls: world.calls.length, signals, maxSpanExcessMs,
    callsPerSecond: world.callsPerSecond};
}

const PROPERTY_SEEDS = Array.from({length: 240}, (_, index) => 1001 + index);

test('I1/I2/I4 property: for 240 seeded random worlds (0.01-20 calls/s, ' +
  'piecewise-constant rates, leadership gaps, counter restarts) the ' +
  'reported QPM is exactly the true average over the reported span, the ' +
  'span is >= one window and < window + cadence + longest call gap, never ' +
  'crosses a continuity break, and the ring stays bounded', async (t) => {
  let calls = 0;
  let signals = 0;
  const failures = [];
  let denseMaxExcessMs = 0;
  for (const seed of PROPERTY_SEEDS) {
    const result = runRandomWorld(seed);
    calls += result.calls;
    signals += result.signals;
    failures.push(...result.failures);
    if (result.callsPerSecond >= 5) {
      denseMaxExcessMs = Math.max(denseMaxExcessMs, result.maxSpanExcessMs);
    }
  }
  t.same(failures.slice(0, 5), [], `no invariant violation in ${calls} ` +
    `calls / ${signals} signals over ${PROPERTY_SEEDS.length} seeds ` +
    `(${failures.length} violations)`);
  t.ok(signals > calls / 4, `signals are the common case (${signals})`);
  t.ok(denseMaxExcessMs < CADENCE_MS + 4000, 'at >= 5 calls/s the span ' +
    'exceeds the window by < one cadence step + 4 s ' +
    `(${denseMaxExcessMs} ms)`);
});

test('I2: the ring holds at most window/cadence + 1 samples per partition ' +
  'whatever the call rate', async (t) => {
  const state = {count: 0, tenure: tenure(1)};
  state.metrics = createCounter(state);
  let nowMs = 1_700_000_000_000;
  const provider = createManagedSplitMetricsProvider({
    partitionServices: buildTermServices(state),
    now: () => nowMs,
    trafficWindowMs: WINDOW_MS,
    evaluationIntervalMs: EVALUATION_INTERVAL_MS,
  });
  let maxSamples = 0;
  for (let call = 0; call < 200_000; call += 1) {
    nowMs += 7;
    state.count += 1;
    provider('users-p1', ROW);
    maxSamples = Math.max(maxSamples,
      provider.describeTrafficSamples().maxSamplesPerPartition);
  }
  t.equal(provider.describeTrafficSamples().sampleCapacity, SAMPLE_CAPACITY);
  t.ok(maxSamples <= SAMPLE_CAPACITY,
    `143 calls/s for 23 min: at most ${maxSamples} samples`);
});

// --- B3: continuity from the leadership tenure token, never the port ---

test('B3: the provider never touches the consensus port - a readStatus ' +
  'counter reads 0 after 50 partitions x 3 calls x 60 evaluations, and a ' +
  'port that throws on any access is never reached', async (t) => {
  let readStatusCalls = 0;
  let nowMs = 1_700_000_000_000;
  const services = new Map();
  const counters = [];
  for (let index = 0; index < 50; index += 1) {
    const state = {count: 0};
    counters.push(state);
    services.set(`p${index}-r1`, {
      partitionId: `p${index}`,
      isLeader: true,
      leadershipTenure: tenure(7),
      getSize: () => 1,
      raft: index % 2 === 0 ? UNTOUCHABLE_RAFT : {
        readStatus() {
          readStatusCalls += 1;
          return {term: 7};
        },
      },
      cdcPipelineMetrics: createCounter(state),
    });
  }
  const provider = createManagedSplitMetricsProvider({
    partitionServices: services,
    now: () => nowMs,
    trafficWindowMs: WINDOW_MS,
    evaluationIntervalMs: EVALUATION_INTERVAL_MS,
  });
  let last = null;
  for (let evaluation = 0; evaluation < 60 + 1; evaluation += 1) {
    for (const state of counters) {
      state.count += 10;
    }
    for (let index = 0; index < 50; index += 1) {
      for (let call = 0; call < 3; call += 1) {
        last = provider(`p${index}`, {partition_id: `p${index}`});
      }
    }
    nowMs += 1000;
  }
  t.equal(readStatusCalls, 0, 'no port status read on any provider call');
  t.equal(last.queriesPerMinute, 600,
    'the signal is still measured (10 writes/s = 600 QPM)');
});

test('B3: a leader whose tenure was never minted or has ended has a size ' +
  'but no traffic signal', async (t) => {
  const state = {count: 0, tenure: null};
  state.metrics = createCounter(state);
  let nowMs = 1_700_000_000_000;
  const provider = createManagedSplitMetricsProvider({
    partitionServices: buildTermServices(state),
    now: () => nowMs,
    trafficWindowMs: WINDOW_MS,
    evaluationIntervalMs: EVALUATION_INTERVAL_MS,
  });
  for (let second = 0; second < 3 * 60; second += 1) {
    nowMs += 1000;
    state.count += 1;
    const reading = provider('users-p1', ROW);
    t.equal(reading.queriesPerMinute, null);
    if (reading.queriesPerMinute !== null) {
      break;
    }
  }
  t.equal(provider('users-p1', ROW).sizeBytes, 1024, 'the size is live');
});

/**
 * A consensus port double that only emits role/term events into the REAL
 * leadership edge (wireReplicaLifecycleEvents); readStatus answers the
 * edge's single term read per leadership event.
 * @param {Object} replica - The replica (partition service double).
 * @return {Function} emit(eventName, payload).
 */
function wireRealLeadershipEdge(replica) {
  const listeners = new Map();
  const port = {
    subscribe(eventName, listener) {
      const set = listeners.get(eventName) || new Set();
      set.add(listener);
      listeners.set(eventName, set);
    },
  };
  wireReplicaLifecycleEvents(replica, {
    raft: port,
    events: {LEADER: 'leader', FOLLOWER: 'follower', CANDIDATE: 'candidate',
      LEADER_CHANGE: 'leader-change', TERM_CHANGE: 'term-change'},
    roles: {LEADER: 'leader', FOLLOWER: 'follower', CANDIDATE: 'candidate'},
  });
  return (eventName, payload) => {
    for (const listener of listeners.get(eventName) || []) {
      listener(payload);
    }
  };
}

test('B3 edge: the REAL leadership edge mints a new tenure on election, on ' +
  'a re-election in a higher term without an observed demotion, and on ' +
  'demotion + re-promotion; it ends the tenure on demotion and on ' +
  'shutdown - and the provider restarts its span on each', async (t) => {
  const counter = {count: 0};
  const replica = {
    partitionId: 'users-p1',
    replicaId: 'users-p1-r1',
    nodeId: 'node-a',
    isLeader: false,
    leadershipTenure: null,
    currentTerm: 4,
    resolveCurrentTermSafe() {
      return this.currentTerm;
    },
    getSize: () => 1024,
    cdcPipelineMetrics: createCounter(counter),
  };
  const emit = wireRealLeadershipEdge(replica);
  let nowMs = 1_700_000_000_000;
  const provider = createManagedSplitMetricsProvider({
    partitionServices: new Map([['users-p1-r1', replica]]),
    now: () => nowMs,
    trafficWindowMs: WINDOW_MS,
    evaluationIntervalMs: EVALUATION_INTERVAL_MS,
  });
  const read = (writes) => {
    nowMs += WINDOW_MS;
    counter.count += writes;
    return provider('users-p1', ROW).queriesPerMinute;
  };

  emit('leader');
  const firstTenure = replica.leadershipTenure;
  t.same(firstTenure, {term: 4}, 'election mints the tenure of its term');
  t.ok(Object.isFrozen(firstTenure), 'the token is frozen');
  t.equal(read(0), null, 'first call of the tenure: no signal');
  t.equal(read(60), 60, 'one window into the tenure: 60 QPM');

  emit('term-change', 4);
  t.equal(replica.leadershipTenure, firstTenure,
    'the term the tenure already holds keeps the same token');
  t.equal(read(120), 120, 'same tenure: the span continues');

  // Leader -> leader with a term bump and no role event in between (a
  // restored sole voter that campaigns again at once).
  replica.currentTerm = 5;
  emit('term-change', 5);
  t.not(replica.leadershipTenure, firstTenure,
    'a higher term observed while leading is a NEW tenure');
  t.same(replica.leadershipTenure, {term: 5});
  t.equal(read(30), null, 're-election in a higher term restarts the span');
  t.equal(read(30), 30, 'one window into the new tenure: its own rate');

  const secondTenure = replica.leadershipTenure;
  emit('follower');
  t.equal(replica.leadershipTenure, null, 'demotion ends the tenure');
  replica.isLeader = true;
  t.equal(provider('users-p1', ROW).queriesPerMinute, null,
    'no tenure: no signal even where isLeader still reads true');
  replica.isLeader = false;
  // Demotion and re-promotion between two provider calls (unobserved by
  // the provider), even at the same term.
  emit('leader');
  t.not(replica.leadershipTenure, secondTenure,
    'a re-promotion mints a new token');
  t.equal(read(60), null, 'demotion + re-promotion restarts the span');
  t.equal(read(60), 60, 'one window later: a signal again');

  emit('candidate');
  t.equal(replica.leadershipTenure, null, 'a campaign ends the tenure');
  emit('leader');
  emit('leader-change', 'users-p1-r2');
  t.equal(replica.leadershipTenure, null,
    'a demotion by leader change ends the tenure');

  emit('leader');
  endReplicaLeadershipTenure(replica);
  t.equal(replica.leadershipTenure, null, 'shutdown ends the tenure');
  t.equal(read(60), null, 'an ended tenure has no signal');
});

// --- S1: the clock-back guard; S2: retention bounds the anchor ---

test('S1: a clock that steps back below the newest stored sample restarts ' +
  'the span (never a negative or inflated span)', async (t) => {
  const state = {count: 0, tenure: tenure(1)};
  state.metrics = createCounter(state);
  let nowMs = 1_700_000_000_000;
  const provider = createManagedSplitMetricsProvider({
    partitionServices: buildTermServices(state),
    now: () => nowMs,
    trafficWindowMs: WINDOW_MS,
    evaluationIntervalMs: EVALUATION_INTERVAL_MS,
  });
  for (let second = 0; second <= 2 * WINDOW_MS / 1000; second += 1) {
    nowMs += 1000;
    state.count += 10;
    provider('users-p1', ROW);
  }
  t.equal(provider('users-p1', ROW).queriesPerMinute, 600, 'baseline');
  // The wall clock steps back two windows.
  nowMs -= 2 * WINDOW_MS;
  state.count += 10;
  const stepped = provider('users-p1', ROW);
  t.equal(stepped.queriesPerMinute, null,
    'a backward step below the newest sample restarts the span');
  t.equal(stepped.trafficObservedMs, 0);
  nowMs += WINDOW_MS;
  state.count += 600;
  t.equal(provider('users-p1', ROW).queriesPerMinute, 600,
    'one window after the step: the rate over the new span only');
});

test('S2: a sample older than the retention horizon is never an anchor, ' +
  'even between two once-per-window sweeps', async (t) => {
  const retentionMs = EVALUATION_INTERVAL_MS + WINDOW_MS;
  let nowMs = 1_700_000_000_000;
  const states = [0, 1].map(() => ({count: 0, tenure: tenure(1)}));
  const services = new Map(states.map((state, index) => [`p${index}-r1`, {
    partitionId: `p${index}`,
    isLeader: true,
    leadershipTenure: state.tenure,
    getSize: () => 1,
    raft: UNTOUCHABLE_RAFT,
    cdcPipelineMetrics: createCounter(state),
  }]));
  const provider = createManagedSplitMetricsProvider({
    partitionServices: services,
    now: () => nowMs,
    trafficWindowMs: WINDOW_MS,
    evaluationIntervalMs: EVALUATION_INTERVAL_MS,
  });
  const startMs = nowMs;
  provider('p0', {partition_id: 'p0'});
  // Another partition's call runs the sweep just inside p0's horizon ...
  nowMs = startMs + retentionMs - 1;
  provider('p1', {partition_id: 'p1'});
  t.equal(provider.describeTrafficSamples().partitionCount, 2,
    'p0 survives the sweep (inside the horizon)');
  // ... and p0 is asked again less than one window later, past it.
  nowMs = startMs + retentionMs + WINDOW_MS - 2;
  states[0].count = 1000;
  const reading = provider('p0', {partition_id: 'p0'});
  t.equal(reading.queriesPerMinute, null,
    'the stale sample is not an anchor: no signal, not a ' +
    `${retentionMs + WINDOW_MS - 2} ms span`);
});

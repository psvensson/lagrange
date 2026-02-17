import {test} from '../../src/test-helpers/tap.js';
import {CONFIG_KEY} from '../../src/config/config-constants.js';
import {RaftAdaptiveTimingController} from
  '../../src/config/raft-adaptive-timing-controller.js';

/**
 * Create a mock dynamic config service.
 * @param {Object} values
 * @return {Object}
 */
function createMockDynamicConfigService(values = {}) {
  const store = new Map(Object.entries(values));
  const watchers = new Map();
  const setCalls = [];

  return {
    setCalls,
    async get(key) {
      return store.has(key) ? store.get(key) : undefined;
    },
    async set(key, value, updatedBy) {
      setCalls.push({key, value, updatedBy});
      store.set(key, value);
      return {success: true};
    },
    watch(key, callback) {
      if (!watchers.has(key)) {
        watchers.set(key, new Set());
      }
      watchers.get(key).add(callback);
      return () => {
        const keyWatchers = watchers.get(key);
        if (!keyWatchers) {
          return;
        }
        keyWatchers.delete(callback);
        if (keyWatchers.size === 0) {
          watchers.delete(key);
        }
      };
    },
    emitWatchUpdate(key, value) {
      const keyWatchers = watchers.get(key);
      if (!keyWatchers) {
        return;
      }
      for (const callback of keyWatchers) {
        callback(value, undefined, key);
      }
    },
  };
}

/**
 * Build diagnostics sampler report payload.
 * @param {Object} options
 * @param {number} options.cpuPercent
 * @param {number} options.writeBytesPerSec
 * @param {number} options.rssGrowthPerMinBytes
 * @return {Object}
 */
function buildReport(options = {}) {
  return {
    latest: {
      process: {cpuPercent: options.cpuPercent},
      io: {writeBytesPerSec: options.writeBytesPerSec},
    },
    trend: {
      rssGrowthPerMinBytes: options.rssGrowthPerMinBytes,
    },
  };
}

/**
 * Create sampler with deterministic report sequence.
 * @param {Array<Object>} reports
 * @return {Object}
 */
function createSequentialSampler(reports) {
  let index = 0;
  return {
    getReport() {
      if (!reports.length) {
        return buildReport({
          cpuPercent: 0,
          writeBytesPerSec: 0,
          rssGrowthPerMinBytes: 0,
        });
      }
      const boundedIndex = Math.min(index, reports.length - 1);
      const report = reports[boundedIndex];
      index += 1;
      return report;
    },
  };
}

test('RaftAdaptiveTimingController stays stopped when adaptive timing is disabled',
  async (t) => {
    const config = createMockDynamicConfigService({
      [CONFIG_KEY.RAFT_HEARTBEAT_INTERVAL_MS]: 50,
      [CONFIG_KEY.RAFT_ELECTION_TIMEOUT_MIN_MS]: 1000,
      [CONFIG_KEY.RAFT_ELECTION_TIMEOUT_MAX_MS]: 3000,
      [CONFIG_KEY.RAFT_ADAPTIVE_TIMING_ENABLED]: false,
    });
    const startedIntervals = [];
    const clearedIntervals = [];

    const controller = new RaftAdaptiveTimingController({
      dynamicConfigService: config,
      intervalFactory: (fn, ms) => {
        const handle = {fn, ms};
        startedIntervals.push(handle);
        return handle;
      },
      clearIntervalFn: (handle) => {
        clearedIntervals.push(handle);
      },
      samplerFactory: () => createSequentialSampler([]),
      evaluateOnStart: false,
    });

    await controller.initialize();
    const state = controller.getState();
    t.equal(state.loopRunning, false, 'loop should not run when disabled');
    t.equal(startedIntervals.length, 0, 'controller should not start interval');
    t.equal(config.setCalls.length, 0, 'controller should not write raft keys');

    controller.shutdown();
    t.equal(clearedIntervals.length, 0, 'no interval should be cleared');
  });

test('RaftAdaptiveTimingController switches from idle to active after high-load hysteresis',
  async (t) => {
    const config = createMockDynamicConfigService({
      [CONFIG_KEY.RAFT_HEARTBEAT_INTERVAL_MS]: 150,
      [CONFIG_KEY.RAFT_ELECTION_TIMEOUT_MIN_MS]: 3000,
      [CONFIG_KEY.RAFT_ELECTION_TIMEOUT_MAX_MS]: 5000,
      [CONFIG_KEY.RAFT_ADAPTIVE_TIMING_ENABLED]: true,
      [CONFIG_KEY.RAFT_ADAPTIVE_TIMING_PROMOTE_SAMPLES]: 2,
      [CONFIG_KEY.RAFT_ADAPTIVE_TIMING_DEMOTE_SAMPLES]: 2,
      [CONFIG_KEY.RAFT_ADAPTIVE_TIMING_HIGH_CPU_PERCENT]: 1,
      [CONFIG_KEY.RAFT_ADAPTIVE_TIMING_LOW_CPU_PERCENT]: 0.2,
      [CONFIG_KEY.RAFT_ADAPTIVE_TIMING_ACTIVE_HEARTBEAT_INTERVAL_MS]: 50,
      [CONFIG_KEY.RAFT_ADAPTIVE_TIMING_ACTIVE_ELECTION_TIMEOUT_MIN_MS]: 1000,
      [CONFIG_KEY.RAFT_ADAPTIVE_TIMING_ACTIVE_ELECTION_TIMEOUT_MAX_MS]: 3000,
      [CONFIG_KEY.RAFT_ADAPTIVE_TIMING_IDLE_HEARTBEAT_INTERVAL_MS]: 150,
      [CONFIG_KEY.RAFT_ADAPTIVE_TIMING_IDLE_ELECTION_TIMEOUT_MIN_MS]: 3000,
      [CONFIG_KEY.RAFT_ADAPTIVE_TIMING_IDLE_ELECTION_TIMEOUT_MAX_MS]: 5000,
    });

    const reports = [
      buildReport({
        cpuPercent: 2,
        writeBytesPerSec: 0,
        rssGrowthPerMinBytes: 0,
      }),
      buildReport({
        cpuPercent: 2,
        writeBytesPerSec: 0,
        rssGrowthPerMinBytes: 0,
      }),
    ];

    const controller = new RaftAdaptiveTimingController({
      dynamicConfigService: config,
      intervalFactory: () => {
        return {mocked: true};
      },
      clearIntervalFn: () => {},
      samplerFactory: () => createSequentialSampler(reports),
      evaluateOnStart: false,
    });

    await controller.initialize();
    await controller.evaluateOnce();
    await controller.evaluateOnce();

    const state = controller.getState();
    t.equal(state.profile, 'active', 'profile should switch to active');
    t.equal(config.setCalls.length, 3, 'should write all raft timing keys');
    t.same(config.setCalls.map((call) => call.key), [
      CONFIG_KEY.RAFT_HEARTBEAT_INTERVAL_MS,
      CONFIG_KEY.RAFT_ELECTION_TIMEOUT_MIN_MS,
      CONFIG_KEY.RAFT_ELECTION_TIMEOUT_MAX_MS,
    ], 'should update canonical raft timing keys');
    t.same(config.setCalls.map((call) => call.value), [50, 1000, 3000],
      'should apply active timing profile values');

    controller.shutdown();
  });

test('RaftAdaptiveTimingController switches from active to idle after low-load hysteresis',
  async (t) => {
    const config = createMockDynamicConfigService({
      [CONFIG_KEY.RAFT_HEARTBEAT_INTERVAL_MS]: 50,
      [CONFIG_KEY.RAFT_ELECTION_TIMEOUT_MIN_MS]: 1000,
      [CONFIG_KEY.RAFT_ELECTION_TIMEOUT_MAX_MS]: 3000,
      [CONFIG_KEY.RAFT_ADAPTIVE_TIMING_ENABLED]: true,
      [CONFIG_KEY.RAFT_ADAPTIVE_TIMING_PROMOTE_SAMPLES]: 2,
      [CONFIG_KEY.RAFT_ADAPTIVE_TIMING_DEMOTE_SAMPLES]: 2,
      [CONFIG_KEY.RAFT_ADAPTIVE_TIMING_HIGH_CPU_PERCENT]: 90,
      [CONFIG_KEY.RAFT_ADAPTIVE_TIMING_LOW_CPU_PERCENT]: 1,
      [CONFIG_KEY.RAFT_ADAPTIVE_TIMING_ACTIVE_HEARTBEAT_INTERVAL_MS]: 50,
      [CONFIG_KEY.RAFT_ADAPTIVE_TIMING_ACTIVE_ELECTION_TIMEOUT_MIN_MS]: 1000,
      [CONFIG_KEY.RAFT_ADAPTIVE_TIMING_ACTIVE_ELECTION_TIMEOUT_MAX_MS]: 3000,
      [CONFIG_KEY.RAFT_ADAPTIVE_TIMING_IDLE_HEARTBEAT_INTERVAL_MS]: 150,
      [CONFIG_KEY.RAFT_ADAPTIVE_TIMING_IDLE_ELECTION_TIMEOUT_MIN_MS]: 3000,
      [CONFIG_KEY.RAFT_ADAPTIVE_TIMING_IDLE_ELECTION_TIMEOUT_MAX_MS]: 5000,
    });

    const reports = [
      buildReport({
        cpuPercent: 0.2,
        writeBytesPerSec: 0,
        rssGrowthPerMinBytes: 0,
      }),
      buildReport({
        cpuPercent: 0.2,
        writeBytesPerSec: 0,
        rssGrowthPerMinBytes: 0,
      }),
    ];

    const controller = new RaftAdaptiveTimingController({
      dynamicConfigService: config,
      intervalFactory: () => {
        return {mocked: true};
      },
      clearIntervalFn: () => {},
      samplerFactory: () => createSequentialSampler(reports),
      evaluateOnStart: false,
    });

    await controller.initialize();
    await controller.evaluateOnce();
    await controller.evaluateOnce();

    const state = controller.getState();
    t.equal(state.profile, 'idle', 'profile should switch to idle');
    t.equal(config.setCalls.length, 3, 'should write all raft timing keys');
    t.same(config.setCalls.map((call) => call.value), [150, 3000, 5000],
      'should apply idle timing profile values');

    controller.shutdown();
  });

test('RaftAdaptiveTimingController stops loop when disabled by config watcher',
  async (t) => {
    const config = createMockDynamicConfigService({
      [CONFIG_KEY.RAFT_HEARTBEAT_INTERVAL_MS]: 50,
      [CONFIG_KEY.RAFT_ELECTION_TIMEOUT_MIN_MS]: 1000,
      [CONFIG_KEY.RAFT_ELECTION_TIMEOUT_MAX_MS]: 3000,
      [CONFIG_KEY.RAFT_ADAPTIVE_TIMING_ENABLED]: true,
    });
    const startedIntervals = [];
    const clearedIntervals = [];

    const controller = new RaftAdaptiveTimingController({
      dynamicConfigService: config,
      intervalFactory: (fn, ms) => {
        const handle = {fn, ms};
        startedIntervals.push(handle);
        return handle;
      },
      clearIntervalFn: (handle) => {
        clearedIntervals.push(handle);
      },
      samplerFactory: () => createSequentialSampler([]),
      evaluateOnStart: false,
    });

    await controller.initialize();
    t.equal(startedIntervals.length, 1, 'controller should start interval when enabled');
    t.equal(controller.getState().loopRunning, true, 'loop should be running');

    config.emitWatchUpdate(CONFIG_KEY.RAFT_ADAPTIVE_TIMING_ENABLED, false);

    t.equal(controller.getState().loopRunning, false, 'loop should stop after disable');
    t.equal(clearedIntervals.length, 1, 'controller should clear running interval');

    controller.shutdown();
  });

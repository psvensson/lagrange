// The seed's formation attribution window: started only under the flag,
// snapshots every interval without ending the window, ends once on the
// formed signal or the deadline, and flushes the profiler on every interval
// and at the end so a killed seed still leaves partial evidence.

import {EventEmitter} from 'node:events';

import {test} from '../../src/test-helpers/tap.js';
import {
  ATTRIBUTION_ENV,
  DEADLINE_ENV,
  END_REASON,
  FORMATION_ATTRIBUTION_LOG_MSG,
  FORMED_SIGNAL,
  FormationAttributionWindow,
  SNAPSHOT_INTERVAL_MS,
  startFormationAttributionWindow,
} from '../../src/diagnostics/formation-attribution-window.js';

const DEADLINE_MS = 1234;

function createLogger() {
  const lines = [];
  return {
    lines,
    info: (msg, fields) => lines.push({level: 'info', msg, fields}),
    warn: (msg, fields) => lines.push({level: 'warn', msg, fields}),
  };
}

function createAttribution() {
  let snapshots = 0;
  return {
    started: false,
    stopped: false,
    start() {
      this.started = true;
    },
    snapshot() {
      snapshots += 1;
      return {windowComplete: false, snapshots};
    },
    stop() {
      this.stopped = true;
      return {windowComplete: true, snapshots};
    },
  };
}

function createTimers() {
  const intervals = [];
  const timeouts = [];
  const cleared = [];
  return {
    intervals, timeouts, cleared,
    setIntervalFn: (fn, ms) => {
      const handle = {fn, ms, unref() {}};
      intervals.push(handle);
      return handle;
    },
    setTimeoutFn: (fn, ms) => {
      const handle = {fn, ms, unref() {}};
      timeouts.push(handle);
      return handle;
    },
    clearIntervalFn: (handle) => cleared.push(handle),
    clearTimeoutFn: (handle) => cleared.push(handle),
  };
}

function createProfiler() {
  const flushes = [];
  return {
    flushes,
    started: false,
    async start() {
      this.started = true;
    },
    async flush(final) {
      flushes.push(final);
    },
  };
}

async function createWindow(t, environment = {[DEADLINE_ENV]: String(DEADLINE_MS)}) {
  const logger = createLogger();
  const attribution = createAttribution();
  const timers = createTimers();
  const profiler = createProfiler();
  const signals = new EventEmitter();
  const window = new FormationAttributionWindow({
    environment, logger, attribution, profiler, signals, ...timers,
  });
  await window.start();
  t.equal(attribution.started, true, 'the seam window starts');
  t.equal(profiler.started, true, 'the profiler starts with it');
  return {window, logger, attribution, timers, profiler, signals};
}

function logged(logger, msg) {
  return logger.lines.filter((line) => line.msg === msg);
}

test('the window is off without the flag', async (t) => {
  const logger = createLogger();
  t.equal(await startFormationAttributionWindow({environment: {}, logger}), null);
  t.equal(logger.lines.length, 0, 'nothing is logged');
  t.end();
});

test('snapshots are periodic and never end the window', async (t) => {
  const {logger, attribution, timers} = await createWindow(t);
  t.equal(timers.intervals[0].ms, SNAPSHOT_INTERVAL_MS, 'snapshot cadence');
  t.equal(timers.timeouts[0].ms, DEADLINE_MS, 'deadline read from the environment');
  timers.intervals[0].fn();
  timers.intervals[0].fn();
  const snapshots = logged(logger, FORMATION_ATTRIBUTION_LOG_MSG.SNAPSHOT);
  t.equal(snapshots.length, 2, 'one line per interval');
  t.same(snapshots[1].fields.attribution, {windowComplete: false, snapshots: 2},
    'the snapshot is the seam\'s non-finalising read');
  t.equal(attribution.stopped, false, 'the window is still open');
  t.end();
});

test('the formed signal ends the window once', async (t) => {
  const {window, logger, attribution, timers, profiler, signals} =
    await createWindow(t);
  timers.intervals[1].fn();
  t.same(profiler.flushes, [false], 'the profile interval flushes a chunk');
  signals.emit(FORMED_SIGNAL);
  t.equal(attribution.stopped, true, 'the seam window is stopped');
  const windows = logged(logger, FORMATION_ATTRIBUTION_LOG_MSG.WINDOW);
  t.equal(windows.length, 1);
  t.equal(windows[0].fields.reason, END_REASON.FORMED_SIGNAL);
  t.equal(windows[0].fields.attribution.windowComplete, true);
  t.same(profiler.flushes, [false, true], 'the final flush closes the profile');
  t.equal(timers.cleared.length, 3, 'both intervals and the deadline are cleared');
  t.equal(signals.listenerCount(FORMED_SIGNAL), 1,
    'the listener stays: an unhandled formed signal would terminate the seed');
  signals.emit(FORMED_SIGNAL);
  t.equal(window.end(END_REASON.DEADLINE), null, 'a later end is inert');
  t.equal(logged(logger, FORMATION_ATTRIBUTION_LOG_MSG.WINDOW).length, 1);
  t.same(profiler.flushes, [false, true], 'no second final flush');
  t.end();
});

test('the deadline ends the window when no formed signal arrives', async (t) => {
  const {logger, timers} = await createWindow(t);
  timers.timeouts[0].fn();
  const windows = logged(logger, FORMATION_ATTRIBUTION_LOG_MSG.WINDOW);
  t.equal(windows.length, 1);
  t.equal(windows[0].fields.reason, END_REASON.DEADLINE);
  t.end();
});

test('a seam invariant failure is logged once and never thrown into the seed',
  async (t) => {
    const {logger, attribution, timers} = await createWindow(t);
    attribution.snapshot = () => {
      throw new Error('formation attribution clock moved backwards');
    };
    t.doesNotThrow(() => timers.intervals[0].fn(), 'the interval swallows it');
    t.doesNotThrow(() => timers.intervals[0].fn());
    const failures = logged(logger, FORMATION_ATTRIBUTION_LOG_MSG.MEASUREMENT_FAILED);
    t.equal(failures.length, 1, 'logged once');
    t.match(failures[0].fields.error, /clock moved backwards/u);
    t.end();
  });

test('the environment flag names the window', (t) => {
  t.equal(ATTRIBUTION_ENV, 'LAGRANGE_FORMATION_ATTRIBUTION');
  t.end();
});

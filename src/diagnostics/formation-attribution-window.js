import {mkdirSync, writeFileSync} from 'node:fs';
import {Session} from 'node:inspector';
import {join} from 'node:path';

import {FormationTurnAttribution} from './formation-turn-attribution.js';

/**
 * The seed's formation attribution window (formation-calibration-run).
 *
 * Under LAGRANGE_FORMATION_ATTRIBUTION=1 the seed starts one attribution
 * window at process start. Every SNAPSHOT_INTERVAL_MS it logs a
 * non-finalising bucket snapshot, so a stalled or killed seed still leaves
 * partial attribution. The window ends on the formed signal (the demo sends
 * SIGUSR2 at its "Cluster formed." mark) or on the deadline the environment
 * carries (the formation budget plus a margin), whichever comes first; the
 * final snapshot is logged as a complete window. With the same flag the main
 * thread is sampled through the inspector Profiler and the profile is
 * written on every flush interval and at the end, never only on a clean
 * exit. The profile corroborates the buckets; it never replaces them.
 *
 * Nothing here runs unless the flag is set, and a profiler failure is logged
 * once and never reaches the seed's behaviour.
 */
const ATTRIBUTION_ENV = 'LAGRANGE_FORMATION_ATTRIBUTION';
const DEADLINE_ENV = 'LAGRANGE_FORMATION_ATTRIBUTION_DEADLINE_MS';
const PROFILE_DIR_ENV = 'LAGRANGE_FORMATION_PROFILE_DIR';
const ENABLED_VALUE = '1';
const DEFAULT_DEADLINE_MS = 300000;
const SNAPSHOT_INTERVAL_MS = 10000;
const PROFILE_FLUSH_INTERVAL_MS = 60000;
const FORMED_SIGNAL = 'SIGUSR2';
const PROFILE_FILE_PREFIX = 'seed-main-thread-';
const PROFILE_FILE_SUFFIX = '.cpuprofile';
const PROFILER_ENABLE = 'Profiler.enable';
const PROFILER_START = 'Profiler.start';
const PROFILER_STOP = 'Profiler.stop';
const SNAPSHOT_STEP = 'snapshot';
const END_STEP = 'end';
const END_REASON = Object.freeze({
  FORMED_SIGNAL: 'formed_signal',
  DEADLINE: 'deadline',
  STOPPED: 'stopped',
});
const FORMATION_ATTRIBUTION_LOG_MSG = Object.freeze({
  STARTED: 'Formation attribution window started',
  SNAPSHOT: 'Formation attribution snapshot',
  WINDOW: 'Formation attribution window',
  PROFILE_WRITTEN: 'Formation attribution profile written',
  PROFILER_FAILED: 'Formation attribution profiler failed',
  MEASUREMENT_FAILED: 'Formation attribution measurement failed',
});
const numberIsFinite = Number.isFinite;
const jsonStringify = JSON.stringify;

function readDeadlineMs(environment) {
  const parsed = Number(environment[DEADLINE_ENV]);
  return numberIsFinite(parsed) && parsed > 0 ? parsed : DEFAULT_DEADLINE_MS;
}

function unref(handle) {
  if (handle && typeof handle.unref === 'function') handle.unref();
  return handle;
}

/**
 * A main-thread sampling profiler that writes a profile chunk on every
 * flush, so a killed seed still leaves the chunks written before the kill.
 */
class FlushingProfiler {
  constructor({directory, logger, session}) {
    this.directory = directory;
    this.logger = logger;
    this.session = session;
    this.chunk = 0;
    this.failed = false;
    // Flushes are serialised: a periodic stop must finish before the final
    // one, or the inspector reports no recording profile.
    this.flushChain = Promise.resolve();
  }

  post(method) {
    return new Promise((resolve, reject) => {
      this.session.post(method, (error, result) => {
        if (error) reject(error);
        else resolve(result);
      });
    });
  }

  async start() {
    try {
      mkdirSync(this.directory, {recursive: true});
      this.session.connect();
      await this.post(PROFILER_ENABLE);
      await this.post(PROFILER_START);
    } catch (error) {
      this.fail(error);
    }
  }

  fail(error) {
    if (this.failed) return;
    this.failed = true;
    this.logger.warn(FORMATION_ATTRIBUTION_LOG_MSG.PROFILER_FAILED, {
      error: String(error?.message || error),
    });
  }

  // Stop, write the chunk, and (unless final) start the next one; one flush
  // at a time, and never a rejection into the caller.
  flush(final) {
    this.flushChain = this.flushChain.then(() => this.flushNow(final));
    return this.flushChain;
  }

  async flushNow(final) {
    if (this.failed) return null;
    try {
      const {profile} = await this.post(PROFILER_STOP);
      const file = join(this.directory,
        `${PROFILE_FILE_PREFIX}${this.chunk}${PROFILE_FILE_SUFFIX}`);
      writeFileSync(file, jsonStringify(profile));
      this.chunk += 1;
      this.logger.info(FORMATION_ATTRIBUTION_LOG_MSG.PROFILE_WRITTEN, {file, final});
      if (!final) await this.post(PROFILER_START);
      else this.session.disconnect();
      return file;
    } catch (error) {
      this.fail(error);
      return null;
    }
  }
}

class FormationAttributionWindow {
  constructor({
    environment,
    logger,
    attribution = new FormationTurnAttribution(),
    profiler = null,
    signals = process,
    setTimeoutFn = setTimeout,
    setIntervalFn = setInterval,
    clearTimeoutFn = clearTimeout,
    clearIntervalFn = clearInterval,
  }) {
    this.logger = logger;
    this.attribution = attribution;
    this.profiler = profiler;
    this.signals = signals;
    this.deadlineMs = readDeadlineMs(environment);
    this.setTimeoutFn = setTimeoutFn;
    this.setIntervalFn = setIntervalFn;
    this.clearTimeoutFn = clearTimeoutFn;
    this.clearIntervalFn = clearIntervalFn;
    this.snapshotHandle = null;
    this.profileHandle = null;
    this.deadlineHandle = null;
    this.measurementFailed = false;
    this.ended = null;
    // The listener stays for the life of the process: Node's default
    // disposition for the formed signal is to terminate, so a signal that
    // arrives after the window ended must land on a listener and do nothing.
    this.onFormedSignal = () => {
      this.end(END_REASON.FORMED_SIGNAL);
    };
  }

  // A seam invariant failure (a clock that moved backwards, overlapping
  // segments) is a measurement defect; it is logged once and never reaches
  // the seed that is being measured.
  guard(what, body) {
    try {
      return body();
    } catch (error) {
      if (!this.measurementFailed) {
        this.measurementFailed = true;
        this.logger.warn(FORMATION_ATTRIBUTION_LOG_MSG.MEASUREMENT_FAILED, {
          what, error: String(error?.message || error),
        });
      }
      return null;
    }
  }

  async start() {
    this.attribution.start();
    if (this.profiler) await this.profiler.start();
    this.snapshotHandle = unref(this.setIntervalFn(() => {
      this.guard(SNAPSHOT_STEP, () => {
        this.logger.info(FORMATION_ATTRIBUTION_LOG_MSG.SNAPSHOT, {
          attribution: this.attribution.snapshot(),
        });
      });
    }, SNAPSHOT_INTERVAL_MS));
    if (this.profiler) {
      this.profileHandle = unref(this.setIntervalFn(() => {
        this.profiler.flush(false);
      }, PROFILE_FLUSH_INTERVAL_MS));
    }
    this.deadlineHandle = unref(this.setTimeoutFn(() => {
      this.end(END_REASON.DEADLINE);
    }, this.deadlineMs));
    this.signals.on(FORMED_SIGNAL, this.onFormedSignal);
    this.logger.info(FORMATION_ATTRIBUTION_LOG_MSG.STARTED, {
      deadlineMs: this.deadlineMs,
      snapshotIntervalMs: SNAPSHOT_INTERVAL_MS,
      formedSignal: FORMED_SIGNAL,
      profiling: this.profiler !== null,
    });
    return this;
  }

  /**
   * End the window once; later calls are inert.
   * @param {string} reason END_REASON value
   * @returns {object|null} the complete window snapshot, null if already ended
   */
  end(reason) {
    if (this.ended !== null) return null;
    this.ended = reason;
    this.clearIntervalFn(this.snapshotHandle);
    this.clearIntervalFn(this.profileHandle);
    this.clearTimeoutFn(this.deadlineHandle);
    const attribution = this.guard(END_STEP, () => this.attribution.stop());
    this.logger.info(FORMATION_ATTRIBUTION_LOG_MSG.WINDOW, {reason, attribution});
    if (this.profiler) this.profiler.flush(true);
    return attribution;
  }
}

/**
 * Start the seed's attribution window when the environment asks for one.
 * @param {object} options
 * @param {object} options.environment process environment snapshot
 * @param {object} options.logger runtime logger (info/warn)
 * @returns {Promise<FormationAttributionWindow|null>} null when not enabled
 */
async function startFormationAttributionWindow({environment, logger}) {
  if (environment[ATTRIBUTION_ENV] !== ENABLED_VALUE) return null;
  const directory = environment[PROFILE_DIR_ENV];
  const profiler = directory ?
    new FlushingProfiler({directory, logger, session: new Session()}) :
    null;
  const window = new FormationAttributionWindow({environment, logger, profiler});
  return window.start();
}

export {
  ATTRIBUTION_ENV,
  DEADLINE_ENV,
  END_REASON,
  FORMATION_ATTRIBUTION_LOG_MSG,
  FORMED_SIGNAL,
  FormationAttributionWindow,
  PROFILE_DIR_ENV,
  SNAPSHOT_INTERVAL_MS,
  startFormationAttributionWindow,
};

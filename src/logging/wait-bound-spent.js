/**
 * The one owner of "a spent wait is a failure, and is visible".
 *
 * Every timeout, backstop and exhausted retry in src/ reports its expiry
 * here, on the expiry branch only, as exactly one ERROR with one stable,
 * machine-readable shape (a test harness matches on `event`):
 *
 *   {event: 'wait_bound_spent', wait, awaited, boundMs, elapsedMs,
 *    lastObserved, scope, repeats}
 *
 * - `wait`: the named constant or site name of the bound.
 * - `awaited`: the event or condition the wait was for.
 * - `boundMs` / `elapsedMs`: the bound and the time actually spent.
 * - `lastObserved`: the last state the site saw before giving up. A site
 *   that observed nothing is itself a finding; it is reported as the named
 *   state WAIT_LAST_OBSERVED.NOTHING rather than an empty object.
 * - `scope`: node / partition / group / operation ids, as available.
 * - `repeats`: occurrences folded into this line by the flood rule.
 *
 * Observation: `lastObserved` and `scope` may be given as a value or as an
 * observer function. A site whose gathering can throw, or does more than
 * read locals it already holds, passes an observer: the reporter evaluates
 * it inside its own guard, so a failing observation becomes the named state
 * WAIT_OBSERVATION_STATE.FAILED in the line and never reaches the caller.
 * An observation that cannot be serialized (circular, BigInt) is reported
 * as WAIT_OBSERVATION_STATE.UNSERIALIZABLE with its keys, and one larger
 * than WAIT_BOUND_SPENT_MAX_OBSERVED_CHARS is truncated with
 * WAIT_OBSERVATION_STATE.TRUNCATED: the line is never dropped. Sites report
 * identifiers, counts and sizes, never row data, parameters or payloads.
 *
 * Flood rule: a site that can re-fire for the same subject (per heartbeat,
 * per tick) passes `subject`; the reporter then logs once per
 * (wait, subject) and observed state within WAIT_BOUND_SPENT_FOLD_WINDOW_MS
 * of the last admitted line, and counts the folded repeats into the next
 * admitted line. A changed state, or the same state after the window, is
 * admitted again, so a later incident for the same subject is never silent.
 * The window is time-based on the reporter's clock (read on the expiry
 * branch only) rather than reset by the wait's normal completion, because
 * a reset would add a call to every wait's normal path. Without `subject`
 * every occurrence is one line. The subject memory is bounded.
 *
 * Sink: a report whose wait lies on the logs-table write path itself is
 * written through the logging service's console-only sink, never back into
 * the logs table that just failed to take a write (with the logs partition
 * down, each failed log write would otherwise queue new log writes). The
 * reporter recognises such a report by its scope naming the logs table
 * (`tableName`/`tableId`) or a logs-table partition (`partitionId`); a site
 * that is part of the logs sink itself passes
 * `sink: WAIT_BOUND_SPENT_SINK.CONSOLE_ONLY`.
 *
 * Visibility only: the reporter never throws and never changes what the
 * caller does after its bound is spent.
 */

import {LoggingService} from './logging-service.js';
import {
  resolvePartitionTableId,
} from '../bootstrap/system-partition-classification.js';
import {SYSTEM_TABLE_NAME} from '../bootstrap/system-table-schemas-constants.js';

const WAIT_BOUND_SPENT_EVENT = 'wait_bound_spent';
const WAIT_BOUND_SPENT_MESSAGE = 'Wait bound spent';
const WAIT_BOUND_SPENT_MAX_SUBJECTS = 1024;
// A folded (wait, subject) is admitted again this long after its last line.
const WAIT_BOUND_SPENT_FOLD_WINDOW_MS = 60000;
// Bound on one serialized observation (lastObserved or scope) in a line.
const WAIT_BOUND_SPENT_MAX_OBSERVED_CHARS = 4096;
const WAIT_BOUND_SPENT_MAX_REPORTED_KEYS = 32;
const ERROR_LEVEL = 'error';

const WAIT_LAST_OBSERVED = Object.freeze({
  NOTHING: Object.freeze({state: 'site_observed_nothing'}),
});

const WAIT_OBSERVATION_STATE = Object.freeze({
  FAILED: 'observation_failed',
  UNSERIALIZABLE: 'unserializable',
  TRUNCATED: 'truncated',
});

const WAIT_BOUND_SPENT_SINK = Object.freeze({
  CONSOLE_ONLY: 'console_only',
});

const WAIT_ELAPSED = Object.freeze({
  UNMEASURED: 'unmeasured',
});

const WAIT_BOUND_SPENT_OUTCOME = Object.freeze({
  LOGGED: 'logged',
  FOLDED: 'folded_unchanged_subject',
  REPORTER_FAILED: 'reporter_failed',
});

const SUBJECT_KEY_SEPARATOR = '\u0000';
const NO_REPEATS = 0;
const ONE_REPEAT = 1;
const UNREADABLE_ERROR = 'unreadable_error';

function isPlainObjectWithEntries(value) {
  return value !== null && typeof value === 'object' &&
    Object.keys(value).length > NO_REPEATS;
}

function describeError(error) {
  try {
    return String(error?.message ?? error);
  } catch (_describeError) {
    return UNREADABLE_ERROR;
  }
}

/**
 * Evaluate an observer (or take a value) inside the reporter's guard.
 * @param {*} observation - A value or a function returning one.
 * @return {*} The observed value, or the named observation_failed state.
 */
function observe(observation) {
  if (typeof observation !== 'function') {
    return observation;
  }
  try {
    return observation();
  } catch (error) {
    return {state: WAIT_OBSERVATION_STATE.FAILED, error: describeError(error)};
  }
}

function resolveLastObserved(lastObserved) {
  if (isPlainObjectWithEntries(lastObserved)) {
    return lastObserved;
  }
  if (lastObserved !== undefined && lastObserved !== null &&
      typeof lastObserved !== 'object' && lastObserved !== '') {
    return {value: lastObserved};
  }
  return WAIT_LAST_OBSERVED.NOTHING;
}

function resolveScope(scope) {
  return isPlainObjectWithEntries(scope) ? scope : {};
}

/**
 * Make one observation safe to log: serializable and bounded in size.
 * @param {Object} value - A resolved observation (a non-null object).
 * @return {{value: Object, fingerprint: string}} The loggable value and the
 *   serialized form it was judged by.
 */
function boundObservation(value) {
  let serialized;
  try {
    serialized = JSON.stringify(value);
  } catch (_serializeError) {
    const keys = Object.keys(value).slice(
      NO_REPEATS, WAIT_BOUND_SPENT_MAX_REPORTED_KEYS);
    const safe = {state: WAIT_OBSERVATION_STATE.UNSERIALIZABLE, keys};
    return {value: safe, fingerprint: JSON.stringify(safe)};
  }
  if (serialized.length <= WAIT_BOUND_SPENT_MAX_OBSERVED_CHARS) {
    return {value, fingerprint: serialized};
  }
  return {
    value: {
      state: WAIT_OBSERVATION_STATE.TRUNCATED,
      serializedChars: serialized.length,
      preview: serialized.slice(NO_REPEATS, WAIT_BOUND_SPENT_MAX_OBSERVED_CHARS),
    },
    fingerprint: serialized,
  };
}

function resolveElapsedMs(spent, now) {
  if (Number.isFinite(spent.elapsedMs)) {
    return spent.elapsedMs;
  }
  if (Number.isFinite(spent.startedAtMs)) {
    return now() - spent.startedAtMs;
  }
  return WAIT_ELAPSED.UNMEASURED;
}

function resolveLogger(logger) {
  return typeof logger?.error === 'function' ?
    logger :
    LoggingService.getInstance();
}

/**
 * Whether a resolved scope names the logs table or one of its partitions.
 * @param {Object} scope - A resolved scope.
 * @return {boolean}
 */
function isLogsTableScope(scope) {
  if (scope.tableName === SYSTEM_TABLE_NAME.LOGS ||
      scope.tableId === SYSTEM_TABLE_NAME.LOGS) {
    return true;
  }
  return typeof scope.partitionId === 'string' &&
    resolvePartitionTableId({partitionId: scope.partitionId}) ===
      SYSTEM_TABLE_NAME.LOGS;
}

function resolveSink(spent, scope) {
  return isLogsTableScope(scope) ?
    WAIT_BOUND_SPENT_SINK.CONSOLE_ONLY :
    spent.sink;
}

/**
 * Write one line through the sink the report names.
 * @param {Object} logger - Site logger.
 * @param {string} [sink] - A WAIT_BOUND_SPENT_SINK value, or none.
 * @param {Object} payload - The wait_bound_spent context.
 */
function emit(logger, sink, payload) {
  if (sink !== WAIT_BOUND_SPENT_SINK.CONSOLE_ONLY) {
    resolveLogger(logger).error(WAIT_BOUND_SPENT_MESSAGE, payload);
    return;
  }
  const consoleSink = typeof logger?.logConsoleOnly === 'function' ?
    logger :
    LoggingService.getInstance();
  consoleSink.logConsoleOnly(ERROR_LEVEL, WAIT_BOUND_SPENT_MESSAGE, payload);
}

class WaitBoundSpentReporter {
  /**
   * @param {Object} [options]
   * @param {Function} [options.now] - Clock in ms (elapsed from startedAtMs,
   *   and the flood window).
   * @param {number} [options.maxSubjects] - Bound on remembered subjects.
   */
  constructor(options = {}) {
    this._now = typeof options.now === 'function' ? options.now : Date.now;
    this._maxSubjects = Number.isInteger(options.maxSubjects) &&
      options.maxSubjects > NO_REPEATS ?
      options.maxSubjects :
      WAIT_BOUND_SPENT_MAX_SUBJECTS;
    /** (wait, subject) -> {fingerprint, folded, admittedAtMs} */
    this._subjects = new Map();
    this.reporterFailures = NO_REPEATS;
  }

  /**
   * Report one spent bound. Call on the expiry branch only.
   * @param {Object} logger - Site logger with error(message, context).
   * @param {Object} spent - {wait, awaited, boundMs, elapsedMs|startedAtMs,
   *   lastObserved (value or observer), scope (value or observer),
   *   subject?, sink?}
   * @return {string} A WAIT_BOUND_SPENT_OUTCOME value.
   */
  report(logger, spent) {
    try {
      const lastObserved = boundObservation(
        resolveLastObserved(observe(spent.lastObserved)));
      const repeats = this._admit(spent, lastObserved.fingerprint);
      if (repeats === WAIT_BOUND_SPENT_OUTCOME.FOLDED) {
        return WAIT_BOUND_SPENT_OUTCOME.FOLDED;
      }
      const scope = resolveScope(observe(spent.scope));
      emit(logger, resolveSink(spent, scope), {
        event: WAIT_BOUND_SPENT_EVENT,
        wait: String(spent.wait),
        awaited: String(spent.awaited),
        boundMs: spent.boundMs,
        elapsedMs: resolveElapsedMs(spent, this._now),
        lastObserved: lastObserved.value,
        scope: boundObservation(scope).value,
        repeats,
      });
      return WAIT_BOUND_SPENT_OUTCOME.LOGGED;
    } catch (_reporterError) {
      this.reporterFailures += ONE_REPEAT;
      return WAIT_BOUND_SPENT_OUTCOME.REPORTER_FAILED;
    }
  }

  _admit(spent, fingerprint) {
    if (spent.subject === undefined || spent.subject === null) {
      return NO_REPEATS;
    }
    const key = `${spent.wait}${SUBJECT_KEY_SEPARATOR}${spent.subject}`;
    const nowMs = this._now();
    const entry = this._subjects.get(key);
    if (entry && entry.fingerprint === fingerprint &&
        nowMs - entry.admittedAtMs < WAIT_BOUND_SPENT_FOLD_WINDOW_MS) {
      entry.folded += ONE_REPEAT;
      return WAIT_BOUND_SPENT_OUTCOME.FOLDED;
    }
    this._subjects.delete(key);
    this._subjects.set(key, {
      fingerprint, folded: NO_REPEATS, admittedAtMs: nowMs,
    });
    if (this._subjects.size > this._maxSubjects) {
      this._subjects.delete(this._subjects.keys().next().value);
    }
    return entry ? entry.folded : NO_REPEATS;
  }
}

const DEFAULT_REPORTER = new WaitBoundSpentReporter();

/**
 * Read a wait's clock from its owner: the owner's injected `now()` when it
 * has one, else the wall clock. A site reads its start and its elapsed time
 * through this so that wiring the reporter never adds a hard dependency on
 * an owner clock to the wait's normal path; a throwing owner clock falls
 * back to the wall clock, so a wait start never throws.
 * @param {Object} owner - The wait's owner (may lack `now`).
 * @return {number} Milliseconds.
 */
function readWaitClock(owner) {
  if (typeof owner?.now !== 'function') {
    return Date.now();
  }
  try {
    return owner.now();
  } catch {
    return Date.now();
  }
}

/**
 * Report a spent wait through the process-wide reporter.
 * @param {Object} logger - Site logger with error(message, context).
 * @param {Object} spent - See WaitBoundSpentReporter#report.
 * @return {string} A WAIT_BOUND_SPENT_OUTCOME value.
 */
function reportWaitBoundSpent(logger, spent) {
  return DEFAULT_REPORTER.report(logger, spent);
}

export {
  WAIT_BOUND_SPENT_EVENT,
  WAIT_BOUND_SPENT_FOLD_WINDOW_MS,
  WAIT_BOUND_SPENT_MAX_OBSERVED_CHARS,
  WAIT_BOUND_SPENT_OUTCOME,
  WAIT_BOUND_SPENT_SINK,
  WAIT_LAST_OBSERVED,
  WAIT_OBSERVATION_STATE,
  WaitBoundSpentReporter,
  readWaitClock,
  reportWaitBoundSpent,
};

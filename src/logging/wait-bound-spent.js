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
 * Flood rule: a site that can re-fire for the same subject (per heartbeat,
 * per tick) passes `subject`; the reporter then logs once per
 * (wait, subject) until the subject's observed state changes, and counts
 * the folded repeats into the next admitted line. Without `subject` every
 * occurrence is one line. The subject memory is bounded.
 *
 * Visibility only: the reporter never throws and never changes what the
 * caller does after its bound is spent.
 */

import {LoggingService} from './logging-service.js';

const WAIT_BOUND_SPENT_EVENT = 'wait_bound_spent';
const WAIT_BOUND_SPENT_MESSAGE = 'Wait bound spent';
const WAIT_BOUND_SPENT_MAX_SUBJECTS = 1024;

const WAIT_LAST_OBSERVED = Object.freeze({
  NOTHING: Object.freeze({state: 'site_observed_nothing'}),
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

function isPlainObjectWithEntries(value) {
  return value !== null && typeof value === 'object' &&
    Object.keys(value).length > NO_REPEATS;
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

function buildPayload(spent, now, repeats) {
  return {
    event: WAIT_BOUND_SPENT_EVENT,
    wait: String(spent.wait),
    awaited: String(spent.awaited),
    boundMs: spent.boundMs,
    elapsedMs: resolveElapsedMs(spent, now),
    lastObserved: resolveLastObserved(spent.lastObserved),
    scope: isPlainObjectWithEntries(spent.scope) ? spent.scope : {},
    repeats,
  };
}

class WaitBoundSpentReporter {
  /**
   * @param {Object} [options]
   * @param {Function} [options.now] - Clock in ms (elapsed from startedAtMs).
   * @param {number} [options.maxSubjects] - Bound on remembered subjects.
   */
  constructor(options = {}) {
    this._now = typeof options.now === 'function' ? options.now : Date.now;
    this._maxSubjects = Number.isInteger(options.maxSubjects) &&
      options.maxSubjects > NO_REPEATS ?
      options.maxSubjects :
      WAIT_BOUND_SPENT_MAX_SUBJECTS;
    /** (wait, subject) -> {fingerprint, folded} */
    this._subjects = new Map();
    this.reporterFailures = NO_REPEATS;
  }

  /**
   * Report one spent bound. Call on the expiry branch only.
   * @param {Object} logger - Site logger with error(message, context).
   * @param {Object} spent - {wait, awaited, boundMs, elapsedMs|startedAtMs,
   *   lastObserved, scope, subject?}
   * @return {string} A WAIT_BOUND_SPENT_OUTCOME value.
   */
  report(logger, spent) {
    try {
      const repeats = this._admit(spent);
      if (repeats === WAIT_BOUND_SPENT_OUTCOME.FOLDED) {
        return WAIT_BOUND_SPENT_OUTCOME.FOLDED;
      }
      resolveLogger(logger).error(
        WAIT_BOUND_SPENT_MESSAGE,
        buildPayload(spent, this._now, repeats),
      );
      return WAIT_BOUND_SPENT_OUTCOME.LOGGED;
    } catch (_reporterError) {
      this.reporterFailures += ONE_REPEAT;
      return WAIT_BOUND_SPENT_OUTCOME.REPORTER_FAILED;
    }
  }

  _admit(spent) {
    if (spent.subject === undefined || spent.subject === null) {
      return NO_REPEATS;
    }
    const key = `${spent.wait}${SUBJECT_KEY_SEPARATOR}${spent.subject}`;
    const fingerprint = JSON.stringify(
      resolveLastObserved(spent.lastObserved),
    );
    const entry = this._subjects.get(key);
    if (entry && entry.fingerprint === fingerprint) {
      entry.folded += ONE_REPEAT;
      return WAIT_BOUND_SPENT_OUTCOME.FOLDED;
    }
    this._subjects.delete(key);
    this._subjects.set(key, {fingerprint, folded: NO_REPEATS});
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
 * an owner clock to the wait's normal path.
 * @param {Object} owner - The wait's owner (may lack `now`).
 * @return {number} Milliseconds.
 */
function readWaitClock(owner) {
  return typeof owner?.now === 'function' ? owner.now() : Date.now();
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
  WAIT_BOUND_SPENT_OUTCOME,
  WAIT_LAST_OBSERVED,
  WaitBoundSpentReporter,
  readWaitClock,
  reportWaitBoundSpent,
};

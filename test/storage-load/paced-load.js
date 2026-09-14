/**
 * A paced load stream: one operation kind issued at a target rate for a
 * duration, with live figures the scenario can snapshot at any moment.
 * Deliberately small: the storage-load report needs attempted/succeeded
 * counts, throughput and latency percentiles, nothing the distributed
 * harness's admission-aware generator adds for Docker clusters.
 */
const MS_PER_SECOND = 1000;
const PERCENTILE = Object.freeze({P50: 0.5, P95: 0.95, P99: 0.99});
const MAX_IN_FLIGHT_DEFAULT = 8;
const ERROR_MESSAGE_LIMIT = 200;

function percentile(sorted, fraction) {
  if (sorted.length === 0) return 0;
  const index = Math.min(sorted.length - 1,
    Math.max(0, Math.ceil(sorted.length * fraction) - 1));
  return sorted[index];
}

function describeError(error) {
  const message = error && error.message ? error.message : String(error);
  return message.length > ERROR_MESSAGE_LIMIT ?
    message.slice(0, ERROR_MESSAGE_LIMIT) : message;
}

/** Counts and latencies of one kind of operation against one target. */
class LoadFigures {
  constructor() {
    this.attempted = 0;
    this.succeeded = 0;
    this.failed = 0;
    this.latencies = [];
    this.lastError = null;
  }

  recordSuccess(latencyMs) {
    this.succeeded += 1;
    this.latencies.push(latencyMs);
  }

  recordFailure(error) {
    this.failed += 1;
    this.lastError = describeError(error);
  }

  /**
   * @param {number} elapsedMs - Window the counts were collected over.
   * @return {Object} attempted, succeeded, failed, opsPerSec, latencyMs.
   */
  figures(elapsedMs) {
    const window = Math.max(1, elapsedMs);
    const sorted = [...this.latencies].sort((left, right) => left - right);
    return {
      attempted: this.attempted,
      succeeded: this.succeeded,
      failed: this.failed,
      opsPerSec: (this.succeeded / window) * MS_PER_SECOND,
      latencyMs: {
        p50: percentile(sorted, PERCENTILE.P50),
        p95: percentile(sorted, PERCENTILE.P95),
        p99: percentile(sorted, PERCENTILE.P99),
        max: sorted.length === 0 ? 0 : sorted[sorted.length - 1],
      },
      lastError: this.lastError,
    };
  }
}

class PacedLoadStream {
  /**
   * @param {Object} options
   * @param {string} options.name - Stream name (write, read).
   * @param {number} options.opsPerSec - Target rate.
   * @param {number} options.durationMs - How long to issue operations.
   * @param {Function} options.operation - async (counter) => void; a throw
   *   or a rejected promise counts as a failure.
   * @param {number} [options.maxInFlight] - Concurrency cap; a full window
   *   delays the next dispatch rather than piling up.
   */
  constructor(options) {
    this.name = options.name;
    this.opsPerSec = options.opsPerSec;
    this.durationMs = options.durationMs;
    this.operation = options.operation;
    this.maxInFlight = options.maxInFlight || MAX_IN_FLIGHT_DEFAULT;
    this.totals = new LoadFigures();
    this.inFlight = 0;
    this.startedAtMs = null;
    this.endedAtMs = null;
    this.stopped = false;
    this.timer = null;
    this.completion = null;
    this.resolveCompletion = null;
  }

  start() {
    this.startedAtMs = Date.now();
    this.completion = new Promise((resolve) => {
      this.resolveCompletion = resolve;
    });
    if (this.opsPerSec <= 0) {
      this.stopped = true;
      this.finishWhenDrained();
      return this;
    }
    const intervalMs = MS_PER_SECOND / this.opsPerSec;
    let counter = 0;
    let nextDueMs = this.startedAtMs;
    const tick = () => {
      if (this.stopped) return;
      const nowMs = Date.now();
      if (nowMs - this.startedAtMs >= this.durationMs) {
        this.stopped = true;
        this.finishWhenDrained();
        return;
      }
      while (nextDueMs <= nowMs && this.inFlight < this.maxInFlight) {
        counter += 1;
        this.dispatch(counter);
        nextDueMs += intervalMs;
      }
      if (nextDueMs < nowMs) nextDueMs = nowMs;
      this.timer = setTimeout(tick, Math.max(1, nextDueMs - Date.now()));
    };
    tick();
    return this;
  }

  dispatch(counter) {
    this.totals.attempted += 1;
    this.inFlight += 1;
    const beganMs = Date.now();
    Promise.resolve()
      .then(() => this.operation(counter))
      .then(() => this.totals.recordSuccess(Date.now() - beganMs),
        (error) => this.totals.recordFailure(error))
      .finally(() => {
        this.inFlight -= 1;
        if (this.stopped) this.finishWhenDrained();
      });
  }

  finishWhenDrained() {
    if (this.inFlight > 0 || this.endedAtMs !== null) return;
    this.endedAtMs = Date.now();
    if (this.timer) clearTimeout(this.timer);
    this.resolveCompletion();
  }

  /** Stop issuing new operations; in-flight ones complete. */
  stop() {
    this.stopped = true;
    if (this.timer) clearTimeout(this.timer);
    this.finishWhenDrained();
  }

  /** @return {Promise<void>} Resolves once stopped and drained. */
  waitComplete() {
    return this.completion;
  }

  /** Elapsed milliseconds of the stream so far (or in total once ended). */
  elapsedMs() {
    const endMs = this.endedAtMs === null ? Date.now() : this.endedAtMs;
    return Math.max(1, endMs - (this.startedAtMs || endMs));
  }

  /**
   * Live figures for the report.
   * @return {Object}
   */
  figures() {
    return {
      ...this.totals.figures(this.elapsedMs()),
      targetOpsPerSec: this.opsPerSec,
    };
  }
}

export {LoadFigures, PacedLoadStream};

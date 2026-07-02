import {
  LOGGING_ERROR_MSG,
  LOGGING_LOG_MSG,
} from './logging-constants.js';
import {
  LOCAL_NUM_ZERO,
  LOCAL_NUM_ONE,
  LOCAL_STR_12XVB,
  LOCAL_STR_OV8OK,
  LOCAL_STR_CONNECTION_TO_NODE,
  LOCAL_STR_CLOSED,
  LOCAL_STR_10U11,
  LOCAL_STR_MESSAGE_TIMEOUT,
  LOCAL_STR_1Y4H5,
  LOCAL_STR_10811,
  MIN_YIELD_MS,
  MIN_SLEEP_MS,
} from './logs-table-service-constants.js';

/**
 * Determine whether one logs-table write failure should defer the owner
 * instead of retrying every buffered entry inline.
 * @param {Error} error
 * @return {boolean}
 * @private
 */
function shouldDeferWriteError(error) {
  if (!error) {
    return false;
  }
  if (error?.deferRetry === true ||
      error?.code === LOCAL_STR_12XVB) {
    return true;
  }
  if (Number.isFinite(error?.retryAfterMs) &&
      error.retryAfterMs > LOCAL_NUM_ZERO) {
    return true;
  }
  const message = error?.message || String(error);
  return message.includes(LOCAL_STR_OV8OK) ||
    message.includes(LOCAL_STR_CONNECTION_TO_NODE) &&
    message.includes(LOCAL_STR_CLOSED) ||
    message.includes(LOCAL_STR_10U11) ||
    message.includes(LOCAL_STR_MESSAGE_TIMEOUT) ||
    message.includes(LOCAL_STR_1Y4H5) ||
    message.includes(LOCAL_STR_10811);
}

const logsTableServiceFlushHelperMethods = {
  /**
   * Schedule a continuation flush for pending queued entries.
   * @private
   */
  scheduleContinuationFlush(delayOverrideMs = this.flushYieldMs) {
    const delayMs = Number.isFinite(delayOverrideMs) &&
      delayOverrideMs >= MIN_YIELD_MS ?
      Math.floor(delayOverrideMs) :
      this.flushYieldMs;
    const dueAtMs = this.now() + delayMs;
    if (this.flushContinuationTimer &&
        Number.isFinite(this.flushContinuationDueAtMs) &&
        this.flushContinuationDueAtMs <= dueAtMs) {
      return;
    }

    if (this.flushContinuationTimer) {
      this.clearTimeoutFn(this.flushContinuationTimer);
    }

    this.flushContinuationDueAtMs = dueAtMs;
    this.flushContinuationTimer = this.setTimeoutFn(() => {
      this.flushContinuationTimer = null;
      this.flushContinuationDueAtMs = null;
      this.flush({
        maxEntries: this.flushChunkSize,
        yieldPending: true,
      }).catch((error) => {
        console.error(LOGGING_ERROR_MSG.PERIODIC_FLUSH_FAILED, error.message);
      });
    }, delayMs);

    if (this.flushContinuationTimer.unref) {
      this.flushContinuationTimer.unref();
    }
  },

  /**
   * Write a single entry with retry logic.
   * @param {Object} entry - Log entry to write.
   * @return {Promise<boolean>} True if write succeeded.
   * @private
   */
  async writeEntryWithRetry(entry) {
    let lastError = null;

    for (let attempt = LOCAL_NUM_ZERO; attempt < this.maxRetries; attempt++) {
      try {
        await this.writeEntryToTable(entry);
        return true;
      } catch (error) {
        lastError = error;
        if (this.shouldDeferWriteError(error)) {
          throw error;
        }
        if (attempt < this.maxRetries - LOCAL_NUM_ONE) {
          await this.sleep(this.retryDelayMs * (attempt + LOCAL_NUM_ONE));
        }
      }
    }

    const error = lastError || new Error(LOGGING_ERROR_MSG.WRITE_ENTRY_FAILED);
    throw error;
  },

  /**
   * Check whether logs-table writes are currently in a defer window.
   * @return {boolean}
   * @private
   */
  isWriteDeferred() {
    if (!Number.isFinite(this.writeDeferredUntilMs) ||
        this.writeDeferredUntilMs <= LOCAL_NUM_ZERO) {
      return false;
    }
    if (this.now() >= this.writeDeferredUntilMs) {
      this.writeDeferredUntilMs = LOCAL_NUM_ZERO;
      return false;
    }
    return true;
  },

  /**
   * Return remaining defer time for the logs-table writer.
   * @return {number}
   * @private
   */
  getRemainingWriteDeferMs() {
    if (!this.isWriteDeferred()) {
      return LOCAL_NUM_ZERO;
    }
    return Math.max(MIN_SLEEP_MS, this.writeDeferredUntilMs - this.now());
  },

  /**
   * Resolve one defer delay after a transient logs-table write failure.
   * @param {Error} error
   * @return {number}
   * @private
   */
  resolveWriteDeferMs(error) {
    const baseRetryAfterMs = Number.isFinite(error?.retryAfterMs) &&
      error.retryAfterMs > 0 ?
      Math.max(MIN_SLEEP_MS, Math.floor(error.retryAfterMs)) :
      Math.max(MIN_SLEEP_MS, this.retryDelayMs);
    const exponent = Math.max(0, this.consecutiveDeferredWriteFailures - 1);
    const scaledRetryAfterMs =
      baseRetryAfterMs * (this.pressureDeferBackoffMultiplier ** exponent);
    return Math.min(
      this.pressureMaxRetryDelayMs,
      Math.max(MIN_SLEEP_MS, Math.floor(scaledRetryAfterMs)),
    );
  },

  /**
   * Requeue the remaining batch and pause the logs-table writer briefly after
   * one transient control-plane failure.
   * @param {Array<Object>} entries
   * @param {Error} error
   * @private
   */
  deferPendingWrites(entries, error) {
    const requeuedEntries = Array.isArray(entries) ? entries.length : 0;
    if (Array.isArray(entries) && entries.length > LOCAL_NUM_ZERO) {
      this.pendingWrites = entries.concat(this.pendingWrites);
    }
    this.consecutiveDeferredWriteFailures += LOCAL_NUM_ONE;
    const droppedEntries = this.trimPendingWritesUnderPressure();
    const retryAfterMs = this.resolveWriteDeferMs(error);
    const desiredUntilMs = this.now() + retryAfterMs;
    this.writeDeferredUntilMs = Math.max(
      this.writeDeferredUntilMs || LOCAL_NUM_ZERO,
      desiredUntilMs,
    );
    this.scheduleContinuationFlush(retryAfterMs);
    console.warn(
      LOGGING_LOG_MSG.logsWriteDeferred(
        retryAfterMs,
        this.pendingWrites.length,
      ),
      {
        error: error?.message || String(error),
        retryAfterMs,
        pendingWrites: this.pendingWrites.length,
        retainedPressureBacklogCap: this.getRetainedPressureBacklogCap(),
        maxPendingWrites: this.maxPendingWrites,
        isWriting: false,
        requeuedEntries,
        droppedEntries,
      },
    );
  },

  /**
   * Start the periodic flush timer.
   * @private
   */
  startFlushTimer() {
    if (this.flushTimer) {
      return;
    }

    this.flushTimer = this.setIntervalFn(() => {
      this.flush().catch((error) => {
        console.error(LOGGING_ERROR_MSG.PERIODIC_FLUSH_FAILED, error.message);
      });
    }, this.flushIntervalMs);

    // Don't prevent process exit
    if (this.flushTimer.unref) {
      this.flushTimer.unref();
    }
  },

  /**
   * Stop the periodic flush timer.
   * @private
   */
  stopFlushTimer() {
    if (this.flushTimer) {
      this.clearIntervalFn(this.flushTimer);
      this.flushTimer = null;
    }
    if (this.flushContinuationTimer) {
      this.clearTimeoutFn(this.flushContinuationTimer);
      this.flushContinuationTimer = null;
    }
    this.flushContinuationDueAtMs = null;
  },

  /**
   * Sleep for a specified duration.
   * @param {number} ms - Milliseconds to sleep.
   * @return {Promise<void>}
   * @private
   */
  sleep(ms) {
    return new Promise((resolve) => this.setTimeoutFn(resolve, ms));
  },
};

const {
  scheduleContinuationFlush,
  writeEntryWithRetry,
  isWriteDeferred,
  getRemainingWriteDeferMs,
  resolveWriteDeferMs,
  deferPendingWrites,
  startFlushTimer,
  stopFlushTimer,
  sleep,
} = logsTableServiceFlushHelperMethods;

export {
  scheduleContinuationFlush,
  writeEntryWithRetry,
  isWriteDeferred,
  getRemainingWriteDeferMs,
  shouldDeferWriteError,
  resolveWriteDeferMs,
  deferPendingWrites,
  startFlushTimer,
  stopFlushTimer,
  sleep,
};

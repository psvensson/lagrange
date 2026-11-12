/**
 * A throttled, aggregating, console-only diagnostics line.
 *
 * Hot paths (one CDC wave, one obligation drive, one applied event) want a
 * line per occurrence for causal analysis but must not flood stdout or add a
 * single write to the logs table. One instance admits the first occurrence
 * of a key, then at most one per window; while it suppresses it keeps a
 * count and the largest measured duration, and folds both into the next
 * admitted line, so a suppressed worst case is never lost. The line's fields
 * are built only when a line is admitted, so a suppressed occurrence costs
 * one clock read and a map lookup.
 *
 * Sink: LoggingService.logConsoleOnly, which has no persistence branch. The
 * lines can never reach the logs table whose write path they describe.
 */

import {LoggingService} from '../logging/logging-service.js';
import {LogThrottle} from '../logging/log-throttle.js';

const DIAGNOSTICS_LINE_LEVEL = 'info';
const CONTEXT_FAILED = 'diagnostics_context_failed';

class ThrottledDiagnosticsLine {
  /**
   * @param {Object} options
   * @param {string} options.message - The line's message.
   * @param {number} options.windowMs - Minimum ms between lines per key.
   * @param {string} options.maxField - Field carrying the largest measured
   *   duration since the previous line (this occurrence included).
   * @param {Function} [options.now] - Clock; the wall clock by default.
   * @param {Function} [options.write] - (level, message, context) sink; the
   *   logging service's console-only entry by default.
   */
  constructor(options) {
    this.message = options.message;
    this.maxField = options.maxField;
    this.throttle = new LogThrottle({windowMs: options.windowMs, now: options.now});
    this.write = options.write ?? ((level, message, context) =>
      LoggingService.getInstance().logConsoleOnly(level, message, context));
    /** key -> largest measured duration among suppressed occurrences */
    this.suppressedMax = new Map();
  }

  /**
   * Report one occurrence.
   * @param {string} key - Throttle bucket.
   * @param {number|null} measuredMs - This occurrence's duration, if any.
   * @param {Function} buildContext - () => fields; called only when the line
   *   is admitted. A throwing builder yields a line naming the failure.
   * @return {boolean} Whether a line was written.
   */
  report(key, measuredMs, buildContext) {
    const suppressed = this.throttle.admit(key);
    let largest = this.suppressedMax.get(key) ?? null;
    if (Number.isFinite(measuredMs) && (largest === null || measuredMs > largest)) {
      largest = measuredMs;
    }
    if (suppressed === null) {
      if (largest !== null) {
        this.suppressedMax.set(key, largest);
      }
      return false;
    }
    this.suppressedMax.delete(key);
    let context;
    try {
      context = buildContext();
    } catch (error) {
      context = {state: CONTEXT_FAILED, error: String(error?.message ?? error)};
    }
    this.write(DIAGNOSTICS_LINE_LEVEL, this.message, {
      ...context,
      suppressed,
      [this.maxField]: largest,
    });
    return true;
  }
}

export {ThrottledDiagnosticsLine};

/**
 * Reporters carried by the process's one periodic diagnostics tick.
 *
 * The event-loop gap watchdog (event-loop-gap-watchdog.js) owns the only
 * ambient diagnostics timer of a node process. A subsystem that wants a
 * periodic console-only diagnostics line registers a reporter here instead of
 * arming a timer of its own; the watchdog runs every registered reporter on
 * each heartbeat and each reporter decides from its own clock whether a line
 * is due. Reporters observe and log; they never act. A process whose
 * watchdog is not running (in-process harnesses, a disabled threshold) runs
 * no reporter.
 */

class PeriodicDiagnosticsReporters {
  constructor() {
    this.reporters = new Set();
    this.failures = 0;
    this.lastFailure = null;
  }

  /**
   * @param {Function} reporter - (nowMs) => void; must not throw to be useful.
   * @return {Function} Unregister.
   */
  register(reporter) {
    this.reporters.add(reporter);
    return () => {
      this.reporters.delete(reporter);
    };
  }

  /**
   * Run every reporter. A failing reporter is counted and remembered, and
   * never stops the tick that carries the others.
   * @param {number} nowMs - The tick's wall clock.
   * @return {void}
   */
  run(nowMs) {
    for (const reporter of this.reporters) {
      try {
        reporter(nowMs);
      } catch (error) {
        this.failures += 1;
        this.lastFailure = error;
      }
    }
  }
}

const sharedPeriodicDiagnosticsReporters = new PeriodicDiagnosticsReporters();

/**
 * @param {Function} reporter - (nowMs) => void.
 * @return {Function} Unregister.
 */
function registerPeriodicDiagnosticsReporter(reporter) {
  return sharedPeriodicDiagnosticsReporters.register(reporter);
}

/**
 * @param {number} nowMs - The tick's wall clock.
 * @return {void}
 */
function runPeriodicDiagnosticsReporters(nowMs) {
  sharedPeriodicDiagnosticsReporters.run(nowMs);
}

export {
  registerPeriodicDiagnosticsReporter,
  runPeriodicDiagnosticsReporters,
};

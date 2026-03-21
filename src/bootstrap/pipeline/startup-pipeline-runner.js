/**
 * Shared startup pipeline runner for seed bootstrap and node join.
 *
 * Cleanup is NOT managed by this runner. Cleanup ownership belongs to
 * dedicated handler modules (SeedCleanupHandler, JoinCleanupHandler)
 * that are invoked by the orchestrator's error handling path. This
 * ensures exactly one active cleanup execution path per flow (D3.2).
 */

const STARTUP_PIPELINE_EVENT = Object.freeze({
  PHASE_START: 'phaseStart',
  PHASE_COMPLETE: 'phaseComplete',
  PHASE_FAILED: 'phaseFailed',
});

class StartupPipelineRunner {
  /**
   * @param {Object} options
   * @param {Object} [options.logger]
   * @param {Object} [options.eventSink] - Optional EventEmitter-like sink.
   */
  constructor(options = {}) {
    this.logger = options.logger || console;
    this.eventSink = options.eventSink || null;
  }

  /**
   * Run ordered startup phases. On failure the error propagates to
   * the caller which owns cleanup orchestration through the
   * canonical handler (SeedCleanupHandler / JoinCleanupHandler).
   * @param {Object} options
   * @param {Array<{name: string, run: Function}>} options.phases
   * @return {Promise<{completedPhases: string[]}>}
   */
  async run(options = {}) {
    const phases = Array.isArray(options.phases) ? options.phases : [];
    const completedPhases = [];

    for (const phase of phases) {
      this.emit(STARTUP_PIPELINE_EVENT.PHASE_START, {
        phase: phase.name,
      });

      try {
        await phase.run();
        completedPhases.push(phase.name);
        this.emit(STARTUP_PIPELINE_EVENT.PHASE_COMPLETE, {
          phase: phase.name,
        });
      } catch (error) {
        this.emit(STARTUP_PIPELINE_EVENT.PHASE_FAILED, {
          phase: phase.name,
          error: error.message,
        });

        throw error;
      }
    }

    return {
      completedPhases,
    };
  }

  /**
   * Emit pipeline event on event sink when available.
   * @param {string} eventName
   * @param {Object} payload
   */
  emit(eventName, payload) {
    if (!this.eventSink || typeof this.eventSink.emit !== 'function') {
      return;
    }
    this.eventSink.emit(`pipeline:${eventName}`, payload);
  }
}

export {StartupPipelineRunner, STARTUP_PIPELINE_EVENT};

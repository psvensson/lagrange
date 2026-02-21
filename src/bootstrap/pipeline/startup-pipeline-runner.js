/**
 * Shared startup pipeline runner for seed bootstrap and node join.
 */

const STARTUP_PIPELINE_EVENT = Object.freeze({
  PHASE_START: 'phaseStart',
  PHASE_COMPLETE: 'phaseComplete',
  PHASE_FAILED: 'phaseFailed',
  CLEANUP_START: 'cleanupStart',
  CLEANUP_COMPLETE: 'cleanupComplete',
  CLEANUP_FAILED: 'cleanupFailed',
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
   * Run ordered startup phases.
   * @param {Object} options
   * @param {Array<{name: string, run: Function}>} options.phases
   * @param {Array<{name: string, phaseName?: string, run: Function}>} [options.cleanup]
   * @param {Object} [options.context]
   * @return {Promise<{completedPhases: string[]}>}
   */
  async run(options = {}) {
    const phases = Array.isArray(options.phases) ? options.phases : [];
    const cleanup = Array.isArray(options.cleanup) ? options.cleanup : [];
    const context = options.context || {};
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

        if (cleanup.length > 0) {
          await this.runCleanup({
            cleanup,
            failedPhaseName: phase.name,
            completedPhases,
            allPhases: phases,
            context,
          });
        }

        throw error;
      }
    }

    return {
      completedPhases,
    };
  }

  /**
   * Run cleanup steps in supplied order.
   * @param {Object} options
   * @param {Array<{name: string, phaseName?: string, run: Function}>} options.cleanup
   * @param {string} options.failedPhaseName
   * @param {Array<string>} options.completedPhases
   * @param {Array<{name: string}>} options.allPhases
   * @param {Object} options.context
   * @return {Promise<void>}
   */
  async runCleanup(options = {}) {
    const cleanup = options.cleanup || [];
    const failedPhaseName = options.failedPhaseName;
    const completedPhases = options.completedPhases || [];
    const allPhases = options.allPhases || [];
    const context = options.context || {};

    const phaseIndexByName = new Map(
      allPhases.map((phase, index) => [phase.name, index]),
    );
    const failedPhaseIndex = phaseIndexByName.has(failedPhaseName) ?
      phaseIndexByName.get(failedPhaseName) :
      Number.MAX_SAFE_INTEGER;

    this.emit(STARTUP_PIPELINE_EVENT.CLEANUP_START, {
      failedPhase: failedPhaseName,
    });

    for (const step of cleanup) {
      const shouldRun = this.shouldRunCleanupStep({
        step,
        completedPhases,
        failedPhaseIndex,
        phaseIndexByName,
      });
      if (!shouldRun) {
        continue;
      }

      try {
        await step.run({
          failedPhaseName,
          completedPhases,
          context,
        });
        this.emit(STARTUP_PIPELINE_EVENT.CLEANUP_COMPLETE, {
          cleanupStep: step.name,
        });
      } catch (error) {
        this.emit(STARTUP_PIPELINE_EVENT.CLEANUP_FAILED, {
          cleanupStep: step.name,
          error: error.message,
        });
        this.logger.warn('Startup cleanup step failed', {
          cleanupStep: step.name,
          error: error.message,
        });
      }
    }
  }

  /**
   * Decide whether a cleanup step should execute.
   * @param {Object} options
   * @param {Object} options.step
   * @param {Array<string>} options.completedPhases
   * @param {number} options.failedPhaseIndex
   * @param {Map<string, number>} options.phaseIndexByName
   * @return {boolean}
   */
  shouldRunCleanupStep(options = {}) {
    const step = options.step || {};
    const completedPhases = options.completedPhases || [];
    const failedPhaseIndex = Number.isFinite(options.failedPhaseIndex) ?
      options.failedPhaseIndex :
      Number.MAX_SAFE_INTEGER;
    const phaseIndexByName = options.phaseIndexByName || new Map();

    if (!step.phaseName) {
      return true;
    }

    if (!completedPhases.includes(step.phaseName) &&
        step.phaseName !== undefined) {
      const stepIndex = phaseIndexByName.get(step.phaseName);
      return Number.isFinite(stepIndex) && stepIndex <= failedPhaseIndex;
    }

    return true;
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

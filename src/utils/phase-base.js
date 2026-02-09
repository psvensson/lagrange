/**
 * PhaseBase - Base class for phase-based operations.
 *
 * Provides a standardized pattern for multi-step operations with:
 * - Event emission on phase transitions (started, completed, failed)
 * - Timing tracking for observability
 * - Abstract run() method for subclass implementation
 *
 * Requirements: 4.4, 4.6
 *
 * @interface
 * @fires PhaseBase#phaseStarted - When phase execution begins
 * @fires PhaseBase#phaseCompleted - When phase execution completes successfully
 * @fires PhaseBase#phaseFailed - When phase execution fails
 */

import {EventEmitter} from 'events';

/**
 * Event names for phase lifecycle.
 * @type {Object}
 */
const PHASE_EVENT = Object.freeze({
  STARTED: 'phaseStarted',
  COMPLETED: 'phaseCompleted',
  FAILED: 'phaseFailed',
});

/**
 * Error messages for PhaseBase.
 * @type {Object}
 */
const PHASE_ERROR = Object.freeze({
  RUN_NOT_IMPLEMENTED: 'Subclasses must implement run()',
});

/**
 * Base class for phase-based operations.
 * Subclasses must implement the run() method.
 *
 * @extends EventEmitter
 */
class PhaseBase extends EventEmitter {
  /**
   * Create a new PhaseBase.
   * @param {string} name - The name of the phase.
   * @param {Object} context - Context data passed to the phase.
   */
  constructor(name, context) {
    super();
    this.name = name;
    this.context = context;
    this.startTime = null;
    this.endTime = null;
  }

  /**
   * Execute the phase with event emission and timing.
   * Emits 'phaseStarted' before execution, and either
   * 'phaseCompleted' or 'phaseFailed' after execution.
   *
   * @return {Promise<*>} The result from the run() method.
   * @throws {Error} If run() throws an error.
   */
  async execute() {
    this.startTime = Date.now();
    this.emit(PHASE_EVENT.STARTED, {phase: this.name, context: this.context});

    try {
      const result = await this.run();
      this.endTime = Date.now();
      this.emit(PHASE_EVENT.COMPLETED, {
        phase: this.name,
        duration: this.endTime - this.startTime,
        result,
      });
      return result;
    } catch (error) {
      this.endTime = Date.now();
      this.emit(PHASE_EVENT.FAILED, {
        phase: this.name,
        duration: this.endTime - this.startTime,
        error,
      });
      throw error;
    }
  }

  /**
   * Abstract method that subclasses must implement.
   * Contains the actual phase logic.
   *
   * @abstract
   * @return {Promise<*>} The result of the phase execution.
   * @throws {Error} Always throws if not overridden.
   */
  async run() {
    throw new Error(PHASE_ERROR.RUN_NOT_IMPLEMENTED);
  }

  /**
   * Get the duration of the phase execution in milliseconds.
   * Returns null if the phase has not completed.
   *
   * @return {number|null} Duration in milliseconds or null.
   */
  getDuration() {
    if (this.startTime === null || this.endTime === null) {
      return null;
    }
    return this.endTime - this.startTime;
  }
}

export {PhaseBase, PHASE_EVENT, PHASE_ERROR};

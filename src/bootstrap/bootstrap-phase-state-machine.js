/**
 * Bootstrap phase state machine for tracking seed node bootstrap phases.
 * Enforces valid phase transitions and tracks timing for each phase.
 *
 * @module bootstrap/bootstrap-phase-state-machine
 */

import {EventEmitter} from 'events';
import {PhaseTransitionError} from './bootstrap-errors.js';

/**
 * Valid phase transitions for seed node bootstrap.
 * Maps each phase to the array of phases it can transition to.
 */
const SEED_BOOTSTRAP_TRANSITIONS = Object.freeze({
  NOT_STARTED: ['INFRASTRUCTURE'],
  INFRASTRUCTURE: ['MESSAGE_GROUPS'],
  MESSAGE_GROUPS: ['PARTITIONS'],
  PARTITIONS: ['REGISTRATION'],
  REGISTRATION: ['CACHE_HYDRATION'],
  CACHE_HYDRATION: ['COMPLETE'],
  COMPLETE: [],
});

/**
 * Bootstrap phase names for seed node bootstrap.
 */
const BOOTSTRAP_PHASE = Object.freeze({
  NOT_STARTED: 'NOT_STARTED',
  INFRASTRUCTURE: 'INFRASTRUCTURE',
  MESSAGE_GROUPS: 'MESSAGE_GROUPS',
  PARTITIONS: 'PARTITIONS',
  REGISTRATION: 'REGISTRATION',
  CACHE_HYDRATION: 'CACHE_HYDRATION',
  COMPLETE: 'COMPLETE',
});

/**
 * Event names emitted by the phase state machine.
 */
const PHASE_STATE_MACHINE_EVENT = Object.freeze({
  PHASE_TRANSITION: 'phaseTransition',
  PHASE_STARTED: 'phaseStarted',
  PHASE_COMPLETED: 'phaseCompleted',
});

/**
 * Bootstrap phase state machine.
 * Enforces valid phase transitions and tracks timing.
 *
 * @extends EventEmitter
 */
class BootstrapPhaseStateMachine extends EventEmitter {
  /**
   * Create state machine with initial phase.
   * @param {Object} options - Configuration options.
   * @param {string} [options.initialPhase='NOT_STARTED'] - Starting phase.
   * @param {Object} [options.transitions] - Valid transitions map.
   *   Defaults to SEED_BOOTSTRAP_TRANSITIONS.
   */
  constructor({initialPhase = BOOTSTRAP_PHASE.NOT_STARTED, transitions} = {}) {
    super();
    this._transitions = transitions || SEED_BOOTSTRAP_TRANSITIONS;
    this._currentPhase = initialPhase;
    this._phaseDurations = new Map();
    this._phaseStartTimes = new Map();

    // Record start time for initial phase
    this._phaseStartTimes.set(this._currentPhase, Date.now());
  }

  /**
   * Transition to a new phase.
   * @param {string} targetPhase - Phase to transition to.
   * @throws {PhaseTransitionError} If transition is invalid.
   */
  transition(targetPhase) {
    const currentPhase = this._currentPhase;
    const validTransitions = this._transitions[currentPhase] || [];

    if (!validTransitions.includes(targetPhase)) {
      throw new PhaseTransitionError(currentPhase, targetPhase, validTransitions);
    }

    // Record duration for the phase we're leaving
    const startTime = this._phaseStartTimes.get(currentPhase);
    if (startTime !== undefined) {
      const duration = Date.now() - startTime;
      this._phaseDurations.set(currentPhase, duration);
    }

    // Update current phase
    this._currentPhase = targetPhase;

    // Record start time for new phase
    this._phaseStartTimes.set(targetPhase, Date.now());

    // Emit events
    this.emit(PHASE_STATE_MACHINE_EVENT.PHASE_COMPLETED, {
      phase: currentPhase,
      duration: this._phaseDurations.get(currentPhase),
    });

    this.emit(PHASE_STATE_MACHINE_EVENT.PHASE_STARTED, {
      phase: targetPhase,
      previousPhase: currentPhase,
    });

    this.emit(PHASE_STATE_MACHINE_EVENT.PHASE_TRANSITION, {
      fromPhase: currentPhase,
      toPhase: targetPhase,
      duration: this._phaseDurations.get(currentPhase),
    });
  }

  /**
   * Get current phase.
   * @return {string} Current phase.
   */
  getCurrentPhase() {
    return this._currentPhase;
  }

  /**
   * Get valid next phases from current state.
   * @return {Array<string>} Valid target phases.
   */
  getValidTransitions() {
    return this._transitions[this._currentPhase] || [];
  }

  /**
   * Get duration of a completed phase.
   * @param {string} phase - Phase name.
   * @return {number|null} Duration in ms or null if not completed.
   */
  getPhaseDuration(phase) {
    const duration = this._phaseDurations.get(phase);
    return duration !== undefined ? duration : null;
  }

  /**
   * Get all completed phase durations.
   * @return {Object} Map of phase names to durations in ms.
   */
  getAllPhaseDurations() {
    const durations = {};
    for (const [phase, duration] of this._phaseDurations) {
      durations[phase] = duration;
    }
    return durations;
  }

  /**
   * Check if the state machine has reached the complete phase.
   * @return {boolean} True if in COMPLETE phase.
   */
  isComplete() {
    return this._currentPhase === BOOTSTRAP_PHASE.COMPLETE;
  }
}

export {
  BOOTSTRAP_PHASE,
  BootstrapPhaseStateMachine,
  PHASE_STATE_MACHINE_EVENT,
  SEED_BOOTSTRAP_TRANSITIONS,
};

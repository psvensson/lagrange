/**
 * PhaseStateMachine - Generic state machine for phase-based operations.
 *
 * Provides a reusable pattern for multi-step operations with:
 * - Configurable state transitions
 * - Transition validation
 * - Event emission on state changes
 * - Timing tracking for observability
 *
 * Requirements: 4.5
 *
 * @module utils/phase-state-machine
 */

import {EventEmitter} from 'events';

const LOCAL_STR_PVWQ9 = 'InvalidTransitionError';
const LOCAL_NUM_ZERO = 0;

/**
 * Event names emitted by the phase state machine.
 * @type {Object}
 */
const STATE_MACHINE_EVENT = Object.freeze({
  TRANSITION: 'transition',
  STATE_ENTERED: 'stateEntered',
  STATE_EXITED: 'stateExited',
});

/**
 * Error messages for PhaseStateMachine.
 * @type {Object}
 */
const STATE_MACHINE_ERROR = Object.freeze({
  TRANSITIONS_REQUIRED: 'transitions map is required',
  INITIAL_STATE_REQUIRED: 'initialState is required',
  invalidTransition: (currentState, targetState, validStates) =>
    `Cannot transition from ${currentState} to ${targetState}. ` +
    `Valid transitions: ${validStates.length > 0 ? validStates.join(', ') : 'none'}`,
  unknownState: (state) => `Unknown state: ${state}`,
});

/**
 * Error thrown when an invalid state transition is attempted.
 * @extends Error
 */
class InvalidTransitionError extends Error {
  /**
   * Create an InvalidTransitionError.
   * @param {string} currentState - Current state name.
   * @param {string} targetState - Target state that was attempted.
   * @param {Array<string>} validTransitions - Array of valid target states.
   */
  constructor(currentState, targetState, validTransitions) {
    super(STATE_MACHINE_ERROR.invalidTransition(
      currentState,
      targetState,
      validTransitions,
    ));
    this.name = LOCAL_STR_PVWQ9;
    this.currentState = currentState;
    this.targetState = targetState;
    this.validTransitions = validTransitions;
  }
}

/**
 * Generic phase state machine.
 * Enforces valid state transitions and tracks timing.
 *
 * @extends EventEmitter
 * @fires PhaseStateMachine#transition - When a state transition occurs
 * @fires PhaseStateMachine#stateEntered - When entering a new state
 * @fires PhaseStateMachine#stateExited - When exiting a state
 */
class PhaseStateMachine extends EventEmitter {
  /**
   * Create a new PhaseStateMachine.
   *
   * @param {Object} options - Configuration options.
   * @param {Object} options.transitions - Map of state to valid target states.
   *   Each key is a state name, value is array of valid target states.
   * @param {string} options.initialState - Starting state.
   * @throws {Error} If transitions or initialState is not provided.
   *
   * @example
   * const machine = new PhaseStateMachine({
   *   transitions: {
   *     IDLE: ['RUNNING'],
   *     RUNNING: ['PAUSED', 'COMPLETE'],
   *     PAUSED: ['RUNNING', 'COMPLETE'],
   *     COMPLETE: [],
   *   },
   *   initialState: 'IDLE',
   * });
   */
  constructor({transitions, initialState}) {
    super();

    if (!transitions) {
      throw new Error(STATE_MACHINE_ERROR.TRANSITIONS_REQUIRED);
    }
    if (!initialState) {
      throw new Error(STATE_MACHINE_ERROR.INITIAL_STATE_REQUIRED);
    }

    this._transitions = transitions;
    this._currentState = initialState;
    this._stateDurations = new Map();
    this._stateStartTimes = new Map();

    // Record start time for initial state
    this._stateStartTimes.set(this._currentState, Date.now());
  }

  /**
   * Transition to a new state.
   *
   * @param {string} targetState - State to transition to.
   * @throws {InvalidTransitionError} If transition is invalid.
   * @return {void}
   */
  transition(targetState) {
    const currentState = this._currentState;
    const validTransitions = this._transitions[currentState] || [];

    if (!validTransitions.includes(targetState)) {
      throw new InvalidTransitionError(currentState, targetState, validTransitions);
    }

    // Record duration for the state we're leaving
    const startTime = this._stateStartTimes.get(currentState);
    if (startTime !== undefined) {
      const duration = Date.now() - startTime;
      this._stateDurations.set(currentState, duration);
    }

    // Update current state
    this._currentState = targetState;

    // Record start time for new state
    this._stateStartTimes.set(targetState, Date.now());

    // Emit events
    this.emit(STATE_MACHINE_EVENT.STATE_EXITED, {
      state: currentState,
      duration: this._stateDurations.get(currentState),
    });

    this.emit(STATE_MACHINE_EVENT.STATE_ENTERED, {
      state: targetState,
      previousState: currentState,
    });

    this.emit(STATE_MACHINE_EVENT.TRANSITION, {
      fromState: currentState,
      toState: targetState,
      duration: this._stateDurations.get(currentState),
    });
  }

  /**
   * Check if a transition to the target state is valid.
   *
   * @param {string} targetState - State to check.
   * @return {boolean} True if transition is valid.
   */
  canTransition(targetState) {
    const validTransitions = this._transitions[this._currentState] || [];
    return validTransitions.includes(targetState);
  }

  /**
   * Get current state.
   *
   * @return {string} Current state.
   */
  getCurrentState() {
    return this._currentState;
  }

  /**
   * Get valid next states from current state.
   *
   * @return {Array<string>} Valid target states.
   */
  getValidTransitions() {
    return this._transitions[this._currentState] || [];
  }

  /**
   * Get duration of a completed state.
   *
   * @param {string} state - State name.
   * @return {number|null} Duration in ms or null if not completed.
   */
  getStateDuration(state) {
    const duration = this._stateDurations.get(state);
    return duration !== undefined ? duration : null;
  }

  /**
   * Get all completed state durations.
   *
   * @return {Object} Map of state names to durations in ms.
   */
  getAllStateDurations() {
    const durations = {};
    for (const [state, duration] of this._stateDurations) {
      durations[state] = duration;
    }
    return durations;
  }

  /**
   * Check if the state machine is in a terminal state (no valid transitions).
   *
   * @return {boolean} True if in terminal state.
   */
  isTerminal() {
    const validTransitions = this._transitions[this._currentState] || [];
    return validTransitions.length === LOCAL_NUM_ZERO;
  }

  /**
   * Get all defined states in the state machine.
   *
   * @return {Array<string>} Array of all state names.
   */
  getAllStates() {
    return Object.keys(this._transitions);
  }
}

export {
  InvalidTransitionError,
  PhaseStateMachine,
  STATE_MACHINE_ERROR,
  STATE_MACHINE_EVENT,
};

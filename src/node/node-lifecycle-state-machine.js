/**
 * Node Lifecycle State Machine - Manages explicit node lifecycle states.
 * Provides a formal state machine with enforced transitions for node lifecycle.
 * Requirements: 2.1, 2.2, 2.3, 2.4
 */

import {EventEmitter} from 'events';
import {LoggingService} from '../logging/logging-service.js';
import {NODE_STATE, STRING} from '../constants/index.js';
import {
  BOOTSTRAP_SUB_PHASE,
  JOINING_SUB_PHASE,
  NODE_LIFECYCLE_SUBSYSTEM,
  NODE_LIFECYCLE_EVENT,
  NODE_LIFECYCLE_LOG_MSG,
  NODE_LIFECYCLE_ERROR_NAME,
  NODE_LIFECYCLE_ERROR_MSG,
} from './node-constants.js';

/**
 * Valid state transitions map.
 * Key: current state
 * Value: array of valid next states
 */
const NodeState = NODE_STATE;

const VALID_TRANSITIONS = {
  [NodeState.STARTING]: [NodeState.CONNECTING, NodeState.STOPPED],
  [NodeState.CONNECTING]: [NodeState.DISCOVERING, NodeState.STOPPED],
  [NodeState.DISCOVERING]: [NodeState.JOINING, NodeState.STOPPED],
  [NodeState.JOINING]: [NodeState.SYNCING, NodeState.READY, NodeState.STOPPED],
  [NodeState.SYNCING]: [NodeState.READY, NodeState.STOPPED],
  [NodeState.READY]: [NodeState.DRAINING],
  [NodeState.DRAINING]: [NodeState.STOPPED],
  [NodeState.STOPPED]: [],
};

const VALID_SUB_PHASES = Object.freeze({
  [NodeState.STARTING]: Object.freeze([
    BOOTSTRAP_SUB_PHASE.INFRASTRUCTURE,
    BOOTSTRAP_SUB_PHASE.MESSAGE_GROUPS,
    BOOTSTRAP_SUB_PHASE.PARTITIONS,
    BOOTSTRAP_SUB_PHASE.REGISTRATION,
    BOOTSTRAP_SUB_PHASE.CACHE_HYDRATION,
  ]),
  [NodeState.JOINING]: Object.freeze([
    JOINING_SUB_PHASE.CONTACTING_SEED,
    JOINING_SUB_PHASE.CONNECTING_WEBSOCKET,
    JOINING_SUB_PHASE.CREATING_MESSAGE_GROUP,
    JOINING_SUB_PHASE.JOINING_MESSAGE_GROUP,
    JOINING_SUB_PHASE.WAITING_LEADERSHIP,
    JOINING_SUB_PHASE.QUERYING_STATE,
  ]),
});

const VALID_SUB_PHASE_TRANSITIONS = Object.freeze({
  null: Object.freeze([
    BOOTSTRAP_SUB_PHASE.INFRASTRUCTURE,
    JOINING_SUB_PHASE.CONTACTING_SEED,
  ]),
  [BOOTSTRAP_SUB_PHASE.INFRASTRUCTURE]: Object.freeze([
    BOOTSTRAP_SUB_PHASE.MESSAGE_GROUPS,
  ]),
  [BOOTSTRAP_SUB_PHASE.MESSAGE_GROUPS]: Object.freeze([
    BOOTSTRAP_SUB_PHASE.PARTITIONS,
  ]),
  [BOOTSTRAP_SUB_PHASE.PARTITIONS]: Object.freeze([
    BOOTSTRAP_SUB_PHASE.REGISTRATION,
  ]),
  [BOOTSTRAP_SUB_PHASE.REGISTRATION]: Object.freeze([
    BOOTSTRAP_SUB_PHASE.CACHE_HYDRATION,
  ]),
  [BOOTSTRAP_SUB_PHASE.CACHE_HYDRATION]: Object.freeze([]),
  [JOINING_SUB_PHASE.CONTACTING_SEED]: Object.freeze([
    JOINING_SUB_PHASE.CONNECTING_WEBSOCKET,
  ]),
  [JOINING_SUB_PHASE.CONNECTING_WEBSOCKET]: Object.freeze([
    JOINING_SUB_PHASE.CREATING_MESSAGE_GROUP,
    JOINING_SUB_PHASE.JOINING_MESSAGE_GROUP,
  ]),
  [JOINING_SUB_PHASE.CREATING_MESSAGE_GROUP]: Object.freeze([
    JOINING_SUB_PHASE.WAITING_LEADERSHIP,
  ]),
  [JOINING_SUB_PHASE.JOINING_MESSAGE_GROUP]: Object.freeze([
    JOINING_SUB_PHASE.WAITING_LEADERSHIP,
  ]),
  [JOINING_SUB_PHASE.WAITING_LEADERSHIP]: Object.freeze([
    JOINING_SUB_PHASE.QUERYING_STATE,
  ]),
  [JOINING_SUB_PHASE.QUERYING_STATE]: Object.freeze([]),
});

const TERMINAL_SUB_PHASE_ADVANCE = Object.freeze({
  [BOOTSTRAP_SUB_PHASE.CACHE_HYDRATION]: NodeState.CONNECTING,
  [JOINING_SUB_PHASE.QUERYING_STATE]: NodeState.READY,
});

/**
 * Error thrown when an invalid state transition is attempted.
 */
class InvalidTransitionError extends Error {
  /**
   * Create an InvalidTransitionError.
   * @param {string} currentState - The current state.
   * @param {string} attemptedState - The attempted target state.
  * @param {string[]} validTransitions - Valid transitions from current state.
  */
  constructor(currentState, attemptedState, validTransitions) {
    super(
      NODE_LIFECYCLE_ERROR_MSG.invalidTransition(
        currentState,
        attemptedState,
        validTransitions,
      ),
    );
    this.name = NODE_LIFECYCLE_ERROR_NAME.INVALID_TRANSITION;
    this.currentState = currentState;
    this.attemptedState = attemptedState;
    this.validTransitions = validTransitions;
  }
}

/**
 * NodeLifecycleStateMachine - Manages explicit node lifecycle states.
 * Enforces valid transitions and emits events for all state changes.
 */
class NodeLifecycleStateMachine extends EventEmitter {
  /**
   * Create a new NodeLifecycleStateMachine.
   * @param {Object} options - Configuration options.
   * @param {string} [options.nodeId] - Node ID for logging context.
   * @param {string} [options.initialState] - Initial state (defaults to STARTING).
   */
  constructor(options = {}) {
    super();

    this.nodeId = options.nodeId || STRING.UNKNOWN;

    // Initialize state to STARTING by default
    this.state = options.initialState || NodeState.STARTING;
    this.subPhase = null;

    // Sub-phase duration tracking
    this._subPhaseDurations = new Map();
    this._subPhaseStartTimes = new Map();

    // Set up subsystem logger
    const loggingService = LoggingService.getInstance();
    this.logger = loggingService.isInitialized() ?
      loggingService.forSubsystem(NODE_LIFECYCLE_SUBSYSTEM) : console;
  }

  /**
   * Get current state.
   * @return {string} The current node state.
   */
  getState() {
    return this.state;
  }

  /**
   * Get current sub-phase.
   * @return {string|null} Current sub-phase.
   */
  getSubPhase() {
    return this.subPhase;
  }

  /**
   * Get duration of a completed sub-phase.
   * @param {string} subPhase - Sub-phase name.
   * @return {number|null} Duration in ms or null if not completed.
   */
  getSubPhaseDuration(subPhase) {
    const duration = this._subPhaseDurations.get(subPhase);
    return duration !== undefined ? duration : null;
  }

  /**
   * Get all completed sub-phase durations.
   * @return {Object} Map of sub-phase names to durations in ms.
   */
  getAllSubPhaseDurations() {
    const durations = {};
    for (const [subPhase, duration] of this._subPhaseDurations) {
      durations[subPhase] = duration;
    }
    return durations;
  }

  /**
   * Check if a transition is valid.
   * @param {string} fromState - Current state.
   * @param {string} toState - Target state.
   * @return {boolean} True if transition is valid.
   */
  isValidTransition(fromState, toState) {
    const validNextStates = VALID_TRANSITIONS[fromState];

    // If fromState is not in the map, it's invalid
    if (validNextStates === undefined) {
      return false;
    }

    return validNextStates.includes(toState);
  }

  /**
   * Attempt to transition to a new state.
   * @param {string} newState - Target state.
   * @return {boolean} True if transition succeeded.
   * @emits 'stateChange' with {from, to, timestamp}
   */
  transition(newState) {
    const currentState = this.state;

    // Validate transition
    if (!this.isValidTransition(currentState, newState)) {
      const validTransitions = VALID_TRANSITIONS[currentState] || [];

      this.logger.error(NODE_LIFECYCLE_LOG_MSG.INVALID_TRANSITION_ATTEMPT, {
        nodeId: this.nodeId,
        currentState,
        attemptedState: newState,
        validTransitions,
      });

      return false;
    }

    const timestamp = Date.now();
    const previousState = currentState;

    // Update state
    this.state = newState;
    this.subPhase = null;

    this.logger.info(NODE_LIFECYCLE_LOG_MSG.STATE_TRANSITION, {
      nodeId: this.nodeId,
      from: previousState,
      to: newState,
      timestamp,
    });

    // Emit state change event
    this.emit(NODE_LIFECYCLE_EVENT.STATE_CHANGE, {
      from: previousState,
      to: newState,
      timestamp,
    });

    return true;
  }

  /**
   * Transition the lifecycle sub-phase for STARTING/JOINING states.
   * Terminal sub-phases auto-advance the parent state.
   * @param {string} newSubPhase - Target sub-phase.
   * @return {boolean} True when transition succeeded.
   */
  transitionSubPhase(newSubPhase) {
    const parentState = this.state;
    const validSubPhases = VALID_SUB_PHASES[parentState];

    if (!validSubPhases || !validSubPhases.includes(newSubPhase)) {
      return false;
    }

    const fromSubPhase = this.subPhase;
    const fromKey = fromSubPhase === null ? 'null' : fromSubPhase;
    const validNextSubPhases = VALID_SUB_PHASE_TRANSITIONS[fromKey] || [];
    if (!validNextSubPhases.includes(newSubPhase)) {
      return false;
    }

    // Record duration for the sub-phase we're leaving
    if (fromSubPhase !== null) {
      const startTime = this._subPhaseStartTimes.get(fromSubPhase);
      if (startTime !== undefined) {
        this._subPhaseDurations.set(
          fromSubPhase, Date.now() - startTime,
        );
      }
    }

    this.subPhase = newSubPhase;

    // Record start time for the new sub-phase
    this._subPhaseStartTimes.set(newSubPhase, Date.now());

    this.emit(NODE_LIFECYCLE_EVENT.SUB_PHASE_CHANGE, {
      parentState,
      from: fromSubPhase,
      to: newSubPhase,
      timestamp: Date.now(),
    });

    const nextState = TERMINAL_SUB_PHASE_ADVANCE[newSubPhase];
    if (!nextState) {
      return true;
    }

    // Record duration for the terminal sub-phase before advancing
    const terminalStart = this._subPhaseStartTimes.get(newSubPhase);
    if (terminalStart !== undefined) {
      this._subPhaseDurations.set(
        newSubPhase, Date.now() - terminalStart,
      );
    }

    if (this.isValidTransition(parentState, nextState)) {
      return this.transition(nextState);
    }

    return this.forceTransition(nextState, parentState);
  }

  /**
   * Force a parent-state transition for terminal sub-phase auto-advance paths.
   * @param {string} nextState - Target parent state.
   * @param {string} fromState - Previous parent state.
   * @return {boolean} Always true.
   * @private
   */
  forceTransition(nextState, fromState) {
    this.state = nextState;
    this.subPhase = null;
    const timestamp = Date.now();

    this.logger.info(NODE_LIFECYCLE_LOG_MSG.STATE_TRANSITION, {
      nodeId: this.nodeId,
      from: fromState,
      to: nextState,
      timestamp,
    });

    this.emit(NODE_LIFECYCLE_EVENT.STATE_CHANGE, {
      from: fromState,
      to: nextState,
      timestamp,
    });

    return true;
  }

  /**
   * Check if node is in a state that accepts traffic.
   * @return {boolean} True if node is in READY state.
   */
  isReady() {
    return this.state === NodeState.READY;
  }

  /**
   * Check if node is shutting down.
   * @return {boolean} True if node is in DRAINING state.
   */
  isDraining() {
    return this.state === NodeState.DRAINING;
  }

  /**
   * Check if node is in the joining phase.
   * @return {boolean} True if node is in JOINING state.
   */
  isJoining() {
    return this.state === NodeState.JOINING;
  }

  /**
   * Get valid transitions from the current state.
   * @return {string[]} Array of valid next states.
   */
  getValidTransitions() {
    return VALID_TRANSITIONS[this.state] || [];
  }

  /**
   * Check if the node is in a terminal state (STOPPED).
   * @return {boolean} True if node is stopped.
   */
  isStopped() {
    return this.state === NodeState.STOPPED;
  }

  /**
   * Check if the node is in a transitional state (not READY or STOPPED).
   * @return {boolean} True if node is in a transitional state.
   */
  isTransitional() {
    return this.state !== NodeState.READY &&
           this.state !== NodeState.STOPPED;
  }
}

export {
  VALID_SUB_PHASES,
  VALID_SUB_PHASE_TRANSITIONS,
  TERMINAL_SUB_PHASE_ADVANCE,
  NodeLifecycleStateMachine,
  NodeState,
  VALID_TRANSITIONS,
  InvalidTransitionError,
};

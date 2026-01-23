/**
 * Node Lifecycle State Machine - Manages explicit node lifecycle states.
 * Provides a formal state machine with enforced transitions for node lifecycle.
 * Requirements: 2.1, 2.2, 2.3, 2.4
 */

import {EventEmitter} from 'events';
import {LoggingService} from '../logging/logging-service.js';

/**
 * Node state enumeration.
 * These are the only valid states a node can be in.
 * @enum {string}
 */
const NodeState = {
  // Process started, initializing local resources
  STARTING: 'starting',
  // Establishing WebSocket to seed nodes
  CONNECTING: 'connecting',
  // Receiving system cache from seed
  DISCOVERING: 'discovering',
  // Registered in cluster, proposing epoch, creating replicas
  JOINING: 'joining',
  // Syncing replica data from existing nodes
  SYNCING: 'syncing',
  // Accepting traffic, participating in Raft
  READY: 'ready',
  // Rejecting new requests, completing in-flight
  DRAINING: 'draining',
  // Fully stopped
  STOPPED: 'stopped',
};

/**
 * Valid state transitions map.
 * Key: current state
 * Value: array of valid next states
 */
const VALID_TRANSITIONS = {
  [NodeState.STARTING]: [NodeState.CONNECTING],
  [NodeState.CONNECTING]: [NodeState.DISCOVERING, NodeState.STOPPED],
  [NodeState.DISCOVERING]: [NodeState.JOINING, NodeState.STOPPED],
  [NodeState.JOINING]: [NodeState.SYNCING, NodeState.STOPPED],
  [NodeState.SYNCING]: [NodeState.READY, NodeState.STOPPED],
  [NodeState.READY]: [NodeState.DRAINING],
  [NodeState.DRAINING]: [NodeState.STOPPED],
  [NodeState.STOPPED]: [],
};

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
    const validStr = validTransitions.length > 0 ?
      validTransitions.join(', ') : 'none';
    super(
      `Invalid state transition from '${currentState}' to '${attemptedState}'. ` +
      `Valid transitions from '${currentState}': ${validStr}`,
    );
    this.name = 'InvalidTransitionError';
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

    this.nodeId = options.nodeId || 'unknown';

    // Initialize state to STARTING by default
    this.state = options.initialState || NodeState.STARTING;

    // Set up subsystem logger
    const loggingService = LoggingService.getInstance();
    this.logger = loggingService.isInitialized() ?
      loggingService.forSubsystem('node-lifecycle-state-machine') : console;
  }

  /**
   * Get current state.
   * @return {string} The current node state.
   */
  getState() {
    return this.state;
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

      this.logger.error('Invalid state transition attempted', {
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

    this.logger.info('Node state transition', {
      nodeId: this.nodeId,
      from: previousState,
      to: newState,
      timestamp,
    });

    // Emit state change event
    this.emit('stateChange', {
      from: previousState,
      to: newState,
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
  NodeLifecycleStateMachine,
  NodeState,
  VALID_TRANSITIONS,
  InvalidTransitionError,
};

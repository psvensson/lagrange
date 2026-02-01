/**
 * Service lifecycle constants for standardized service state management.
 * All services implementing the ServiceLifecycle interface use these states.
 *
 * @module bootstrap/service-lifecycle-constants
 */

/**
 * Standard service lifecycle states.
 * Services transition through these states in order:
 * CREATED → INITIALIZED → RUNNING → STOPPED
 */
const SERVICE_STATE = Object.freeze({
  CREATED: 'created',
  INITIALIZED: 'initialized',
  RUNNING: 'running',
  STOPPED: 'stopped',
});

/**
 * Valid lifecycle state transitions.
 * Maps each state to the array of states it can transition to.
 *
 * Transitions:
 * - CREATED → INITIALIZED (via initialize())
 * - INITIALIZED → RUNNING (via start())
 * - RUNNING → STOPPED (via stop())
 */
const SERVICE_LIFECYCLE_TRANSITIONS = Object.freeze({
  [SERVICE_STATE.CREATED]: [SERVICE_STATE.INITIALIZED],
  [SERVICE_STATE.INITIALIZED]: [SERVICE_STATE.RUNNING],
  [SERVICE_STATE.RUNNING]: [SERVICE_STATE.STOPPED],
  [SERVICE_STATE.STOPPED]: [],
});

/**
 * Lifecycle method names that trigger state transitions.
 */
const SERVICE_LIFECYCLE_METHOD = Object.freeze({
  INITIALIZE: 'initialize',
  START: 'start',
  STOP: 'stop',
});

/**
 * Maps lifecycle methods to their target states.
 */
const SERVICE_LIFECYCLE_METHOD_TARGET = Object.freeze({
  [SERVICE_LIFECYCLE_METHOD.INITIALIZE]: SERVICE_STATE.INITIALIZED,
  [SERVICE_LIFECYCLE_METHOD.START]: SERVICE_STATE.RUNNING,
  [SERVICE_LIFECYCLE_METHOD.STOP]: SERVICE_STATE.STOPPED,
});

/**
 * Maps lifecycle methods to their required source states.
 */
const SERVICE_LIFECYCLE_METHOD_SOURCE = Object.freeze({
  [SERVICE_LIFECYCLE_METHOD.INITIALIZE]: SERVICE_STATE.CREATED,
  [SERVICE_LIFECYCLE_METHOD.START]: SERVICE_STATE.INITIALIZED,
  [SERVICE_LIFECYCLE_METHOD.STOP]: SERVICE_STATE.RUNNING,
});

/**
 * Service lifecycle event names.
 */
const SERVICE_LIFECYCLE_EVENT = Object.freeze({
  STATE_CHANGED: 'stateChanged',
  INITIALIZED: 'initialized',
  STARTED: 'started',
  STOPPED: 'stopped',
  ERROR: 'error',
});

/**
 * Service lifecycle log messages.
 */
const SERVICE_LIFECYCLE_LOG_MSG = Object.freeze({
  STATE_TRANSITION: 'Service state transition',
  INVALID_TRANSITION: 'Invalid service state transition attempted',
  STOP_NOT_RUNNING: 'Stop called on service not in running state',
  START_NOT_INITIALIZED: 'Start called on service not in initialized state',
  INITIALIZE_NOT_CREATED: 'Initialize called on service not in created state',
});

/**
 * Service lifecycle error messages.
 */
const SERVICE_LIFECYCLE_ERROR_MSG = Object.freeze({
  invalidTransition: (serviceName, currentState, method) =>
    `${serviceName} cannot ${method}() from ${currentState} state`,
  startNotInitialized: (serviceName, currentState) =>
    `${serviceName} cannot start() from ${currentState} state - must be initialized first`,
  initializeNotCreated: (serviceName, currentState) =>
    `${serviceName} cannot initialize() from ${currentState} state - already initialized`,
});

/**
 * Subsystem identifier for logging.
 */
const SERVICE_LIFECYCLE_SUBSYSTEM = 'service-lifecycle';

export {
  SERVICE_LIFECYCLE_ERROR_MSG,
  SERVICE_LIFECYCLE_EVENT,
  SERVICE_LIFECYCLE_LOG_MSG,
  SERVICE_LIFECYCLE_METHOD,
  SERVICE_LIFECYCLE_METHOD_SOURCE,
  SERVICE_LIFECYCLE_METHOD_TARGET,
  SERVICE_LIFECYCLE_SUBSYSTEM,
  SERVICE_LIFECYCLE_TRANSITIONS,
  SERVICE_STATE,
};

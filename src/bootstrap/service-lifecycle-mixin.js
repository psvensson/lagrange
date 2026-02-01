/**
 * Service lifecycle mixin for consistent lifecycle behavior across services.
 * Provides standard initialize(), start(), stop(), and getState() methods
 * with state transition validation.
 *
 * @module bootstrap/service-lifecycle-mixin
 */

import {LoggingService} from '../logging/logging-service.js';
import {
  SERVICE_LIFECYCLE_ERROR_MSG,
  SERVICE_LIFECYCLE_EVENT,
  SERVICE_LIFECYCLE_LOG_MSG,
  SERVICE_LIFECYCLE_METHOD,
  SERVICE_LIFECYCLE_METHOD_TARGET,
  SERVICE_LIFECYCLE_SUBSYSTEM,
  SERVICE_LIFECYCLE_TRANSITIONS,
  SERVICE_STATE,
} from './service-lifecycle-constants.js';

/**
 * Creates a service lifecycle mixin that can be applied to any class.
 * The mixin adds lifecycle state management with proper transition validation.
 *
 * Usage:
 * ```javascript
 * class MyService extends ServiceLifecycleMixin(EventEmitter) {
 *   constructor(options) {
 *     super();
 *     this.initializeLifecycle('MyService');
 *   }
 *
 *   async doInitialize() {
 *     // Custom initialization logic
 *   }
 *
 *   async doStart() {
 *     // Custom start logic
 *   }
 *
 *   async doStop() {
 *     // Custom stop logic
 *   }
 * }
 * ```
 *
 * @param {Function} Base - The base class to extend.
 * @return {Function} A class that extends Base with lifecycle methods.
 */
function ServiceLifecycleMixin(Base) {
  return class extends Base {
    /**
     * Initialize the lifecycle state management.
     * Must be called in the constructor of the implementing class.
     *
     * @param {string} serviceName - Name of the service for logging and errors.
     */
    initializeLifecycle(serviceName) {
      this._lifecycleState = SERVICE_STATE.CREATED;
      this._serviceName = serviceName;

      const loggingService = LoggingService.getInstance();
      this._lifecycleLogger = loggingService.isInitialized() ?
        loggingService.forSubsystem(SERVICE_LIFECYCLE_SUBSYSTEM) : console;
    }

    /**
     * Get the current lifecycle state.
     *
     * @return {string} Current state from SERVICE_STATE enum.
     */
    getState() {
      return this._lifecycleState;
    }

    /**
     * Validate and perform a state transition.
     *
     * @param {string} method - The lifecycle method being called.
     * @param {string} targetState - The target state to transition to.
     * @return {boolean} True if transition is valid.
     * @throws {Error} If transition is invalid and method is not 'stop'.
     * @private
     */
    _validateTransition(method, targetState) {
      const currentState = this._lifecycleState;
      const validTargets = SERVICE_LIFECYCLE_TRANSITIONS[currentState] || [];
      const isValid = validTargets.includes(targetState);

      if (!isValid) {
        const errorMsg = SERVICE_LIFECYCLE_ERROR_MSG.invalidTransition(
          this._serviceName,
          currentState,
          method,
        );

        // Requirement 4.10: stop() logs warning but doesn't throw
        if (method === SERVICE_LIFECYCLE_METHOD.STOP) {
          this._lifecycleLogger.warn(SERVICE_LIFECYCLE_LOG_MSG.STOP_NOT_RUNNING, {
            serviceName: this._serviceName,
            currentState: currentState,
            targetState: targetState,
          });
          return false;
        }

        // Requirement 4.9: start() throws if not in INITIALIZED state
        this._lifecycleLogger.error(SERVICE_LIFECYCLE_LOG_MSG.INVALID_TRANSITION, {
          serviceName: this._serviceName,
          currentState: currentState,
          targetState: targetState,
          method: method,
        });

        const error = new Error(errorMsg);
        error.name = 'LifecycleError';
        error.serviceName = this._serviceName;
        error.currentState = currentState;
        error.attemptedTransition = method;
        throw error;
      }

      return true;
    }

    /**
     * Perform the state transition and emit events.
     *
     * @param {string} targetState - The target state to transition to.
     * @param {string} eventName - The event to emit after transition.
     * @private
     */
    _performTransition(targetState, eventName) {
      const previousState = this._lifecycleState;
      this._lifecycleState = targetState;

      this._lifecycleLogger.info(SERVICE_LIFECYCLE_LOG_MSG.STATE_TRANSITION, {
        serviceName: this._serviceName,
        previousState: previousState,
        newState: targetState,
      });

      // Emit state changed event if the class has emit method (EventEmitter)
      if (typeof this.emit === 'function') {
        this.emit(SERVICE_LIFECYCLE_EVENT.STATE_CHANGED, {
          serviceName: this._serviceName,
          previousState: previousState,
          newState: targetState,
        });
        this.emit(eventName, {serviceName: this._serviceName});
      }
    }

    /**
     * Initialize the service. Transitions from CREATED to INITIALIZED.
     * Override doInitialize() to add custom initialization logic.
     *
     * @return {Promise<void>}
     * @throws {Error} If not in CREATED state (Requirement 4.6).
     */
    async initialize() {
      const method = SERVICE_LIFECYCLE_METHOD.INITIALIZE;
      const targetState = SERVICE_LIFECYCLE_METHOD_TARGET[method];

      this._validateTransition(method, targetState);

      // Call custom initialization if defined
      if (typeof this.doInitialize === 'function') {
        await this.doInitialize();
      }

      this._performTransition(targetState, SERVICE_LIFECYCLE_EVENT.INITIALIZED);
    }

    /**
     * Start the service. Transitions from INITIALIZED to RUNNING.
     * Override doStart() to add custom start logic.
     *
     * @return {Promise<void>}
     * @throws {Error} If not in INITIALIZED state (Requirement 4.9).
     */
    async start() {
      const method = SERVICE_LIFECYCLE_METHOD.START;
      const targetState = SERVICE_LIFECYCLE_METHOD_TARGET[method];

      this._validateTransition(method, targetState);

      // Call custom start if defined
      if (typeof this.doStart === 'function') {
        await this.doStart();
      }

      this._performTransition(targetState, SERVICE_LIFECYCLE_EVENT.STARTED);
    }

    /**
     * Stop the service. Transitions from RUNNING to STOPPED.
     * Override doStop() to add custom stop logic.
     *
     * @return {Promise<void>}
     * @note Does not throw if not in RUNNING state, only logs warning (Requirement 4.10).
     */
    async stop() {
      const method = SERVICE_LIFECYCLE_METHOD.STOP;
      const targetState = SERVICE_LIFECYCLE_METHOD_TARGET[method];

      const isValid = this._validateTransition(method, targetState);

      // Requirement 4.10: If not valid, we already logged warning, just return
      if (!isValid) {
        return;
      }

      // Call custom stop if defined
      if (typeof this.doStop === 'function') {
        await this.doStop();
      }

      this._performTransition(targetState, SERVICE_LIFECYCLE_EVENT.STOPPED);
    }
  };
}

export {ServiceLifecycleMixin};

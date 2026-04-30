/**
 * Bootstrap error types for consistent error handling across bootstrap phases.
 * These error types provide context-rich error messages for debugging and
 * error handling during the bootstrap process.
 *
 * @module bootstrap/bootstrap-errors
 */

import {BaseError} from '../utils/base-error.js';

const LOCAL_STR_128KJ = ', ';
const LOCAL_STR_19YX9 = 'BootstrapPartitionWriter has been disabled after registration phase';

/**
 * Error thrown when a required dependency is missing.
 * Used during service construction to validate required dependencies.
 *
 * @extends BaseError
 */
class DependencyError extends BaseError {
  /**
   * Create a DependencyError.
   * @param {string} serviceName - Name of the service requiring the dependency.
   * @param {string} dependencyName - Name of the missing dependency.
   * @param {Object} [options={}] - Optional error options.
   */
  constructor(serviceName, dependencyName, options = {}) {
    super(
      `${serviceName} requires ${dependencyName}`,
      {
        cause: options.cause,
        context: {
          serviceName,
          dependencyName,
          ...(options.context || {}),
        },
      },
    );
    this.serviceName = serviceName;
    this.dependencyName = dependencyName;
  }
}

/**
 * Error thrown when an invalid lifecycle transition is attempted.
 * Used by services implementing the ServiceLifecycle interface.
 *
 * @extends BaseError
 */
class LifecycleError extends BaseError {
  /**
   * Create a LifecycleError.
   * @param {string} serviceName - Name of the service.
   * @param {string} currentState - Current lifecycle state.
   * @param {string} attemptedTransition - The transition method that was called.
   */
  constructor(serviceName, currentState, attemptedTransition, options = {}) {
    super(
      `${serviceName} cannot ${attemptedTransition} from ${currentState} state`,
      {
        cause: options.cause,
        context: {
          serviceName,
          currentState,
          attemptedTransition,
          ...(options.context || {}),
        },
      },
    );
    this.serviceName = serviceName;
    this.currentState = currentState;
    this.attemptedTransition = attemptedTransition;
  }
}

/**
 * Error thrown when an invalid phase transition is attempted.
 * Used by phase state machines to enforce valid phase sequences.
 *
 * @extends BaseError
 */
class PhaseTransitionError extends BaseError {
  /**
   * Create a PhaseTransitionError.
   * @param {string} currentPhase - Current phase name.
   * @param {string} targetPhase - Target phase that was attempted.
   * @param {Array<string>} validTransitions - Array of valid target phases.
   */
  constructor(currentPhase, targetPhase, validTransitions, options = {}) {
    super(
      `Cannot transition from ${currentPhase} to ${targetPhase}. ` +
      `Valid: ${validTransitions.join(LOCAL_STR_128KJ)}`,
      {
        cause: options.cause,
        context: {
          currentPhase,
          targetPhase,
          validTransitions,
          ...(options.context || {}),
        },
      },
    );
    this.currentPhase = currentPhase;
    this.targetPhase = targetPhase;
    this.validTransitions = validTransitions;
  }
}

/**
 * Error thrown when a phase times out.
 * Used to indicate that a bootstrap phase exceeded its allowed time.
 *
 * @extends BaseError
 */
class PhaseTimeoutError extends BaseError {
  /**
   * Create a PhaseTimeoutError.
   * @param {string} phaseName - Name of the phase that timed out.
   * @param {number} timeoutMs - Timeout duration in milliseconds.
   * @param {Object} context - Additional context about the timeout.
   */
  constructor(phaseName, timeoutMs, context, options = {}) {
    super(
      `Phase ${phaseName} timed out after ${timeoutMs}ms`,
      {
        cause: options.cause,
        context: {
          phaseName,
          timeoutMs,
          timeoutContext: context,
          ...(options.context || {}),
        },
      },
    );
    this.phaseName = phaseName;
    this.timeoutMs = timeoutMs;
    this.timeoutContext = context;
  }
}

/**
 * Error thrown when BootstrapPartitionWriter is used after being disabled.
 * The writer is disabled after the registration phase completes to prevent
 * accidental direct partition writes after cache hydration.
 *
 * @extends BaseError
 */
class WriterDisabledError extends BaseError {
  /**
   * Create a WriterDisabledError.
   */
  constructor() {
    super(LOCAL_STR_19YX9);
  }
}

export {
  DependencyError,
  LifecycleError,
  PhaseTimeoutError,
  PhaseTransitionError,
  WriterDisabledError,
};

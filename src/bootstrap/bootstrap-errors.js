/**
 * Bootstrap error types for consistent error handling across bootstrap phases.
 * These error types provide context-rich error messages for debugging and
 * error handling during the bootstrap process.
 *
 * @module bootstrap/bootstrap-errors
 */

/**
 * Error thrown when a required dependency is missing.
 * Used during service construction to validate required dependencies.
 *
 * @extends Error
 */
class DependencyError extends Error {
  /**
   * Create a DependencyError.
   * @param {string} serviceName - Name of the service requiring the dependency.
   * @param {string} dependencyName - Name of the missing dependency.
   */
  constructor(serviceName, dependencyName) {
    super(`${serviceName} requires ${dependencyName}`);
    this.name = 'DependencyError';
    this.serviceName = serviceName;
    this.dependencyName = dependencyName;
  }
}

/**
 * Error thrown when an invalid lifecycle transition is attempted.
 * Used by services implementing the ServiceLifecycle interface.
 *
 * @extends Error
 */
class LifecycleError extends Error {
  /**
   * Create a LifecycleError.
   * @param {string} serviceName - Name of the service.
   * @param {string} currentState - Current lifecycle state.
   * @param {string} attemptedTransition - The transition method that was called.
   */
  constructor(serviceName, currentState, attemptedTransition) {
    super(`${serviceName} cannot ${attemptedTransition} from ${currentState} state`);
    this.name = 'LifecycleError';
    this.serviceName = serviceName;
    this.currentState = currentState;
    this.attemptedTransition = attemptedTransition;
  }
}

/**
 * Error thrown when an invalid phase transition is attempted.
 * Used by phase state machines to enforce valid phase sequences.
 *
 * @extends Error
 */
class PhaseTransitionError extends Error {
  /**
   * Create a PhaseTransitionError.
   * @param {string} currentPhase - Current phase name.
   * @param {string} targetPhase - Target phase that was attempted.
   * @param {Array<string>} validTransitions - Array of valid target phases.
   */
  constructor(currentPhase, targetPhase, validTransitions) {
    super(
      `Cannot transition from ${currentPhase} to ${targetPhase}. ` +
      `Valid: ${validTransitions.join(', ')}`,
    );
    this.name = 'PhaseTransitionError';
    this.currentPhase = currentPhase;
    this.targetPhase = targetPhase;
    this.validTransitions = validTransitions;
  }
}

/**
 * Error thrown when a phase times out.
 * Used to indicate that a bootstrap phase exceeded its allowed time.
 *
 * @extends Error
 */
class PhaseTimeoutError extends Error {
  /**
   * Create a PhaseTimeoutError.
   * @param {string} phaseName - Name of the phase that timed out.
   * @param {number} timeoutMs - Timeout duration in milliseconds.
   * @param {Object} context - Additional context about the timeout.
   */
  constructor(phaseName, timeoutMs, context) {
    super(`Phase ${phaseName} timed out after ${timeoutMs}ms`);
    this.name = 'PhaseTimeoutError';
    this.phaseName = phaseName;
    this.timeoutMs = timeoutMs;
    this.context = context;
  }
}

/**
 * Error thrown when BootstrapPartitionWriter is used after being disabled.
 * The writer is disabled after the registration phase completes to prevent
 * accidental direct partition writes after cache hydration.
 *
 * @extends Error
 */
class WriterDisabledError extends Error {
  /**
   * Create a WriterDisabledError.
   */
  constructor() {
    super('BootstrapPartitionWriter has been disabled after registration phase');
    this.name = 'WriterDisabledError';
  }
}

export {
  DependencyError,
  LifecycleError,
  PhaseTimeoutError,
  PhaseTransitionError,
  WriterDisabledError,
};

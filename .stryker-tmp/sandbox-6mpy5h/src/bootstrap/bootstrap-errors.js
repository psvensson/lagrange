/**
 * Bootstrap error types for consistent error handling across bootstrap phases.
 * These error types provide context-rich error messages for debugging and
 * error handling during the bootstrap process.
 *
 * @module bootstrap/bootstrap-errors
 */
// @ts-nocheck
function stryNS_9fa48() {
  var g = typeof globalThis === 'object' && globalThis && globalThis.Math === Math && globalThis || new Function("return this")();
  var ns = g.__stryker__ || (g.__stryker__ = {});
  if (ns.activeMutant === undefined && g.process && g.process.env && g.process.env.__STRYKER_ACTIVE_MUTANT__) {
    ns.activeMutant = g.process.env.__STRYKER_ACTIVE_MUTANT__;
  }
  function retrieveNS() {
    return ns;
  }
  stryNS_9fa48 = retrieveNS;
  return retrieveNS();
}
stryNS_9fa48();
function stryCov_9fa48() {
  var ns = stryNS_9fa48();
  var cov = ns.mutantCoverage || (ns.mutantCoverage = {
    static: {},
    perTest: {}
  });
  function cover() {
    var c = cov.static;
    if (ns.currentTestId) {
      c = cov.perTest[ns.currentTestId] = cov.perTest[ns.currentTestId] || {};
    }
    var a = arguments;
    for (var i = 0; i < a.length; i++) {
      c[a[i]] = (c[a[i]] || 0) + 1;
    }
  }
  stryCov_9fa48 = cover;
  cover.apply(null, arguments);
}
function stryMutAct_9fa48(id) {
  var ns = stryNS_9fa48();
  function isActive(id) {
    if (ns.activeMutant === id) {
      if (ns.hitCount !== void 0 && ++ns.hitCount > ns.hitLimit) {
        throw new Error('Stryker: Hit count limit reached (' + ns.hitCount + ')');
      }
      return true;
    }
    return false;
  }
  stryMutAct_9fa48 = isActive;
  return isActive(id);
}
import { BaseError } from '../utils/base-error.js';

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
    if (stryMutAct_9fa48("12290")) {
      {}
    } else {
      stryCov_9fa48("12290");
      super(stryMutAct_9fa48("12291") ? `` : (stryCov_9fa48("12291"), `${serviceName} requires ${dependencyName}`), stryMutAct_9fa48("12292") ? {} : (stryCov_9fa48("12292"), {
        cause: options.cause,
        context: stryMutAct_9fa48("12293") ? {} : (stryCov_9fa48("12293"), {
          serviceName,
          dependencyName,
          ...(stryMutAct_9fa48("12296") ? options.context && {} : stryMutAct_9fa48("12295") ? false : stryMutAct_9fa48("12294") ? true : (stryCov_9fa48("12294", "12295", "12296"), options.context || {}))
        })
      }));
      this.serviceName = serviceName;
      this.dependencyName = dependencyName;
    }
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
    if (stryMutAct_9fa48("12297")) {
      {}
    } else {
      stryCov_9fa48("12297");
      super(stryMutAct_9fa48("12298") ? `` : (stryCov_9fa48("12298"), `${serviceName} cannot ${attemptedTransition} from ${currentState} state`), stryMutAct_9fa48("12299") ? {} : (stryCov_9fa48("12299"), {
        cause: options.cause,
        context: stryMutAct_9fa48("12300") ? {} : (stryCov_9fa48("12300"), {
          serviceName,
          currentState,
          attemptedTransition,
          ...(stryMutAct_9fa48("12303") ? options.context && {} : stryMutAct_9fa48("12302") ? false : stryMutAct_9fa48("12301") ? true : (stryCov_9fa48("12301", "12302", "12303"), options.context || {}))
        })
      }));
      this.serviceName = serviceName;
      this.currentState = currentState;
      this.attemptedTransition = attemptedTransition;
    }
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
    if (stryMutAct_9fa48("12304")) {
      {}
    } else {
      stryCov_9fa48("12304");
      super((stryMutAct_9fa48("12305") ? `` : (stryCov_9fa48("12305"), `Cannot transition from ${currentPhase} to ${targetPhase}. `)) + (stryMutAct_9fa48("12306") ? `` : (stryCov_9fa48("12306"), `Valid: ${validTransitions.join(stryMutAct_9fa48("12307") ? "" : (stryCov_9fa48("12307"), ', '))}`)), stryMutAct_9fa48("12308") ? {} : (stryCov_9fa48("12308"), {
        cause: options.cause,
        context: stryMutAct_9fa48("12309") ? {} : (stryCov_9fa48("12309"), {
          currentPhase,
          targetPhase,
          validTransitions,
          ...(stryMutAct_9fa48("12312") ? options.context && {} : stryMutAct_9fa48("12311") ? false : stryMutAct_9fa48("12310") ? true : (stryCov_9fa48("12310", "12311", "12312"), options.context || {}))
        })
      }));
      this.currentPhase = currentPhase;
      this.targetPhase = targetPhase;
      this.validTransitions = validTransitions;
    }
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
    if (stryMutAct_9fa48("12313")) {
      {}
    } else {
      stryCov_9fa48("12313");
      super(stryMutAct_9fa48("12314") ? `` : (stryCov_9fa48("12314"), `Phase ${phaseName} timed out after ${timeoutMs}ms`), stryMutAct_9fa48("12315") ? {} : (stryCov_9fa48("12315"), {
        cause: options.cause,
        context: stryMutAct_9fa48("12316") ? {} : (stryCov_9fa48("12316"), {
          phaseName,
          timeoutMs,
          timeoutContext: context,
          ...(stryMutAct_9fa48("12319") ? options.context && {} : stryMutAct_9fa48("12318") ? false : stryMutAct_9fa48("12317") ? true : (stryCov_9fa48("12317", "12318", "12319"), options.context || {}))
        })
      }));
      this.phaseName = phaseName;
      this.timeoutMs = timeoutMs;
      this.timeoutContext = context;
    }
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
    if (stryMutAct_9fa48("12320")) {
      {}
    } else {
      stryCov_9fa48("12320");
      super(stryMutAct_9fa48("12321") ? "" : (stryCov_9fa48("12321"), 'BootstrapPartitionWriter has been disabled after registration phase'));
    }
  }
}
export { DependencyError, LifecycleError, PhaseTimeoutError, PhaseTransitionError, WriterDisabledError };
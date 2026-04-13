/**
 * Typed errors for runtime driver contract failures.
 *
 * All driver failures return typed errors (no silent fallback).
 * Extends BaseError for consistent error handling and JSON serialization.
 *
 * Requirements: 1.1, 4.4, 6.5
 *
 * @module runtime/runtime-driver-errors
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
 * Error thrown when a driver method is not implemented by a subclass.
 *
 * @extends BaseError
 */
class DriverNotImplementedError extends BaseError {
  /**
   * @param {string} driverKind - The runtime kind of the driver.
   * @param {string} methodName - The method that was not implemented.
   */
  constructor(driverKind, methodName) {
    if (stryMutAct_9fa48("148540")) {
      {}
    } else {
      stryCov_9fa48("148540");
      super(stryMutAct_9fa48("148541") ? `` : (stryCov_9fa48("148541"), `Driver '${driverKind}' does not implement '${methodName}'`), stryMutAct_9fa48("148542") ? {} : (stryCov_9fa48("148542"), {
        context: stryMutAct_9fa48("148543") ? {} : (stryCov_9fa48("148543"), {
          component: stryMutAct_9fa48("148544") ? "" : (stryCov_9fa48("148544"), 'RuntimeDriver'),
          operation: methodName,
          metadata: stryMutAct_9fa48("148545") ? {} : (stryCov_9fa48("148545"), {
            driverKind
          })
        })
      }));
      this.driverKind = driverKind;
      this.methodName = methodName;
    }
  }
}

/**
 * Error thrown when descriptor validation fails inside a driver.
 *
 * @extends BaseError
 */
class DriverValidationError extends BaseError {
  /**
   * @param {string} driverKind - The runtime kind of the driver.
   * @param {string[]} errors - Validation error messages.
   */
  constructor(driverKind, errors) {
    if (stryMutAct_9fa48("148546")) {
      {}
    } else {
      stryCov_9fa48("148546");
      super(stryMutAct_9fa48("148547") ? `` : (stryCov_9fa48("148547"), `Descriptor validation failed for '${driverKind}': ${errors.join(stryMutAct_9fa48("148548") ? "" : (stryCov_9fa48("148548"), '; '))}`), stryMutAct_9fa48("148549") ? {} : (stryCov_9fa48("148549"), {
        context: stryMutAct_9fa48("148550") ? {} : (stryCov_9fa48("148550"), {
          component: stryMutAct_9fa48("148551") ? "" : (stryCov_9fa48("148551"), 'RuntimeDriver'),
          operation: stryMutAct_9fa48("148552") ? "" : (stryCov_9fa48("148552"), 'validateDescriptor'),
          metadata: stryMutAct_9fa48("148553") ? {} : (stryCov_9fa48("148553"), {
            driverKind,
            errors
          })
        })
      }));
      this.driverKind = driverKind;
      this.validationErrors = errors;
    }
  }
}

/**
 * Error thrown when a driver lifecycle operation fails.
 *
 * @extends BaseError
 */
class DriverLifecycleError extends BaseError {
  /**
   * @param {string} driverKind - The runtime kind of the driver.
   * @param {string} operation - The lifecycle operation that failed.
   * @param {string} message - Human-readable failure description.
   * @param {Object} [options={}] - Optional error options.
   */
  constructor(driverKind, operation, message, options = {}) {
    if (stryMutAct_9fa48("148554")) {
      {}
    } else {
      stryCov_9fa48("148554");
      super(stryMutAct_9fa48("148555") ? `` : (stryCov_9fa48("148555"), `Driver '${driverKind}' ${operation} failed: ${message}`), stryMutAct_9fa48("148556") ? {} : (stryCov_9fa48("148556"), {
        cause: options.cause,
        context: stryMutAct_9fa48("148557") ? {} : (stryCov_9fa48("148557"), {
          component: stryMutAct_9fa48("148558") ? "" : (stryCov_9fa48("148558"), 'RuntimeDriver'),
          operation,
          metadata: stryMutAct_9fa48("148559") ? {} : (stryCov_9fa48("148559"), {
            driverKind
          }),
          ...(stryMutAct_9fa48("148562") ? options.context && {} : stryMutAct_9fa48("148561") ? false : stryMutAct_9fa48("148560") ? true : (stryCov_9fa48("148560", "148561", "148562"), options.context || {}))
        })
      }));
      this.driverKind = driverKind;
      this.operation = operation;
    }
  }
}

/**
 * Error thrown when a runtime kind has no registered driver.
 * Fail-closed: no fallback selection is attempted.
 *
 * @extends BaseError
 */
class UnknownRuntimeKindError extends BaseError {
  /**
   * @param {string} kind - The runtime kind that was requested.
   * @param {string[]} [availableKinds] - Registered kinds for diagnostics.
   */
  constructor(kind, availableKinds = stryMutAct_9fa48("148563") ? ["Stryker was here"] : (stryCov_9fa48("148563"), [])) {
    if (stryMutAct_9fa48("148564")) {
      {}
    } else {
      stryCov_9fa48("148564");
      const available = (stryMutAct_9fa48("148568") ? availableKinds.length <= 0 : stryMutAct_9fa48("148567") ? availableKinds.length >= 0 : stryMutAct_9fa48("148566") ? false : stryMutAct_9fa48("148565") ? true : (stryCov_9fa48("148565", "148566", "148567", "148568"), availableKinds.length > 0)) ? availableKinds.join(stryMutAct_9fa48("148569") ? "" : (stryCov_9fa48("148569"), ', ')) : stryMutAct_9fa48("148570") ? "" : (stryCov_9fa48("148570"), 'none');
      super((stryMutAct_9fa48("148571") ? `` : (stryCov_9fa48("148571"), `No driver registered for runtime kind '${kind}'`)) + (stryMutAct_9fa48("148572") ? `` : (stryCov_9fa48("148572"), ` (available: ${available})`)), stryMutAct_9fa48("148573") ? {} : (stryCov_9fa48("148573"), {
        context: stryMutAct_9fa48("148574") ? {} : (stryCov_9fa48("148574"), {
          component: stryMutAct_9fa48("148575") ? "" : (stryCov_9fa48("148575"), 'RuntimeDriverRegistry'),
          operation: stryMutAct_9fa48("148576") ? "" : (stryCov_9fa48("148576"), 'getDriver'),
          metadata: stryMutAct_9fa48("148577") ? {} : (stryCov_9fa48("148577"), {
            kind,
            availableKinds
          })
        })
      }));
      this.kind = kind;
      this.availableKinds = availableKinds;
    }
  }
}

/**
 * Error thrown when a duplicate driver registration is attempted.
 *
 * @extends BaseError
 */
class DuplicateDriverError extends BaseError {
  /**
   * @param {string} kind - The runtime kind already registered.
   */
  constructor(kind) {
    if (stryMutAct_9fa48("148578")) {
      {}
    } else {
      stryCov_9fa48("148578");
      super(stryMutAct_9fa48("148579") ? `` : (stryCov_9fa48("148579"), `Driver already registered for runtime kind '${kind}'`), stryMutAct_9fa48("148580") ? {} : (stryCov_9fa48("148580"), {
        context: stryMutAct_9fa48("148581") ? {} : (stryCov_9fa48("148581"), {
          component: stryMutAct_9fa48("148582") ? "" : (stryCov_9fa48("148582"), 'RuntimeDriverRegistry'),
          operation: stryMutAct_9fa48("148583") ? "" : (stryCov_9fa48("148583"), 'register'),
          metadata: stryMutAct_9fa48("148584") ? {} : (stryCov_9fa48("148584"), {
            kind
          })
        })
      }));
      this.kind = kind;
    }
  }
}

/**
 * Error thrown when the registry is frozen and mutation is attempted.
 *
 * @extends BaseError
 */
class RegistryFrozenError extends BaseError {
  /**
   * @param {string} operation - The operation that was attempted.
   */
  constructor(operation) {
    if (stryMutAct_9fa48("148585")) {
      {}
    } else {
      stryCov_9fa48("148585");
      super(stryMutAct_9fa48("148586") ? `` : (stryCov_9fa48("148586"), `Registry is frozen; cannot perform '${operation}'`), stryMutAct_9fa48("148587") ? {} : (stryCov_9fa48("148587"), {
        context: stryMutAct_9fa48("148588") ? {} : (stryCov_9fa48("148588"), {
          component: stryMutAct_9fa48("148589") ? "" : (stryCov_9fa48("148589"), 'RuntimeDriverRegistry'),
          operation
        })
      }));
    }
  }
}

/**
 * Error thrown when a lifecycle orchestration operation fails.
 * Wraps driver-level errors with lifecycle context.
 *
 * @extends BaseError
 */
class LifecycleOrchestrationError extends BaseError {
  /**
   * @param {string} operation - The lifecycle operation that failed
   *   (prepare, start, stop, health).
   * @param {string} runtimeKind - The runtime kind being orchestrated.
   * @param {string} serviceId - The service definition identifier.
   * @param {string} message - Human-readable failure description.
   * @param {Object} [options={}] - Optional error options.
   */
  constructor(operation, runtimeKind, serviceId, message, options = {}) {
    if (stryMutAct_9fa48("148590")) {
      {}
    } else {
      stryCov_9fa48("148590");
      super((stryMutAct_9fa48("148591") ? `` : (stryCov_9fa48("148591"), `Lifecycle ${operation} failed for service '${serviceId}'`)) + (stryMutAct_9fa48("148592") ? `` : (stryCov_9fa48("148592"), ` (runtime: ${runtimeKind}): ${message}`)), stryMutAct_9fa48("148593") ? {} : (stryCov_9fa48("148593"), {
        cause: options.cause,
        context: stryMutAct_9fa48("148594") ? {} : (stryCov_9fa48("148594"), {
          component: stryMutAct_9fa48("148595") ? "" : (stryCov_9fa48("148595"), 'ServiceRuntimeLifecycle'),
          operation,
          metadata: stryMutAct_9fa48("148596") ? {} : (stryCov_9fa48("148596"), {
            runtimeKind,
            serviceId
          })
        })
      }));
      this.operation = operation;
      this.runtimeKind = runtimeKind;
      this.serviceId = serviceId;
    }
  }
}

/**
 * Error thrown when a driver returns an invalid endpoint intent.
 * The lifecycle owner validates all endpoint intents before
 * writing them through the SQL/CDC path.
 *
 * Requirements: 8.1, 8.2, 8.3
 *
 * @extends BaseError
 */
class EndpointIntentError extends BaseError {
  /**
   * @param {string} runtimeKind - The runtime kind of the driver.
   * @param {string} serviceId - The service definition identifier.
   * @param {string} reason - Why the endpoint intent is invalid.
   */
  constructor(runtimeKind, serviceId, reason) {
    if (stryMutAct_9fa48("148597")) {
      {}
    } else {
      stryCov_9fa48("148597");
      super((stryMutAct_9fa48("148598") ? `` : (stryCov_9fa48("148598"), `Invalid endpoint intent from driver '${runtimeKind}'`)) + (stryMutAct_9fa48("148599") ? `` : (stryCov_9fa48("148599"), ` for service '${serviceId}': ${reason}`)), stryMutAct_9fa48("148600") ? {} : (stryCov_9fa48("148600"), {
        context: stryMutAct_9fa48("148601") ? {} : (stryCov_9fa48("148601"), {
          component: stryMutAct_9fa48("148602") ? "" : (stryCov_9fa48("148602"), 'ServiceRuntimeLifecycle'),
          operation: stryMutAct_9fa48("148603") ? "" : (stryCov_9fa48("148603"), 'registerEndpoint'),
          metadata: stryMutAct_9fa48("148604") ? {} : (stryCov_9fa48("148604"), {
            runtimeKind,
            serviceId
          })
        })
      }));
      this.runtimeKind = runtimeKind;
      this.serviceId = serviceId;
      this.reason = reason;
    }
  }
}

/**
 * Error thrown when operation journaling fails during lifecycle
 * orchestration. The lifecycle owner coordinates all operation
 * state transitions — drivers must NOT maintain ad-hoc mutation
 * state.
 *
 * Requirements: 6.4, 11.1, 11.3
 *
 * @extends BaseError
 */
class OperationJournalError extends BaseError {
  /**
   * @param {string} runtimeKind - The runtime kind being orchestrated.
   * @param {string} serviceId - The service definition identifier.
   * @param {string} operation - The lifecycle operation (prepare/start/stop).
   * @param {string} reason - Why the journal write failed.
   * @param {Object} [options={}] - Optional error options.
   */
  constructor(runtimeKind, serviceId, operation, reason, options = {}) {
    if (stryMutAct_9fa48("148605")) {
      {}
    } else {
      stryCov_9fa48("148605");
      super((stryMutAct_9fa48("148606") ? `` : (stryCov_9fa48("148606"), `Operation journal failed for service '${serviceId}'`)) + (stryMutAct_9fa48("148607") ? `` : (stryCov_9fa48("148607"), ` (runtime: ${runtimeKind}, op: ${operation}): ${reason}`)), stryMutAct_9fa48("148608") ? {} : (stryCov_9fa48("148608"), {
        cause: options.cause,
        context: stryMutAct_9fa48("148609") ? {} : (stryCov_9fa48("148609"), {
          component: stryMutAct_9fa48("148610") ? "" : (stryCov_9fa48("148610"), 'ServiceRuntimeLifecycle'),
          operation: stryMutAct_9fa48("148611") ? "" : (stryCov_9fa48("148611"), 'operationJournal'),
          metadata: stryMutAct_9fa48("148612") ? {} : (stryCov_9fa48("148612"), {
            runtimeKind,
            serviceId,
            lifecycleOp: operation
          })
        })
      }));
      this.runtimeKind = runtimeKind;
      this.serviceId = serviceId;
      this.lifecycleOp = operation;
      this.reason = reason;
    }
  }
}

/**
 * Error thrown when an idempotency check fails during lifecycle
 * orchestration. The lifecycle owner checks for duplicate
 * operations before creating new ones.
 *
 * Requirements: 11.2
 *
 * @extends BaseError
 */
class IdempotencyCheckError extends BaseError {
  /**
   * @param {string} runtimeKind - The runtime kind being orchestrated.
   * @param {string} serviceId - The service definition identifier.
   * @param {string} reason - Why the idempotency check failed.
   * @param {Object} [options={}] - Optional error options.
   */
  constructor(runtimeKind, serviceId, reason, options = {}) {
    if (stryMutAct_9fa48("148613")) {
      {}
    } else {
      stryCov_9fa48("148613");
      super((stryMutAct_9fa48("148614") ? `` : (stryCov_9fa48("148614"), `Idempotency check failed for service '${serviceId}'`)) + (stryMutAct_9fa48("148615") ? `` : (stryCov_9fa48("148615"), ` (runtime: ${runtimeKind}): ${reason}`)), stryMutAct_9fa48("148616") ? {} : (stryCov_9fa48("148616"), {
        cause: options.cause,
        context: stryMutAct_9fa48("148617") ? {} : (stryCov_9fa48("148617"), {
          component: stryMutAct_9fa48("148618") ? "" : (stryCov_9fa48("148618"), 'ServiceRuntimeLifecycle'),
          operation: stryMutAct_9fa48("148619") ? "" : (stryCov_9fa48("148619"), 'idempotencyCheck'),
          metadata: stryMutAct_9fa48("148620") ? {} : (stryCov_9fa48("148620"), {
            runtimeKind,
            serviceId
          })
        })
      }));
      this.runtimeKind = runtimeKind;
      this.serviceId = serviceId;
      this.reason = reason;
    }
  }
}
export { DriverNotImplementedError, DriverValidationError, DriverLifecycleError, UnknownRuntimeKindError, DuplicateDriverError, RegistryFrozenError, LifecycleOrchestrationError, EndpointIntentError, OperationJournalError, IdempotencyCheckError };
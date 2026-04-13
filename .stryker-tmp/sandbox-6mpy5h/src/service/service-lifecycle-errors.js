/**
 * Typed errors for unified service lifecycle components.
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
import { UnknownRuntimeKindError } from '../runtime/runtime-driver-errors.js';
import { ALLOWED_UNIFIED_SERVICE_TYPES } from '../constants/unified-service-lifecycle.js';
class UnknownServiceTypeError extends BaseError {
  /**
   * @param {string} serviceType
   * @param {string[]} [availableTypes]
   */
  constructor(serviceType, availableTypes = stryMutAct_9fa48("150278") ? ["Stryker was here"] : (stryCov_9fa48("150278"), [])) {
    if (stryMutAct_9fa48("150279")) {
      {}
    } else {
      stryCov_9fa48("150279");
      const available = (stryMutAct_9fa48("150283") ? availableTypes.length <= 0 : stryMutAct_9fa48("150282") ? availableTypes.length >= 0 : stryMutAct_9fa48("150281") ? false : stryMutAct_9fa48("150280") ? true : (stryCov_9fa48("150280", "150281", "150282", "150283"), availableTypes.length > 0)) ? availableTypes.join(stryMutAct_9fa48("150284") ? "" : (stryCov_9fa48("150284"), ', ')) : stryMutAct_9fa48("150285") ? "" : (stryCov_9fa48("150285"), 'none');
      super(stryMutAct_9fa48("150286") ? `` : (stryCov_9fa48("150286"), `Unknown service type '${serviceType}' (available: ${available})`), stryMutAct_9fa48("150287") ? {} : (stryCov_9fa48("150287"), {
        context: stryMutAct_9fa48("150288") ? {} : (stryCov_9fa48("150288"), {
          component: stryMutAct_9fa48("150289") ? "" : (stryCov_9fa48("150289"), 'ServiceLifecycle'),
          operation: stryMutAct_9fa48("150290") ? "" : (stryCov_9fa48("150290"), 'resolveAdapter'),
          metadata: stryMutAct_9fa48("150291") ? {} : (stryCov_9fa48("150291"), {
            serviceType,
            availableTypes
          })
        })
      }));
      this.serviceType = serviceType;
      this.availableTypes = availableTypes;
    }
  }
}
class ServiceTypeAdapterNotImplementedError extends BaseError {
  /**
   * @param {string} serviceType
   * @param {string} methodName
   */
  constructor(serviceType, methodName) {
    if (stryMutAct_9fa48("150292")) {
      {}
    } else {
      stryCov_9fa48("150292");
      super(stryMutAct_9fa48("150293") ? `` : (stryCov_9fa48("150293"), `ServiceTypeAdapter '${serviceType}' does not implement '${methodName}'`), stryMutAct_9fa48("150294") ? {} : (stryCov_9fa48("150294"), {
        context: stryMutAct_9fa48("150295") ? {} : (stryCov_9fa48("150295"), {
          component: stryMutAct_9fa48("150296") ? "" : (stryCov_9fa48("150296"), 'ServiceTypeAdapter'),
          operation: methodName,
          metadata: stryMutAct_9fa48("150297") ? {} : (stryCov_9fa48("150297"), {
            serviceType
          })
        })
      }));
      this.serviceType = serviceType;
      this.methodName = methodName;
    }
  }
}
class InvalidServiceMessageError extends BaseError {
  /**
   * @param {string} reason
   * @param {Object} [metadata]
   */
  constructor(reason, metadata = {}) {
    if (stryMutAct_9fa48("150298")) {
      {}
    } else {
      stryCov_9fa48("150298");
      super(stryMutAct_9fa48("150299") ? `` : (stryCov_9fa48("150299"), `Invalid service message envelope: ${reason}`), stryMutAct_9fa48("150300") ? {} : (stryCov_9fa48("150300"), {
        context: stryMutAct_9fa48("150301") ? {} : (stryCov_9fa48("150301"), {
          component: stryMutAct_9fa48("150302") ? "" : (stryCov_9fa48("150302"), 'ServiceMessageContract'),
          operation: stryMutAct_9fa48("150303") ? "" : (stryCov_9fa48("150303"), 'validateEnvelope'),
          metadata
        })
      }));
      this.reason = reason;
    }
  }
}
class ServiceLifecycleTransitionError extends BaseError {
  /**
   * @param {string} serviceId
   * @param {string} operation
   * @param {string} fromState
   * @param {string} toState
   */
  constructor(serviceId, operation, fromState, toState) {
    if (stryMutAct_9fa48("150304")) {
      {}
    } else {
      stryCov_9fa48("150304");
      super((stryMutAct_9fa48("150305") ? `` : (stryCov_9fa48("150305"), `Invalid lifecycle transition for service '${serviceId}':`)) + (stryMutAct_9fa48("150306") ? `` : (stryCov_9fa48("150306"), ` ${operation} cannot move ${fromState} -> ${toState}`)), stryMutAct_9fa48("150307") ? {} : (stryCov_9fa48("150307"), {
        context: stryMutAct_9fa48("150308") ? {} : (stryCov_9fa48("150308"), {
          component: stryMutAct_9fa48("150309") ? "" : (stryCov_9fa48("150309"), 'ServiceLifecycleManager'),
          operation,
          metadata: stryMutAct_9fa48("150310") ? {} : (stryCov_9fa48("150310"), {
            serviceId,
            fromState,
            toState
          })
        })
      }));
      this.serviceId = serviceId;
      this.operation = operation;
      this.fromState = fromState;
      this.toState = toState;
    }
  }
}
class ServiceOperationJournalError extends BaseError {
  /**
   * @param {string} serviceId
   * @param {string} operation
   * @param {string} reason
   * @param {Object} [options]
   */
  constructor(serviceId, operation, reason, options = {}) {
    if (stryMutAct_9fa48("150311")) {
      {}
    } else {
      stryCov_9fa48("150311");
      super((stryMutAct_9fa48("150312") ? `` : (stryCov_9fa48("150312"), `Service operation journal failed for '${serviceId}'`)) + (stryMutAct_9fa48("150313") ? `` : (stryCov_9fa48("150313"), ` (${operation}): ${reason}`)), stryMutAct_9fa48("150314") ? {} : (stryCov_9fa48("150314"), {
        cause: options.cause,
        context: stryMutAct_9fa48("150315") ? {} : (stryCov_9fa48("150315"), {
          component: stryMutAct_9fa48("150316") ? "" : (stryCov_9fa48("150316"), 'ServiceLifecycleManager'),
          operation: stryMutAct_9fa48("150317") ? "" : (stryCov_9fa48("150317"), 'operationJournal'),
          metadata: stryMutAct_9fa48("150318") ? {} : (stryCov_9fa48("150318"), {
            serviceId,
            lifecycleOperation: operation
          })
        })
      }));
      this.serviceId = serviceId;
      this.lifecycleOperation = operation;
      this.reason = reason;
    }
  }
}
class ServiceIdempotencyCheckError extends BaseError {
  /**
   * @param {string} serviceId
   * @param {string} operation
   * @param {string} reason
   * @param {Object} [options]
   */
  constructor(serviceId, operation, reason, options = {}) {
    if (stryMutAct_9fa48("150319")) {
      {}
    } else {
      stryCov_9fa48("150319");
      super((stryMutAct_9fa48("150320") ? `` : (stryCov_9fa48("150320"), `Service idempotency check failed for '${serviceId}'`)) + (stryMutAct_9fa48("150321") ? `` : (stryCov_9fa48("150321"), ` (${operation}): ${reason}`)), stryMutAct_9fa48("150322") ? {} : (stryCov_9fa48("150322"), {
        cause: options.cause,
        context: stryMutAct_9fa48("150323") ? {} : (stryCov_9fa48("150323"), {
          component: stryMutAct_9fa48("150324") ? "" : (stryCov_9fa48("150324"), 'ServiceLifecycleManager'),
          operation: stryMutAct_9fa48("150325") ? "" : (stryCov_9fa48("150325"), 'idempotencyCheck'),
          metadata: stryMutAct_9fa48("150326") ? {} : (stryCov_9fa48("150326"), {
            serviceId,
            lifecycleOperation: operation
          })
        })
      }));
      this.serviceId = serviceId;
      this.lifecycleOperation = operation;
      this.reason = reason;
    }
  }
}
class ServiceDescriptorValidationError extends BaseError {
  /**
   * @param {string[]} errors
   * @param {Object} [metadata]
   */
  constructor(errors, metadata = {}) {
    if (stryMutAct_9fa48("150327")) {
      {}
    } else {
      stryCov_9fa48("150327");
      super(stryMutAct_9fa48("150328") ? `` : (stryCov_9fa48("150328"), `Invalid service descriptor: ${errors.join(stryMutAct_9fa48("150329") ? "" : (stryCov_9fa48("150329"), '; '))}`), stryMutAct_9fa48("150330") ? {} : (stryCov_9fa48("150330"), {
        context: stryMutAct_9fa48("150331") ? {} : (stryCov_9fa48("150331"), {
          component: stryMutAct_9fa48("150332") ? "" : (stryCov_9fa48("150332"), 'ServiceDescriptor'),
          operation: stryMutAct_9fa48("150333") ? "" : (stryCov_9fa48("150333"), 'validateDescriptor'),
          metadata: stryMutAct_9fa48("150334") ? {} : (stryCov_9fa48("150334"), {
            errors,
            ...metadata
          })
        })
      }));
      this.validationErrors = errors;
    }
  }
}
class ServicePolicyViolationError extends BaseError {
  /**
   * @param {string} policyType
   * @param {string} operation
   * @param {string} serviceId
   * @param {string} reason
   * @param {Object} [options]
   */
  constructor(policyType, operation, serviceId, reason, options = {}) {
    if (stryMutAct_9fa48("150335")) {
      {}
    } else {
      stryCov_9fa48("150335");
      super((stryMutAct_9fa48("150336") ? `` : (stryCov_9fa48("150336"), `Service policy violation (${policyType}) for '${serviceId}'`)) + (stryMutAct_9fa48("150337") ? `` : (stryCov_9fa48("150337"), ` during ${operation}: ${reason}`)), stryMutAct_9fa48("150338") ? {} : (stryCov_9fa48("150338"), {
        cause: options.cause,
        context: stryMutAct_9fa48("150339") ? {} : (stryCov_9fa48("150339"), {
          component: stryMutAct_9fa48("150340") ? "" : (stryCov_9fa48("150340"), 'ServicePolicy'),
          operation,
          metadata: stryMutAct_9fa48("150341") ? {} : (stryCov_9fa48("150341"), {
            policyType,
            serviceId,
            reason
          })
        })
      }));
      this.policyType = policyType;
      this.operation = operation;
      this.serviceId = serviceId;
      this.reason = reason;
    }
  }
}

/**
 * Fail-closed helper for service type validation.
 *
 * @param {string} serviceType
 * @return {string}
 */
function assertKnownServiceType(serviceType) {
  if (stryMutAct_9fa48("150342")) {
    {}
  } else {
    stryCov_9fa48("150342");
    if (stryMutAct_9fa48("150345") ? false : stryMutAct_9fa48("150344") ? true : stryMutAct_9fa48("150343") ? ALLOWED_UNIFIED_SERVICE_TYPES.has(serviceType) : (stryCov_9fa48("150343", "150344", "150345"), !ALLOWED_UNIFIED_SERVICE_TYPES.has(serviceType))) {
      if (stryMutAct_9fa48("150346")) {
        {}
      } else {
        stryCov_9fa48("150346");
        throw new UnknownServiceTypeError(serviceType, stryMutAct_9fa48("150347") ? [] : (stryCov_9fa48("150347"), [...ALLOWED_UNIFIED_SERVICE_TYPES]));
      }
    }
    return serviceType;
  }
}
export { UnknownServiceTypeError, ServiceTypeAdapterNotImplementedError, InvalidServiceMessageError, ServiceLifecycleTransitionError, ServiceOperationJournalError, ServiceIdempotencyCheckError, ServiceDescriptorValidationError, ServicePolicyViolationError, UnknownRuntimeKindError, assertKnownServiceType };
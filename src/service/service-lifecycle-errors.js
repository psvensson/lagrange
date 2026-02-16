/**
 * Typed errors for unified service lifecycle components.
 */

import {BaseError} from '../utils/base-error.js';
import {UnknownRuntimeKindError} from '../runtime/runtime-driver-errors.js';
import {
  ALLOWED_UNIFIED_SERVICE_TYPES,
} from '../constants/unified-service-lifecycle.js';

class UnknownServiceTypeError extends BaseError {
  /**
   * @param {string} serviceType
   * @param {string[]} [availableTypes]
   */
  constructor(serviceType, availableTypes = []) {
    const available = availableTypes.length > 0 ?
      availableTypes.join(', ') :
      'none';

    super(
      `Unknown service type '${serviceType}' (available: ${available})`,
      {
        context: {
          component: 'ServiceLifecycle',
          operation: 'resolveAdapter',
          metadata: {serviceType, availableTypes},
        },
      },
    );

    this.serviceType = serviceType;
    this.availableTypes = availableTypes;
  }
}

class ServiceTypeAdapterNotImplementedError extends BaseError {
  /**
   * @param {string} serviceType
   * @param {string} methodName
   */
  constructor(serviceType, methodName) {
    super(
      `ServiceTypeAdapter '${serviceType}' does not implement '${methodName}'`,
      {
        context: {
          component: 'ServiceTypeAdapter',
          operation: methodName,
          metadata: {serviceType},
        },
      },
    );

    this.serviceType = serviceType;
    this.methodName = methodName;
  }
}

class InvalidServiceMessageError extends BaseError {
  /**
   * @param {string} reason
   * @param {Object} [metadata]
   */
  constructor(reason, metadata = {}) {
    super(
      `Invalid service message envelope: ${reason}`,
      {
        context: {
          component: 'ServiceMessageContract',
          operation: 'validateEnvelope',
          metadata,
        },
      },
    );

    this.reason = reason;
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
    super(
      `Invalid lifecycle transition for service '${serviceId}':` +
      ` ${operation} cannot move ${fromState} -> ${toState}`,
      {
        context: {
          component: 'ServiceLifecycleManager',
          operation,
          metadata: {serviceId, fromState, toState},
        },
      },
    );

    this.serviceId = serviceId;
    this.operation = operation;
    this.fromState = fromState;
    this.toState = toState;
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
    super(
      `Service operation journal failed for '${serviceId}'` +
      ` (${operation}): ${reason}`,
      {
        cause: options.cause,
        context: {
          component: 'ServiceLifecycleManager',
          operation: 'operationJournal',
          metadata: {serviceId, lifecycleOperation: operation},
        },
      },
    );

    this.serviceId = serviceId;
    this.lifecycleOperation = operation;
    this.reason = reason;
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
    super(
      `Service idempotency check failed for '${serviceId}'` +
      ` (${operation}): ${reason}`,
      {
        cause: options.cause,
        context: {
          component: 'ServiceLifecycleManager',
          operation: 'idempotencyCheck',
          metadata: {serviceId, lifecycleOperation: operation},
        },
      },
    );

    this.serviceId = serviceId;
    this.lifecycleOperation = operation;
    this.reason = reason;
  }
}

class ServiceDescriptorValidationError extends BaseError {
  /**
   * @param {string[]} errors
   * @param {Object} [metadata]
   */
  constructor(errors, metadata = {}) {
    super(
      `Invalid service descriptor: ${errors.join('; ')}`,
      {
        context: {
          component: 'ServiceDescriptor',
          operation: 'validateDescriptor',
          metadata: {
            errors,
            ...metadata,
          },
        },
      },
    );

    this.validationErrors = errors;
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
    super(
      `Service policy violation (${policyType}) for '${serviceId}'` +
      ` during ${operation}: ${reason}`,
      {
        cause: options.cause,
        context: {
          component: 'ServicePolicy',
          operation,
          metadata: {
            policyType,
            serviceId,
            reason,
          },
        },
      },
    );

    this.policyType = policyType;
    this.operation = operation;
    this.serviceId = serviceId;
    this.reason = reason;
  }
}

/**
 * Fail-closed helper for service type validation.
 *
 * @param {string} serviceType
 * @return {string}
 */
function assertKnownServiceType(serviceType) {
  if (!ALLOWED_UNIFIED_SERVICE_TYPES.has(serviceType)) {
    throw new UnknownServiceTypeError(
      serviceType,
      [...ALLOWED_UNIFIED_SERVICE_TYPES],
    );
  }
  return serviceType;
}

export {
  UnknownServiceTypeError,
  ServiceTypeAdapterNotImplementedError,
  InvalidServiceMessageError,
  ServiceLifecycleTransitionError,
  ServiceOperationJournalError,
  ServiceIdempotencyCheckError,
  ServiceDescriptorValidationError,
  ServicePolicyViolationError,
  UnknownRuntimeKindError,
  assertKnownServiceType,
};

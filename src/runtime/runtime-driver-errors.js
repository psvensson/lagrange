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

import {BaseError} from '../utils/base-error.js';

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
    super(
      `Driver '${driverKind}' does not implement '${methodName}'`,
      {
        context: {
          component: 'RuntimeDriver',
          operation: methodName,
          metadata: {driverKind},
        },
      },
    );
    this.driverKind = driverKind;
    this.methodName = methodName;
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
    super(
      `Descriptor validation failed for '${driverKind}': ${errors.join('; ')}`,
      {
        context: {
          component: 'RuntimeDriver',
          operation: 'validateDescriptor',
          metadata: {driverKind, errors},
        },
      },
    );
    this.driverKind = driverKind;
    this.validationErrors = errors;
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
    super(
      `Driver '${driverKind}' ${operation} failed: ${message}`,
      {
        cause: options.cause,
        context: {
          component: 'RuntimeDriver',
          operation,
          metadata: {driverKind},
          ...(options.context || {}),
        },
      },
    );
    this.driverKind = driverKind;
    this.operation = operation;
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
  constructor(kind, availableKinds = []) {
    const available = availableKinds.length > 0 ?
      availableKinds.join(', ') :
      'none';
    super(
      `No driver registered for runtime kind '${kind}'` +
      ` (available: ${available})`,
      {
        context: {
          component: 'RuntimeDriverRegistry',
          operation: 'getDriver',
          metadata: {kind, availableKinds},
        },
      },
    );
    this.kind = kind;
    this.availableKinds = availableKinds;
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
    super(
      `Driver already registered for runtime kind '${kind}'`,
      {
        context: {
          component: 'RuntimeDriverRegistry',
          operation: 'register',
          metadata: {kind},
        },
      },
    );
    this.kind = kind;
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
    super(
      `Registry is frozen; cannot perform '${operation}'`,
      {
        context: {
          component: 'RuntimeDriverRegistry',
          operation,
        },
      },
    );
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
    super(
      `Lifecycle ${operation} failed for service '${serviceId}'` +
      ` (runtime: ${runtimeKind}): ${message}`,
      {
        cause: options.cause,
        context: {
          component: 'ServiceRuntimeLifecycle',
          operation,
          metadata: {runtimeKind, serviceId},
        },
      },
    );
    this.operation = operation;
    this.runtimeKind = runtimeKind;
    this.serviceId = serviceId;
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
    super(
      `Invalid endpoint intent from driver '${runtimeKind}'` +
      ` for service '${serviceId}': ${reason}`,
      {
        context: {
          component: 'ServiceRuntimeLifecycle',
          operation: 'registerEndpoint',
          metadata: {runtimeKind, serviceId},
        },
      },
    );
    this.runtimeKind = runtimeKind;
    this.serviceId = serviceId;
    this.reason = reason;
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
    super(
      `Operation journal failed for service '${serviceId}'` +
      ` (runtime: ${runtimeKind}, op: ${operation}): ${reason}`,
      {
        cause: options.cause,
        context: {
          component: 'ServiceRuntimeLifecycle',
          operation: 'operationJournal',
          metadata: {runtimeKind, serviceId, lifecycleOp: operation},
        },
      },
    );
    this.runtimeKind = runtimeKind;
    this.serviceId = serviceId;
    this.lifecycleOp = operation;
    this.reason = reason;
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
    super(
      `Idempotency check failed for service '${serviceId}'` +
      ` (runtime: ${runtimeKind}): ${reason}`,
      {
        cause: options.cause,
        context: {
          component: 'ServiceRuntimeLifecycle',
          operation: 'idempotencyCheck',
          metadata: {runtimeKind, serviceId},
        },
      },
    );
    this.runtimeKind = runtimeKind;
    this.serviceId = serviceId;
    this.reason = reason;
  }
}

export {
  DriverNotImplementedError,
  DriverValidationError,
  DriverLifecycleError,
  UnknownRuntimeKindError,
  DuplicateDriverError,
  RegistryFrozenError,
  LifecycleOrchestrationError,
  EndpointIntentError,
  OperationJournalError,
  IdempotencyCheckError,
};

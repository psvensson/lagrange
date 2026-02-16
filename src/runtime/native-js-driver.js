/**
 * Native_JS_Driver — runtime driver for existing in-process JS
 * handlers running inside replicated service runtime.
 *
 * Wraps current admin command handlers (e.g. sys-admin-meta)
 * in the RuntimeDriver contract without requiring rewrites.
 * The driver resolves handler references, validates them, and
 * manages their availability lifecycle.
 *
 * Supports two handler shapes in the handlerMap:
 *   1. Plain function — simple handler (existing behavior).
 *   2. Lifecycle-capable module — object exposing prepare,
 *      start, stop, health methods. Lifecycle calls are
 *      delegated to the module directly.
 *
 * Contract rules:
 *   1. No driver writes system metadata directly.
 *   2. All driver failures return typed errors.
 *   3. Driver lifecycle calls are idempotent where possible.
 *
 * Requirements: 2.1, 2.2, 2.4, 9.4
 *
 * @module runtime/native-js-driver
 */

import {RUNTIME_KIND, RUNTIME_FIELD} from '../constants/runtime.js';
import {TYPEOF} from '../constants/types.js';
import {
  RuntimeDriver,
  PREPARE_STATUS,
  START_STATUS,
  HEALTH_STATUS,
} from './runtime-driver.js';
import {
  DriverValidationError,
  DriverLifecycleError,
} from './runtime-driver-errors.js';

// --- Driver-specific constants ---

const NATIVE_JS_ERROR = Object.freeze({
  REF_REQUIRED: 'runtime_ref is required for native_js driver',
  REF_MUST_BE_STRING: 'runtime_ref must be a string',
  REF_EMPTY: 'runtime_ref must not be empty',
  DEFINITION_REQUIRED: 'service definition is required',
  HANDLER_NOT_FOUND: 'handler not found for runtime_ref',
  HANDLER_NOT_FUNCTION: 'resolved handler is not a function',
  HANDLER_INVALID_TYPE:
    'resolved handler must be a function or lifecycle module',
  HANDLER_MAP_NOT_OBJECT: 'handler map must be a non-null object',
  REPLICA_CONTEXT_REQUIRED: 'replicaContext is required',
  SERVICE_ID_REQUIRED: 'replicaContext.serviceId is required',
  NOT_PREPARED: 'driver has not been prepared for this service',
  NOT_STARTED: 'service is not running',
});

// --- Lifecycle module detection ---

const LIFECYCLE_METHODS = Object.freeze([
  'prepare', 'start', 'stop', 'health',
]);

/**
 * Check whether a resolved handler is a lifecycle-capable module.
 *
 * A lifecycle module is a non-null object exposing prepare, start,
 * stop, and health as functions.
 *
 * @param {*} handler - The resolved handler from handlerMap.
 * @return {boolean}
 */
function isLifecycleModule(handler) {
  if (!handler || typeof handler !== TYPEOF.OBJECT) {
    return false;
  }
  return LIFECYCLE_METHODS.every(
    (m) => typeof handler[m] === TYPEOF.FUNCTION,
  );
}

/**
 * Native_JS_Driver — executes existing in-process JS handlers
 * inside the replicated service runtime contract.
 *
 * Usage:
 *   const driver = new NativeJsDriver();
 *   const validation = driver.validateDescriptor(definition);
 *   await driver.prepare(definition, {handlerMap});
 *   await driver.start(replicaContext);
 *   const health = await driver.health(replicaContext);
 *   await driver.stop(replicaContext);
 *
 * @extends RuntimeDriver
 */
class NativeJsDriver extends RuntimeDriver {
  constructor() {
    super(RUNTIME_KIND.NATIVE_JS);

    /**
     * Prepared handler references keyed by serviceId.
     * @type {Map<string, Function>}
     * @private
     */
    this._prepared = new Map();

    /**
     * Lifecycle-capable modules keyed by serviceId.
     * @type {Map<string, Object>}
     * @private
     */
    this._lifecycleModules = new Map();

    /**
     * Running service IDs.
     * @type {Set<string>}
     * @private
     */
    this._running = new Set();
  }

  /**
   * Validate a service definition's runtime descriptor for
   * native_js runtime kind.
   *
   * Checks:
   *   - definition is present
   *   - runtime_ref is a non-empty string
   *
   * @param {Object} definition - The service definition.
   * @return {{valid: boolean, errors?: string[]}}
   */
  validateDescriptor(definition) {
    const errors = [];

    if (!definition || typeof definition !== TYPEOF.OBJECT) {
      errors.push(NATIVE_JS_ERROR.DEFINITION_REQUIRED);
      return {valid: false, errors};
    }

    const ref = definition[RUNTIME_FIELD.RUNTIME_REF] ??
      definition.runtimeRef;

    if (ref === undefined || ref === null) {
      errors.push(NATIVE_JS_ERROR.REF_REQUIRED);
    } else if (typeof ref !== TYPEOF.STRING) {
      errors.push(NATIVE_JS_ERROR.REF_MUST_BE_STRING);
    } else if (ref.trim().length === 0) {
      errors.push(NATIVE_JS_ERROR.REF_EMPTY);
    }

    if (errors.length > 0) {
      return {valid: false, errors};
    }
    return {valid: true};
  }

  /**
   * Prepare runtime artifacts for a native_js service definition.
   *
   * Resolves the handler reference from the provided context's
   * handlerMap. The handlerMap maps runtime_ref strings to either:
   *   - handler functions (existing behavior), or
   *   - lifecycle-capable modules (objects with prepare, start,
   *     stop, health methods).
   *
   * When a lifecycle module is resolved, its prepare() method is
   * called and the module is stored for subsequent lifecycle
   * delegation.
   *
   * Idempotent: re-preparing an already-prepared service
   * updates the handler reference.
   *
   * @param {Object} definition - The service definition.
   * @param {Object} context - Must include {handlerMap: Object}.
   * @return {Promise<{status: string, error?: string}>}
   */
  async prepare(definition, context) {
    const validation = this.validateDescriptor(definition);
    if (!validation.valid) {
      throw new DriverValidationError(this.kind, validation.errors);
    }

    const ref = definition[RUNTIME_FIELD.RUNTIME_REF] ??
      definition.runtimeRef;
    const serviceId = definition.serviceId ?? definition.service_id;

    const handlerMap = context?.handlerMap;
    if (!handlerMap || typeof handlerMap !== TYPEOF.OBJECT) {
      throw new DriverLifecycleError(
        this.kind, 'prepare',
        NATIVE_JS_ERROR.HANDLER_MAP_NOT_OBJECT,
      );
    }

    const handler = handlerMap[ref];
    if (!handler) {
      return {
        status: PREPARE_STATUS.FAILED,
        error: `${NATIVE_JS_ERROR.HANDLER_NOT_FOUND}: '${ref}'`,
      };
    }

    // Lifecycle-capable module: delegate prepare and store module
    if (isLifecycleModule(handler)) {
      const result = await handler.prepare(definition, context);
      if (result.status === PREPARE_STATUS.FAILED) {
        return result;
      }
      this._lifecycleModules.set(serviceId, handler);
      this._prepared.set(serviceId, handler);
      return {status: PREPARE_STATUS.READY};
    }

    if (typeof handler !== TYPEOF.FUNCTION) {
      return {
        status: PREPARE_STATUS.FAILED,
        error:
          `${NATIVE_JS_ERROR.HANDLER_INVALID_TYPE}: '${ref}'`,
      };
    }

    this._lifecycleModules.delete(serviceId);
    this._prepared.set(serviceId, handler);
    return {status: PREPARE_STATUS.READY};
  }

  /**
   * Start a native_js service replica.
   *
   * For lifecycle-capable modules, delegates to module.start().
   * For plain handlers, makes the handler available for
   * invocation and returns endpoint intent from replica context.
   *
   * Idempotent: starting an already-running replica is a no-op.
   *
   * @param {Object} replicaContext - Must include {serviceId}.
   * @return {Promise<{status: string, endpointIntent?: Object,
   *   error?: string}>}
   */
  async start(replicaContext) {
    if (!replicaContext ||
        typeof replicaContext !== TYPEOF.OBJECT) {
      throw new DriverLifecycleError(
        this.kind, 'start',
        NATIVE_JS_ERROR.REPLICA_CONTEXT_REQUIRED,
      );
    }

    const serviceId = replicaContext.serviceId ??
      replicaContext.service_id;
    if (!serviceId) {
      throw new DriverLifecycleError(
        this.kind, 'start',
        NATIVE_JS_ERROR.SERVICE_ID_REQUIRED,
      );
    }

    if (!this._prepared.has(serviceId)) {
      return {
        status: START_STATUS.FAILED,
        error: `${NATIVE_JS_ERROR.NOT_PREPARED}: '${serviceId}'`,
      };
    }

    // Lifecycle module delegation
    const mod = this._lifecycleModules.get(serviceId);
    if (mod) {
      const result = await mod.start(replicaContext);
      if (result.status === START_STATUS.RUNNING) {
        this._running.add(serviceId);
      }
      return result;
    }

    // Plain handler path (existing behavior)
    this._running.add(serviceId);

    const result = {status: START_STATUS.RUNNING};

    // Provide endpoint intent if replica context has endpoint config
    if (replicaContext.endpointHost && replicaContext.endpointPort) {
      result.endpointIntent = {
        host: replicaContext.endpointHost,
        port: replicaContext.endpointPort,
        protocol: replicaContext.endpointProtocol ?? 'ws',
      };
    }

    return result;
  }

  /**
   * Stop a native_js service replica.
   *
   * For lifecycle-capable modules, delegates to module.stop().
   * For plain handlers, cleans up handler resources.
   * Idempotent: stopping an already-stopped replica is a no-op.
   *
   * @param {Object} replicaContext - Must include {serviceId}.
   * @return {Promise<void>}
   */
  async stop(replicaContext) {
    if (!replicaContext ||
        typeof replicaContext !== TYPEOF.OBJECT) {
      throw new DriverLifecycleError(
        this.kind, 'stop',
        NATIVE_JS_ERROR.REPLICA_CONTEXT_REQUIRED,
      );
    }

    const serviceId = replicaContext.serviceId ??
      replicaContext.service_id;
    if (!serviceId) {
      throw new DriverLifecycleError(
        this.kind, 'stop',
        NATIVE_JS_ERROR.SERVICE_ID_REQUIRED,
      );
    }

    // Lifecycle module delegation
    const mod = this._lifecycleModules.get(serviceId);
    if (mod) {
      await mod.stop(replicaContext);
    }

    // Clean up state for both paths
    this._running.delete(serviceId);
    this._prepared.delete(serviceId);
    this._lifecycleModules.delete(serviceId);
  }

  /**
   * Check health of a native_js service replica.
   *
   * For lifecycle-capable modules, delegates to module.health().
   * For plain handlers, verifies the handler is prepared and
   * the service is running.
   *
   * @param {Object} replicaContext - Must include {serviceId}.
   * @return {Promise<{status: string, detail?: string}>}
   */
  async health(replicaContext) {
    if (!replicaContext ||
        typeof replicaContext !== TYPEOF.OBJECT) {
      return {
        status: HEALTH_STATUS.UNKNOWN,
        detail: NATIVE_JS_ERROR.REPLICA_CONTEXT_REQUIRED,
      };
    }

    const serviceId = replicaContext.serviceId ??
      replicaContext.service_id;
    if (!serviceId) {
      return {
        status: HEALTH_STATUS.UNKNOWN,
        detail: NATIVE_JS_ERROR.SERVICE_ID_REQUIRED,
      };
    }

    if (!this._prepared.has(serviceId)) {
      return {
        status: HEALTH_STATUS.UNHEALTHY,
        detail: `${NATIVE_JS_ERROR.NOT_PREPARED}: '${serviceId}'`,
      };
    }

    if (!this._running.has(serviceId)) {
      return {
        status: HEALTH_STATUS.UNHEALTHY,
        detail: `${NATIVE_JS_ERROR.NOT_STARTED}: '${serviceId}'`,
      };
    }

    // Lifecycle module delegation
    const mod = this._lifecycleModules.get(serviceId);
    if (mod) {
      return mod.health(replicaContext);
    }

    return {status: HEALTH_STATUS.HEALTHY};
  }

  /**
   * Get the resolved handler for a running service.
   * Useful for the lifecycle owner to invoke the handler.
   *
   * @param {string} serviceId - The service identifier.
   * @return {Function|undefined} The handler function, or
   *   undefined if not prepared/running.
   */
  getHandler(serviceId) {
    if (!this._running.has(serviceId)) {
      return undefined;
    }
    return this._prepared.get(serviceId);
  }
}

export {NativeJsDriver, NATIVE_JS_ERROR, isLifecycleModule};

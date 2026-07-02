/**
 * RuntimeDriver — abstract base class defining the contract that all
 * runtime drivers must implement.
 *
 * Contract methods:
 *   validateDescriptor(definition) → ValidationResult
 *   prepare(definition, context)   → Promise<PrepareResult>
 *   start(replicaContext)           → Promise<StartResult>
 *   stop(replicaContext)            → Promise<void>
 *   health(replicaContext)          → Promise<HealthResult>
 *
 * Contract rules:
 *   1. No driver writes system metadata directly.
 *   2. All driver failures return typed errors.
 *   3. Driver lifecycle calls are idempotent where possible.
 *
 * Requirements: 1.1, 4.4
 *
 * @module runtime/runtime-driver
 */

import {ALLOWED_RUNTIME_KINDS} from '../constants/runtime.js';
import {DriverNotImplementedError} from './runtime-driver-errors.js';

const LOCAL_STR_RUNTIMEDRIVER_IS_ABSTRACT_AND_CANNOT_BE = 'RuntimeDriver is abstract and cannot be instantiated directly';
const LOCAL_STR_KIND = 'kind';
const LOCAL_STR_VALIDATEDESCRIPTOR = 'validateDescriptor';
const LOCAL_STR_PREPARE = 'prepare';
const LOCAL_STR_START = 'start';
const LOCAL_STR_STOP = 'stop';
const LOCAL_STR_HEALTH = 'health';

// --- Result status constants ---

const VALIDATION_STATUS = Object.freeze({
  VALID: 'valid',
  INVALID: 'invalid',
});

const PREPARE_STATUS = Object.freeze({
  READY: 'ready',
  FAILED: 'failed',
});

const START_STATUS = Object.freeze({
  RUNNING: 'running',
  FAILED: 'failed',
});

const HEALTH_STATUS = Object.freeze({
  HEALTHY: 'healthy',
  UNHEALTHY: 'unhealthy',
  UNKNOWN: 'unknown',
});

/**
 * @typedef {Object} ValidationResult
 * @property {boolean} valid - Whether the descriptor is valid.
 * @property {string[]} [errors] - Validation error messages (when invalid).
 */

/**
 * @typedef {Object} PrepareResult
 * @property {string} status - 'ready' or 'failed'.
 * @property {string} [error] - Failure description (when failed).
 */

/**
 * @typedef {Object} StartResult
 * @property {string} status - 'running' or 'failed'.
 * @property {Object} [endpointIntent] - Endpoint intent for registration.
 * @property {string} [error] - Failure description (when failed).
 */

/**
 * @typedef {Object} HealthResult
 * @property {string} status - 'healthy', 'unhealthy', or 'unknown'.
 * @property {string} [detail] - Optional diagnostic detail.
 */

/**
 * Abstract base class for runtime drivers.
 *
 * Subclasses MUST:
 *   - Call super(kind) with a valid RUNTIME_KIND value.
 *   - Override validateDescriptor, prepare, start, stop, and health.
 *
 * @abstract
 */
class RuntimeDriver {
  /**
   * @param {string} kind - One of the ALLOWED_RUNTIME_KINDS values.
   * @throws {Error} If kind is not a valid runtime kind.
   * @throws {Error} If instantiated directly (abstract guard).
   */
  constructor(kind) {
    if (new.target === RuntimeDriver) {
      throw new Error(
        LOCAL_STR_RUNTIMEDRIVER_IS_ABSTRACT_AND_CANNOT_BE,
      );
    }
    if (typeof kind !== 'string' || !ALLOWED_RUNTIME_KINDS.has(kind)) {
      throw new Error(
        `RuntimeDriver requires a valid runtime kind, got '${kind}'`,
      );
    }

    /**
     * The runtime kind this driver handles.
     * @type {string}
     * @readonly
     */
    this.kind = kind;
    Object.defineProperty(this, LOCAL_STR_KIND, {writable: false, configurable: false});
  }

  /**
   * Validate a service definition's runtime descriptor.
   *
   * @param {Object} definition - The service definition to validate.
   * @return {{valid: boolean, errors?: string[]}} Validation result.
   * @abstract
   */
  validateDescriptor(_definition) {
    throw new DriverNotImplementedError(this.kind, LOCAL_STR_VALIDATEDESCRIPTOR);
  }

  /**
   * Prepare runtime artifacts for a service definition.
   * Idempotent: calling prepare on an already-prepared definition is safe.
   *
   * @param {Object} definition - The service definition.
   * @param {Object} context - Preparation context (e.g. node info).
   * @return {Promise<{status: string, error?: string}>} Prepare result.
   * @abstract
   */
  async prepare(_definition, _context) {
    throw new DriverNotImplementedError(this.kind, LOCAL_STR_PREPARE);
  }

  /**
   * Start a service replica.
   * Idempotent: calling start on an already-running replica is safe.
   *
   * @param {Object} replicaContext - Replica execution context.
   * @return {Promise<{status: string, endpointIntent?: Object, error?: string}>}
   * @abstract
   */
  async start(_replicaContext) {
    throw new DriverNotImplementedError(this.kind, LOCAL_STR_START);
  }

  /**
   * Stop a service replica.
   * Idempotent: calling stop on an already-stopped replica is safe.
   *
   * @param {Object} replicaContext - Replica execution context.
   * @return {Promise<void>}
   * @abstract
   */
  async stop(_replicaContext) {
    throw new DriverNotImplementedError(this.kind, LOCAL_STR_STOP);
  }

  /**
   * Check health of a service replica.
   *
   * @param {Object} replicaContext - Replica execution context.
   * @return {Promise<{status: string, detail?: string}>} Health result.
   * @abstract
   */
  async health(_replicaContext) {
    throw new DriverNotImplementedError(this.kind, LOCAL_STR_HEALTH);
  }
}

export {
  RuntimeDriver,
  VALIDATION_STATUS,
  PREPARE_STATUS,
  START_STATUS,
  HEALTH_STATUS,
};

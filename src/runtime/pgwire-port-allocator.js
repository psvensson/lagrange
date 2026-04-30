/**
 * PgwirePortAllocator — port allocation and collision handling
 * for PG wire replicated service replicas.
 *
 * Supports two allocation modes:
 *   - FIXED: uses the configured port directly
 *   - DYNAMIC: selects the next available port from a range
 *
 * Bind conflicts (EADDRINUSE) produce typed errors suitable for
 * operation journal failure state. The rebalancer retries failed
 * operations through existing rebalance mechanics.
 *
 * Port selection is consistent across bootstrap, join, and
 * rebalance starts — the same config yields the same allocation
 * behavior regardless of the lifecycle entry point.
 *
 * Requirements: 7.1, 7.2, 7.3, 7.4
 *
 * @module runtime/pgwire-port-allocator
 */

import {MIN_PORT, MAX_PORT} from '../constants/runtime.js';
import {TYPEOF} from '../constants/types.js';
import {BaseError} from '../utils/base-error.js';
import {PGWIRE_CONFIG_FIELD} from './pgwire-descriptor.js';
import {
  PORT_ALLOCATION_MODE,
  PGWIRE_DYNAMIC_PORT_RANGE_START,
  PGWIRE_DYNAMIC_PORT_RANGE_END,
  PGWIRE_PORT_ERROR,
  BIND_CONFLICT_CODE,
} from './pgwire-port-constants.js';

const LOCAL_STR_M7SXD = 'PgwirePortAllocator';
const LOCAL_STR_VALIDATE = 'validate';
const LOCAL_STR_BIND = 'bind';
const LOCAL_NUM_ZERO = 0;

// --- Typed errors ---

/**
 * Error thrown when port validation fails before bind attempt.
 *
 * @extends BaseError
 */
class PortValidationError extends BaseError {
  /**
   * @param {string} reason - Why validation failed.
   * @param {Object} [metadata={}] - Additional context.
   */
  constructor(reason, metadata = {}) {
    super(reason, {
      context: {
        component: LOCAL_STR_M7SXD,
        operation: LOCAL_STR_VALIDATE,
        metadata,
      },
    });
  }
}

/**
 * Error thrown when a TCP bind fails due to address-in-use.
 * Distinguishable from validation errors for operation journal
 * failure state classification.
 *
 * @extends BaseError
 */
class PortBindConflictError extends BaseError {
  /**
   * @param {number} port - The port that conflicted.
   * @param {string} [detail] - OS-level error detail.
   */
  constructor(port, detail) {
    const msg = detail ?
      `${PGWIRE_PORT_ERROR.BIND_CONFLICT}: port ${port} — ${detail}` :
      `${PGWIRE_PORT_ERROR.BIND_CONFLICT}: port ${port}`;
    super(msg, {
      context: {
        component: LOCAL_STR_M7SXD,
        operation: LOCAL_STR_BIND,
        metadata: {port},
      },
    });
    this.port = port;
    this.code = BIND_CONFLICT_CODE;
  }
}

// --- Validation helpers ---

/**
 * Check whether a value is a valid port number.
 *
 * @param {*} val - Value to check.
 * @return {boolean}
 */
function isValidPort(val) {
  return typeof val === TYPEOF.NUMBER &&
    Number.isInteger(val) &&
    val >= MIN_PORT &&
    val <= MAX_PORT;
}

/**
 * Validate a port number, throwing on failure.
 *
 * @param {*} port - Port to validate.
 * @throws {PortValidationError}
 */
function validatePort(port) {
  if (typeof port !== TYPEOF.NUMBER ||
      !Number.isInteger(port) || port <= LOCAL_NUM_ZERO) {
    throw new PortValidationError(
      PGWIRE_PORT_ERROR.PORT_NOT_INTEGER, {port},
    );
  }
  if (port < MIN_PORT || port > MAX_PORT) {
    throw new PortValidationError(
      PGWIRE_PORT_ERROR.PORT_OUT_OF_RANGE,
      {port, min: MIN_PORT, max: MAX_PORT},
    );
  }
}

/**
 * Validate a dynamic port range.
 *
 * @param {number} start - Range start (inclusive).
 * @param {number} end - Range end (inclusive).
 * @throws {PortValidationError}
 */
function validateRange(start, end) {
  if (!isValidPort(start) || !isValidPort(end)) {
    throw new PortValidationError(
      PGWIRE_PORT_ERROR.RANGE_OUTSIDE_BOUNDS,
      {start, end, min: MIN_PORT, max: MAX_PORT},
    );
  }
  if (start > end) {
    throw new PortValidationError(
      PGWIRE_PORT_ERROR.RANGE_START_AFTER_END,
      {start, end},
    );
  }
}

// --- Allocator ---

/**
 * Resolve allocation mode from runtime config.
 *
 * If a fixed port is specified, mode is FIXED.
 * If a port range is specified (or no port), mode is DYNAMIC.
 *
 * @param {Object} [config={}] - Parsed runtime_config.
 * @return {string} PORT_ALLOCATION_MODE value.
 */
function resolveAllocationMode(config = {}) {
  const hasFixedPort =
    PGWIRE_CONFIG_FIELD.PORT in config;
  const hasRange =
    PGWIRE_CONFIG_FIELD.PORT_RANGE_START in config ||
    PGWIRE_CONFIG_FIELD.PORT_RANGE_END in config;
  if (hasFixedPort && !hasRange) {
    return PORT_ALLOCATION_MODE.FIXED;
  }
  return PORT_ALLOCATION_MODE.DYNAMIC;
}

/**
 * PgwirePortAllocator — manages port allocation for PG wire
 * service replicas on a single node.
 *
 * Allocation is idempotent: calling allocate() with the same
 * serviceId returns the previously allocated port.
 */
class PgwirePortAllocator {
  /**
   * @param {Object} [options={}] - Configuration.
   * @param {number} [options.dynamicRangeStart] - First port
   *   in dynamic range (inclusive).
   * @param {number} [options.dynamicRangeEnd] - Last port
   *   in dynamic range (inclusive).
   */
  constructor(options = {}) {
    this._rangeStart = options.dynamicRangeStart ??
      PGWIRE_DYNAMIC_PORT_RANGE_START;
    this._rangeEnd = options.dynamicRangeEnd ??
      PGWIRE_DYNAMIC_PORT_RANGE_END;
    validateRange(this._rangeStart, this._rangeEnd);

    /** @type {Map<string, number>} serviceId → port */
    this._allocated = new Map();
    /** @type {Map<number, string>} port → serviceId */
    this._portToService = new Map();
  }

  /**
   * Allocate a port for a PG wire service replica.
   *
   * In FIXED mode, validates and returns the configured port.
   * In DYNAMIC mode, finds the next available port in range.
   *
   * Idempotent: re-calling with the same serviceId returns the
   * previously allocated port.
   *
   * @param {string} serviceId - Unique service replica ID.
   * @param {Object} [config={}] - Parsed runtime_config.
   * @return {number} Allocated port number.
   * @throws {PortValidationError} On invalid port or range.
   * @throws {PortValidationError} When no ports available.
   */
  allocate(serviceId, config = {}) {
    if (!serviceId || typeof serviceId !== TYPEOF.STRING) {
      throw new PortValidationError(
        PGWIRE_PORT_ERROR.SERVICE_ID_REQUIRED,
      );
    }

    const existing = this._allocated.get(serviceId);
    if (existing !== undefined) {
      return existing;
    }

    const mode = resolveAllocationMode(config);

    if (mode === PORT_ALLOCATION_MODE.FIXED) {
      const port = config[PGWIRE_CONFIG_FIELD.PORT];
      validatePort(port);
      this._allocated.set(serviceId, port);
      this._portToService.set(port, serviceId);
      return port;
    }

    // DYNAMIC mode
    const start = config[PGWIRE_CONFIG_FIELD.PORT_RANGE_START] ??
      this._rangeStart;
    const end = config[PGWIRE_CONFIG_FIELD.PORT_RANGE_END] ??
      this._rangeEnd;
    validateRange(start, end);

    for (let port = start; port <= end; port++) {
      if (!this._portToService.has(port)) {
        this._allocated.set(serviceId, port);
        this._portToService.set(port, serviceId);
        return port;
      }
    }

    throw new PortValidationError(
      PGWIRE_PORT_ERROR.NO_PORTS_AVAILABLE,
      {rangeStart: start, rangeEnd: end},
    );
  }

  /**
   * Release the port allocated to a service replica.
   * No-op if serviceId has no allocation.
   *
   * @param {string} serviceId - Service replica ID.
   */
  release(serviceId) {
    const port = this._allocated.get(serviceId);
    if (port !== undefined) {
      this._allocated.delete(serviceId);
      this._portToService.delete(port);
    }
  }

  /**
   * Check whether a port is available for allocation.
   *
   * @param {number} port - Port number to check.
   * @return {boolean}
   */
  isAvailable(port) {
    return !this._portToService.has(port);
  }

  /**
   * Get the port currently allocated to a service.
   *
   * @param {string} serviceId - Service replica ID.
   * @return {number|undefined} Allocated port or undefined.
   */
  getPort(serviceId) {
    return this._allocated.get(serviceId);
  }
}

/**
 * Classify a bind error as a port conflict.
 *
 * Wraps OS-level EADDRINUSE errors into typed
 * PortBindConflictError for operation journal classification.
 *
 * @param {Error} err - The error from net.Server.listen().
 * @param {number} port - The port that was attempted.
 * @return {PortBindConflictError|Error} Typed error if bind
 *   conflict, original error otherwise.
 */
function classifyBindError(err, port) {
  if (err && err.code === BIND_CONFLICT_CODE) {
    return new PortBindConflictError(port, err.message);
  }
  return err;
}

export {
  PgwirePortAllocator,
  PortValidationError,
  PortBindConflictError,
  resolveAllocationMode,
  validatePort,
  validateRange,
  isValidPort,
  classifyBindError,
};

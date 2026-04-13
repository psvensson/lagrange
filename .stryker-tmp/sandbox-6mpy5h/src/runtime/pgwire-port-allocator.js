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
import { MIN_PORT, MAX_PORT } from '../constants/runtime.js';
import { TYPEOF } from '../constants/types.js';
import { BaseError } from '../utils/base-error.js';
import { PGWIRE_CONFIG_FIELD } from './pgwire-descriptor.js';
import { PORT_ALLOCATION_MODE, PGWIRE_DYNAMIC_PORT_RANGE_START, PGWIRE_DYNAMIC_PORT_RANGE_END, PGWIRE_PORT_ERROR, BIND_CONFLICT_CODE } from './pgwire-port-constants.js';

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
    if (stryMutAct_9fa48("147616")) {
      {}
    } else {
      stryCov_9fa48("147616");
      super(reason, stryMutAct_9fa48("147617") ? {} : (stryCov_9fa48("147617"), {
        context: stryMutAct_9fa48("147618") ? {} : (stryCov_9fa48("147618"), {
          component: stryMutAct_9fa48("147619") ? "" : (stryCov_9fa48("147619"), 'PgwirePortAllocator'),
          operation: stryMutAct_9fa48("147620") ? "" : (stryCov_9fa48("147620"), 'validate'),
          metadata
        })
      }));
    }
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
    if (stryMutAct_9fa48("147621")) {
      {}
    } else {
      stryCov_9fa48("147621");
      const msg = detail ? stryMutAct_9fa48("147622") ? `` : (stryCov_9fa48("147622"), `${PGWIRE_PORT_ERROR.BIND_CONFLICT}: port ${port} — ${detail}`) : stryMutAct_9fa48("147623") ? `` : (stryCov_9fa48("147623"), `${PGWIRE_PORT_ERROR.BIND_CONFLICT}: port ${port}`);
      super(msg, stryMutAct_9fa48("147624") ? {} : (stryCov_9fa48("147624"), {
        context: stryMutAct_9fa48("147625") ? {} : (stryCov_9fa48("147625"), {
          component: stryMutAct_9fa48("147626") ? "" : (stryCov_9fa48("147626"), 'PgwirePortAllocator'),
          operation: stryMutAct_9fa48("147627") ? "" : (stryCov_9fa48("147627"), 'bind'),
          metadata: stryMutAct_9fa48("147628") ? {} : (stryCov_9fa48("147628"), {
            port
          })
        })
      }));
      this.port = port;
      this.code = BIND_CONFLICT_CODE;
    }
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
  if (stryMutAct_9fa48("147629")) {
    {}
  } else {
    stryCov_9fa48("147629");
    return stryMutAct_9fa48("147632") ? typeof val === TYPEOF.NUMBER && Number.isInteger(val) && val >= MIN_PORT || val <= MAX_PORT : stryMutAct_9fa48("147631") ? false : stryMutAct_9fa48("147630") ? true : (stryCov_9fa48("147630", "147631", "147632"), (stryMutAct_9fa48("147634") ? typeof val === TYPEOF.NUMBER && Number.isInteger(val) || val >= MIN_PORT : stryMutAct_9fa48("147633") ? true : (stryCov_9fa48("147633", "147634"), (stryMutAct_9fa48("147636") ? typeof val === TYPEOF.NUMBER || Number.isInteger(val) : stryMutAct_9fa48("147635") ? true : (stryCov_9fa48("147635", "147636"), (stryMutAct_9fa48("147638") ? typeof val !== TYPEOF.NUMBER : stryMutAct_9fa48("147637") ? true : (stryCov_9fa48("147637", "147638"), typeof val === TYPEOF.NUMBER)) && Number.isInteger(val))) && (stryMutAct_9fa48("147641") ? val < MIN_PORT : stryMutAct_9fa48("147640") ? val > MIN_PORT : stryMutAct_9fa48("147639") ? true : (stryCov_9fa48("147639", "147640", "147641"), val >= MIN_PORT)))) && (stryMutAct_9fa48("147644") ? val > MAX_PORT : stryMutAct_9fa48("147643") ? val < MAX_PORT : stryMutAct_9fa48("147642") ? true : (stryCov_9fa48("147642", "147643", "147644"), val <= MAX_PORT)));
  }
}

/**
 * Validate a port number, throwing on failure.
 *
 * @param {*} port - Port to validate.
 * @throws {PortValidationError}
 */
function validatePort(port) {
  if (stryMutAct_9fa48("147645")) {
    {}
  } else {
    stryCov_9fa48("147645");
    if (stryMutAct_9fa48("147648") ? (typeof port !== TYPEOF.NUMBER || !Number.isInteger(port)) && port <= 0 : stryMutAct_9fa48("147647") ? false : stryMutAct_9fa48("147646") ? true : (stryCov_9fa48("147646", "147647", "147648"), (stryMutAct_9fa48("147650") ? typeof port !== TYPEOF.NUMBER && !Number.isInteger(port) : stryMutAct_9fa48("147649") ? false : (stryCov_9fa48("147649", "147650"), (stryMutAct_9fa48("147652") ? typeof port === TYPEOF.NUMBER : stryMutAct_9fa48("147651") ? false : (stryCov_9fa48("147651", "147652"), typeof port !== TYPEOF.NUMBER)) || (stryMutAct_9fa48("147653") ? Number.isInteger(port) : (stryCov_9fa48("147653"), !Number.isInteger(port))))) || (stryMutAct_9fa48("147656") ? port > 0 : stryMutAct_9fa48("147655") ? port < 0 : stryMutAct_9fa48("147654") ? false : (stryCov_9fa48("147654", "147655", "147656"), port <= 0)))) {
      if (stryMutAct_9fa48("147657")) {
        {}
      } else {
        stryCov_9fa48("147657");
        throw new PortValidationError(PGWIRE_PORT_ERROR.PORT_NOT_INTEGER, stryMutAct_9fa48("147658") ? {} : (stryCov_9fa48("147658"), {
          port
        }));
      }
    }
    if (stryMutAct_9fa48("147661") ? port < MIN_PORT && port > MAX_PORT : stryMutAct_9fa48("147660") ? false : stryMutAct_9fa48("147659") ? true : (stryCov_9fa48("147659", "147660", "147661"), (stryMutAct_9fa48("147664") ? port >= MIN_PORT : stryMutAct_9fa48("147663") ? port <= MIN_PORT : stryMutAct_9fa48("147662") ? false : (stryCov_9fa48("147662", "147663", "147664"), port < MIN_PORT)) || (stryMutAct_9fa48("147667") ? port <= MAX_PORT : stryMutAct_9fa48("147666") ? port >= MAX_PORT : stryMutAct_9fa48("147665") ? false : (stryCov_9fa48("147665", "147666", "147667"), port > MAX_PORT)))) {
      if (stryMutAct_9fa48("147668")) {
        {}
      } else {
        stryCov_9fa48("147668");
        throw new PortValidationError(PGWIRE_PORT_ERROR.PORT_OUT_OF_RANGE, stryMutAct_9fa48("147669") ? {} : (stryCov_9fa48("147669"), {
          port,
          min: MIN_PORT,
          max: MAX_PORT
        }));
      }
    }
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
  if (stryMutAct_9fa48("147670")) {
    {}
  } else {
    stryCov_9fa48("147670");
    if (stryMutAct_9fa48("147673") ? !isValidPort(start) && !isValidPort(end) : stryMutAct_9fa48("147672") ? false : stryMutAct_9fa48("147671") ? true : (stryCov_9fa48("147671", "147672", "147673"), (stryMutAct_9fa48("147674") ? isValidPort(start) : (stryCov_9fa48("147674"), !isValidPort(start))) || (stryMutAct_9fa48("147675") ? isValidPort(end) : (stryCov_9fa48("147675"), !isValidPort(end))))) {
      if (stryMutAct_9fa48("147676")) {
        {}
      } else {
        stryCov_9fa48("147676");
        throw new PortValidationError(PGWIRE_PORT_ERROR.RANGE_OUTSIDE_BOUNDS, stryMutAct_9fa48("147677") ? {} : (stryCov_9fa48("147677"), {
          start,
          end,
          min: MIN_PORT,
          max: MAX_PORT
        }));
      }
    }
    if (stryMutAct_9fa48("147681") ? start <= end : stryMutAct_9fa48("147680") ? start >= end : stryMutAct_9fa48("147679") ? false : stryMutAct_9fa48("147678") ? true : (stryCov_9fa48("147678", "147679", "147680", "147681"), start > end)) {
      if (stryMutAct_9fa48("147682")) {
        {}
      } else {
        stryCov_9fa48("147682");
        throw new PortValidationError(PGWIRE_PORT_ERROR.RANGE_START_AFTER_END, stryMutAct_9fa48("147683") ? {} : (stryCov_9fa48("147683"), {
          start,
          end
        }));
      }
    }
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
  if (stryMutAct_9fa48("147684")) {
    {}
  } else {
    stryCov_9fa48("147684");
    const hasFixedPort = PGWIRE_CONFIG_FIELD.PORT in config;
    const hasRange = stryMutAct_9fa48("147687") ? PGWIRE_CONFIG_FIELD.PORT_RANGE_START in config && PGWIRE_CONFIG_FIELD.PORT_RANGE_END in config : stryMutAct_9fa48("147686") ? false : stryMutAct_9fa48("147685") ? true : (stryCov_9fa48("147685", "147686", "147687"), PGWIRE_CONFIG_FIELD.PORT_RANGE_START in config || PGWIRE_CONFIG_FIELD.PORT_RANGE_END in config);
    if (stryMutAct_9fa48("147690") ? hasFixedPort || !hasRange : stryMutAct_9fa48("147689") ? false : stryMutAct_9fa48("147688") ? true : (stryCov_9fa48("147688", "147689", "147690"), hasFixedPort && (stryMutAct_9fa48("147691") ? hasRange : (stryCov_9fa48("147691"), !hasRange)))) {
      if (stryMutAct_9fa48("147692")) {
        {}
      } else {
        stryCov_9fa48("147692");
        return PORT_ALLOCATION_MODE.FIXED;
      }
    }
    return PORT_ALLOCATION_MODE.DYNAMIC;
  }
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
    if (stryMutAct_9fa48("147693")) {
      {}
    } else {
      stryCov_9fa48("147693");
      this._rangeStart = stryMutAct_9fa48("147694") ? options.dynamicRangeStart && PGWIRE_DYNAMIC_PORT_RANGE_START : (stryCov_9fa48("147694"), options.dynamicRangeStart ?? PGWIRE_DYNAMIC_PORT_RANGE_START);
      this._rangeEnd = stryMutAct_9fa48("147695") ? options.dynamicRangeEnd && PGWIRE_DYNAMIC_PORT_RANGE_END : (stryCov_9fa48("147695"), options.dynamicRangeEnd ?? PGWIRE_DYNAMIC_PORT_RANGE_END);
      validateRange(this._rangeStart, this._rangeEnd);

      /** @type {Map<string, number>} serviceId → port */
      this._allocated = new Map();
      /** @type {Map<number, string>} port → serviceId */
      this._portToService = new Map();
    }
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
    if (stryMutAct_9fa48("147696")) {
      {}
    } else {
      stryCov_9fa48("147696");
      if (stryMutAct_9fa48("147699") ? !serviceId && typeof serviceId !== TYPEOF.STRING : stryMutAct_9fa48("147698") ? false : stryMutAct_9fa48("147697") ? true : (stryCov_9fa48("147697", "147698", "147699"), (stryMutAct_9fa48("147700") ? serviceId : (stryCov_9fa48("147700"), !serviceId)) || (stryMutAct_9fa48("147702") ? typeof serviceId === TYPEOF.STRING : stryMutAct_9fa48("147701") ? false : (stryCov_9fa48("147701", "147702"), typeof serviceId !== TYPEOF.STRING)))) {
        if (stryMutAct_9fa48("147703")) {
          {}
        } else {
          stryCov_9fa48("147703");
          throw new PortValidationError(PGWIRE_PORT_ERROR.SERVICE_ID_REQUIRED);
        }
      }
      const existing = this._allocated.get(serviceId);
      if (stryMutAct_9fa48("147706") ? existing === undefined : stryMutAct_9fa48("147705") ? false : stryMutAct_9fa48("147704") ? true : (stryCov_9fa48("147704", "147705", "147706"), existing !== undefined)) {
        if (stryMutAct_9fa48("147707")) {
          {}
        } else {
          stryCov_9fa48("147707");
          return existing;
        }
      }
      const mode = resolveAllocationMode(config);
      if (stryMutAct_9fa48("147710") ? mode !== PORT_ALLOCATION_MODE.FIXED : stryMutAct_9fa48("147709") ? false : stryMutAct_9fa48("147708") ? true : (stryCov_9fa48("147708", "147709", "147710"), mode === PORT_ALLOCATION_MODE.FIXED)) {
        if (stryMutAct_9fa48("147711")) {
          {}
        } else {
          stryCov_9fa48("147711");
          const port = config[PGWIRE_CONFIG_FIELD.PORT];
          validatePort(port);
          this._allocated.set(serviceId, port);
          this._portToService.set(port, serviceId);
          return port;
        }
      }

      // DYNAMIC mode
      const start = stryMutAct_9fa48("147712") ? config[PGWIRE_CONFIG_FIELD.PORT_RANGE_START] && this._rangeStart : (stryCov_9fa48("147712"), config[PGWIRE_CONFIG_FIELD.PORT_RANGE_START] ?? this._rangeStart);
      const end = stryMutAct_9fa48("147713") ? config[PGWIRE_CONFIG_FIELD.PORT_RANGE_END] && this._rangeEnd : (stryCov_9fa48("147713"), config[PGWIRE_CONFIG_FIELD.PORT_RANGE_END] ?? this._rangeEnd);
      validateRange(start, end);
      for (let port = start; stryMutAct_9fa48("147716") ? port > end : stryMutAct_9fa48("147715") ? port < end : stryMutAct_9fa48("147714") ? false : (stryCov_9fa48("147714", "147715", "147716"), port <= end); stryMutAct_9fa48("147717") ? port-- : (stryCov_9fa48("147717"), port++)) {
        if (stryMutAct_9fa48("147718")) {
          {}
        } else {
          stryCov_9fa48("147718");
          if (stryMutAct_9fa48("147721") ? false : stryMutAct_9fa48("147720") ? true : stryMutAct_9fa48("147719") ? this._portToService.has(port) : (stryCov_9fa48("147719", "147720", "147721"), !this._portToService.has(port))) {
            if (stryMutAct_9fa48("147722")) {
              {}
            } else {
              stryCov_9fa48("147722");
              this._allocated.set(serviceId, port);
              this._portToService.set(port, serviceId);
              return port;
            }
          }
        }
      }
      throw new PortValidationError(PGWIRE_PORT_ERROR.NO_PORTS_AVAILABLE, stryMutAct_9fa48("147723") ? {} : (stryCov_9fa48("147723"), {
        rangeStart: start,
        rangeEnd: end
      }));
    }
  }

  /**
   * Release the port allocated to a service replica.
   * No-op if serviceId has no allocation.
   *
   * @param {string} serviceId - Service replica ID.
   */
  release(serviceId) {
    if (stryMutAct_9fa48("147724")) {
      {}
    } else {
      stryCov_9fa48("147724");
      const port = this._allocated.get(serviceId);
      if (stryMutAct_9fa48("147727") ? port === undefined : stryMutAct_9fa48("147726") ? false : stryMutAct_9fa48("147725") ? true : (stryCov_9fa48("147725", "147726", "147727"), port !== undefined)) {
        if (stryMutAct_9fa48("147728")) {
          {}
        } else {
          stryCov_9fa48("147728");
          this._allocated.delete(serviceId);
          this._portToService.delete(port);
        }
      }
    }
  }

  /**
   * Check whether a port is available for allocation.
   *
   * @param {number} port - Port number to check.
   * @return {boolean}
   */
  isAvailable(port) {
    if (stryMutAct_9fa48("147729")) {
      {}
    } else {
      stryCov_9fa48("147729");
      return stryMutAct_9fa48("147730") ? this._portToService.has(port) : (stryCov_9fa48("147730"), !this._portToService.has(port));
    }
  }

  /**
   * Get the port currently allocated to a service.
   *
   * @param {string} serviceId - Service replica ID.
   * @return {number|undefined} Allocated port or undefined.
   */
  getPort(serviceId) {
    if (stryMutAct_9fa48("147731")) {
      {}
    } else {
      stryCov_9fa48("147731");
      return this._allocated.get(serviceId);
    }
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
  if (stryMutAct_9fa48("147732")) {
    {}
  } else {
    stryCov_9fa48("147732");
    if (stryMutAct_9fa48("147735") ? err || err.code === BIND_CONFLICT_CODE : stryMutAct_9fa48("147734") ? false : stryMutAct_9fa48("147733") ? true : (stryCov_9fa48("147733", "147734", "147735"), err && (stryMutAct_9fa48("147737") ? err.code !== BIND_CONFLICT_CODE : stryMutAct_9fa48("147736") ? true : (stryCov_9fa48("147736", "147737"), err.code === BIND_CONFLICT_CODE)))) {
      if (stryMutAct_9fa48("147738")) {
        {}
      } else {
        stryCov_9fa48("147738");
        return new PortBindConflictError(port, err.message);
      }
    }
    return err;
  }
}
export { PgwirePortAllocator, PortValidationError, PortBindConflictError, resolveAllocationMode, validatePort, validateRange, isValidPort, classifyBindError };
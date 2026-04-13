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
import { ALLOWED_RUNTIME_KINDS } from '../constants/runtime.js';
import { TYPEOF } from '../constants/types.js';
import { DriverNotImplementedError } from './runtime-driver-errors.js';

// --- Result status constants ---

const VALIDATION_STATUS = Object.freeze(stryMutAct_9fa48("148647") ? {} : (stryCov_9fa48("148647"), {
  VALID: stryMutAct_9fa48("148648") ? "" : (stryCov_9fa48("148648"), 'valid'),
  INVALID: stryMutAct_9fa48("148649") ? "" : (stryCov_9fa48("148649"), 'invalid')
}));
const PREPARE_STATUS = Object.freeze(stryMutAct_9fa48("148650") ? {} : (stryCov_9fa48("148650"), {
  READY: stryMutAct_9fa48("148651") ? "" : (stryCov_9fa48("148651"), 'ready'),
  FAILED: stryMutAct_9fa48("148652") ? "" : (stryCov_9fa48("148652"), 'failed')
}));
const START_STATUS = Object.freeze(stryMutAct_9fa48("148653") ? {} : (stryCov_9fa48("148653"), {
  RUNNING: stryMutAct_9fa48("148654") ? "" : (stryCov_9fa48("148654"), 'running'),
  FAILED: stryMutAct_9fa48("148655") ? "" : (stryCov_9fa48("148655"), 'failed')
}));
const HEALTH_STATUS = Object.freeze(stryMutAct_9fa48("148656") ? {} : (stryCov_9fa48("148656"), {
  HEALTHY: stryMutAct_9fa48("148657") ? "" : (stryCov_9fa48("148657"), 'healthy'),
  UNHEALTHY: stryMutAct_9fa48("148658") ? "" : (stryCov_9fa48("148658"), 'unhealthy'),
  UNKNOWN: stryMutAct_9fa48("148659") ? "" : (stryCov_9fa48("148659"), 'unknown')
}));

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
    if (stryMutAct_9fa48("148660")) {
      {}
    } else {
      stryCov_9fa48("148660");
      if (stryMutAct_9fa48("148663") ? new.target !== RuntimeDriver : stryMutAct_9fa48("148662") ? false : stryMutAct_9fa48("148661") ? true : (stryCov_9fa48("148661", "148662", "148663"), new.target === RuntimeDriver)) {
        if (stryMutAct_9fa48("148664")) {
          {}
        } else {
          stryCov_9fa48("148664");
          throw new Error(stryMutAct_9fa48("148665") ? "" : (stryCov_9fa48("148665"), 'RuntimeDriver is abstract and cannot be instantiated directly'));
        }
      }
      if (stryMutAct_9fa48("148668") ? typeof kind !== TYPEOF.STRING && !ALLOWED_RUNTIME_KINDS.has(kind) : stryMutAct_9fa48("148667") ? false : stryMutAct_9fa48("148666") ? true : (stryCov_9fa48("148666", "148667", "148668"), (stryMutAct_9fa48("148670") ? typeof kind === TYPEOF.STRING : stryMutAct_9fa48("148669") ? false : (stryCov_9fa48("148669", "148670"), typeof kind !== TYPEOF.STRING)) || (stryMutAct_9fa48("148671") ? ALLOWED_RUNTIME_KINDS.has(kind) : (stryCov_9fa48("148671"), !ALLOWED_RUNTIME_KINDS.has(kind))))) {
        if (stryMutAct_9fa48("148672")) {
          {}
        } else {
          stryCov_9fa48("148672");
          throw new Error(stryMutAct_9fa48("148673") ? `` : (stryCov_9fa48("148673"), `RuntimeDriver requires a valid runtime kind, got '${kind}'`));
        }
      }

      /**
       * The runtime kind this driver handles.
       * @type {string}
       * @readonly
       */
      this.kind = kind;
      Object.defineProperty(this, stryMutAct_9fa48("148674") ? "" : (stryCov_9fa48("148674"), 'kind'), stryMutAct_9fa48("148675") ? {} : (stryCov_9fa48("148675"), {
        writable: stryMutAct_9fa48("148676") ? true : (stryCov_9fa48("148676"), false),
        configurable: stryMutAct_9fa48("148677") ? true : (stryCov_9fa48("148677"), false)
      }));
    }
  }

  /**
   * Validate a service definition's runtime descriptor.
   *
   * @param {Object} definition - The service definition to validate.
   * @return {{valid: boolean, errors?: string[]}} Validation result.
   * @abstract
   */
  validateDescriptor(_definition) {
    if (stryMutAct_9fa48("148678")) {
      {}
    } else {
      stryCov_9fa48("148678");
      throw new DriverNotImplementedError(this.kind, stryMutAct_9fa48("148679") ? "" : (stryCov_9fa48("148679"), 'validateDescriptor'));
    }
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
    if (stryMutAct_9fa48("148680")) {
      {}
    } else {
      stryCov_9fa48("148680");
      throw new DriverNotImplementedError(this.kind, stryMutAct_9fa48("148681") ? "" : (stryCov_9fa48("148681"), 'prepare'));
    }
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
    if (stryMutAct_9fa48("148682")) {
      {}
    } else {
      stryCov_9fa48("148682");
      throw new DriverNotImplementedError(this.kind, stryMutAct_9fa48("148683") ? "" : (stryCov_9fa48("148683"), 'start'));
    }
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
    if (stryMutAct_9fa48("148684")) {
      {}
    } else {
      stryCov_9fa48("148684");
      throw new DriverNotImplementedError(this.kind, stryMutAct_9fa48("148685") ? "" : (stryCov_9fa48("148685"), 'stop'));
    }
  }

  /**
   * Check health of a service replica.
   *
   * @param {Object} replicaContext - Replica execution context.
   * @return {Promise<{status: string, detail?: string}>} Health result.
   * @abstract
   */
  async health(_replicaContext) {
    if (stryMutAct_9fa48("148686")) {
      {}
    } else {
      stryCov_9fa48("148686");
      throw new DriverNotImplementedError(this.kind, stryMutAct_9fa48("148687") ? "" : (stryCov_9fa48("148687"), 'health'));
    }
  }
}
export { RuntimeDriver, VALIDATION_STATUS, PREPARE_STATUS, START_STATUS, HEALTH_STATUS };
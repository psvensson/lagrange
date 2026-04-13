/**
 * PortAllocator — node-level port allocation for WASM service
 * replicas. Each replica requests a communication port from
 * this allocator when it starts, and releases it on shutdown.
 *
 * Allocation is idempotent: calling allocate() with the same
 * serviceId returns the previously allocated port.
 *
 * Requirements: 8.1, 8.3
 * @module wasm-service/port-allocator
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
import { WASM_SERVICE_ERROR_MSG, WASM_SERVICE_DEFAULT } from './wasm-service-constants.js';

/**
 * Manages port allocation for WASM service replicas on a
 * single node. Ports are drawn from a configurable range
 * [portRangeStart, portRangeEnd].
 */
class PortAllocator {
  /**
   * @param {Object} [options] - Configuration options.
   * @param {number} [options.portRangeStart] - First port in
   *   the allocatable range (inclusive).
   * @param {number} [options.portRangeEnd] - Last port in
   *   the allocatable range (inclusive).
   */
  constructor(options = {}) {
    if (stryMutAct_9fa48("162549")) {
      {}
    } else {
      stryCov_9fa48("162549");
      this.portRangeStart = stryMutAct_9fa48("162550") ? options.portRangeStart && WASM_SERVICE_DEFAULT.PORT_RANGE_START : (stryCov_9fa48("162550"), options.portRangeStart ?? WASM_SERVICE_DEFAULT.PORT_RANGE_START);
      this.portRangeEnd = stryMutAct_9fa48("162551") ? options.portRangeEnd && WASM_SERVICE_DEFAULT.PORT_RANGE_END : (stryCov_9fa48("162551"), options.portRangeEnd ?? WASM_SERVICE_DEFAULT.PORT_RANGE_END);
      this.allocatedPorts = new Map();
      this._portToService = new Map();
    }
  }

  /**
   * Allocate a port for a service replica. If the serviceId
   * already has a port allocated, returns the existing port
   * (idempotent). Otherwise finds the next available port in
   * the range.
   *
   * @param {string} serviceId - Unique service replica ID.
   * @return {number} The allocated port number.
   * @throws {Error} If no ports are available in the range.
   */
  allocate(serviceId) {
    if (stryMutAct_9fa48("162552")) {
      {}
    } else {
      stryCov_9fa48("162552");
      const existing = this.allocatedPorts.get(serviceId);
      if (stryMutAct_9fa48("162555") ? existing === undefined : stryMutAct_9fa48("162554") ? false : stryMutAct_9fa48("162553") ? true : (stryCov_9fa48("162553", "162554", "162555"), existing !== undefined)) {
        if (stryMutAct_9fa48("162556")) {
          {}
        } else {
          stryCov_9fa48("162556");
          return existing;
        }
      }
      for (let port = this.portRangeStart; stryMutAct_9fa48("162559") ? port > this.portRangeEnd : stryMutAct_9fa48("162558") ? port < this.portRangeEnd : stryMutAct_9fa48("162557") ? false : (stryCov_9fa48("162557", "162558", "162559"), port <= this.portRangeEnd); stryMutAct_9fa48("162560") ? port-- : (stryCov_9fa48("162560"), port++)) {
        if (stryMutAct_9fa48("162561")) {
          {}
        } else {
          stryCov_9fa48("162561");
          if (stryMutAct_9fa48("162564") ? false : stryMutAct_9fa48("162563") ? true : stryMutAct_9fa48("162562") ? this._portToService.has(port) : (stryCov_9fa48("162562", "162563", "162564"), !this._portToService.has(port))) {
            if (stryMutAct_9fa48("162565")) {
              {}
            } else {
              stryCov_9fa48("162565");
              this.allocatedPorts.set(serviceId, port);
              this._portToService.set(port, serviceId);
              return port;
            }
          }
        }
      }
      throw new Error(WASM_SERVICE_ERROR_MSG.PORT_EXHAUSTED);
    }
  }

  /**
   * Release the port allocated to a service replica. Safe to
   * call with a serviceId that has no allocation (no-op).
   *
   * @param {string} serviceId - Service replica ID to release.
   */
  release(serviceId) {
    if (stryMutAct_9fa48("162566")) {
      {}
    } else {
      stryCov_9fa48("162566");
      const port = this.allocatedPorts.get(serviceId);
      if (stryMutAct_9fa48("162569") ? port === undefined : stryMutAct_9fa48("162568") ? false : stryMutAct_9fa48("162567") ? true : (stryCov_9fa48("162567", "162568", "162569"), port !== undefined)) {
        if (stryMutAct_9fa48("162570")) {
          {}
        } else {
          stryCov_9fa48("162570");
          this.allocatedPorts.delete(serviceId);
          this._portToService.delete(port);
        }
      }
    }
  }

  /**
   * Check whether a specific port number is available for
   * allocation.
   *
   * @param {number} port - Port number to check.
   * @return {boolean} True if the port is not currently
   *   allocated to any service.
   */
  isAvailable(port) {
    if (stryMutAct_9fa48("162571")) {
      {}
    } else {
      stryCov_9fa48("162571");
      return stryMutAct_9fa48("162572") ? this._portToService.has(port) : (stryCov_9fa48("162572"), !this._portToService.has(port));
    }
  }
}
export { PortAllocator };
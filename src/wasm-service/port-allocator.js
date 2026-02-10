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

import {
  WASM_SERVICE_ERROR_MSG,
  WASM_SERVICE_DEFAULT,
} from './wasm-service-constants.js';

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
    this.portRangeStart = options.portRangeStart ??
      WASM_SERVICE_DEFAULT.PORT_RANGE_START;
    this.portRangeEnd = options.portRangeEnd ??
      WASM_SERVICE_DEFAULT.PORT_RANGE_END;
    this.allocatedPorts = new Map();
    this._portToService = new Map();
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
    const existing = this.allocatedPorts.get(serviceId);
    if (existing !== undefined) {
      return existing;
    }

    for (
      let port = this.portRangeStart;
      port <= this.portRangeEnd;
      port++
    ) {
      if (!this._portToService.has(port)) {
        this.allocatedPorts.set(serviceId, port);
        this._portToService.set(port, serviceId);
        return port;
      }
    }

    throw new Error(WASM_SERVICE_ERROR_MSG.PORT_EXHAUSTED);
  }

  /**
   * Release the port allocated to a service replica. Safe to
   * call with a serviceId that has no allocation (no-op).
   *
   * @param {string} serviceId - Service replica ID to release.
   */
  release(serviceId) {
    const port = this.allocatedPorts.get(serviceId);
    if (port !== undefined) {
      this.allocatedPorts.delete(serviceId);
      this._portToService.delete(port);
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
    return !this._portToService.has(port);
  }
}

export {PortAllocator};

/**
 * Abstract contract for service-type lifecycle adapters.
 */

import {
  ServiceTypeAdapterNotImplementedError,
  assertKnownServiceType,
} from './service-lifecycle-errors.js';

class ServiceTypeAdapter {
  /**
   * @param {string} serviceType
   */
  constructor(serviceType) {
    if (new.target === ServiceTypeAdapter) {
      throw new Error(
        'ServiceTypeAdapter is abstract and cannot be instantiated directly',
      );
    }

    this.serviceType = assertKnownServiceType(serviceType);
    Object.defineProperty(this, 'serviceType', {
      writable: false,
      configurable: false,
    });
  }

  /**
   * @param {Object} _definition
   * @return {{valid: boolean, errors?: string[]}}
   */
  validateDefinition(_definition) {
    throw new ServiceTypeAdapterNotImplementedError(
      this.serviceType,
      'validateDefinition',
    );
  }

  /**
   * @param {Object} _context
   * @return {Promise<Object>}
   */
  async createReplica(_context) {
    throw new ServiceTypeAdapterNotImplementedError(
      this.serviceType,
      'createReplica',
    );
  }

  /**
   * @param {Object} _replicaHandle
   * @param {Object} _context
   * @return {Promise<Object>}
   */
  async startReplica(_replicaHandle, _context) {
    throw new ServiceTypeAdapterNotImplementedError(
      this.serviceType,
      'startReplica',
    );
  }

  /**
   * @param {Object} _replicaHandle
   * @param {Object} _context
   * @return {Promise<Object>}
   */
  async stopReplica(_replicaHandle, _context) {
    throw new ServiceTypeAdapterNotImplementedError(
      this.serviceType,
      'stopReplica',
    );
  }

  /**
   * @param {Object} _replicaHandle
   * @param {Object} _context
   * @return {Promise<Object>}
   */
  async health(_replicaHandle, _context) {
    throw new ServiceTypeAdapterNotImplementedError(
      this.serviceType,
      'health',
    );
  }
}

export {ServiceTypeAdapter};

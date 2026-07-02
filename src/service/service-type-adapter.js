/**
 * Abstract contract for service-type lifecycle adapters.
 */

import {
  ServiceTypeAdapterNotImplementedError,
  assertKnownServiceType,
} from './service-lifecycle-errors.js';

const LOCAL_STR_SERVICETYPEADAPTER_IS_ABSTRACT_AND_CANNO = 'ServiceTypeAdapter is abstract and cannot be instantiated directly';
const LOCAL_STR_SERVICETYPE = 'serviceType';
const LOCAL_STR_VALIDATEDEFINITION = 'validateDefinition';
const LOCAL_STR_CREATEREPLICA = 'createReplica';
const LOCAL_STR_STARTREPLICA = 'startReplica';
const LOCAL_STR_STOPREPLICA = 'stopReplica';
const LOCAL_STR_HEALTH = 'health';

class ServiceTypeAdapter {
  /**
   * @param {string} serviceType
   */
  constructor(serviceType) {
    if (new.target === ServiceTypeAdapter) {
      throw new Error(
        LOCAL_STR_SERVICETYPEADAPTER_IS_ABSTRACT_AND_CANNO,
      );
    }

    this.serviceType = assertKnownServiceType(serviceType);
    Object.defineProperty(this, LOCAL_STR_SERVICETYPE, {
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
      LOCAL_STR_VALIDATEDEFINITION,
    );
  }

  /**
   * @param {Object} _context
   * @return {Promise<Object>}
   */
  async createReplica(_context) {
    throw new ServiceTypeAdapterNotImplementedError(
      this.serviceType,
      LOCAL_STR_CREATEREPLICA,
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
      LOCAL_STR_STARTREPLICA,
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
      LOCAL_STR_STOPREPLICA,
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
      LOCAL_STR_HEALTH,
    );
  }
}

export {ServiceTypeAdapter};

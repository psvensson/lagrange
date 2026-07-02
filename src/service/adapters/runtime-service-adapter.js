/**
 * Service-type adapter for runtime-backed userland services.
 */

import {
  RUNTIME_FIELD,
  UNIFIED_SERVICE_TYPE,
} from '../../constants/index.js';
import {validateRuntimeDescriptor} from '../../wasm-service/runtime-descriptor-validator.js';
import {ServiceTypeAdapter} from '../service-type-adapter.js';

const RUNTIME_ADAPTER_ERROR = Object.freeze({
  LIFECYCLE_REQUIRED:
    'runtime adapter requires serviceRuntimeLifecycle with prepare/start/stop/health',
});

function hasRuntimeLifecycleContract(serviceRuntimeLifecycle) {
  return serviceRuntimeLifecycle &&
    typeof serviceRuntimeLifecycle.prepare === 'function' &&
    typeof serviceRuntimeLifecycle.start === 'function' &&
    typeof serviceRuntimeLifecycle.stop === 'function' &&
    typeof serviceRuntimeLifecycle.health === 'function';
}

class RuntimeServiceAdapter extends ServiceTypeAdapter {
  /**
   * @param {Object} options
   * @param {Object} options.serviceRuntimeLifecycle
   */
  constructor(options = {}) {
    super(UNIFIED_SERVICE_TYPE.RUNTIME_SERVICE);

    if (!hasRuntimeLifecycleContract(options.serviceRuntimeLifecycle)) {
      throw new TypeError(RUNTIME_ADAPTER_ERROR.LIFECYCLE_REQUIRED);
    }

    this._serviceRuntimeLifecycle = options.serviceRuntimeLifecycle;
  }

  /**
   * @param {Object} definition
   * @return {{valid: boolean, errors?: string[]}}
   */
  validateDefinition(definition) {
    const validation = validateRuntimeDescriptor({
      runtimeKind: definition?.[RUNTIME_FIELD.RUNTIME_KIND],
      runtimeRef: definition?.[RUNTIME_FIELD.RUNTIME_REF] || null,
      runtimeConfig: definition?.[RUNTIME_FIELD.RUNTIME_CONFIG] || null,
    });

    if (!validation.valid) {
      return {valid: false, errors: validation.errors};
    }
    return {valid: true};
  }

  /**
   * Runtime create maps to runtime prepare.
   *
   * @param {Object} context
   * @return {Promise<Object>}
   */
  async createReplica(context) {
    const definition = context?.definition || context;
    return this._serviceRuntimeLifecycle.prepare(definition, context);
  }

  /**
   * @param {Object} replicaHandle
   * @param {Object} _context
   * @return {Promise<Object>}
   */
  async startReplica(replicaHandle, _context) {
    return this._serviceRuntimeLifecycle.start(replicaHandle);
  }

  /**
   * @param {Object} replicaHandle
   * @param {Object} _context
   * @return {Promise<Object>}
   */
  async stopReplica(replicaHandle, _context) {
    return this._serviceRuntimeLifecycle.stop(replicaHandle);
  }

  /**
   * @param {Object} replicaHandle
   * @param {Object} _context
   * @return {Promise<Object>}
   */
  async health(replicaHandle, _context) {
    return this._serviceRuntimeLifecycle.health(replicaHandle);
  }
}

export {RuntimeServiceAdapter};

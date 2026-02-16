/**
 * Service-type adapter for message-group replicas.
 */

import {
  SERVICE_LIFECYCLE_STATE,
  TYPEOF,
  UNIFIED_SERVICE_TYPE,
} from '../../constants/index.js';
import {ServiceTypeAdapter} from '../service-type-adapter.js';

const MESSAGE_GROUP_ADAPTER_ERROR = Object.freeze({
  CREATE_REQUIRED: 'message-group adapter requires createReplica hook',
  START_REQUIRED: 'message-group adapter requires startReplica hook',
  STOP_REQUIRED: 'message-group adapter requires stopReplica hook',
  HOOK_MUST_BE_FUNCTION: 'adapter hook must be a function',
});

function assertFunctionHook(value, errorMessage) {
  if (typeof value !== TYPEOF.FUNCTION) {
    throw new TypeError(errorMessage);
  }
}

class MessageGroupServiceAdapter extends ServiceTypeAdapter {
  /**
   * @param {Object} hooks
   * @param {Function} hooks.createReplica
   * @param {Function} hooks.startReplica
   * @param {Function} hooks.stopReplica
   * @param {Function} [hooks.validateDefinition]
   * @param {Function} [hooks.health]
   */
  constructor(hooks = {}) {
    super(UNIFIED_SERVICE_TYPE.MESSAGE_GROUP);

    assertFunctionHook(
      hooks.createReplica,
      MESSAGE_GROUP_ADAPTER_ERROR.CREATE_REQUIRED,
    );
    assertFunctionHook(
      hooks.startReplica,
      MESSAGE_GROUP_ADAPTER_ERROR.START_REQUIRED,
    );
    assertFunctionHook(
      hooks.stopReplica,
      MESSAGE_GROUP_ADAPTER_ERROR.STOP_REQUIRED,
    );

    if (hooks.validateDefinition &&
      typeof hooks.validateDefinition !== TYPEOF.FUNCTION) {
      throw new TypeError(MESSAGE_GROUP_ADAPTER_ERROR.HOOK_MUST_BE_FUNCTION);
    }

    if (hooks.health && typeof hooks.health !== TYPEOF.FUNCTION) {
      throw new TypeError(MESSAGE_GROUP_ADAPTER_ERROR.HOOK_MUST_BE_FUNCTION);
    }

    this._hooks = {
      validateDefinition: hooks.validateDefinition || ((_definition) => ({valid: true})),
      createReplica: hooks.createReplica,
      startReplica: hooks.startReplica,
      stopReplica: hooks.stopReplica,
      health: hooks.health ||
        (async (_replicaHandle, _context) => ({
          status: SERVICE_LIFECYCLE_STATE.RUNNING,
        })),
    };
  }

  /**
   * @param {Object} definition
   * @return {{valid: boolean, errors?: string[]}}
   */
  validateDefinition(definition) {
    return this._hooks.validateDefinition(definition);
  }

  /**
   * @param {Object} context
   * @return {Promise<Object>}
   */
  async createReplica(context) {
    return this._hooks.createReplica(context);
  }

  /**
   * @param {Object} replicaHandle
   * @param {Object} context
   * @return {Promise<Object>}
   */
  async startReplica(replicaHandle, context) {
    return this._hooks.startReplica(replicaHandle, context);
  }

  /**
   * @param {Object} replicaHandle
   * @param {Object} context
   * @return {Promise<Object>}
   */
  async stopReplica(replicaHandle, context) {
    return this._hooks.stopReplica(replicaHandle, context);
  }

  /**
   * @param {Object} replicaHandle
   * @param {Object} context
   * @return {Promise<Object>}
   */
  async health(replicaHandle, context) {
    return this._hooks.health(replicaHandle, context);
  }
}

export {MessageGroupServiceAdapter};

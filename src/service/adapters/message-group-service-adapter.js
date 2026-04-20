/**
 * Service-type adapter for message-group replicas.
 */

import {
  UNIFIED_SERVICE_TYPE,
} from '../../constants/index.js';
import {HookBackedServiceAdapter} from './hook-backed-service-adapter.js';

const MESSAGE_GROUP_ADAPTER_ERROR = Object.freeze({
  CREATE_REQUIRED: 'message-group adapter requires createReplica hook',
  START_REQUIRED: 'message-group adapter requires startReplica hook',
  STOP_REQUIRED: 'message-group adapter requires stopReplica hook',
  HOOK_MUST_BE_FUNCTION: 'adapter hook must be a function',
});

class MessageGroupServiceAdapter extends HookBackedServiceAdapter {
  /**
   * @param {Object} hooks
   * @param {Function} hooks.createReplica
   * @param {Function} hooks.startReplica
   * @param {Function} hooks.stopReplica
   * @param {Function} [hooks.validateDefinition]
   * @param {Function} [hooks.health]
   */
  constructor(hooks = {}) {
    super(
      UNIFIED_SERVICE_TYPE.MESSAGE_GROUP,
      hooks,
      MESSAGE_GROUP_ADAPTER_ERROR,
    );
  }
}

export {MessageGroupServiceAdapter};

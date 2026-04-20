/**
 * Service-type adapter for partition replicas.
 */

import {
  UNIFIED_SERVICE_TYPE,
} from '../../constants/index.js';
import {HookBackedServiceAdapter} from './hook-backed-service-adapter.js';

const PARTITION_ADAPTER_ERROR = Object.freeze({
  CREATE_REQUIRED: 'partition adapter requires createReplica hook',
  START_REQUIRED: 'partition adapter requires startReplica hook',
  STOP_REQUIRED: 'partition adapter requires stopReplica hook',
  HOOK_MUST_BE_FUNCTION: 'adapter hook must be a function',
});

class PartitionServiceAdapter extends HookBackedServiceAdapter {
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
      UNIFIED_SERVICE_TYPE.PARTITION,
      hooks,
      PARTITION_ADAPTER_ERROR,
    );
  }
}

export {PartitionServiceAdapter};

import {
  SERVICE_LIFECYCLE_STATE,
  TYPEOF,
} from '../../constants/index.js';
import {ServiceTypeAdapter} from '../service-type-adapter.js';

const HOOK_BACKED_ADAPTER_HOOK = Object.freeze({
  CREATE_REPLICA: 'createReplica',
  START_REPLICA: 'startReplica',
  STOP_REPLICA: 'stopReplica',
  VALIDATE_DEFINITION: 'validateDefinition',
  HEALTH: 'health',
});

const HOOK_BACKED_ADAPTER_VALIDATION_RESULT = Object.freeze({
  valid: true,
});

const HOOK_BACKED_ADAPTER_RUNNING_HEALTH = Object.freeze({
  status: SERVICE_LIFECYCLE_STATE.RUNNING,
});

function assertRequiredFunctionHook(value, errorMessage) {
  if (typeof value !== TYPEOF.FUNCTION) {
    throw new TypeError(errorMessage);
  }
}

function assertOptionalFunctionHook(value, errorMessage) {
  if (typeof value !== TYPEOF.UNDEFINED && typeof value !== TYPEOF.FUNCTION) {
    throw new TypeError(errorMessage);
  }
}

function buildHookBackedAdapterHooks(hooks, errorMessages) {
  assertRequiredFunctionHook(
    hooks[HOOK_BACKED_ADAPTER_HOOK.CREATE_REPLICA],
    errorMessages.CREATE_REQUIRED,
  );
  assertRequiredFunctionHook(
    hooks[HOOK_BACKED_ADAPTER_HOOK.START_REPLICA],
    errorMessages.START_REQUIRED,
  );
  assertRequiredFunctionHook(
    hooks[HOOK_BACKED_ADAPTER_HOOK.STOP_REPLICA],
    errorMessages.STOP_REQUIRED,
  );
  assertOptionalFunctionHook(
    hooks[HOOK_BACKED_ADAPTER_HOOK.VALIDATE_DEFINITION],
    errorMessages.HOOK_MUST_BE_FUNCTION,
  );
  assertOptionalFunctionHook(
    hooks[HOOK_BACKED_ADAPTER_HOOK.HEALTH],
    errorMessages.HOOK_MUST_BE_FUNCTION,
  );

  return {
    validateDefinition: hooks.validateDefinition || defaultValidateDefinition,
    createReplica: hooks.createReplica,
    startReplica: hooks.startReplica,
    stopReplica: hooks.stopReplica,
    health: hooks.health || defaultHealth,
  };
}

function defaultValidateDefinition(_definition) {
  return HOOK_BACKED_ADAPTER_VALIDATION_RESULT;
}

async function defaultHealth(_replicaHandle, _context) {
  return HOOK_BACKED_ADAPTER_RUNNING_HEALTH;
}

class HookBackedServiceAdapter extends ServiceTypeAdapter {
  /**
   * @param {string} serviceType
   * @param {Object} hooks
   * @param {Object} errorMessages
   */
  constructor(serviceType, hooks = {}, errorMessages) {
    super(serviceType);
    this._hooks = buildHookBackedAdapterHooks(hooks, errorMessages);
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

export {HookBackedServiceAdapter};

/**
 * Joining phase owner registry.
 *
 * Canonical owner call path for joining-node pipeline phases.
 * The NodeJoiningService orchestration boundary executes through this registry.
 */

import {assertCritical} from '../../utils/assert.js';


const LOCAL_STR_NODEJOININGSERVICE_IS_REQUIRED_FOR_JOINI = 'NodeJoiningService is required for joining phase owners';

const JOIN_PHASE_OWNER = Object.freeze({
  CONTACT_SEED: 'contactSeed',
  CONNECT_WEBSOCKET: 'connectWebSocket',
  CREATE_SELF_HOSTED_MESSAGE_GROUP: 'createSelfHostedMessageGroup',
  JOIN_EXISTING_MESSAGE_GROUP: 'joinExistingMessageGroup',
  WAIT_FOR_LEADERSHIP: 'waitForLeadership',
  QUERY_SYSTEM_STATE: 'querySystemState',
});

const PHASE_OWNER_FIELD = Object.freeze({
  [JOIN_PHASE_OWNER.CONTACT_SEED]: 'contactSeedPhase',
  [JOIN_PHASE_OWNER.CONNECT_WEBSOCKET]: 'connectWebSocketPhase',
  [JOIN_PHASE_OWNER.CREATE_SELF_HOSTED_MESSAGE_GROUP]:
    'createMessageGroupPhase',
  [JOIN_PHASE_OWNER.JOIN_EXISTING_MESSAGE_GROUP]:
    'joinMessageGroupRuntimeOwner',
  [JOIN_PHASE_OWNER.WAIT_FOR_LEADERSHIP]: 'waitForLeadershipPhase',
  [JOIN_PHASE_OWNER.QUERY_SYSTEM_STATE]: 'querySystemStatePhase',
});

const PHASE_METHOD = Object.freeze({
  [JOIN_PHASE_OWNER.CONTACT_SEED]: 'phaseContactSeed',
  [JOIN_PHASE_OWNER.CONNECT_WEBSOCKET]: 'phaseConnectWebSocket',
  [JOIN_PHASE_OWNER.CREATE_SELF_HOSTED_MESSAGE_GROUP]:
    'phaseCreateSelfHostedMessageGroup',
  [JOIN_PHASE_OWNER.JOIN_EXISTING_MESSAGE_GROUP]:
    'phaseJoinExistingMessageGroup',
  [JOIN_PHASE_OWNER.WAIT_FOR_LEADERSHIP]: 'phaseWaitForLeadership',
  [JOIN_PHASE_OWNER.QUERY_SYSTEM_STATE]: 'phaseQuerySystemState',
});

const OWNER_ERROR_MSG = Object.freeze({
  missingPhaseOwner: (ownerField) =>
    `Phase owner not initialized: ${ownerField}`,
});

/**
 * Create direct phase-owner invoker.
 * Routes through the extracted phase owner module rather than
 * back through wrapper methods on NodeJoiningService.
 *
 * Compatibility: if one test or local caller explicitly monkey-patches the
 * instance wrapper method, honor that override. The default runtime path still
 * routes directly to the extracted phase owner.
 * @param {Object} service - NodeJoiningService instance.
 * @param {string} ownerField - Phase owner field name on service.
 * @param {string} methodName - Phase method name on the owner.
 * @return {Function} Owner invoker.
 * @private
 */
function createPhaseInvoker(service, ownerField, methodName) {
  return async (...args) => {
    const patchedWrapper = Object.prototype.hasOwnProperty.call(
      service,
      methodName,
    ) &&
      service[methodName] !== Object.getPrototypeOf(service)?.[methodName];
    if (patchedWrapper) {
      return service[methodName](...args);
    }

    const owner = service[ownerField];
    assertCritical(
      owner,
      OWNER_ERROR_MSG.missingPhaseOwner(ownerField),
    );
    return owner[methodName](...args);
  };
}

/**
 * Create canonical joining phase owners.
 * @param {Object} service - NodeJoiningService.
 * @return {Object<string, Function>} Joining phase owner registry.
 */
function createJoiningPhaseOwners(service) {
  assertCritical(service, LOCAL_STR_NODEJOININGSERVICE_IS_REQUIRED_FOR_JOINI);

  const owners = {};
  for (const key of Object.values(JOIN_PHASE_OWNER)) {
    owners[key] = createPhaseInvoker(
      service,
      PHASE_OWNER_FIELD[key],
      PHASE_METHOD[key],
    );
  }
  return Object.freeze(owners);
}

export {JOIN_PHASE_OWNER, createJoiningPhaseOwners};

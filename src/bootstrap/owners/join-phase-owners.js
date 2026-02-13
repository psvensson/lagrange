/**
 * Joining phase owner registry.
 *
 * Canonical owner call path for joining-node pipeline phases.
 * The NodeJoiningService orchestration boundary executes through this registry.
 */

import {assertCritical} from '../../utils/assert.js';
import {TYPEOF} from '../../constants/index.js';

const JOIN_PHASE_OWNER = Object.freeze({
  CONTACT_SEED: 'contactSeed',
  CONNECT_WEBSOCKET: 'connectWebSocket',
  CREATE_SELF_HOSTED_MESSAGE_GROUP: 'createSelfHostedMessageGroup',
  JOIN_EXISTING_MESSAGE_GROUP: 'joinExistingMessageGroup',
  WAIT_FOR_LEADERSHIP: 'waitForLeadership',
  QUERY_SYSTEM_STATE: 'querySystemState',
});

const OWNER_ERROR_MSG = Object.freeze({
  missingMethod: (methodName) =>
    `NodeJoiningService owner method missing: ${methodName}`,
});

/**
 * Create dynamic owner invoker.
 * Looks up the method at execution time so tests can monkey-patch phase methods.
 * @param {Object} service - NodeJoiningService instance.
 * @param {string} methodName - Method name.
 * @return {Function} Owner invoker.
 * @private
 */
function createOwnerInvoker(service, methodName) {
  return async (...args) => {
    const phaseFn = service[methodName];
    assertCritical(
      typeof phaseFn === TYPEOF.FUNCTION,
      OWNER_ERROR_MSG.missingMethod(methodName),
    );
    return phaseFn.apply(service, args);
  };
}

/**
 * Create canonical joining phase owners.
 * @param {Object} service - NodeJoiningService.
 * @return {Object<string, Function>} Joining phase owner registry.
 */
function createJoiningPhaseOwners(service) {
  assertCritical(service, 'NodeJoiningService is required for joining phase owners');

  return Object.freeze({
    [JOIN_PHASE_OWNER.CONTACT_SEED]:
      createOwnerInvoker(service, 'phaseContactSeed'),
    [JOIN_PHASE_OWNER.CONNECT_WEBSOCKET]:
      createOwnerInvoker(service, 'phaseConnectWebSocket'),
    [JOIN_PHASE_OWNER.CREATE_SELF_HOSTED_MESSAGE_GROUP]:
      createOwnerInvoker(service, 'phaseCreateSelfHostedMessageGroup'),
    [JOIN_PHASE_OWNER.JOIN_EXISTING_MESSAGE_GROUP]:
      createOwnerInvoker(service, 'phaseJoinExistingMessageGroup'),
    [JOIN_PHASE_OWNER.WAIT_FOR_LEADERSHIP]:
      createOwnerInvoker(service, 'phaseWaitForLeadership'),
    [JOIN_PHASE_OWNER.QUERY_SYSTEM_STATE]:
      createOwnerInvoker(service, 'phaseQuerySystemState'),
  });
}

export {JOIN_PHASE_OWNER, createJoiningPhaseOwners};

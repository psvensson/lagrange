/**
 * Joining phase owner registry.
 *
 * Canonical owner call path for joining-node pipeline phases.
 * The NodeJoiningService orchestration boundary executes through this registry.
 */
// @ts-nocheck
function stryNS_9fa48() {
  var g = typeof globalThis === 'object' && globalThis && globalThis.Math === Math && globalThis || new Function("return this")();
  var ns = g.__stryker__ || (g.__stryker__ = {});
  if (ns.activeMutant === undefined && g.process && g.process.env && g.process.env.__STRYKER_ACTIVE_MUTANT__) {
    ns.activeMutant = g.process.env.__STRYKER_ACTIVE_MUTANT__;
  }
  function retrieveNS() {
    return ns;
  }
  stryNS_9fa48 = retrieveNS;
  return retrieveNS();
}
stryNS_9fa48();
function stryCov_9fa48() {
  var ns = stryNS_9fa48();
  var cov = ns.mutantCoverage || (ns.mutantCoverage = {
    static: {},
    perTest: {}
  });
  function cover() {
    var c = cov.static;
    if (ns.currentTestId) {
      c = cov.perTest[ns.currentTestId] = cov.perTest[ns.currentTestId] || {};
    }
    var a = arguments;
    for (var i = 0; i < a.length; i++) {
      c[a[i]] = (c[a[i]] || 0) + 1;
    }
  }
  stryCov_9fa48 = cover;
  cover.apply(null, arguments);
}
function stryMutAct_9fa48(id) {
  var ns = stryNS_9fa48();
  function isActive(id) {
    if (ns.activeMutant === id) {
      if (ns.hitCount !== void 0 && ++ns.hitCount > ns.hitLimit) {
        throw new Error('Stryker: Hit count limit reached (' + ns.hitCount + ')');
      }
      return true;
    }
    return false;
  }
  stryMutAct_9fa48 = isActive;
  return isActive(id);
}
import { assertCritical } from '../../utils/assert.js';
const JOIN_PHASE_OWNER = Object.freeze(stryMutAct_9fa48("21627") ? {} : (stryCov_9fa48("21627"), {
  CONTACT_SEED: stryMutAct_9fa48("21628") ? "" : (stryCov_9fa48("21628"), 'contactSeed'),
  CONNECT_WEBSOCKET: stryMutAct_9fa48("21629") ? "" : (stryCov_9fa48("21629"), 'connectWebSocket'),
  CREATE_SELF_HOSTED_MESSAGE_GROUP: stryMutAct_9fa48("21630") ? "" : (stryCov_9fa48("21630"), 'createSelfHostedMessageGroup'),
  JOIN_EXISTING_MESSAGE_GROUP: stryMutAct_9fa48("21631") ? "" : (stryCov_9fa48("21631"), 'joinExistingMessageGroup'),
  WAIT_FOR_LEADERSHIP: stryMutAct_9fa48("21632") ? "" : (stryCov_9fa48("21632"), 'waitForLeadership'),
  QUERY_SYSTEM_STATE: stryMutAct_9fa48("21633") ? "" : (stryCov_9fa48("21633"), 'querySystemState')
}));
const PHASE_OWNER_FIELD = Object.freeze(stryMutAct_9fa48("21634") ? {} : (stryCov_9fa48("21634"), {
  [JOIN_PHASE_OWNER.CONTACT_SEED]: stryMutAct_9fa48("21635") ? "" : (stryCov_9fa48("21635"), 'contactSeedPhase'),
  [JOIN_PHASE_OWNER.CONNECT_WEBSOCKET]: stryMutAct_9fa48("21636") ? "" : (stryCov_9fa48("21636"), 'connectWebSocketPhase'),
  [JOIN_PHASE_OWNER.CREATE_SELF_HOSTED_MESSAGE_GROUP]: stryMutAct_9fa48("21637") ? "" : (stryCov_9fa48("21637"), 'createMessageGroupPhase'),
  [JOIN_PHASE_OWNER.JOIN_EXISTING_MESSAGE_GROUP]: stryMutAct_9fa48("21638") ? "" : (stryCov_9fa48("21638"), 'joinMessageGroupRuntimeOwner'),
  [JOIN_PHASE_OWNER.WAIT_FOR_LEADERSHIP]: stryMutAct_9fa48("21639") ? "" : (stryCov_9fa48("21639"), 'waitForLeadershipPhase'),
  [JOIN_PHASE_OWNER.QUERY_SYSTEM_STATE]: stryMutAct_9fa48("21640") ? "" : (stryCov_9fa48("21640"), 'querySystemStatePhase')
}));
const PHASE_METHOD = Object.freeze(stryMutAct_9fa48("21641") ? {} : (stryCov_9fa48("21641"), {
  [JOIN_PHASE_OWNER.CONTACT_SEED]: stryMutAct_9fa48("21642") ? "" : (stryCov_9fa48("21642"), 'phaseContactSeed'),
  [JOIN_PHASE_OWNER.CONNECT_WEBSOCKET]: stryMutAct_9fa48("21643") ? "" : (stryCov_9fa48("21643"), 'phaseConnectWebSocket'),
  [JOIN_PHASE_OWNER.CREATE_SELF_HOSTED_MESSAGE_GROUP]: stryMutAct_9fa48("21644") ? "" : (stryCov_9fa48("21644"), 'phaseCreateSelfHostedMessageGroup'),
  [JOIN_PHASE_OWNER.JOIN_EXISTING_MESSAGE_GROUP]: stryMutAct_9fa48("21645") ? "" : (stryCov_9fa48("21645"), 'phaseJoinExistingMessageGroup'),
  [JOIN_PHASE_OWNER.WAIT_FOR_LEADERSHIP]: stryMutAct_9fa48("21646") ? "" : (stryCov_9fa48("21646"), 'phaseWaitForLeadership'),
  [JOIN_PHASE_OWNER.QUERY_SYSTEM_STATE]: stryMutAct_9fa48("21647") ? "" : (stryCov_9fa48("21647"), 'phaseQuerySystemState')
}));
const OWNER_ERROR_MSG = Object.freeze(stryMutAct_9fa48("21648") ? {} : (stryCov_9fa48("21648"), {
  missingPhaseOwner: stryMutAct_9fa48("21649") ? () => undefined : (stryCov_9fa48("21649"), ownerField => stryMutAct_9fa48("21650") ? `` : (stryCov_9fa48("21650"), `Phase owner not initialized: ${ownerField}`))
}));

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
  if (stryMutAct_9fa48("21651")) {
    {}
  } else {
    stryCov_9fa48("21651");
    return async (...args) => {
      if (stryMutAct_9fa48("21652")) {
        {}
      } else {
        stryCov_9fa48("21652");
        const patchedWrapper = stryMutAct_9fa48("21655") ? Object.prototype.hasOwnProperty.call(service, methodName) || service[methodName] !== Object.getPrototypeOf(service)?.[methodName] : stryMutAct_9fa48("21654") ? false : stryMutAct_9fa48("21653") ? true : (stryCov_9fa48("21653", "21654", "21655"), Object.prototype.hasOwnProperty.call(service, methodName) && (stryMutAct_9fa48("21657") ? service[methodName] === Object.getPrototypeOf(service)?.[methodName] : stryMutAct_9fa48("21656") ? true : (stryCov_9fa48("21656", "21657"), service[methodName] !== (stryMutAct_9fa48("21658") ? Object.getPrototypeOf(service)[methodName] : (stryCov_9fa48("21658"), Object.getPrototypeOf(service)?.[methodName])))));
        if (stryMutAct_9fa48("21660") ? false : stryMutAct_9fa48("21659") ? true : (stryCov_9fa48("21659", "21660"), patchedWrapper)) {
          if (stryMutAct_9fa48("21661")) {
            {}
          } else {
            stryCov_9fa48("21661");
            return service[methodName](...args);
          }
        }
        const owner = service[ownerField];
        assertCritical(owner, OWNER_ERROR_MSG.missingPhaseOwner(ownerField));
        return owner[methodName](...args);
      }
    };
  }
}

/**
 * Create canonical joining phase owners.
 * @param {Object} service - NodeJoiningService.
 * @return {Object<string, Function>} Joining phase owner registry.
 */
function createJoiningPhaseOwners(service) {
  if (stryMutAct_9fa48("21662")) {
    {}
  } else {
    stryCov_9fa48("21662");
    assertCritical(service, stryMutAct_9fa48("21663") ? "" : (stryCov_9fa48("21663"), 'NodeJoiningService is required for joining phase owners'));
    const owners = {};
    for (const key of Object.values(JOIN_PHASE_OWNER)) {
      if (stryMutAct_9fa48("21664")) {
        {}
      } else {
        stryCov_9fa48("21664");
        owners[key] = createPhaseInvoker(service, PHASE_OWNER_FIELD[key], PHASE_METHOD[key]);
      }
    }
    return Object.freeze(owners);
  }
}
export { JOIN_PHASE_OWNER, createJoiningPhaseOwners };
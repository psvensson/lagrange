/**
 * Constants for MessageGroupServiceHandler.
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
import { WORKFLOW_STEP } from '../constants/index.js';
const MESSAGE_GROUP_SERVICE_HANDLER_SUBSYSTEM = stryMutAct_9fa48("92053") ? "" : (stryCov_9fa48("92053"), 'message-group-service-handler');
const MESSAGE_GROUP_SERVICE_HANDLER_ADDRESS = Object.freeze(stryMutAct_9fa48("92054") ? {} : (stryCov_9fa48("92054"), {
  SERVICE_SEGMENT: stryMutAct_9fa48("92055") ? "" : (stryCov_9fa48("92055"), 'service'),
  HANDLER_ID: stryMutAct_9fa48("92056") ? "" : (stryCov_9fa48("92056"), 'message-group-handler')
}));
const MESSAGE_GROUP_SERVICE_HANDLER_LOG_MSG = Object.freeze(stryMutAct_9fa48("92057") ? {} : (stryCov_9fa48("92057"), {
  INITIALIZING: stryMutAct_9fa48("92058") ? "" : (stryCov_9fa48("92058"), 'Initializing MessageGroupServiceHandler'),
  MESSAGE_RECEIVED: stryMutAct_9fa48("92059") ? "" : (stryCov_9fa48("92059"), 'MessageGroupServiceHandler received message'),
  CREATE_REQUEST: stryMutAct_9fa48("92060") ? "" : (stryCov_9fa48("92060"), 'Handling CREATE_REPLICA for message group'),
  CREATE_MISSING_FIELDS: stryMutAct_9fa48("92061") ? "" : (stryCov_9fa48("92061"), 'CREATE_REPLICA missing required fields for message group'),
  CREATE_ALREADY_ACTIVE: stryMutAct_9fa48("92062") ? "" : (stryCov_9fa48("92062"), 'Message-group replica already exists in active state'),
  CREATE_IN_PROGRESS: stryMutAct_9fa48("92063") ? "" : (stryCov_9fa48("92063"), 'Message-group replica creation already in progress'),
  CREATE_TOPOLOGY_INVALID: stryMutAct_9fa48("92064") ? "" : (stryCov_9fa48("92064"), 'CREATE_REPLICA rejected due to incomplete message-group topology'),
  OPERATION_IN_PROGRESS: stryMutAct_9fa48("92065") ? "" : (stryCov_9fa48("92065"), 'Operation already in progress'),
  ASYNC_CREATE_FAILED: stryMutAct_9fa48("92066") ? "" : (stryCov_9fa48("92066"), 'Async message-group replica creation failed'),
  CREATE_COMPLETED: stryMutAct_9fa48("92067") ? "" : (stryCov_9fa48("92067"), 'Message-group replica creation completed'),
  CREATE_FAILED: stryMutAct_9fa48("92068") ? "" : (stryCov_9fa48("92068"), 'Message-group replica creation failed'),
  REMOVE_REQUEST: stryMutAct_9fa48("92069") ? "" : (stryCov_9fa48("92069"), 'Handling REMOVE_REPLICA for message group'),
  REMOVE_MISSING_FIELDS: stryMutAct_9fa48("92070") ? "" : (stryCov_9fa48("92070"), 'REMOVE_REPLICA missing required fields for message group'),
  REMOVE_NOT_FOUND: stryMutAct_9fa48("92071") ? "" : (stryCov_9fa48("92071"), 'Message-group replica not found for removal'),
  REMOVE_IN_PROGRESS: stryMutAct_9fa48("92072") ? "" : (stryCov_9fa48("92072"), 'Message-group replica removal already in progress'),
  REMOVE_ALREADY_REMOVED: stryMutAct_9fa48("92073") ? "" : (stryCov_9fa48("92073"), 'Message-group replica already removed'),
  ASYNC_REMOVE_FAILED: stryMutAct_9fa48("92074") ? "" : (stryCov_9fa48("92074"), 'Async message-group replica removal failed'),
  REMOVE_COMPLETED: stryMutAct_9fa48("92075") ? "" : (stryCov_9fa48("92075"), 'Message-group replica removal completed'),
  REMOVE_FAILED: stryMutAct_9fa48("92076") ? "" : (stryCov_9fa48("92076"), 'Message-group replica removal failed'),
  UPDATE_STATUS_FAILED: stryMutAct_9fa48("92077") ? "" : (stryCov_9fa48("92077"), 'Failed to update operation step'),
  OPERATION_NOT_FOUND: stryMutAct_9fa48("92078") ? "" : (stryCov_9fa48("92078"), 'Replica operation not found in system table cache'),
  PARSE_STEPS_HISTORY_FAILED: stryMutAct_9fa48("92079") ? "" : (stryCov_9fa48("92079"), 'Failed to parse steps_history'),
  NO_MESSAGE_ROUTER: stryMutAct_9fa48("92080") ? "" : (stryCov_9fa48("92080"), 'No message router provided for message-group handler registration'),
  REGISTERED_ROUTER: stryMutAct_9fa48("92081") ? "" : (stryCov_9fa48("92081"), 'Registered MessageGroupServiceHandler with message router'),
  UNREGISTERED_ROUTER: stryMutAct_9fa48("92082") ? "" : (stryCov_9fa48("92082"), 'Unregistered MessageGroupServiceHandler from message router'),
  SHUTTING_DOWN: stryMutAct_9fa48("92083") ? "" : (stryCov_9fa48("92083"), 'Shutting down MessageGroupServiceHandler')
}));
const MESSAGE_GROUP_SERVICE_HANDLER_ERROR_MSG = Object.freeze(stryMutAct_9fa48("92084") ? {} : (stryCov_9fa48("92084"), {
  UNKNOWN_MESSAGE_TYPE: stryMutAct_9fa48("92085") ? () => undefined : (stryCov_9fa48("92085"), type => stryMutAct_9fa48("92086") ? `` : (stryCov_9fa48("92086"), `Unknown message type: ${type}`)),
  CREATE_REQUIRED_FIELDS: stryMutAct_9fa48("92087") ? "" : (stryCov_9fa48("92087"), 'CREATE_REPLICA requires operationId, groupId/entityId, and replicaId'),
  REMOVE_REQUIRED_FIELDS: stryMutAct_9fa48("92088") ? "" : (stryCov_9fa48("92088"), 'REMOVE_REPLICA requires operationId, groupId/entityId, and replicaId'),
  CREATE_REQUIRED: stryMutAct_9fa48("92089") ? "" : (stryCov_9fa48("92089"), 'MessageGroupServiceHandler requires createMessageGroupReplica'),
  START_REQUIRED: stryMutAct_9fa48("92090") ? "" : (stryCov_9fa48("92090"), 'MessageGroupServiceHandler requires startMessageGroupReplica'),
  STOP_REQUIRED: stryMutAct_9fa48("92091") ? "" : (stryCov_9fa48("92091"), 'MessageGroupServiceHandler requires stopMessageGroupReplica'),
  CDC_REQUIRED: stryMutAct_9fa48("92092") ? "" : (stryCov_9fa48("92092"), 'MessageGroupServiceHandler requires cdcIntegrationService'),
  CACHE_REQUIRED: stryMutAct_9fa48("92093") ? "" : (stryCov_9fa48("92093"), 'MessageGroupServiceHandler requires systemTableCache'),
  CREATE_TOPOLOGY_REQUIRED: stryMutAct_9fa48("92094") ? () => undefined : (stryCov_9fa48("92094"), (groupId, replicaId) => stryMutAct_9fa48("92095") ? `` : (stryCov_9fa48("92095"), `CREATE_REPLICA for ${groupId} requires canonical peer topology for ${replicaId}`)),
  REPLICA_HANDLER_NOT_REGISTERED: stryMutAct_9fa48("92096") ? () => undefined : (stryCov_9fa48("92096"), replicaId => stryMutAct_9fa48("92097") ? `` : (stryCov_9fa48("92097"), `Message-group replica handler was not registered for ${replicaId}`))
}));
const MESSAGE_GROUP_SERVICE_HANDLER_WORKFLOW = Object.freeze(stryMutAct_9fa48("92098") ? {} : (stryCov_9fa48("92098"), {
  COMPLETION_STEPS: stryMutAct_9fa48("92099") ? [] : (stryCov_9fa48("92099"), [WORKFLOW_STEP.ACTIVE, WORKFLOW_STEP.REMOVED, WORKFLOW_STEP.FAILED])
}));
export { MESSAGE_GROUP_SERVICE_HANDLER_ADDRESS, MESSAGE_GROUP_SERVICE_HANDLER_ERROR_MSG, MESSAGE_GROUP_SERVICE_HANDLER_LOG_MSG, MESSAGE_GROUP_SERVICE_HANDLER_SUBSYSTEM, MESSAGE_GROUP_SERVICE_HANDLER_WORKFLOW };
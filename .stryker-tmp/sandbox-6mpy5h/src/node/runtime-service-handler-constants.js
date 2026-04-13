/**
 * Constants for RuntimeServiceHandler.
 *
 * Defines log messages, error messages, and address constants
 * for the runtime-service replica operation handler.
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
const RUNTIME_SERVICE_HANDLER_SUBSYSTEM = stryMutAct_9fa48("96922") ? "" : (stryCov_9fa48("96922"), 'runtime-service-handler');
const RUNTIME_SERVICE_HANDLER_ADDRESS = Object.freeze(stryMutAct_9fa48("96923") ? {} : (stryCov_9fa48("96923"), {
  SERVICE_SEGMENT: stryMutAct_9fa48("96924") ? "" : (stryCov_9fa48("96924"), 'service'),
  HANDLER_ID: stryMutAct_9fa48("96925") ? "" : (stryCov_9fa48("96925"), 'runtime-service-handler')
}));
const RUNTIME_SERVICE_HANDLER_LOG_MSG = Object.freeze(stryMutAct_9fa48("96926") ? {} : (stryCov_9fa48("96926"), {
  INITIALIZING: stryMutAct_9fa48("96927") ? "" : (stryCov_9fa48("96927"), 'Initializing RuntimeServiceHandler'),
  MESSAGE_RECEIVED: stryMutAct_9fa48("96928") ? "" : (stryCov_9fa48("96928"), 'RuntimeServiceHandler received message'),
  CREATE_REQUEST: stryMutAct_9fa48("96929") ? "" : (stryCov_9fa48("96929"), 'Handling CREATE_REPLICA for runtime service'),
  CREATE_MISSING_FIELDS: stryMutAct_9fa48("96930") ? "" : (stryCov_9fa48("96930"), 'CREATE_REPLICA missing required fields for runtime service'),
  CREATE_ALREADY_ACTIVE: stryMutAct_9fa48("96931") ? "" : (stryCov_9fa48("96931"), 'Runtime service replica already exists in active state'),
  CREATE_IN_PROGRESS: stryMutAct_9fa48("96932") ? "" : (stryCov_9fa48("96932"), 'Runtime service replica creation already in progress'),
  OPERATION_IN_PROGRESS: stryMutAct_9fa48("96933") ? "" : (stryCov_9fa48("96933"), 'Operation already in progress'),
  ASYNC_CREATE_FAILED: stryMutAct_9fa48("96934") ? "" : (stryCov_9fa48("96934"), 'Async runtime service replica creation failed'),
  CREATE_COMPLETED: stryMutAct_9fa48("96935") ? "" : (stryCov_9fa48("96935"), 'Runtime service replica creation completed'),
  CREATE_FAILED: stryMutAct_9fa48("96936") ? "" : (stryCov_9fa48("96936"), 'Runtime service replica creation failed'),
  REMOVE_REQUEST: stryMutAct_9fa48("96937") ? "" : (stryCov_9fa48("96937"), 'Handling REMOVE_REPLICA for runtime service'),
  REMOVE_MISSING_FIELDS: stryMutAct_9fa48("96938") ? "" : (stryCov_9fa48("96938"), 'REMOVE_REPLICA missing required fields for runtime service'),
  REMOVE_NOT_FOUND: stryMutAct_9fa48("96939") ? "" : (stryCov_9fa48("96939"), 'Runtime service replica not found for removal'),
  REMOVE_IN_PROGRESS: stryMutAct_9fa48("96940") ? "" : (stryCov_9fa48("96940"), 'Runtime service replica removal already in progress'),
  REMOVE_ALREADY_REMOVED: stryMutAct_9fa48("96941") ? "" : (stryCov_9fa48("96941"), 'Runtime service replica already removed'),
  ASYNC_REMOVE_FAILED: stryMutAct_9fa48("96942") ? "" : (stryCov_9fa48("96942"), 'Async runtime service replica removal failed'),
  REMOVE_COMPLETED: stryMutAct_9fa48("96943") ? "" : (stryCov_9fa48("96943"), 'Runtime service replica removal completed'),
  REMOVE_FAILED: stryMutAct_9fa48("96944") ? "" : (stryCov_9fa48("96944"), 'Runtime service replica removal failed'),
  UPDATE_STATUS_FAILED: stryMutAct_9fa48("96945") ? "" : (stryCov_9fa48("96945"), 'Failed to update operation step'),
  OPERATION_NOT_FOUND: stryMutAct_9fa48("96946") ? "" : (stryCov_9fa48("96946"), 'Replica operation not found in system table cache'),
  PARSE_STEPS_HISTORY_FAILED: stryMutAct_9fa48("96947") ? "" : (stryCov_9fa48("96947"), 'Failed to parse steps_history'),
  DEFINITION_NOT_FOUND: stryMutAct_9fa48("96948") ? "" : (stryCov_9fa48("96948"), 'Service definition not found for runtime service'),
  NO_MESSAGE_ROUTER: stryMutAct_9fa48("96949") ? "" : (stryCov_9fa48("96949"), 'No message router provided for registration'),
  REGISTERED_ROUTER: stryMutAct_9fa48("96950") ? "" : (stryCov_9fa48("96950"), 'Registered RuntimeServiceHandler with message router'),
  UNREGISTERED_ROUTER: stryMutAct_9fa48("96951") ? "" : (stryCov_9fa48("96951"), 'Unregistered RuntimeServiceHandler from message router'),
  SHUTTING_DOWN: stryMutAct_9fa48("96952") ? "" : (stryCov_9fa48("96952"), 'Shutting down RuntimeServiceHandler')
}));
const RUNTIME_SERVICE_HANDLER_ERROR_MSG = Object.freeze(stryMutAct_9fa48("96953") ? {} : (stryCov_9fa48("96953"), {
  UNKNOWN_MESSAGE_TYPE: stryMutAct_9fa48("96954") ? () => undefined : (stryCov_9fa48("96954"), type => stryMutAct_9fa48("96955") ? `` : (stryCov_9fa48("96955"), `Unknown message type: ${type}`)),
  CREATE_REQUIRED_FIELDS: stryMutAct_9fa48("96956") ? "" : (stryCov_9fa48("96956"), 'CREATE_REPLICA requires operationId, entityId, and replicaId'),
  REMOVE_REQUIRED_FIELDS: stryMutAct_9fa48("96957") ? "" : (stryCov_9fa48("96957"), 'REMOVE_REPLICA requires operationId, entityId, and replicaId'),
  LIFECYCLE_MANAGER_REQUIRED: stryMutAct_9fa48("96958") ? "" : (stryCov_9fa48("96958"), 'RuntimeServiceHandler requires serviceLifecycleManager'),
  CDC_REQUIRED: stryMutAct_9fa48("96959") ? "" : (stryCov_9fa48("96959"), 'RuntimeServiceHandler requires cdcIntegrationService'),
  CACHE_REQUIRED: stryMutAct_9fa48("96960") ? "" : (stryCov_9fa48("96960"), 'RuntimeServiceHandler requires systemTableCache'),
  DEFINITION_NOT_FOUND: stryMutAct_9fa48("96961") ? () => undefined : (stryCov_9fa48("96961"), entityId => stryMutAct_9fa48("96962") ? `` : (stryCov_9fa48("96962"), `Service definition not found: ${entityId}`))
}));
const RUNTIME_SERVICE_HANDLER_WORKFLOW = Object.freeze(stryMutAct_9fa48("96963") ? {} : (stryCov_9fa48("96963"), {
  COMPLETION_STEPS: stryMutAct_9fa48("96964") ? [] : (stryCov_9fa48("96964"), [WORKFLOW_STEP.ACTIVE, WORKFLOW_STEP.REMOVED, WORKFLOW_STEP.FAILED])
}));
export { RUNTIME_SERVICE_HANDLER_ADDRESS, RUNTIME_SERVICE_HANDLER_ERROR_MSG, RUNTIME_SERVICE_HANDLER_LOG_MSG, RUNTIME_SERVICE_HANDLER_SUBSYSTEM, RUNTIME_SERVICE_HANDLER_WORKFLOW };
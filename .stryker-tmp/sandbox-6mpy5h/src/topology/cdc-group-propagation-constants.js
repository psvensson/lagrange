/**
 * Constants for CDCGroupPropagationService.
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
const CDC_GROUP_PROPAGATION_SUBSYSTEM = stryMutAct_9fa48("152590") ? "" : (stryCov_9fa48("152590"), 'cdc-group-propagation');
const CDC_GROUP_PROPAGATION_STATE = Object.freeze(stryMutAct_9fa48("152591") ? {} : (stryCov_9fa48("152591"), {
  CREATED: stryMutAct_9fa48("152592") ? "" : (stryCov_9fa48("152592"), 'created'),
  INITIALIZED: stryMutAct_9fa48("152593") ? "" : (stryCov_9fa48("152593"), 'initialized'),
  RUNNING: stryMutAct_9fa48("152594") ? "" : (stryCov_9fa48("152594"), 'running'),
  STOPPED: stryMutAct_9fa48("152595") ? "" : (stryCov_9fa48("152595"), 'stopped')
}));
const CDC_GROUP_PROPAGATION_EVENT = Object.freeze(stryMutAct_9fa48("152596") ? {} : (stryCov_9fa48("152596"), {
  PROPAGATED: stryMutAct_9fa48("152597") ? "" : (stryCov_9fa48("152597"), 'cdcGroupPropagated'),
  SAFE_FALLBACK: stryMutAct_9fa48("152598") ? "" : (stryCov_9fa48("152598"), 'cdcGroupSafeFallback')
}));
const CDC_GROUP_PROPAGATION_REASON = Object.freeze(stryMutAct_9fa48("152599") ? {} : (stryCov_9fa48("152599"), {
  CONFIG_GROUPED_MODE: stryMutAct_9fa48("152600") ? "" : (stryCov_9fa48("152600"), 'config_grouped_mode'),
  CONFIG_SAFE_MODE: stryMutAct_9fa48("152601") ? "" : (stryCov_9fa48("152601"), 'config_safe_mode'),
  MISSING_LOCAL_GROUP: stryMutAct_9fa48("152602") ? "" : (stryCov_9fa48("152602"), 'missing_local_group'),
  MISSING_ACTIVE_GROUPS: stryMutAct_9fa48("152603") ? "" : (stryCov_9fa48("152603"), 'missing_active_groups'),
  MISSING_COORDINATOR_NODE: stryMutAct_9fa48("152604") ? "" : (stryCov_9fa48("152604"), 'missing_coordinator_node'),
  MISSING_COORDINATOR_ADDRESS: stryMutAct_9fa48("152605") ? "" : (stryCov_9fa48("152605"), 'missing_coordinator_address'),
  MESSAGE_ROUTER_UNAVAILABLE: stryMutAct_9fa48("152606") ? "" : (stryCov_9fa48("152606"), 'message_router_unavailable'),
  GROUPED_DELIVERY_FAILURE: stryMutAct_9fa48("152607") ? "" : (stryCov_9fa48("152607"), 'grouped_delivery_failure'),
  GROUPED_DELIVERY_RECOVERED: stryMutAct_9fa48("152608") ? "" : (stryCov_9fa48("152608"), 'grouped_delivery_recovered')
}));
const CDC_GROUP_PROPAGATION_STATUS = Object.freeze(stryMutAct_9fa48("152609") ? {} : (stryCov_9fa48("152609"), {
  GROUPED: stryMutAct_9fa48("152610") ? "" : (stryCov_9fa48("152610"), 'grouped'),
  SAFE: stryMutAct_9fa48("152611") ? "" : (stryCov_9fa48("152611"), 'safe')
}));
const CDC_GROUP_PUBLICATION_MODE = Object.freeze(stryMutAct_9fa48("152612") ? {} : (stryCov_9fa48("152612"), {
  GROUPED: stryMutAct_9fa48("152613") ? "" : (stryCov_9fa48("152613"), 'grouped'),
  CONSERVATIVE_FANOUT: stryMutAct_9fa48("152614") ? "" : (stryCov_9fa48("152614"), 'conservative_fanout'),
  REPAIR_ONLY: stryMutAct_9fa48("152615") ? "" : (stryCov_9fa48("152615"), 'repair_only')
}));
const CDC_GROUP_PROPAGATION_STRATEGY = Object.freeze(stryMutAct_9fa48("152616") ? {} : (stryCov_9fa48("152616"), {
  GROUP_COORDINATOR: stryMutAct_9fa48("152617") ? "" : (stryCov_9fa48("152617"), 'group_coordinator'),
  DIRECT_FANOUT: stryMutAct_9fa48("152618") ? "" : (stryCov_9fa48("152618"), 'direct_fanout')
}));
const CDC_GROUP_PROPAGATION_RETRY = Object.freeze(stryMutAct_9fa48("152619") ? {} : (stryCov_9fa48("152619"), {
  MAX_ATTEMPTS: 3,
  BACKGROUND_MAX_ATTEMPTS: 5,
  INITIAL_DELAY_MS: 50,
  BACKOFF_MULTIPLIER: 2,
  MAX_DELAY_MS: 1000
}));
const CDC_GROUP_PROPAGATION_LOG_MSG = Object.freeze(stryMutAct_9fa48("152620") ? {} : (stryCov_9fa48("152620"), {
  INITIALIZED: stryMutAct_9fa48("152621") ? "" : (stryCov_9fa48("152621"), 'CDCGroupPropagationService initialized'),
  STARTED: stryMutAct_9fa48("152622") ? "" : (stryCov_9fa48("152622"), 'CDCGroupPropagationService started'),
  STOPPED: stryMutAct_9fa48("152623") ? "" : (stryCov_9fa48("152623"), 'CDCGroupPropagationService stopped'),
  PROPAGATED_GROUPED: stryMutAct_9fa48("152624") ? "" : (stryCov_9fa48("152624"), 'CDC event propagated through group-coordinator strategy'),
  PROPAGATED_SAFE: stryMutAct_9fa48("152625") ? "" : (stryCov_9fa48("152625"), 'CDC event propagated through direct-fanout strategy'),
  SAFE_FALLBACK: stryMutAct_9fa48("152626") ? "" : (stryCov_9fa48("152626"), 'Falling back to direct-fanout CDC propagation strategy'),
  GROUPED_DELIVERY_FAILED: stryMutAct_9fa48("152627") ? "" : (stryCov_9fa48("152627"), 'Grouped propagation delivery failed'),
  RETRYING_DELIVERY_FAILURES: stryMutAct_9fa48("152628") ? "" : (stryCov_9fa48("152628"), 'Retrying CDC propagation delivery failures'),
  DELIVERY_RETRY_EXHAUSTED: stryMutAct_9fa48("152629") ? "" : (stryCov_9fa48("152629"), 'CDC propagation delivery retries exhausted')
}));
const CDC_GROUP_PROPAGATION_ERROR_MSG = Object.freeze(stryMutAct_9fa48("152630") ? {} : (stryCov_9fa48("152630"), {
  MISSING_NODE_ID: stryMutAct_9fa48("152631") ? "" : (stryCov_9fa48("152631"), 'CDCGroupPropagationService requires nodeId'),
  MISSING_CACHE: stryMutAct_9fa48("152632") ? "" : (stryCov_9fa48("152632"), 'CDCGroupPropagationService requires systemTableCache'),
  MISSING_TREE_SERVICE: stryMutAct_9fa48("152633") ? "" : (stryCov_9fa48("152633"), 'CDCGroupPropagationService requires latencyTreeService'),
  NOT_INITIALIZED: stryMutAct_9fa48("152634") ? "" : (stryCov_9fa48("152634"), 'CDCGroupPropagationService must be initialized first'),
  MISSING_MESSAGE_GROUP_SERVICE: stryMutAct_9fa48("152635") ? "" : (stryCov_9fa48("152635"), 'CDC propagation requires sourceMessageGroupService'),
  MISSING_CDC_PAYLOAD: stryMutAct_9fa48("152636") ? "" : (stryCov_9fa48("152636"), 'CDC propagation requires tableName/operation/data')
}));
export { CDC_GROUP_PROPAGATION_ERROR_MSG, CDC_GROUP_PROPAGATION_EVENT, CDC_GROUP_PROPAGATION_LOG_MSG, CDC_GROUP_PROPAGATION_REASON, CDC_GROUP_PROPAGATION_RETRY, CDC_GROUP_PROPAGATION_STATE, CDC_GROUP_PROPAGATION_STRATEGY, CDC_GROUP_PROPAGATION_STATUS, CDC_GROUP_PUBLICATION_MODE, CDC_GROUP_PROPAGATION_SUBSYSTEM };
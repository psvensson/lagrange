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
const DISTRIBUTED_STATEMENT_TYPE = Object.freeze(stryMutAct_9fa48("110219") ? {} : (stryCov_9fa48("110219"), {
  SELECT: stryMutAct_9fa48("110220") ? "" : (stryCov_9fa48("110220"), 'SELECT'),
  INSERT: stryMutAct_9fa48("110221") ? "" : (stryCov_9fa48("110221"), 'INSERT'),
  UPDATE: stryMutAct_9fa48("110222") ? "" : (stryCov_9fa48("110222"), 'UPDATE'),
  DELETE: stryMutAct_9fa48("110223") ? "" : (stryCov_9fa48("110223"), 'DELETE')
}));
const DISTRIBUTED_PLAN_FIELD = Object.freeze(stryMutAct_9fa48("110224") ? {} : (stryCov_9fa48("110224"), {
  PLAN_ID: stryMutAct_9fa48("110225") ? "" : (stryCov_9fa48("110225"), 'planId'),
  STATEMENT_TYPE: stryMutAct_9fa48("110226") ? "" : (stryCov_9fa48("110226"), 'statementType'),
  TABLE_PLANS: stryMutAct_9fa48("110227") ? "" : (stryCov_9fa48("110227"), 'tablePlans'),
  JOIN_PLAN: stryMutAct_9fa48("110228") ? "" : (stryCov_9fa48("110228"), 'joinPlan'),
  SET_OPERATION_PLAN: stryMutAct_9fa48("110229") ? "" : (stryCov_9fa48("110229"), 'setOperationPlan'),
  FRAGMENT_PLANS: stryMutAct_9fa48("110230") ? "" : (stryCov_9fa48("110230"), 'fragmentPlans'),
  MERGE_PLAN: stryMutAct_9fa48("110231") ? "" : (stryCov_9fa48("110231"), 'mergePlan'),
  EXECUTION_POLICY: stryMutAct_9fa48("110232") ? "" : (stryCov_9fa48("110232"), 'executionPolicy'),
  DIAGNOSTICS: stryMutAct_9fa48("110233") ? "" : (stryCov_9fa48("110233"), 'diagnostics')
}));
const DISTRIBUTED_JOIN_STRATEGY = Object.freeze(stryMutAct_9fa48("110234") ? {} : (stryCov_9fa48("110234"), {
  BROADCAST: stryMutAct_9fa48("110235") ? "" : (stryCov_9fa48("110235"), 'broadcast'),
  REPARTITION: stryMutAct_9fa48("110236") ? "" : (stryCov_9fa48("110236"), 'repartition'),
  NESTED_LOOP: stryMutAct_9fa48("110237") ? "" : (stryCov_9fa48("110237"), 'nested_loop')
}));
const DISTRIBUTED_ROLE_HINT = Object.freeze(stryMutAct_9fa48("110238") ? {} : (stryCov_9fa48("110238"), {
  LEADER: stryMutAct_9fa48("110239") ? "" : (stryCov_9fa48("110239"), 'leader'),
  FOLLOWER_OK: stryMutAct_9fa48("110240") ? "" : (stryCov_9fa48("110240"), 'follower-ok')
}));
const DISTRIBUTED_PREDICATE_SHAPE = Object.freeze(stryMutAct_9fa48("110241") ? {} : (stryCov_9fa48("110241"), {
  EQ: stryMutAct_9fa48("110242") ? "" : (stryCov_9fa48("110242"), 'eq'),
  RANGE: stryMutAct_9fa48("110243") ? "" : (stryCov_9fa48("110243"), 'range'),
  IN: stryMutAct_9fa48("110244") ? "" : (stryCov_9fa48("110244"), 'in'),
  BETWEEN: stryMutAct_9fa48("110245") ? "" : (stryCov_9fa48("110245"), 'between'),
  SCATTER: stryMutAct_9fa48("110246") ? "" : (stryCov_9fa48("110246"), 'scatter')
}));
const DISTRIBUTED_EXECUTION_POLICY = Object.freeze(stryMutAct_9fa48("110247") ? {} : (stryCov_9fa48("110247"), {
  READ_FAIL_CLOSED: stryMutAct_9fa48("110248") ? "" : (stryCov_9fa48("110248"), 'read_fail_closed'),
  WRITE_FAIL_CLOSED: stryMutAct_9fa48("110249") ? "" : (stryCov_9fa48("110249"), 'write_fail_closed')
}));
const DISTRIBUTED_QUERY_ERROR_CODE = Object.freeze(stryMutAct_9fa48("110250") ? {} : (stryCov_9fa48("110250"), {
  DISTRIBUTED_PLAN_INVALID: stryMutAct_9fa48("110251") ? "" : (stryCov_9fa48("110251"), 'DISTRIBUTED_PLAN_INVALID'),
  DISTRIBUTED_TABLE_PLAN_MISSING: stryMutAct_9fa48("110252") ? "" : (stryCov_9fa48("110252"), 'DISTRIBUTED_TABLE_PLAN_MISSING')
}));
const DISTRIBUTED_QUERY_ERROR_MSG = Object.freeze(stryMutAct_9fa48("110253") ? {} : (stryCov_9fa48("110253"), {
  DISTRIBUTED_PLAN_INVALID: stryMutAct_9fa48("110254") ? "" : (stryCov_9fa48("110254"), 'Distributed query plan is invalid'),
  DISTRIBUTED_TABLE_PLAN_MISSING: stryMutAct_9fa48("110255") ? "" : (stryCov_9fa48("110255"), 'Table access plan missing from distributed plan')
}));
const DISTRIBUTED_PLANNER_DEFAULT = Object.freeze(stryMutAct_9fa48("110256") ? {} : (stryCov_9fa48("110256"), {
  JOIN_BROADCAST_PARTITION_THRESHOLD: 2
}));
export { DISTRIBUTED_EXECUTION_POLICY, DISTRIBUTED_JOIN_STRATEGY, DISTRIBUTED_PLAN_FIELD, DISTRIBUTED_PLANNER_DEFAULT, DISTRIBUTED_PREDICATE_SHAPE, DISTRIBUTED_QUERY_ERROR_CODE, DISTRIBUTED_QUERY_ERROR_MSG, DISTRIBUTED_ROLE_HINT, DISTRIBUTED_STATEMENT_TYPE };
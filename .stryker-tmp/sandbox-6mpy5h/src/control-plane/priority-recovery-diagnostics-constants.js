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
const PRIORITY_RECOVERY_CORRELATION_KEY = Object.freeze(stryMutAct_9fa48("70387") ? {} : (stryCov_9fa48("70387"), {
  SEPARATOR: stryMutAct_9fa48("70388") ? "" : (stryCov_9fa48("70388"), '|'),
  EPOCH_UNKNOWN: stryMutAct_9fa48("70389") ? "" : (stryCov_9fa48("70389"), 'epoch_unknown'),
  OPERATION_UNKNOWN: stryMutAct_9fa48("70390") ? "" : (stryCov_9fa48("70390"), 'operation_unknown'),
  UNKNOWN: stryMutAct_9fa48("70391") ? "" : (stryCov_9fa48("70391"), 'unknown_priority_recovery_correlation_key')
}));
const PRIORITY_RECOVERY_BLOCKER_REASON = Object.freeze(stryMutAct_9fa48("70392") ? {} : (stryCov_9fa48("70392"), {
  ELIGIBLE_NO_OPERATION: stryMutAct_9fa48("70393") ? "" : (stryCov_9fa48("70393"), 'eligible_but_no_operation_created'),
  OPERATION_NO_TRANSITIONS: stryMutAct_9fa48("70394") ? "" : (stryCov_9fa48("70394"), 'operation_created_but_no_step_transitions'),
  LEARNER_NEVER_PROMOTABLE: stryMutAct_9fa48("70395") ? "" : (stryCov_9fa48("70395"), 'learner_active_but_never_promotable'),
  RECOVERY_ELIGIBLE_EXCLUDED: stryMutAct_9fa48("70396") ? "" : (stryCov_9fa48("70396"), 'publication_recovery_eligible_but_coordinator_excludes_node')
}));
const PRIORITY_RECOVERY_PROGRESS_CLASS_IDS = Object.freeze(stryMutAct_9fa48("70397") ? [] : (stryCov_9fa48("70397"), [PRIORITY_RECOVERY_BLOCKER_REASON.ELIGIBLE_NO_OPERATION, PRIORITY_RECOVERY_BLOCKER_REASON.OPERATION_NO_TRANSITIONS, PRIORITY_RECOVERY_BLOCKER_REASON.LEARNER_NEVER_PROMOTABLE, PRIORITY_RECOVERY_BLOCKER_REASON.RECOVERY_ELIGIBLE_EXCLUDED]));
const PRIORITY_RECOVERY_SPREAD_COMPLETION_REASON = Object.freeze(stryMutAct_9fa48("70398") ? {} : (stryCov_9fa48("70398"), {
  PLANNER_READY: stryMutAct_9fa48("70399") ? "" : (stryCov_9fa48("70399"), 'planner_ready'),
  REPLACE_REMOVE_DISPATCH_PHASE_ON_ELIGIBLE_TARGET: stryMutAct_9fa48("70400") ? "" : (stryCov_9fa48("70400"), 'replace_remove_dispatch_phase_on_eligible_target'),
  ACTIVE_OPERATION_STILL_BLOCKS_SPREAD: stryMutAct_9fa48("70401") ? "" : (stryCov_9fa48("70401"), 'active_operation_still_blocks_spread'),
  UNSATISFIED: stryMutAct_9fa48("70402") ? "" : (stryCov_9fa48("70402"), 'unsatisfied')
}));
const PRIORITY_RECOVERY_SEMANTIC_STATE = Object.freeze(stryMutAct_9fa48("70403") ? {} : (stryCov_9fa48("70403"), {
  CONVERGED: stryMutAct_9fa48("70404") ? "" : (stryCov_9fa48("70404"), 'converged'),
  SPREAD_SATISFIED_IN_FLIGHT: stryMutAct_9fa48("70405") ? "" : (stryCov_9fa48("70405"), 'spread_satisfied_in_flight'),
  NEEDS_OPERATION: stryMutAct_9fa48("70406") ? "" : (stryCov_9fa48("70406"), 'needs_operation'),
  OPERATION_STALLED: stryMutAct_9fa48("70407") ? "" : (stryCov_9fa48("70407"), 'operation_stalled'),
  LEARNER_PROMOTION_BLOCKED: stryMutAct_9fa48("70408") ? "" : (stryCov_9fa48("70408"), 'learner_promotion_blocked'),
  COORDINATION_MISMATCH: stryMutAct_9fa48("70409") ? "" : (stryCov_9fa48("70409"), 'coordination_mismatch'),
  RECOVERING_IN_FLIGHT: stryMutAct_9fa48("70410") ? "" : (stryCov_9fa48("70410"), 'recovering_in_flight'),
  BLOCKED_UNCLASSIFIED: stryMutAct_9fa48("70411") ? "" : (stryCov_9fa48("70411"), 'blocked_unclassified')
}));
const PRIORITY_RECOVERY_SEMANTIC_STATE_IDS = Object.freeze(stryMutAct_9fa48("70412") ? [] : (stryCov_9fa48("70412"), [PRIORITY_RECOVERY_SEMANTIC_STATE.CONVERGED, PRIORITY_RECOVERY_SEMANTIC_STATE.SPREAD_SATISFIED_IN_FLIGHT, PRIORITY_RECOVERY_SEMANTIC_STATE.NEEDS_OPERATION, PRIORITY_RECOVERY_SEMANTIC_STATE.OPERATION_STALLED, PRIORITY_RECOVERY_SEMANTIC_STATE.LEARNER_PROMOTION_BLOCKED, PRIORITY_RECOVERY_SEMANTIC_STATE.COORDINATION_MISMATCH, PRIORITY_RECOVERY_SEMANTIC_STATE.RECOVERING_IN_FLIGHT, PRIORITY_RECOVERY_SEMANTIC_STATE.BLOCKED_UNCLASSIFIED]));
const PRIORITY_RECOVERY_UNRESOLVED_SEMANTIC_STATE_IDS = Object.freeze(stryMutAct_9fa48("70413") ? [] : (stryCov_9fa48("70413"), [PRIORITY_RECOVERY_SEMANTIC_STATE.NEEDS_OPERATION, PRIORITY_RECOVERY_SEMANTIC_STATE.OPERATION_STALLED, PRIORITY_RECOVERY_SEMANTIC_STATE.LEARNER_PROMOTION_BLOCKED, PRIORITY_RECOVERY_SEMANTIC_STATE.COORDINATION_MISMATCH, PRIORITY_RECOVERY_SEMANTIC_STATE.RECOVERING_IN_FLIGHT, PRIORITY_RECOVERY_SEMANTIC_STATE.BLOCKED_UNCLASSIFIED]));
const PRIORITY_RECOVERY_BLOCKER_REASON_PRECEDENCE = Object.freeze(stryMutAct_9fa48("70414") ? [] : (stryCov_9fa48("70414"), [PRIORITY_RECOVERY_BLOCKER_REASON.RECOVERY_ELIGIBLE_EXCLUDED, PRIORITY_RECOVERY_BLOCKER_REASON.LEARNER_NEVER_PROMOTABLE, PRIORITY_RECOVERY_BLOCKER_REASON.OPERATION_NO_TRANSITIONS, PRIORITY_RECOVERY_BLOCKER_REASON.ELIGIBLE_NO_OPERATION]));
const PRIORITY_RECOVERY_BLOCKER_TO_SEMANTIC_STATE = Object.freeze(stryMutAct_9fa48("70415") ? {} : (stryCov_9fa48("70415"), {
  [PRIORITY_RECOVERY_BLOCKER_REASON.ELIGIBLE_NO_OPERATION]: PRIORITY_RECOVERY_SEMANTIC_STATE.NEEDS_OPERATION,
  [PRIORITY_RECOVERY_BLOCKER_REASON.OPERATION_NO_TRANSITIONS]: PRIORITY_RECOVERY_SEMANTIC_STATE.OPERATION_STALLED,
  [PRIORITY_RECOVERY_BLOCKER_REASON.LEARNER_NEVER_PROMOTABLE]: PRIORITY_RECOVERY_SEMANTIC_STATE.LEARNER_PROMOTION_BLOCKED,
  [PRIORITY_RECOVERY_BLOCKER_REASON.RECOVERY_ELIGIBLE_EXCLUDED]: PRIORITY_RECOVERY_SEMANTIC_STATE.COORDINATION_MISMATCH
}));
const PRIORITY_RECOVERY_INVARIANT_FALLBACK = stryMutAct_9fa48("70416") ? "" : (stryCov_9fa48("70416"), 'unknown_priority_recovery_invariant');
const PRIORITY_RECOVERY_BLOCKER_REASON_FALLBACK = stryMutAct_9fa48("70417") ? "" : (stryCov_9fa48("70417"), 'unknown_priority_recovery_blocker');
export { PRIORITY_RECOVERY_BLOCKER_REASON, PRIORITY_RECOVERY_BLOCKER_REASON_FALLBACK, PRIORITY_RECOVERY_BLOCKER_REASON_PRECEDENCE, PRIORITY_RECOVERY_BLOCKER_TO_SEMANTIC_STATE, PRIORITY_RECOVERY_CORRELATION_KEY, PRIORITY_RECOVERY_INVARIANT_FALLBACK, PRIORITY_RECOVERY_PROGRESS_CLASS_IDS, PRIORITY_RECOVERY_SEMANTIC_STATE, PRIORITY_RECOVERY_SEMANTIC_STATE_IDS, PRIORITY_RECOVERY_SPREAD_COMPLETION_REASON, PRIORITY_RECOVERY_UNRESOLVED_SEMANTIC_STATE_IDS };
/**
 * Constants for the control-plane invariant engine.
 *
 * The invariant engine evaluates a canonical set of control-plane
 * correctness invariants at bounded checkpoints. Each invariant
 * produces a typed result tagged with hard/soft severity.
 *
 * Requirements: 7.1, 7.2, 7.3
 */
// @ts-nocheck


/**
 * Severity levels for invariant outcomes.
 * Hard invariants must fail deterministic test gates.
 * Soft invariants are diagnostic warnings.
 * @enum {string}
 */function stryNS_9fa48() {
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
const INVARIANT_OUTCOME_SEVERITY = Object.freeze(stryMutAct_9fa48("66021") ? {} : (stryCov_9fa48("66021"), {
  HARD: stryMutAct_9fa48("66022") ? "" : (stryCov_9fa48("66022"), 'hard'),
  SOFT: stryMutAct_9fa48("66023") ? "" : (stryCov_9fa48("66023"), 'soft')
}));

/**
 * Typed reason codes for invariant evaluation outcomes.
 * @enum {string}
 */
const INVARIANT_REASON = Object.freeze(stryMutAct_9fa48("66024") ? {} : (stryCov_9fa48("66024"), {
  /** Leader uniqueness: multiple leaders found for same entity. */
  DUPLICATE_LEADER_DETECTED: stryMutAct_9fa48("66025") ? "" : (stryCov_9fa48("66025"), 'duplicate_leader_detected'),
  /** Leader uniqueness: all entities have at most one leader. */
  LEADER_UNIQUE: stryMutAct_9fa48("66026") ? "" : (stryCov_9fa48("66026"), 'leader_unique'),
  /** Monotonic steps: backward transition detected. */
  BACKWARD_STEP_DETECTED: stryMutAct_9fa48("66027") ? "" : (stryCov_9fa48("66027"), 'backward_step_detected'),
  /** Monotonic steps: all transitions are monotonic. */
  STEPS_MONOTONIC: stryMutAct_9fa48("66028") ? "" : (stryCov_9fa48("66028"), 'steps_monotonic'),
  /** Claim exclusivity: duplicate active claim detected. */
  DUPLICATE_CLAIM_DETECTED: stryMutAct_9fa48("66029") ? "" : (stryCov_9fa48("66029"), 'duplicate_claim_detected'),
  /** Claim exclusivity: all claims are exclusive. */
  CLAIMS_EXCLUSIVE: stryMutAct_9fa48("66030") ? "" : (stryCov_9fa48("66030"), 'claims_exclusive'),
  /** Orphan in-flight: operation without owner key detected. */
  ORPHAN_DETECTED: stryMutAct_9fa48("66031") ? "" : (stryCov_9fa48("66031"), 'orphan_detected'),
  /** Orphan in-flight: all in-flight operations have owner keys. */
  NO_ORPHANS: stryMutAct_9fa48("66032") ? "" : (stryCov_9fa48("66032"), 'no_orphans'),
  /** Single-writer: non-owner wrote owner-managed workflow fields. */
  REPLICA_OPERATION_MULTI_WRITER_DETECTED: stryMutAct_9fa48("66033") ? "" : (stryCov_9fa48("66033"), 'replica_operation_multi_writer_detected'),
  /** Single-writer: only canonical owner wrote owner-managed fields. */
  REPLICA_OPERATION_SINGLE_WRITER: stryMutAct_9fa48("66034") ? "" : (stryCov_9fa48("66034"), 'replica_operation_single_writer'),
  /** Ack-before-advance: phase advanced without durable acknowledgement. */
  PHASE_ADVANCED_WITHOUT_ACK: stryMutAct_9fa48("66035") ? "" : (stryCov_9fa48("66035"), 'phase_advanced_without_ack'),
  /** Ack-before-advance: phase advancement followed acknowledgement rules. */
  ACK_BEFORE_ADVANCE_ENFORCED: stryMutAct_9fa48("66036") ? "" : (stryCov_9fa48("66036"), 'ack_before_advance_enforced'),
  /** Split resume: resumable workflow metadata is incomplete. */
  SPLIT_RESUME_INCOMPLETE: stryMutAct_9fa48("66037") ? "" : (stryCov_9fa48("66037"), 'split_resume_incomplete'),
  /** Split resume: resumable workflow metadata is complete. */
  SPLIT_RESUME_COMPLETE: stryMutAct_9fa48("66038") ? "" : (stryCov_9fa48("66038"), 'split_resume_complete'),
  /** Readiness: a consumer used the wrong readiness dimension. */
  READINESS_DIMENSION_INCORRECT: stryMutAct_9fa48("66039") ? "" : (stryCov_9fa48("66039"), 'readiness_dimension_incorrect'),
  /** Readiness: dimensions and derived outcomes are correct. */
  READINESS_DIMENSION_CORRECT: stryMutAct_9fa48("66040") ? "" : (stryCov_9fa48("66040"), 'readiness_dimension_correct'),
  /** Transaction: required transaction coordinator was absent. */
  TRANSACTION_COORDINATOR_MISSING: stryMutAct_9fa48("66041") ? "" : (stryCov_9fa48("66041"), 'transaction_coordinator_missing'),
  /** Transaction: required transaction coordinator was available. */
  TRANSACTION_COORDINATOR_AVAILABLE: stryMutAct_9fa48("66042") ? "" : (stryCov_9fa48("66042"), 'transaction_coordinator_available')
}));

/**
 * Subsystem identifier for the invariant engine.
 * @type {string}
 */
const INVARIANT_ENGINE_SUBSYSTEM = stryMutAct_9fa48("66043") ? "" : (stryCov_9fa48("66043"), 'invariant-engine');

/**
 * Field names for invariant diagnostics bundles.
 * @enum {string}
 */
const INVARIANT_BUNDLE_FIELD = Object.freeze(stryMutAct_9fa48("66044") ? {} : (stryCov_9fa48("66044"), {
  SUMMARY: stryMutAct_9fa48("66045") ? "" : (stryCov_9fa48("66045"), 'summary'),
  BREACHES: stryMutAct_9fa48("66046") ? "" : (stryCov_9fa48("66046"), 'breaches'),
  ARTIFACT_RECORDS: stryMutAct_9fa48("66047") ? "" : (stryCov_9fa48("66047"), 'artifactRecords'),
  TIMESTAMP: stryMutAct_9fa48("66048") ? "" : (stryCov_9fa48("66048"), 'timestamp'),
  TOTAL: stryMutAct_9fa48("66049") ? "" : (stryCov_9fa48("66049"), 'total'),
  PASSED: stryMutAct_9fa48("66050") ? "" : (stryCov_9fa48("66050"), 'passed'),
  FAILED: stryMutAct_9fa48("66051") ? "" : (stryCov_9fa48("66051"), 'failed'),
  HARD_FAILURES: stryMutAct_9fa48("66052") ? "" : (stryCov_9fa48("66052"), 'hardFailures'),
  SOFT_FAILURES: stryMutAct_9fa48("66053") ? "" : (stryCov_9fa48("66053"), 'softFailures')
}));

/**
 * Error message for the invariant gate when hard invariants fail.
 * @type {string}
 */
const INVARIANT_GATE_ERROR_MESSAGE = stryMutAct_9fa48("66054") ? "" : (stryCov_9fa48("66054"), 'Hard invariant gate failed: one or more hard invariants breached');
export { INVARIANT_BUNDLE_FIELD, INVARIANT_ENGINE_SUBSYSTEM, INVARIANT_GATE_ERROR_MESSAGE, INVARIANT_OUTCOME_SEVERITY, INVARIANT_REASON };
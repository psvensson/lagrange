/**
 * Typed participant acknowledgement constants for split executors.
 *
 * Split execution participants (PartitionService for source-side work,
 * child partitions for provisioning) produce acknowledgement payloads
 * that flow through the owner-key reconcile queue to ManagedSplitWorkflow.
 *
 * Payloads compose with PARTICIPANT_ACK_FIELD from workflow-constants.js
 * for the canonical field names (workflowId, participantKey, fenceToken,
 * status, checkpoint, acknowledgedAt).
 *
 * Requirements: 2, 3, 8
 * Design: §1, §3, §4
 */
// @ts-nocheck


/**
 * Participant status values for split executor acknowledgements.
 *
 * Each value represents a semantic split execution boundary that the
 * workflow owner uses to decide whether to advance the split phase.
 *
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
const SPLIT_ACK_STATUS = Object.freeze(stryMutAct_9fa48("107686") ? {} : (stryCov_9fa48("107686"), {
  // Source-side execution acknowledgements (PartitionService)
  SNAPSHOT_STARTED: stryMutAct_9fa48("107687") ? "" : (stryCov_9fa48("107687"), 'snapshot_started'),
  BACKFILL_PROGRESS: stryMutAct_9fa48("107688") ? "" : (stryCov_9fa48("107688"), 'backfill_progress'),
  CATCHUP_READY: stryMutAct_9fa48("107689") ? "" : (stryCov_9fa48("107689"), 'catchup_ready'),
  CUTOVER_APPLIED: stryMutAct_9fa48("107690") ? "" : (stryCov_9fa48("107690"), 'cutover_applied'),
  CLEANUP_COMPLETED: stryMutAct_9fa48("107691") ? "" : (stryCov_9fa48("107691"), 'cleanup_completed'),
  // Child provisioning acknowledgements
  CHILD_PROVISIONED: stryMutAct_9fa48("107692") ? "" : (stryCov_9fa48("107692"), 'child_provisioned'),
  CHILD_PROVISION_FAILED: stryMutAct_9fa48("107693") ? "" : (stryCov_9fa48("107693"), 'child_provision_failed'),
  // Failure acknowledgements
  SNAPSHOT_FAILED: stryMutAct_9fa48("107694") ? "" : (stryCov_9fa48("107694"), 'snapshot_failed'),
  BACKFILL_FAILED: stryMutAct_9fa48("107695") ? "" : (stryCov_9fa48("107695"), 'backfill_failed'),
  CUTOVER_FAILED: stryMutAct_9fa48("107696") ? "" : (stryCov_9fa48("107696"), 'cutover_failed'),
  CLEANUP_FAILED: stryMutAct_9fa48("107697") ? "" : (stryCov_9fa48("107697"), 'cleanup_failed')
}));

/**
 * Terminal status values for split acknowledgements.
 * An acknowledgement with one of these statuses indicates the participant
 * has reached a final state for its execution boundary.
 *
 * @type {ReadonlySet<string>}
 */
const SPLIT_ACK_TERMINAL_STATUSES = Object.freeze(new Set(stryMutAct_9fa48("107698") ? [] : (stryCov_9fa48("107698"), [SPLIT_ACK_STATUS.CUTOVER_APPLIED, SPLIT_ACK_STATUS.CLEANUP_COMPLETED, SPLIT_ACK_STATUS.CHILD_PROVISIONED, SPLIT_ACK_STATUS.CHILD_PROVISION_FAILED, SPLIT_ACK_STATUS.SNAPSHOT_FAILED, SPLIT_ACK_STATUS.BACKFILL_FAILED, SPLIT_ACK_STATUS.CUTOVER_FAILED, SPLIT_ACK_STATUS.CLEANUP_FAILED])));

/**
 * Failure status values for split acknowledgements.
 *
 * @type {ReadonlySet<string>}
 */
const SPLIT_ACK_FAILURE_STATUSES = Object.freeze(new Set(stryMutAct_9fa48("107699") ? [] : (stryCov_9fa48("107699"), [SPLIT_ACK_STATUS.CHILD_PROVISION_FAILED, SPLIT_ACK_STATUS.SNAPSHOT_FAILED, SPLIT_ACK_STATUS.BACKFILL_FAILED, SPLIT_ACK_STATUS.CUTOVER_FAILED, SPLIT_ACK_STATUS.CLEANUP_FAILED])));

/**
 * Checkpoint field names specific to split acknowledgement payloads.
 * These extend the generic PARTICIPANT_ACK_FIELD.CHECKPOINT object
 * with split-specific progress data.
 *
 * @enum {string}
 */
const SPLIT_ACK_CHECKPOINT_FIELD = Object.freeze(stryMutAct_9fa48("107700") ? {} : (stryCov_9fa48("107700"), {
  SNAPSHOT_REVISION: stryMutAct_9fa48("107701") ? "" : (stryCov_9fa48("107701"), 'snapshotRevision'),
  LAST_APPLIED_DELTA: stryMutAct_9fa48("107702") ? "" : (stryCov_9fa48("107702"), 'lastAppliedDelta'),
  BACKFILL_ROWS_COPIED: stryMutAct_9fa48("107703") ? "" : (stryCov_9fa48("107703"), 'backfillRowsCopied'),
  BACKFILL_TOTAL_ROWS: stryMutAct_9fa48("107704") ? "" : (stryCov_9fa48("107704"), 'backfillTotalRows'),
  SOURCE_MIRROR_REMOVED: stryMutAct_9fa48("107705") ? "" : (stryCov_9fa48("107705"), 'sourceMirrorRemoved')
}));

/**
 * Participant key prefixes for split workflow participants.
 * Used to construct canonical participantKey values that compose with
 * PARTICIPANT_ACK_FIELD.PARTICIPANT_KEY.
 *
 * @enum {string}
 */
const SPLIT_PARTICIPANT_PREFIX = Object.freeze(stryMutAct_9fa48("107706") ? {} : (stryCov_9fa48("107706"), {
  SOURCE_PARTITION: stryMutAct_9fa48("107707") ? "" : (stryCov_9fa48("107707"), 'source-partition'),
  LEFT_CHILD: stryMutAct_9fa48("107708") ? "" : (stryCov_9fa48("107708"), 'left-child'),
  RIGHT_CHILD: stryMutAct_9fa48("107709") ? "" : (stryCov_9fa48("107709"), 'right-child')
}));

/**
 * Log messages for split participant acknowledgement processing.
 *
 * @enum {string}
 */
const SPLIT_ACK_LOG_MSG = Object.freeze(stryMutAct_9fa48("107710") ? {} : (stryCov_9fa48("107710"), {
  ACK_RECEIVED: stryMutAct_9fa48("107711") ? "" : (stryCov_9fa48("107711"), 'Split participant acknowledgement received'),
  ACK_ACCEPTED: stryMutAct_9fa48("107712") ? "" : (stryCov_9fa48("107712"), 'Split participant acknowledgement accepted'),
  ACK_STALE_FENCE: stryMutAct_9fa48("107713") ? "" : (stryCov_9fa48("107713"), 'Split participant acknowledgement rejected: stale fence'),
  ACK_DUPLICATE: stryMutAct_9fa48("107714") ? "" : (stryCov_9fa48("107714"), 'Split participant acknowledgement rejected: duplicate'),
  ACK_NOT_FOUND: stryMutAct_9fa48("107715") ? "" : (stryCov_9fa48("107715"), 'Split participant acknowledgement rejected: participant not found')
}));
export { SPLIT_ACK_STATUS, SPLIT_ACK_TERMINAL_STATUSES, SPLIT_ACK_FAILURE_STATUSES, SPLIT_ACK_CHECKPOINT_FIELD, SPLIT_PARTICIPANT_PREFIX, SPLIT_ACK_LOG_MSG };
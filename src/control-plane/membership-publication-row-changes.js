/**
 * The changes a membership publication row accepts, each a pure function of
 * the durable row the publications owner read (ControlPlanePublicationsOwner
 * .applyPublicationChange re-applies it to every row it reads, so the rules
 * below hold at apply time, never on a caller's earlier read):
 * - a node adds itself to the acknowledged set (and closes the row when the
 *   set is complete);
 * - the publication owner refreshes the row's summaries and completes the
 *   acknowledgements its recovery-eligible rule names;
 * - the publication owner abandons a row whose acknowledgement timed out.
 *
 * Status moves only along MEMBERSHIP_PUBLICATION_STATUS_TRANSITIONS, a total
 * table: PUBLISHED never returns to a live status, and an ABANDONED or
 * SUPERSEDED row is never rewritten. Acknowledgements only grow.
 */
import {
  PUBLICATION_CHANGE_UNCHANGED,
  changedPublicationColumns,
  refusePublicationChange,
} from './owners/control-plane-publication-change.js';
import {normalizeControlPlanePublicationRow} from './system-row-normalizers.js';
import {MEMBERSHIP_LIFECYCLE_STATE} from './membership-lifecycle-constants.js';
import {MEMBERSHIP_PUBLICATION_STATUS} from
  './membership-publication-row-contract.js';
import {
  abandonMembershipPublication,
  hasPublicationTimedOut,
  normalizeNodeIdList,
  resolveNowMs,
} from './membership-publication-row-helpers.js';
import {buildPublicationMetadataRefreshRow} from
  './membership-publication-planning-evidence.js';
import {acknowledgeMembershipPublication} from
  './membership-publication-acknowledgement.js';

const {OPEN, ACK_PENDING, PUBLISHED, ABANDONED, SUPERSEDED} =
  MEMBERSHIP_PUBLICATION_STATUS;

// Which status may follow which (the same status is a change of the row's
// other columns). Total: every status has its row.
const MEMBERSHIP_PUBLICATION_STATUS_TRANSITIONS = Object.freeze({
  [OPEN]: Object.freeze([OPEN, ACK_PENDING, PUBLISHED, ABANDONED]),
  [ACK_PENDING]: Object.freeze([ACK_PENDING, PUBLISHED, ABANDONED]),
  // Closed and acknowledged: only its summaries are refreshed.
  [PUBLISHED]: Object.freeze([PUBLISHED]),
  // Final: never rewritten.
  [ABANDONED]: Object.freeze([]),
  [SUPERSEDED]: Object.freeze([]),
});

const MEMBERSHIP_PUBLICATION_CHANGE_REFUSAL = Object.freeze({
  // The row is ABANDONED or SUPERSEDED: it accepts no change.
  FINAL_ROW: 'publication_row_final',
  // The row's status is not one the protocol names.
  STATUS_NOT_RECOGNISED: 'publication_status_not_recognised',
  // The change would move the status against the transition table.
  STATUS_TRANSITION_NOT_ALLOWED: 'publication_status_transition_not_allowed',
  // The acknowledging node is not in the row's required set.
  NODE_NOT_REQUIRED: 'acknowledging_node_not_required',
  // The row's acknowledgement has not timed out.
  NOT_TIMED_OUT: 'publication_not_timed_out',
});

const UPDATED_AT_COLUMN = 'updated_at';

function isAllowedMembershipPublicationStatusTransition(fromStatus, toStatus) {
  const allowed = MEMBERSHIP_PUBLICATION_STATUS_TRANSITIONS[fromStatus];
  return Array.isArray(allowed) && allowed.includes(toStatus);
}

// The refusal a durable row's own status gives every change, or null.
function refusalOfDurableStatus(status) {
  const allowed = MEMBERSHIP_PUBLICATION_STATUS_TRANSITIONS[status];
  if (!Array.isArray(allowed)) {
    return refusePublicationChange(
      MEMBERSHIP_PUBLICATION_CHANGE_REFUSAL.STATUS_NOT_RECOGNISED);
  }
  return allowed.length === 0 ?
    refusePublicationChange(MEMBERSHIP_PUBLICATION_CHANGE_REFUSAL.FINAL_ROW) :
    null;
}

// The change's answer for a computed next row: UNCHANGED when nothing but
// the write time would move, a refusal when the status would move against
// the table, else the next row stamped no earlier than the durable row.
function settleNextRow(durableRow, nextRow, nowMs) {
  const candidate = {...nextRow,
    [UPDATED_AT_COLUMN]: durableRow[UPDATED_AT_COLUMN]};
  if (Object.keys(changedPublicationColumns(durableRow, candidate))
    .length === 0) {
    return PUBLICATION_CHANGE_UNCHANGED;
  }
  const fromStatus = normalizeControlPlanePublicationRow(durableRow).status;
  const toStatus = normalizeControlPlanePublicationRow(candidate).status;
  if (!isAllowedMembershipPublicationStatusTransition(fromStatus, toStatus)) {
    return refusePublicationChange(
      MEMBERSHIP_PUBLICATION_CHANGE_REFUSAL.STATUS_TRANSITION_NOT_ALLOWED);
  }
  return {...candidate, [UPDATED_AT_COLUMN]: Math.max(
    resolveNowMs(nowMs), Number(durableRow[UPDATED_AT_COLUMN]) || 0)};
}

// The lifecycle state is the row status's: a summary derived before the
// row closed (publish_pending) is applied to a PUBLISHED row as
// published_active, never as the state of a row that no longer exists.
function lifecycleSummaryForDurableStatus(summary, durableStatus) {
  if (!summary || typeof summary !== 'object' ||
      durableStatus !== PUBLISHED) {
    return summary;
  }
  return {...summary,
    lifecycleState: MEMBERSHIP_LIFECYCLE_STATE.PUBLISHED_ACTIVE};
}

/**
 * A node's acknowledgement of a publication: it adds only itself.
 * @param {Object} options - {nodeId, now}: the node and the clock.
 * @return {Function} The change.
 */
function membershipPublicationAcknowledgementChange({nodeId, now}) {
  return (durableRow) => {
    const durable = normalizeControlPlanePublicationRow(durableRow);
    if (!durable.requiredAckNodeIds.includes(nodeId)) {
      return refusePublicationChange(
        MEMBERSHIP_PUBLICATION_CHANGE_REFUSAL.NODE_NOT_REQUIRED);
    }
    if (durable.acknowledgedNodeIds.includes(nodeId) &&
        durable.status === PUBLISHED) {
      return PUBLICATION_CHANGE_UNCHANGED;
    }
    const refusal = refusalOfDurableStatus(durable.status);
    if (refusal) {
      return refusal;
    }
    const nowMs = now();
    return settleNextRow(durableRow, acknowledgeMembershipPublication({
      publicationRow: durableRow, nodeId, nowMs}), nowMs);
  };
}

/**
 * The publication owner's refresh of a row: its priority and lifecycle
 * summaries, and the acknowledgements the owner completes (its
 * recovery-eligible rule's answer). Acknowledgements only grow: the owner's
 * set is added to the durable one, within the required set.
 * @param {Object} options - {priorityPartitionSummary,
 *   membershipLifecycleSummary, acknowledgedNodeIds, now}.
 * @return {Function} The change.
 */
function membershipPublicationRefreshChange(options) {
  return (durableRow) => {
    const durable = normalizeControlPlanePublicationRow(durableRow);
    const refusal = refusalOfDurableStatus(durable.status);
    if (refusal) {
      return refusal;
    }
    const required = new Set(durable.requiredAckNodeIds);
    const acknowledgedNodeIds = normalizeNodeIdList([
      ...durable.acknowledgedNodeIds,
      ...normalizeNodeIdList(options.acknowledgedNodeIds)
        .filter((nodeId) => required.has(nodeId)),
    ]);
    const nowMs = options.now();
    return settleNextRow(durableRow, buildPublicationMetadataRefreshRow({
      publicationRow: durableRow,
      priorityPartitionSummary: options.priorityPartitionSummary,
      membershipLifecycleSummary: lifecycleSummaryForDurableStatus(
        options.membershipLifecycleSummary, durable.status),
      acknowledgedNodeIds,
      nowMs,
    }), nowMs);
  };
}

/**
 * The publication owner's abandonment of a row whose acknowledgement timed
 * out (`timeoutMs` after its creation).
 * @param {Object} options - {timeoutMs, reasonCode, now}.
 * @return {Function} The change.
 */
function membershipPublicationTimeoutAbandonChange({timeoutMs, reasonCode,
  now}) {
  return (durableRow) => {
    const durable = normalizeControlPlanePublicationRow(durableRow);
    const refusal = refusalOfDurableStatus(durable.status);
    if (refusal) {
      return refusal;
    }
    const nowMs = now();
    if (!hasPublicationTimedOut(durableRow, {timeoutMs, nowMs})) {
      return refusePublicationChange(
        MEMBERSHIP_PUBLICATION_CHANGE_REFUSAL.NOT_TIMED_OUT);
    }
    return settleNextRow(durableRow, abandonMembershipPublication({
      publicationRow: durableRow, nowMs, reasonCode}), nowMs);
  };
}

export {
  MEMBERSHIP_PUBLICATION_CHANGE_REFUSAL,
  membershipPublicationAcknowledgementChange,
  membershipPublicationRefreshChange,
  membershipPublicationTimeoutAbandonChange,
};

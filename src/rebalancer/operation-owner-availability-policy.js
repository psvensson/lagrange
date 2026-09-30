/**
 * Fenced drain-owner availability for priority-control-plane drain remote
 * settlement (verified-audit findings 5+14, quest
 * operation-ownership-lease-fencing).
 *
 * The drain owner-availability probe historically treated the UNFENCED
 * routing-readiness heuristic (isNodeReadyForRouting) as ownership evidence:
 * an owner that was merely routing-unready was declared "unavailable" and the
 * drain settled remotely — even while that owner still held a live durable
 * lease on the operation. This module makes the persisted owner lease the
 * primary fence:
 *
 *  - A LIVE lease held by the recorded owner FENCES remote settlement even
 *    when the heuristic reports the owner unready: the owner is AVAILABLE
 *    (state FENCED_BY_LIVE_LEASE, unavailable: false). Owner decision
 *    2026-09-25 (quest replace-source-removal-owner, claim L1) corrected the
 *    polarity; the verdict previously reported such an owner unavailable,
 *    which released and stale-failed REPLACEs whose owners were alive.
 *  - A live lease attributed to a node OTHER than the recorded owner is not
 *    the recorded owner's lease and does not fence. The row has no owner
 *    column, so an unattributed live lease is the recorded owner's.
 *  - An UNFENCED or EXPIRED lease defers to the routing-readiness
 *    heuristic (state HEURISTIC_UNAVAILABLE / HEURISTIC_AVAILABLE), exactly
 *    as before the correction (claim L2: the un-wedge path for a genuinely
 *    unavailable owner).
 *  - Local/self ownership is never "remote unavailable"
 *    (state LOCAL_OR_UNKNOWN_OWNER).
 */

import {
  REPLICA_OPERATION_OWNER_LEASE_STATE,
  resolveOperationOwnerLeaseState,
} from './replica-operation-owner-lease.js';

const OPERATION_DRAIN_OWNER_AVAILABILITY = Object.freeze({
  LOCAL_OR_UNKNOWN_OWNER: 'local_or_unknown_owner',
  FENCED_BY_LIVE_LEASE: 'fenced_by_live_lease',
  HEURISTIC_UNAVAILABLE: 'heuristic_unavailable',
  HEURISTIC_AVAILABLE: 'heuristic_available',
});

function normalizeOwnerNodeId(options) {
  return typeof options.ownerNodeId === 'string' &&
    options.ownerNodeId.length > 0 ?
    options.ownerNodeId :
    null;
}

function isRecordedOwnerLiveLease(lease, ownerNodeId) {
  // The replica_operations row has no owner column: the lease expiry is the
  // durable heartbeat and the RECORDED owner (source/target resolution
  // upstream) is its attribution. An unattributed live lease on a
  // remotely-owned row is therefore the recorded owner's lease; a lease
  // explicitly attributed to another node is not.
  return lease.state === REPLICA_OPERATION_OWNER_LEASE_STATE.ACTIVE &&
    (lease.ownerNodeId === null || lease.ownerNodeId === ownerNodeId);
}

function resolveHeuristicReady(isOwnerRoutingReady) {
  try {
    return typeof isOwnerRoutingReady === 'function' ?
      isOwnerRoutingReady() === true :
      true;
  } catch {
    return true;
  }
}

function buildLocalOrUnknownVerdict() {
  return Object.freeze({
    state: OPERATION_DRAIN_OWNER_AVAILABILITY.LOCAL_OR_UNKNOWN_OWNER,
    unavailable: false,
  });
}

function buildLiveLeaseVerdict(ownerNodeId, leaseExpiresAtMs) {
  // A live lease held by the recorded owner means the owner is available and
  // fences remote settlement (owner decision 2026-09-25, claim L1).
  return Object.freeze({
    state: OPERATION_DRAIN_OWNER_AVAILABILITY.FENCED_BY_LIVE_LEASE,
    unavailable: false,
    lease: Object.freeze({
      state: REPLICA_OPERATION_OWNER_LEASE_STATE.ACTIVE,
      ownerNodeId,
      leaseExpiresAtMs,
    }),
  });
}

/**
 * Resolve the drain-owner availability verdict for one incomplete operation.
 * @param {Object} options
 * @param {string|null} options.ownerNodeId - Recorded owner of the operation.
 * @param {string} options.nodeId - This node.
 * @param {Object|null} options.operation - Operation (lease fields read).
 * @param {Function} options.isOwnerRoutingReady - Unfenced availability probe;
 *   called only when no live lease of the recorded owner fences the decision.
 * @param {number} [options.nowMs]
 * @return {Object} Frozen typed verdict — never a raw null/empty outcome.
 */
function resolveOperationDrainOwnerAvailability(options = {}) {
  const ownerNodeId = normalizeOwnerNodeId(options);
  if (ownerNodeId === null || ownerNodeId === options.nodeId) {
    return buildLocalOrUnknownVerdict();
  }
  const lease = resolveOperationOwnerLeaseState(
    options.operation,
    options.nowMs,
  );
  if (isRecordedOwnerLiveLease(lease, ownerNodeId)) {
    return buildLiveLeaseVerdict(ownerNodeId, lease.leaseExpiresAtMs);
  }
  const heuristicReady = resolveHeuristicReady(options.isOwnerRoutingReady);
  return Object.freeze({
    state: heuristicReady ?
      OPERATION_DRAIN_OWNER_AVAILABILITY.HEURISTIC_AVAILABLE :
      OPERATION_DRAIN_OWNER_AVAILABILITY.HEURISTIC_UNAVAILABLE,
    unavailable: heuristicReady !== true,
    lease,
  });
}

export {
  OPERATION_DRAIN_OWNER_AVAILABILITY,
  resolveOperationDrainOwnerAvailability,
};

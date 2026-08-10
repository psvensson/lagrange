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
 *    when the heuristic reports the owner unready (its state is
 *    FENCED_BY_LIVE_LEASE, not raw null).
 *  - An ABSENT (legacy row) or EXPIRED lease defers to the legacy
 *    routing-readiness heuristic (state HEURISTIC_UNAVAILABLE /
 *    HEURISTIC_AVAILABLE).
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

/**
 * Resolve the drain-owner availability verdict for one incomplete operation.
 * @param {Object} options
 * @param {string|null} options.ownerNodeId - Recorded owner of the operation.
 * @param {string} options.nodeId - This node.
 * @param {Object|null} options.operation - Operation (lease fields read).
 * @param {Function} options.isOwnerRoutingReady - Legacy unfenced heuristic;
 *   called only when no live lease fences the decision.
 * @param {number} [options.nowMs]
 * @return {Object} Frozen typed verdict — never a raw null/empty outcome.
 */
function normalizeOwnerNodeId(options) {
  return typeof options.ownerNodeId === 'string' &&
    options.ownerNodeId.length > 0 ?
    options.ownerNodeId :
    null;
}

function resolveNowMs(options) {
  return Number.isFinite(Number(options.nowMs)) ?
    Math.floor(Number(options.nowMs)) :
    Date.now();
}

function readLiveLeaseExpiryMs(options, nowMs) {
  // The replica_operations row has no owner column: the lease expiry is the
  // durable heartbeat and the RECORDED owner (source/target resolution
  // upstream) is its attribution. A live lease expiry on a remotely-owned
  // row is therefore the recorded owner's lease and fences remote
  // settlement; absent or expired expiries defer to the heuristic.
  const leaseExpiresAtMs = Number(
    options.operation?.ownerLeaseExpiresAt ??
      options.operation?.lease_expires_at,
  );
  return Number.isFinite(leaseExpiresAtMs) && leaseExpiresAtMs > nowMs ?
    Math.floor(leaseExpiresAtMs) :
    null;
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
  return Object.freeze({
    state: OPERATION_DRAIN_OWNER_AVAILABILITY.FENCED_BY_LIVE_LEASE,
    unavailable: true,
    lease: Object.freeze({
      state: REPLICA_OPERATION_OWNER_LEASE_STATE.ACTIVE,
      ownerNodeId,
      leaseExpiresAtMs,
    }),
  });
}

function resolveOperationDrainOwnerAvailability(options = {}) {
  const ownerNodeId = normalizeOwnerNodeId(options);
  if (ownerNodeId === null || ownerNodeId === options.nodeId) {
    return buildLocalOrUnknownVerdict();
  }
  const liveLeaseExpiryMs = readLiveLeaseExpiryMs(
    options,
    resolveNowMs(options),
  );
  if (liveLeaseExpiryMs !== null) {
    return buildLiveLeaseVerdict(ownerNodeId, liveLeaseExpiryMs);
  }
  const lease = resolveOperationOwnerLeaseState(
    options.operation,
    options.nowMs,
  );
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

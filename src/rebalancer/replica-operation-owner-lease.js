/**
 * Durable replica-operation owner lease policy (verified-audit findings 5+14,
 * quest operation-ownership-lease-fencing).
 *
 * The replica_operations schema's vestigial lease_expires_at column (today
 * never read nor written) becomes the durable owner-lease foothold:
 *
 *  - WRITES: every canonical owner-driven insert/update of a coordinator-owned
 *    operation stamps ownerNodeId + a fresh ownerLeaseExpiresAt on the row
 *    (buildReplicaOperationRow / buildReplicaOperationUpdateData and the
 *    raw-SQL fallback statements). A fail-soft lease touch may leave an
 *    otherwise durable row without a lease stamp.
 *  - READS: resolveOperationOwnerLeaseState maps a row into one explicit
 *    state. An absent lease on a non-terminal row is UNFENCED (never a
 *    raw null/empty outcome); a future lease is ACTIVE; anything else is
 *    EXPIRED.
 *  - FENCING: a node may ADOPT an incomplete operation as its fenced
 *    successor owner only when the lease is absent or expired at the
 *    observation time. A live lease owned by ANOTHER node fences this node
 *    out — including the priority-control-plane drain owner-availability
 *    probe, which stops treating the unfenced routing-readiness heuristic as
 *    ownership evidence while the recorded owner holds a live lease.
 */

const REPLICA_OPERATION_OWNER_LEASE_STATE = Object.freeze({
  ACTIVE: 'active',
  EXPIRED: 'expired',
  UNFENCED: 'unfenced',
});

const REPLICA_OPERATION_OWNER_LEASE_ADOPTION = Object.freeze({
  ADOPT_AS_FENCED_SUCCESSOR: 'adopt_as_fenced_successor',
  FENCED_BY_LIVE_REMOTE_LEASE: 'fenced_by_live_remote_lease',
});

// Bounded ownership window: long enough that a healthy owner renews it on
// every transition it persists, short enough that a vanished owner's
// orphaned operations become adoptable within one recovery horizon. The
// lease anchors to the ROW's own updated_at so a successor observing the
// durable row later still evaluates the same expiry instant deterministically.
const REPLICA_OPERATION_OWNER_LEASE_TTL_MS = 30_000;

function normalizeOperationOwnerLeaseNodeId(value) {
  return typeof value === 'string' && value.length > 0 ? value : null;
}

function normalizeOperationOwnerLeaseExpiryMs(value) {
  const numeric = Number(value);
  return Number.isFinite(numeric) && numeric > 0 ? Math.floor(numeric) : null;
}

function normalizeOperationOwnerLeaseNowMs(nowMs) {
  const numeric = Number(nowMs);
  return Number.isFinite(numeric) ? Math.floor(numeric) : Date.now();
}

/**
 * Resolve the durable owner-lease state of one operation or raw row.
 * @param {Object} operation
 * @param {number} [nowMs]
 * @return {Object} Frozen typed state — never a raw null/empty outcome.
 */
function resolveOperationOwnerLeaseState(operation, nowMs) {
  const ownerNodeId = normalizeOperationOwnerLeaseNodeId(
    operation?.ownerNodeId ?? operation?.owner_node_id,
  );
  const leaseExpiresAtMs = normalizeOperationOwnerLeaseExpiryMs(
    operation?.ownerLeaseExpiresAt ?? operation?.lease_expires_at,
  );
  if (leaseExpiresAtMs === null) {
    return Object.freeze({
      state: REPLICA_OPERATION_OWNER_LEASE_STATE.UNFENCED,
      ownerNodeId,
      leaseExpiresAtMs,
    });
  }
  if (leaseExpiresAtMs > normalizeOperationOwnerLeaseNowMs(nowMs)) {
    return Object.freeze({
      state: REPLICA_OPERATION_OWNER_LEASE_STATE.ACTIVE,
      ownerNodeId,
      leaseExpiresAtMs,
    });
  }
  return Object.freeze({
    state: REPLICA_OPERATION_OWNER_LEASE_STATE.EXPIRED,
    ownerNodeId,
    leaseExpiresAtMs,
  });
}

/**
 * Resolve whether this node may adopt the operation as the fenced successor
 * owner at `nowMs`. The row has no owner column, so the live lease expiry is
 * the fence: a lease still in the future belongs to the recorded owner (the
 * caller only asks about operations it does NOT locally own) and fences the
 * successor out; an absent or expired lease is adoptable.
 * @param {Object} operation
 * @param {string} nodeId
 * @param {number} [nowMs]
 * @return {Object} Frozen typed adoption verdict.
 */
function resolveOperationOwnerLeaseAdoption(operation, nodeId, nowMs) {
  const lease = resolveOperationOwnerLeaseState(operation, nowMs);
  const leaseExpiresAtMs = lease.leaseExpiresAtMs;
  const observedAtMs = normalizeOperationOwnerLeaseNowMs(nowMs);
  if (
    leaseExpiresAtMs !== null &&
    leaseExpiresAtMs > observedAtMs &&
    lease.ownerNodeId !== nodeId
  ) {
    return Object.freeze({
      adoption: REPLICA_OPERATION_OWNER_LEASE_ADOPTION.FENCED_BY_LIVE_REMOTE_LEASE,
      lease: Object.freeze({
        state: REPLICA_OPERATION_OWNER_LEASE_STATE.ACTIVE,
        ownerNodeId: lease.ownerNodeId,
        leaseExpiresAtMs,
      }),
    });
  }
  return Object.freeze({
    adoption: REPLICA_OPERATION_OWNER_LEASE_ADOPTION.ADOPT_AS_FENCED_SUCCESSOR,
    lease,
  });
}

/**
 * Resolve the lease expiry a persistence boundary must stamp on the row for
 * one owner. The lease anchors to the operation's own updatedAt so the
 * durable row self-describes its expiry instant independent of the
 * observer's clock read. Pure: the live operation object is never mutated —
 * the lease is write-payload state, not domain state (mutating the domain
 * object would corrupt the owner-persisted-transition visibility comparison
 * that matches the projection against the pre-stamp durable row).
 * @param {Object} operation
 * @param {string} ownerNodeId
 * @return {number|null} The lease expiry instant, or null when unstamped.
 */
function resolveOperationOwnerLeaseExpiryForPersist(operation, ownerNodeId) {
  if (normalizeOperationOwnerLeaseNodeId(ownerNodeId) === null) {
    return null;
  }
  const anchorMs = normalizeOperationOwnerLeaseNowMs(operation?.updatedAt);
  return anchorMs + REPLICA_OPERATION_OWNER_LEASE_TTL_MS;
}

export {
  REPLICA_OPERATION_OWNER_LEASE_ADOPTION,
  REPLICA_OPERATION_OWNER_LEASE_STATE,
  REPLICA_OPERATION_OWNER_LEASE_TTL_MS,
  resolveOperationOwnerLeaseAdoption,
  resolveOperationOwnerLeaseExpiryForPersist,
  resolveOperationOwnerLeaseState,
};

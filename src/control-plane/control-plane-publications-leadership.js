import {TABLES} from '../constants/tables.js';
import {COLUMN} from '../constants/columns.js';
import {
  INITIAL_PARTITION_IDS,
  SYSTEM_TABLE_NAME,
} from '../bootstrap/system-table-schemas-constants.js';

// Steady-state predicate for "is this node the control_plane_publications
// partition leader right now?" — the authority that should drive membership
// publication (Phase 4 leader-driven recovery establishment). Replaces the
// bootstrap-only `canWriteSystemTableLocally` check, which resolves via
// localPartitionServices (nulled after bootstrap) and is therefore false for
// every node in steady state.
//
// Tier 1: the PARTITIONS row's leader_node_id — ground truth, durable, replicated.
// Tier 2: a live SERVICES raft_role=leader witness for this node — advisory/faster
//         readback when the partition row has not yet landed in the local cache.
// Fail-safe: returns false on any missing dependency or error (never throws), so
// at worst a node defers and waits for the real leader to drive the reconcile.

const CONTROL_PLANE_PUBLICATIONS_PARTITION_ID =
  INITIAL_PARTITION_IDS[SYSTEM_TABLE_NAME.CONTROL_PLANE_PUBLICATIONS];
const RAFT_ROLE_LEADER = 'leader';

// Which source established (or failed to establish) write-leadership this call.
// Diagnostic only — used by the convergence decision trace to attribute WHY a
// node believed it was/wasn't the owner, without the trace re-deriving the tiers.
const LEADERSHIP_TIER = Object.freeze({
  RAFT_LIVE: 'tier0-raft-live',
  PARTITION_ROW: 'tier1-partition-row',
  SERVICES_WITNESS: 'tier2-services-witness',
  NONE: 'none',
});

// Single source of truth for control_plane_publications write-leadership. Returns
// both the boolean and the tier that decided it. isControlPlanePublicationsWriteLeader
// is exactly `.isLeader` of this — the tier annotation never changes the verdict.
// The branch order and per-tier try/catch boundaries are preserved verbatim from
// the original predicate (which had been wrong twice before settling on Tier-0
// first): Tier-0 live Raft role, then the `!cache || !nodeId` guard, then the
// durable PARTITIONS row, then the live SERVICES witness; fail-safe to NONE.
function resolveControlPlanePublicationsLeadership(
  systemTableCache,
  nodeId,
  cdcIntegrationService = null,
) {
  // Tier-0 (authoritative, never lags): the LIVE in-memory Raft role of this
  // node's local control_plane_publications partition service. canWriteSystemTableLocally
  // resolves via partitionServicesProvider() (steady-state) → resolveLeaderRole
  // (reads partitionService.isLeader / getRole). This is the reliable source; the
  // cache tiers below lag and can be withheld by the very stall we are recovering
  // from, which is why cache-only resolution converged only intermittently.
  try {
    if (
      cdcIntegrationService?.canWriteSystemTableLocally?.(
        TABLES.CONTROL_PLANE_PUBLICATIONS,
      ) === true
    ) {
      return {isLeader: true, tier: LEADERSHIP_TIER.RAFT_LIVE};
    }
  } catch {
    // fall through to the cache tiers
  }
  if (!systemTableCache || !nodeId) {
    return {isLeader: false, tier: LEADERSHIP_TIER.NONE};
  }
  try {
    const partitionRow = systemTableCache.get?.(
      TABLES.PARTITIONS,
      CONTROL_PLANE_PUBLICATIONS_PARTITION_ID,
    );
    if (partitionRow && partitionRow[COLUMN.LEADER_NODE_ID] === nodeId) {
      return {isLeader: true, tier: LEADERSHIP_TIER.PARTITION_ROW};
    }
  } catch {
    // fall through to the live witness
  }
  try {
    const witness = systemTableCache.find?.(
      TABLES.SERVICES,
      (row) =>
        row &&
        row[COLUMN.PARTITION_ID] === CONTROL_PLANE_PUBLICATIONS_PARTITION_ID &&
        row[COLUMN.NODE_ID] === nodeId &&
        String(row[COLUMN.RAFT_ROLE] || '').toLowerCase() === RAFT_ROLE_LEADER,
    );
    if (witness) {
      return {isLeader: true, tier: LEADERSHIP_TIER.SERVICES_WITNESS};
    }
  } catch {
    // fail-safe
  }
  return {isLeader: false, tier: LEADERSHIP_TIER.NONE};
}

function isControlPlanePublicationsWriteLeader(
  systemTableCache,
  nodeId,
  cdcIntegrationService = null,
) {
  return resolveControlPlanePublicationsLeadership(
    systemTableCache,
    nodeId,
    cdcIntegrationService,
  ).isLeader;
}

export {
  isControlPlanePublicationsWriteLeader,
  resolveControlPlanePublicationsLeadership,
  LEADERSHIP_TIER,
  CONTROL_PLANE_PUBLICATIONS_PARTITION_ID,
};

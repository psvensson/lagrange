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
// Tier 1: the PARTITIONS row's leader_node_id — durable, replicated fallback.
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

const LEADERSHIP_RESOLUTION_STATE = Object.freeze({
  RESOLVED: 'resolved',
  UNAVAILABLE: 'unavailable',
});

const LEADERSHIP_RESOLUTION_UNAVAILABLE = Object.freeze({
  state: LEADERSHIP_RESOLUTION_STATE.UNAVAILABLE,
});

function buildLeadershipResolution(isLeader, tier) {
  return Object.freeze({
    state: LEADERSHIP_RESOLUTION_STATE.RESOLVED,
    leadership: Object.freeze({isLeader, tier}),
  });
}

function isLeadershipResolved(resolution) {
  return resolution?.state === LEADERSHIP_RESOLUTION_STATE.RESOLVED;
}

function resolveLiveControlPlanePublicationsLeadership(cdcIntegrationService) {
  try {
    if (
      typeof cdcIntegrationService?.canWriteSystemTableLocally !==
        'function'
    ) {
      return LEADERSHIP_RESOLUTION_UNAVAILABLE;
    }
    const canWriteLocally = cdcIntegrationService.canWriteSystemTableLocally(
      TABLES.CONTROL_PLANE_PUBLICATIONS,
    );
    return buildLeadershipResolution(
      canWriteLocally === true,
      LEADERSHIP_TIER.RAFT_LIVE,
    );
  } catch {
    return LEADERSHIP_RESOLUTION_UNAVAILABLE;
  }
}

function resolvePartitionRowLeadership(systemTableCache, nodeId) {
  try {
    const partitionRow = systemTableCache.get?.(
      TABLES.PARTITIONS,
      CONTROL_PLANE_PUBLICATIONS_PARTITION_ID,
    );
    if (partitionRow && partitionRow[COLUMN.LEADER_NODE_ID] === nodeId) {
      return buildLeadershipResolution(true, LEADERSHIP_TIER.PARTITION_ROW);
    }
  } catch {
    // fall through to the live witness
  }
  return LEADERSHIP_RESOLUTION_UNAVAILABLE;
}

function resolveServicesWitnessLeadership(systemTableCache, nodeId) {
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
      return buildLeadershipResolution(true, LEADERSHIP_TIER.SERVICES_WITNESS);
    }
  } catch {
    // fail-safe
  }
  return LEADERSHIP_RESOLUTION_UNAVAILABLE;
}

// Single source of truth for control_plane_publications write-leadership. Returns
// both the boolean and the tier that decided it. isControlPlanePublicationsWriteLeader
// is exactly `.isLeader` of this — the tier annotation never changes the verdict.
// Branch order: Tier-0 live Raft role, then the `!cache || !nodeId` guard, then
// the durable PARTITIONS row, then the live SERVICES witness; fail-safe to NONE.
function resolveControlPlanePublicationsLeadership(
  systemTableCache,
  nodeId,
  cdcIntegrationService = null,
) {
  // Tier-0 (authoritative, never lags): the LIVE in-memory Raft role of this
  // node's local control_plane_publications partition service. When this signal
  // is available, both true and false are authoritative; stale partition/cache
  // rows must not override a live non-leader verdict.
  const liveResolution =
    resolveLiveControlPlanePublicationsLeadership(cdcIntegrationService);
  if (isLeadershipResolved(liveResolution)) {
    return liveResolution.leadership;
  }
  if (!systemTableCache || !nodeId) {
    return {isLeader: false, tier: LEADERSHIP_TIER.NONE};
  }
  const partitionResolution = resolvePartitionRowLeadership(
    systemTableCache,
    nodeId,
  );
  if (isLeadershipResolved(partitionResolution)) {
    return partitionResolution.leadership;
  }
  const witnessResolution = resolveServicesWitnessLeadership(
    systemTableCache,
    nodeId,
  );
  if (isLeadershipResolved(witnessResolution)) {
    return witnessResolution.leadership;
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

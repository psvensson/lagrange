import {TABLES} from '../constants/tables.js';
import {
  INITIAL_PARTITION_IDS,
  SYSTEM_TABLE_NAME,
} from '../bootstrap/system-table-schemas-constants.js';

// Steady-state predicate for "is this node the control_plane_publications
// partition leader right now?" — the authority that drives membership
// publication (Phase 4 leader-driven recovery establishment).
//
// Write-leadership is granted strictly from Tier-0 live in-memory Raft role
// (`canWriteSystemTableLocally`); cached PARTITIONS/SERVICES rows never grant
// write leadership. Fail-safe: returns `{isLeader: false, tier: NONE}` when
// live authority is unavailable or throws.

const CONTROL_PLANE_PUBLICATIONS_PARTITION_ID =
  INITIAL_PARTITION_IDS[SYSTEM_TABLE_NAME.CONTROL_PLANE_PUBLICATIONS];

// Which source established (or failed to establish) write-leadership this call.
// Diagnostic only — used by the convergence decision trace to attribute WHY a
// node believed it was/wasn't the owner, without the trace re-deriving it.
const LEADERSHIP_TIER = Object.freeze({
  RAFT_LIVE: 'tier0-raft-live',
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

// Single source of truth for control_plane_publications write-leadership. Returns
// both the boolean and the tier that decided it. isControlPlanePublicationsWriteLeader
// is exactly `.isLeader` of this — the tier annotation never changes the verdict.
// Strictly Tier-0 live Raft role; fail-closed to NONE when unavailable.
function resolveControlPlanePublicationsLeadership(
  _systemTableCache,
  _nodeId,
  cdcIntegrationService = null,
) {
  const liveResolution =
    resolveLiveControlPlanePublicationsLeadership(cdcIntegrationService);
  if (isLeadershipResolved(liveResolution)) {
    return liveResolution.leadership;
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

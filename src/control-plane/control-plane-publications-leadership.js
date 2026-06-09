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

function isControlPlanePublicationsWriteLeader(
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
      return true;
    }
  } catch {
    // fall through to the cache tiers
  }
  if (!systemTableCache || !nodeId) {
    return false;
  }
  try {
    const partitionRow = systemTableCache.get?.(
      TABLES.PARTITIONS,
      CONTROL_PLANE_PUBLICATIONS_PARTITION_ID,
    );
    if (partitionRow && partitionRow[COLUMN.LEADER_NODE_ID] === nodeId) {
      return true;
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
      return true;
    }
  } catch {
    // fail-safe
  }
  return false;
}

export {
  isControlPlanePublicationsWriteLeader,
  CONTROL_PLANE_PUBLICATIONS_PARTITION_ID,
};

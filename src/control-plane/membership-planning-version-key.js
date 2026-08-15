import {TABLES} from '../constants/index.js';

// Every system table the membership-planning candidate derivation (and the
// current-priority-placement observation derived from the same tables) reads.
// Version-keyed memos across the formation planning path share this one key
// so their invalidation semantics cannot drift apart: any relevant table
// write rotates the key; non-table inputs (readiness entries, recovery-epoch
// history, router connectivity) are derived from these tables or reach the
// key within one heartbeat interval via the NODES bump — the same bound the
// sealed CL-033 planning-source revision accepts.
const MEMBERSHIP_PLANNING_VERSION_KEY_FIELD_SEPARATOR = ':';
const MEMBERSHIP_PLANNING_VERSION_KEY_ENTRY_SEPARATOR = '|';
const MEMBERSHIP_PLANNING_DERIVATION_SOURCE_TABLES = Object.freeze([
  TABLES.NODES,
  TABLES.NODE_ENDPOINTS,
  TABLES.SERVICES,
  TABLES.PARTITIONS,
  TABLES.CONTROL_PLANE_PUBLICATIONS,
  TABLES.REPLICA_OPERATIONS,
]);

/**
 * @param {Object|null} systemTableCache - Cache exposing
 *   getTableMutationVersion, or any stub without it.
 * @return {string|null} Concatenated per-table mutation-version key, or null
 *   when the cache cannot version its tables (memoization must disable).
 */
function readMembershipPlanningDerivationVersionKey(systemTableCache) {
  if (
    !systemTableCache ||
    typeof systemTableCache.getTableMutationVersion !== 'function'
  ) {
    return null;
  }
  let key = '';
  for (const tableName of MEMBERSHIP_PLANNING_DERIVATION_SOURCE_TABLES) {
    key += tableName +
      MEMBERSHIP_PLANNING_VERSION_KEY_FIELD_SEPARATOR +
      systemTableCache.getTableMutationVersion(tableName) +
      MEMBERSHIP_PLANNING_VERSION_KEY_ENTRY_SEPARATOR;
  }
  return key;
}

export {
  readMembershipPlanningDerivationVersionKey,
};

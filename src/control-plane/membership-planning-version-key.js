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

// Generation-refresh floor: during formation data load the source tables
// mutate faster than one planning sweep completes, so an exact per-write
// key rotates between consecutive reads, every derivation re-runs, and
// every downstream identity memo misses per call — measured live as the
// dominant residual seed freeze (archived runs 16-36-59-912Z-profiled and
// 17-19-53-698Z-natural) and reproduced deterministically at ~70 write
// rounds per sweep. Latching the observed generations for up to 250ms
// restored the zero-churn sweep baseline (5.2x) while staying 20x inside
// the sealed CL-033/heartbeat 5s staleness bound that every consumer of
// this key already accepts.
const MEMBERSHIP_PLANNING_VERSION_KEY_REFRESH_FLOOR_MS = 250;
const VERSION_KEY_LATCH_BY_CACHE = new WeakMap();

/**
 * @param {Object|null} systemTableCache - Cache exposing
 *   getTableMutationVersion, or any stub without it.
 * @param {number} [nowMs] - Caller clock for the refresh floor; defaults to
 *   Date.now().
 * @return {string|null} Concatenated per-table mutation-version key, or null
 *   when the cache cannot version its tables (memoization must disable).
 */
function readMembershipPlanningDerivationVersionKey(systemTableCache, nowMs) {
  if (
    !systemTableCache ||
    typeof systemTableCache.getTableMutationVersion !== 'function'
  ) {
    return null;
  }
  const now = Number.isFinite(nowMs) ? nowMs : Date.now();
  const latch = VERSION_KEY_LATCH_BY_CACHE.get(systemTableCache);
  if (latch) {
    const sinceRefreshMs = now - latch.refreshedAtMs;
    if (sinceRefreshMs >= 0 &&
      sinceRefreshMs < MEMBERSHIP_PLANNING_VERSION_KEY_REFRESH_FLOOR_MS) {
      return latch.key;
    }
  }
  let key = '';
  for (const tableName of MEMBERSHIP_PLANNING_DERIVATION_SOURCE_TABLES) {
    key += tableName +
      MEMBERSHIP_PLANNING_VERSION_KEY_FIELD_SEPARATOR +
      systemTableCache.getTableMutationVersion(tableName) +
      MEMBERSHIP_PLANNING_VERSION_KEY_ENTRY_SEPARATOR;
  }
  VERSION_KEY_LATCH_BY_CACHE.set(systemTableCache, {
    key,
    refreshedAtMs: now,
  });
  return key;
}

export {
  readMembershipPlanningDerivationVersionKey,
};

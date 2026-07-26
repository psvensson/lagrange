// Snapshot compacted-log boundary (quest raft-snapshot-atomic-install, R3).
// After an install, `_raft_log` is empty up to the boundary while
// `_raft_state` carries `snapshotLastIncludedIndex/Term`. This leaf module
// owns reading that pair and the boundary-aware floors the adapters consult.
// A genuinely virgin log (keys absent) reads as {0, 0} so the CL-042
// empty-log zero stays load-bearing for election safety.

import {
  RAFT_SNAPSHOT_BOUNDARY_STATE_KEY,
} from './snapshot-install-constants.js';

const SELECT_STATE_VALUE = 'SELECT value FROM _raft_state WHERE key = ?';
const DECIMAL_RADIX = 10;
const VIRGIN_BOUNDARY = Object.freeze({
  lastIncludedIndex: 0,
  lastIncludedTerm: 0,
});

function readBoundaryInteger(db, key) {
  const row = db.prepare(SELECT_STATE_VALUE).get(key);
  if (!row) return 0;
  const value = Number.parseInt(row.value, DECIMAL_RADIX);
  return Number.isSafeInteger(value) && value > 0 ? value : 0;
}

/**
 * Read the compacted-log boundary from a database's `_raft_state`.
 * @param {Object} db open better-sqlite3 handle
 * @return {{lastIncludedIndex: number, lastIncludedTerm: number}} the
 *   boundary, or the frozen virgin {0, 0} when no boundary is recorded
 */
function readSnapshotBoundary(db) {
  const lastIncludedIndex = readBoundaryInteger(
    db, RAFT_SNAPSHOT_BOUNDARY_STATE_KEY.LAST_INCLUDED_INDEX);
  if (lastIncludedIndex === 0) {
    return VIRGIN_BOUNDARY;
  }
  return Object.freeze({
    lastIncludedIndex,
    lastIncludedTerm: readBoundaryInteger(
      db, RAFT_SNAPSHOT_BOUNDARY_STATE_KEY.LAST_INCLUDED_TERM),
  });
}

/**
 * Whether an index refers to a compacted, durably applied entry: at or below
 * the boundary but never index zero (CL-042's zero stays a virgin marker).
 * @param {number} index raft log index
 * @param {{lastIncludedIndex: number}} boundary from readSnapshotBoundary
 * @return {boolean} true when the entry is known-present but compacted
 */
function isCompactedIndex(index, boundary) {
  return Number.isSafeInteger(index) && index > 0 &&
    index <= boundary.lastIncludedIndex;
}

/**
 * Read the sealed max-committed-HLC witness written by a snapshot install
 * (null when absent — virgin database or pre-install).
 * @param {Object} db open better-sqlite3 handle
 * @return {string|null} the sealed HLC string or null
 */
function readInstalledMaxCommittedHlc(db) {
  const row = db.prepare(SELECT_STATE_VALUE).get(
    RAFT_SNAPSHOT_BOUNDARY_STATE_KEY.MAX_COMMITTED_HLC);
  return row ? row.value : null;
}

export {
  isCompactedIndex,
  readInstalledMaxCommittedHlc,
  readSnapshotBoundary,
  VIRGIN_BOUNDARY,
};

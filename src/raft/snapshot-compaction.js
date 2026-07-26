// Raft proof-gated physical log compaction (quest
// raft-snapshot-retention-compaction, spec solve/specs/
// raft-snapshot-transfer-install/retention-compaction-design.md, S5). The
// cutover: `compactCommittedEntries` gains a typed decision table whose only
// removal path demands a VALID local checkpoint proof at or above the
// requested index, while the PROOFLESS call keeps returning the exact frozen
// `snapshot_protocol_unavailable` refusal every existing caller receives.
//
// This module also owns the snapshot-boundary refresh-on-row-miss discipline:
// compaction makes the live adapter the SECOND boundary writer (S2's
// "boundary only changes at the closed-handle install" note is amended), so
// a stale-LOW cached boundary on another facade over the same database is no
// longer safe once rows are deleted. Every row-miss decision site re-anchors
// the cached boundary against durable `_raft_state` before answering,
// mirroring refreshCommittedIndexCacheFromStore — and only on the miss path,
// so hot-path reads stay cache-served.
//
// Installed onto SQLiteLogAdapter.prototype (the callback-api precedent) so
// the adapter file stays inside the source size ratchet.

import {HLCTimestamp} from '../hlc/hlc-timestamp.js';
import {
  RAFT_COMPACTION_OUTCOME,
  unsupportedRaftCompactionResult,
} from './compaction-policy.js';
import {isValidRaftLogIndex} from './log-index.js';
import {
  RAFT_CHECKPOINT_VALIDATION_OUTCOME,
} from './snapshot-checkpoint-constants.js';
import {readCheckpoint} from './snapshot-checkpoint-store.js';
import {
  RAFT_SNAPSHOT_BOUNDARY_STATE_KEY,
} from './snapshot-install-constants.js';

const OUTCOME = RAFT_COMPACTION_OUTCOME;
const COMPACTION_TYPEOF = Object.freeze({
  STRING: 'string',
  OBJECT: 'object',
});
// Same UPSERT the adapter state owner uses (duplicated locally, the
// snapshot-install.js precedent, to keep this module import-acyclic with the
// callback-api mixin).
const UPSERT_STATE_SQL =
  'INSERT INTO _raft_state (key, value) VALUES (?, ?) ' +
  'ON CONFLICT(key) DO UPDATE SET value = excluded.value';
const SELECT_STATE_VALUE = 'SELECT value FROM _raft_state WHERE key = ?';
const SELECT_LOG_TERM = 'SELECT term FROM _raft_log WHERE log_index = ?';
const SELECT_PREFIX_COMMANDS =
  'SELECT command FROM _raft_log WHERE log_index <= ? ORDER BY log_index';
// Index 0 is the virgin marker, never a compaction target (CL-042 zero).
const VIRGIN_LOG_INDEX = 0;

function compactionRefusal(outcome) {
  return Object.freeze({outcome, changed: false});
}

// A request participates in the S5 protocol only when it names toIndex or
// proof; everything else (every existing caller) draws the EXACT frozen
// proofless refusal, byte-identical and identity-stable.
function isCompactionProtocolRequest(request) {
  return Boolean(request) && typeof request === COMPACTION_TYPEOF.OBJECT &&
    (request.toIndex !== undefined || request.proof !== undefined);
}

// Structural, identity-free proof read: the descriptor+payload chain must be
// VALID on disk (readCheckpoint re-digests the payload). Identity is not
// enforced here — the term anchor below rejects foreign checkpoints.
function readCompactionProof(proof) {
  if (!proof ||
      typeof proof.checkpointDir !== COMPACTION_TYPEOF.STRING ||
      proof.checkpointDir.length === 0) {
    return {valid: false};
  }
  const read = readCheckpoint({checkpointDir: proof.checkpointDir});
  if (read.outcome !== RAFT_CHECKPOINT_VALIDATION_OUTCOME.VALID) {
    return {valid: false};
  }
  return {valid: true, descriptor: read.descriptor};
}

// Term-anchor the proof against the live log: the descriptor's
// lastIncludedTerm must agree with the live row at its lastIncludedIndex
// (or with the boundary keys when that index is already compacted).
function proofTermConflicts(db, descriptor, boundary) {
  const row = db.prepare(SELECT_LOG_TERM).get(descriptor.lastIncludedIndex);
  if (row) {
    return row.term !== descriptor.lastIncludedTerm;
  }
  if (boundary.lastIncludedIndex === descriptor.lastIncludedIndex) {
    return boundary.lastIncludedTerm !== descriptor.lastIncludedTerm;
  }
  return false;
}

// term(toIndex) read from the live log BEFORE deletion — the new boundary
// keys are written from it in the SAME transaction as the delete. A
// genuinely absent term row is a typed refusal, never a guess (toIndex at
// the existing boundary is already_compacted upstream).
function readPreDeletionTerm(db, toIndex) {
  const row = db.prepare(SELECT_LOG_TERM).get(toIndex);
  return row ? {found: true, term: row.term} : {found: false};
}

function parseEntryHlc(rawCommand) {
  try {
    const envelope = JSON.parse(rawCommand);
    const timestamp = envelope?.command?.timestamp;
    return typeof timestamp === COMPACTION_TYPEOF.STRING ?
      HLCTimestamp.tryFromString(timestamp) :
      null;
  } catch (_error) {
    return null;
  }
}

// max(existing maxCommittedHlc key, max HLC over the rows being deleted):
// without the fold a never-installed leader deletes the rows carrying its
// HLC evidence and a later checkpoint seals a REGRESSED clock.
function foldMaxCommittedHlc(db, toIndex) {
  const existingRow = db.prepare(SELECT_STATE_VALUE).get(
    RAFT_SNAPSHOT_BOUNDARY_STATE_KEY.MAX_COMMITTED_HLC);
  let max = existingRow ? HLCTimestamp.tryFromString(existingRow.value) : null;
  for (const row of db.prepare(SELECT_PREFIX_COMMANDS).iterate(toIndex)) {
    const parsed = parseEntryHlc(row.command);
    if (parsed && (max === null || parsed.compare(max) > 0)) {
      max = parsed;
    }
  }
  return max === null ? null : max.toString();
}

// ONE SQLite transaction: advance the boundary keys from the pre-deletion
// term, fold the deleted rows' HLC evidence into maxCommittedHlc, then
// delete the prefix (via the adapter's owner method — the mutation SQL
// stays in the single _raft_log write owner). committedIndex and
// lastAppliedIndex are untouched (>= the boundary by construction).
function runCompactionTransaction(adapter, toIndex, boundaryTerm) {
  const {db} = adapter;
  const upsert = db.prepare(UPSERT_STATE_SQL);
  return db.transaction(() => {
    const foldedHlc = foldMaxCommittedHlc(db, toIndex);
    upsert.run(
      RAFT_SNAPSHOT_BOUNDARY_STATE_KEY.LAST_INCLUDED_INDEX, String(toIndex));
    upsert.run(
      RAFT_SNAPSHOT_BOUNDARY_STATE_KEY.LAST_INCLUDED_TERM,
      String(boundaryTerm));
    if (foldedHlc !== null) {
      upsert.run(RAFT_SNAPSHOT_BOUNDARY_STATE_KEY.MAX_COMMITTED_HLC, foldedHlc);
    }
    return {removedEntryCount: adapter.deleteCommittedPrefixRows(toIndex)};
  })();
}

const snapshotCompactionMethods = {
  /**
   * Re-anchor the cached snapshot boundary to durable `_raft_state` (the
   * refreshCommittedIndexCacheFromStore discipline: compaction is the
   * second, live-adapter boundary writer).
   * @return {{lastIncludedIndex: number, lastIncludedTerm: number}}
   */
  refreshSnapshotBoundaryFromStore() {
    this._snapshotBoundaryCache = undefined;
    return this.getSnapshotBoundary();
  },

  /**
   * Boundary consulted after a row MISS at `index`: refresh from durable
   * state whenever the miss sits at or below the durable committed
   * watermark (a compacted row, not a genuinely absent one) and the cached
   * boundary cannot already explain it. Cache-served everywhere else.
   * @param {number} index missed log index
   * @return {{lastIncludedIndex: number, lastIncludedTerm: number}}
   */
  resolveBoundaryAfterRowMiss(index) {
    const cached = this.getSnapshotBoundary();
    if (!isValidRaftLogIndex(index) || index <= cached.lastIncludedIndex) {
      return cached;
    }
    if (index <= this.refreshCommittedIndexCacheFromStore()) {
      return this.refreshSnapshotBoundaryFromStore();
    }
    return cached;
  },

  /**
   * Boundary consulted when the whole log reads EMPTY: refresh whenever the
   * cached boundary sits below the durable committed watermark (compaction
   * emptied the log past the cache; answering the stale boundary would
   * break the CL-042 compacted-empty last-log identity).
   * @return {{lastIncludedIndex: number, lastIncludedTerm: number}}
   */
  resolveBoundaryAfterLogEmpty() {
    const cached = this.getSnapshotBoundary();
    if (cached.lastIncludedIndex >= this.refreshCommittedIndexCacheFromStore()) {
      return cached;
    }
    return this.refreshSnapshotBoundaryFromStore();
  },

  /**
   * Proof-gated committed-prefix compaction (S5 decision table). The
   * proofless call returns the byte-identical frozen
   * snapshot_protocol_unavailable refusal; a valid local proof at or above
   * toIndex compacts in one transaction and invalidates the boundary cache.
   * @param {Object} [request] {toIndex, proof: {checkpointDir}}
   * @return {Object} frozen typed result
   */
  compactCommittedEntries(request) {
    if (!isCompactionProtocolRequest(request) || !this.isOpen()) {
      return unsupportedRaftCompactionResult();
    }
    const {toIndex, proof} = request;
    if (!isValidRaftLogIndex(toIndex) || toIndex === VIRGIN_LOG_INDEX) {
      return compactionRefusal(OUTCOME.INVALID_COMPACTION_INDEX);
    }
    const boundary = this.refreshSnapshotBoundaryFromStore();
    if (toIndex <= boundary.lastIncludedIndex) {
      return compactionRefusal(OUTCOME.ALREADY_COMPACTED);
    }
    const proofRead = readCompactionProof(proof);
    if (!proofRead.valid) {
      return compactionRefusal(OUTCOME.SNAPSHOT_PROOF_MISSING);
    }
    if (proofRead.descriptor.lastIncludedIndex < toIndex) {
      return compactionRefusal(OUTCOME.SNAPSHOT_PROOF_STALE);
    }
    if (proofTermConflicts(this.db, proofRead.descriptor, boundary)) {
      return compactionRefusal(OUTCOME.SNAPSHOT_PROOF_TERM_CONFLICT);
    }
    if (toIndex > this.refreshCommittedIndexCacheFromStore()) {
      return compactionRefusal(OUTCOME.BEYOND_COMMITTED_REFUSAL);
    }
    const termRead = readPreDeletionTerm(this.db, toIndex);
    if (!termRead.found) {
      return compactionRefusal(OUTCOME.BOUNDARY_TERM_UNRESOLVABLE);
    }
    const compacted = runCompactionTransaction(this, toIndex, termRead.term);
    return Object.freeze({
      outcome: OUTCOME.COMPACTED,
      changed: true,
      removedEntryCount: compacted.removedEntryCount,
      boundary: this.refreshSnapshotBoundaryFromStore(),
    });
  },
};

/**
 * Install the compaction and boundary-refresh methods with class-method
 * descriptors (the callback-api precedent).
 * @param {Function} AdapterClass - SQLiteLogAdapter constructor.
 * @return {void}
 */
function installSnapshotCompactionApi(AdapterClass) {
  const descriptors = {};
  for (const [name, value] of Object.entries(snapshotCompactionMethods)) {
    descriptors[name] = {
      configurable: true,
      enumerable: false,
      value,
      writable: true,
    };
  }
  Object.defineProperties(AdapterClass.prototype, descriptors);
}

export {installSnapshotCompactionApi};

// Raft proof-gated physical log compaction for `RaftRsDurableStore` (SN1 / F5,
// spec solve/specs/raft-snapshot-transfer-install/retention-compaction-design.md,
// S5). `compactRaftRsCommittedEntries` owns the typed decision table whose only
// removal path demands a VALID local checkpoint proof at or above the requested
// index, while the proofless call returns the exact frozen
// `snapshot_protocol_unavailable` refusal.

import {
  RAFT_COMPACTION_OUTCOME,
  unsupportedRaftCompactionResult,
} from './compaction-policy.js';
import {isValidRaftLogIndex} from './log-index.js';
import {
  RAFT_CHECKPOINT_VALIDATION_OUTCOME,
} from './snapshot-checkpoint-constants.js';
import {readCheckpoint} from './snapshot-checkpoint-store.js';
import {RaftRsDurableStore} from './raft-rs-durable-store.js';

const OUTCOME = RAFT_COMPACTION_OUTCOME;
const COMPACTION_TYPEOF = Object.freeze({
  STRING: 'string',
  OBJECT: 'object',
});
// Index 0 is the virgin marker, never a compaction target (CL-042 zero).
const VIRGIN_LOG_INDEX = 0;

function compactionRefusal(outcome) {
  return Object.freeze({outcome, changed: false});
}

// A request participates in the S5 protocol only when it names toIndex or
// proof; everything else draws the exact frozen proofless refusal,
// byte-identical and identity-stable.
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

function raftRsProofTermConflicts(db, groupId, descriptor) {
  if (descriptor.raftRs && descriptor.raftRs.groupId !== groupId) {
    return true;
  }
  const record = RaftRsDurableStore.readDurableRecordIn(db, groupId);
  const entry = record.entries.find(
    ({index}) => Number(index) === descriptor.lastIncludedIndex);
  if (entry) {
    return Number(entry.term) !== descriptor.lastIncludedTerm;
  }
  if (record.snapshot &&
      Number(record.snapshot.metadata.index) === descriptor.lastIncludedIndex) {
    return Number(record.snapshot.metadata.term) !==
      descriptor.lastIncludedTerm;
  }
  return false;
}

function validateRaftRsCompactionProof(db, groupId, toIndex, proof) {
  const proofRead = readCompactionProof(proof);
  if (!proofRead.valid) {
    return {refusal: compactionRefusal(OUTCOME.SNAPSHOT_PROOF_MISSING)};
  }
  const {descriptor} = proofRead;
  if (descriptor.lastIncludedIndex < toIndex) {
    return {refusal: compactionRefusal(OUTCOME.SNAPSHOT_PROOF_STALE)};
  }
  if (raftRsProofTermConflicts(db, groupId, descriptor)) {
    return {refusal: compactionRefusal(OUTCOME.SNAPSHOT_PROOF_TERM_CONFLICT)};
  }
  return {descriptor};
}

function buildRaftRsCompactionSpec(descriptor, toIndex, retentionFloorIndex) {
  const exactBoundaryMatch = descriptor.lastIncludedIndex === toIndex;
  return {
    toIndex,
    boundaryTerm: exactBoundaryMatch ?
      descriptor.lastIncludedTerm :
      undefined,
    confState: exactBoundaryMatch ?
      descriptor.raftRs?.confState :
      undefined,
    membershipGenerationIndex: exactBoundaryMatch ?
      descriptor.raftRs?.membershipGenerationIndex :
      undefined,
    maxCommittedHlc: descriptor.maxCommittedHlc,
    retentionFloorIndex,
  };
}

/**
 * Proof-gated committed-prefix compaction for `RaftRsDurableStore` (SN1 / F5).
 * Mirrors the S5 decision table (`SNAPSHOT_PROTOCOL_UNAVAILABLE`,
 * `INVALID_COMPACTION_INDEX`, `ALREADY_COMPACTED`, `SNAPSHOT_PROOF_MISSING`,
 * `SNAPSHOT_PROOF_STALE`, `SNAPSHOT_PROOF_TERM_CONFLICT`,
 * `BEYOND_COMMITTED_REFUSAL`, `BOUNDARY_TERM_UNRESOLVABLE`, `COMPACTED`).
 * @param {Object} db - Open better-sqlite3 database.
 * @param {string} groupId - Raft group identifier.
 * @param {Object} [request] - `{toIndex, proof: {checkpointDir}, retentionFloorIndex?}`.
 * @return {Object} Frozen typed compaction outcome.
 */
function compactRaftRsCommittedEntries(db, groupId, request) {
  if (!isCompactionProtocolRequest(request) ||
      !db?.open || db.memory ||
      !RaftRsDurableStore.hasDurableRecordIn(db, groupId)) {
    return unsupportedRaftCompactionResult();
  }
  const {toIndex, proof} = request;
  if (!isValidRaftLogIndex(toIndex) || toIndex === VIRGIN_LOG_INDEX) {
    return compactionRefusal(OUTCOME.INVALID_COMPACTION_INDEX);
  }
  const currentBoundary = Number(
    RaftRsDurableStore.readSnapshotIndexIn(db, groupId));
  if (toIndex <= currentBoundary) {
    return compactionRefusal(OUTCOME.ALREADY_COMPACTED);
  }
  const validated = validateRaftRsCompactionProof(db, groupId, toIndex, proof);
  if (validated.refusal) {
    return validated.refusal;
  }
  const store = new RaftRsDurableStore(db);
  return store.compactCommittedPrefix(
    groupId,
    buildRaftRsCompactionSpec(
      validated.descriptor, toIndex, request.retentionFloorIndex),
  );
}

export {
  compactRaftRsCommittedEntries,
};

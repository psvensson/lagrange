// Durable snapshot witness and proof-gated committed-prefix compaction for
// `RaftRsDurableStore` (SN1 / F5). Persists the folded `maxCommittedHlc`
// witness inside `_raft_rs_snapshot.data` (canonical base64 JSON) and removes
// compacted `_raft_rs_log` rows in a single SYNCED SQLite transaction.

import {RAFT_COMPACTION_OUTCOME} from './compaction-policy.js';
import {
  RAFT_RS_COMMIT_DURABILITY,
  RAFT_RS_SQL,
} from './raft-rs-durable-store-constants.js';
import {decodeCommittedProposal} from './raft-rs-proposal-codec.js';
import {RAFT_RS_ENTRY_TYPE} from './raft-rs-ready-loop-constants.js';

const BASE64_ENCODING = 'base64';
const UTF8_ENCODING = 'utf8';
const NO_COMMITTED_HLC = '0';
const DECIMAL_DIGITS = /^[1-9]\d*$/u;
const MAX_SAFE_POSITION = BigInt(Number.MAX_SAFE_INTEGER);
const HLC_SEPARATOR = '-';
const HLC_MIN_PARTS = 3;
const HLC_NODE_ID_START = 2;
const HLC_RADIX = 10;

function refusal(outcome) {
  return Object.freeze({outcome, changed: false});
}

function parseCompactionTargetIndex(toIndex) {
  if (typeof toIndex === 'number') {
    if (!Number.isSafeInteger(toIndex) || toIndex <= 0) {
      return null;
    }
    return BigInt(toIndex);
  }
  if (typeof toIndex === 'string' && DECIMAL_DIGITS.test(toIndex)) {
    const parsed = BigInt(toIndex);
    return parsed <= MAX_SAFE_POSITION ? parsed : null;
  }
  return null;
}

/**
 * Encode the compacted HLC witness as canonical base64 JSON for
 * `_raft_rs_snapshot.data`.
 * @param {string|null|undefined} maxCommittedHlc - HLC timestamp string.
 * @return {string|null} Canonical base64 payload, or null when absent/zero.
 */
function encodeSnapshotWitnessData(maxCommittedHlc) {
  if (typeof maxCommittedHlc !== 'string' ||
      maxCommittedHlc.length === 0 ||
      maxCommittedHlc === NO_COMMITTED_HLC) {
    return null;
  }
  return Buffer.from(
    JSON.stringify({maxCommittedHlc}),
    UTF8_ENCODING,
  ).toString(BASE64_ENCODING);
}

function decodeSnapshotWitnessMaxHlc(rawData) {
  if (typeof rawData !== 'string' || rawData.length === 0) {
    return null;
  }
  try {
    const jsonText = Buffer.from(rawData, BASE64_ENCODING)
      .toString(UTF8_ENCODING);
    const parsed = JSON.parse(jsonText);
    const hlc = parsed?.maxCommittedHlc;
    return typeof hlc === 'string' && hlc.length > 0 &&
      hlc !== NO_COMMITTED_HLC ? hlc : null;
  } catch {
    return null;
  }
}

/**
 * Read the compacted `maxCommittedHlc` witness from `_raft_rs_snapshot`
 * without running DDL.
 * @param {Object} db - Open better-sqlite3 database.
 * @param {string} groupId - Raft group identifier.
 * @return {string|null} Max committed HLC string, or null when none exists.
 */
function readCompactedMaxHlcIn(db, groupId) {
  if (!db || !db.open) {
    return null;
  }
  const {present} = db.prepare(RAFT_RS_SQL.COUNT_SNAPSHOT_TABLE).get();
  if (present === 0) {
    return null;
  }
  const row = db.prepare(RAFT_RS_SQL.SELECT_SNAPSHOT_DATA).get(groupId);
  return decodeSnapshotWitnessMaxHlc(row?.data);
}

/**
 * Read the durable `_raft_rs_snapshot.snapshot_index` for `groupId` without
 * running DDL.
 * @param {Object} db - Open better-sqlite3 database.
 * @param {string} groupId - Raft group identifier.
 * @return {bigint} Snapshot index (`0n` when absent).
 */
function readSnapshotIndexIn(db, groupId) {
  if (!db || !db.open) {
    return 0n;
  }
  const {present} = db.prepare(RAFT_RS_SQL.COUNT_SNAPSHOT_TABLE).get();
  if (present === 0) {
    return 0n;
  }
  const row = db.prepare(RAFT_RS_SQL.SELECT_SNAPSHOT_INDEX)
    .safeIntegers(true)
    .get(groupId);
  return row ? BigInt(row.snapshot_index) : 0n;
}

function parseCandidateHlc(candidate) {
  if (typeof candidate !== 'string' || candidate.length === 0) {
    return null;
  }
  const parts = candidate.split(HLC_SEPARATOR);
  if (parts.length < HLC_MIN_PARTS) {
    return null;
  }
  const physical = Number.parseInt(parts[0], HLC_RADIX);
  const logical = Number.parseInt(parts[1], HLC_RADIX);
  if (Number.isNaN(physical) || Number.isNaN(logical)) {
    return null;
  }
  const nodeId = parts.slice(HLC_NODE_ID_START).join(HLC_SEPARATOR);
  return {
    physical,
    logical,
    nodeId,
    text: `${physical}${HLC_SEPARATOR}${logical}${HLC_SEPARATOR}${nodeId}`,
  };
}

function compareParsedHlc(left, right) {
  if (left.physical !== right.physical) {
    return left.physical - right.physical;
  }
  if (left.logical !== right.logical) {
    return left.logical - right.logical;
  }
  return left.nodeId.localeCompare(right.nodeId);
}

function foldCandidateHlc(currentMax, candidate) {
  const parsed = parseCandidateHlc(candidate);
  if (!parsed) {
    return currentMax;
  }
  return currentMax === null || compareParsedHlc(parsed, currentMax) > 0 ?
    parsed :
    currentMax;
}

function extractLogRowHlc(row) {
  if (Number(row.entry_type) !== RAFT_RS_ENTRY_TYPE.NORMAL ||
      typeof row.data !== 'string' ||
      row.data.length === 0) {
    return null;
  }
  try {
    const bytes = Buffer.from(row.data, BASE64_ENCODING);
    if (bytes.length === 0) {
      return null;
    }
    const command = decodeCommittedProposal(bytes);
    return command?.timestamp ?? null;
  } catch {
    return null;
  }
}

function foldCompactedPrefixMaxHlc(db, groupId, exactToIndex, seedMaxHlc) {
  let max = foldCandidateHlc(null, readCompactedMaxHlcIn(db, groupId));
  max = foldCandidateHlc(max, seedMaxHlc);
  const rows = db.prepare(RAFT_RS_SQL.SELECT_LOG_ENTRIES_UP_TO)
    .safeIntegers(true)
    .all(groupId, exactToIndex);
  for (const row of rows) {
    max = foldCandidateHlc(max, extractLogRowHlc(row));
  }
  return max === null ? NO_COMMITTED_HLC : max.text;
}

function resolveSnapshotGeneration(record, exactToIndex, explicitGeneration) {
  if (explicitGeneration !== undefined && explicitGeneration !== null) {
    return String(explicitGeneration);
  }
  const currentGeneration = BigInt(record.membershipGenerationIndex);
  return currentGeneration <= exactToIndex ?
    record.membershipGenerationIndex :
    null;
}

function validateCompactionBounds(record, exactToIndex, options) {
  const currentSnapshotIndex = record.snapshot?.metadata?.index ?
    BigInt(record.snapshot.metadata.index) :
    0n;
  if (exactToIndex <= currentSnapshotIndex) {
    return refusal(RAFT_COMPACTION_OUTCOME.ALREADY_COMPACTED);
  }
  const appliedIndex = BigInt(record.appliedIndex);
  const commitIndex = BigInt(record.hardState?.commit ?? '0');
  const retentionFloor = options.retentionFloorIndex !== undefined &&
    options.retentionFloorIndex !== null ?
    BigInt(options.retentionFloorIndex) :
    appliedIndex;
  if (exactToIndex > appliedIndex ||
      exactToIndex > commitIndex ||
      exactToIndex > retentionFloor) {
    return refusal(RAFT_COMPACTION_OUTCOME.BEYOND_COMMITTED_REFUSAL);
  }
  return null;
}

/**
 * Atomically advance `_raft_rs_snapshot` to `toIndex`, fold `maxCommittedHlc`
 * across all deleted prefix entries, and delete `_raft_rs_log` rows at or
 * below `toIndex` in one SYNCED SQLite transaction.
 * @param {Object} store - `RaftRsDurableStore` instance.
 * @param {string} groupId - Raft group identifier.
 * @param {Object} [options] - Compaction parameters.
 * @return {Object} Frozen typed compaction outcome.
 */
function compactRaftRsCommittedPrefix(store, groupId, options = {}) {
  const exactToIndex = parseCompactionTargetIndex(options?.toIndex);
  if (exactToIndex === null) {
    return refusal(RAFT_COMPACTION_OUTCOME.INVALID_COMPACTION_INDEX);
  }
  return store.transaction(() => {
    const record = store.readDurableRecord(groupId);
    const boundsRefusal = validateCompactionBounds(
      record, exactToIndex, options);
    if (boundsRefusal) {
      return boundsRefusal;
    }
    const boundaryEntry = record.entries.find(
      (entry) => BigInt(entry.index) === exactToIndex);
    if (!boundaryEntry) {
      return refusal(RAFT_COMPACTION_OUTCOME.BOUNDARY_TERM_UNRESOLVABLE);
    }
    if (options.boundaryTerm !== undefined &&
        options.boundaryTerm !== null &&
        BigInt(options.boundaryTerm) !== BigInt(boundaryEntry.term)) {
      return refusal(RAFT_COMPACTION_OUTCOME.SNAPSHOT_PROOF_TERM_CONFLICT);
    }
    const maxCommittedHlc = foldCompactedPrefixMaxHlc(
      store.db, groupId, exactToIndex, options.maxCommittedHlc);
    const witnessData = encodeSnapshotWitnessData(maxCommittedHlc);
    const confState = options.confState || record.confState;
    const membershipGenerationIndex = resolveSnapshotGeneration(
      record, exactToIndex, options.membershipGenerationIndex);
    store.putSnapshot(groupId, {
      ...(witnessData === null ? {} : {data: witnessData}),
      metadata: {
        index: String(exactToIndex),
        term: boundaryEntry.term,
        confState,
        membershipGenerationIndex,
      },
    });
    const deleted = store.db.prepare(RAFT_RS_SQL.DELETE_LOG_UP_TO)
      .run(groupId, exactToIndex);
    return Object.freeze({
      outcome: RAFT_COMPACTION_OUTCOME.COMPACTED,
      changed: true,
      removedEntryCount: deleted.changes,
      boundary: Object.freeze({
        lastIncludedIndex: Number(exactToIndex),
        lastIncludedTerm: Number(boundaryEntry.term),
      }),
      maxCommittedHlc,
    });
  }, RAFT_RS_COMMIT_DURABILITY.SYNCED);
}

export {
  compactRaftRsCommittedPrefix,
  encodeSnapshotWitnessData,
  readCompactedMaxHlcIn,
  readSnapshotIndexIn,
};

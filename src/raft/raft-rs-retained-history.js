// Pure validation and observation within RaftRsDurableStore's read boundary.
// No native replay, application effect classification, schema repair or writes.
import {deepFreeze} from './raft-operation-port.js';
import {decodeCommittedProposal} from './raft-rs-proposal-codec.js';
import {RAFT_RS_ENTRY_TYPE} from './raft-rs-ready-loop-constants.js';
import {RAFT_RS_CONF_STATE_MEMBER_FIELDS,
  RAFT_RS_RETAINED_ENTRY_KIND as KIND,
  RAFT_RS_RETAINED_ENTRY_PHASE as PHASE,
  RAFT_RS_RETAINED_HISTORY_COVERAGE as COVERAGE,
  RAFT_RS_RETAINED_HISTORY_REASON as REASON,
  RAFT_RS_STORE_ERROR_CODE as CODE, RAFT_RS_ZERO_INDEX} from
  './raft-rs-durable-store-constants.js';

const MAX_NATIVE_INTEGER = (1n << 64n) - 1n;
const POSITIVE_DECIMAL = /^[1-9]\d*$/u;
const BASE64 = 'base64';
const ENTRY_TYPES = Object.freeze(Object.values(RAFT_RS_ENTRY_TYPE).map(BigInt));

function retainedHistoryError(reason, cause) {
  return Object.assign(new Error(reason, {cause}),
    {code: CODE.RETAINED_HISTORY_INVALID, reason});
}

function requireFact(valid, reason) {
  if (!valid) throw retainedHistoryError(reason);
}

function requireInteger(value, positive = false) {
  requireFact(typeof value === 'bigint' && value >= 0n &&
    value <= MAX_NATIVE_INTEGER && (!positive || value > 0n), REASON.INTEGER);
}

function requireNullableInteger(value) {
  if (value !== null) requireInteger(value);
}

function validateRawConfiguration(row) {
  requireFact(row.auto_leave === 0n || row.auto_leave === 1n, REASON.CONFIGURATION);
}

function validateRawApplied(row) {
  if (row === undefined) {
    throw Object.assign(new Error(REASON.APPLIED_ROW),
      {code: CODE.RETAINED_HISTORY_UNAVAILABLE, reason: REASON.APPLIED_ROW});
  }
  requireInteger(row.applied_index);
  requireInteger(row.membership_generation_index);
  requireNullableInteger(row.bootstrap_index);
  requireNullableInteger(row.admission_index);
  validateRawConfiguration(row);
}

function validateRawSnapshot(row) {
  if (row === undefined) return;
  requireInteger(row.snapshot_index);
  requireInteger(row.snapshot_term);
  requireNullableInteger(row.membership_generation_index);
  validateRawConfiguration(row);
}

function validateRetainedRows({hardStateRow, appliedRow, snapshotRow, entryRows}) {
  validateRawApplied(appliedRow);
  if (hardStateRow !== undefined) {
    requireInteger(hardStateRow.term);
    requireInteger(hardStateRow.vote);
    requireInteger(hardStateRow.commit_index);
  }
  validateRawSnapshot(snapshotRow);
  for (const row of entryRows) {
    requireInteger(row.log_index, true);
    requireInteger(row.term, true);
    requireFact(ENTRY_TYPES.includes(row.entry_type), REASON.ENTRY_TYPE);
  }
}

function validateConfiguration(confState) {
  for (const field of RAFT_RS_CONF_STATE_MEMBER_FIELDS) {
    const members = confState[field];
    requireFact(Array.isArray(members), REASON.CONFIGURATION);
    requireFact(members.every((id) => typeof id === 'string' &&
      POSITIVE_DECIMAL.test(id) && BigInt(id) <= MAX_NATIVE_INTEGER) &&
      new Set(members).size === members.length, REASON.CONFIGURATION);
  }
}

function payloadBytes(data) {
  if (data === undefined) return Buffer.alloc(0);
  requireFact(typeof data === 'string', REASON.PAYLOAD);
  const bytes = Buffer.from(data, BASE64);
  // Buffer's permissive decoder silently ignores malformed base64. Native
  // storage writes canonical base64, so require its exact round trip first.
  requireFact(bytes.toString(BASE64) === data, REASON.PAYLOAD);
  return bytes;
}

function entryContent(entry) {
  const bytes = payloadBytes(entry.data);
  if (entry.entryType !== RAFT_RS_ENTRY_TYPE.NORMAL) {
    // Only the native membership owner decodes configuration commands.
    return {kind: KIND.CONFIGURATION};
  } else if (bytes.length === 0) {
    return {kind: KIND.NOOP};
  } else {
    try {
      return {kind: KIND.COMMAND, command: decodeCommittedProposal(bytes)};
    } catch (error) {
      throw retainedHistoryError(REASON.PAYLOAD, error);
    }
  }
}

function phaseOf(index, applied, committed) {
  if (index <= applied) return PHASE.APPLIED;
  return index <= committed ? PHASE.COMMITTED_PENDING : PHASE.LOCAL_UNCOMMITTED;
}

function validateSnapshot(record, committed, hardTerm) {
  if (record.snapshot === null) return {index: 0n, term: 0n};
  const {metadata, data} = record.snapshot;
  const index = BigInt(metadata.index);
  const term = BigInt(metadata.term);
  requireFact(index <= committed && term <= hardTerm &&
    (index === 0n) === (term === 0n), REASON.FRONTIER);
  validateConfiguration(metadata.confState);
  payloadBytes(data);
  if (metadata.membershipGenerationIndex !== null) {
    requireFact(BigInt(metadata.membershipGenerationIndex) <= index, REASON.FRONTIER);
  }
  return {index, term};
}

function validateEntryBoundary(entry, previous, snapshot, hardTerm) {
  const index = BigInt(entry.index);
  const term = BigInt(entry.term);
  requireFact(index > previous.index, REASON.FRONTIER);
  requireFact(term >= previous.term && term <= hardTerm, REASON.TERM);
  if (index <= snapshot.index) {
    requireFact(term <= snapshot.term &&
      (index !== snapshot.index || term === snapshot.term), REASON.TERM);
  } else {
    const last = previous.index > snapshot.index ? previous : snapshot;
    requireFact(index === last.index + 1n, REASON.GAP);
    requireFact(term >= last.term, REASON.TERM);
  }
  return {index, term};
}

function nativeProgressOf(record) {
  const applied = BigInt(record.appliedIndex);
  const committed = BigInt(record.hardState?.commit ?? RAFT_RS_ZERO_INDEX);
  const hardTerm = BigInt(record.hardState?.term ?? RAFT_RS_ZERO_INDEX);
  requireFact(hardTerm > 0n || BigInt(record.hardState?.vote ?? RAFT_RS_ZERO_INDEX) === 0n,
    REASON.TERM);
  return {applied, committed, hardTerm};
}

function retainedHistoryOf(record) {
  const {applied, committed, hardTerm} = nativeProgressOf(record);
  validateConfiguration(record.confState);
  const snapshot = validateSnapshot(record, committed, hardTerm);
  let previous = {index: 0n, term: 0n};
  const entries = record.entries.map((entry) => {
    previous = validateEntryBoundary(entry, previous, snapshot, hardTerm);
    return {...entry, phase: phaseOf(previous.index, applied, committed),
      ...entryContent(entry)};
  });
  const last = previous.index > snapshot.index ? previous.index : snapshot.index;
  requireFact(applied <= committed && committed <= last, REASON.FRONTIER);
  const bootstrap = BigInt(record.bootstrapIndex ?? RAFT_RS_ZERO_INDEX);
  const generationBoundary = applied > bootstrap ? applied : bootstrap;
  requireFact(BigInt(record.membershipGenerationIndex) <= generationBoundary,
    REASON.FRONTIER);
  return deepFreeze({record, entries, appliedIndex: record.appliedIndex,
    commitIndex: String(committed), lastIndex: String(last),
    coverage: snapshot.index === 0n ? COVERAGE.COMPLETE : COVERAGE.SNAPSHOT_PREFIX});
}

export {retainedHistoryError, retainedHistoryOf, validateRetainedRows};

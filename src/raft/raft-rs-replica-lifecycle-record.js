// The lifecycle owner's row representation, shared by runtime and observations.
// Pure decoding/encoding: no database, schema, generation or workflow authority.
import {copyStrictOwnDataRecord} from '../utils/strict-own-data.js';
import {isRecord, isDenseDataArray, serializeJsonData} from
  '../utils/canonical-json-data.js';
import {LIFECYCLE_STATE, LIFECYCLE_REASON} from './raft-rs-replica-lifecycle-constants.js';
import {RAFT_OPERATION_OUTCOME} from './raft-operation-port-constants.js';

const parseJson = JSON.parse;
const ownKeys = Object.keys;
const EVIDENCE_ENCODING = Object.freeze({spacing: 0, sortKeys: false});

class LifecycleRecordRefusal extends Error {
  code;

  constructor(code, cause) {
    super(code, {cause});
    this.code = code;
  }
}

function nonemptyString(value) {
  return typeof value === 'string' && value.length > 0;
}

// The serializer expects data containers. Validate every container before any
// element read, including nested arrays whose extra fields must not disappear.
function requireEvidenceContainers(value, ancestors = null) {
  if (value === null || typeof value !== 'object') return;
  if (!isRecord(value) && !isDenseDataArray(value)) {
    throw new TypeError(LIFECYCLE_REASON.EVIDENCE_INVALID);
  }
  for (let ancestor = ancestors; ancestor !== null; ancestor = ancestor.parent) {
    if (ancestor.value === value) throw new TypeError(LIFECYCLE_REASON.EVIDENCE_INVALID);
  }
  // Literal own fields need no collection methods or property descriptors.
  const current = {value, parent: ancestors};
  const keys = ownKeys(value);
  for (let index = 0; index < keys.length; index++) {
    requireEvidenceContainers(value[keys[index]], current);
  }
}

function evidenceTextOf(evidence) {
  requireEvidenceContainers(evidence);
  return serializeJsonData(evidence, EVIDENCE_ENCODING);
}

function evidenceOf(raw) {
  if (raw === null) return null;
  try {
    if (typeof raw !== 'string') throw new TypeError(LIFECYCLE_REASON.EVIDENCE_INVALID);
    const evidence = parseJson(raw);
    if (!isRecord(evidence)) throw new TypeError(LIFECYCLE_REASON.EVIDENCE_INVALID);
    evidenceTextOf(evidence);
    return Object.freeze(evidence);
  } catch (cause) {
    throw new LifecycleRecordRefusal(LIFECYCLE_REASON.EVIDENCE_INVALID, cause);
  }
}

function requireStateAndReason(row) {
  switch (row.state) {
  case LIFECYCLE_STATE.ACTIVE:
    if (row.reason !== null) throw new LifecycleRecordRefusal(LIFECYCLE_REASON.REASON_INVALID);
    break;
  case LIFECYCLE_STATE.RETIRED:
    if (!nonemptyString(row.reason)) {
      throw new LifecycleRecordRefusal(LIFECYCLE_REASON.REASON_INVALID);
    }
    break;
  default:
    throw new LifecycleRecordRefusal(LIFECYCLE_REASON.STATE_INVALID);
  }
}

function decodeReplicaLifecycleRow(raw) {
  const row = copyStrictOwnDataRecord(raw);
  if (row === null || !nonemptyString(row.incarnation) ||
      !nonemptyString(row.peer_id) || !nonemptyString(row.replica_identity)) {
    throw new LifecycleRecordRefusal(LIFECYCLE_REASON.ROW_INVALID);
  }
  requireStateAndReason(row);
  const retirementEvidence = evidenceOf(row.retirement_evidence);
  if (row.state === LIFECYCLE_STATE.ACTIVE && retirementEvidence !== null) {
    throw new LifecycleRecordRefusal(LIFECYCLE_REASON.EVIDENCE_INVALID);
  }
  return Object.freeze({state: row.state, reason: row.reason === null ? '' : row.reason,
    incarnation: row.incarnation, peerId: row.peer_id, retirementEvidence});
}

// Admission consumes the complete row, even when the caller only needs state.
// A terminal row's domain reason is retained by decoding; its admission refusal
// is the canonical terminal state, except for the existing explicit reseed hold.
function lifecycleAdmissionOf(row) {
  try {
    const record = decodeReplicaLifecycleRow(row);
    return record.state === LIFECYCLE_STATE.ACTIVE ?
      Object.freeze({outcome: RAFT_OPERATION_OUTCOME.CORE_OK,
        reason: LIFECYCLE_REASON.ACTIVE, detail: record.state}) :
      terminalLifecycleRefusal(record.reason);
  } catch (error) {
    if (!(error instanceof LifecycleRecordRefusal)) throw error;
    return Object.freeze({outcome: RAFT_OPERATION_OUTCOME.CORE_REFUSED,
      reason: error.code, detail: null});
  }
}

function terminalLifecycleRefusal(reason) {
  return Object.freeze({outcome: RAFT_OPERATION_OUTCOME.CORE_REFUSED,
    reason: reason === LIFECYCLE_REASON.RESEED_REQUIRED ?
      LIFECYCLE_REASON.RESEED_REQUIRED : LIFECYCLE_STATE.RETIRED,
    detail: LIFECYCLE_STATE.RETIRED});
}

// Capture before retirement closes admission or waits. A malformed intent must
// reject the awaited operation: REMOVE cannot continue after an ignored result.
function encodeLifecycleRetirement(reason, evidence) {
  if (!nonemptyString(reason)) throw new LifecycleRecordRefusal(LIFECYCLE_REASON.REASON_INVALID);
  try {
    if (evidence !== null && !isRecord(evidence)) {
      throw new TypeError(LIFECYCLE_REASON.EVIDENCE_INVALID);
    }
    return Object.freeze({reason,
      evidenceText: evidence === null ? null : evidenceTextOf(evidence),
      refusal: terminalLifecycleRefusal(reason)});
  } catch (cause) {
    throw new LifecycleRecordRefusal(LIFECYCLE_REASON.EVIDENCE_INVALID, cause);
  }
}

export {LifecycleRecordRefusal, decodeReplicaLifecycleRow, lifecycleAdmissionOf,
  encodeLifecycleRetirement};

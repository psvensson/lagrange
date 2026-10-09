import {
  RAFT_MEMBERSHIP_TRANSITION_STAGE,
} from './raft-operation-port-constants.js';
import {RAFT_RS_CONF_CHANGE_TYPE, RAFT_RS_CONF_CHANGE_ENTRY_TYPES} from
  './raft-rs-ready-loop-constants.js';
import {deriveRaftRsPeerId} from './raft-rs-peer-identity.js';

const CONTEXT_ENCODING = 'base64';
const ABSENT_CONTEXT = Object.freeze({kind: 'absent'});
const CONTEXT_TEXT_ENCODING = 'utf8';
const CONTEXT_FIELD = Object.freeze({
  OPERATION_ID: 'operationId',
  TRANSITION_IDENTITY: 'transitionIdentity',
  PERMIT_SEQUENCE: 'permitSequence',
  STAGE: 'stage',
  REPLICA_IDENTITY: 'replicaIdentity',
  PEER_ID: 'peerId',
});
const MANAGED_CONTEXT_KEYS = Object.freeze(Object.values(CONTEXT_FIELD));
const STAGE_CHANGE_TYPE = Object.freeze({
  [RAFT_MEMBERSHIP_TRANSITION_STAGE.ADD_LEARNER]:
    RAFT_RS_CONF_CHANGE_TYPE.ADD_LEARNER_NODE,
  [RAFT_MEMBERSHIP_TRANSITION_STAGE.PROMOTE]:
    RAFT_RS_CONF_CHANGE_TYPE.ADD_NODE,
  [RAFT_MEMBERSHIP_TRANSITION_STAGE.REMOVE]:
    RAFT_RS_CONF_CHANGE_TYPE.REMOVE_NODE,
});
const COMMITTED_MEMBERSHIP_CONTEXT_ERROR = Object.freeze({
  MALFORMED: 'malformed committed membership context',
  STAGE: 'committed membership context stage is not managed',
  CHANGE: 'committed membership context contradicts native change',
  BINDING: 'committed membership context contradicts derived identity',
});

function ownString(record, key) {
  return Object.hasOwn(record, key) && typeof record[key] === 'string' &&
    record[key].length > 0;
}

function exactlyManagedContext(record) {
  if (record === null || typeof record !== 'object' || Array.isArray(record)) {
    return false;
  }
  const keys = Object.keys(record);
  return keys.length === MANAGED_CONTEXT_KEYS.length &&
    MANAGED_CONTEXT_KEYS.every((key) => keys.includes(key));
}

function parseContext(decoded) {
  if (decoded?.context === undefined || decoded.context === null ||
      decoded.context === '') {
    return ABSENT_CONTEXT;
  }
  if (typeof decoded.context !== 'string') {
    throw new Error(COMMITTED_MEMBERSHIP_CONTEXT_ERROR.MALFORMED);
  }
  try {
    return JSON.parse(Buffer.from(decoded.context, CONTEXT_ENCODING)
      .toString(CONTEXT_TEXT_ENCODING));
  } catch (error) {
    throw Object.assign(
      new Error(COMMITTED_MEMBERSHIP_CONTEXT_ERROR.MALFORMED),
      {cause: error});
  }
}

function validateContextShape(context) {
  if (!exactlyManagedContext(context) ||
      !ownString(context, CONTEXT_FIELD.OPERATION_ID) ||
      !ownString(context, CONTEXT_FIELD.TRANSITION_IDENTITY) ||
      !Number.isSafeInteger(context[CONTEXT_FIELD.PERMIT_SEQUENCE]) ||
      context[CONTEXT_FIELD.PERMIT_SEQUENCE] < 1 ||
      !ownString(context, CONTEXT_FIELD.STAGE) ||
      !ownString(context, CONTEXT_FIELD.REPLICA_IDENTITY) ||
      !ownString(context, CONTEXT_FIELD.PEER_ID)) {
    throw new Error(COMMITTED_MEMBERSHIP_CONTEXT_ERROR.MALFORMED);
  }
  if (!Object.hasOwn(STAGE_CHANGE_TYPE, context[CONTEXT_FIELD.STAGE])) {
    throw new Error(COMMITTED_MEMBERSHIP_CONTEXT_ERROR.STAGE);
  }
}

function validateNativeChange(decoded, context) {
  const changes = decoded?.changes;
  if (!Array.isArray(changes) || changes.length !== 1) {
    throw new Error(COMMITTED_MEMBERSHIP_CONTEXT_ERROR.CHANGE);
  }
  const [change] = changes;
  if (String(change?.nodeId) !== context[CONTEXT_FIELD.PEER_ID] ||
      change?.changeType !==
        STAGE_CHANGE_TYPE[context[CONTEXT_FIELD.STAGE]]) {
    throw new Error(COMMITTED_MEMBERSHIP_CONTEXT_ERROR.CHANGE);
  }
}


function committedMembershipChangeType(stage) {
  if (!Object.hasOwn(STAGE_CHANGE_TYPE, stage)) {
    throw new Error(COMMITTED_MEMBERSHIP_CONTEXT_ERROR.STAGE);
  }
  return STAGE_CHANGE_TYPE[stage];
}

function encodeCommittedMembershipContext(context) {
  validateContextShape(context);
  const derived = deriveRaftRsPeerId(context[CONTEXT_FIELD.REPLICA_IDENTITY]);
  if (context[CONTEXT_FIELD.PEER_ID] !== derived) {
    throw new Error(COMMITTED_MEMBERSHIP_CONTEXT_ERROR.BINDING);
  }
  return Buffer.from(JSON.stringify({
    [CONTEXT_FIELD.OPERATION_ID]: context[CONTEXT_FIELD.OPERATION_ID],
    [CONTEXT_FIELD.TRANSITION_IDENTITY]:
      context[CONTEXT_FIELD.TRANSITION_IDENTITY],
    [CONTEXT_FIELD.PERMIT_SEQUENCE]:
      context[CONTEXT_FIELD.PERMIT_SEQUENCE],
    [CONTEXT_FIELD.STAGE]: context[CONTEXT_FIELD.STAGE],
    [CONTEXT_FIELD.REPLICA_IDENTITY]:
      context[CONTEXT_FIELD.REPLICA_IDENTITY],
    [CONTEXT_FIELD.PEER_ID]: context[CONTEXT_FIELD.PEER_ID],
  })).toString(CONTEXT_ENCODING);
}

function committedMembershipContext(decoded) {
  const context = parseContext(decoded);
  if (context === ABSENT_CONTEXT) {
    return null;
  }
  validateContextShape(context);
  validateNativeChange(decoded, context);
  const derived = deriveRaftRsPeerId(
    context[CONTEXT_FIELD.REPLICA_IDENTITY]);
  if (context[CONTEXT_FIELD.PEER_ID] !== derived) {
    throw new Error(COMMITTED_MEMBERSHIP_CONTEXT_ERROR.BINDING);
  }
  return Object.freeze({
    operationId: context[CONTEXT_FIELD.OPERATION_ID],
    transitionIdentity: context[CONTEXT_FIELD.TRANSITION_IDENTITY],
    permitSequence: context[CONTEXT_FIELD.PERMIT_SEQUENCE],
    stage: context[CONTEXT_FIELD.STAGE],
    replicaIdentity: context[CONTEXT_FIELD.REPLICA_IDENTITY],
    peerId: context[CONTEXT_FIELD.PEER_ID],
  });
}

// A retained-log observation is positive evidence only. Failure to find the
// action never proves cancellation/non-commitment or grants a successor permit.
const MEMBERSHIP_ACTION_OBSERVATION = Object.freeze({
  COMMITTED: 'committed-action',
  UNRESOLVED: 'unresolved-action',
  UNAVAILABLE: 'action-evidence-unavailable',
});
const MEMBERSHIP_ACTION_EVIDENCE_REASON = Object.freeze({
  APPLIED_ENTRY: 'exact-retained-applied-entry',
  NO_RETAINED_PROOF: 'no-retained-applied-action-proof',
  INVALID_RECORD: 'invalid-durable-action-record',
  TRANSACTION_OPEN: 'action-evidence-transaction-open',
  READ_UNAVAILABLE: 'action-record-read-unavailable',
});
const MEMBERSHIP_ACTION_GROUP_REQUIRED = 'membership action observation requires its owning group';
const CANONICAL_DURABLE_INDEX = /^(?:0|[1-9][0-9]*)$/u;

function durableActionIndex(value) {
  return typeof value === 'string' && CANONICAL_DURABLE_INDEX.test(value) ?
    BigInt(value) : null;
}

function durableActionWindow(record) {
  if (!record || !Array.isArray(record.entries)) return null;
  const applied = durableActionIndex(record.appliedIndex);
  const committed = durableActionIndex(record.hardState?.commit);
  const term = durableActionIndex(record.hardState?.term);
  const snapshot = record.snapshot === null ? 0n :
    durableActionIndex(record.snapshot?.metadata?.index);
  if ([applied, committed, term, snapshot].includes(null) ||
      applied > committed || snapshot > applied) return null;
  return {applied, term, snapshot};
}

function observedAction(kind, reason, fields = {}) {
  return Object.freeze({kind, reason, ...fields});
}

function actionEntryPosition(entry, previous, term) {
  const index = durableActionIndex(entry?.index);
  const entryTerm = durableActionIndex(entry?.term);
  if (index === null || entryTerm === null || index <= previous || entryTerm > term) {
    throw new Error(MEMBERSHIP_ACTION_EVIDENCE_REASON.INVALID_RECORD);
  }
  return index;
}

function retainedActionMatch(record, action, window, decodeEntry) {
  let previous = 0n;
  let matched = null;
  for (const entry of record.entries) {
    const index = actionEntryPosition(entry, previous, window.term);
    previous = index;
    // Installed snapshots supersede covered log bytes. Residual bytes at or
    // below that cut are NOT an applied-action receipt for the snapshot image.
    if (index <= window.snapshot || index > window.applied ||
        !RAFT_RS_CONF_CHANGE_ENTRY_TYPES.includes(entry.entryType)) continue;
    const context = committedMembershipContext(decodeEntry(entry.entryType, entry.data));
    if (context !== null && MANAGED_CONTEXT_KEYS.every((key) => context[key] === action[key])) {
      if (entry.term === '0') throw new Error(MEMBERSHIP_ACTION_EVIDENCE_REASON.INVALID_RECORD);
      matched ??= Object.freeze({action: context, index: entry.index, term: entry.term});
    }
  }
  return matched;
}

/** Decode exact applied-action evidence within one native owner's durable record.
 * This subordinate codec does not read or mutate a database. The native owner
 * supplies its SAME-GROUP record through readMembershipActionEvidence, whose
 * read transaction and snapshot-anchored suffix checks own coherence. A
 * raw caller-provided record/group label is not authenticated here. The codec
 * only checks its own scalar/context conditions, not complete log coherence.
 * Old entry terms remain valid historical evidence after a new leader term.
 * No-match (including snapshot-covered history) stays UNRESOLVED. This is not
 * a current join descriptor, an absence proof or authority to reissue/CREATE.
 * @param {Object} input - Owning group, durable record, exact original action,
 *   and native decodeEntry(entryType, data) callback.
 * @return {Object} Frozen historical evidence or an explicit unresolved state.
 */
function observeRetainedMembershipAction({groupId, record, action, decodeEntry}) {
  if (typeof groupId !== 'string' || groupId.length === 0) {
    throw new TypeError(MEMBERSHIP_ACTION_GROUP_REQUIRED);
  }
  // Reuse the canonical context owner for shape and permanent identity checks.
  encodeCommittedMembershipContext(action);
  try {
    const window = durableActionWindow(record);
    if (window === null || typeof decodeEntry !== 'function') {
      return observedAction(MEMBERSHIP_ACTION_OBSERVATION.UNAVAILABLE,
        MEMBERSHIP_ACTION_EVIDENCE_REASON.INVALID_RECORD);
    }
    const matched = retainedActionMatch(record, action, window, decodeEntry);
    return matched === null ? observedAction(MEMBERSHIP_ACTION_OBSERVATION.UNRESOLVED,
      MEMBERSHIP_ACTION_EVIDENCE_REASON.NO_RETAINED_PROOF) :
      observedAction(MEMBERSHIP_ACTION_OBSERVATION.COMMITTED,
        MEMBERSHIP_ACTION_EVIDENCE_REASON.APPLIED_ENTRY, {groupId, ...matched});
  } catch {
    return observedAction(MEMBERSHIP_ACTION_OBSERVATION.UNAVAILABLE,
      MEMBERSHIP_ACTION_EVIDENCE_REASON.INVALID_RECORD);
  }
}

export {
  COMMITTED_MEMBERSHIP_CONTEXT_ERROR,
  MEMBERSHIP_ACTION_OBSERVATION,
  MEMBERSHIP_ACTION_EVIDENCE_REASON,
  observeRetainedMembershipAction,
  committedMembershipChangeType,
  committedMembershipContext,
  encodeCommittedMembershipContext,
};

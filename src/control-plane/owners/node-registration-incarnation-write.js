import {COLUMN, TABLES} from '../../constants/index.js';
import {
  buildStaleNodeIncarnationError,
  normalizeKnownNodeBootIncarnation,
} from '../control-plane-error-classification.js';
import {classifyControlPlaneMutationResult} from
  '../control-plane-mutation-outcome-classifier.js';
import {
  controlPlaneWriteIdentity,
  isPendingInstanceApplied,
  releaseControlPlaneWriteIdentities,
} from '../control-plane-write-identity.js';
import {
  CONTROL_PLANE_AUTHORITATIVE_READ_MODE,
  CONTROL_PLANE_READ_LEADER_MODE,
  isAuthoritativeControlPlaneRowReadSuccessful,
  readAuthoritativeControlPlaneRows,
} from '../control-plane-system-table-gateway.js';
import {getNodeReadyLeaseExpiresAt} from '../../node/node-readiness-policy.js';
import {
  NODE_HOST_IDENTITY_STATE,
  readNodeHostIdentity,
} from '../../topology/node-host-identity.js';

/**
 * The NODES registration write is monotonic in the mutation itself
 * (invariant I9, owner decision D-7): there is no generic UPSERT. A row is
 * born by an INSERT (which can never replace an existing row) or advanced by
 * one CAS on the exact incarnation observed, and only when that incarnation
 * is older. So a late registration from an older incarnation can neither
 * overwrite nor lower a newer row.
 *
 * Outcomes:
 * - ACCEPTED: this incarnation was born, or advanced over an older one.
 * - CURRENT: this boot lifecycle's own row already holds this incarnation
 *   (idempotent; no write, so a terminal row of this incarnation is never
 *   resurrected).
 * - REFUSED_STALE: a newer incarnation owns the row, or a row at this same
 *   incarnation that this boot lifecycle never wrote (another storage's life
 *   of this node id: a wiped or restored data directory reserved the number
 *   again); never retried at this incarnation.
 * - UNRESOLVED: the authority could not confirm either way (unavailable, or
 *   the write did not apply and nothing newer holds the row). An unknown
 *   attempt is resolved by one authoritative reread; there is no retry loop.
 */
const NODE_REGISTRATION_OUTCOME = Object.freeze({
  ACCEPTED: 'accepted',
  CURRENT: 'current',
  REFUSED_STALE: 'refused_stale_incarnation',
  UNRESOLVED: 'unresolved',
});

const NODE_REGISTRATION_AUTHORITATIVE_READ = Object.freeze({
  owner: 'node_registration_incarnation_write',
  authoritativeReadMode:
    CONTROL_PLANE_AUTHORITATIVE_READ_MODE.OWNER_RPC_REQUIRED,
  leaderMode: CONTROL_PLANE_READ_LEADER_MODE.REQUIRED,
  deliveryPriority: 'critical',
  workClass: 'critical',
});

const REGISTRATION_WRITE_VERB = Object.freeze({
  BIRTH: 'birth',
  ADVANCE_FROM: 'advance-from',
});

const NODE_REGISTRATION_INCARNATION_REQUIRED =
  'NODE_REGISTRATION_INCARNATION_REQUIRED';
const NODE_REGISTRATION_ISSUE_RECORD_REQUIRED =
  'NODE_REGISTRATION_ISSUE_RECORD_REQUIRED';
// A live node elsewhere holds this node id: its row still carries a valid
// READY lease and declares another host. Never superseded automatically; an
// operator removes or renames one of the two.
const NODE_IDENTITY_TWIN_SUSPECTED = 'NODE_IDENTITY_TWIN_SUSPECTED';
const NODE_IDENTITY_TWIN_SUSPECTED_MESSAGE =
  'Node id is held by a live node on another host (valid READY lease, ' +
  'different declared host_id); an operator must remove or rename one of ' +
  'them';
const NODE_REGISTRATION_NOT_APPLIED = 'Node registration write not applied';
// Typed fields a failed mutation result carries onto its surfaced error.
const FAILED_RESULT_ERROR_FIELDS = Object.freeze([
  'code',
  'errorCode',
  'retryAfterMs',
  'deferRetry',
]);

function incarnationOf(row) {
  return normalizeKnownNodeBootIncarnation(row?.[COLUMN.BOOT_INCARNATION]);
}

// How an observed NODES row relates to this boot's incarnation: the one
// classification behind every registration and incarnation-advance decision
// (absent -> birth, older -> one CAS advance, current -> no write, newer ->
// refused).
const NODE_INCARNATION_RELATION = Object.freeze({
  ABSENT: 'absent',
  OLDER: 'older',
  CURRENT: 'current',
  NEWER: 'newer',
});

/**
 * One boot lifecycle's record of the registration write it issued: the
 * incarnation it issued a birth or advance at, or null before it issued one.
 * The owner whose lifetime is the boot lifecycle (the joiner's
 * NodeRegistrationOwner, the seed's BootstrapService) creates it once; the
 * registration write sets it before its first attempt, so an attempt whose
 * outcome is lost still counts as issued.
 * @return {{issuedAtIncarnation: (number|null)}}
 */
function createNodeRegistrationIssueRecord() {
  return Object.seal({issuedAtIncarnation: null});
}

function requireNodeRegistrationIssueRecord(issueRecord) {
  const issued = issueRecord?.issuedAtIncarnation;
  if (issueRecord && typeof issueRecord === 'object' &&
      Object.prototype.hasOwnProperty.call(issueRecord,
        'issuedAtIncarnation') &&
      (issued === null || normalizeKnownNodeBootIncarnation(issued) > 0)) {
    return issueRecord;
  }
  const error = new Error(NODE_REGISTRATION_ISSUE_RECORD_REQUIRED);
  error.code = NODE_REGISTRATION_ISSUE_RECORD_REQUIRED;
  throw error;
}

// An intact data directory reserves above every incarnation it issued (the
// boot incarnation owner), so a row at this boot's own number that this
// lifecycle never wrote was written by another storage's life of the node
// id: it supersedes this lifecycle exactly as a newer row does.
function classifyNodeIncarnationRelation(observedRow, bootIncarnation,
  issueRecord) {
  const issuedAtIncarnation =
    requireNodeRegistrationIssueRecord(issueRecord).issuedAtIncarnation;
  if (!observedRow) return NODE_INCARNATION_RELATION.ABSENT;
  const observed = incarnationOf(observedRow);
  if (observed > bootIncarnation) return NODE_INCARNATION_RELATION.NEWER;
  if (observed < bootIncarnation) return NODE_INCARNATION_RELATION.OLDER;
  return issuedAtIncarnation === bootIncarnation ?
    NODE_INCARNATION_RELATION.CURRENT : NODE_INCARNATION_RELATION.NEWER;
}

// Record that this lifecycle issues a registration write at this
// incarnation, before the attempt.
function recordNodeRegistrationIssue(issueRecord, bootIncarnation) {
  requireNodeRegistrationIssueRecord(issueRecord).issuedAtIncarnation =
    bootIncarnation;
}

/**
 * Authoritative read of one NODES row from its owner.
 * @param {Object} gateway
 * @param {string} nodeId
 * @return {Promise<{available: boolean, row: Object|null}>}
 */
async function readAuthoritativeNodeRow(gateway, nodeId) {
  let result = null;
  try {
    result = await readAuthoritativeControlPlaneRows(
      gateway,
      TABLES.NODES,
      `SELECT * FROM ${TABLES.NODES} WHERE ${COLUMN.NODE_ID} = ?`,
      [nodeId],
      NODE_REGISTRATION_AUTHORITATIVE_READ,
    );
  } catch (_error) {
    result = null;
  }
  if (!isAuthoritativeControlPlaneRowReadSuccessful(result)) {
    return {available: false, row: null};
  }
  const rows = Array.isArray(result.rows) ? result.rows : [];
  return {
    available: true,
    row: rows.find((row) => row?.[COLUMN.NODE_ID] === nodeId) || null,
  };
}

// One mutation attempt: applied per the canonical classifier - or because
// the earlier instance of this same registration, resolved before this one
// was issued, applied (every instance of a registration name writes this
// node's row at this incarnation, which is what the outcome classifies); a
// failure keeps its own error (code, retry-after hint) for the caller.
async function attempt(write) {
  try {
    const result = await write();
    if (classifyControlPlaneMutationResult(result).applied === true ||
        isPendingInstanceApplied(result)) {
      return {applied: true, result, error: null};
    }
    return {applied: false, result, error: result?.success === false ?
      failedResultError(result) : null};
  } catch (error) {
    return {applied: false, result: null, error};
  }
}

function failedResultError(result) {
  const error = new Error(typeof result.error === 'string' ?
    result.error : result.error?.message || NODE_REGISTRATION_NOT_APPLIED);
  if (result.error && typeof result.error === 'object') {
    error.cause = result.error;
  }
  for (const field of FAILED_RESULT_ERROR_FIELDS) {
    if (result[field] !== undefined) error[field] = result[field];
  }
  return error;
}

// The logical write a registration mutation is: this incarnation's birth,
// or its advance from the exact incarnation observed. Every attempt of one
// of them - the reread's retry, the join's re-drive after an unknown
// outcome - is delivered under this identity, so it is the same committed
// entry: answered applied with its original result, or run for the first
// time; never a second birth that fails UNIQUE. Its instance is released
// once the registration is classified (registrationWriteSubject).
function registrationWriteSubject(row) {
  return [TABLES.NODES, row[COLUMN.NODE_ID], row[COLUMN.BOOT_INCARNATION]];
}

// Every instance of a registration name writes this node's row at this
// incarnation, so an applied one settles the write: a re-drive with new
// content is then not issued (it could only collide with that row).
function registrationWriteIdentity(row, ...verb) {
  return {writeIdentity: controlPlaneWriteIdentity(
    ...registrationWriteSubject(row), ...verb), pendingAppliedSettles: true};
}

// The one mutation an observation admits: birth when absent, one CAS on
// the exact older incarnation observed, none otherwise.
function planRegistration(options, row, observedRow, bootIncarnation) {
  const relation = classifyNodeIncarnationRelation(observedRow,
    bootIncarnation, options.issueRecord);
  if (relation === NODE_INCARNATION_RELATION.ABSENT) {
    return () => options.insert(row,
      registrationWriteIdentity(row, REGISTRATION_WRITE_VERB.BIRTH));
  }
  if (relation !== NODE_INCARNATION_RELATION.OLDER) return null;
  const observedValue = observedRow[COLUMN.BOOT_INCARNATION];
  return () => options.advance({
    [COLUMN.NODE_ID]: row[COLUMN.NODE_ID],
    [COLUMN.BOOT_INCARNATION]: observedValue === undefined ?
      null : observedValue,
  }, row, registrationWriteIdentity(row, REGISTRATION_WRITE_VERB.ADVANCE_FROM,
    observedValue === undefined ? null : observedValue));
}

function classifyObservation(read, bootIncarnation, afterAttempt,
  issueRecord) {
  if (read.available !== true || !read.row) {
    return NODE_REGISTRATION_OUTCOME.UNRESOLVED;
  }
  const relation = classifyNodeIncarnationRelation(read.row, bootIncarnation,
    issueRecord);
  if (relation === NODE_INCARNATION_RELATION.NEWER) {
    return NODE_REGISTRATION_OUTCOME.REFUSED_STALE;
  }
  if (relation === NODE_INCARNATION_RELATION.CURRENT) {
    return afterAttempt ? NODE_REGISTRATION_OUTCOME.ACCEPTED :
      NODE_REGISTRATION_OUTCOME.CURRENT;
  }
  return NODE_REGISTRATION_OUTCOME.UNRESOLVED;
}

function resolveAttemptOriginHlc(result, observedRow) {
  const resultOriginHlc =
    result?.originHlc ||
    result?.partitionResult?.originHlc ||
    observedRow?.[COLUMN.UPDATED_AT_HLC];
  return typeof resultOriginHlc === 'string' && resultOriginHlc.length > 0 ?
    resultOriginHlc :
    null;
}

function freezeOutcome(outcome, observedRow = null, error = null, result = null) {
  return Object.freeze({
    outcome,
    observedRow,
    error,
    originHlc: resolveAttemptOriginHlc(result, observedRow),
  });
}

// A registration classified anything but UNRESOLVED is done: its write
// identities are released, so a later registration of this incarnation is a
// new logical write.
function settleRegistration(row, outcome) {
  if (outcome.outcome !== NODE_REGISTRATION_OUTCOME.UNRESOLVED) {
    releaseControlPlaneWriteIdentities(...registrationWriteSubject(row));
  }
  return outcome;
}

/**
 * Register one node row at this boot incarnation.
 * @param {Object} options
 * @param {Object} options.row - NODES row (node_id required).
 * @param {number} options.bootIncarnation - This boot's reserved incarnation.
 * @param {Function} options.observe - () => {available, row} authoritative.
 * @param {Function} options.insert - (row, identity) => mutation result
 *   (birth); `identity` ({writeIdentity}) names the logical write for its
 *   delivery options.
 * @param {Function} options.advance - (whereClause, row, identity) =>
 *   mutation result.
 * @param {Object} options.issueRecord - This boot lifecycle's registration
 *   issue record (createNodeRegistrationIssueRecord); required, no default.
 * @return {Promise<Object>} Frozen {outcome, observedRow, error}; error is
 *   the failed attempt's own error when the outcome stays UNRESOLVED.
 */
async function writeNodeRegistrationAtIncarnation(options) {
  const bootIncarnation =
    normalizeKnownNodeBootIncarnation(options.bootIncarnation);
  if (bootIncarnation === 0) {
    const error = new Error(NODE_REGISTRATION_INCARNATION_REQUIRED);
    error.code = NODE_REGISTRATION_INCARNATION_REQUIRED;
    throw error;
  }
  requireNodeRegistrationIssueRecord(options.issueRecord);
  const row = {...options.row, [COLUMN.BOOT_INCARNATION]: bootIncarnation};
  const observed = await options.observe();
  // Without an observation only a birth is attempted: an INSERT can never
  // replace an existing row; a conflict is resolved by the reread below.
  const observedRow = observed.available === true ? observed.row : null;
  const first = planRegistration(options, row, observedRow, bootIncarnation);
  if (first === null) {
    return settleRegistration(row, freezeOutcome(
      classifyObservation(observed, bootIncarnation, false,
        options.issueRecord), observedRow));
  }
  recordNodeRegistrationIssue(options.issueRecord, bootIncarnation);
  const firstAttempt = await attempt(first);
  if (firstAttempt.applied) {
    return settleRegistration(row,
      freezeOutcome(
        NODE_REGISTRATION_OUTCOME.ACCEPTED,
        observedRow,
        null,
        firstAttempt.result,
      ));
  }
  return settleRegistration(row, await resolveUnappliedRegistration(options,
    row, bootIncarnation, firstAttempt));
}

// A failed or unknown attempt: one authoritative reread; an older owner
// still present (the birth lost a race or the observation was stale) gets
// one CAS; everything else is classified. No loop.
async function resolveUnappliedRegistration(options, row, bootIncarnation,
  firstAttempt) {
  const reread = await options.observe();
  const retry = reread.available === true && reread.row ?
    planRegistration(options, row, reread.row, bootIncarnation) : null;
  if (retry !== null) {
    recordNodeRegistrationIssue(options.issueRecord, bootIncarnation);
  }
  const retryAttempt = retry === null ? null : await attempt(retry);
  if (retryAttempt?.applied) {
    return freezeOutcome(
      NODE_REGISTRATION_OUTCOME.ACCEPTED,
      reread.row,
      null,
      retryAttempt.result,
    );
  }
  const settled = retryAttempt ? await options.observe() : reread;
  return freezeOutcome(
    classifyObservation(settled, bootIncarnation, true, options.issueRecord),
    settled.row || null,
    retryAttempt?.error || firstAttempt.error,
    retryAttempt?.result || firstAttempt.result,
  );
}

// A superseding row whose lease is still valid and whose declared host is
// another machine is most likely a live twin configured with this node id,
// not an earlier life of this node: superseding it would start a ping-pong
// of the two lives. Absent or undeclared host identity, or a lapsed lease, is
// an earlier life.
function isLiveTwinRow(observedRow, declaredHostId, nowMs) {
  const observedHost = readNodeHostIdentity(observedRow);
  const leaseExpiresAt = getNodeReadyLeaseExpiresAt(observedRow);
  return observedHost.state === NODE_HOST_IDENTITY_STATE.DECLARED &&
    observedHost.hostId !== declaredHostId &&
    leaseExpiresAt !== null && leaseExpiresAt > nowMs;
}

/**
 * The typed error for a registration a superseding row refused. An earlier
 * life of this node id is superseded: a new boot lifecycle reserves above the
 * known incarnation (boot-incarnation-owner.js), so the join failure is
 * retryable by a new lifecycle, never by re-driving this one. A live twin on
 * another host is refused non-retryable, for an operator.
 * @param {Object} options
 * @param {string} options.nodeId
 * @param {number} options.receivedIncarnation - This lifecycle's incarnation.
 * @param {Object|null} options.observedRow - The superseding NODES row.
 * @param {string} options.declaredHostId - This node's declared host id.
 * @param {number} options.nowMs - This node's clock.
 * @return {Error}
 */
function buildSupersededRegistrationError(options) {
  const knownIncarnation = incarnationOf(options.observedRow) || null;
  if (isLiveTwinRow(options.observedRow, options.declaredHostId,
    options.nowMs)) {
    const error = new Error(NODE_IDENTITY_TWIN_SUSPECTED_MESSAGE);
    error.code = NODE_IDENTITY_TWIN_SUSPECTED;
    error.retryable = false;
    error.nodeId = options.nodeId;
    error.receivedIncarnation = options.receivedIncarnation;
    error.knownIncarnation = knownIncarnation;
    error.observedHostId = readNodeHostIdentity(options.observedRow).hostId;
    error.declaredHostId = options.declaredHostId;
    return error;
  }
  const error = buildStaleNodeIncarnationError({
    nodeId: options.nodeId,
    receivedIncarnation: options.receivedIncarnation,
    knownIncarnation,
  });
  error.retryable = true;
  return error;
}

export {
  NODE_IDENTITY_TWIN_SUSPECTED,
  NODE_INCARNATION_RELATION,
  NODE_REGISTRATION_ISSUE_RECORD_REQUIRED,
  NODE_REGISTRATION_OUTCOME,
  buildSupersededRegistrationError,
  classifyNodeIncarnationRelation,
  createNodeRegistrationIssueRecord,
  recordNodeRegistrationIssue,
  readAuthoritativeNodeRow,
  writeNodeRegistrationAtIncarnation,
};

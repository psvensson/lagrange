import {types as nodeUtilTypes} from 'node:util';
import {COLUMN, TABLES} from '../../constants/index.js';
import {
  buildStaleNodeIncarnationError,
  normalizeKnownNodeBootIncarnation,
} from '../control-plane-error-classification.js';
import {classifyControlPlaneMutationResult} from
  '../control-plane-mutation-outcome-classifier.js';
import {
  controlPlaneWriteIdentity,
  isControlPlaneWriteDefinitivelyUnappliedError,
  isControlPlaneWriteOutcomeUnknown,
  isPendingInstanceApplied,
  releaseControlPlaneWriteIdentities,
} from '../control-plane-write-identity.js';
import {
  CONTROL_PLANE_AUTHORITATIVE_READ_MODE,
  CONTROL_PLANE_READ_LEADER_MODE,
  isAuthoritativeControlPlaneRowReadSuccessful,
  readAuthoritativeControlPlaneRows,
} from '../control-plane-system-table-gateway.js';
import {isNodeRecordReady} from '../../node/node-readiness-policy.js';
import {
  NODE_HOST_IDENTITY_STATE,
  readNodeHostIdentity,
  requireDeclaredNodeHostId,
} from '../../topology/node-host-identity.js';

const objectFreeze = Object.freeze;
const objectGetOwnPropertyDescriptor = Object.getOwnPropertyDescriptor;
const objectGetPrototypeOf = Object.getPrototypeOf;
const objectHasOwn = Object.hasOwn;
const objectPrototype = Object.prototype;
const objectSeal = Object.seal;
const numberIsFinite = Number.isFinite;
const numberIsSafeInteger = Number.isSafeInteger;
const utilIsProxy = nodeUtilTypes.isProxy;
const DATA_DESCRIPTOR_VALUE_PROPERTY = 'value';

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
const NODE_REGISTRATION_OUTCOME = objectFreeze({
  ACCEPTED: 'accepted',
  CURRENT: 'current',
  REFUSED_STALE: 'refused_stale_incarnation',
  UNRESOLVED: 'unresolved',
});

const NODE_REGISTRATION_AUTHORITATIVE_READ = objectFreeze({
  owner: 'node_registration_incarnation_write',
  authoritativeReadMode:
    CONTROL_PLANE_AUTHORITATIVE_READ_MODE.OWNER_RPC_REQUIRED,
  leaderMode: CONTROL_PLANE_READ_LEADER_MODE.REQUIRED,
  deliveryPriority: 'critical',
  workClass: 'critical',
});

const REGISTRATION_WRITE_VERB = objectFreeze({
  BIRTH: 'birth',
  ADVANCE_FROM: 'advance-from',
});

const NODE_REGISTRATION_INCARNATION_REQUIRED =
  'NODE_REGISTRATION_INCARNATION_REQUIRED';
const NODE_REGISTRATION_ISSUE_RECORD_REQUIRED =
  'NODE_REGISTRATION_ISSUE_RECORD_REQUIRED';
const NODE_REGISTRATION_CLOCK_REQUIRED =
  'NODE_REGISTRATION_CLOCK_REQUIRED';
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
const FAILED_RESULT_ERROR_FIELDS = objectFreeze([
  'code',
  'errorCode',
  'retryAfterMs',
  'deferRetry',
  'failureCode',
]);

function incarnationOf(row) {
  return normalizeKnownNodeBootIncarnation(row?.[COLUMN.BOOT_INCARNATION]);
}

function isPositiveSafeInteger(value) {
  return typeof value === 'number' && numberIsSafeInteger(value) && value > 0;
}

function requirePositiveBootIncarnation(bootIncarnation) {
  if (isPositiveSafeInteger(bootIncarnation)) {
    return bootIncarnation;
  }
  const error = new Error(NODE_REGISTRATION_INCARNATION_REQUIRED);
  error.code = NODE_REGISTRATION_INCARNATION_REQUIRED;
  throw error;
}

function requireRegistrationClockReading(nowMs) {
  if (typeof nowMs === 'number' && numberIsFinite(nowMs)) {
    return nowMs;
  }
  const error = new Error(NODE_REGISTRATION_CLOCK_REQUIRED);
  error.code = NODE_REGISTRATION_CLOCK_REQUIRED;
  throw error;
}

// How an observed NODES row relates to this boot's incarnation: the one
// classification behind every registration and incarnation-advance decision
// (absent -> birth, older -> one CAS advance, current -> no write, newer ->
// refused).
const NODE_INCARNATION_RELATION = objectFreeze({
  ABSENT: 'absent',
  OLDER: 'older',
  CURRENT: 'current',
  NEWER: 'newer',
});

const ISSUE_RECORD_INCARNATION_FIELD = 'issuedAtIncarnation';

/**
 * One boot lifecycle's record of the registration write it issued: the
 * incarnation it confirmed or left genuinely indeterminate in consensus, or
 * null before any such write. Plain sealed data record; Proxy and accessor
 * shapes are rejected.
 * @return {{issuedAtIncarnation: (number|null)}}
 */
function createNodeRegistrationIssueRecord() {
  return objectSeal({issuedAtIncarnation: null});
}

function isPlainIssueRecordObject(value) {
  if (value === null || typeof value !== 'object' || utilIsProxy(value)) {
    return false;
  }
  const prototype = objectGetPrototypeOf(value);
  return prototype === objectPrototype || prototype === null;
}

function readVerifiedIssueRecord(issueRecord) {
  if (isPlainIssueRecordObject(issueRecord)) {
    const descriptor = objectGetOwnPropertyDescriptor(
      issueRecord,
      ISSUE_RECORD_INCARNATION_FIELD,
    );
    if (descriptor &&
        objectHasOwn(descriptor, DATA_DESCRIPTOR_VALUE_PROPERTY) &&
        descriptor.writable === true) {
      const issued = descriptor.value;
      if (issued === null || isPositiveSafeInteger(issued)) {
        return {record: issueRecord, issuedAtIncarnation: issued};
      }
    }
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
  const incarnation = requirePositiveBootIncarnation(bootIncarnation);
  const {issuedAtIncarnation} = readVerifiedIssueRecord(issueRecord);
  if (!observedRow) return NODE_INCARNATION_RELATION.ABSENT;
  const observed = incarnationOf(observedRow);
  if (observed > incarnation) return NODE_INCARNATION_RELATION.NEWER;
  if (observed < incarnation) return NODE_INCARNATION_RELATION.OLDER;
  return issuedAtIncarnation === incarnation ?
    NODE_INCARNATION_RELATION.CURRENT : NODE_INCARNATION_RELATION.NEWER;
}

// Record that this lifecycle's registration write applied (or reached
// indeterminate consensus ownership of a matching row) at this incarnation.
function recordNodeRegistrationIssue(issueRecord, bootIncarnation) {
  const incarnation = requirePositiveBootIncarnation(bootIncarnation);
  const {record} = readVerifiedIssueRecord(issueRecord);
  record[ISSUE_RECORD_INCARNATION_FIELD] = incarnation;
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
// was issued, applied; a failure keeps its own error for the caller.
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

function isRegistrationAttemptIndeterminate(result, error) {
  if (isControlPlaneWriteOutcomeUnknown(result) ||
      isControlPlaneWriteOutcomeUnknown(error)) {
    return true;
  }
  if (result !== null) {
    return false;
  }
  return error !== null &&
    !isControlPlaneWriteDefinitivelyUnappliedError(error);
}

function isAttemptOutcomeIndeterminate(attemptOutcome) {
  return isRegistrationAttemptIndeterminate(
    attemptOutcome?.result ?? null,
    attemptOutcome?.error ?? null,
  );
}

// Whether an authoritatively reread row at bootIncarnation is consistent with
// having been written by this lifecycle's indeterminate attempt (same declared
// host and non-contradicting status), never a concurrent twin or STOPPED row.
function matchesIndeterminateAttemptRow(attemptedRow, rereadRow,
  bootIncarnation) {
  return Boolean(rereadRow) &&
    incarnationOf(rereadRow) === bootIncarnation &&
    rereadRow[COLUMN.HOST_ID] === attemptedRow[COLUMN.HOST_ID] &&
    (attemptedRow[COLUMN.STATUS] === undefined ||
      rereadRow[COLUMN.STATUS] === attemptedRow[COLUMN.STATUS]);
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

function registrationWriteSubject(row) {
  return [TABLES.NODES, row[COLUMN.NODE_ID], row[COLUMN.BOOT_INCARNATION]];
}

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
  return objectFreeze({
    outcome,
    observedRow,
    error,
    originHlc: resolveAttemptOriginHlc(result, observedRow),
  });
}

function settleRegistration(row, outcome) {
  if (outcome.outcome !== NODE_REGISTRATION_OUTCOME.UNRESOLVED) {
    releaseControlPlaneWriteIdentities(...registrationWriteSubject(row));
  }
  return outcome;
}

function recordIndeterminateReadbackIfOwned(issueRecord, row, bootIncarnation,
  attemptOutcome, read) {
  if (read.available === true &&
      isAttemptOutcomeIndeterminate(attemptOutcome) &&
      matchesIndeterminateAttemptRow(row, read.row, bootIncarnation)) {
    recordNodeRegistrationIssue(issueRecord, bootIncarnation);
  }
}

async function replayBlindIndeterminateBirth(first, options, bootIncarnation,
  reread) {
  const replay = await attempt(first);
  if (replay.applied) {
    recordNodeRegistrationIssue(options.issueRecord, bootIncarnation);
    return freezeOutcome(
      NODE_REGISTRATION_OUTCOME.ACCEPTED,
      reread.row,
      null,
      replay.result,
    );
  }
  if (isAttemptOutcomeIndeterminate(replay)) {
    return freezeOutcome(
      NODE_REGISTRATION_OUTCOME.UNRESOLVED,
      reread.row,
      replay.error,
      replay.result,
    );
  }
  return null;
}

/**
 * Register one node row at this boot incarnation.
 * @param {Object} options
 * @param {Object} options.row - NODES row (node_id and host_id required).
 * @param {number} options.bootIncarnation - This boot's reserved incarnation.
 * @param {number} options.nowMs - This node's finite clock reading.
 * @param {Function} options.observe - () => {available, row} authoritative.
 * @param {Function} options.insert - (row, identity) => mutation result.
 * @param {Function} options.advance - (whereClause, row, identity) =>
 *   mutation result.
 * @param {Object} options.issueRecord - This boot lifecycle's registration
 *   issue record (createNodeRegistrationIssueRecord); required, no default.
 * @return {Promise<Object>} Frozen {outcome, observedRow, error, originHlc}.
 */
async function writeNodeRegistrationAtIncarnation(options) {
  const bootIncarnation =
    requirePositiveBootIncarnation(options?.bootIncarnation);
  readVerifiedIssueRecord(options?.issueRecord);
  const declaredHostId = requireDeclaredNodeHostId(options?.row?.[COLUMN.HOST_ID]);
  requireRegistrationClockReading(options?.nowMs);
  const row = {
    ...options.row,
    [COLUMN.HOST_ID]: declaredHostId,
    [COLUMN.BOOT_INCARNATION]: bootIncarnation,
  };
  const observed = await options.observe();
  const authoritativeObservation = observed.available === true;
  // Without an observation only a birth is attempted, and issuedAtIncarnation
  // is never stamped unless that birth actually confirms applied.
  const observedRow = authoritativeObservation ? observed.row : null;
  const first = planRegistration(options, row, observedRow, bootIncarnation);
  if (first === null) {
    return settleRegistration(row, freezeOutcome(
      classifyObservation(observed, bootIncarnation, false,
        options.issueRecord), observedRow));
  }
  const firstAttempt = await attempt(first);
  if (firstAttempt.applied) {
    recordNodeRegistrationIssue(options.issueRecord, bootIncarnation);
    return settleRegistration(row,
      freezeOutcome(
        NODE_REGISTRATION_OUTCOME.ACCEPTED,
        observedRow,
        null,
        firstAttempt.result,
      ));
  }
  return settleRegistration(row, await resolveUnappliedRegistration(options,
    row, bootIncarnation, firstAttempt, authoritativeObservation, first));
}

async function resolveUnappliedRegistration(options, row, bootIncarnation,
  firstAttempt, authoritativeObservation, first) {
  const reread = await options.observe();
  if (!authoritativeObservation &&
      isAttemptOutcomeIndeterminate(firstAttempt) &&
      reread.available === true &&
      incarnationOf(reread.row) === bootIncarnation) {
    const replayed = await replayBlindIndeterminateBirth(
      first, options, bootIncarnation, reread);
    if (replayed !== null) return replayed;
  }
  if (authoritativeObservation) {
    recordIndeterminateReadbackIfOwned(
      options.issueRecord, row, bootIncarnation, firstAttempt, reread);
  }
  const retry = reread.available === true && reread.row ?
    planRegistration(options, row, reread.row, bootIncarnation) : null;
  const retryAttempt = retry === null ? null : await attempt(retry);
  if (retryAttempt?.applied) {
    recordNodeRegistrationIssue(options.issueRecord, bootIncarnation);
    return freezeOutcome(
      NODE_REGISTRATION_OUTCOME.ACCEPTED,
      reread.row,
      null,
      retryAttempt.result,
    );
  }
  const settled = retryAttempt ? await options.observe() : reread;
  if (retryAttempt) {
    recordIndeterminateReadbackIfOwned(
      options.issueRecord, row, bootIncarnation, retryAttempt, settled);
  }
  return freezeOutcome(
    classifyObservation(settled, bootIncarnation, true, options.issueRecord),
    settled.row || null,
    retryAttempt?.error || firstAttempt.error,
    retryAttempt?.result || firstAttempt.result,
  );
}

// A superseding row that is currently READY (status=active and unexpired READY
// lease per the canonical readiness owner) on another declared host is a live
// twin configured with this node id, not an earlier life of this node.
function isLiveTwinRow(observedRow, declaredHostId, nowMs) {
  const observedHost = readNodeHostIdentity(observedRow);
  return observedHost.state === NODE_HOST_IDENTITY_STATE.DECLARED &&
    observedHost.hostId !== declaredHostId &&
    isNodeRecordReady(observedRow, {now: nowMs});
}

/**
 * The typed error for a registration a superseding row refused. An earlier
 * life of this node id is superseded: a new boot lifecycle reserves above the
 * known incarnation (boot-incarnation-owner.js), so the join failure is
 * retryable by a new lifecycle, never by re-driving this one. A live twin on
 * another host is refused non-retryable for an operator and carries no
 * knownIncarnation (never raises the local incarnation floor).
 * @param {Object} options
 * @param {string} options.nodeId
 * @param {number} options.receivedIncarnation - This lifecycle's incarnation.
 * @param {Object|null} options.observedRow - The superseding NODES row.
 * @param {string} options.declaredHostId - This node's declared host id.
 * @param {number} options.nowMs - This node's finite clock reading.
 * @return {Error}
 */
function buildSupersededRegistrationError(options) {
  const declaredHostId = requireDeclaredNodeHostId(options?.declaredHostId);
  const nowMs = requireRegistrationClockReading(options?.nowMs);
  const receivedIncarnation =
    requirePositiveBootIncarnation(options?.receivedIncarnation);
  const knownIncarnation = incarnationOf(options?.observedRow) || null;
  if (isLiveTwinRow(options?.observedRow, declaredHostId, nowMs)) {
    const error = new Error(NODE_IDENTITY_TWIN_SUSPECTED_MESSAGE);
    error.code = NODE_IDENTITY_TWIN_SUSPECTED;
    error.retryable = false;
    error.nodeId = options.nodeId;
    error.receivedIncarnation = receivedIncarnation;
    error.observedHostId = readNodeHostIdentity(options.observedRow).hostId;
    error.declaredHostId = declaredHostId;
    return error;
  }
  const error = buildStaleNodeIncarnationError({
    nodeId: options.nodeId,
    receivedIncarnation,
    knownIncarnation,
  });
  error.retryable = true;
  return error;
}

export {
  NODE_IDENTITY_TWIN_SUSPECTED,
  NODE_INCARNATION_RELATION,
  NODE_REGISTRATION_CLOCK_REQUIRED,
  NODE_REGISTRATION_INCARNATION_REQUIRED,
  NODE_REGISTRATION_ISSUE_RECORD_REQUIRED,
  NODE_REGISTRATION_OUTCOME,
  buildSupersededRegistrationError,
  classifyNodeIncarnationRelation,
  createNodeRegistrationIssueRecord,
  isRegistrationAttemptIndeterminate,
  matchesIndeterminateAttemptRow,
  readAuthoritativeNodeRow,
  recordNodeRegistrationIssue,
  requireRegistrationClockReading,
  writeNodeRegistrationAtIncarnation,
};

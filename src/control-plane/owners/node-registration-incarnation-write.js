import {COLUMN, TABLES} from '../../constants/index.js';
import {
  buildStaleNodeIncarnationError,
  normalizeKnownNodeBootIncarnation,
} from '../control-plane-error-classification.js';
import {classifyControlPlaneMutationResult} from
  '../control-plane-mutation-outcome-classifier.js';
import {
  CONTROL_PLANE_AUTHORITATIVE_READ_MODE,
  CONTROL_PLANE_READ_LEADER_MODE,
  isAuthoritativeControlPlaneRowReadSuccessful,
  readAuthoritativeControlPlaneRows,
} from '../control-plane-system-table-gateway.js';

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
 * - CURRENT: this exact incarnation already owns the row (idempotent; no
 *   write, so a terminal row of this incarnation is never resurrected).
 * - REFUSED_STALE: a newer incarnation owns the row; never retried.
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
  ADVANCE_FROM: 'advance-from-',
});

const NODE_REGISTRATION_INCARNATION_REQUIRED =
  'NODE_REGISTRATION_INCARNATION_REQUIRED';
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

function classifyNodeIncarnationRelation(observedRow, bootIncarnation) {
  if (!observedRow) return NODE_INCARNATION_RELATION.ABSENT;
  const observed = incarnationOf(observedRow);
  if (observed > bootIncarnation) return NODE_INCARNATION_RELATION.NEWER;
  return observed === bootIncarnation ? NODE_INCARNATION_RELATION.CURRENT :
    NODE_INCARNATION_RELATION.OLDER;
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

// One mutation attempt: applied per the canonical classifier; a failure
// keeps its own error (code, retry-after hint) for the caller to surface.
async function attempt(write) {
  try {
    const result = await write();
    if (classifyControlPlaneMutationResult(result).applied === true) {
      return {applied: true, error: null};
    }
    return {applied: false, error: result?.success === false ?
      failedResultError(result) : null};
  } catch (error) {
    return {applied: false, error};
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
// time; never a second birth that fails UNIQUE.
function registrationWriteIdentity(row, verb) {
  return {writeIdentity: `${TABLES.NODES}:${row[COLUMN.NODE_ID]}@` +
    `${row[COLUMN.BOOT_INCARNATION]}:${verb}`};
}

// The one mutation an observation admits: birth when absent, one CAS on
// the exact older incarnation observed, none otherwise.
function planRegistration(options, row, observedRow, bootIncarnation) {
  const relation = classifyNodeIncarnationRelation(observedRow,
    bootIncarnation);
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
  }, row, registrationWriteIdentity(row,
    `${REGISTRATION_WRITE_VERB.ADVANCE_FROM}${observedValue}`));
}

function classifyObservation(read, bootIncarnation, afterAttempt) {
  if (read.available !== true || !read.row) {
    return NODE_REGISTRATION_OUTCOME.UNRESOLVED;
  }
  const relation = classifyNodeIncarnationRelation(read.row, bootIncarnation);
  if (relation === NODE_INCARNATION_RELATION.NEWER) {
    return NODE_REGISTRATION_OUTCOME.REFUSED_STALE;
  }
  if (relation === NODE_INCARNATION_RELATION.CURRENT) {
    return afterAttempt ? NODE_REGISTRATION_OUTCOME.ACCEPTED :
      NODE_REGISTRATION_OUTCOME.CURRENT;
  }
  return NODE_REGISTRATION_OUTCOME.UNRESOLVED;
}

function freezeOutcome(outcome, observedRow = null, error = null) {
  return Object.freeze({outcome, observedRow, error});
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
  const row = {...options.row, [COLUMN.BOOT_INCARNATION]: bootIncarnation};
  const observed = await options.observe();
  // Without an observation only a birth is attempted: an INSERT can never
  // replace an existing row; a conflict is resolved by the reread below.
  const observedRow = observed.available === true ? observed.row : null;
  const first = planRegistration(options, row, observedRow, bootIncarnation);
  if (first === null) {
    return freezeOutcome(
      classifyObservation(observed, bootIncarnation, false), observedRow);
  }
  const firstAttempt = await attempt(first);
  if (firstAttempt.applied) {
    return freezeOutcome(NODE_REGISTRATION_OUTCOME.ACCEPTED, observedRow);
  }
  return resolveUnappliedRegistration(options, row, bootIncarnation,
    firstAttempt);
}

// A failed or unknown attempt: one authoritative reread; an older owner
// still present (the birth lost a race or the observation was stale) gets
// one CAS; everything else is classified. No loop.
async function resolveUnappliedRegistration(options, row, bootIncarnation,
  firstAttempt) {
  const reread = await options.observe();
  const retry = reread.available === true && reread.row ?
    planRegistration(options, row, reread.row, bootIncarnation) : null;
  const retryAttempt = retry === null ? null : await attempt(retry);
  if (retryAttempt?.applied) {
    return freezeOutcome(NODE_REGISTRATION_OUTCOME.ACCEPTED, reread.row);
  }
  const settled = retryAttempt ? await options.observe() : reread;
  return freezeOutcome(classifyObservation(settled, bootIncarnation, true),
    settled.row || null, retryAttempt?.error || firstAttempt.error);
}

/**
 * The typed error for a registration a newer incarnation superseded. A new
 * boot lifecycle reserves above the known incarnation (see
 * boot-incarnation-owner.js), so the join failure is retryable by a new
 * lifecycle, never by re-driving this one.
 * @param {string} nodeId
 * @param {number} receivedIncarnation
 * @param {Object|null} observedRow
 * @return {Error}
 */
function buildSupersededRegistrationError(nodeId, receivedIncarnation,
  observedRow) {
  const error = buildStaleNodeIncarnationError({
    nodeId,
    receivedIncarnation,
    knownIncarnation: incarnationOf(observedRow) || null,
  });
  error.retryable = true;
  return error;
}

export {
  NODE_INCARNATION_RELATION,
  NODE_REGISTRATION_OUTCOME,
  buildSupersededRegistrationError,
  classifyNodeIncarnationRelation,
  readAuthoritativeNodeRow,
  writeNodeRegistrationAtIncarnation,
};

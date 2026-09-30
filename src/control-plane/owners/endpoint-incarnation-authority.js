import {COLUMN} from '../../constants/index.js';
import {endpointIncarnationOf} from './endpoint-incarnation-currentness.js';
import {normalizeKnownNodeBootIncarnation} from
  '../control-plane-error-classification.js';
import {requireIssuedBootIncarnation} from
  '../../bootstrap/boot-incarnation-contract.js';
import {classifyControlPlaneMutationResult} from
  '../control-plane-mutation-outcome-classifier.js';
import {
  CONTROL_PLANE_AUTHORITATIVE_READ_MODE,
  CONTROL_PLANE_READ_LEADER_MODE,
  isAuthoritativeControlPlaneRowReadSuccessful,
  readAuthoritativeControlPlaneRows,
} from '../control-plane-system-table-gateway.js';

/**
 * The endpoint incarnation authority (invariant I9): every node_endpoints /
 * service_endpoints row belongs to one exact boot incarnation of its node.
 *
 * - Validity: an endpoint is current only when its incarnation is known
 *   (> 0) and equals the authoritative NODES incarnation of its node. A
 *   stale or legacy (0) row may linger for cleanup; it is never current.
 * - Writes: an endpoint is born (insert when absent) or refreshed/advanced by
 *   one CAS on the exact incarnation it observed; a row owned by a newer
 *   incarnation is never replaced.
 * - Destructive mutations carry the exact incarnation in their predicate.
 * - A zero-row or unknown outcome is resolved by an authoritative reread of
 *   the row: this incarnation's destination -> done; absent -> done; another
 *   incarnation -> stale, never retried against it. No retry queue.
 */
const ENDPOINT_INCARNATION_OUTCOME = Object.freeze({
  APPLIED: 'applied',
  RESOLVED_BY_READBACK: 'resolved_by_readback',
  ALREADY_ABSENT: 'already_absent',
  NOT_APPLIED: 'not_applied_source_unchanged',
  REFUSED_STALE_INCARNATION: 'refused_stale_incarnation',
  REFUSED_INCARNATION_REQUIRED: 'refused_incarnation_required',
  AUTHORITY_UNAVAILABLE: 'authority_unavailable',
});

const COMPLETED_OUTCOMES = Object.freeze([
  ENDPOINT_INCARNATION_OUTCOME.APPLIED,
  ENDPOINT_INCARNATION_OUTCOME.RESOLVED_BY_READBACK,
  ENDPOINT_INCARNATION_OUTCOME.ALREADY_ABSENT,
]);

const ENDPOINT_AUTHORITATIVE_READ = Object.freeze({
  owner: 'endpoint_incarnation_authority',
  authoritativeReadMode:
    CONTROL_PLANE_AUTHORITATIVE_READ_MODE.OWNER_RPC_REQUIRED,
  leaderMode: CONTROL_PLANE_READ_LEADER_MODE.REQUIRED,
  deliveryPriority: 'critical',
  workClass: 'critical',
});

function isEndpointIncarnationOutcomeCompleted(outcome) {
  return COMPLETED_OUTCOMES.includes(outcome);
}

const ENDPOINT_STAMP_SUBJECT = 'Endpoint incarnation stamp';

/**
 * Stamp a row this node writes with its own boot incarnation. The value is
 * the node's issued incarnation (boot-incarnation-contract.js); a missing or
 * invalid one fails closed (BOOT_INCARNATION_REQUIRED) and is never stamped
 * as 0.
 * @param {Object} row
 * @param {number} bootIncarnation - This node's issued boot incarnation.
 * @return {Object} The row stamped with its owning incarnation.
 */
function stampEndpointIncarnation(row, bootIncarnation) {
  return {
    ...row,
    [COLUMN.BOOT_INCARNATION]:
      requireIssuedBootIncarnation(bootIncarnation, ENDPOINT_STAMP_SUBJECT),
  };
}

/**
 * @param {Object} whereClause
 * @param {number} bootIncarnation
 * @return {Object} The predicate fenced by the exact incarnation.
 */
function endpointIncarnationPredicate(whereClause, bootIncarnation) {
  return {
    ...whereClause,
    [COLUMN.BOOT_INCARNATION]:
      normalizeKnownNodeBootIncarnation(bootIncarnation),
  };
}

/**
 * Authoritative read of one endpoint row from its table's owner.
 * @param {Object} gateway
 * @param {string} tableName
 * @param {string} endpointId
 * @return {Promise<{available: boolean, row: Object|null}>}
 */
async function readAuthoritativeEndpointRow(gateway, tableName, endpointId) {
  let result = null;
  try {
    result = await readAuthoritativeControlPlaneRows(
      gateway,
      tableName,
      `SELECT * FROM ${tableName} WHERE ${COLUMN.ENDPOINT_ID} = ?`,
      [endpointId],
      ENDPOINT_AUTHORITATIVE_READ,
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
    row: rows.find((row) => row?.[COLUMN.ENDPOINT_ID] === endpointId) ||
      null,
  };
}

// The canonical mutation classifier decides applied: an explicit zero-row
// result is a CAS miss; a failed or thrown attempt is uncertain.
function attemptApplied(attempt) {
  return attempt.error === null &&
    classifyControlPlaneMutationResult(attempt.result).applied === true;
}

function rowReachedDestination(row, destination) {
  return Object.entries(destination).every(([column, value]) =>
    row?.[column] === value);
}

function classifyEndpointReadback(read, bootIncarnation, destination,
  absentOutcome = ENDPOINT_INCARNATION_OUTCOME.ALREADY_ABSENT) {
  if (read.available !== true) {
    return ENDPOINT_INCARNATION_OUTCOME.AUTHORITY_UNAVAILABLE;
  }
  if (!read.row) return absentOutcome;
  if (endpointIncarnationOf(read.row) !== bootIncarnation) {
    return ENDPOINT_INCARNATION_OUTCOME.REFUSED_STALE_INCARNATION;
  }
  return rowReachedDestination(read.row, destination) ?
    ENDPOINT_INCARNATION_OUTCOME.RESOLVED_BY_READBACK :
    ENDPOINT_INCARNATION_OUTCOME.NOT_APPLIED;
}

async function attemptWrite(write) {
  try {
    return {result: await write(), error: null};
  } catch (error) {
    return {result: null, error};
  }
}

function freezeOutcome(outcome, attempt = {}) {
  return Object.freeze({
    outcome,
    result: attempt.result ?? null,
    error: attempt.error ?? null,
  });
}

async function resolveAttempt(attempt, readback) {
  if (attemptApplied(attempt)) {
    return freezeOutcome(ENDPOINT_INCARNATION_OUTCOME.APPLIED, attempt);
  }
  return freezeOutcome(await readback(), attempt);
}

/**
 * One destructive (or state-changing) endpoint mutation at the exact
 * incarnation: withdraw, reap, remove.
 * @param {Object} options
 * @param {number} options.bootIncarnation - The incarnation that owns it.
 * @param {Object} options.destination - Columns the mutation establishes
 *   (empty for a DELETE: absence is the destination).
 * @param {Function} options.write - (fencedWhereClause) => mutation result.
 * @param {Object} options.whereClause - Unfenced identity predicate.
 * @param {Function} options.observe - () => {available, row}.
 * @param {boolean} [options.deletes] - The mutation is a DELETE.
 * @return {Promise<Object>} Frozen outcome.
 */
async function mutateEndpointAtIncarnation(options) {
  const bootIncarnation =
    normalizeKnownNodeBootIncarnation(options.bootIncarnation);
  if (bootIncarnation === 0) {
    return freezeOutcome(
      ENDPOINT_INCARNATION_OUTCOME.REFUSED_INCARNATION_REQUIRED);
  }
  const attempt = await attemptWrite(() => options.write(
    endpointIncarnationPredicate(options.whereClause, bootIncarnation)));
  return resolveAttempt(attempt, async () => {
    const read = await options.observe();
    // A delete's destination is absence: this incarnation's row still
    // present means it did not apply.
    if (options.deletes === true && read.available === true && read.row &&
        endpointIncarnationOf(read.row) === bootIncarnation) {
      return ENDPOINT_INCARNATION_OUTCOME.NOT_APPLIED;
    }
    return classifyEndpointReadback(read, bootIncarnation,
      options.destination || {});
  });
}

function withoutEndpointId(row) {
  const data = {...row};
  delete data[COLUMN.ENDPOINT_ID];
  return data;
}

function casFromObserved(options, row, observedRow) {
  return attemptWrite(() => options.update(
    {
      [COLUMN.ENDPOINT_ID]: row[COLUMN.ENDPOINT_ID],
      [COLUMN.BOOT_INCARNATION]: endpointIncarnationOf(observedRow),
    },
    withoutEndpointId(row),
  ));
}

// The next mutation for an observation: birth when absent, one CAS on the
// observed same-or-older incarnation, none for a newer owner.
function planEndpointWrite(options, row, observed, bootIncarnation) {
  if (!observed.row) {
    return () => attemptWrite(() => options.insert(row));
  }
  if (endpointIncarnationOf(observed.row) > bootIncarnation) return null;
  return () => casFromObserved(options, row, observed.row);
}

/**
 * Birth or refresh one endpoint row at this incarnation. Absent -> insert;
 * present at the same or an older incarnation -> one CAS on the observed
 * incarnation; present at a newer incarnation -> refused, never replaced.
 * An uncertain outcome is reread once: this incarnation's row -> done; an
 * older owner still present (the birth lost a race or the observation was
 * stale) -> one CAS advance from that reread; anything else -> classified.
 * @param {Object} options
 * @param {Object} options.row - The endpoint row (endpoint_id required).
 * @param {number} options.bootIncarnation
 * @param {Function} options.observe - () => {available, row} (the
 *   observation that selects the mutation; the CAS enforces it).
 * @param {Function} [options.readback] - Authoritative () => {available,
 *   row} for an uncertain outcome (defaults to observe).
 * @param {Function} options.insert - (stampedRow) => mutation result.
 * @param {Function} options.update - (whereClause, data) => mutation result.
 * @return {Promise<Object>} Frozen outcome.
 */
async function writeEndpointAtIncarnation(options) {
  const bootIncarnation =
    normalizeKnownNodeBootIncarnation(options.bootIncarnation);
  if (bootIncarnation === 0) {
    return freezeOutcome(
      ENDPOINT_INCARNATION_OUTCOME.REFUSED_INCARNATION_REQUIRED);
  }
  const row = stampEndpointIncarnation(options.row, bootIncarnation);
  const destination = {[COLUMN.ADDRESS]: row[COLUMN.ADDRESS]};
  const readAuthority = options.readback || options.observe;
  // Without an observation only a birth is attempted: an INSERT can never
  // replace an existing row (a conflict is resolved by the reread below).
  const observed = await options.observe();
  const first = planEndpointWrite(options, row,
    observed.available === true ? observed : {row: null}, bootIncarnation);
  if (first === null) {
    return freezeOutcome(
      ENDPOINT_INCARNATION_OUTCOME.REFUSED_STALE_INCARNATION);
  }
  const attempt = await first();
  if (attemptApplied(attempt)) {
    return freezeOutcome(ENDPOINT_INCARNATION_OUTCOME.APPLIED, attempt);
  }
  const reread = await readAuthority();
  const olderOwner = reread.available === true && reread.row &&
    endpointIncarnationOf(reread.row) < bootIncarnation;
  if (!olderOwner) {
    return freezeOutcome(classifyEndpointReadback(reread, bootIncarnation,
      destination, ENDPOINT_INCARNATION_OUTCOME.NOT_APPLIED), attempt);
  }
  return resolveAttempt(await casFromObserved(options, row, reread.row),
    async () => classifyEndpointReadback(await readAuthority(),
      bootIncarnation, destination,
      ENDPOINT_INCARNATION_OUTCOME.NOT_APPLIED));
}

export {
  ENDPOINT_INCARNATION_OUTCOME,
  endpointIncarnationPredicate,
  isEndpointIncarnationOutcomeCompleted,
  mutateEndpointAtIncarnation,
  readAuthoritativeEndpointRow,
  stampEndpointIncarnation,
  writeEndpointAtIncarnation,
};

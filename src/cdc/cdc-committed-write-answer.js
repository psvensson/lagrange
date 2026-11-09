/**
 * The answer of a routed system-table write: it answers at its commit at the
 * partition owner, with its position (quest
 * replica-admission-from-committed-operation, attempt 2). No projection is
 * consulted to answer a write; a consumer that needs its own node's cache to
 * reflect the write waits for the position (awaitProjectionAt).
 */

import {classifyControlPlaneMutationResult} from
  '../control-plane/control-plane-mutation-outcome-classifier.js';

function nonEmptyString(value) {
  return typeof value === 'string' && value.length > 0;
}

/**
 * The committed write's position: the table, the primary key, and the
 * origin HLC the commit stamped (the routed write's own receipt). A commit
 * that carried no origin HLC (a settled replay proves none) answers a
 * position without one, which the projection wait refuses typed
 * (position_unknown). A write that changed no row emits no change event, so
 * it has no position at all (null; the wait refuses it position_invalid).
 * @param {string} tableName - System table.
 * @param {*} key - Primary key value.
 * @param {Object} result - The routed write's committed result.
 * @param {boolean} [deleted] - The write removed the row.
 * @return {Object|null} Frozen position, null when no row changed.
 */
function committedWritePosition(tableName, key, result, deleted = false) {
  if (classifyControlPlaneMutationResult(result).zeroAffectedRows) return null;
  return Object.freeze({
    tableName,
    key,
    originHlc: nonEmptyString(result?.originHlc) ? result.originHlc : null,
    ...(deleted ? {deleted: true} : {}),
  });
}

export {committedWritePosition};

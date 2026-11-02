/**
 * The answer of a routed system-table write: it answers at its commit at the
 * partition owner, with its position (quest
 * replica-admission-from-committed-operation, attempt 2). No projection is
 * consulted to answer a write; a consumer that needs its own node's cache to
 * reflect the write waits for the position (awaitProjectionAt).
 */

function nonEmptyString(value) {
  return typeof value === 'string' && value.length > 0;
}

/**
 * The committed write's position: the table, the primary key, and the
 * origin HLC the commit stamped (the routed write's own receipt). A commit
 * that carried no origin HLC answers a position without one, which the
 * projection wait refuses typed (position_unknown).
 * @param {string} tableName - System table.
 * @param {*} key - Primary key value.
 * @param {Object} result - The routed write's committed result.
 * @param {boolean} [deleted] - The write removed the row.
 * @return {Object} Frozen position.
 */
function committedWritePosition(tableName, key, result, deleted = false) {
  return Object.freeze({
    tableName,
    key,
    originHlc: nonEmptyString(result?.originHlc) ? result.originHlc : null,
    ...(deleted ? {deleted: true} : {}),
  });
}

export {committedWritePosition};

// The CDC integration's local system-table write lane: a system-table write
// sent to this node's own leader replicas of the table, one after another,
// before the routed engine path. Under the routed mutation's idempotency key
// every local replica is sent the write under the entryId the distributed
// write coordinator derives for the replica's partition (the one derivation,
// quest reroute-carries-the-entry-id C1), so the write is sent on after any
// answer that did not fail it for good; without a key it is sent on only
// after an answer that never proposed it. A thrown answer is decided as a
// returned one: by its code, never by its text.
//
// The lane sends the statement as the routed engine path sends it, never its
// caller's text (verification round 3, B4): the partition binds the entryId
// to the statement it settled, so the engine's re-send of a lane attempt
// must be the same statement. A statement the rendering owner does not
// render (it does not parse, or it is not a write) is not the lane's: the
// routed engine path answers it.

import {routedMutationLocalWriteOptions} from
  './cdc-routed-system-write-selection.js';
import {
  PARTITION_WRITE_STATEMENT_RENDERING,
  renderPartitionWriteStatement,
} from '../query/partition-write-statement-rendering.js';
import {
  isPartitionWriteFailureCode,
  isReroutableWriteFailureCode,
} from '../partition/partition-write-kernel.js';

/**
 * Whether a local partition's failed answer to a system-table write - the
 * answer it returned or the error it threw - sends the write on to the next
 * local service. A partition answer is decided by its code through the write
 * kernel's predicate: an unknown outcome only when the write is sent on under
 * its entryId (it may have committed here). A failure without a kernel code
 * is not a partition answer, so nothing says the write was never proposed:
 * it is sent on, when the CDC integration names it transient, only under the
 * entryId (the re-send is then idempotent).
 * @param {Object} cdc - The CDC integration (its transient-error test).
 * @param {Object} failure - The failed answer or the thrown error.
 * @param {boolean} carriesEntryId - Whether the write is sent on under the
 *   entryId it was answered for.
 * @return {boolean} Whether the write is sent on.
 */
function isLocalSystemTableWriteFailureRoutedOn(cdc, failure,
  carriesEntryId) {
  if (isPartitionWriteFailureCode(failure?.failureCode)) {
    return isReroutableWriteFailureCode(failure.failureCode, {carriesEntryId});
  }
  return carriesEntryId && cdc.isTransientCdcError(failure);
}

/**
 * Send a system-table write to the local leader replicas in turn.
 * @param {Object} cdc - The CDC integration.
 * @param {Array<Object>} localServices - The local leader replicas.
 * @param {Object} write - {sql, params, idempotencyKey (or null)}: the
 *   caller's statement, sent as the rendering owner renders it.
 * @return {Promise<Object>} {handled, result?}; not handled when no local
 *   service took it or the statement is not one the lane sends.
 */
async function sendLocalSystemTableWrite(cdc, localServices,
  {sql, params, idempotencyKey}) {
  const statement = renderPartitionWriteStatement(sql, params);
  if (statement.state !== PARTITION_WRITE_STATEMENT_RENDERING.RENDERED) {
    return {handled: false};
  }
  for (const partitionService of localServices) {
    if (typeof partitionService?.executeQuery !== 'function') {
      continue;
    }
    try {
      const localResult = await partitionService.executeQuery(statement.sql,
        statement.params, routedMutationLocalWriteOptions(idempotencyKey,
          partitionService.partitionId));
      const result = cdc.normalizeLocalSystemTableWriteResult(localResult);
      if (result?.success === false &&
        isLocalSystemTableWriteFailureRoutedOn(cdc, result,
          idempotencyKey !== null)) {
        continue;
      }
      return {handled: true, result};
    } catch (error) {
      if (isLocalSystemTableWriteFailureRoutedOn(cdc, error,
        idempotencyKey !== null)) {
        continue;
      }
      throw error;
    }
  }
  return {handled: false};
}

export {sendLocalSystemTableWrite};

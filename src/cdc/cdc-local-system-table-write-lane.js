// The CDC integration's local system-table write lane: a system-table write
// sent to this node's own leader replicas of the table, one after another,
// before the routed engine path. Under the routed mutation's idempotency key
// every local replica is sent the write under the entryId the distributed
// write coordinator derives for the replica's partition (the one derivation,
// quest reroute-carries-the-entry-id C1), so an entryId belongs to one
// partition: the write moves on to the next local partition only after an
// answer that proves nothing was applied (verification round 4, B6). An
// answer that may have applied (an unknown outcome, a committed write's
// environmental failure, a failure without a kernel code) never moves it to
// another partition: under the key the routed engine path sends it again
// under the same key - the coordinator derives the same entryId for the
// partition that answered - and without one it is answered as it is. A
// thrown answer is decided as a returned one: by its code, never by its text.
//
// The lane sends the statement as the routed engine path sends it, never its
// caller's text (verification round 3, B4): the partition binds the entryId
// to the statement it settled, so the engine's re-send of a lane attempt
// must be the same statement. A statement the rendering owner does not
// render (it does not parse, or it is not a write) is not the lane's: the
// routed engine path answers it. The lane parses through the engine's parse
// cache, the one the engine's own parse of the statement uses (round 4, F29).

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

// Where a local partition's failed answer sends a system-table write (R07):
// on to the next local partition (the answer proves nothing was applied),
// to the routed engine path under the same key (it may have applied here),
// or back to the caller as it is.
const LOCAL_SYSTEM_TABLE_WRITE_FAILURE_ROUTE = Object.freeze({
  NEXT_LOCAL_PARTITION: 'next_local_partition',
  ROUTED_PATH: 'routed_path',
  ANSWERED: 'answered',
});
const ROUTE = LOCAL_SYSTEM_TABLE_WRITE_FAILURE_ROUTE;

/**
 * Where a local partition's failed answer to a system-table write - the
 * answer it returned or the error it threw - sends the write. By its code,
 * through the write kernel's predicate: only a code the kernel routes again
 * without the entryId (the write was never proposed there) moves it to the
 * next local partition, whose entryId is another. A code routed again only
 * under the answer's own entryId, and a failure without a kernel code that
 * the CDC integration names transient (nothing says it was never proposed),
 * go to the routed engine path under the routed mutation's key; without a
 * key, or for any other failure, the answer is the caller's.
 * @param {Object} cdc - The CDC integration (its transient-error test).
 * @param {Object} failure - The failed answer or the thrown error.
 * @param {string|null} idempotencyKey - The routed mutation's key.
 * @return {string} A LOCAL_SYSTEM_TABLE_WRITE_FAILURE_ROUTE.
 */
function routeLocalSystemTableWriteFailure(cdc, failure, idempotencyKey) {
  const code = failure?.failureCode;
  const coded = isPartitionWriteFailureCode(code);
  if (coded && isReroutableWriteFailureCode(code)) {
    return ROUTE.NEXT_LOCAL_PARTITION;
  }
  const retriedUnderTheKey = idempotencyKey !== null && (coded ?
    isReroutableWriteFailureCode(code, {carriesEntryId: true}) :
    cdc.isTransientCdcError(failure));
  return retriedUnderTheKey ? ROUTE.ROUTED_PATH : ROUTE.ANSWERED;
}

/**
 * The engine's parses of statements (its parse cache): the lane parses its
 * caller's statement through them, as the engine's own parse of it does.
 * @param {Object|undefined} engine - The CDC integration's SQL engine.
 * @return {Object|undefined} Its parse cache (none without an engine).
 */
function engineParsesOf(engine) {
  return engine?.parseCache;
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
  const statement = renderPartitionWriteStatement(sql, params,
    {parses: engineParsesOf(cdc.sqlQueryEngine)});
  if (statement.state !== PARTITION_WRITE_STATEMENT_RENDERING.RENDERED) {
    return {handled: false};
  }
  for (const partitionService of localServices) {
    if (typeof partitionService?.executeQuery !== 'function') {
      continue;
    }
    let result;
    let route;
    try {
      result = cdc.normalizeLocalSystemTableWriteResult(
        await partitionService.executeQuery(statement.sql, statement.params,
          routedMutationLocalWriteOptions(idempotencyKey,
            partitionService.partitionId)));
      route = result?.success === false ?
        routeLocalSystemTableWriteFailure(cdc, result, idempotencyKey) :
        ROUTE.ANSWERED;
    } catch (error) {
      route = routeLocalSystemTableWriteFailure(cdc, error, idempotencyKey);
      if (route === ROUTE.ANSWERED) {
        throw error;
      }
    }
    if (route === ROUTE.ANSWERED) {
      return {handled: true, result};
    }
    if (route === ROUTE.ROUTED_PATH) {
      return {handled: false};
    }
  }
  return {handled: false};
}

export {sendLocalSystemTableWrite};

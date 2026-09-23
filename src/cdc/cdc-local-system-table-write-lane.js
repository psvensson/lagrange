// The CDC integration's local system-table write lane: a system-table write
// sent to this node's own leader replicas of the table, one after another,
// before the routed engine path. Under the routed mutation's idempotency key
// every local replica is sent the write under the entryId the distributed
// write coordinator derives for the replica's partition (the one derivation,
// quest reroute-carries-the-entry-id C1), so the write is sent on after any
// answer that did not fail it for good; without a key it is sent on only
// after an answer that never proposed it.

import {CDC_INTEGRATION_SERVICE_SHARED} from './cdc-integration-service-shared.js';
import {routedMutationLocalWriteOptions} from
  './cdc-routed-system-write-selection.js';
import {
  isPartitionWriteFailureCode,
  isReroutableWriteFailureCode,
} from '../partition/partition-write-kernel.js';

const {CDC_INTEGRATION_SERVICE_LITERAL} = CDC_INTEGRATION_SERVICE_SHARED;

/**
 * Whether the local partition's answer to a system-table write sends it on
 * to the next local service: a typed answer when its code says it may be
 * sent again - an unknown outcome only when the write is sent on under its
 * entryId (it may have committed here) - an untyped one by its text.
 * @param {Object} cdc - The CDC integration (its transient-error test).
 * @param {Object|null} result - The local partition's answer.
 * @param {boolean} carriesEntryId - Whether the write is sent on under the
 *   entryId it was answered for.
 * @return {boolean} Whether the write is sent on.
 */
function isLocalSystemTableWriteRoutedOn(cdc, result, carriesEntryId) {
  if (result && result.success !== false) {
    return false;
  }
  return isPartitionWriteFailureCode(result?.failureCode) ?
    isReroutableWriteFailureCode(result.failureCode, {carriesEntryId}) :
    cdc.isTransientCdcError(result?.error || '');
}

/**
 * Send a system-table write to the local leader replicas in turn.
 * @param {Object} cdc - The CDC integration.
 * @param {Array<Object>} localServices - The local leader replicas.
 * @param {Object} write - {sql, params, idempotencyKey (or null)}.
 * @return {Promise<Object>} {handled, result?}.
 */
async function sendLocalSystemTableWrite(cdc, localServices,
  {sql, params, idempotencyKey}) {
  for (const partitionService of localServices) {
    if (typeof partitionService?.executeQuery !== 'function') {
      continue;
    }
    try {
      const localResult = await partitionService.executeQuery(sql, params,
        routedMutationLocalWriteOptions(idempotencyKey,
          partitionService.partitionId));
      const result = cdc.normalizeLocalSystemTableWriteResult(localResult);
      if (isLocalSystemTableWriteRoutedOn(cdc, result,
        idempotencyKey !== null)) {
        continue;
      }
      return {handled: true, result};
    } catch (error) {
      if (cdc.isTransientCdcError(
        error?.message || CDC_INTEGRATION_SERVICE_LITERAL.EMPTY)) {
        continue;
      }
      throw error;
    }
  }
  return {handled: false};
}

export {sendLocalSystemTableWrite};

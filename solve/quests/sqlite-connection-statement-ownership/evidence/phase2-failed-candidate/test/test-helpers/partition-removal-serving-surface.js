/**
 * The partition's removal-serving surface (its admission fence, serving
 * drain and the fence's cancellation lift) for a test double of a partition
 * service: the production methods (PARTITION_SERVICE_REMOVAL_SERVING_METHODS)
 * over the fields the partition's constructor owns, on an open in-memory
 * participant store - no serving request in flight and participant custody
 * IDLE, so the fence answers FENCED and the drain DRAINED at once, exactly
 * as an idle partition's do. A double that hand-wrote these methods (or
 * left them out, when the removal path called them optionally) takes this
 * instead.
 */

import {SQLiteConnection} from '../../src/storage/sqlite-prepared-statement-owner.js';
import {
  PARTITION_SERVICE_REMOVAL_SERVING_METHODS,
  REMOVAL_SERVING_STATE,
} from '../../src/partition/partition-service-removal-serving-methods.js';
import {openParticipantTransactionStore} from
  '../../src/partition/partition-participant-transaction-store.js';

// The drain's DRAINED answer, for a double that gates its drain itself.
const REMOVAL_DRAINED_ANSWER = Object.freeze({
  state: REMOVAL_SERVING_STATE.DRAINED});

/**
 * Give a partition-service double the production removal-serving surface.
 * @param {Object} service - The double (mutated and returned).
 * @return {Object} The same double.
 */
function withRemovalServingSurface(service) {
  const db = new SQLiteConnection(':memory:');
  openParticipantTransactionStore(db);
  return Object.assign(service, {
    db,
    activeServingRequestCount: 0,
    removalServingAdmissionFenced: false,
    removalDrainWakes: new Set(),
  }, PARTITION_SERVICE_REMOVAL_SERVING_METHODS);
}

export {REMOVAL_DRAINED_ANSWER, withRemovalServingSurface};

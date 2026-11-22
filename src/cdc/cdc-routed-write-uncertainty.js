/**
 * The most uncertain answer of one routed system-table write across its hops
 * and attempts (the CDC routed-mutation loop), every one delivered under the
 * write's one idempotency key. Once a hop answered the typed unknown - its
 * entry may have been proposed and may still commit - a later refusal or
 * failure of a re-send proves nothing of that entry: the write fails with that
 * unknown, never with the last answer, so its named instance stays unresolved;
 * only a successful answer (its commit receipt) ends it. A terminal answer of
 * the owner (shut down) is never replaced: it carries the hop it overtook as
 * its cause.
 */

import {CDC_INTEGRATION_SERVICE_SHARED} from './cdc-integration-service-shared.js';
import {isControlPlaneWriteOutcomeUnknown} from
  '../control-plane/control-plane-write-identity.js';
import {isControlPlaneWriterShutDown} from
  '../control-plane/control-plane-error-classification.js';

const {ERRORS, buildSystemTableMutationError} = CDC_INTEGRATION_SERVICE_SHARED;

/**
 * The uncertainty of one routed write.
 * @return {Object} {observe(answer), admit(error), failure(answer),
 *   settled(result)}: observe records a hop's answer; admit rethrows an answer
 *   already decided by settled, else observes it; failure is the answer the
 *   write fails with in place of `answer`; settled is a returned answer that
 *   ends the write (a failure after an unknown is that unknown, thrown as
 *   decided so the loop does not retry it).
 */
function createRoutedWriteUncertainty() {
  const decided = new WeakSet();
  let unknown = null;
  const observe = (answer) => {
    if (unknown === null && isControlPlaneWriteOutcomeUnknown(answer)) {
      unknown = answer;
    }
  };
  const failure = (answer) => {
    if (unknown === null || isControlPlaneWriteOutcomeUnknown(answer) ||
        isControlPlaneWriterShutDown(answer)) {
      return answer;
    }
    return unknown instanceof Error ? unknown :
      buildSystemTableMutationError(unknown, ERRORS.QUERY_FAILED);
  };
  return {
    observe,
    failure,
    admit(error) {
      if (decided.has(error)) {
        throw error;
      }
      observe(error);
    },
    settled(result) {
      if (result?.success !== false) {
        return result;
      }
      const answer = failure(result);
      if (answer === result) {
        return result;
      }
      decided.add(answer);
      throw answer;
    },
  };
}

export {createRoutedWriteUncertainty};

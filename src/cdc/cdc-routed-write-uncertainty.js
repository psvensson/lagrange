/**
 * The state of one routed system-table write across its hops and attempts
 * (the CDC routed-mutation loop), every one delivered under the write's one
 * idempotency key: its most uncertain answer, and its one spent-wait report.
 *
 * The most uncertain answer: once a hop answered the typed unknown - its
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
import {reportWaitBoundSpent} from '../logging/wait-bound-spent.js';

const {
  ERRORS,
  buildSystemTableMutationError,
  getControlPlaneErrorCode,
  getControlPlaneRetryAfterMs,
} = CDC_INTEGRATION_SERVICE_SHARED;

const ROUTED_MUTATION_RETRY_BUDGET_WAIT = Object.freeze({
  wait: 'cdc_routed_mutation_retry_budget',
  awaited: 'routed system-table mutation accepted within the per-call ' +
    'query execution budget',
});
const ROUTED_MUTATION_ATTEMPTS_WAIT = Object.freeze({
  wait: 'CDC_DEFAULTS.RETRY_MAX_ATTEMPTS',
  awaited: 'routed system-table mutation accepted by the engine',
});

/**
 * The spent-wait latch of one routed write. The per-call budget can be
 * found spent by the delay gate and again by the catch its throw lands in,
 * and a spent budget can coincide with the last attempt: one write reports
 * one line.
 * @param {Object} service - The CDC integration service.
 * @param {Object} write - {tableName, maxAttempts, budgetMs, readElapsedMs}.
 * @return {{budgetSpent: Function, attemptsSpent: Function}} Reporters,
 *   called on the expiry branches only.
 */
function createRoutedMutationSpentLatch(service, write) {
  let reported = false;
  const scope = {nodeId: service.nodeId, tableName: write.tableName};
  return {
    budgetSpent(lastObserved) {
      if (reported) {
        return;
      }
      reported = true;
      reportWaitBoundSpent(service.logger, {
        ...ROUTED_MUTATION_RETRY_BUDGET_WAIT,
        boundMs: write.budgetMs,
        elapsedMs: write.readElapsedMs(),
        lastObserved,
        scope,
      });
    },
    attemptsSpent(attempt, error) {
      if (reported) {
        return;
      }
      reported = true;
      reportWaitBoundSpent(service.logger, {
        ...ROUTED_MUTATION_ATTEMPTS_WAIT,
        boundMs: null,
        elapsedMs: write.readElapsedMs(),
        lastObserved: () => ({
          attempts: attempt,
          maxAttempts: write.maxAttempts,
          errorCode: getControlPlaneErrorCode(error) || null,
          retryAfterMs: getControlPlaneRetryAfterMs(error),
        }),
        scope,
      });
    },
  };
}

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

export {createRoutedMutationSpentLatch, createRoutedWriteUncertainty};

// One cancelable read-dependency backoff for the existing retained owner.
// It refires the original finite observation masks; it creates no work/envelope.
// Delay policy and clock are the repository's existing bounded owner-read retry.
import {REPAIR_OBSERVATION as OBSERVATION} from './replica-operation-retained-repair-observation.js';

const BACKOFF_MULTIPLIER = 2;

function assignRetainedRepairReadRetryMethods(Repository) {
  Object.assign(Repository.prototype, {
    scheduleRetainedRepairReadRetry(attempt, observations) {
      if (!this.retainedRepairAttemptIsCurrent(attempt)) return;
      attempt.retryObservations |= observations | attempt.observations;
      attempt.observations = OBSERVATION.NONE;
      if (this.retainedPlacementRepairReadRetry !== null) return;
      const delay = this.getRetryableReplicaOperationReadRetryDelayMs({
        retryAfterMs: this.retainedPlacementRepairReadRetryDelayMs * BACKOFF_MULTIPLIER});
      this.retainedPlacementRepairReadRetryDelayMs = delay;
      const retry = {handle: null};
      this.retainedPlacementRepairReadRetry = retry;
      retry.handle = this.timeSource.setTimeout(() => {
        if (this.retainedPlacementRepairReadRetry !== retry) return;
        this.retainedPlacementRepairReadRetry = null;
        if (this.isShuttingDownRequested()) return;
        for (const record of this.retainedPlacementRepairs.values()) {
          const pending = record.retryObservations;
          record.retryObservations = OBSERVATION.NONE;
          if (pending !== OBSERVATION.NONE) {
            this.wakeRetainedPlacementRepairs((candidate) => candidate === record, pending);
          }
        }
      }, delay);
    },

    completeRetainedRepairReadDependency(attempt) {
      attempt.retryObservations = OBSERVATION.NONE;
      if ([...this.retainedPlacementRepairs.values()].every((record) =>
        record.retryObservations === OBSERVATION.NONE)) {
        this.cancelRetainedRepairReadRetry();
      }
    },

    cancelRetainedRepairReadRetry() {
      const retry = this.retainedPlacementRepairReadRetry;
      this.retainedPlacementRepairReadRetry = null;
      this.retainedPlacementRepairReadRetryDelayMs = 0;
      if (retry !== null) this.timeSource.clearTimeout(retry.handle);
    },
  });
}

export {assignRetainedRepairReadRetryMethods};

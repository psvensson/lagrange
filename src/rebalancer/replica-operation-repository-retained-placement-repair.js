import {v4 as uuidv4} from 'uuid';
import {isDeepStrictEqual} from 'node:util';
import {PARTITION_SERVICE_EVENT} from '../partition/partition-service-constants.js';
import {PARTITION_WRITE_LEADERSHIP_REFUSAL} from '../partition/partition-write-kernel.js';
import {PLACEMENT_OUTCOME, PLACEMENT_REFUSAL} from './replica-placement-owner-constants.js';
import {SYSTEM_TABLE_NAME} from '../bootstrap/system-table-schemas-constants.js';
import {copyOperationOutcomeData} from './replica-operation-update-outcome.js';

// One immutable process-retained envelope per operation; no timer, no durable
// reconstruction promise. Native ledger commits and committed CDC are triggers,
// never substitute admission authority. Every retry reaches native apply.
function sameBlocker(row, blocker) {
  return row?.created_at === blocker.createdAt &&
    row.workflow_step === blocker.workflowStep && row.completed_at === blocker.completedAt;
}

function shouldWake(attempt, event, db) {
  if (event?.command?.entryId === attempt.entryId) return false;
  if (!attempt.blockers) return true;
  return attempt.blockers.some((blocker) => !sameBlocker(db.prepare(
    'SELECT created_at, workflow_step, completed_at FROM replica_operations ' +
    'WHERE operation_id = ?').get(blocker.operationId), blocker));
}

function assignRetainedPlacementRepairMethods(Repository) {
  Object.assign(Repository.prototype, {
    async repairRetainedOperation(operation) {
      if (this.isShuttingDownRequested() ||
          typeof this.repairRetainedPlacement !== 'function') return false;
      let attempt = this.retainedPlacementRepairs.get(operation.operationId);
      if (!attempt) {
        attempt = {operation: copyOperationOutcomeData(operation), entryId: null,
          blockers: null, pending: null, writePaused: false};
        this.retainedPlacementRepairs.set(operation.operationId, attempt);
      }
      if (!isDeepStrictEqual(attempt.operation, operation)) return false;
      if (attempt.pending) return attempt.pending;
      attempt.pending = this.submitRetainedPlacementRepairAttempt(operation, attempt)
        .finally(() => { attempt.pending = null; });
      return attempt.pending;
    },

    async submitRetainedPlacementRepairAttempt(operation, attempt) {
      if (attempt.entryId === null) {
        attempt.entryId = `retained-repair:${operation.operationId}:${uuidv4()}`;
      }
      let answer;
      try {
        answer = await this.repairRetainedPlacement({
          entryId: attempt.entryId, body: {operation: attempt.operation},
        });
      } catch (error) {
        this.logger.warn('Retained placement repair answer unavailable',
          {operationId: operation.operationId, error: error?.message || String(error)});
        return false;
      }
      if (this.isShuttingDownRequested() ||
          this.retainedPlacementRepairs.get(operation.operationId) !== attempt) return false;
      const result = answer?.placementResult;
      if (result?.outcome === PLACEMENT_OUTCOME.ADMITTED &&
          isDeepStrictEqual(result.operationIds, [operation.operationId])) {
        this.retainedPlacementRepairs.delete(operation.operationId);
        this.syncIncompleteOperationObservation(attempt.operation);
        return true;
      }
      attempt.writePaused = answer?.failureCode ===
        PARTITION_WRITE_LEADERSHIP_REFUSAL.CUTOVER_PAUSED;
      if (result?.reason === PLACEMENT_REFUSAL.PARTITION_BUSY) {
        attempt.blockers = result.blockingOperations;
        attempt.entryId = null;
      } else if (result?.outcome === PLACEMENT_OUTCOME.REFUSED) {
        // A permanent native refusal retains caller evidence, but cannot
        // repeatedly re-propose the same invalid restoration.
        this.retainedPlacementRepairs.delete(operation.operationId);
      }
      return false;
    },

    wakeRetainedPlacementRepairs(predicate = () => true) {
      if (this.isShuttingDownRequested()) return;
      for (const attempt of this.retainedPlacementRepairs.values()) {
        if (predicate(attempt)) attempt.wakePending = true;
      }
      if (this.retainedPlacementRepairDrain) return;
      this.retainedPlacementRepairDrain = this.redriveRetainedPlacementRepairs()
        .catch((error) => this.logger.warn('Retained placement repair deferred',
          {error: error?.message || String(error)}))
        .finally(() => { this.retainedPlacementRepairDrain = null; });
    },

    async redriveRetainedPlacementRepairs() {
      while (!this.isShuttingDownRequested()) {
        const attempts = [...this.retainedPlacementRepairs.values()]
          .filter((attempt) => attempt.wakePending);
        if (attempts.length === 0) return;
        for (const attempt of attempts) {
          attempt.wakePending = false;
          await this.repairRetainedOperation(attempt.operation);
        }
      }
    },

    observeRetainedPlacementRepairCommit(tableName, row) {
      this.wakeRetainedPlacementRepairs((attempt) => {
        if (tableName === SYSTEM_TABLE_NAME.SERVICES) return attempt.blockers === null;
        if (attempt.blockers === null) return row?.operation_id !== attempt.operation.operationId;
        return attempt.blockers?.some((blocker) =>
          blocker.operationId === row?.operation_id && !sameBlocker(row, blocker)) === true;
      });
    },

    bindRetainedPlacementRepairWake(service) {
      if (this.retainedPlacementRepairWakes.has(service)) return;
      const onCommit = (event) => this.wakeRetainedPlacementRepairs((attempt) =>
        shouldWake(attempt, event, service.db));
      const onReleased = () => this.wakeRetainedPlacementRepairs((attempt) => attempt.writePaused);
      service.on(PARTITION_SERVICE_EVENT.ENTRY_COMMITTED, onCommit);
      service.on(PARTITION_SERVICE_EVENT.WRITE_PATH_RELEASED, onReleased);
      this.retainedPlacementRepairWakes.set(service, () => {
        service.off(PARTITION_SERVICE_EVENT.ENTRY_COMMITTED, onCommit);
        service.off(PARTITION_SERVICE_EVENT.WRITE_PATH_RELEASED, onReleased);
      });
    },

    unbindRetainedPlacementRepairWake(service) {
      this.retainedPlacementRepairWakes.get(service)?.();
      this.retainedPlacementRepairWakes.delete(service);
    },

    clearRetainedPlacementRepairCustody() {
      for (const service of this.retainedPlacementRepairWakes.keys()) {
        this.unbindRetainedPlacementRepairWake(service);
      }
      this.retainedPlacementRepairs.clear();
    },
  });
}

export {assignRetainedPlacementRepairMethods};

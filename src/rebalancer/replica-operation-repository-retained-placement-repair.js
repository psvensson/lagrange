import {readPlacementCensus, readPlacementCopyOccupancy} from
  '../partition/partition-placement-admission-decision.js';
import {v4 as uuidv4} from 'uuid';
import {isDeepStrictEqual} from 'node:util';
import {PARTITION_SERVICE_EVENT} from '../partition/partition-service-constants.js';
import {PLACEMENT_CLEARING_TRIGGER, PLACEMENT_TRIGGER, PLACEMENT_OUTCOME, PLACEMENT_REFUSAL} from './replica-placement-owner-constants.js';
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
  if (attempt.clearingTrigger !== PLACEMENT_TRIGGER.LEDGER_COMMIT) return false;
  if (attempt.occupancy) {
    return !isDeepStrictEqual(attempt.occupancy,
      readPlacementCopyOccupancy(attempt.body.admissionStatement, readPlacementCensus(db)));
  }
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
          blockers: null, pending: null,
          clearingTrigger: PLACEMENT_TRIGGER.LEDGER_COMMIT};
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
        attempt.body = this.prepareRetainedPlacementRepair(attempt.operation);
        attempt.entryId = `retained-repair:${operation.operationId}:${uuidv4()}`;
      }
      const releaseSequence = this.retainedPlacementRepairReleaseSequence ?? 0;
      let answer;
      try {
        answer = await this.repairRetainedPlacement({
          entryId: attempt.entryId, body: attempt.body,
        });
      } catch (error) {
        this.logger.warn('Retained placement repair answer unavailable',
          {operationId: operation.operationId, error: error?.message || String(error)});
        return false;
      }
      if (this.isShuttingDownRequested() ||
          this.retainedPlacementRepairs.get(operation.operationId) !== attempt) return false;
      const result = answer?.placementResult;
      const committed = answer?.committed === true && answer.entryId === attempt.entryId &&
        Number.isSafeInteger(answer.logIndex) && answer.logIndex > 0 &&
        Number.isSafeInteger(answer.term) && answer.term > 0;
      const failureCode = answer?.failureCode;
      if (!committed) {
        if (Object.hasOwn(PLACEMENT_CLEARING_TRIGGER, failureCode)) {
          attempt.clearingTrigger = PLACEMENT_CLEARING_TRIGGER[failureCode];
          if (attempt.clearingTrigger === PLACEMENT_TRIGGER.WRITE_PATH_RELEASED &&
              (this.retainedPlacementRepairReleaseSequence ?? 0) > releaseSequence) {
            this.wakeRetainedPlacementRepairs((candidate) => candidate === attempt);
          }
        }
        return false;
      }
      if (result?.outcome === PLACEMENT_OUTCOME.ADMITTED &&
          isDeepStrictEqual(result.operationIds, [operation.operationId])) {
        const observation = await this.queryReplicaOperationPersistenceAuthorityObservation(
          attempt.operation, {requireAbsenceConfirmation: true});
        if (this.isShuttingDownRequested() ||
            this.retainedPlacementRepairs.get(operation.operationId) !== attempt) return false;
        const observed = observation?.operation;
        if (observed?.createdAt === attempt.operation.createdAt &&
            this.isReplicaOperationUpdateSatisfied(attempt.operation, observed)) {
          this.retainedPlacementRepairs.delete(operation.operationId);
          this.syncIncompleteOperationObservation(observed);
          return true;
        }
        if (observed) {
          this.retainedPlacementRepairs.delete(operation.operationId);
        } else if (!observation?.deferredOutcome) {
          attempt.entryId = null;
        }
        return false;
      }
      if (result?.outcome !== PLACEMENT_OUTCOME.REFUSED ||
          !Object.hasOwn(PLACEMENT_CLEARING_TRIGGER, result.reason)) return false;
      let blockers = null;
      let occupancy = null;
      if (result.reason === PLACEMENT_REFUSAL.PARTITION_BUSY ||
          result.reason === PLACEMENT_REFUSAL.LEDGER_TRANSITION_UNRESOLVED) {
        if (!Array.isArray(result.blockingOperations) || result.blockingOperations.length === 0 ||
            !isDeepStrictEqual(result.operationIds,
              result.blockingOperations.map((blocker) => blocker.operationId)) ||
            result.blockingOperations.some((blocker) =>
              typeof blocker.operationId !== 'string' || !Number.isFinite(blocker.createdAt) ||
              typeof blocker.workflowStep !== 'string' || blocker.completedAt !== null)) return false;
        blockers = result.blockingOperations;
      }
      if (result.reason === PLACEMENT_REFUSAL.SOURCE_AT_CAPACITY ||
          result.reason === PLACEMENT_REFUSAL.TARGET_AT_CAPACITY) {
        const statement = attempt.body.admissionStatement;
        const candidate = result.occupancy;
        if (!statement || !candidate ||
            candidate.copySourceNodeId !== statement.moves[0].copySourceNodeId ||
            candidate.targetNodeId !== statement.moves[0].targetNodeId ||
            candidate.sourceLimit !== statement.kSrcForClass || candidate.targetLimit !== statement.kTgt ||
            !Number.isSafeInteger(candidate.sourceOccupancy) || candidate.sourceOccupancy < 0 ||
            !Number.isSafeInteger(candidate.targetOccupancy) || candidate.targetOccupancy < 0) return false;
        occupancy = candidate;
      }
      attempt.blockers = blockers;
      attempt.occupancy = occupancy;
      attempt.clearingTrigger = PLACEMENT_CLEARING_TRIGGER[result.reason];
      if (attempt.clearingTrigger === null) {
        this.retainedPlacementRepairs.delete(operation.operationId);
      } else {
        attempt.entryId = null;
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
        .finally(() => {
          this.retainedPlacementRepairDrain = null;
          if ([...this.retainedPlacementRepairs.values()].some((attempt) => attempt.wakePending)) {
            this.wakeRetainedPlacementRepairs(() => false);
          }
        });
    },

    async redriveRetainedPlacementRepairs() {
      while (!this.isShuttingDownRequested()) {
        const attempts = [...this.retainedPlacementRepairs.values()]
          .filter((attempt) => attempt.wakePending);
        if (attempts.length === 0) return;
        for (const attempt of attempts) {
          // A clearing commit can arrive before the refused proposal's reply.
          // Join that reply first, then spend the retained wake on a fresh try.
          if (attempt.pending) await attempt.pending;
          if (this.retainedPlacementRepairs.get(attempt.operation.operationId) !== attempt) continue;
          attempt.wakePending = false;
          await this.repairRetainedOperation(attempt.operation);
        }
      }
    },

    observeRetainedPlacementRepairCommit(tableName, row) {
      this.wakeRetainedPlacementRepairs((attempt) => {
        if (tableName !== SYSTEM_TABLE_NAME.REPLICA_OPERATIONS) {
          return attempt.clearingTrigger === PLACEMENT_TRIGGER.LEADERSHIP_START ||
            attempt.clearingTrigger === PLACEMENT_TRIGGER.NODES_OR_FORMATION;
        }
        if (attempt.blockers === null) return row?.operation_id !== attempt.operation.operationId;
        return attempt.blockers?.some((blocker) =>
          blocker.operationId === row?.operation_id && !sameBlocker(row, blocker)) === true;
      });
    },

    bindRetainedPlacementRepairWake(service) {
      if (this.retainedPlacementRepairWakes.has(service)) return;
      const onCommit = (event) => this.wakeRetainedPlacementRepairs((attempt) =>
        shouldWake(attempt, event, service.db));
      const onReleased = () => {
        this.retainedPlacementRepairReleaseSequence =
          (this.retainedPlacementRepairReleaseSequence ?? 0) + 1;
        this.wakeRetainedPlacementRepairs((attempt) =>
          attempt.clearingTrigger === PLACEMENT_TRIGGER.WRITE_PATH_RELEASED);
      };
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

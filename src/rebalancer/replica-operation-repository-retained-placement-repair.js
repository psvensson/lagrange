import {readCommittedStatementOutcome} from '../partition/partition-committed-statement-outcome.js';
import {PARTITION_COMMITTED_STATEMENT_RECORD_STATE as RECORD} from
  '../partition/partition-committed-statement-outcome-constants.js';
import {LEDGER_PARTITION_ID, readPlacementCensus, readPlacementCopyOccupancy} from
  '../partition/partition-placement-admission-decision.js';
import {PLACEMENT_ADMISSION_ERROR} from '../partition/partition-placement-admission-constants.js';
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
  if (attempt.delegated || (attempt.nativeService && !attempt.nativeService.isLeader) ||
      event?.command?.entryId === attempt.entryId) return false;
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
    async acceptRetainedPlacementRepairRequest(service, payload, submitNative) {
      if (this.isShuttingDownRequested()) {
        return {success: false, failureCode: PLACEMENT_ADMISSION_ERROR.OWNER_UNAVAILABLE};
      }
      const operation = payload.body.operation;
      let attempt = this.retainedPlacementRepairs.get(operation.operationId);
      if (attempt && JSON.stringify(attempt.operation) !== JSON.stringify(operation)) {
        return {success: false, failureCode: PLACEMENT_ADMISSION_ERROR.BYTES};
      }
      if (!attempt) {
        attempt = {operation: copyOperationOutcomeData(operation), entryId: payload.entryId,
          body: payload.body, blockers: null, pending: null,
          clearingTrigger: PLACEMENT_TRIGGER.LEDGER_COMMIT};
        this.retainedPlacementRepairs.set(operation.operationId, attempt);
      }
      if (attempt.entryId === payload.entryId && attempt.body &&
          JSON.stringify(attempt.body) !== JSON.stringify(payload.body)) {
        return {success: false, failureCode: PLACEMENT_ADMISSION_ERROR.BYTES};
      }
      if (attempt.entryId === null && !attempt.pending) {
        attempt.entryId = payload.entryId;
        attempt.body = payload.body;
      }
      attempt.submitNative = submitNative;
      attempt.nativeService = service;
      const custody = {nodeId: service.nodeId, replicaId: service.replicaId,
        operationId: operation.operationId, createdAt: operation.createdAt,
        entryId: payload.entryId, bodyText: JSON.stringify(payload.body)};
      let answer;
      if (attempt.entryId !== payload.entryId) {
        const recorded = readCommittedStatementOutcome(service,
          service.getCommittedEntryKey({entryId: payload.entryId}));
        answer = recorded.state === RECORD.SETTLED ? await submitNative(payload) :
          {success: false, failureCode: PLACEMENT_ADMISSION_ERROR.REPAIR_PENDING};
      } else if (attempt.nativeAnswerPromise && attempt.pending) {
        answer = await attempt.nativeAnswerPromise;
      } else if (attempt.pending) {
        // The local caller's owning turn reached its own native ingress.
        // Attach the native completer; never join the turn awaiting us.
        attempt.nativeAnswerPromise = Promise.resolve(submitNative(payload));
        answer = await attempt.nativeAnswerPromise;
      } else {
        const completion = this.repairRetainedOperation(attempt.operation);
        answer = await attempt.nativeAnswerPromise;
        await completion;
      }
      return {...answer, repairCustody: custody};
    },

    async confirmRetainedOperationRow(operation) {
      const observation = await this.queryReplicaOperationPersistenceAuthorityObservation(
        operation, {requireAbsenceConfirmation: true});
      if (observation?.deferredOutcome) return {state: 'unavailable'};
      const observed = observation?.operation;
      if (!observed) return {state: 'absent'};
      return {state: observed.createdAt === operation.createdAt &&
        this.isReplicaOperationUpdateSatisfied(operation, observed) ? 'exact' : 'changed'};
    },

    async ensureRetainedOperationRow(operation) {
      const observation = await this.confirmRetainedOperationRow(operation);
      if (observation.state === 'exact') {
        const held = this.retainedPlacementRepairs.get(operation.operationId);
        if (held?.operation.createdAt === operation.createdAt && !held.pending) {
          this.retainedPlacementRepairs.delete(operation.operationId);
        }
        return true;
      }
      if (observation.state !== 'absent') return false;
      return this.repairRetainedOperation(operation);
    },

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
        const preparation = await this.prepareRetainedPlacementRepair(attempt.operation);
        if (this.isShuttingDownRequested() ||
            this.retainedPlacementRepairs.get(operation.operationId) !== attempt) return false;
        if (preparation?.state !== 'prepared') {
          const reason = preparation?.reason || preparation?.failureCode;
          if (Object.hasOwn(PLACEMENT_CLEARING_TRIGGER, reason)) {
            attempt.clearingTrigger = PLACEMENT_CLEARING_TRIGGER[reason];
          }
          return false;
        }
        attempt.body = preparation.body;
        attempt.expectedOwner = preparation.owner ?? null;
        attempt.entryId = `retained-repair:${operation.operationId}:${uuidv4()}`;
      }
      const releaseSequence = this.retainedPlacementRepairReleaseSequence ?? 0;
      let answer;
      try {
        const payload = {entryId: attempt.entryId, body: attempt.body};
        if (attempt.submitNative) {
          attempt.nativeAnswerPromise = Promise.resolve(attempt.submitNative(payload));
          answer = await attempt.nativeAnswerPromise;
        } else {
          answer = await this.repairRetainedPlacement(payload);
        }
      } catch (error) {
        this.logger.warn('Retained placement repair answer unavailable',
          {operationId: operation.operationId, error: error?.message || String(error)});
        return false;
      }
      if (this.isShuttingDownRequested() ||
          this.retainedPlacementRepairs.get(operation.operationId) !== attempt) return false;
      const custody = answer?.repairCustody;
      if (!attempt.submitNative && custody?.entryId === attempt.entryId &&
          custody.operationId === attempt.operation.operationId &&
          custody.createdAt === attempt.operation.createdAt &&
          custody.bodyText === JSON.stringify(attempt.body) &&
          typeof custody.nodeId === 'string' && typeof custody.replicaId === 'string' &&
          (!attempt.expectedOwner || (custody.nodeId === attempt.expectedOwner.nodeId &&
            custody.replicaId === attempt.expectedOwner.replicaId))) {
        attempt.delegated = custody;
      }
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
        if (predicate(attempt)) {
          attempt.delegated = null;
          attempt.wakePending = true;
        }
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
      for (const attempt of this.retainedPlacementRepairs.values()) {
        if (!attempt.pending && tableName === SYSTEM_TABLE_NAME.REPLICA_OPERATIONS &&
            row?.operation_id === attempt.operation.operationId) {
          void this.confirmRetainedOperationRow(attempt.operation).then((observed) => {
            if (!this.isShuttingDownRequested() &&
                this.retainedPlacementRepairs.get(attempt.operation.operationId) === attempt &&
                (observed.state === 'exact' || observed.state === 'changed')) {
              this.retainedPlacementRepairs.delete(attempt.operation.operationId);
            }
          }).catch(() => {});
        }
      }
      this.wakeRetainedPlacementRepairs((attempt) => {
        if (attempt.delegated) {
          return tableName === SYSTEM_TABLE_NAME.SERVICES &&
            row?.partition_id === LEDGER_PARTITION_ID && row.raft_role === 'leader' &&
            row.replica_id !== attempt.delegated.replicaId;
        }
        if (tableName !== SYSTEM_TABLE_NAME.REPLICA_OPERATIONS) {
          return attempt.clearingTrigger === PLACEMENT_TRIGGER.LEADERSHIP_START ||
            attempt.clearingTrigger === PLACEMENT_TRIGGER.NODES_OR_FORMATION;
        }
        if (attempt.blockers === null) return false;
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
          (!attempt.nativeService || attempt.nativeService.isLeader) &&
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

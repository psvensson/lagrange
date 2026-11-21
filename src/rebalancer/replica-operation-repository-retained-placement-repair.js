import {unavailableRepairPreparation, unavailableRepairOwnerReply} from
  '../partition/partition-placement-repair-preparation-result.js';
import {PARTITION_WRITE_LEADERSHIP_REFUSAL} from '../partition/partition-write-kernel.js';
import {REPAIR_ANSWER_STATE, isCommittedRepairAnswer, custodyMatches,
  readRetainedRepairRefusal} from './replica-operation-retained-repair-answer.js';
import {RAFT_ROLE} from '../raft/constants.js';
import {readCommittedStatementOutcome} from '../partition/partition-committed-statement-outcome.js';
import {PARTITION_COMMITTED_STATEMENT_RECORD_STATE as RECORD} from
  '../partition/partition-committed-statement-outcome-constants.js';
import {LEDGER_PARTITION_ID, readPlacementCensus, readPlacementCopyOccupancy} from
  '../partition/partition-placement-admission-decision.js';
import {REPAIR_PREPARATION_STATE as PREPARATION, PLACEMENT_ADMISSION_ERROR} from '../partition/partition-placement-admission-constants.js';
import {v4 as uuidv4} from 'uuid';
import {isDeepStrictEqual} from 'node:util';
import {PARTITION_SERVICE_EVENT} from '../partition/partition-service-constants.js';
import {PLACEMENT_CLEARING_TRIGGER, PLACEMENT_TRIGGER, PLACEMENT_OUTCOME} from './replica-placement-owner-constants.js';
import {SYSTEM_TABLE_NAME} from '../bootstrap/system-table-schemas-constants.js';
import {copyOperationOutcomeData} from './replica-operation-update-outcome.js';

const ROW_STATE = Object.freeze({UNAVAILABLE: 'unavailable', ABSENT: 'absent',
  EXACT: 'exact', CHANGED: 'changed'});
const READ_BLOCKER_SQL = 'SELECT created_at, workflow_step, completed_at FROM replica_operations ' +
  'WHERE operation_id = ?';
const REPAIR_LOG = Object.freeze({ANSWER_UNAVAILABLE: 'Retained placement repair answer unavailable',
  DEFERRED: 'Retained placement repair deferred'});

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
      readPlacementCopyOccupancy(attempt.body.copyPolicy.statement, readPlacementCensus(db)));
  }
  if (!attempt.blockers) return true;
  return attempt.blockers.some((blocker) =>
    !sameBlocker(db.prepare(READ_BLOCKER_SQL).get(blocker.operationId), blocker));
}

const INVALID_REPAIR_PORT = 'Retained placement repair owner port must be a function';

function repairPort(port, unavailable) {
  if (port === undefined) return unavailable;
  if (typeof port !== 'function') throw new TypeError(INVALID_REPAIR_PORT);
  return port;
}

function createRetainedPlacementRepairPorts(options) {
  return {
    repairRetainedPlacement: repairPort(options.repairRetainedPlacement,
      unavailableRepairOwnerReply),
    prepareRetainedPlacementRepair: repairPort(options.prepareRetainedPlacementRepair,
      () => unavailableRepairPreparation(PLACEMENT_ADMISSION_ERROR.OWNER_UNAVAILABLE)),
  };
}

function receiverChanged(attempt, tableName, row) {
  if (!attempt.expectedOwner || !row) return false;
  return [tableName === SYSTEM_TABLE_NAME.SERVICES, row.partition_id === LEDGER_PARTITION_ID,
    row.raft_role === RAFT_ROLE.LEADER, typeof row.node_id === 'string',
    typeof row.replica_id === 'string', row.replica_id !== attempt.expectedOwner.replicaId].every(Boolean);
}

function retainedCustodyOf(service, payload, attempt, attempts) {
  const operation = payload.body.operation;
  const ownsIncoming = attempts.get(operation.operationId) === attempt &&
    service.isLeader && attempt.nativeService === service &&
    attempt.entryId === payload.entryId && isDeepStrictEqual(attempt.body, payload.body);
  return ownsIncoming ? {nodeId: service.nodeId, replicaId: service.replicaId,
    operationId: operation.operationId, createdAt: operation.createdAt,
    entryId: payload.entryId, bodyText: JSON.stringify(payload.body)} : null;
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
      attempt.nativeService = service;
      attempt.expectedOwner = {nodeId: service.nodeId, replicaId: service.replicaId};
      attempt.delegated = null;
      const answer = await this.completeIncomingRetainedRepair(
        service, payload, attempt, submitNative);
      const custody = retainedCustodyOf(service, payload, attempt, this.retainedPlacementRepairs);
      return custody === null ? answer : {...answer, repairCustody: custody};
    },

    async completeIncomingRetainedRepair(service, payload, attempt, submitNative) {
      if (attempt.entryId !== payload.entryId) {
        if (attempt.pending) await attempt.pending;
        else await this.repairRetainedOperation(attempt.operation);
        if (this.retainedPlacementRepairs.get(attempt.operation.operationId) !== attempt ||
            attempt.entryId === null) {
          if (this.retainedPlacementRepairs.get(attempt.operation.operationId) === attempt) {
            this.retainedPlacementRepairs.delete(attempt.operation.operationId);
          }
          return this.acceptRetainedPlacementRepairRequest(service, payload, submitNative);
        }
        const recorded = readCommittedStatementOutcome(service,
          service.getCommittedEntryKey({entryId: payload.entryId}));
        if (recorded.state === RECORD.SETTLED) {
          return submitNative(payload);
        } else {
          return {success: false, failureCode: PLACEMENT_ADMISSION_ERROR.REPAIR_PENDING};
        }
      } else if (attempt.nativeAnswerPromise && attempt.pending) {
        return attempt.nativeAnswerPromise;
      } else if (attempt.pending) {
        // The local caller's owning turn reached its own native ingress.
        // Attach the native completer; never join the turn awaiting us.
        attempt.nativeAnswerPromise = Promise.resolve(submitNative(payload));
        return attempt.nativeAnswerPromise;
      } else {
        await this.repairRetainedOperation(attempt.operation);
        return attempt.nativeAnswerPromise;
      }
    },

    async confirmRetainedOperationRow(operation) {
      const observation = await this.queryReplicaOperationPersistenceAuthorityObservation(
        operation, {requireAbsenceConfirmation: true});
      if (observation?.deferredOutcome) return {state: ROW_STATE.UNAVAILABLE};
      const observed = observation?.operation;
      if (observed === null) return {state: ROW_STATE.ABSENT};
      if (!observed) return {state: ROW_STATE.UNAVAILABLE};
      return {state: observed.createdAt === operation.createdAt &&
        this.isReplicaOperationUpdateSatisfied(operation, observed) ?
        ROW_STATE.EXACT : ROW_STATE.CHANGED};
    },

    async ensureRetainedOperationRow(operation) {
      const observation = await this.confirmRetainedOperationRow(operation);
      if (observation.state === ROW_STATE.EXACT) {
        const held = this.retainedPlacementRepairs.get(operation.operationId);
        if (held?.operation.createdAt === operation.createdAt && !held.pending) {
          this.retainedPlacementRepairs.delete(operation.operationId);
        }
        return true;
      }
      if (observation.state !== ROW_STATE.ABSENT) return false;
      return this.repairRetainedOperation(operation);
    },

    async repairRetainedOperation(operation) {
      if (this.isShuttingDownRequested()) return false;
      let attempt = this.retainedPlacementRepairs.get(operation.operationId);
      if (!attempt) {
        attempt = {operation: copyOperationOutcomeData(operation), entryId: null,
          blockers: null, pending: null,
          clearingTrigger: PLACEMENT_TRIGGER.LEDGER_COMMIT};
        this.retainedPlacementRepairs.set(operation.operationId, attempt);
      }
      if (!isDeepStrictEqual(attempt.operation, operation)) return false;
      if (attempt.pending) return attempt.pending;
      if (attempt.delegated) return false;
      attempt.nativeAnswerPromise = null;
      const pending = Promise.resolve().then(() =>
        this.submitRetainedPlacementRepairAttempt(operation, attempt)).finally(() => {
        if (attempt.pending === pending) attempt.pending = null;
      });
      attempt.pending = pending;
      return pending;
    },

    retainedRepairAttemptIsCurrent(attempt) {
      return !this.isShuttingDownRequested() &&
        this.retainedPlacementRepairs.get(attempt.operation.operationId) === attempt;
    },

    async prepareRetainedRepairAttempt(attempt) {
      if (!this.retainedRepairAttemptIsCurrent(attempt)) return false;
      if (attempt.entryId !== null) return true;
      const preparation = await this.prepareRetainedPlacementRepair(attempt.operation);
      if (!this.retainedRepairAttemptIsCurrent(attempt)) return false;
      if (preparation?.state !== PREPARATION.PREPARED) {
        const reason = preparation?.reason || preparation?.failureCode;
        if (Object.hasOwn(PLACEMENT_CLEARING_TRIGGER, reason)) {
          attempt.clearingTrigger = PLACEMENT_CLEARING_TRIGGER[reason];
        }
        return false;
      }
      attempt.body = preparation.body;
      attempt.expectedOwner = preparation.owner;
      attempt.entryId = `retained-repair:${attempt.operation.operationId}:${uuidv4()}`;
      return true;
    },

    async submitRetainedPlacementRepairAttempt(_operation, attempt) {
      if (!await this.prepareRetainedRepairAttempt(attempt)) return false;
      if (!this.retainedRepairAttemptIsCurrent(attempt)) return false;
      const releaseSequence = this.retainedPlacementRepairReleaseSequence ?? 0;
      const answer = await this.sendRetainedRepairAttempt(attempt);
      if (!this.retainedRepairAttemptIsCurrent(attempt)) return false;
      const committed = isCommittedRepairAnswer(answer, attempt);
      if (answer?.committed === true && !committed) return false;
      this.recordRetainedRepairCustody(attempt, answer);
      if (!committed) {
        return this.retainUncommittedRepairAnswer(attempt, answer, releaseSequence);
      }
      const result = answer.placementResult;
      return result.outcome === PLACEMENT_OUTCOME.ADMITTED ?
        this.confirmAdmittedRetainedRepair(attempt) :
        this.retainCommittedRepairRefusal(attempt, result);
    },

    async sendRetainedRepairAttempt(attempt) {
      let answer;
      try {
        answer = await this.repairRetainedPlacement({entryId: attempt.entryId, body: attempt.body});
      } catch (error) {
        this.logger.warn(REPAIR_LOG.ANSWER_UNAVAILABLE,
          {operationId: attempt.operation.operationId, error: error?.message || String(error)});
        answer = {success: false, failureCode: PARTITION_WRITE_LEADERSHIP_REFUSAL.OUTCOME_UNKNOWN};
      }
      return answer;
    },

    recordRetainedRepairCustody(attempt, answer) {
      const custody = answer?.repairCustody;
      const locallyOwned = attempt.nativeService?.isLeader === true &&
        attempt.nativeService.replicaId === custody?.replicaId;
      if (!locallyOwned && custodyMatches(custody, attempt)) attempt.delegated = custody;
    },

    retainUncommittedRepairAnswer(attempt, answer, releaseSequence) {
      if (!Object.hasOwn(PLACEMENT_CLEARING_TRIGGER, answer?.failureCode)) return false;
      attempt.clearingTrigger = PLACEMENT_CLEARING_TRIGGER[answer.failureCode];
      const released = (this.retainedPlacementRepairReleaseSequence ?? 0) > releaseSequence;
      if (released && attempt.clearingTrigger === PLACEMENT_TRIGGER.WRITE_PATH_RELEASED) {
        this.wakeRetainedPlacementRepairs((candidate) => candidate === attempt);
      }
      return false;
    },

    async confirmAdmittedRetainedRepair(attempt) {
      const observation = await this.queryReplicaOperationPersistenceAuthorityObservation(
        attempt.operation, {requireAbsenceConfirmation: true});
      if (!this.retainedRepairAttemptIsCurrent(attempt)) return false;
      const observed = observation?.operation;
      const exact = observed?.createdAt === attempt.operation.createdAt &&
        this.isReplicaOperationUpdateSatisfied(attempt.operation, observed);
      if (observed) this.retainedPlacementRepairs.delete(attempt.operation.operationId);
      else if (observed === null && !observation?.deferredOutcome) attempt.entryId = null;
      if (exact) this.syncIncompleteOperationObservation(observed);
      return exact;
    },

    retainCommittedRepairRefusal(attempt, result) {
      const refusal = readRetainedRepairRefusal(result, attempt);
      if (refusal.state === REPAIR_ANSWER_STATE.UNKNOWN) return false;
      attempt.blockers = refusal.blockers;
      attempt.occupancy = refusal.occupancy;
      attempt.clearingTrigger = refusal.clearingTrigger;
      if (refusal.clearingTrigger === null) {
        this.retainedPlacementRepairs.delete(attempt.operation.operationId);
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
        .catch((error) => this.logger.warn(REPAIR_LOG.DEFERRED,
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
          if (this.retainedPlacementRepairs.get(attempt.operation.operationId) !== attempt) {
            continue;
          }
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
                (observed.state === ROW_STATE.EXACT || observed.state === ROW_STATE.CHANGED)) {
              this.retainedPlacementRepairs.delete(attempt.operation.operationId);
            }
          }).catch(() => {});
        }
      }
      this.wakeRetainedPlacementRepairs((attempt) =>
        this.shouldWakeRetainedRepairObservation(attempt, tableName, row));
    },

    shouldWakeRetainedRepairObservation(attempt, tableName, row) {
      if (receiverChanged(attempt, tableName, row)) {
        attempt.expectedOwner = {nodeId: row.node_id, replicaId: row.replica_id};
        return true;
      }
      if (attempt.delegated) return false;
      if (tableName !== SYSTEM_TABLE_NAME.REPLICA_OPERATIONS) {
        return attempt.clearingTrigger === PLACEMENT_TRIGGER.LEADERSHIP_START ||
            attempt.clearingTrigger === PLACEMENT_TRIGGER.NODES_OR_FORMATION;
      }
      if (!attempt.blockers) return false;
      return attempt.blockers?.some((blocker) =>
        blocker.operationId === row?.operation_id && !sameBlocker(row, blocker)) === true;
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

export {assignRetainedPlacementRepairMethods, createRetainedPlacementRepairPorts};

import {assignRetainedRepairReadRetryMethods} from './replica-operation-retained-repair-read-retry.js';
import {assignRetainedRepairIngressMethods} from './replica-operation-retained-repair-ingress.js';
import {RETAINED_REPAIR_DECISION as DECISION, RETAINED_REPAIR_MODE as MODE,
  retainedRepairRecord, materializeRepairContention} from './replica-operation-retained-repair-record.js';
import {matchesRetainedRepairObservation} from './replica-operation-retained-repair-reply.js';
import {REPAIR_AUTHORITY, REPAIR_READ_SCOPE, readRetainedRepairAuthority} from
  './replica-operation-retained-repair-authority.js';
import {retainedPlacementContentionDecision, retainedPlacementEntityDecision} from
  '../partition/partition-placement-retained-repair.js';
import {ENTITY_ADMISSION_STATE} from '../partition/partition-placement-admission-decision.js';
import {REPAIR_OBSERVATION as OBSERVATION, peerObservationMayClear, ownRowObservation,
  recordRepairObservation, takeRepairObservations, observationAllowsRetry} from
  './replica-operation-retained-repair-observation.js';
import {unavailableRepairPreparation, unavailableRepairOwnerReply} from
  '../partition/partition-placement-repair-preparation-result.js';
import {PARTITION_WRITE_LEADERSHIP_REFUSAL} from '../partition/partition-write-kernel.js';
import {REPAIR_ANSWER_STATE, isCommittedRepairAnswer, custodyMatches,
  readRetainedRepairRefusal} from './replica-operation-retained-repair-answer.js';
import {LEDGER_PARTITION_ID, readPlacementCensus, readPlacementCopyOccupancy} from
  '../partition/partition-placement-admission-decision.js';
import {REPAIR_PREPARATION_STATE as PREPARATION, PLACEMENT_ADMISSION_ERROR} from '../partition/partition-placement-admission-constants.js';
import {v4 as uuidv4} from 'uuid';
import {isDeepStrictEqual} from 'node:util';
import {PARTITION_SERVICE_EVENT} from '../partition/partition-service-constants.js';
import {PLACEMENT_CLEARING_TRIGGER, PLACEMENT_TRIGGER, PLACEMENT_OUTCOME} from './replica-placement-owner-constants.js';
import {SYSTEM_TABLE_NAME} from '../bootstrap/system-table-schemas-constants.js';

const READ_BLOCKER_SQL = 'SELECT created_at, workflow_step, completed_at FROM replica_operations ' +
  'WHERE operation_id = ?';
const REPAIR_LOG = Object.freeze({ANSWER_UNAVAILABLE: 'Retained placement repair answer unavailable',
  DEFERRED: 'Retained placement repair deferred'});

// One immutable process-retained envelope per operation; no durable reconstruction
// promise. Owned commits/CDC and read-dependency backoff trigger revalidation,
// never substitute admission authority. Every write reaches native apply.
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
    resolveRetainedPlacementRepairRoute: repairPort(options.resolveRetainedPlacementRepairRoute,
      () => null),
    prepareRetainedPlacementRepair: repairPort(options.prepareRetainedPlacementRepair,
      () => unavailableRepairPreparation(PLACEMENT_ADMISSION_ERROR.OWNER_UNAVAILABLE)),
  };
}

function assignRetainedPlacementRepairMethods(Repository) {
  Object.assign(Repository.prototype, {
    async ensureRetainedOperationRow(operation) {
      return this.repairRetainedOperation(operation);
    },

    async repairRetainedOperation(operation) {
      if (this.isShuttingDownRequested()) return false;
      let attempt = this.retainedPlacementRepairs.get(operation.operationId);
      if (!attempt) {
        attempt = retainedRepairRecord(operation, null, null);
        this.retainedPlacementRepairs.set(operation.operationId, attempt);
      }
      if (!isDeepStrictEqual(attempt.operation, operation)) return false;
      if (attempt.pending) return attempt.pending;
      if (attempt.delegated) return false;
      return this.runRetainedRepairDecision(attempt, () =>
        this.retryRetainedRepairDecision(attempt, MODE.RETRY));
    },

    runRetainedRepairDecision(attempt, decide) {
      if (attempt.pending) return attempt.pending;
      const pending = Promise.resolve().then(decide).finally(() => {
        if (attempt.pending === pending) attempt.pending = null;
      });
      attempt.pending = pending;
      return pending;
    },

    async retryRetainedRepairDecision(attempt, mode) {
      if (mode === MODE.JOIN) return this.joinRetainedRepairDecision(attempt);
      const scope = this.retainedRepairReadScope(mode);
      const decision = await this.readRetainedRepairDecision(attempt, scope);
      attempt.lastDecision = decision;
      if (decision.state === DECISION.UNAVAILABLE) {
        const observations = this.retainedRepairRetryObservation(mode);
        this.scheduleRetainedRepairReadRetry(attempt, observations);
        return false;
      }
      if (decision.state !== DECISION.ABSENT || mode === MODE.CONFIRM || mode === MODE.REFRESH) {
        return this.settleRetainedRepairDecision(attempt, decision);
      }
      return this.resolveObservedRetainedRepair(attempt, decision.term);
    },

    async joinRetainedRepairDecision(attempt) {
      const satisfied = await this.submitRetainedPlacementRepairAttempt(attempt.operation, attempt);
      if (satisfied || !this.retainedRepairAttemptIsCurrent(attempt)) return satisfied;
      if (attempt.lastAnswer?.committed !== true) return false;
      const current = await this.readRetainedRepairDecision(attempt, REPAIR_READ_SCOPE.CENSUS);
      attempt.lastDecision = current;
      if (current.state === DECISION.UNAVAILABLE) {
        this.scheduleRetainedRepairReadRetry(attempt, OBSERVATION.CONTENTION);
        return false;
      }
      return this.settleRetainedRepairDecision(attempt, current);
    },

    async resolveObservedRetainedRepair(attempt, term) {
      const resolvingPinned = attempt.entryId !== null;
      const satisfied = await this.submitRetainedRepairAtTerm(attempt, term);
      if (satisfied || !this.retainedRepairAttemptIsCurrent(attempt)) return satisfied;
      if (!resolvingPinned || attempt.entryId !== null) return false;
      // The owned observation survives resolution of the original unknown turn.
      // Its old refusal never authorizes a successor: read current contention once.
      const current = await this.readRetainedRepairDecision(attempt, REPAIR_READ_SCOPE.CENSUS);
      attempt.lastDecision = current;
      if (current.state !== DECISION.ABSENT) {
        return this.settleRetainedRepairDecision(attempt, current);
      }
      return this.submitRetainedRepairAtTerm(attempt, current.term);
    },

    async submitRetainedRepairAtTerm(attempt, term) {
      attempt.nativeAnswerPromise = null;
      attempt.nativeIngressTerm = term;
      try {
        return await this.submitRetainedPlacementRepairAttempt(attempt.operation, attempt);
      } finally {
        attempt.nativeIngressTerm = null;
      }
    },

    retainedRepairReadScope(mode) {
      if (mode === MODE.REFRESH) return REPAIR_READ_SCOPE.CENSUS;
      return mode === MODE.CONFIRM || mode === MODE.HANDOFF ?
        REPAIR_READ_SCOPE.SUBJECT : REPAIR_READ_SCOPE.CURRENT;
    },

    retainedRepairRetryObservation(mode) {
      if (mode === MODE.CONFIRM) return OBSERVATION.OWN_ROW;
      if (mode === MODE.REFRESH) return OBSERVATION.CONTENTION;
      return mode === MODE.HANDOFF ? OBSERVATION.LEADER : OBSERVATION.CLEARING;
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
      attempt.observedRoute = this.resolveRetainedPlacementRepairRoute();
      attempt.entryId = `retained-repair:${attempt.operation.operationId}:${uuidv4()}`;
      return true;
    },

    async submitRetainedPlacementRepairAttempt(_operation, attempt) {
      if (!await this.prepareRetainedRepairAttempt(attempt)) return false;
      if (!this.retainedRepairAttemptIsCurrent(attempt)) return false;
      const releaseSequence = this.retainedPlacementRepairReleaseSequence ?? 0;
      attempt.lastDecision = {...attempt.lastDecision, state: DECISION.PENDING};
      const answer = await this.sendRetainedRepairAttempt(attempt);
      if (!this.retainedRepairAttemptIsCurrent(attempt)) return false;
      attempt.lastAnswer = answer;
      if (matchesRetainedRepairObservation(answer, attempt)) {
        this.recordRetainedRepairCustody(attempt, answer);
        return this.consumeRetainedRepairObservation(attempt, answer.retainedRepairObservation);
      }
      const committed = isCommittedRepairAnswer(answer, attempt);
      if (answer?.committed === true && !committed) return false;
      if (committed) {
        attempt.minimumLedgerIndex = Math.max(attempt.minimumLedgerIndex, answer.logIndex);
        attempt.minimumLedgerTerm = Math.max(attempt.minimumLedgerTerm, answer.term);
      }
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
        attempt.nativeIngressExpected = true;
        answer = await this.repairRetainedPlacement({entryId: attempt.entryId, body: attempt.body});
      } catch (error) {
        this.logger.warn(REPAIR_LOG.ANSWER_UNAVAILABLE,
          {operationId: attempt.operation.operationId, error: error?.message || String(error)});
        answer = {success: false, failureCode: PARTITION_WRITE_LEADERSHIP_REFUSAL.OUTCOME_UNKNOWN};
      } finally {
        attempt.nativeIngressExpected = false;
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
      const decision = await this.readRetainedRepairDecision(attempt, REPAIR_READ_SCOPE.SUBJECT);
      if (!this.retainedRepairAttemptIsCurrent(attempt)) return false;
      attempt.lastDecision = decision;
      if (decision.state === DECISION.UNAVAILABLE) {
        this.scheduleRetainedRepairReadRetry(attempt, OBSERVATION.OWN_ROW);
        return false;
      }
      if (decision.state === DECISION.ABSENT) {
        attempt.entryId = null;
        attempt.delegated = null;
      }
      return this.settleRetainedRepairDecision(attempt, decision);
    },

    retainCommittedRepairRefusal(attempt, result) {
      const refusal = readRetainedRepairRefusal(result, attempt);
      if (refusal.state === REPAIR_ANSWER_STATE.UNKNOWN) return false;
      attempt.lastDecision = {...attempt.lastDecision, state: DECISION.CONTENDED, result};
      attempt.blockers = refusal.blockers;
      attempt.occupancy = refusal.occupancy;
      attempt.clearingTrigger = refusal.clearingTrigger;
      if (refusal.clearingTrigger === null) {
        this.retainedPlacementRepairs.delete(attempt.operation.operationId);
      } else {
        attempt.entryId = null;
        attempt.delegated = null;
      }
      return false;
    },

    wakeRetainedPlacementRepairs(predicate = () => true, kind = OBSERVATION.CLEARING) {
      if (this.isShuttingDownRequested()) return;
      for (const attempt of this.retainedPlacementRepairs.values()) {
        if (predicate(attempt)) {
          if (attempt.retryObservations !== OBSERVATION.NONE) {
            attempt.retryObservations |= kind;
          } else {
            recordRepairObservation(attempt, kind);
          }
        }
      }
      if (this.retainedPlacementRepairDrain) return;
      this.retainedPlacementRepairDrain = Promise.resolve()
        .then(() => this.redriveRetainedPlacementRepairs())
        .catch((error) => this.logger.warn(REPAIR_LOG.DEFERRED,
          {error: error?.message || String(error)}))
        .finally(() => {
          this.retainedPlacementRepairDrain = null;
          if ([...this.retainedPlacementRepairs.values()].some((attempt) => attempt.observations)) {
            this.wakeRetainedPlacementRepairs(() => false);
          }
        });
    },

    async redriveRetainedPlacementRepairs() {
      while (!this.isShuttingDownRequested()) {
        const attempts = [...this.retainedPlacementRepairs.values()]
          .filter((attempt) => attempt.observations);
        if (attempts.length === 0) return;
        for (const attempt of attempts) {
          // A clearing commit can arrive before the refused proposal's reply.
          // Join that reply first, then spend the retained wake on a fresh try.
          while (attempt.pending) await attempt.pending;
          if (this.retainedPlacementRepairs.get(attempt.operation.operationId) !== attempt) {
            continue;
          }
          const observations = takeRepairObservations(attempt);
          await this.revalidateRetainedRepairObservation(attempt, observations);
        }
      }
    },

    async revalidateRetainedRepairObservation(attempt, observations) {
      const mode = this.retainedRepairObservationMode(attempt, observations);
      await this.runRetainedRepairDecision(attempt, () =>
        this.retryRetainedRepairDecision(attempt, mode));
    },

    retainedRepairObservationMode(attempt, observations) {
      if ((observations & OBSERVATION.LEADER) !== 0) return MODE.HANDOFF;
      if ((observations & OBSERVATION.CONTENTION) !== 0) return MODE.REFRESH;
      if (!observationAllowsRetry(observations)) return MODE.CONFIRM;
      return attempt.delegated ? MODE.JOIN : MODE.RETRY;
    },

    async readRetainedRepairDecision(attempt, scope) {
      const authority = await readRetainedRepairAuthority(this, attempt, scope);
      if (!this.retainedRepairAttemptIsCurrent(attempt) ||
          authority.state !== REPAIR_AUTHORITY.READY) return {state: DECISION.UNAVAILABLE};
      this.completeRetainedRepairReadDependency(attempt);
      attempt.minimumLedgerIndex =
        Math.max(attempt.minimumLedgerIndex, authority.witness.appliedIndex);
      attempt.minimumLedgerTerm = Math.max(attempt.minimumLedgerTerm, authority.witness.term);
      const row = authority.rows.find((candidate) =>
        candidate.operation_id === attempt.operation.operationId);
      if (row) {
        const operation = this.rowToOperation(row);
        const exact = operation.createdAt === attempt.operation.createdAt &&
          this.isReplicaOperationUpdateSatisfied(attempt.operation, operation);
        return {state: exact ? DECISION.EXACT : DECISION.CHANGED, operation,
          observedTerm: authority.witness.term};
      }
      const decision = authority.completeCensus ?
        retainedPlacementContentionDecision(
          attempt.operation, attempt.body.copyPolicy, authority.census) :
        retainedPlacementEntityDecision(attempt.operation, authority.census);
      if (decision.state === ENTITY_ADMISSION_STATE.REFUSED) {
        return {state: DECISION.CONTENDED, observedTerm: authority.witness.term,
          result: materializeRepairContention(decision.result, authority.rows)};
      }
      return {state: DECISION.ABSENT, term: authority.witness.term,
        observedTerm: authority.witness.term};
    },

    settleRetainedRepairDecision(attempt, decision) {
      if (!this.retainedRepairAttemptIsCurrent(attempt)) return false;
      switch (decision.state) {
      case DECISION.EXACT:
        this.syncIncompleteOperationObservation(decision.operation);
        this.retainedPlacementRepairs.delete(attempt.operation.operationId);
        return true;
      case DECISION.CHANGED:
        this.retainedPlacementRepairs.delete(attempt.operation.operationId);
        return false;
      case DECISION.CONTENDED:
        this.retainObservedRepairContention(attempt, decision.result);
        return false;
      case DECISION.UNAVAILABLE:
        this.scheduleRetainedRepairReadRetry(attempt, OBSERVATION.CLEARING);
        attempt.clearingTrigger =
          PLACEMENT_CLEARING_TRIGGER[PLACEMENT_ADMISSION_ERROR.OWNER_UNAVAILABLE];
        return false;
      default:
        return false;
      }
    },

    retainObservedRepairContention(attempt, result) {
      const refusal = readRetainedRepairRefusal(result, attempt);
      if (refusal.state !== REPAIR_ANSWER_STATE.KNOWN) return;
      attempt.blockers = refusal.blockers;
      attempt.occupancy = refusal.occupancy;
      attempt.clearingTrigger = refusal.clearingTrigger;
    },

    async consumeRetainedRepairObservation(attempt, observation) {
      attempt.lastDecision = observation;
      switch (observation.state) {
      case DECISION.EXACT:
      case DECISION.CHANGED:
        return this.retryRetainedRepairDecision(attempt, MODE.CONFIRM);
      case DECISION.CONTENDED:
        this.retainObservedRepairContention(attempt, observation.result);
        return false;
      case DECISION.UNAVAILABLE:
        if (!attempt.delegated) this.scheduleRetainedRepairReadRetry(attempt, OBSERVATION.OWN_ROW);
        attempt.clearingTrigger =
          PLACEMENT_CLEARING_TRIGGER[PLACEMENT_ADMISSION_ERROR.OWNER_UNAVAILABLE];
        return false;
      default:
        return false;
      }
    },

    observeRetainedPlacementRepairCommit(tableName, row) {
      for (const attempt of this.retainedPlacementRepairs.values()) {
        const kind = this.retainedRepairObservationKind(attempt, tableName, row);
        if (kind !== OBSERVATION.NONE) {
          this.wakeRetainedPlacementRepairs((candidate) => candidate === attempt, kind);
        }
      }
    },

    retainedRepairObservationKind(attempt, tableName, row) {
      if (ownRowObservation(attempt, tableName, row)) return OBSERVATION.OWN_ROW;
      if (this.retainedRepairPublishedRouteChanged(attempt, tableName, row)) {
        return OBSERVATION.LEADER;
      }
      if (tableName !== SYSTEM_TABLE_NAME.REPLICA_OPERATIONS) {
        if (attempt.delegated) return OBSERVATION.NONE;
        return attempt.clearingTrigger === PLACEMENT_TRIGGER.LEADERSHIP_START ||
          attempt.clearingTrigger === PLACEMENT_TRIGGER.NODES_OR_FORMATION ?
          OBSERVATION.CLEARING : OBSERVATION.NONE;
      }
      const blockerCleared = attempt.blockers?.some((blocker) =>
        blocker.operationId === row?.operation_id && !sameBlocker(row, blocker)) === true;
      const possiblyClearedWhilePending = (attempt.pending || attempt.occupancy) &&
        peerObservationMayClear(attempt, row);
      return blockerCleared || possiblyClearedWhilePending ?
        OBSERVATION.CLEARING : OBSERVATION.NONE;
    },

    retainedRepairPublishedRouteChanged(attempt, tableName, row) {
      const relevant = tableName === SYSTEM_TABLE_NAME.PARTITIONS ||
        tableName === SYSTEM_TABLE_NAME.SERVICES;
      if (!relevant || row?.partition_id !== LEDGER_PARTITION_ID) return false;
      const route = this.resolveRetainedPlacementRepairRoute();
      if (route === null) {
        // Incomplete/ambiguous publication cannot revoke actual receiver custody.
        attempt.routeUnavailable = true;
        return false;
      }
      const previous = attempt.observedRoute;
      const owner = {nodeId: route.nodeId, replicaId: route.replicaId};
      const changed = attempt.routeUnavailable ||
        !isDeepStrictEqual(owner, attempt.expectedOwner) ||
        (previous !== null && !isDeepStrictEqual(route, previous));
      attempt.observedRoute = route;
      attempt.routeUnavailable = false;
      if (changed) attempt.expectedOwner = owner;
      return changed;
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
      this.cancelRetainedRepairReadRetry();
      for (const service of this.retainedPlacementRepairWakes.keys()) {
        this.unbindRetainedPlacementRepairWake(service);
      }
      this.retainedPlacementRepairs.clear();
    },
  });
  assignRetainedRepairIngressMethods(Repository);
  assignRetainedRepairReadRetryMethods(Repository);
}

export {assignRetainedPlacementRepairMethods, createRetainedPlacementRepairPorts};

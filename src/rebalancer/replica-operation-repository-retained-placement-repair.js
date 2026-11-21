import {assignRetainedRepairReadRetryMethods} from './replica-operation-retained-repair-read-retry.js';
import {assignRetainedRepairIngressMethods} from './replica-operation-retained-repair-ingress.js';
import {assignRetainedRepairWakeMethods} from './replica-operation-retained-repair-wake.js';
import {RETAINED_REPAIR_DECISION as DECISION, RETAINED_REPAIR_MODE as MODE, PROPOSING_MODES,
  RETAINED_REPAIR_ORIGIN as ORIGIN, RETAINED_REPAIR_BINDING as BINDING,
  RETAINED_REPAIR_CUSTODY as CUSTODY, RETAINED_REPAIR_ENTRY as ENTRY,
  RETAINED_REPAIR_NATIVE as NATIVE, RETAINED_REPAIR_NATIVE_FENCE as FENCE,
  RETAINED_REPAIR_NATIVE_ANSWER as NATIVE_ANSWER, RETAINED_REPAIR_DECISION_RUN as RUN,
  SELF_CUSTODY, NATIVE_IDLE, IDLE_DECISION, pinnedEntry, settledEntry,
  entryBody, retainedRepairRecord, materializeRepairContention} from './replica-operation-retained-repair-record.js';
import {RETAINED_REPAIR_DISCLAIM, matchesRetainedRepairObservation} from
  './replica-operation-retained-repair-reply.js';
import {REPAIR_AUTHORITY, REPAIR_AUTHORITY_REFUSAL, REPAIR_READ_SCOPE,
  TRANSIENT_AUTHORITY_REFUSALS, readRetainedRepairAuthority} from
  './replica-operation-retained-repair-authority.js';
import {retainedPlacementContentionDecision, retainedPlacementEntityDecision} from
  '../partition/partition-placement-retained-repair.js';
import {ENTITY_ADMISSION_STATE} from '../partition/partition-placement-admission-decision.js';
import {REPAIR_OBSERVATION as OBSERVATION, observationAllowsRetry, takeRepairObservations} from
  './replica-operation-retained-repair-observation.js';
import {PARTITION_WRITE_LEADERSHIP_REFUSAL} from '../partition/partition-write-kernel.js';
import {REPAIR_ANSWER_STATE, REPAIR_REFUSAL_CLEARING as CLEARING, isCommittedRepairAnswer,
  custodyMatches, readRetainedRepairRefusal} from './replica-operation-retained-repair-answer.js';
import {REPAIR_PREPARATION_STATE as PREPARATION, PLACEMENT_ADMISSION_ERROR} from
  '../partition/partition-placement-admission-constants.js';
import {v4 as uuidv4} from 'uuid';
import {isDeepStrictEqual} from 'node:util';
import {PLACEMENT_CLEARING_TRIGGER, PLACEMENT_TRIGGER, PLACEMENT_OUTCOME} from './replica-placement-owner-constants.js';

const REPAIR_LOG = Object.freeze({ANSWER_UNAVAILABLE: 'Retained placement repair answer unavailable',
  AUTHORITY_REFUSED: 'Retained placement repair authority refused'});
// Owed revalidation waits: the binding is unavailable (next route publication,
// no timer), or the native outcome is unknown (the continuation re-presents).
const RETAINED_REPAIR_WAIT = Object.freeze({ROUTE_UNAVAILABLE: 'route_unavailable',
  OUTCOME_UNKNOWN: PARTITION_WRITE_LEADERSHIP_REFUSAL.OUTCOME_UNKNOWN});
const CONTINUATION_REASONS = new Set([...TRANSIENT_AUTHORITY_REFUSALS, RETAINED_REPAIR_DISCLAIM,
  RETAINED_REPAIR_WAIT.OUTCOME_UNKNOWN, PLACEMENT_ADMISSION_ERROR.OWNER_UNAVAILABLE]);
const UNFENCED = Object.freeze({state: FENCE.UNFENCED});

// One immutable process-retained envelope per operation; no durable reconstruction
// promise. Owned commits/CDC and the record's bounded continuation trigger
// revalidation, never substitute admission authority. Every write reaches native apply.
const RETAINED_REPAIR_PORTS = Object.freeze(['repairRetainedPlacement',
  'resolveRetainedPlacementRepairRoute', 'prepareRetainedPlacementRepair']);
const RETAINED_REPAIR_PORT_REFUSAL = 'retained_placement_repair_port_missing';

function createRetainedPlacementRepairPorts(options) {
  const ports = {};
  for (const name of RETAINED_REPAIR_PORTS) {
    if (!(options[name] instanceof Function)) {
      const error = new TypeError(`Retained placement repair owner requires port ${name}`);
      error.code = RETAINED_REPAIR_PORT_REFUSAL;
      throw error;
    }
    ports[name] = options[name];
  }
  return ports;
}

function assignRetainedPlacementRepairMethods(Repository) {
  Object.assign(Repository.prototype, {
    async ensureRetainedOperationRow(operation) {
      return this.repairRetainedOperation(operation);
    },

    // A caller arrival. It inherits a decision in flight only when that
    // decision may propose (an overlapping turn); otherwise one fresh decision.
    async repairRetainedOperation(operation) {
      if (this.isShuttingDownRequested()) return false;
      let attempt = this.retainedPlacementRepairs.get(operation.operationId);
      if (!attempt) {
        attempt = retainedRepairRecord(operation, ORIGIN.CALLER);
        this.retainedPlacementRepairs.set(operation.operationId, attempt);
      }
      if (!isDeepStrictEqual(attempt.operation, operation)) return false;
      attempt.origin = ORIGIN.CALLER;
      if (attempt.decision.state === RUN.RUNNING) {
        const running = attempt.decision;
        const joined = await running.promise;
        if (PROPOSING_MODES.has(running.mode) || !this.retainedRepairAttemptIsCurrent(attempt)) {
          return joined;
        }
        return this.repairRetainedOperation(operation);
      }
      return this.runRetainedRepairDecision(attempt,
        OBSERVATION.CLEARING | takeRepairObservations(attempt));
    },

    runRetainedRepairDecision(attempt, kinds) {
      const mode = this.retainedRepairObservationMode(attempt, kinds);
      const promise = Promise.resolve().then(() => this.decideRetainedRepair(attempt, kinds, mode))
        .finally(() => {
          if (attempt.decision.promise !== promise) return;
          attempt.decision = IDLE_DECISION;
          this.releaseEndedRetainedTenure(attempt);
        });
      attempt.decision = {state: RUN.RUNNING, mode, promise};
      return promise;
    },

    retainedRepairObservationMode(attempt, kinds) {
      if ((kinds & OBSERVATION.ROUTE) !== 0) return MODE.HANDOFF;
      if ((kinds & OBSERVATION.CONTENTION) !== 0) return MODE.REFRESH;
      if (observationAllowsRetry(kinds)) {
        return attempt.custody.state === CUSTODY.DELEGATED ? MODE.JOIN : MODE.RETRY;
      }
      return (kinds & OBSERVATION.ENTRY) !== 0 ? MODE.RESOLVE : MODE.CONFIRM;
    },

    decideRetainedRepair(attempt, kinds, mode) {
      if (!this.retainedRepairAttemptIsCurrent(attempt)) return false;
      switch (mode) {
      case MODE.CONFIRM:
        return this.confirmRetainedRepair(attempt, kinds, REPAIR_READ_SCOPE.SUBJECT);
      case MODE.REFRESH:
        return this.confirmRetainedRepair(attempt, kinds, REPAIR_READ_SCOPE.CENSUS);
      case MODE.RESOLVE:
        return this.resolveCommittedPinnedEntry(attempt);
      case MODE.JOIN:
        return this.joinRetainedRepairDecision(attempt, kinds);
      default:
        return this.retryRetainedRepairDecision(attempt, kinds, mode);
      }
    },

    // The binding changes only here, inside the serialized decision, from the
    // current canonical route. Custody holds while the binding it was attested
    // under is current: a route change or a published incarnation change of
    // the bound endpoint (both part of the binding) ends it, as a disclaim
    // does; a publication that leaves the binding as it was does not.
    bindRetainedRepairDecision(attempt) {
      const binding = this.resolveRetainedPlacementRepairRoute();
      if (attempt.custody.state === CUSTODY.DELEGATED &&
          !isDeepStrictEqual(attempt.custody.binding, binding)) {
        attempt.custody = SELF_CUSTODY;
      }
      const changed = !isDeepStrictEqual(attempt.binding, binding);
      attempt.binding = binding;
      return {binding, changed};
    },

    async retryRetainedRepairDecision(attempt, kinds, mode) {
      const {binding, changed} = this.bindRetainedRepairDecision(attempt);
      if (mode === MODE.HANDOFF && !changed && kinds === OBSERVATION.ROUTE) return false;
      if (binding.state === BINDING.UNAVAILABLE) {
        return this.oweRetainedRepair(attempt, kinds | OBSERVATION.ROUTE,
          RETAINED_REPAIR_WAIT.ROUTE_UNAVAILABLE);
      }
      // The node that would propose evaluates contention first; a remote
      // sender presents the exact entry and its receiver evaluates it.
      const scope = mode === MODE.HANDOFF && binding.state === BINDING.REMOTE ?
        REPAIR_READ_SCOPE.SUBJECT : REPAIR_READ_SCOPE.CURRENT;
      const decision = await this.readRetainedRepairDecision(attempt, scope, binding);
      if (decision.state === DECISION.UNAVAILABLE) {
        return this.oweRetainedRepair(attempt, kinds, decision.reason);
      }
      this.satisfyRetainedRepairRevalidation(attempt);
      if (decision.state !== DECISION.ABSENT) {
        return this.settleRetainedRepairDecision(attempt, decision);
      }
      return this.resolveObservedRetainedRepair(attempt, decision.term, binding);
    },

    // A delegated sender re-presents its exact entry to the current binding.
    // After a committed refusal of that entry it reads the census once: ABSENT
    // proposes a successor, so a join never ends on ABSENT with nothing owed.
    async joinRetainedRepairDecision(attempt, kinds) {
      const {binding} = this.bindRetainedRepairDecision(attempt);
      if (binding.state === BINDING.UNAVAILABLE) {
        return this.oweRetainedRepair(attempt, kinds | OBSERVATION.ROUTE,
          RETAINED_REPAIR_WAIT.ROUTE_UNAVAILABLE);
      }
      const satisfied = await this.submitRetainedPlacementRepairAttempt(attempt, UNFENCED, binding);
      if (satisfied || !this.retainedRepairAttemptIsCurrent(attempt)) return satisfied;
      if (attempt.lastAnswer?.committed !== true || attempt.entry.state === ENTRY.PINNED) {
        return false;
      }
      const current = await this.readRetainedRepairDecision(attempt, REPAIR_READ_SCOPE.CENSUS,
        binding);
      if (current.state === DECISION.UNAVAILABLE) {
        return this.oweRetainedRepair(attempt, kinds | OBSERVATION.CONTENTION, current.reason);
      }
      if (current.state !== DECISION.ABSENT) {
        return this.settleRetainedRepairDecision(attempt, current);
      }
      return this.submitRetainedRepairAtTerm(attempt, current.term, binding);
    },

    async confirmRetainedRepair(attempt, kinds, scope) {
      const {binding} = this.bindRetainedRepairDecision(attempt);
      const decision = await this.readRetainedRepairDecision(attempt, scope, binding);
      if (decision.state === DECISION.UNAVAILABLE) {
        return this.oweRetainedRepair(attempt, kinds, decision.reason);
      }
      this.satisfyRetainedRepairRevalidation(attempt);
      if (decision.state === DECISION.ABSENT && scope === REPAIR_READ_SCOPE.CENSUS) {
        return this.resolveObservedRetainedRepair(attempt, decision.term, binding);
      }
      return this.settleRetainedRepairDecision(attempt, decision);
    },

    // The local ledger committed the pinned entry: present that exact entry
    // again, and native replay answers its committed result with no proposal.
    async resolveCommittedPinnedEntry(attempt) {
      if (attempt.entry.state !== ENTRY.PINNED) return false;
      const {binding} = this.bindRetainedRepairDecision(attempt);
      if (binding.state !== BINDING.LOCAL) return false;
      return this.submitRetainedPlacementRepairAttempt(attempt, UNFENCED, binding);
    },

    async resolveObservedRetainedRepair(attempt, term, binding) {
      const resolvingPinned = attempt.entry.state === ENTRY.PINNED;
      const satisfied = await this.submitRetainedRepairAtTerm(attempt, term, binding);
      if (satisfied || !this.retainedRepairAttemptIsCurrent(attempt)) return satisfied;
      if (!resolvingPinned || attempt.entry.state === ENTRY.PINNED) return false;
      // The owned observation survives resolution of the original unknown turn.
      // Its old refusal never authorizes a successor: read current contention once.
      const current = await this.readRetainedRepairDecision(attempt, REPAIR_READ_SCOPE.CENSUS,
        binding);
      if (current.state === DECISION.UNAVAILABLE) {
        return this.oweRetainedRepair(attempt, OBSERVATION.CLEARING, current.reason);
      }
      if (current.state !== DECISION.ABSENT) {
        return this.settleRetainedRepairDecision(attempt, current);
      }
      return this.submitRetainedRepairAtTerm(attempt, current.term, binding);
    },

    submitRetainedRepairAtTerm(attempt, term, binding) {
      return this.submitRetainedPlacementRepairAttempt(attempt,
        {state: FENCE.TERM, term}, binding);
    },

    retainedRepairAttemptIsCurrent(attempt) {
      return !this.isShuttingDownRequested() &&
        this.retainedPlacementRepairs.get(attempt.operation.operationId) === attempt;
    },

    // Retirement cancels the record's continuation and drops its backoff.
    retireRetainedRepair(attempt) {
      this.cancelRetainedRepairContinuation(attempt);
      if (this.retainedPlacementRepairs.get(attempt.operation.operationId) === attempt) {
        this.retainedPlacementRepairs.delete(attempt.operation.operationId);
      }
    },

    // A failed read or an unavailable dependency: the kinds this decision was
    // asked to revalidate stay owed. The blocker and its clearing trigger stay
    // what the committed refusal said; a failed read never rewrites them.
    oweRetainedRepair(attempt, kinds, reason) {
      if (!this.retainedRepairAttemptIsCurrent(attempt)) return false;
      attempt.owed |= kinds;
      attempt.lastDecision = {state: DECISION.UNAVAILABLE, reason};
      if (CONTINUATION_REASONS.has(reason)) {
        this.armRetainedRepairContinuation(attempt, reason);
      } else if (reason === REPAIR_AUTHORITY_REFUSAL.UNQUALIFIED_BINDING) {
        attempt.owed |= OBSERVATION.ROUTE;
      } else if (reason !== RETAINED_REPAIR_WAIT.ROUTE_UNAVAILABLE) {
        this.logger.error(REPAIR_LOG.AUTHORITY_REFUSED,
          {operationId: attempt.operation.operationId, reason});
      }
      return false;
    },

    async prepareRetainedRepairAttempt(attempt, binding) {
      if (attempt.entry.state === ENTRY.PINNED) return true;
      const preparation = await this.prepareRetainedPlacementRepair(attempt.operation);
      if (!this.retainedRepairAttemptIsCurrent(attempt)) return false;
      if (preparation?.state !== PREPARATION.PREPARED) {
        return this.retainRetainedRepairPreparationRefusal(attempt, preparation);
      }
      return this.pinPreparedRetainedRepair(attempt, preparation, binding);
    },

    // A preparation refusal: an unavailable owner owes revalidation; a named
    // refusal waits for its clearing trigger.
    retainRetainedRepairPreparationRefusal(attempt, preparation) {
      const reason = preparation?.reason || preparation?.failureCode;
      if (reason === PLACEMENT_ADMISSION_ERROR.OWNER_UNAVAILABLE) {
        this.oweRetainedRepair(attempt, OBSERVATION.CLEARING, reason);
      } else if (PLACEMENT_CLEARING_TRIGGER[reason]) {
        attempt.clearingTrigger = PLACEMENT_CLEARING_TRIGGER[reason];
      }
      return false;
    },

    pinPreparedRetainedRepair(attempt, preparation, binding) {
      if (preparation.owner?.nodeId !== binding.nodeId ||
          preparation.owner?.replicaId !== binding.replicaId) {
        this.oweRetainedRepair(attempt, OBSERVATION.ROUTE,
          REPAIR_AUTHORITY_REFUSAL.UNQUALIFIED_BINDING);
        return false;
      }
      attempt.entry = pinnedEntry(`retained-repair:${attempt.operation.operationId}:${uuidv4()}`,
        preparation.body);
      return true;
    },

    async submitRetainedPlacementRepairAttempt(attempt, fence, binding) {
      if (!await this.prepareRetainedRepairAttempt(attempt, binding)) return false;
      if (!this.retainedRepairAttemptIsCurrent(attempt)) return false;
      const releaseSequence = this.retainedPlacementRepairReleaseSequence;
      attempt.lastDecision = {state: DECISION.PENDING};
      const answer = await this.sendRetainedRepairAttempt(attempt, fence);
      if (!this.retainedRepairAttemptIsCurrent(attempt)) return false;
      attempt.lastAnswer = answer;
      if (matchesRetainedRepairObservation(answer, attempt, binding)) {
        this.recordRetainedRepairCustody(attempt, answer, binding);
        return this.consumeRetainedRepairObservation(attempt, answer.retainedRepairObservation);
      }
      if (answer === null) {
        return this.oweRetainedRepair(attempt, OBSERVATION.ROUTE,
          RETAINED_REPAIR_WAIT.ROUTE_UNAVAILABLE);
      }
      const committed = isCommittedRepairAnswer(answer, attempt);
      if (answer.committed === true && !committed) return this.retainUnknownRepairOutcome(attempt);
      if (!committed) {
        if (binding.state === BINDING.REMOTE) {
          this.recordRetainedRepairCustody(attempt, answer, binding);
        }
        return this.retainUncommittedRepairAnswer(attempt, answer, releaseSequence);
      }
      attempt.minimumLedgerIndex = Math.max(attempt.minimumLedgerIndex, answer.logIndex);
      attempt.minimumLedgerTerm = Math.max(attempt.minimumLedgerTerm, answer.term);
      const result = answer.placementResult;
      return result.outcome === PLACEMENT_OUTCOME.ADMITTED ?
        this.confirmAdmittedRetainedRepair(attempt, binding) :
        this.retainCommittedRepairRefusal(attempt, result);
    },

    async sendRetainedRepairAttempt(attempt, fence) {
      let answer;
      try {
        attempt.nativeIngress = {state: NATIVE.EXPECTED, fence,
          answer: {state: NATIVE_ANSWER.NOT_REQUESTED}};
        answer = await this.repairRetainedPlacement({entryId: attempt.entry.entryId,
          body: attempt.entry.body});
      } catch (error) {
        this.logger.warn(REPAIR_LOG.ANSWER_UNAVAILABLE,
          {operationId: attempt.operation.operationId, error: error?.message || String(error)});
        answer = {success: false, failureCode: PARTITION_WRITE_LEADERSHIP_REFUSAL.OUTCOME_UNKNOWN};
      } finally {
        attempt.nativeIngress = NATIVE_IDLE;
      }
      return answer;
    },

    // A reply of the bound replica either attests custody of the exact entry
    // under its tenure (ledger term, process incarnation), or disclaims it.
    recordRetainedRepairCustody(attempt, answer, binding) {
      const custody = answer.repairCustody;
      attempt.custody = custodyMatches(custody, attempt, binding) ?
        {state: CUSTODY.DELEGATED, binding, ledgerTerm: custody.ledgerTerm,
          entryId: custody.entryId} : SELF_CUSTODY;
    },

    // Unknown, foreign or malformed native outcome: the exact entry stays
    // pinned; the continuation re-presents it so native replay settles it.
    retainUnknownRepairOutcome(attempt) {
      return this.oweRetainedRepair(attempt, OBSERVATION.CLEARING,
        RETAINED_REPAIR_WAIT.OUTCOME_UNKNOWN);
    },

    retainUncommittedRepairAnswer(attempt, answer, releaseSequence) {
      const failureCode = answer.failureCode;
      if (failureCode === PLACEMENT_ADMISSION_ERROR.OWNER_UNAVAILABLE) {
        return this.oweRetainedRepair(attempt, OBSERVATION.CLEARING, failureCode);
      }
      if (!Object.hasOwn(PLACEMENT_CLEARING_TRIGGER, failureCode)) {
        return this.retainUnknownRepairOutcome(attempt);
      }
      const trigger = PLACEMENT_CLEARING_TRIGGER[failureCode];
      if (!trigger) {
        this.logger.error(REPAIR_LOG.AUTHORITY_REFUSED,
          {operationId: attempt.operation.operationId, reason: failureCode});
        return false;
      }
      attempt.clearingTrigger = trigger;
      const released = this.retainedPlacementRepairReleaseSequence > releaseSequence;
      if (released && trigger === PLACEMENT_TRIGGER.WRITE_PATH_RELEASED) {
        this.wakeRetainedPlacementRepairs((candidate) => candidate === attempt,
          OBSERVATION.CLEARING);
      } else if (trigger === PLACEMENT_TRIGGER.LEDGER_COMMIT) {
        // Nothing durable was written, so an idle ledger never commit-wakes
        // it: the continuation re-presents the exact pinned entry (Q8).
        this.oweRetainedRepair(attempt, OBSERVATION.CLEARING, RETAINED_REPAIR_WAIT.OUTCOME_UNKNOWN);
      }
      return false;
    },

    async confirmAdmittedRetainedRepair(attempt, binding) {
      attempt.entry = settledEntry(attempt.entry);
      attempt.custody = SELF_CUSTODY;
      const decision = await this.readRetainedRepairDecision(attempt, REPAIR_READ_SCOPE.SUBJECT,
        binding);
      if (decision.state === DECISION.UNAVAILABLE) {
        return this.oweRetainedRepair(attempt, OBSERVATION.OWN_ROW, decision.reason);
      }
      this.satisfyRetainedRepairRevalidation(attempt);
      return this.settleRetainedRepairDecision(attempt, decision);
    },

    // A committed refusal settles exactly the entry it names: that entry is
    // settled and unpinned; a permanent refusal retires the record.
    retainCommittedRepairRefusal(attempt, result) {
      const refusal = readRetainedRepairRefusal(result, attempt);
      if (refusal.state === REPAIR_ANSWER_STATE.UNKNOWN) {
        return this.retainUnknownRepairOutcome(attempt);
      }
      attempt.lastDecision = {state: DECISION.CONTENDED, result};
      attempt.blocker = refusal.blocker;
      if (refusal.clearing.state === CLEARING.PERMANENT) {
        this.retireRetainedRepair(attempt);
        return false;
      }
      attempt.clearingTrigger = refusal.clearing.trigger;
      attempt.entry = settledEntry(attempt.entry);
      attempt.custody = SELF_CUSTODY;
      return false;
    },

    async readRetainedRepairDecision(attempt, scope, binding) {
      const authority = await readRetainedRepairAuthority(this, attempt, scope, binding);
      if (authority.state !== REPAIR_AUTHORITY.READY) {
        return {state: DECISION.UNAVAILABLE, reason: authority.reason};
      }
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
          attempt.operation, entryBody(attempt.entry).copyPolicy, authority.census) :
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
      attempt.lastDecision = decision;
      switch (decision.state) {
      case DECISION.EXACT:
        this.syncIncompleteOperationObservation(decision.operation);
        this.retireRetainedRepair(attempt);
        return true;
      case DECISION.CHANGED:
        this.retireRetainedRepair(attempt);
        return false;
      case DECISION.CONTENDED:
        this.retainObservedRepairContention(attempt, decision.result);
        return false;
      default:
        return false;
      }
    },

    retainObservedRepairContention(attempt, result) {
      const refusal = readRetainedRepairRefusal(result, attempt);
      if (refusal.state !== REPAIR_ANSWER_STATE.KNOWN) return;
      attempt.blocker = refusal.blocker;
      if (refusal.clearing.state === CLEARING.CLEARABLE) {
        attempt.clearingTrigger = refusal.clearing.trigger;
      }
    },

    // The receiver's typed observation of the presented entry. UNAVAILABLE is
    // a failed receiver read or a disclaim: revalidation is owed by the
    // receiver while it holds custody, otherwise by this record's continuation.
    async consumeRetainedRepairObservation(attempt, observation) {
      attempt.lastDecision = observation;
      switch (observation.state) {
      case DECISION.EXACT:
      case DECISION.CHANGED:
        return this.confirmRetainedRepair(attempt, OBSERVATION.OWN_ROW, REPAIR_READ_SCOPE.SUBJECT);
      case DECISION.CONTENDED:
        this.retainObservedRepairContention(attempt, observation.result);
        return false;
      case DECISION.UNAVAILABLE:
        if (attempt.custody.state === CUSTODY.DELEGATED) return false;
        return this.oweRetainedRepair(attempt, OBSERVATION.CLEARING, observation.reason);
      default:
        return false;
      }
    },

    clearRetainedPlacementRepairCustody() {
      for (const attempt of this.retainedPlacementRepairs.values()) {
        this.cancelRetainedRepairContinuation(attempt);
      }
      for (const service of this.retainedPlacementRepairWakes.keys()) {
        this.unbindRetainedPlacementRepairWake(service);
      }
      this.retainedPlacementRepairs.clear();
    },
  });
  assignRetainedRepairWakeMethods(Repository);
  assignRetainedRepairIngressMethods(Repository);
  assignRetainedRepairReadRetryMethods(Repository);
}

export {RETAINED_REPAIR_PORT_REFUSAL, assignRetainedPlacementRepairMethods,
  createRetainedPlacementRepairPorts};

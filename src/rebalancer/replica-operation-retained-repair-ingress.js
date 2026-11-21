import {REPAIR_OBSERVATION as OBSERVATION} from './replica-operation-retained-repair-observation.js';
import {REPAIR_READ_SCOPE} from './replica-operation-retained-repair-authority.js';
// The ledger leader's repository serializes the whole repair decision, including
// authority reads and adoption. Exact-entry native ingress attaches the native
// completer directly: its outer decision may already be awaiting this ingress.
// No decision outcome is reused across turns: an arrival that overlaps a
// proposing decision inherits its outcome; any later arrival decides afresh.
import {isDeepStrictEqual} from 'node:util';
import {readCommittedStatementOutcome} from '../partition/partition-committed-statement-outcome.js';
import {PARTITION_COMMITTED_STATEMENT_RECORD_STATE as RECORD} from
  '../partition/partition-committed-statement-outcome-constants.js';
import {PLACEMENT_ADMISSION_ERROR} from '../partition/partition-placement-admission-constants.js';
import {retainedRepairObservationReply, retainedRepairDisclaim} from
  './replica-operation-retained-repair-reply.js';
import {RETAINED_REPAIR_DECISION as DECISION, RETAINED_REPAIR_MODE as MODE, PROPOSING_MODES,
  RETAINED_REPAIR_ORIGIN as ORIGIN, RETAINED_REPAIR_BINDING as BINDING,
  RETAINED_REPAIR_ENTRY as ENTRY, RETAINED_REPAIR_TENURE as TENURE,
  RETAINED_REPAIR_NATIVE as NATIVE, RETAINED_REPAIR_NATIVE_FENCE as FENCE,
  RETAINED_REPAIR_NATIVE_ANSWER as NATIVE_ANSWER, RETAINED_REPAIR_DECISION_RUN as RUN,
  SELF_CUSTODY, IDLE_DECISION, pinnedEntry, retainedRepairRecord} from
  './replica-operation-retained-repair-record.js';
import {ledgerTerm} from './replica-operation-retained-repair-wake.js';
import {COLUMN, TABLES} from '../constants/index.js';

const REPLICA_BIRTH = Object.freeze({ATTESTED: 'attested', UNATTESTED: 'unattested'});
const UNATTESTED_BIRTH = Object.freeze({state: REPLICA_BIRTH.UNATTESTED});

// The receiver attests its own replica birth: the created_at of its own
// SERVICES registration row (the endpoint a sender binds), as this node holds
// it, never the sender's copy. Without its own row it attests no custody.
function ownReplicaBirth(cache, service) {
  const row = cache.get(TABLES.SERVICES, service.replicaId);
  const createdAt = row?.[COLUMN.CREATED_AT];
  return row?.[COLUMN.NODE_ID] === service.nodeId &&
    row[COLUMN.PARTITION_ID] === service.partitionId &&
    Number.isSafeInteger(createdAt) && createdAt > 0 ?
    {state: REPLICA_BIRTH.ATTESTED, createdAt} : UNATTESTED_BIRTH;
}

function ownsIngress(service, term) {
  return service.isLeader && ledgerTerm(service) === term;
}

function ownsNativeCompleter(attempt, payload) {
  return attempt.decision.state === RUN.RUNNING && attempt.entry.state === ENTRY.PINNED &&
    attempt.entry.entryId === payload.entryId && attempt.nativeIngress.state === NATIVE.EXPECTED;
}

function bytesRefusal() {
  return {success: false, failureCode: PLACEMENT_ADMISSION_ERROR.BYTES};
}

function assignRetainedRepairIngressMethods(Repository) {
  Object.assign(Repository.prototype, {
    async acceptRetainedPlacementRepairRequest(service, payload, submitNative) {
      this.retireEndedRetainedTenures(service);
      if (this.isShuttingDownRequested() || !service.isLeader) {
        return retainedRepairDisclaim(service, payload);
      }
      // The native replay owner validates exact fingerprint/body and returns
      // E0's actual outcome before any unrelated volatile E1 can be redriven.
      const recorded = readCommittedStatementOutcome(service,
        service.getCommittedEntryKey({entryId: payload.entryId}));
      if (recorded.state === RECORD.SETTLED) return submitNative(payload);
      const operation = payload.body.operation;
      let attempt = this.retainedPlacementRepairs.get(operation.operationId);
      if (attempt && !isDeepStrictEqual(attempt.operation, operation)) return bytesRefusal();
      if (!attempt) {
        attempt = retainedRepairRecord(operation, ORIGIN.INGRESS,
          pinnedEntry(payload.entryId, payload.body));
        this.retainedPlacementRepairs.set(operation.operationId, attempt);
      }
      if (attempt.entry.state === ENTRY.PINNED && attempt.entry.entryId === payload.entryId &&
          !isDeepStrictEqual(attempt.entry.body, payload.body)) return bytesRefusal();
      if (ownsNativeCompleter(attempt, payload)) {
        return this.completeNativeRetainedRepair(service, payload, attempt, submitNative);
      }
      const answer = await this.completeIncomingRetainedRepair(service, payload, attempt,
        submitNative);
      const custody = this.retainedRepairCustodyOf(service, payload, attempt);
      return custody === null ? answer : {...answer, repairCustody: custody};
    },

    // The record's own decision presented its exact entry through the local
    // ledger: this is that send's native completer, fenced by its term.
    completeNativeRetainedRepair(service, payload, attempt, submitNative) {
      const native = attempt.nativeIngress;
      if (native.fence.state === FENCE.TERM && !ownsIngress(service, native.fence.term)) {
        return retainedRepairDisclaim(service, payload);
      }
      attempt.tenure = {state: TENURE.LEDGER, service, term: ledgerTerm(service)};
      if (native.answer.state === NATIVE_ANSWER.NOT_REQUESTED) {
        attempt.nativeIngress = {...native, answer: {state: NATIVE_ANSWER.REQUESTED,
          promise: Promise.resolve(submitNative(payload))}};
      }
      return attempt.nativeIngress.answer.promise;
    },

    async completeIncomingRetainedRepair(service, payload, attempt, submitNative) {
      const term = ledgerTerm(service);
      if (attempt.decision.state === RUN.RUNNING) {
        const running = attempt.decision;
        await running.promise;
        if (!ownsIngress(service, term)) return retainedRepairDisclaim(service, payload);
        if (PROPOSING_MODES.has(running.mode) &&
            attempt.lastDecision.state !== DECISION.UNOBSERVED) {
          return retainedRepairObservationReply(service, payload, attempt.lastDecision);
        }
        return this.acceptRetainedPlacementRepairRequest(service, payload, submitNative);
      }
      let answer;
      const promise = Promise.resolve().then(async () => {
        answer = await this.decideIncomingRetainedRepair(service, payload, attempt, term);
      }).finally(() => {
        if (attempt.decision.promise !== promise) return;
        attempt.decision = IDLE_DECISION;
        this.releaseEndedRetainedTenure(attempt);
      });
      attempt.decision = {state: RUN.RUNNING, mode: MODE.RECEIVER, promise};
      await promise;
      if (answer !== undefined) return answer;
      return this.acceptRetainedPlacementRepairRequest(service, payload, submitNative);
    },

    // The receiver decision: the node that would propose evaluates contention
    // from its own qualified read before any native proposal, including the
    // re-presentation of its own unresolved entry.
    async decideIncomingRetainedRepair(service, payload, attempt, term) {
      attempt.binding = {state: BINDING.LOCAL, nodeId: service.nodeId,
        replicaId: service.replicaId};
      attempt.tenure = {state: TENURE.LEDGER, service, term};
      const decision = await this.readRetainedRepairDecision(attempt, REPAIR_READ_SCOPE.RECEIVER,
        attempt.binding);
      if (!ownsIngress(service, term)) return retainedRepairDisclaim(service, payload);
      if (decision.state === DECISION.UNAVAILABLE) {
        this.oweRetainedRepair(attempt, OBSERVATION.CLEARING, decision.reason);
        return retainedRepairObservationReply(service, payload, decision);
      }
      this.satisfyRetainedRepairRevalidation(attempt);
      if (decision.state !== DECISION.ABSENT) {
        this.settleRetainedRepairDecision(attempt, decision);
        return retainedRepairObservationReply(service, payload, decision);
      }
      if (attempt.entry.state === ENTRY.PINNED && attempt.entry.entryId !== payload.entryId) {
        // Resolve the original E1, never mint a replacement while it is unknown.
        await this.resolveObservedRetainedRepair(attempt, decision.term, attempt.binding);
        if (!this.retainedRepairAttemptIsCurrent(attempt)) return undefined;
        // The receiver still owns its own entry and its wake: the incoming
        // entry gets the current typed state and no custody.
        return retainedRepairObservationReply(service, payload,
          attempt.lastDecision.state === DECISION.CONTENDED ? attempt.lastDecision :
            {state: DECISION.PENDING});
      }
      attempt.entry = pinnedEntry(payload.entryId, payload.body);
      attempt.custody = SELF_CUSTODY;
      await this.submitRetainedRepairAtTerm(attempt, term, attempt.binding);
      return attempt.lastAnswer;
    },

    // Custody: this receiver tenure holds the exact incoming entry. It attests
    // the replica, its ledger term at ingress and the tenure pair existing
    // owners attest a running replica by: this process's boot incarnation and
    // the replica's own SERVICES birth.
    retainedRepairCustodyOf(service, payload, attempt) {
      const birth = ownReplicaBirth(this.systemTableCache, service);
      const holds = this.retainedPlacementRepairs.get(attempt.operation.operationId) === attempt &&
        service.isLeader && attempt.tenure.state === TENURE.LEDGER &&
        attempt.tenure.service === service && attempt.entry.state === ENTRY.PINNED &&
        attempt.entry.entryId === payload.entryId &&
        isDeepStrictEqual(attempt.entry.body, payload.body) && birth !== UNATTESTED_BIRTH;
      if (!holds) return null;
      return {nodeId: service.nodeId, replicaId: service.replicaId,
        operationId: attempt.operation.operationId, createdAt: attempt.operation.createdAt,
        entryId: payload.entryId, bodyText: JSON.stringify(payload.body),
        ledgerTerm: attempt.tenure.term,
        nodeBootIncarnation: this.membershipOwnerBootIncarnation,
        replicaCreatedAt: birth.createdAt};
    },
  });
}

export {assignRetainedRepairIngressMethods};

import {REPAIR_OBSERVATION} from './replica-operation-retained-repair-observation.js';
import {REPAIR_READ_SCOPE} from './replica-operation-retained-repair-authority.js';
// The actual ledger repository serializes the whole repair decision, including
// authority reads and adoption. Exact-entry native ingress attaches the native
// completer directly: its outer decision may already be awaiting this ingress.
import {isDeepStrictEqual} from 'node:util';
import {readCommittedStatementOutcome} from '../partition/partition-committed-statement-outcome.js';
import {PARTITION_COMMITTED_STATEMENT_RECORD_STATE as RECORD} from
  '../partition/partition-committed-statement-outcome-constants.js';
import {PLACEMENT_ADMISSION_ERROR} from '../partition/partition-placement-admission-constants.js';
import {retainedRepairObservationReply} from './replica-operation-retained-repair-reply.js';
import {RETAINED_REPAIR_DECISION as DECISION, retainedRepairRecord} from
  './replica-operation-retained-repair-record.js';

function unavailableReply(service, payload) {
  return retainedRepairObservationReply(service, payload, {state: DECISION.UNAVAILABLE});
}

function ingressTerm(service) {
  return service.raft.readStatus().term;
}

function ownsIngress(service, term) {
  return service.isLeader && ingressTerm(service) === term;
}

const REUSABLE_DECISIONS = new Set([DECISION.PENDING, DECISION.CONTENDED, DECISION.UNAVAILABLE]);

function reusableRetainedDecision(attempt, term) {
  return attempt.lastDecision !== null && REUSABLE_DECISIONS.has(attempt.lastDecision.state) &&
    attempt.lastDecisionTerm === term && attempt.observations === REPAIR_OBSERVATION.NONE;
}

function ownsNativeCompleter(attempt, payload) {
  return Boolean(attempt.pending && attempt.entryId === payload.entryId &&
    attempt.nativeIngressExpected);
}

function custodyOf(service, payload, attempt, attempts) {
  const ownsIncoming = attempts.get(attempt.operation.operationId) === attempt &&
    service.isLeader && attempt.nativeService === service &&
    attempt.entryId === payload.entryId && isDeepStrictEqual(attempt.body, payload.body);
  return ownsIncoming ? {nodeId: service.nodeId, replicaId: service.replicaId,
    operationId: attempt.operation.operationId, createdAt: attempt.operation.createdAt,
    entryId: payload.entryId, bodyText: JSON.stringify(payload.body)} : null;
}

function assignRetainedRepairIngressMethods(Repository) {
  Object.assign(Repository.prototype, {
    async acceptRetainedPlacementRepairRequest(service, payload, submitNative) {
      if (this.isShuttingDownRequested() || !service.isLeader) {
        return unavailableReply(service, payload);
      }
      // The native replay owner validates exact fingerprint/body and returns
      // E0's actual outcome before any unrelated volatile E1 can be redriven.
      const recorded = readCommittedStatementOutcome(service,
        service.getCommittedEntryKey({entryId: payload.entryId}));
      if (recorded.state === RECORD.SETTLED) return submitNative(payload);
      const operation = payload.body.operation;
      let attempt = this.retainedPlacementRepairs.get(operation.operationId);
      if (attempt && !isDeepStrictEqual(attempt.operation, operation)) {
        return {success: false, failureCode: PLACEMENT_ADMISSION_ERROR.BYTES};
      }
      if (!attempt) {
        attempt = retainedRepairRecord(operation, payload.entryId, payload.body);
        this.retainedPlacementRepairs.set(operation.operationId, attempt);
      }
      if (attempt.entryId === payload.entryId && !isDeepStrictEqual(attempt.body, payload.body)) {
        return {success: false, failureCode: PLACEMENT_ADMISSION_ERROR.BYTES};
      }
      const nativeCompleter = ownsNativeCompleter(attempt, payload);
      attempt.nativeService = service;
      attempt.expectedOwner = {nodeId: service.nodeId, replicaId: service.replicaId};
      const answer = await this.completeIncomingRetainedRepair(
        service, payload, attempt, submitNative);
      if (nativeCompleter) return answer;
      const custody = custodyOf(service, payload, attempt, this.retainedPlacementRepairs);
      return custody === null ? answer : {...answer, repairCustody: custody};
    },

    async completeIncomingRetainedRepair(service, payload, attempt, submitNative) {
      if (ownsNativeCompleter(attempt, payload)) {
        if (attempt.nativeIngressTerm !== null &&
            !ownsIngress(service, attempt.nativeIngressTerm)) {
          return unavailableReply(service, payload);
        }
        attempt.nativeService = service;
        if (!attempt.nativeAnswerPromise) {
          attempt.nativeAnswerPromise = Promise.resolve(submitNative(payload));
        }
        return attempt.nativeAnswerPromise;
      }
      if (attempt.pending) {
        const term = ingressTerm(service);
        await attempt.pending;
        if (!ownsIngress(service, term)) return unavailableReply(service, payload);
        if (attempt.lastDecision !== null) {
          return retainedRepairObservationReply(service, payload, attempt.lastDecision);
        }
        return this.acceptRetainedPlacementRepairRequest(service, payload, submitNative);
      }
      let answer;
      const term = ingressTerm(service);
      if (reusableRetainedDecision(attempt, term)) {
        return retainedRepairObservationReply(service, payload, attempt.lastDecision);
      }
      await this.runRetainedRepairDecision(attempt, async () => {
        await this.resolvePriorRetainedRepairAttempt(service, payload, attempt, term);
        if (!this.retainedRepairAttemptIsCurrent(attempt)) return false;
        const decision = await this.readRetainedRepairDecision(attempt, REPAIR_READ_SCOPE.RECEIVER);
        if (!ownsIngress(service, term)) {
          answer = unavailableReply(service, payload);
          return false;
        }
        attempt.lastDecision = decision;
        attempt.lastDecisionTerm = term;
        if (decision.state !== DECISION.ABSENT) {
          answer = retainedRepairObservationReply(service, payload, decision);
          return this.settleRetainedRepairDecision(attempt, decision);
        }
        if (attempt.entryId !== null && attempt.entryId !== payload.entryId) {
          answer = retainedRepairObservationReply(service, payload, decision);
          return false;
        }
        attempt.entryId = payload.entryId;
        attempt.body = payload.body;
        attempt.nativeService = service;
        attempt.expectedOwner = {nodeId: service.nodeId, replicaId: service.replicaId};
        attempt.delegated = null;
        const satisfied = await this.submitRetainedRepairAsIngress(attempt, term);
        answer = attempt.lastAnswer;
        return satisfied;
      });
      if (answer !== undefined) return answer;
      return this.acceptRetainedPlacementRepairRequest(service, payload, submitNative);
    },

    async submitRetainedRepairAsIngress(attempt, term) {
      attempt.nativeIngressTerm = term;
      attempt.nativeAnswerPromise = null;
      try {
        return await this.submitRetainedPlacementRepairAttempt(attempt.operation, attempt);
      } finally {
        attempt.nativeIngressTerm = null;
      }
    },

    async resolvePriorRetainedRepairAttempt(service, payload, attempt, term) {
      if (attempt.entryId === null || attempt.entryId === payload.entryId) return;
      if (!ownsIngress(service, term)) return;
      // Resolve the original E1, never mint a replacement while it is unknown.
      // This exact native callback can enter while our serial decision awaits it.
      await this.submitRetainedRepairAsIngress(attempt, term);
    },
  });
}

export {assignRetainedRepairIngressMethods};

/**
 * The log payload of one learner-side count check: the inputs the decision
 * was actually made on.
 *
 * Every value here is handed in by the single evaluation that decided
 * (`runLearnerPromotionCheck`); this module only renders it. It never reads a
 * source, so it cannot re-read one, and the only derivation it makes is over
 * the summary object the decision already held (quest
 * learner-promotion-guard-inputs-observed).
 *
 * Every list is capped and says how many entries it withheld, so a partition
 * with many replicas or many in-flight operations cannot turn a refusal into
 * an unbounded log line.
 */

import {
  buildPriorityRecoveryBlockedPartitionIds,
} from '../control-plane/priority-recovery-planning-intent.js';
import {
  readPriorityPartitionSummarySource,
} from '../control-plane/priority-partition-summary-source.js';
import {
  SPREAD_CURE_AUTHORIZATION_BINDING_STATE,
  SPREAD_CURE_AUTHORIZATION_OUTCOME,
  SPREAD_CURE_PARTITION_EPOCH_NOT_READ,
  SPREAD_CURE_UNREADABLE_VALUE_DESCRIPTION,
} from '../rebalancer/spread-cure-transition-authorization.js';

// Bound for every list in the payload. Five-node formation carries 4 to 6
// replicas and 1 to 3 in-flight operations per critical partition, so this
// admits the whole live picture and still bounds a pathological one.
const LEARNER_PROMOTION_INPUTS_LIST_LIMIT = 8;
const EVIDENCE_OBJECT_TYPE = 'object';
const NO_ENTRIES_WITHHELD = 0;

// The list is always COPIED before it is frozen: the caller's own array (the
// census rows, the in-flight replica id set) must stay mutable for its owner.
function capList(entries) {
  const list = [...(entries || [])];
  if (list.length <= LEARNER_PROMOTION_INPUTS_LIST_LIMIT) {
    return Object.freeze({
      entries: Object.freeze(list),
      withheld: NO_ENTRIES_WITHHELD,
    });
  }
  return Object.freeze({
    entries: Object.freeze(list.slice(0, LEARNER_PROMOTION_INPUTS_LIST_LIMIT)),
    withheld: list.length - LEARNER_PROMOTION_INPUTS_LIST_LIMIT,
  });
}

function buildNodeReadinessEvidence(nodeReadiness) {
  const reasons = capList(nodeReadiness?.reasons);
  return Object.freeze({
    present: nodeReadiness?.snapshotPresent === true,
    phase: nodeReadiness?.phase ?? null,
    reasons: reasons.entries,
    reasonsWithheld: reasons.withheld,
    draining: nodeReadiness?.draining === true,
    recoveryPending: nodeReadiness?.recoveryPending === true,
  });
}

// `origin` keeps the three names the quest statement fixes, with retained
// winning over memoized; `servedFromMemo` reports the reuse half on its own,
// because a retained answer served from a memo is both.
function buildPlanningAnswerEvidence(planningAnswer, planningAnswerOrigin) {
  const present =
    Boolean(planningAnswer) && typeof planningAnswer === EVIDENCE_OBJECT_TYPE;
  return Object.freeze({
    present,
    publicationEpoch: present ? planningAnswer.publicationEpoch ?? null : null,
    publicationStatus: present ?
      planningAnswer.publicationStatus ?? null :
      null,
    origin: planningAnswerOrigin?.origin ?? null,
    servedFromMemo: planningAnswerOrigin?.servedFromMemo === true,
  });
}

function buildPrioritySummaryEvidence(priorityPartitionSummary) {
  const present =
    Boolean(priorityPartitionSummary) &&
    typeof priorityPartitionSummary === EVIDENCE_OBJECT_TYPE;
  const blockedPartitionIds = capList(present ?
    buildPriorityRecoveryBlockedPartitionIds(priorityPartitionSummary) :
    []);
  return Object.freeze({
    present,
    satisfied: present ? priorityPartitionSummary.satisfied ?? null : null,
    requiredDistinctNodeCount: present ?
      priorityPartitionSummary.requiredDistinctNodeCount ?? null :
      null,
    readyEligibleNodeCount: present ?
      priorityPartitionSummary.readyEligibleNodeCount ?? null :
      null,
    blockedPartitionIds: blockedPartitionIds.entries,
    blockedPartitionIdsWithheld: blockedPartitionIds.withheld,
    source: readPriorityPartitionSummarySource(priorityPartitionSummary),
  });
}

// The planner entry is this partition's own row of the priority summary, so
// its spread gap and ready distinct node count are this partition's.
function buildPlannerEvidence(planner) {
  const reasons = capList(planner?.reasons);
  return Object.freeze({
    ready: planner?.ready ?? null,
    spreadGap: planner?.spreadGap ?? null,
    readyDistinctNodeCount: planner?.readyDistinctNodeCount ?? null,
    requiredDistinctNodeCount: planner?.requiredDistinctNodeCount ?? null,
    reasons: reasons.entries,
    reasonsWithheld: reasons.withheld,
  });
}

function buildCountedOperationsEvidence(activeOperationContexts, completion) {
  const counted = capList((activeOperationContexts || []).map(
    (operationContext) => Object.freeze({
      operationId: operationContext?.operationId ?? null,
      type: operationContext?.type ?? null,
      status: operationContext?.status ?? null,
      workflowStep: operationContext?.workflowStep ?? null,
    }),
  ));
  return Object.freeze({
    activeOperationCount: completion?.activeOperationCount ?? null,
    counted: counted.entries,
    countedWithheld: counted.withheld,
  });
}

function buildCompletionEvidence(completion) {
  return Object.freeze({
    state: completion?.state ?? null,
    reasonCode: completion?.reasonCode ?? null,
    temporaryOverflowVoterBudget:
      completion?.temporaryOverflowVoterBudget ?? null,
  });
}

function buildPriorityRecoveryEvidence(priorityRecovery) {
  if (!priorityRecovery || typeof priorityRecovery !== EVIDENCE_OBJECT_TYPE) {
    // The named state for an ordinary partition: main never resolves the
    // priority-recovery completion there, so there is nothing to state.
    return Object.freeze({evaluated: false});
  }
  return Object.freeze({
    evaluated: true,
    nodeReadiness: buildNodeReadinessEvidence(priorityRecovery.nodeReadiness),
    planningAnswer: buildPlanningAnswerEvidence(
      priorityRecovery.planningAnswer,
      priorityRecovery.planningAnswerOrigin,
    ),
    prioritySummary: buildPrioritySummaryEvidence(
      priorityRecovery.priorityPartitionSummary,
    ),
    planner: buildPlannerEvidence(priorityRecovery.planner),
    operations: buildCountedOperationsEvidence(
      priorityRecovery.activeOperationContexts,
      priorityRecovery.completion,
    ),
    completion: buildCompletionEvidence(priorityRecovery.completion),
  });
}

// The spread-cure transition authorization the guard decoded, evaluated and
// is about to state (quest critical-spread-transition-authority-carry). It is
// FIXED-ARITY: every field is either the authorization's own value or an
// explicit absent one, and a malformed durable value is named by its type and
// a bounded size rather than echoed, so a corrupt row cannot grow this line.
// `partitionMembershipEpoch` is this partition's own reading of the published
// membership generation, absent when no record was present to judge.
//
// The three absent shapes below are named records rather than a chain of
// optional reads: a missing half of the evidence is one substitution, not a
// question asked once per field.
const ABSENT_AUTHORIZATION_BINDING = Object.freeze({
  state: SPREAD_CURE_AUTHORIZATION_BINDING_STATE.ABSENT,
  authorization: null,
  raw: null,
});
const ABSENT_AUTHORIZATION_EVALUATION = Object.freeze({
  outcome: SPREAD_CURE_AUTHORIZATION_OUTCOME.NOT_HONOURED,
  honoured: false,
  reason: null,
  authorizedResultingVoterCount: null,
  wouldBeWithinAuthorizedBound: null,
});
const ABSENT_AUTHORIZATION_RECORD = Object.freeze({
  intent: null,
  desiredReplicationFactor: null,
  observedMembershipEpoch: null,
  observedVoterCount: null,
  destinationNodeId: null,
  destinationReplicaId: null,
  operationId: null,
});
const ABSENT_TRANSITION_AUTHORIZATION = Object.freeze({
  binding: ABSENT_AUTHORIZATION_BINDING,
  evaluation: ABSENT_AUTHORIZATION_EVALUATION,
  partitionMembershipEpoch: SPREAD_CURE_PARTITION_EPOCH_NOT_READ,
});

function readEvidenceRecord(value, absentRecord) {
  return value && typeof value === EVIDENCE_OBJECT_TYPE ? value : absentRecord;
}

function renderTransitionAuthorizationEvidence(authorization) {
  const source = readEvidenceRecord(
    authorization, ABSENT_TRANSITION_AUTHORIZATION);
  const binding = readEvidenceRecord(
    source.binding, ABSENT_AUTHORIZATION_BINDING);
  const evaluation = readEvidenceRecord(
    source.evaluation, ABSENT_AUTHORIZATION_EVALUATION);
  const record = readEvidenceRecord(
    binding.authorization, ABSENT_AUTHORIZATION_RECORD);
  const state = binding.state ?? ABSENT_AUTHORIZATION_BINDING.state;
  return Object.freeze({
    state,
    present: state === SPREAD_CURE_AUTHORIZATION_BINDING_STATE.PRESENT,
    // Three named outcomes, not two: honoured, refused, and "every other
    // criterion passed and nobody applied the membership fence". The carry
    // stage reads no epoch, so the third is what a valid record gets here.
    outcome: evaluation.outcome ?? ABSENT_AUTHORIZATION_EVALUATION.outcome,
    honoured: evaluation.honoured === true,
    reason: evaluation.reason ?? null,
    intent: record.intent,
    desiredReplicationFactor: record.desiredReplicationFactor,
    observedMembershipEpoch: record.observedMembershipEpoch,
    // Not a number and not absent: this stage never read one, and the
    // payload names that rather than printing a zero somebody could mistake
    // for a bootstrap epoch.
    partitionMembershipEpoch: source.partitionMembershipEpoch ??
      SPREAD_CURE_PARTITION_EPOCH_NOT_READ,
    observedVoterCount: record.observedVoterCount,
    authorizedResultingVoterCount:
      evaluation.authorizedResultingVoterCount ?? null,
    destinationNodeId: record.destinationNodeId,
    destinationReplicaId: record.destinationReplicaId,
    operationId: record.operationId,
    // ONLY the arithmetic votersAfterPromotion <= authorizedResultingVoterCount,
    // stated so a lab run can count the refusals the successor quest flips
    // without changing one of them here. A lab count must AND it with
    // `outcome === 'honoured'`: a refused or unfenced authorization can still
    // be within its own bound.
    wouldBeWithinAuthorizedBound:
      evaluation.wouldBeWithinAuthorizedBound ?? null,
    malformedValue: binding.raw ?? null,
  });
}

// The record this renderer states when it cannot read what it was handed at
// all - a revoked Proxy, a trap that throws. The payload is a log line on the
// promotion recheck path: a hostile or corrupt value must become a named,
// bounded statement here, never an exception out of the guard.
const UNREADABLE_TRANSITION_AUTHORIZATION = Object.freeze({
  state: SPREAD_CURE_AUTHORIZATION_BINDING_STATE.MALFORMED,
  present: false,
  outcome: SPREAD_CURE_AUTHORIZATION_OUTCOME.NOT_HONOURED,
  honoured: false,
  reason: null,
  intent: null,
  desiredReplicationFactor: null,
  observedMembershipEpoch: null,
  partitionMembershipEpoch: SPREAD_CURE_PARTITION_EPOCH_NOT_READ,
  observedVoterCount: null,
  authorizedResultingVoterCount: null,
  destinationNodeId: null,
  destinationReplicaId: null,
  operationId: null,
  wouldBeWithinAuthorizedBound: null,
  malformedValue: SPREAD_CURE_UNREADABLE_VALUE_DESCRIPTION,
});

function buildTransitionAuthorizationEvidence(authorization) {
  try {
    return renderTransitionAuthorizationEvidence(authorization);
  } catch (_error) {
    return UNREADABLE_TRANSITION_AUTHORIZATION;
  }
}

/**
 * Render the decided-on inputs of one count check as a bounded log payload.
 *
 * @param {Object} observation - Values from the evaluation that decided.
 * @return {Object} Frozen log payload.
 */
function buildLearnerPromotionCountCheckInputs(observation = {}) {
  const voterReplicas = capList(observation.voterReplicas);
  const learnerReplicaIds = capList(observation.learnerReplicaIds);
  const inFlightReplicaIds = capList(observation.inFlightAddLikeReplicaIds);
  return Object.freeze({
    criticalSystemPartition: observation.isCriticalSystemPartition === true,
    joining: observation.isJoiningExistingGroup === true,
    allowances: observation.decision?.allowances ?? null,
    // The cap the decision produced, nested: the refusal line's own
    // top-level maxAllowedVotersAfterPromotion is the unchanged existing
    // contract, and this record stays self-contained for the pass line too.
    maxAllowedVotersAfterPromotion:
      observation.decision?.maxAllowedVotersAfterPromotion ?? null,
    membership: Object.freeze({
      voterReplicas: voterReplicas.entries,
      voterReplicasWithheld: voterReplicas.withheld,
      learnerReplicaIds: learnerReplicaIds.entries,
      learnerReplicaIdsWithheld: learnerReplicaIds.withheld,
      activeVoterCount: observation.activeVoterCount ?? null,
      learnerCount: observation.learnerCount ?? null,
      observedActiveVoterCount: observation.observedActiveVoterCount ?? null,
      observedLearnerCount: observation.observedLearnerCount ?? null,
      targetReplicaCount: observation.targetReplicaCount ?? null,
      targetReplicaCountSource: observation.targetReplicaCountSource ?? null,
    }),
    inFlightAddLike: Object.freeze({
      replicaIds: inFlightReplicaIds.entries,
      replicaIdsWithheld: inFlightReplicaIds.withheld,
      ownedByThisLearner: observation.hasOwnedAddLikeOperation === true,
    }),
    priorityRecovery: buildPriorityRecoveryEvidence(
      observation.priorityRecovery,
    ),
    authorization: buildTransitionAuthorizationEvidence(
      observation.authorization,
    ),
  });
}

export {
  LEARNER_PROMOTION_INPUTS_LIST_LIMIT,
  buildLearnerPromotionCountCheckInputs,
};

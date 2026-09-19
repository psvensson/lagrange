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
  });
}

export {
  LEARNER_PROMOTION_INPUTS_LIST_LIMIT,
  buildLearnerPromotionCountCheckInputs,
};

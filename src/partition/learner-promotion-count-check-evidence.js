/**
 * The log payload of one learner-side count check: the inputs the decision
 * was actually made on.
 *
 * Every value here is handed in by the single evaluation that decided
 * (`runLearnerPromotionCheck`); this module only renders it. It never reads a
 * source, so it cannot re-read one. The two derivations it makes are both
 * over material that one evaluation already produced: the summary object the
 * decision held (quest learner-promotion-guard-inputs-observed), and that
 * evaluation's own closure record - its route, witness and decision
 * snapshots - read from beside that summary (quest
 * closure-witness-route-observed).
 *
 * Every list is capped and says how many entries it withheld, so a partition
 * with many replicas or many in-flight operations cannot turn a refusal into
 * an unbounded log line.
 */

import {
  buildPriorityRecoveryBlockedPartitionIds,
} from '../control-plane/priority-recovery-planning-intent.js';
import {
  PRIORITY_PARTITION_SUMMARY_SOURCE,
  readPriorityPartitionSummaryClosureChoice,
  readPriorityPartitionSummarySource,
} from '../control-plane/priority-partition-summary-source.js';
import {
  PRIORITY_RECOVERY_CLOSURE_EVIDENCE_ROUTE,
} from '../control-plane/membership-publication-readiness-repair.js';

// Bound for every list in the payload. Five-node formation carries 4 to 6
// replicas and 1 to 3 in-flight operations per critical partition, so this
// admits the whole live picture and still bounds a pathological one.
const LEARNER_PROMOTION_INPUTS_LIST_LIMIT = 8;
const EVIDENCE_OBJECT_TYPE = 'object';
const NO_ENTRIES_WITHHELD = 0;

// Why a closure value is not in the payload. Each is an explicit named state
// in the field the value would have occupied: the route taken decides which
// evidence exists, and a reader must be able to tell "there was none" from
// "nobody looked" (quest closure-witness-route-observed).
const LEARNER_PROMOTION_CLOSURE_ABSENT = Object.freeze({
  NO_CLOSURE_CHOICE: 'unavailable_no_closure_choice_recorded',
  NO_WITNESS: 'unavailable_no_closure_witness',
  RETAINED_ROUTE: 'unavailable_on_retained_route',
  NO_DECISION_SNAPSHOTS: 'unavailable_no_decision_snapshots',
  PARTITION_NOT_TRACKED: 'unavailable_partition_not_tracked',
  NO_BASE_SUMMARY: 'unavailable_no_base_summary',
});
const DECISION_SNAPSHOT_LIST_KEY = 'snapshots';

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

// The witness half: what the closure witness said, and what it had left
// unresolved when it said it. `absent` is the state that stands in for every
// field when the route produced no witness at all.
function buildClosureWitnessEvidence(closureWitness, absent) {
  const present =
    Boolean(closureWitness) &&
    typeof closureWitness === EVIDENCE_OBJECT_TYPE;
  const unresolved = capList(present ?
    closureWitness.unresolvedSemanticStateIds :
    []);
  const blocked = capList(present ? closureWitness.blockedPartitionIds : []);
  return Object.freeze({
    state: present ? closureWitness.state ?? absent : absent,
    summarySpreadPending: present ?
      closureWitness.summarySpreadPending ?? absent :
      absent,
    unresolvedSemanticStateIds: unresolved.entries,
    unresolvedSemanticStateIdsWithheld: unresolved.withheld,
    blockedPartitionIds: blocked.entries,
    blockedPartitionIdsWithheld: blocked.withheld,
  });
}

// This partition's own row of the decision snapshots the closure witness was
// built from. The snapshots hold one entry per operation, so the satisfying
// operations are read off the entries whose operation the partition's spread
// completion counted — no row, snapshot or answer is read again.
function buildClosureDecisionEvidence(decisionSnapshots, partitionId, absent) {
  const snapshots = Array.isArray(
    decisionSnapshots?.[DECISION_SNAPSHOT_LIST_KEY],
  ) ?
    decisionSnapshots[DECISION_SNAPSHOT_LIST_KEY].filter(
      (snapshot) => snapshot?.partitionId === partitionId,
    ) :
    null;
  if (snapshots === null || snapshots.length === 0) {
    return Object.freeze({
      semanticState: absent,
      spreadCompletionReasonCode: absent,
      satisfyingOperations: Object.freeze([]),
      satisfyingOperationsWithheld: NO_ENTRIES_WITHHELD,
    });
  }
  const [partitionSnapshot] = snapshots;
  const satisfyingOperationIds = Array.isArray(
    partitionSnapshot.spreadCompletion?.satisfyingOperationIds,
  ) ?
    partitionSnapshot.spreadCompletion.satisfyingOperationIds :
    [];
  const satisfying = capList(satisfyingOperationIds.map((operationId) => {
    const operation = snapshots
      .map((snapshot) => snapshot.coordinator?.operation)
      .find((context) => context?.operationId === operationId);
    return Object.freeze({
      operationId,
      targetNodeId: operation?.targetNodeId ?? null,
      targetVisibilityState: operation?.targetVisibilityState ?? null,
    });
  }));
  return Object.freeze({
    semanticState: partitionSnapshot.semanticState ?? absent,
    spreadCompletionReasonCode:
      partitionSnapshot.spreadCompletion?.reasonCode ?? absent,
    satisfyingOperations: satisfying.entries,
    satisfyingOperationsWithheld: satisfying.withheld,
  });
}

// The summary the closure choice was made AGAINST, before the witness's
// refreshed one was allowed to win it.
function buildClosureBaseSummaryEvidence(choice, partitionId, absent) {
  const baseSummary = choice.baseSummary;
  if (!baseSummary || typeof baseSummary !== EVIDENCE_OBJECT_TYPE) {
    return Object.freeze({
      satisfied: absent,
      source: absent,
      thisPartitionBlocked: absent,
    });
  }
  return Object.freeze({
    satisfied: baseSummary.satisfied ?? absent,
    source: choice.baseSummarySource,
    thisPartitionBlocked:
      buildPriorityRecoveryBlockedPartitionIds(baseSummary)
        .includes(partitionId),
  });
}

// Which of the closure evidence owner's three routes produced the witness
// the chosen summary was decided against, and what that route left behind.
// Everything here is read from the record the ONE evaluation wrote beside
// the summary the guard holds; `witnessMatchesAnswer` says whether that
// record's witness is the witness the answer itself carries, which is how a
// reader tells a record written for this answer from one a later derivation
// of the same summary object overwrote.
function buildClosureRouteEvidence(priorityRecovery) {
  const choice = readPriorityPartitionSummaryClosureChoice(
    priorityRecovery.priorityPartitionSummary,
  );
  const partitionId = priorityRecovery.partitionId ?? null;
  const unrecorded =
    choice.closureRoute === PRIORITY_PARTITION_SUMMARY_SOURCE.UNRECORDED;
  const routeAbsent = unrecorded ?
    LEARNER_PROMOTION_CLOSURE_ABSENT.NO_CLOSURE_CHOICE :
    LEARNER_PROMOTION_CLOSURE_ABSENT.NO_WITNESS;
  const decisionAbsent = unrecorded ?
    LEARNER_PROMOTION_CLOSURE_ABSENT.NO_CLOSURE_CHOICE :
    resolveClosureDecisionAbsentState(choice);
  return Object.freeze({
    route: choice.closureRoute,
    witnessMatchesAnswer: unrecorded ?
      LEARNER_PROMOTION_CLOSURE_ABSENT.NO_CLOSURE_CHOICE :
      choice.closureWitness ===
        (priorityRecovery.planningAnswer?.priorityRecoveryClosureWitness ??
          null),
    witness: buildClosureWitnessEvidence(choice.closureWitness, routeAbsent),
    partition: buildClosureDecisionEvidence(
      choice.decisionSnapshots,
      partitionId,
      decisionAbsent,
    ),
    baseSummary: buildClosureBaseSummaryEvidence(
      choice,
      partitionId,
      unrecorded ?
        LEARNER_PROMOTION_CLOSURE_ABSENT.NO_CLOSURE_CHOICE :
        LEARNER_PROMOTION_CLOSURE_ABSENT.NO_BASE_SUMMARY,
    ),
  });
}

// Why this partition has no decision row: the route built none, or it built
// them and this partition was not one of the ones it tracked.
function resolveClosureDecisionAbsentState(choice) {
  if (choice.closureRoute === PRIORITY_RECOVERY_CLOSURE_EVIDENCE_ROUTE.RETAINED) {
    return LEARNER_PROMOTION_CLOSURE_ABSENT.RETAINED_ROUTE;
  }
  if (!choice.decisionSnapshots) {
    return LEARNER_PROMOTION_CLOSURE_ABSENT.NO_DECISION_SNAPSHOTS;
  }
  return LEARNER_PROMOTION_CLOSURE_ABSENT.PARTITION_NOT_TRACKED;
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
    closure: buildClosureRouteEvidence(priorityRecovery),
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
  LEARNER_PROMOTION_CLOSURE_ABSENT,
  LEARNER_PROMOTION_INPUTS_LIST_LIMIT,
  buildLearnerPromotionCountCheckInputs,
};

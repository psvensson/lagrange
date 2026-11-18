// The durable condition the ordinary-work release fence's stability dwell
// stands for. background-priority-spread-release-tracker.js owns the dwell
// law (the clock runs only from a HELD observation); this module is the
// one observer of the condition a rebalancer evaluation hands it:
//
//  1. no non-terminal fence-holding operation of any phase: priority
//     control-plane placement (REPLACE source-removal ACTIVE/STOPPING
//     included) or the founding of a partition (schema/table founding
//     ADDs), and
//  2. every member node priority placement requires is serve-eligible.
//
// Where each input is read from:
//
//  1. replica_operations rows through the rebalancer's SystemTableCache, a
//     CACHE PROJECTION that can lag or miss a committed row: an operation it
//     shows is IN_FLIGHT, but its emptiness is never CLEAR. CLEAR needs the
//     ledger owner's census (priority-spread-fence-operation-census.js)
//     answered within the stability window with no fence-blocking
//     operation; an unanswered or older census is the named UNAVAILABLE
//     hold (no dwell restart) and requests one.
//  2. the required member cohort from the readiness owner's priority
//     recovery planning answer (a readiness-owner PROJECTION, the same
//     answer and cohort resolver the spread blocker uses), and each
//     member's serve eligibility from the readiness owner's committed-epoch
//     serve record (answerServeCohort), consumed as answered and never
//     re-derived. An absent answer, an unstated cohort or an unavailable
//     record is the named UNAVAILABLE hold.
//
// Explicit-context module: every function takes the rebalancer first.
import {UNIFIED_REBALANCER_SHARED} from './unified-rebalancer-shared.js';
import {
  BACKGROUND_PRIORITY_SPREAD_RELEASE_CONDITION_STATE,
} from './background-priority-spread-release-tracker.js';
import {
  SERVE_ELIGIBILITY_STATE,
  isServeEligibilityAnswerEligible,
} from '../control-plane/serve-eligibility-owner.js';
import {readPriorityRecoveryPlanningAnswerSync} from
  '../control-plane/priority-recovery-planning-answer-origin.js';
import {
  FENCE_OPERATION_CENSUS_STATE,
  readFenceOperationCensus,
  requestFenceOperationCensus,
} from './priority-spread-fence-operation-census.js';

const {
  SYSTEM_TABLE_NAME,
  normalizeReplicaOperationRecord,
  resolvePriorityRecoveryActiveNodeCohort,
} = UNIFIED_REBALANCER_SHARED;

const PRIORITY_TRANSITION_STATE = Object.freeze({
  CLEAR: 'clear',
  IN_FLIGHT: 'in_flight',
  UNAVAILABLE: 'unavailable',
});

const REQUIRED_NODE_SERVE_STATE = Object.freeze({
  ELIGIBLE: 'eligible',
  NOT_ELIGIBLE: 'not_eligible',
  UNAVAILABLE: 'unavailable',
});

const RELEASE_CONDITION_UNAVAILABLE_REASON = Object.freeze({
  OPERATION_PROJECTION_UNREADABLE: 'operation_projection_unreadable',
  OPERATION_CENSUS_UNANSWERED: 'operation_census_unanswered',
  PLANNING_ANSWER_ABSENT: 'priority_planning_answer_absent',
  REQUIRED_COHORT_UNSTATED: 'required_node_cohort_unstated',
  SERVE_ANSWER_ABSENT: 'serve_eligibility_answer_absent',
  SERVE_RECORD_UNAVAILABLE: 'serve_eligibility_record_unavailable',
});

const OPERATION_PROJECTION_SOURCE = 'system_table_cache';
const OPERATION_CENSUS_SOURCE = 'operation_ledger_owner_census';
// A census older than this share of the stability window is refreshed ahead
// of need, so a held condition is not interrupted by its own expiry.
const CENSUS_REFRESH_WINDOW_DIVISOR = 2;
// A lab log line stays readable: at most this many operations are listed
// per group, and the number left out is stated beside them.
const LOGGED_OPERATION_LIMIT = 16;
const NO_OPERATIONS = Object.freeze([]);
const NO_NODE_IDS = Object.freeze([]);

function describeOperations(operations, observedAt) {
  const listed = operations.slice(0, LOGGED_OPERATION_LIMIT).map((operation) => {
    const record = normalizeReplicaOperationRecord(operation, {
      nowMs: observedAt,
    });
    return Object.freeze({
      operationId: record.operationId,
      partitionId: record.partitionId,
      type: record.type,
      workflowStep: record.workflowStep,
    });
  });
  return Object.freeze({
    count: operations.length,
    operations: Object.freeze(listed),
    withheldCount: operations.length - listed.length,
  });
}

/**
 * Input 1. One pass over the cached replica_operations rows, classified by
 * the two separately owned predicates: the fence's (any non-terminal
 * priority control-plane transition) and the planner's exclusion (rows the
 * planner's blocking count leaves out), reported side by side.
 * @param {Object} rebalancer
 * @param {number} observedAt
 * @return {Object}
 */
function observePriorityTransitions(rebalancer, observedAt) {
  const trackedOperations = rebalancer.systemTableCache.filter(
    SYSTEM_TABLE_NAME.REPLICA_OPERATIONS,
    (operation) => rebalancer.isTrackedInFlightOperation(operation),
  );
  if (!Array.isArray(trackedOperations)) {
    return Object.freeze({
      state: PRIORITY_TRANSITION_STATE.UNAVAILABLE,
      reason:
        RELEASE_CONDITION_UNAVAILABLE_REASON.OPERATION_PROJECTION_UNREADABLE,
      source: OPERATION_PROJECTION_SOURCE,
      fenceBlocking: describeOperations(NO_OPERATIONS, observedAt),
      plannerExcluded: describeOperations(NO_OPERATIONS, observedAt),
    });
  }
  const fenceBlockingOperations = trackedOperations.filter((operation) =>
    rebalancer.isPrioritySpreadReleaseFenceBlockingOperation(operation));
  const plannerExcluded = describeOperations(
    trackedOperations.filter((operation) =>
      !rebalancer.isTopologyBlockingInFlightOperation(operation)),
    observedAt);
  if (fenceBlockingOperations.length > 0) {
    return Object.freeze({
      state: PRIORITY_TRANSITION_STATE.IN_FLIGHT,
      reason: null,
      source: OPERATION_PROJECTION_SOURCE,
      fenceBlocking: describeOperations(fenceBlockingOperations, observedAt),
      plannerExcluded,
    });
  }
  return observeCensusPriorityTransitions(rebalancer, observedAt,
    plannerExcluded);
}

// An empty projection is not CLEAR: the ledger owner's census decides.
function observeCensusPriorityTransitions(
  rebalancer, observedAt, plannerExcluded) {
  const windowMs = rebalancer.getBackgroundPrioritySpreadStableWindowMs();
  const census = readFenceOperationCensus(rebalancer, observedAt, windowMs);
  if (census.state !== FENCE_OPERATION_CENSUS_STATE.ANSWERED ||
      observedAt - census.answeredAtMs >
        windowMs / CENSUS_REFRESH_WINDOW_DIVISOR) {
    requestFenceOperationCensus(rebalancer, {
      held: census.state !== FENCE_OPERATION_CENSUS_STATE.ANSWERED,
    });
  }
  if (census.state !== FENCE_OPERATION_CENSUS_STATE.ANSWERED) {
    return Object.freeze({
      state: PRIORITY_TRANSITION_STATE.UNAVAILABLE,
      reason: RELEASE_CONDITION_UNAVAILABLE_REASON.OPERATION_CENSUS_UNANSWERED,
      source: OPERATION_CENSUS_SOURCE,
      fenceBlocking: describeOperations(NO_OPERATIONS, observedAt),
      plannerExcluded,
    });
  }
  const censusBlockingOperations = census.operations.filter((operation) =>
    rebalancer.isPrioritySpreadReleaseFenceBlockingOperation(operation));
  // Only the census shows these (the projection drained or never had
  // them): the census may be the stale side, so it is re-asked.
  if (censusBlockingOperations.length > 0) {
    requestFenceOperationCensus(rebalancer);
  }
  return Object.freeze({
    state: censusBlockingOperations.length === 0 ?
      PRIORITY_TRANSITION_STATE.CLEAR :
      PRIORITY_TRANSITION_STATE.IN_FLIGHT,
    reason: null,
    source: OPERATION_CENSUS_SOURCE,
    fenceBlocking: describeOperations(censusBlockingOperations, observedAt),
    plannerExcluded,
  });
}

function unavailableRequiredNodeServe(reason, requiredNodeIds = NO_NODE_IDS) {
  return Object.freeze({
    state: REQUIRED_NODE_SERVE_STATE.UNAVAILABLE,
    reason,
    requiredNodeIds,
    nodes: Object.freeze({}),
  });
}

// One member's answer as the serve owner gave it; nothing is re-decided.
function describeNodeServeAnswer(answer) {
  if (!answer || typeof answer !== 'object') {
    return Object.freeze({
      eligibility: REQUIRED_NODE_SERVE_STATE.UNAVAILABLE,
      reason: RELEASE_CONDITION_UNAVAILABLE_REASON.SERVE_ANSWER_ABSENT,
    });
  }
  if (answer.state !== SERVE_ELIGIBILITY_STATE.READY) {
    return Object.freeze({
      eligibility: REQUIRED_NODE_SERVE_STATE.UNAVAILABLE,
      reason: answer.reason,
    });
  }
  if (isServeEligibilityAnswerEligible(answer)) {
    return Object.freeze({eligibility: REQUIRED_NODE_SERVE_STATE.ELIGIBLE});
  }
  return Object.freeze({
    eligibility: REQUIRED_NODE_SERVE_STATE.NOT_ELIGIBLE,
    reasons: Object.freeze([...answer.reasons]),
  });
}

function resolveRequiredNodeServeState(nodeAnswers) {
  const eligibilities = Object.values(nodeAnswers)
    .map((nodeAnswer) => nodeAnswer.eligibility);
  if (eligibilities.includes(REQUIRED_NODE_SERVE_STATE.NOT_ELIGIBLE)) {
    return REQUIRED_NODE_SERVE_STATE.NOT_ELIGIBLE;
  }
  return eligibilities.includes(REQUIRED_NODE_SERVE_STATE.UNAVAILABLE) ?
    REQUIRED_NODE_SERVE_STATE.UNAVAILABLE :
    REQUIRED_NODE_SERVE_STATE.ELIGIBLE;
}

/**
 * The member nodes whose serve eligibility the dwell waits on: the planning
 * owner's active cohort AND every member of the durable published
 * membership. The planning cohort leaves out a member it currently excludes
 * on readiness (a joiner whose serve lease is not yet granted), which made
 * this leg vacuous for exactly the node it must wait for; a published
 * member is required whatever its readiness says, and its serve owner
 * answer decides.
 * @param {Object} rebalancer
 * @param {Array<string>} activeNodeIds
 * @return {Array<string>}
 */
function resolveRequiredMemberNodeIds(rebalancer, activeNodeIds) {
  const publishedMembers = rebalancer.getPublishedActiveNodeIdSet();
  return Object.freeze([...new Set([
    ...activeNodeIds,
    ...(publishedMembers === null ? NO_NODE_IDS : publishedMembers),
  ])].sort());
}

/**
 * Input 2. The member nodes priority placement requires (the readiness
 * owner's priority-recovery active cohort) and the committed serve answer
 * of each.
 * @param {Object} rebalancer
 * @param {number} observedAt
 * @return {Object}
 */
function observeRequiredNodeServeEligibility(rebalancer, observedAt) {
  const readinessService = rebalancer.controlPlaneReadinessService;
  const planningAnswer = readPriorityRecoveryPlanningAnswerSync(
    readinessService,
    rebalancer.nodeId,
    observedAt,
  );
  if (!planningAnswer) {
    return unavailableRequiredNodeServe(
      RELEASE_CONDITION_UNAVAILABLE_REASON.PLANNING_ANSWER_ABSENT,
    );
  }
  const requiredNodeIds = resolveRequiredMemberNodeIds(rebalancer,
    resolvePriorityRecoveryActiveNodeCohort(planningAnswer).activeNodeIds);
  if (requiredNodeIds.length === 0) {
    return unavailableRequiredNodeServe(
      RELEASE_CONDITION_UNAVAILABLE_REASON.REQUIRED_COHORT_UNSTATED,
    );
  }
  const cohortAnswer = readinessService.answerServeCohort([...requiredNodeIds]);
  if (!cohortAnswer || typeof cohortAnswer !== 'object') {
    return unavailableRequiredNodeServe(
      RELEASE_CONDITION_UNAVAILABLE_REASON.SERVE_ANSWER_ABSENT,
      requiredNodeIds,
    );
  }
  const memberAnswers = cohortAnswer.answers;
  const nodes = Object.freeze(Object.fromEntries(requiredNodeIds.map(
    (nodeId) => [nodeId, describeNodeServeAnswer(memberAnswers?.[nodeId])],
  )));
  if (cohortAnswer.state !== SERVE_ELIGIBILITY_STATE.READY) {
    return Object.freeze({
      state: REQUIRED_NODE_SERVE_STATE.UNAVAILABLE,
      reason: typeof cohortAnswer.reason === 'string' ?
        cohortAnswer.reason :
        RELEASE_CONDITION_UNAVAILABLE_REASON.SERVE_RECORD_UNAVAILABLE,
      requiredNodeIds,
      nodes,
    });
  }
  return Object.freeze({
    state: resolveRequiredNodeServeState(nodes),
    reason: null,
    requiredNodeIds,
    nodes,
  });
}

// One decision over both inputs: a definite negative outranks an unknown,
// and only two definite positives are HELD.
function resolveReleaseConditionState(priorityTransitions, requiredNodeServe) {
  if (
    priorityTransitions.state === PRIORITY_TRANSITION_STATE.IN_FLIGHT ||
    requiredNodeServe.state === REQUIRED_NODE_SERVE_STATE.NOT_ELIGIBLE
  ) {
    return BACKGROUND_PRIORITY_SPREAD_RELEASE_CONDITION_STATE.NOT_HELD;
  }
  if (
    priorityTransitions.state === PRIORITY_TRANSITION_STATE.CLEAR &&
    requiredNodeServe.state === REQUIRED_NODE_SERVE_STATE.ELIGIBLE
  ) {
    return BACKGROUND_PRIORITY_SPREAD_RELEASE_CONDITION_STATE.HELD;
  }
  return BACKGROUND_PRIORITY_SPREAD_RELEASE_CONDITION_STATE.UNAVAILABLE;
}

/**
 * Observe the durable release condition for one evaluation.
 * @param {Object} rebalancer
 * @param {Object} options
 * @param {number} options.observedAt
 * @return {{state: string, priorityTransitions: Object,
 *   requiredNodeServe: Object}}
 */
function observeBackgroundPrioritySpreadReleaseCondition(
  rebalancer,
  {observedAt},
) {
  const priorityTransitions =
    observePriorityTransitions(rebalancer, observedAt);
  const requiredNodeServe =
    observeRequiredNodeServeEligibility(rebalancer, observedAt);
  return Object.freeze({
    state: resolveReleaseConditionState(priorityTransitions, requiredNodeServe),
    priorityTransitions,
    requiredNodeServe,
  });
}

/**
 * The fence evidence one log line carries, for both the hold line and the
 * release line: the planner's blocking count, the operations that count
 * leaves out, the fence's own blocking operations, and per-node serve
 * eligibility. A lab log can show from it why the fence held or released.
 * @param {Object} evidence
 * @return {Object}
 */
function buildBackgroundPrioritySpreadFenceLogContext({
  releaseCondition,
  globalTopologyBlockingOperationCount,
  newlyDrainedOperationIds,
}) {
  const {priorityTransitions, requiredNodeServe} = releaseCondition;
  return {
    releaseConditionState: releaseCondition.state,
    globalTopologyBlockingOperationCount,
    plannerExcludedOperationCount: priorityTransitions.plannerExcluded.count,
    plannerExcludedOperations: priorityTransitions.plannerExcluded.operations,
    plannerExcludedOperationsWithheld:
      priorityTransitions.plannerExcluded.withheldCount,
    priorityTransitionState: priorityTransitions.state,
    priorityTransitionUnavailableReason: priorityTransitions.reason,
    priorityTransitionSource: priorityTransitions.source,
    fenceBlockingOperationCount: priorityTransitions.fenceBlocking.count,
    fenceBlockingOperations: priorityTransitions.fenceBlocking.operations,
    fenceBlockingOperationsWithheld:
      priorityTransitions.fenceBlocking.withheldCount,
    requiredNodeServeState: requiredNodeServe.state,
    requiredNodeServeUnavailableReason: requiredNodeServe.reason,
    requiredNodeIds: requiredNodeServe.requiredNodeIds,
    requiredNodeServeEligibility: requiredNodeServe.nodes,
    newlyDrainedFenceHoldingOperationIds: newlyDrainedOperationIds,
  };
}

export {
  buildBackgroundPrioritySpreadFenceLogContext,
  observeBackgroundPrioritySpreadReleaseCondition,
};

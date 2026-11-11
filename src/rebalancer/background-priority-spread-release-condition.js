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
//  1. replica_operations rows through the rebalancer's SystemTableCache.
//     This is a CACHE PROJECTION (READ_MODEL_SOURCE.SYSTEM_TABLE_CACHE), not
//     the durable ledger: it can lag a committed row. The cache states no
//     freshness or hydration, so the only unknown state observable here is
//     a projection that cannot be read, which is the named UNAVAILABLE hold.
//     The freshness contract of this read is separate, later work; no
//     authority polling is added here.
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
  PLANNING_ANSWER_ABSENT: 'priority_planning_answer_absent',
  REQUIRED_COHORT_UNSTATED: 'required_node_cohort_unstated',
  SERVE_ANSWER_ABSENT: 'serve_eligibility_answer_absent',
  SERVE_RECORD_UNAVAILABLE: 'serve_eligibility_record_unavailable',
});

const OPERATION_PROJECTION_SOURCE = 'system_table_cache';
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
  const plannerExcludedOperations = trackedOperations.filter((operation) =>
    !rebalancer.isTopologyBlockingInFlightOperation(operation));
  return Object.freeze({
    state: fenceBlockingOperations.length === 0 ?
      PRIORITY_TRANSITION_STATE.CLEAR :
      PRIORITY_TRANSITION_STATE.IN_FLIGHT,
    reason: null,
    source: OPERATION_PROJECTION_SOURCE,
    fenceBlocking: describeOperations(fenceBlockingOperations, observedAt),
    plannerExcluded: describeOperations(plannerExcludedOperations, observedAt),
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
  const requiredNodeIds =
    resolvePriorityRecoveryActiveNodeCohort(planningAnswer).activeNodeIds;
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

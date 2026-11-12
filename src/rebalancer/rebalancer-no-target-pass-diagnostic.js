// A rebalance pass that needed a move and executed none, stated once per
// change of reason (permanent diagnostic), and the named wait it arms when
// the reason is a deferred planning readiness read.
//
// Lab evidence it answers (local three-node formation): 13.7-16 % of the
// passes that needed a move found no target node, at debug level only. The
// candidate nodes' planning readiness reads had been DEFERRED (the planning
// owner's completed record was not current; it queued a rebuild and answered
// neither ready nor not-ready), and nothing woke the planner when the rebuild
// published; the next pass was the cadence tick.
//
// Explicit-context module: every function takes the rebalancer first.
import {UNIFIED_REBALANCER_SHARED} from './unified-rebalancer-shared.js';
import {
  REBALANCER_WAKE_CONTRACT,
  REBALANCER_WAKE_STATE,
} from './rebalancer-wake.js';

const {REBALANCER_RUNTIME_REASON} = UNIFIED_REBALANCER_SHARED;

/**
 * One candidate node's place in this entity's placement answer.
 */
const AVAILABLE_NODE_PLANNING_STATE = Object.freeze({
  READY: 'ready',
  NOT_READY: 'not_ready',
  // The planning readiness owner answered neither ready nor not-ready.
  DEFERRED: 'deferred',
  OUT_OF_SCOPE: 'out_of_scope',
});

const AVAILABLE_NODE_EXCLUSION_REASON = Object.freeze({
  OUTSIDE_PLACEMENT_SCOPE: 'outside_placement_scope',
  READINESS_DEFERRED: 'readiness_deferred',
  DISPATCH_NOT_READY: 'startup_authority_dispatch_not_ready',
  LIVENESS_NOT_READY: 'liveness_not_ready_now',
  READINESS_DIMENSION_UNSATISFIED: 'readiness_dimension_unsatisfied',
});

/**
 * How a pass that needed a move ended without executing one.
 */
const REBALANCE_PASS_NO_MOVE_EXIT = Object.freeze({
  NO_AVAILABLE_NODES: REBALANCER_RUNTIME_REASON.NO_AVAILABLE_NODES,
  NO_MOVES_PLANNED: 'no_moves_planned',
  SERIAL_GATE: 'serial_gate',
  BUDGET_EXCEEDED: 'budget_exceeded',
  BUDGET_QUERY_FAILED: 'budget_query_failed',
  MOVES_NOT_EXECUTED: 'moves_not_executed',
});

const REBALANCE_PASS_NO_MOVE_LOG_MSG =
  'Rebalance pass needed a move and executed none';
const LOGGED_CANDIDATE_LIMIT = 16;

function describeCandidate(rebalancer, candidate, readinessDecisionDimension) {
  const description = {
    nodeId: candidate.nodeId,
    state: candidate.state,
    reason: candidate.reason,
  };
  if (candidate.state !== AVAILABLE_NODE_PLANNING_STATE.DEFERRED) {
    return description;
  }
  const admission = rebalancer.controlPlaneReadinessService
    ?.describeReadinessPlanningAdmission?.(candidate.nodeId, {
      decisionDimension: readinessDecisionDimension,
    }) || null;
  return {
    ...description,
    admissionState: admission?.admissionState ?? null,
    failedTerms: admission?.failedTerms ?? [],
    deferredForMs: admission?.deferredForMs ?? null,
  };
}

function buildSignature(exit, candidates) {
  return [exit, ...candidates.map((candidate) =>
    `${candidate.nodeId}:${candidate.state}:${candidate.reason}`)].join('|');
}

/**
 * State one pass that needed a move and executed none, and arm the
 * planning-target readiness wait when a deferred read is why no target
 * was found.
 * @param {Object} rebalancer
 * @param {Object} pass
 * @param {string} pass.exit - a REBALANCE_PASS_NO_MOVE_EXIT member
 * @param {Object|null} pass.nodePlan - resolveAvailableNodePlan's answer
 * @param {Object} [pass.detail] - exit-specific evidence
 * @return {{deferredNodeIds: Array<string>, waitArmed: boolean}}
 */
/**
 * The candidate nodes a placement answer read as DEFERRED.
 * @param {Object|null} nodePlan resolveAvailableNodePlan's answer
 * @return {Array<string>}
 */
function resolveDeferredCandidateNodeIds(nodePlan) {
  return (nodePlan?.candidates || [])
    .filter((candidate) =>
      candidate.state === AVAILABLE_NODE_PLANNING_STATE.DEFERRED)
    .map((candidate) => candidate.nodeId);
}

/**
 * Arm the planning-target readiness wait when an answer depended on a
 * DEFERRED candidate; disarm it when it did not (the wait is for the
 * deferral this answer saw, and no other).
 * @param {Object} rebalancer
 * @param {Object|null} nodePlan
 * @return {boolean} whether the wait is armed
 */
function syncPlanningTargetReadinessWake(rebalancer, nodePlan) {
  const deferredNodeIds = resolveDeferredCandidateNodeIds(nodePlan);
  rebalancer.disarmPlanningTargetReadinessWake();
  if (deferredNodeIds.length === 0) {
    return false;
  }
  return rebalancer.armPlanningTargetReadinessWake(deferredNodeIds,
    nodePlan.planningPublicationGeneration);
}

function noteRebalancePassWithoutMove(rebalancer, pass) {
  const candidates = pass.nodePlan?.candidates || [];
  const deferredNodeIds = resolveDeferredCandidateNodeIds(pass.nodePlan);
  const awaitsTarget =
    pass.exit === REBALANCE_PASS_NO_MOVE_EXIT.NO_AVAILABLE_NODES ||
    pass.exit === REBALANCE_PASS_NO_MOVE_EXIT.NO_MOVES_PLANNED;
  const waitArmed = awaitsTarget &&
    syncPlanningTargetReadinessWake(rebalancer, pass.nodePlan);
  const signature = buildSignature(pass.exit, candidates);
  if (rebalancer.lastNoMovePassSignature !== signature) {
    rebalancer.lastNoMovePassSignature = signature;
    const listed = candidates.slice(0, LOGGED_CANDIDATE_LIMIT);
    rebalancer.logger.info(REBALANCE_PASS_NO_MOVE_LOG_MSG, {
      entityId: rebalancer.entityId,
      entityType: rebalancer.entityType,
      exit: pass.exit,
      candidates: listed.map((candidate) => describeCandidate(
        rebalancer, candidate, pass.nodePlan?.readinessDecisionDimension)),
      candidatesWithheld: candidates.length - listed.length,
      deferredNodeIds,
      waitArmed,
      // The wait's declared bound: the cadence check this pass schedules.
      waitBound: waitArmed ? REBALANCER_WAKE_CONTRACT[
        REBALANCER_WAKE_STATE.PLANNING_TARGET_READINESS_DEFERRED].bound : null,
      ...(pass.detail || {}),
    });
  }
  return {deferredNodeIds, waitArmed};
}

/**
 * A pass that executed a move ends the no-move episode: the next no-move
 * pass is stated again even with the same reason. The planning-target
 * readiness wait loses exactly what the executed moves satisfied: a node a
 * move was placed on is no longer awaited; a node the same pass skipped as
 * deferred stays awaited, and the wait is disarmed only when none remains.
 * @param {Object} rebalancer
 * @param {Object} result the pass result (its executed moves)
 */
function noteRebalancePassMoved(rebalancer, result) {
  rebalancer.lastNoMovePassSignature = null;
  rebalancer.releasePlanningTargetReadinessWakeNodes(new Set(result.moves
    .filter((move) => move && !move.skipped && move.success !== false)
    .map((move) => move.nodeId)));
}

export {
  AVAILABLE_NODE_EXCLUSION_REASON,
  AVAILABLE_NODE_PLANNING_STATE,
  REBALANCE_PASS_NO_MOVE_EXIT,
  REBALANCE_PASS_NO_MOVE_LOG_MSG,
  noteRebalancePassMoved,
  noteRebalancePassWithoutMove,
  syncPlanningTargetReadinessWake,
};

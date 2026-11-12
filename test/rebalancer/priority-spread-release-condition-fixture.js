// Readiness inputs of the ordinary-work release fence's durable condition
// (src/rebalancer/background-priority-spread-release-condition.js), for
// tests: the readiness owner's priority-recovery planning answer (the
// required member cohort) and its committed serve cohort answer.
import {
  SERVE_ELIGIBILITY_DECISION,
  SERVE_ELIGIBILITY_STATE,
} from '../../src/control-plane/serve-eligibility-owner.js';

const FIXTURE_PUBLICATION_EPOCH = 1;
const FIXTURE_PUBLICATION_ID = 'cluster_membership-1';
const DEFAULT_REQUIRED_NODE_IDS = Object.freeze(['node-1', 'node-2', 'node-3']);
const READY_LEASE_EXPIRED_REASON = 'ready_lease_expired';
const NODE_ROW_MISSING_REASON = 'node_row_missing';

function buildEpoch(readAtMs) {
  return {
    publicationEpoch: FIXTURE_PUBLICATION_EPOCH,
    publicationId: FIXTURE_PUBLICATION_ID,
    readAtMs,
  };
}

function buildNodeServeAnswer(notEligibleReasons, epoch) {
  const eligible = notEligibleReasons.length === 0;
  return {
    state: SERVE_ELIGIBILITY_STATE.READY,
    decision: eligible ?
      SERVE_ELIGIBILITY_DECISION.ELIGIBLE :
      SERVE_ELIGIBILITY_DECISION.NOT_ELIGIBLE,
    reasons: notEligibleReasons,
    epoch,
  };
}

/**
 * A READY serve cohort answer in the serve owner's shape.
 * @param {Array<string>} nodeIds
 * @param {Object} [notEligibleReasonsByNodeId] nodeId -> failed reasons
 * @param {number} [readAtMs]
 * @return {Object}
 */
function buildServeCohortAnswer(
  nodeIds,
  notEligibleReasonsByNodeId = {},
  readAtMs = 0,
) {
  const epoch = buildEpoch(readAtMs);
  const answers = {};
  const eligibleNodeIds = [];
  for (const nodeId of nodeIds) {
    const reasons = notEligibleReasonsByNodeId[nodeId] || [];
    answers[nodeId] = buildNodeServeAnswer(reasons, epoch);
    if (reasons.length === 0) {
      eligibleNodeIds.push(nodeId);
    }
  }
  return {state: SERVE_ELIGIBILITY_STATE.READY, epoch, answers, eligibleNodeIds};
}

/**
 * An UNAVAILABLE serve cohort answer in the serve owner's shape.
 * @param {string} reason
 * @return {Object}
 */
function buildUnavailableServeCohortAnswer(reason) {
  return {
    state: SERVE_ELIGIBILITY_STATE.UNAVAILABLE,
    reason,
    epoch: null,
    retryAfterMs: null,
    answers: {},
    eligibleNodeIds: [],
  };
}

/**
 * The serve cohort answer of a mock readiness service that knows node rows.
 * @param {Object} options
 * @return {Object}
 */
function buildServeCohortAnswerFromNodeRows({
  nodeIds,
  nodeRows,
  isNodeRowEligible,
  absentNodeEligible,
  readAtMs,
}) {
  const targetNodeIds = Array.isArray(nodeIds) && nodeIds.length > 0 ?
    nodeIds :
    nodeRows.map((row) => row.node_id);
  const notEligibleReasonsByNodeId = {};
  for (const nodeId of targetNodeIds) {
    const nodeRow = nodeRows.find((row) => row.node_id === nodeId);
    if (nodeRow && !isNodeRowEligible(nodeRow)) {
      notEligibleReasonsByNodeId[nodeId] = [READY_LEASE_EXPIRED_REASON];
    } else if (!nodeRow && absentNodeEligible !== true) {
      notEligibleReasonsByNodeId[nodeId] = [NODE_ROW_MISSING_REASON];
    }
  }
  return buildServeCohortAnswer(
    targetNodeIds,
    notEligibleReasonsByNodeId,
    readAtMs,
  );
}

/**
 * State the fence's readiness inputs on a hand-written readiness owner: a
 * planning answer publishing the required cohort, and a serve cohort answer.
 * The returned controls change what the owner answers afterwards.
 * @param {Object} readinessOwner the fake the rebalancers share
 * @param {Array<string>} [requiredNodeIds]
 * @return {Object} controls
 */
function statePrioritySpreadReleaseReadiness(
  readinessOwner,
  requiredNodeIds = DEFAULT_REQUIRED_NODE_IDS,
) {
  const controls = {
    planningAnswer: {publishedActiveNodeIds: [...requiredNodeIds]},
    notEligibleReasonsByNodeId: {},
    serveUnavailableReason: null,
    serveCohortRequests: [],
  };
  readinessOwner.getPriorityRecoveryPlanningAnswerSync =
    () => controls.planningAnswer;
  readinessOwner.answerServeCohort = (nodeIds) => {
    controls.serveCohortRequests.push([...nodeIds]);
    return controls.serveUnavailableReason === null ?
      buildServeCohortAnswer(nodeIds, controls.notEligibleReasonsByNodeId) :
      buildUnavailableServeCohortAnswer(controls.serveUnavailableReason);
  };
  return controls;
}

export {
  buildServeCohortAnswerFromNodeRows,
  statePrioritySpreadReleaseReadiness,
};

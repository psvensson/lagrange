import {
  NODE_STATE,
  STATE,
  TABLES,
} from '../constants/index.js';
import {hasLiveTransportEvidence} from './live-transport-evidence.js';

const EMPTY_STARTUP_AUTHORITY_NODE_ID_SET = new Set();
const EMPTY_STARTUP_AUTHORITY_PLACEMENT_NODE_IDS = Object.freeze([]);
const STARTUP_AUTHORITY_CONTROL_PLANE_PLACEMENT_NODE_STATES = new Set([
  NODE_STATE.ACTIVE,
  NODE_STATE.JOINING,
]);
const FORMATION_COHORT_SPREAD_CURE_CLASSIFICATION = Object.freeze({
  CURE_TARGET: 'cure_target',
  NOT_CURE_TARGET: 'not_cure_target',
});
const FORMATION_COHORT_SPREAD_CURE_STATE = Object.freeze({
  OUTSIDE_PRIORITY_RECOVERY_LANE: 'outside_priority_recovery_lane',
  RECOVERY_CLOSED: 'recovery_closed',
  NOT_JOINING: 'not_joining',
  PLACEMENT_INELIGIBLE: 'placement_ineligible',
  CURE_TARGET: 'cure_target',
});
const FORMATION_COHORT_SPREAD_CURE_STATE_TABLE = Object.freeze([
  Object.freeze({
    state: FORMATION_COHORT_SPREAD_CURE_STATE.OUTSIDE_PRIORITY_RECOVERY_LANE,
    matches: (evidence) => evidence.priorityRecoveryLane !== true,
  }),
  Object.freeze({
    state: FORMATION_COHORT_SPREAD_CURE_STATE.RECOVERY_CLOSED,
    matches: (evidence) =>
      evidence.priorityRecoveryActive !== true &&
      evidence.formationReleaseHandoffActive !== true,
  }),
  Object.freeze({
    state: FORMATION_COHORT_SPREAD_CURE_STATE.NOT_JOINING,
    matches: (evidence) => evidence.joining !== true,
  }),
  Object.freeze({
    state: FORMATION_COHORT_SPREAD_CURE_STATE.PLACEMENT_INELIGIBLE,
    matches: (evidence) => evidence.placementEligible !== true,
  }),
  Object.freeze({
    state: FORMATION_COHORT_SPREAD_CURE_STATE.CURE_TARGET,
    matches: () => true,
  }),
]);

function resolveStartupAuthorityNodeIdSet(startupAuthority) {
  if (startupAuthority?.authorityAvailable !== true) {
    return EMPTY_STARTUP_AUTHORITY_NODE_ID_SET;
  }
  const nodeIds = Array.isArray(startupAuthority.canonicalStartupNodeIds) ?
    startupAuthority.canonicalStartupNodeIds.filter(
      (nodeId) => typeof nodeId === 'string' && nodeId.length > 0,
    ) :
    [];
  return nodeIds.length > 0 ?
    new Set(nodeIds) :
    EMPTY_STARTUP_AUTHORITY_NODE_ID_SET;
}

/**
 * The shared formation-time placement predicate for a node whose public READY
 * lease is still withheld. Startup authority supplies membership, the nodes
 * row supplies JOINING/ACTIVE + CONNECTED/READY registration, and the live
 * router supplies reachability. JOINING is admitted only through callers that
 * have already selected the control-plane recovery dimension and priority
 * partition classifier. Self-inclusion remains an explicit caller choice.
 *
 * @param {Object} options
 * @param {Object} options.node
 * @param {Set<string>} options.startupAuthorityNodeIds
 * @param {Object} options.messageRouter
 * @param {string|null} options.localNodeId
 * @param {boolean} options.includeSelf
 * @return {boolean}
 */
function readStartupAuthorityPlacementNodeId(node) {
  const nodeId = node?.node_id || node?.nodeId || null;
  return typeof nodeId === 'string' && nodeId.length > 0 ? nodeId : null;
}

function isStartupAuthorityPlacementMember(nodeId, node, startupAuthorityNodeIds) {
  return startupAuthorityNodeIds instanceof Set &&
    startupAuthorityNodeIds.has(nodeId) &&
    STARTUP_AUTHORITY_CONTROL_PLANE_PLACEMENT_NODE_STATES.has(node?.status);
}

function isStartupAuthorityPlacementConnected(node) {
  const connectionState = String(
    node.connection_state || node.connectionState || '',
  ).toLowerCase();
  return connectionState === STATE.CONNECTED ||
    connectionState === STATE.READY;
}

function isStartupAuthorityControlPlanePlacementEligibleNode(options = {}) {
  const node = options.node;
  const nodeId = readStartupAuthorityPlacementNodeId(node);
  if (
    nodeId === null ||
    !isStartupAuthorityPlacementMember(
      nodeId,
      node,
      options.startupAuthorityNodeIds,
    ) ||
    !isStartupAuthorityPlacementConnected(node)
  ) {
    return false;
  }
  if (nodeId === options.localNodeId) {
    return options.includeSelf === true;
  }
  return hasLiveTransportEvidence(nodeId, {
    messageRouter: options.messageRouter,
  });
}

/**
 * Classify a barrier-held JOINING member at the shared placement owner. The
 * decision is fail-closed: only an open priority-recovery lane plus the exact
 * existing startup-authority placement predicate produces a cure target.
 *
 * @param {Object} options
 * @return {string}
 */
function classifyFormationCohortSpreadCureNode(options = {}) {
  const evidence = Object.freeze({
    priorityRecoveryLane: options.priorityRecoveryLane === true,
    priorityRecoveryActive: options.priorityRecoveryActive === true,
    formationReleaseHandoffActive:
      options.formationReleaseHandoffActive === true,
    joining: options.node?.status === NODE_STATE.JOINING,
    placementEligible:
      isStartupAuthorityControlPlanePlacementEligibleNode(options),
  });
  const state = FORMATION_COHORT_SPREAD_CURE_STATE_TABLE.find((entry) =>
    entry.matches(evidence),
  )?.state;
  return state === FORMATION_COHORT_SPREAD_CURE_STATE.CURE_TARGET ?
    FORMATION_COHORT_SPREAD_CURE_CLASSIFICATION.CURE_TARGET :
    FORMATION_COHORT_SPREAD_CURE_CLASSIFICATION.NOT_CURE_TARGET;
}

/**
 * Resolve every cache-backed node admitted by the shared formation predicate.
 *
 * @param {Object} options
 * @param {Object} options.systemTableCache
 * @param {Object} options.startupAuthority
 * @param {Object} options.messageRouter
 * @param {string|null} options.localNodeId
 * @param {boolean} options.includeSelf
 * @return {Array<string>}
 */
function getStartupAuthorityControlPlanePlacementEligibleNodeIds(
  options = {},
) {
  const startupAuthorityNodeIds =
    resolveStartupAuthorityNodeIdSet(options.startupAuthority);
  if (
    startupAuthorityNodeIds.size === 0 ||
    !options.systemTableCache ||
    typeof options.systemTableCache.filter !== 'function'
  ) {
    return EMPTY_STARTUP_AUTHORITY_PLACEMENT_NODE_IDS;
  }
  return options.systemTableCache
    .filter(TABLES.NODES, (node) =>
      isStartupAuthorityControlPlanePlacementEligibleNode({
        node,
        startupAuthorityNodeIds,
        messageRouter: options.messageRouter,
        localNodeId: options.localNodeId || null,
        includeSelf: options.includeSelf === true,
      }),
    )
    .map((node) => node.node_id);
}

export {
  FORMATION_COHORT_SPREAD_CURE_CLASSIFICATION,
  classifyFormationCohortSpreadCureNode,
  getStartupAuthorityControlPlanePlacementEligibleNodeIds,
  isStartupAuthorityControlPlanePlacementEligibleNode,
  resolveStartupAuthorityNodeIdSet,
};

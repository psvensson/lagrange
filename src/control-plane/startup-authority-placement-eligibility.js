import {
  NODE_STATE,
  STATE,
  TABLES,
} from '../constants/index.js';
import {hasLiveTransportEvidence} from './live-transport-evidence.js';
import {
  FORMATION_RELEASE_HANDOFF_STATE,
  normalizeFormationReleaseHandoffContract,
} from './formation-release-handoff-contract.js';

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
  OUTSIDE_HANDOFF_COHORT: 'outside_handoff_cohort',
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
    state: FORMATION_COHORT_SPREAD_CURE_STATE.OUTSIDE_HANDOFF_COHORT,
    matches: (evidence) =>
      evidence.priorityRecoveryActive !== true &&
      evidence.formationReleaseHandoffActive === true &&
      evidence.formationReleaseHandoffCohortMember !== true,
  }),
  Object.freeze({
    state: FORMATION_COHORT_SPREAD_CURE_STATE.CURE_TARGET,
    matches: () => true,
  }),
]);
const arrayIsArray = Array.isArray;
const arrayPrototypeMap = Function.call.bind(Array.prototype.map);
const objectGetOwnPropertyDescriptor = Object.getOwnPropertyDescriptor;
const objectHasOwn = Object.hasOwn;
const objectFreeze = Object.freeze;
const SetConstructor = Set;
const setPrototypeAdd = Function.call.bind(Set.prototype.add);
const setPrototypeHas = Function.call.bind(Set.prototype.has);
const setSizeGetter = objectGetOwnPropertyDescriptor(
  Set.prototype,
  'size',
).get;
const setSize = Function.call.bind(setSizeGetter);
const stringPrototypeToLowerCase = Function.call.bind(
  String.prototype.toLowerCase,
);
const OWN_DATA_VALUE_FIELD = 'value';
const AUTHORITY_AVAILABLE_FIELD = 'authorityAvailable';
const CANONICAL_STARTUP_NODE_IDS_FIELD = 'canonicalStartupNodeIds';

function readOwnData(target, field) {
  if (!target || typeof target !== 'object') return undefined;
  const descriptor = objectGetOwnPropertyDescriptor(target, field);
  return descriptor && objectHasOwn(descriptor, OWN_DATA_VALUE_FIELD) ?
    descriptor.value : undefined;
}

function appendPlacementNodeIds(nodeIds, values) {
  if (!arrayIsArray(values)) return;
  for (let index = 0; index < values.length; index += 1) {
    const value = readOwnData(values, index);
    if (typeof value === 'string' && value.length > 0) {
      setPrototypeAdd(nodeIds, value);
    }
  }
}

function resolveStartupAuthorityNodeIdSet(startupAuthority) {
  if (readOwnData(startupAuthority, AUTHORITY_AVAILABLE_FIELD) !== true) {
    return new SetConstructor();
  }
  const nodeIds = new SetConstructor();
  appendPlacementNodeIds(
    nodeIds,
    readOwnData(startupAuthority, CANONICAL_STARTUP_NODE_IDS_FIELD),
  );
  const handoff = normalizeFormationReleaseHandoffContract(
    readOwnData(startupAuthority, 'formationReleaseHandoff'),
  );
  if (
    handoff?.state === FORMATION_RELEASE_HANDOFF_STATE.ACTIVE &&
    handoff.releaseAuthorized === true
  ) {
    appendPlacementNodeIds(nodeIds, handoff.canonicalNodeIds);
  }
  return nodeIds;
}

function startupAuthorityNodeIdSetHas(nodeIds, nodeId) {
  try {
    return setPrototypeHas(nodeIds, nodeId);
  } catch {
    return false;
  }
}

function isStartupAuthorityNodeIdSet(nodeIds) {
  try {
    setSize(nodeIds);
    return true;
  } catch {
    return false;
  }
}

function startupAuthorityNodeIdSetSize(nodeIds) {
  try {
    return setSize(nodeIds);
  } catch {
    return 0;
  }
}

function countStartupAuthorityNodeIds(startupAuthority) {
  return startupAuthorityNodeIdSetSize(
    resolveStartupAuthorityNodeIdSet(startupAuthority),
  );
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
function isStartupAuthorityControlPlanePlacementEligibleNode(options = {}) {
  const node = options.node;
  const snakeNodeId = readOwnData(node, 'node_id');
  const camelNodeId = readOwnData(node, 'nodeId');
  const nodeId = typeof snakeNodeId === 'string' ?
    snakeNodeId :
    typeof camelNodeId === 'string' ? camelNodeId : null;
  const nodeStatus = readOwnData(node, 'status');
  if (
    typeof nodeId !== 'string' ||
    nodeId.length === 0 ||
    !startupAuthorityNodeIdSetHas(options.startupAuthorityNodeIds, nodeId) ||
    !setPrototypeHas(
      STARTUP_AUTHORITY_CONTROL_PLANE_PLACEMENT_NODE_STATES,
      nodeStatus,
    )
  ) {
    return false;
  }
  const snakeConnectionState = readOwnData(node, 'connection_state');
  const camelConnectionState = readOwnData(node, 'connectionState');
  const rawConnectionState = typeof snakeConnectionState === 'string' ?
    snakeConnectionState :
    typeof camelConnectionState === 'string' ? camelConnectionState : null;
  const connectionState = typeof rawConnectionState === 'string' ?
    stringPrototypeToLowerCase(rawConnectionState) : '';
  if (
    connectionState !== STATE.CONNECTED &&
    connectionState !== STATE.READY
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
  const evidence = objectFreeze({
    priorityRecoveryLane: options.priorityRecoveryLane === true,
    priorityRecoveryActive: options.priorityRecoveryActive === true,
    formationReleaseHandoffActive:
      options.formationReleaseHandoffActive === true,
    formationReleaseHandoffCohortMember:
      options.formationReleaseHandoffCohortMember === true,
    joining: readOwnData(options.node, 'status') === NODE_STATE.JOINING,
    placementEligible:
      isStartupAuthorityControlPlanePlacementEligibleNode(options),
  });
  let state = null;
  for (
    let index = 0;
    index < FORMATION_COHORT_SPREAD_CURE_STATE_TABLE.length;
    index += 1
  ) {
    const entry = FORMATION_COHORT_SPREAD_CURE_STATE_TABLE[index];
    if (!entry.matches(evidence)) continue;
    state = entry.state;
    break;
  }
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
    startupAuthorityNodeIdSetSize(startupAuthorityNodeIds) === 0 ||
    !options.systemTableCache ||
    typeof options.systemTableCache.filter !== 'function'
  ) {
    return EMPTY_STARTUP_AUTHORITY_PLACEMENT_NODE_IDS;
  }
  return arrayPrototypeMap(
    options.systemTableCache.filter(TABLES.NODES, (node) =>
      isStartupAuthorityControlPlanePlacementEligibleNode({
        node,
        startupAuthorityNodeIds,
        messageRouter: options.messageRouter,
        localNodeId: options.localNodeId || null,
        includeSelf: options.includeSelf === true,
      })),
    (node) => {
      const snakeNodeId = readOwnData(node, 'node_id');
      const camelNodeId = readOwnData(node, 'nodeId');
      return typeof snakeNodeId === 'string' ? snakeNodeId : camelNodeId;
    },
  );
}

export {
  FORMATION_COHORT_SPREAD_CURE_CLASSIFICATION,
  classifyFormationCohortSpreadCureNode,
  countStartupAuthorityNodeIds,
  getStartupAuthorityControlPlanePlacementEligibleNodeIds,
  isStartupAuthorityNodeIdSet,
  isStartupAuthorityControlPlanePlacementEligibleNode,
  resolveStartupAuthorityNodeIdSet,
  startupAuthorityNodeIdSetHas,
  startupAuthorityNodeIdSetSize,
};

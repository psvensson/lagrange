
const TOPOLOGY_CONTROL_PLANE_OWNER = 'topology_control_plane';
const TOPOLOGY_OWNER_EMPTY_STRING = '';

const PLACEMENT_OWNER_INPUT = Object.freeze({
  AVAILABLE_NODES: 'available_nodes',
  CURRENT_REPLICAS: 'current_replicas',
  POLICY: 'policy',
  TRANSITION_OPERATIONS: 'transition_operations',
});

const PLACEMENT_OWNER_POLICY = Object.freeze({
  MESSAGE_GROUP_LOCAL_ACCESS: 'message_group_local_access',
  PARTITION_SPREAD: 'partition_spread',
  RUNTIME_SERVICE_SPREAD: 'runtime_service_spread',
});

const PLACEMENT_OWNER_TARGET_STATE = Object.freeze({
  NO_TARGET_REQUESTED: 'no_target_requested',
  NO_CANDIDATES: 'no_candidates',
  TARGETS_SELECTED: 'targets_selected',
});

const PLACEMENT_OWNER_TARGET_ACTION = Object.freeze({
  SELECT_NONE: 'select_none',
  SELECT_TARGETS: 'select_targets',
});

const PLACEMENT_OWNER_REASON = Object.freeze({
  NONE: 'none',
  TARGET_COUNT_EMPTY: 'target_count_empty',
  CANDIDATE_SET_EMPTY: 'candidate_set_empty',
  TARGETS_SELECTED: 'targets_selected',
});

const PLACEMENT_OWNER_REINTERPRETATION = Object.freeze({
  CACHE_VISIBILITY: 'cache_visibility',
  SERVICE_ROW_STATUS: 'service_row_status',
  TIMER_AGE: 'timer_age',
  RESERVATION_PRESENCE: 'reservation_presence',
});

const PLACEMENT_OWNER_TARGET_STATE_TABLE = Object.freeze([
  Object.freeze({
    state: PLACEMENT_OWNER_TARGET_STATE.NO_TARGET_REQUESTED,
    matches: (evidence) => evidence.targetCountAvailable !== true,
  }),
  Object.freeze({
    state: PLACEMENT_OWNER_TARGET_STATE.NO_CANDIDATES,
    matches: (evidence) => evidence.candidateNodesAvailable !== true,
  }),
  Object.freeze({
    state: PLACEMENT_OWNER_TARGET_STATE.TARGETS_SELECTED,
    matches: () => true,
  }),
]);

const PLACEMENT_OWNER_TARGET_ACTION_BY_STATE = Object.freeze(
  new Map([
    [
      PLACEMENT_OWNER_TARGET_STATE.NO_TARGET_REQUESTED,
      PLACEMENT_OWNER_TARGET_ACTION.SELECT_NONE,
    ],
    [
      PLACEMENT_OWNER_TARGET_STATE.NO_CANDIDATES,
      PLACEMENT_OWNER_TARGET_ACTION.SELECT_NONE,
    ],
    [
      PLACEMENT_OWNER_TARGET_STATE.TARGETS_SELECTED,
      PLACEMENT_OWNER_TARGET_ACTION.SELECT_TARGETS,
    ],
  ]),
);

const PLACEMENT_OWNER_REASON_BY_STATE = Object.freeze(
  new Map([
    [
      PLACEMENT_OWNER_TARGET_STATE.NO_TARGET_REQUESTED,
      PLACEMENT_OWNER_REASON.TARGET_COUNT_EMPTY,
    ],
    [
      PLACEMENT_OWNER_TARGET_STATE.NO_CANDIDATES,
      PLACEMENT_OWNER_REASON.CANDIDATE_SET_EMPTY,
    ],
    [
      PLACEMENT_OWNER_TARGET_STATE.TARGETS_SELECTED,
      PLACEMENT_OWNER_REASON.TARGETS_SELECTED,
    ],
  ]),
);

function normalizePositiveInteger(value) {
  return Number.isFinite(value) && value > 0 ?
    Math.floor(value) :
    0;
}

function normalizeNodeIdArray(values) {
  if (!Array.isArray(values)) {
    return [];
  }
  return values
    .map((value) => String(value || TOPOLOGY_OWNER_EMPTY_STRING).trim())
    .filter((value) => value.length > 0);
}

function normalizeRankedNodeIds(sortedNodes) {
  if (!Array.isArray(sortedNodes)) {
    return [];
  }
  return normalizeNodeIdArray(sortedNodes.map((node) => node?.node_id));
}

function normalizeTransitionNodeSet(transitionSnapshot, fieldName) {
  const candidate = transitionSnapshot?.[fieldName];
  if (candidate instanceof Set) {
    return candidate;
  }
  return new Set();
}

function resolvePlacementOwnerTargetState(evidence) {
  return (
    PLACEMENT_OWNER_TARGET_STATE_TABLE.find((entry) =>
      entry.matches(evidence),
    )?.state ||
    PLACEMENT_OWNER_TARGET_STATE.NO_CANDIDATES
  );
}

function selectPlacementOwnerTargetNodeIds(evidence) {
  const selectedNodeIds = [...evidence.reservedNodeIds];
  for (const nodeId of evidence.rankedNodeIds) {
    if (selectedNodeIds.length >= evidence.targetCount) {
      break;
    }
    if (evidence.reservedNodeIdSet.has(nodeId)) {
      continue;
    }
    if (evidence.deferredNodeIdSet.has(nodeId)) {
      continue;
    }
    selectedNodeIds.push(nodeId);
  }
  for (const nodeId of evidence.deferredNodeIds) {
    if (selectedNodeIds.length >= evidence.targetCount) {
      break;
    }
    selectedNodeIds.push(nodeId);
  }
  const selectedNodeIdSet = new Set(selectedNodeIds);
  return evidence.rankedNodeIds
    .filter((nodeId) => selectedNodeIdSet.has(nodeId))
    .slice(0, evidence.targetCount);
}

function buildPlacementOwnerTargetEvidence(options = {}) {
  const rankedNodeIds = normalizeRankedNodeIds(options.sortedNodes);
  const targetCount = normalizePositiveInteger(options.targetCount);
  const reservedTransitionNodeSet = normalizeTransitionNodeSet(
    options.transitionSnapshot,
    'nodesWithEntityAddTransitional',
  );
  const globalSystemTransitionNodeSet =
    options.includeGlobalSystemDeferral === true ?
      normalizeTransitionNodeSet(
        options.transitionSnapshot,
        'nodesWithGlobalSystemAddTransitional',
      ) :
      new Set();
  const reservedNodeIds = rankedNodeIds
    .filter((nodeId) => reservedTransitionNodeSet.has(nodeId))
    .slice(0, targetCount);
  const reservedNodeIdSet = new Set(reservedNodeIds);
  const deferredNodeIds = rankedNodeIds
    .filter(
      (nodeId) =>
        globalSystemTransitionNodeSet.has(nodeId) &&
        !reservedNodeIdSet.has(nodeId),
    )
    .slice(0, targetCount);
  const deferredNodeIdSet = new Set(deferredNodeIds);
  return Object.freeze({
    owner: TOPOLOGY_CONTROL_PLANE_OWNER,
    inputs: PLACEMENT_OWNER_INPUT,
    policy: options.policy || PLACEMENT_OWNER_POLICY.PARTITION_SPREAD,
    rankedNodeIds,
    targetCount,
    reservedNodeIds,
    deferredNodeIds,
    reservedNodeIdSet,
    deferredNodeIdSet,
    targetCountAvailable: targetCount > 0,
    candidateNodesAvailable: rankedNodeIds.length > 0,
    forbiddenReinterpretations: PLACEMENT_OWNER_REINTERPRETATION,
  });
}

function buildPlacementOwnerTargetOutcome(options = {}) {
  const evidence = buildPlacementOwnerTargetEvidence(options);
  const state = resolvePlacementOwnerTargetState(evidence);
  const action =
    PLACEMENT_OWNER_TARGET_ACTION_BY_STATE.get(state) ||
    PLACEMENT_OWNER_TARGET_ACTION.SELECT_NONE;
  const targetNodeIds =
    action === PLACEMENT_OWNER_TARGET_ACTION.SELECT_TARGETS ?
      selectPlacementOwnerTargetNodeIds(evidence) :
      [];
  return Object.freeze({
    owner: TOPOLOGY_CONTROL_PLANE_OWNER,
    state,
    action,
    reason:
      PLACEMENT_OWNER_REASON_BY_STATE.get(state) ||
      PLACEMENT_OWNER_REASON.NONE,
    targetNodeIds,
    reservedNodeIds: evidence.reservedNodeIds,
    deferredNodeIds: evidence.deferredNodeIds,
    forbiddenReinterpretations: PLACEMENT_OWNER_REINTERPRETATION,
  });
}

export {
  PLACEMENT_OWNER_INPUT,
  PLACEMENT_OWNER_POLICY,
  PLACEMENT_OWNER_REASON,
  PLACEMENT_OWNER_REINTERPRETATION,
  PLACEMENT_OWNER_TARGET_ACTION,
  PLACEMENT_OWNER_TARGET_STATE,
  TOPOLOGY_CONTROL_PLANE_OWNER,
  buildPlacementOwnerTargetOutcome,
};

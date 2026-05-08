import {test} from '../../src/test-helpers/tap.js';
import {NUM} from '../../src/constants/index.js';
import {MovePlanner} from '../../src/rebalancer/move-planner.js';
import {
  REBALANCER_ENTITY_TYPE,
} from '../../src/rebalancer/rebalancer-constants.js';
import {
  OPERATION_OWNER_RESUME_ACTION,
  OPERATION_OWNER_RESUME_STATE,
  OPERATION_OWNER_RETRY_ACTION,
  OPERATION_OWNER_RETRY_KIND,
  OPERATION_OWNER_RETRY_STATE,
  PLACEMENT_OWNER_POLICY,
  PLACEMENT_OWNER_TARGET_ACTION,
  PLACEMENT_OWNER_TARGET_STATE,
  TOPOLOGY_CONTROL_PLANE_OWNER,
  buildOperationOwnerResumeOutcome,
  buildOperationOwnerRetryOutcome,
  buildPlacementOwnerTargetOutcome,
} from '../../src/rebalancer/topology-owner-constants.js';

const NODE_A = 'node-a';
const NODE_B = 'node-b';
const NODE_C = 'node-c';
const PARTITION_ID = 'partition-owner-contract';
const RETRY_OPERATION_ID = 'operation-retry-contract';
const RETRY_AFTER_MS = 125;
const FALLBACK_DELAY_MS = 500;
const TARGET_REPLICA_COUNT = NUM.TWO;

function createPlacementNodes() {
  return [
    {node_id: NODE_A, status: 'active'},
    {node_id: NODE_B, status: 'active'},
    {node_id: NODE_C, status: 'active'},
  ];
}

function createMovePlanner() {
  return new MovePlanner({
    entityId: PARTITION_ID,
    entityType: REBALANCER_ENTITY_TYPE.PARTITION,
    moveStateProvider: {
      getAvailableNodes() {
        return createPlacementNodes();
      },
      getCurrentReplicas() {
        return [];
      },
      getHealthyReplicas(replicas) {
        return replicas;
      },
      hasPendingMove() {
        return false;
      },
      hasPendingAddForNode() {
        return false;
      },
    },
  });
}

test('topology placement owner selects targets from one canonical outcome',
  async (t) => {
    const outcome = buildPlacementOwnerTargetOutcome({
      sortedNodes: createPlacementNodes(),
      targetCount: TARGET_REPLICA_COUNT,
      transitionSnapshot: {
        nodesWithEntityAddTransitional: new Set([NODE_B]),
        nodesWithGlobalSystemAddTransitional: new Set([NODE_A]),
      },
      includeGlobalSystemDeferral: true,
      policy: PLACEMENT_OWNER_POLICY.PARTITION_SPREAD,
    });

    t.equal(outcome.owner, TOPOLOGY_CONTROL_PLANE_OWNER);
    t.equal(outcome.state, PLACEMENT_OWNER_TARGET_STATE.TARGETS_SELECTED);
    t.equal(outcome.action, PLACEMENT_OWNER_TARGET_ACTION.SELECT_TARGETS);
    t.same(
      outcome.targetNodeIds,
      [NODE_B, NODE_C],
      'reserved same-entity target remains selected while global transitional target is deferred',
    );
    t.same(outcome.reservedNodeIds, [NODE_B]);
    t.same(outcome.deferredNodeIds, [NODE_A]);
  });

test('MovePlanner emits the canonical placement owner outcome with target state',
  async (t) => {
    const planner = createMovePlanner();
    planner.buildTopologyTransitionSnapshot = () => ({
      pendingCount: NUM.ONE,
      nodesWithEntityAddTransitional: new Set([NODE_B]),
      nodesWithGlobalSystemAddTransitional: new Set([NODE_A]),
      replicasInRemoving: new Set(),
    });
    planner.isSystemPartitionEntity = () => true;

    const result = planner.calculatePartitionPlacement(
      createPlacementNodes(),
      TARGET_REPLICA_COUNT,
      {
        minReplicaCount: NUM.ONE,
        maxReplicaCount: NUM.THREE,
        placementConstraints: {
          spreadAcrossNodes: true,
        },
      },
      {
        totalCandidates: NUM.THREE,
        feasibleCount: NUM.THREE,
        rejectedCount: NUM.ZERO,
        rejectionsByReason: {},
        capacityFilterApplied: false,
      },
      planner.buildTopologyTransitionSnapshot(),
    );

    t.same(result.targetNodes, [NODE_B, NODE_C]);
    t.equal(
      result.placementOwnerOutcome.state,
      PLACEMENT_OWNER_TARGET_STATE.TARGETS_SELECTED,
    );
    t.same(result.placementOwnerOutcome.deferredNodeIds, [NODE_A]);
  });

test('operation owner retry vocabulary separates rejection, reuse, and schedule',
  async (t) => {
    const rejected = buildOperationOwnerRetryOutcome({
      operationId: RETRY_OPERATION_ID,
      retryable: false,
      timerActive: false,
      fallbackDelayMs: FALLBACK_DELAY_MS,
      retryKind: OPERATION_OWNER_RETRY_KIND.TRANSITION,
    });
    const reused = buildOperationOwnerRetryOutcome({
      operationId: RETRY_OPERATION_ID,
      retryable: true,
      timerActive: true,
      fallbackDelayMs: FALLBACK_DELAY_MS,
      retryKind: OPERATION_OWNER_RETRY_KIND.DISPATCH,
    });
    const scheduled = buildOperationOwnerRetryOutcome({
      operationId: RETRY_OPERATION_ID,
      retryable: true,
      timerActive: false,
      retryAfterMs: RETRY_AFTER_MS,
      fallbackDelayMs: FALLBACK_DELAY_MS,
      retryKind: OPERATION_OWNER_RETRY_KIND.TRANSITION,
    });

    t.equal(rejected.state, OPERATION_OWNER_RETRY_STATE.NOT_RETRYABLE);
    t.equal(rejected.action, OPERATION_OWNER_RETRY_ACTION.REJECT);
    t.equal(reused.state, OPERATION_OWNER_RETRY_STATE.TIMER_ALREADY_SCHEDULED);
    t.equal(reused.action, OPERATION_OWNER_RETRY_ACTION.REUSE_TIMER);
    t.equal(scheduled.state, OPERATION_OWNER_RETRY_STATE.SCHEDULE_RETRY);
    t.equal(scheduled.action, OPERATION_OWNER_RETRY_ACTION.SCHEDULE_TIMER);
    t.equal(scheduled.delayMs, RETRY_AFTER_MS);
  });

test('operation owner resume vocabulary owns terminal and timeout decisions',
  async (t) => {
    const terminal = buildOperationOwnerResumeOutcome({
      operationAvailable: true,
      terminalOperation: true,
      locallyOwned: true,
      dispatchRetryable: true,
      retryGraceActive: true,
      stepTimedOut: false,
    });
    const dispatch = buildOperationOwnerResumeOutcome({
      operationAvailable: true,
      terminalOperation: false,
      locallyOwned: true,
      dispatchRetryable: true,
      retryGraceActive: false,
      stepTimedOut: false,
    });
    const timeout = buildOperationOwnerResumeOutcome({
      operationAvailable: true,
      terminalOperation: false,
      locallyOwned: true,
      dispatchRetryable: true,
      retryGraceActive: false,
      stepTimedOut: true,
    });

    t.equal(terminal.state, OPERATION_OWNER_RESUME_STATE.TERMINAL_OPERATION);
    t.equal(terminal.action, OPERATION_OWNER_RESUME_ACTION.CLEAR_RETRY);
    t.equal(dispatch.state, OPERATION_OWNER_RESUME_STATE.DISPATCH_RESUME);
    t.equal(dispatch.action, OPERATION_OWNER_RESUME_ACTION.DISPATCH);
    t.equal(timeout.state, OPERATION_OWNER_RESUME_STATE.TIMEOUT_RECONCILE);
    t.equal(timeout.action, OPERATION_OWNER_RESUME_ACTION.RECONCILE_TIMEOUT);
  });

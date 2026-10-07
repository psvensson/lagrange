/**
 * Red-first PR73 qualification witness for readiness-currency census row R11.
 *
 * Historical anti-storm contract:
 * an ACTIVE replica on a process-alive-but-not-yet-serve-ready node occupies
 * its slot, so priority recovery does not re-mint an ADD every planning tick.
 *
 * Currency regression:
 * the synchronous readiness placeholder is all-false while canonical liveness
 * still says the node is alive/connected/healthy. R11 consumes the placeholder
 * as processAlive=false, making a real third replica disappear from the
 * occupied count and re-opening an increase_replica_count ADD.
 *
 * Test-only: no production fix is implied here.
 */

import {test} from '../../src/test-helpers/tap.js';
import {
  CONTROL_PLANE_READINESS_DIMENSION,
} from '../../src/control-plane/control-plane-readiness-constants.js';
import {
  isEvidenceAbsentReadinessDenialSnapshot,
} from '../../src/control-plane/readiness-denial-classification.js';
import {
  EntityType,
  MoveType,
  ReplicaStatus,
} from '../../src/rebalancer/unified-rebalancer.js';
import {createTestRebalancer} from './test-helpers.js';

const PARTITION_ID = 'control_plane_publications-p1';
const NODE_A = 'node-a-ready';
const NODE_B = 'node-b-ready';
const NODE_R = 'node-r-live-pending-readiness';
const NODE_D = 'node-d-recovery-target';
const TARGET = 3;

function replica(nodeId, replicaId, role = 'voter') {
  return {
    service_id: replicaId,
    service_type: EntityType.PARTITION,
    partition_id: PARTITION_ID,
    replica_id: replicaId,
    node_id: nodeId,
    address: 'addr-' + replicaId,
    raft_role: role,
    status: ReplicaStatus.ACTIVE,
  };
}

function buildDecision() {
  return {
    decisionSnapshot: {
      partitionId: PARTITION_ID,
      semanticState: 'needs_operation',
      authoritativeVisibilityState: 'owner_adjudicated_empty',
      progress: {nextRequiredAction: 'create_recovery_operation'},
      planner: {requiredDistinctNodeCount: TARGET},
      admission: {
        effectiveEligibleNodeIds: [NODE_A, NODE_B, NODE_R, NODE_D],
      },
      publication: {
        recoveryActiveNodeIds: [NODE_A, NODE_B, NODE_R, NODE_D],
      },
    },
  };
}

function pendingReadiness(nodeId) {
  return Object.freeze({
    nodeId,
    readinessPlanningTokenStatus: 'stale',
    readinessPlanningToken: Object.freeze({
      transportTopologyValid: true,
      generationSaturated: false,
    }),
    dimensions: Object.freeze({
      [CONTROL_PLANE_READINESS_DIMENSION.PROCESS_ALIVE]: false,
      [CONTROL_PLANE_READINESS_DIMENSION
        .CONTROL_PLANE_RECOVERY_ELIGIBLE]: false,
      [CONTROL_PLANE_READINESS_DIMENSION.SERVE_ELIGIBLE]: false,
    }),
    reasons: Object.freeze(['planning_snapshot_refresh_pending']),
  });
}

test(
  'R11: evidence-absent readiness PENDING cannot erase a canonically-live ' +
  'occupied priority-recovery slot',
  async (t) => {
    const rebalancer = createTestRebalancer({
      entityId: PARTITION_ID,
      entityType: EntityType.PARTITION,
      nodeId: NODE_A,
      cacheData: {
        nodes: [
          {node_id: NODE_A, status: 'active'},
          {node_id: NODE_B, status: 'active'},
          {node_id: NODE_R, status: 'active'},
          {node_id: NODE_D, status: 'active'},
        ],
        replicaOperations: [],
      },
    });

    const currentReplicas = [
      replica(NODE_A, PARTITION_ID + '-r1', 'leader'),
      replica(NODE_B, PARTITION_ID + '-r2', 'follower'),
      replica(NODE_R, PARTITION_ID + '-r3', 'follower'),
    ];

    // Pin the live formation shape: the third replica exists, but its node is
    // not on the stricter serve-ready surface at this instant.
    rebalancer.getAvailableNodes = () => [
      {node_id: NODE_A},
      {node_id: NODE_B},
      {node_id: NODE_D},
    ];

    const readinessService = rebalancer.controlPlaneReadinessService;
    const originalRead =
      readinessService.getNodeReadinessSync.bind(readinessService);
    const originalProject =
      typeof readinessService.projectNodeLiveness === 'function' ?
        readinessService.projectNodeLiveness.bind(readinessService) :
        () => null;
    const deferred = pendingReadiness(NODE_R);

    readinessService.getNodeReadinessSync = (nodeId, options) =>
      nodeId === NODE_R ? deferred : originalRead(nodeId, options);
    readinessService.projectNodeLiveness = (nodeId) =>
      nodeId === NODE_R ?
        Object.freeze({
          readyNow: true,
          connectionSemantics: Object.freeze({connected: true}),
          clusterMembershipSemantics: Object.freeze({healthy: true}),
        }) :
        originalProject(nodeId);

    try {
      t.equal(
        isEvidenceAbsentReadinessDenialSnapshot(deferred),
        true,
        'fixture is typed evidence-absent PENDING, not a substantive denial',
      );

      const inventory = rebalancer.buildPriorityRecoveryFollowUpInventory(
        currentReplicas,
        PARTITION_ID,
        {state: 'owner_adjudicated_empty', operations: []},
      );
      t.equal(
        inventory.accounting.activeCount,
        TARGET,
        'replica inventory sees all three ACTIVE rows',
      );
      t.equal(
        inventory.provenance.topologyIncreaseUsable,
        true,
        'follow-up inventory independently claims topology increase is usable',
      );

      const healthy = rebalancer.getHealthyReplicas(currentReplicas);
      t.equal(
        healthy.length,
        2,
        'serve-readiness excludes the third replica from healthy voters',
      );

      const occupiedBefore =
        rebalancer.getReadyNodeOccupiedReplicas(currentReplicas);
      t.equal(
        occupiedBefore.length,
        2,
        'R11 placeholder-neg also excludes the third replica from occupied slots',
      );
      t.equal(
        readinessService.projectNodeLiveness(NODE_R)?.readyNow,
        true,
        'canonical liveness simultaneously says the third node is live',
      );

      const move = rebalancer.buildPriorityRecoveryFollowUpMove({
        decision: buildDecision(),
        currentReplicas,
        targetState: {
          targetReplicaCount: TARGET,
          targetNodes: [NODE_A, NODE_B, NODE_D],
        },
      });

      t.equal(
        move.type,
        MoveType.ADD,
        'current R11 path re-mints an ADD despite three ACTIVE rows',
      );
      t.equal(
        move.reason,
        'increase_replica_count',
        'the re-minted ADD is exactly the live October deficit cure',
      );
      t.equal(
        move.nodeId,
        NODE_D,
        'the ADD targets the unused recovery-eligible node',
      );

      // Counterfactual only: consume the already-existing canonical liveness
      // owner at this exact predicate. This demonstrates mechanism fit; it is
      // not an authorization to patch R11 locally instead of the systemic
      // readiness-currency owner.
      const originalIsNodeProcessAlive =
        rebalancer.isNodeProcessAlive.bind(rebalancer);
      rebalancer.isNodeProcessAlive = (nodeId) =>
        nodeId === NODE_R ?
          readinessService.projectNodeLiveness(nodeId)?.readyNow === true :
          originalIsNodeProcessAlive(nodeId);

      const occupiedWithCanonicalLiveness =
        rebalancer.getReadyNodeOccupiedReplicas(currentReplicas);
      t.equal(
        occupiedWithCanonicalLiveness.length,
        TARGET,
        'canonical liveness restores the historical occupied-slot invariant',
      );

      const counterfactualMove = rebalancer.buildPriorityRecoveryFollowUpMove({
        decision: buildDecision(),
        currentReplicas,
        targetState: {
          targetReplicaCount: TARGET,
          targetNodes: [NODE_A, NODE_B, NODE_D],
        },
      });
      t.equal(
        counterfactualMove.type,
        undefined,
        'with the occupied slot restored, no redundant ADD is minted',
      );
      t.equal(
        counterfactualMove.followUpMoveState,
        'in_flight_add_satisfies_deficit',
        'existing count-aware gate owns the no-ADD outcome',
      );

      t.equal(
        occupiedBefore.length,
        TARGET,
        'RED-ON-CURRENT: evidence-absent PENDING must not make a canonically-live replica disappear from R11 occupied accounting',
      );
    } finally {
      rebalancer.shutdown();
    }
  },
);

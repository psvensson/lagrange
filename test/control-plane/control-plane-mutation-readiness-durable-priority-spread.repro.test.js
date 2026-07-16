/**
 * Repro: recovery-safe optimistic closure is not stable mutation convergence.
 *
 * A priority REPLACE may enter `spread_satisfied_in_flight` before the
 * replacement is voter-ready. Publication recovery intentionally uses that
 * optimistic witness to keep recovery progressing, while preserving the
 * strict voter-ready view in `durablePriorityPartitionSummary`. Ordinary
 * system topology mutation must remain deferred until that durable view has
 * converged.
 */

import {test} from '../../src/test-helpers/tap.js';
import {
  CONTROL_PLANE_PRIORITY_RECOVERY_REASON,
  CONTROL_PLANE_READINESS_DIMENSION,
} from '../../src/control-plane/control-plane-readiness-constants.js';
import {
  ControlPlaneReadinessService,
} from '../../src/control-plane/control-plane-readiness-service.js';
import {
  getLocalControlPlaneMutationReadinessBlocker,
} from '../../src/control-plane/control-plane-mutation-readiness.js';
import {
  CONTROL_PLANE_PUBLICATION_STATUS,
} from '../../src/control-plane/publication-owner-constants.js';
import {
  buildPublicationRecoveryGateSnapshot,
} from '../../src/control-plane/publication-recovery-gate.js';
import {
  buildProjectionReadinessContract,
} from '../../src/control-plane/projection-readiness-state.js';
import {
  PRIORITY_RECOVERY_CLOSURE_RECORD_ID,
  PRIORITY_RECOVERY_CLOSURE_WITNESS_CLASS,
  PRIORITY_RECOVERY_CLOSURE_WITNESS_STATE,
} from '../../src/control-plane/priority-recovery-snapshot.js';

const TEST_NODE_ID = 'node-1';
const TEST_PRIORITY_PARTITION_ID = 'sql_transaction_participants-p1';

function buildReadyDimensions() {
  return {
    [CONTROL_PLANE_READINESS_DIMENSION.PROCESS_ALIVE]: true,
    [CONTROL_PLANE_READINESS_DIMENSION.CLUSTER_MEMBER_HEALTHY]: true,
    [CONTROL_PLANE_READINESS_DIMENSION.ROUTING_READY]: true,
    [CONTROL_PLANE_READINESS_DIMENSION.LOAD_READY]: true,
    [CONTROL_PLANE_READINESS_DIMENSION.PLACEMENT_ELIGIBLE]: true,
    [CONTROL_PLANE_READINESS_DIMENSION.CONTROL_PLANE_WRITABLE]: true,
    [CONTROL_PLANE_READINESS_DIMENSION.CONTROL_PLANE_PUBLISHED]: true,
    [CONTROL_PLANE_READINESS_DIMENSION.CONTROL_PLANE_RECOVERY_ELIGIBLE]:
      true,
    [CONTROL_PLANE_READINESS_DIMENSION.METADATA_PUBLICATION_HEALTHY]: true,
    [CONTROL_PLANE_READINESS_DIMENSION.REPAIR_ELIGIBLE]: true,
    [CONTROL_PLANE_READINESS_DIMENSION.SERVE_ELIGIBLE]: true,
  };
}

function createEmptySystemTableCache() {
  return {
    get() {
      return null;
    },
    getAll() {
      return [];
    },
    filter() {
      return [];
    },
    onCacheChange() {},
  };
}

test('background mutation stays deferred when optimistic priority closure ' +
  'hides a durable spread gap', async (t) => {
  const durablePriorityPartitionSummary = Object.freeze({
    satisfied: false,
    requiredDistinctNodeCount: 3,
    readyEligibleNodeCount: 5,
    totalPriorityPartitionCount: 1,
    missingPartitionIds: Object.freeze([]),
    blockedPartitions: Object.freeze([{
      partitionId: TEST_PRIORITY_PARTITION_ID,
      readyReplicaCount: 2,
      readyDistinctNodeCount: 2,
      requiredDistinctNodeCount: 3,
      spreadGap: 1,
    }]),
    blockedPartitionCount: 1,
    largestSpreadGap: 1,
    totalSpreadGap: 1,
  });
  const optimisticSatisfiedSummary = Object.freeze({
    satisfied: true,
    requiredDistinctNodeCount: 3,
    readyEligibleNodeCount: 5,
    totalPriorityPartitionCount: 1,
    missingPartitionIds: Object.freeze([]),
    blockedPartitions: Object.freeze([]),
    blockedPartitionCount: 0,
    largestSpreadGap: 0,
    totalSpreadGap: 0,
  });
  const publicationRecoveryGate = buildPublicationRecoveryGateSnapshot({
    publicationEpoch: 7,
    publicationStatus: CONTROL_PLANE_PUBLICATION_STATUS.PUBLISHED,
    requiredAckNodeIds: [TEST_NODE_ID],
    acknowledgedNodeIds: [TEST_NODE_ID],
    priorityRecoveryReasonCodes: [
      CONTROL_PLANE_PRIORITY_RECOVERY_REASON.PRIORITY_PARTITIONS_NOT_SPREAD,
    ],
    priorityPartitionSummary: durablePriorityPartitionSummary,
    priorityRecoveryClosureWitness: {
      state:
        PRIORITY_RECOVERY_CLOSURE_WITNESS_STATE.SATISFIED_STALE_PUBLICATION,
      prioritySpreadPending: false,
      publicationRefreshRequired: true,
      closureRecordId: PRIORITY_RECOVERY_CLOSURE_RECORD_ID.PRIORITY_SPREAD,
      closureWitnessClass:
        PRIORITY_RECOVERY_CLOSURE_WITNESS_CLASS
          .PUBLICATION_CONVERGED_PRIORITY_SPREAD_PENDING,
      refreshedPriorityPartitionSummary: optimisticSatisfiedSummary,
    },
  });

  t.equal(
    publicationRecoveryGate.ready,
    true,
    'the optimistic closure must remain recovery-ready',
  );
  t.equal(
    publicationRecoveryGate.durablePriorityPartitionSummary?.satisfied,
    false,
    'the gate must preserve the strict voter-ready spread gap',
  );

  const dimensions = buildReadyDimensions();
  const readinessService = new ControlPlaneReadinessService({
    nodeId: TEST_NODE_ID,
    systemTableCache: createEmptySystemTableCache(),
  });
  const priorityControlPlaneRecovery =
    readinessService.getPriorityControlPlaneRecoveryState({
      nodeId: TEST_NODE_ID,
      dimensions,
      membershipPublicationPlanningSnapshot: {
        publicationEpoch: publicationRecoveryGate.publicationEpoch,
        publicationStatus: publicationRecoveryGate.publicationStatus,
        requiredAckNodeIds: [TEST_NODE_ID],
        acknowledgedNodeIds: [TEST_NODE_ID],
        priorityRecoveryReasonCodes: [
          CONTROL_PLANE_PRIORITY_RECOVERY_REASON
            .PRIORITY_PARTITIONS_NOT_SPREAD,
        ],
        priorityPartitionSummary: durablePriorityPartitionSummary,
        priorityRecoveryClosureWitness:
          publicationRecoveryGate.priorityRecoveryClosureWitness,
        publicationRecoveryGate,
      },
    });
  t.equal(
    priorityControlPlaneRecovery.publicationRecoveryGate
      ?.durablePriorityPartitionSummary?.satisfied,
    false,
    'readiness owner must not reclassify optimistic spread as durable',
  );
  t.equal(
    priorityControlPlaneRecovery.active,
    false,
    'strict debt must not reopen the optimistic recovery-progress gate',
  );
  const projectionReadinessContract = buildProjectionReadinessContract({
    dimensions,
    membershipPublication: publicationRecoveryGate,
    priorityControlPlaneRecovery,
    runtimeServeEligible: true,
  });
  t.equal(
    projectionReadinessContract.priorityRecovery.durableSpreadPending,
    true,
    'projection readiness must preserve strict spread debt canonically',
  );
  const blocker = getLocalControlPlaneMutationReadinessBlocker({
    nodeId: TEST_NODE_ID,
    requirePublishedConvergence: true,
    controlPlaneReadinessService: {
      getNodeReadinessSync() {
        return {
          dimensions,
          reasons: [],
          projectionReadinessContract,
        };
      },
    },
  });

  t.same(
    blocker?.failedDimensions,
    ['publishedConvergencePending'],
    'stable background mutation must consume durable spread convergence',
  );
});

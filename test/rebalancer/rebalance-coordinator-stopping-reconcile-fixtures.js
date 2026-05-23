import {test} from '../../src/test-helpers/tap.js';
import {WORKFLOW_STEP} from '../../src/constants/index.js';
import {
  SYSTEM_TABLE_NAME,
} from '../../src/bootstrap/system-table-schemas-constants.js';
import {
  ControlPlaneField,
  ControlPlaneMessageType,
} from '../../src/control-plane/control-plane-constants.js';
import {
  PRIORITY_RECOVERY_COMPLETION_STATE,
} from '../../src/control-plane/priority-recovery-completion.js';
import {
  OperationType,
  ReplicaStatus,
} from '../../src/rebalancer/replica-status.js';
import {
  OPERATION_WORKFLOW_OWNER_SHARED,
} from '../../src/rebalancer/operation-workflow-owner-shared.js';
import {
  ReplicaOperationMessageType,
  ReplicaOperationResponseStatus,
} from '../../src/rebalancer/replica-operation-constants.js';
import {RAFT_ROLE} from '../../src/raft/constants.js';
import {createTestCoordinator} from './test-helpers.js';

export const STOPPING_REPLICA_OBSERVATION_STATE = Object.freeze({
  OBSERVED: 'observed',
  ABSENT: 'absent',
  UNAVAILABLE: 'unavailable',
});

export const PRIORITY_DRAIN_TEST_PUBLICATION_STATUS = 'PUBLISHED';
export const PRIORITY_DRAIN_TEST_ENTITY_TYPE = 'partition';
export const PRIORITY_DRAIN_TEST_SOURCE_NODE_ID = 'node-source';
export const PRIORITY_DRAIN_TEST_TARGET_NODE_ID = 'node-target';
export const PRIORITY_DRAIN_TEST_READY_NODE_IDS = Object.freeze([
  PRIORITY_DRAIN_TEST_SOURCE_NODE_ID,
  PRIORITY_DRAIN_TEST_TARGET_NODE_ID,
  'node-peer',
]);
export const PRIORITY_DRAIN_TEST_REQUIRED_DISTINCT_NODE_COUNT = 3;
export const PRIORITY_DRAIN_TEST_NO_COMPLETED_AT = null;
export const PRIORITY_DRAIN_TEST_NO_ERROR_MESSAGE = null;
export const PRIORITY_DRAIN_TEST_BLOCKED_PARTITION_COUNT = 1;
export const PRIORITY_DRAIN_TEST_SPREAD_GAP = 1;
export const PRIORITY_DRAIN_TEST_READY_DISTINCT_NODE_COUNT = 2;
export const PRIORITY_DRAIN_TEST_TOTAL_SPREAD_GAP = 1;
export const PRIORITY_DRAIN_TEST_RECOVERY_ELIGIBLE_EXCLUDED_REASON =
  'publication_recovery_eligible_but_coordinator_excludes_node';
export const PRIORITY_DRAIN_TEST_COMPLETION_BLOCKED_STATE = 'blocked';
export const PRIORITY_DRAIN_TEST_ACTIVE_OPERATION_STILL_BLOCKS_REASON =
  'active_operation_still_blocks_spread';
export const PRIORITY_DRAIN_TEST_STALE_TARGET_NODE_ID = 'node-stale-target';
export const PRIORITY_DRAIN_TEST_AUTHORITATIVE_SOURCE = 'authoritative';
export const PRIORITY_DRAIN_TEST_UNAVAILABLE_TARGET_NODE_ID =
  'node-unavailable-target';
export const PRIORITY_DRAIN_TEST_REMOTE_RELEASE_OPERATION_ID =
  'priority-drain-remote-owner-unavailable-active';
export const PRIORITY_DRAIN_TEST_REMOTE_RELEASE_SYNCING_OPERATION_ID =
  'priority-drain-remote-owner-unavailable-syncing';
export const PRIORITY_DRAIN_TEST_REMOTE_RELEASE_STOPPING_OPERATION_ID =
  'priority-drain-remote-owner-unavailable-stopping';
export const PRIORITY_DRAIN_TEST_TERMINAL_GUARD_OPERATION_ID =
  'priority-drain-terminal-guard';
export const PRIORITY_DRAIN_TEST_FOLLOWER_ELECTION_OPERATION_ID =
  'priority-drain-follower-election-safe';
export const PRIORITY_DRAIN_TEST_REMOTE_RELEASE_PARTITION_ID =
  'sql_write_operations-p1';
export const PRIORITY_DRAIN_TEST_REMOTE_RELEASE_SERVICE_TYPE = 'partition';
export const PRIORITY_DRAIN_TEST_REMOTE_RELEASE_VOTER_ROLE = 'follower';
export const PRIORITY_DRAIN_TEST_REMOTE_RELEASE_SOURCE_ACTIVE_ASSERTION =
  'remote owner unavailable priority drain should settle without dispatch';
export const PRIORITY_DRAIN_TEST_REMOTE_RELEASE_SOURCE_STOPPING_ASSERTION =
  'remote owner unavailable source-removal drain should settle without dispatch';
export const PRIORITY_DRAIN_TEST_REMOTE_RELEASE_TERMINAL_ASSERTION =
  'remote owner unavailable ACTIVE replacement should become terminal';
export const PRIORITY_DRAIN_TEST_REMOTE_RELEASE_SYNCING_ASSERTION =
  'remote owner unavailable SYNCING replacement should become terminal';
export const PRIORITY_DRAIN_TEST_REMOTE_RELEASE_STOPPING_ASSERTION =
  'remote owner unavailable STOPPING replacement should become terminal';
export const PRIORITY_DRAIN_TEST_REMOTE_RELEASE_NO_DELIVERY_ASSERTION =
  'remote owner unavailable priority drain should not replay source removal';
export const PRIORITY_DRAIN_TEST_FOLLOWER_ELECTION_DISPATCH_ASSERTION =
  'fresh replacement election evidence should dispatch source removal';
export const PRIORITY_DRAIN_TEST_FOLLOWER_ELECTION_STEP_ASSERTION =
  'fresh replacement election evidence should advance source removal';
export const PRIORITY_DRAIN_TEST_TERMINAL_GUARD_TRANSITION_ASSERTION =
  'stale direct priority transition should not commit';
export const PRIORITY_DRAIN_TEST_TERMINAL_GUARD_STEP_ASSERTION =
  'stale direct priority transition should not overwrite terminal step';
export const PRIORITY_DRAIN_TEST_TERMINAL_GUARD_STATUS_ASSERTION =
  'stale direct priority transition should not overwrite terminal status';

export function buildPriorityDrainConvergedPlanningSnapshot(partitionId) {
  return Object.freeze({
    publicationStatus: PRIORITY_DRAIN_TEST_PUBLICATION_STATUS,
    publishedActiveNodeIdsPresent: true,
    publishedActiveNodeIds: PRIORITY_DRAIN_TEST_READY_NODE_IDS,
    recoveryActiveNodeIds: PRIORITY_DRAIN_TEST_READY_NODE_IDS,
    projectedServingNodeIds: PRIORITY_DRAIN_TEST_READY_NODE_IDS,
    locallyEligibleNodeIds: PRIORITY_DRAIN_TEST_READY_NODE_IDS,
    priorityPartitionSummary: Object.freeze({
      satisfied: true,
      requiredDistinctNodeCount:
        PRIORITY_DRAIN_TEST_REQUIRED_DISTINCT_NODE_COUNT,
      missingPartitionIds: Object.freeze([]),
      blockedPartitions: Object.freeze([]),
      blockedPartitionCount: 0,
      largestSpreadGap: 0,
      totalSpreadGap: 0,
      totalPriorityPartitionCount: 1,
      witnessPartitionIds: Object.freeze([partitionId]),
    }),
  });
}

export function buildPriorityDrainSupersededPlanningSnapshot(
  partitionId,
  operationId,
) {
  return Object.freeze({
    publicationStatus: PRIORITY_DRAIN_TEST_PUBLICATION_STATUS,
    publishedActiveNodeIdsPresent: true,
    publishedActiveNodeIds: PRIORITY_DRAIN_TEST_READY_NODE_IDS,
    recoveryActiveNodeIds: PRIORITY_DRAIN_TEST_READY_NODE_IDS,
    projectedServingNodeIds: PRIORITY_DRAIN_TEST_READY_NODE_IDS,
    locallyEligibleNodeIds: PRIORITY_DRAIN_TEST_READY_NODE_IDS,
    priorityPartitionSummary: Object.freeze({
      satisfied: false,
      requiredDistinctNodeCount:
        PRIORITY_DRAIN_TEST_REQUIRED_DISTINCT_NODE_COUNT,
      missingPartitionIds: Object.freeze([partitionId]),
      blockedPartitions: Object.freeze([Object.freeze({
        partitionId,
        requiredDistinctNodeCount:
          PRIORITY_DRAIN_TEST_REQUIRED_DISTINCT_NODE_COUNT,
        readyDistinctNodeCount:
          PRIORITY_DRAIN_TEST_READY_DISTINCT_NODE_COUNT,
        spreadGap: PRIORITY_DRAIN_TEST_SPREAD_GAP,
      })]),
      blockedPartitionCount: PRIORITY_DRAIN_TEST_BLOCKED_PARTITION_COUNT,
      largestSpreadGap: PRIORITY_DRAIN_TEST_SPREAD_GAP,
      totalSpreadGap: PRIORITY_DRAIN_TEST_TOTAL_SPREAD_GAP,
      totalPriorityPartitionCount: PRIORITY_DRAIN_TEST_BLOCKED_PARTITION_COUNT,
      witnessPartitionIds: Object.freeze([partitionId]),
    }),
    priorityRecoveryDecisionSnapshots: Object.freeze({
      snapshots: Object.freeze([Object.freeze({
        partitionId,
        operationId,
        operationIds: Object.freeze([operationId]),
        blockerReasons: Object.freeze([
          PRIORITY_DRAIN_TEST_RECOVERY_ELIGIBLE_EXCLUDED_REASON,
        ]),
        admission: Object.freeze({
          effectiveEligibleNodeIds: PRIORITY_DRAIN_TEST_READY_NODE_IDS,
          effectiveEligibleNodeCount: PRIORITY_DRAIN_TEST_READY_NODE_IDS.length,
        }),
        completion: Object.freeze({
          state: PRIORITY_DRAIN_TEST_COMPLETION_BLOCKED_STATE,
          reasonCode: PRIORITY_DRAIN_TEST_ACTIVE_OPERATION_STILL_BLOCKS_REASON,
          blocked: true,
        }),
        spreadCompletion: Object.freeze({
          satisfied: false,
          reasonCode: PRIORITY_DRAIN_TEST_ACTIVE_OPERATION_STILL_BLOCKS_REASON,
          blockingOperationIds: Object.freeze([operationId]),
          blockingOperationCount: PRIORITY_DRAIN_TEST_BLOCKED_PARTITION_COUNT,
        }),
      })]),
    }),
  });
}

export function buildPriorityDrainReadinessService(partitionId) {
  const planningSnapshot =
    buildPriorityDrainConvergedPlanningSnapshot(partitionId);
  return Object.freeze({
    getNodeReadinessSync(nodeId) {
      return {
        nodeId,
        dimensions: {
          controlPlaneRecoveryEligible: true,
          repairEligible: true,
          serveEligible: true,
        },
      };
    },
    getPriorityRecoveryPlanningSnapshotBestEffort() {
      return planningSnapshot;
    },
  });
}

export function buildPriorityDrainOwnerUnavailableReadinessService(
  partitionId,
  unavailableNodeId,
) {
  const planningSnapshot =
    buildPriorityDrainConvergedPlanningSnapshot(partitionId);
  return Object.freeze({
    getNodeReadinessSync(nodeId) {
      const unavailable = nodeId === unavailableNodeId;
      return {
        nodeId,
        dimensions: {
          processAlive: !unavailable,
          clusterMemberHealthy: !unavailable,
          controlPlaneWritable: !unavailable,
          controlPlanePublished: true,
          controlPlaneRecoveryEligible: !unavailable,
          repairEligible: !unavailable,
          serveEligible: !unavailable,
        },
      };
    },
    getPriorityRecoveryPlanningSnapshotBestEffort() {
      return planningSnapshot;
    },
  });
}

export function buildPriorityDrainSupersededReadinessService(
  partitionId,
  operationId,
) {
  const planningSnapshot =
    buildPriorityDrainSupersededPlanningSnapshot(partitionId, operationId);
  return Object.freeze({
    getNodeReadinessSync(nodeId) {
      return {
        nodeId,
        dimensions: {
          controlPlaneRecoveryEligible: true,
          repairEligible: true,
          serveEligible: true,
        },
      };
    },
    getPriorityRecoveryPlanningSnapshotBestEffort() {
      return planningSnapshot;
    },
  });
}

export {ControlPlaneField, ControlPlaneMessageType, OPERATION_WORKFLOW_OWNER_SHARED, OperationType, PRIORITY_RECOVERY_COMPLETION_STATE, RAFT_ROLE, ReplicaOperationMessageType, ReplicaOperationResponseStatus, ReplicaStatus, SYSTEM_TABLE_NAME, WORKFLOW_STEP, createTestCoordinator, test};

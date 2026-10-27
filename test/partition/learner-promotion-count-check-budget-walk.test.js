// Witness (f), the budget walk and V4-2 for the learner-promotion count
// check, split unchanged out of learner-promotion-count-check-inputs.test.js
// (oversized-file ratchet). Raw node:test, like its sibling.
import test from 'node:test';
import assert from 'node:assert/strict';

import {
  evaluateLearnerPromotionCountCheck,
} from '../../src/partition/learner-promotion-count-check.js';
import {SERVICE_TYPE} from '../../src/constants/index.js';
import {OperationType, ReplicaStatus} from '../../src/rebalancer/replica-status.js';
import {ConfigurationManager} from '../../src/config/configuration-manager.js';
import {
  deriveMembershipPublicationCandidate,
} from '../../src/control-plane/membership-publication-coordinator.js';
import {
  buildPriorityRecoveryOperationContextFromRecord,
  buildPriorityRecoveryPartitionAssessment,
  hasPriorityRecoverySpreadGap,
} from '../../src/control-plane/priority-recovery-snapshot.js';
import {
  buildPriorityRecoveryCompletion,
} from '../../src/control-plane/priority-recovery-completion.js';
import {LoggingService} from '../../src/logging/logging-service.js';
import {
  CRITICAL_PARTITION_ID,
  FOLLOWER_ROLE,
  LEADER_ROLE,
  LEARNER_ROLE,
} from './learner-promotion-count-check-shared-fixtures.js';

if (!ConfigurationManager.getInstance().isInitialized()) {
  ConfigurationManager.getInstance().initialize({});
}
if (!LoggingService.getInstance().isInitialized()) {
  LoggingService.getInstance().initialize({level: 'error'});
}

// Witness (f) and the budget walk (owner decision 2026-10-04, "delete the
// second authority"). The guard's overflow budget is composed exactly as
// resolvePriorityRecoveryCompletionForLearnerPromotion composes it: the
// census summary -> the partition assessment -> buildPriorityRecoveryCompletion
// with priorityRecoveryActive = the census gap -> the count check. Before the
// deletion the run-1 shape credited the completed ADD r4 as satisfying the
// census gap, the closure synthesized a satisfied summary, the budget fell to
// 0 and the cap to 4: would_exceed_target_replica_count for 60 s.
const WALK_PARTITION_ID = CRITICAL_PARTITION_ID;
const WALK_TARGET_REPLICA_COUNT = 3;
const WALK_OTHER_PRIORITY_TABLES = [
  'control_plane_publications',
  'replica_operations',
  'sql_transaction_participants',
  'sql_transactions',
  'sql_write_operations',
];

function walkServiceRow(index, nodeId, status, role) {
  const replicaId = `${WALK_PARTITION_ID}-r${index}`;
  return {
    service_id: replicaId,
    replica_id: replicaId,
    partition_id: WALK_PARTITION_ID,
    service_type: SERVICE_TYPE.PARTITION,
    status,
    raft_role: role,
    node_id: nodeId,
    address: `${nodeId}:${index}`,
  };
}

function walkOtherPriorityRows(holderNodeIds) {
  return WALK_OTHER_PRIORITY_TABLES.flatMap((tableId) =>
    holderNodeIds.map((nodeId, index) => ({
      service_id: `${tableId}-p1-r${index + 1}`,
      partition_id: `${tableId}-p1`,
      service_type: SERVICE_TYPE.PARTITION,
      status: ReplicaStatus.ACTIVE,
      raft_role: index === 0 ? LEADER_ROLE : FOLLOWER_ROLE,
      node_id: nodeId,
      address: `${nodeId}:1`,
    })));
}

function walkOperationRow(record) {
  return {
    operation_id: record.operationId,
    type: record.type,
    partition_id: record.partitionId,
    entity_type: 'partition',
    entity_id: record.partitionId,
    replica_id: record.replicaId,
    source_node_id: record.sourceNodeId,
    target_node_id: record.targetNodeId,
    status: record.status,
    workflow_step: record.workflowStep,
    created_at: record.createdAt,
    updated_at: record.updatedAt,
    completed_at: record.completedAt,
    steps_history: '[]',
  };
}

// The summary the joiner's guard reads is its LOCAL candidate derivation
// (getMembershipPublicationPlanningSnapshotSync ->
// deriveClusterMembershipCandidateSync), not the bare census: that is where
// the closure's synthesized summary used to win.
function deriveGuardPlanningSummary({replicaRows, eligibleNodeIds, operationRecords}) {
  const publishedRow = {
    publication_epoch: 8,
    status: 'PUBLISHED',
    published_active_node_ids: eligibleNodeIds,
    required_ack_node_ids: eligibleNodeIds,
    acknowledged_node_ids: eligibleNodeIds,
  };
  return deriveMembershipPublicationCandidate({
    publisherNodeId: eligibleNodeIds[0],
    latestPublicationRow: publishedRow,
    latestPublishedPublicationRow: publishedRow,
    nodeRows: eligibleNodeIds.map((nodeId) => ({
      node_id: nodeId,
      status: 'active',
      connection_state: 'ready',
      ready_lease_expires_at: 5000,
    })),
    readinessEntries: eligibleNodeIds.map((nodeId) => ({
      nodeId,
      dimensions: {
        clusterMemberHealthy: true,
        controlPlanePublished: true,
        controlPlaneWritable: true,
        repairEligible: true,
        serveEligible: true,
      },
    })),
    nodeEndpointRows: eligibleNodeIds.map((nodeId) => ({
      endpoint_id: `${nodeId}-ws`,
      node_id: nodeId,
      transport_type: 'ws',
      status: 'active',
      address: `ws://${nodeId}:8082`,
    })),
    partitionRows: [WALK_PARTITION_ID, ...WALK_OTHER_PRIORITY_TABLES.map(
      (tableId) => `${tableId}-p1`,
    )].map((partitionId) => ({
      partition_id: partitionId,
      table_id: partitionId.replace(/-p1$/, ''),
      replica_count: WALK_TARGET_REPLICA_COUNT,
    })),
    serviceRows: [
      ...replicaRows,
      ...walkOtherPriorityRows(eligibleNodeIds.slice(0, 3)),
    ],
    replicaOperationRows: operationRecords.map(walkOperationRow),
    nowMs: 3000,
  }).priorityPartitionSummary;
}

function evaluateWalkStep({
  replicaRows,
  eligibleNodeIds,
  operationRecords = [],
  isJoiningExistingGroup = true,
}) {
  const census = deriveGuardPlanningSummary({
    replicaRows,
    eligibleNodeIds,
    operationRecords,
  });
  const assessment = buildPriorityRecoveryPartitionAssessment({
    partitionId: WALK_PARTITION_ID,
    priorityPartitionSummary: census,
    admission: {
      effectiveEligibleNodeIds: eligibleNodeIds,
      effectiveEligibleNodeCount: eligibleNodeIds.length,
      ineligibleNodes: [],
    },
    operationContexts: operationRecords
      .map((record) => buildPriorityRecoveryOperationContextFromRecord(record))
      .filter(Boolean),
  });
  const activeVoterCount = replicaRows.filter((row) =>
    row.status !== ReplicaStatus.FAILED &&
    (row.raft_role === LEADER_ROLE || row.raft_role === FOLLOWER_ROLE),
  ).length;
  const learnerCount = replicaRows.filter(
    (row) => row.raft_role === LEARNER_ROLE,
  ).length;
  const completion = buildPriorityRecoveryCompletion({
    assessment,
    targetReplicaCount: WALK_TARGET_REPLICA_COUNT,
    activeVoterCount,
    learnerCount,
    priorityRecoveryActive: hasPriorityRecoverySpreadGap(census),
  });
  const check = evaluateLearnerPromotionCountCheck({
    targetReplicaCount: WALK_TARGET_REPLICA_COUNT,
    activeVoterCount,
    learnerCount,
    isJoiningExistingGroup,
    hasOwnedAddLikeOperation: true,
    isCriticalSystemPartition: true,
    temporaryOverflowVoterBudget: completion.temporaryOverflowVoterBudget,
  });
  return {census, assessment, completion, check};
}

function walkAddRecord(operationId, replicaIndex, targetNodeId, status, step) {
  return {
    operationId,
    type: OperationType.ADD,
    partitionId: WALK_PARTITION_ID,
    replicaId: `${WALK_PARTITION_ID}-r${replicaIndex}`,
    sourceNodeId: 'node-a',
    targetNodeId,
    status,
    workflowStep: step,
    createdAt: 1000,
    updatedAt: 2000,
    completedAt: status === ReplicaStatus.ACTIVE ? 2000 : null,
    stepsHistory: [],
  };
}

const WALK_FIVE_NODES = ['node-a', 'node-b', 'node-c', 'node-d', 'node-e'];
const A = ReplicaStatus.ACTIVE;
const S = ReplicaStatus.SYNCING;

test('(f) run-1 shape: budget 2, cap 6, the r5 promotion is not refused', () => {
  const {check, completion, assessment} = evaluateWalkStep({
    replicaRows: [
      walkServiceRow(1, 'node-a', A, LEADER_ROLE),
      walkServiceRow(2, 'node-a', A, FOLLOWER_ROLE),
      walkServiceRow(3, 'node-a', A, FOLLOWER_ROLE),
      walkServiceRow(4, 'node-b', A, FOLLOWER_ROLE),
      walkServiceRow(5, 'node-c', S, LEARNER_ROLE),
    ],
    eligibleNodeIds: WALK_FIVE_NODES,
    operationRecords: [
      walkAddRecord('op-r4', 4, 'node-b', A, 'ACTIVE'),
      walkAddRecord('op-r5', 5, 'node-c', S, 'SYNCING'),
    ],
  });
  assert.equal(assessment.spreadCompletion.satisfied, false);
  assert.equal(completion.temporaryOverflowVoterBudget, 2);
  assert.equal(check.maxAllowedVotersAfterPromotion, 6);
  assert.equal(check.refusalReason, 'not_refused');
});

test('budget walk: every interleaving of the formation sequence and the ' +
  'small-cluster shapes is admitted', () => {
  const steps = [
    {
      label: '1 promote r4 on B (A,A,A + learner)',
      replicaRows: [
        walkServiceRow(1, 'node-a', A, LEADER_ROLE),
        walkServiceRow(2, 'node-a', A, FOLLOWER_ROLE),
        walkServiceRow(3, 'node-a', A, FOLLOWER_ROLE),
        walkServiceRow(4, 'node-b', S, LEARNER_ROLE),
      ],
      eligibleNodeIds: WALK_FIVE_NODES,
      operationRecords: [walkAddRecord('op-r4', 4, 'node-b', S, 'SYNCING')],
      budget: 2,
    },
    {
      label: '2a promote r5 on C, no trim yet (A,A,A,B + learner)',
      replicaRows: [
        walkServiceRow(1, 'node-a', A, LEADER_ROLE),
        walkServiceRow(2, 'node-a', A, FOLLOWER_ROLE),
        walkServiceRow(3, 'node-a', A, FOLLOWER_ROLE),
        walkServiceRow(4, 'node-b', A, FOLLOWER_ROLE),
        walkServiceRow(5, 'node-c', S, LEARNER_ROLE),
      ],
      eligibleNodeIds: WALK_FIVE_NODES,
      operationRecords: [walkAddRecord('op-r5', 5, 'node-c', S, 'SYNCING')],
      budget: 2,
    },
    {
      label: '2b after one A trim (A,A,B + learner)',
      replicaRows: [
        walkServiceRow(1, 'node-a', A, LEADER_ROLE),
        walkServiceRow(2, 'node-a', A, FOLLOWER_ROLE),
        walkServiceRow(4, 'node-b', A, FOLLOWER_ROLE),
        walkServiceRow(5, 'node-c', S, LEARNER_ROLE),
      ],
      eligibleNodeIds: WALK_FIVE_NODES,
      operationRecords: [walkAddRecord('op-r5', 5, 'node-c', S, 'SYNCING')],
      budget: 2,
    },
    {
      label: '2c after both A trims (A,B + learner)',
      replicaRows: [
        walkServiceRow(1, 'node-a', A, LEADER_ROLE),
        walkServiceRow(4, 'node-b', A, FOLLOWER_ROLE),
        walkServiceRow(5, 'node-c', S, LEARNER_ROLE),
      ],
      eligibleNodeIds: WALK_FIVE_NODES,
      operationRecords: [walkAddRecord('op-r5', 5, 'node-c', S, 'SYNCING')],
      budget: 0,
    },
    {
      label: '2d joiner cache still shows r4 syncing (census gap 2)',
      replicaRows: [
        walkServiceRow(1, 'node-a', A, LEADER_ROLE),
        walkServiceRow(2, 'node-a', A, FOLLOWER_ROLE),
        walkServiceRow(3, 'node-a', A, FOLLOWER_ROLE),
        walkServiceRow(4, 'node-b', S, FOLLOWER_ROLE),
        walkServiceRow(5, 'node-c', S, LEARNER_ROLE),
      ],
      eligibleNodeIds: WALK_FIVE_NODES,
      operationRecords: [walkAddRecord('op-r5', 5, 'node-c', S, 'SYNCING')],
      budget: 2,
    },
    {
      label: '2-node cluster (seed + one joiner)',
      replicaRows: [
        walkServiceRow(1, 'node-a', A, LEADER_ROLE),
        walkServiceRow(2, 'node-a', A, FOLLOWER_ROLE),
        walkServiceRow(3, 'node-a', A, FOLLOWER_ROLE),
        walkServiceRow(4, 'node-b', S, LEARNER_ROLE),
      ],
      eligibleNodeIds: ['node-a', 'node-b'],
      operationRecords: [walkAddRecord('op-r4', 4, 'node-b', S, 'SYNCING')],
      budget: 2,
    },
    {
      label: '3-node cluster, one node down, replacement promotion',
      replicaRows: [
        walkServiceRow(1, 'node-a', A, LEADER_ROLE),
        walkServiceRow(2, 'node-b', A, FOLLOWER_ROLE),
        walkServiceRow(3, 'node-b', A, FOLLOWER_ROLE),
        walkServiceRow(4, 'node-a', S, LEARNER_ROLE),
      ],
      eligibleNodeIds: ['node-a', 'node-b'],
      operationRecords: [{
        ...walkAddRecord('op-replace', 4, 'node-a', S, 'SYNCING'),
        type: OperationType.REPLACE,
        sourceNodeId: 'node-c',
      }],
      budget: 0,
    },
    {
      label: 'REPLACE in flight (voters 3 + learner, census satisfied)',
      replicaRows: [
        walkServiceRow(1, 'node-a', A, LEADER_ROLE),
        walkServiceRow(2, 'node-b', A, FOLLOWER_ROLE),
        walkServiceRow(3, 'node-c', A, FOLLOWER_ROLE),
        walkServiceRow(4, 'node-d', S, LEARNER_ROLE),
      ],
      eligibleNodeIds: WALK_FIVE_NODES,
      operationRecords: [{
        ...walkAddRecord('op-replace', 4, 'node-d', S, 'SYNCING'),
        type: OperationType.REPLACE,
        sourceNodeId: 'node-c',
      }],
      budget: 0,
    },
  ];
  for (const step of steps) {
    const {completion, check} = evaluateWalkStep(step);
    assert.equal(completion.temporaryOverflowVoterBudget, step.budget,
      `${step.label}: budget`);
    assert.equal(check.refusalReason, 'not_refused',
      `${step.label}: admitted (cap ${check.maxAllowedVotersAfterPromotion}, ` +
        `after ${check.votersAfterPromotion})`);
  }
});

// V4 condition 2 (one-spread-authority verification): the promoting learner's
// OWN node outside the eligible set its guard's census is computed over, so
// requiredDistinctNodeCount = min(3, |eligible|) is computed without it.
//
// What the guard does: it follows the census. Without its node the census
// can read "spread" (3-node cluster: eligible {A,B}, required 2, holders A,B,
// gap 0, budget 0) and the promotion above target is refused.
//
// Why this is not a mis-read of spread (reachability, from the code):
// - The learner exists only because the planner chose its node as an ADD
//   target from the published eligible cohort, so the node was eligible when
//   the operation was planned.
// - The node's own view of itself is never staler than another node's: its
//   heartbeat installs the authoritative NODES row it just published, and
//   since V3a the READY promotion (CRITICAL) and the lease renewals (the
//   10 s maintenance write, CRITICAL, inside the 15 s lease) are never
//   deferred behind published convergence. A publication ack deferral cannot
//   exclude it either: only nodes outside the published baseline are
//   ack-deferred, and an ADD target is inside it.
// - So the node leaves its own eligible set only when it is genuinely not
//   eligible (lease lapsed, readiness not promotable). Then the census is
//   right: a voter on an ineligible node is not a holder, and promoting it
//   only adds a voter above target. The refusal is not latched - the guard
//   rechecks every second and on every published-epoch change - and the
//   first evaluation after the node is eligible again admits it.
// - With five nodes the shape cannot occur: two other eligible nodes keep
//   required at 3, so the gap (and the budget) stay.
test('V4-2: a learner outside its own eligible set follows the census and is admitted on its return', () => {
  const formationRows = [
    walkServiceRow(1, 'node-a', A, LEADER_ROLE),
    walkServiceRow(2, 'node-a', A, FOLLOWER_ROLE),
    walkServiceRow(3, 'node-a', A, FOLLOWER_ROLE),
    walkServiceRow(4, 'node-b', A, FOLLOWER_ROLE),
    walkServiceRow(5, 'node-c', S, LEARNER_ROLE),
  ];
  const operationRecords =
    [walkAddRecord('op-r5', 5, 'node-c', S, 'SYNCING')];

  const outside = evaluateWalkStep({
    replicaRows: formationRows,
    eligibleNodeIds: ['node-a', 'node-b'],
    operationRecords,
  });
  assert.equal(outside.census.requiredDistinctNodeCount, 2,
    'the census is computed without the learner node');
  assert.equal(outside.census.satisfied, true);
  assert.equal(outside.completion.temporaryOverflowVoterBudget, 0);
  assert.equal(outside.check.refusalReason, 'would_exceed_target_replica_count',
    'a learner on an ineligible node is not promoted above target');

  const returned = evaluateWalkStep({
    replicaRows: formationRows,
    eligibleNodeIds: ['node-a', 'node-b', 'node-c'],
    operationRecords,
  });
  assert.equal(returned.census.requiredDistinctNodeCount, 3);
  assert.equal(returned.census.satisfied, false);
  assert.equal(returned.completion.temporaryOverflowVoterBudget, 2);
  assert.equal(returned.check.refusalReason, 'not_refused',
    'the first evaluation with the node eligible again admits it');

  const fiveNodes = evaluateWalkStep({
    replicaRows: formationRows,
    eligibleNodeIds: ['node-a', 'node-b', 'node-d', 'node-e'],
    operationRecords,
  });
  assert.equal(fiveNodes.census.requiredDistinctNodeCount, 3,
    'five nodes: the learner node out of the set leaves required at 3');
  assert.equal(fiveNodes.census.satisfied, false);
  assert.equal(fiveNodes.check.refusalReason, 'not_refused');
});

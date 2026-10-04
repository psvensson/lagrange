/**
 * End-to-end over the real decision owners (owner decision 2026-10-04,
 * "delete the second authority"): the formation sequence that refused the
 * second-wave promotions in the run-1 shape, driven step by step with an
 * injected clock through the same owners a node consults -
 *
 *   rows -> the joiner's local candidate derivation (the guard's summary)
 *        -> decision snapshots (closure witness)
 *        -> planning admission for the partition's open operation
 *        -> the learner count check (overflow budget)
 *        -> the remove-safety spread floor for each trim.
 *
 * Seed r1-r3 on A; ADD r4 -> B; ADD r5 -> C; then the two A trims. At every
 * step: no would_exceed_target_replica_count, at most one unresolved
 * operation per partition (a second ADD is never admitted while one is
 * open), and every trim keeps the spread floor.
 *
 * Out of scope in-process: raft voter-ready timing (VOTER_READY_TIMEOUT and
 * the voter-ready wait) needs live replicas; it is measured by a lab
 * formation, not here.
 */

import {test} from '../../src/test-helpers/tap.js';
import {
  deriveMembershipPublicationCandidate,
} from '../../src/control-plane/membership-publication-coordinator.js';
import {
  buildPriorityRecoveryDecisionSnapshots,
  buildPriorityRecoveryOperationAssessment,
  buildPriorityRecoveryOperationContextFromRecord,
  buildPriorityRecoveryPartitionAssessment,
  hasPriorityRecoverySpreadGap,
  shouldPriorityRecoveryOperationBlockPlanning,
} from '../../src/control-plane/priority-recovery-snapshot.js';
import {
  buildPriorityRecoveryCompletion,
} from '../../src/control-plane/priority-recovery-completion.js';
import {
  evaluateLearnerPromotionCountCheck,
} from '../../src/partition/learner-promotion-count-check.js';
import {
  QUORUM_PROJECTION_SCOPE,
  projectQuorumAfterRemoval,
} from '../../src/rebalancer/operation-workflow-remove-safety-evaluator.js';

const PARTITION = 'schema_operations-p1';
const OTHER_TABLES = Object.freeze([
  'control_plane_publications',
  'replica_operations',
  'sql_transaction_participants',
  'sql_transactions',
  'sql_write_operations',
]);
const NODES = Object.freeze(['node-a', 'node-b', 'node-c', 'node-d', 'node-e']);
const TARGET_REPLICA_COUNT = 3;
const STEP_MS = 1000;
const WOULD_EXCEED = 'would_exceed_target_replica_count';

function createClock(startMs) {
  let nowMs = startMs;
  return {
    now: () => nowMs,
    advance: (deltaMs) => {
      nowMs += deltaMs;
      return nowMs;
    },
  };
}

function replicaRow(index, nodeId, status, role) {
  return {
    service_id: `${PARTITION}-r${index}`,
    replica_id: `${PARTITION}-r${index}`,
    partition_id: PARTITION,
    service_type: 'partition',
    status,
    raft_role: role,
    node_id: nodeId,
    address: `${nodeId}:${index}`,
  };
}

function otherPriorityRows() {
  return OTHER_TABLES.flatMap((tableId) =>
    ['node-a', 'node-b', 'node-c'].map((nodeId, index) => ({
      service_id: `${tableId}-p1-r${index + 1}`,
      partition_id: `${tableId}-p1`,
      service_type: 'partition',
      status: 'active',
      raft_role: index === 0 ? 'leader' : 'follower',
      node_id: nodeId,
      address: `${nodeId}:1`,
    })));
}

function addOperation(operationId, index, targetNodeId, status, step, clock) {
  return {
    operation_id: operationId,
    type: 'ADD',
    partition_id: PARTITION,
    entity_type: 'partition',
    entity_id: PARTITION,
    replica_id: `${PARTITION}-r${index}`,
    source_node_id: 'node-a',
    target_node_id: targetNodeId,
    status,
    workflow_step: step,
    created_at: clock.now() - STEP_MS,
    updated_at: clock.now(),
    completed_at: status === 'active' ? clock.now() : null,
    steps_history: '[]',
  };
}

function deriveJoinerSummary(world, clock) {
  const publishedRow = {
    publication_epoch: 8,
    status: 'PUBLISHED',
    published_active_node_ids: NODES,
    required_ack_node_ids: NODES,
    acknowledged_node_ids: NODES,
  };
  return deriveMembershipPublicationCandidate({
    publisherNodeId: 'node-c',
    latestPublicationRow: publishedRow,
    latestPublishedPublicationRow: publishedRow,
    nodeRows: NODES.map((nodeId) => ({
      node_id: nodeId,
      status: 'active',
      connection_state: 'ready',
      ready_lease_expires_at: clock.now() + 60 * STEP_MS,
    })),
    readinessEntries: NODES.map((nodeId) => ({
      nodeId,
      dimensions: {
        clusterMemberHealthy: true,
        controlPlanePublished: true,
        controlPlaneWritable: true,
        repairEligible: true,
        serveEligible: true,
      },
    })),
    nodeEndpointRows: NODES.map((nodeId) => ({
      endpoint_id: `${nodeId}-ws`,
      node_id: nodeId,
      transport_type: 'ws',
      status: 'active',
      address: `ws://${nodeId}:8082`,
    })),
    partitionRows: [PARTITION, ...OTHER_TABLES.map((t) => `${t}-p1`)].map(
      (partitionId) => ({
        partition_id: partitionId,
        table_id: partitionId.replace(/-p1$/, ''),
        replica_count: TARGET_REPLICA_COUNT,
      })),
    serviceRows: [...world.replicas, ...otherPriorityRows()],
    replicaOperationRows: world.operations,
    nowMs: clock.now(),
  }).priorityPartitionSummary;
}

function openOperations(world) {
  return world.operations.filter((row) => row.status !== 'active');
}

function evaluateStep(world, clock) {
  const summary = deriveJoinerSummary(world, clock);
  const voters = world.replicas.filter((row) =>
    ['leader', 'follower'].includes(row.raft_role)).length;
  const learners = world.replicas.filter(
    (row) => row.raft_role === 'learner').length;
  const assessment = buildPriorityRecoveryPartitionAssessment({
    partitionId: PARTITION,
    priorityPartitionSummary: summary,
    admission: {
      effectiveEligibleNodeIds: NODES,
      effectiveEligibleNodeCount: NODES.length,
      ineligibleNodes: [],
    },
    operationContexts: world.operations.map((row) =>
      buildPriorityRecoveryOperationContextFromRecord({
        operationId: row.operation_id,
        type: row.type,
        partitionId: row.partition_id,
        replicaId: row.replica_id,
        sourceNodeId: row.source_node_id,
        targetNodeId: row.target_node_id,
        status: row.status,
        workflowStep: row.workflow_step,
        createdAt: row.created_at,
        updatedAt: row.updated_at,
        completedAt: row.completed_at,
        stepsHistory: [],
      })).filter(Boolean),
  });
  const completion = buildPriorityRecoveryCompletion({
    assessment,
    targetReplicaCount: TARGET_REPLICA_COUNT,
    activeVoterCount: voters,
    learnerCount: learners,
    priorityRecoveryActive: hasPriorityRecoverySpreadGap(summary),
  });
  const check = learners > 0 ?
    evaluateLearnerPromotionCountCheck({
      targetReplicaCount: TARGET_REPLICA_COUNT,
      activeVoterCount: voters,
      learnerCount: learners,
      isJoiningExistingGroup: true,
      hasOwnedAddLikeOperation: true,
      isCriticalSystemPartition: true,
      temporaryOverflowVoterBudget: completion.temporaryOverflowVoterBudget,
    }) :
    null;
  const planningBlockedByOpenOperation = openOperations(world).some((row) =>
    shouldPriorityRecoveryOperationBlockPlanning(
      buildPriorityRecoveryOperationAssessment({
        operation: {
          operationId: row.operation_id,
          type: row.type,
          partitionId: row.partition_id,
          targetNodeId: row.target_node_id,
          status: row.status,
          workflowStep: row.workflow_step,
          replicaId: row.replica_id,
        },
        priorityPartitionSummary: summary,
        effectiveEligibleNodeIds: NODES,
        nowMs: clock.now(),
      })));
  const decisionSnapshots = buildPriorityRecoveryDecisionSnapshots({
    capturedAt: clock.now(),
    publicationConvergence: {
      publicationEpoch: 8,
      publicationStatus: 'PUBLISHED',
      publishedActiveNodeIds: NODES,
      pendingAckNodeIds: [],
      priorityPartitionSummary: summary,
      recoveryActiveNodeIds: NODES,
    },
    readinessByNodeId: {},
    workflowAdmissionsByWorkflowId: {},
    replicaOperationRows: world.operations,
    serviceRows: [...world.replicas, ...otherPriorityRows()],
  });
  return {
    summary,
    completion,
    check,
    planningBlockedByOpenOperation,
    closureState: decisionSnapshots.closureWitness?.state || null,
  };
}

function holderNodeIds(replicas) {
  return [...new Set(replicas
    .filter((row) => row.status === 'active' &&
      ['leader', 'follower'].includes(row.raft_role))
    .map((row) => row.node_id))];
}

test('formation sequence over the real owners: no refusal, one open operation, floors kept',
  async (t) => {
    const clock = createClock(1_000_000);
    const world = {
      replicas: [
        replicaRow(1, 'node-a', 'active', 'leader'),
        replicaRow(2, 'node-a', 'active', 'follower'),
        replicaRow(3, 'node-a', 'active', 'follower'),
      ],
      operations: [],
    };
    const trace = [];
    const record = (label) => {
      const step = evaluateStep(world, clock);
      trace.push({label, ...step});
      t.not(step.check?.refusalReason, WOULD_EXCEED,
        `${label}: never would_exceed_target_replica_count`);
      t.ok(openOperations(world).length <= 1,
        `${label}: at most one unresolved operation for the partition`);
      return step;
    };

    // ADD r4 -> B: the learner joins and promotes.
    clock.advance(STEP_MS);
    world.operations.push(
      addOperation('op-r4', 4, 'node-b', 'syncing', 'SYNCING', clock));
    world.replicas.push(replicaRow(4, 'node-b', 'syncing', 'learner'));
    const r4Learner = record('r4 learner promotes');
    t.equal(r4Learner.completion.temporaryOverflowVoterBudget, 2);
    t.equal(r4Learner.check.refusalReason, 'not_refused');
    t.equal(r4Learner.planningBlockedByOpenOperation, true,
      'the open ADD holds planning: no duplicate operation');

    clock.advance(STEP_MS);
    world.replicas[3] = replicaRow(4, 'node-b', 'active', 'follower');
    world.operations[0] =
      addOperation('op-r4', 4, 'node-b', 'active', 'ACTIVE', clock);
    const afterR4 = record('r4 voter, ADD terminal');
    t.equal(afterR4.summary.satisfied, false, 'gap one remains');
    t.equal(afterR4.closureState, 'closure_pending');
    t.equal(afterR4.planningBlockedByOpenOperation, false,
      'no open operation: the follow-up may be planned');

    // ADD r5 -> C: the second wave that was refused for 60 s before.
    clock.advance(STEP_MS);
    world.operations.push(
      addOperation('op-r5', 5, 'node-c', 'syncing', 'SYNCING', clock));
    world.replicas.push(replicaRow(5, 'node-c', 'syncing', 'learner'));
    const r5Learner = record('r5 learner promotes (run-1 shape)');
    t.equal(r5Learner.completion.temporaryOverflowVoterBudget, 2,
      'the census gap keeps the overflow budget');
    t.equal(r5Learner.check.maxAllowedVotersAfterPromotion, 6);
    t.equal(r5Learner.check.refusalReason, 'not_refused');
    t.equal(r5Learner.planningBlockedByOpenOperation, true);

    clock.advance(STEP_MS);
    world.replicas[4] = replicaRow(5, 'node-c', 'active', 'follower');
    world.operations[1] =
      addOperation('op-r5', 5, 'node-c', 'active', 'ACTIVE', clock);
    const spread = record('r5 voter, spread reached');
    t.equal(spread.summary.satisfied, true,
      'spread is reached on the census the moment the third holder lands');

    // Trims of the A extras: each keeps the spread floor.
    for (const trimmedIndex of [3, 2]) {
      clock.advance(STEP_MS);
      const current = world.replicas;
      const projected = current.filter(
        (row) => row.replica_id !== `${PARTITION}-r${trimmedIndex}`);
      const floor = projectQuorumAfterRemoval({
        currentVoterReadyRows: current,
        projectedVoterReadyRows: projected,
        requiredDistinctNodeCount: 3,
        scope: QUORUM_PROJECTION_SCOPE.PUBLISHED_SPREAD,
      });
      t.equal(floor.floorSatisfied, true,
        `trim r${trimmedIndex}: the spread floor holds`);
      world.replicas = projected;
      record(`after trim r${trimmedIndex}`);
    }
    t.same(holderNodeIds(world.replicas).sort(),
      ['node-a', 'node-b', 'node-c']);
    t.equal(
      trace.filter((entry) => entry.check?.refusalReason === WOULD_EXCEED)
        .length,
      0,
      'zero would_exceed_target_replica_count across the whole sequence',
    );
  });

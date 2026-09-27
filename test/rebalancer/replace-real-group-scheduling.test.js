/**
 * P2 scheduling equivalence on a REAL rs-raft group (amendment-1 section 3):
 * an event and a decision that reads the input it moves are ordered both
 * ways - decide-first (the decision runs before the event is processed) and
 * process-first - and the full output is compared: the terminal outcome,
 * the removals and their authority, the attempts (handoffs and R-1f
 * proposals) and the planner's operations. Either the outputs are equal or
 * the decide-first decision answered WAIT and the outputs are equal once the
 * event is processed.
 *
 * Cells here (the moved input is consensus state, a row, a remote terminal
 * write or the planner's view):
 *   S1 membership change x R-1a;   S2 membership change x R-1f;
 *   S3 leader change x attempt resolution (handoff);
 *   S5 STEP_DOWN answer in flight x attempt resolution;
 *   S6 source-row delete x T5'/R-1f preconditions;
 *   S7 remote terminal write x completion;
 *   S8 planner check x planner excess;
 *   S11 a concurrent operation between SAFE and the effect (section 3.2).
 *   S14 leader change x R-1a (generated: two staleness shapes x two orders,
 *       the dimension "authority currentness" of verification round 1 V1,
 *       fix-f7), crossed with the retire route (RETIRE only to a
 *       corroborated leader, never to a stale one nor to a follower target).
 * Readiness publication x remove safety is the approved R-2 evidence (W6,
 * 27 cells); leader/term change x R-1f re-drive is AN6 (the D2 file). The
 * direct anchor "a stale leader's answer never retires the source" is
 * replace-real-group-deposed-leader.test.js (fix-f7), whose two shapes S14
 * generates over both orders.
 */

import {test} from '../../src/test-helpers/tap.js';
import {WORKFLOW_STEP} from '../../src/constants/index.js';
import {EntityType} from '../../src/rebalancer/unified-rebalancer.js';
import {
  OperationType,
  ReplicaStatus,
  WORKFLOW_STEP_TO_STATUS,
} from '../../src/rebalancer/replica-status.js';
import {REBALANCER_MOVE_TYPE} from '../../src/rebalancer/rebalancer-constants.js';
import {
  ReplicaOperationResponseStatus,
} from '../../src/rebalancer/replica-operation-constants.js';
import {
  REPLACE_COMPLETION_VERDICT,
  REPLACE_WAIT_REASON,
  decideReplaceCompletion,
  readReplaceOwnerDiagnostic,
} from '../../src/rebalancer/operation-workflow-replace-owner.js';
import {
  RAFT_MEMBERSHIP_OPERATION,
} from '../../src/raft/raft-operation-port-constants.js';
import {createMockCache, createTestRebalancer} from './test-helpers.js';
import {
  NODE,
  ORDINARY_PARTITION_ID,
  STALE_AUTHORITY_WAITS,
  disposeWorld,
  driveToIntent,
  electAmongLive,
  openReplaceWorld,
  readPersisted,
  runToQuiescence,
  runToQuiescenceWithSweeps,
  serviceRow,
  setSourceRow,
  settleTurns,
  waitUntil,
} from './replace-real-group-harness.js';

test('T5-prime installs the canonical waiter and fallback before returning ' +
  'from a re-sent removal effect', async (t) => {
  const world = await openReplaceWorld({
    replicaCount: 1,
    sourceLeads: true,
    sourceHandler: true,
    removingWriteFails: true,
  });
  try {
    await driveToIntent(world);
    world.group.advance(100);
    await settleTurns();
    world.removingWriteFails = false;
    world.clockOffsetMs += 61_000;
    const before = world.removeEffects.length;
    await world.coordinator.reconcileOperationProgress(
      await readPersisted(world));
    await settleTurns();
    t.ok(world.removeEffects.length > before, 'the T5-prime resend occurred');

    const outcome = await runToQuiescence(world, {
      rounds: 8,
      useFallback: false,
    });
    t.equal(outcome.workflowStep, WORKFLOW_STEP.REMOVED,
      'row/membership wakes converge without waiting for the K1 sweep');
    t.equal(world.group.sourceCommittedVoter(world.sourceReplicaId), false,
      'completion follows the committed removal');
  } finally {
    await disposeWorld(world);
  }
});

function diagnosticReason(world) {
  return readReplaceOwnerDiagnostic(world.coordinator.workflowOwner,
    world.operation.operationId)?.reason ?? null;
}

async function outputOf(world) {
  const persisted = await readPersisted(world);
  return {
    workflowStep: persisted.workflowStep,
    sourceCommittedVoter: world.group.sourceCommittedVoter(world.sourceReplicaId),
    handoffs: world.stepDowns.length,
    retirements: world.retirements.length,
    removeEffects: world.removeEffects.length,
    rowDrivenProposals: world.group.rowDrivenProposals.length,
    terminalWrites: world.terminalWrites.map((write) =>
      [write.step, write.sourceCommittedVoter]),
  };
}

async function entry(world) {
  await world.coordinator.reconcileOperationProgress(await readPersisted(world));
  await settleTurns();
}

test('S1: membership change x R-1a - decide-first waits STILL_VOTER; ' +
  'process-first completes; equal once processed', async (t) => {
  const first = await openReplaceWorld();
  const second = await openReplaceWorld();
  try {
    await driveToIntent(first);
    await driveToIntent(second);
    first.eventsSuppressed = true;
    second.eventsSuppressed = true;
    // Decide-first: the decision before the group processes the RemoveNode.
    await entry(first);
    t.equal((await readPersisted(first)).workflowStep, WORKFLOW_STEP.STOPPING,
      'decide-first: WAIT');
    t.equal(diagnosticReason(first),
      REPLACE_WAIT_REASON.SOURCE_MEMBERSHIP_REMOVAL_PENDING,
      'decide-first: the wait names the membership removal');
    first.group.advance();
    await entry(first);
    // Process-first.
    second.group.advance();
    await entry(second);
    const [left, right] = [await outputOf(first), await outputOf(second)];
    t.equal(right.workflowStep, WORKFLOW_STEP.REMOVED, 'process-first: REMOVED');
    t.same(left, right, 'equal outputs once the event is processed');
  } finally {
    await disposeWorld(first);
    await disposeWorld(second);
  }
});

test('S2: membership change x R-1f - a removal committed by the leader\'s ' +
  'row-driven path while R-1f\'s proposal is lost: no double authority',
async (t) => {
  const worlds = [await openReplaceWorld({partitionId: ORDINARY_PARTITION_ID,
    sourceLeads: false}), await openReplaceWorld({
    partitionId: ORDINARY_PARTITION_ID, sourceLeads: false})];
  const [first, second] = worlds;
  try {
    for (const world of worlds) {
      await driveToIntent(world);
      world.eventsSuppressed = true;
      for (const replica of world.group.cluster.replicas.values()) {
        replica.inbox.length = 0;
      }
      setSourceRow(world, null);
      world.group.rowDrivenRemoval(world.sourceReplicaId);
    }
    const issued = first.retirements.length;
    // Decide-first: before the row-driven removal commits.
    await entry(first);
    t.equal(first.retirements.length, issued,
      'decide-first: the outstanding attempt blocks a second proposal (WAIT)');
    t.equal((await readPersisted(first)).workflowStep, WORKFLOW_STEP.STOPPING,
      'decide-first: WAIT');
    first.group.advance();
    await entry(first);
    // Process-first.
    second.group.advance();
    await entry(second);
    const [left, right] = [await outputOf(first), await outputOf(second)];
    t.equal(right.workflowStep, WORKFLOW_STEP.REMOVED, 'process-first: REMOVED');
    t.same(left, right, 'equal outputs: one row-driven removal, no re-drive');
  } finally {
    await disposeWorld(first);
    await disposeWorld(second);
  }
});

test('S3: leader change x handoff attempt resolution - decide-first waits ' +
  'on the unresolved attempt; process-first admits the removal', async (t) => {
  const first = await openReplaceWorld();
  const second = await openReplaceWorld();
  try {
    for (const world of [first, second]) {
      await world.coordinator.executeOperation(await readPersisted(world));
      await settleTurns();
      world.eventsSuppressed = true;
      t.equal(world.stepDowns.length, 1, 'setup: one handoff issued');
    }
    // Decide-first: another decision before the transfer took effect.
    await first.coordinator.executeOperation(await readPersisted(first));
    await settleTurns();
    t.equal(first.stepDowns.length, 1, 'decide-first: no second handoff');
    t.equal(first.removeEffects.length, 0, 'decide-first: no removal (WAIT)');
    first.group.settle(() => first.group.leader() === first.targetReplicaId);
    await first.coordinator.executeOperation(await readPersisted(first));
    await settleTurns();
    // Process-first.
    second.group.settle(() => second.group.leader() === second.targetReplicaId);
    await second.coordinator.executeOperation(await readPersisted(second));
    await settleTurns();
    const [left, right] = [await outputOf(first), await outputOf(second)];
    t.equal(right.workflowStep, WORKFLOW_STEP.STOPPING,
      'process-first: the removal intent is durable');
    t.equal(right.removeEffects, 1, 'process-first: one effect');
    t.same(left, right, 'equal outputs: one handoff, one effect');
  } finally {
    await disposeWorld(first);
    await disposeWorld(second);
  }
});

test('S5: a STEP_DOWN answer in flight x attempt resolution - a decision ' +
  'meanwhile issues no second handoff; the refusal then resolves it',
async (t) => {
  const world = await openReplaceWorld();
  try {
    world.holdNextStepDown = true;
    const execution = world.coordinator.executeOperation(
      await readPersisted(world));
    t.ok(await waitUntil(() => world.heldStepDown !== null),
      'setup: the handoff is in flight');
    // Decide-first: the orphan sweep's and the progress route's decisions
    // while the answer is out. The owner's per-operation lane holds them
    // behind the in-flight turn (BR2): they are decided only after the
    // answer, so no decision interleaves with it.
    let decided = false;
    const decisions = Promise.all([
      world.coordinator.reconcileOrphanedOperations(),
      world.coordinator.reconcileOperationProgress(await readPersisted(world)),
    ]).then(() => {
      decided = true;
    });
    await settleTurns();
    t.equal(decided, false,
      'decide-first: the decisions are held behind the in-flight answer');
    t.equal(world.stepDowns.length, 1,
      'decide-first: the unanswered attempt blocks a second handoff (WAIT)');
    world.heldStepDown.release({status: ReplicaOperationResponseStatus.ERROR,
      error: 'transfer refused'});
    await execution;
    await decisions;
    await settleTurns();
    // Process-first: the refusal resolved the attempt; the next decision
    // issues exactly one more, naming the same target.
    await world.coordinator.executeOperation(await readPersisted(world));
    await settleTurns();
    t.ok(world.stepDowns.length >= 2 && world.stepDowns.length <= 3,
      `one attempt at a time followed the refusal (${world.stepDowns.length})`);
    t.same([...new Set(world.stepDowns.map((payload) => payload.replicaId))],
      [world.targetReplicaId], 'every attempt names the target');
  } finally {
    await disposeWorld(world);
  }
});

test('S6: source-row delete x T5\'/R-1f preconditions - decide-first waits ' +
  'for the effect; process-first proposes the removal once', async (t) => {
  const first = await openReplaceWorld();
  const second = await openReplaceWorld();
  try {
    for (const world of [first, second]) {
      // The source node acknowledges the effect but its row lags.
      world.removeEffectAnswer = {acknowledged: true,
        status: ReplicaOperationResponseStatus.INITIATED};
      await driveToIntent(world);
      world.eventsSuppressed = true;
      t.equal(world.retirements.length, 0, 'setup: no R-1f yet');
    }
    await entry(first);
    t.equal(first.retirements.length, 0, 'decide-first: no proposal (WAIT)');
    t.equal(diagnosticReason(first),
      REPLACE_WAIT_REASON.SOURCE_REMOVAL_EFFECT_PENDING,
      'decide-first: waits for the effect');
    for (const world of [first, second]) {
      setSourceRow(world, null);
      world.group.kill(world.sourceReplicaId);
      await entry(world);
      t.equal(world.retirements.length, 1, 'one proposal once the row is gone');
      const outcome = await runToQuiescence(world);
      t.equal(outcome.workflowStep, WORKFLOW_STEP.REMOVED, 'completed');
    }
    t.same(await outputOf(first), await outputOf(second), 'equal outputs');
  } finally {
    await disposeWorld(first);
    await disposeWorld(second);
  }
});

// A terminal another node wrote through the same first-terminal-wins CAS
// (completed_at IS NULL), durable and replicated here when it landed.
async function replicateRemoteTerminal(world, step) {
  const row = world.cache.get('replica_operations', world.operation.operationId);
  const terminal = {...row, workflow_step: step,
    status: WORKFLOW_STEP_TO_STATUS[step], completed_at: Date.now()};
  const result = await world.coordinator.controlPlaneSystemTableGateway
    .submitMutation({
      tableName: 'replica_operations', operation: 'update',
      whereClause: {operation_id: row.operation_id, completed_at: null},
      data: terminal});
  const landed = result?.partitionResult?.affectedRows !== 0;
  if (landed) {
    world.cache.observeRemoteRow('replica_operations', terminal);
  }
  return landed;
}

test('S7: a remote terminal write x completion - the terminal written ' +
  'elsewhere stands in both orders; no REMOVED is written over it',
async (t) => {
  const first = await openReplaceWorld();
  const second = await openReplaceWorld();
  try {
    for (const world of [first, second]) {
      await driveToIntent(world);
      world.eventsSuppressed = true;
      world.group.advance();
      t.equal(world.group.sourceCommittedVoter(world.sourceReplicaId), false,
        'setup: the removal committed');
    }
    // Decide-first: the owner's witness read is in flight when the remote
    // FAILED is written. Two owner decisions may be in flight on the lane;
    // whichever terminal lands first wins, the other is refused by the CAS.
    first.holdNextWitnessRead = true;
    const decision = first.coordinator.reconcileOperationProgress(
      await readPersisted(first));
    t.ok(await waitUntil(() => first.heldWitnessRead !== null),
      'setup: the decision is reading the witness');
    const remoteLanded = await replicateRemoteTerminal(first,
      WORKFLOW_STEP.FAILED);
    await settleTurns();
    first.heldWitnessRead.release();
    await decision;
    await settleTurns();
    // Process-first.
    t.equal(await replicateRemoteTerminal(second, WORKFLOW_STEP.FAILED), true,
      'process-first: the remote terminal landed first');
    await settleTurns();
    await entry(second);
    const expectedFirst = remoteLanded ? WORKFLOW_STEP.FAILED :
      WORKFLOW_STEP.REMOVED;
    for (const [label, world, expected] of [
      ['decide-first', first, expectedFirst],
      ['process-first', second, WORKFLOW_STEP.FAILED]]) {
      const durable = await world.coordinator.repository
        .queryReplicaOperationPersistenceAuthorityOperation(world.operation);
      t.equal(durable.workflowStep, expected,
        `${label}: the first terminal stands (authority read)`);
      const landed = world.terminalWrites.filter((write) =>
        write.durableStepAfter === write.step);
      t.ok(landed.every((write) => write.step === expected),
        `${label}: no other terminal landed over it (${
          JSON.stringify(landed.map((write) => write.step))})`);
      t.equal(readReplaceOwnerDiagnostic(world.coordinator.workflowOwner,
        world.operation.operationId), null,
      `${label}: the owner's state is released (BR17)`);
    }
  } finally {
    await disposeWorld(first);
    await disposeWorld(second);
  }
});

function plannedRemoves(world) {
  const rebalancer = createTestRebalancer({
    entityId: world.partitionId,
    entityType: EntityType.PARTITION,
    systemTableCache: createMockCache({
      services: world.cache.getAll('services'),
      replicaOperations: world.cache.getAll('replica_operations'),
    }),
    nodeId: 'planner-node',
  });
  rebalancer.initialize();
  try {
    return rebalancer.movePlanner.calculateMoves(
      rebalancer.getCurrentReplicas(), {
        targetReplicaCount: world.members.length - 1,
        // The placement leaves a BYSTANDER's node out: with the source
        // counted, the surplus the REPLACE owns would be taken from it.
        targetNodes: world.members.filter(([, nodeId]) =>
          nodeId !== NODE.PEER_B).map(([, nodeId]) => nodeId),
        degraded: false,
      }).filter((move) => move.type === REBALANCER_MOVE_TYPE.REMOVE)
      .map((move) => move.replicaId);
  } finally {
    rebalancer.shutdown();
  }
}

test('S8 / AN1: planner check x the REPLACE\'s terminal - the planner plans ' +
  'nothing while the REPLACE is non-terminal, and never the source through ' +
  'it', async (t) => {
  const world = await openReplaceWorld();
  try {
    t.same(plannedRemoves(world), [], 'ACTIVE: no planner REMOVE');
    await driveToIntent(world);
    t.same(plannedRemoves(world), [], 'STOPPING (decide-first): no REMOVE');
    t.equal((await readPersisted(world)).workflowStep, WORKFLOW_STEP.STOPPING,
      'AN1: no early close');
    const outcome = await runToQuiescence(world);
    t.equal(outcome.workflowStep, WORKFLOW_STEP.REMOVED, 'completed');
    setSourceRow(world, null);
    t.same(plannedRemoves(world), [],
      'terminal, source row gone (process-first): no surplus, nothing to plan');
  } finally {
    await disposeWorld(world);
  }
});

const CONCURRENT_OPERATION_ID = 'p2-concurrent-remove';

// The concurrent row is stamped on the owner's clock (the world's offset
// clock): a row stamped on the wall clock before an offset jump is past its
// PENDING step timeout by the owner's clock, and CL-043 rightly excludes a
// stale operation from the serialization gate (fix-f1, F3 witness repair).
function concurrentRemoveRow(world) {
  const nowMs = Date.now() + world.clockOffsetMs;
  return {
    operation_id: CONCURRENT_OPERATION_ID,
    type: OperationType.REMOVE,
    partition_id: world.partitionId,
    entity_type: 'partition',
    entity_id: world.partitionId,
    replica_id: `${world.partitionId}-r3`,
    source_node_id: 'node-c',
    target_node_id: 'node-c',
    status: ReplicaStatus.PENDING,
    workflow_step: WORKFLOW_STEP.PENDING,
    created_at: nowMs,
    updated_at: nowMs,
    completed_at: null,
    steps_history: JSON.stringify([{step: WORKFLOW_STEP.PENDING,
      timestamp: nowMs}]),
  };
}

// The claim (section 3.2, check 5; CL-043 serialization): no REMOVE_REPLICA
// leaves while another non-terminal operation is active on the partition,
// whether it appeared before SAFE or between SAFE and the effect. The
// decide-first cell is red on the frozen production SHA (finding F3, the
// evidence record): the revalidation answers WAIT, but the immediate
// redrive re-enters at STOPPING, where the remove-safety evaluator answers
// SAFE without a check (isReplaceRemovePhase is ACTIVE only), and the T5'
// re-send leaves.
test('S11: a concurrent operation between SAFE and the effect (section ' +
  '3.2 check 5) - the effect waits; before SAFE it defers; equal outputs',
async (t) => {
  const first = await openReplaceWorld();
  const second = await openReplaceWorld();
  try {
    for (const world of [first, second]) {
      // Leadership first (the transfer takes effect); the leader-change wake
      // is suppressed so the next execute is the one that evaluates SAFE.
      await world.coordinator.executeOperation(await readPersisted(world));
      await settleTurns();
      world.eventsSuppressed = true;
      world.group.settle(() => world.group.leader() === world.targetReplicaId);
      await settleTurns();
      t.equal((await readPersisted(world)).workflowStep, WORKFLOW_STEP.ACTIVE,
        'setup: still ACTIVE, SAFE not yet evaluated');
    }
    // Decide-first: SAFE is evaluated, then the REMOVE appears before the
    // effect leaves.
    const owner = first.coordinator.workflowOwner;
    const baseEvaluate = owner.evaluateRemoveSafety.bind(owner);
    owner.evaluateRemoveSafety = async (operation) => {
      const evaluation = await baseEvaluate(operation);
      first.cache.upsert('replica_operations', concurrentRemoveRow(first));
      owner.evaluateRemoveSafety = baseEvaluate;
      return evaluation;
    };
    await first.coordinator.executeOperation(await readPersisted(first));
    await settleTurns();
    t.equal(first.removeEffects.length, 0,
      'decide-first: the effect is withheld (WAIT)');
    // Process-first: the REMOVE is there before SAFE.
    second.cache.upsert('replica_operations', concurrentRemoveRow(second));
    await second.coordinator.executeOperation(await readPersisted(second));
    await settleTurns();
    t.equal(second.removeEffects.length, 0, 'process-first: deferred');
    for (const world of [first, second]) {
      world.cache.upsert('replica_operations', {...concurrentRemoveRow(world),
        status: ReplicaStatus.FAILED, workflow_step: WORKFLOW_STEP.FAILED,
        completed_at: Date.now()});
      await world.coordinator.executeOperation(await readPersisted(world));
      await settleTurns();
      t.equal(world.removeEffects.length, 1,
        'once the concurrent operation is terminal the effect leaves');
    }
    t.same(await outputOf(first), await outputOf(second), 'equal outputs');
  } finally {
    await disposeWorld(first);
    await disposeWorld(second);
  }
});

test('S11 (T5\' re-send): a concurrent operation active at STOPPING defers ' +
  'the re-send of the removal effect as it defers the first send', async (t) => {
  const world = await openReplaceWorld();
  try {
    // The source node acknowledges but its row lags: the intent is durable
    // and the effect must be re-sent later (T5').
    world.removeEffectAnswer = {acknowledged: true,
      status: ReplicaOperationResponseStatus.INITIATED};
    await driveToIntent(world);
    world.eventsSuppressed = true;
    t.equal(world.removeEffects.length, 1, 'setup: the first effect left');
    world.clockOffsetMs += 61_000;
    world.cache.upsert('replica_operations', concurrentRemoveRow(world));
    await world.coordinator.reconcileOperationProgress(
      await readPersisted(world));
    await settleTurns();
    t.equal(world.removeEffects.length, 1,
      'no re-send while a concurrent partition operation is active');
  } finally {
    await disposeWorld(world);
  }
});

test('S12: the target dies (failure detector) between SAFE and the effect ' +
  '- the revalidation withholds the effect; D2 fails it with the source ' +
  'retained', async (t) => {
  const world = await openReplaceWorld();
  try {
    await world.coordinator.executeOperation(await readPersisted(world));
    await settleTurns();
    world.eventsSuppressed = true;
    world.group.settle(() => world.group.leader() === world.targetReplicaId);
    await settleTurns();
    const owner = world.coordinator.workflowOwner;
    const baseEvaluate = owner.evaluateRemoveSafety.bind(owner);
    owner.evaluateRemoveSafety = async (operation) => {
      const evaluation = await baseEvaluate(operation);
      world.cache.upsert('services', serviceRow(world.partitionId,
        world.targetReplicaId, world.targetNodeId, 'leader',
        ReplicaStatus.FAILED));
      world.group.kill(world.targetReplicaId);
      owner.evaluateRemoveSafety = baseEvaluate;
      return evaluation;
    };
    await world.coordinator.executeOperation(await readPersisted(world));
    await settleTurns();
    t.equal(world.removeEffects.length, 0,
      'no REMOVE_REPLICA leaves after the target died');
    await entry(world);
    const persisted = await readPersisted(world);
    t.equal(persisted.workflowStep, WORKFLOW_STEP.FAILED,
      'D2: the target dead with the source a committed voter fails safely');
    t.equal(world.group.sourceCommittedVoter(world.sourceReplicaId), true,
      'the source is retained');
    t.equal(world.removeEffects.length, 0, 'still no effect');
  } finally {
    await disposeWorld(world);
  }
});

test('S13: a terminal written elsewhere between SAFE and the effect - the ' +
  'synchronous revalidation withholds the effect', async (t) => {
  const world = await openReplaceWorld();
  try {
    await world.coordinator.executeOperation(await readPersisted(world));
    await settleTurns();
    world.eventsSuppressed = true;
    world.group.settle(() => world.group.leader() === world.targetReplicaId);
    await settleTurns();
    const owner = world.coordinator.workflowOwner;
    const baseEvaluate = owner.evaluateRemoveSafety.bind(owner);
    let landed = null;
    owner.evaluateRemoveSafety = async (operation) => {
      const evaluation = await baseEvaluate(operation);
      owner.evaluateRemoveSafety = baseEvaluate;
      // Another node's terminal lands after SAFE, before the effect: the
      // owner's copy is not terminal, the replicated row is.
      landed = await replicateRemoteTerminal(world, WORKFLOW_STEP.FAILED);
      return evaluation;
    };
    await world.coordinator.executeOperation(await readPersisted(world));
    await settleTurns();
    t.equal(landed, true, 'setup: the remote terminal landed after SAFE');
    t.equal(world.removeEffects.length, 0,
      'no REMOVE_REPLICA leaves for an operation that became terminal');
    const durable = await world.coordinator.repository
      .queryReplicaOperationPersistenceAuthorityOperation(world.operation);
    t.equal(durable.workflowStep, WORKFLOW_STEP.FAILED, 'the terminal stands');
  } finally {
    await disposeWorld(world);
  }
});

// ---------------------------------------------------------------------------
// S14: leader change x R-1a, generated over the staleness shapes of the
// authority-currentness dimension and both orders.
//
// The event: t (the leader after the handoff) is deposed by a new leader
// that re-admits the source (BR16/A4) while t still believes it leads
// (raft-rs check_quorum off). The decision: R-1a's read of the completion
// authority. Shapes of "the deposition not yet processed by t":
//   partitioned - t is cut off (processes it when the partition heals);
//   stall       - t is connected but has not drained the deposing
//                 heartbeat (its inbox is held).
// Orders: decide-first (R-1a reads while t is stale) must WAIT typed
// (NOT_CORROBORATED) and write nothing; process-first (t processed the
// deposition) decides STILL_VOTER from the corroborated new leader. Both
// converge: R-1f re-drives ONLY through the corroborated leader (never t,
// never the stale answerer), the source leaves again, REMOVED with the
// oracle absent at the write.
const STALE_LEADER_SHAPES = Object.freeze({
  partitioned: {
    make(world, deposed) {
      world.group.cluster.isolate(deposed);
    },
    process(world, deposed) {
      world.group.cluster.heal(deposed);
      world.group.settle(() => world.group.roleOf(deposed) !== 'leader', 60);
      world.group.advance(40);
    },
  },
  stall: {
    make(world, deposed) {
      world.group.cluster.isolate(deposed);
      world.group.holdInbox(deposed);
    },
    process(world, deposed) {
      world.group.releaseInbox(deposed);
      world.group.settle(() => world.group.roleOf(deposed) !== 'leader', 60);
      world.group.advance(40);
    },
  },
});
const DECISION_ORDERS = Object.freeze(['decide-first', 'process-first']);

// Depose t: a new leader among the others re-admits the source under it;
// t (stale) still answers as leader.
async function deposeTargetLeader(world, shape) {
  const deposed = world.targetReplicaId;
  await driveToIntent(world);
  world.eventsSuppressed = true;
  world.group.advance(200);
  shape.make(world, deposed);
  const newLeader = electAmongLive(world);
  world.group.dead.delete(world.sourceReplicaId);
  world.group.cluster.heal(world.sourceReplicaId);
  setSourceRow(world, ReplicaStatus.ACTIVE);
  world.group.commitChange(RAFT_MEMBERSHIP_OPERATION.ADD_PEER,
    world.sourceReplicaId);
  if (shape === STALE_LEADER_SHAPES.stall) {
    // Connected again, the deposing heartbeats queue in t's held inbox.
    world.group.cluster.heal(deposed);
    for (let round = 0; round < 8; round += 1) {
      world.group.cluster.tick(newLeader);
    }
  }
  return {deposed, newLeader};
}

async function assertStaleAnswerWaits(t, world, label) {
  const owner = world.coordinator.workflowOwner;
  const decision = await decideReplaceCompletion(owner,
    await readPersisted(world));
  t.not(decision.verdict, REPLACE_COMPLETION_VERDICT.SOURCE_RETIRED,
    `${label}: a stale leader's answer never retires the source`);
  t.equal(decision.verdict, REPLACE_COMPLETION_VERDICT.UNAVAILABLE,
    `${label}: decide-first answers WAIT`);
  t.equal(decision.observation.reason, STALE_AUTHORITY_WAITS.NOT_CORROBORATED,
    `${label}: typed - not corroborated by a majority at its term`);
  await entry(world);
  t.equal((await readPersisted(world)).workflowStep, WORKFLOW_STEP.STOPPING,
    `${label}: nothing written`);
  t.equal(world.terminalWrites.length, 0, `${label}: no terminal write`);
}

for (const [shapeName, shape] of Object.entries(STALE_LEADER_SHAPES)) {
  for (const order of DECISION_ORDERS) {
    const label = `S14 ${shapeName} ${order}`;
    test(`${label}: leader change x R-1a - the stale leader's answer never ` +
      'retires; the corroborated new leader decides; RETIRE only through ' +
      'it', async (t) => {
      const world = await openReplaceWorld({sourceLeads: false});
      try {
        const {deposed, newLeader} = await deposeTargetLeader(world, shape);
        t.equal(world.group.sourceCommittedVoter(world.sourceReplicaId), true,
          'setup: the source is a committed voter again under the new leader');
        t.equal(world.group.roleOf(deposed), 'leader',
          'setup: the deposed target still believes it leads');
        const retiresBefore = world.retirements.length;
        if (order === 'decide-first') {
          await assertStaleAnswerWaits(t, world, label);
          t.equal(world.retirements.length, retiresBefore,
            `${label}: no RETIRE while the authority is not current`);
          shape.process(world, deposed);
        } else {
          shape.process(world, deposed);
        }
        t.not(world.group.roleOf(deposed), 'leader',
          `${label}: t processed its deposition`);
        const decision = await decideReplaceCompletion(
          world.coordinator.workflowOwner, await readPersisted(world));
        t.equal(decision.verdict, REPLACE_COMPLETION_VERDICT.STILL_VOTER,
          `${label}: the corroborated leader holds the re-admitted source`);
        t.equal(decision.observation.replicaId, newLeader,
          `${label}: the verdict is the new leader's own answer`);
        // The re-admitted source's row reads ACTIVE: the REPLACE returns to
        // its REMOVE_REPLICA path (A4; the T5' re-send after its window),
        // then R-1f. Rounds carry the fallback and the K1 sweep.
        const outcome = await runToQuiescenceWithSweeps(world, {rounds: 20,
          advanceMs: 61_000});
        t.equal(outcome.workflowStep, WORKFLOW_STEP.REMOVED,
          `${label}: R-1f removed the source again, completed`);
        // Every RETIRE after the deposition went to the group's leader at
        // that instant (the corroborated answer's own replica) - on a
        // priority partition the STOPPING re-send re-runs the named handoff
        // (F3 x BR11), so the target may lead again by then; never to a
        // follower and never while the answerer was stale.
        const routes = world.retirementRoutes.slice(retiresBefore);
        t.ok(routes.length >= 1, `${label}: R-1f re-drove`);
        t.ok(routes.every((route) => route.replicaId === route.leader),
          `${label}: every RETIRE went to the leader of the moment (${
            routes.map((route) => `${route.replicaId}=${route.leader}`)
              .join(', ')})`);
        t.equal(world.terminalWrites.filter((write) =>
          write.step === WORKFLOW_STEP.REMOVED && write.sourceCommittedVoter)
          .length, 0, `${label}: no REMOVED while the fold holds the source`);
      } finally {
        world.group.heldInboxes.clear();
        await disposeWorld(world);
      }
    });
  }
}

// S15 (authority currentness x a lagging voter): corroboration is election
// safety over TERMS - a majority of the leader's configuration at its term,
// naming it or none - never the voters' commit indexes (the leader's own
// commit index is already a majority's acknowledgement). RF=2: {source,
// r2, t}, r2 leading, t's inbox held so t lags r2's commit. The removal
// commits with the source's ack; the source leaves and retires; the
// configuration is {r2, t}. r2's ABSENT answer is corroborated by t at the
// term (2 of 2) although t's commit index is behind: SOURCE_RETIRED. A
// commit clause on the confirmations (the fix's first version) would wait
// here until t caught up - forever while it lags.
test('S15: a leader corroborated by a term majority decides although a ' +
  'voter lags its commit index (RF=2)', async (t) => {
  const world = await openReplaceWorld({partitionId: ORDINARY_PARTITION_ID,
    replicaCount: 2, sourceLeads: false, sourceHandler: true});
  try {
    const leader = world.group.leader();
    t.equal(leader, `${ORDINARY_PARTITION_ID}-r2`, 'setup: r2 leads');
    world.group.holdInbox(world.targetReplicaId);
    await driveToIntent(world);
    await settleTurns();
    world.eventsSuppressed = true;
    world.group.advance(200);
    t.equal(world.group.sourceCommittedVoter(world.sourceReplicaId), false,
      'setup: the removal committed with the source\'s ack');
    const leaderStatus = world.group.cluster.node(leader).readStatus();
    const targetStatus = world.group.cluster.node(world.targetReplicaId)
      .readStatus();
    t.ok(Number(targetStatus.commitIndex) < Number(leaderStatus.commitIndex),
      `setup: the held target's commit (${targetStatus.commitIndex}) is ` +
        `below the leader's (${leaderStatus.commitIndex})`);
    t.equal(Number(targetStatus.term), Number(leaderStatus.term),
      'setup: at the leader\'s term');
    const decision = await decideReplaceCompletion(
      world.coordinator.workflowOwner, await readPersisted(world));
    t.not(decision.observation.reason, STALE_AUTHORITY_WAITS.NOT_CORROBORATED,
      'a term majority corroborates the leader; commit lag does not block');
    t.equal(decision.verdict, REPLACE_COMPLETION_VERDICT.SOURCE_RETIRED,
      'the corroborated leader decides SOURCE_RETIRED');
    t.equal(decision.observation.replicaId, leader,
      'the verdict is the leader\'s own answer');
    world.group.releaseInbox(world.targetReplicaId);
    const outcome = await runToQuiescenceWithSweeps(world, {rounds: 20});
    t.equal(outcome.workflowStep, WORKFLOW_STEP.REMOVED, 'completed');
    t.equal(world.terminalWrites.at(-1)?.sourceCommittedVoter, false,
      'at the write the source is absent');
  } finally {
    world.group.heldInboxes.clear();
    await disposeWorld(world);
  }
});

/**
 * Owner decision D2 (2026-09-25) on a REAL rs-raft group: P4 (no
 * timer-driven FAILED after the durable removal intent), P5 (an immediate
 * removal and one after every former budget converge to the same result),
 * P6 (target death is decided from committed membership through the port
 * witness read, three cases distinguished); and the anchors AN2, AN6, AN7,
 * AN9. Oracle and world: replace-real-group-harness.js.
 */

import {test} from '../../src/test-helpers/tap.js';
import {WORKFLOW_STEP} from '../../src/constants/index.js';
import {EntityType} from '../../src/rebalancer/unified-rebalancer.js';
import {ReplicaStatus} from '../../src/rebalancer/replica-status.js';
import {REBALANCER_MOVE_TYPE} from '../../src/rebalancer/rebalancer-constants.js';
import {
  REPLACE_COMPLETION_VERDICT,
  REPLACE_WAIT_REASON,
  decideReplaceCompletion,
  readReplaceOwnerDiagnostic,
} from '../../src/rebalancer/operation-workflow-replace-owner.js';
import {createMockCache, createTestRebalancer} from './test-helpers.js';
import {
  ORDINARY_PARTITION_ID,
  disposeWorld,
  driveToIntent,
  enterOwnerAfter,
  fireFallbackTimers,
  openReplaceWorld,
  readPersisted,
  runToQuiescence,
  setSourceRow,
  setTargetRow,
  settleTurns,
  startCoordinator,
} from './replace-real-group-harness.js';

const FORMER_STEP_BUDGET_MS = 60_000;
const FORMER_OPERATION_BUDGET_MS = 300_000;
const LONG_AFTER_MS = 3_600_000;
const LEASE_EXPIRY_MS = 31_000;
const POST_INTENT_TARGET_DEATH = 'replace_target_dead_source_retained';
const ELEVATED = 'elevated';

function diagnosticOf(world) {
  return readReplaceOwnerDiagnostic(world.coordinator.workflowOwner,
    world.operation.operationId);
}

// The production planner over the world's rows: the REMOVE moves it plans.
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
        targetNodes: world.members.filter(([replicaId]) =>
          replicaId !== world.sourceReplicaId).map(([, nodeId]) => nodeId),
        degraded: false,
      }).filter((move) => move.type === REBALANCER_MOVE_TYPE.REMOVE)
      .map((move) => move.replicaId);
  } finally {
    rebalancer.shutdown();
  }
}

test('P4: after the durable intent, 60 s, 300 s and an hour of every sweep ' +
  'produce no FAILED; the budgets only raise the diagnostic', async (t) => {
  const world = await openReplaceWorld();
  try {
    await driveToIntent(world);
    t.equal((await readPersisted(world)).workflowStep, WORKFLOW_STEP.STOPPING,
      'setup: the intent is durable, the removal not committed');
    for (const advanceMs of [FORMER_STEP_BUDGET_MS + 1_000,
      FORMER_OPERATION_BUDGET_MS, LONG_AFTER_MS]) {
      await enterOwnerAfter(world, advanceMs);
      t.equal((await readPersisted(world)).workflowStep,
        WORKFLOW_STEP.STOPPING, `+${advanceMs} ms: still STOPPING`);
      t.equal(world.terminalWrites.length, 0,
        `+${advanceMs} ms: no terminal write by any sweep`);
    }
    t.equal(diagnosticOf(world)?.severity, ELEVATED,
      'the former budgets are a raised diagnostic severity');
    t.equal(world.group.sourceCommittedVoter(world.sourceReplicaId), true,
      'the source is still a committed voter (nothing was undone)');
    const outcome = await runToQuiescence(world);
    t.equal(outcome.workflowStep, WORKFLOW_STEP.REMOVED,
      'the committed removal still completes it');
  } finally {
    await disposeWorld(world);
  }
});

async function outcomeOf(world) {
  const persisted = await readPersisted(world);
  return {
    workflowStep: persisted.workflowStep,
    sourceCommittedVoter: world.group.sourceCommittedVoter(world.sourceReplicaId),
    terminalWrites: world.terminalWrites.length,
    removeEffects: world.removeEffects.length,
    rowDrivenProposals: world.group.rowDrivenProposals.length,
    plannedRemoves: plannedRemoves(world),
  };
}

test('P5: an immediate removal and one after every former budget converge ' +
  'to the same result; only the diagnostic differs', async (t) => {
  const immediate = await openReplaceWorld();
  const delayed = await openReplaceWorld();
  try {
    await driveToIntent(immediate);
    await driveToIntent(delayed);
    const immediateOutcome = await runToQuiescence(immediate);
    t.equal(immediateOutcome.workflowStep, WORKFLOW_STEP.REMOVED,
      'immediate: completed');
    await enterOwnerAfter(delayed, LONG_AFTER_MS);
    t.equal((await readPersisted(delayed)).workflowStep, WORKFLOW_STEP.STOPPING,
      'delayed: still waiting after every budget');
    t.equal(diagnosticOf(delayed)?.severity, ELEVATED,
      'delayed: the diagnostic differs (elevated)');
    const delayedOutcome = await runToQuiescence(delayed);
    t.equal(delayedOutcome.workflowStep, WORKFLOW_STEP.REMOVED,
      'delayed: completed');
    const [left, right] = [await outcomeOf(immediate), await outcomeOf(delayed)];
    t.same(right, left, 'the same outcome, committed configuration, ' +
      'terminal writes, effects, removal authority and planner output');
    t.equal(left.sourceCommittedVoter, false, 'the source left the group');
    t.ok(delayed.retirements.length >= immediate.retirements.length,
      'the delayed run re-drove the same removal (an idempotent proposal)');
  } finally {
    await disposeWorld(immediate);
    await disposeWorld(delayed);
  }
});

test('P6 (a): the target alive with slow membership waits, decided ' +
  'STILL_VOTER from the target\'s own port', async (t) => {
  const world = await openReplaceWorld();
  try {
    await driveToIntent(world);
    await enterOwnerAfter(world, LONG_AFTER_MS);
    const persisted = await readPersisted(world);
    t.equal(persisted.workflowStep, WORKFLOW_STEP.STOPPING, 'waits');
    t.equal(diagnosticOf(world)?.reason,
      REPLACE_WAIT_REASON.SOURCE_MEMBERSHIP_REMOVAL_PENDING,
      'the wait is the membership removal');
    const decision = await decideReplaceCompletion(
      world.coordinator.workflowOwner, persisted);
    t.equal(decision.verdict, REPLACE_COMPLETION_VERDICT.STILL_VOTER,
      'the target\'s port reports the source a voter');
    t.equal(decision.observation.replicaId, world.targetReplicaId,
      'read from the target');
  } finally {
    await disposeWorld(world);
  }
});

test('P6 (b) / AN9: the target dead with the source still a voter fails ' +
  'safely, decided from a surviving member\'s port', async (t) => {
  const world = await openReplaceWorld();
  try {
    await driveToIntent(world);
    world.group.kill(world.targetReplicaId);
    setTargetRow(world, ReplicaStatus.FAILED);
    const readsBefore = world.witnessReads.length;
    await world.coordinator.reconcileOperationProgress(
      await readPersisted(world));
    await settleTurns();
    const persisted = await readPersisted(world);
    t.equal(persisted.workflowStep, WORKFLOW_STEP.FAILED, 'FAILED');
    t.match(String(persisted.errorMessage), POST_INTENT_TARGET_DEATH,
      'the source is retained');
    const surviving = world.witnessReads.slice(readsBefore).filter((id) =>
      id !== world.targetReplicaId);
    t.ok(surviving.length >= 1, `a surviving member's port decided (${
      surviving.join(', ')})`);
    t.equal(world.group.sourceCommittedVoter(world.sourceReplicaId), true,
      'the committed configuration still holds the source');
    t.equal(world.terminalWrites.at(-1)?.targetRowStatus, ReplicaStatus.FAILED,
      'the FAILED write carries the dead target');
  } finally {
    await disposeWorld(world);
  }
});

test('P6 (c): the target dead after the committed removal completes, ' +
  'never a rollback', async (t) => {
  const world = await openReplaceWorld();
  try {
    await driveToIntent(world);
    world.eventsSuppressed = true;
    world.group.advance();
    t.equal(world.group.sourceCommittedVoter(world.sourceReplicaId), false,
      'setup: the removal committed');
    world.group.kill(world.targetReplicaId);
    setTargetRow(world, ReplicaStatus.FAILED);
    await world.coordinator.reconcileOperationProgress(
      await readPersisted(world));
    await settleTurns();
    t.equal((await readPersisted(world)).workflowStep, WORKFLOW_STEP.REMOVED,
      'completed from the surviving members\' committed absence');
    t.equal(world.terminalWrites.at(-1)?.sourceCommittedVoter, false,
      'the write instant: the source is absent');
  } finally {
    await disposeWorld(world);
  }
});

test('AN2: a healthy owner whose lease would have expired (31 s) is not ' +
  'FAILED by the sweeps, before and after the intent', async (t) => {
  const world = await openReplaceWorld();
  try {
    // ACTIVE with the handoff attempt outstanding (raft not advanced).
    await world.coordinator.executeOperation(await readPersisted(world));
    await settleTurns();
    t.equal(world.stepDowns.length, 1, 'setup: one handoff attempt is open');
    await enterOwnerAfter(world, LEASE_EXPIRY_MS);
    t.equal((await readPersisted(world)).workflowStep, WORKFLOW_STEP.ACTIVE,
      'ACTIVE after 31 s: not FAILED');
    await driveToIntent(world);
    await enterOwnerAfter(world, LEASE_EXPIRY_MS);
    t.equal((await readPersisted(world)).workflowStep, WORKFLOW_STEP.STOPPING,
      'STOPPING after 31 s: not FAILED');
    t.equal(world.terminalWrites.length, 0, 'no terminal write');
  } finally {
    await disposeWorld(world);
  }
});

test('AN6: REMOVE_PEER lost at a leader that was the source; the new ' +
  'leader\'s term wakes R-1f, which completes the REPLACE', async (t) => {
  const world = await openReplaceWorld({partitionId: ORDINARY_PARTITION_ID,
    sourceLeads: true});
  try {
    t.equal(world.group.leader(), world.sourceReplicaId, 'setup: source leads');
    await driveToIntent(world);
    // The effect stopped the leader: the proposal R-1f sent through the
    // target had no leader to reach.
    t.equal(world.group.leader(), null, 'the group has no leader');
    const issued = world.retirements.length;
    t.ok(issued >= 1, 'R-1f proposed once');
    const timersBefore = world.fallbackTimers.filter((h) => h.fired).length;
    // The election: the relay announces the new leader and term to the
    // owner, which re-drives on the changed level (no fallback).
    const outcome = await runToQuiescence(world, {rounds: 30,
      useFallback: false});
    t.equal(outcome.workflowStep, WORKFLOW_STEP.REMOVED, 'completed');
    t.equal(world.fallbackTimers.filter((h) => h.fired).length, timersBefore,
      'no fallback timer fired: the leader/term wake drove it');
    t.ok(world.retirements.length > issued,
      'R-1f re-drove after the leadership change');
    t.equal(world.group.sourceCommittedVoter(world.sourceReplicaId), false,
      'the source left the committed configuration');
  } finally {
    await disposeWorld(world);
  }
});

// On the ordinary partition the target is a follower: its proposal crosses
// the transport to the leader and can be lost there.
test('AN7: a restart in Φ5 (row gone, removal uncommitted and lost) ' +
  'resumes the same owner and completes from committed membership',
async (t) => {
  const world = await openReplaceWorld({partitionId: ORDINARY_PARTITION_ID,
    sourceLeads: false});
  try {
    await driveToIntent(world);
    setSourceRow(world, null);
    // The proposal in flight is lost with the transport.
    for (const replica of world.group.cluster.replicas.values()) {
      replica.inbox.length = 0;
    }
    const issued = world.retirements.length;
    await world.coordinator.shutdown();
    startCoordinator(world);
    await world.coordinator.reconcileOperationProgress(
      await readPersisted(world));
    await settleTurns();
    t.equal((await readPersisted(world)).workflowStep, WORKFLOW_STEP.STOPPING,
      'the restarted owner resumes STOPPING');
    t.equal(world.retirements.length, issued,
      'BR10: the lost attempt is rebuilt as outstanding, not re-issued');
    const outcome = await runToQuiescence(world, {rounds: 20,
      advanceMs: 61_000});
    t.equal(outcome.workflowStep, WORKFLOW_STEP.REMOVED, 'completed');
    t.ok(world.retirements.length > issued,
      'the backstop re-drove the lost proposal');
    t.equal(world.terminalWrites.at(-1)?.sourceCommittedVoter, false,
      'at the write the source is absent');
  } finally {
    await disposeWorld(world);
  }
});

test('D2: the diagnostic exposes the wait, the phase, the target and the ' +
  'membership; nothing grows per retry', async (t) => {
  const world = await openReplaceWorld();
  try {
    await driveToIntent(world);
    for (let round = 0; round < 5; round += 1) {
      await enterOwnerAfter(world, 1_100);
    }
    const diagnostic = diagnosticOf(world);
    t.ok(diagnostic, 'a diagnostic exists');
    t.equal(diagnostic.sourceReplicaId, world.sourceReplicaId);
    t.equal(diagnostic.targetReplicaId, world.targetReplicaId);
    t.ok(typeof diagnostic.reason === 'string');
    t.notOk(Object.values(diagnostic).some(Array.isArray),
      'nothing in it grows per retry');
    await fireFallbackTimers(world);
  } finally {
    await disposeWorld(world);
  }
});

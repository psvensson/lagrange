/**
 * P1 / P1' with the REAL oracle (quest replace-source-removal-owner,
 * amendment-1 section 3; committed-read amendment-1 B12; owner decision D2).
 *
 * Every write of REMOVED on a partition REPLACE, over every success edge the
 * code has, implies the source is absent from the COMMITTED configuration of
 * a real multi-replica rs-raft group at the instant of the write; and every
 * FAILED after the durable removal intent happens only with a
 * failure-detector-dead target. The oracle is the fold of a member's durable
 * log at its durable commit index, never the witness's own answer (see
 * replace-real-group-harness.js).
 *
 * The success and terminal edges are enumerated from the code: the terminal
 * persist sites, the completeOperation and failOperation callers, the
 * REPLACE completion verdicts and the REPLACE terminal steps. A new edge or
 * verdict fails the census below until it has a cell here.
 */

import fs from 'node:fs';
import path from 'node:path';
import {fileURLToPath} from 'node:url';

import {test} from '../../src/test-helpers/tap.js';
import {WORKFLOW_STEP} from '../../src/constants/index.js';
import {
  OPERATION_TERMINAL_WORKFLOW_STEPS_BY_TYPE,
  OperationType,
  ReplicaStatus,
} from '../../src/rebalancer/replica-status.js';
import {
  ReplicaOperationResponseStatus,
} from '../../src/rebalancer/replica-operation-constants.js';
import {
  EXECUTOR_OUTCOME_FIELD,
  EXECUTOR_OUTCOME_TYPE,
} from '../../src/rebalancer/executor-outcome-constants.js';
import {
  REPLACE_COMPLETION_VERDICT,
  REPLACE_TARGET_REMOVED_BEFORE_ACTIVE,
  REPLACE_WAIT_REASON,
  decideReplaceCompletion,
  readReplaceOwnerDiagnostic,
} from '../../src/rebalancer/operation-workflow-replace-owner.js';
import {
  TERMINAL_TRANSITION_REPAIR_CAUSE,
  armTerminalTransitionRepair,
} from '../../src/rebalancer/operation-workflow-terminal-transition-repair.js';
import {
  RAFT_MEMBERSHIP_OPERATION,
} from '../../src/raft/raft-operation-port-constants.js';
import {readPartitionReplicaMembership} from
  '../../src/partition/partition-service-raft-membership-administration.js';
import {
  LEADERLESS_AUTHORITY_WAITS,
  ORDINARY_PARTITION_ID,
  PRIORITY_PARTITION_ID,
  disposeWorld,
  driveToIntent,
  electAmongLive,
  enterOwnerAfter,
  fireFallbackTimers,
  openReplaceWorld,
  readPersisted,
  runToQuiescence,
  setSourceRow,
  setTargetRow,
  settleTurns,
} from './replace-real-group-harness.js';

const REPOSITORY_ROOT = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)), '..', '..');
const REBALANCER_DIRECTORY = path.join(REPOSITORY_ROOT, 'src', 'rebalancer');
const LONG_AFTER_MS = 3_600_000;
const POST_INTENT_TARGET_DEATH = 'replace_target_dead_source_retained';

// The edges as the code has them at the frozen production SHA: a changed
// count or a new file fails here until the new edge has a cell below.
const TERMINAL_PERSIST_SITES = Object.freeze({
  'operation-workflow-transition-persistence.js': 2,
  'operation-workflow-terminal-transition-repair.js': 1,
});
const COMPLETE_OPERATION_CALLERS = Object.freeze({
  'operation-workflow-recovery-drain.js': 1,
  'operation-workflow-executor-outcome-reconcile-methods.js': 1,
  'operation-workflow-recovery-status-reconcile.js': 2,
  'priority-publication-safety-topology.js': 1,
  'operation-workflow-recovery-observation.js': 2,
  'rebalance-coordinator-owner-facade.js': 1,
  'operation-workflow-replace-owner.js': 1,
  'operation-workflow-dispatch-response-reconcile.js': 2,
});
const FAIL_OPERATION_CALLER_FILES = Object.freeze([
  'operation-workflow-dispatch-epoch-gate.js',
  'operation-workflow-dispatch-response-reconcile.js',
  'operation-workflow-executor-outcome-reconcile-methods.js',
  'operation-workflow-recovery-drain.js',
  'operation-workflow-recovery-observation.js',
  'operation-workflow-recovery-status-reconcile.js',
  'operation-workflow-replace-owner.js',
  'operation-workflow-stopping-starvation.js',
  'rebalance-coordinator-owner-facade.js',
]);

function countMatches(source, pattern) {
  return (source.match(pattern) || []).length;
}

function censusOf(pattern) {
  const census = {};
  for (const entry of fs.readdirSync(REBALANCER_DIRECTORY)) {
    if (!entry.endsWith('.js')) {
      continue;
    }
    const count = countMatches(
      fs.readFileSync(path.join(REBALANCER_DIRECTORY, entry), 'utf8'), pattern);
    if (count > 0) {
      census[entry] = count;
    }
  }
  return census;
}

test('P1 census: the terminal edges of the code are the ones with cells',
  async (t) => {
    t.same(censusOf(/terminalTransition: true/gu), TERMINAL_PERSIST_SITES,
      'the terminal persist sites (completeOperation, failOperation, repair)');
    t.same(censusOf(/\.completeOperation\(/gu), COMPLETE_OPERATION_CALLERS,
      'the completeOperation callers');
    t.same(Object.keys(censusOf(/\.failOperation\(/gu)).sort(),
      [...FAIL_OPERATION_CALLER_FILES].sort(), 'the failOperation callers');
    t.same([...OPERATION_TERMINAL_WORKFLOW_STEPS_BY_TYPE.get(
      OperationType.REPLACE)].sort(),
    [WORKFLOW_STEP.FAILED, WORKFLOW_STEP.REMOVED].sort(),
    'a REPLACE has two terminal steps');
    t.same(Object.values(REPLACE_COMPLETION_VERDICT).sort(), [
      'source_retired', 'still_voter', 'unavailable', 'witness_below_gate',
    ], 'the four completion verdicts each have a cell');
  });

function assertRemovedWritesAbsent(t, world, label) {
  const removed = world.terminalWrites.filter((write) =>
    write.step === WORKFLOW_STEP.REMOVED);
  t.ok(removed.length >= 1, `${label}: REMOVED was written`);
  for (const write of removed) {
    t.equal(write.sourceCommittedVoter, false,
      `${label}: at the write the committed configuration (fold at commit ` +
        `${write.committed.commitIndex} of ${write.committed.member}) does ` +
        'not hold the source');
  }
  const founder = world.group.caughtUpFounderView(world.sourceReplicaId);
  if (founder) {
    t.notOk(founder.voters.includes(world.group.peerIdOf(world.sourceReplicaId)),
      `${label}: O-b - a caught-up founder's applied ConfState agrees`);
  }
}

// F1: with no leader able to answer (a real quorum-side event: the leader
// died), the owner waits typed and writes nothing.
async function assertLeaderlessTypedWait(t, world, label, {targetGone} = {}) {
  const persisted = await readPersisted(world);
  t.equal(persisted.workflowStep, WORKFLOW_STEP.STOPPING,
    `${label}: leaderless - the REPLACE waits`);
  t.equal(world.terminalWrites.length, 0, `${label}: leaderless - no write`);
  t.equal(readReplaceOwnerDiagnostic(world.coordinator.workflowOwner,
    world.operation.operationId)?.reason,
  targetGone ? REPLACE_WAIT_REASON.TARGET_DEAD_WITNESS_UNAVAILABLE :
    REPLACE_WAIT_REASON.WITNESS_UNAVAILABLE,
  `${label}: leaderless - the wait is the unavailable authority`);
  const decision = await decideReplaceCompletion(
    world.coordinator.workflowOwner, persisted);
  t.equal(decision.verdict, REPLACE_COMPLETION_VERDICT.UNAVAILABLE,
    `${label}: leaderless - the verdict is UNAVAILABLE`);
  t.ok(LEADERLESS_AUTHORITY_WAITS.includes(decision.observation.reason),
    `${label}: leaderless - typed: ${decision.observation.reason}`);
}

function assertFailedWritesDeadTarget(t, world, label) {
  for (const write of world.terminalWrites.filter((entry) =>
    entry.step === WORKFLOW_STEP.FAILED)) {
    t.equal(write.targetRowStatus, ReplicaStatus.FAILED,
      `${label}: FAILED only with a failure-detector-dead target`);
  }
}

async function assertNoCompletionWhileVoter(t, world, label, entry) {
  t.equal(world.group.sourceCommittedVoter(world.sourceReplicaId), true,
    `${label}: setup - the source is a committed voter`);
  await entry();
  await settleTurns();
  t.equal((await readPersisted(world)).workflowStep, WORKFLOW_STEP.STOPPING,
    `${label}: no completion while the source is a committed voter`);
  t.equal(world.terminalWrites.length, 0, `${label}: no terminal write`);
}

test('P1 sink: completeOperation refuses while the source is a committed ' +
  'voter and grants only once the real RemoveNode is committed', async (t) => {
  const world = await openReplaceWorld({sourceHandler: true});
  try {
    world.currentEdge = 'sink';
    await driveToIntent(world);
    t.equal((await readPersisted(world)).workflowStep, WORKFLOW_STEP.STOPPING,
      'setup: the intent is durable');
    const owner = world.coordinator.workflowOwner;
    const refused = await owner.completeOperation(await readPersisted(world));
    t.equal(refused.committed, false, 'the completion is refused, typed');
    t.equal(refused.verdict, REPLACE_COMPLETION_VERDICT.STILL_VOTER,
      'the verdict is STILL_VOTER (the witness is at its gate)');
    t.equal(world.terminalWrites.length, 0, 'no terminal write');
    // The removal commits (R-1f already proposed it through the target).
    world.group.advance();
    await settleTurns();
    const persisted = await readPersisted(world);
    if (persisted.workflowStep !== WORKFLOW_STEP.REMOVED) {
      await owner.completeOperation(persisted);
    }
    t.equal((await readPersisted(world)).workflowStep, WORKFLOW_STEP.REMOVED,
      'the committed removal completes it');
    assertRemovedWritesAbsent(t, world, 'sink');
  } finally {
    await disposeWorld(world);
  }
});

test('P1 edge (STOPPING owner via reconcileOperationProgress): the ' +
  'membership decides, not the source row', async (t) => {
  const world = await openReplaceWorld({sourceHandler: true});
  try {
    world.currentEdge = 'stopping-owner';
    // The REMOVE_REPLICA answer retires the row but nothing commits a
    // RemoveNode: R-1f is withheld by keeping the target unable to propose
    // (it is the effect the row-driven path would have taken, withheld too).
    await driveToIntent(world);
    setSourceRow(world, null);
    await assertNoCompletionWhileVoter(t, world, 'row gone, voter', () =>
      world.coordinator.reconcileOperationProgress(readPersisted(world)
        .then((operation) => operation)));
    const reason = readReplaceOwnerDiagnostic(world.coordinator.workflowOwner,
      world.operation.operationId)?.reason;
    t.equal(reason, REPLACE_WAIT_REASON.SOURCE_MEMBERSHIP_REMOVAL_PENDING,
      'the owner waits on the membership removal (R-1f in flight)');
    const outcome = await runToQuiescence(world);
    t.equal(outcome.workflowStep, WORKFLOW_STEP.REMOVED, 'it completes');
    assertRemovedWritesAbsent(t, world, 'stopping owner');
    t.equal(world.retirements.length >= 1, true,
      'the removal was R-1f\'s proposal through the target');
  } finally {
    await disposeWorld(world);
  }
});

test('P1 edge (ACTIVE adoption, BR7): a source row already retiring at ' +
  'ACTIVE adopts an intent and never completes from the row', async (t) => {
  const world = await openReplaceWorld();
  try {
    world.currentEdge = 'active-adoption';
    // Another writer's effect: the source's lifecycle retired without a
    // recorded intent (the row reads REMOVING, its process stopped).
    setSourceRow(world, ReplicaStatus.REMOVING);
    world.group.kill(world.sourceReplicaId);
    world.group.advance(200);
    await assertNoCompletionWhileVoter(t, world, 'adoption', () =>
      world.coordinator.reconcileOperationProgress(world.operation));
    const persisted = await readPersisted(world);
    t.ok(persisted.stepsHistory.some((entry) =>
      entry?.replaceRemovalIntent === true), 'an intent was adopted');
    const outcome = await runToQuiescence(world);
    t.equal(outcome.workflowStep, WORKFLOW_STEP.REMOVED, 'it completes');
    assertRemovedWritesAbsent(t, world, 'active adoption');
  } finally {
    await disposeWorld(world);
  }
});

test('P1 edge (stop-phase satisfied answer): a source that answers its ' +
  'removal COMPLETED is not a completion', async (t) => {
  const world = await openReplaceWorld();
  try {
    world.currentEdge = 'stop-phase-satisfied';
    world.removeEffectAnswer = {status: ReplicaOperationResponseStatus.COMPLETED};
    await driveToIntent(world);
    await settleTurns();
    t.equal(world.removeEffects.length, 1, 'setup: the effect was answered');
    t.equal((await readPersisted(world)).workflowStep, WORKFLOW_STEP.STOPPING,
      'the satisfied answer completes nothing while the source is a voter');
    t.equal(world.terminalWrites.length, 0, 'no terminal write');
    // The source's lifecycle then retires and the group commits its removal.
    setSourceRow(world, null);
    world.group.kill(world.sourceReplicaId);
    const outcome = await runToQuiescence(world);
    t.equal(outcome.workflowStep, WORKFLOW_STEP.REMOVED, 'it completes');
    assertRemovedWritesAbsent(t, world, 'stop-phase satisfied');
  } finally {
    await disposeWorld(world);
  }
});

test('P1 edge (lagging pre-intent copy at the stop-phase handler): no ' +
  'REMOVED from a copy that never saw the intent', async (t) => {
  const world = await openReplaceWorld();
  try {
    world.currentEdge = 'lagging-copy';
    await driveToIntent(world);
    const owner = world.coordinator.workflowOwner;
    const lagging = {...world.operation, workflowStep: WORKFLOW_STEP.ACTIVE,
      status: ReplicaStatus.ACTIVE, stepsHistory: world.operation.stepsHistory
        .filter((entry) => entry?.step !== WORKFLOW_STEP.STOPPING)};
    await assertNoCompletionWhileVoter(t, world, 'lagging copy', () =>
      owner.handleStopPhaseSatisfiedResponse(lagging,
        ReplicaOperationResponseStatus.COMPLETED));
  } finally {
    await disposeWorld(world);
  }
});

test('P1 edge (executor outcome REPLICA_REMOVE_COMPLETED): completion ' +
  'evidence is gated by the membership', async (t) => {
  const world = await openReplaceWorld({sourceHandler: true});
  try {
    world.currentEdge = 'executor-outcome';
    await driveToIntent(world);
    const owner = world.coordinator.workflowOwner;
    const outcomeOf = (operation) => ({
      [EXECUTOR_OUTCOME_FIELD.OPERATION_ID]: operation.operationId,
      [EXECUTOR_OUTCOME_FIELD.OUTCOME_TYPE]:
        EXECUTOR_OUTCOME_TYPE.REPLICA_REMOVE_COMPLETED,
      [EXECUTOR_OUTCOME_FIELD.WORKFLOW_STEP]: WORKFLOW_STEP.STOPPING,
    });
    await assertNoCompletionWhileVoter(t, world, 'executor outcome',
      async () => owner.reconcileExecutorCompletionOutcome(
        await readPersisted(world), outcomeOf(world.operation), null));
    world.group.advance();
    await settleTurns();
    const persisted = await readPersisted(world);
    if (persisted.workflowStep !== WORKFLOW_STEP.REMOVED) {
      await owner.reconcileExecutorCompletionOutcome(persisted,
        outcomeOf(persisted), null);
    }
    t.equal((await readPersisted(world)).workflowStep, WORKFLOW_STEP.REMOVED,
      'the committed removal completes it');
    assertRemovedWritesAbsent(t, world, 'executor outcome');
  } finally {
    await disposeWorld(world);
  }
});

test('P1 edge (terminal-transition repair, A11.1): a retained REMOVED is ' +
  're-decided against the real configuration', async (t) => {
  const world = await openReplaceWorld({sourceHandler: true});
  try {
    world.currentEdge = 'repair';
    await driveToIntent(world);
    const owner = world.coordinator.workflowOwner;
    const arm = async () => armTerminalTransitionRepair(owner, {
      ...await readPersisted(world),
      workflowStep: WORKFLOW_STEP.REMOVED,
      status: ReplicaStatus.REMOVED,
      completedAt: Date.now(),
    }, TERMINAL_TRANSITION_REPAIR_CAUSE.PERSIST_NOT_COMMITTED);
    await assertNoCompletionWhileVoter(t, world, 'repair', async () => {
      await arm();
      await fireFallbackTimers(world);
    });
    t.notOk(owner.terminalTransitionRepairStateByOperationId.has(
      world.operation.operationId), 'the repair stood down');
    world.group.advance();
    await settleTurns();
    if ((await readPersisted(world)).workflowStep !== WORKFLOW_STEP.REMOVED) {
      await arm();
      await fireFallbackTimers(world);
    }
    t.equal((await readPersisted(world)).workflowStep, WORKFLOW_STEP.REMOVED,
      'after the committed removal the terminal stands');
    assertRemovedWritesAbsent(t, world, 'repair');
  } finally {
    await disposeWorld(world);
  }
});

test('P1 edge (target status REMOVED after the intent): with the target ' +
  'gone the survivors route the question; leaderless the owner waits typed; ' +
  'the new leader\'s committed absence completes', async (t) => {
  const world = await openReplaceWorld({sourceHandler: true});
  try {
    world.currentEdge = 'target-gone';
    await driveToIntent(world);
    // R-1f already proposed the removal through t; the group commits it,
    // then t (the leader after the handoff) dies before its row is observed
    // gone: the group is leaderless.
    world.group.advance();
    t.equal(world.group.sourceCommittedVoter(world.sourceReplicaId), false,
      'setup: the removal committed');
    world.eventsSuppressed = true;
    world.group.kill(world.targetReplicaId);
    setTargetRow(world, ReplicaStatus.REMOVED);
    await world.coordinator.reconcileOperationProgress(
      await readPersisted(world));
    await settleTurns();
    await assertLeaderlessTypedWait(t, world, 'target gone', {targetGone: true});
    t.ok(world.witnessReads.some((replicaId) =>
      replicaId !== world.targetReplicaId), 'a surviving member was asked');
    const leader = electAmongLive(world);
    t.ok(leader !== null && leader !== world.targetReplicaId,
      `a surviving member leads (${leader})`);
    // The removed source may lead until it applies its own removal (F2:
    // it keeps stepping until then); the leader's answer classifies.
    for (let round = 0; round < 12 && (await readPersisted(world))
      .workflowStep === WORKFLOW_STEP.STOPPING; round += 1) {
      await world.coordinator.reconcileOperationProgress(
        await readPersisted(world));
      await settleTurns();
      world.group.advance();
    }
    t.equal((await readPersisted(world)).workflowStep, WORKFLOW_STEP.REMOVED,
      'the leader\'s committed absence completes it');
    t.equal(world.terminalWrites.at(-1)?.committed.member !== undefined, true,
      'the write instant was judged by the fold');
    assertRemovedWritesAbsent(t, world, 'target gone');
  } finally {
    await disposeWorld(world);
  }
});

test('P1 (ordinary partition, no handoff): the same implication holds ' +
  'where leadership is not moved first', async (t) => {
  const world = await openReplaceWorld({partitionId: ORDINARY_PARTITION_ID,
    sourceHandler: true});
  try {
    world.currentEdge = 'ordinary';
    await driveToIntent(world);
    t.equal(world.stepDowns.length, 0, 'no handoff on an ordinary partition');
    t.equal((await readPersisted(world)).workflowStep, WORKFLOW_STEP.STOPPING,
      'the intent is durable');
    const outcome = await runToQuiescence(world, {rounds: 20});
    t.equal(outcome.workflowStep, WORKFLOW_STEP.REMOVED, 'it completes');
    assertRemovedWritesAbsent(t, world, 'ordinary');
  } finally {
    await disposeWorld(world);
  }
});

test('AN10: a dead source (failure detector) completes only after the ' +
  'committed removal, with no REMOVE_REPLICA sent', async (t) => {
  const world = await openReplaceWorld({sourceLeads: false});
  try {
    world.currentEdge = 'dead-source';
    setSourceRow(world, ReplicaStatus.FAILED);
    world.group.kill(world.sourceReplicaId);
    await driveToIntent(world);
    const persisted = await readPersisted(world);
    t.equal(persisted.workflowStep, WORKFLOW_STEP.STOPPING,
      'the intent is durable (T5\'\')');
    t.equal(persisted.stepsHistory.find((entry) =>
      entry?.replaceRemovalIntent === true)?.replaceSourceUnreachable, true,
    'the intent records the source unreachable');
    t.equal(world.removeEffects.length, 0, 'no REMOVE_REPLICA to a dead source');
    t.equal(world.terminalWrites.length, 0,
      'nothing completed before the committed removal');
    const outcome = await runToQuiescence(world);
    t.equal(outcome.workflowStep, WORKFLOW_STEP.REMOVED, 'it completes');
    t.ok(world.retirements.length >= 1, 'R-1f drove the removal');
    assertRemovedWritesAbsent(t, world, 'dead source');
  } finally {
    await disposeWorld(world);
  }
});

test('AN3: a target gone before the intent fails the REPLACE with the ' +
  'source retained', async (t) => {
  const world = await openReplaceWorld();
  try {
    world.currentEdge = 'target-removed-before-active';
    setTargetRow(world, ReplicaStatus.REMOVED);
    await world.coordinator.reconcileOperationProgress(world.operation);
    await settleTurns();
    const persisted = await readPersisted(world);
    t.equal(persisted.workflowStep, WORKFLOW_STEP.FAILED, 'FAILED');
    t.match(String(persisted.errorMessage), REPLACE_TARGET_REMOVED_BEFORE_ACTIVE,
      'the typed pre-intent reason');
    t.equal(world.removeEffects.length, 0, 'no removal effect');
    t.equal(world.group.sourceCommittedVoter(world.sourceReplicaId), true,
      'the source is still a committed voter');
  } finally {
    await disposeWorld(world);
  }
});

// B12 on the live chain: the target is created from the committed stamp but
// not yet admitted (its gate is closed). Its view of the source is what the
// stamp said (a voter), so R-1a answers STILL_VOTER at most; nothing
// completes and no handoff can succeed (the transfer names a non-voter).
test('B12 (live): an unadmitted target below its gate neither completes ' +
  'nor takes leadership; under F1 its view decides nothing (typed wait)',
async (t) => {
  const world = await openReplaceWorld({admitTarget: false});
  try {
    world.currentEdge = 'below-gate';
    const targetView = await readPartitionReplicaMembership(
      world.group.serviceOf(world.targetReplicaId), world.sourceReplicaId);
    t.equal(targetView.gateOpen, false,
      'setup: the target\'s own view carries its closed gate');
    const owner = world.coordinator.workflowOwner;
    const decision = await decideReplaceCompletion(owner, world.operation);
    t.not(decision.verdict, REPLACE_COMPLETION_VERDICT.SOURCE_RETIRED,
      'R-1a never retires from a below-gate witness');
    // F1: a never-admitted target receives no traffic and names no leader,
    // so its answer routes nowhere: the owner waits typed (LEADER_UNKNOWN),
    // never deciding from the target's own view. (An admitted target below
    // its gate names its leader, whose answer decides STILL_VOTER: the O1
    // anchors' B12 cells.)
    t.equal(decision.verdict, REPLACE_COMPLETION_VERDICT.UNAVAILABLE,
      'F1: no leader is named by the unadmitted target - typed wait');
    t.equal(decision.observation.reason, LEADERLESS_AUTHORITY_WAITS[0],
      'typed: the completion authority\'s leader is unknown');
    await driveToIntent(world, {rounds: 3});
    t.equal(world.removeEffects.length, 0, 'no removal effect left');
    t.equal(world.terminalWrites.length, 0, 'no terminal write');
    t.not(world.group.leader(), world.targetReplicaId,
      'the unadmitted target does not lead');
  } finally {
    await disposeWorld(world);
  }
});

// AN11 on the real group. The amendment's cell ("a fresh witness that has
// not caught up, commitIndex < C0, answers WAIT") is one face of a wider
// claim: a REMOVED write implies the source is absent from the committed
// configuration AT THE WRITE. The witness's own commit index bounds its
// staleness only against C0. Here the source's removal commits, then the
// group re-admits the source (the leader's row-driven admission of a row
// that reads ACTIVE again: BR16/A4, "a reappearing admissible row returns
// the REPLACE to its removal path") while the target's deliveries are capped
// at the removal, so the target reports the source absent at an index below
// the committed re-admission. The oracle decides what the code did.
async function capTargetAtSourceRemoval(world) {
  const group = world.group;
  const target = group.cluster.node(world.targetReplicaId);
  const removalIndex = group.committedConfiguration().commitIndex;
  group.settle(() => Number(target.readStatus().commitIndex) >= removalIndex &&
    !target.readStatus().confState.voters.map(String)
      .includes(group.peerIdOf(world.sourceReplicaId)), 400);
  group.cap.value = removalIndex;
  return removalIndex;
}

function assertLaggingAbsenceCompletesNothing(t, world, label, persisted) {
  const group = world.group;
  const targetView = group.cluster.node(world.targetReplicaId).readStatus();
  t.notOk(targetView.confState.voters.map(String)
    .includes(group.peerIdOf(world.sourceReplicaId)),
  `${label}: setup - the capped target still shows the source absent`);
  t.ok(Number(targetView.commitIndex) < group.committedConfiguration().commitIndex,
    `${label}: setup - its commit index is below the committed configuration`);
  t.equal(targetView.gateOpen, true, `${label}: setup - its gate is open`);
  const removedWhileVoter = world.terminalWrites.filter((write) =>
    write.step === WORKFLOW_STEP.REMOVED && write.sourceCommittedVoter);
  const intent = persisted.stepsHistory.find((entry) =>
    entry?.replaceRemovalIntent === true);
  t.equal(removedWhileVoter.length, 0,
    `${label}: no REMOVED while the committed configuration holds the ` +
      `source (step ${persisted.workflowStep}; C0 ${
        intent?.replaceWitnessCommitIndex}; witness commit ${
        targetView.commitIndex}; committed at ${
        group.committedConfiguration().commitIndex})`);
}

test('AN11 (live, adopted intent): an absence the witness reports below ' +
  'the committed configuration index is not a retirement', async (t) => {
  const world = await openReplaceWorld({sourceLeads: false,
    capDelivery: `${PRIORITY_PARTITION_ID}-r4`});
  try {
    world.currentEdge = 'an11-adopted';
    const group = world.group;
    group.commitChange(RAFT_MEMBERSHIP_OPERATION.REMOVE_PEER,
      world.sourceReplicaId);
    await capTargetAtSourceRemoval(world);
    group.commitChange(RAFT_MEMBERSHIP_OPERATION.ADD_PEER,
      world.sourceReplicaId);
    t.equal(group.sourceCommittedVoter(world.sourceReplicaId), true,
      'setup: the source is a committed voter again');
    // Another writer's STOPPING: the owner adopts its intent from a fresh
    // witness read (C0 = that read's commit index), then decides.
    world.operation.workflowStep = WORKFLOW_STEP.STOPPING;
    world.operation.status = ReplicaStatus.ACTIVE;
    world.operation.stepsHistory = [...world.operation.stepsHistory,
      {step: WORKFLOW_STEP.STOPPING, timestamp: Date.now()}];
    await world.coordinator.repository.persistOperationUpdate(world.operation);
    setSourceRow(world, null);
    await world.coordinator.reconcileOperationProgress(world.operation);
    await settleTurns();
    assertLaggingAbsenceCompletesNothing(t, world, 'adopted intent',
      await readPersisted(world));
  } finally {
    world.group.cap.value = Number.POSITIVE_INFINITY;
    await disposeWorld(world);
  }
});

// On an ordinary partition (no handoff) the target stays a follower, so a
// capped delivery leaves it lagging behind the leader's later commits.
test('AN11 (live, recorded intent): the same, with C0 recorded at the ' +
  'intent while the source was a voter', async (t) => {
  const world = await openReplaceWorld({sourceLeads: false,
    partitionId: ORDINARY_PARTITION_ID,
    capDelivery: `${ORDINARY_PARTITION_ID}-r4`});
  try {
    world.currentEdge = 'an11-recorded';
    const group = world.group;
    await driveToIntent(world);
    const intent = (await readPersisted(world)).stepsHistory.find((entry) =>
      entry?.replaceRemovalIntent === true);
    t.ok(Number.isFinite(intent?.replaceWitnessCommitIndex),
      'setup: C0 was recorded at the intent');
    // The owner's wakes are lost from here (recovered by the fallback).
    world.eventsSuppressed = true;
    // The removal commits (R-1f proposed it); the target applies it.
    group.advance(200);
    await capTargetAtSourceRemoval(world);
    // The source node comes back: its row reads ACTIVE, the leader admits it.
    world.group.dead.delete(world.sourceReplicaId);
    world.group.cluster.heal(world.sourceReplicaId);
    setSourceRow(world, ReplicaStatus.ACTIVE);
    group.commitChange(RAFT_MEMBERSHIP_OPERATION.ADD_PEER,
      world.sourceReplicaId);
    t.equal(group.sourceCommittedVoter(world.sourceReplicaId), true,
      'setup: the source is a committed voter again');
    t.equal((await readPersisted(world)).workflowStep, WORKFLOW_STEP.STOPPING,
      'setup: the REPLACE decided nothing while its wakes were lost');
    await fireFallbackTimers(world);
    await settleTurns();
    await world.coordinator.reconcileOperationProgress(
      await readPersisted(world));
    await settleTurns();
    assertLaggingAbsenceCompletesNothing(t, world, 'recorded intent',
      await readPersisted(world));
  } finally {
    world.group.cap.value = Number.POSITIVE_INFINITY;
    await disposeWorld(world);
  }
});

test('P1\' (D2): after the durable intent no elapsed time, sweep, stale ' +
  'copy, dispatch error or executor failure writes FAILED while the target ' +
  'lives', async (t) => {
  const world = await openReplaceWorld({sourceHandler: true});
  try {
    world.currentEdge = 'p1-prime';
    await driveToIntent(world);
    const owner = world.coordinator.workflowOwner;
    // No removal ever commits here: the target's proposals stay in the
    // transport (raft is not advanced), so every route below meets a
    // STOPPING REPLACE whose source is still a committed voter.
    await enterOwnerAfter(world, LONG_AFTER_MS);
    await owner.checkTimeouts();
    await settleTurns();
    t.equal((await readPersisted(world)).workflowStep, WORKFLOW_STEP.STOPPING,
      'the sweeps past every former budget fail nothing');
    const stale = {...world.operation, workflowStep: WORKFLOW_STEP.ACTIVE,
      status: ReplicaStatus.ACTIVE};
    await owner.failOperation(stale, 'Timeout in ACTIVE step');
    t.equal((await readPersisted(world)).workflowStep, WORKFLOW_STEP.STOPPING,
      'a stale pre-intent copy cannot fail it');
    await owner.reconcileExecutorCompletionOutcome(await readPersisted(world), {
      [EXECUTOR_OUTCOME_FIELD.OPERATION_ID]: world.operation.operationId,
      [EXECUTOR_OUTCOME_FIELD.OUTCOME_TYPE]:
        EXECUTOR_OUTCOME_TYPE.REPLICA_REMOVE_FAILED,
      [EXECUTOR_OUTCOME_FIELD.WORKFLOW_STEP]: WORKFLOW_STEP.STOPPING,
      [EXECUTOR_OUTCOME_FIELD.ERROR_MESSAGE]: 'remove failed at the source',
    }, null);
    await settleTurns();
    t.equal((await readPersisted(world)).workflowStep, WORKFLOW_STEP.STOPPING,
      'an executor failure outcome cannot fail it');
    // T5' re-send whose delivery fails.
    setSourceRow(world, ReplicaStatus.ACTIVE);
    world.removeEffectAnswer = null;
    const baseDeliver = world.coordinator.messageRouter.deliver;
    world.coordinator.messageRouter.deliver = async (target, payload, options) => {
      if (payload?.type === 'REMOVE_REPLICA') {
        throw new Error('dispatch failed');
      }
      return baseDeliver(target, payload, options);
    };
    world.clockOffsetMs += LONG_AFTER_MS;
    await world.coordinator.executeOperation(await readPersisted(world));
    await settleTurns();
    world.coordinator.messageRouter.deliver = baseDeliver;
    t.equal((await readPersisted(world)).workflowStep, WORKFLOW_STEP.STOPPING,
      'a failed re-send of the effect cannot fail it');
    t.equal(world.terminalWrites.length, 0, 'no terminal write at all');
    // The one admitted FAILED: the target dead (failure detector) while the
    // source is still a committed voter. The target led: until the survivors
    // elect, no leader answers and the owner waits typed (F1); the new
    // leader's answer then fails it with the source retained.
    world.eventsSuppressed = true;
    world.group.kill(world.targetReplicaId);
    // The appends the dying leader sent are lost with it.
    for (const replica of world.group.cluster.replicas.values()) {
      replica.inbox.length = 0;
    }
    setTargetRow(world, ReplicaStatus.FAILED);
    setSourceRow(world, null);
    await world.coordinator.reconcileOperationProgress(
      await readPersisted(world));
    await settleTurns();
    await assertLeaderlessTypedWait(t, world, 'P1 prime', {targetGone: true});
    t.ok(electAmongLive(world) !== null, 'a surviving member leads');
    // The survivors learn the leader over the next heartbeats; each entry
    // re-reads the authority.
    for (let round = 0; round < 12 && (await readPersisted(world))
      .workflowStep === WORKFLOW_STEP.STOPPING; round += 1) {
      await world.coordinator.reconcileOperationProgress(
        await readPersisted(world));
      await settleTurns();
      world.group.advance();
    }
    const persisted = await readPersisted(world);
    t.equal(persisted.workflowStep, WORKFLOW_STEP.FAILED,
      'target dead, source still a voter: FAILED');
    t.match(String(persisted.errorMessage), POST_INTENT_TARGET_DEATH,
      'the one admitted post-intent failure');
    t.equal(world.group.sourceCommittedVoter(world.sourceReplicaId), true,
      'the source is retained in the committed configuration');
    assertFailedWritesDeadTarget(t, world, 'P1 prime');
  } finally {
    await disposeWorld(world);
  }
});

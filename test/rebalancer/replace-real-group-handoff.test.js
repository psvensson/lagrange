/**
 * The named-target handoff on a REAL rs-raft group (amendment-1 step 2,
 * BR9/BR11; committed-read amendment-1 B13).
 *   - named-target only: while the source leads, the one handoff is a
 *     STEP_DOWN to the REPLACE's own target, served by the target's own port
 *     (a forwarded transfer); the removal waits for a fresh read of the
 *     target leading, and no removal is proposed before that;
 *   - B13 (RF=1): the sole voter's target below its admission index - the
 *     transfer cannot complete until the target applies its own AddNode;
 *     the attempt resolves, no dropped removal is counted as issued, and the
 *     REPLACE completes once the target is admitted, through add-voter,
 *     transfer, remove-voter.
 *   - leadership retained (BR11 as superseded 2026-11-11): a follower source
 *     under a third leader is removed with no handoff at all; the leader and
 *     its term are the same before the intent, at every RETIRE and at the
 *     terminal write;
 * AN4 (a late attemptSeq has no effect) and AN8 (no handoff after terminal)
 * are witnessed at the answer seam by replace-named-handoff-attempt.test.js
 * (routed attemptSeq echo; F-b) and are not repeated here.
 */

import {test} from '../../src/test-helpers/tap.js';
import {WORKFLOW_STEP} from '../../src/constants/index.js';
import {
  ReplicaOperationField,
  ReplicaOperationReason,
} from '../../src/rebalancer/replica-operation-constants.js';
import {EXECUTOR_OUTCOME_TYPE} from
  '../../src/rebalancer/executor-outcome-constants.js';
import {REPLICA_CONSENSUS_EXIT_REASON} from
  '../../src/node/replica-removal-consensus-exit.js';
import {durableLifecycleState} from
  '../node/replica-removal-consensus-exit-fixture.js';
import {
  REPLACE_HANDOFF_ANSWER_CLASS,
  readReplaceHandoffAttempt,
} from '../../src/rebalancer/operation-workflow-replace-handoff-attempt.js';
import {ReplicaStatus} from '../../src/rebalancer/replica-status.js';
import {
  ORDINARY_PARTITION_ID,
  disposeWorld,
  driveToIntent,
  openReplaceWorld,
  readPersisted,
  runToQuiescence,
  runToQuiescenceWithSweeps,
  settleTurns,
} from './replace-real-group-harness.js';
import {turnChainValue} from '../../src/raft/raft-rs-turn-answer.js';

const ATTEMPT_ROUNDS = 6;

test('named-target only: the one handoff names the target and is served ' +
  'by its port; removal waits for the target to lead', async (t) => {
  const world = await openReplaceWorld({sourceLeads: true});
  try {
    t.equal(world.group.leader(), world.sourceReplicaId, 'setup: source leads');
    await world.coordinator.executeOperation(await readPersisted(world));
    await settleTurns();
    t.equal(world.stepDowns.length, 1, 'one handoff was issued');
    const [request] = world.stepDowns;
    t.equal(request[ReplicaOperationField.REPLICA_ID], world.targetReplicaId,
      'it names the target');
    t.equal(request[ReplicaOperationField.REASON],
      ReplicaOperationReason.REPLACE_TARGET_LEADER_ELECTION,
      'it asks the target to take leadership');
    t.equal(world.stepDowns.filter((payload) =>
      payload[ReplicaOperationField.REASON] ===
        ReplicaOperationReason.REPLACE_SOURCE_LEADER_HANDOFF).length, 0,
    'no source-side leg');
    t.equal(world.removeEffects.length, 0, 'no removal while the source leads');
    t.equal(world.retirements.length, 0, 'no membership proposal either');
    const attempt = readReplaceHandoffAttempt(world.coordinator.workflowOwner,
      world.operation.operationId);
    t.equal(attempt?.answerClass, REPLACE_HANDOFF_ANSWER_CLASS.ACCEPTED,
      'the target\'s port accepted (forwarded) the transfer');
    world.group.settle(() => world.group.leader() === world.targetReplicaId);
    await settleTurns();
    t.equal(world.group.leader(), world.targetReplicaId,
      'the real transfer moved leadership to the target');
    t.equal((await readPersisted(world)).workflowStep, WORKFLOW_STEP.STOPPING,
      'a fresh read of the target leading admitted the removal');
    t.equal(world.removeEffects.length, 1, 'one removal effect');
  } finally {
    await disposeWorld(world);
  }
});

// Leadership retained: the source r1 is a follower, r2 leads, the target t
// follows r2. The real group's own ports answer every read: t's witness read
// names r2, r2's own answer is corroborated by a majority at its term, so
// the source is removed where leadership is. Red before the supersession:
// one STEP_DOWN to t left and t led at the removal.
test('leadership retained: a follower source under a third leader is ' +
  'removed with no handoff; leader and term are unchanged at its removal',
async (t) => {
  const world = await openReplaceWorld({sourceLeads: false,
    sourceHandler: true});
  try {
    const leader = world.group.leader();
    const termOf = (replicaId) => Number(
      world.group.cluster.node(replicaId).readStatus().term);
    const term = termOf(leader);
    t.not(leader, world.sourceReplicaId, 'setup: the source is a follower');
    t.not(leader, world.targetReplicaId, 'setup: the target is a follower');
    await driveToIntent(world);
    await settleTurns();
    t.equal((await readPersisted(world)).workflowStep, WORKFLOW_STEP.STOPPING,
      'the removal intent is durable');
    t.equal(world.stepDowns.length, 0, 'no leadership transfer was requested');
    t.equal(readReplaceHandoffAttempt(world.coordinator.workflowOwner,
      world.operation.operationId), null, 'no handoff attempt was opened');
    t.equal(world.group.leader(), leader, 'the leader is the same at the intent');
    const outcome = await runToQuiescenceWithSweeps(world, {rounds: 30});
    t.equal(outcome.workflowStep, WORKFLOW_STEP.REMOVED, 'the REPLACE completed');
    t.equal(world.stepDowns.length, 0,
      'no leadership transfer was requested in the whole operation');
    t.equal(world.terminalWrites.at(-1)?.sourceCommittedVoter, false,
      'at the terminal write the source is absent from the committed voters');
    t.same([...new Set(world.retirementRoutes.map((route) => route.leader))]
      .filter((routeLeader) => routeLeader !== leader), [],
    'the group\'s leader was the same replica at every RETIRE');
    t.equal(world.group.leader(), leader,
      'the same replica leads after the source left');
    t.equal(termOf(leader), term, 'at the same term: no election happened');
    t.equal(termOf(world.targetReplicaId), term,
      'the target follows at that term');
    t.equal(world.group.committedConfiguration().voters.includes(
      world.group.peerIdOf(world.targetReplicaId)), true,
    'the target is a committed voter');
    t.equal(world.group.committedConfiguration().voters.includes(
      world.group.peerIdOf(world.sourceReplicaId)), false,
    'the source is not');
  } finally {
    await disposeWorld(world);
  }
});

// B13 in two orders of the source's retirement. Production: the source
// node's REMOVE_REPLICA effect is answered by the production replica handler
// over the source's real port (finding F2: at ab7669fd0 it retired the port
// at the effect, before the REMOVING row, so in the two-voter group {s, t}
// the RemoveNode(s) proposed afterwards had no second ack). Control: the
// source's port keeps stepping until its removal commits and is never
// retired (the order the D1 anchor witness uses).
async function runRf1Replace(t, {sourceHandler, label}) {
  const world = await openReplaceWorld({replicaCount: 1, sourceLeads: true,
    capDelivery: 'sql_transactions-p1-r4', capBeforeAdmission: true,
    sourceStopsAtEffect: false, sourceHandler});
  const sourceDb = world.group.cluster.replica(world.sourceReplicaId).dbFile;
  const sourceLifecycleAtSetup = durableLifecycleState(sourceDb,
    world.partitionId);
  try {
    const target = world.group.cluster.node(world.targetReplicaId);
    t.equal(target.readStatus().gateOpen, false,
      'setup: the target is below its participation gate');
    t.equal(world.group.sourceCommittedVoter(world.sourceReplicaId), true,
      'setup: the sole voter is the source');
    const answers = [];
    for (let round = 0; round < ATTEMPT_ROUNDS; round += 1) {
      await world.coordinator.executeOperation(await readPersisted(world));
      await settleTurns();
      world.group.advance();
      world.clockOffsetMs += 2_000;
      const attempt = readReplaceHandoffAttempt(
        world.coordinator.workflowOwner, world.operation.operationId);
      answers.push(attempt?.answerClass ?? null);
    }
    t.equal((await readPersisted(world)).workflowStep, WORKFLOW_STEP.ACTIVE,
      `below the gate the REPLACE stays ACTIVE (attempt answers: ${
        answers.join(', ')}; handoffs ${world.stepDowns.length})`);
    t.not(world.group.leader(), world.targetReplicaId,
      'the unadmitted target never leads');
    t.equal(world.removeEffects.length, 0, 'no removal effect');
    t.equal(world.retirements.length, 0,
      'no dropped removal is counted as issued');
    t.ok(world.stepDowns.length >= 1, 'at least one attempt was made');
    // The target's deliveries flow: it applies its AddNode and its gate opens.
    world.group.cap.value = Number.POSITIVE_INFINITY;
    world.group.settle(() => target.readStatus().gateOpen === true, 400);
    t.equal(target.readStatus().gateOpen, true, 'the gate opened');
    await driveToIntent(world, {rounds: ATTEMPT_ROUNDS});
    t.equal((await readPersisted(world)).workflowStep, WORKFLOW_STEP.STOPPING,
      'the retry after admission moved leadership and the intent is durable');
    t.equal(world.group.leader(), world.targetReplicaId, 'the target leads');
    const outcome = await runToQuiescence(world, {rounds: 20});
    t.equal(outcome.workflowStep, WORKFLOW_STEP.REMOVED,
      `${label}: completed (retirements ${world.retirements.length}, ` +
        `committed voters ${world.group.committedConfiguration().voters
          .length})`);
    t.same(world.group.committedConfiguration().voters,
      [world.group.peerIdOf(world.targetReplicaId)],
      `${label}: the committed configuration is the target alone`);
    if (sourceHandler) {
      // The source's own removal completes: it left consensus on its applied
      // removal and retired its port (durably), then removed its row.
      const handled = world.sourceHandler;
      const completed = () => handled.outcomes.some(([type]) =>
        type === EXECUTOR_OUTCOME_TYPE.REPLICA_REMOVE_COMPLETED);
      for (let round = 0; round < ATTEMPT_ROUNDS && !completed(); round += 1) {
        world.group.advance();
        await settleTurns();
      }
      t.same(handled.exits.map((exit) => exit.reason),
        [REPLICA_CONSENSUS_EXIT_REASON.REMOVAL_APPLIED],
        `${label}: the source left consensus on its own applied removal`);
      t.not(durableLifecycleState(sourceDb, world.partitionId),
        sourceLifecycleAtSetup, `${label}: the source retired its port`);
      t.equal(completed(), true, `${label}: the source's removal completed`);
    }
    // Quorum: a write proposed through the target commits and applies.
    const marker = `after-replace-${label}`;
    const targetReplica = world.group.cluster.replica(world.targetReplicaId);
    const applied = () => targetReplica.appliedCommands.some((command) =>
      JSON.stringify(command).includes(marker));
    await turnChainValue(world.group.cluster.propose(world.targetReplicaId, marker));
    world.group.settle(applied, 200);
    t.equal(applied(), true,
      `${label}: the partition keeps quorum (a write through the target ` +
        'commits)');
  } finally {
    world.group.cap.value = Number.POSITIVE_INFINITY;
    await disposeWorld(world);
  }
}

test('B13 (RF=1, production order): the target below its admission index ' +
  'cannot take leadership; no removal is issued; completion once admitted',
async (t) => {
  await runRf1Replace(t, {sourceHandler: true, label: 'production order'});
});

test('B13 (RF=1, control order): with the source stepping until its ' +
  'removal commits, the same REPLACE completes', async (t) => {
  await runRf1Replace(t, {sourceHandler: false, label: 'control order'});
});

// V10 (verification round 1), superseded 2026-11-11 by the universal
// removal leadership rule (R09; the pinned "no handoff on an ordinary
// partition" and "every RETIRE went to the source itself" are the defect
// class: a leader removed with no transfer leaves its group leaderless).
// RF=1 on an ordinary partition with the SOURCE leading: the gate reads the
// group's leadership as on every partition, the one named handoff goes to
// the target, the target leads before the intent, takes the RemoveNode,
// and completes the REPLACE; no RETIRE is ever routed to the source.
test('RF=1 x ordinary partition x source leads: the leading source gets ' +
  'the one named handoff to its target, which leads before the intent, ' +
  'takes the RemoveNode and completes the REPLACE', async (t) => {
  const world = await openReplaceWorld({replicaCount: 1,
    partitionId: ORDINARY_PARTITION_ID, sourceLeads: true,
    sourceHandler: true});
  const sourceDb = world.group.cluster.replica(world.sourceReplicaId).dbFile;
  const lifecycleAtSetup = durableLifecycleState(sourceDb, world.partitionId);
  try {
    t.equal(world.group.leader(), world.sourceReplicaId, 'setup: source leads');
    await driveToIntent(world);
    await settleTurns();
    t.equal(world.stepDowns.length, 1,
      'one named handoff on an ordinary partition too');
    t.equal(world.stepDowns[0]?.[ReplicaOperationField.REPLICA_ID],
      world.targetReplicaId, 'it names the target');
    t.equal((await readPersisted(world)).workflowStep, WORKFLOW_STEP.STOPPING,
      'the removal intent is durable');
    t.equal(world.group.leader(), world.targetReplicaId,
      'the target leads at the intent');
    const outcome = await runToQuiescence(world, {rounds: 30});
    t.equal(outcome.workflowStep, WORKFLOW_STEP.REMOVED, 'completed');
    t.notOk(world.retirements.some((payload) =>
      payload[ReplicaOperationField.REPLICA_ID] === world.sourceReplicaId),
    'no RETIRE is ever routed to the source');
    t.same(world.group.committedConfiguration().voters,
      [world.group.peerIdOf(world.targetReplicaId)],
      'the committed configuration is the target alone');
    t.same(world.sourceHandler.exits.map((exit) => exit.reason),
      [REPLICA_CONSENSUS_EXIT_REASON.REMOVAL_APPLIED],
      'the source left consensus on its own applied removal');
    t.not(durableLifecycleState(sourceDb, world.partitionId), lifecycleAtSetup,
      'the source retired its port');
    t.equal(world.terminalWrites.at(-1)?.sourceCommittedVoter, false,
      'at the write the source is absent');
  } finally {
    await disposeWorld(world);
  }
});

// V2 (verification round 1), the REPLACE shape: the source's REMOVING write
// fails retryable at the first effect. The handler defers the REMOVE typed
// (no wait, no retirement, port live, the source still a committed voter);
// the owner's re-sent effect lands the row, the removal commits with the
// source's ack, and the REPLACE completes - in the two-voter group of an
// RF=1 REPLACE, where a port retired before its removal commits would cost
// the quorum.
test('V2 (RF=1 REPLACE): a REMOVING write that fails retryable defers the ' +
  'effect typed - nothing retired, port live - and the re-sent effect ' +
  'completes the REPLACE', async (t) => {
  const world = await openReplaceWorld({replicaCount: 1, sourceLeads: true,
    sourceHandler: true, removingWriteFails: true});
  const sourceDb = world.group.cluster.replica(world.sourceReplicaId).dbFile;
  const lifecycleAtSetup = durableLifecycleState(sourceDb, world.partitionId);
  try {
    await driveToIntent(world);
    await settleTurns();
    t.equal((await readPersisted(world)).workflowStep, WORKFLOW_STEP.STOPPING,
      'the removal intent is durable');
    t.equal(world.removeEffects.length, 1, 'the first effect left');
    world.group.advance(100);
    await settleTurns();
    t.equal(world.cache.get('services', world.sourceReplicaId)?.status,
      ReplicaStatus.ACTIVE, 'no REMOVING row could be made durable');
    t.equal(durableLifecycleState(sourceDb, world.partitionId),
      lifecycleAtSetup, 'nothing retired');
    t.equal(world.sourceHandler.exits.length, 0, 'no consensus exit awaited');
    t.equal(world.group.sourceCommittedVoter(world.sourceReplicaId), true,
      'the source is still a committed voter');
    t.equal(world.retirements.length, 0,
      'R-1f proposes nothing while the source row is admissible');
    // The write can land: the owner's re-sent effect (T5', after the
    // resend window) drives the row, the row-driven removal and the exit.
    // (Observation O2, the record: after the T5' re-send the owner's turn
    // ends without a fallback armed; the K1 sweep reaches it.)
    world.removingWriteFails = false;
    const outcome = await runToQuiescenceWithSweeps(world, {rounds: 30,
      advanceMs: 61_000});
    t.equal(outcome.workflowStep, WORKFLOW_STEP.REMOVED, 'completed');
    t.ok(world.removeEffects.length >= 2, 'the effect was re-sent');
    t.same(world.group.committedConfiguration().voters,
      [world.group.peerIdOf(world.targetReplicaId)],
      'the committed configuration is the target alone');
    t.same(world.sourceHandler.exits.map((exit) => exit.reason),
      [REPLICA_CONSENSUS_EXIT_REASON.REMOVAL_APPLIED],
      'the source left consensus on its own applied removal (never before)');
    t.not(durableLifecycleState(sourceDb, world.partitionId), lifecycleAtSetup,
      'then retired its port');
  } finally {
    await disposeWorld(world);
  }
});

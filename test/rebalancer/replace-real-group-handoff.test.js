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
import {
  disposeWorld,
  driveToIntent,
  openReplaceWorld,
  readPersisted,
  runToQuiescence,
  settleTurns,
} from './replace-real-group-harness.js';

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
    await world.group.cluster.propose(world.targetReplicaId, marker);
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

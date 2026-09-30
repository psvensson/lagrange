/**
 * Causal latency on a REAL rs-raft group (owner directive 2026-09-25 point
 * 4; amendment-1 section 3 "causal latency"): with the fallback clock
 * frozen, each of these takes 0 owner-clock ms and fires no fallback timer:
 *   - SAFE -> intent -> REMOVE_REPLICA (one owner turn);
 *   - the handoff answer -> the next decision (E11), and the real leader
 *     change on the target's port -> the decision that admits the removal;
 *   - applied on the witness (the target's port announces the committed
 *     RemoveNode) -> completion;
 *   - a leader/term change -> the R-1f re-drive (AN6, in the D2 file).
 * With the events suppressed, advancing the fallback recovers progress: K2
 * (the 1 s deferred-safety fallback), K1 (the timeout sweep) and the R-1f
 * W_max backstop each alone.
 * Publication -> evaluation (readiness) is the approved R-2 evidence
 * (evidence-remove-safety-wake.md W1-W4) and is not reopened here.
 */

import {test} from '../../src/test-helpers/tap.js';
import {WORKFLOW_STEP} from '../../src/constants/index.js';
import {
  ORDINARY_PARTITION_ID,
  disposeWorld,
  driveToIntent,
  fireFallbackTimers,
  firedTimerCount,
  openReplaceWorld,
  readPersisted,
  runToQuiescence,
  settleTurns,
} from './replace-real-group-harness.js';

const BACKSTOP_ADVANCE_MS = 61_000;

test('latency: handoff answer -> next decision, real leader change -> ' +
  'SAFE -> intent -> REMOVE_REPLICA, with the fallback frozen', async (t) => {
  const world = await openReplaceWorld();
  try {
    const clockBefore = world.clockOffsetMs;
    await world.coordinator.executeOperation(await readPersisted(world));
    await settleTurns();
    t.equal(world.stepDowns.length, 1, 'the named handoff left');
    t.ok(world.witnessReads.length >= 2,
      'E11: the answer was followed by a fresh decision in the same turn ' +
        `(${world.witnessReads.length} witness reads)`);
    t.equal(world.removeEffects.length, 0,
      'no removal before the target leads');
    // The transfer takes effect in the group; the target's port announces
    // the leader change and the relay wakes the owner.
    world.group.settle(() => world.group.leader() === world.targetReplicaId);
    await settleTurns();
    t.equal(world.group.leader(), world.targetReplicaId, 'the target leads');
    t.equal((await readPersisted(world)).workflowStep, WORKFLOW_STEP.STOPPING,
      'the leader-change wake admitted the removal: the intent is durable');
    t.equal(world.removeEffects.length, 1,
      'REMOVE_REPLICA left in the same owner turn as SAFE');
    t.equal(firedTimerCount(world), 0, 'no fallback timer fired');
    t.equal(world.clockOffsetMs, clockBefore, 'the owner clock did not move');
  } finally {
    await disposeWorld(world);
  }
});

test('latency: applied on the witness -> completion is 0 owner-clock ms ' +
  'with the fallback frozen', async (t) => {
  const world = await openReplaceWorld();
  try {
    await driveToIntent(world);
    const clockBefore = world.clockOffsetMs;
    const timersBefore = firedTimerCount(world);
    const relayBefore = world.relayCount;
    world.group.advance();
    await settleTurns();
    t.equal((await readPersisted(world)).workflowStep, WORKFLOW_STEP.REMOVED,
      'completed');
    t.ok(world.relayCount > relayBefore, 'the relay carried the announcement');
    t.equal(firedTimerCount(world), timersBefore, 'no fallback timer fired');
    t.equal(world.clockOffsetMs, clockBefore, 'the owner clock did not move');
  } finally {
    await disposeWorld(world);
  }
});

test('backstop K2: with the events suppressed, the 1 s fallback alone ' +
  'recovers the completion', async (t) => {
  const world = await openReplaceWorld();
  try {
    await driveToIntent(world);
    world.eventsSuppressed = true;
    world.group.advance();
    await settleTurns();
    t.equal((await readPersisted(world)).workflowStep, WORKFLOW_STEP.STOPPING,
      'control: no wake, no completion');
    world.clockOffsetMs += 1_100;
    const fired = await fireFallbackTimers(world);
    await settleTurns();
    t.ok(fired >= 1, 'the fallback fired');
    t.equal((await readPersisted(world)).workflowStep, WORKFLOW_STEP.REMOVED,
      'the fallback recovered the completion');
  } finally {
    await disposeWorld(world);
  }
});

test('backstop K1: with the events suppressed, the timeout sweep alone ' +
  'recovers the completion', async (t) => {
  const world = await openReplaceWorld();
  try {
    await driveToIntent(world);
    world.eventsSuppressed = true;
    world.group.advance();
    await settleTurns();
    world.clockOffsetMs += 1_100;
    await world.coordinator.checkTimeouts();
    await settleTurns();
    t.equal((await readPersisted(world)).workflowStep, WORKFLOW_STEP.REMOVED,
      'the timeout sweep recovered the completion');
    t.equal(firedTimerCount(world), 0, 'no fallback timer fired');
  } finally {
    await disposeWorld(world);
  }
});

test('backstop W_max: a RETIRE the leader accepted but cannot commit (its ' +
  'inbox held, the acks never arrive) is re-driven only once the window ' +
  'passed, with the events suppressed; the release then completes',
async (t) => {
  // A follower target on an ordinary partition: RETIRE is routed to the
  // leader (conf changes are leader-only); the production source handler
  // keeps the source stepping.
  const world = await openReplaceWorld({partitionId: ORDINARY_PARTITION_ID,
    sourceLeads: false, sourceHandler: true});
  try {
    const leader = world.group.leader();
    // The leader's inbox is held from here: it appends what R-1f proposes
    // and replicates it, but its followers' acks never reach it (a leader
    // whose node does not drain; check_quorum off keeps it leading).
    world.group.holdInbox(leader);
    await driveToIntent(world);
    await settleTurns();
    t.ok(world.retirements.length >= 1, 'R-1f proposed once');
    t.same([...new Set(world.retirements.map((payload) =>
      payload.replicaId))], [leader], 'the RETIRE reached the leader');
    world.eventsSuppressed = true;
    world.group.advance();
    t.equal(world.group.sourceCommittedVoter(world.sourceReplicaId), true,
      'setup: the removal is not committed');
    const issued = world.retirements.length;
    world.clockOffsetMs += 100;
    await fireFallbackTimers(world);
    await settleTurns();
    t.equal(world.retirements.length, issued,
      'inside the window nothing is re-issued (one uncertain attempt)');
    world.clockOffsetMs += BACKSTOP_ADVANCE_MS;
    await fireFallbackTimers(world);
    await settleTurns();
    t.equal(world.retirements.length, issued + 1,
      'past the window the backstop re-drives once');
    t.equal(world.retirements.at(-1).replicaId, leader,
      'the re-drive goes to the leader again (the level did not move)');
    world.group.releaseInbox(leader);
    const outcome = await runToQuiescence(world, {rounds: 10});
    t.equal(outcome.workflowStep, WORKFLOW_STEP.REMOVED, 'completed');
    t.equal(world.terminalWrites.at(-1)?.sourceCommittedVoter, false,
      'at the write the source is absent');
  } finally {
    await disposeWorld(world);
  }
});

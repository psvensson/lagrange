/**
 * V1 witness (fix-f7; copied from the REPLACE owner verification round 1
 * scratch cell, verify-replace/deposed-leader-authority.test.js, then
 * extended with the after-state the lead's ruling requires: WAIT while the
 * deposed leader's answer is not corroborated, STILL_VOTER once the new
 * leader answers and a majority corroborates it).
 *
 * Verifier scratch cell (round 1): completion authority = "the leader's own
 * answer" (F1). Attack: a DEPOSED leader that has not learned its loss
 * (check_quorum=false, raft-rs-group-constants.js:17) still answers
 * leaderId === self with its own (stale) applied configuration. If the group
 * re-admitted the source under a new leader meanwhile (BR16/A4, the AN11
 * mechanism), R-1a takes "absent in the deposed leader's configuration" for
 * "absent in the committed configuration" and writes REMOVED.
 *
 * Shape: the AN11 recorded-intent cell with the witness being the isolated
 * ex-leader t instead of a capped follower.
 */
import {test} from '../../src/test-helpers/tap.js';
import {WORKFLOW_STEP} from '../../src/constants/index.js';
import {ReplicaStatus} from '../../src/rebalancer/replica-status.js';
import {RAFT_MEMBERSHIP_OPERATION} from '../../src/raft/raft-operation-port-constants.js';
import {
  REPLACE_COMPLETION_VERDICT,
  decideReplaceCompletion,
  readReplaceOwnerDiagnostic,
} from '../../src/rebalancer/operation-workflow-replace-owner.js';
import {
  disposeWorld,
  driveToIntent,
  electAmongLive,
  fireFallbackTimers,
  openReplaceWorld,
  readPersisted,
  setSourceRow,
  settleTurns,
} from './replace-real-group-harness.js';

test('deposed leader: R-1a completes from an isolated ex-leader while the ' +
  'committed configuration (new leader) holds the re-admitted source', async (t) => {
  const world = await openReplaceWorld({sourceLeads: false});
  try {
    world.currentEdge = 'deposed-leader';
    const group = world.group;
    await driveToIntent(world);
    t.equal((await readPersisted(world)).workflowStep, WORKFLOW_STEP.STOPPING,
      'setup: intent durable (handoff moved leadership to t)');
    t.equal(group.leader(), world.targetReplicaId, 'setup: t leads');
    // Wakes lost from here: the commit of the removal is not observed.
    world.eventsSuppressed = true;
    group.advance(200);
    t.equal(group.sourceCommittedVoter(world.sourceReplicaId), false,
      'setup: RemoveNode(s) committed under t');
    t.equal((await readPersisted(world)).workflowStep, WORKFLOW_STEP.STOPPING,
      'setup: nothing decided while wakes were lost');
    const tView = group.cluster.node(world.targetReplicaId).readStatus();
    const kAtT = Number(tView.commitIndex);
    // t is cut off from the group (its node stays up and answers reads).
    group.cluster.isolate(world.targetReplicaId);
    const newLeader = electAmongLive(world);
    t.ok(newLeader !== null && newLeader !== world.targetReplicaId,
      `a surviving member leads (${newLeader})`);
    // The source node comes back: its row reads ACTIVE; the new leader's
    // row-driven admission re-admits it (BR16/A4; the AN11 mechanism).
    group.dead.delete(world.sourceReplicaId);
    group.cluster.heal(world.sourceReplicaId);
    setSourceRow(world, ReplicaStatus.ACTIVE);
    group.commitChange(RAFT_MEMBERSHIP_OPERATION.ADD_PEER, world.sourceReplicaId);
    t.equal(group.sourceCommittedVoter(world.sourceReplicaId), true,
      'setup: the source is a committed voter again (new leader)');
    const stale = group.cluster.node(world.targetReplicaId).readStatus();
    t.equal(stale.role, 'leader', 'setup: the isolated t still believes it leads');
    t.equal(Number(stale.commitIndex), kAtT, 'setup: t\'s commit index is stale');
    const owner = world.coordinator.workflowOwner;
    const decision = await decideReplaceCompletion(owner, await readPersisted(world));
    t.comment(`R-1a verdict ${decision.verdict}; answer from ${
      decision.observation.replicaId} leader ${decision.observation.leaderReplicaId} commit ${
      decision.observation.commitIndex} term ${decision.observation.term}; ` +
      `committed ${JSON.stringify(group.committedConfiguration())}`);
    t.not(decision.verdict, REPLACE_COMPLETION_VERDICT.SOURCE_RETIRED,
      'PROPERTY: no retirement from a deposed leader\'s stale configuration');
    await fireFallbackTimers(world);
    await settleTurns();
    await world.coordinator.reconcileOperationProgress(await readPersisted(world));
    await settleTurns();
    const persisted = await readPersisted(world);
    const removedWhileVoter = world.terminalWrites.filter((write) =>
      write.step === WORKFLOW_STEP.REMOVED && write.sourceCommittedVoter);
    t.equal(removedWhileVoter.length, 0,
      `P1: no REMOVED while the committed configuration holds the source (step ${
        persisted.workflowStep}; writes ${JSON.stringify(world.terminalWrites.map((w) =>
        ({step: w.step, voter: w.sourceCommittedVoter, at: w.committed.commitIndex, member: w.committed.member})))})`);
    t.equal(decision.verdict, REPLACE_COMPLETION_VERDICT.UNAVAILABLE,
      'the uncorroborated answer is a typed WAIT');
    t.equal(readReplaceOwnerDiagnostic(owner, world.operation.operationId)
      ?.authorityWaitReason, 'completion_authority_not_corroborated',
    'the owner\'s diagnostic names the typed reason');
    t.equal(decision.observation.reason,
      'completion_authority_not_corroborated',
      'typed reason: not corroborated by a majority at its term');
    // The partition heals: t learns the higher term and steps down; the new
    // leader answers and a majority of its configuration corroborates it.
    group.cluster.heal(world.targetReplicaId);
    group.settle(() => group.cluster.node(world.targetReplicaId)
      .readStatus().role !== 'leader', 40);
    group.advance(40);
    const after = await decideReplaceCompletion(owner, await readPersisted(world));
    t.equal(after.verdict, REPLACE_COMPLETION_VERDICT.STILL_VOTER,
      `the corroborated new leader holds the source (from ${
        after.observation.replicaId}, reason ${after.observation.reason})`);
  } finally {
    await disposeWorld(world);
  }
});

// Variant: no partition. t's node is connected; the new leader's higher-term
// heartbeat sits undelivered in t's inbox (a decision between two processing
// steps: the owner's read runs before t's runtime drains it).
test('deposed leader, stall shape: the higher-term heartbeat is queued but ' +
  'not yet processed when R-1a reads t', async (t) => {
  const world = await openReplaceWorld({sourceLeads: false});
  try {
    const group = world.group;
    await driveToIntent(world);
    world.eventsSuppressed = true;
    group.advance(200);
    t.equal(group.sourceCommittedVoter(world.sourceReplicaId), false,
      'setup: RemoveNode(s) committed under t');
    group.cluster.isolate(world.targetReplicaId);
    const newLeader = electAmongLive(world);
    t.ok(newLeader !== null && newLeader !== world.targetReplicaId,
      `a surviving member leads (${newLeader})`);
    group.dead.delete(world.sourceReplicaId);
    group.cluster.heal(world.sourceReplicaId);
    setSourceRow(world, ReplicaStatus.ACTIVE);
    group.commitChange(RAFT_MEMBERSHIP_OPERATION.ADD_PEER, world.sourceReplicaId);
    t.equal(group.sourceCommittedVoter(world.sourceReplicaId), true,
      'setup: the source is a committed voter again (new leader)');
    // Connectivity restored; the new leader's heartbeat is queued into t's
    // inbox and NOT drained before the owner's read.
    group.cluster.heal(world.targetReplicaId);
    for (let i = 0; i < 8; i += 1) {
      group.cluster.tick(newLeader);
    }
    const inbox = group.cluster.replica(world.targetReplicaId).inbox.length;
    t.ok(inbox > 0, `setup: ${inbox} undelivered envelope(s) queued for t`);
    t.equal(group.cluster.node(world.targetReplicaId).readStatus().role,
      'leader', 'setup: t still believes it leads');
    const owner = world.coordinator.workflowOwner;
    const decision = await decideReplaceCompletion(owner, await readPersisted(world));
    t.not(decision.verdict, REPLACE_COMPLETION_VERDICT.SOURCE_RETIRED,
      'PROPERTY: no retirement from a leader that has not processed its ' +
        `deposition (verdict ${decision.verdict}, from ${decision.observation.replicaId})`);
    t.equal(decision.observation.reason,
      'completion_authority_not_corroborated',
      'typed reason: not corroborated by a majority at its term');
    group.advance(40);
    const after = await decideReplaceCompletion(owner, await readPersisted(world));
    t.equal(after.verdict, REPLACE_COMPLETION_VERDICT.STILL_VOTER,
      'once t drained its deposition the corroborated new leader holds the ' +
        `source (from ${after.observation.replicaId}, reason ${after.observation.reason})`);
  } finally {
    await disposeWorld(world);
  }
});

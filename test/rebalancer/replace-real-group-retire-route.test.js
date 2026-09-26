/**
 * F-1 (verification O1 round 2), the REPLACE shape: R-1f proposed the
 * source's REMOVE_PEER through the REPLACE target t even while t was a
 * follower - a proposal the crate forwards to the leader, where it is
 * dropped silently behind any pending configuration index (and AN6 wakes
 * R-1f exactly when a new leader sets one).
 *
 * Now conf changes are taken only at the leader's port: t, a follower,
 * refuses the REMOVE_PEER typed (NOT_LEADER, naming the leader), and R-1f
 * addresses its proposal to the leader the completion authority named. An
 * ordinary partition, where no handoff moves leadership to t, keeps t a
 * follower through the whole REPLACE. Oracles: the committed configuration
 * folded from a member's durable log; the leader each RETIRE reached.
 */

import {test} from '../../src/test-helpers/tap.js';
import {WORKFLOW_STEP} from '../../src/constants/index.js';
import {ReplicaOperationField} from
  '../../src/rebalancer/replica-operation-constants.js';
import {RAFT_MEMBERSHIP_ADMISSION_OUTCOME} from
  '../../src/raft/raft-operation-port-constants.js';
import {retirePartitionRaftPeer} from
  '../../src/partition/partition-service-raft-membership-administration.js';
import {
  ORDINARY_PARTITION_ID,
  disposeWorld,
  driveToIntent,
  openReplaceWorld,
  readPersisted,
  runToQuiescence,
} from './replace-real-group-harness.js';

test('F-1: R-1f retires the source through the leader while the target is ' +
  'a follower; the follower target refuses a retirement typed', async (t) => {
  const world = await openReplaceWorld({partitionId: ORDINARY_PARTITION_ID,
    sourceLeads: false});
  try {
    const leader = world.group.leader();
    t.not(leader, world.targetReplicaId, 'setup: the target does not lead');
    t.not(leader, world.sourceReplicaId, 'setup: the source does not lead');

    const direct = await retirePartitionRaftPeer(
      world.group.serviceOf(world.targetReplicaId), world.sourceReplicaId);
    t.same({outcome: direct.outcome, leaderReplicaId: direct.leaderReplicaId},
      {outcome: RAFT_MEMBERSHIP_ADMISSION_OUTCOME.NOT_LEADER,
        leaderReplicaId: leader},
      'a follower target refuses the REMOVE_PEER typed, naming the leader');
    t.equal(world.group.sourceCommittedVoter(world.sourceReplicaId), true,
      'and nothing was proposed for it');

    await driveToIntent(world);
    t.equal((await readPersisted(world)).workflowStep, WORKFLOW_STEP.STOPPING,
      'the removal intent is durable');
    const outcome = await runToQuiescence(world, {rounds: 20});
    t.equal(outcome.workflowStep, WORKFLOW_STEP.REMOVED,
      'the REPLACE completes');
    t.equal(world.group.sourceCommittedVoter(world.sourceReplicaId), false,
      'the source is no longer a committed voter');
    const addressees = world.retirements.map((payload) =>
      payload[ReplicaOperationField.REPLICA_ID]);
    t.ok(addressees.length >= 1, 'R-1f proposed the retirement');
    t.same([...new Set(addressees)], [leader],
      `every RETIRE went to the leader (${addressees.join(', ')}), never to ` +
        'the follower target');
    t.equal(world.group.leader(), leader, 'the leader never moved');
  } finally {
    await disposeWorld(world);
  }
});

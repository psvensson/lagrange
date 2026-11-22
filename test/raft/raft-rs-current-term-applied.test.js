// The status field `currentTermApplied` means exactly: this replica leads and
// has applied an entry of its own term (the term of the last entry it applied
// is its current term), monotone within that term.
//
// Red before its repair (1d4125c7b): raft-rs-status-observation.js computed
// it as applied > pendingConfIndex. raft-rs raises pendingConfIndex to a
// configuration entry's index when the leader proposes it, so after the
// leader applied that entry (applied == pendingConfIndex) the field read
// false on an otherwise quiet group although the leader had applied an entry
// of its own term - until some later entry applied. The repair compares the
// term of the last applied entry with the current term. The placement owner's
// term-start barrier and the owner-fact read (other lanes) depend on the
// exact fact.
//
// Cases, each read through the port's own status:
//   1. a fresh leader before its term's first entry applies: false; after it
//      applies: true;
//   2. the leader applies a configuration change and the group stays quiet:
//      true (red today);
//   3. every replica restarts from its own SQLite file and the same replica
//      leads again: false on the first status after it leads, true once its
//      new term's entry applies.
//
// Real: the raft-rs partition operation port (PartitionNodeCluster), its
// runtime owner and durable store; the leader's applied term comes from the
// runtime's own apply path and, after the restart, from its durable record.
// Substituted: the transport (the cluster's in-process inboxes, delivered by
// the test round by round) and the clock (a VirtualTimeSource that is never
// advanced: the cluster's delivery ticks drain every inbound queue).
import assert from 'node:assert/strict';
import {test} from 'node:test';

import {RAFT_ROLE} from '../../src/raft/constants.js';
import {RAFT_RS_CONF_CHANGE_TYPE} from '../../src/raft/raft-rs-ready-loop-constants.js';
import {setActualCoreEntryObserver} from '../../src/raft/raft-rs-runtime-owner.js';
import {turnChainValue} from '../../src/raft/raft-rs-turn-answer.js';
import {VirtualTimeSource} from '../../src/time/time-source.js';
import {PartitionNodeCluster} from './raft-rs-backend/partition-node-cluster.js';

const PARTITION_ID = 'cta-p1';
const FOUNDING = Object.freeze(['cta-p1-r1', 'cta-p1-r2', 'cta-p1-r3']);
const LEADER = FOUNDING[0];
const LEARNER = 'cta-p1-r4';
// raft-rs ConfChangeTransition::Auto: a single change applies directly.
const AUTO_TRANSITION = 0;
const ROUND_LIMIT = 50;
const QUIET_ROUNDS = 5;

function statusOf(cluster, replicaId) {
  const status = cluster.node(replicaId).readStatus();
  return {role: status.role, term: status.term, appliedIndex: status.appliedIndex,
    commitIndex: status.commitIndex, currentTermApplied: status.currentTermApplied,
    confChangePending: status.confChangePending};
}

// Deliver everything held, round by round, until the predicate holds; the
// leader's status is recorded after every round.
function roundsUntil(cluster, predicate, trail) {
  for (let round = 0; round < ROUND_LIMIT; round += 1) {
    if (predicate()) return true;
    cluster.deliverAll();
    trail.push(statusOf(cluster, LEADER));
  }
  return predicate();
}

async function electLeader(cluster, trail) {
  await turnChainValue(cluster.node(LEADER).campaign());
  const elected = roundsUntil(cluster,
    () => statusOf(cluster, LEADER).role === RAFT_ROLE.LEADER, trail);
  assert.ok(elected, `the replica leads: ${JSON.stringify(trail)}`);
  return statusOf(cluster, LEADER);
}

function newCluster(clock) {
  const cluster = new PartitionNodeCluster({
    partitionId: PARTITION_ID,
    replicaIds: [...FOUNDING],
    substrateFor: () => ({timeSource: clock}),
  });
  setActualCoreEntryObserver(null);
  return cluster;
}

test('currentTermApplied is "the leader applied an entry of its own term", ' +
  'through election, a configuration change and a restart', async () => {
  const clock = new VirtualTimeSource({startMs: 0});
  const cluster = newCluster(clock);
  const trail = [];
  try {
    // 1. A fresh leader: false until its term's first entry applies.
    const atElection = await electLeader(cluster, trail);
    roundsUntil(cluster, () => {
      const status = statusOf(cluster, LEADER);
      return status.appliedIndex >= status.commitIndex && status.commitIndex > 0 &&
        status.currentTermApplied === true;
    }, trail);
    const afterTermEntry = statusOf(cluster, LEADER);

    // 2. A configuration change on an otherwise quiet group.
    cluster.addReplica(LEARNER, FOUNDING);
    cluster.proposeConfigurationChange([{
      changeType: RAFT_RS_CONF_CHANGE_TYPE.ADD_LEARNER_NODE,
      nodeId: cluster.raftPeerIdOf(LEARNER),
    }], AUTO_TRANSITION, LEADER);
    const learnerAdded = roundsUntil(cluster, () => cluster.coreConfState(LEADER)
      .learners.includes(cluster.raftPeerIdOf(LEARNER)), trail);
    for (let round = 0; round < QUIET_ROUNDS; round += 1) cluster.deliverAll();
    const afterConfChange = statusOf(cluster, LEADER);

    // 3. Every replica restarts; the same replica leads again.
    for (const replicaId of [...FOUNDING, LEARNER]) cluster.restart(replicaId);
    const reElected = await electLeader(cluster, trail);
    roundsUntil(cluster, () => {
      const status = statusOf(cluster, LEADER);
      return status.term === reElected.term && status.currentTermApplied === true;
    }, trail);
    const afterRestartTermEntry = statusOf(cluster, LEADER);

    const measured = {atElection, afterTermEntry, learnerAdded, afterConfChange,
      reElected, afterRestartTermEntry};
    const report = `measured ${JSON.stringify(measured)}`;
    assert.equal(learnerAdded, true, `the configuration change applied: ${report}`);
    assert.ok(reElected.term > afterConfChange.term,
      `the restarted replica leads a newer term: ${report}`);
    assert.deepEqual({
      freshLeaderBeforeItsEntry: atElection.currentTermApplied,
      freshLeaderAfterItsEntry: afterTermEntry.currentTermApplied,
      afterItsConfChangeApplied: afterConfChange.currentTermApplied,
      reElectedBeforeItsEntry: reElected.currentTermApplied,
      reElectedAfterItsEntry: afterRestartTermEntry.currentTermApplied,
    }, {
      freshLeaderBeforeItsEntry: false,
      freshLeaderAfterItsEntry: true,
      afterItsConfChangeApplied: true,
      reElectedBeforeItsEntry: false,
      reElectedAfterItsEntry: true,
    }, `currentTermApplied follows "applied an entry of its own term": ${report}`);
  } finally {
    cluster.dispose();
  }
});

// Retirement is SCHEDULING ELIGIBILITY, not a campaign guard
// (binding direction addendum §5), measured on the real partition path.
//
// The reproduced case: a replica is removed from the configuration while it
// cannot hear the cluster, so its own durable configuration still lists it as
// a voter. §11's three rules are all questions about that configuration, so
// they ADMIT it - and the first test here drives that peer and measures what
// it does to a live cluster. That measurement is the red the guard exists
// for, and it runs every time, so the green below can never pass vacuously.
//
// The green is not "campaign() refused". It is that the host never gives the
// core a tick at all: after a restart through the real seam, the backend has
// read the durable retirement record before a tick driver exists, the
// substrate is never asked to schedule anything, and the live cluster's term
// and leader are exactly what they were.
//
// METHOD DISCLOSURE: the durable retirement record, the tick driver and its
// refusal were written as part of this phase's createPartitionNode, before
// this file existed, so test-first is NOT claimed for that production code.
// What is test-first here is nothing; what is measured here is the control -
// the same case driven without the record - and it is a real falsifier: it
// fails the invariant every time it runs.

import assert from 'node:assert/strict';
import {test} from 'node:test';

import Database from 'better-sqlite3';

import {PartitionNodeCluster} from './partition-node-cluster.js';
import {
  RAFT_RS_ELECTION_REFUSAL,
} from '../../../src/raft/raft-rs-election-safety-constants.js';
import {
  RAFT_RS_SCHEDULING_ELIGIBILITY,
} from '../../../src/raft/raft-rs-durable-store-constants.js';
import {
  RAFT_RS_TICK_SCHEDULING,
} from '../../../src/raft/raft-rs-partition-node-constants.js';
import {
  raftRsElectionAdmissibility,
} from '../../../src/raft/raft-rs-election-safety.js';

const FOUNDING = Object.freeze(['replica-a', 'replica-b', 'replica-c']);
const CUT_OFF = 'replica-c';
const SETTLE_ROUNDS = 400;
const DISTURBANCE_TICKS = 60;
const RETIRED_AT = '2026-09-20T00:00:00.000Z';

// A clock that records what the host asked it to schedule and schedules
// nothing. It is the measurement instrument for "the replica is not given to
// the clock": a host that scheduled a tick would appear here.
function recordingClock() {
  const scheduled = [];
  return {
    scheduled,
    now: () => 0,
    setTimeout: () => null,
    clearTimeout: () => undefined,
    setInterval: (fn, intervalMs) => {
      scheduled.push(intervalMs);
      return scheduled.length;
    },
    clearInterval: () => undefined,
  };
}

/**
 * What one replica's own database says about who belongs and whether it may
 * run, read on a connection of this test's own.
 * @param {PartitionNodeCluster} cluster - The partition.
 * @param {string} replicaId - The replica.
 * @return {Object} {voters, retirementRows}.
 */
function durableFactsOf(cluster, replicaId) {
  const independent = new Database(cluster.dbFileOf(replicaId),
    {readonly: true});
  const applied = independent.prepare(
    'SELECT voters FROM _raft_rs_applied_state WHERE group_id = ?')
    .get(cluster.partitionId);
  const retirement = independent.prepare(
    'SELECT peer_id, retired_at FROM _raft_rs_retirement WHERE group_id = ?')
    .all(cluster.partitionId);
  independent.close();
  return {voters: JSON.parse(applied.voters), retirementRows: retirement};
}

/**
 * Form a partition, elect, cut one replica off and remove it from the
 * configuration while it cannot hear. The cut-off replica ends holding a
 * configuration that still lists it.
 * @param {string} partitionId - The group.
 * @param {Object} [options] - {substrateFor}.
 * @return {Object} {cluster, leader, cutOffPeerId}.
 */
function partitionWithAPeerRemovedBehindItsBack(partitionId, options = {}) {
  const cluster = new PartitionNodeCluster({
    partitionId, replicaIds: FOUNDING, ...options});
  assert.ok(cluster.settle(() => cluster.leaderReplicaId() !== null,
    {rounds: SETTLE_ROUNDS}), 'the partition must elect a leader');
  const leader = cluster.leaderReplicaId();
  assert.notEqual(leader, CUT_OFF,
    'the replica this case removes must not be the one leading it');
  cluster.isolate(CUT_OFF);
  const cutOffPeerId = cluster.raftPeerIdOf(CUT_OFF);
  // ConfChangeType::RemoveNode, from the binding's own match arm.
  cluster.proposeConfigurationChange(
    [{changeType: 1, nodeId: cutOffPeerId}], 0, leader);
  assert.ok(cluster.settle(() =>
    !cluster.coreConfState(leader).voters.includes(cutOffPeerId),
  {rounds: SETTLE_ROUNDS}),
  'the removal must commit on the peers that can hear each other');
  return {cluster, leader, cutOffPeerId};
}

test('the configuration rules alone admit a peer removed behind its back, ' +
  'and ticking it disturbs the live cluster', async () => {
  const {cluster, leader, cutOffPeerId} =
    partitionWithAPeerRemovedBehindItsBack('retirement-control');
  try {
    // Its own durable record still lists it, so every §11 rule is a question
    // about a configuration that says it belongs.
    const {voters} = durableFactsOf(cluster, CUT_OFF);
    assert.ok(voters.includes(cutOffPeerId),
      'the cut-off replica still holds a configuration listing itself');
    const {core, handle} = cluster.node(CUT_OFF).raftRsGroupParts();
    const admissibility = raftRsElectionAdmissibility({core, handle});
    assert.equal(admissibility.admitted, true,
      'the configuration rules alone admit it; the detail said ' +
      `${admissibility.detail}`);

    // Now heal it and tick it - which is what a host that treated retirement
    // as a campaign guard would still do - and measure the live cluster.
    const termBefore = cluster.coreStatus(leader).term;
    const leaderBefore = cluster.leaderReplicaId();
    cluster.heal(CUT_OFF);
    cluster.tickers = [CUT_OFF];
    cluster.settle(() => false, {rounds: DISTURBANCE_TICKS});
    const termAfter = cluster.coreStatus(leader).term;
    assert.ok(BigInt(termAfter) > BigInt(termBefore),
      'ticking the removed peer must raise the live cluster\'s term; it ' +
      `went ${termBefore} -> ${termAfter}`);
    assert.notEqual(cluster.leaderReplicaId(), leaderBefore,
      'and the cluster must lose the leader it had');
  } finally {
    cluster.dispose();
  }
});

test('durable retirement removes the replica from runtime scheduling, and a ' +
  'restart preserves it before ticking starts', async () => {
  const clocks = new Map(FOUNDING.map((replicaId) =>
    [replicaId, recordingClock()]));
  const {cluster, leader, cutOffPeerId} =
    partitionWithAPeerRemovedBehindItsBack('retirement-guarded',
      {substrateFor: (replicaId) => ({timeSource: clocks.get(replicaId)})});
  try {
    // Lagrange decides the replica is gone and records it durably.
    const retired = cluster.provider.retireFromScheduling(
      cluster.node(CUT_OFF), RETIRED_AT);
    assert.equal(retired.scheduling, RAFT_RS_TICK_SCHEDULING.REFUSED_RETIRED);
    assert.equal(retired.retiredAt, RETIRED_AT);
    const {retirementRows} = durableFactsOf(cluster, CUT_OFF);
    assert.deepEqual(retirementRows,
      [{peer_id: cutOffPeerId, retired_at: RETIRED_AT}],
      'the retirement is a row in the replica\'s own durable record');

    // Restart it through the real seam. Nothing in the process remembers the
    // decision; only the file does.
    clocks.get(CUT_OFF).scheduled.length = 0;
    cluster.restart(CUT_OFF);
    const restarted = cluster.node(CUT_OFF);
    const scheduling = cluster.provider.partitionScheduling(restarted);
    assert.equal(scheduling.retired, true,
      'the rebuilt replica read its retirement from its own durable record');
    assert.equal(scheduling.scheduling,
      RAFT_RS_TICK_SCHEDULING.REFUSED_RETIRED);
    assert.equal(scheduling.peerId, cutOffPeerId,
      'and it is the same logical replica, by the identity the registry ' +
      'holds');

    // Asking for the election timer is refused, and the clock is never asked
    // to schedule anything at all.
    assert.equal(cluster.provider.startElectionTimer(restarted),
      RAFT_RS_TICK_SCHEDULING.REFUSED_RETIRED);
    assert.deepEqual(clocks.get(CUT_OFF).scheduled, [],
      'the host never gave the retired replica to the clock');
    assert.equal(cluster.provider.partitionScheduling(restarted).ticksDriven,
      0, 'so no tick was ever driven into its core');
    // A peer that IS eligible is given to the clock, so the measurement above
    // is not simply an instrument that records nothing.
    cluster.provider.startElectionTimer(cluster.node(leader));
    assert.ok(clocks.get(leader).scheduled.length > 0,
      'an eligible replica IS scheduled, so the empty record means something');
    cluster.provider.clearTimers(cluster.node(leader));

    // The campaign guard still answers, and it answers by name - but it is
    // not what kept the cluster safe here.
    const campaigned = cluster.provider.requestElectionNow(restarted);
    assert.equal(campaigned.campaigned, false);
    assert.equal(campaigned.refusal,
      RAFT_RS_ELECTION_REFUSAL.RETIRED_BY_HOST);

    // Heal it and run the same number of rounds the control disturbed the
    // cluster in. The scheduler never drives it, so nothing happens.
    const termBefore = cluster.coreStatus(leader).term;
    const leaderBefore = cluster.leaderReplicaId();
    cluster.heal(CUT_OFF);
    cluster.tickers = [];
    cluster.settle(() => false, {rounds: DISTURBANCE_TICKS});
    assert.equal(cluster.coreStatus(leader).term, termBefore,
      'the live cluster\'s term is untouched');
    assert.equal(cluster.leaderReplicaId(), leaderBefore,
      'and it still has the leader it had');
    assert.equal(cluster.provider.partitionScheduling(restarted).ticksDriven,
      0, 'the retired replica was never driven');
  } finally {
    cluster.dispose();
  }
});

test('retirement is a named durable state, and an eligible replica reads ' +
  'as eligible', async () => {
  const cluster = new PartitionNodeCluster({
    partitionId: 'retirement-states', replicaIds: FOUNDING});
  try {
    const control = cluster.provider.partitionScheduling(
      cluster.node(FOUNDING[0]));
    assert.equal(control.retired, false);
    assert.equal(control.scheduling,
      RAFT_RS_TICK_SCHEDULING.DEFERRED_BY_THE_GROUP,
      'a group that deferred its election says so by name rather than by ' +
      'an absent timer');
    // Nothing retired it, so its own durable record carries no retirement.
    assert.deepEqual(durableFactsOf(cluster, FOUNDING[0]).retirementRows, [],
      'an eligible replica has no retirement row');
    // And it IS schedulable, which is what makes the refusal above a
    // decision rather than the only thing this backend can do.
    assert.equal(
      cluster.provider.startElectionTimer(cluster.node(FOUNDING[0])),
      RAFT_RS_TICK_SCHEDULING.RUNNING);
    assert.equal(cluster.provider.clearTimers(cluster.node(FOUNDING[0])),
      RAFT_RS_TICK_SCHEDULING.STOPPED);
    // The two eligibility states are distinct names, not a boolean read off
    // an absent row at a use site.
    assert.notEqual(RAFT_RS_SCHEDULING_ELIGIBILITY.ELIGIBLE,
      RAFT_RS_SCHEDULING_ELIGIBILITY.RETIRED);
  } finally {
    cluster.dispose();
  }
});

// The runtime prerequisites a multi-replica partition needs from the rs-raft
// operation port (epic findings F11, F15, F17, F18), each measured on real
// ports built through the provider seam. Every expectation is read from the
// core (readStatus) or from a replica's durable record on a connection of the
// test's own, never from the code path under test.
//
//   F11  a delivered envelope is processed by the runtime without anything
//        else calling the port: no tick, no status read, no operation;
//   F15  a delivery to one peer that rejects, or finds no handler, is that
//        peer's transport outcome: the group keeps its leader, its health and
//        its runtime generation, and the peer catches up once it is back;
//   F17  a follower's status read never fails on a configured peer whose
//        identity its registry never reserved: the peer is reported with a
//        typed unreserved address status;
//   F18  the progress probe is honest: behind -> one heartbeat round through
//        the core (progress-probe-sent), caught up -> progress-observed, not
//        in the configuration -> a typed not-a-peer refusal.

import assert from 'node:assert/strict';
import {test} from 'node:test';

import Database from 'better-sqlite3';

import {RaftRsDurableStore} from '../../../src/raft/raft-rs-durable-store.js';
import {RAFT_RS_GROUP_TUNING} from
  '../../../src/raft/raft-rs-group-constants.js';
import {RaftRsPeerIdentityRegistry} from
  '../../../src/raft/raft-rs-peer-identity.js';
import {
  RAFT_MEMBERSHIP_OPERATION,
  RAFT_OPERATION_OUTCOME,
  RAFT_PEER_PROGRESS_PROBE_REASON,
} from '../../../src/raft/raft-operation-port-constants.js';
import {
  PEER_ADDRESS_STATUS,
  PEER_DELIVERY_OUTCOME,
} from '../../../src/raft/raft-rs-runtime-owner-constants.js';
import {PartitionNodeCluster} from './partition-node-cluster.js';

const {CORE_OK, CORE_REFUSED, HOST_FAILURE} = RAFT_OPERATION_OUTCOME;
const LEADER_ROLE = 'leader';
const USABLE = 'usable';
const HEALTHY = 'healthy';
const TICK_OPERATION = 'tick';
const {UNRESERVED} = PEER_ADDRESS_STATUS;
const {FAILED: FAILED_DELIVERY, NONE_OBSERVED: NO_DELIVERY_OBSERVED} =
  PEER_DELIVERY_OUTCOME;
const {PROGRESS_PROBE_SENT, PROGRESS_OBSERVED, NOT_A_PEER} =
  RAFT_PEER_PROGRESS_PROBE_REASON;
const DELIVERY_BOUND_MS = 2000;
const POLL_MS = 10;
const WRITES_WHILE_UNREACHABLE = 3;
const SETTLE_ROUNDS = 400;
const QUIET_ROUNDS = 64;

function durableProgressOf(dbFile, groupId) {
  const independent = new Database(dbFile, {readonly: true});
  try {
    const hard = independent.prepare(
      'SELECT term, commit_index FROM _raft_rs_hard_state ' +
      'WHERE group_id = ?').safeIntegers(true).get(groupId);
    const last = independent.prepare(
      'SELECT MAX(log_index) AS last FROM _raft_rs_log WHERE group_id = ?')
      .safeIntegers(true).get(groupId);
    const applied = independent.prepare(
      'SELECT learners FROM _raft_rs_applied_state ' +
      'WHERE group_id = ?').get(groupId);
    return {
      term: hard === undefined ? null : BigInt(hard.term),
      commit: hard === undefined ? 0n : BigInt(hard.commit_index),
      applied: BigInt(RaftRsDurableStore.readAppliedIndexIn(independent,
        groupId) ?? '0'),
      learners: applied === undefined ? [] : JSON.parse(applied.learners),
      lastIndex: last?.last === null || last === undefined ? 0n :
        BigInt(last.last),
    };
  } finally {
    independent.close();
  }
}

function elect(cluster) {
  assert.equal(cluster.settle(() => cluster.leaderReplicaId() !== null,
    {rounds: SETTLE_ROUNDS}), true, 'the real group elects a leader');
  return cluster.leaderReplicaId();
}

function tickEntries(cluster) {
  return cluster.coreEntries.filter((entry) =>
    entry.operation === TICK_OPERATION).length;
}

async function waitUntil(predicate, boundMs) {
  const deadline = Date.now() + boundMs;
  while (Date.now() < deadline) {
    if (predicate()) {
      return true;
    }
    await pause(POLL_MS);
  }
  return predicate();
}

function pause(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

// The transport, driven by steps alone: every held envelope is handed to its
// recipient's step() and nothing else - no tick, no status read - until the
// network stays quiet for a whole round of the runtimes' own drains.
async function deliverByStepsOnly(cluster) {
  let quietRounds = 0;
  for (let round = 0; round < QUIET_ROUNDS && quietRounds < 2; round += 1) {
    let delivered = 0;
    for (const replica of cluster.replicas.values()) {
      const pending = replica.inbox.splice(0, replica.inbox.length);
      for (const envelope of pending) {
        replica.node.step(envelope);
        delivered += 1;
      }
    }
    await pause(POLL_MS);
    quietRounds = delivered === 0 ? quietRounds + 1 : 0;
  }
}

// Deliver one replica's held envelopes and tick it once: the setup half of
// the F11 witness, where the port is driven the way scheduling drives it.
function deliverAndTick(cluster, replicaId) {
  const replica = cluster.replica(replicaId);
  const pending = replica.inbox.splice(0, replica.inbox.length);
  for (const envelope of pending) {
    replica.node.step(envelope);
  }
  replica.node.tick();
  return pending.length;
}

test('F11: a delivered append is processed with scheduling stopped, with no ' +
  'tick, no status read and no other operation on the recipient',
async () => {
  const cluster = new PartitionNodeCluster({
    partitionId: 'f11-inbound-drain',
    replicaIds: ['f11-a', 'f11-b'],
  });
  try {
    const leader = elect(cluster);
    const follower = ['f11-a', 'f11-b'].find((id) => id !== leader);
    const followerFile = cluster.dbFileOf(follower);
    await cluster.propose(leader, 'f11-first-write');
    assert.equal(cluster.settle(() =>
      durableProgressOf(followerFile, cluster.partitionId).commit ===
        BigInt(cluster.node(leader).readStatus().commitIndex) &&
      cluster.node(leader).readStatus().commitIndex >= 2,
    {rounds: SETTLE_ROUNDS}), true,
    'setup: the follower holds the leader\'s committed prefix');

    // The leader proposes; the follower's append and the leader's commit
    // are carried the way scheduling carries them.
    await cluster.propose(leader, 'f11-measured-write');
    assert.ok(deliverAndTick(cluster, follower) > 0,
      'setup: the leader sent the follower its append');
    assert.ok(deliverAndTick(cluster, leader) > 0,
      'setup: the follower acknowledged the append');
    const held = cluster.replica(follower).inbox.length;
    assert.ok(held > 0,
      'setup: the leader sent the follower its advanced commit index');

    // Measured: the follower's held envelopes reach step() and nothing
    // else. Its scheduling is stopped (the port was built with election
    // deferred) and nothing reads its status.
    const before = durableProgressOf(followerFile, cluster.partitionId);
    const leaderCommit = BigInt(cluster.node(leader).readStatus().commitIndex);
    assert.ok(leaderCommit > before.commit,
      'setup: the follower is one commit behind the leader');
    const ticksBefore = tickEntries(cluster);
    const pending = cluster.replica(follower).inbox.splice(0, held);
    for (const envelope of pending) {
      const accepted = cluster.node(follower).step(envelope);
      assert.equal(accepted.outcome, CORE_OK);
    }
    const advanced = await waitUntil(() => {
      const now = durableProgressOf(followerFile, cluster.partitionId);
      return now.commit === leaderCommit && now.applied === leaderCommit;
    }, DELIVERY_BOUND_MS);
    const after = durableProgressOf(followerFile, cluster.partitionId);
    assert.equal(advanced, true,
      `the follower's durable commit/applied reach ${leaderCommit} within ` +
      `${DELIVERY_BOUND_MS} ms of delivery (before ` +
      `${before.commit}/${before.applied}, after ` +
      `${after.commit}/${after.applied})`);
    assert.equal(tickEntries(cluster), ticksBefore,
      'no tick entered the core: the drain is not a tick');
    assert.equal(after.term, before.term,
      'the deferred-election follower never campaigned from the drain');
  } finally {
    cluster.dispose();
  }
});

for (const mode of ['rejects', 'no-handler']) {
  test(`F15: a delivery to one peer that ${mode} is that peer's transport ` +
    'outcome; the group keeps its leader, health and runtime generation',
  async () => {
    const fault = {target: null};
    const replicaIds = [`f15-${mode}-a`, `f15-${mode}-b`, `f15-${mode}-c`];
    const cluster = new PartitionNodeCluster({
      partitionId: `f15-${mode}`,
      replicaIds,
      sendFor: (_from, address) => {
        if (fault.target === null || address !==
            cluster.addressOf(fault.target)) {
          return undefined;
        }
        if (mode === 'rejects') {
          throw new Error('injected delivery rejection');
        }
        return {acknowledged: false, noHandler: true};
      },
    });
    try {
      const leader = elect(cluster);
      const unreachable = replicaIds.find((id) =>
        id !== leader && !cluster.tickers.includes(id));
      const leaderPort = cluster.node(leader);
      const before = leaderPort.readStatus();
      fault.target = unreachable;
      const outcomes = [];
      for (let write = 0; write < WRITES_WHILE_UNREACHABLE; write += 1) {
        outcomes.push(await cluster.propose(leader, `f15-write-${write}`));
        cluster.settle(() => false, {rounds: 4,
          between: () => outcomes.push(leaderPort.tick())});
      }
      const settled = await Promise.all(outcomes);
      assert.deepEqual(settled.filter((result) =>
        result?.outcome === HOST_FAILURE), [],
      'no operation of the leader reported a host failure');
      const during = leaderPort.readStatus();
      assert.equal(during.role, LEADER_ROLE, 'the leader kept its role');
      assert.equal(during.runtimeGeneration, before.runtimeGeneration,
        'the shared runtime was never replaced');
      assert.equal(during.groupHealth, USABLE);
      assert.equal(during.runtimeHealth, HEALTHY);
      assert.ok(during.commitIndex >=
        before.commitIndex + WRITES_WHILE_UNREACHABLE,
      'the commit index kept advancing with the reachable follower ' +
        `(${before.commitIndex} -> ${during.commitIndex})`);
      const unreachablePeer = during.peers.find((peer) =>
        peer.replicaIdentity === unreachable);
      assert.equal(unreachablePeer?.delivery?.outcome, FAILED_DELIVERY,
        'the unreachable peer carries a typed per-peer delivery failure ' +
        JSON.stringify(unreachablePeer));

      fault.target = null;
      const caughtUp = cluster.settle(() =>
        durableProgressOf(cluster.dbFileOf(unreachable),
          cluster.partitionId).applied >=
          BigInt(leaderPort.readStatus().commitIndex),
      {rounds: SETTLE_ROUNDS});
      assert.equal(caughtUp, true,
        'the unreachable peer catches up once its handler returns');
      const after = leaderPort.readStatus();
      assert.equal(after.runtimeGeneration, before.runtimeGeneration);
      assert.equal(after.role, LEADER_ROLE);
      assert.notEqual(after.peers.find((peer) =>
        peer.replicaIdentity === unreachable)?.delivery?.outcome,
      FAILED_DELIVERY, 'a delivered send clears the peer\'s failure');
    } finally {
      cluster.dispose();
    }
  });
}

test('F17: a follower reads its status while its configuration names a peer ' +
  'its registry never reserved', async () => {
  const founding = ['f17-a', 'f17-b'];
  const joiner = 'f17-joiner';
  const cluster = new PartitionNodeCluster({
    partitionId: 'f17-unreserved-peer',
    replicaIds: founding,
  });
  try {
    const leader = elect(cluster);
    const follower = founding.find((id) => id !== leader);
    const generationBefore = cluster.node(leader).readStatus()
      .runtimeGeneration;
    // The joiner is reserved on the leader only - the reservation a leader's
    // own admission makes - and never on the follower.
    new RaftRsPeerIdentityRegistry(cluster.replica(leader).db)
      .registerReplica(joiner);
    cluster.replicaIds.push(joiner);
    const joinerPeerId = cluster.buildReplica(joiner, founding).node
      .readStatus().peerId;
    const proposed = await cluster.node(leader).proposeConfChange({
      type: RAFT_MEMBERSHIP_OPERATION.ADD_LEARNER,
      replicaIdentity: joiner,
    });
    assert.equal(proposed.outcome, CORE_OK,
      `setup: the leader admits the learner ${JSON.stringify(proposed)}`);
    assert.equal(cluster.settle(() =>
      durableProgressOf(cluster.dbFileOf(follower), cluster.partitionId)
        .learners.includes(joinerPeerId),
    {rounds: SETTLE_ROUNDS}), true,
    'setup: the follower\'s own durable configuration names the learner');

    let status;
    assert.doesNotThrow(() => {
      status = cluster.node(follower).readStatus();
    }, 'a status read never throws for an unreserved configured peer');
    assert.equal(status.outcome, CORE_OK);
    const peer = status.peers.find((entry) => entry.peerId === joinerPeerId);
    assert.deepEqual(peer, {
      peerId: joinerPeerId,
      replicaIdentity: null,
      address: null,
      addressStatus: UNRESERVED,
      learner: true,
      delivery: {outcome: NO_DELIVERY_OBSERVED},
    }, 'the unreserved peer is a typed observation, not a failure');
    assert.equal(status.groupHealth, USABLE);
    assert.equal(status.runtimeGeneration, generationBefore,
      'the status read did not retire the shared runtime');
  } finally {
    cluster.dispose();
  }
});

test('F18: the progress probe sends one heartbeat round to an idle ' +
  'caught-up learner the leader holds at matched 0, observes a caught-up ' +
  'peer, and refuses a peer outside the configuration', async () => {
  const leader = 'f18-leader';
  const learner = 'f18-learner';
  const drop = {learnerToLeader: false};
  const cluster = new PartitionNodeCluster({
    partitionId: 'f18-progress-probe',
    replicaIds: [leader],
    sendFor: (from) => (drop.learnerToLeader && from === learner ?
      {acknowledged: true} : undefined),
  });
  try {
    assert.equal((await cluster.node(leader).campaign()).outcome, CORE_OK);
    await cluster.propose(leader, 'f18-first-write');
    new RaftRsPeerIdentityRegistry(cluster.replica(leader).db)
      .registerReplica(learner);
    cluster.replicaIds.push(learner);
    cluster.buildReplica(learner, [leader]);
    const learnerAddress = cluster.addressOf(learner);
    const admitted = await cluster.node(leader).proposeConfChange({
      type: RAFT_MEMBERSHIP_OPERATION.ADD_LEARNER,
      replicaIdentity: learner,
    });
    assert.equal(admitted.outcome, CORE_OK);
    assert.equal(cluster.settle(() => {
      const status = cluster.node(leader).readStatus();
      return status.followerProgress[learnerAddress] === status.commitIndex;
    }, {rounds: SETTLE_ROUNDS}), true,
    'setup: the learner is admitted and caught up');

    // The snapshot-installed shape: the leader restarts and campaigns while
    // the learner's acknowledgements are lost, so the learner holds the
    // whole committed log and the leader holds no progress evidence for it.
    drop.learnerToLeader = true;
    cluster.restart(leader);
    const restarted = cluster.node(leader);
    if (restarted.readStatus().role !== LEADER_ROLE) {
      assert.equal((await restarted.campaign()).outcome, CORE_OK);
    }
    assert.equal(cluster.settle(() =>
      durableProgressOf(cluster.dbFileOf(learner), cluster.partitionId)
        .lastIndex >= BigInt(restarted.readStatus().commitIndex),
    {rounds: SETTLE_ROUNDS}), true,
    'setup: the learner holds the restarted leader\'s committed log');
    drop.learnerToLeader = false;
    assert.deepEqual([...cluster.replicas.values()].map((replica) =>
      replica.inbox.length), [0, 0], 'setup: the network is idle');
    const idle = restarted.readStatus();
    assert.equal(idle.role, LEADER_ROLE);
    assert.equal(idle.followerProgress[learnerAddress], 0,
      'setup: the leader holds matched 0 for the caught-up learner');
    assert.ok(idle.commitIndex > 0);

    const ticksBefore = tickEntries(cluster);
    const probe = await restarted.probePeerProgress(learnerAddress);
    assert.equal(probe.outcome, CORE_OK, JSON.stringify(probe));
    assert.equal(probe.reason, PROGRESS_PROBE_SENT,
      `a peer behind the commit index is probed ${JSON.stringify(probe)}`);
    assert.ok(tickEntries(cluster) - ticksBefore <=
      RAFT_RS_GROUP_TUNING.HEARTBEAT_TICK,
    'the probe drives at most one heartbeat interval of the leader');
    const ticksAfterProbe = tickEntries(cluster);
    await deliverByStepsOnly(cluster);
    const probed = restarted.readStatus();
    assert.equal(probed.followerProgress[learnerAddress], probed.commitIndex,
      'one probe brings the leader\'s matched index to its commit index ' +
      JSON.stringify(probed.followerProgress));
    assert.equal(tickEntries(cluster), ticksAfterProbe,
      'the catch-up rode on delivered steps, not on ticks');

    const observed = await restarted.probePeerProgress(learnerAddress);
    assert.equal(observed.outcome, CORE_OK);
    assert.equal(observed.reason, PROGRESS_OBSERVED);
    assert.equal(observed.matchIndex, probed.commitIndex);

    const outsider = await restarted.probePeerProgress(
      cluster.addressOf('f18-never-a-member'));
    assert.equal(outsider.outcome, CORE_REFUSED);
    assert.equal(outsider.reason, NOT_A_PEER);
  } finally {
    cluster.dispose();
  }
});

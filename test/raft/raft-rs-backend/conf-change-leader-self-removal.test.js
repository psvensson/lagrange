// A leader that applies its own removal must not keep its group: leadership
// passes to the voters that remain within two election timeouts, and a write
// proposed there commits on them.
//
// raft-rs 0.7 leaves such a leader leading (raft.rs post_conf_change: "This
// node is leader and was removed or demoted ... TODO(tbg): step down"). With
// no progress for itself it drops every proposal ("proposal dropped"), and
// its heartbeats keep the remaining voters inside their check-quorum lease,
// so none of them ever campaigns: the group takes no write until something
// else retires the replica. Two owners close it:
//   - the binding (fork fix 5): the call that applies the change steps the
//     leader down, after a MsgTimeoutNow to its most caught-up voter;
//   - the leader's port: a change that removes or demotes the leader itself
//     is refused retryable (REMOVES_LEADER), nothing reaches the core, and
//     leadership is handed to the most caught-up voter in the same turn.
// The admission cannot cover every path: leadership can return to the
// removed replica after another leader proposed its removal and before the
// entry commits (RACE_RETURN, T2), and only the binding answers that.
//
// T1-T3 drive the production binding and durable store with the driver
// owning ticks and delivery (deterministic-raft-rs-cluster.js). Each inbound
// message is stepped and its Ready drained before the next, as the runtime
// owner's stepOneInbound does, and messages are moved until none is in flight
// between ticks. The changes are proposed straight into the core, below the
// port's admission. The removed replica is never retired or crashed: what
// ends its leadership is the core, or nothing. P1 drives the production
// operation ports (partition-node-cluster.js).
//
// Oracles: the core's own role and configuration of every replica, the
// durable log and applied state read on an independent connection, and the
// leader's own answer to a proposal.

import assert from 'node:assert/strict';
import {test} from 'node:test';
import {TextEncoder} from 'node:util';

import {DeterministicRaftRsCluster} from './deterministic-raft-rs-cluster.js';
import {PartitionNodeCluster} from './partition-node-cluster.js';
import {drainReady} from './raw-raft-rs-test-ready.js';
import {
  bindingWireNumbers,
  durableAppliedState,
  durableLog,
} from './committed-membership-oracles.js';
import {RAFT_RS_GROUP_TUNING} from
  '../../../src/raft/raft-rs-group-constants.js';
import {
  CORE_REFUSAL_KIND,
  ROLE,
  ROLE_LEADER,
} from '../../../src/raft/raft-rs-runtime-owner-constants.js';
import {
  RAFT_MEMBERSHIP_CHANGE_REFUSAL,
  RAFT_MEMBERSHIP_OPERATION,
  RAFT_OPERATION_OUTCOME,
} from '../../../src/raft/raft-operation-port-constants.js';
import {turnChainValue} from '../../../src/raft/raft-rs-turn-answer.js';

const WIRE = bindingWireNumbers();
const ADD_NODE = WIRE.changeType.AddNode;
const REMOVE_NODE = WIRE.changeType.RemoveNode;
const ADD_LEARNER = WIRE.changeType.AddLearnerNode;
const AUTO_TRANSITION = WIRE.transition.Auto;
const TRANSFER_LEADER = WIRE.messageType.MsgTransferLeader;
const CONF_CHANGE_ENTRY_TYPES = Object.freeze(new Set([
  WIRE.entryType.EntryConfChange, WIRE.entryType.EntryConfChangeV2]));
const ELECTION_TICK = RAFT_RS_GROUP_TUNING.ELECTION_TICK;
// The bound: two election timeouts of driver ticks after the moment the
// removed leader applied its removal (or, in T2, after the voter it needs
// is back on the network).
const BOUND_TICKS = 2 * ELECTION_TICK;
const QUIESCE_ROUNDS = 200;
const SETUP_TICKS = 200;
const A = '1';
const B = '2';
const C = '3';
const D = '4';

/**
 * A cluster of the production binding whose inbound messages are stepped and
 * drained one at a time, as the runtime owner does.
 */
class SelfRemovalWorld {
  /**
   * @param {string} groupId - The group.
   * @param {Array<string>} voters - The founding voters.
   */
  constructor(groupId, voters) {
    this.groupId = groupId;
    // Every (peer, term) the core reported leading after one of its Ready
    // loops: a leadership that began and ended inside one quiescence is
    // still seen.
    this.leaderships = new Set();
    this.cluster = new DeterministicRaftRsCluster({voters, groupId,
      dispatch: (peer, message) => this.stepAndDrain(peer, message)});
  }

  /**
   * One delivered message: stepped, then the recipient's Ready drained. A
   * typed core refusal (a response from a peer the core no longer tracks)
   * is the production host's recorded refusal; a trap is not caught.
   * @param {Object} peer - The recipient.
   * @param {Object} message - The message.
   */
  stepAndDrain(peer, message) {
    try {
      this.cluster.core.step(peer.handle, message);
    } catch (error) {
      if (error?.kind !== CORE_REFUSAL_KIND) {
        throw error;
      }
    }
    this.drain(peer.peerId);
  }

  /**
   * @param {string} peerId - The peer whose Ready loop runs.
   */
  drain(peerId) {
    const peer = this.cluster.peer(peerId);
    drainReady({core: this.cluster.core, handle: peer.handle,
      store: peer.store, groupId: this.groupId,
      send: (messages) => this.cluster.route(messages)});
    const status = this.cluster.status(peerId);
    if (ROLE[status.raftState] === ROLE_LEADER) {
      this.leaderships.add(`${peerId}@${status.term}`);
    }
  }

  /** Move messages until none is in flight. */
  quiesce() {
    for (let round = 0; round < QUIESCE_ROUNDS; round += 1) {
      for (const peer of this.cluster.peers.values()) {
        if (peer.live) {
          this.drain(peer.peerId);
        }
      }
      if (this.cluster.deliver() === 0) {
        return;
      }
    }
    throw new Error('messages never quiesced');
  }

  /**
   * One tick of the named peers (every live peer when omitted), then every
   * message it caused is delivered.
   * @param {Array<string>} [peerIds] - Whose timers run.
   */
  tickRound(peerIds) {
    this.cluster.tick(peerIds);
    this.quiesce();
  }

  /**
   * Tick rounds until the predicate holds.
   * @param {Function} untilTrue - The predicate.
   * @param {number} maxTicks - The bound.
   * @param {Array<string>} [peerIds] - Whose timers run.
   * @return {number|null} The ticks it took, or null when it never held.
   */
  ticksUntil(untilTrue, maxTicks, peerIds) {
    for (let ticks = 0; ticks <= maxTicks; ticks += 1) {
      if (untilTrue()) {
        return ticks;
      }
      if (ticks < maxTicks) {
        this.tickRound(peerIds);
      }
    }
    return null;
  }

  /**
   * @param {string} peerId - The peer.
   * @return {string} Its role, as the core reports it.
   */
  role(peerId) {
    return ROLE[this.cluster.status(peerId).raftState];
  }

  /**
   * @param {Array<string>} peerIds - Candidates.
   * @return {string|null} The one of them that leads itself, or null.
   */
  leaderAmong(peerIds) {
    return peerIds.find((peerId) => this.role(peerId) === ROLE_LEADER &&
      this.cluster.status(peerId).lead === peerId) ?? null;
  }

  /**
   * @param {Array<string>} peerIds - A configuration's voters.
   * @return {string|null} The one of them that leads and that every one of
   *   them names as its leader, or null. A cut-off leader that has not yet
   *   learned of a later term leads only itself, and is not it.
   */
  agreedLeaderAmong(peerIds) {
    const leader = this.leaderAmong(peerIds);
    return leader !== null && peerIds.every((peerId) =>
      this.cluster.status(peerId).lead === leader) ? leader : null;
  }

  /**
   * @param {string} peerId - The peer asked about.
   * @param {string} holder - Whose applied configuration is read.
   * @return {boolean} Whether the holder's configuration counts it a voter.
   */
  isVoterAt(peerId, holder) {
    const confState = this.cluster.confState(holder);
    return [...confState.voters, ...confState.votersOutgoing]
      .map(String).includes(peerId);
  }

  /**
   * Propose one configuration change straight into a peer's core.
   * @param {string} peerId - The proposing peer.
   * @param {number} changeType - The ConfChangeType wire number.
   * @param {string} nodeId - The peer the change names.
   */
  proposeChange(peerId, changeType, nodeId) {
    this.cluster.core.propose_conf_change_v2(this.cluster.peer(peerId).handle,
      {transition: AUTO_TRANSITION, changes: [{changeType, nodeId}]});
  }

  /**
   * Propose a write at a peer's core.
   * @param {string} peerId - The proposing peer.
   * @param {string} text - The write.
   * @return {string} 'ok', or the core's refusal.
   */
  proposeWrite(peerId, text) {
    try {
      this.cluster.core.propose(this.cluster.peer(peerId).handle,
        new TextEncoder().encode(text));
      return 'ok';
    } catch (error) {
      return String(error?.message ?? error);
    }
  }

  /**
   * The index of a write in a peer's durable log, applied there; or null.
   * @param {string} peerId - The peer.
   * @param {string} text - The write.
   * @return {number|null}
   */
  appliedWriteIndex(peerId, text) {
    const {dbFile} = this.cluster.peer(peerId);
    const data = Buffer.from(text).toString('base64');
    const entry = durableLog(dbFile, this.groupId)
      .find((logged) => logged.data === data);
    const applied = durableAppliedState(dbFile, this.groupId);
    return entry !== undefined && applied !== null &&
      applied.appliedIndex >= entry.index ? entry.index : null;
  }

  /** @return {Object} Every peer's role, term and leader, for messages. */
  roles() {
    return Object.fromEntries([...this.cluster.peers.keys()].map((peerId) => {
      const status = this.cluster.status(peerId);
      return [peerId, `${ROLE[status.raftState]} t${status.term} ` +
        `lead=${status.lead}`];
    }));
  }

  /** Free every handle and remove the files. */
  dispose() {
    this.cluster.dispose();
  }
}

/**
 * Elect `leader` and let every voter apply what it committed.
 * @param {SelfRemovalWorld} world - The world.
 * @param {string} leader - The peer to elect.
 */
function elect(world, leader) {
  assert.ok(world.cluster.campaign(leader), `setup: ${leader} leads`);
  world.quiesce();
}

/**
 * Tick rounds until a predicate holds, as setup.
 * @param {SelfRemovalWorld} world - The world.
 * @param {Function} untilTrue - The predicate.
 * @param {string} what - What the setup waits for.
 */
function settleSetup(world, untilTrue, what) {
  assert.notEqual(world.ticksUntil(untilTrue, SETUP_TICKS), null,
    `setup: ${what} (${JSON.stringify(world.roles())})`);
}

/**
 * The oracle: within BOUND_TICKS ticks a survivor leads, the removed replica
 * does not, no replica that reports itself leader drops a proposal, and a
 * write proposed at the survivor's leader commits and applies on every
 * survivor.
 * @param {SelfRemovalWorld} world - The world.
 * @param {Object} shape - {removed, survivors, label}.
 * @return {number} The ticks the survivors waited for their leader.
 */
function assertLeadershipPassedOn(world, {removed, survivors, label}) {
  const ticks = world.ticksUntil(
    () => world.agreedLeaderAmong(survivors) !== null, BOUND_TICKS);
  assert.notEqual(ticks, null,
    `a voter among ${survivors.join(',')} leads them within ` +
    `${BOUND_TICKS} ticks (two election timeouts) ` +
    `(${JSON.stringify(world.roles())})`);
  const leader = world.agreedLeaderAmong(survivors);
  assert.notEqual(world.role(removed), ROLE_LEADER,
    `the removed replica ${removed} no longer leads`);
  for (const peerId of world.cluster.peers.keys()) {
    if (world.role(peerId) === ROLE_LEADER) {
      assert.equal(world.proposeWrite(peerId, `${label}-probe-${peerId}`),
        'ok', `the leader ${peerId} takes a proposal`);
    }
  }
  const write = `${label}-after-removal`;
  assert.equal(world.proposeWrite(leader, write), 'ok',
    `the new leader ${leader} takes the write`);
  assert.notEqual(world.ticksUntil(() => survivors.every((peerId) =>
    world.appliedWriteIndex(peerId, write) !== null), BOUND_TICKS), null,
  `the write commits and applies on ${survivors.join(',')}`);
  return ticks;
}

/**
 * @param {string} groupId - The group.
 * @param {Array<string>} voters - The founding voters.
 * @return {SelfRemovalWorld}
 */
function worldOf(groupId, voters = [A, B, C]) {
  return new SelfRemovalWorld(groupId, voters);
}

test('T1: a leader that applies its own RemoveNode hands leadership to the ' +
  'voters that remain within two election timeouts', () => {
  const world = worldOf('self-removal-t1');
  try {
    elect(world, A);
    world.proposeChange(A, REMOVE_NODE, A);
    world.drain(A);
    settleSetup(world, () => !world.isVoterAt(A, A),
      'A applied its own removal');
    const waited = assertLeadershipPassedOn(world, {removed: A,
      survivors: [B, C], label: 't1'});
    assert.ok(waited < ELECTION_TICK, 'no election timeout ran out: the ' +
      `MsgTimeoutNow handed leadership on (waited ${waited} ticks)`);
  } finally {
    world.dispose();
  }
});

test('T2 (RACE_RETURN): leadership returns to A after B proposed A\'s ' +
  'removal and before it committed; A commits and applies its own removal ' +
  'as leader and still hands leadership on', () => {
  const world = worldOf('self-removal-t2');
  try {
    elect(world, A);
    // The hand-off: A transfers to B (the MsgTransferLeader raft-rs's own
    // RawNode::transfer_leader steps).
    world.cluster.core.step(world.cluster.peer(A).handle,
      {msgType: TRANSFER_LEADER, from: B, to: A});
    world.drain(A);
    world.quiesce();
    assert.equal(world.leaderAmong([B]), B, 'setup: B leads after the hand-off');
    // B proposes A's removal; its append reaches A and C, and B is cut off
    // before any acknowledgement returns, so the entry does not commit.
    world.proposeChange(B, REMOVE_NODE, A);
    world.drain(B);
    world.cluster.partition(B);
    world.quiesce();
    const removalIndex = Number(world.cluster.status(B).pendingConfIndex);
    for (const peerId of [A, C]) {
      assert.ok(durableLog(world.cluster.peer(peerId).dbFile, world.groupId)
        .some((entry) => entry.index === removalIndex &&
          CONF_CHANGE_ENTRY_TYPES.has(entry.entryType)),
      `setup: ${peerId} holds the uncommitted RemoveNode(A)`);
      assert.ok(BigInt(world.cluster.status(peerId).commit) <
        BigInt(removalIndex), `setup: ${peerId} has not seen it commit`);
    }
    // C's lease runs out first (A, unticked, refuses C should C's own timer
    // fire), then A's; A campaigns and wins with C.
    for (let tick = 0; tick < ELECTION_TICK; tick += 1) {
      world.tickRound([C]);
    }
    for (let tick = 0; tick < ELECTION_TICK &&
        world.leaderAmong([A]) === null; tick += 1) {
      world.tickRound([A]);
    }
    const returned = () => [...world.leaderships].some((leadership) =>
      leadership.startsWith(`${A}@`) && Number(leadership.split('@')[1]) >
        Number(world.cluster.status(B).term));
    if (!returned()) {
      world.cluster.core.campaign(world.cluster.peer(A).handle);
      world.drain(A);
      world.quiesce();
    }
    assert.ok(returned(), 'setup: leadership returned to A at a later term ' +
      `(${[...world.leaderships].join(' ')})`);
    settleSetup(world, () => !world.isVoterAt(A, A),
      'A committed and applied its own removal');
    world.cluster.heal(B);
    assertLeadershipPassedOn(world, {removed: A, survivors: [B, C],
      label: 't2'});
  } finally {
    world.dispose();
  }
});

test('T3: the REPLACE shape - {A,B,C} gains D as learner then voter, and ' +
  'the leader A is the source removed', () => {
  const world = worldOf('self-removal-t3');
  try {
    elect(world, A);
    world.cluster.addPeer(D, [A, B, C]);
    world.proposeChange(A, ADD_LEARNER, D);
    world.drain(A);
    settleSetup(world, () => [A, B, C, D].every((peerId) =>
      world.cluster.confState(peerId).learners.map(String).includes(D)),
    'D is a learner of every configuration');
    world.proposeChange(A, ADD_NODE, D);
    world.drain(A);
    settleSetup(world, () => [A, B, C, D].every((peerId) =>
      world.isVoterAt(D, peerId)), 'D is a voter of every configuration');
    assert.equal(world.leaderAmong([A]), A, 'setup: A still leads');
    world.proposeChange(A, REMOVE_NODE, A);
    world.drain(A);
    settleSetup(world, () => !world.isVoterAt(A, A),
      'A applied its own removal');
    const waited = assertLeadershipPassedOn(world, {removed: A,
      survivors: [B, C, D], label: 't3'});
    assert.ok(waited < ELECTION_TICK, 'no election timeout ran out: the ' +
      `MsgTimeoutNow handed leadership on (waited ${waited} ticks)`);
  } finally {
    world.dispose();
  }
});

const PORT_A = 'self-a';
const PORT_B = 'self-b';
const PORT_C = 'self-c';
const PORT_REPLICAS = Object.freeze([PORT_A, PORT_B, PORT_C]);

for (const [label, type] of [
  ['removal', RAFT_MEMBERSHIP_OPERATION.REMOVE_PEER],
  ['demotion', RAFT_MEMBERSHIP_OPERATION.ADD_LEARNER],
]) {
  test(`P1: the leader's port refuses its own ${label} (REMOVES_LEADER), ` +
    'hands nothing to the core, and hands leadership to a voter that ' +
    'remains in the same turn', async () => {
    const cluster = new PartitionNodeCluster({
      partitionId: `self-removal-p1-${type}`, replicaIds: PORT_REPLICAS});
    try {
      assert.ok(cluster.settle(() => cluster.leaderReplicaId() === PORT_A &&
        PORT_REPLICAS.every((replicaId) => durableAppliedState(
          cluster.replica(replicaId).dbFile, cluster.partitionId)
          ?.appliedIndex > 0), {rounds: 400}), 'setup: A leads');
      const peerA = String(cluster.raftPeerIdOf(PORT_A));
      const lastBefore = durableLog(cluster.replica(PORT_A).dbFile,
        cluster.partitionId).at(-1).index;
      const answer = await turnChainValue(cluster.node(PORT_A)
        .proposeConfChange({type, replicaIdentity: PORT_A,
          nodeId: 'node-self-a'}));
      assert.deepEqual({outcome: answer.outcome, reason: answer.reason,
        retryable: answer.retryable,
        recoveryRequired: answer.recoveryRequired}, {
        outcome: RAFT_OPERATION_OUTCOME.CORE_REFUSED,
        reason: RAFT_MEMBERSHIP_CHANGE_REFUSAL.REMOVES_LEADER,
        retryable: true,
        recoveryRequired: false,
      }, `the leader's own ${label} is refused typed and retryable ` +
        `(${JSON.stringify(answer)})`);
      // No election timer can fire within these rounds: a voter that leads
      // here was handed leadership by the transfer the refusal stepped.
      cluster.tickers = [];
      assert.ok(cluster.settle(() => [PORT_B, PORT_C].includes(
        cluster.leaderReplicaId()), {rounds: ELECTION_TICK - 1}),
      'leadership passed to B or C without an election timeout');
      assert.notEqual(cluster.node(PORT_A).readStatus().role, ROLE_LEADER,
        'A no longer leads');
      assert.deepEqual(durableLog(cluster.replica(PORT_A).dbFile,
        cluster.partitionId).filter((entry) => entry.index > lastBefore &&
        CONF_CHANGE_ENTRY_TYPES.has(entry.entryType)), [],
      'no configuration change reached the core');
      for (const replicaId of PORT_REPLICAS) {
        assert.ok(cluster.coreConfState(replicaId).voters.map(String)
          .includes(peerA), `${replicaId} still counts A a voter`);
      }
    } finally {
      cluster.dispose();
    }
  });
}

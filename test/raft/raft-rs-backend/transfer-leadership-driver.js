// A tick-exact driver for leadership-transfer evidence on real rs-raft ports.
//
// It wraps PartitionNodeCluster (every peer is what the provider seam built)
// and owns nothing but time and delivery:
//
//   - every port runs on one VirtualTimeSource that is never advanced, so no
//     timer the runtime schedules (the inbound drain, scheduling) ever fires
//     by itself; the core enters only when this driver asks;
//   - a ROUND is one tick of every live replica followed by delivery until
//     the transport is quiet. One round is one tick length of time, so the
//     election timeout as the core counts it (election tick x tick length) is
//     `electionTick()` rounds;
//   - delivery hands each held envelope to its recipient's step() and drains
//     it with readStatus(), which drives delivered inbound through the core
//     and never ticks, so delivery adds no time.
//
// A crashed replica is cut off from the transport, rebuilt from its durable
// record (its in-memory core state, including any transfer it was running, is
// lost) and not ticked until it recovers. An isolated replica is cut off but
// keeps ticking. Every expectation a witness draws from here is the core's own
// report through readStatus, with identities resolved through the backend's
// registry; nothing here decides who should lead.

import assert from 'node:assert/strict';

import {RaftRsPeerIdentityRegistry} from
  '../../../src/raft/raft-rs-peer-identity.js';
import {
  RAFT_EVENT,
  RAFT_OPERATION_OUTCOME,
} from '../../../src/raft/raft-operation-port-constants.js';
import {RAFT_PARTITION_NODE_REQUEST} from
  '../../../src/raft/raft-provider-contract-constants.js';
import {tuningOf} from '../../../src/raft/raft-rs-runtime-tuning.js';
import {VirtualTimeSource} from '../../../src/time/time-source.js';
import {PartitionNodeCluster} from './partition-node-cluster.js';

const LEADER_ROLE = 'leader';
const {CORE_OK, CORE_REFUSED, HOST_FAILURE} = RAFT_OPERATION_OUTCOME;

// The contract under test, as the F1 design and its lead decisions seal it
// (design-f1-step-down-port-2026-09-25.md section 5): the request shapes and
// the answer vocabulary. These are the values the witnesses demand; the
// vocabulary witness checks the owner's constant carries them.
const SUCCESSOR = Object.freeze({
  NAMED: 'named',
  MOST_CAUGHT_UP: 'most-caught-up',
});
const TRANSFER_REASON = Object.freeze({
  REQUESTED: 'transfer-requested',
  FORWARDED: 'transfer-forwarded',
  ALREADY_LEADER: 'already-leader',
  NO_KNOWN_LEADER: 'no-known-leader',
  TARGET_NOT_VOTER: 'target-not-voter',
  TARGET_UNRESERVED: 'target-unreserved',
  NO_ELIGIBLE_SUCCESSOR: 'no-eligible-successor',
});
const IN_PROGRESS_REASON = 'leadership-transfer-in-progress';
const UNSUPPORTED_BACKEND_REASON = 'leadership-transfer-unsupported-backend';

/**
 * @param {string} replicaIdentity - The named successor.
 * @return {Object} The canonical named request.
 */
function namedSuccessor(replicaIdentity) {
  return {successor: SUCCESSOR.NAMED, replicaIdentity};
}

/** @return {Object} The canonical most-caught-up request. */
function mostCaughtUp() {
  return {successor: SUCCESSOR.MOST_CAUGHT_UP};
}

/**
 * An accepted answer: a frozen CORE_OK record with the named reason.
 * @param {Object} answer - The port's answer.
 * @param {string} reason - The reason the contract demands.
 */
function assertAccepted(answer, reason) {
  assert.equal(Object.isFrozen(answer), true, 'the answer is a frozen record');
  assert.equal(answer?.outcome, CORE_OK, JSON.stringify(answer));
  assert.equal(answer.reason, reason, JSON.stringify(answer));
}

/**
 * A typed refusal: a frozen CORE_REFUSED record with the named reason.
 * @param {Object} answer - The port's answer.
 * @param {string} reason - The reason the contract demands.
 */
function assertRefused(answer, reason) {
  assert.equal(Object.isFrozen(answer), true, 'the answer is a frozen record');
  assert.equal(answer?.outcome, CORE_REFUSED, JSON.stringify(answer));
  assert.equal(answer.reason, reason, JSON.stringify(answer));
}

/**
 * The write-path answer while a transfer is in progress: named, retryable,
 * and not a group failure.
 * @param {Object} answer - The port's answer to a proposal.
 */
function assertTransferInProgress(answer) {
  assert.equal(answer?.outcome, HOST_FAILURE, JSON.stringify(answer));
  assert.equal(answer.reason, IN_PROGRESS_REASON, JSON.stringify(answer));
  assert.equal(answer.retryable, true, 'the window is retryable');
  assert.equal(answer.recoveryRequired, false,
    'the window is not a group failure');
}

// The hold after a hand-over: at least ten further election timeouts.
const HOLD_TIMEOUTS = 10;
// Writes a formed group commits before the witness acts.
const FORMATION_WRITES = 3;

/**
 * Over at least ten further election timeouts, with every live replica
 * ticking and the leader reaching the old leader, the old leader never leads
 * again, emits no LEADER event (counted from when it was first watched), and
 * no further election happens.
 * @param {TransferLeadershipDriver} driver - The group.
 * @param {Object} parties - {from, to}: the old leader and the successor.
 */
function assertLeadershipHeld(driver, {from, to}) {
  if (!driver.leaderEvents.has(from)) {
    driver.watchLeaderEvents(from);
  }
  const term = driver.status(to).term;
  for (let round = 0;
    round < HOLD_TIMEOUTS * driver.electionTick(); round += 1) {
    driver.round();
    assert.equal(driver.leads(to), true, `${to} keeps leading`);
    assert.equal(driver.leads(from), false, `${from} never leads again`);
  }
  assert.equal(driver.leaderEventCount(from), 0,
    'the old leader emitted no LEADER event');
  assert.equal(driver.status(to).term, term, 'no further election');
}

// Delivery converges when the transport is quiet; a burst this long is a loop.
const DELIVERY_BOUND = 1000;

class TransferLeadershipDriver {
  /**
   * @param {Object} shape - {partitionId, replicaIds, timingFor?, sendFor?,
   *   wrapDatabase?}: the optional per-replica timing, send and database
   *   hooks of the cluster.
   */
  constructor({partitionId, replicaIds, timingFor = null, sendFor = null,
    wrapDatabase = null}) {
    this.clock = new VirtualTimeSource();
    this.cluster = new PartitionNodeCluster({
      partitionId,
      replicaIds,
      timingFor,
      sendFor,
      wrapDatabase,
      substrateFor: () => ({timeSource: this.clock}),
    });
    this.crashed = new Set();
    this.leaderEvents = new Map();
  }

  /** @return {number} The election timeout in ticks, as the core is tuned. */
  electionTick() {
    const [first] = this.cluster.replicaIds;
    return this.electionTickOf(first);
  }

  /**
   * @param {string} replicaId - The replica.
   * @return {number} Its own election timeout in ticks.
   */
  electionTickOf(replicaId) {
    return tuningOf(this.cluster.replica(replicaId)
      .request[RAFT_PARTITION_NODE_REQUEST.TIMING]).electionTick;
  }

  /**
   * @param {string} replicaId - The replica.
   * @return {Object} Its operation port.
   */
  port(replicaId) {
    return this.cluster.node(replicaId);
  }

  /**
   * @param {string} replicaId - The replica.
   * @return {Object} The core's report through the port.
   */
  status(replicaId) {
    return this.port(replicaId).readStatus();
  }

  /**
   * The raft id a replica's own registry holds for an identity.
   * @param {string} atReplicaId - Whose registry.
   * @param {string} replicaIdentity - The identity.
   * @return {string|null} The reserved raft id, or null.
   */
  raftIdAt(atReplicaId, replicaIdentity) {
    return new RaftRsPeerIdentityRegistry(this.cluster.replica(atReplicaId).db)
      .raftPeerIdOf(replicaIdentity);
  }

  /**
   * Reserve an identity in every replica's registry, as Lagrange's workflow
   * does before a joiner is proposed; no replica is built for it.
   * @param {string} replicaIdentity - The identity.
   * @return {string} The raft id every registry derived.
   */
  reserveEverywhere(replicaIdentity) {
    const ids = new Set([...this.cluster.replicas.values()].map((replica) =>
      new RaftRsPeerIdentityRegistry(replica.db)
        .registerReplica(replicaIdentity)));
    if (ids.size !== 1) {
      throw new Error(`registries disagree on ${replicaIdentity}`);
    }
    return [...ids][0];
  }

  /**
   * Count the LEADER role events a replica's port emits from now on.
   * @param {string} replicaId - The replica.
   */
  watchLeaderEvents(replicaId) {
    this.leaderEvents.set(replicaId, 0);
    this.port(replicaId).subscribe(RAFT_EVENT.LEADER, () => {
      this.leaderEvents.set(replicaId, this.leaderEvents.get(replicaId) + 1);
    });
  }

  /**
   * @param {string} replicaId - The replica.
   * @return {number} LEADER events since it was watched.
   */
  leaderEventCount(replicaId) {
    return this.leaderEvents.get(replicaId);
  }

  /** Deliver until the transport is quiet. No replica ticks. */
  deliver() {
    for (let burst = 0; burst < DELIVERY_BOUND; burst += 1) {
      let moved = 0;
      for (const replica of this.cluster.replicas.values()) {
        const pending = replica.inbox.splice(0, replica.inbox.length);
        for (const envelope of pending) {
          replica.node.step(envelope);
        }
        if (pending.length > 0) {
          replica.node.readStatus();
          moved += pending.length;
        }
      }
      if (moved === 0) {
        return;
      }
    }
    throw new Error('delivery did not quiesce');
  }

  /**
   * Deliver to some replicas only, draining each: the others keep what the
   * transport holds for them.
   * @param {Array<string>} replicaIds - Who receives.
   */
  deliverOnly(replicaIds) {
    for (const replicaId of replicaIds) {
      const replica = this.cluster.replica(replicaId);
      const pending = replica.inbox.splice(0, replica.inbox.length);
      for (const envelope of pending) {
        replica.node.step(envelope);
      }
      replica.node.readStatus();
    }
  }

  /**
   * Hand a replica what the transport holds for it through step(), and stop
   * there: the envelopes are delivered to its runtime but not yet processed,
   * as when a request reaches the port before the runtime's next turn.
   * @param {string} replicaId - The recipient.
   * @return {number} Envelopes handed over.
   */
  stepUndrained(replicaId) {
    const replica = this.cluster.replica(replicaId);
    const pending = replica.inbox.splice(0, replica.inbox.length);
    for (const envelope of pending) {
      replica.node.step(envelope);
    }
    return pending.length;
  }

  /**
   * Lose what the transport holds for a replica, as a network drops it.
   * @param {string} replicaId - The recipient.
   * @return {number} Envelopes lost.
   */
  loseInTransit(replicaId) {
    return this.cluster.replica(replicaId).inbox.splice(0).length;
  }

  /** One tick length: every live replica ticks once, then delivery. */
  round() {
    for (const replicaId of this.cluster.replicas.keys()) {
      if (!this.crashed.has(replicaId)) {
        this.port(replicaId).tick();
      }
    }
    this.deliver();
  }

  /**
   * @param {Function} predicate - What the group waits for.
   * @param {number} bound - Rounds allowed.
   * @return {number|null} Rounds it took, or null if it never held.
   */
  roundsUntil(predicate, bound) {
    for (let rounds = 0; rounds <= bound; rounds += 1) {
      if (predicate()) {
        return rounds;
      }
      if (rounds < bound) {
        this.round();
      }
    }
    return null;
  }

  /**
   * @param {string} replicaId - The replica.
   * @return {boolean} Whether the core reports it leading.
   */
  leads(replicaId) {
    return this.status(replicaId).role === LEADER_ROLE;
  }

  /**
   * Elect a replica by its own campaign, delivered to completion.
   * @param {string} replicaId - The candidate.
   * @return {boolean} Whether it leads.
   */
  elect(replicaId) {
    this.port(replicaId).campaign();
    this.deliver();
    return this.leads(replicaId);
  }

  /**
   * Form the group: the first replica elects itself by its own campaign and
   * commits a few writes.
   * @return {string} The leader.
   */
  form() {
    const [leader] = this.cluster.replicaIds;
    assert.equal(this.elect(leader), true, 'the first replica is elected');
    for (let write = 0; write < FORMATION_WRITES; write += 1) {
      const command = {formation: write};
      this.propose(leader, command);
      assert.equal(this.applied(leader, command), true, 'formation commits');
    }
    return leader;
  }

  /**
   * Make a follower lag: cut it off while the leader commits writes with the
   * rest. The caller reconnects it, or leaves it cut off.
   * @param {string} leader - The leader.
   * @param {string} laggard - The follower that misses the writes.
   */
  lagBehind(leader, laggard) {
    this.isolate(laggard);
    for (let write = 0; write < FORMATION_WRITES; write += 1) {
      const command = {missedBy: laggard, write};
      this.propose(leader, command);
      assert.equal(this.applied(leader, command), true, 'the rest commit');
    }
  }

  /**
   * Propose on a replica and deliver.
   * @param {string} replicaId - The proposer.
   * @param {*} command - The command.
   * @return {Object} The port's answer.
   */
  propose(replicaId, command) {
    const answer = this.port(replicaId).propose(command);
    this.deliver();
    return answer;
  }

  /**
   * @param {string} replicaId - The replica.
   * @param {*} command - A command.
   * @return {boolean} Whether its application applied the command.
   */
  applied(replicaId, command) {
    return this.cluster.replica(replicaId).appliedCommands.some((applied) =>
      JSON.stringify(applied) === JSON.stringify(command));
  }

  /** @return {Array<string>} The operations the core was entered for. */
  coreOperations() {
    return this.cluster.coreEntries.map((entry) => entry.operation);
  }

  /** @param {string} replicaId - Cut it off; it keeps ticking. */
  isolate(replicaId) {
    this.cluster.isolate(replicaId);
  }

  /** @param {string} replicaId - Reconnect it. */
  heal(replicaId) {
    this.cluster.heal(replicaId);
  }

  /**
   * Crash a replica: cut it off, lose its in-memory core, stop its clock.
   * @param {string} replicaId - The replica.
   */
  crash(replicaId) {
    this.cluster.isolate(replicaId);
    this.cluster.restart(replicaId);
    this.crashed.add(replicaId);
  }

  /** @param {string} replicaId - Bring a crashed replica back. */
  recover(replicaId) {
    this.crashed.delete(replicaId);
    this.cluster.heal(replicaId);
  }

  /** Release every port, database and file. */
  dispose() {
    this.cluster.dispose();
  }
}

export {
  IN_PROGRESS_REASON,
  TRANSFER_REASON,
  TransferLeadershipDriver,
  UNSUPPORTED_BACKEND_REASON,
  assertAccepted,
  assertLeadershipHeld,
  assertRefused,
  assertTransferInProgress,
  mostCaughtUp,
  namedSuccessor,
};

#!/usr/bin/env node
// Drive ONE hostile message shape and print what happened, as JSON.
//
// One shape per process, because a raft-rs fatal traps the WASM runtime and
// everything after it in the same runtime is meaningless. The parent test
// spawns this once per shape and builds the enumeration out of what came
// back; nothing about the outcome is decided here.
//
// The ingress boundary runs first. If it refuses, the core is never reached
// and that is the recorded outcome. If it admits, the step and the Ready
// drain that follows it run inside the production trap boundary, so a fatal
// is reported with the diagnosis the panic hook wrote and with the health the
// host moved to.

import process from 'node:process';

import {
  RAFT_RS_CALL_OUTCOME,
  RAFT_RS_RUNTIME_HEALTH,
  RAFT_RS_CORE_ENTRY,
  RaftRsRuntimeHost,
} from '../../../src/raft/raft-rs-runtime-health.js';
import {
  RaftRsReplicaLifecycle,
} from '../../../src/raft/raft-rs-replica-lifecycle.js';
import {
  RAFT_RS_INGRESS_OUTCOME,
  admitRaftRsMessage,
} from '../../../src/raft/raft-rs-ingress.js';
import {instantiateRaftRsCore} from '../../../src/raft/raft-rs-core.js';
import {
  DeterministicRaftRsCluster,
} from './deterministic-raft-rs-cluster.js';
import {HOSTILE_SHAPE} from './hostile-message-shapes.js';

const GROUP_ID = 'partition-under-test';
const OTHER_GROUP_ID = 'a-different-partition';
const VOTERS = Object.freeze(['1', '2', '3']);
const LEADER = '1';
const FOLLOWER = '2';
const OTHER_FOLLOWER = '3';
const SETTLE_ROUNDS = 200;
const MSG = Object.freeze({
  APPEND: 3,
  APPEND_RESPONSE: 4,
  HEARTBEAT: 8,
  TRANSFER_LEADER: 13,
  TIMEOUT_NOW: 14,
  READ_INDEX: 15,
});
const ENTRY_NORMAL = 0;
const IMPOSSIBLE_COMMIT = '999999';
const BEYOND_THE_LOG = '999999';
const NON_CONTIGUOUS_GAP = 7n;
const EXIT_USAGE = 2;
const JSON_INDENT = 1;

function usage() {
  process.stderr.write(
    `usage: hostile-message-probe.js <${Object.values(HOSTILE_SHAPE)
      .map((shape) => shape.id).join('|')}>\n`);
  process.exit(EXIT_USAGE);
}

function settledCluster(core) {
  const cluster = new DeterministicRaftRsCluster({
    voters: VOTERS, groupId: GROUP_ID, core,
  });
  cluster.campaign(LEADER);
  cluster.settle((current) => current.leaderId() === LEADER,
    {rounds: SETTLE_ROUNDS, ticking: false});
  return cluster;
}

// Each shape: which peer receives it, the envelope that carries it, and
// whether the Ready drain afterwards is part of the shape (a fatal that only
// happens at the next Ready is still that message's fatal).
function buildShape(shapeId, cluster) {
  const leaderStatus = cluster.status(LEADER);
  const followerStatus = cluster.status(FOLLOWER);
  const heartbeat = (to) => ({
    from: LEADER, to, msgType: MSG.HEARTBEAT,
    term: leaderStatus.term, logTerm: '0', index: '0',
    commit: leaderStatus.commit,
  });
  switch (shapeId) {
  case HOSTILE_SHAPE.MISROUTED_HEARTBEAT_WITH_GROUP_ID.id:
    return {to: FOLLOWER, envelope: {
      groupId: OTHER_GROUP_ID, to: FOLLOWER, message: heartbeat(FOLLOWER)}};
  case HOSTILE_SHAPE.MISROUTED_HEARTBEAT_WITHOUT_GROUP_ID.id:
    return {to: FOLLOWER,
      envelope: {to: FOLLOWER, message: heartbeat(FOLLOWER)}};
  case HOSTILE_SHAPE.HEARTBEAT_WITH_IMPOSSIBLE_COMMIT.id:
    return {to: FOLLOWER, envelope: {
      groupId: GROUP_ID, to: FOLLOWER,
      message: {...heartbeat(FOLLOWER), commit: IMPOSSIBLE_COMMIT}}};
  case HOSTILE_SHAPE.EMPTY_READ_INDEX_TO_LEADER.id:
    return {to: LEADER, envelope: {
      groupId: GROUP_ID, to: LEADER, message: {
        from: FOLLOWER, to: LEADER, msgType: MSG.READ_INDEX,
        term: leaderStatus.term, entries: []}}};
  case HOSTILE_SHAPE.EMPTY_READ_INDEX_TO_FOLLOWER.id:
    return {to: FOLLOWER, envelope: {
      groupId: GROUP_ID, to: FOLLOWER, message: {
        from: OTHER_FOLLOWER, to: FOLLOWER, msgType: MSG.READ_INDEX,
        term: followerStatus.term, entries: []}}};
  case HOSTILE_SHAPE.NON_CONTIGUOUS_APPEND.id: {
    // The prefix is CONTIGUOUS with the follower's own last entry, read
    // from its core, so the core cannot reject this as a prev-index
    // mismatch. The gap is between the entries the message carries.
    const persisted = cluster.core.export_persisted_state(
      cluster.peer(FOLLOWER).handle);
    const previous = BigInt(persisted.lastIndex);
    const previousTerm = persisted.entries.length > 0 ?
      persisted.entries[persisted.entries.length - 1].term :
      followerStatus.term;
    return {to: FOLLOWER, drain: true, envelope: {
      groupId: GROUP_ID, to: FOLLOWER, message: {
        from: LEADER, to: FOLLOWER, msgType: MSG.APPEND,
        term: leaderStatus.term, logTerm: previousTerm,
        index: String(previous), commit: followerStatus.commit,
        entries: [
          {term: leaderStatus.term, index: String(previous + 1n),
            entryType: ENTRY_NORMAL},
          {term: leaderStatus.term,
            index: String(previous + 1n + NON_CONTIGUOUS_GAP),
            entryType: ENTRY_NORMAL},
        ]}}};
  }
  case HOSTILE_SHAPE.APPEND_RESPONSE_BEYOND_LEADER_LOG.id:
    return {to: LEADER, drain: true, envelope: {
      groupId: GROUP_ID, to: LEADER, message: {
        from: FOLLOWER, to: LEADER, msgType: MSG.APPEND_RESPONSE,
        term: leaderStatus.term, index: BEYOND_THE_LOG, reject: false}}};
  case HOSTILE_SHAPE.TIMEOUT_NOW_FROM_UNEXPECTED_SENDER.id:
    return {to: FOLLOWER, drain: true, envelope: {
      groupId: GROUP_ID, to: FOLLOWER, message: {
        from: OTHER_FOLLOWER, to: FOLLOWER, msgType: MSG.TIMEOUT_NOW,
        term: followerStatus.term}}};
  case HOSTILE_SHAPE.TRANSFER_LEADER_FROM_UNEXPECTED_SENDER.id:
    return {to: LEADER, drain: true, envelope: {
      groupId: GROUP_ID, to: LEADER, message: {
        from: OTHER_FOLLOWER, to: LEADER, msgType: MSG.TRANSFER_LEADER,
        term: leaderStatus.term}}};
  default:
    return null;
  }
}

/**
 * A host that ADOPTS a runtime already in use, and instantiates a fresh one
 * only when it replaces it.
 *
 * The host hands out no core, so a driver that already holds one gives it to
 * the host instead of asking for it back.
 * @param {Object} core - The runtime the driver is using.
 * @return {RaftRsRuntimeHost} A host holding that runtime.
 */
function hostAdopting(core) {
  let adopted = false;
  return new RaftRsRuntimeHost({
    instantiate: () => {
      if (adopted) {
        return instantiateRaftRsCore();
      }
      adopted = true;
      return core;
    },
  });
}

function main() {
  const shapeId = process.argv[2];
  if (!Object.values(HOSTILE_SHAPE).some((shape) => shape.id === shapeId)) {
    usage();
  }
  const core = instantiateRaftRsCore();
  const host = hostAdopting(core);
  const cluster = settledCluster(core);
  const shape = buildShape(shapeId, cluster);
  const peer = cluster.peer(shape.to);
  // Who the recipient was and whether it was leading itself, so the
  // enumeration says what role the shape actually met.
  const recipient = peer.peerId;
  const recipientLead = cluster.status(recipient).lead;
  host.adoptGroup({
    groupId: GROUP_ID, peerId: peer.peerId, store: peer.store,
    handle: peer.handle,
    lifecycle: new RaftRsReplicaLifecycle({
      store: peer.store, groupId: GROUP_ID, peerId: peer.peerId}),
  });
  const verdict = admitRaftRsMessage({
    envelope: shape.envelope,
    localGroupId: GROUP_ID,
    localPeerId: peer.peerId,
  });
  if (!verdict.admitted) {
    process.stdout.write(JSON.stringify({
      shape: shapeId,
      admitted: false,
      outcome: verdict.outcome,
      recipient,
      recipientLead,
      reachedStep: false,
      trapped: false,
      runtimeUnhealthy: host.health !== RAFT_RS_RUNTIME_HEALTH.HEALTHY,
      diagnosis: null,
    }, null, JSON_INDENT));
    return;
  }
  const ran = host.enter(GROUP_ID, RAFT_RS_CORE_ENTRY.ACTIVE,
    (guardedCore, handle) => {
      guardedCore.step(handle, shape.envelope.message);
      if (shape.drain) {
        cluster.settle(() => false, {rounds: 4, ticking: false});
      }
    });
  process.stdout.write(JSON.stringify({
    shape: shapeId,
    admitted: true,
    outcome: RAFT_RS_INGRESS_OUTCOME.ADMITTED,
    recipient,
    recipientLead,
    reachedStep: true,
    trapped: ran.outcome === RAFT_RS_CALL_OUTCOME.TRAPPED,
    runtimeUnhealthy: host.health !== RAFT_RS_RUNTIME_HEALTH.HEALTHY,
    diagnosis: ran.diagnosis ?? null,
    error: ran.error ?? null,
  }, null, JSON_INDENT));
}

main();

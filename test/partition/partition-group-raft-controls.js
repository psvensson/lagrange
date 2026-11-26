// Raft-level controls over a group formed by formAdmittedGroup, shared by the
// fixtures that drive a real three-replica rs-raft group into a chosen
// leadership state (the owner-fact read group, the topology-guard SERVICES
// world): a loopback transport that can hold back chosen raft messages and
// let them flow again, the group's write path opened the way the participant
// release owner opens it, a raft write through the leader, a named leadership
// transfer, and a fresh leader that holds, unapplied, an entry its
// predecessor committed.
import assert from 'node:assert/strict';

import {isReleaseDrained, releaseIdentityOf} from
  '../../src/partition/partition-participant-release-contract.js';
import {PARTICIPANT_CUTOVER_OUTCOME} from
  '../../src/partition/partition-participant-transaction-cutover-constants.js';
import {
  participantCutoverPauseOf,
  readParticipantReleaseFacts,
  resumeParticipantCutoverAdmission,
} from '../../src/partition/partition-participant-transaction-pause.js';
import {enableParticipantTransactionAdmission} from
  '../../src/partition/partition-participant-transaction-request.js';
import {RAFT_ROLE} from '../../src/raft/constants.js';
import {RAFT_LEADERSHIP_TRANSFER_SUCCESSOR, RAFT_OPERATION_OUTCOME} from
  '../../src/raft/raft-operation-port-constants.js';
import {RAFT_RS_MESSAGE_TYPE} from '../../src/raft/raft-rs-ingress-constants.js';
import {turnChainValue} from '../../src/raft/raft-rs-turn-answer.js';
import {buildDeliveryEnvelope} from '../../src/transport/transport-semantic-outcome.js';
import {createLoopbackTransport} from './partition-service-test-support.js';

// The raft messages that tell a follower how far the leader committed.
const COMMIT_CARRYING = new Set([RAFT_RS_MESSAGE_TYPE.APPEND, RAFT_RS_MESSAGE_TYPE.HEARTBEAT]);
const NO_HOLD = () => false;

/**
 * A loopback raft transport whose deliveries a test can hold back (answered
 * "no handler", as an unreachable peer is) and later let flow again.
 * @return {Object} {network, hold(predicate), release()}.
 */
function createHeldRaftNetwork() {
  const network = createLoopbackTransport();
  const deliver = network.deliver.bind(network);
  let holds = NO_HOLD;
  let pends = NO_HOLD;
  let onPending = null;
  const pending = [];
  const delivered = [];
  network.deliver = async (address, payload, options) => {
    if (holds(address, payload)) {
      return buildDeliveryEnvelope({acknowledged: false, noHandler: true});
    }
    if (pends(address, payload)) {
      const released = Promise.withResolvers();
      pending.push(released);
      onPending?.();
      await released.promise;
    }
    delivered.push({to: String(payload?.to), message: payload?.message ?? {}});
    return deliver(address, payload, options);
  };
  const releasePending = () => {
    pends = NO_HOLD;
    onPending = null;
    for (const released of pending.splice(0)) released.resolve();
  };
  return {
    network,
    hold(predicate) {
      const previous = holds;
      holds = (address, payload) => previous(address, payload) || predicate(address, payload);
    },
    // Matching sends are delivered only when released (held, not dropped):
    // the sender's core turn stays pending at that peer send meanwhile.
    holdPending(predicate) {
      const entered = Promise.withResolvers();
      pends = predicate;
      onPending = () => entered.resolve();
      return {entered: entered.promise, held: () => pending.length, release: releasePending};
    },
    releasePending,
    release() {
      holds = NO_HOLD;
      releasePending();
    },
    // How many raft messages reached `peer` that `predicate` accepts.
    deliveredTo: (peer, predicate) =>
      delivered.filter(({to, message}) => to === peer && predicate(message)).length,
  };
}

// The handler a member's release facts are read through (the hosted-service
// identity the release owner checks).
function releaseHandlerOf(service) {
  return {nodeId: service.nodeId, ownerIncarnation: 1,
    localServices: new Map([[service.replicaId, service]])};
}

function hasAppliedItsCommit(service) {
  const status = service.raft.readStatus();
  return Number.isSafeInteger(status.commitIndex) &&
    status.commitIndex === status.appliedIndex;
}

function peerOf(service) {
  return String(service.raft.readStatus().peerId);
}

/**
 * Open the group's write path as the participant release owner opens it:
 * the generation origin committed, then one release resumed on the leader
 * over the census of every member.
 * @param {Object} group - formAdmittedGroup's group.
 * @param {Object} leader - The leading PartitionService.
 */
async function openGroupWriteAdmission(group, leader) {
  if (participantCutoverPauseOf(leader) === null) return;
  const enabled = await enableParticipantTransactionAdmission(leader);
  assert.equal(enabled?.success, true,
    `setup: the leader committed the participant origin (${JSON.stringify(enabled)})`);
  let census = [];
  const leaderIndex = group.services.indexOf(leader);
  assert.equal(await group.waitFor(async () => {
    census = await Promise.all(group.services.map((service) =>
      readParticipantReleaseFacts(releaseHandlerOf(service), service)));
    const leaderAppliedIndex = census[leaderIndex]?.work?.appliedIndex;
    return Number.isSafeInteger(leaderAppliedIndex) &&
      census.every((facts) =>
        facts.outcome === PARTICIPANT_CUTOVER_OUTCOME.OBSERVED &&
        facts.origin !== null && facts.leaderReplicaId === leader.replicaId &&
        isReleaseDrained(facts.work) &&
        facts.work.appliedIndex === leaderAppliedIndex);
  }), true, 'setup: every member observes the origin and the leader');
  const local = census[group.services.indexOf(leader)];
  const release = releaseIdentityOf({partitionId: leader.partitionId,
    targetBuildDigest: local.buildDigest,
    configurationKey: local.membership.configurationKey,
    membershipGenerationIndex: local.membership.membershipGenerationIndex});
  const outcome = await resumeParticipantCutoverAdmission(releaseHandlerOf(leader), leader,
    {release, census});
  assert.equal(outcome, PARTICIPANT_CUTOVER_OUTCOME.RESUMED,
    `setup: the leader's write path opened (${JSON.stringify(outcome)})`);
}

/**
 * One raft write through the leader.
 * @param {Object} group - formAdmittedGroup's group.
 * @param {Object} leader - The leading PartitionService.
 * @param {Object} write - {sql, params, entryId}.
 * @return {Promise<number>} The applied index the leader reached.
 */
async function writeThroughLeader(group, leader, {sql, params, entryId}) {
  await openGroupWriteAdmission(group, leader);
  const written = await leader.executeQuery(sql, params, {entryId});
  assert.equal(written?.success, true,
    `setup: the leader committed the write (${JSON.stringify(written)})`);
  return leader.raft.readStatus().appliedIndex;
}

async function requestGroupLeadershipTransfer(from, to) {
  const requested = await turnChainValue(from.requestLeadershipTransfer({
    successor: RAFT_LEADERSHIP_TRANSFER_SUCCESSOR.NAMED, replicaIdentity: to.replicaId,
  }));
  assert.equal(requested.outcome, RAFT_OPERATION_OUTCOME.CORE_OK,
    `setup: the transfer was accepted (${JSON.stringify(requested)})`);
}

/**
 * Move actual raft leadership to a named replica and wait until the new
 * leader has applied its commit.
 * @param {Object} group - formAdmittedGroup's group.
 * @param {Object} from - The leading PartitionService.
 * @param {Object} to - The successor.
 */
async function transferGroupLeadership(group, from, to) {
  await requestGroupLeadershipTransfer(from, to);
  assert.equal(await group.waitFor(() =>
    from.raft.readStatus().role === RAFT_ROLE.FOLLOWER &&
    to.raft.readStatus().role === RAFT_ROLE.LEADER &&
    to.role === RAFT_ROLE.LEADER && hasAppliedItsCommit(to)), true,
  'setup: actual Raft leadership transferred and the new leader applied its commit');
}

/**
 * Wait until a leader has applied its election log and everything it
 * committed.
 * @param {Object} group - formAdmittedGroup's group.
 * @param {Object} service - The leader.
 */
async function settleGroupLeader(group, service) {
  assert.equal(await group.waitFor(() => {
    const status = service.raft.readStatus();
    return status.role === RAFT_ROLE.LEADER && service.role === RAFT_ROLE.LEADER &&
      status.confChangePending === false && hasAppliedItsCommit(service);
  }), true, 'setup: the leader has applied its election log and everything it committed');
}

async function awaitKnownLeader(group, service, leader) {
  assert.equal(await group.waitFor(() =>
    service.raft.readStatus().leaderId === leader.replicaId), true,
  `setup: ${service.replicaId} knows ${leader.replicaId} leads`);
}

/**
 * Make `to` a leader that holds, unapplied, an entry `from` committed, and
 * that cannot commit an entry of its own term: `to` receives the entry but
 * no message telling it the entry committed, and, once it leads, none of its
 * appends leave it. Heartbeats still flow, so it keeps its quorum contact
 * and stays leader. raft.release() lets everything flow again.
 * @param {Object} group - formAdmittedGroup's group.
 * @param {Object} raft - createHeldRaftNetwork() the group was formed on.
 * @param {Object} roles - {from, to, write}: write() commits the entry
 *   through `from` and answers the applied index it reached.
 * @return {Promise<Object>} {committedIndex}: the entry's log index.
 */
async function freshLeaderBehindCommit(group, raft, {from, to, write}) {
  const fromPeer = peerOf(from);
  const toPeer = peerOf(to);
  await openGroupWriteAdmission(group, from);
  const committedIndex = from.raft.readStatus().lastIndex + 1;
  raft.hold((_address, packet) => String(packet?.from) === fromPeer &&
    String(packet?.to) === toPeer && COMMIT_CARRYING.has(packet?.message?.msgType) &&
    Number(packet.message.commit) >= committedIndex);
  assert.equal(await write() >= committedIndex, true,
    'setup: the entry committed at the expected index');
  assert.equal(await group.waitFor(() => {
    const status = to.raft.readStatus();
    return status.lastIndex >= committedIndex && status.commitIndex < committedIndex;
  }), true, 'setup: the follower holds the entry and does not know it committed');
  raft.hold((_address, packet) => String(packet?.from) === toPeer &&
    packet?.message?.msgType === RAFT_RS_MESSAGE_TYPE.APPEND);
  await transferGroupLeadership(group, from, to);
  const status = to.raft.readStatus();
  assert.equal(status.confChangePending, true,
    'setup: the new leader has not applied the log it held when elected');
  assert.equal(status.commitIndex < committedIndex, true,
    'setup: the new leader has not applied the entry its predecessor committed');
  return {committedIndex};
}

// Hold every raft message to or from a replica (nothing waits: a leader cut
// off this way still believes it leads until check_quorum steps it down).
function cutOffFromConsensus(raft, service) {
  const peer = peerOf(service);
  raft.hold((_address, packet) =>
    String(packet?.from) === peer || String(packet?.to) === peer);
}

// Cut a replica off from all consensus traffic until it names no leader.
async function isolateFromConsensus(group, raft, service) {
  cutOffFromConsensus(raft, service);
  assert.equal(await group.waitFor(() =>
    service.raft.readStatus().leaderId === null), true,
  'setup: the isolated replica knows no leader');
}

export {
  COMMIT_CARRYING,
  awaitKnownLeader,
  createHeldRaftNetwork,
  cutOffFromConsensus,
  freshLeaderBehindCommit,
  isolateFromConsensus,
  openGroupWriteAdmission,
  peerOf,
  requestGroupLeadershipTransfer,
  settleGroupLeader,
  transferGroupLeadership,
  writeThroughLeader,
};

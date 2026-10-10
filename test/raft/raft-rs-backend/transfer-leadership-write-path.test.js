// The write path while a leadership transfer runs, on real rs-raft partition
// ports (quest F1, raft-rs full cutover).
//
// raft-rs's leader drops every proposal - an entry or a configuration change
// - while a transfer it accepted is in progress (raft.rs step_leader,
// MsgPropose: `lead_transferee.is_some()` returns ProposalDropped), and the
// transfer aborts when the leader's election clock has run one election
// timeout since it accepted it. That window is bounded, so the port answers a
// dropped proposal there as a named retryable outcome that leaves the group
// usable - never as the terminal refusal it answers for a proposal no leader
// can take. Only a leader that is still a voter drops for that reason; a
// replica that knows no leader drops too, and that stays a refusal.
//
// Every expectation is the core's: the transfer is started once through the
// port's own operation and once as the MsgTransferLeader a peer delivers (the
// message type read from the binding's own num_to_msg_type match arm), the
// election timeout is the tuning owner's derivation of the partition's own
// timing, and the transferee is cut off so the transfer can only abort.

import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import {test} from 'node:test';
import {fileURLToPath} from 'node:url';

import * as portConstants from
  '../../../src/raft/raft-operation-port-constants.js';
import {RAFT_OPERATION_PORT_REQUEST} from
  '../../../src/raft/raft-operation-port-request.js';
import {RAFT_RS_TRANSPORT_PROTOCOL} from
  '../../../src/raft/raft-rs-ingress-constants.js';
import {tuningOf} from '../../../src/raft/raft-rs-runtime-tuning.js';
import {PartitionNodeCluster} from './partition-node-cluster.js';

const {RAFT_OPERATION_OUTCOME} = portConstants;
const ROOT = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)), '..', '..', '..');
const BINDING_SOURCE = path.join(
  ROOT, 'vendor', 'raft-rs-wasm', 'src', 'lib.rs');
const REPLICAS = Object.freeze(['transfer-r1', 'transfer-r2', 'transfer-r3']);
const [LEADER, FOLLOWER, TRANSFEREE] = REPLICAS;

// The number the binding decodes as MsgTransferLeader, from its own source.
function transferLeaderMessageType() {
  const source = fs.readFileSync(BINDING_SOURCE, 'utf8');
  const match = /(\d+)\s*=>\s*MsgTransferLeader\b/u.exec(source);
  assert.ok(match, 'the binding maps a number to MsgTransferLeader');
  return Number(match[1]);
}

function electionTickOf(cluster) {
  return tuningOf(cluster.replica(LEADER)
    .request[RAFT_OPERATION_PORT_REQUEST.TIMING]).electionTick;
}

function formedCluster(partitionId) {
  const cluster = new PartitionNodeCluster({partitionId,
    replicaIds: REPLICAS});
  const elected = cluster.settle(() => cluster.leaderReplicaId() === LEADER);
  assert.equal(elected, true, 'setup: the ticking replica leads');
  cluster.propose(LEADER, {setup: 'first-write'});
  assert.equal(cluster.settle(() => REPLICAS.every((replicaId) =>
    cluster.replica(replicaId).appliedCommands.length === 1)), true,
  'setup: a write commits on every replica');
  return cluster;
}

function transferInProgress(answer) {
  return answer?.outcome === RAFT_OPERATION_OUTCOME.HOST_FAILURE &&
    answer.reason ===
      portConstants.RAFT_LEADERSHIP_TRANSFER_REASON?.TRANSFER_IN_PROGRESS &&
    answer.retryable === true && answer.recoveryRequired === false;
}

// A configuration change in the core's own ConfChangeV2 shape: a learner
// that is never reserved (it is only ever dropped or ignored here).
const LEARNER_CHANGE = Object.freeze({
  transition: 0,
  changes: [Object.freeze({changeType: 2, nodeId: '424242'})],
});

// Once the transfer is running (the transferee cut off): every proposal and
// configuration change on the leader answers the retryable outcome and
// changes neither leader nor term; after exactly one election timeout of the
// leader's own ticks the transfer has aborted and the leader takes writes.
async function assertBoundedRetryableWindow(cluster, label) {
  const before = cluster.coreStatus(LEADER);
  const electionTick = electionTickOf(cluster);
  const port = cluster.node(LEADER);
  for (let tick = 0; tick < electionTick - 1; tick += 1) {
    const write = await port.propose({during: `${label}-${tick}`});
    assert.equal(transferInProgress(write), true,
      `${label}: a proposal during the transfer (tick ${tick}) is the ` +
      `named retryable outcome, got ${JSON.stringify(write)}`);
    await port.tick();
  }
  assert.equal(transferInProgress(await port.proposeConfChange(
    LEARNER_CHANGE)), true,
  `${label}: a configuration change during the transfer is retryable too`);
  assert.equal(cluster.coreStatus(LEADER).lead, before.lead,
    `${label}: the leader is unchanged while the transfer runs`);
  assert.equal(cluster.coreStatus(LEADER).term, before.term,
    `${label}: the term is unchanged while the transfer runs`);
  await port.tick();
  const after = await port.propose({after: label});
  assert.equal(after.outcome, RAFT_OPERATION_OUTCOME.CORE_OK,
    `${label}: one election timeout later the aborted transfer leaves the ` +
    `leader fit to take writes (${JSON.stringify(after)})`);
  assert.equal(cluster.leaderReplicaId() === LEADER ||
    cluster.coreStatus(LEADER).lead === before.lead, true,
  `${label}: the leader stays in place`);
  assert.equal(cluster.settle(() =>
    cluster.replica(FOLLOWER).appliedCommands.some((command) =>
      command?.after === label)), true,
  `${label}: the write proposed after the abort commits`);
}

test('a proposal the leader drops during a peer-delivered transfer is the ' +
  'named retryable outcome, bounded by one election timeout', async () => {
  const cluster = formedCluster('transfer-write-path-peer-delivered');
  try {
    cluster.isolate(TRANSFEREE);
    const leaderId = cluster.raftPeerIdOf(LEADER);
    const transfereeId = cluster.raftPeerIdOf(TRANSFEREE);
    // The shape raft-rs's own sender writes: a follower forwarding a
    // transfer request to its leader stamps it with its term (raft.rs
    // send(): every message but MsgPropose, MsgReadIndex and the vote family
    // gets m.term = self.term); the ingress refuses a term-less one.
    const delivered = cluster.node(LEADER).step({
      protocol: RAFT_RS_TRANSPORT_PROTOCOL,
      groupId: cluster.partitionId,
      from: transfereeId,
      to: leaderId,
      message: {msgType: transferLeaderMessageType(), from: transfereeId,
        to: leaderId, term: String(cluster.coreStatus(TRANSFEREE).term)},
    });
    assert.equal(delivered.outcome, RAFT_OPERATION_OUTCOME.CORE_OK,
      'setup: the leader admits the transfer request a peer delivered');
    await assertBoundedRetryableWindow(cluster, 'peer-delivered');
  } finally {
    cluster.dispose();
  }
});

test('a proposal the leader drops during a transfer it was asked for ' +
  'through the port is the named retryable outcome', async () => {
  const cluster = formedCluster('transfer-write-path-port-requested');
  try {
    cluster.isolate(TRANSFEREE);
    const accepted = await cluster.node(LEADER).transferLeadership({
      successor: portConstants.RAFT_LEADERSHIP_TRANSFER_SUCCESSOR?.NAMED,
      replicaIdentity: TRANSFEREE,
    });
    assert.equal(accepted.outcome, RAFT_OPERATION_OUTCOME.CORE_OK,
      `setup: the leader accepts the transfer (${JSON.stringify(accepted)})`);
    await assertBoundedRetryableWindow(cluster, 'port-requested');
  } finally {
    cluster.dispose();
  }
});

test('a replica that knows no leader still refuses a proposal terminally',
  async () => {
    const cluster = new PartitionNodeCluster({
      partitionId: 'transfer-write-path-no-leader', replicaIds: REPLICAS});
    try {
      const refused = await cluster.node(FOLLOWER).propose({orphan: true});
      assert.equal(refused.outcome, RAFT_OPERATION_OUTCOME.CORE_REFUSED,
        'a follower with no leader drops the proposal as the core refused it');
      assert.equal(refused.retryable, false,
        'only a leader that is still a voter drops for a running transfer');
    } finally {
      cluster.dispose();
    }
  });

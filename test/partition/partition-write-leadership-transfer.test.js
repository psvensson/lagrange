// What a partition's consumers of a proposal answer while its leader runs a
// leadership transfer (quest F1, raft-rs full cutover: the write path ships
// with the operation).
//
// raft-rs's leader drops every proposal while a transfer it accepted is in
// progress, and aborts the transfer one election timeout after accepting it
// when the transferee never takes over. The port names that window as a
// retryable outcome; each consumer must treat it as the transient state it
// is: a partition write is retried on the replica's own clock and served
// once the leader takes writes again (never answered as a consensus
// refusal), and a membership admission is DEFERRED (never REFUSED).
//
// Real PartitionServices on rs-raft, formed the way production forms a group.
// The transfer is started as the MsgTransferLeader a peer delivers (the
// message type read from the binding's own num_to_msg_type match arm), to a
// voter cut off from the group so that it can only abort.

import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import {test} from 'node:test';
import {fileURLToPath} from 'node:url';

import {formAdmittedGroup} from './partition-admitted-group-fixture.js';
import {ConfigurationManager} from
  '../../src/config/configuration-manager.js';
import {LoggingService} from '../../src/logging/logging-service.js';
import {
  PARTITION_SERVICE_DEFAULT,
  PARTITION_SERVICE_OPERATION,
} from '../../src/partition/partition-service-constants.js';
import {
  admitPartitionRaftPeer,
  reservePartitionRaftPeerIdentity,
} from '../../src/partition/partition-service-raft-membership-administration.js';
import * as partitionWriteKernel from
  '../../src/partition/partition-write-kernel.js';
import {RAFT_ROLE} from '../../src/raft/constants.js';
import {
  RAFT_MEMBERSHIP_ADMISSION_OUTCOME,
  RAFT_OPERATION_OUTCOME,
} from '../../src/raft/raft-operation-port-constants.js';
import {RAFT_RS_TRANSPORT_PROTOCOL} from
  '../../src/raft/raft-rs-ingress-constants.js';
import {recoveryRetryWindowMsOf} from
  '../../src/raft/raft-rs-runtime-tuning.js';

const ROOT = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)), '..', '..');
const BINDING_SOURCE = path.join(
  ROOT, 'vendor', 'raft-rs-wasm', 'src', 'lib.rs');
const TEMP_PREFIX = 'partition-write-leadership-transfer-';
const TABLE_NAME = 'transfer_write_rows';
const INSERT_SQL = `INSERT INTO ${TABLE_NAME} (id, value) VALUES (?, ?)`;
const TEST_TIMEOUT_MS = 60000;
const GROUP_BUDGET_MS = 10000;
// The group's timing (the configuration's own raft section).
const GROUP_TIMING = Object.freeze({
  heartbeatIntervalMs: 20,
  electionTimeoutMinMs: 150,
  electionTimeoutMaxMs: 300,
});
const REFUSAL = partitionWriteKernel.PARTITION_WRITE_LEADERSHIP_REFUSAL;

function transferLeaderMessageType() {
  const match = /(\d+)\s*=>\s*MsgTransferLeader\b/u.exec(
    fs.readFileSync(BINDING_SOURCE, 'utf8'));
  assert.ok(match, 'the binding maps a number to MsgTransferLeader');
  return Number(match[1]);
}

function tableOptions() {
  return {
    tableId: TABLE_NAME,
    tableName: TABLE_NAME,
    schema: {columns: [
      {name: 'id', type: 'TEXT', primaryKey: true},
      {name: 'value', type: 'TEXT'},
    ]},
  };
}

function insert(service, id, entryId) {
  return service.applyWrite({
    type: PARTITION_SERVICE_OPERATION.INSERT,
    sql: INSERT_SQL,
    params: [id, entryId],
    entryId,
  });
}

// A group whose leader runs a transfer to a voter that is cut off: the
// transferee's scheduling is stopped and nothing is delivered to it, so the
// transfer can only abort, one election timeout after the leader accepted it.
async function withTransferRunning(partitionId, body) {
  ConfigurationManager.resetInstance();
  LoggingService.resetInstance();
  ConfigurationManager.getInstance().initialize({
    node: {id: 'transfer-write-node'}, raft: GROUP_TIMING});
  LoggingService.getInstance().initialize({level: 'fatal'});
  const members = [1, 2, 3].map((ordinal) =>
    [`${partitionId}-r${ordinal}`, `node-${ordinal}`]);
  const group = await formAdmittedGroup({partitionId, members,
    tempPrefix: TEMP_PREFIX, serviceOptions: tableOptions(),
    budgetMs: GROUP_BUDGET_MS});
  const [leader, , transferee] = group.services;
  const network = leader.transport;
  const deliver = network.deliver;
  const transfereeAddress = group.addressOf(members[2]);
  network.deliver = (address, ...rest) => (address === transfereeAddress ?
    Promise.resolve({acknowledged: true}) :
    deliver.call(network, address, ...rest));
  try {
    assert.equal((await insert(leader, 'row-0', 'setup')).success, true,
      'setup: the group serves a write');
    transferee.raft.stopScheduling();
    const status = leader.raft.readStatus();
    const transfereeId = status.peers.find((peer) =>
      peer.replicaIdentity === transferee.replicaId).peerId;
    const delivered = leader.raft.step({
      protocol: RAFT_RS_TRANSPORT_PROTOCOL,
      groupId: partitionId,
      from: transfereeId,
      to: status.peerId,
      // The shape raft-rs's own sender writes: a forwarded transfer request
      // carries the forwarding follower's term (raft.rs send()); the
      // ingress refuses a term-less one.
      message: {msgType: transferLeaderMessageType(), from: transfereeId,
        to: status.peerId, term: String(status.term)},
    });
    assert.equal(delivered?.outcome, RAFT_OPERATION_OUTCOME.CORE_OK,
      'setup: the leader admits the transfer request a peer delivered ' +
      `(${JSON.stringify(delivered)})`);
    await body({leader, status});
  } finally {
    network.deliver = deliver;
    await group.dispose();
    ConfigurationManager.resetInstance();
    LoggingService.resetInstance();
  }
}

test('a partition write during a leadership transfer is retried and ' +
  'served once the leader takes writes again, never refused',
{timeout: TEST_TIMEOUT_MS}, async () => {
  await withTransferRunning('transfer-write', async ({leader, status}) => {
    const window = recoveryRetryWindowMsOf(leader.raftTimingConfig);
    assert.ok(window <
      PARTITION_SERVICE_DEFAULT.USER_TRANSACTION_WRITE_DEFER_BUDGET_MS,
    'setup: the transfer window fits the write deferral budget');
    const answer = await insert(leader, 'row-during', 'during-transfer');
    assert.notEqual(answer.failureCode, REFUSAL?.CONSENSUS_REFUSED,
      `the write is not refused by consensus (${JSON.stringify(answer)})`);
    assert.equal(answer.success, true,
      'the write is served once the aborted transfer leaves the leader ' +
      `fit (${JSON.stringify(answer)})`);
    const after = leader.raft.readStatus();
    assert.equal(after.role, RAFT_ROLE.LEADER, 'the leader stays in place');
    assert.equal(after.term, status.term, 'no term moved');
  });
});

test('a membership admission during a leadership transfer is DEFERRED, ' +
  'never REFUSED', {timeout: TEST_TIMEOUT_MS}, async () => {
  await withTransferRunning('transfer-admission', async ({leader}) => {
    const joining = 'transfer-admission-joiner';
    reservePartitionRaftPeerIdentity(leader, joining);
    const admission = admitPartitionRaftPeer(leader, {
      replicaIdentity: joining, peerAddress: `node-9/partition/${joining}`});
    const settled = admission.settled ? await admission.settled : admission;
    assert.equal(settled.outcome, RAFT_MEMBERSHIP_ADMISSION_OUTCOME.DEFERRED,
      `the admission waits out the transfer (${JSON.stringify(settled)})`);
  });
});

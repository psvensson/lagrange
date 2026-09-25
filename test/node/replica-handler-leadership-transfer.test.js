// STEP_DOWN_REPLICA on real partitions on rs-raft (quest F1, raft-rs full
// cutover, witness W4).
//
// The REPLACE workflow asks a node to hand a partition's leadership on: the
// replacement replica to take it (REPLACE_TARGET_LEADER_ELECTION), the source
// replica to give it up (REPLACE_SOURCE_LEADER_HANDOFF). On rs-raft both are
// one leadership transfer the core carries out itself (its own
// MsgTransferLeader: the leader catches the transferee up and sends it
// MsgTimeoutNow, and the transferee campaigns at once in the next term). So
// the handler's answer is acceptance, and what the core then reports is the
// proof: the replica asked to lead leads within one election timeout, in a
// later term, and its old leader follows it; the source asked to give it up
// no longer leads, and another voter does; a replacement that already leads
// is a named no-op that moves no term.
//
// Real ReplicaHandler, real PartitionServices (their own databases, one
// loopback transport), the real rs-raft port. The election timeout is the
// tuning owner's derivation of the partition's own timing; the handoff reasons
// and response vocabulary are the owners'.

import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {test} from 'node:test';

import {formAdmittedGroup} from '../partition/partition-admitted-group-fixture.js';
import {SystemTableCache} from '../../src/cache/system-table-cache.js';
import {ConfigurationManager} from
  '../../src/config/configuration-manager.js';
import {LoggingService} from '../../src/logging/logging-service.js';
import {ReplicaHandler} from '../../src/node/replica-handler.js';
import * as handoffMethods from
  '../../src/node/replica-handler-leader-handoff-methods.js';
import {RAFT_ROLE} from '../../src/raft/constants.js';
import * as portConstants from
  '../../src/raft/raft-operation-port-constants.js';
import {recoveryRetryWindowMsOf} from
  '../../src/raft/raft-rs-runtime-tuning.js';
import {
  ReplicaOperationField,
  ReplicaOperationReason,
  ReplicaOperationResponseStatus,
} from '../../src/rebalancer/replica-operation-constants.js';

const TEMP_PREFIX = 'replica-handler-leadership-transfer-';
const TEST_TIMEOUT_MS = 60000;
const GROUP_BUDGET_MS = 10000;
const POLL_MS = 5;
// The group's timing (the configuration's own raft section).
const GROUP_TIMING = Object.freeze({
  heartbeatIntervalMs: 20,
  electionTimeoutMinMs: 150,
  electionTimeoutMaxMs: 300,
});
const BRANCH = handoffMethods.REPLICA_HANDLER_LEADER_HANDOFF_BRANCH;

function quietEnvironment() {
  ConfigurationManager.resetInstance();
  LoggingService.resetInstance();
  ConfigurationManager.getInstance().initialize({
    node: {id: 'leadership-transfer-node'}, raft: GROUP_TIMING});
  LoggingService.getInstance().initialize({level: 'fatal'});
}

function tableOptions() {
  return {
    tableId: 'transfer_rows',
    tableName: 'transfer_rows',
    schema: {columns: [
      {name: 'id', type: 'TEXT', primaryKey: true},
      {name: 'value', type: 'TEXT'},
    ]},
  };
}

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

// The handler every replica of the group is tracked on: STEP_DOWN_REPLICA
// finds a replica by its id, as a node's handler finds its own.
function trackingHandler(services, dataDir) {
  const handler = new ReplicaHandler({
    nodeId: 'leadership-transfer-node',
    dataDir,
    systemTableCache: new SystemTableCache(),
    cdcIntegrationService: {},
    createPartitionService: async () => {
      throw new Error('this handler creates no replica');
    },
  });
  for (const service of services) {
    handler.localServices.set(service.replicaId, service);
  }
  return handler;
}

function stepDown(handler, partitionId, replicaId, reason) {
  return handler.handleStepDownReplica({
    [ReplicaOperationField.OPERATION_ID]: `step-down-${replicaId}`,
    [ReplicaOperationField.PARTITION_ID]: partitionId,
    [ReplicaOperationField.REPLICA_ID]: replicaId,
    [ReplicaOperationField.REASON]: reason,
  });
}

// Poll the core's own status until `predicate` holds; the elapsed time.
async function elapsedUntil(predicate, budgetMs) {
  const startedAt = Date.now();
  while (Date.now() - startedAt <= budgetMs) {
    if (predicate()) {
      return Date.now() - startedAt;
    }
    await sleep(POLL_MS);
  }
  return predicate() ? Date.now() - startedAt : null;
}

function leaderOf(services) {
  return services.find((service) =>
    service.raft.readStatus().role === RAFT_ROLE.LEADER) ?? null;
}

async function withGroup(partitionId, body) {
  quietEnvironment();
  const dataDir = fs.mkdtempSync(path.join(os.tmpdir(), TEMP_PREFIX));
  const members = [1, 2, 3].map((ordinal) =>
    [`${partitionId}-r${ordinal}`, `node-${ordinal}`]);
  const group = await formAdmittedGroup({partitionId, members,
    tempPrefix: TEMP_PREFIX, serviceOptions: tableOptions(),
    budgetMs: GROUP_BUDGET_MS});
  try {
    await body({services: group.services,
      handler: trackingHandler(group.services, dataDir)});
  } finally {
    await group.dispose();
    fs.rmSync(dataDir, {recursive: true, force: true});
    ConfigurationManager.resetInstance();
    LoggingService.resetInstance();
  }
}

test('W4 target: STEP_DOWN_REPLICA asking a follower replacement to lead ' +
  'moves leadership to it within one election timeout',
{timeout: TEST_TIMEOUT_MS}, async () => {
  const partitionId = 'w4-target';
  await withGroup(partitionId, async ({services, handler}) => {
    const oldLeader = leaderOf(services);
    assert.ok(oldLeader, 'setup: the group has a leader');
    const target = services.find((service) => service !== oldLeader);
    const before = target.raft.readStatus();
    assert.equal(before.role, RAFT_ROLE.FOLLOWER,
      'setup: the replacement follows');
    // The leader holds the transfer; its election timeout bounds it.
    const window = recoveryRetryWindowMsOf(oldLeader.raftTimingConfig);
    const response = await stepDown(handler, partitionId, target.replicaId,
      ReplicaOperationReason.REPLACE_TARGET_LEADER_ELECTION);
    assert.equal(response.status, ReplicaOperationResponseStatus.COMPLETED,
      `the handoff is accepted (${JSON.stringify(response)})`);
    assert.equal(response.handoffBranch, BRANCH?.TRANSFER_FORWARDED,
      'a follower that knows its leader forwards the transfer');
    const elapsed = await elapsedUntil(() => {
      const status = target.raft.readStatus();
      return status.role === RAFT_ROLE.LEADER &&
        oldLeader.raft.readStatus().leaderId === target.replicaId;
    }, window);
    assert.notEqual(elapsed, null,
      'the replacement leads, and its old leader follows it, within one ' +
      `election timeout (${window} ms)`);
    assert.ok(target.raft.readStatus().term > before.term,
      'leadership moved in a later term');
    assert.equal(oldLeader.raft.readStatus().role, RAFT_ROLE.FOLLOWER,
      'the old leader holds no leadership');
  });
});

test('W4 source: STEP_DOWN_REPLICA asking the leader to hand off moves ' +
  'leadership to another voter within one election timeout',
{timeout: TEST_TIMEOUT_MS}, async () => {
  const partitionId = 'w4-source';
  await withGroup(partitionId, async ({services, handler}) => {
    const source = leaderOf(services);
    assert.ok(source, 'setup: the group has a leader');
    const before = source.raft.readStatus();
    const window = recoveryRetryWindowMsOf(source.raftTimingConfig);
    const response = await stepDown(handler, partitionId, source.replicaId,
      ReplicaOperationReason.REPLACE_SOURCE_LEADER_HANDOFF);
    assert.equal(response.status, ReplicaOperationResponseStatus.COMPLETED,
      `the handoff is accepted (${JSON.stringify(response)})`);
    assert.equal(response.handoffBranch, BRANCH?.TRANSFER_REQUESTED,
      'the leader requested the transfer');
    let successor = null;
    const elapsed = await elapsedUntil(() => {
      successor = leaderOf(services);
      return successor !== null && successor !== source &&
        source.raft.readStatus().leaderId === successor.replicaId;
    }, window);
    assert.notEqual(elapsed, null,
      'another voter leads and the source follows it within one election ' +
      `timeout (${window} ms)`);
    assert.equal(source.raft.readStatus().role, RAFT_ROLE.FOLLOWER,
      'the source holds no leadership');
    assert.ok(successor.raft.readStatus().term > before.term,
      'leadership moved in a later term');
  });
});

test('W4 already-leader: a replacement that already leads is a named ' +
  'no-op that moves no term', {timeout: TEST_TIMEOUT_MS}, async () => {
  const partitionId = 'w4-already-leader';
  await withGroup(partitionId, async ({services, handler}) => {
    const leader = leaderOf(services);
    assert.ok(leader, 'setup: the group has a leader');
    const before = leader.raft.readStatus();
    const window = recoveryRetryWindowMsOf(leader.raftTimingConfig);
    const response = await stepDown(handler, partitionId, leader.replicaId,
      ReplicaOperationReason.REPLACE_TARGET_LEADER_ELECTION);
    assert.equal(response.status, ReplicaOperationResponseStatus.COMPLETED);
    assert.equal(response.handoffBranch, BRANCH?.TARGET_ELECTION_ROLE_NO_OP,
      'the no-op is named');
    const named = await leader.requestLeadershipTransfer({
      successor: portConstants.RAFT_LEADERSHIP_TRANSFER_SUCCESSOR?.NAMED,
      replicaIdentity: leader.replicaId,
    });
    assert.equal(named.outcome,
      portConstants.RAFT_OPERATION_OUTCOME.CORE_OK);
    assert.equal(named.reason,
      portConstants.RAFT_LEADERSHIP_TRANSFER_REASON?.ALREADY_LEADER,
      'the partition authority answers a transfer to the leader itself as ' +
      'already achieved');
    await sleep(window);
    const after = leader.raft.readStatus();
    assert.equal(after.role, RAFT_ROLE.LEADER, 'it still leads');
    assert.equal(after.term, before.term, 'no term moved');
  });
});

// Fresh identity for MESSAGE-GROUP replicas created outside the seed (F1,
// verifier I3(ii); an epic closing condition by owner ruling). A joiner's
// self-hosted replica records its prior-existence fact in its SERVICES row,
// which the join writes only AFTER the replica opened (born STOPPED by
// registerMessageGroupService). The same mechanism as a partition create:
//
//   M1  a rejoin's replica named by this node's existing services rows
//       (startupReplicaIds) opened before: reopened on a lost database it is
//       refused reseed-required at open, never re-founded empty;
//   M2  a first join's replica steps nothing (no campaign, no vote) until its
//       services row is durably registered - the identity record released by
//       the registration alone;
//   M4  a first join whose services-row registration fails never releases
//       the record: it is abandoned (the spent wait logged once) and the
//       port never steps (verifier Z14);
//   M3  the verifier's randomized W1 shape with the request the production
//       message-group port builds: a bridging GENESIS founder wiped and
//       reopened (same replica id) inside the window never yields two leaders
//       in one term.
//
// Driven through the real join phase (CreateMessageGroupPhase ->
// createJoinMessageGroupReplica -> MessageGroupService -> the rs-raft port on
// the real WASM core).

import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {test} from 'node:test';

import {CreateMessageGroupPhase} from
  '../../src/bootstrap/phases/create-message-group-phase.js';
import {openMessageGroupConsensusPort} from
  '../../src/message-group/message-group-consensus-port.js';
import {COMMITTED_MEMBERSHIP_REFUSAL} from
  '../../src/raft/raft-committed-membership-constants.js';
import {RAFT_OPERATION_PORT_REQUEST as REQ} from
  '../../src/raft/raft-operation-port-request.js';
import {PartitionNodeCluster} from
  '../raft/raft-rs-backend/partition-node-cluster.js';

const NODE_ID = 'joiner-1';
const GROUP_ID = 'mg-joiner-1';
const REPLICA_ID = `${GROUP_ID}-replica-0`;
const QUIET = Object.freeze({debug() {}, info() {}, warn() {}, error() {}});
const ROUTER = Object.freeze({
  initialize() {},
  setServiceNodeResolver() {},
  register() {},
  unregister() {},
  getRegisteredHandler: () => null,
  unregisterExact: () => true,
  deliver: async () => ({acknowledged: true}),
});

function joinPhase(directory, services, delegates = {}) {
  return new CreateMessageGroupPhase({nodeId: NODE_ID, delegates: {
    getLogger: () => QUIET,
    ...delegates,
    getMessageGroupServices: () => services,
    getSleep: () => async () => {},
    getMessageRouter: () => ROUTER,
    getDataDir: () => directory,
    getReplicaStateMachine: () => null,
    pushJoinMessageGroupReplica() {},
  }});
}

// The options phaseCreateSelfHostedMessageGroup queues for one replica.
function replicaOptions(phase, startupReplicaIds) {
  return {groupId: GROUP_ID, replicaId: REPLICA_ID,
    replicaIds: [REPLICA_ID], replicaIndex: 0, deferElection: true,
    peerAddresses: [`${NODE_ID}/message-group/${REPLICA_ID}`],
    ...phase.observeJoinReplicaIdentity(REPLICA_ID, startupReplicaIds)};
}

async function within(predicate, deadlineMs) {
  const until = Date.now() + deadlineMs;
  while (Date.now() < until) {
    if (predicate()) return true;
    await new Promise((resolve) => setTimeout(resolve, 10));
  }
  return predicate();
}

test('M1: a rejoin replica whose services row survives its lost database ' +
  'is refused reseed-required at open, through the join phase', async () => {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'join-mg-open-'));
  const services = new Map();
  try {
    const phase = joinPhase(directory, services);
    const first = await phase.createJoinMessageGroupReplica(
      {replicaOptions: replicaOptions(phase, [])});
    assert.equal(first.status, 'created', 'a first join founds the group');
    phase.settleJoinReplicaIdentityRecord(REPLICA_ID);
    const dbFile = services.get(REPLICA_ID).dbPath;
    await services.get(REPLICA_ID).shutdown();
    services.clear();
    fs.rmSync(dbFile, {force: true});
    const rejoin = joinPhase(directory, services);
    const options = replicaOptions(rejoin, [REPLICA_ID]);
    assert.equal(options.identityExisted, true, 'the row is the fact');
    assert.equal(options.identityRecorded, null, 'no pending record');
    await assert.rejects(rejoin.createJoinMessageGroupReplica(
      {replicaOptions: options}), (error) => {
      assert.equal(error.consensus?.reason,
        COMMITTED_MEMBERSHIP_REFUSAL.RESEED_REQUIRED);
      return true;
    });
    assert.equal(services.has(REPLICA_ID), false);
  } finally {
    for (const service of services.values()) await service.shutdown();
    fs.rmSync(directory, {recursive: true, force: true});
  }
});

test('M2: a first-join replica steps nothing until its services row is ' +
  'durably registered', async () => {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'join-mg-rec-'));
  const services = new Map();
  try {
    const phase = joinPhase(directory, services);
    await phase.createJoinMessageGroupReplica(
      {replicaOptions: replicaOptions(phase, [])});
    const port = services.get(REPLICA_ID).raft;
    assert.equal(port.readStatus().identityRecorded, false);
    const early = await port.campaign();
    assert.equal(early?.reason, 'participation-gate-identity-unrecorded');
    assert.equal(await within(() => port.readStatus().role === 'leader',
      600), false, 'no leadership before the registration');
    phase.settleJoinReplicaIdentityRecord(REPLICA_ID);
    assert.equal(await within(() => port.readStatus().role === 'leader',
      5000), true, 'the registration releases it and it leads');
  } finally {
    for (const service of services.values()) await service.shutdown();
    fs.rmSync(directory, {recursive: true, force: true});
  }
});

test('M4: a first join whose services-row registration fails abandons ' +
  'the record: the port never steps', async () => {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'join-mg-fail-'));
  const services = new Map();
  const warnings = [];
  try {
    const phase = joinPhase(directory, services, {
      getLogger: () => ({...QUIET,
        warn: (message, context) => warnings.push({message, context})}),
      getNow: () => Date.now,
      getConfig: () => ({}),
      getSeedNodeAddress: () => 'http://seed.invalid',
      getSeedNodeId: () => NODE_ID,
      upsertJoinServiceRowWithRetry: async () => ({success: false,
        error: 'services row refused'}),
    });
    await phase.createJoinMessageGroupReplica(
      {replicaOptions: replicaOptions(phase, [])});
    const service = services.get(REPLICA_ID);
    await assert.rejects(phase.registerMessageGroupService(GROUP_ID,
      REPLICA_ID, service, {status: 'stopped'}));
    const port = service.raft;
    assert.equal(port.readStatus().identityRecorded, false, 'not released');
    const early = await port.campaign();
    assert.equal(early?.reason, 'participation-gate-identity-unrecorded');
    assert.equal(await within(() => port.readStatus().role === 'leader',
      600), false, 'never leads');
    const spent = warnings.filter((line) =>
      line.context?.wait === 'message-group-identity-record');
    assert.equal(spent.length, 1, 'the spent wait is logged once');
    assert.equal(spent[0].context.event, 'wait_bound_spent');
  } finally {
    for (const value of services.values()) await value.shutdown();
    fs.rmSync(directory, {recursive: true, force: true});
  }
});

// The identity-record keys the production message-group port request
// carries for a first-join replica (captured at the port factory).
function productionRecordKeys(directory, identityRecorded) {
  let captured = null;
  const service = {groupId: GROUP_ID, replicaId: 'f2', replicaIds: [],
    unifiedAddress: 'f2', identityExisted: false, identityRecorded,
    dbPath: path.join(directory, 'capture.db'),
    createOperationPort: (request) => {
      captured = request;
      return {readStatus: () => ({})};
    }};
  openMessageGroupConsensusPort(service);
  service.db.close();
  return Object.fromEntries([REQ.IDENTITY_EXISTED, REQ.IDENTITY_RECORDED]
    .filter((key) => key in captured).map((key) => [key, captured[key]]));
}

function xorshift(seed) {
  let state = seed >>> 0 || 1;
  return () => {
    state ^= state << 13; state >>>= 0;
    state ^= state >>> 17;
    state ^= state << 5; state >>>= 0;
    return state / 4294967296;
  };
}

function pendingRecord() {
  const record = Promise.withResolvers();
  record.promise.catch(() => undefined);
  return record;
}

test('M3: randomized W1 with the production message-group request: a ' +
  'wiped bridging founder reopened in the window never makes two leaders',
async () => {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'join-mg-w1-'));
  const founders = ['f0', 'f1', 'f2'];
  let violations = 0;
  let wipes = 0;
  try {
    for (let seed = 1; seed <= 40; seed += 1) {
      const random = xorshift(seed * 7919);
      const cluster = new PartitionNodeCluster({
        partitionId: `mg-w1-${seed}`, replicaIds: founders});
      const open = () => cluster.buildReplica('f2', founders,
        productionRecordKeys(directory, pendingRecord().promise));
      const wipe = () => {
        const replica = cluster.replica('f2');
        replica.node.close();
        replica.db.close();
        fs.rmSync(cluster.dbFileOf('f2'), {force: true});
      };
      const seen = new Map();
      try {
        wipe();
        open();
        const idOf = Object.fromEntries(founders.map((founder) =>
          [cluster.raftPeerIdOf(founder), founder]));
        for (let round = 0; round < 600; round += 1) {
          if (random() < 1 / 30) {
            wipe();
            open();
            wipes += 1;
          }
          for (const founder of founders) {
            const replica = cluster.replica(founder);
            for (const envelope of replica.inbox.splice(0)) {
              const from = idOf[envelope.from];
              if ((founder === 'f0' && from === 'f1') ||
                  (founder === 'f1' && from === 'f0') || random() < 0.25) {
                continue;
              }
              if (random() < 0.3) {
                replica.inbox.push(envelope);
                continue;
              }
              replica.node.step(envelope);
            }
            if (random() < 0.8) replica.node.tick();
          }
          await new Promise((resolve) => setImmediate(resolve));
          for (const founder of founders) {
            const status = cluster.node(founder).readStatus();
            if (status.role !== 'leader') continue;
            const prior = seen.get(String(status.term));
            if (prior && prior !== founder) violations += 1;
            seen.set(String(status.term), founder);
          }
        }
      } finally {
        cluster.dispose();
      }
    }
  } finally {
    fs.rmSync(directory, {recursive: true, force: true});
  }
  assert.ok(wipes > 0, 'the window was exercised');
  assert.equal(violations, 0, 'two leaders in one term');
});

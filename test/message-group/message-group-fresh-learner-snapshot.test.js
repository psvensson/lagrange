import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {test} from 'node:test';

import Database from 'better-sqlite3';

import {MessageGroupService} from
  '../../src/message-group/message-group-service.js';
import {MessageRouter} from '../../src/transport/message-router.js';
import {registerMessageGroupTransportHandler} from
  '../../src/bootstrap/shared/message-group-transport-handler.js';
import {createInProcWebSocketPair} from '../../src/transport/inproc-transport.js';
import {ConfigurationManager} from '../../src/config/configuration-manager.js';
import {LoggingService} from '../../src/logging/logging-service.js';
import {NodeService} from '../../src/node/node-service.js';
import {SystemTableCache} from '../../src/cache/system-table-cache.js';
import {TABLES} from '../../src/constants/index.js';
import {RaftRsPeerIdentityRegistry} from
  '../../src/raft/raft-rs-peer-identity.js';
import {RaftRsDurableStore} from '../../src/raft/raft-rs-durable-store.js';
import {createSqliteStateMachineCheckpoint, readCheckpoint} from
  '../../src/raft/snapshot-checkpoint-store.js';
import {serveSnapshotTransfer, receiveSnapshotTransfer} from
  '../../src/raft/snapshot-transfer.js';
import {requestSnapshotInstall} from '../../src/raft/snapshot-install.js';
import {RAFT_MEMBERSHIP_OPERATION, RAFT_OPERATION_OUTCOME} from
  '../../src/raft/raft-operation-port-constants.js';
import {ReplicaCreateAdmissionOwner} from
  '../../src/node/replica-create-admission-owner.js';
import {OperationType} from '../../src/rebalancer/replica-status.js';
import {TEST_BOOT_INCARNATION} from
  '../test-helpers/boot-incarnation-fixture.js';

const GROUP = 'fresh-learner-snapshot-mg';
const NODE = 'fresh-learner-node';
const FOUNDERS = ['fresh-a', 'fresh-b', 'fresh-c'];
const TARGET = 'fresh-d';
const WAIT_MS = 10000;

function waitFor(predicate) {
  const deadline = Date.now() + WAIT_MS;
  return new Promise((resolve) => {
    const poll = () => predicate() ? resolve(true) : Date.now() >= deadline ?
      resolve(false) : setTimeout(poll, 10);
    poll();
  });
}

function configure() {
  NodeService.resetInstance();
  ConfigurationManager.resetInstance();
  LoggingService.resetInstance();
  ConfigurationManager.getInstance().initialize({node: {id: NODE}, raft: {
    heartbeatIntervalMs: 20, electionTimeoutMinMs: 150,
    electionTimeoutMaxMs: 300,
  }});
  LoggingService.getInstance().initialize({level: 'error'});
}

async function hostAt(root) {
  configure();
  const router = new MessageRouter({bootIncarnation: TEST_BOOT_INCARNATION,
    nodeId: NODE, wsPort: 0});
  await router.initialize({startServer: false});
  const live = new Map();
  const caches = new Map();
  const dbPath = (replica) => path.join(root, `${replica}.db`);
  const open = async (replica, extra = {}) => {
    const cache = new SystemTableCache();
    caches.set(replica, cache);
    const service = new MessageGroupService({groupId: GROUP, replicaId: replica,
      nodeId: NODE, replicaIds: [...FOUNDERS, TARGET],
      peerAddresses: [...FOUNDERS, TARGET].map(
        (id) => `${NODE}/message-group/${id}`), transport: router,
      nodeService: {getSystemTableCache: () => cache,
        getReadOnlySystemTableCache: () => cache}, dbPath: dbPath(replica),
      ...extra});
    registerMessageGroupTransportHandler(service, {messageRouter: router,
      address: `${NODE}/message-group/${replica}`});
    live.set(replica, service);
    await service.initialize();
    return service;
  };
  const close = async (replica) => {
    const service = live.get(replica);
    live.delete(replica);
    router.unregister(`${NODE}/message-group/${replica}`);
    await service?.shutdown();
  };
  return {router, live, caches, dbPath, open, close, async dispose() {
    for (const replica of [...live.keys()]) await close(replica);
    await router.shutdown();
    NodeService.resetInstance();
    ConfigurationManager.resetInstance();
    LoggingService.resetInstance();
  }};
}

function createAdmission() {
  const row = {operation_id: 'fresh-install', type: OperationType.REPLACE,
    entity_type: 'message-group', entity_id: GROUP, partition_id: GROUP,
    replica_id: TARGET, target_node_id: NODE, workflow_step: 'SENDING',
    updated_at: 11, completed_at: null, create_admission_state: null,
    create_admission_token: null, create_admission_replica_created_at: null,
    create_admission_attempt_token: null,
    create_admission_previous_attempt_token: null,
    create_admission_attempt_seq: null,
    create_admission_workflow_updated_at: null,
    create_admission_owner_incarnation: null};
  const gateway = {
    async readAuthoritativeRows(_table, sql, params) {
      return sql.includes('FROM nodes') ? {success: true, rows: [{node_id: NODE,
        boot_incarnation: 7}]} : {success: true,
        rows: row.operation_id === params[0] ? [row] : []};
    },
    async updateSystemTableRow(_table, where, data) {
      if (!Object.entries(where).every(([key, value]) => row[key] === value)) {
        return {success: true, outcome: 'no_op'};
      }
      Object.assign(row, data);
      return {success: true, outcome: 'applied'};
    },
  };
  const owner = new ReplicaCreateAdmissionOwner({gateway, nodeId: NODE,
    ownerIncarnation: 7, now: () => 20});
  return {owner, request: {operationId: row.operation_id,
    operationType: row.type, entityType: row.entity_type, entityId: GROUP,
    partitionId: GROUP, replicaId: TARGET, admissionToken: 'admit',
    attemptToken: 'attempt', attemptSeq: 1, workflowUpdatedAt: 11}};
}

test('fresh message-group learner installs a transferred raft-rs image and ' +
  'catches later commands across restart', async () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'fresh-mg-snapshot-'));
  const host = await hostAt(root);
  try {
    const founders = [];
    for (const replica of FOUNDERS) {
      founders.push(await host.open(replica,
        {replicaIds: FOUNDERS, peerAddresses: FOUNDERS.map(
          (id) => `${NODE}/message-group/${id}`)}));
    }
    assert.equal(await waitFor(() => founders.filter((service) =>
      service.raft.readStatus().role === 'leader').length === 1), true);
    const leader = founders.find((service) =>
      service.raft.readStatus().role === 'leader');
    const targetPeer = new RaftRsPeerIdentityRegistry(leader.db)
      .registerReplica(TARGET);
    const proposed = await leader.raft.proposeConfChange({
      type: RAFT_MEMBERSHIP_OPERATION.ADD_LEARNER, replicaIdentity: TARGET});
    assert.equal(proposed.outcome, RAFT_OPERATION_OUTCOME.CORE_OK);
    assert.equal(await waitFor(() => leader.raft.readStatus().confState.learners
      .includes(targetPeer)), true, 'the live leader commits the learner');
    const boundary = leader.raft.readStatus();
    for (const replica of FOUNDERS) await host.close(replica);

    const sourceDb = new Database(host.dbPath(leader.replicaId));
    const senderRoot = path.join(root, 'sender');
    const receiverRoot = path.join(root, 'receiver');
    const identity = {clusterId: 'fresh-cluster', raftGroupId: GROUP,
      entity: {kind: 'message-group', id: GROUP},
      membershipEpoch: boundary.membershipGenerationIndex};
    const created = await createSqliteStateMachineCheckpoint({db: sourceDb,
      identity, checkpointsRoot: senderRoot, raftRsGroupId: GROUP});
    sourceDb.close();
    assert.equal(created.outcome, 'created');
    const {a, b} = createInProcWebSocketPair();
    const [served, received] = await Promise.all([
      serveSnapshotTransfer({socket: a, checkpointsRoot: senderRoot,
        generationIndex: created.descriptor.lastIncludedIndex,
        transferId: 'fresh-mg-transfer', chunkSizeBytes: 4096}),
      receiveSnapshotTransfer({socket: b, checkpointsRoot: receiverRoot,
        expectedIdentity: identity, chunkSizeBytes: 4096}),
    ]);
    assert.equal(served.outcome, 'completed');
    assert.equal(received.outcome, 'completed');
    const transferred = readCheckpoint({checkpointDir: path.join(receiverRoot,
      String(created.descriptor.lastIncludedIndex)), expectedIdentity: identity});
    assert.equal(transferred.outcome, 'valid', JSON.stringify(transferred));

    const admission = createAdmission();
    const evidence = await admission.owner.claim(admission.request);
    assert.equal(await admission.owner.claimPhysicalWorker(evidence), true);
    const installed = await requestSnapshotInstall({
      replicaDbPath: host.dbPath(TARGET), checkpointsRoot: receiverRoot,
      generationIndex: created.descriptor.lastIncludedIndex,
      expectedIdentity: identity, expectedReplicaIdentity: TARGET,
      expectedPeerId: targetPeer, createAdmissionOwner: admission.owner,
      createAdmissionEvidence: evidence});
    assert.equal(installed.outcome, 'installed', JSON.stringify(installed));

    const reopened = [];
    for (const replica of FOUNDERS) reopened.push(await host.open(replica));
    const learner = await host.open(TARGET, {isJoiningExistingGroup: true,
      deferElectionUntilJoinConvergence: true});
    learner.completeJoinConvergence();
    assert.equal(await waitFor(() => learner.raft.readStatus().confState?.learners
      .includes(targetPeer)), true, JSON.stringify(learner.raft.readStatus()));
    assert.equal(await waitFor(() => reopened.some((service) =>
      service.raft.readStatus().role === 'leader')), true);
    const liveLeader = reopened.find((service) =>
      service.raft.readStatus().role === 'leader');
    const row = {id: 'after-snapshot', address: '10.8.0.4:7000',
      status: 'active'};
    await liveLeader.applyCDCEvent(TABLES.NODES, 'INSERT', row);
    assert.equal(await waitFor(() => learner.getWritableCache()
      .get(TABLES.NODES, row.id)?.address === row.address), true,
    'the fresh learner catches a real command after the snapshot boundary');
    await host.close(TARGET);
    const restarted = await host.open(TARGET, {isJoiningExistingGroup: true,
      deferElection: true});
    assert.equal(restarted.raft.readStatus().confState.learners
      .includes(targetPeer), true, 'restart preserves the installed learner');
    const durable = new Database(host.dbPath(TARGET), {readonly: true});
    try {
      assert.equal(RaftRsDurableStore.readCommittedEntriesIn(durable, GROUP)
        .some((entry) => entry.command?.data?.id === row.id), true,
      'restart retains the post-boundary command in the learner record');
    } finally {
      durable.close();
    }
    const afterRestart = {id: 'after-restart', address: '10.8.0.5:7000',
      status: 'active'};
    await liveLeader.applyCDCEvent(TABLES.NODES, 'INSERT', afterRestart);
    assert.equal(await waitFor(() => restarted.getWritableCache()
      .get(TABLES.NODES, afterRestart.id)?.address === afterRestart.address),
    true, 'the restarted learner continues catching real commands');
  } finally {
    await host.dispose();
    fs.rmSync(root, {recursive: true, force: true});
  }
});

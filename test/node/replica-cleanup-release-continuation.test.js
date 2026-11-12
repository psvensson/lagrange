// Real lifecycle, cleanup-token and removal owners; controlled runtime release.
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {test} from 'node:test';
import {ConfigurationManager} from '../../src/config/configuration-manager.js';
import {LoggingService} from '../../src/logging/logging-service.js';
import {TABLES} from '../../src/constants/index.js';
import {EXECUTOR_OUTCOME_TYPE} from '../../src/rebalancer/executor-outcome-constants.js';
import {REPLICA_CLEANUP_ERROR_CODE} from '../../src/node/replica-cleanup-constants.js';
import {ReplicaStatus} from '../../src/rebalancer/replica-status.js';
import {createNodeReplicaHandler} from '../raft/snapshot-wiring-inproc-fixture.js';

async function world(t) {
  ConfigurationManager.resetInstance();
  LoggingService.resetInstance();
  ConfigurationManager.getInstance().initialize({});
  LoggingService.getInstance().initialize({level: 'error'});
  const dataDir = fs.mkdtempSync(path.join(os.tmpdir(), 'cleanup-continuation-'));
  const node = createNodeReplicaHandler({nodeId: 'cleanup-node', dataDir,
    createPartitionService: async () => {
      throw new Error('unexpected open');
    }});
  const service = {replicaId: 'cleanup-r', partitionId: 'cleanup-p',
    tableName: 'cleanup', nodeId: 'cleanup-node', async shutdown() {}};
  const handler = node.replicaHandler;
  await node.host(service);
  await node.store.gateway.insertSystemTableRow(TABLES.PARTITIONS, {
    partition_id: service.partitionId, table_id: 'cleanup',
    leader_node_id: service.nodeId, status: 'active', created_at: 1, updated_at: 1});
  await handler.persistReplicaStatusWithRetry(service.replicaId,
    ReplicaStatus.REMOVING, {partitionId: service.partitionId});
  const dbPath = handler.getPartitionDbPath(service.partitionId, service.replicaId);
  fs.mkdirSync(path.dirname(dbPath), {recursive: true});
  fs.writeFileSync(dbPath, 'storage custody witness');
  t.after(async () => {
    node.replicaStateMachine.stopTimeoutChecker();
    service.shutdown = async () => {};
    for (const pending of handler.pendingRuntimeShutdowns.keys()) {
      pending.shutdown = async () => {};
    }
    await handler.shutdown();
    fs.rmSync(dataDir, {recursive: true, force: true});
  });
  return {...node, handler, service, dbPath,
    reconcile: () => handler.reconcileRemovedReplicaCleanup(
      service.replicaId, service.partitionId)};
}

test('finite release failure retains exact cleanup token and real reconcile resumes it', async (t) => {
  const node = await world(t);
  let fail = true;
  const fault = new Error('exact release fault');
  const pending = {...node.service, async shutdown() {
    if (fail) throw fault;
  }};
  node.handler.pendingRuntimeShutdowns.set(pending, {
    replicaId: pending.replicaId, partitionId: pending.partitionId, primary: null});
  await assert.rejects(node.reconcile(),
    (error) => error.deferRetry === true && error.cause === fault);
  assert.equal(fs.existsSync(node.dbPath), true);
  const owner = node.handler.getReplicaCleanupTombstoneOwner();
  const token = await owner.observeAuthority(pending.replicaId);
  assert.equal(token.kind, 'cleanup_owned');
  fail = false;
  assert.equal(await node.reconcile(), true);
  assert.equal(fs.existsSync(node.dbPath), false);
  assert.equal(node.handler.pendingRuntimeShutdowns.size, 0);
  assert.equal(await owner.observeAuthority(pending.replicaId), false);
});

test('a successor installed during release is neither closed nor unlinked', async (t) => {
  const node = await world(t);
  let successorCloses = 0;
  const successor = {...node.service, async shutdown() {
    successorCloses++;
  }};
  node.service.shutdown = async () => {
    node.handler.localServices.set(successor.replicaId, successor);
    node.handler.setLocalReplica(successor.replicaId, {service: successor});
  };
  await assert.rejects(node.reconcile());
  assert.equal(fs.existsSync(node.dbPath), true);
  assert.equal(successorCloses, 0);
  assert.equal(node.handler.getTrackedService(successor.replicaId), successor);
});


test('a retained cleanup continuation cannot borrow a successor runtime on redelivery', async (t) => {
  const node = await world(t);
  let fail = true;
  node.service.shutdown = async () => {
    if (fail) throw new Error('old release fault');
  };
  await assert.rejects(node.reconcile());
  let closes = 0;
  const successor = {...node.service, async shutdown() {
    closes++;
  }};
  node.handler.localServices.set(successor.replicaId, successor);
  node.handler.setLocalReplica(successor.replicaId, {service: successor});
  fail = false;
  await assert.rejects(node.reconcile());
  assert.equal(closes, 0);
  assert.equal(node.handler.getTrackedService(successor.replicaId), successor);
  assert.equal(fs.existsSync(node.dbPath), true);
});


test('ordinary REMOVE redelivery carries typed debt and completes its issued token', async (t) => {
  const node = await world(t);
  let fail = true;
  node.service.shutdown = async () => {
    if (fail) throw new Error('finite release fault');
  };
  await assert.rejects(node.reconcile());
  node.handler.setLocalReplica(node.service.replicaId, {status: ReplicaStatus.REMOVING});
  const events = [];
  node.handler.emitExecutorOutcome = (...args) => events.push(args);
  const request = {operationId: 'continued-remove', partitionId: node.service.partitionId,
    replicaId: node.service.replicaId, reason: 'test removal'};
  await node.handler.handleRemoveReplica(request);
  await Promise.all([...node.handler.operationTasks]);
  const failed = events.find(([type]) => type === EXECUTOR_OUTCOME_TYPE.REPLICA_REMOVE_FAILED);
  assert.ok(failed, 'real removal execution reports its retained debt');
  assert.equal(failed[3].deferRetry, true);
  assert.equal(failed[3].errorCode, REPLICA_CLEANUP_ERROR_CODE.RUNTIME_RELEASE_DEFERRED);
  assert.equal(fs.existsSync(node.dbPath), true);
  fail = false;
  await node.handler.handleRemoveReplica(request);
  await Promise.all([...node.handler.operationTasks]);
  assert.ok(events.some(([type]) => type === EXECUTOR_OUTCOME_TYPE.REPLICA_REMOVE_COMPLETED));
  assert.equal(fs.existsSync(node.dbPath), false);
  assert.equal(node.handler.getLocalReplica(node.service.replicaId).status, ReplicaStatus.REMOVED);
});

test('a changed durable token refuses continuation before any physical retry', async (t) => {
  const node = await world(t);
  let calls = 0;
  node.service.shutdown = async () => {
    calls++;
    throw new Error('release fault');
  };
  await assert.rejects(node.reconcile());
  const before = calls;
  await node.store.gateway.updateSystemTableRow(TABLES.SERVICES,
    {service_id: node.service.replicaId}, {cleanup_token: 'another-owner'});
  await assert.rejects(node.reconcile());
  assert.equal(calls, before);
  assert.equal(fs.existsSync(node.dbPath), true);
});

test('ENOENT from cleanup authority is unavailable, not artifact absence', async (t) => {
  const node = await world(t);
  node.service.shutdown = async () => {
    throw new Error('retain issued token');
  };
  await assert.rejects(node.reconcile());
  const owner = node.handler.getReplicaCleanupTombstoneOwner();
  const token = await owner.observeAuthority(node.service.replicaId);
  const requireCurrent = owner.requireCurrent;
  const missingAuthority = Object.assign(new Error('authority read missing'), {code: 'ENOENT'});
  owner.requireCurrent = async () => {
    throw missingAuthority;
  };
  try {
    await assert.rejects(node.handler.cleanupReplicaResources(node.service.partitionId,
      node.service.replicaId, token, node.service), (error) => error === missingAuthority);
    assert.equal(fs.existsSync(node.dbPath), true);
  } finally {
    owner.requireCurrent = requireCurrent;
  }
});

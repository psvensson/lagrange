// Real lifecycle, cleanup-token and removal owners; controlled runtime release.
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {test} from 'node:test';
import {ConfigurationManager} from '../../src/config/configuration-manager.js';
import {LoggingService} from '../../src/logging/logging-service.js';
import {TABLES} from '../../src/constants/index.js';
import {ExecutorOutcomeEmitter, OUTCOME_EVENT_NAME} from
  '../../src/rebalancer/executor-outcome-emitter.js';
import {EXECUTOR_OUTCOME_TYPE} from '../../src/rebalancer/executor-outcome-constants.js';
import {ReplicaStatus} from '../../src/rebalancer/replica-status.js';
import {createNodeReplicaHandler} from '../raft/snapshot-wiring-inproc-fixture.js';

async function world(t, cleanupToken = null) {
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
    ReplicaStatus.REMOVING, {partitionId: service.partitionId, cleanupToken});
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

const fact = (node) => ({
  row: node.store.durableRow(TABLES.SERVICES, node.service.replicaId),
  continuation: node.handler.getReplicaCleanupTombstoneOwner()
    .readRemovalContinuation(node.service.replicaId, node.service.partitionId,
      node.handler.nodeId).kind,
  lifecycleState: node.replicaStateMachine.replicas.get(node.service.replicaId)?.state ?? null,
  databaseExists: fs.existsSync(node.dbPath),
  pendingRuntimeCount: node.handler.pendingRuntimeShutdowns.size,
});

async function attempt(node) {
  try {
    return {value: await node.reconcile()};
  } catch (error) {
    return {error: error.message, code: error.code, deferRetry: error.deferRetry};
  }
}

function loseObservationAfter(node, predicate) {
  let injected = 0;
  node.store.setBeforeAuthoritativeRead(async (tableName, params) => {
    if (injected || tableName !== TABLES.SERVICES ||
      !params.includes(node.service.replicaId)) return;
    const row = node.store.durableRow(TABLES.SERVICES, node.service.replicaId);
    if (!predicate(row)) return;
    injected++;
    node.store.setAuthoritativeReadAvailable(false);
  });
  return {
    get count() {
      return injected;
    },
    heal() {
      node.store.setBeforeAuthoritativeRead(null);
      node.store.setAuthoritativeReadAvailable(true);
    },
  };
}

test('control: ordinary cleanup completes through real reconciliation without observation loss', async (t) => {
  const node = await world(t);
  assert.equal(await node.reconcile(), true);
  const actual = fact(node);
  assert.equal(actual.row, null);
  assert.equal(actual.lifecycleState, null);
  assert.equal(actual.continuation, 'unowned');
});

test('control: failed-create cleanup marks complete and settles its generation without observation loss', async (t) => {
  const node = await world(t, 'failed-create-remove:cleanup-op');
  assert.equal(await node.reconcile(), true);
  const actual = fact(node);
  assert.equal(actual.row.status, 'cleanup_complete');
  assert.equal(actual.lifecycleState, null);
  assert.equal(actual.continuation, 'unowned');
});

test('finite read loss after applied takeover must not strand cleanup custody', async (t) => {
  const node = await world(t);
  const outage = loseObservationAfter(node, (row) => row?.status === 'cleanup_owned');
  const first = await attempt(node);
  assert.equal(first.deferRetry, true);
  const held = fact(node);
  assert.equal(outage.count, 1, 'failure engaged after durable takeover');
  assert.equal(held.row.status, 'cleanup_owned');
  outage.heal();
  const healed = await attempt(node);
  const after = fact(node);
  assert.equal(healed.value, true, 'real cleanup must resume after authoritative reads recover');
  assert.equal(after.row, null);
  assert.equal(after.lifecycleState, null);
  assert.equal(after.continuation, 'unowned');
});

test('finite read loss after applied release must settle the original removal generation', async (t) => {
  const node = await world(t);
  const outage = loseObservationAfter(node, (row) => row === null);
  const first = await attempt(node);
  assert.equal(first.deferRetry, true);
  const held = fact(node);
  assert.equal(outage.count, 1, 'failure engaged after durable DELETE');
  assert.equal(held.row, null);
  assert.equal(held.databaseExists, false);
  outage.heal();
  const healed = await attempt(node);
  const after = fact(node);
  assert.equal(healed.value, true, 'applied cleanup release must reconcile after reads recover');
  assert.equal(after.lifecycleState, null);
  assert.equal(after.continuation, 'unowned');
});

test('finite read loss after applied markComplete must settle the original failed-create generation', async (t) => {
  const node = await world(t, 'failed-create-remove:cleanup-op');
  const outage = loseObservationAfter(node, (row) => row?.status === 'cleanup_complete');
  const first = await attempt(node);
  assert.equal(first.deferRetry, true);
  const held = fact(node);
  assert.equal(outage.count, 1, 'failure engaged after durable cleanup_complete');
  assert.equal(held.row.status, 'cleanup_complete');
  assert.equal(held.databaseExists, false);
  outage.heal();
  const healed = await attempt(node);
  const after = fact(node);
  assert.equal(healed.value, true, 'applied completion receipt must reconcile after reads recover');
  assert.equal(after.lifecycleState, null);
  assert.equal(after.continuation, 'unowned');
});

test('initial REMOVE accepts its durable failed-create completion receipt', async (t) => {
  const node = await world(t, 'failed-create-remove:cleanup-op');
  const outcomes = [];
  node.handler.executorOutcomeEmitter = new ExecutorOutcomeEmitter({logger: node.handler.logger});
  node.handler.executorOutcomeEmitter.on(OUTCOME_EVENT_NAME, (outcome) => outcomes.push(outcome));
  await node.handler.handleRemoveReplica({operationId: 'cleanup-op',
    replicaId: node.service.replicaId, partitionId: node.service.partitionId});
  await Promise.all([...node.handler.operationTasks]);
  assert.ok(outcomes.some((outcome) =>
    outcome.outcomeType === EXECUTOR_OUTCOME_TYPE.REPLICA_REMOVE_COMPLETED));
  assert.equal(outcomes.some((outcome) =>
    outcome.outcomeType === EXECUTOR_OUTCOME_TYPE.REPLICA_REMOVE_FAILED), false);
  assert.equal(fact(node).row.status, 'cleanup_complete');
  assert.equal(fact(node).lifecycleState, null);
  assert.equal(fact(node).continuation, 'unowned');
});

test('a failed takeover submission retries the same issued token and captured runtime', async (t) => {
  const node = await world(t);
  const submitted = [];
  let retainedIntent = null;
  let refuse = true;
  let closes = 0;
  node.service.shutdown = async () => {
    closes++;
  };
  node.store.setBeforeMutation(async (mutation) => {
    if (mutation.data?.status !== 'cleanup_owned') return;
    submitted.push(mutation);
    if (retainedIntent) {
      const current = node.handler.getReplicaCleanupTombstoneOwner()
        .readRemovalContinuation(node.service.replicaId,
          node.service.partitionId, node.handler.nodeId);
      assert.equal(current.mutation, retainedIntent);
    }
    if (refuse) throw new Error('finite pre-apply mutation failure');
  });
  assert.equal((await attempt(node)).deferRetry, true);
  const owner = node.handler.getReplicaCleanupTombstoneOwner();
  const held = owner.readRemovalContinuation(node.service.replicaId,
    node.service.partitionId, node.handler.nodeId);
  assert.equal(held.phase, 'takeover_pending');
  assert.equal(held.service, node.service);
  retainedIntent = held.mutation;
  assert.equal(fact(node).row.status, ReplicaStatus.REMOVING);
  assert.equal(closes, 0);
  refuse = false;
  assert.equal(await node.reconcile(), true);
  assert.equal(submitted.length, 2);
  assert.deepEqual(submitted[0], submitted[1],
    'replay preserves the exact issued mutation payload');
  assert.equal(submitted[1].data.cleanup_token, held.cleanupAuthority.ownerToken);
  assert.equal(closes, 1);
  assert.equal(fact(node).continuation, 'unowned');
});

for (const failedCreate of [false, true]) {
  for (const field of ['created_at', 'create_attempt_token']) {
    test(`cleanup ${failedCreate ? 'completion' : 'release'} CAS preserves changed ${field}`, async (t) => {
      const node = await world(t, failedCreate ? 'failed-create-remove:cleanup-op' : null);
      let injected = 0;
      node.store.setBeforeMutation(async (mutation, durable) => {
        const targetEffect = failedCreate ? mutation.data?.status === 'cleanup_complete' :
          mutation.operation === 'delete';
        if (!targetEffect || mutation.tableName !== TABLES.SERVICES ||
            mutation.whereClause?.service_id !== node.service.replicaId) return;
        const row = durable[TABLES.SERVICES].get(node.service.replicaId);
        row[field] = field === 'created_at' ? row.created_at + 1000 : 'successor-create-attempt';
        injected++;
      });
      assert.equal((await attempt(node)).deferRetry, true);
      assert.equal(injected, 1, 'incarnation changed between read and mutation');
      const retained = fact(node);
      assert.equal(retained.row.status, 'cleanup_owned');
      assert.equal(retained.continuation, 'retained');
      assert.equal(retained.lifecycleState, ReplicaStatus.REMOVING);
    });
  }
}

test('lost completion observation cannot accept a different completed receipt', async (t) => {
  const node = await world(t, 'failed-create-remove:cleanup-op');
  const outage = loseObservationAfter(node, (row) => row?.status === 'cleanup_complete');
  assert.equal((await attempt(node)).deferRetry, true);
  assert.equal(outage.count, 1);
  const row = node.store.durable[TABLES.SERVICES].get(node.service.replicaId);
  row.updated_at++;
  outage.heal();
  assert.equal((await attempt(node)).deferRetry, true);
  assert.equal(fact(node).continuation, 'retained');
  assert.equal(fact(node).lifecycleState, ReplicaStatus.REMOVING);
});

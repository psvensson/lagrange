// Real handler -> executor emitter -> coordinator -> existing transition retry ->
// router -> handler. Metadata/transport/clock are controlled in-process adapters.
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {test} from 'node:test';
import {ConfigurationManager} from '../../src/config/configuration-manager.js';
import {LoggingService} from '../../src/logging/logging-service.js';
import {TABLES, WORKFLOW_STEP} from '../../src/constants/index.js';
import {VirtualTimeSource} from '../../src/time/time-source.js';
import {OperationType, ReplicaStatus} from '../../src/rebalancer/replica-status.js';
import {OUTCOME_EVENT_NAME} from '../../src/rebalancer/executor-outcome-emitter.js';
import {EXECUTOR_OUTCOME_TYPE} from '../../src/rebalancer/executor-outcome-constants.js';
import {buildFailedCreateRemoveToken, buildFailedCreateCleanupToken} from
  '../../src/rebalancer/failed-create-cleanup-token.js';
import {ReplicaOperationMessageType, ReplicaOperationField} from
  '../../src/rebalancer/replica-operation-constants.js';
import {buildDeliveryEnvelope} from '../../src/transport/transport-semantic-outcome.js';
import {createLifecycleServiceRow} from '../test-helpers/lifecycle-state-store.js';
import {createNodeReplicaHandler} from '../raft/snapshot-wiring-inproc-fixture.js';
import {createMockCache, createTestCoordinator} from './test-helpers.js';

const PARTITION = 'cleanup-orders-p1';
const REPLICA = 'cleanup-orders-p1-r1';
const NODE = 'cleanup-node';
const TABLE = 'cleanup-orders';
const CASES = [
  {name: 'release', fault: 'release', failedCreate: false},
  {name: 'takeover_read', fault: 'takeover_read', failedCreate: false},
  {name: 'delete_read', fault: 'delete_read', failedCreate: false},
  {name: 'healthy', fault: null, failedCreate: false},
  {name: 'failed_create_release', fault: 'release', failedCreate: true},
  {name: 'failed_create_takeover_read', fault: 'takeover_read', failedCreate: true},
  {name: 'failed_create_receipt_read', fault: 'receipt_read', failedCreate: true},
  {name: 'failed_create_healthy', fault: null, failedCreate: true},
];

async function settleUntil(predicate) {
  for (let turn = 0; turn < 200; turn++) {
    if (await predicate()) return;
    await new Promise((resolve) => setImmediate(resolve));
  }
  assert.fail('owner work did not settle within the deterministic drain');
}

function composeCache(store, clock) {
  const cache = createMockCache({
    nodes: [NODE, 'peer-2', 'peer-3', 'peer-4'].map((nodeId) => ({
      node_id: nodeId, status: 'active', connection_state: 'ready',
      ready_lease_expires_at: clock.now() + 60000,
    })),
    tables: [{table_id: TABLE, table_policies: '{"minReplicaCount":3}'}],
  });
  for (const name of ['get', 'getAll', 'filter']) {
    const ordinary = cache[name].bind(cache);
    cache[name] = (table, ...args) =>
      [TABLES.SERVICES, TABLES.PARTITIONS].includes(table) ?
        store.cache[name](table, ...args) : ordinary(table, ...args);
  }
  return cache;
}

function observationFaultEngaged(fault, row) {
  switch (fault) {
  case 'takeover_read': return row?.status === 'cleanup_owned';
  case 'delete_read': return row === null;
  case 'receipt_read': return row?.status === 'cleanup_complete';
  default: return false;
  }
}

async function world(t, {fault, failedCreate}) {
  ConfigurationManager.resetInstance();
  LoggingService.resetInstance();
  ConfigurationManager.getInstance().initialize({});
  LoggingService.getInstance().initialize({level: 'error'});
  const dataDir = fs.mkdtempSync(path.join(os.tmpdir(), 'cleanup-workflow-'));
  const node = createNodeReplicaHandler({nodeId: NODE, dataDir,
    createPartitionService: async () => {
      throw new Error('unexpected creation');
    }});
  const handler = node.replicaHandler;
  const clock = new VirtualTimeSource({startMs: Date.now()});
  let faultActive = fault !== null;
  let faultCount = 0;
  const service = {replicaId: REPLICA, partitionId: PARTITION, tableName: TABLE,
    nodeId: NODE, async shutdown() {
      if (faultActive && fault === 'release') {
        faultCount++;
        throw new Error('finite exact-runtime release failure');
      }
    }};
  await node.host(service);
  await node.store.gateway.insertSystemTableRow(TABLES.PARTITIONS, {
    partition_id: PARTITION, table_id: TABLE, replica_count: 3,
    leader_node_id: 'peer-2', status: 'active', created_at: 1, updated_at: 1,
  });
  for (let index = 2; index <= 4; index++) {
    await node.store.gateway.insertSystemTableRow(TABLES.SERVICES,
      createLifecycleServiceRow({replicaId: `${PARTITION}-r${index}`,
        partitionId: PARTITION, nodeId: `peer-${index}`, status: 'active',
        raftRole: index === 2 ? 'leader' : 'follower'}));
  }
  if (failedCreate) {
    await node.store.gateway.updateSystemTableRow(TABLES.SERVICES, {service_id: REPLICA}, {
      status: ReplicaStatus.FAILED, state_entered_at: 2, updated_at: 2,
      cleanup_token: buildFailedCreateCleanupToken('failed-original-create'),
      create_attempt_token: 'original-create-attempt',
    });
  }
  const deliveries = [];
  const outcomes = [];
  const coordinator = createTestCoordinator({nodeId: NODE,
    systemTableCache: composeCache(node.store, clock), enableTimeouts: false,
    setTimeoutFn: clock.setTimeout.bind(clock), clearTimeoutFn: clock.clearTimeout.bind(clock),
    messageRouter: {getConnectionState: () => 'connected', pingNode: async () => true,
      isOutboundQueueAvailable: () => true,
      deliver: async (_target, payload) => {
        assert.equal(payload.type, ReplicaOperationMessageType.REMOVE_REPLICA);
        deliveries.push(payload);
        const answer = await handler.handleRemoveReplica(payload);
        return buildDeliveryEnvelope({acknowledged: true}, answer);
      }},
  });
  handler.executorOutcomeEmitter = coordinator.executorOutcomeEmitter;
  coordinator.executorOutcomeEmitter.on(OUTCOME_EVENT_NAME, (outcome) => outcomes.push(outcome));
  const move = {type: OperationType.REMOVE, partitionId: PARTITION,
    nodeId: NODE, replicaId: REPLICA, emitOperationCreated: false};
  if (failedCreate) {
    move[ReplicaOperationField.FAILED_CREATE_TARGET_LIFECYCLE_PRECONDITION] =
      node.store.durableRow(TABLES.SERVICES, REPLICA);
  }
  const operation = await coordinator.createOperation(move);
  const dbPath = handler.getPartitionDbPath(PARTITION, REPLICA);
  fs.mkdirSync(path.dirname(dbPath), {recursive: true});
  fs.writeFileSync(dbPath, 'owned storage');
  node.store.setBeforeAuthoritativeRead(async (table, params) => {
    if (!faultActive || faultCount || table !== TABLES.SERVICES ||
        !params.includes(REPLICA)) return;
    const row = node.store.durableRow(TABLES.SERVICES, REPLICA);
    if (observationFaultEngaged(fault, row)) {
      faultCount++;
      node.store.setAuthoritativeReadAvailable(false);
    }
  });
  t.after(async () => {
    faultActive = false;
    node.store.setBeforeAuthoritativeRead(null);
    node.store.setAuthoritativeReadAvailable(true);
    await coordinator.shutdown();
    node.replicaStateMachine.stopTimeoutChecker();
    await handler.shutdown();
    fs.rmSync(dataDir, {recursive: true, force: true});
  });
  return {node, handler, clock, coordinator, operation, deliveries, outcomes,
    dbPath, failedCreate, faultCount: () => faultCount,
    heal() {
      faultActive = false; node.store.setAuthoritativeReadAvailable(true);
    }};
}

for (const scenario of CASES) {
  test(`real workflow continues REMOVE automatically: ${scenario.name}`, async (t) => {
    const w = await world(t, scenario);
    const {operation, coordinator, outcomes, deliveries, handler, node} = w;
    await coordinator.executeOperation(operation);
    await settleUntil(() => outcomes.length > 0);
    if (scenario.fault !== null) {
      await settleUntil(async () => coordinator.workflowOwner.transitionRetryTimerByOperationId
        .has(operation.operationId) || coordinator.workflowOwner.repository
        .isOperationTerminal(await coordinator.getOperation(operation.operationId)));
      assert.ok(w.faultCount() > 0, 'fault engaged in the real cleanup owner');
      assert.equal(outcomes[0].outcomeType, EXECUTOR_OUTCOME_TYPE.REPLICA_REMOVE_FAILED);
      assert.equal(outcomes[0].deferRetry, true);
      const pending = await coordinator.getOperation(operation.operationId);
      assert.notEqual(pending.workflowStep, WORKFLOW_STEP.FAILED);
      assert.equal(pending.completedAt, null);
      assert.equal(coordinator.workflowOwner.transitionRetryTimerByOperationId
        .has(operation.operationId), true, 'existing transition retry owns the emitted debt');
      w.heal();
      w.clock.advance(1000);
    }
    await settleUntil(async () =>
      (await coordinator.getOperation(operation.operationId)).completedAt !== null);
    const completed = await coordinator.getOperation(operation.operationId);
    assert.equal(completed.workflowStep, WORKFLOW_STEP.REMOVED);
    assert.equal(handler.getReplicaCleanupTombstoneOwner()
      .readRemovalContinuation(REPLICA, PARTITION, NODE).kind, 'unowned',
    'operation terminality must not strand its local cleanup continuation');
    assert.equal(outcomes.some((outcome) =>
      outcome.outcomeType === EXECUTOR_OUTCOME_TYPE.REPLICA_REMOVE_COMPLETED), true,
    'the real executor completed its retained cleanup, not only an observed absence');
    assert.equal(deliveries.length, scenario.fault === null ? 1 : 2);
    assert.equal(fs.existsSync(w.dbPath), false);
    assert.equal(handler.pendingRuntimeShutdowns.size, 0);
    assert.equal(node.replicaStateMachine.replicas.has(REPLICA), false);
    assert.equal(handler.getReplicaCleanupTombstoneOwner()
      .readRemovalContinuation(REPLICA, PARTITION, NODE).kind, 'unowned');
    const row = node.store.durableRow(TABLES.SERVICES, REPLICA);
    if (w.failedCreate) {
      assert.equal(row.status, 'cleanup_complete');
      assert.equal(row.cleanup_token, buildFailedCreateRemoveToken(operation.operationId));
    } else assert.equal(row, null);
  });
}

test('automatic cleanup retry preserves a successor runtime and its ACTIVE status', async (t) => {
  const w = await world(t, {fault: 'release', failedCreate: false});
  await w.coordinator.executeOperation(w.operation);
  await settleUntil(() => w.coordinator.workflowOwner.transitionRetryTimerByOperationId
    .has(w.operation.operationId));
  assert.ok(w.faultCount() > 0);
  let closes = 0;
  let fences = 0;
  const successor = {replicaId: REPLICA, partitionId: PARTITION, nodeId: NODE,
    async shutdown() {
      closes++;
    },
    fenceServingAdmissionForRemoval() {
      fences++;
    }};
  w.handler.localServices.set(REPLICA, successor);
  w.handler.setLocalReplica(REPLICA, {replicaId: REPLICA, partitionId: PARTITION,
    service: successor, status: ReplicaStatus.ACTIVE});
  w.heal();
  w.clock.advance(1000);
  await settleUntil(() => w.outcomes.length === 2);
  await Promise.all([...w.handler.operationTasks]);
  assert.equal(w.deliveries.length, 2, 'the real retry delivered the retained obligation');
  assert.equal(w.outcomes[1].outcomeType, EXECUTOR_OUTCOME_TYPE.REPLICA_REMOVE_FAILED);
  assert.equal(w.outcomes[1].deferRetry, true);
  assert.equal(w.handler.getTrackedService(REPLICA), successor);
  assert.equal(w.handler.getLocalReplica(REPLICA).status, ReplicaStatus.ACTIVE);
  assert.equal(closes, 0);
  assert.equal(fences, 0);
  assert.equal(fs.readFileSync(w.dbPath, 'utf8'), 'owned storage');
  assert.equal(w.node.store.durableRow(TABLES.SERVICES, REPLICA).status, 'cleanup_owned');
});

for (const mismatch of ['operationId', 'created_at', 'create_attempt_token']) {
  test(`retained failed-create ingress refuses foreign ${mismatch}`, async (t) => {
    const w = await world(t, {fault: 'release', failedCreate: true});
    await w.coordinator.executeOperation(w.operation);
    await settleUntil(() => w.coordinator.workflowOwner.transitionRetryTimerByOperationId
      .has(w.operation.operationId));
    assert.ok(w.faultCount() > 0);
    const before = w.faultCount();
    const request = structuredClone(w.deliveries[0]);
    if (mismatch === 'operationId') request.operationId = 'foreign-cleanup-op';
    else {
      const precondition = request[
        ReplicaOperationField.FAILED_CREATE_TARGET_LIFECYCLE_PRECONDITION];
      precondition[mismatch] = mismatch === 'created_at' ? precondition[mismatch] + 1 :
        'foreign-create-attempt';
    }
    const answer = await w.handler.handleRemoveReplica(request);
    assert.equal(answer.status, 'error');
    await Promise.all([...w.handler.operationTasks]);
    assert.equal(w.faultCount(), before, 'refused delivery did not touch the captured runtime');
    assert.equal(fs.readFileSync(w.dbPath, 'utf8'), 'owned storage');
    assert.equal(w.outcomes.length, 1, 'no foreign executor work was launched');
  });
}

// Real handler -> executor emitter -> coordinator -> existing transition retry ->
// router -> handler. Metadata/transport/clock are controlled in-process adapters.
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {ConfigurationManager} from '../../src/config/configuration-manager.js';
import {LoggingService} from '../../src/logging/logging-service.js';
import {TABLES, WORKFLOW_STEP} from '../../src/constants/index.js';
import {VirtualTimeSource} from '../../src/time/time-source.js';
import {OperationType, ReplicaStatus} from '../../src/rebalancer/replica-status.js';
import {ExecutorOutcomeEmitter, OUTCOME_EVENT_NAME} from '../../src/rebalancer/executor-outcome-emitter.js';
import {EXECUTOR_OUTCOME_TYPE} from '../../src/rebalancer/executor-outcome-constants.js';
import {buildFailedCreateRemoveToken, buildFailedCreateCleanupToken} from
  '../../src/rebalancer/failed-create-cleanup-token.js';
import {ReplicaOperationMessageType, ReplicaOperationField} from
  '../../src/rebalancer/replica-operation-constants.js';
import {buildDeliveryEnvelope} from '../../src/transport/transport-semantic-outcome.js';
import {createLifecycleCdcService, createLifecycleServiceRow} from '../test-helpers/lifecycle-state-store.js';
import {createNodeReplicaHandler} from '../raft/snapshot-wiring-inproc-fixture.js';
import {createMockCache, createTestCoordinator} from './test-helpers.js';

const PARTITION = 'cleanup-orders-p1';
const REPLICA = 'cleanup-orders-p1-r1';
const NODE = 'cleanup-node';
const TABLE = 'cleanup-orders';


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


import {ReplicaHandlerSetup} from '../../src/bootstrap/shared/replica-handler-setup.js';
const PRE = ReplicaOperationField.FAILED_CREATE_TARGET_LIFECYCLE_PRECONDITION;

// Hold the canonical final outcome at its delivery boundary, so the real
// handler finishes first and the real coordinator remains nonterminal.
async function completedReceiptWorld(t, terminal) {
  const w = await world(t, {fault: null, failedCreate: true});
  const held = [];
  const heldEmitter = new ExecutorOutcomeEmitter({logger: w.handler.logger});
  heldEmitter.on(OUTCOME_EVENT_NAME, (outcome) => held.push(outcome));
  w.handler.executorOutcomeEmitter = heldEmitter;
  await w.coordinator.executeOperation(w.operation);
  await settleUntil(() => held.some((outcome) =>
    outcome.outcomeType === EXECUTOR_OUTCOME_TYPE.REPLICA_REMOVE_COMPLETED));
  await Promise.all([...w.handler.operationTasks]);
  assert.equal(w.deliveries.length, 1, 'real dispatch supplied the original request');
  assert.equal(w.handler.getReplicaCleanupTombstoneOwner()
    .readRemovalContinuation(REPLICA, PARTITION, NODE).kind, 'unowned');
  assert.equal(w.node.replicaStateMachine.replicas.has(REPLICA), false);
  assert.equal(w.handler.pendingRuntimeShutdowns.size, 0);
  assert.equal(fs.existsSync(w.dbPath), false);
  const receipt = w.node.store.durableRow(TABLES.SERVICES, REPLICA);
  assert.equal(receipt.status, 'cleanup_complete');
  const originalRequest = structuredClone(w.deliveries[0]);
  assert.equal(receipt.created_at, originalRequest[PRE].created_at);
  assert.equal(receipt.create_attempt_token, originalRequest[PRE].create_attempt_token);
  assert.equal(receipt.cleanup_token, buildFailedCreateRemoveToken(w.operation.operationId));
  assert.equal((await w.coordinator.getOperation(w.operation.operationId)).completedAt, null);
  if (terminal) {
    w.coordinator.executorOutcomeEmitter.emit(OUTCOME_EVENT_NAME, held[0]);
    await settleUntil(async () =>
      (await w.coordinator.getOperation(w.operation.operationId)).completedAt !== null);
    assert.equal((await w.coordinator.getOperation(w.operation.operationId)).workflowStep,
      WORKFLOW_STEP.REMOVED);
  }
  // Fixture stores are separate; carry actual owner-persisted bytes between
  // their metadata adapters. Never invent operation type, target or status.
  const operationRow = structuredClone(w.coordinator.systemTableCache
    .get(TABLES.REPLICA_OPERATIONS, w.operation.operationId));
  assert.ok(operationRow && operationRow.operation_id === w.operation.operationId);
  assert.equal(operationRow.type, OperationType.REMOVE);
  assert.equal(operationRow.replica_id, REPLICA);
  assert.equal(operationRow.partition_id, PARTITION);
  assert.equal(operationRow.target_node_id, NODE);
  const history = JSON.parse(operationRow.steps_history);
  assert.ok(history.some((step) =>
    step.failedCreateTargetLifecyclePrecondition?.create_attempt_token ===
      originalRequest[PRE].create_attempt_token), 'durable metadata binds the original incarnation');
  assert.equal(operationRow.status === ReplicaStatus.REMOVED, terminal);
  w.node.store.durable[TABLES.REPLICA_OPERATIONS] =
    new Map([[operationRow.operation_id, operationRow]]);
  return {...w, receipt, operationRow, originalRequest};
}

function freshHandler(t, w, nodeId = NODE) {
  const setup = ReplicaHandlerSetup.create({nodeId,
    dataDir: w.handler.dataDir,
    messageRouter: {nodeId, register() {}},
    cdcIntegrationService: createLifecycleCdcService({store: w.node.store}),
    systemTableCache: w.node.store.cache,
    createPartitionService: async () => {throw new Error('no fresh runtime may open');},
  });
  t.after(async () => {
    setup.replicaStateMachine.stopTimeoutChecker();
    await setup.replicaHandler.shutdown();
  });
  assert.equal(setup.replicaHandler.getReplicaCleanupTombstoneOwner()
    .readRemovalContinuation(REPLICA, PARTITION, nodeId).kind, 'unowned');
  assert.equal(setup.replicaStateMachine.replicas.size, 0);
  return setup.replicaHandler;
}


export {world, settleUntil, completedReceiptWorld, freshHandler, PARTITION, REPLICA, NODE, TABLE};

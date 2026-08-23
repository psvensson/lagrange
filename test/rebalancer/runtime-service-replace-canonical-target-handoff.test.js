/**
 * Real-seam regression for runtime-service REPLACE target identity.
 *
 * The test drives the production coordinator, durable operation fixture,
 * runtime handler, lifecycle boundary, SERVICES projection, source retirement,
 * and the next UnifiedRebalancer evaluation. Before the fix, REPLACE starts an
 * opaque replace-replica-* target, the entity read model misses it, and the
 * next evaluation schedules a duplicate canonical ADD.
 */

import {test} from '../../src/test-helpers/tap.js';
import {SYSTEM_TABLE_NAME} from
  '../../src/bootstrap/system-table-schemas-constants.js';
import {RuntimeServiceHandler} from
  '../../src/node/runtime-service-handler.js';
import {
  ReplicaOperationField,
  ReplicaOperationMessageType,
} from '../../src/rebalancer/replica-operation-constants.js';
import {OperationType, ReplicaStatus} from
  '../../src/rebalancer/replica-status.js';
import {
  runtimeServiceReplicaBelongsToEntity,
} from '../../src/rebalancer/runtime-service-replica-identity.js';
import {
  REBALANCE_COORDINATOR_EVENT,
  REBALANCER_DEFAULT_POLICY,
} from '../../src/rebalancer/rebalancer-constants.js';
import {
  EntityType,
  MoveType,
  TriggerType,
} from '../../src/rebalancer/unified-rebalancer.js';
import {
  createAllowAllStorageAdmissionService,
  createMockCache,
  createTestCoordinator,
  createTestRebalancer,
} from './test-helpers.js';
import {
  RUNTIME_SERVICE_REPLACE_CANONICAL_TARGET_HANDOFF_SCENARIO,
} from './runtime-service-replace-canonical-target-handoff-scenario.js';

const ENTITY_ID = 'svc-runtime-replace-proof';
const SOURCE_NODE_ID = 'node-runtime-source';
const STABLE_NODE_ID = 'node-runtime-stable';
const TARGET_NODE_ID = 'node-runtime-target';
const SOURCE_REPLICA_ID = `${ENTITY_ID}-r1`;
const STABLE_REPLICA_ID = `${ENTITY_ID}-r2`;
const EXPECTED_TARGET_REPLICA_ID = `${ENTITY_ID}-r3`;
const EVENT_WAIT_TIMEOUT_MS = 1500;
const ASYNC_DRAIN_LIMIT = 30;

const QUIET_LOGGER = Object.freeze({
  debug() {},
  error() {},
  info() {},
  warn() {},
});

function buildNode(nodeId) {
  return {
    node_id: nodeId,
    status: 'active',
    connection_state: 'ready',
    ready_lease_expires_at: Date.now() + 60_000,
  };
}

function buildService(replicaId, nodeId) {
  return {
    service_id: replicaId,
    replica_id: replicaId,
    service_type: EntityType.RUNTIME_SERVICE,
    node_id: nodeId,
    status: ReplicaStatus.ACTIVE,
    address: `${nodeId}/service/${replicaId}`,
  };
}

function attachServiceDefinition(cache) {
  const definition = Object.freeze({
    service_id: ENTITY_ID,
    service_type: EntityType.RUNTIME_SERVICE,
    status: 'active',
    replica_count: 2,
    runtime_kind: 'native_js',
    runtime_ref: 'runtime-service-replace-proof',
    runtime_config: '{}',
  });
  const baseGet = cache.get.bind(cache);
  const baseFilter = cache.filter.bind(cache);
  cache.get = (tableName, key) => {
    if (
      tableName === SYSTEM_TABLE_NAME.SERVICE_DEFINITIONS &&
      key === ENTITY_ID
    ) {
      return definition;
    }
    return baseGet(tableName, key);
  };
  cache.filter = (tableName, predicate) => {
    if (tableName === SYSTEM_TABLE_NAME.SERVICE_DEFINITIONS) {
      return [definition].filter(predicate);
    }
    return baseFilter(tableName, predicate);
  };
  return cache;
}

function waitForCompletedReplace(coordinator) {
  return new Promise((resolve, reject) => {
    let completedListener = null;
    let failedListener = null;
    const cleanup = () => {
      coordinator.removeListener(
        REBALANCE_COORDINATOR_EVENT.OPERATION_COMPLETED,
        completedListener,
      );
      coordinator.removeListener(
        REBALANCE_COORDINATOR_EVENT.OPERATION_FAILED,
        failedListener,
      );
    };
    const timeout = setTimeout(() => {
      cleanup();
      reject(new Error('Timed out waiting for runtime-service REPLACE'));
    }, EVENT_WAIT_TIMEOUT_MS);
    completedListener = (event) => {
      if (event?.operation?.type !== OperationType.REPLACE) {
        return;
      }
      clearTimeout(timeout);
      cleanup();
      resolve(event.operation);
    };
    failedListener = (event) => {
      if (event?.operation?.type !== OperationType.REPLACE) {
        return;
      }
      clearTimeout(timeout);
      cleanup();
      reject(new Error(
        `Runtime-service REPLACE failed: ${event?.error ||
          event?.operation?.errorMessage || 'unknown_error'}`,
      ));
    };
    coordinator.on(
      REBALANCE_COORDINATOR_EVENT.OPERATION_COMPLETED,
      completedListener,
    );
    coordinator.on(
      REBALANCE_COORDINATOR_EVENT.OPERATION_FAILED,
      failedListener,
    );
  });
}

async function drainImmediateWork() {
  for (let index = 0; index < ASYNC_DRAIN_LIMIT; index += 1) {
    await new Promise((resolve) => setImmediate(resolve));
  }
}

function createLifecycleManager(cache, activeEffects, activationRecord) {
  return {
    async createReplica() {},
    async startReplica(handle) {
      activationRecord.executionEffects.push(handle.serviceId);
      activationRecord.endpointRegistrations.push(handle.serviceId);
      activationRecord.querySlotRegistrations.push(handle.serviceId);
      activeEffects.add(handle.serviceId);
      cache.upsert(
        SYSTEM_TABLE_NAME.SERVICES,
        buildService(handle.serviceId, handle.nodeId),
      );
    },
    async stopReplica(handle) {
      activeEffects.delete(handle.serviceId);
      cache.delete(SYSTEM_TABLE_NAME.SERVICES, handle.serviceId);
    },
  };
}

function createRuntimeHandler({
  nodeId,
  cache,
  activeEffects,
  activationRecord,
  executorOutcomeEmitter,
}) {
  const handler = new RuntimeServiceHandler({
    nodeId,
    systemTableCache: cache,
    cdcIntegrationService: {},
    serviceLifecycleManager: createLifecycleManager(
      cache,
      activeEffects,
      activationRecord,
    ),
    executorOutcomeEmitter,
  });
  handler.logger = QUIET_LOGGER;
  handler.initialize();
  return handler;
}

function createInProcessRuntimeRouter(handlerByNodeId) {
  return {
    getConnectionState() {
      return 'connected';
    },
    isOutboundQueueAvailable() {
      return true;
    },
    async deliver(target, payload) {
      const nodeId = target.split('/')[0];
      const handler = handlerByNodeId.get(nodeId);
      if (!handler) {
        return {acknowledged: false, error: `No handler for ${nodeId}`};
      }
      let response;
      if (payload?.[ReplicaOperationField.TYPE] ===
          ReplicaOperationMessageType.CREATE_REPLICA) {
        response = await handler.handleCreateReplica(payload);
      } else {
        response = await handler.handleRemoveReplica(payload);
      }
      return {acknowledged: true, ...response};
    },
  };
}

test('runtime-service REPLACE keeps one canonical target through the next ' +
  'placement evaluation', async (t) => {
  const cache = attachServiceDefinition(createMockCache({
    nodes: [
      buildNode(SOURCE_NODE_ID),
      buildNode(STABLE_NODE_ID),
      buildNode(TARGET_NODE_ID),
    ],
    services: [
      buildService(SOURCE_REPLICA_ID, SOURCE_NODE_ID),
      buildService(STABLE_REPLICA_ID, STABLE_NODE_ID),
    ],
  }));
  const activeEffects = new Set([
    SOURCE_REPLICA_ID,
    STABLE_REPLICA_ID,
  ]);
  const activationRecord = {
    executionEffects: [],
    endpointRegistrations: [],
    querySlotRegistrations: [],
  };
  const handlerByNodeId = new Map();
  const messageRouter = createInProcessRuntimeRouter(handlerByNodeId);
  const storageAdmissionService = createAllowAllStorageAdmissionService();
  const coordinator = createTestCoordinator({
    enableTimeouts: false,
    messageRouter,
    nodeId: SOURCE_NODE_ID,
    storageAdmissionService,
    systemTableCache: cache,
  });
  coordinator.logger = QUIET_LOGGER;
  coordinator.workflowOwner.logger = QUIET_LOGGER;

  for (const nodeId of [
    SOURCE_NODE_ID,
    STABLE_NODE_ID,
    TARGET_NODE_ID,
  ]) {
    handlerByNodeId.set(nodeId, createRuntimeHandler({
      nodeId,
      cache,
      activeEffects,
      activationRecord,
      executorOutcomeEmitter: coordinator.executorOutcomeEmitter,
    }));
  }
  handlerByNodeId.get(SOURCE_NODE_ID).registerExistingReplica({
    replicaId: SOURCE_REPLICA_ID,
    entityId: ENTITY_ID,
    status: ReplicaStatus.ACTIVE,
  });

  const rebalancer = createTestRebalancer({
    entityId: ENTITY_ID,
    entityType: EntityType.RUNTIME_SERVICE,
    nodeId: SOURCE_NODE_ID,
    systemTableCache: cache,
    messageRouter,
    rebalanceCoordinator: coordinator,
    storageAdmissionService,
  });
  rebalancer.logger = QUIET_LOGGER;
  rebalancer.initialize();
  rebalancer.setLeader(true);

  try {
    const completion = waitForCompletedReplace(coordinator);
    const created = await coordinator.createOperation({
      type: OperationType.REPLACE,
      partitionId: ENTITY_ID,
      entityType: EntityType.RUNTIME_SERVICE,
      entityId: ENTITY_ID,
      nodeId: TARGET_NODE_ID,
      sourceNodeId: SOURCE_NODE_ID,
      replicaId: SOURCE_REPLICA_ID,
    });
    await coordinator.executeOperation(created);
    const completed = await completion;

    // Pin the scenario runner's identity to the test that proves it, so the name
    // the harness measures and the name this file claims cannot drift apart.
    t.equal(
      RUNTIME_SERVICE_REPLACE_CANONICAL_TARGET_HANDOFF_SCENARIO,
      'runtime-service-replace-canonical-target-handoff',
      'the scenario runner measures this proof under the sealed scenario name',
    );
    t.equal(
      completed.operationId,
      created.operationId,
      'the production workflow completes the created REPLACE',
    );
    t.equal(
      created.replicaId,
      EXPECTED_TARGET_REPLICA_ID,
      'runtime REPLACE claims the next canonical entity target',
    );
    t.equal(
      runtimeServiceReplicaBelongsToEntity(created.replicaId, ENTITY_ID),
      true,
      'the started target is visible to the runtime entity read model',
    );
    t.notOk(
      cache.get(SYSTEM_TABLE_NAME.SERVICES, SOURCE_REPLICA_ID),
      'the source retires after target activation',
    );

    const visibleAfterReplace = rebalancer.getCurrentReplicas();
    t.same(
      visibleAfterReplace.map((row) => row.service_id).sort(),
      [STABLE_REPLICA_ID, EXPECTED_TARGET_REPLICA_ID].sort(),
      'placement observes the stable and replacement replicas',
    );

    const result = await rebalancer.rebalance(
      TriggerType.PERIODIC,
      {
        ...REBALANCER_DEFAULT_POLICY.RUNTIME_SERVICE,
        targetReplicaCount: 2,
      },
    );
    for (const moveResult of result.moves || []) {
      const row = cache.get(
        SYSTEM_TABLE_NAME.REPLICA_OPERATIONS,
        moveResult.operationId,
      );
      if (row) {
        await coordinator.executeOperation(coordinator.rowToOperation(row));
      }
    }
    await drainImmediateWork();

    t.same(
      (result.moves || []).filter(
        (moveResult) => moveResult.operation === MoveType.ADD,
      ),
      [],
      'the next placement evaluation does not schedule a deficit ADD',
    );
    t.same(
      [...activeEffects].sort(),
      [STABLE_REPLICA_ID, EXPECTED_TARGET_REPLICA_ID].sort(),
      'exactly one canonical target execution effect remains',
    );
    t.same(
      activationRecord.executionEffects,
      [EXPECTED_TARGET_REPLICA_ID],
      'the canonical target starts one execution effect',
    );
    t.same(
      activationRecord.endpointRegistrations,
      [EXPECTED_TARGET_REPLICA_ID],
      'the canonical target registers one endpoint',
    );
    t.same(
      activationRecord.querySlotRegistrations,
      [EXPECTED_TARGET_REPLICA_ID],
      'the canonical target registers one query slot',
    );
  } finally {
    rebalancer.shutdown();
    await coordinator.shutdown();
  }
});

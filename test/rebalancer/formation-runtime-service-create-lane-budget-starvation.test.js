/**
 * Deterministic binding scenario for the runtime-service create reservation.
 *
 * Three non-priority REPLACEs fill the ordinary share of the plain ADD lane
 * while priority recovery holds one global slot. Repeated ordinary churn is
 * rejected, but a genuine runtime-service ADD crosses the real coordinator,
 * in-process router, runtime handler, lifecycle, services projection, and
 * UnifiedRebalancer replica read model.
 */

import {createHash} from 'node:crypto';

import {test} from '../../src/test-helpers/tap.js';
import {RuntimeServiceRebalancerOwner} from
  '../../src/bootstrap/shared/runtime-service-rebalancer-setup.js';
import {RuntimeServiceHandlerSetup} from
  '../../src/bootstrap/shared/runtime-service-handler-setup.js';
import {SYSTEM_TABLE_NAME} from
  '../../src/bootstrap/system-table-schemas-constants.js';
import {RUNTIME_KIND, RUNTIME_REPLICA_STATUS} from
  '../../src/constants/runtime.js';
import {canonicalJson} from
  '../../src/control-plane/owners/deployment-binding-contract.js';
import {deriveRequestServiceDefinitionId} from
  '../../src/control-plane/owners/request-binding-service-definition-contract.js';
import {projectRuntimeReplicaServicesRow} from
  '../../src/query/runtime-replica-state-projection.js';
import {
  ReplicaOperationMessageType,
} from '../../src/rebalancer/replica-operation-constants.js';
import {OperationType, ReplicaStatus} from
  '../../src/rebalancer/replica-status.js';
import {
  REBALANCE_COORDINATOR_EVENT,
  REBALANCER_SKIP_REASON,
} from '../../src/rebalancer/rebalancer-constants.js';
import {EntityType, MoveType} from
  '../../src/rebalancer/unified-rebalancer.js';
import {RuntimeDriverRegistry} from
  '../../src/runtime/runtime-driver-registry.js';
import {ServiceRuntimeLifecycle} from
  '../../src/runtime/service-runtime-lifecycle.js';
import {WasmComponentDriver} from
  '../../src/runtime/wasm-component-driver.js';
import {RuntimeServiceAdapter} from
  '../../src/service/adapters/runtime-service-adapter.js';
import {ServiceLifecycleManager} from
  '../../src/service/service-lifecycle-manager.js';
import {MessageRouter} from '../../src/transport/message-router.js';
import {
  createMockCache,
  createMockControlPlaneReadinessService,
  createTestCoordinator,
  createTestRebalancer,
} from './test-helpers.js';
import {
  REQUEST_CELL_PLACEMENT_SCENARIO,
} from './minimal-deployment-request-cell-placement-scenario.js';

const FIXED_NOW_MS = 1_900_000_000_000;
const NODE_ID = 'node-runtime-create-lane';
const BINDING_VERSION_ID = `binding-version-${'a'.repeat(64)}`;
const BINDING_DIGEST = `sha256:${'b'.repeat(64)}`;
const SERVICE_ENTITY_ID = deriveRequestServiceDefinitionId(
  BINDING_VERSION_ID,
);
const ARTIFACT_DIGEST = `sha256:${'c'.repeat(64)}`;
const RUNTIME_REF =
  `registry.example.test/acme/orders:1.0.0@${ARTIFACT_DIGEST}`;
const REPLICA_ID = `${SERVICE_ENTITY_ID}-r1`;
const OPERATION_ID = 'op-runtime-create-lane';
const HANDLER_ADDRESS = `${NODE_ID}/service/runtime-service-handler`;
const RUNTIME_PACKAGE_ID = 'tenant-package-runtime-create-lane';
const RUNTIME_EXPORT_NAME = 'run';
const RUNTIME_COMPONENT_BYTES = Buffer.from(
  'formation-runtime-service-create-lane',
);
const RUNTIME_PAYLOAD_DIGEST = `sha256:${createHash('sha256')
  .update(RUNTIME_COMPONENT_BYTES)
  .digest('hex')}`;
const RUNTIME_BUDGETS = Object.freeze({
  context_bytes: 0,
  cpu_time_ms: 50,
  input_bytes: 4096,
  memory_bytes: 64 * 1024 * 1024,
  output_bytes: 4096,
  wall_time_ms: 100,
});
const RUNTIME_MANIFEST = Object.freeze({
  artifact: Object.freeze({
    digest: ARTIFACT_DIGEST,
    media_type: 'application/wasm',
    ref: 'registry.example.test/acme/orders:1.0.0',
    type: 'oci',
  }),
  capabilities: Object.freeze([]),
  exports: Object.freeze([Object.freeze({
    interface: 'request_v1',
    name: RUNTIME_EXPORT_NAME,
    reads: Object.freeze([]),
    writes: Object.freeze([]),
  })]),
  name: 'formation-runtime-service-create-lane',
  runtime: Object.freeze({kind: RUNTIME_KIND.WASM_COMPONENT}),
  schema_version: 2,
  version: '1.0.0',
});
const RUNTIME_MANIFEST_DIGEST = `sha256:${createHash('sha256')
  .update(canonicalJson(RUNTIME_MANIFEST))
  .digest('hex')}`;

const QUIET_LOGGER = Object.freeze({
  debug() {},
  error() {},
  info() {},
  warn() {},
});

function buildChurnOperation(index) {
  const partitionId = `movie-spread-p${index}`;
  return {
    operation_id: `op-spread-replace-${index}`,
    type: OperationType.REPLACE,
    partition_id: partitionId,
    replica_id: `${partitionId}-r2`,
    source_node_id: NODE_ID,
    // Same-node REPLACE/self-move churn is one of the ordinary consumers of
    // this lane. Keeping both owner fields local also makes the shared test
    // SQL fixture faithfully select the row despite its source/target AND
    // simplification of production's owner-query OR predicate.
    target_node_id: NODE_ID,
    status: 'creating',
    workflow_step: 'CREATING',
    created_at: FIXED_NOW_MS,
    updated_at: FIXED_NOW_MS,
    completed_at: null,
    error_message: null,
    steps_history: '[]',
    entity_type: EntityType.PARTITION,
    entity_id: partitionId,
  };
}

function attachServiceDefinition(cache) {
  const definition = Object.freeze({
    service_id: SERVICE_ENTITY_ID,
    status: 'active',
    replica_count: 3,
    runtime_kind: RUNTIME_KIND.WASM_COMPONENT,
    runtime_ref: RUNTIME_REF,
    runtime_config: JSON.stringify({export_name: RUNTIME_EXPORT_NAME}),
    resource_budget: JSON.stringify(RUNTIME_BUDGETS),
    binding_version_id: BINDING_VERSION_ID,
    binding_digest: BINDING_DIGEST,
    binding_projection: JSON.stringify({
      binding_digest: BINDING_DIGEST,
      binding_version_id: BINDING_VERSION_ID,
      declaration: {
        budgets: RUNTIME_BUDGETS,
        capabilities: [],
        contexts: [],
        elasticity: {voters: 3, min_learners: 1, max_learners: 2},
        name: 'formation-runtime-service-create-lane',
        source: {kind: 'request', method: 'POST', path: '/orders'},
        target: {
          export_name: RUNTIME_EXPORT_NAME,
          manifest_digest: RUNTIME_MANIFEST_DIGEST,
          package_id: RUNTIME_PACKAGE_ID,
        },
      },
      tenant_id: 'tenant-a',
    }),
  });
  const bindingRow = Object.freeze({
    binding_version_id: BINDING_VERSION_ID,
    source_kind: 'request',
  });
  const baseGet = cache.get.bind(cache);
  const baseFilter = cache.filter.bind(cache);
  cache.get = (tableName, key) => {
    if (
      tableName === SYSTEM_TABLE_NAME.SERVICE_DEFINITIONS &&
      key === SERVICE_ENTITY_ID
    ) {
      return definition;
    }
    return baseGet(tableName, key);
  };
  cache.filter = (tableName, predicate) => {
    if (tableName === SYSTEM_TABLE_NAME.SERVICE_DEFINITIONS) {
      return [definition].filter(predicate);
    }
    if (tableName === SYSTEM_TABLE_NAME.SERVICE_BINDINGS) {
      return [bindingRow].filter(predicate);
    }
    return baseFilter(tableName, predicate);
  };
  cache.requestBindingDefinition = definition;
  return cache;
}

function createServicesProjectionGateway(cache) {
  return {
    async updateSystemTableRow(tableName, where, updateData) {
      const serviceId = where?.service_id;
      if (!serviceId || !cache.get(tableName, serviceId)) {
        return {success: true, partitionResult: {affectedRows: 0}};
      }
      cache.merge(tableName, serviceId, updateData);
      return {success: true, partitionResult: {affectedRows: 1}};
    },
    async insertSystemTableRow(tableName, row) {
      cache.upsert(tableName, row);
      return {success: true, partitionResult: {affectedRows: 1}};
    },
    async deleteSystemTableRow(tableName, where) {
      cache.delete(tableName, where?.service_id);
      return {success: true, partitionResult: {affectedRows: 1}};
    },
  };
}

function waitForMatchingEvent(emitter, eventName, predicate) {
  return new Promise((resolve) => {
    const listener = (event) => {
      if (!predicate(event)) return;
      emitter.removeListener(eventName, listener);
      resolve(event);
    };
    emitter.on(eventName, listener);
  });
}

function createPlacementComponentRuntime() {
  const running = new Set();
  return {
    health(serviceId) {
      return running.has(serviceId);
    },
    start(cell) {
      running.add(cell.serviceId);
    },
    stop(serviceId) {
      running.delete(serviceId);
    },
  };
}

async function assertOrdinaryChurnRemainsRejected(t, coordinator) {
  for (const partitionId of ['movie-spread-p4', 'movie-spread-p5']) {
    let rejection = null;
    try {
      await coordinator.ensureConcurrentOperationBudgetAllowed(
        OperationType.REPLACE,
        {
          partitionId,
          entityType: EntityType.PARTITION,
          entityId: partitionId,
        },
      );
    } catch (error) {
      rejection = error;
    }
    t.equal(
      rejection?.rebalanceSkipReason,
      REBALANCER_SKIP_REASON.BUDGET_EXCEEDED,
      `${partitionId} churn cannot consume the create-reserved slot`,
    );
  }
}

test('formation runtime-service create lane survives sustained REPLACE churn ' +
  'and reaches the authoritative replica read model', async (t) => {
  const originalDateNow = Date.now;
  Date.now = () => FIXED_NOW_MS;

  let coordinator = null;
  let messageRouter = null;
  let placementOwner = null;
  let runtimeServiceHandler = null;

  try {
    const systemTableCache = attachServiceDefinition(createMockCache({
      nodes: [{
        node_id: NODE_ID,
        status: 'active',
        connection_state: 'ready',
        ready_lease_expires_at: FIXED_NOW_MS + 60_000,
      }],
      replicaOperations: [1, 2, 3].map(buildChurnOperation),
    }));
    const cdcIntegrationService = {
      async insertSystemTableRow() {
        return {success: true, partitionResult: {affectedRows: 1}};
      },
      async updateSystemTableRow() {
        return {success: true, partitionResult: {affectedRows: 1}};
      },
    };
    const controlPlaneReadinessService =
      createMockControlPlaneReadinessService({systemTableCache});
    controlPlaneReadinessService.membershipPublicationService = {
      getLatestClusterPublicationSync() {
        return {
          status: 'PUBLISHED',
          priorityPartitionSummary: {satisfied: false},
        };
      },
    };

    messageRouter = new MessageRouter({nodeId: NODE_ID, inProcess: true});
    await messageRouter.initialize({startServer: false});
    messageRouter.logger = QUIET_LOGGER;

    const deliveries = [];
    const realDeliver = messageRouter.deliver.bind(messageRouter);
    messageRouter.deliver = async (target, request, options) => {
      deliveries.push({target, request, options});
      return realDeliver(target, request, options);
    };

    coordinator = createTestCoordinator({
      nodeId: NODE_ID,
      systemTableCache,
      cdcIntegrationService,
      messageRouter,
      controlPlaneReadinessService,
      enableTimeouts: false,
    });
    coordinator.config.maxConcurrentAdds = 5;
    coordinator.logger = QUIET_LOGGER;
    coordinator.workflowOwner.logger = QUIET_LOGGER;

    t.equal(
      coordinator.getReservedPriorityRecoveryAddSlots({
        partitionId: SERVICE_ENTITY_ID,
      }),
      1,
      'unsatisfied priority recovery holds one global ADD slot',
    );
    t.equal(
      coordinator.getConcurrentAddBudgetLimit({
        partitionId: SERVICE_ENTITY_ID,
      }),
      4,
      'four non-priority ADD slots remain after the recovery reservation',
    );
    t.equal(
      await coordinator.getConcurrentAddCount({
        partitionId: SERVICE_ENTITY_ID,
      }),
      3,
      'the authoritative budget owner observes all three churn operations',
    );
    t.equal(
      await coordinator.canStartAddOperation({
        partitionId: 'movie-spread-boundary',
        isGenuineCreate: false,
      }),
      false,
      'the real admission helper closes the ordinary lane at that boundary',
    );

    await assertOrdinaryChurnRemainsRejected(t, coordinator);

    const loadedArtifactTargets = [];
    const wasmDriver = new WasmComponentDriver({
      artifactLoader: async (target) => {
        loadedArtifactTargets.push(target);
        return {
          artifactDigest: ARTIFACT_DIGEST,
          bytes: RUNTIME_COMPONENT_BYTES,
          manifest: RUNTIME_MANIFEST,
          manifestDigest: RUNTIME_MANIFEST_DIGEST,
          packageId: RUNTIME_PACKAGE_ID,
          payloadDigest: RUNTIME_PAYLOAD_DIGEST,
        };
      },
      componentRuntime: createPlacementComponentRuntime(),
    });
    const runtimeDriverRegistry = new RuntimeDriverRegistry();
    runtimeDriverRegistry.register(wasmDriver);
    runtimeDriverRegistry.freeze();

    const runtimeLifecycle =
      new ServiceRuntimeLifecycle(runtimeDriverRegistry);

    const servicesProjectionGateway =
      createServicesProjectionGateway(systemTableCache);
    let resolveActiveProjection;
    const activeProjection = new Promise((resolve) => {
      resolveActiveProjection = resolve;
    });
    runtimeLifecycle.setStateProjectionWriter(async (serviceId, stateRow) => {
      await projectRuntimeReplicaServicesRow(
        servicesProjectionGateway,
        NODE_ID,
        serviceId,
        stateRow,
      );
      if (stateRow.status === RUNTIME_REPLICA_STATUS.ACTIVE) {
        resolveActiveProjection({serviceId, stateRow});
      }
    });

    const serviceLifecycleManager = new ServiceLifecycleManager({
      logger: QUIET_LOGGER,
    });
    serviceLifecycleManager.registerAdapter(new RuntimeServiceAdapter({
      serviceRuntimeLifecycle: runtimeLifecycle,
    }));

    ({runtimeServiceHandler} = RuntimeServiceHandlerSetup.create({
      nodeId: NODE_ID,
      messageRouter,
      cdcIntegrationService,
      systemTableCache,
      serviceLifecycleManager,
      executorOutcomeEmitter: coordinator.executorOutcomeEmitter,
    }));
    runtimeServiceHandler.logger = QUIET_LOGGER;

    let runtimeRebalancer = null;
    placementOwner = new RuntimeServiceRebalancerOwner({
      nodeId: NODE_ID,
      systemTableCache,
      cdcIntegrationService,
      tablePolicyService: {},
      messageRouter,
      rebalanceCoordinator: coordinator,
      serviceDefinitionsOwner: {
        reconcileRequestBinding: async () => ({
          serviceDefinition: systemTableCache.requestBindingDefinition,
        }),
      },
      createRebalancer: (options) => {
        runtimeRebalancer = createTestRebalancer({
          ...options,
          controlPlaneReadinessService,
          nowFn: () => FIXED_NOW_MS,
        });
        runtimeRebalancer.logger = QUIET_LOGGER;
        return runtimeRebalancer;
      },
    });
    placementOwner.setLeader(true);
    await placementOwner.waitForBindingRefresh();
    t.ok(runtimeRebalancer,
      'the request lineage is admitted by the existing placement owner');
    t.equal(runtimeRebalancer.entityId, SERVICE_ENTITY_ID,
      'the placement owner preserves the deterministic Binding service id');
    t.equal(runtimeRebalancer.entityType, EntityType.RUNTIME_SERVICE,
      'the placement owner uses the shared runtime_service rebalancer');
    t.equal(
      REQUEST_CELL_PLACEMENT_SCENARIO,
      'minimal-deployment-request-cell-placement',
      'the production-path proof is bound to the named Quest scenario',
    );

    const createOperation = coordinator.createOperation.bind(coordinator);
    coordinator.createOperation = (move) => createOperation({
      ...move,
      operationIntentId: OPERATION_ID,
    });

    const moveResult = await runtimeRebalancer.executeMoveViaCoordinator({
      type: MoveType.ADD,
      partitionId: SERVICE_ENTITY_ID,
      entityType: EntityType.RUNTIME_SERVICE,
      entityId: SERVICE_ENTITY_ID,
      nodeId: NODE_ID,
      replicaId: REPLICA_ID,
    });

    t.equal(moveResult.success, true,
      'runtime-service ADD is scheduled through UnifiedRebalancer');
    t.equal(moveResult.operationId, OPERATION_ID,
      'the real coordinator returns the fixed operation identity');

    const persistedRow = systemTableCache.get(
      SYSTEM_TABLE_NAME.REPLICA_OPERATIONS,
      OPERATION_ID,
    );
    t.ok(persistedRow, 'the coordinator persisted a replica_operations row');
    t.equal(persistedRow.entity_type, EntityType.RUNTIME_SERVICE,
      'persistence preserves the runtime-service entity type');
    t.equal(persistedRow.entity_id, SERVICE_ENTITY_ID,
      'persistence preserves the runtime-service entity identity');
    t.equal(persistedRow.replica_id, REPLICA_ID,
      'persistence preserves the canonical replica identity');
    t.equal(persistedRow.created_at, FIXED_NOW_MS,
      'operation persistence uses the deterministic timestamp');

    const persistedOperation = coordinator.rowToOperation(persistedRow);
    t.equal(persistedOperation.entityType, EntityType.RUNTIME_SERVICE,
      'the real row translator restores runtime-service dispatch routing');

    const operationCompleted = waitForMatchingEvent(
      coordinator,
      REBALANCE_COORDINATOR_EVENT.OPERATION_COMPLETED,
      (event) => event?.operation?.operationId === OPERATION_ID,
    );
    const dispatchResult = await coordinator.dispatchOperation(persistedRow);
    t.equal(dispatchResult.success, true,
      'public coordinator dispatch accepts the runtime create');

    const projected = await activeProjection;
    const completed = await operationCompleted;
    t.equal(loadedArtifactTargets.length, 1,
      'the placed request lineage loads its pinned Artifact once');
    t.equal(loadedArtifactTargets[0].packageId, RUNTIME_PACKAGE_ID,
      'the runtime owner receives the immutable Binding package identity');
    t.equal(projected.serviceId, REPLICA_ID,
      'real runtime lifecycle projects the replica identity ACTIVE');
    t.equal(completed.operation.workflowStep, 'ACTIVE',
      'executor outcome completes the coordinator-owned workflow');

    t.equal(deliveries.length, 1,
      'the coordinator performs one runtime create delivery');
    t.equal(deliveries[0].target, HANDLER_ADDRESS,
      'dispatch targets the registered runtime-service handler');
    t.equal(
      deliveries[0].request.type,
      ReplicaOperationMessageType.CREATE_REPLICA,
      'dispatch uses the real CREATE_REPLICA envelope',
    );

    const localReplica = runtimeServiceHandler.getLocalReplica(REPLICA_ID);
    t.equal(localReplica?.status, ReplicaStatus.ACTIVE,
      'the real runtime handler materializes an active local replica');

    const servicesRow = systemTableCache.get(
      SYSTEM_TABLE_NAME.SERVICES,
      REPLICA_ID,
    );
    t.equal(servicesRow?.service_type, EntityType.RUNTIME_SERVICE,
      'authoritative services projection records runtime_service');
    t.equal(servicesRow?.node_id, NODE_ID,
      'authoritative services projection records the target node');
    t.equal(servicesRow?.status, RUNTIME_REPLICA_STATUS.ACTIVE,
      'authoritative services projection reaches ACTIVE');

    const currentReplicas = runtimeRebalancer.getCurrentReplicas();
    t.equal(currentReplicas.length, 1,
      'UnifiedRebalancer now observes replicas > 0');
    t.equal(currentReplicas[0].service_id, REPLICA_ID,
      'the observed replica is the dispatched canonical replica');
  } finally {
    if (placementOwner) placementOwner.shutdown();
    if (runtimeServiceHandler && messageRouter) {
      runtimeServiceHandler.unregisterFromRouter(messageRouter);
    }
    if (coordinator) await coordinator.shutdown();
    if (messageRouter) await messageRouter.shutdown();
    Date.now = originalDateNow;
  }

  t.end();
});

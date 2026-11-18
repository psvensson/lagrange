import {test} from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import {ReplicaOperationRepository} from '../../src/rebalancer/replica-operation-repository.js';
import {ReplicaStatus, OperationType} from '../../src/rebalancer/replica-status.js';
import {WORKFLOW_STEP} from '../../src/constants/index.js';
import {UNIFIED_SERVICE_TYPE} from '../../src/constants/unified-service-lifecycle.js';
import {SERVICE_TYPE} from '../../src/constants/service.js';
import {createTestCoordinator} from './test-helpers.js';

const TEST_REPLICA_ID = 'replica-1';
const TEST_PARTITION_ID = 'partition-1';
const TEST_NODE_ID = 'node-2';
const SIBLING_REPLICA_ID = 'replica-sibling-99';

function createRepository(overrides = {}) {
  return new ReplicaOperationRepository({
    nodeId: 'node-1',
    systemTableCache: {
      get() {
        return null;
      },
      getAll() {
        return [];
      },
      filter() {
        return [];
      },
    },
    cdcIntegrationService: {
      async refreshAuthoritativeCacheRow() {
        return true;
      },
    },
    logger: {
      info() {},
      warn() {},
      error() {},
      debug() {},
    },
    controlPlaneSystemTableGateway: {
      async readAuthoritativeRows() {
        return {
          success: true,
          rows: [],
        };
      },
    },
    ...overrides,
  });
}

test('canonical-caller-closure', async () => {
  // 1. Audit src/rebalancer for deleted fallback option names
  const rebalancerDir = path.resolve('src/rebalancer');
  const files = fs.readdirSync(rebalancerDir).filter((name) =>
    name.endsWith('.js') && !name.endsWith('.test.js'),
  );

  const fallbackRegex = /\b(allowPartitionNodeFallback|allowCacheFallback)\b/u;
  const offending = [];
  for (const file of files) {
    const content = fs.readFileSync(path.join(rebalancerDir, file), 'utf8');
    if (fallbackRegex.test(content)) {
      offending.push(file);
    }
  }

  assert.deepEqual(
    offending,
    [],
    `No rebalancer files may reference deleted fallback options, found in: ${offending.join(', ')}`,
  );

  // 2. Canonical normalization preserves each entity type's identity contract
  const repository = createRepository();

  // Partition replica
  const partitionRow = {
    service_id: TEST_REPLICA_ID,
    replica_id: TEST_REPLICA_ID,
    partition_id: TEST_PARTITION_ID,
    node_id: TEST_NODE_ID,
    service_type: SERVICE_TYPE.PARTITION,
    status: ReplicaStatus.ACTIVE,
  };
  assert.equal(
    repository.doesObservedReplicaRowMatchTarget(
      partitionRow,
      TEST_REPLICA_ID,
      TEST_PARTITION_ID,
      TEST_NODE_ID,
    ),
    true,
    'partition replica row should match target identity',
  );

  // Runtime service
  const runtimeServiceRow = {
    service_id: 'runtime-entity-1-r1',
    replica_id: 'runtime-entity-1-r1',
    partition_id: 'runtime-entity-1',
    node_id: TEST_NODE_ID,
    service_type: UNIFIED_SERVICE_TYPE.RUNTIME_SERVICE,
    status: ReplicaStatus.ACTIVE,
  };
  assert.equal(
    repository.doesObservedReplicaRowMatchTarget(
      runtimeServiceRow,
      'runtime-entity-1-r1',
      'runtime-entity-1',
      TEST_NODE_ID,
    ),
    true,
    'runtime service row should match entity target identity',
  );

  // Message group
  const messageGroupRow = {
    service_id: 'mg-replica-1',
    replica_id: 'mg-replica-1',
    group_id: 'mg-group-1',
    node_id: TEST_NODE_ID,
    service_type: SERVICE_TYPE.MESSAGE_GROUP,
    status: ReplicaStatus.ACTIVE,
  };
  assert.equal(
    repository.doesObservedReplicaRowMatchTarget(
      messageGroupRow,
      'mg-replica-1',
      'mg-group-1',
      TEST_NODE_ID,
    ),
    true,
    'message group row should match group target identity',
  );
});

test('unavailable-and-wrong-identity-refused', async () => {
  // A. Gateway failure returns unavailable (never absent)
  const failingGatewayRepo = createRepository({
    controlPlaneSystemTableGateway: {
      async readAuthoritativeRows() {
        return {success: false, rows: []};
      },
    },
  });
  const failingObservation =
    await failingGatewayRepo.getActualReplicaObservation(
      TEST_REPLICA_ID,
      TEST_PARTITION_ID,
      TEST_NODE_ID,
    );
  assert.deepEqual(failingObservation, {
    state: 'unavailable',
    source: 'unavailable',
  });

  // B. Sibling replica on same node returns unavailable (never observed or absent)
  const siblingRepo = createRepository({
    controlPlaneSystemTableGateway: {
      async readAuthoritativeRows() {
        return {
          success: true,
          rows: [{
            service_id: SIBLING_REPLICA_ID,
            replica_id: SIBLING_REPLICA_ID,
            partition_id: TEST_PARTITION_ID,
            node_id: TEST_NODE_ID,
            service_type: SERVICE_TYPE.PARTITION,
            status: ReplicaStatus.ACTIVE,
          }],
        };
      },
    },
  });
  const siblingObservation = await siblingRepo.getActualReplicaObservation(
    TEST_REPLICA_ID,
    TEST_PARTITION_ID,
    TEST_NODE_ID,
  );
  assert.deepEqual(siblingObservation, {
    state: 'unavailable',
    source: 'unavailable',
  });

  // C. Contradictory identity rows return unavailable
  const contradictoryRepo = createRepository({
    controlPlaneSystemTableGateway: {
      async readAuthoritativeRows() {
        return {
          success: true,
          rows: [{
            service_id: TEST_REPLICA_ID,
            replica_id: 'mismatched-replica-id',
            partition_id: TEST_PARTITION_ID,
            node_id: TEST_NODE_ID,
            service_type: SERVICE_TYPE.PARTITION,
            status: ReplicaStatus.ACTIVE,
          }],
        };
      },
    },
  });
  const contradictoryObservation =
    await contradictoryRepo.getActualReplicaObservation(
      TEST_REPLICA_ID,
      TEST_PARTITION_ID,
      TEST_NODE_ID,
    );
  assert.deepEqual(contradictoryObservation, {
    state: 'unavailable',
    source: 'unavailable',
  });
});

test('exact-generation-completion', async () => {
  const precondition = {
    service_id: TEST_REPLICA_ID,
    replica_id: TEST_REPLICA_ID,
    partition_id: TEST_PARTITION_ID,
    node_id: TEST_NODE_ID,
    service_type: SERVICE_TYPE.PARTITION,
    status: ReplicaStatus.ACTIVE,
    created_at: 1000,
    state_entered_at: 2000,
    create_attempt_token: 'attempt-token-1',
    cleanup_token: null,
  };

  // 1. Older generation state_entered_at produces empty/ineligible precondition
  const olderRow = {
    service_id: TEST_REPLICA_ID,
    replica_id: TEST_REPLICA_ID,
    partition_id: TEST_PARTITION_ID,
    node_id: TEST_NODE_ID,
    service_type: SERVICE_TYPE.PARTITION,
    status: ReplicaStatus.ACTIVE,
    raft_role: 'follower',
    address: 'node-2/partition/replica-1',
    created_at: 1000,
    state_entered_at: 1500, // Older than 2000
    create_attempt_token: 'attempt-token-1',
  };

  const coordinator = createTestCoordinator();
  const olderObservation = {
    state: 'observed',
    source: 'authoritative',
    lifecycleStatus: ReplicaStatus.ACTIVE,
    lifecyclePrecondition: olderRow,
    observedTargetIdentity: {
      replicaId: TEST_REPLICA_ID,
      serviceId: TEST_REPLICA_ID,
      partitionId: TEST_PARTITION_ID,
      nodeId: TEST_NODE_ID,
      serviceType: SERVICE_TYPE.PARTITION,
      status: ReplicaStatus.ACTIVE,
    },
  };

  const operation = {
    operationId: 'op-exact-gen-1',
    type: OperationType.ADD,
    entityType: SERVICE_TYPE.PARTITION,
    entityId: TEST_PARTITION_ID,
    workflowStep: WORKFLOW_STEP.SYNCING,
    status: ReplicaStatus.SYNCING,
    replicaId: TEST_REPLICA_ID,
    partitionId: TEST_PARTITION_ID,
    targetNodeId: TEST_NODE_ID,
    createdAt: 1000,
    stepsHistory: [],
    lifecyclePrecondition: precondition,
  };

  // If observation has an older state_entered_at than expected precondition,
  // completion must be refused
  const olderMatches =
    olderObservation.lifecyclePrecondition.state_entered_at >=
    operation.lifecyclePrecondition.state_entered_at;
  assert.equal(olderMatches, false, 'older generation must not match');

  // 2. Exact generation matching settles operation through workflow
  const exactRow = {
    service_id: TEST_REPLICA_ID,
    replica_id: TEST_REPLICA_ID,
    partition_id: TEST_PARTITION_ID,
    node_id: TEST_NODE_ID,
    service_type: SERVICE_TYPE.PARTITION,
    status: ReplicaStatus.ACTIVE,
    raft_role: 'follower',
    address: 'node-2/partition/replica-1',
    created_at: 1000,
    state_entered_at: 2000,
    create_attempt_token: 'attempt-token-1',
  };

  const exactRepo = createRepository({
    controlPlaneSystemTableGateway: {
      async readAuthoritativeRows() {
        return {success: true, rows: [exactRow]};
      },
    },
  });

  const exactObservation = await exactRepo.getActualReplicaObservation(
    TEST_REPLICA_ID,
    TEST_PARTITION_ID,
    TEST_NODE_ID,
  );

  assert.equal(exactObservation.state, 'observed');
  assert.equal(exactObservation.lifecycleStatus, ReplicaStatus.ACTIVE);
  assert.equal(
    exactObservation.lifecyclePrecondition.state_entered_at,
    precondition.state_entered_at,
  );

  // Settlement through coordinator
  let reservationReleased = false;
  coordinator.workflowOwner.releaseReservationForOperation = async () => {
    reservationReleased = true;
  };
  await coordinator.workflowOwner.reconcileActiveReplicaStatus(operation);

  assert.equal(
    operation.workflowStep,
    WORKFLOW_STEP.ACTIVE,
    'operation should settle to ACTIVE',
  );
  assert.equal(
    reservationReleased,
    true,
    'reservation should be released upon settlement',
  );
});

test('restart-and-lost-answer-obligations', async () => {
  // Across lost-answer / node restart boundaries where authoritative read fails:
  const coordinator = createTestCoordinator();
  coordinator.workflowOwner.repository.getActualReplicaObservation =
    async () => ({
      state: 'unavailable',
      source: 'unavailable',
    });

  const inFlightOperation = {
    operationId: 'op-restart-retained-1',
    type: OperationType.ADD,
    workflowStep: WORKFLOW_STEP.CREATING,
    status: ReplicaStatus.CREATING,
    replicaId: TEST_REPLICA_ID,
    partitionId: TEST_PARTITION_ID,
    targetNodeId: TEST_NODE_ID,
    createdAt: Date.now(),
  };

  // Reconciling lifecycle under unavailable observation must retain obligation
  await coordinator.workflowOwner.reconcileOperationLifecycle(
    inFlightOperation,
    {cause: 'recovery'},
  );

  assert.notEqual(
    inFlightOperation.workflowStep,
    WORKFLOW_STEP.ACTIVE,
    'must not complete on unavailable observation',
  );
  assert.notEqual(
    inFlightOperation.workflowStep,
    WORKFLOW_STEP.FAILED,
    'must not fail on transient lost-answer observation',
  );
  assert.equal(
    inFlightOperation.workflowStep,
    WORKFLOW_STEP.CREATING,
    'obligation remains owned in in-flight workflow step',
  );
});

test('deleted-fallback-cannot-be-reactivated', async () => {
  // Test that passing {allowPartitionNodeFallback: true, allowCacheFallback: true}
  // is ignored and does NOT activate deleted fallbacks:

  // 1. Authoritative getActualReplicaObservation with allowPartitionNodeFallback: true
  // Sibling exists in DB on (partition-1, node-2), but target replica-1 has no row.
  const repoWithSibling = createRepository({
    controlPlaneSystemTableGateway: {
      async readAuthoritativeRows(tableName, sql, params = []) {
        if (params[0] === TEST_REPLICA_ID) {
          return {success: true, rows: []};
        }
        if (params[0] === TEST_PARTITION_ID && params[1] === TEST_NODE_ID) {
          return {
            success: true,
            rows: [{
              service_id: SIBLING_REPLICA_ID,
              replica_id: SIBLING_REPLICA_ID,
              partition_id: TEST_PARTITION_ID,
              node_id: TEST_NODE_ID,
              service_type: SERVICE_TYPE.PARTITION,
              status: ReplicaStatus.ACTIVE,
            }],
          };
        }
        return {success: true, rows: []};
      },
    },
  });

  const fallbackObservation =
    await repoWithSibling.getActualReplicaObservation(
      TEST_REPLICA_ID,
      TEST_PARTITION_ID,
      TEST_NODE_ID,
      {allowPartitionNodeFallback: true},
    );

  // Must NOT observe sibling replica
  assert.notEqual(
    fallbackObservation.state,
    'observed',
    'allowPartitionNodeFallback: true must not observe sibling replica',
  );
  assert.notEqual(
    fallbackObservation.observedTargetIdentity?.replicaId,
    SIBLING_REPLICA_ID,
    'observed identity must not be sibling replica',
  );

  // 2. Authoritative failure with allowCacheFallback: true
  const repoWithCache = createRepository({
    controlPlaneSystemTableGateway: {
      async readAuthoritativeRows() {
        return {success: false, rows: []};
      },
    },
    systemTableCache: {
      get() {
        return {
          service_id: TEST_REPLICA_ID,
          replica_id: TEST_REPLICA_ID,
          partition_id: TEST_PARTITION_ID,
          node_id: TEST_NODE_ID,
          status: ReplicaStatus.ACTIVE,
        };
      },
      getAll() {
        return [];
      },
      filter() {
        return [];
      },
    },
  });

  const cacheFallbackObservation =
    await repoWithCache.getActualReplicaObservation(
      TEST_REPLICA_ID,
      TEST_PARTITION_ID,
      TEST_NODE_ID,
      {allowCacheFallback: true},
    );

  assert.deepEqual(
    cacheFallbackObservation,
    {state: 'unavailable', source: 'unavailable'},
    'allowCacheFallback: true must be ignored and return unavailable',
  );

  // 3. Cache exact target with allowPartitionNodeFallback: true
  const cacheWithSibling = createRepository({
    systemTableCache: {
      get() {
        return null;
      },
      getAll() {
        return [{
          service_id: SIBLING_REPLICA_ID,
          replica_id: SIBLING_REPLICA_ID,
          partition_id: TEST_PARTITION_ID,
          node_id: TEST_NODE_ID,
          service_type: SERVICE_TYPE.PARTITION,
          status: ReplicaStatus.ACTIVE,
        }];
      },
      filter(tableName, predicate) {
        return this.getAll().filter(predicate);
      },
    },
  });

  const cachedRow = cacheWithSibling.getObservedReplicaRowFromCache(
    TEST_REPLICA_ID,
    TEST_PARTITION_ID,
    TEST_NODE_ID,
    {allowPartitionNodeFallback: true},
  );
  assert.equal(
    cachedRow,
    null,
    'getObservedReplicaRowFromCache with allowPartitionNodeFallback: true must return null',
  );

  const cachedStatus = cacheWithSibling.getObservedReplicaStatusFromCache(
    TEST_REPLICA_ID,
    TEST_PARTITION_ID,
    TEST_NODE_ID,
    {allowPartitionNodeFallback: true},
  );
  assert.equal(
    cachedStatus,
    null,
    'getObservedReplicaStatusFromCache with allowPartitionNodeFallback: true must return null',
  );
});

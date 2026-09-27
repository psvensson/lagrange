import {deepFreeze} from '../../src/raft/raft-operation-port.js';
import {
  RAFT_LEADERSHIP_TRANSFER_REASON,
  RAFT_LEADERSHIP_TRANSFER_SUCCESSOR,
  RAFT_OPERATION_OUTCOME,
} from '../../src/raft/raft-operation-port-constants.js';
import {REPLICA_HANDLER_LEADER_HANDOFF_BRANCH} from
  '../../src/node/replica-handler-leader-handoff-methods.js';

export async function registerReplicaHandlerTailMoreTests({
  t,
  fs,
  path,
  ReplicaHandler,
  OperationType,
  ReplicaStatus,
  SYSTEM_TABLE_NAME,
  ReplicaStateMachine,
  WORKFLOW_STEP,
  ReplicaOperationMessageType,
  ReplicaOperationResponseStatus,
  RAFT_ROLE,
  TEST_STEP_DOWN_OPERATION_ID,
  TEST_STEP_DOWN_PARTITION_ID,
  TEST_STEP_DOWN_REPLICA_ID,
  TEST_STEP_DOWN_REASON,
  TEST_STEP_DOWN_TARGET_ELECTION_REASON,
  TEST_STEP_DOWN_CORRELATION_ID,
  TEST_STATUS_RETRY_PARTITION_ID,
  TEST_STATUS_RETRY_REPLICA_ID,
  TEST_STATUS_RETRY_OPERATION_ID,
  TEST_STATUS_RETRY_SERVICE_ID,
  TEST_STATUS_RETRY_SERVICE_ADDRESS,
  TEST_STATUS_RETRY_ERROR,
  createMockCDCService,
  createMockPartitionServiceFactory,
  createSeededCache,
  createMetadataOnlyCache,
  seedReplicaOperation,
  applyGatewayMutationToCache,
  waitForReplicaEvent,
  tempDir,
}) {
  t.test('registerExistingReplica - registers and is idempotent', async (t) => {
    const cache = createSeededCache();
    const mockCDC = createMockCDCService(cache);

    const handler = new ReplicaHandler({
      nodeId: 'test-node',
      dataDir: tempDir,
      systemTableCache: cache,
      cdcIntegrationService: mockCDC,
      createPartitionService: createMockPartitionServiceFactory(),
    });

    handler.initialize();

    // Register replica
    handler.registerExistingReplica({
      replicaId: 'replica-1',
      partitionId: 'partition-1',
      tableName: 'test_table',
      status: ReplicaStatus.ACTIVE,
    });

    const replica = handler.getLocalReplica('replica-1');
    t.ok(replica, 'replica registered');
    t.equal(replica.status, ReplicaStatus.ACTIVE, 'status correct');

    // Register again (idempotent)
    handler.registerExistingReplica({
      replicaId: 'replica-1',
      partitionId: 'partition-1',
      tableName: 'test_table',
      status: ReplicaStatus.SYNCING, // Different status
    });

    // Should still have original status
    const replica2 = handler.getLocalReplica('replica-1');
    t.equal(replica2.status, ReplicaStatus.ACTIVE, 'status unchanged');

    handler.shutdown();
  });

  t.test('getStats returns correct statistics', async (t) => {
    const cache = createSeededCache();
    const mockCDC = createMockCDCService(cache);

    const handler = new ReplicaHandler({
      nodeId: 'test-node',
      dataDir: tempDir,
      systemTableCache: cache,
      cdcIntegrationService: mockCDC,
      createPartitionService: createMockPartitionServiceFactory(),
    });

    handler.initialize();

    // Add some local replicas
    handler.localReplicas.set('replica-1', {status: ReplicaStatus.ACTIVE});
    handler.localReplicas.set('replica-2', {status: ReplicaStatus.ACTIVE});

    // Add in-progress operation
    handler.inProgressOperations.set('op-1', {type: 'CREATE_REPLICA'});

    const stats = handler.getStats();

    t.equal(stats.nodeId, 'test-node', 'correct node ID');
    t.equal(stats.initialized, true, 'initialized flag correct');
    t.equal(stats.localReplicaCount, 2, 'correct local replica count');
    t.equal(stats.inProgressOperationCount, 1, 'correct in-progress count');
    t.ok(stats.pendingRequestTracker, 'pending request tracker aggregate exists');

    handler.shutdown();
  });

  t.test('getStats aggregates pending request tracker telemetry',
    async (t) => {
      const cache = createSeededCache();
      const mockCDC = createMockCDCService(cache);

      const handler = new ReplicaHandler({
        nodeId: 'test-node',
        dataDir: tempDir,
        systemTableCache: cache,
        cdcIntegrationService: mockCDC,
        createPartitionService: createMockPartitionServiceFactory(),
      });

      handler.initialize();
      handler.localServices.set('replica-a', {
        getStats() {
          return {
            pendingRequestTracker: {
              pendingCount: 2,
              maxPendingRequests: 5,
              availableCapacity: 3,
              trackedTotal: 10,
              resolvedTotal: 7,
              rejectedTotal: 3,
              timedOutTotal: 1,
              staleCleanedTotal: 0,
              backpressureRejectTotal: 2,
              maxPendingObserved: 4,
            },
          };
        },
      });
      handler.localServices.set('replica-b', {
        getStats() {
          return {
            pendingRequestTracker: {
              pendingCount: 1,
              maxPendingRequests: 10,
              availableCapacity: 9,
              trackedTotal: 8,
              resolvedTotal: 6,
              rejectedTotal: 2,
              timedOutTotal: 0,
              staleCleanedTotal: 1,
              backpressureRejectTotal: 0,
              maxPendingObserved: 3,
            },
          };
        },
      });

      const stats = handler.getStats();
      const pending = stats.pendingRequestTracker;

      t.equal(
        pending.replicaCountWithTracker,
        2,
        'should count services with tracker telemetry',
      );
      t.equal(pending.pendingCount, 3, 'aggregates pending counts');
      t.equal(pending.maxPendingRequests, 15, 'aggregates capacity');
      t.equal(pending.availableCapacity, 12, 'aggregates available capacity');
      t.equal(pending.backpressureRejectTotal, 2, 'aggregates backpressure');
      t.equal(pending.maxPendingObserved, 4, 'retains highest observed pending');
      t.equal(pending.saturationPercent, 20, 'computes aggregate saturation');

      handler.shutdown();
    });

  t.test('emits events during lifecycle operations', async (t) => {
    const cache = createSeededCache();
    seedReplicaOperation(cache, 'op-1');
    const mockCDC = createMockCDCService(cache);
    const events = [];

    const handler = new ReplicaHandler({
      nodeId: 'test-node',
      cdcIntegrationService: mockCDC,
      systemTableCache: cache,
      createPartitionService: createMockPartitionServiceFactory(),
      dataDir: tempDir,
    });

    handler.on('replicaCreated', (e) => events.push({type: 'replicaCreated', ...e}));

    handler.initialize();

    const created = waitForReplicaEvent(
      handler,
      'replicaCreated',
      'replicaCreationFailed',
    );

    // Create a replica
    const createRequest = {
      operationId: 'op-1',
      partitionId: 'partition-1',
      replicaId: 'replica-1',
    };

    await handler.handleCreateReplica(createRequest);

    await created;

    // Check events were emitted
    const createdEvents = events.filter((e) => e.type === 'replicaCreated');
    t.equal(createdEvents.length, 1, 'replicaCreated event emitted');
    t.equal(createdEvents[0].replicaId, 'replica-1', 'correct replicaId');

    handler.shutdown();
  });

  t.test('async creation updates status via CDC', async (t) => {
    const cache = createSeededCache();
    seedReplicaOperation(cache, 'op-1');
    const mockCDC = createMockCDCService(cache);

    const handler = new ReplicaHandler({
      nodeId: 'test-node',
      cdcIntegrationService: mockCDC,
      systemTableCache: cache,
      createPartitionService: createMockPartitionServiceFactory(),
      dataDir: tempDir,
    });

    handler.initialize();

    const created = waitForReplicaEvent(
      handler,
      'replicaCreated',
      'replicaCreationFailed',
    );

    const request = {
      operationId: 'op-1',
      partitionId: 'partition-1',
      replicaId: 'replica-1',
    };

    await handler.handleCreateReplica(request);
    await created;

    // Check CDC operations
    const syncingUpdate = mockCDC.operations.find(
      (op) => op.type === 'update' && op.data.status === ReplicaStatus.SYNCING,
    );
    t.ok(syncingUpdate, 'syncing status update via CDC');

    const activeUpdate = mockCDC.operations.find(
      (op) => op.type === 'update' && op.data.status === ReplicaStatus.ACTIVE,
    );
    t.ok(activeUpdate, 'active status update via CDC');

    handler.shutdown();
  });

  t.test('status update does not overwrite raft role owned by partition service',
    async (t) => {
      const cache = createMetadataOnlyCache({partitionId: 'partition-1'});
      cache.applySystemTableChange(SYSTEM_TABLE_NAME.SERVICES, 'INSERT', {
        service_id: 'replica-1',
        service_type: 'partition',
        partition_id: 'partition-1',
        node_id: 'test-node',
        replica_id: 'replica-1',
        raft_role: null,
        status: ReplicaStatus.SYNCING,
        address: 'test-node/partition/replica-1',
        created_at: Date.now(),
        updated_at: Date.now(),
      });
      const mockCDC = createMockCDCService(cache);

      const handler = new ReplicaHandler({
        nodeId: 'test-node',
        cdcIntegrationService: mockCDC,
        systemTableCache: cache,
        createPartitionService: createMockPartitionServiceFactory(),
        dataDir: tempDir,
      });

      handler.localServices.set('replica-1', {
        getRole() {
          return RAFT_ROLE.LEADER;
        },
      });

      await handler.updateReplicaStatus('replica-1', ReplicaStatus.ACTIVE, {
        partitionId: 'partition-1',
      });

      const activeUpdate = mockCDC.operations.find((op) =>
        op.type === 'update' && op.data.service_id === 'replica-1' &&
        op.data.status === ReplicaStatus.ACTIVE,
      );
      t.ok(activeUpdate, 'status update should emit an update');
      t.notOk(
        Object.prototype.hasOwnProperty.call(activeUpdate?.data || {}, 'raft_role'),
        'status update should not write raft_role',
      );
    });

  t.test('create replica routes lifecycle through replica state machine',
    async (t) => {
      const cache = createSeededCache();
      seedReplicaOperation(cache, 'op-1');
      const mockCDC = createMockCDCService(cache);
      const transitions = [];
      const mockReplicaStateMachine = {
        transition(replicaId, newState, context) {
          transitions.push({replicaId, newState, context});
          return true;
        },
        getState() {
          return null;
        },
        registerReplicaSnapshot() {
          return true;
        },
      };

      const handler = new ReplicaHandler({
        nodeId: 'test-node',
        cdcIntegrationService: mockCDC,
        systemTableCache: cache,
        replicaStateMachine: mockReplicaStateMachine,
        createPartitionService: createMockPartitionServiceFactory(),
        dataDir: tempDir,
      });

      handler.initialize();

      const created = waitForReplicaEvent(
        handler,
        'replicaCreated',
        'replicaCreationFailed',
      );

      await handler.handleCreateReplica({
        operationId: 'op-1',
        partitionId: 'partition-1',
        replicaId: 'replica-1',
      });
      await created;

      t.same(
        transitions.map((transition) => transition.newState),
        [
          ReplicaStatus.PENDING,
          ReplicaStatus.CREATING,
          ReplicaStatus.SYNCING,
          ReplicaStatus.ACTIVE,
        ],
        'handler should drive replica lifecycle via the shared state machine',
      );
    });

  t.test('updateReplicaStatus throws when the replica state machine rejects a transition',
    async (t) => {
      const cache = createSeededCache();
      const mockCDC = createMockCDCService(cache);

      const handler = new ReplicaHandler({
        nodeId: 'test-node',
        cdcIntegrationService: mockCDC,
        systemTableCache: cache,
        replicaStateMachine: {
          getState() {
            return null;
          },
          transition() {
            return false;
          },
        },
        createPartitionService: createMockPartitionServiceFactory(),
        dataDir: tempDir,
      });

      await t.rejects(
        handler.updateReplicaStatus('replica-1', ReplicaStatus.CREATING, {
          partitionId: 'partition-1',
        }),
        /Replica state transition rejected/,
        'invalid transitions should fail fast instead of being treated as success',
      );
    });

  t.test('async removal updates status via CDC', async (t) => {
    const cache = createSeededCache();
    seedReplicaOperation(cache, 'op-1', {type: 'REMOVE'});
    cache.applySystemTableChange(SYSTEM_TABLE_NAME.SERVICES, 'INSERT', {
      service_id: 'replica-1',
      service_type: 'partition',
      partition_id: 'partition-1',
      node_id: 'test-node',
      replica_id: 'replica-1',
      raft_role: RAFT_ROLE.FOLLOWER,
      status: ReplicaStatus.ACTIVE,
      address: 'test-node/partition/replica-1',
      created_at: Date.now(),
      updated_at: Date.now(),
    });
    const mockCDC = createMockCDCService(cache);

    const handler = new ReplicaHandler({
      nodeId: 'test-node',
      cdcIntegrationService: mockCDC,
      systemTableCache: cache,
      dataDir: tempDir,
      createPartitionService: createMockPartitionServiceFactory(),
    });

    handler.initialize();

    const removed = waitForReplicaEvent(
      handler,
      'replicaRemoved',
      'replicaRemovalFailed',
    );

    // Create partition directory structure for cleanup
    const partitionDir = path.join(tempDir, 'partitions', 'partition-1');
    fs.mkdirSync(partitionDir, {recursive: true});

    // Pre-populate local replica
    handler.localReplicas.set('replica-1', {
      replicaId: 'replica-1',
      partitionId: 'partition-1',
      status: ReplicaStatus.ACTIVE,
      service: {
        async shutdown() {},
      },
    });

    const request = {
      operationId: 'op-1',
      partitionId: 'partition-1',
      replicaId: 'replica-1',
      reason: 'rebalancing',
    };

    await handler.handleRemoveReplica(request);
    await removed;

    // Check CDC operations
    const removingUpdate = mockCDC.operations.find(
      (op) => op.type === 'update' && op.data.status === ReplicaStatus.REMOVING,
    );
    t.ok(removingUpdate, 'removing status update via CDC');

    const deleteOp = mockCDC.operations.find(
      (op) => op.type === 'delete' && op.tableName === SYSTEM_TABLE_NAME.SERVICES,
    );
    t.ok(deleteOp, 'service row deleted via CDC');
    t.same(deleteOp.whereClause, {
      service_id: 'replica-1',
      service_type: 'partition',
      partition_id: 'partition-1',
      node_id: 'test-node',
    }, 'partition removal should delete through the canonical typed owner path');

    handler.shutdown();
  });

  t.test('handleRemoveReplica moves failed replicas through the durable removing protocol',
    async (t) => {
      const TEST_FAILED_REMOVE_OPERATION_ID = 'op-failed-remove-1';
      const TEST_FAILED_REMOVE_PARTITION_ID = 'partition-failed-remove-1';
      const TEST_FAILED_REMOVE_REPLICA_ID = 'replica-failed-remove-1';
      const TEST_FAILED_REMOVE_ADDRESS =
        `test-node/partition/${TEST_FAILED_REMOVE_REPLICA_ID}`;
      const cache = createSeededCache();
      seedReplicaOperation(cache, TEST_FAILED_REMOVE_OPERATION_ID, {
        type: 'REMOVE',
      });
      cache.applySystemTableChange(SYSTEM_TABLE_NAME.SERVICES, 'INSERT', {
        service_id: TEST_FAILED_REMOVE_REPLICA_ID,
        service_type: 'partition',
        partition_id: TEST_FAILED_REMOVE_PARTITION_ID,
        node_id: 'test-node',
        replica_id: TEST_FAILED_REMOVE_REPLICA_ID,
        raft_role: RAFT_ROLE.FOLLOWER,
        status: ReplicaStatus.FAILED,
        address: TEST_FAILED_REMOVE_ADDRESS,
        created_at: Date.now(),
        updated_at: Date.now(),
      });
      const mockCDC = createMockCDCService(cache);

      const handler = new ReplicaHandler({
        nodeId: 'test-node',
        cdcIntegrationService: mockCDC,
        systemTableCache: cache,
        dataDir: tempDir,
        createPartitionService: createMockPartitionServiceFactory(),
      });

      handler.initialize();
      let shutdownCalls = 0;
      const trackedService = {
        async shutdown() {
          shutdownCalls += 1;
        },
      };
      handler.localReplicas.set(TEST_FAILED_REMOVE_REPLICA_ID, {
        replicaId: TEST_FAILED_REMOVE_REPLICA_ID,
        partitionId: TEST_FAILED_REMOVE_PARTITION_ID,
        status: ReplicaStatus.FAILED,
        service: trackedService,
      });
      handler.localServices.set(TEST_FAILED_REMOVE_REPLICA_ID, trackedService);

      const removed = waitForReplicaEvent(
        handler,
        'replicaRemoved',
        'replicaRemovalFailed',
      );

      const response = await handler.handleRemoveReplica({
        operationId: TEST_FAILED_REMOVE_OPERATION_ID,
        partitionId: TEST_FAILED_REMOVE_PARTITION_ID,
        replicaId: TEST_FAILED_REMOVE_REPLICA_ID,
        reason: 'rebalancing',
      });

      t.equal(
        response.status,
        ReplicaOperationResponseStatus.INITIATED,
        'failed source removal should still enter the canonical async remove path',
      );
      await removed;

      t.ok(
        mockCDC.operations.some((op) =>
          op.type === 'update' &&
          op.tableName === SYSTEM_TABLE_NAME.SERVICES &&
          op.whereClause?.service_id === TEST_FAILED_REMOVE_REPLICA_ID &&
          op.data.status === ReplicaStatus.REMOVING,
        ),
        'failed source removal should publish REMOVING before cleanup',
      );
      t.notOk(
        cache.get(SYSTEM_TABLE_NAME.SERVICES, TEST_FAILED_REMOVE_REPLICA_ID),
        'failed source removal should still delete the authoritative service row',
      );
      t.equal(
        handler.getLocalReplica(TEST_FAILED_REMOVE_REPLICA_ID)?.status,
        ReplicaStatus.REMOVED,
        'failed source removal should still converge the local replica to removed',
      );
      t.notOk(
        handler.localServices.has(TEST_FAILED_REMOVE_REPLICA_ID),
        'failed source removal should clear the tracked local runtime',
      );
      t.equal(
        shutdownCalls,
        1,
        'failed source removal should still shut down the lingering local runtime once',
      );

      handler.shutdown();
    });

  t.test('handleRemoveReplica tolerates one late failed-state race before durable cleanup',
    async (t) => {
      const TEST_LATE_FAILED_REMOVE_OPERATION_ID = 'op-late-failed-remove-1';
      const TEST_LATE_FAILED_REMOVE_PARTITION_ID =
        'partition-late-failed-remove-1';
      const TEST_LATE_FAILED_REMOVE_REPLICA_ID =
        'replica-late-failed-remove-1';
      const TEST_LATE_FAILED_REMOVE_ADDRESS =
        `test-node/partition/${TEST_LATE_FAILED_REMOVE_REPLICA_ID}`;
      const cache = createSeededCache();
      seedReplicaOperation(cache, TEST_LATE_FAILED_REMOVE_OPERATION_ID, {
        type: 'REMOVE',
      });
      cache.applySystemTableChange(SYSTEM_TABLE_NAME.SERVICES, 'INSERT', {
        service_id: TEST_LATE_FAILED_REMOVE_REPLICA_ID,
        service_type: 'partition',
        partition_id: TEST_LATE_FAILED_REMOVE_PARTITION_ID,
        node_id: 'test-node',
        replica_id: TEST_LATE_FAILED_REMOVE_REPLICA_ID,
        raft_role: RAFT_ROLE.FOLLOWER,
        status: ReplicaStatus.ACTIVE,
        address: TEST_LATE_FAILED_REMOVE_ADDRESS,
        created_at: Date.now(),
        updated_at: Date.now(),
      });
      const mockCDC = createMockCDCService(cache);
      let replicaState = ReplicaStatus.ACTIVE;
      let removingAttempts = 0;
      let durableRemovingObserved = false;
      let durableRemovalCompleted = false;
      const raceReplicaStateMachine = {
        getState() {
          return replicaState;
        },
        transition(_replicaId, newState) {
          if (newState === ReplicaStatus.REMOVING) {
            removingAttempts += 1;
            if (removingAttempts === 1) {
              replicaState = ReplicaStatus.FAILED;
              return false;
            }
            replicaState = ReplicaStatus.REMOVING;
            durableRemovingObserved = true;
            return true;
          }
          replicaState = newState;
          return true;
        },
        completeDurableRemoval() {
          replicaState = ReplicaStatus.REMOVED;
          durableRemovalCompleted = true;
        },
      };

      const handler = new ReplicaHandler({
        nodeId: 'test-node',
        cdcIntegrationService: mockCDC,
        systemTableCache: cache,
        replicaStateMachine: raceReplicaStateMachine,
        dataDir: tempDir,
        createPartitionService: createMockPartitionServiceFactory(),
      });

      handler.initialize();
      let shutdownCalls = 0;
      const trackedService = {
        async shutdown() {
          shutdownCalls += 1;
        },
      };
      handler.localReplicas.set(TEST_LATE_FAILED_REMOVE_REPLICA_ID, {
        replicaId: TEST_LATE_FAILED_REMOVE_REPLICA_ID,
        partitionId: TEST_LATE_FAILED_REMOVE_PARTITION_ID,
        status: ReplicaStatus.ACTIVE,
        service: trackedService,
      });
      handler.localServices.set(
        TEST_LATE_FAILED_REMOVE_REPLICA_ID,
        trackedService,
      );

      const removed = waitForReplicaEvent(
        handler,
        'replicaRemoved',
        'replicaRemovalFailed',
      );

      const response = await handler.handleRemoveReplica({
        operationId: TEST_LATE_FAILED_REMOVE_OPERATION_ID,
        partitionId: TEST_LATE_FAILED_REMOVE_PARTITION_ID,
        replicaId: TEST_LATE_FAILED_REMOVE_REPLICA_ID,
        reason: 'rebalancing',
      });

      t.equal(
        response.status,
        ReplicaOperationResponseStatus.INITIATED,
        'the canonical async remove path should stay active through the failed-state race',
      );
      await removed;

      t.equal(removingAttempts, 2,
        'the status boundary retries removal after the concurrent FAILED');
      t.equal(durableRemovingObserved, true,
        'the race still converges through durable REMOVING before cleanup');

      t.notOk(
        cache.get(SYSTEM_TABLE_NAME.SERVICES, TEST_LATE_FAILED_REMOVE_REPLICA_ID),
        'late failed-state removal should still delete the authoritative service row',
      );
      t.equal(
        handler.getLocalReplica(TEST_LATE_FAILED_REMOVE_REPLICA_ID)?.status,
        ReplicaStatus.REMOVED,
        'late failed-state removal should still converge the local replica to removed',
      );
      t.equal(
        replicaState,
        ReplicaStatus.REMOVED,
        'late failed-state removal should finish with one canonical removed lifecycle state',
      );
      t.equal(
        durableRemovalCompleted,
        true,
        'late failed-state removal should still complete durable removal bookkeeping',
      );
      t.equal(
        shutdownCalls,
        1,
        'late failed-state removal should still shut down the local runtime once',
      );

      handler.shutdown();
    });

  // Lead ruling (fix-f5 follow-up): a removal effect never proceeds without
  // a durable REMOVING row. A REMOVING write that exhausts its retry on
  // retryable pressure defers the REMOVE typed (no outcome, no cleanup);
  // the durable owner re-dispatches it.
  t.test('handleRemoveReplica defers the removal when retryable pressure keeps its removing-status write from landing',
    async (t) => {
      const TEST_PRESSURED_REMOVE_OPERATION_ID = 'op-pressured-remove-1';
      const TEST_PRESSURED_REMOVE_PARTITION_ID = 'partition-pressured-remove-1';
      const TEST_PRESSURED_REMOVE_REPLICA_ID = 'replica-pressured-remove-1';
      const TEST_PRESSURED_REMOVE_ADDRESS =
        `test-node/partition/${TEST_PRESSURED_REMOVE_REPLICA_ID}`;
      const TEST_PRESSURED_REMOVE_ERROR =
        'control_plane_pressure_degraded';
      const TEST_PRESSURED_REMOVE_ERROR_CODE =
        'CONTROL_PLANE_PRESSURE_DEGRADED';
      const TEST_PRESSURED_REMOVE_REASON = 'rebalancing';
      const cache = createSeededCache();
      seedReplicaOperation(cache, TEST_PRESSURED_REMOVE_OPERATION_ID, {
        type: 'REMOVE',
      });
      cache.applySystemTableChange(SYSTEM_TABLE_NAME.SERVICES, 'INSERT', {
        service_id: TEST_PRESSURED_REMOVE_REPLICA_ID,
        service_type: 'partition',
        partition_id: TEST_PRESSURED_REMOVE_PARTITION_ID,
        node_id: 'test-node',
        replica_id: TEST_PRESSURED_REMOVE_REPLICA_ID,
        raft_role: RAFT_ROLE.FOLLOWER,
        status: ReplicaStatus.ACTIVE,
        address: TEST_PRESSURED_REMOVE_ADDRESS,
        created_at: Date.now(),
        updated_at: Date.now(),
      });
      const mockCDC = createMockCDCService(cache);

      const handler = new ReplicaHandler({
        nodeId: 'test-node',
        cdcIntegrationService: mockCDC,
        systemTableCache: cache,
        dataDir: tempDir,
        createPartitionService: createMockPartitionServiceFactory(),
      });

      handler.initialize();
      const originalPersistReplicaStatusWithRetry =
        handler.persistReplicaStatusWithRetry.bind(handler);
      let removingWriteAttempts = 0;
      handler.persistReplicaStatusWithRetry = async (
        replicaId,
        newStatus,
        additionalData,
      ) => {
        if (
          replicaId === TEST_PRESSURED_REMOVE_REPLICA_ID &&
          newStatus === ReplicaStatus.REMOVING
        ) {
          removingWriteAttempts += 1;
          const error = new Error(TEST_PRESSURED_REMOVE_ERROR);
          error.code = TEST_PRESSURED_REMOVE_ERROR_CODE;
          throw error;
        }
        return originalPersistReplicaStatusWithRetry(
          replicaId,
          newStatus,
          additionalData,
        );
      };

      handler.localReplicas.set(TEST_PRESSURED_REMOVE_REPLICA_ID, {
        replicaId: TEST_PRESSURED_REMOVE_REPLICA_ID,
        partitionId: TEST_PRESSURED_REMOVE_PARTITION_ID,
        status: ReplicaStatus.ACTIVE,
        service: {
          async shutdown() {},
        },
      });

      const events = [];
      handler.on('replicaRemoved', () => events.push('replicaRemoved'));
      handler.on('replicaRemovalFailed',
        () => events.push('replicaRemovalFailed'));

      const response = await handler.handleRemoveReplica({
        operationId: TEST_PRESSURED_REMOVE_OPERATION_ID,
        partitionId: TEST_PRESSURED_REMOVE_PARTITION_ID,
        replicaId: TEST_PRESSURED_REMOVE_REPLICA_ID,
        reason: TEST_PRESSURED_REMOVE_REASON,
      });

      t.equal(
        response.status,
        ReplicaOperationResponseStatus.INITIATED,
        'pressured removing-status write should not reject remove admission',
      );
      for (let turn = 0; turn < 20 &&
        handler.inProgressOperations.size > 0; turn += 1) {
        await new Promise((resolve) => setImmediate(resolve));
      }

      t.equal(
        removingWriteAttempts,
        1,
        'removing status write is attempted',
      );
      t.equal(handler.inProgressOperations.size, 0,
        'the REMOVE was answered deferred, not left in progress');
      t.same(events, [], 'no removal outcome: the operation stays ' +
        'non-terminal for re-dispatch');
      t.equal(
        cache.get(SYSTEM_TABLE_NAME.SERVICES, TEST_PRESSURED_REMOVE_REPLICA_ID)
          ?.status,
        ReplicaStatus.ACTIVE,
        'no cleanup: the durable service row is untouched',
      );
      t.equal(
        handler.getLocalReplica(TEST_PRESSURED_REMOVE_REPLICA_ID)?.status,
        ReplicaStatus.ACTIVE,
        'local tracking is the durable status again',
      );

      handler.shutdown();
    });

  t.test('registerWithRouter registers handler at correct address', async (t) => {
    const cache = createSeededCache();
    seedReplicaOperation(cache, 'op-1');
    const mockCDC = createMockCDCService(cache);

    const handler = new ReplicaHandler({
      nodeId: 'test-node',
      dataDir: tempDir,
      systemTableCache: cache,
      cdcIntegrationService: mockCDC,
      createPartitionService: createMockPartitionServiceFactory(),
    });

    handler.initialize();

    const created = waitForReplicaEvent(
      handler,
      'replicaCreated',
      'replicaCreationFailed',
    );

    // Create mock message router
    const registeredHandlers = new Map();
    const mockRouter = {
      register(address, handlerFn) {
        registeredHandlers.set(address, handlerFn);
      },
      unregister(address) {
        registeredHandlers.delete(address);
      },
    };

    handler.registerWithRouter(mockRouter);

    // Check handler was registered at correct address
    t.ok(
      registeredHandlers.has('test-node/service/replica-handler'),
      'handler registered at correct address',
    );

    // Test the registered handler works
    const registeredHandler = registeredHandlers.get('test-node/service/replica-handler');
    const envelope = {
      correlationId: 'corr-1',
      payload: {
        type: ReplicaOperationMessageType.CREATE_REPLICA,
        operationId: 'op-1',
        partitionId: 'partition-1',
        replicaId: 'replica-1',
      },
    };

    const response = await registeredHandler(envelope);
    t.equal(response.acknowledged, true, 'response acknowledged');
    t.equal(response.status, ReplicaOperationResponseStatus.INITIATED,
      'create initiated');
    t.equal(response.correlationId, 'corr-1', 'correlationId preserved');

    await created;

    handler.shutdown();
  });

  t.test('unregisterFromRouter removes handler', async (t) => {
    const cache = createSeededCache();
    const mockCDC = createMockCDCService(cache);

    const handler = new ReplicaHandler({
      nodeId: 'test-node',
      dataDir: tempDir,
      systemTableCache: cache,
      cdcIntegrationService: mockCDC,
      createPartitionService: createMockPartitionServiceFactory(),
    });

    handler.initialize();

    // Create mock message router
    const registeredHandlers = new Map();
    const mockRouter = {
      register(address, handlerFn) {
        registeredHandlers.set(address, handlerFn);
      },
      unregister(address) {
        registeredHandlers.delete(address);
      },
    };

    handler.registerWithRouter(mockRouter);
    t.ok(
      registeredHandlers.has('test-node/service/replica-handler'),
      'handler registered',
    );

    handler.unregisterFromRouter(mockRouter);
    t.notOk(
      registeredHandlers.has('test-node/service/replica-handler'),
      'handler unregistered',
    );

    handler.shutdown();
  });

  t.test('registerWithRouter with RPC client notifies on response', async (t) => {
    const cache = createSeededCache();
    seedReplicaOperation(cache, 'op-1');
    const mockCDC = createMockCDCService(cache);

    const handler = new ReplicaHandler({
      nodeId: 'test-node',
      dataDir: tempDir,
      systemTableCache: cache,
      cdcIntegrationService: mockCDC,
      createPartitionService: createMockPartitionServiceFactory(),
    });

    handler.initialize();

    const created = waitForReplicaEvent(
      handler,
      'replicaCreated',
      'replicaCreationFailed',
    );

    // Create mock RPC client
    const rpcResponses = [];
    const mockRpcClient = {
      handleResponse(correlationId, response) {
        rpcResponses.push({correlationId, response});
      },
    };

    // Create mock message router
    const registeredHandlers = new Map();
    const mockRouter = {
      register(address, handlerFn) {
        registeredHandlers.set(address, handlerFn);
      },
      unregister(address) {
        registeredHandlers.delete(address);
      },
    };

    handler.registerWithRouter(mockRouter, {rpcClient: mockRpcClient});

    // Test the registered handler notifies RPC client
    const registeredHandler = registeredHandlers.get('test-node/service/replica-handler');
    const envelope = {
      correlationId: 'corr-1',
      payload: {
        type: ReplicaOperationMessageType.CREATE_REPLICA,
        operationId: 'op-1',
        partitionId: 'partition-1',
        replicaId: 'replica-1',
      },
    };

    await registeredHandler(envelope);
    await created;

    // Check RPC client was notified
    t.equal(rpcResponses.length, 1, 'RPC client notified');
    t.equal(rpcResponses[0].correlationId, 'corr-1', 'correct correlationId');
    t.equal(rpcResponses[0].response.status,
      ReplicaOperationResponseStatus.INITIATED, 'correct status');

    handler.shutdown();
  });

  t.test('shouldGateActivationOnVoterReadiness - critical joins gate with paired remove-like operations when metadata is missing',
    async (t) => {
      const cache = createSeededCache();
      const mockCDC = createMockCDCService(cache);

      const handler = new ReplicaHandler({
        nodeId: 'test-node',
        dataDir: tempDir,
        systemTableCache: cache,
        cdcIntegrationService: mockCDC,
        createPartitionService: createMockPartitionServiceFactory(),
      });

      handler.initialize();

      t.equal(
        handler.shouldGateActivationOnVoterReadiness('nodes-p1', 'missing-op', true),
        false,
        'should not gate when operation metadata is missing and no REMOVE is in flight',
      );

      seedReplicaOperation(cache, 'remove-in-flight', {
        type: OperationType.REMOVE,
        partitionId: 'nodes-p1',
      });
      t.equal(
        handler.shouldGateActivationOnVoterReadiness('nodes-p1', 'missing-op', false),
        false,
        'should not infer gating outside joining flow when metadata is missing',
      );
      t.equal(
        handler.shouldGateActivationOnVoterReadiness('nodes-p1', 'missing-op', true),
        true,
        'should gate when a paired REMOVE is in flight during join',
      );
      const removeOperation = cache.get(
        SYSTEM_TABLE_NAME.REPLICA_OPERATIONS,
        'remove-in-flight',
      );
      removeOperation.workflow_step = WORKFLOW_STEP.REMOVED;
      removeOperation.status = ReplicaStatus.REMOVED;
      seedReplicaOperation(cache, 'replace-in-flight', {
        type: OperationType.REPLACE,
        partitionId: 'nodes-p1',
        workflow_step: WORKFLOW_STEP.ACTIVE,
        status: ReplicaStatus.ACTIVE,
      });
      t.equal(
        handler.shouldGateActivationOnVoterReadiness('nodes-p1', 'missing-op', true),
        true,
        'should also gate when a paired REPLACE is in flight during join and the local operation row has not propagated yet',
      );
      t.equal(
        handler.shouldGateActivationOnVoterReadiness('partition-1', 'missing-op', true),
        false,
        'should not gate non-critical partitions',
      );

      handler.shutdown();
    });

  t.test('shouldGateActivationOnVoterReadiness - gates critical add and replace operations when metadata is explicit',
    async (t) => {
      const cache = createSeededCache();
      const mockCDC = createMockCDCService(cache);
      seedReplicaOperation(cache, 'add-op', {
        type: OperationType.ADD,
        partitionId: 'nodes-p1',
      });
      seedReplicaOperation(cache, 'replace-op', {
        type: OperationType.REPLACE,
        partitionId: 'nodes-p1',
      });
      seedReplicaOperation(cache, 'remove-op', {
        type: OperationType.REMOVE,
        partitionId: 'nodes-p1',
      });

      const handler = new ReplicaHandler({
        nodeId: 'test-node',
        dataDir: tempDir,
        systemTableCache: cache,
        cdcIntegrationService: mockCDC,
        createPartitionService: createMockPartitionServiceFactory(),
      });

      handler.initialize();

      t.equal(
        handler.shouldGateActivationOnVoterReadiness('nodes-p1', 'add-op', false),
        true,
        'should gate ADD operations on critical partitions',
      );
      t.equal(
        handler.shouldGateActivationOnVoterReadiness('nodes-p1', 'replace-op', false),
        true,
        'should gate REPLACE operations on critical partitions until the replacement is voter-ready',
      );
      t.equal(
        handler.shouldGateActivationOnVoterReadiness('nodes-p1', 'remove-op', false),
        false,
        'should not gate REMOVE operations when metadata is explicit',
      );
      t.equal(
        handler.shouldGateActivationOnVoterReadiness(
          ' nodes-p1 ',
          'missing-op',
          false,
          OperationType.ADD,
        ),
        false,
        'should preserve exact critical-set matching for padded partition IDs',
      );

      handler.shutdown();
    });

  t.test('createReplicaAsync gates critical replacements from explicit request intent before cache visibility',
    async (t) => {
      const cache = createSeededCache({
        tableId: 'nodes',
        tableName: SYSTEM_TABLE_NAME.NODES,
        partitionId: 'nodes-p1',
        leaderReplicaId: 'nodes-p1-r1',
      });
      const mockCDC = createMockCDCService(cache);
      const handler = new ReplicaHandler({
        nodeId: 'test-node',
        dataDir: tempDir,
        systemTableCache: cache,
        cdcIntegrationService: mockCDC,
        createPartitionService: createMockPartitionServiceFactory(),
      });

      const voterReadyWaits = [];
      handler.waitForVoterReadyActivation = async (replicaId, partitionId) => {
        voterReadyWaits.push({replicaId, partitionId});
      };
      handler.initialize();

      try {
        await handler.createReplicaAsync({
          operationId: 'replace-op-explicit',
          explicitOperationType: OperationType.REPLACE,
          partitionId: 'nodes-p1',
          replicaId: 'nodes-p1-r2',
          bootstrapReplicaIds: [],
          bootstrapPeerAddresses: [],
          bootstrapTableMetadata: null,
          bootstrapPartitionMetadata: null,
        });

        t.same(
          voterReadyWaits,
          [{replicaId: 'nodes-p1-r2', partitionId: 'nodes-p1'}],
          'critical replacement create should wait for voter-ready even when the local operation row is not yet visible',
        );
      } finally {
        await handler.shutdown();
      }
    });

  t.test('createReplicaAsync retries ACTIVE status persistence after retryable control-plane pressure',
    async (t) => {
      const cache = createSeededCache({
        partitionId: TEST_STATUS_RETRY_PARTITION_ID,
      });
      const mockCDC = createMockCDCService(cache);
      let activeFailureCount = 0;
      let activeWriteCount = 0;
      const replicaStateMachine = new ReplicaStateMachine({
        nodeId: 'test-node',
        controlPlaneSystemTableGateway: {
          async submitMutation(mutation) {
            if (mutation.tableName === SYSTEM_TABLE_NAME.SERVICES &&
                mutation.operation === 'update' &&
                mutation.data?.status === ReplicaStatus.ACTIVE) {
              activeWriteCount += 1;
              if (activeFailureCount === 0) {
                activeFailureCount += 1;
                const error = new Error(TEST_STATUS_RETRY_ERROR);
                error.code = 'DISTRIBUTED_PARTICIPANT_FAILURE';
                error.retryAfterMs = 1;
                throw error;
              }
            }
            applyGatewayMutationToCache(cache, mutation);
            return {success: true};
          },
        },
      });
      const handler = new ReplicaHandler({
        nodeId: 'test-node',
        dataDir: tempDir,
        systemTableCache: cache,
        cdcIntegrationService: mockCDC,
        replicaStateMachine,
        createPartitionService: createMockPartitionServiceFactory(),
      });

      handler.initialize();

      try {
        await handler.createReplicaAsync({
          operationId: TEST_STATUS_RETRY_OPERATION_ID,
          explicitOperationType: OperationType.ADD,
          partitionId: TEST_STATUS_RETRY_PARTITION_ID,
          replicaId: TEST_STATUS_RETRY_REPLICA_ID,
          bootstrapReplicaIds: [],
          bootstrapPeerAddresses: [],
          bootstrapTableMetadata: null,
          bootstrapPartitionMetadata: null,
        });

        t.equal(
          activeWriteCount,
          2,
          'ACTIVE status persistence should retry the same durable write once',
        );
        t.equal(
          handler.getLocalReplica(TEST_STATUS_RETRY_REPLICA_ID)?.status,
          ReplicaStatus.ACTIVE,
          'local replica tracking should converge to ACTIVE after the retry succeeds',
        );
        t.equal(
          replicaStateMachine.getState(TEST_STATUS_RETRY_REPLICA_ID)?.state,
          ReplicaStatus.ACTIVE,
          'replica state machine should commit ACTIVE after the retry succeeds',
        );
        t.equal(
          cache.get(SYSTEM_TABLE_NAME.SERVICES, TEST_STATUS_RETRY_SERVICE_ID)?.status,
          ReplicaStatus.ACTIVE,
          'services cache should reflect the successful ACTIVE persistence',
        );
        t.equal(
          cache.get(SYSTEM_TABLE_NAME.SERVICES, TEST_STATUS_RETRY_SERVICE_ID)?.address,
          TEST_STATUS_RETRY_SERVICE_ADDRESS,
          'the durable row should retain the canonical replica address',
        );
      } finally {
        await handler.shutdown();
      }
    });

  // The two STEP_DOWN_REPLICA handoffs reach the partition's one transfer
  // issuer (requestLeadershipTransfer) and answer what its port answered:
  // acceptance, with the branch it names and the port's record. The real
  // core's behaviour on real partitions is witnessed in
  // replica-handler-leadership-transfer.test.js.
  const buildTransferTrackedService = (role, answer) => {
    const trackedService = {
      role,
      transfers: [],
      getRole() {
        return this.role;
      },
      async requestLeadershipTransfer(request) {
        trackedService.transfers.push(request);
        return answer;
      },
    };
    return trackedService;
  };
  const stepDownThroughHandler = async (trackedService, reason) => {
    const cache = createSeededCache({
      partitionId: TEST_STEP_DOWN_PARTITION_ID,
      leaderReplicaId: TEST_STEP_DOWN_REPLICA_ID,
    });
    const handler = new ReplicaHandler({
      nodeId: 'test-node',
      dataDir: tempDir,
      systemTableCache: cache,
      cdcIntegrationService: createMockCDCService(cache),
      createPartitionService: createMockPartitionServiceFactory(),
    });
    handler.localServices.set(TEST_STEP_DOWN_REPLICA_ID, trackedService);
    handler.setLocalReplica(TEST_STEP_DOWN_REPLICA_ID, {
      replicaId: TEST_STEP_DOWN_REPLICA_ID,
      partitionId: TEST_STEP_DOWN_PARTITION_ID,
      service: trackedService,
    });
    handler.initialize();
    try {
      return await handler.handleMessage({
        correlationId: TEST_STEP_DOWN_CORRELATION_ID,
        payload: {
          type: ReplicaOperationMessageType.STEP_DOWN_REPLICA,
          operationId: TEST_STEP_DOWN_OPERATION_ID,
          partitionId: TEST_STEP_DOWN_PARTITION_ID,
          replicaId: TEST_STEP_DOWN_REPLICA_ID,
          reason,
        },
      });
    } finally {
      await handler.shutdown();
    }
  };

  t.test('handleMessage routes STEP_DOWN_REPLICA through the partition leadership transfer',
    async (t) => {
      const accepted = deepFreeze({outcome: RAFT_OPERATION_OUTCOME.CORE_OK,
        reason: RAFT_LEADERSHIP_TRANSFER_REASON.TRANSFER_REQUESTED});
      const trackedService = buildTransferTrackedService(
        RAFT_ROLE.LEADER, accepted);
      const response = await stepDownThroughHandler(
        trackedService, TEST_STEP_DOWN_REASON);
      t.equal(
        response.correlationId,
        TEST_STEP_DOWN_CORRELATION_ID,
        'correlationId should be preserved for step-down requests',
      );
      t.equal(
        response.status,
        ReplicaOperationResponseStatus.COMPLETED,
        'a transfer the port accepted completes the step-down request',
      );
      t.same(trackedService.transfers, [{
        successor: RAFT_LEADERSHIP_TRANSFER_SUCCESSOR.MOST_CAUGHT_UP,
      }], 'the source leader asks exactly once for its most caught-up voter');
      t.equal(response.handoffBranch,
        REPLICA_HANDLER_LEADER_HANDOFF_BRANCH.TRANSFER_REQUESTED,
        'the response names the requested transfer');
      t.same(response.handoffTransfer, accepted,
        'the port record rides along');
    });

  t.test('handleMessage asks for leadership named to the replacement when STEP_DOWN_REPLICA carries replacement leader election intent',
    async (t) => {
      const forwarded = deepFreeze({outcome: RAFT_OPERATION_OUTCOME.CORE_OK,
        reason: RAFT_LEADERSHIP_TRANSFER_REASON.TRANSFER_FORWARDED});
      const trackedService = buildTransferTrackedService(
        RAFT_ROLE.FOLLOWER, forwarded);
      const response = await stepDownThroughHandler(
        trackedService, TEST_STEP_DOWN_TARGET_ELECTION_REASON);
      t.equal(
        response.status,
        ReplicaOperationResponseStatus.COMPLETED,
        'replacement leader election should complete through the tracked handoff lane',
      );
      t.same(trackedService.transfers, [{
        successor: RAFT_LEADERSHIP_TRANSFER_SUCCESSOR.NAMED,
        replicaIdentity: TEST_STEP_DOWN_REPLICA_ID,
      }], 'the follower asks exactly once for leadership named to itself');
      t.equal(response.handoffBranch,
        REPLICA_HANDLER_LEADER_HANDOFF_BRANCH.TRANSFER_FORWARDED);
    });

  t.test('handleMessage answers ERROR with the typed reason when the port refuses the transfer',
    async (t) => {
      const refused = deepFreeze({outcome: RAFT_OPERATION_OUTCOME.CORE_REFUSED,
        reason: RAFT_LEADERSHIP_TRANSFER_REASON.NO_KNOWN_LEADER,
        retryable: true, recoveryRequired: false});
      const trackedService = buildTransferTrackedService(
        RAFT_ROLE.FOLLOWER, refused);
      const response = await stepDownThroughHandler(
        trackedService, TEST_STEP_DOWN_TARGET_ELECTION_REASON);
      t.equal(response.status, ReplicaOperationResponseStatus.ERROR,
        'a refused transfer changed nothing and is not reported completed');
      t.equal(response.handoffBranch,
        REPLICA_HANDLER_LEADER_HANDOFF_BRANCH.TRANSFER_REFUSED);
      t.same(response.handoffTransfer, refused,
        'the typed refusal rides along for the caller\'s retry decision');
    });
}

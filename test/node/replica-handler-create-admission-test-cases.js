const TEST_INITIAL_STATUS_RETRY_OPERATION_ID =
  'op-initial-create-status-retry';
const TEST_INITIAL_STATUS_RETRY_REPLICA_ID =
  'replica-initial-create-status-retry';
const TEST_INITIAL_STATUS_RETRY_PARTITION_ID = 'partition-1';
const TEST_INITIAL_STATUS_RETRY_ERROR =
  'Distributed operation failed due to participant failures';
const TEST_INITIAL_STATUS_RETRY_ERROR_CODE =
  'DISTRIBUTED_PARTICIPANT_FAILURE';
const TEST_INITIAL_STATUS_RETRY_AFTER_MS = 1;
const TEST_PRIORITY_CREATE_STATUS_OPERATION_ID =
  'op-priority-create-status-fallback';
const TEST_PRIORITY_CREATE_STATUS_PARTITION_ID = 'replica_operations-p1';
const TEST_PRIORITY_CREATE_STATUS_REPLICA_ID = 'replica_operations-p1-r4';

export async function registerReplicaHandlerCreateAdmissionTests({
  t,
  ReplicaHandler,
  ReplicaStatus,
  ReplicaStateMachine,
  SYSTEM_TABLE_NAME,
  createMockCDCService,
  createMockPartitionServiceFactory,
  createSeededCache,
  createMetadataOnlyCache,
  seedReplicaOperation,
  applyGatewayMutationToCache,
  waitForReplicaEvent,
  getTempDir,
  ReplicaOperationResponseStatus,
}) {
  t.test(
    'handleCreateReplica - returns ACK before slow pending status persistence completes',
    async (t) => {
      const cache = createSeededCache();
      seedReplicaOperation(cache, 'op-slow-pending');
      const mockCDC = createMockCDCService(cache);
      let releasePendingStatus = null;
      let pendingStatusStarted = false;
      const createdReplicaIds = [];

      const handler = new ReplicaHandler({
        nodeId: 'test-node',
        cdcIntegrationService: mockCDC,
        systemTableCache: cache,
        createPartitionService: async (options) => {
          createdReplicaIds.push(options.replicaId);
          return {
            partitionId: options.partitionId,
            replicaId: options.replicaId,
            initialized: true,
            role: 'follower',
            async shutdown() {},
            async syncFromLeader() {},
          };
        },
        replicaStateMachine: {
          getState() {
            return null;
          },
          async transition(replicaId, newStatus) {
            if (replicaId === 'replica-slow' &&
                newStatus === ReplicaStatus.PENDING) {
              pendingStatusStarted = true;
              await new Promise((resolve) => {
                releasePendingStatus = resolve;
              });
            }
          },
        },
        dataDir: getTempDir(),
      });

      handler.initialize();

      const responsePromise = handler.handleCreateReplica({
        operationId: 'op-slow-pending',
        partitionId: 'partition-1',
        replicaId: 'replica-slow',
      });

      const response = await Promise.race([
        responsePromise,
        new Promise((_, reject) => {
          setTimeout(() => {
            reject(new Error(
              'CREATE_REPLICA ACK should not wait for pending status persistence',
            ));
          }, 25);
        }),
      ]);

      t.equal(
        response.status,
        ReplicaOperationResponseStatus.INITIATED,
        'CREATE_REPLICA should ACK immediately even when pending status persistence is slow',
      );
      t.equal(
        handler.getLocalReplica('replica-slow')?.status,
        ReplicaStatus.PENDING,
        'local idempotency state should still become pending before ACK',
      );
      t.same(
        createdReplicaIds,
        [],
        'replica creation should not begin before pending persistence is released',
      );

      await new Promise((resolve) => setImmediate(resolve));
      t.equal(
        pendingStatusStarted,
        true,
        'slow pending-status persistence should begin in the detached background task after ACK',
      );
      t.type(
        releasePendingStatus,
        'function',
        'background pending-status persistence should expose the test release gate',
      );

      releasePendingStatus();
      await waitForReplicaEvent(
        handler,
        'replicaCreated',
        'replicaCreationFailed',
      );

      t.same(
        createdReplicaIds,
        ['replica-slow'],
        'replica creation should continue after pending persistence completes',
      );

      await handler.shutdown();
    },
  );

  t.test(
    'handleCreateReplica - retries retryable initial status persistence ' +
    'before creating replica',
    async (t) => {
      const cache = createSeededCache();
      seedReplicaOperation(cache, TEST_INITIAL_STATUS_RETRY_OPERATION_ID);
      const mockCDC = createMockCDCService(cache);
      const createdReplicaIds = [];
      const transitions = [];
      let pendingAttempts = 0;

      const handler = new ReplicaHandler({
        nodeId: 'test-node',
        cdcIntegrationService: mockCDC,
        systemTableCache: cache,
        createPartitionService: async (options) => {
          createdReplicaIds.push(options.replicaId);
          return {
            partitionId: options.partitionId,
            replicaId: options.replicaId,
            initialized: true,
            async shutdown() {},
            async syncFromLeader() {},
          };
        },
        replicaStateMachine: {
          getState() {
            return null;
          },
          async transition(replicaId, newStatus) {
            transitions.push({replicaId, newStatus});
            if (
              replicaId === TEST_INITIAL_STATUS_RETRY_REPLICA_ID &&
              newStatus === ReplicaStatus.PENDING &&
              pendingAttempts === 0
            ) {
              pendingAttempts += 1;
              const error = new Error(TEST_INITIAL_STATUS_RETRY_ERROR);
              error.code = TEST_INITIAL_STATUS_RETRY_ERROR_CODE;
              error.errorCode = TEST_INITIAL_STATUS_RETRY_ERROR_CODE;
              error.deferRetry = true;
              error.retryAfterMs = TEST_INITIAL_STATUS_RETRY_AFTER_MS;
              throw error;
            }
            if (newStatus === ReplicaStatus.PENDING) {
              pendingAttempts += 1;
            }
          },
        },
        dataDir: getTempDir(),
      });

      handler.initialize();

      const created = waitForReplicaEvent(
        handler,
        'replicaCreated',
        'replicaCreationFailed',
      );

      const response = await handler.handleCreateReplica({
        operationId: TEST_INITIAL_STATUS_RETRY_OPERATION_ID,
        partitionId: TEST_INITIAL_STATUS_RETRY_PARTITION_ID,
        replicaId: TEST_INITIAL_STATUS_RETRY_REPLICA_ID,
      });

      t.equal(
        response.status,
        ReplicaOperationResponseStatus.INITIATED,
        'CREATE_REPLICA should still ACK before initial status retry drains',
      );

      await created;

      t.same(
        createdReplicaIds,
        [TEST_INITIAL_STATUS_RETRY_REPLICA_ID],
        'replica creation should continue after retryable initial status pressure',
      );
      t.same(
        transitions
          .filter((transition) =>
            transition.replicaId === TEST_INITIAL_STATUS_RETRY_REPLICA_ID,
          )
          .map((transition) => transition.newStatus),
        [
          ReplicaStatus.PENDING,
          ReplicaStatus.PENDING,
          ReplicaStatus.CREATING,
          ReplicaStatus.SYNCING,
          ReplicaStatus.ACTIVE,
        ],
        'initial PENDING should retry before CREATING/SYNCING/ACTIVE progress',
      );

      await handler.shutdown();
    },
  );

  t.test(
    'handleCreateReplica - priority control-plane create starts before ' +
    'durable lifecycle status writes',
    async (t) => {
      const cache = createSeededCache({
        tableId: 'replica_operations',
        tableName: 'replica_operations',
        partitionId: TEST_PRIORITY_CREATE_STATUS_PARTITION_ID,
      });
      seedReplicaOperation(
        cache,
        TEST_PRIORITY_CREATE_STATUS_OPERATION_ID,
        {
          partitionId: TEST_PRIORITY_CREATE_STATUS_PARTITION_ID,
          replicaId: TEST_PRIORITY_CREATE_STATUS_REPLICA_ID,
        },
      );
      const mockCDC = createMockCDCService(cache);
      let creatingWriteCount = 0;
      const serviceMutationOperations = [];
      const replicaStateMachine = new ReplicaStateMachine({
        nodeId: 'test-node',
        systemTableCache: cache,
        controlPlaneSystemTableGateway: {
          async submitMutation(mutation) {
            if (mutation.tableName === SYSTEM_TABLE_NAME.SERVICES) {
              serviceMutationOperations.push({
                operation: mutation.operation,
                status: mutation.row?.status || mutation.data?.status || null,
              });
            }
            if (
              mutation.tableName === SYSTEM_TABLE_NAME.SERVICES &&
              mutation.operation === 'update' &&
              mutation.data?.status === ReplicaStatus.CREATING
            ) {
              creatingWriteCount += 1;
              const error = new Error(TEST_INITIAL_STATUS_RETRY_ERROR);
              error.code = TEST_INITIAL_STATUS_RETRY_ERROR_CODE;
              error.errorCode = TEST_INITIAL_STATUS_RETRY_ERROR_CODE;
              error.deferRetry = true;
              error.retryAfterMs = TEST_INITIAL_STATUS_RETRY_AFTER_MS;
              throw error;
            }
            applyGatewayMutationToCache(cache, mutation);
            return {success: true};
          },
        },
      });
      let handler = null;
      const createdReplicaIds = [];
      let localStatusAtFactory = null;
      let stateMachineStatusAtFactory = null;
      let deferCdcPropagationHandshakeAtFactory = null;
      handler = new ReplicaHandler({
        nodeId: 'test-node',
        cdcIntegrationService: mockCDC,
        systemTableCache: cache,
        replicaStateMachine,
        createPartitionService: async (options) => {
          createdReplicaIds.push(options.replicaId);
          deferCdcPropagationHandshakeAtFactory =
            options.deferCdcPropagationHandshake;
          localStatusAtFactory =
            handler.getLocalReplica(options.replicaId)?.status || null;
          stateMachineStatusAtFactory =
            replicaStateMachine.getState(options.replicaId)?.state || null;
          return {
            partitionId: options.partitionId,
            replicaId: options.replicaId,
            initialized: true,
            async shutdown() {},
            async syncFromLeader() {},
          };
        },
        dataDir: getTempDir(),
      });

      handler.initialize();

      const created = waitForReplicaEvent(
        handler,
        'replicaCreated',
        'replicaCreationFailed',
      );

      const response = await handler.handleCreateReplica({
        operationId: TEST_PRIORITY_CREATE_STATUS_OPERATION_ID,
        operationType: 'REMOVE',
        partitionId: TEST_PRIORITY_CREATE_STATUS_PARTITION_ID,
        replicaId: TEST_PRIORITY_CREATE_STATUS_REPLICA_ID,
      });

      t.equal(
        response.status,
        ReplicaOperationResponseStatus.INITIATED,
        'CREATE_REPLICA should ACK before durable lifecycle status drains',
      );

      await created;

      t.equal(
        creatingWriteCount,
        0,
        'priority CREATING status should be local-first, not a startup gate',
      );
      t.same(
        serviceMutationOperations
          .filter((mutation) =>
            mutation.status === ReplicaStatus.SYNCING ||
            mutation.status === ReplicaStatus.ACTIVE,
          ),
        [
          {operation: 'upsert', status: ReplicaStatus.SYNCING},
          {operation: 'update', status: ReplicaStatus.ACTIVE},
        ],
        'post-start lifecycle writes should upsert missing service rows before updating them',
      );
      t.same(
        createdReplicaIds,
        [TEST_PRIORITY_CREATE_STATUS_REPLICA_ID],
        'replica creation should continue before durable status propagation',
      );
      t.equal(
        localStatusAtFactory,
        ReplicaStatus.CREATING,
        'local replica should be advanced to CREATING before service startup',
      );
      t.equal(
        stateMachineStatusAtFactory,
        ReplicaStatus.CREATING,
        'state machine should leave PENDING before service startup',
      );
      t.equal(
        deferCdcPropagationHandshakeAtFactory,
        true,
        'priority control-plane create should not block lifecycle on CDC handshake',
      );
      t.equal(
        cache.get(
          SYSTEM_TABLE_NAME.SERVICES,
          TEST_PRIORITY_CREATE_STATUS_REPLICA_ID,
        )?.status,
        ReplicaStatus.ACTIVE,
        'later lifecycle writes should converge the services row to ACTIVE',
      );

      await handler.shutdown();
    },
  );

  t.test('shutdown prevents queued createReplicaAsync work from starting', async (t) => {
    const cache = createSeededCache();
    seedReplicaOperation(cache, 'op-shutdown');
    const mockCDC = createMockCDCService(cache);
    let createCalls = 0;

    const handler = new ReplicaHandler({
      nodeId: 'test-node',
      cdcIntegrationService: mockCDC,
      systemTableCache: cache,
      dataDir: getTempDir(),
      createPartitionService: async () => {
        createCalls += 1;
        return {
          async shutdown() {},
          async syncFromLeader() {},
        };
      },
    });

    handler.initialize();
    await handler.handleCreateReplica({
      operationId: 'op-shutdown',
      partitionId: 'partition-1',
      replicaId: 'replica-shutdown',
    });

    await handler.shutdown();
    await new Promise((resolve) => setImmediate(resolve));

    t.equal(createCalls, 0, 'shutdown should block queued replica creation');
    t.equal(
      handler.inProgressOperations.size,
      0,
      'shutdown should clear queued in-progress operations',
    );
  });

  t.test(
    'handleCreateReplica - passes lifecycle stage callback options to partition factory',
    async (t) => {
      const cache = createSeededCache();
      seedReplicaOperation(cache, 'op-1');
      const mockCDC = createMockCDCService(cache);
      let capturedOptions = null;

      const handler = new ReplicaHandler({
        nodeId: 'test-node',
        cdcIntegrationService: mockCDC,
        systemTableCache: cache,
        dataDir: getTempDir(),
        createPartitionService: async (options) => {
          capturedOptions = options;
          return {
            partitionId: options.partitionId,
            replicaId: options.replicaId,
            initialized: true,
            async shutdown() {},
            async syncFromLeader() {},
          };
        },
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

      t.equal(capturedOptions.suppressLifecycleLogs, true,
        'lifecycle logs are suppressed for dynamic replica creation');
      t.equal(typeof capturedOptions.onInitializationStage, 'function',
        'stage callback is passed to partition service factory');

      handler.shutdown();
    },
  );

  t.test(
    'handleCreateReplica - first replica should not be treated as joining existing group',
    async (t) => {
      const cache = createMetadataOnlyCache();
      seedReplicaOperation(cache, 'op-1');
      const mockCDC = createMockCDCService(cache);
      let capturedOptions = null;

      const handler = new ReplicaHandler({
        nodeId: 'test-node',
        cdcIntegrationService: mockCDC,
        systemTableCache: cache,
        dataDir: getTempDir(),
        createPartitionService: async (options) => {
          capturedOptions = options;
          return {
            partitionId: options.partitionId,
            replicaId: options.replicaId,
            initialized: true,
            async shutdown() {},
            async syncFromLeader() {},
          };
        },
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

      t.ok(capturedOptions, 'partition factory should receive create options');
      t.equal(
        capturedOptions.isJoiningExistingGroup,
        false,
        'first replica should bootstrap leadership instead of learner join mode',
      );

      handler.shutdown();
    },
  );
}

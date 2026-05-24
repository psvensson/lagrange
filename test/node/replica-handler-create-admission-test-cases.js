export async function registerReplicaHandlerCreateAdmissionTests({
  t,
  ReplicaHandler,
  ReplicaStatus,
  createMockCDCService,
  createMockPartitionServiceFactory,
  createSeededCache,
  createMetadataOnlyCache,
  seedReplicaOperation,
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

export async function registerReplicaHandlerCreateTopologyTests({
  t,
  ReplicaHandler,
  ReplicaStatus,
  SYSTEM_TABLE_NAME,
  SERVICE_STATUS,
  RAFT_ROLE,
  createMockCDCService,
  createMockPartitionServiceFactory,
  createSeededCache,
  createMetadataOnlyCache,
  seedReplicaOperation,
  waitForReplicaEvent,
  getTempDir,
}) {
  t.test(
    'handleCreateReplica - provisional sibling rows without leader should not force learner join mode',
    async (t) => {
      const partitionId = 'partition-1';
      const cache = createMetadataOnlyCache({partitionId});
      seedReplicaOperation(cache, 'op-1', {partitionId, replicaId: 'replica-1'});
      const now = Date.now();
      for (const serviceId of ['replica-1', 'replica-2', 'replica-3']) {
        cache.applySystemTableChange(SYSTEM_TABLE_NAME.SERVICES, 'INSERT', {
          service_id: serviceId,
          service_type: 'partition',
          partition_id: partitionId,
          node_id: `node-${serviceId}`,
          status: ReplicaStatus.CREATING,
          address: `node-${serviceId}/partition/${serviceId}`,
          created_at: now,
          updated_at: now,
        });
      }

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
        partitionId,
        replicaId: 'replica-1',
      });
      await created;

      t.ok(capturedOptions, 'partition factory should receive create options');
      t.equal(
        capturedOptions.isJoiningExistingGroup,
        false,
        'fresh partition replicas should bootstrap voters until a leader exists',
      );

      handler.shutdown();
    },
  );

  t.test(
    'handleCreateReplica - active sibling rows without raft roles should not force learner join mode',
    async (t) => {
      const partitionId = 'partition-1';
      const cache = createMetadataOnlyCache({partitionId});
      seedReplicaOperation(cache, 'op-1', {partitionId, replicaId: 'replica-1'});
      const now = Date.now();
      for (const serviceId of ['replica-1', 'replica-2', 'replica-3']) {
        cache.applySystemTableChange(SYSTEM_TABLE_NAME.SERVICES, 'INSERT', {
          service_id: serviceId,
          service_type: 'partition',
          partition_id: partitionId,
          node_id: `node-${serviceId}`,
          status: ReplicaStatus.ACTIVE,
          raft_role: null,
          address: `node-${serviceId}/partition/${serviceId}`,
          created_at: now,
          updated_at: now,
        });
      }

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
        partitionId,
        replicaId: 'replica-1',
      });
      await created;

      t.ok(capturedOptions, 'partition factory should receive create options');
      t.equal(
        capturedOptions.isJoiningExistingGroup,
        false,
        'active rows without explicit voter roles should still bootstrap fresh partitions',
      );

      handler.shutdown();
    },
  );

  t.test(
    'resolveReplicaContext - roleless active rows should not invent a leader or voters',
    async (t) => {
      const partitionId = 'partition-1';
      const cache = createMetadataOnlyCache({partitionId});
      const now = Date.now();
      for (const serviceId of ['replica-1', 'replica-2', 'replica-3']) {
        cache.applySystemTableChange(SYSTEM_TABLE_NAME.SERVICES, 'INSERT', {
          service_id: serviceId,
          service_type: 'partition',
          partition_id: partitionId,
          node_id: `node-${serviceId}`,
          status: ReplicaStatus.ACTIVE,
          address: `node-${serviceId}/partition/${serviceId}`,
          created_at: now,
          updated_at: now,
        });
      }

      const handler = new ReplicaHandler({
        nodeId: 'test-node',
        cdcIntegrationService: createMockCDCService(cache),
        systemTableCache: cache,
        dataDir: getTempDir(),
        createPartitionService: createMockPartitionServiceFactory(),
      });

      handler.initialize();

      const context = handler.resolveReplicaContext(partitionId, 'replica-1');

      t.equal(
        context.leaderAddress,
        null,
        'should not infer a leader from missing raft_role metadata',
      );
      t.equal(
        context.existingReplicaCount,
        0,
        'should not count roleless active rows as established voters',
      );

      handler.shutdown();
    },
  );

  t.test(
    'resolveReplicaContext - fresh partition bootstrap should not turn later peers into learners',
    async (t) => {
      const partitionId = 'partition-1';
      const tableId = 'table-1';
      const cache = createMetadataOnlyCache({partitionId, tableId});
      const now = Date.now();
      cache.applySystemTableChange(SYSTEM_TABLE_NAME.PARTITIONS, 'INSERT', {
        partition_id: partitionId,
        table_id: tableId,
        partition_key_start: null,
        partition_key_end: null,
        leader_node_id: null,
        created_at: now,
        updated_at: now,
      });
      cache.applySystemTableChange(SYSTEM_TABLE_NAME.SERVICES, 'INSERT', {
        service_id: 'replica-2',
        service_type: 'partition',
        partition_id: partitionId,
        node_id: 'node-2',
        status: ReplicaStatus.ACTIVE,
        raft_role: RAFT_ROLE.LEADER,
        address: 'node-2/partition/replica-2',
        created_at: now,
        updated_at: now,
      });
      cache.applySystemTableChange(SYSTEM_TABLE_NAME.SERVICES, 'INSERT', {
        service_id: 'replica-3',
        service_type: 'partition',
        partition_id: partitionId,
        node_id: 'node-3',
        status: ReplicaStatus.PENDING,
        raft_role: null,
        address: 'node-3/partition/replica-3',
        created_at: now,
        updated_at: now,
      });

      const handler = new ReplicaHandler({
        nodeId: 'node-1',
        cdcIntegrationService: createMockCDCService(cache),
        systemTableCache: cache,
        dataDir: getTempDir(),
        createPartitionService: createMockPartitionServiceFactory(),
      });

      handler.initialize();

      const context = handler.resolveReplicaContext(partitionId, 'replica-1');

      t.equal(
        context.existingReplicaCount,
        0,
        'fresh partitions without persisted leader metadata should keep the initial cohort in bootstrap mode',
      );
      t.equal(
        context.leaderAddress,
        null,
        'without canonical leader_node_id the handler should not invent a leader address',
      );

      handler.shutdown();
    },
  );

  t.test(
    'handleCreateReplica - stale leader rows on a not-ready node should not force learner join mode',
    async (t) => {
      const partitionId = 'partition-1';
      const cache = createSeededCache({
        partitionId,
        leaderNodeId: 'dead-node',
        leaderReplicaId: 'replica-2',
      });
      seedReplicaOperation(cache, 'op-1', {partitionId, replicaId: 'replica-1'});

      const now = Date.now();
      cache.applySystemTableChange(SYSTEM_TABLE_NAME.NODES, 'INSERT', {
        node_id: 'dead-node',
        status: SERVICE_STATUS.ACTIVE,
        last_heartbeat: now - 1000,
        ready_lease_expires_at: now - 1,
      });
      cache.applySystemTableChange(SYSTEM_TABLE_NAME.NODES, 'INSERT', {
        node_id: 'live-node',
        status: SERVICE_STATUS.ACTIVE,
        last_heartbeat: now,
        ready_lease_expires_at: now + 60_000,
      });
      cache.applySystemTableChange(SYSTEM_TABLE_NAME.SERVICES, 'INSERT', {
        service_id: 'replica-3',
        service_type: 'partition',
        partition_id: partitionId,
        node_id: 'dead-node',
        status: ReplicaStatus.ACTIVE,
        raft_role: RAFT_ROLE.FOLLOWER,
        address: 'dead-node/partition/replica-3',
        created_at: now,
        updated_at: now,
      });
      cache.applySystemTableChange(SYSTEM_TABLE_NAME.SERVICES, 'INSERT', {
        service_id: 'replica-4',
        service_type: 'partition',
        partition_id: partitionId,
        node_id: 'live-node',
        status: ReplicaStatus.ACTIVE,
        raft_role: RAFT_ROLE.FOLLOWER,
        address: 'live-node/partition/replica-4',
        created_at: now,
        updated_at: now,
      });

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
        partitionId,
        replicaId: 'replica-1',
      });
      await created;

      t.ok(capturedOptions, 'partition factory should receive create options');
      t.equal(
        capturedOptions.leaderAddress,
        null,
        'expired node readiness should suppress stale leader addresses',
      );
      t.equal(
        capturedOptions.isJoiningExistingGroup,
        false,
        'replacement should bootstrap recovery instead of joining a dead leader as learner',
      );

      handler.shutdown();
    },
  );

  t.test(
    'handleCreateReplica - priority recovery excludes disconnected stale peers',
    async (t) => {
      const partitionId = 'replica_operations-p1';
      const cache = createSeededCache({
        tableId: SYSTEM_TABLE_NAME.REPLICA_OPERATIONS,
        partitionId,
        leaderNodeId: 'dead-node',
        leaderReplicaId: 'replica_operations-p1-r2',
      });
      seedReplicaOperation(cache, 'op-1', {
        partitionId,
        replicaId: 'replica_operations-p1-r4',
      });

      const now = Date.now();
      for (const nodeId of ['dead-node', 'live-node']) {
        cache.applySystemTableChange(SYSTEM_TABLE_NAME.NODES, 'INSERT', {
          node_id: nodeId,
          status: SERVICE_STATUS.ACTIVE,
          last_heartbeat: now,
          ready_lease_expires_at: now + 60_000,
        });
      }
      cache.applySystemTableChange(SYSTEM_TABLE_NAME.SERVICES, 'INSERT', {
        service_id: 'replica_operations-p1-r3',
        service_type: 'partition',
        partition_id: partitionId,
        node_id: 'dead-node',
        status: ReplicaStatus.ACTIVE,
        raft_role: RAFT_ROLE.FOLLOWER,
        address: 'dead-node/partition/replica_operations-p1-r3',
        created_at: now,
        updated_at: now,
      });
      cache.applySystemTableChange(SYSTEM_TABLE_NAME.SERVICES, 'INSERT', {
        service_id: 'replica_operations-p1-r5',
        service_type: 'partition',
        partition_id: partitionId,
        node_id: 'live-node',
        status: ReplicaStatus.ACTIVE,
        raft_role: RAFT_ROLE.FOLLOWER,
        address: 'live-node/partition/replica_operations-p1-r5',
        created_at: now,
        updated_at: now,
      });

      const mockCDC = createMockCDCService(cache);
      let capturedOptions = null;
      let resolveFactoryCalled = null;
      const factoryCalled = new Promise((resolve) => {
        resolveFactoryCalled = resolve;
      });

      const handler = new ReplicaHandler({
        nodeId: 'test-node',
        cdcIntegrationService: mockCDC,
        systemTableCache: cache,
        messageRouter: {
          getConnectionState(nodeId) {
            return nodeId === 'dead-node' ? 'disconnected' : 'connected';
          },
        },
        dataDir: getTempDir(),
        createPartitionService: async (options) => {
          capturedOptions = options;
          resolveFactoryCalled();
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

      await handler.handleCreateReplica({
        operationId: 'op-1',
        operationType: 'REPLACE',
        partitionId,
        replicaId: 'replica_operations-p1-r4',
      });
      await factoryCalled;

      t.ok(capturedOptions, 'partition factory should receive create options');
      t.equal(
        capturedOptions.leaderAddress,
        null,
        'disconnected priority leader should not be used as a join target',
      );
      t.notOk(
        capturedOptions.peerAddresses.includes(
          'dead-node/partition/replica_operations-p1-r3',
        ),
        'disconnected stale peer should be excluded from priority recovery topology',
      );
      t.ok(
        capturedOptions.peerAddresses.includes(
          'live-node/partition/replica_operations-p1-r5',
        ),
        'connected peer should remain available for priority recovery topology',
      );
      t.equal(
        capturedOptions.isJoiningExistingGroup,
        false,
        'priority replacement should not join a group led by disconnected metadata',
      );

      handler.shutdown();
    },
  );

  t.test(
    'handleCreateReplica - ready leader should still use learner join mode',
    async (t) => {
      const cache = createSeededCache();
      seedReplicaOperation(cache, 'op-1');

      const now = Date.now();
      cache.applySystemTableChange(SYSTEM_TABLE_NAME.NODES, 'INSERT', {
        node_id: 'leader-node',
        status: SERVICE_STATUS.ACTIVE,
        last_heartbeat: now,
        ready_lease_expires_at: now + 60_000,
      });

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
        capturedOptions.leaderAddress,
        'leader-node/partition/leader-replica',
        'ready leader metadata should still provide a join target',
      );
      t.equal(
        capturedOptions.isJoiningExistingGroup,
        true,
        'healthy leader metadata should preserve learner join mode',
      );

      handler.shutdown();
    },
  );

  t.test(
    'handleCreateReplica - explicit bootstrap cohort should seed full peer topology ' +
      'for a fresh partition',
    async (t) => {
      const partitionId = 'partition-1';
      const tableId = 'table-1';
      const cache = createMetadataOnlyCache({partitionId, tableId});
      seedReplicaOperation(cache, 'op-1', {partitionId, replicaId: 'replica-1'});
      const now = Date.now();
      cache.applySystemTableChange(SYSTEM_TABLE_NAME.PARTITIONS, 'INSERT', {
        partition_id: partitionId,
        table_id: tableId,
        partition_key_start: null,
        partition_key_end: null,
        leader_node_id: null,
        created_at: now,
        updated_at: now,
      });
      const bootstrapReplicaIds = ['replica-1', 'replica-2', 'replica-3'];
      const bootstrapPeerAddresses = [
        'node-1/partition/replica-1',
        'node-2/partition/replica-2',
        'node-3/partition/replica-3',
      ];
      let capturedOptions = null;

      const handler = new ReplicaHandler({
        nodeId: 'node-1',
        cdcIntegrationService: createMockCDCService(cache),
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
        partitionId,
        replicaId: 'replica-1',
        replicaIds: bootstrapReplicaIds,
        peerAddresses: bootstrapPeerAddresses,
      });
      await created;

      t.ok(capturedOptions, 'partition factory should receive create options');
      t.same(
        capturedOptions.replicaIds,
        bootstrapReplicaIds,
        'fresh bootstrap should use the explicit initial replica cohort',
      );
      t.same(
        capturedOptions.peerAddresses,
        bootstrapPeerAddresses,
        'fresh bootstrap should use the explicit peer addresses for the cohort',
      );
      t.equal(
        capturedOptions.isJoiningExistingGroup,
        false,
        'explicit bootstrap topology should still remain in bootstrap mode',
      );

      handler.shutdown();
    },
  );
}

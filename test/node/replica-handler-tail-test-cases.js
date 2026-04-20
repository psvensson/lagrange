import {registerReplicaHandlerTailMoreTests} from './replica-handler-tail-more-test-cases.js';

export async function registerReplicaHandlerTailTests({
  t,
  fs,
  path,
  os,
  ReplicaHandler,
  OperationType,
  ReplicaStatus,
  SYSTEM_TABLE_NAME,
  SystemTableCache,
  ConfigurationManager,
  LoggingService,
  ReplicaStateMachine,
  SERVICE_STATUS,
  WORKFLOW_STEP,
  ReplicaOperationField,
  ReplicaOperationMessageType,
  ReplicaOperationResponseStatus,
  RAFT_ROLE,
  LifeRaft,
  TEST_STEP_DOWN_OPERATION_ID,
  TEST_STEP_DOWN_PARTITION_ID,
  TEST_STEP_DOWN_REPLICA_ID,
  TEST_STEP_DOWN_REASON,
  TEST_STEP_DOWN_CORRELATION_ID,
  TEST_STEP_DOWN_EMPTY_LEADER_ID,
  TEST_STATUS_RETRY_PARTITION_ID,
  TEST_STATUS_RETRY_REPLICA_ID,
  TEST_STATUS_RETRY_OPERATION_ID,
  TEST_STATUS_RETRY_SERVICE_ID,
  TEST_STATUS_RETRY_SERVICE_ADDRESS,
  TEST_STATUS_RETRY_ERROR,
  TEST_ACTIVE_REPAIR_OPERATION_ID,
  TEST_ACTIVE_REPAIR_PARTITION_ID,
  TEST_ACTIVE_REPAIR_REPLICA_ID,
  TEST_ACTIVE_REPAIR_NODE_ID,
  TEST_REMOVE_DELETE_FAILURE_OPERATION_ID,
  TEST_REMOVE_DELETE_FAILURE_PARTITION_ID,
  TEST_REMOVE_DELETE_FAILURE_REPLICA_ID,
  TEST_REMOVE_DELETE_FAILURE_REASON,
  TEST_REMOVE_DELETE_FAILURE_MESSAGE,
  TEST_REMOVED_CLEANUP_OPERATION_ID,
  TEST_REMOVED_CLEANUP_PARTITION_ID,
  TEST_REMOVED_CLEANUP_REPLICA_ID,
  TEST_REMOVED_CLEANUP_REASON,
  TEST_REMOVED_CLEANUP_DEFERRED_ERROR,
  createMockCDCService,
  createMockPartitionServiceFactory,
  createSeededCache,
  createMetadataOnlyCache,
  createServiceOnlyCache,
  seedReplicaOperation,
  applyGatewayMutationToCache,
  waitForReplicaEvent,
  tempDir,
}) {
  t.test('handleCreateReplica - idempotent for same operationId', async (t) => {
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

    // Pre-populate in-progress operation
    handler.inProgressOperations.set('op-1', {
      type: ReplicaOperationMessageType.CREATE_REPLICA,
      replicaId: 'replica-1',
      partitionId: 'partition-1',
      startedAt: Date.now(),
    });

    const request = {
      operationId: 'op-1',
      partitionId: 'partition-1',
      replicaId: 'replica-1',
    };

    const response = await handler.handleCreateReplica(request);

    t.equal(response.status, ReplicaOperationResponseStatus.IN_PROGRESS,
      'in_progress');
    t.equal(response.operationId, 'op-1', 'operationId in response');

    handler.shutdown();
  });

  t.test('handleCreateReplica - retries metadata resolution during cache lag',
    async (t) => {
      const partitionId = 'partition-1';
      const replicaId = 'replica-1';
      const operationId = 'op-1';
      const tableId = 'table-1';
      const tableName = 'test_table';
      const cache = createServiceOnlyCache({partitionId});
      seedReplicaOperation(cache, operationId, {partitionId, replicaId});
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

      const delayedMetadataSeedTimer = setTimeout(() => {
        cache.applySystemTableChange(SYSTEM_TABLE_NAME.TABLES, 'INSERT', {
          table_id: tableId,
          table_name: tableName,
          schema_definition: JSON.stringify({
            columns: [{name: 'id', type: 'TEXT', primaryKey: true}],
          }),
        });
        cache.applySystemTableChange(SYSTEM_TABLE_NAME.PARTITIONS, 'INSERT', {
          partition_id: partitionId,
          table_id: tableId,
          partition_key_start: null,
          partition_key_end: null,
          leader_node_id: 'leader-node',
        });
      }, 50);
      t.teardown(() => clearTimeout(delayedMetadataSeedTimer));

      const response = await handler.handleCreateReplica({
        operationId,
        partitionId,
        replicaId,
      });
      t.equal(response.status, ReplicaOperationResponseStatus.INITIATED,
        'create request should be acknowledged');

      await created;

      const failedOperationUpdates = mockCDC.operations.filter((operation) =>
        operation.type === 'update' &&
        operation.tableName === SYSTEM_TABLE_NAME.REPLICA_OPERATIONS &&
        operation.data?.workflow_step === 'FAILED',
      );
      t.equal(failedOperationUpdates.length, 0,
        'replica operation should not fail during transient metadata lag');

      const serviceRow = cache.get(SYSTEM_TABLE_NAME.SERVICES, replicaId);
      t.equal(serviceRow?.status, ReplicaStatus.ACTIVE,
        'replica should become ACTIVE after delayed metadata propagation');

      handler.shutdown();
    });
  t.test(
    'handleCreateReplica - hydrates missing metadata from authoritative system table SQL',
    async (t) => {
      const partitionId = 'partition-1';
      const replicaId = 'replica-1';
      const operationId = 'op-1';
      const tableId = 'table-1';
      const tableName = 'test_table';
      const cache = createServiceOnlyCache({partitionId});
      seedReplicaOperation(cache, operationId, {partitionId, replicaId});
      const mockCDC = createMockCDCService(cache, {
        executeSQL: async (sql, params = []) => {
          if (String(sql).includes('FROM partitions') &&
              params[0] === partitionId) {
            return {
              success: true,
              rows: [{
                partition_id: partitionId,
                table_id: tableId,
                partition_key_start: null,
                partition_key_end: null,
                leader_node_id: 'leader-node',
              }],
            };
          }
          if (String(sql).includes('FROM tables') &&
              params[0] === tableId) {
            return {
              success: true,
              rows: [{
                table_id: tableId,
                table_name: tableName,
                schema_definition: JSON.stringify({
                  columns: [{name: 'id', type: 'TEXT', primaryKey: true}],
                }),
              }],
            };
          }
          if (String(sql).includes('FROM services') &&
              params[0] === partitionId) {
            return {
              success: true,
              rows: [{
                service_id: 'leader-replica',
                service_type: 'partition',
                partition_id: partitionId,
                node_id: 'leader-node',
                raft_role: 'leader',
                status: ReplicaStatus.ACTIVE,
                address: 'leader-node/partition/leader-replica',
                created_at: Date.now(),
                updated_at: Date.now(),
              }],
            };
          }
          return {success: true, rows: []};
        },
      });

      const handler = new ReplicaHandler({
        nodeId: 'test-node',
        cdcIntegrationService: mockCDC,
        systemTableCache: cache,
        createPartitionService: createMockPartitionServiceFactory(),
        dataDir: tempDir,
      });
      handler.syncTimeoutMs = 300;
      handler.initialize();

      const created = waitForReplicaEvent(
        handler,
        'replicaCreated',
        'replicaCreationFailed',
      );

      const response = await handler.handleCreateReplica({
        operationId,
        partitionId,
        replicaId,
      });
      t.equal(response.status, ReplicaOperationResponseStatus.INITIATED,
        'create request should be acknowledged');

      await created;

      const tableRow = cache.get(SYSTEM_TABLE_NAME.TABLES, tableId);
      t.notOk(tableRow,
        'authoritative metadata should stay on the handler path instead of mutating cache');
      const partitionRow = cache.get(SYSTEM_TABLE_NAME.PARTITIONS, partitionId);
      t.notOk(partitionRow,
        'partition metadata should not be patched directly into cache');

      const serviceRow = cache.get(SYSTEM_TABLE_NAME.SERVICES, replicaId);
      t.equal(serviceRow?.status, ReplicaStatus.ACTIVE,
        'replica should become ACTIVE after metadata hydration');

      const metadataQueries = mockCDC.operations.filter((operation) =>
        operation.type === 'executeSQL',
      );
      t.ok(metadataQueries.length >= 2,
        'handler should query authoritative system tables during metadata hydration');

      handler.shutdown();
    },
  );

  t.test(
    'handleCreateReplica - uses bootstrap metadata payload when cache rows ' +
      'have not propagated yet',
    async (t) => {
      const partitionId = 'partition-bootstrap';
      const replicaId = 'partition-bootstrap-r2';
      const operationId = 'op-bootstrap';
      const tableId = 'table-bootstrap';
      const tableName = 'split_bootstrap_events';
      const cache = new SystemTableCache();
      seedReplicaOperation(cache, operationId, {
        partitionId,
        replicaId,
        targetNodeId: 'test-node',
      });
      const mockCDC = createMockCDCService(cache);

      const handler = new ReplicaHandler({
        nodeId: 'test-node',
        cdcIntegrationService: mockCDC,
        systemTableCache: cache,
        createPartitionService: createMockPartitionServiceFactory(),
        dataDir: tempDir,
      });
      handler.syncTimeoutMs = 200;
      handler.initialize();

      const created = waitForReplicaEvent(
        handler,
        'replicaCreated',
        'replicaCreationFailed',
      );

      const response = await handler.handleCreateReplica({
        operationId,
        partitionId,
        replicaId,
        replicaIds: [
          'partition-bootstrap-r1',
          'partition-bootstrap-r2',
          'partition-bootstrap-r3',
        ],
        peerAddresses: [
          'node-a/partition/partition-bootstrap-r1',
          'test-node/partition/partition-bootstrap-r2',
          'node-c/partition/partition-bootstrap-r3',
        ],
        bootstrapTableMetadata: {
          table_id: tableId,
          table_name: tableName,
          schema_definition: JSON.stringify({
            columns: [{name: 'event_id', type: 'TEXT', primaryKey: true}],
          }),
        },
        bootstrapPartitionMetadata: {
          partition_id: partitionId,
          table_id: tableId,
          table_name: tableName,
          partition_key_start: null,
          partition_key_end: 'm',
          partition_version: 2,
          replica_count: 3,
          size_bytes: 0,
          leader_node_id: null,
          state: 'NORMAL',
          created_at: 100,
          updated_at: 100,
        },
      });
      t.equal(response.status, ReplicaOperationResponseStatus.INITIATED,
        'create request should be acknowledged');

      await created;

      const tableRow = cache.get(SYSTEM_TABLE_NAME.TABLES, tableId);
      t.notOk(tableRow,
        'bootstrap table metadata should remain operation-scoped');
      const partitionRow = cache.get(SYSTEM_TABLE_NAME.PARTITIONS, partitionId);
      t.notOk(partitionRow,
        'bootstrap partition metadata should not patch cache directly');

      const serviceRow = cache.get(SYSTEM_TABLE_NAME.SERVICES, replicaId);
      t.equal(serviceRow?.status, ReplicaStatus.ACTIVE,
        'replica should become ACTIVE from bootstrap metadata alone');

      const metadataQueries = mockCDC.operations.filter((operation) =>
        operation.type === 'executeSQL',
      );
      t.equal(metadataQueries.length, 0,
        'handler should not need authoritative metadata SQL when bootstrap metadata is provided');

      handler.shutdown();
    },
  );

  t.test('handleRemoveReplica - returns not_found for missing replica',
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

      const request = {
        operationId: 'op-1',
        partitionId: 'partition-1',
        replicaId: 'nonexistent-replica',
        reason: 'rebalancing',
      };

      const response = await handler.handleRemoveReplica(request);

      t.equal(response.status, ReplicaOperationResponseStatus.NOT_FOUND,
        'not_found');
      t.equal(response.replicaId, 'nonexistent-replica',
        'replicaId in response');

      handler.shutdown();
    });

  t.test('handleRemoveReplica - returns initiated for existing replica',
    async (t) => {
      const cache = createSeededCache();
      seedReplicaOperation(cache, 'op-1', {type: 'REMOVE'});
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

      const response = await handler.handleRemoveReplica(request);

      t.equal(response.status, ReplicaOperationResponseStatus.INITIATED,
        'initiated');
      t.equal(response.replicaId, 'replica-1', 'replicaId in response');
      t.equal(response.operationId, 'op-1', 'operationId in response');

      // Check local replica status updated
      const localReplica = handler.getLocalReplica('replica-1');
      t.equal(localReplica.status, ReplicaStatus.REMOVING, 'status is removing');

      await removed;

      handler.shutdown();
    });

  t.test('handleRemoveReplica finalizes local state tracking after durable delete',
    async (t) => {
      const cache = createSeededCache();
      seedReplicaOperation(cache, 'op-1', {type: 'REMOVE'});
      const mockCDC = createMockCDCService(cache);
      let nowValue = 1000;
      const replicaStateMachine = new ReplicaStateMachine({
        nodeId: 'test-node',
        cdcIntegrationService: mockCDC,
        removingTimeoutMs: 50,
        now: () => nowValue,
      });

      const handler = new ReplicaHandler({
        nodeId: 'test-node',
        cdcIntegrationService: mockCDC,
        systemTableCache: cache,
        dataDir: tempDir,
        createPartitionService: createMockPartitionServiceFactory(),
        replicaStateMachine,
      });

      handler.initialize();

      const removed = waitForReplicaEvent(
        handler,
        'replicaRemoved',
        'replicaRemovalFailed',
      );

      const partitionDir = path.join(tempDir, 'partitions', 'partition-1');
      fs.mkdirSync(partitionDir, {recursive: true});

      handler.localReplicas.set('replica-1', {
        replicaId: 'replica-1',
        partitionId: 'partition-1',
        status: ReplicaStatus.ACTIVE,
        service: {
          async shutdown() {},
        },
      });

      await handler.handleRemoveReplica({
        operationId: 'op-1',
        partitionId: 'partition-1',
        replicaId: 'replica-1',
        reason: 'rebalancing',
      });

      await removed;

      nowValue = 1200;
      t.equal(replicaStateMachine.checkTimeoutsNow(), 0,
        'durable removal should not later time out from the removing state');
      t.equal(replicaStateMachine.getState('replica-1'), null,
        'durably removed replicas should be cleared from local tracking');

      handler.shutdown();
    });

  t.test('handleRemoveReplica preserves local runtime when durable delete fails',
    async (t) => {
      const cache = createSeededCache();
      cache.applySystemTableChange(SYSTEM_TABLE_NAME.SERVICES, 'INSERT', {
        service_id: TEST_REMOVE_DELETE_FAILURE_REPLICA_ID,
        service_type: 'partition',
        partition_id: TEST_REMOVE_DELETE_FAILURE_PARTITION_ID,
        node_id: TEST_ACTIVE_REPAIR_NODE_ID,
        raft_role: 'follower',
        status: ReplicaStatus.ACTIVE,
        address:
          `${TEST_ACTIVE_REPAIR_NODE_ID}/partition/` +
          `${TEST_REMOVE_DELETE_FAILURE_REPLICA_ID}`,
        created_at: Date.now(),
        updated_at: Date.now(),
      });

      const mockCDC = createMockCDCService(cache);
      mockCDC.deleteSystemTableRow = async (tableName, whereClause) => {
        mockCDC.operations.push({type: 'delete', tableName, whereClause});
        throw new Error(TEST_REMOVE_DELETE_FAILURE_MESSAGE);
      };

      const handler = new ReplicaHandler({
        nodeId: TEST_ACTIVE_REPAIR_NODE_ID,
        dataDir: tempDir,
        systemTableCache: cache,
        cdcIntegrationService: mockCDC,
        createPartitionService: createMockPartitionServiceFactory(),
      });

      handler.initialize();

      let shutdownCalls = 0;
      const trackedService = {
        async shutdown() {
          shutdownCalls += 1;
        },
      };
      handler.localServices.set(
        TEST_REMOVE_DELETE_FAILURE_REPLICA_ID,
        trackedService,
      );
      handler.localReplicas.set(TEST_REMOVE_DELETE_FAILURE_REPLICA_ID, {
        replicaId: TEST_REMOVE_DELETE_FAILURE_REPLICA_ID,
        partitionId: TEST_REMOVE_DELETE_FAILURE_PARTITION_ID,
        status: ReplicaStatus.ACTIVE,
        service: trackedService,
      });

      const removalFailed = new Promise((resolve) => {
        handler.once('replicaRemovalFailed', resolve);
      });

      const response = await handler.handleRemoveReplica({
        operationId: TEST_REMOVE_DELETE_FAILURE_OPERATION_ID,
        partitionId: TEST_REMOVE_DELETE_FAILURE_PARTITION_ID,
        replicaId: TEST_REMOVE_DELETE_FAILURE_REPLICA_ID,
        reason: TEST_REMOVE_DELETE_FAILURE_REASON,
      });

      const failedEvent = await removalFailed;

      t.equal(response.status, ReplicaOperationResponseStatus.INITIATED,
        'remove request should still ACK immediately');
      t.equal(
        failedEvent.replicaId,
        TEST_REMOVE_DELETE_FAILURE_REPLICA_ID,
        'failure event should identify the stalled replica',
      );
      t.equal(shutdownCalls, 0,
        'local runtime should stay alive when durable delete does not complete');
      t.ok(
        handler.localServices.has(TEST_REMOVE_DELETE_FAILURE_REPLICA_ID),
        'tracked service should remain available for retry',
      );
      t.ok(
        cache.get(
          SYSTEM_TABLE_NAME.SERVICES,
          TEST_REMOVE_DELETE_FAILURE_REPLICA_ID,
        ),
        'authoritative service row should remain until delete succeeds',
      );

      handler.shutdown();
    });

  t.test('handleRemoveReplica - returns in_progress for removing replica',
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

      // Pre-populate local replica in removing state
      handler.localReplicas.set('replica-1', {
        replicaId: 'replica-1',
        partitionId: 'partition-1',
        status: ReplicaStatus.REMOVING,
      });

      const request = {
        operationId: 'op-1',
        partitionId: 'partition-1',
        replicaId: 'replica-1',
        reason: 'rebalancing',
      };

      const response = await handler.handleRemoveReplica(request);

      t.equal(response.status, ReplicaOperationResponseStatus.IN_PROGRESS,
        'in_progress');
      t.equal(response.replicaId, 'replica-1', 'replicaId in response');

      handler.shutdown();
    });

  t.test('handleRemoveReplica - returns completed for removed replica',
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

      // Pre-populate local replica in removed state
      handler.localReplicas.set('replica-1', {
        replicaId: 'replica-1',
        partitionId: 'partition-1',
        status: ReplicaStatus.REMOVED,
      });

      const request = {
        operationId: 'op-1',
        partitionId: 'partition-1',
        replicaId: 'replica-1',
        reason: 'rebalancing',
      };

      const response = await handler.handleRemoveReplica(request);

      t.equal(response.status, ReplicaOperationResponseStatus.COMPLETED,
        'completed');
      t.equal(response.replicaId, 'replica-1', 'replicaId in response');

      handler.shutdown();
    });

  t.test('handleRemoveReplica reconciles stale service rows for removed replica',
    async (t) => {
      const cache = createSeededCache();
      cache.applySystemTableChange(SYSTEM_TABLE_NAME.SERVICES, 'INSERT', {
        service_id: TEST_REMOVED_CLEANUP_REPLICA_ID,
        service_type: 'partition',
        partition_id: TEST_REMOVED_CLEANUP_PARTITION_ID,
        node_id: TEST_ACTIVE_REPAIR_NODE_ID,
        raft_role: 'follower',
        status: ReplicaStatus.ACTIVE,
        address:
          `${TEST_ACTIVE_REPAIR_NODE_ID}/partition/` +
          `${TEST_REMOVED_CLEANUP_REPLICA_ID}`,
        created_at: Date.now(),
        updated_at: Date.now(),
      });
      const mockCDC = createMockCDCService(cache);

      const handler = new ReplicaHandler({
        nodeId: 'test-node',
        dataDir: tempDir,
        systemTableCache: cache,
        cdcIntegrationService: mockCDC,
        createPartitionService: createMockPartitionServiceFactory(),
      });

      handler.initialize();
      let shutdownCalls = 0;
      const trackedService = {
        async shutdown() {
          shutdownCalls += 1;
        },
      };
      handler.localReplicas.set(TEST_REMOVED_CLEANUP_REPLICA_ID, {
        replicaId: TEST_REMOVED_CLEANUP_REPLICA_ID,
        partitionId: TEST_REMOVED_CLEANUP_PARTITION_ID,
        status: ReplicaStatus.REMOVED,
        service: trackedService,
      });
      handler.localServices.set(TEST_REMOVED_CLEANUP_REPLICA_ID, trackedService);

      const response = await handler.handleRemoveReplica({
        operationId: TEST_REMOVED_CLEANUP_OPERATION_ID,
        partitionId: TEST_REMOVED_CLEANUP_PARTITION_ID,
        replicaId: TEST_REMOVED_CLEANUP_REPLICA_ID,
        reason: TEST_REMOVED_CLEANUP_REASON,
      });

      t.equal(response.status, ReplicaOperationResponseStatus.COMPLETED,
        'already removed replica should still reconcile stale cleanup');
      t.notOk(cache.get(SYSTEM_TABLE_NAME.SERVICES, TEST_REMOVED_CLEANUP_REPLICA_ID),
        'stale service row should be removed durably');
      t.equal(shutdownCalls, 1,
        'retry cleanup should still shut down any lingering local runtime');
      t.notOk(handler.localServices.has(TEST_REMOVED_CLEANUP_REPLICA_ID),
        'local tracked service should be cleared');
      t.ok(
        mockCDC.operations.some((op) =>
          op.type === 'delete' &&
          op.tableName === SYSTEM_TABLE_NAME.SERVICES &&
          op.whereClause?.service_id === TEST_REMOVED_CLEANUP_REPLICA_ID &&
          op.whereClause?.service_type === 'partition' &&
          op.whereClause?.partition_id === TEST_REMOVED_CLEANUP_PARTITION_ID &&
          op.whereClause?.node_id === TEST_ACTIVE_REPAIR_NODE_ID,
        ),
        'stale removed replica should still delete its typed local service row',
      );

      handler.shutdown();
    });

  t.test('handleRemoveReplica keeps durable removal unambiguous when local cleanup is deferred',
    async (t) => {
      const cache = createSeededCache();
      cache.applySystemTableChange(SYSTEM_TABLE_NAME.SERVICES, 'INSERT', {
        service_id: TEST_REMOVED_CLEANUP_REPLICA_ID,
        service_type: 'partition',
        partition_id: TEST_REMOVED_CLEANUP_PARTITION_ID,
        node_id: TEST_ACTIVE_REPAIR_NODE_ID,
        raft_role: 'follower',
        status: ReplicaStatus.ACTIVE,
        address:
          `${TEST_ACTIVE_REPAIR_NODE_ID}/partition/` +
          `${TEST_REMOVED_CLEANUP_REPLICA_ID}`,
        created_at: Date.now(),
        updated_at: Date.now(),
      });
      const mockCDC = createMockCDCService(cache);
      const handler = new ReplicaHandler({
        nodeId: TEST_ACTIVE_REPAIR_NODE_ID,
        dataDir: tempDir,
        systemTableCache: cache,
        cdcIntegrationService: mockCDC,
        createPartitionService: createMockPartitionServiceFactory(),
      });

      handler.initialize();
      let shutdownCalls = 0;
      const trackedService = {
        async shutdown() {
          shutdownCalls += 1;
        },
      };
      handler.cleanupReplicaResources = async () => {
        throw new Error(TEST_REMOVED_CLEANUP_DEFERRED_ERROR);
      };
      handler.localServices.set(
        TEST_REMOVED_CLEANUP_REPLICA_ID,
        trackedService,
      );
      handler.localReplicas.set(TEST_REMOVED_CLEANUP_REPLICA_ID, {
        replicaId: TEST_REMOVED_CLEANUP_REPLICA_ID,
        partitionId: TEST_REMOVED_CLEANUP_PARTITION_ID,
        status: ReplicaStatus.ACTIVE,
        service: trackedService,
      });

      const removed = waitForReplicaEvent(
        handler,
        'replicaRemoved',
        'replicaRemovalFailed',
      );

      const response = await handler.handleRemoveReplica({
        operationId: TEST_REMOVED_CLEANUP_OPERATION_ID,
        partitionId: TEST_REMOVED_CLEANUP_PARTITION_ID,
        replicaId: TEST_REMOVED_CLEANUP_REPLICA_ID,
        reason: TEST_REMOVED_CLEANUP_REASON,
      });
      await removed;

      t.equal(
        response.status,
        ReplicaOperationResponseStatus.INITIATED,
        'remove request should still ACK before deferred cleanup replay',
      );
      t.equal(
        shutdownCalls,
        1,
        'durable removal should still attempt one local runtime shutdown',
      );
      t.notOk(
        cache.get(
          SYSTEM_TABLE_NAME.SERVICES,
          TEST_REMOVED_CLEANUP_REPLICA_ID,
        ),
        'durable service truth should be removed even when cleanup needs replay',
      );
      t.equal(
        handler.getLocalReplica(TEST_REMOVED_CLEANUP_REPLICA_ID)?.status,
        ReplicaStatus.REMOVED,
        'local state should mark the replica removed once durable truth is settled',
      );
      t.equal(
        handler.getLocalReplica(TEST_REMOVED_CLEANUP_REPLICA_ID)?.service,
        trackedService,
        'local runtime should be retained for replayable cleanup instead of making truth ambiguous',
      );
      t.ok(
        handler.localServices.has(TEST_REMOVED_CLEANUP_REPLICA_ID),
        'tracked runtime should remain available for later cleanup reconciliation',
      );

      handler.shutdown();
    });


  await registerReplicaHandlerTailMoreTests({
    t,
    fs,
    path,
    os,
    ReplicaHandler,
    OperationType,
    ReplicaStatus,
    SYSTEM_TABLE_NAME,
    SystemTableCache,
    ConfigurationManager,
    LoggingService,
    ReplicaStateMachine,
    SERVICE_STATUS,
    WORKFLOW_STEP,
    ReplicaOperationField,
    ReplicaOperationMessageType,
    ReplicaOperationResponseStatus,
    RAFT_ROLE,
    LifeRaft,
    TEST_STEP_DOWN_OPERATION_ID,
    TEST_STEP_DOWN_PARTITION_ID,
    TEST_STEP_DOWN_REPLICA_ID,
    TEST_STEP_DOWN_REASON,
    TEST_STEP_DOWN_CORRELATION_ID,
    TEST_STEP_DOWN_EMPTY_LEADER_ID,
    TEST_STATUS_RETRY_PARTITION_ID,
    TEST_STATUS_RETRY_REPLICA_ID,
    TEST_STATUS_RETRY_OPERATION_ID,
    TEST_STATUS_RETRY_SERVICE_ID,
    TEST_STATUS_RETRY_SERVICE_ADDRESS,
    TEST_STATUS_RETRY_ERROR,
    TEST_ACTIVE_REPAIR_OPERATION_ID,
    TEST_ACTIVE_REPAIR_PARTITION_ID,
    TEST_ACTIVE_REPAIR_REPLICA_ID,
    TEST_ACTIVE_REPAIR_NODE_ID,
    TEST_REMOVE_DELETE_FAILURE_OPERATION_ID,
    TEST_REMOVE_DELETE_FAILURE_PARTITION_ID,
    TEST_REMOVE_DELETE_FAILURE_REPLICA_ID,
    TEST_REMOVE_DELETE_FAILURE_REASON,
    TEST_REMOVE_DELETE_FAILURE_MESSAGE,
    TEST_REMOVED_CLEANUP_OPERATION_ID,
    TEST_REMOVED_CLEANUP_PARTITION_ID,
    TEST_REMOVED_CLEANUP_REPLICA_ID,
    TEST_REMOVED_CLEANUP_REASON,
    TEST_REMOVED_CLEANUP_DEFERRED_ERROR,
    createMockCDCService,
    createMockPartitionServiceFactory,
    createSeededCache,
    createMetadataOnlyCache,
    createServiceOnlyCache,
    seedReplicaOperation,
    applyGatewayMutationToCache,
    waitForReplicaEvent,
    tempDir,
  });
}
